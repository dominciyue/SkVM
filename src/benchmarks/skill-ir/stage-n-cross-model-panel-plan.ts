import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  StageNCrossModelPanelLockSchema,
  type StageNCrossModelPanelLock,
  type StageNSmokeRow,
} from "./stage-n-cross-model-panel";
import { sha256Bytes } from "./source-fixture";

type FrozenFile = { path: string; sha256: string };

export type StageNPlanProjection = {
  schemaVersion: "skill-ir-stage-n-cross-model-aot-stability-plan/v1";
  experimentId: string;
  lockSha256: string;
  denominator: { originalRows: 24; artifactRows: 8; logicalRows: 32 };
  matrixAuthorized: false;
  smokeRows: StageNSmokeRow[];
  gptBindings: Array<{ skillId: "api-tester" | "env-manager-v3"; evidence: FrozenFile[]; originalRows: 4; artifactRows: 4; rerun: false }>;
  paidSmokeCalls: 4;
  matrixPaidOriginalRows: 16;
  claimBoundary: "Stage 0 freeze only; smoke precedes any matrix and does not establish quality or stability.";
};

function resolveContained(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...relativePath.split("/"));
  const rel = path.relative(root, target);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`Stage N path escapes root: ${relativePath}`);
  return target;
}

async function verifyFrozenFile(rootDir: string, file: FrozenFile): Promise<void> {
  const target = resolveContained(rootDir, file.path);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Stage N frozen input must be a regular file: ${file.path}`);
  const actual = sha256Bytes(await readFile(target));
  if (actual !== file.sha256) throw new Error(`Stage N digest mismatch: ${file.path}`);
}

async function verifyEvidenceShape(rootDir: string, lock: StageNCrossModelPanelLock): Promise<void> {
  const apiEvidence = JSON.parse(await readFile(resolveContained(rootDir, lock.skills[0].originalEvidence.path), "utf8")) as Record<string, any>;
  if (apiEvidence.counts?.expectedRows !== 16 || apiEvidence.counts?.observedRawRows !== 16
    || apiEvidence.counts?.observedScoredRows !== 16 || apiEvidence.counts?.expectedQuartets !== 4
    || apiEvidence.counts?.completeQuartets !== 4) throw new Error("Stage N API Tester binding evidence denominator mismatch");
  const apiOriginal = apiEvidence.records?.filter((row: any) => row.system === "original").length;
  const apiArtifact = apiEvidence.records?.filter((row: any) => row.system === "validated-artifact").length;
  if (apiOriginal !== 4 || apiArtifact !== 4) throw new Error("Stage N API Tester original/artifact binding mismatch");

  const envEvidence = JSON.parse(await readFile(resolveContained(rootDir, lock.skills[1].originalEvidence.path), "utf8")) as Record<string, any>;
  if (envEvidence.counts?.expectedRows !== 8 || envEvidence.counts?.observedRows !== 8
    || envEvidence.counts?.expectedPairs !== 4 || envEvidence.counts?.completePairs !== 4) throw new Error("Stage N Env Manager binding evidence denominator mismatch");
  const envOriginal = envEvidence.records?.filter((row: any) => row.system === "original").length;
  const envArtifact = envEvidence.records?.filter((row: any) => row.system === "reviewed-aot").length;
  if (envOriginal !== 4 || envArtifact !== 4) throw new Error("Stage N Env Manager original/artifact binding mismatch");
  const envCost = JSON.parse(await readFile(resolveContained(rootDir, lock.skills[1].costEvidence.path), "utf8")) as Record<string, any>;
  if (envCost.production?.runtime?.original?.samples !== 4 || envCost.research?.missing?.length !== 0) {
    throw new Error("Stage N Env Manager cost binding evidence mismatch");
  }
}

function smokeRows(lock: StageNCrossModelPanelLock): StageNSmokeRow[] {
  return lock.models.flatMap((model) => lock.skills.map((skill) => ({
    family: model.family,
    skillId: skill.skillId,
    route: model.route,
    taskId: skill.taskIds[0],
    mode: model.family === "gpt" ? "digest-bind" as const : "execute" as const,
    status: "failed" as const,
    usageAvailable: false,
    classification: "qualification-failure" as const,
    detail: model.family === "gpt" ? "bound to existing frozen C1/C2 evidence; no rerun" : "planned smoke row",
  })));
}

export async function buildStageNPlanProjection(options: {
  rootDir: string;
  lockPath: string;
  outDir: string;
  verifyFiles?: boolean;
}): Promise<StageNPlanProjection> {
  const rootDir = path.resolve(options.rootDir);
  const lockPath = path.resolve(options.lockPath);
  const lock = StageNCrossModelPanelLockSchema.parse(JSON.parse(await readFile(lockPath, "utf8")));
  if (options.verifyFiles !== false) {
    for (const skill of lock.skills) {
      await verifyFrozenFile(rootDir, skill.sourceLock);
      await verifyFrozenFile(rootDir, skill.originalEvidence);
      if ("costEvidence" in skill) await verifyFrozenFile(rootDir, skill.costEvidence);
    }
    await verifyEvidenceShape(rootDir, lock);
  }
  const lockSha256 = sha256Bytes(await readFile(lockPath));
  return {
    schemaVersion: "skill-ir-stage-n-cross-model-aot-stability-plan/v1",
    experimentId: lock.experimentId,
    lockSha256,
    denominator: { originalRows: lock.denominator.originalRows, artifactRows: lock.denominator.artifactRows, logicalRows: lock.denominator.logicalRows },
    matrixAuthorized: lock.matrix.authorized,
    smokeRows: smokeRows(lock),
    gptBindings: lock.skills.map((skill) => ({
      skillId: skill.skillId,
      evidence: [skill.originalEvidence, ...(("costEvidence" in skill && skill.costEvidence) ? [skill.costEvidence] : [])],
      originalRows: 4 as const,
      artifactRows: 4 as const,
      rerun: false as const,
    })),
    paidSmokeCalls: 4 as const,
    matrixPaidOriginalRows: lock.matrix.paidOriginalRows,
    claimBoundary: "Stage 0 freeze only; smoke precedes any matrix and does not establish quality or stability.",
  };
}

export async function loadAndValidateStageNPlan(options: {
  rootDir: string;
  lockPath: string;
  outDir: string;
}): Promise<{ lock: StageNCrossModelPanelLock; projection: StageNPlanProjection }> {
  const lock = StageNCrossModelPanelLockSchema.parse(JSON.parse(await readFile(options.lockPath, "utf8")));
  const projection = await buildStageNPlanProjection({ ...options, verifyFiles: true });
  if (projection.matrixAuthorized) throw new Error("Stage N matrix authorization drift");
  return { lock, projection };
}
