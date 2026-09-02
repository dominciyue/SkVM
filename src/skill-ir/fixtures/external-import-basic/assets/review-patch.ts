import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function argument(name: string): string {
  const value = process.argv.find((entry) => entry.startsWith(name + "="))?.slice(name.length + 1);
  if (!value) throw new Error("missing " + name);
  return value;
}

const workDir = resolve(argument("--workdir"));
const contract = JSON.parse(await readFile(join(workDir, argument("--interface")), "utf8"));
const manifest = JSON.parse(await readFile(join(workDir, "manifest.json"), "utf8"));
await writeFile(join(workDir, contract.output), JSON.stringify({
  name: manifest.name,
  normalizedName: String(manifest.name).trim().toLowerCase(),
}) + "\n", "utf8");
process.stdout.write(JSON.stringify({ status: "patched", outputs: 1 }) + "\n");
