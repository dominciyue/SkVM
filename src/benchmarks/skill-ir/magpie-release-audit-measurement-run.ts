import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { RunExecutionObservationSchema } from "../../core/types";
import { compileMagpieReleaseAuditArtifact, runMagpieReleaseAuditArtifact } from "./magpie-release-audit-artifact";
import { scoreMagpieReleaseAuditOutput } from "./magpie-release-audit-checker";
import {
  MAGPIE_MEASUREMENT_EXPERIMENT_ID,
  MAGPIE_MEASUREMENT_POLICY_PATH,
  MagpieMeasurementRowSchema,
  buildMagpieReleaseAuditOrderedRows,
  loadAndValidateMagpieReleaseAuditMeasurement,
  writeMagpieReleaseAuditMeasurementFreeze,
  type MagpieMeasurementRow,
} from "./magpie-release-audit-measurement";
import { buildSkvmRunCommand, type RealAgentRunPlanEntry } from "./real-agent";
import { executeGenericPlanRow } from "./real-agent-run";
import { extractFinalOutput } from "./scoring";
import { loadAndValidateMagpieReleaseAuditSlice } from "./magpie-release-audit-step2";
import { sha256Bytes } from "./source-fixture";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const PreparedFileSchema = z.object({ path: z.string().min(1), sha256: DigestSchema, bytes: z.number().int().positive() }).strict();
const UsageSchema = z.object({
  available: z.boolean(), input: z.number().int().nonnegative(), output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(), cacheWrite: z.number().int().nonnegative(),
}).strict();

export const MagpieMeasurementPrefixEntrySchema = z.object({
  row: MagpieMeasurementRowSchema,
  attemptId: z.string().min(1),
  status: z.literal("complete"),
  infrastructureFailure: z.boolean(),
  durationMs: z.number().nonnegative(),
  executionClassification: z.enum([
    "semantic-complete", "deterministic-complete", "parser-incompatible", "runtime-crash", "timeout", "measurement-invalid",
  ]),
  usage: UsageSchema,
  quality: z.object({ passed: z.boolean(), failures: z.array(z.string()) }).strict(),
  outputSha256: DigestSchema,
}).strict();

export type MagpieMeasurementPrefixEntry = z.infer<typeof MagpieMeasurementPrefixEntrySchema>;

export const MagpieMeasurementSerialPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-serial-plan/v1"),
  experimentId: z.string().min(1),
  identityDigest: DigestSchema,
  rows: z.array(MagpieMeasurementRowSchema).min(1).max(36),
  preparedFiles: z.array(PreparedFileSchema),
  accounting: z.object({ paidCalls: z.literal(0), matrixExecuted: z.literal(false), retries: z.literal(0) }).strict(),
}).strict();

export const MagpieMeasurementSerialStateSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-serial-state/v1"),
  experimentId: z.string().min(1),
  identityDigest: DigestSchema,
  planSha256: DigestSchema,
  phase: z.enum(["prepared", "running", "done", "failed"]),
  completedRows: z.number().int().nonnegative(),
  dispatchCount: z.number().int().nonnegative(),
  inFlightRowIndex: z.number().int().nonnegative().nullable(),
  failure: z.string().nullable(),
}).strict();

export type MagpieMeasurementSerialState = z.infer<typeof MagpieMeasurementSerialStateSchema>;

const MagpieMeasurementResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-public-efficiency-result/v1"),
  experimentId: z.literal(MAGPIE_MEASUREMENT_EXPERIMENT_ID),
  status: z.literal("completed"),
  policy: z.object({ path: z.literal(MAGPIE_MEASUREMENT_POLICY_PATH), sha256: DigestSchema }).strict(),
  denominator: z.object({ expectedRows: z.literal(36), observedRows: z.literal(36), pairs: z.literal(18), paidOriginalRows: z.literal(18), deterministicArtifactRows: z.literal(18), retries: z.literal(0) }).strict(),
  quality: z.object({
    originalPasses: z.number().int().min(0).max(18), artifactPasses: z.literal(18), completePairs: z.literal(18),
    infrastructureFailures: z.literal(0), pairwiseRegressions: z.literal(0), machineCheckedEquivalent: z.literal(true),
  }).strict(),
  runtimeCost: z.object({
    original: z.object({ samples: z.literal(18), aggregateInputTokens: z.number().int().nonnegative(), aggregateOutputTokens: z.number().int().nonnegative(), aggregateCacheReadTokens: z.number().int().nonnegative(), aggregateCacheWriteTokens: z.number().int().nonnegative(), meanInputPlusOutputTokens: z.number().nonnegative() }).strict(),
    artifact: z.object({ samples: z.literal(18), aggregateModelTokens: z.literal(0) }).strict(),
    meanModelTokensSavedPerRun: z.number().positive(),
    explicitProductionApiModelTokens: z.literal(0),
    conditionalExplicitApiTokenBreakEven: z.object({ status: z.literal("computed"), calls: z.literal(0), firstRecurringRunNetPositive: z.literal(true) }).strict(),
  }).strict(),
  researchEligibility: z.object({
    allAttemptCostComplete: z.literal(false), efficiencyPositiveEligible: z.literal(false),
    classification: z.literal("not-eligible-unobservable-development-agent-cost"),
  }).strict(),
  accounting: z.object({ modelCalls: z.literal(18), apiCalls: z.literal(18), paidCalls: z.literal(18), artifactExecutions: z.literal(18), retries: z.literal(0), heldOutAccesses: z.literal(0) }).strict(),
  evidence: z.object({ prefixSha256: DigestSchema, records: z.array(z.object({ caseId: z.string(), repetition: z.number().int(), system: z.string(), passed: z.boolean(), outputSha256: DigestSchema }).strict()).length(36) }).strict(),
  authorizations: z.object({ portfolioPromotion: z.literal(false), readinessPromotion: z.literal(false), heldOut: z.literal(false) }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

function rowAttemptId(index: number): string {
  return `row-${String(index + 1).padStart(2, "0")}`;
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
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

async function activeFileRef(activeDir: string, absolutePath: string) {
  const root = resolve(activeDir);
  const target = resolve(absolutePath);
  const fromRoot = relative(root, target).replaceAll("\\", "/");
  if (!fromRoot || fromRoot.startsWith("../") || isAbsolute(fromRoot)) throw new Error(`prepared file escapes active dir: ${absolutePath}`);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`prepared file is not regular: ${fromRoot}`);
  const bytes = await readFile(target);
  return { path: fromRoot, sha256: sha256Bytes(bytes), bytes: bytes.byteLength };
}

async function validatePreparedFiles(activeDir: string, files: z.infer<typeof PreparedFileSchema>[]) {
  for (const reference of files) {
    const actual = await activeFileRef(activeDir, resolve(activeDir, ...reference.path.split("/")));
    if (!isDeepStrictEqual(actual, reference)) throw new Error(`prepared file digest drift: ${reference.path}`);
  }
}

export async function initializeMagpieMeasurementSerialState(options: {
  activeDir: string;
  experimentId: string;
  identityDigest: string;
  rows: MagpieMeasurementRow[];
  preparedFiles: z.infer<typeof PreparedFileSchema>[];
}) {
  const plan = MagpieMeasurementSerialPlanSchema.parse({
    schemaVersion: "skill-ir-magpie-release-audit-serial-plan/v1",
    experimentId: options.experimentId,
    identityDigest: options.identityDigest,
    rows: options.rows,
    preparedFiles: options.preparedFiles,
    accounting: { paidCalls: 0, matrixExecuted: false, retries: 0 },
  });
  const planPath = resolve(options.activeDir, "plan.json");
  await atomicJson(planPath, plan);
  const planSha256 = sha256Bytes(await readFile(planPath));
  const state = MagpieMeasurementSerialStateSchema.parse({
    schemaVersion: "skill-ir-magpie-release-audit-serial-state/v1",
    experimentId: options.experimentId,
    identityDigest: options.identityDigest,
    planSha256,
    phase: "prepared",
    completedRows: 0,
    dispatchCount: 0,
    inFlightRowIndex: null,
    failure: null,
  });
  await atomicJson(resolve(options.activeDir, "serial-state.json"), state);
  await atomicJson(resolve(options.activeDir, "matrix-prefix.json"), []);
  return { plan, state };
}

export async function readMagpieMeasurementSerialStatus(options: {
  activeDir: string;
  experimentId: string;
  identityDigest: string;
  rows: MagpieMeasurementRow[];
}) {
  const planPath = resolve(options.activeDir, "plan.json");
  const plan = MagpieMeasurementSerialPlanSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
  const state = MagpieMeasurementSerialStateSchema.parse(JSON.parse(await readFile(resolve(options.activeDir, "serial-state.json"), "utf8")));
  const prefix = z.array(MagpieMeasurementPrefixEntrySchema).parse(JSON.parse(await readFile(resolve(options.activeDir, "matrix-prefix.json"), "utf8")));
  const planSha256 = sha256Bytes(await readFile(planPath));
  if (plan.experimentId !== options.experimentId || state.experimentId !== options.experimentId
    || plan.identityDigest !== options.identityDigest || state.identityDigest !== options.identityDigest
    || state.planSha256 !== planSha256 || !isDeepStrictEqual(plan.rows, options.rows)) {
    throw new Error("Magpie serial identity drift");
  }
  await validatePreparedFiles(options.activeDir, plan.preparedFiles);
  const pendingTerminal = state.inFlightRowIndex !== null && prefix.length === state.completedRows + 1;
  if (prefix.length !== state.completedRows && !pendingTerminal) throw new Error("Magpie serial prefix/state length drift");
  prefix.forEach((entry, index) => {
    if (!isDeepStrictEqual(entry.row, options.rows[index])) throw new Error(`Magpie serial prefix row drift: ${rowAttemptId(index)}`);
  });
  if (state.completedRows > options.rows.length || state.dispatchCount < state.completedRows
    || (state.inFlightRowIndex !== null && state.inFlightRowIndex !== state.completedRows)) {
    throw new Error("Magpie serial state invariant drift");
  }
  return { plan, state, prefix, pendingTerminal };
}

async function writeSerialState(activeDir: string, value: MagpieMeasurementSerialState) {
  const state = MagpieMeasurementSerialStateSchema.parse(value);
  await atomicJson(resolve(activeDir, "serial-state.json"), state);
  return state;
}

export async function runMagpieMeasurementSerial(options: {
  activeDir: string;
  experimentId: string;
  identityDigest: string;
  rows: MagpieMeasurementRow[];
  executeRow: (row: MagpieMeasurementRow, rowIndex: number) => Promise<{
    entry: MagpieMeasurementPrefixEntry;
    stopAfterCommit: boolean;
    failure?: string;
  }>;
}) {
  let observed = await readMagpieMeasurementSerialStatus(options);
  let state = observed.state;
  if (state.phase === "done" || state.phase === "failed") return state;
  if (state.inFlightRowIndex !== null) {
    if (!observed.pendingTerminal) {
      return writeSerialState(options.activeDir, { ...state, phase: "failed", failure: `dispatched-without-terminal:${rowAttemptId(state.inFlightRowIndex)}` });
    }
    const completedRows = state.completedRows + 1;
    state = await writeSerialState(options.activeDir, {
      ...state,
      phase: completedRows === options.rows.length ? "done" : "running",
      completedRows,
      inFlightRowIndex: null,
      failure: null,
    });
    if (state.phase === "done") return state;
  }
  while (state.completedRows < options.rows.length) {
    observed = await readMagpieMeasurementSerialStatus(options);
    state = observed.state;
    if (state.phase === "done" || state.phase === "failed") return state;
    const rowIndex = state.completedRows;
    const row = options.rows[rowIndex]!;
    state = await writeSerialState(options.activeDir, {
      ...state, phase: "running", dispatchCount: state.dispatchCount + 1, inFlightRowIndex: rowIndex, failure: null,
    });
    let executed: Awaited<ReturnType<typeof options.executeRow>>;
    try {
      executed = await options.executeRow(row, rowIndex);
    } catch (error) {
      return writeSerialState(options.activeDir, {
        ...state, phase: "failed", failure: `executor-failed:${rowAttemptId(rowIndex)}:${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const entry = MagpieMeasurementPrefixEntrySchema.parse(executed.entry);
    if (!isDeepStrictEqual(entry.row, row)) {
      return writeSerialState(options.activeDir, { ...state, phase: "failed", failure: `terminal-row-identity-drift:${rowAttemptId(rowIndex)}` });
    }
    await atomicJson(resolve(options.activeDir, "matrix-prefix.json"), [...observed.prefix, entry]);
    const completedRows = rowIndex + 1;
    state = await writeSerialState(options.activeDir, {
      ...state,
      phase: executed.stopAfterCommit ? "failed" : completedRows === options.rows.length ? "done" : "running",
      completedRows,
      inFlightRowIndex: null,
      failure: executed.stopAfterCommit ? executed.failure ?? `terminal-blocker:${rowAttemptId(rowIndex)}` : null,
    });
    if (state.phase === "done" || state.phase === "failed") return state;
  }
  return state;
}

export async function snapshotMagpieActiveTree(rootDirInput: string) {
  const rootDir = resolve(rootDirInput);
  const entries: Array<{ path: string; sha256: string; bytes: number }> = [];
  const visit = async (directory: string) => {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children) {
      const absolute = join(directory, child.name);
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error("Magpie active tree contains a symlink");
      if (stat.isDirectory()) await visit(absolute);
      else if (stat.isFile()) {
        const bytes = await readFile(absolute);
        entries.push({ path: relative(rootDir, absolute).replaceAll("\\", "/"), sha256: sha256Bytes(bytes), bytes: bytes.byteLength });
      }
    }
  };
  await visit(rootDir);
  entries.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return { entries, treeSha256: sha256Bytes(Buffer.from(`${JSON.stringify(entries)}\n`, "utf8")) };
}

function rowDirectory(activeDir: string, rowIndex: number): string {
  return resolve(activeDir, "rows", `run-${rowIndex + 1}`);
}

function externalTaskJson(task: Awaited<ReturnType<typeof loadAndValidateMagpieReleaseAuditMeasurement>>["tasks"]["tasks"][number]) {
  return {
    id: task.taskId,
    name: task.taskId,
    category: "skill-ir-external-public",
    gradingType: "automated",
    prompt: task.prompt,
    eval: [{ method: "file-check", path: "__external_checker_only__.json", mode: "exact", expected: "never-evaluated-by-skvm-task" }],
    timeoutMs: task.timeoutMs,
    maxSteps: task.maxSteps,
  };
}

export async function prepareMagpieReleaseAuditMeasurementRun(rootDirInput: string, activeDirInput: string) {
  const rootDir = resolve(rootDirInput);
  const activeDir = resolve(activeDirInput);
  if (await exists(activeDir)) throw new Error("Magpie measurement active directory already exists");
  const loaded = await loadAndValidateMagpieReleaseAuditMeasurement(rootDir);
  const policyBytes = await readFile(resolve(rootDir, MAGPIE_MEASUREMENT_POLICY_PATH));
  const identityDigest = sha256Bytes(policyBytes);
  await mkdir(activeDir, { recursive: true });
  const tasks = new Map(loaded.tasks.tasks.map((task) => [task.caseId, task]));
  const preparedFiles = [];
  for (const [rowIndex, row] of loaded.policy.denominator.orderedRows.entries()) {
    const directory = rowDirectory(activeDir, rowIndex);
    const workDir = join(directory, "workdir");
    await mkdir(workDir, { recursive: true });
    const task = tasks.get(row.caseId)!;
    if (row.system === "original") {
      const taskPath = join(directory, "task.json");
      await writeFile(taskPath, `${JSON.stringify(externalTaskJson(task), null, 2)}\n`, "utf8");
      preparedFiles.push(await activeFileRef(activeDir, taskPath));
    } else {
      const reportPath = resolve(rootDir, task.publicReport.path);
      const target = join(workDir, "report.md");
      await copyFile(reportPath, target);
      preparedFiles.push(await activeFileRef(activeDir, target));
    }
  }
  const initialized = await initializeMagpieMeasurementSerialState({
    activeDir,
    experimentId: loaded.policy.experimentId,
    identityDigest,
    rows: loaded.policy.denominator.orderedRows,
    preparedFiles,
  });
  return { status: "prepared" as const, rows: initialized.plan.rows.length, paidCalls: 0, retries: 0, identityDigest };
}

function executionClassification(raw: { exitCode: number; runStatus?: string }, observation: z.infer<typeof RunExecutionObservationSchema>) {
  if (raw.runStatus === "timeout" || observation.process.termination === "idle-timeout" || observation.process.termination === "absolute-timeout") return "timeout" as const;
  if (observation.parser.outcome !== "ok") return "parser-incompatible" as const;
  if (raw.exitCode !== 0 || raw.runStatus !== "ok" || observation.process.termination !== "natural") return "runtime-crash" as const;
  if (!observation.usage.available) return "measurement-invalid" as const;
  return "semantic-complete" as const;
}

async function executeOriginalRow(options: {
  rootDir: string;
  activeDir: string;
  row: MagpieMeasurementRow;
  rowIndex: number;
  task: Awaited<ReturnType<typeof loadAndValidateMagpieReleaseAuditMeasurement>>["tasks"]["tasks"][number];
  policy: Awaited<ReturnType<typeof loadAndValidateMagpieReleaseAuditMeasurement>>["policy"];
  slice: Awaited<ReturnType<typeof loadAndValidateMagpieReleaseAuditSlice>>;
}) {
  const directory = rowDirectory(options.activeDir, options.rowIndex);
  const taskPath = join(directory, "task.json");
  const workDir = join(directory, "workdir");
  const observationPath = join(directory, "execution-observation.json");
  const command = buildSkvmRunCommand({
    taskPath,
    model: options.policy.model.route,
    adapter: options.policy.harness.adapter,
    workdir: workDir,
    executionObservationPath: observationPath,
    timeoutMs: options.policy.runtime.absoluteTimeoutMs,
    idleTimeoutMs: options.policy.runtime.idleTimeoutMs,
    maxSteps: options.policy.runtime.maxSteps,
  });
  const planRow = {
    caseId: `magpie:${options.task.taskId}`,
    system: "no-skill",
    taskPath,
    workDir,
    model: options.policy.model.route,
    modelFamily: options.policy.model.family,
    adapter: options.policy.harness.adapter,
    adapterVersion: options.policy.harness.adapterVersion,
    runIndex: options.row.repetition,
    panelConfigId: options.policy.experimentId,
    command,
  } as RealAgentRunPlanEntry;
  const raw = await executeGenericPlanRow(planRow, { outerWatchdogMs: options.policy.runtime.outerWatchdogMs, exposeOuterTimedOut: true });
  let observation: z.infer<typeof RunExecutionObservationSchema>;
  try {
    observation = RunExecutionObservationSchema.parse(JSON.parse(await readFile(observationPath, "utf8")));
  } catch {
    observation = RunExecutionObservationSchema.parse({
      schemaVersion: "skvm-run-execution-observation/v1",
      process: { exitCode: raw.exitCode, termination: raw.exitCode === 0 ? "natural" : "crash", durationMs: raw.durationMs },
      activity: { requestDispatched: false, providerResponses: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0 },
      terminal: { present: false },
      usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: "empty", unknownTypes: [] },
    });
  }
  const output = extractFinalOutput(raw.stdout);
  const score = await scoreMagpieReleaseAuditOutput(options.slice, options.row.caseId, output);
  const classification = executionClassification(raw, observation);
  const infrastructureFailure = classification !== "semantic-complete";
  return MagpieMeasurementPrefixEntrySchema.parse({
    row: options.row,
    attemptId: rowAttemptId(options.rowIndex),
    status: "complete",
    infrastructureFailure,
    durationMs: raw.durationMs,
    executionClassification: classification,
    usage: observation.usage,
    quality: { passed: score.passed, failures: score.failures },
    outputSha256: sha256Bytes(Buffer.from(output, "utf8")),
  });
}

async function executeArtifactRow(options: {
  activeDir: string;
  row: MagpieMeasurementRow;
  rowIndex: number;
  compiled: Awaited<ReturnType<typeof compileMagpieReleaseAuditArtifact>>;
  slice: Awaited<ReturnType<typeof loadAndValidateMagpieReleaseAuditSlice>>;
}) {
  const workDir = join(rowDirectory(options.activeDir, options.rowIndex), "workdir");
  const started = performance.now();
  const executed = await runMagpieReleaseAuditArtifact({ compiled: options.compiled, workDir });
  const outputBytes = await readFile(join(workDir, executed.outputPath));
  const score = await scoreMagpieReleaseAuditOutput(options.slice, options.row.caseId, outputBytes.toString("utf8"));
  return MagpieMeasurementPrefixEntrySchema.parse({
    row: options.row,
    attemptId: rowAttemptId(options.rowIndex),
    status: "complete",
    infrastructureFailure: false,
    durationMs: performance.now() - started,
    executionClassification: "deterministic-complete",
    usage: { available: true, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    quality: { passed: score.passed, failures: score.failures },
    outputSha256: sha256Bytes(outputBytes),
  });
}

export async function buildMagpieReleaseAuditFinalResult(options: {
  rootDir: string;
  activeDir: string;
  entries: MagpieMeasurementPrefixEntry[];
}) {
  const original = options.entries.filter((entry) => entry.row.system === "original");
  const artifact = options.entries.filter((entry) => entry.row.system === "reviewed-artifact");
  if (original.length !== 18 || artifact.length !== 18) throw new Error("Magpie final result requires complete 36-row denominator");
  const pairs = original.map((entry) => {
    const paired = artifact.find((candidate) => candidate.row.caseId === entry.row.caseId && candidate.row.repetition === entry.row.repetition)!;
    return { original: entry, artifact: paired, regressed: Number(paired.quality.passed) < Number(entry.quality.passed) };
  });
  const infrastructureFailures = options.entries.filter((entry) => entry.infrastructureFailure).length;
  const pairwiseRegressions = pairs.filter((pair) => pair.regressed).length;
  if (infrastructureFailures !== 0 || artifact.some((entry) => !entry.quality.passed) || pairwiseRegressions !== 0) {
    throw new Error("Magpie final quality gate did not establish fixed-slice equivalence");
  }
  const aggregate = (field: "input" | "output" | "cacheRead" | "cacheWrite") => original.reduce((sum, entry) => sum + entry.usage[field], 0);
  const meanTokens = (aggregate("input") + aggregate("output")) / original.length;
  if (meanTokens <= 0) throw new Error("Magpie original recurring token denominator is not positive");
  const prefixBytes = await readFile(resolve(options.activeDir, "matrix-prefix.json"));
  const policyBytes = await readFile(resolve(options.rootDir, MAGPIE_MEASUREMENT_POLICY_PATH));
  return MagpieMeasurementResultSchema.parse({
    schemaVersion: "skill-ir-magpie-release-audit-public-efficiency-result/v1",
    experimentId: MAGPIE_MEASUREMENT_EXPERIMENT_ID,
    status: "completed",
    policy: { path: MAGPIE_MEASUREMENT_POLICY_PATH, sha256: sha256Bytes(policyBytes) },
    denominator: { expectedRows: 36, observedRows: 36, pairs: 18, paidOriginalRows: 18, deterministicArtifactRows: 18, retries: 0 },
    quality: {
      originalPasses: original.filter((entry) => entry.quality.passed).length,
      artifactPasses: 18, completePairs: 18, infrastructureFailures: 0, pairwiseRegressions: 0, machineCheckedEquivalent: true,
    },
    runtimeCost: {
      original: {
        samples: 18,
        aggregateInputTokens: aggregate("input"), aggregateOutputTokens: aggregate("output"),
        aggregateCacheReadTokens: aggregate("cacheRead"), aggregateCacheWriteTokens: aggregate("cacheWrite"),
        meanInputPlusOutputTokens: meanTokens,
      },
      artifact: { samples: 18, aggregateModelTokens: 0 },
      meanModelTokensSavedPerRun: meanTokens,
      explicitProductionApiModelTokens: 0,
      conditionalExplicitApiTokenBreakEven: { status: "computed", calls: 0, firstRecurringRunNetPositive: true },
    },
    researchEligibility: {
      allAttemptCostComplete: false, efficiencyPositiveEligible: false,
      classification: "not-eligible-unobservable-development-agent-cost",
    },
    accounting: { modelCalls: 18, apiCalls: 18, paidCalls: 18, artifactExecutions: 18, retries: 0, heldOutAccesses: 0 },
    evidence: {
      prefixSha256: sha256Bytes(prefixBytes),
      records: options.entries.map((entry) => ({ caseId: entry.row.caseId, repetition: entry.row.repetition, system: entry.row.system, passed: entry.quality.passed, outputSha256: entry.outputSha256 })),
    },
    authorizations: { portfolioPromotion: false, readinessPromotion: false, heldOut: false },
    claimBoundary: "This result establishes machine-checked non-regression and recurring model-token savings only for nine fixed public Step 0-2 fixtures with two repetitions. The zero-call break-even is conditional on explicitly metered production API tokens only; development-agent tokens and human review are unmeasured, so research efficiency-positive eligibility, live-source generalization, portfolio/readiness promotion, and held-out use remain false.",
  });
}

export async function executeMagpieReleaseAuditMeasurementRun(rootDirInput: string, activeDirInput: string) {
  const rootDir = resolve(rootDirInput);
  const activeDir = resolve(activeDirInput);
  const loaded = await loadAndValidateMagpieReleaseAuditMeasurement(rootDir);
  if (!process.env[loaded.policy.runtime.apiKeyEnv]?.trim()) throw new Error(`Missing ${loaded.policy.runtime.apiKeyEnv}`);
  const identityDigest = sha256Bytes(await readFile(resolve(rootDir, MAGPIE_MEASUREMENT_POLICY_PATH)));
  const slice = await loadAndValidateMagpieReleaseAuditSlice(rootDir);
  const compiled = await compileMagpieReleaseAuditArtifact({ rootDir, slice });
  const tasks = new Map(loaded.tasks.tasks.map((task) => [task.caseId, task]));
  const state = await runMagpieMeasurementSerial({
    activeDir,
    experimentId: loaded.policy.experimentId,
    identityDigest,
    rows: loaded.policy.denominator.orderedRows,
    executeRow: async (row, rowIndex) => {
      const entry = row.system === "original"
        ? await executeOriginalRow({ rootDir, activeDir, row, rowIndex, task: tasks.get(row.caseId)!, policy: loaded.policy, slice })
        : await executeArtifactRow({ activeDir, row, rowIndex, compiled, slice });
      const stopAfterCommit = entry.infrastructureFailure || (row.system === "reviewed-artifact" && !entry.quality.passed);
      process.stdout.write(`${JSON.stringify({ completed: rowIndex + 1, total: 36, system: row.system, classification: entry.executionClassification, passed: entry.quality.passed })}\n`);
      return { entry, stopAfterCommit, ...(stopAfterCommit ? { failure: `execution-blocker:${rowAttemptId(rowIndex)}:${entry.executionClassification}` } : {}) };
    },
  });
  if (state.phase !== "done") throw new Error(`Magpie measurement failed: ${state.failure ?? "unknown"}`);
  const observed = await readMagpieMeasurementSerialStatus({
    activeDir, experimentId: loaded.policy.experimentId, identityDigest, rows: loaded.policy.denominator.orderedRows,
  });
  const result = await buildMagpieReleaseAuditFinalResult({ rootDir, activeDir, entries: observed.prefix });
  const reportPath = resolve(dirname(activeDir), "report.json");
  await atomicJson(reportPath, result);
  return { status: result.status, rows: 36, paidCalls: 18, qualityEquivalent: result.quality.machineCheckedEquivalent, meanTokensSaved: result.runtimeCost.meanModelTokensSavedPerRun, researchEfficiencyPositiveEligible: false, reportPath };
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function safeActiveDir(rootDir: string, value: string) {
  const resultsRoot = resolve(rootDir, "results/skill-ir");
  const activeDir = resolve(value);
  const fromResults = relative(resultsRoot, activeDir);
  if (!fromResults || fromResults.startsWith("..") || isAbsolute(fromResults)) throw new Error("Magpie active dir must be under results/skill-ir");
  return activeDir;
}

if (import.meta.main) {
  const phase = argument("phase");
  const rootDir = resolve(argument("root") ?? process.cwd());
  if (phase === "freeze") {
    const frozenAt = argument("frozen-at");
    if (!frozenAt) throw new Error("--frozen-at is required for freeze");
    const frozen = await writeMagpieReleaseAuditMeasurementFreeze({ rootDir, frozenAt });
    process.stdout.write(`${JSON.stringify({ status: "frozen", rows: frozen.policy.denominator.rows, paidCalls: 0 }, null, 2)}\n`);
  } else {
    if (!phase || !["prepare", "execute", "status"].includes(phase)) throw new Error("--phase=freeze|prepare|execute|status is required");
    const activeDir = safeActiveDir(rootDir, argument("out-dir") ?? resolve(rootDir, "results/skill-ir/magpie-release-audit-public-efficiency-002/run"));
    if (phase === "prepare") {
      process.stdout.write(`${JSON.stringify(await prepareMagpieReleaseAuditMeasurementRun(rootDir, activeDir), null, 2)}\n`);
    } else if (phase === "execute") {
      process.stdout.write(`${JSON.stringify(await executeMagpieReleaseAuditMeasurementRun(rootDir, activeDir), null, 2)}\n`);
    } else {
      const loaded = await loadAndValidateMagpieReleaseAuditMeasurement(rootDir);
      const identityDigest = sha256Bytes(await readFile(resolve(rootDir, MAGPIE_MEASUREMENT_POLICY_PATH)));
      const status = await readMagpieMeasurementSerialStatus({ activeDir, experimentId: loaded.policy.experimentId, identityDigest, rows: loaded.policy.denominator.orderedRows });
      process.stdout.write(`${JSON.stringify({ phase: status.state.phase, completedRows: status.state.completedRows, dispatchCount: status.state.dispatchCount, failure: status.state.failure }, null, 2)}\n`);
    }
  }
}
