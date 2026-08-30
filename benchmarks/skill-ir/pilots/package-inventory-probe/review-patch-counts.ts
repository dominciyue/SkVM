import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

function argument(name: string): string {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
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

function object(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as JsonObject;
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${name} must be a string array`);
  }
  return value;
}

const workDir = path.resolve(argument("--workdir"));
const interfacePath = argument("--interface");
const publicInterface = object(JSON.parse(await readFile(contained(workDir, interfacePath), "utf8")), "public interface");
if (typeof publicInterface.output !== "string") throw new Error("public interface output must be a string");
const outputPath = publicInterface.output;
const inventory = object(JSON.parse(await readFile(contained(workDir, outputPath), "utf8")), "package inventory");
const production = strings(inventory.productionDependencies, "productionDependencies");
const development = strings(inventory.developmentDependencies, "developmentDependencies");
const all = strings(inventory.allDependencies, "allDependencies");
inventory.counts = { production: production.length, development: development.length, unique: all.length };
await writeFile(contained(workDir, outputPath), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ status: "patched", outputs: 1 })}\n`);
