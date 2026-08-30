import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type PublicInterface = {
  outputs: { example: string; schema: string; report: string };
  policy: {
    sensitiveNamePattern: string;
    integerNamePattern: string;
    uriNamePattern: string;
    clientPrefixes: string[];
    secretMinimumLength: number;
  };
};

function argument(name: string): string {
  const value = process.argv.slice(2).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function contained(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\")
    || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("unsafe relative path");
  }
  const base = path.resolve(root);
  const target = path.resolve(base, ...relativePath.split("/"));
  const fromRoot = path.relative(base, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error("path escapes workdir");
  }
  return target;
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, current), { withFileTypes: true })) {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    const stat = await lstat(path.join(root, relativePath));
    if (stat.isSymbolicLink()) throw new Error("workspace link is forbidden");
    if (stat.isDirectory()) files.push(...await listFiles(root, relativePath));
    else if (stat.isFile()) files.push(relativePath);
    else throw new Error("special workspace entry is forbidden");
  }
  return files.sort();
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function isEnvironmentFile(relativePath: string): boolean {
  return /(^|\/)\.env(?:\.[^/]+)?$/u.test(relativePath) && !relativePath.endsWith(".example");
}

async function derive(workDir: string, interfacePath: string) {
  const publicInterface = JSON.parse(await readFile(contained(workDir, interfacePath), "utf8")) as PublicInterface;
  const outputs = new Set(Object.values(publicInterface.outputs));
  const sensitive = new RegExp(publicInterface.policy.sensitiveNamePattern, "i");
  const integer = new RegExp(publicInterface.policy.integerNamePattern, "i");
  const uri = new RegExp(publicInterface.policy.uriNamePattern, "i");
  const definitions = new Set<string>();
  const references = new Set<string>();
  const hardcodedSecrets: string[] = [];
  const exposureRisks: string[] = [];

  for (const relativePath of await listFiles(workDir)) {
    if (outputs.has(relativePath)) continue;
    const content = await readFile(contained(workDir, relativePath), "utf8");
    if (isEnvironmentFile(relativePath)) {
      for (const line of content.split(/\r?\n/u)) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/u.exec(line);
        if (match) definitions.add(match[1]!);
      }
      continue;
    }
    if (relativePath === interfacePath) continue;
    for (const pattern of [
      /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/gu,
      /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/gu,
      /os\.environ\s*\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/gu,
      /os\.getenv\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/gu,
    ]) {
      for (const match of content.matchAll(pattern)) {
        const name = match[1]!;
        references.add(name);
        if (publicInterface.policy.clientPrefixes.some((prefix) => name.startsWith(prefix)) && sensitive.test(name)) {
          exposureRisks.push(`${relativePath}:${name}`);
        }
      }
    }
    for (const line of content.split(/\r?\n/u)) {
      const match = /(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']+)["']/u.exec(line);
      if (match && sensitive.test(match[1]!)) hardcodedSecrets.push(`${relativePath}:${match[1]}`);
    }
  }

  const inventory = sortedUnique([...definitions, ...references]);
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const name of inventory) {
    const rule: Record<string, unknown> = { type: integer.test(name) ? "integer" : "string" };
    if (references.has(name)) required.push(name);
    if (integer.test(name)) {
      rule.minimum = 1;
      rule.maximum = name.endsWith("PORT") ? 65535 : 64;
    }
    if (uri.test(name)) rule.format = "uri";
    if (sensitive.test(name)) {
      rule.writeOnly = true;
      rule.minLength = publicInterface.policy.secretMinimumLength;
    }
    properties[name] = rule;
  }
  return {
    outputs: publicInterface.outputs,
    example: `${inventory.map((name) => `${name}=`).join("\n")}\n`,
    schema: { type: "object", properties, required: sortedUnique(required), additionalProperties: false },
    report: {
      definedAndUsed: sortedUnique([...definitions].filter((name) => references.has(name))),
      definedUnconfirmedUnused: sortedUnique([...definitions].filter((name) => !references.has(name))),
      usedUndefined: sortedUnique([...references].filter((name) => !definitions.has(name))),
      hardcodedSecrets: sortedUnique(hardcodedSecrets),
      exposureRisks: sortedUnique(exposureRisks),
    },
  };
}

const workDir = path.resolve(argument("--workdir"));
const interfacePath = argument("--interface");
const derived = await derive(workDir, interfacePath);
await writeFile(contained(workDir, derived.outputs.example), derived.example, "utf8");
await writeFile(contained(workDir, derived.outputs.schema), `${JSON.stringify(derived.schema, null, 2)}\n`, "utf8");
await writeFile(contained(workDir, derived.outputs.report), `${JSON.stringify(derived.report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ status: "patched", outputs: Object.values(derived.outputs).length })}\n`);
