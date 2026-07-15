import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { renderSkillMarkdown, type SkillIRBenchmarkTask } from "./real-agent";
import { extractEnvManagerTaskContract } from "./artifact-package-compiler";
import {
  SemanticArtifactPackageManifestSchema,
  SemanticArtifactPackageProvenanceSchema,
  validateArtifactPackage,
  type SemanticArtifactPackageManifest,
  type SemanticArtifactPackageProvenance,
  type SemanticArtifactRecord,
} from "./artifact-package";
import { SemanticScanPolicySchema } from "./semantic-contract";
import { sha256Bytes } from "./source-fixture";

export type CompileEnvManagerSemanticArtifactPackageOptions = {
  rootDir: string;
  baseIrPath: string;
  taskSetPath: string;
  sourcePath: string;
  outDir: string;
};

type TaskSet = { skillId: string; tasks: SkillIRBenchmarkTask[] };

const RUNTIME_CONTRACT_PATH = ".skvm-artifact/semantic-contract.json";

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digestText(value: string): string {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

function recordedInputPath(rootDir: string, path: string): string {
  const candidate = relative(resolve(rootDir), resolve(path)).replaceAll("\\", "/");
  if (!isAbsolute(candidate) && candidate !== ".." && !candidate.startsWith("../")) return candidate;
  return `external-inputs/${basename(path)}`;
}

function publicRulesFromSource(source: string): {
  portVariableSuffixes: string[];
  portRange?: { minimum: number; maximum: number };
  sensitiveNameTokens: string[];
} {
  const range = source.match(/\b(\d+)\s*[-–]\s*(\d+)\b/);
  const portRange = range?.[1] && range[2]
    ? { minimum: Number(range[1]), maximum: Number(range[2]) }
    : undefined;
  const portVariableSuffixes = /\b[A-Z][A-Z0-9_]*_PORT\b/.test(source) ? ["_PORT"] : [];
  const sensitiveNameTokens = ["KEY", "TOKEN", "PASSWORD", "SECRET"]
    .filter((token) => new RegExp(`(?:\\b|_)${token}(?:\\b|_)`, "i").test(source));
  if (portVariableSuffixes.length > 0 && !portRange) {
    throw new Error("Public source names a port variable but does not declare a bounded port range");
  }
  if (sensitiveNameTokens.length === 0) {
    throw new Error("Public source does not declare sensitive-name rules");
  }
  return { portVariableSuffixes, ...(portRange ? { portRange } : {}), sensitiveNameTokens };
}

function semanticContractSchemaArtifact(): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "skill-ir-semantic-runtime-contract-schema/v1",
    title: "Skill IR semantic runtime contract",
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "codeCatalog",
      "skillId",
      "observedVariables",
      "sourceQualifiedFindings",
      "limitations",
    ],
    properties: {
      schemaVersion: { const: "skill-ir-semantic-runtime-contract/v1" },
      codeCatalog: { const: "semantic-error-codes/v1" },
      skillId: { const: "env-manager" },
      observedVariables: { type: "array" },
      sourceQualifiedFindings: { type: "array" },
      limitations: { type: "array" },
    },
  };
}

function generatedSkillView(baseIr: SkillIR): string {
  const rendered = renderSkillMarkdown(baseIr, "ir-static") ?? "";
  return `${rendered}\n\n## Executable Semantic Artifact\n\n`
    + `- Read the protected runtime contract at \`${RUNTIME_CONTRACT_PATH}\` before producing or repairing outputs.\n`
    + "- Start from the materialized templates and replace every `__SKVM_REQUIRED__` sentinel.\n"
    + "- The Runner validates structure and observable semantic evidence, and may request at most one repair.\n";
}

async function bundledEvidenceProgram(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "semantic-evidence-cli.ts")],
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success || result.outputs.length !== 1) {
    const details = result.logs.map((log) => log.message).join("; ");
    throw new Error(`Failed to bundle semantic evidence program: ${details}`);
  }
  return result.outputs[0]!.text();
}

async function bundledSemanticChecker(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "semantic-checker-cli.ts")],
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success || result.outputs.length !== 1) {
    const details = result.logs.map((log) => log.message).join("; ");
    throw new Error(`Failed to bundle semantic checker: ${details}`);
  }
  return result.outputs[0]!.text();
}

async function writeArtifact(
  outDir: string,
  path: string,
  kind: SemanticArtifactRecord["kind"],
  text: string,
  targetPath?: string,
): Promise<SemanticArtifactRecord> {
  const destination = resolve(outDir, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, text, "utf8");
  return { path, kind, sha256: digestText(text), ...(targetPath ? { targetPath } : {}) };
}

export async function compileEnvManagerSemanticArtifactPackage(
  opts: CompileEnvManagerSemanticArtifactPackageOptions,
): Promise<{
  manifest: SemanticArtifactPackageManifest;
  provenance: SemanticArtifactPackageProvenance;
}> {
  const [baseBytes, taskBytes, sourceBytes, evidenceProgram, semanticChecker] = await Promise.all([
    readFile(opts.baseIrPath),
    readFile(opts.taskSetPath),
    readFile(opts.sourcePath),
    bundledEvidenceProgram(),
    bundledSemanticChecker(),
  ]);
  const baseIr = SkillIRSchema.parse(JSON.parse(baseBytes.toString("utf8")));
  if (baseIr.id !== "env-manager") throw new Error(`Unsupported semantic artifact skill: ${baseIr.id}`);
  if (baseIr.source.kind !== "file" || sha256Bytes(sourceBytes) !== baseIr.source.sha256) {
    throw new Error("Semantic artifact source does not match the digest-bound base IR source");
  }
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet;
  if (taskSet.skillId !== baseIr.id) throw new Error("Task set skill identity does not match base IR");
  const promptProjection = taskSet.tasks.map(({ id, split, prompt }) => ({ id, split, prompt }));
  const { contract, taskIds, promptDigest } = extractEnvManagerTaskContract(promptProjection);
  const publicRules = publicRulesFromSource(sourceBytes.toString("utf8"));
  const scanPolicy = SemanticScanPolicySchema.parse({
    allowedExtensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
    excludedDirectories: [".git", "node_modules", ".skvm-artifact"],
    maxFiles: 500,
    maxBytes: 5_000_000,
  });
  const validationPolicy = {
    schemaVersion: "skill-ir-semantic-artifact-validation-policy/v2",
    checkerTimeoutMs: 5000,
    evidenceProgramTimeoutMs: 5000,
    maxSemanticRepairCalls: 1,
    repairInputFields: ["code", "relativePath", "jsonPointer", "missingField", "expectedType"],
    runtimeContract: { path: RUNTIME_CONTRACT_PATH, protected: true },
    semanticEvidence: { publicRules, scanPolicy },
    networkAllowed: false,
    packageInstallationAllowed: false,
    templateSentinel: "__SKVM_REQUIRED__",
  } as const;

  await mkdir(opts.outDir, { recursive: true });
  const artifacts: SemanticArtifactRecord[] = [];
  artifacts.push(await writeArtifact(opts.outDir, "skill-ir.json", "skill-ir", stableJson(baseIr)));
  artifacts.push(await writeArtifact(opts.outDir, "skill.md", "skill-view", generatedSkillView(baseIr)));
  const contractText = stableJson(contract);
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/env-manager-output-contract.json",
    "contract",
    contractText,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/semantic-contract-schema.json",
    "semantic-contract-schema",
    stableJson(semanticContractSchemaArtifact()),
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/scripts/derive-semantic-contract.js",
    "evidence-program",
    evidenceProgram,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/checks/validate-semantic-output.ts",
    "checker",
    semanticChecker,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/env-report.template.json",
    "template",
    stableJson(Object.fromEntries(contract.reportFields.map((field) => [field, ["__SKVM_REQUIRED__"]]))),
    "env-report.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/env-schema.template.json",
    "template",
    stableJson({ variables: { __SKVM_REQUIRED__: { type: "string" } } }),
    ".env.schema.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "validation-policy.json",
    "validation-policy",
    stableJson(validationPolicy),
  ));
  artifacts.sort((left, right) => left.path.localeCompare(right.path));

  const compilerConfig = {
    catalog: "executable-semantic-artifact/v2",
    taskIds,
    publicRules,
    scanPolicy,
    runtimeContractPath: RUNTIME_CONTRACT_PATH,
  };
  const provenance = SemanticArtifactPackageProvenanceSchema.parse({
    schemaVersion: "skill-ir-semantic-artifact-package-provenance/v1",
    catalog: "executable-semantic-artifact/v2",
    skillId: baseIr.id,
    constructionSplit: "development",
    source: { path: recordedInputPath(opts.rootDir, opts.sourcePath), sha256: sha256Bytes(sourceBytes) },
    baseIr: { path: recordedInputPath(opts.rootDir, opts.baseIrPath), sha256: sha256Bytes(baseBytes) },
    taskContract: { taskIds, promptDigest, sha256: digestText(contractText) },
    compiler: {
      id: "env-manager-semantic-artifact-compiler",
      version: "v2",
      configSha256: digestText(JSON.stringify(compilerConfig)),
    },
    artifacts,
  });
  const provenanceText = stableJson(provenance);
  await writeFile(resolve(opts.outDir, "package-provenance.json"), provenanceText, "utf8");
  const outputContract = artifacts.find((artifact) => artifact.kind === "contract")!;
  const semanticSchema = artifacts.find((artifact) => artifact.kind === "semantic-contract-schema")!;
  const evidence = artifacts.find((artifact) => artifact.kind === "evidence-program")!;
  const checker = artifacts.find((artifact) => artifact.kind === "checker")!;
  const manifest = SemanticArtifactPackageManifestSchema.parse({
    schemaVersion: "skill-ir-semantic-artifact-package-manifest/v1",
    catalog: "executable-semantic-artifact/v2",
    skillId: baseIr.id,
    provenance: { path: "package-provenance.json", sha256: digestText(provenanceText) },
    contract: { path: outputContract.path, sha256: outputContract.sha256 },
    semanticContractSchema: { path: semanticSchema.path, sha256: semanticSchema.sha256 },
    evidenceProgram: { path: evidence.path, timeoutMs: validationPolicy.evidenceProgramTimeoutMs },
    checker: { path: checker.path, timeoutMs: validationPolicy.checkerTimeoutMs },
    runtimeContract: validationPolicy.runtimeContract,
    generatedOutputs: contract.generatedFiles,
    artifacts,
  });
  await writeFile(resolve(opts.outDir, "package-manifest.json"), stableJson(manifest), "utf8");
  await validateArtifactPackage({ packageDir: opts.outDir, expectedCatalog: "executable-semantic-artifact/v2" });
  return { manifest, provenance };
}
