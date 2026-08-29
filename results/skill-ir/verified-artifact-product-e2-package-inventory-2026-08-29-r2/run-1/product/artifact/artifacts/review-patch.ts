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

function sortedKeys(value: unknown): string[] {
  if (value === undefined) return [];
  return Object.keys(object(value, "dependency map")).sort((left, right) => left.localeCompare(right, "en"));
}

const workDir = path.resolve(argument("--workdir"));
const interfacePath = argument("--interface");
const manifest = object(JSON.parse(await readFile(contained(workDir, "package.json"), "utf8")), "package manifest");
const publicInterface = object(
  JSON.parse(await readFile(contained(workDir, interfacePath), "utf8")),
  "public interface",
);
const outputPath = publicInterface.output;
if (typeof outputPath !== "string") throw new Error("public interface output must be a string");
const productionDependencies = sortedKeys(manifest.dependencies);
const developmentDependencies = sortedKeys(manifest.devDependencies);
const allDependencies = [...new Set([...productionDependencies, ...developmentDependencies])]
  .sort((left, right) => left.localeCompare(right, "en"));
const packageName = manifest.name;
if (typeof packageName !== "string") throw new Error("package name must be a string");
const inventory = {
  packageName,
  productionDependencies,
  developmentDependencies,
  allDependencies,
  counts: {
    production: productionDependencies.length,
    development: developmentDependencies.length,
    unique: allDependencies.length,
  },
};
await writeFile(contained(workDir, outputPath), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ status: "patched", outputs: 1 })}\n`);
