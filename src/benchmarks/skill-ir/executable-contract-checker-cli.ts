import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ExecutableRepairContractSchema } from "./executable-repair-contract";
import { validateExecutableContractOutputs } from "./executable-contract-checker";
import type { PublicOutputContract } from "./public-contract-checker";

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

const workDir = resolve(requiredArg("workdir"));
const packageDir = resolve(import.meta.dir, "../..");
const outputContract = JSON.parse(await readFile(
  resolve(packageDir, "artifacts/contracts/output-contract.json"),
  "utf8",
)) as PublicOutputContract;
const runtimeContractBytes = await readFile(
  resolve(workDir, ".skvm-artifact/public-runtime-contract.json"),
);
const repairContract = ExecutableRepairContractSchema.parse(JSON.parse(await readFile(
  resolve(workDir, ".skvm-artifact/executable-repair-contract.json"),
  "utf8",
)));
const report = await validateExecutableContractOutputs({
  workDir,
  outputContract,
  runtimeContractBytes,
  repairContract,
  templateSentinel: "__SKVM_REQUIRED__",
});
process.stdout.write(`${JSON.stringify(report)}\n`);
