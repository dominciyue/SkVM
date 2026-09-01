import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyMagpieReleaseAuditArtifactPatch } from "./magpie-release-audit-artifact-patch";

function argument(name: string): string {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const workDir = resolve(argument("--workdir"));
const interfacePath = argument("--interface");
if (interfacePath !== "release-audit-interface.json") throw new Error("unexpected Magpie public interface path");
const contract = JSON.parse(await readFile(resolve(workDir, interfacePath), "utf8")) as {
  observationsPath?: unknown;
  outputPath?: unknown;
};
if (contract.observationsPath !== "artifact-observations.json"
  || contract.outputPath !== "release-audit-output.json") {
  throw new Error("invalid Magpie product interface");
}
await applyMagpieReleaseAuditArtifactPatch({
  workDir,
  observationsPath: contract.observationsPath,
  outputPath: contract.outputPath,
});
process.stdout.write(`${JSON.stringify({ status: "patched", outputs: 2 })}\n`);
