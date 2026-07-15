import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deriveSemanticContractFromWorkdir, type SemanticPublicRules } from "./semantic-evidence";
import { SemanticScanPolicySchema } from "./semantic-contract";

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

const workDir = resolve(requiredArg("workdir"));
const outPath = resolve(requiredArg("out"));
const policyPath = resolve(requiredArg("policy"));
const packagePolicy = JSON.parse(await readFile(policyPath, "utf8")) as {
  semanticEvidence?: { publicRules?: SemanticPublicRules; scanPolicy?: unknown };
};
if (!packagePolicy.semanticEvidence?.publicRules || !packagePolicy.semanticEvidence.scanPolicy) {
  throw new Error("Validation policy is missing semanticEvidence configuration");
}
const contract = await deriveSemanticContractFromWorkdir({
  workDir,
  publicRules: packagePolicy.semanticEvidence.publicRules,
  policy: SemanticScanPolicySchema.parse(packagePolicy.semanticEvidence.scanPolicy),
});
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
