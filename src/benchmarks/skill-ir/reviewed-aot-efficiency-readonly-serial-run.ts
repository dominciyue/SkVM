import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import type { ExecutionEnvelope } from "./execution-resilience";
import { GenericDomainPlanRepairReportSchema } from "./automatic-domain-plan-generic-repair";
import {
  ReviewedAotEfficiencyPolicySchema,
  buildReviewedAotBundle,
  buildReviewedAotOriginalPlan,
  executeReviewedAotRow,
  validateReviewedAotEfficiencyPolicy,
} from "./reviewed-aot-efficiency-matrix";
import {
  ResilientEfficiencyPolicySchema,
} from "./reviewed-aot-efficiency-resilient-policy";
import {
  READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID,
  READONLY_SERIAL_EFFICIENCY_FREEZE_PATH,
  READONLY_SERIAL_EFFICIENCY_POLICY_PATH,
  READONLY_SERIAL_IMPLEMENTATION_PATHS,
  READONLY_SERIAL_QUALIFICATION_PATH,
  ReadonlySerialEfficiencyFreezeSchema,
  ReadonlySerialEfficiencyPolicySchema,
  ReadonlySerialQualificationReportSchema,
  ReviewedAotPairedQualityEvidenceSchema,
} from "./reviewed-aot-efficiency-readonly-contract";
import {
  validateReadonlySerialEfficiencyFreeze,
  validateReadonlySerialEfficiencyPolicy,
  writeReadonlySerialFreezeArtifacts,
} from "./reviewed-aot-efficiency-readonly-policy";
import {
  ReadonlySerialAuthoritySchema,
  ReadonlySerialPlanSchema,
  ReadonlySerialStateSchema,
  collectReadonlySerialSnapshot,
  readReadonlySerialStatus,
  snapshotReadonlyTree,
  type ReadonlyReviewedAotRow,
  type ReadonlySerialAuthority,
  type ReadonlySerialPrefixEntry,
} from "./reviewed-aot-efficiency-readonly-control";
import { loadReadonlySerialProductionAuthority } from "./reviewed-aot-efficiency-readonly-control-run";
import { runForegroundSerialRows } from "./reviewed-aot-efficiency-readonly-serial";
import { executeProspectiveDevelopmentRow } from "./prospective-development-run";
import type { ProspectiveDevelopmentLock, ProspectiveDevelopmentPlan } from "./prospective-development";
import { scoreRawRunRows, type RawAgentRunRow, type ScoredAgentRunRow } from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import { buildOptimizationCostAccountingReport, type OptimizationCostAccountingInput } from "./optimization-cost-accounting";
import { sha256Bytes } from "./source-fixture";

type PrefixEntry = ReadonlySerialPrefixEntry & {
  raw: RawAgentRunRow;
  scored: ScoredAgentRunRow;
  originalEnvelope: ExecutionEnvelope | null;
};

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function now(): string {
  return new Date().toISOString();
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function safeProductionRunDir(rootDirInput: string, outDirInput: string): string {
  const rootDir = resolve(rootDirInput);
  const resultsRoot = resolve(rootDir, "results/skill-ir");
  const outDir = resolve(outDirInput);
  const fromResults = relative(resultsRoot, outDir);
  if (!fromResults || fromResults.startsWith("..") || isAbsolute(fromResults)) {
    throw new Error("read-only serial production out-dir must be a child of results/skill-ir");
  }
  return outDir;
}

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function writeAtomicText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, path);
}

async function frozenRef(rootDir: string, path: string) {
  const absolute = resolve(rootDir, path);
  const fromRoot = relative(resolve(rootDir), absolute);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`qualification path escapes root: ${path}`);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`qualification authority is not a regular file: ${path}`);
  return { path: path.replaceAll("\\", "/"), sha256: sha256Bytes(await readFile(absolute)) };
}

function qualificationPlan(options: {
  experimentId: string;
  identityDigest: string;
  rows: ReadonlyReviewedAotRow[];
  originalPlan: unknown[];
}) {
  return ReadonlySerialPlanSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-plan/v1",
    experimentId: options.experimentId,
    identityDigest: options.identityDigest,
    rows: options.rows,
    originalPlan: options.originalPlan,
    accounting: { paidCalls: 0, matrixExecuted: false, retries: 0 },
  });
}

async function writeQualificationState(options: {
  activeDir: string;
  experimentId: string;
  identityDigest: string;
  rows: ReadonlyReviewedAotRow[];
  originalPlan?: unknown[];
}) {
  const plan = qualificationPlan({
    experimentId: options.experimentId,
    identityDigest: options.identityDigest,
    rows: options.rows,
    originalPlan: options.originalPlan ?? [],
  });
  const planPath = join(options.activeDir, "plan.json");
  await writeAtomicJson(planPath, plan);
  const planSha256 = sha256Bytes(await readFile(planPath));
  await writeAtomicJson(join(options.activeDir, "serial-state.json"), ReadonlySerialStateSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
    experimentId: options.experimentId,
    identityDigest: options.identityDigest,
    planSha256,
    phase: "prepared",
    completedRows: 0,
    dispatchCount: 0,
    inFlightRowIndex: null,
    failure: null,
  }));
  await writeAtomicJson(join(options.activeDir, "matrix-prefix.json"), []);
  return { plan, planSha256 };
}

async function waitForHolderReady(holder: ReturnType<typeof Bun.spawn>): Promise<void> {
  const stdout = holder.stdout;
  if (!stdout || typeof stdout === "number") throw new Error("qualification holder stdout is unavailable");
  const reader = stdout.getReader();
  const ready = await reader.read();
  if (!new TextDecoder().decode(ready.value).includes("ready")) {
    throw new Error("qualification holder process did not become ready");
  }
}

function fakeEntry(row: ReadonlyReviewedAotRow): PrefixEntry {
  return {
    row,
    raw: { durationMs: 1 } as RawAgentRunRow,
    scored: { success: true, evaluatorScore: 1 } as ScoredAgentRunRow,
    originalEnvelope: null,
    scorerDurationMs: 1,
  };
}

export function auditReadonlyControlDependencies(files: Array<{ path: string; source: string }>) {
  const closureTargets = new Set(files.map((file) => posix.normalize(file.path).replace(/\.ts$/u, "")));
  const importRecords = files.flatMap((file) => {
    const specifiers = [
      ...(file.source.matchAll(/from\s+["'](\.[^"']+)["']/gu)),
      ...(file.source.matchAll(/(?:^|\n)\s*import\s+["'](\.[^"']+)["']/gu)),
      ...(file.source.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/gu)),
    ].map((match) => match[1]!);
    return specifiers.map((specifier) => {
      const target = posix.normalize(posix.join(posix.dirname(file.path), specifier)).replace(/\.ts$/u, "");
      return { specifier, withinClosure: closureTargets.has(target) };
    });
  });
  const outsideSpecifiers = importRecords
    .filter((entry) => !entry.withinClosure)
    .map((entry) => entry.specifier)
    .sort();
  const closure = files.map((file) => file.source).join("\n");
  return {
    localImports: {
      total: importRecords.length,
      withinReadonlyClosure: importRecords.length - outsideSpecifiers.length,
      outsideReadonlyClosure: outsideSpecifiers.length,
    },
    outsideSpecifiers,
    forbiddenBuilderImports: closure.match(/\b(?:buildPlan|buildReviewedAotOriginalPlan|materializeCaseArtifacts)\b/gu)?.length ?? 0,
    forbiddenMutationImports: closure.match(/\b(?:writeFile|appendFile|rename|rm|mkdir|copyFile)\b/gu)?.length ?? 0,
  };
}

async function runSerialMechanicsQualification(options: {
  rootDir: string;
  temporary: string;
  frozenFiles: Array<{ path: string; sha256: string }>;
}) {
  const rows: ReadonlyReviewedAotRow[] = [
    { taskId: "env-manager-scorer-authority-node-dev-001", repetition: 1, system: "original", paid: true },
    { taskId: "env-manager-scorer-authority-node-dev-001", repetition: 1, system: "reviewed-aot", paid: false },
  ];
  const identityDigest = "d".repeat(64);
  const baseDir = join(options.temporary, "serial-mechanics");
  const activeDir = join(baseDir, "normal");
  const prepared = await writeQualificationState({
    activeDir, experimentId: "readonly-serial-mechanics-qualification", identityDigest, rows,
  });
  const authority = ReadonlySerialAuthoritySchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-authority/v1",
    experimentId: "readonly-serial-mechanics-qualification",
    identityDigest,
    planSha256: prepared.planSha256,
    rows,
    frozenFiles: options.frozenFiles,
  });
  const done = await runForegroundSerialRows({
    rootDir: options.rootDir,
    activeDir,
    authority,
    executeRow: async (row) => ({ entry: fakeEntry(row), stopAfterCommit: false }),
  });

  const recoveryDir = join(baseDir, "committed-prefix-recovery");
  const recoveryPrepared = await writeQualificationState({
    activeDir: recoveryDir, experimentId: authority.experimentId, identityDigest, rows,
  });
  const recoveryAuthority = { ...authority, planSha256: recoveryPrepared.planSha256 };
  await writeAtomicJson(join(recoveryDir, "serial-state.json"), {
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
    experimentId: authority.experimentId, identityDigest, planSha256: recoveryPrepared.planSha256,
    phase: "running", completedRows: 0, dispatchCount: 1, inFlightRowIndex: 0, failure: null,
  });
  await writeAtomicJson(join(recoveryDir, "matrix-prefix.json"), [fakeEntry(rows[0]!)]);
  const recoveredExecuted: number[] = [];
  const recovered = await runForegroundSerialRows({
    rootDir: options.rootDir, activeDir: recoveryDir, authority: recoveryAuthority,
    executeRow: async (row, rowIndex) => {
      recoveredExecuted.push(rowIndex);
      return { entry: fakeEntry(row), stopAfterCommit: false };
    },
  });

  const missingDir = join(baseDir, "dispatched-without-terminal");
  const missingPrepared = await writeQualificationState({
    activeDir: missingDir, experimentId: authority.experimentId, identityDigest, rows,
  });
  const missingAuthority = { ...authority, planSha256: missingPrepared.planSha256 };
  await writeAtomicJson(join(missingDir, "serial-state.json"), {
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
    experimentId: authority.experimentId, identityDigest, planSha256: missingPrepared.planSha256,
    phase: "running", completedRows: 0, dispatchCount: 1, inFlightRowIndex: 0, failure: null,
  });
  let missingCalls = 0;
  const missing = await runForegroundSerialRows({
    rootDir: options.rootDir, activeDir: missingDir, authority: missingAuthority,
    executeRow: async (row) => {
      missingCalls += 1;
      return { entry: fakeEntry(row), stopAfterCommit: false };
    },
  });
  return {
    done,
    committedPrefixRecovery: recovered.phase === "done" && isDeepStrictEqual(recoveredExecuted, [1]),
    dispatchedWithoutTerminalFailClosed: missing.phase === "failed"
      && missing.failure?.startsWith("dispatched-without-terminal:") === true
      && missingCalls === 0,
  };
}

async function runQualification(rootDir: string, outPath: string): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "reviewed-aot-readonly-qualification-"));
  try {
    const v1Policy = ReviewedAotEfficiencyPolicySchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-v1.json"), "utf8",
    )));
    const v2Policy = ResilientEfficiencyPolicySchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-resilient-v1.json"), "utf8",
    )));
    const activeDir = join(temporary, "real-active-tree");
    const originalPlan = await buildReviewedAotOriginalPlan({ rootDir, outDir: activeDir, policy: v1Policy });
    for (const row of originalPlan.rows) {
      if (!row.initialWorkdirManifestPath) throw new Error("qualification original plan has no manifest path");
      await writeInitialWorkdirManifest({ workDir: row.workDir, manifestPath: row.initialWorkdirManifestPath });
    }
    const identityDigest = "e".repeat(64);
    const prepared = await writeQualificationState({
      activeDir,
      experimentId: "readonly-active-tree-qualification",
      identityDigest,
      rows: v2Policy.denominator.orderedRows,
      originalPlan: originalPlan.rows,
    });
    const implementation = await Promise.all(READONLY_SERIAL_IMPLEMENTATION_PATHS.map((path) => frozenRef(rootDir, path)));
    const authority = ReadonlySerialAuthoritySchema.parse({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-authority/v1",
      experimentId: "readonly-active-tree-qualification",
      identityDigest,
      planSha256: prepared.planSha256,
      rows: v2Policy.denominator.orderedRows,
      frozenFiles: implementation,
    });
    const heldSkillPath = originalPlan.rows[0]!.skillPath;
    const heldManifestPath = originalPlan.rows[0]!.initialWorkdirManifestPath;
    if (!heldSkillPath || !heldManifestPath) throw new Error("qualification original plan has no skill or manifest path");
    const heldPaths = [
      originalPlan.rows[0]!.taskPath,
      heldSkillPath,
      heldManifestPath,
    ];
    const holderScript = [
      "const fs = require('node:fs');",
      "const handles = process.argv.slice(1).map((path) => fs.openSync(path, 'r'));",
      "process.stdout.write('ready\\n');",
      "setTimeout(() => { for (const handle of handles) fs.closeSync(handle); }, 30000);",
    ].join("");
    const holder = Bun.spawn([process.execPath, "-e", holderScript, ...heldPaths], {
      cwd: rootDir, stdout: "pipe", stderr: "pipe", windowsHide: true,
    });
    await waitForHolderReady(holder);
    let before;
    let after;
    try {
      before = await snapshotReadonlyTree(activeDir);
      await Promise.all(Array.from({ length: 24 }, (_, index) => index % 2 === 0
        ? readReadonlySerialStatus({ rootDir, activeDir, authority })
        : collectReadonlySerialSnapshot({ rootDir, activeDir, authority })));
      after = await snapshotReadonlyTree(activeDir);
    } finally {
      holder.kill();
      await holder.exited;
    }
    if (!isDeepStrictEqual(before, after)) throw new Error("read-only qualification changed the active tree");

    const controlPaths = [
      "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control.ts",
      "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-contract.ts",
      "src/benchmarks/skill-ir/reviewed-aot-efficiency-readonly-control-run.ts",
    ];
    const dependencyAudit = auditReadonlyControlDependencies(await Promise.all(controlPaths.map(async (path) => ({
      path,
      source: await readFile(join(rootDir, path), "utf8"),
    }))));
    if (dependencyAudit.forbiddenBuilderImports !== 0 || dependencyAudit.forbiddenMutationImports !== 0
      || dependencyAudit.localImports.total !== 3 || dependencyAudit.localImports.outsideReadonlyClosure !== 0) {
      throw new Error("read-only control dependency audit failed");
    }
    const serial = await runSerialMechanicsQualification({ rootDir, temporary, frozenFiles: implementation });
    const report = ReadonlySerialQualificationReportSchema.parse({
      schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-qualification/v1",
      status: "passed",
      completedAt: now(),
      implementation,
      dependencyAudit: {
        localImports: dependencyAudit.localImports,
        forbiddenBuilderImports: dependencyAudit.forbiddenBuilderImports,
        forbiddenMutationImports: dependencyAudit.forbiddenMutationImports,
        allowedFsPrimitives: ["lstat", "readFile", "readdir"],
      },
      activeTree: {
        realMaterializedOriginalRows: originalPlan.rows.length,
        independentHolderProcess: true,
        heldFileRoles: ["task", "skill", "initial-workdir-manifest"],
        concurrentStatusCalls: 12,
        concurrentCollectCalls: 12,
        beforeTreeSha256: before.treeSha256,
        afterTreeSha256: after.treeSha256,
        entryCount: before.entries.length,
        byteIdentical: true,
      },
      serialExecution: {
        fakeRows: 2,
        dispatchCount: serial.done.dispatchCount,
        completedRows: serial.done.completedRows,
        retries: 0,
        observerProcesses: 0,
        committedPrefixRecovery: serial.committedPrefixRecovery,
        dispatchedWithoutTerminalFailClosed: serial.dispatchedWithoutTerminalFailClosed,
      },
      accounting: { apiCalls: 0, modelCalls: 0, paidCalls: 0 },
      claimBoundary: "This qualification proves read-only observation and serial journal mechanics only. It is not model quality, recurring-cost, break-even, efficiency, portfolio, or readiness evidence.",
    });
    await writeAtomicJson(outPath, report);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function loadFrozenSuccessor(rootDir: string) {
  const policyPath = join(rootDir, READONLY_SERIAL_EFFICIENCY_POLICY_PATH);
  const freezePath = join(rootDir, READONLY_SERIAL_EFFICIENCY_FREEZE_PATH);
  const policy = ReadonlySerialEfficiencyPolicySchema.parse(JSON.parse(await readFile(policyPath, "utf8")));
  const freeze = ReadonlySerialEfficiencyFreezeSchema.parse(JSON.parse(await readFile(freezePath, "utf8")));
  await validateReadonlySerialEfficiencyPolicy(policy, rootDir);
  await validateReadonlySerialEfficiencyFreeze(freeze, rootDir, policy);
  return { policyPath, freezePath, policy, freeze };
}

async function loadV1Policy(rootDir: string, successor: ReturnType<typeof ReadonlySerialEfficiencyPolicySchema.parse>) {
  const v2 = ResilientEfficiencyPolicySchema.parse(JSON.parse(await readFile(
    join(rootDir, successor.predecessor.policy.path), "utf8",
  )));
  return ReviewedAotEfficiencyPolicySchema.parse(JSON.parse(await readFile(
    join(rootDir, v2.predecessor.policy.path), "utf8",
  )));
}

export async function prepareReadonlySerialRun(rootDir: string, activeDir: string) {
  if (await exists(activeDir)) throw new Error("read-only serial production run directory already exists");
  const successor = await loadFrozenSuccessor(rootDir);
  const v1Policy = await loadV1Policy(rootDir, successor.policy);
  const validatedV1 = await validateReviewedAotEfficiencyPolicy(v1Policy, rootDir);
  const freezeBytes = await readFile(successor.freezePath);
  const identityDigest = sha256Bytes(freezeBytes);
  const originalPlan = await buildReviewedAotOriginalPlan({ rootDir, outDir: activeDir, policy: v1Policy });
  const bundle = await buildReviewedAotBundle({
    rootDir,
    outDir: join(activeDir, "reviewed-aot-bundle"),
    policy: v1Policy,
    review: validatedV1.review,
  });
  const relativeBundle = relative(activeDir, bundle.path).replaceAll("\\", "/");
  if (!relativeBundle || relativeBundle.startsWith("../") || isAbsolute(relativeBundle)) {
    throw new Error("prepared reviewed-AOT bundle escapes active root");
  }
  const plan = ReadonlySerialPlanSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-plan/v1",
    experimentId: successor.policy.experimentId,
    identityDigest,
    rows: successor.policy.denominator.orderedRows,
    originalPlan: originalPlan.rows,
    preparedBundle: { relativePath: relativeBundle, sha256: bundle.sha256 },
    accounting: { paidCalls: 0, matrixExecuted: false, retries: 0 },
  });
  const planPath = join(activeDir, "plan.json");
  await writeAtomicJson(planPath, plan);
  const planSha256 = sha256Bytes(await readFile(planPath));
  await writeAtomicJson(join(activeDir, "serial-state.json"), ReadonlySerialStateSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-state/v1",
    experimentId: successor.policy.experimentId,
    identityDigest,
    planSha256,
    phase: "prepared",
    completedRows: 0,
    dispatchCount: 0,
    inFlightRowIndex: null,
    failure: null,
  }));
  await writeAtomicJson(join(activeDir, "matrix-prefix.json"), []);
  return { status: "prepared", rows: 8, paidCalls: 0, matrixExecuted: false, retries: 0, planSha256 };
}

function shouldStop(classification: ExecutionEnvelope["classification"]): boolean {
  return new Set(["qualification-failure", "parser-incompatible", "runtime-crash", "measurement-invalid"])
    .has(classification);
}

function measured(value: number) { return { status: "measured" as const, value }; }
function usage(input: number, output: number, cacheRead: number, cacheWrite: number) {
  return {
    inputTokens: measured(input), outputTokens: measured(output),
    cacheReadTokens: measured(cacheRead), cacheWriteTokens: measured(cacheWrite),
  };
}

async function evidenceRef(rootDir: string, absolutePath: string) {
  const path = relative(rootDir, absolutePath).replaceAll("\\", "/");
  if (!path || path.startsWith("../") || isAbsolute(path)) throw new Error("read-only serial evidence escapes repository");
  return { path, sha256: sha256Bytes(await readFile(absolutePath)) };
}

async function buildCostReport(options: {
  rootDir: string;
  successorPolicy: ReturnType<typeof ReadonlySerialEfficiencyPolicySchema.parse>;
  v1Policy: ReturnType<typeof ReviewedAotEfficiencyPolicySchema.parse>;
  freezePath: string;
  entries: PrefixEntry[];
  qualityPath: string;
  rawPath: string;
  scoredPath: string;
  envelopePath: string;
}) {
  const original = options.entries.filter((entry) => entry.row.system === "original");
  const reviewed = options.entries.filter((entry) => entry.row.system === "reviewed-aot");
  const envelopes = original.map((entry) => {
    if (!entry.originalEnvelope?.usage.available) throw new Error("read-only serial original row usage is unavailable");
    return entry.originalEnvelope;
  });
  if (original.length !== 4 || reviewed.length !== 4) throw new Error("read-only serial cost report requires eight rows");
  const reviewPath = resolve(options.rootDir, options.v1Policy.frozenInputs.reviewReport.path);
  const review = JSON.parse(await readFile(reviewPath, "utf8")) as {
    inputs: { automaticReport: { path: string } };
    patch: { humanMinutes: number; physicalLoc: number; coreBranchDelta: number };
    construction: {
      synthesis: { durationMs: number }; compile: { durationMs: number }; profile: { durationMs: number };
      package: { durationMs: number; bytes: number };
    };
  };
  const synthesisPath = resolve(options.rootDir, review.inputs.automaticReport.path);
  const synthesis = GenericDomainPlanRepairReportSchema.parse(JSON.parse(await readFile(synthesisPath, "utf8")));
  if (!synthesis.tokens) throw new Error("read-only serial synthesis usage is missing");
  const sumEnvelope = (field: "input" | "output" | "cacheRead" | "cacheWrite") =>
    envelopes.reduce((sum, envelope) => sum + envelope.usage[field], 0);
  const originalDuration = original.reduce((sum, entry) => sum + entry.raw.durationMs, 0);
  const reviewedDuration = reviewed.reduce((sum, entry) => sum + entry.raw.durationMs, 0);
  const scorerDuration = options.entries.reduce((sum, entry) => sum + entry.scorerDurationMs, 0);
  const policyPath = resolve(options.rootDir, READONLY_SERIAL_EFFICIENCY_POLICY_PATH);
  const evidence = await Promise.all([
    evidenceRef(options.rootDir, policyPath),
    evidenceRef(options.rootDir, options.freezePath),
    evidenceRef(options.rootDir, resolve(options.rootDir, options.v1Policy.constructionCostReadiness.path)),
    evidenceRef(options.rootDir, reviewPath),
    evidenceRef(options.rootDir, synthesisPath),
    evidenceRef(options.rootDir, options.qualityPath),
    evidenceRef(options.rootDir, options.rawPath),
    evidenceRef(options.rootDir, options.scoredPath),
    evidenceRef(options.rootDir, options.envelopePath),
    evidenceRef(options.rootDir, resolve(options.rootDir, options.successorPolicy.predecessor.incident.path)),
  ]);
  const input: OptimizationCostAccountingInput = {
    skillId: "env-manager-reviewed-aot",
    experimentId: options.successorPolicy.experimentId,
    quality: { equivalent: true, evidence: await evidenceRef(options.rootDir, options.qualityPath) },
    adaptation: {
      humanMinutes: review.patch.humanMinutes,
      adapterLoc: review.patch.physicalLoc,
      coreBranchDelta: review.patch.coreBranchDelta,
      reusedArtifactKinds: ["automatic-domain-plan", "deterministic-review-patch"],
      unautomatedSteps: ["case-local domain review patch authoring"],
    },
    production: {
      oneTime: {
        compile: {
          modelTokens: measured(options.successorPolicy.productionOneTime.compileModelTokens),
          durationMs: measured(review.construction.synthesis.durationMs + review.construction.compile.durationMs),
        },
        profile: {
          modelTokens: measured(options.successorPolicy.productionOneTime.profileModelTokens),
          durationMs: measured(review.construction.profile.durationMs),
        },
        package: {
          modelTokens: measured(options.successorPolicy.productionOneTime.packageModelTokens),
          durationMs: measured(review.construction.package.durationMs),
          bytes: measured(review.construction.package.bytes),
        },
      },
      runtime: {
        original: {
          samples: 4,
          aggregateModelTokens: sumEnvelope("input") + sumEnvelope("output"),
          aggregateDurationMs: originalDuration,
        },
        optimized: { samples: 4, aggregateModelTokens: 0, aggregateDurationMs: reviewedDuration },
        repairModelTokensPerRun: 0,
      },
    },
    research: {
      attempts: [
        {
          id: "automatic-domain-plan-synthesis", kind: "repair", attempts: 1,
          usage: usage(synthesis.tokens.input, synthesis.tokens.output, synthesis.tokens.cacheRead, synthesis.tokens.cacheWrite),
          durationMs: measured(synthesis.durationMs),
        },
        {
          id: "paid-original-matrix", kind: "matrix", attempts: 4,
          usage: usage(sumEnvelope("input"), sumEnvelope("output"), sumEnvelope("cacheRead"), sumEnvelope("cacheWrite")),
          durationMs: measured(originalDuration),
          selected: {
            attempts: 4,
            usage: usage(sumEnvelope("input"), sumEnvelope("output"), sumEnvelope("cacheRead"), sumEnvelope("cacheWrite")),
            durationMs: measured(originalDuration),
          },
        },
        {
          id: "deterministic-reviewed-aot-matrix", kind: "matrix", attempts: 4,
          usage: usage(0, 0, 0, 0), durationMs: measured(reviewedDuration),
          selected: { attempts: 4, usage: usage(0, 0, 0, 0), durationMs: measured(reviewedDuration) },
        },
      ],
      scorer: { modelTokens: measured(0), durationMs: measured(scorerDuration) },
      repair: { modelTokens: measured(0), durationMs: measured(0) },
    },
    evidence,
  };
  return buildOptimizationCostAccountingReport(input);
}

async function writeFinalResults(options: {
  rootDir: string;
  activeDir: string;
  successorPolicy: ReturnType<typeof ReadonlySerialEfficiencyPolicySchema.parse>;
  v1Policy: ReturnType<typeof ReviewedAotEfficiencyPolicySchema.parse>;
  freezePath: string;
  entries: PrefixEntry[];
}) {
  const rawPath = join(options.activeDir, "raw-runs.jsonl");
  const scoredPath = join(options.activeDir, "scored-runs.jsonl");
  const envelopePath = join(options.activeDir, "execution-envelopes.jsonl");
  await Promise.all([
    writeAtomicText(rawPath, `${options.entries.map((entry) => JSON.stringify(entry.raw)).join("\n")}\n`),
    writeAtomicText(scoredPath, `${options.entries.map((entry) => JSON.stringify(entry.scored)).join("\n")}\n`),
    writeAtomicText(envelopePath,
      `${options.entries.filter((entry) => entry.originalEnvelope).map((entry) => JSON.stringify(entry.originalEnvelope)).join("\n")}\n`),
  ]);
  const records = options.entries.map((entry) => ({
    taskId: entry.row.taskId,
    repetition: entry.row.repetition,
    system: entry.row.system,
    status: "complete" as const,
    success: entry.scored.success,
    score: entry.scored.evaluatorScore ?? 0,
    infrastructureFailure: entry.scored.failureType === "infrastructure",
    hardGateFailure: entry.scored.failureType !== undefined && entry.scored.failureType !== "infrastructure",
  }));
  const pairs = options.successorPolicy.denominator.taskIds.flatMap((taskId) => [1, 2].map((repetition) => {
    const pair = records.filter((entry) => entry.taskId === taskId && entry.repetition === repetition);
    const original = pair.find((entry) => entry.system === "original")!;
    const reviewed = pair.find((entry) => entry.system === "reviewed-aot")!;
    return {
      taskId,
      repetition,
      originalScore: original.score,
      reviewedAotScore: reviewed.score,
      regressed: reviewed.score < original.score || (original.success && !reviewed.success),
      reviewedAotPassed: reviewed.success,
    };
  }));
  const completeRows = records.length === 8 && records.every((record) => record.status === "complete");
  const completePairs = pairs.length === 4;
  const allReviewedPass = pairs.every((pair) => pair.reviewedAotPassed);
  const noInfrastructureFailures = records.every((record) => !record.infrastructureFailure);
  const noReviewedHardGateFailures = records
    .filter((record) => record.system === "reviewed-aot")
    .every((record) => !record.hardGateFailure);
  const noPairwiseRegressions = pairs.every((pair) => !pair.regressed);
  const qualityEquivalent = completeRows && completePairs && allReviewedPass
    && noInfrastructureFailures && noReviewedHardGateFailures && noPairwiseRegressions;
  const qualityPath = join(dirname(options.activeDir), "paired-quality-evidence.json");
  await writeAtomicJson(qualityPath, ReviewedAotPairedQualityEvidenceSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-paired-quality-evidence/v1",
    experimentId: options.successorPolicy.experimentId,
    counts: { expectedRows: 8, observedRows: records.length, expectedPairs: 4, completePairs: pairs.length },
    records,
    pairs,
    gate: {
      completeRows, completePairs, allReviewedPass, noInfrastructureFailures,
      noReviewedHardGateFailures, noPairwiseRegressions,
      passed: qualityEquivalent,
    },
    qualityEquivalent,
    authorizations: { heldOut: false, readinessPromotion: false },
  }));
  if (!qualityEquivalent) throw new Error("read-only serial quality gate did not establish equivalence");
  const cost = await buildCostReport({
    rootDir: options.rootDir,
    successorPolicy: options.successorPolicy,
    v1Policy: options.v1Policy,
    freezePath: options.freezePath,
    entries: options.entries,
    qualityPath,
    rawPath,
    scoredPath,
    envelopePath,
  });
  const costPath = join(dirname(options.activeDir), "cost-accounting.json");
  await writeAtomicJson(costPath, cost);
  return { qualityPath, costPath, cost };
}

async function executeProduction(rootDir: string, activeDir: string) {
  const loaded = await loadReadonlySerialProductionAuthority({ rootDir, activeDir });
  const v1Policy = await loadV1Policy(rootDir, loaded.policy);
  if (!process.env[v1Policy.runtime.apiKeyEnv]?.trim()) throw new Error(`Missing ${v1Policy.runtime.apiKeyEnv}`);
  if (!loaded.plan.preparedBundle) throw new Error("read-only serial prepared bundle authority is missing");
  const bundlePath = resolve(activeDir, loaded.plan.preparedBundle.relativePath);
  const fromActive = relative(activeDir, bundlePath);
  if (!fromActive || fromActive.startsWith("..") || isAbsolute(fromActive)
    || sha256Bytes(await readFile(bundlePath)) !== loaded.plan.preparedBundle.sha256) {
    throw new Error("read-only serial prepared bundle digest drift");
  }
  const originalPlan = loaded.plan.originalPlan as Array<ProspectiveDevelopmentPlan["plan"][number]>;
  if (originalPlan.length !== 4) throw new Error("read-only serial prepared original plan row drift");
  const taskSet = JSON.parse(await readFile(resolve(rootDir, v1Policy.frozenInputs.tasks.path), "utf8")) as {
    tasks: SkillIRBenchmarkTask[];
  };
  const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
  const state = await runForegroundSerialRows({
    rootDir,
    activeDir,
    authority: loaded.authority,
    executeRow: async (row, rowIndex) => {
      const originalRow = originalPlan.find((candidate) =>
        candidate.caseId.endsWith(`:${row.taskId}`) && candidate.runIndex === row.repetition);
      if (!originalRow) throw new Error(`missing prepared original row for ${row.taskId}/${row.repetition}`);
      let raw: RawAgentRunRow;
      let originalEnvelope: ExecutionEnvelope | null = null;
      if (row.system === "original") {
        const executed = await executeProspectiveDevelopmentRow({
          row: { ...originalRow, panelConfigId: loaded.policy.experimentId },
          lock: { experimentId: loaded.policy.experimentId, runtime: v1Policy.runtime } as unknown as ProspectiveDevelopmentLock,
          env: { ...process.env, SKVM_AUTO_PROBE: "0" },
        });
        raw = { ...executed.raw, panelConfigId: loaded.policy.experimentId };
        originalEnvelope = executed.envelope;
        if (!originalEnvelope.usage.available) throw new Error(`original usage unavailable for row ${rowIndex + 1}`);
      } else {
        raw = await executeReviewedAotRow({
          rootDir,
          policy: v1Policy,
          originalRow,
          bundlePath,
          workDir: join(activeDir, "reviewed-aot-workdirs", row.taskId, `run-${row.repetition}`),
        });
        raw = { ...raw, panelConfigId: loaded.policy.experimentId };
      }
      const scorerStarted = performance.now();
      const [scored] = await scoreRawRunRows([raw], taskById);
      const scorerDurationMs = performance.now() - scorerStarted;
      if (!scored) throw new Error(`scorer returned no row for row ${rowIndex + 1}`);
      const stopAfterCommit = originalEnvelope
        ? shouldStop(originalEnvelope.classification)
        : scored.failureType === "infrastructure";
      console.log(JSON.stringify({
        completed: rowIndex + 1,
        total: 8,
        system: row.system,
        classification: originalEnvelope?.classification ?? scored.failureType ?? "semantic-complete",
      }));
      return {
        entry: { row, raw, scored, originalEnvelope, scorerDurationMs },
        stopAfterCommit,
        failure: stopAfterCommit
          ? `execution-blocker:row-${String(rowIndex + 1).padStart(2, "0")}:${originalEnvelope?.classification ?? scored.failureType}`
          : undefined,
      };
    },
  });
  if (state.phase !== "done") throw new Error(`read-only serial matrix failed: ${state.failure ?? "unknown"}`);
  const collected = await collectReadonlySerialSnapshot({ rootDir, activeDir, authority: loaded.authority });
  if (collected.entries.length !== 8) throw new Error(`read-only serial complete prefix drift: ${collected.entries.length}/8`);
  const results = await writeFinalResults({
    rootDir,
    activeDir,
    successorPolicy: loaded.policy,
    v1Policy,
    freezePath: resolve(rootDir, READONLY_SERIAL_EFFICIENCY_FREEZE_PATH),
    entries: collected.entries as PrefixEntry[],
  });
  return {
    status: "completed",
    rows: 8,
    paidCalls: 4,
    retries: 0,
    qualityEquivalent: results.cost.quality.equivalent,
    classification: results.cost.eligibility.classification,
    productionCostComplete: results.cost.completeness.productionCostComplete,
    allAttemptCostComplete: results.cost.completeness.allAttemptCostComplete,
    breakEven: results.cost.breakEven,
    qualityPath: results.qualityPath,
    costPath: results.costPath,
  };
}

async function main(): Promise<void> {
  const phase = argument("phase");
  const rootDir = resolve(argument("root") ?? process.cwd());
  if (phase === "qualify") {
    const outPath = resolve(argument("out-path") ?? join(rootDir, READONLY_SERIAL_QUALIFICATION_PATH));
    await runQualification(rootDir, outPath);
    console.log(JSON.stringify({ status: "passed", paidCalls: 0, reportPath: outPath }));
    return;
  }
  if (phase === "freeze") {
    const frozenAt = argument("frozen-at");
    if (!frozenAt) throw new Error("--frozen-at is required");
    const artifacts = await writeReadonlySerialFreezeArtifacts({ rootDir, frozenAt });
    console.log(JSON.stringify({ status: artifacts.freeze.status, rows: 8, paidCalls: 0, matrixExecuted: false }));
    return;
  }
  if (phase !== "prepare" && phase !== "execute") {
    throw new Error("--phase=qualify|freeze|prepare|execute is required");
  }
  const activeDir = safeProductionRunDir(rootDir, argument("out-dir")
    ?? join(rootDir, "results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/run"));
  const result = phase === "prepare"
    ? await prepareReadonlySerialRun(rootDir, activeDir)
    : await executeProduction(rootDir, activeDir);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
