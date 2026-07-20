import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  readAndValidateSemanticArtifactDevelopmentLock,
  SafeRelativePathSchema,
  Sha256Schema,
} from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const CriterionSchema = z.object({
  id: z.enum([
    "env-protected-files",
    "env-no-secret-leak",
    "env-required-artifacts",
    "env-classification",
    "env-example-safety",
    "env-schema-rules",
  ]),
  evidence: z.literal("agent-visible-workdir-and-public-task"),
}).strict();

export const CapabilityDiagnosticLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-capability-diagnostic-lock/v1"),
  status: z.literal("preregistered"),
  diagnosticId: z.literal("env-manager-v2-gpt41-capability-diagnostic-v1"),
  purpose: z.literal("model-capability-attribution"),
  corpus: z.literal("pilot"),
  skillId: z.literal("env-manager"),
  model: z.object({
    historicalRoute: z.literal("xty/gpt-4.1-mini"),
    diagnosticRoute: z.literal("xty/gpt-4.1"),
    family: z.literal("gpt"),
  }).strict(),
  adapter: z.object({
    id: z.literal("bare-agent"),
    baselineVersion: z.literal("workspace-static-v1"),
    artifactVersion: z.literal("workspace-semantic-artifact-v2"),
  }).strict(),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    baseIr: FrozenFileSchema,
    tasks: FrozenFileSchema,
    scorer: FrozenFileSchema,
    package: z.object({
      path: SafeRelativePathSchema,
      manifestSha256: Sha256Schema,
      provenanceSha256: Sha256Schema,
    }).strict(),
  }).strict(),
  runnerArtifactLock: FrozenFileSchema,
  matrix: z.object({
    systems: z.tuple([
      z.literal("no-skill"),
      z.literal("original"),
      z.literal("ir-static"),
      z.literal("check-only"),
      z.literal("one-repair"),
    ]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.tuple([
      z.literal("env-manager-node-audit-dev-001"),
      z.literal("env-manager-vite-audit-dev-002"),
    ]),
    repetitions: z.literal(2),
    baselineRows: z.literal(12),
    checkOnlyRows: z.literal(4),
    oneRepairRows: z.literal(4),
    totalRows: z.literal(20),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    maxSemanticRepairCalls: z.literal(1),
    routeProbeRequired: z.literal(true),
  }).strict(),
  developmentGate: z.object({
    minimumSuccesses: z.literal(3),
    minimumMeanScore: z.literal(0.85),
    maximumHardGateRegressions: z.literal(0),
    maximumInfrastructureFailures: z.literal(0),
  }).strict(),
  criteria: z.array(CriterionSchema).length(6),
  historicalMiniResults: z.object({
    staticScored: SafeRelativePathSchema,
    checkOnlyScored: SafeRelativePathSchema,
    oneRepairScored: SafeRelativePathSchema,
  }).strict(),
  interpretationBoundary: z.object({
    entersMainClaim: z.literal(false),
    permitsHeldOut: z.literal(false),
    strongModelSuccessIsMethodGain: z.literal(false),
    allSystemsPassMeans: z.literal("task-saturation"),
    crossTimeProviderConfoundRecorded: z.literal(true),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  const ids = lock.criteria.map((criterion) => criterion.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Diagnostic criteria must be unique" });
  }
});

export type CapabilityDiagnosticLock = z.infer<typeof CapabilityDiagnosticLockSchema>;

async function verifyFileDigest(rootDir: string, file: { path: string; sha256: string }): Promise<void> {
  const actual = sha256Bytes(await readFile(resolve(rootDir, file.path)));
  if (actual !== file.sha256) {
    throw new Error(`Capability diagnostic digest mismatch for ${file.path}`);
  }
}

export async function validateCapabilityDiagnosticLock(
  input: unknown,
  rootDir: string,
): Promise<CapabilityDiagnosticLock> {
  const lock = CapabilityDiagnosticLockSchema.parse(input);
  await Promise.all([
    verifyFileDigest(rootDir, lock.frozenInputs.source),
    verifyFileDigest(rootDir, lock.frozenInputs.baseIr),
    verifyFileDigest(rootDir, lock.frozenInputs.tasks),
    verifyFileDigest(rootDir, lock.frozenInputs.scorer),
    verifyFileDigest(rootDir, lock.runnerArtifactLock),
  ]);

  const packageDir = resolve(rootDir, lock.frozenInputs.package.path);
  const [manifestBytes, provenanceBytes, taskBytes] = await Promise.all([
    readFile(resolve(packageDir, "package-manifest.json")),
    readFile(resolve(packageDir, "package-provenance.json")),
    readFile(resolve(rootDir, lock.frozenInputs.tasks.path), "utf8"),
  ]);
  if (sha256Bytes(manifestBytes) !== lock.frozenInputs.package.manifestSha256) {
    throw new Error("Capability diagnostic package manifest digest mismatch");
  }
  if (sha256Bytes(provenanceBytes) !== lock.frozenInputs.package.provenanceSha256) {
    throw new Error("Capability diagnostic package provenance digest mismatch");
  }

  const taskSet = JSON.parse(taskBytes) as { tasks?: Array<{ id?: string; split?: string }> };
  const splitById = new Map((taskSet.tasks ?? []).map((task) => [task.id, task.split]));
  if (lock.matrix.taskIds.some((taskId) => splitById.get(taskId) !== "development")) {
    throw new Error("Capability diagnostic task set contains non-development tasks");
  }

  for (const repairMode of ["check-only", "one-repair"] as const) {
    await readAndValidateSemanticArtifactDevelopmentLock({
      rootDir,
      lockPath: resolve(rootDir, lock.runnerArtifactLock.path),
      packageDir,
      expected: {
        corpus: lock.corpus,
        skillId: lock.skillId,
        model: lock.model.diagnosticRoute,
        modelFamily: lock.model.family,
        adapter: lock.adapter.id,
        adapterVersion: lock.adapter.artifactVersion,
        repairMode,
        repetitions: lock.matrix.repetitions,
        contexts: lock.matrix.contexts,
        agents: lock.matrix.agents,
        environments: lock.matrix.environments,
        tasks: lock.matrix.taskIds,
      },
    });
  }
  return lock;
}

export async function readAndValidateCapabilityDiagnosticLock(opts: {
  rootDir: string;
  lockPath: string;
}): Promise<CapabilityDiagnosticLock> {
  return validateCapabilityDiagnosticLock(
    JSON.parse(await readFile(resolve(opts.lockPath), "utf8")),
    resolve(opts.rootDir),
  );
}
