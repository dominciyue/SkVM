import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { extractEnvManagerTaskContract } from "./artifact-package-compiler";
import {
  ContractRepairArtifactPackageManifestSchema,
  ContractRepairArtifactPackageProvenanceSchema,
  validateArtifactPackage,
  type ContractRepairArtifactPackageManifest,
  type ContractRepairArtifactPackageProvenance,
} from "./artifact-package";
import { DeterministicReplayFreezeSchema } from "./deterministic-repair-replay-run";
import { buildEnvManagerExecutableRepairRecipe } from "./executable-repair-contract";
import {
  generatedSkillView,
  publicRulesFromSource,
  publicRuntimeContractSchemaArtifact,
} from "./public-contract-artifact-compiler";
import type { SkillIRBenchmarkTask } from "./real-agent";
import { SemanticScanPolicySchema } from "./semantic-contract";
import { sha256Bytes } from "./source-fixture";

export type CompileEnvManagerContractRepairArtifactPackageOptions = {
  rootDir: string;
  baseIrPath: string;
  taskSetPath: string;
  sourcePath: string;
  coverageAuditPath: string;
  replayFreezePath: string;
  replaySummaryPath: string;
  outDir: string;
};

type TaskSet = { skillId: string; tasks: SkillIRBenchmarkTask[] };
type ArtifactRecord = ContractRepairArtifactPackageManifest["artifacts"][number];

const PUBLIC_RUNTIME_CONTRACT_PATH = ".skvm-artifact/public-runtime-contract.json";
const EXECUTABLE_REPAIR_CONTRACT_PATH = ".skvm-artifact/executable-repair-contract.json";

const ReplaySummaryEvidenceSchema = z.object({
  schemaVersion: z.literal("skill-ir-deterministic-repair-replay-summary/v1"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  evidenceClass: z.literal("offline-development-replay"),
  replayedSnapshots: z.number().int().min(0),
  replayOnly: z.object({
    runtimePassAfterRepair: z.number().int().min(0),
    scorerSuccessAfter: z.number().int().min(0),
    meanScoreAfter: z.number().min(0).max(1),
  }).passthrough(),
  allProtectedDigestsStable: z.boolean(),
  failedCriteriaAfter: z.array(z.string()),
  provenance: z.object({ methodFreezeSha256: z.string() }).passthrough(),
}).passthrough();

const CoverageAuditEvidenceSchema = z.object({
  schemaVersion: z.literal("skill-ir-contract-coverage-audit/v1"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  criteria: z.array(z.unknown()),
  unknownRuntimeCodes: z.array(z.unknown()),
  provenance: z.object({ tasksSha256: z.string() }).passthrough(),
}).passthrough();

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digestBytes(value: Uint8Array): string {
  return sha256Bytes(Buffer.from(value));
}

function digestText(value: string): string {
  return digestBytes(Buffer.from(value, "utf8"));
}

function recordedInputPath(rootDir: string, path: string): string {
  const candidate = relative(resolve(rootDir), resolve(path)).replaceAll("\\", "/");
  if (!isAbsolute(candidate) && candidate !== ".." && !candidate.startsWith("../")) return candidate;
  return `external-inputs/${basename(path)}`;
}

async function bundled(entrypoint: string, label: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, entrypoint)],
    target: "bun",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success || result.outputs.length !== 1) {
    throw new Error(`Failed to bundle ${label}: ${result.logs.map((log) => log.message).join("; ")}`);
  }
  return (await result.outputs[0]!.text()).replace(/[ \t]+$/gm, "");
}

async function writeArtifact(
  outDir: string,
  path: string,
  kind: ArtifactRecord["kind"],
  text: string,
  targetPath?: string,
): Promise<ArtifactRecord> {
  const destination = resolve(outDir, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, text, "utf8");
  return { path, kind, sha256: digestText(text), ...(targetPath ? { targetPath } : {}) };
}

function assertReplayEvidence(options: {
  replaySummary: z.infer<typeof ReplaySummaryEvidenceSchema>;
  replayFreezeDigest: string;
}): void {
  const summary = options.replaySummary;
  if (
    summary.schemaVersion !== "skill-ir-deterministic-repair-replay-summary/v1"
    || summary.catalog !== "executable-contract-repair-artifact/v4"
    || summary.evidenceClass !== "offline-development-replay"
    || summary.replayedSnapshots !== 3
    || summary.replayOnly?.runtimePassAfterRepair !== 3
    || summary.replayOnly?.scorerSuccessAfter !== 3
    || summary.replayOnly?.meanScoreAfter !== 1
    || summary.allProtectedDigestsStable !== true
    || !Array.isArray(summary.failedCriteriaAfter)
    || summary.failedCriteriaAfter.length !== 0
    || summary.provenance?.methodFreezeSha256 !== options.replayFreezeDigest
  ) {
    throw new Error("V4 replay evidence does not satisfy the frozen local mechanism gate");
  }
}

function v4SkillView(baseIr: SkillIR): string {
  return `${generatedSkillView(baseIr)}\n\n## Deterministic Contract Repair\n\n`
    + `- Treat ${PUBLIC_RUNTIME_CONTRACT_PATH} and ${EXECUTABLE_REPAIR_CONTRACT_PATH} as read-only.\n`
    + "- The Runner may canonicalize generated outputs deterministically before requesting a residual model repair.\n";
}

export async function compileEnvManagerContractRepairArtifactPackage(
  opts: CompileEnvManagerContractRepairArtifactPackageOptions,
): Promise<{
  manifest: ContractRepairArtifactPackageManifest;
  provenance: ContractRepairArtifactPackageProvenance;
}> {
  const [
    baseBytes,
    taskBytes,
    sourceBytes,
    coverageBytes,
    replayFreezeBytes,
    replaySummaryBytes,
    evidenceProgram,
    checker,
    deterministicRepairer,
  ] = await Promise.all([
    readFile(opts.baseIrPath),
    readFile(opts.taskSetPath),
    readFile(opts.sourcePath),
    readFile(opts.coverageAuditPath),
    readFile(opts.replayFreezePath),
    readFile(opts.replaySummaryPath),
    bundled("public-contract-evidence-cli.ts", "V4 public evidence program"),
    bundled("executable-contract-checker-cli.ts", "V4 executable contract checker"),
    bundled("deterministic-artifact-repairer-cli.ts", "V4 deterministic repairer"),
  ]);
  const baseIr = SkillIRSchema.parse(JSON.parse(baseBytes.toString("utf8")));
  if (baseIr.id !== "env-manager") throw new Error(`Unsupported contract-repair skill: ${baseIr.id}`);
  if (baseIr.source.kind !== "file" || digestBytes(sourceBytes) !== baseIr.source.sha256) {
    throw new Error("Contract-repair source does not match the digest-bound base IR source");
  }
  const taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet;
  if (taskSet.skillId !== baseIr.id) throw new Error("Task set skill identity does not match base IR");
  const promptProjection = taskSet.tasks.map(({ id, split, prompt }) => ({ id, split, prompt }));
  const { contract: outputContract, taskIds, promptDigest } =
    extractEnvManagerTaskContract(promptProjection);
  const outputContractText = stableJson(outputContract);
  const taskContractDigest = digestText(outputContractText);

  const replayFreeze = DeterministicReplayFreezeSchema.parse(
    JSON.parse(replayFreezeBytes.toString("utf8")),
  );
  if (
    replayFreeze.inputs.tasks.sha256 !== digestBytes(taskBytes)
    || JSON.stringify([...replayFreeze.taskIds].sort()) !== JSON.stringify([...taskIds].sort())
  ) {
    throw new Error("V4 replay freeze task registry drift");
  }
  const scorerPath = resolve(opts.rootDir, replayFreeze.inputs.scorer.path);
  if (digestBytes(await readFile(scorerPath)) !== replayFreeze.inputs.scorer.sha256) {
    throw new Error("V4 replay freeze scorer drift");
  }
  const replayFreezeDigest = digestBytes(replayFreezeBytes);
  const replaySummary = ReplaySummaryEvidenceSchema.parse(
    JSON.parse(replaySummaryBytes.toString("utf8")),
  );
  assertReplayEvidence({ replaySummary, replayFreezeDigest });
  const coverageAudit = CoverageAuditEvidenceSchema.parse(
    JSON.parse(coverageBytes.toString("utf8")),
  );
  if (
    coverageAudit.schemaVersion !== "skill-ir-contract-coverage-audit/v1"
    || coverageAudit.catalog !== "executable-contract-repair-artifact/v4"
    || !Array.isArray(coverageAudit.criteria)
    || coverageAudit.criteria.length !== replayFreeze.criterionIds.length
    || coverageAudit.unknownRuntimeCodes.length !== 0
    || coverageAudit.provenance?.tasksSha256 !== digestBytes(taskBytes)
  ) {
    throw new Error("V4 coverage audit identity drift");
  }

  const sourcePolicy = publicRulesFromSource(sourceBytes.toString("utf8"));
  const scanPolicy = SemanticScanPolicySchema.parse({
    allowedExtensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
    excludedDirectories: [".git", "node_modules", ".skvm-artifact"],
    maxFiles: 500,
    maxBytes: 5_000_000,
  });
  const developmentEvidenceSha256 = replayFreeze.inputs.sourceEvidence.sha256;
  const repairRecipe = buildEnvManagerExecutableRepairRecipe({
    taskContractDigest,
    developmentEvidenceSha256,
  });
  const validationPolicy = {
    schemaVersion: "skill-ir-contract-repair-artifact-validation-policy/v4",
    checkerTimeoutMs: 5000,
    evidenceProgramTimeoutMs: 5000,
    deterministicRepairerTimeoutMs: 5000,
    maxDeterministicRepairCalls: 1,
    maxModelRepairCalls: 1,
    repairRecipePath: "artifacts/contracts/repair-recipe.json",
    runtimeContracts: {
      public: { path: PUBLIC_RUNTIME_CONTRACT_PATH, protected: true },
      executableRepair: { path: EXECUTABLE_REPAIR_CONTRACT_PATH, protected: true },
    },
    publicEvidence: {
      taskContractDigest,
      generatedOutputs: outputContract.generatedFiles,
      publicPrefixes: sourcePolicy.publicPrefixes,
      publicRules: sourcePolicy.publicRules,
      policy: scanPolicy,
    },
    networkAllowed: false,
    packageInstallationAllowed: false,
    templateSentinel: "__SKVM_REQUIRED__",
  } as const;

  await mkdir(opts.outDir, { recursive: true });
  const artifacts: ArtifactRecord[] = [];
  artifacts.push(await writeArtifact(opts.outDir, "skill-ir.json", "skill-ir", stableJson(baseIr)));
  artifacts.push(await writeArtifact(opts.outDir, "skill.md", "skill-view", v4SkillView(baseIr)));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/output-contract.json",
    "output-contract",
    outputContractText,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/repair-recipe.json",
    "repair-recipe",
    stableJson(repairRecipe),
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/contracts/public-policy.json",
    "public-policy",
    stableJson(sourcePolicy),
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/schemas/public-runtime-contract.schema.json",
    "public-contract-schema",
    stableJson(publicRuntimeContractSchemaArtifact()),
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/scripts/evidence-program.mjs",
    "evidence-program",
    evidenceProgram,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/checks/executable-contract-checker.mjs",
    "checker",
    checker,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/scripts/deterministic-repairer.mjs",
    "deterministic-repairer",
    deterministicRepairer,
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/.env.example",
    "template",
    "# Generated values remain empty until runtime evidence is available.\n",
    ".env.example",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/.env.schema.json",
    "template",
    stableJson({ variables: {} }),
    ".env.schema.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "artifacts/templates/env-report.json",
    "template",
    stableJson(Object.fromEntries(outputContract.reportFields.map((field) => [field, []]))),
    "env-report.json",
  ));
  artifacts.push(await writeArtifact(
    opts.outDir,
    "validation-policy.json",
    "validation-policy",
    stableJson(validationPolicy),
  ));
  artifacts.sort((left, right) => left.path.localeCompare(right.path));

  const evidenceRef = (path: string, bytes: Uint8Array) => ({
    path: recordedInputPath(opts.rootDir, path),
    sha256: digestBytes(bytes),
  });
  const learnedRules = replayFreeze.developmentLearnedRules.map((rule) => ({
    ...rule,
    evidenceSha256: developmentEvidenceSha256,
  }));
  const compilerConfig = {
    catalog: "executable-contract-repair-artifact/v4",
    taskIds,
    sourcePolicy,
    scanPolicy,
    runtimeContracts: validationPolicy.runtimeContracts,
    replayFreezeSha256: replayFreezeDigest,
  };
  const provenance = ContractRepairArtifactPackageProvenanceSchema.parse({
    schemaVersion: "skill-ir-contract-repair-artifact-package-provenance/v1",
    catalog: "executable-contract-repair-artifact/v4",
    skillId: baseIr.id,
    constructionSplit: "development",
    source: evidenceRef(opts.sourcePath, sourceBytes),
    baseIr: evidenceRef(opts.baseIrPath, baseBytes),
    taskContract: { taskIds, promptDigest, sha256: taskContractDigest },
    developmentEvidence: {
      coverageAudit: evidenceRef(opts.coverageAuditPath, coverageBytes),
      replayFreeze: evidenceRef(opts.replayFreezePath, replayFreezeBytes),
      replaySummary: evidenceRef(opts.replaySummaryPath, replaySummaryBytes),
    },
    learnedRules,
    compiler: {
      id: "env-manager-contract-repair-artifact-compiler",
      version: "v4",
      configSha256: digestText(JSON.stringify(compilerConfig)),
    },
    artifacts,
  });
  const provenanceText = stableJson(provenance);
  await writeFile(resolve(opts.outDir, "package-provenance.json"), provenanceText, "utf8");

  const byKind = (kind: ArtifactRecord["kind"]) =>
    artifacts.find((artifact) => artifact.kind === kind)!;
  const refByKind = (kind: ArtifactRecord["kind"]) => {
    const artifact = byKind(kind);
    return { path: artifact.path, sha256: artifact.sha256 };
  };
  const manifest = ContractRepairArtifactPackageManifestSchema.parse({
    schemaVersion: "skill-ir-contract-repair-artifact-package-manifest/v1",
    catalog: "executable-contract-repair-artifact/v4",
    skillId: baseIr.id,
    provenance: { path: "package-provenance.json", sha256: digestText(provenanceText) },
    outputContract: refByKind("output-contract"),
    repairRecipe: refByKind("repair-recipe"),
    publicPolicy: refByKind("public-policy"),
    publicRuntimeContractSchema: refByKind("public-contract-schema"),
    evidenceProgram: {
      path: byKind("evidence-program").path,
      timeoutMs: validationPolicy.evidenceProgramTimeoutMs,
    },
    checker: { path: byKind("checker").path, timeoutMs: validationPolicy.checkerTimeoutMs },
    deterministicRepairer: {
      path: byKind("deterministic-repairer").path,
      timeoutMs: validationPolicy.deterministicRepairerTimeoutMs,
    },
    runtimeContracts: validationPolicy.runtimeContracts,
    generatedOutputs: outputContract.generatedFiles,
    artifacts,
  });
  await writeFile(resolve(opts.outDir, "package-manifest.json"), stableJson(manifest), "utf8");
  await validateArtifactPackage({
    packageDir: opts.outDir,
    expectedCatalog: "executable-contract-repair-artifact/v4",
  });
  return { manifest, provenance };
}
