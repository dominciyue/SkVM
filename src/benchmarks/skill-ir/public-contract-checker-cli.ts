import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PublicRuntimeContractSchema } from "./public-contract";
import {
  validatePublicContractOutputs,
  type PublicOutputContract,
} from "./public-contract-checker";

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

const workDir = resolve(requiredArg("workdir"));
const outputContract = JSON.parse(await readFile(
  join(import.meta.dir, "../contracts/output-contract.json"),
  "utf8",
)) as PublicOutputContract;
const policy = JSON.parse(await readFile(
  join(import.meta.dir, "../../validation-policy.json"),
  "utf8",
)) as {
  runtimeContract: { path: string; protected: true };
  templateSentinel: string;
};
const contract = PublicRuntimeContractSchema.parse(JSON.parse(await readFile(
  join(workDir, policy.runtimeContract.path),
  "utf8",
)));
const result = await validatePublicContractOutputs({
  workDir,
  contract,
  outputContract,
  templateSentinel: policy.templateSentinel,
});
console.log(JSON.stringify(result));
