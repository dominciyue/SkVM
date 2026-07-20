import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  derivePublicRuntimeContractFromWorkdir,
  type PublicContractDerivationOptions,
} from "./public-contract-evidence";

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

const workDir = resolve(requiredArg("workdir"));
const outPath = resolve(requiredArg("out"));
const policyPath = resolve(requiredArg("policy"));
const policy = JSON.parse(await readFile(policyPath, "utf8")) as {
  publicEvidence?: Omit<PublicContractDerivationOptions, "workDir">;
};
if (!policy.publicEvidence) {
  throw new Error("Validation policy is missing publicEvidence configuration");
}
const contract = await derivePublicRuntimeContractFromWorkdir({
  ...policy.publicEvidence,
  workDir,
});
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
