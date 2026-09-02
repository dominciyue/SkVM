import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { VerifiedArtifactWorkflowConfigSchema } from "../../skill-ir/verified-artifact-product";
import {
  MagpieReleaseAuditMeasurementTasksSchema,
  buildMagpieReleaseAuditMeasurementTasks,
} from "./magpie-release-audit-measurement";
import { MagpieMachineCheckedProductReportSchema } from "./verified-artifact-product-magpie";
import {
  StageMFrozenMagpiePanelLockSchema,
  type StageMFrozenMagpiePanelLock,
} from "./stage-m-frozen-magpie-panel";
import { sha256Bytes } from "./source-fixture";
import { MAGPIE_RELEASE_AUDIT_CASE_IDS } from "./magpie-release-audit-step2";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const FamilySchema = z.enum(["gpt", "claude", "deepseek"]);

export const STAGE_M_EXPERIMENT_ID = "skill-ir-stage-m-frozen-magpie-cross-model-panel-001" as const;
export const STAGE_M_LOCK_PATH = "benchmarks/skill-ir/panels/stage-m-frozen-magpie-001/panel-lock.json" as const;

export const StageMPlannedModelRowSchema = z.object({
  kind: z.literal("model"),
  phase: z.enum(["qualification", "matrix"]),
  ordinal: z.number().int().positive(),
  family: FamilySchema,
  route: z.string().min(1),
  caseId: z.enum(MAGPIE_RELEASE_AUDIT_CASE_IDS),
  repetition: z.literal(1),
  paid: z.literal(true),
  retries: z.literal(0),
}).strict();

export const StageMPlannedArtifactRowSchema = z.object({
  kind: z.literal("artifact"),
  phase: z.literal("matrix"),
  ordinal: z.number().int().positive(),
  caseId: z.enum(MAGPIE_RELEASE_AUDIT_CASE_IDS),
  repetition: z.literal(1),
  paid: z.literal(false),
  retries: z.literal(0),
  expectedOutputSha256: Sha256Schema,
}).strict();

export const StageMPlannedRowSchema = z.discriminatedUnion("kind", [
  StageMPlannedModelRowSchema,
  StageMPlannedArtifactRowSchema,
]);

export type StageMPlannedRow = z.infer<typeof StageMPlannedRowSchema>;

function modelRows(lock: StageMFrozenMagpiePanelLock, phase: "qualification" | "matrix") {
  return lock.models.flatMap((model) => lock.cases.map((panelCase) => ({
    kind: "model" as const,
    phase,
    ordinal: 0,
    family: model.family,
    route: model.route,
    caseId: panelCase.caseId,
    repetition: 1 as const,
    paid: true as const,
    retries: 0 as const,
  }))).map((row, index) => StageMPlannedModelRowSchema.parse({ ...row, ordinal: index + 1 }));
}

export function buildStageMQualificationPlannedRows(lockInput: StageMFrozenMagpiePanelLock): StageMPlannedRow[] {
  const lock = StageMFrozenMagpiePanelLockSchema.parse(lockInput);
  const rows = modelRows(lock, "qualification");
  if (rows.length !== lock.matrix.expectedModelRows) throw new Error("Stage M qualification planned denominator drift");
  return rows;
}

export function buildStageMMatrixPlannedRows(
  lockInput: StageMFrozenMagpiePanelLock,
  outputDigests: Record<string, string>,
): StageMPlannedRow[] {
  const lock = StageMFrozenMagpiePanelLockSchema.parse(lockInput);
  const models = modelRows(lock, "matrix");
  const artifacts = lock.cases.map((panelCase, index) => StageMPlannedArtifactRowSchema.parse({
    kind: "artifact",
    phase: "matrix",
    ordinal: models.length + index + 1,
    caseId: panelCase.caseId,
    repetition: 1,
    paid: false,
    retries: 0,
    expectedOutputSha256: Sha256Schema.parse(outputDigests[panelCase.caseId]),
  }));
  const rows = [...models, ...artifacts];
  if (models.length !== lock.matrix.expectedModelRows || artifacts.length !== lock.matrix.expectedArtifactRows
    || rows.length !== lock.matrix.expectedLogicalRows) {
    throw new Error("Stage M unique matrix planned denominator drift");
  }
  return rows;
}

function contained(rootDir: string, relativePath: string): string {
  const root = resolve(rootDir);
  const target = resolve(root, ...relativePath.split("/"));
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(fromRoot)) throw new Error(`Stage M path escapes repository: ${relativePath}`);
  return target;
}

async function readFrozen(rootDir: string, reference: { path: string; sha256: string }) {
  const target = contained(rootDir, reference.path);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Stage M frozen reference is not a regular file: ${reference.path}`);
  const bytes = await readFile(target);
  if (sha256Bytes(bytes) !== reference.sha256) throw new Error(`Stage M frozen reference digest mismatch: ${reference.path}`);
  return bytes;
}

export async function loadAndValidateStageMPanel(rootDirInput: string, lockPathInput: string = STAGE_M_LOCK_PATH) {
  const rootDir = resolve(rootDirInput);
  const lockPath = contained(rootDir, lockPathInput);
  const lockBytes = await readFile(lockPath);
  const lock = StageMFrozenMagpiePanelLockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
  const [configBytes, reportBytes, checkerBytes, taskBytes] = await Promise.all([
    readFrozen(rootDir, lock.artifact.productConfig),
    readFrozen(rootDir, lock.artifact.productReport),
    readFrozen(rootDir, lock.artifact.checker),
    readFrozen(rootDir, lock.inputs.measurementTasks),
  ]);
  const config = VerifiedArtifactWorkflowConfigSchema.parse(JSON.parse(configBytes.toString("utf8")));
  const productReport = MagpieMachineCheckedProductReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
  const tasks = MagpieReleaseAuditMeasurementTasksSchema.parse(JSON.parse(taskBytes.toString("utf8")));
  const rebuiltTasks = await buildMagpieReleaseAuditMeasurementTasks(rootDir);
  if (!isDeepStrictEqual(tasks, rebuiltTasks)) throw new Error("Stage M frozen prompt closure drift");
  if (tasks.upstreamCommit !== lock.inputs.upstreamCommit || config.source.commit !== lock.inputs.upstreamCommit) {
    throw new Error("Stage M upstream commit drift");
  }
  if (productReport.productExecution.config.sha256 !== lock.artifact.productConfig.sha256
    || productReport.productExecution.config.path !== lock.artifact.productConfig.path) {
    throw new Error("Stage M product report/config binding drift");
  }
  if (productReport.products.length !== lock.matrix.expectedArtifactRows
    || productReport.products.some((product) => product.artifactClosureSha256 !== lock.artifact.closureSha256)) {
    throw new Error("Stage M frozen artifact closure drift");
  }
  if (config.quality.mode !== "machine-checked"
    || config.quality.checker.path !== lock.artifact.checker.path
    || config.quality.checker.sha256 !== lock.artifact.checker.sha256
    || !checkerBytes.byteLength) {
    throw new Error("Stage M checker authority drift");
  }
  const outputDigests = Object.fromEntries(productReport.products.map((product) => [product.caseId, product.outputSha256]));
  const qualificationRows = buildStageMQualificationPlannedRows(lock);
  const matrixRows = buildStageMMatrixPlannedRows(lock, outputDigests);
  return {
    rootDir,
    lockPath,
    lockSha256: sha256Bytes(lockBytes),
    lock,
    config,
    productReport,
    tasks,
    outputDigests,
    qualificationRows,
    matrixRows,
  };
}
