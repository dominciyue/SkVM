import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repairEnvManagerArtifactsDeterministically } from "./deterministic-artifact-repairer";
import { ExecutableRepairContractSchema } from "./executable-repair-contract";

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

const workDir = resolve(requiredArg("workdir"));
const repairContract = ExecutableRepairContractSchema.parse(JSON.parse(await readFile(
  resolve(workDir, ".skvm-artifact/executable-repair-contract.json"),
  "utf8",
)));
const report = await repairEnvManagerArtifactsDeterministically({ workDir, repairContract });
process.stdout.write(`${JSON.stringify(report)}\n`);
