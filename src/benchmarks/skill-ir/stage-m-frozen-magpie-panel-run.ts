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
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { RunExecutionObservationSchema } from "../../core/types";
import { runVerifiedArtifactCli } from "../../skill-ir/verified-artifact-cli";
import { scoreMagpieReleaseAuditOutput } from "./magpie-release-audit-checker";
import {
  loadAndValidateMagpieReleaseAuditSlice,
  readMagpieReleaseAuditPublicFile,
} from "./magpie-release-audit-step2";
import { buildSkvmRunCommand, type RealAgentRunPlanEntry } from "./real-agent";
import { executeGenericPlanRow } from "./real-agent-run";
import {
  bindQualifiedRuntimeExecutableCommand,
  qualifyCurrentRuntimeExecutable,
  resolveQualifiedRuntimeExecutable,
  RuntimeExecutableIdentitySchema,
} from "./runtime-executable-identity";
import { extractFinalOutput } from "./scoring";
import { sha256Bytes } from "./source-fixture";
import {
  StageMArtifactMatrixRowSchema,
  StageMModelMatrixRowSchema,
  StageMQualificationRowSchema,
  buildStageMMatrixReport,
  buildStageMQualification,
  type StageMArtifactMatrixRow,
  type StageMModelMatrixRow,
} from "./stage-m-frozen-magpie-panel";
import {
  STAGE_M_EXPERIMENT_ID,
  STAGE_M_LOCK_PATH,
  StageMPlannedArtifactRowSchema,
  StageMPlannedModelRowSchema,
  StageMPlannedRowSchema,
  loadAndValidateStageMPanel,
  type StageMPlannedRow,
} from "./stage-m-frozen-magpie-panel-plan";

export type { StageMPlannedRow } from "./stage-m-frozen-magpie-panel-plan";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const PreparedFileSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  bytes: z.number().int().positive(),
}).strict();

const StageMModelExecutionEntrySchema = z.object({
  kind: z.literal("model"),
  phase: z.enum(["qualification", "matrix"]),
  attemptId: z.string().min(1),
  row: StageMPlannedModelRowSchema,
  result: StageMModelMatrixRowSchema,
}).strict();

const StageMArtifactExecutionEntrySchema = z.object({
  kind: z.literal("artifact"),
  phase: z.literal("matrix"),
  attemptId: z.string().min(1),
  row: StageMPlannedArtifactRowSchema,
  result: StageMArtifactMatrixRowSchema,
}).strict();

export const StageMExecutionEntrySchema = z.discriminatedUnion("kind", [
  StageMModelExecutionEntrySchema,
  StageMArtifactExecutionEntrySchema,
]);
export type StageMExecutionEntry = z.infer<typeof StageMExecutionEntrySchema>;

export const StageMSerialPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-stage-m-frozen-magpie-serial-plan/v1"),
  experimentId: z.string().min(1),
  lockSha256: Sha256Schema,
  rows: z.array(StageMPlannedRowSchema).min(1).max(36),
  preparedFiles: z.array(PreparedFileSchema),
  accounting: z.object({ retries: z.literal(0), replacements: z.literal(0) }).strict(),
}).strict();

export const StageMSerialStateSchema = z.object({
  schemaVersion: z.literal("skill-ir-stage-m-frozen-magpie-serial-state/v1"),
  experimentId: z.string().min(1),
  lockSha256: Sha256Schema,
  planSha256: Sha256Schema,
  phase: z.enum(["prepared", "running", "done", "failed"]),
  completedRows: z.number().int().nonnegative(),
  dispatchCount: z.number().int().nonnegative(),
  inFlightRowIndex: z.number().int().nonnegative().nullable(),
  failure: z.string().nullable(),
}).strict();

export type StageMSerialState = z.infer<typeof StageMSerialStateSchema>;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, jsonText(value), "utf8");
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

async function activeFileRef(activeDir: string, pathInput: string) {
  const root = resolve(activeDir);
  const target = resolve(pathInput);
  const fromRoot = relative(root, target).replaceAll("\\", "/");
  if (!fromRoot || fromRoot.startsWith("../") || isAbsolute(fromRoot)) throw new Error(`Stage M prepared file escapes active directory: ${pathInput}`);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Stage M prepared file is not regular: ${fromRoot}`);
  const bytes = await readFile(target);
  return PreparedFileSchema.parse({ path: fromRoot, sha256: sha256Bytes(bytes), bytes: bytes.byteLength });
}

async function validatePreparedFiles(activeDir: string, files: z.infer<typeof PreparedFileSchema>[]) {
  for (const reference of files) {
    const actual = await activeFileRef(activeDir, resolve(activeDir, ...reference.path.split("/")));
    if (!isDeepStrictEqual(actual, reference)) throw new Error(`Stage M prepared file digest drift: ${reference.path}`);
  }
}

export async function initializeStageMSerialRun(options: {
  activeDir: string;
  experimentId: string;
  lockSha256: string;
  rows: StageMPlannedRow[];
  preparedFiles: z.infer<typeof PreparedFileSchema>[];
}) {
  await mkdir(options.activeDir, { recursive: true });
  for (const filename of ["plan.json", "serial-state.json", "prefix.json"]) {
    if (await exists(resolve(options.activeDir, filename))) throw new Error(`Stage M serial run already initialized: ${filename}`);
  }
  const plan = StageMSerialPlanSchema.parse({
    schemaVersion: "skill-ir-stage-m-frozen-magpie-serial-plan/v1",
    experimentId: options.experimentId,
    lockSha256: options.lockSha256,
    rows: options.rows,
    preparedFiles: options.preparedFiles,
    accounting: { retries: 0, replacements: 0 },
  });
  const planPath = resolve(options.activeDir, "plan.json");
  await atomicJson(planPath, plan);
  const state = StageMSerialStateSchema.parse({
    schemaVersion: "skill-ir-stage-m-frozen-magpie-serial-state/v1",
    experimentId: options.experimentId,
    lockSha256: options.lockSha256,
    planSha256: sha256Bytes(await readFile(planPath)),
    phase: "prepared",
    completedRows: 0,
    dispatchCount: 0,
    inFlightRowIndex: null,
    failure: null,
  });
  await atomicJson(resolve(options.activeDir, "serial-state.json"), state);
  await atomicJson(resolve(options.activeDir, "prefix.json"), []);
  return { plan, state };
}

export async function readStageMSerialRun(options: {
  activeDir: string;
  experimentId: string;
  lockSha256: string;
  rows: StageMPlannedRow[];
}) {
  const planPath = resolve(options.activeDir, "plan.json");
  const plan = StageMSerialPlanSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
  const state = StageMSerialStateSchema.parse(JSON.parse(await readFile(resolve(options.activeDir, "serial-state.json"), "utf8")));
  const prefix = z.array(StageMExecutionEntrySchema).parse(JSON.parse(await readFile(resolve(options.activeDir, "prefix.json"), "utf8")));
  const planSha256 = sha256Bytes(await readFile(planPath));
  if (plan.experimentId !== options.experimentId || state.experimentId !== options.experimentId
    || plan.lockSha256 !== options.lockSha256 || state.lockSha256 !== options.lockSha256
    || state.planSha256 !== planSha256 || !isDeepStrictEqual(plan.rows, options.rows)) {
    throw new Error("Stage M serial identity drift");
  }
  await validatePreparedFiles(options.activeDir, plan.preparedFiles);
  const pendingTerminal = state.inFlightRowIndex !== null && prefix.length === state.completedRows + 1;
  if (prefix.length !== state.completedRows && !pendingTerminal) throw new Error("Stage M prefix/state length drift");
  prefix.forEach((entry, index) => {
    if (!isDeepStrictEqual(entry.row, options.rows[index])) throw new Error(`Stage M prefix row drift: ${index + 1}`);
  });
  if (state.completedRows > options.rows.length || state.dispatchCount < state.completedRows
    || (state.inFlightRowIndex !== null && state.inFlightRowIndex !== state.completedRows)) {
    throw new Error("Stage M serial state invariant drift");
  }
  return { plan, state, prefix, pendingTerminal };
}

async function writeState(activeDir: string, value: StageMSerialState) {
  const state = StageMSerialStateSchema.parse(value);
  await atomicJson(resolve(activeDir, "serial-state.json"), state);
  return state;
}

export async function runStageMSerialRun(options: {
  activeDir: string;
  experimentId: string;
  lockSha256: string;
  rows: StageMPlannedRow[];
  executeRow: (row: StageMPlannedRow, rowIndex: number) => Promise<StageMExecutionEntry>;
}) {
  let observed = await readStageMSerialRun(options);
  let state = observed.state;
  if (state.phase === "done" || state.phase === "failed") return state;
  if (state.inFlightRowIndex !== null) {
    if (!observed.pendingTerminal) {
      return writeState(options.activeDir, {
        ...state,
        phase: "failed",
        failure: `dispatched-without-terminal:row-${state.inFlightRowIndex + 1}`,
      });
    }
    const completedRows = state.completedRows + 1;
    state = await writeState(options.activeDir, {
      ...state,
      phase: completedRows === options.rows.length ? "done" : "running",
      completedRows,
      inFlightRowIndex: null,
      failure: null,
    });
  }
  while (state.completedRows < options.rows.length) {
    observed = await readStageMSerialRun(options);
    state = observed.state;
    if (state.phase === "done" || state.phase === "failed") return state;
    const rowIndex = state.completedRows;
    const row = options.rows[rowIndex]!;
    state = await writeState(options.activeDir, {
      ...state,
      phase: "running",
      dispatchCount: state.dispatchCount + 1,
      inFlightRowIndex: rowIndex,
      failure: null,
    });
    let entry: StageMExecutionEntry;
    try {
      entry = StageMExecutionEntrySchema.parse(await options.executeRow(row, rowIndex));
    } catch (error) {
      return writeState(options.activeDir, {
        ...state,
        phase: "failed",
        failure: `dispatched-without-terminal:row-${rowIndex + 1}:${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (!isDeepStrictEqual(entry.row, row)) {
      return writeState(options.activeDir, { ...state, phase: "failed", failure: `terminal-row-identity-drift:row-${rowIndex + 1}` });
    }
    await atomicJson(resolve(options.activeDir, "prefix.json"), [...observed.prefix, entry]);
    const completedRows = rowIndex + 1;
    state = await writeState(options.activeDir, {
      ...state,
      phase: completedRows === options.rows.length ? "done" : "running",
      completedRows,
      inFlightRowIndex: null,
      failure: null,
    });
  }
  return state;
}

function taskJson(task: { taskId: string; prompt: string; timeoutMs: number; maxSteps: number }) {
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

function rowDirectory(activeDir: string, row: StageMPlannedRow) {
  return resolve(activeDir, "rows", `run-${String(row.ordinal).padStart(2, "0")}`);
}

export async function prepareStageMPanelRun(options: {
  rootDir: string;
  outRoot: string;
  phase: "qualification" | "matrix";
  lockPath?: string;
}) {
  const context = await loadAndValidateStageMPanel(options.rootDir, options.lockPath ?? STAGE_M_LOCK_PATH);
  const outRoot = resolve(options.outRoot);
  const activeDir = resolve(outRoot, `${options.phase}-run`);
  if (await exists(activeDir)) throw new Error(`Stage M ${options.phase} run already exists`);
  await mkdir(activeDir, { recursive: true });
  if (options.phase === "matrix") {
    const qualification = JSON.parse(await readFile(resolve(outRoot, "qualification.json"), "utf8"));
    const parsed = buildStageMQualification({
      lock: context.lock,
      lockSha256: context.lockSha256,
      families: Object.values(qualification.families),
    });
    if (!isDeepStrictEqual(parsed, qualification) || !parsed.matrixAuthorized) {
      throw new Error("Stage M matrix preparation requires the exact passed qualification");
    }
  }
  const rows = options.phase === "qualification" ? context.qualificationRows : context.matrixRows;
  const taskByCase = new Map(context.tasks.tasks.map((task) => [task.caseId, task]));
  const slice = await loadAndValidateMagpieReleaseAuditSlice(context.rootDir);
  const preparedFiles = [];
  const runtimePath = resolve(activeDir, "runtime-executable.json");
  await writeFile(runtimePath, jsonText(await qualifyCurrentRuntimeExecutable()), "utf8");
  preparedFiles.push(await activeFileRef(activeDir, runtimePath));
  for (const row of rows) {
    const directory = rowDirectory(activeDir, row);
    const workDir = resolve(directory, "workdir");
    await mkdir(workDir, { recursive: true });
    if (row.kind === "model") {
      const task = taskByCase.get(row.caseId);
      if (!task) throw new Error(`Stage M task missing: ${row.caseId}`);
      const taskPath = resolve(directory, "task.json");
      await writeFile(taskPath, jsonText(taskJson(task)), "utf8");
      preparedFiles.push(await activeFileRef(activeDir, taskPath));
    } else {
      const report = await readMagpieReleaseAuditPublicFile(slice, `/public/${row.caseId}/report.md`);
      const reportPath = resolve(workDir, "report.md");
      const interfacePath = resolve(workDir, "release-audit-interface.json");
      await copyFile(resolve(context.rootDir, report.file.localPath), reportPath);
      await writeFile(interfacePath, jsonText({
        schemaVersion: "skill-ir-magpie-release-audit-product-interface/v1",
        caseId: row.caseId,
        observationsPath: "artifact-observations.json",
        outputPath: "release-audit-output.json",
      }), "utf8");
      preparedFiles.push(await activeFileRef(activeDir, reportPath), await activeFileRef(activeDir, interfacePath));
    }
  }
  await initializeStageMSerialRun({
    activeDir,
    experimentId: context.lock.experimentId,
    lockSha256: context.lockSha256,
    rows,
    preparedFiles,
  });
  return { status: "prepared" as const, phase: options.phase, activeDir, rows: rows.length, paidCalls: 0, retries: 0 };
}

function executionClassification(raw: { exitCode: number; runStatus?: string; outerTimedOut?: boolean }, observation: z.infer<typeof RunExecutionObservationSchema>) {
  if (raw.outerTimedOut || raw.runStatus === "timeout" || observation.process.termination === "idle-timeout"
    || observation.process.termination === "absolute-timeout") return "timeout" as const;
  if (observation.parser.outcome !== "ok") return "parser-incompatible" as const;
  if (raw.exitCode !== 0 || raw.runStatus !== "ok" || observation.process.termination !== "natural") return "runtime-crash" as const;
  if (!observation.usage.available) return "usage-missing" as const;
  return "semantic-complete" as const;
}

async function executeModelRow(options: {
  rootDir: string;
  activeDir: string;
  row: z.infer<typeof StageMPlannedModelRowSchema>;
  taskId: string;
  runtimeExecutable: string;
  lock: Awaited<ReturnType<typeof loadAndValidateStageMPanel>>["lock"];
}) {
  const directory = rowDirectory(options.activeDir, options.row);
  const taskPath = resolve(directory, "task.json");
  const workDir = resolve(directory, "workdir");
  const observationPath = resolve(directory, "execution-observation.json");
  const command = bindQualifiedRuntimeExecutableCommand(buildSkvmRunCommand({
    taskPath,
    model: options.row.route,
    adapter: options.lock.harness.adapter,
    workdir: workDir,
    executionObservationPath: observationPath,
    timeoutMs: options.lock.harness.absoluteTimeoutMs,
    idleTimeoutMs: options.lock.harness.idleTimeoutMs,
    maxSteps: options.lock.harness.maxSteps,
  }), options.runtimeExecutable);
  const raw = await executeGenericPlanRow({
    caseId: `stage-m:${options.row.family}:${options.taskId}`,
    system: "original",
    taskPath,
    workDir,
    model: options.row.route,
    modelFamily: options.row.family,
    adapter: options.lock.harness.adapter,
    adapterVersion: options.lock.harness.adapterVersion,
    runIndex: 1,
    panelConfigId: options.lock.experimentId,
    command,
  } as RealAgentRunPlanEntry, { outerWatchdogMs: options.lock.harness.outerWatchdogMs, exposeOuterTimedOut: true });
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
  const slice = await loadAndValidateMagpieReleaseAuditSlice(options.rootDir);
  const score = await scoreMagpieReleaseAuditOutput(slice, options.row.caseId as never, output);
  const classification = executionClassification(raw, observation);
  const status = classification === "semantic-complete" ? "complete" as const : "failed" as const;
  return StageMModelMatrixRowSchema.parse({
    family: options.row.family,
    route: options.row.route,
    caseId: options.row.caseId,
    status,
    classification,
    usage: observation.usage,
    durationMs: raw.durationMs,
    passed: score.passed,
    failures: score.failures,
    outputSha256: sha256Bytes(Buffer.from(output, "utf8")),
    ...(status === "failed" ? { detail: `classification=${classification}; exitCode=${raw.exitCode}; runStatus=${raw.runStatus}; parser=${observation.parser.outcome}` } : {}),
  });
}

async function executeArtifactRow(options: {
  rootDir: string;
  activeDir: string;
  row: z.infer<typeof StageMPlannedArtifactRowSchema>;
  configPath: string;
}) {
  const directory = rowDirectory(options.activeDir, options.row);
  const workDir = resolve(directory, "workdir");
  const productDir = resolve(directory, "product");
  const started = performance.now();
  await runVerifiedArtifactCli([
    `--root=${options.rootDir}`,
    `--config=${options.configPath}`,
    `--workdir=${workDir}`,
    `--out=${productDir}`,
  ], options.rootDir);
  const output = await readFile(resolve(workDir, "release-audit-output.json"));
  const outputSha256 = sha256Bytes(output);
  const passed = outputSha256 === options.row.expectedOutputSha256;
  return StageMArtifactMatrixRowSchema.parse({
    caseId: options.row.caseId,
    status: passed ? "complete" : "failed",
    passed,
    outputSha256,
    expectedOutputSha256: options.row.expectedOutputSha256,
    durationMs: performance.now() - started,
    ...(!passed ? { detail: `P2 output-digest regression mismatch: ${outputSha256}` } : {}),
  });
}

function compactError(error: unknown, rootDir: string, activeDir: string) {
  return (error instanceof Error ? error.message : String(error))
    .replaceAll(resolve(rootDir), "<root>")
    .replaceAll(resolve(activeDir), "<run>")
    .slice(0, 800);
}

function failedModelRow(row: z.infer<typeof StageMPlannedModelRowSchema>, detail: string): StageMModelMatrixRow {
  return StageMModelMatrixRowSchema.parse({
    family: row.family,
    route: row.route,
    caseId: row.caseId,
    status: "failed",
    classification: "controller-exception",
    usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    durationMs: 0,
    passed: false,
    failures: ["controller exception before a trustworthy model row was recorded"],
    outputSha256: sha256Bytes(Buffer.alloc(0)),
    detail,
  });
}

function failedArtifactRow(row: z.infer<typeof StageMPlannedArtifactRowSchema>, detail: string): StageMArtifactMatrixRow {
  return StageMArtifactMatrixRowSchema.parse({
    caseId: row.caseId,
    status: "failed",
    passed: false,
    outputSha256: sha256Bytes(Buffer.alloc(0)),
    expectedOutputSha256: row.expectedOutputSha256,
    durationMs: 0,
    detail,
  });
}

export async function executeStageMPanelRun(options: {
  rootDir: string;
  outRoot: string;
  phase: "qualification" | "matrix";
  lockPath?: string;
  env?: Record<string, string | undefined>;
}) {
  assertStageMResearchExecutionDisabled(options.phase);
  const context = await loadAndValidateStageMPanel(options.rootDir, options.lockPath ?? STAGE_M_LOCK_PATH);
  const outRoot = resolve(options.outRoot);
  const activeDir = resolve(outRoot, `${options.phase}-run`);
  const rows = options.phase === "qualification" ? context.qualificationRows : context.matrixRows;
  const runtime = RuntimeExecutableIdentitySchema.parse(JSON.parse(await readFile(resolve(activeDir, "runtime-executable.json"), "utf8")));
  const runtimeExecutable = await resolveQualifiedRuntimeExecutable(runtime);
  const env = options.env ?? process.env;
  if (!env.SKVM_XTY_API_KEY?.trim()) throw new Error("Missing SKVM_XTY_API_KEY");
  const taskByCase = new Map(context.tasks.tasks.map((task) => [task.caseId, task]));
  const state = await runStageMSerialRun({
    activeDir,
    experimentId: context.lock.experimentId,
    lockSha256: context.lockSha256,
    rows,
    executeRow: async (row, rowIndex) => {
      const attemptId = `${options.phase}-row-${String(rowIndex + 1).padStart(2, "0")}`;
      if (row.kind === "model") {
        let result: StageMModelMatrixRow;
        try {
          const task = taskByCase.get(row.caseId);
          if (!task) throw new Error(`task missing: ${row.caseId}`);
          result = await executeModelRow({ rootDir: context.rootDir, activeDir, row, taskId: task.taskId, runtimeExecutable, lock: context.lock });
        } catch (error) {
          result = failedModelRow(row, compactError(error, context.rootDir, activeDir));
        }
        process.stdout.write(`${JSON.stringify({ phase: options.phase, completed: rowIndex + 1, total: rows.length, family: row.family, caseId: row.caseId, status: result.status, classification: result.classification })}\n`);
        return { kind: "model", phase: options.phase, attemptId, row, result };
      }
      let result: StageMArtifactMatrixRow;
      try {
        result = await executeArtifactRow({ rootDir: context.rootDir, activeDir, row, configPath: context.lock.artifact.productConfig.path });
      } catch (error) {
        result = failedArtifactRow(row, compactError(error, context.rootDir, activeDir));
      }
      process.stdout.write(`${JSON.stringify({ phase: options.phase, completed: rowIndex + 1, total: rows.length, caseId: row.caseId, status: result.status, checker: context.lock.artifact.checkerAuthority })}\n`);
      return { kind: "artifact", phase: "matrix", attemptId, row, result };
    },
  });
  const observed = await readStageMSerialRun({
    activeDir,
    experimentId: context.lock.experimentId,
    lockSha256: context.lockSha256,
    rows,
  });
  if (options.phase === "qualification") {
    const modelEntries = observed.prefix.filter((entry): entry is z.infer<typeof StageMModelExecutionEntrySchema> => entry.kind === "model");
    const families = context.lock.models.map((model) => {
      const results = modelEntries.filter((entry) => entry.result.family === model.family).map((entry) => StageMQualificationRowSchema.parse({
        family: entry.result.family,
        caseId: entry.result.caseId,
        status: entry.result.status,
        classification: entry.result.classification,
        usageAvailable: entry.result.usage.available,
        usage: entry.result.usage,
        durationMs: entry.result.durationMs,
        ...(entry.result.detail ? { detail: entry.result.detail } : {}),
      }));
      const observedCases = new Set(results.map((row) => row.caseId));
      return {
        family: model.family,
        route: model.route,
        expectedRows: context.lock.qualification.expectedRowsPerFamily,
        observedRows: results.length,
        missingCaseIds: context.lock.cases.map((item) => item.caseId).filter((caseId) => !observedCases.has(caseId)),
        rows: results,
      };
    });
    const qualification = buildStageMQualification({ lock: context.lock, lockSha256: context.lockSha256, families });
    await atomicJson(resolve(outRoot, "qualification.json"), qualification);
    return { status: qualification.status, matrixAuthorized: qualification.matrixAuthorized, state: state.phase, rows: observed.prefix.length, paidCalls: observed.state.dispatchCount, retries: 0 };
  }
  if (state.phase !== "done" || observed.prefix.length !== context.lock.matrix.expectedLogicalRows) {
    const failure = {
      schemaVersion: "skill-ir-stage-m-frozen-magpie-cross-model-panel-incomplete/v1",
      experimentId: context.lock.experimentId,
      lockSha256: context.lockSha256,
      status: "blocked",
      completedRows: observed.prefix.length,
      expectedRows: context.lock.matrix.expectedLogicalRows,
      dispatchCount: observed.state.dispatchCount,
      failure: observed.state.failure ?? "matrix denominator incomplete",
      retries: 0,
      replacements: 0,
    };
    await atomicJson(resolve(outRoot, "matrix-incomplete.json"), failure);
    return failure;
  }
  const qualification = JSON.parse(await readFile(resolve(outRoot, "qualification.json"), "utf8"));
  const modelRows = observed.prefix.filter((entry): entry is z.infer<typeof StageMModelExecutionEntrySchema> => entry.kind === "model").map((entry) => entry.result);
  const artifactRows = observed.prefix.filter((entry): entry is z.infer<typeof StageMArtifactExecutionEntrySchema> => entry.kind === "artifact").map((entry) => entry.result);
  const report = buildStageMMatrixReport({ lock: context.lock, lockSha256: context.lockSha256, qualification, modelRows, artifactRows });
  await atomicJson(resolve(outRoot, "panel-report.json"), report);
  return report;
}

export function assertStageMResearchExecutionDisabled(phase: "qualification" | "matrix"): never {
  throw new Error(`Stage M ${phase} execution is disabled: this identity is a preregistration-only panel; paid qualification/matrix execution requires a new authorized identity`);
}

function argument(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

export function parseStageMPanelArgs(argv: string[]) {
  const phase = argument(argv, "phase");
  if (!phase || !["prepare-qualification", "qualification", "prepare-matrix", "matrix", "status"].includes(phase)) {
    throw new Error("--phase=prepare-qualification|qualification|prepare-matrix|matrix|status is required");
  }
  const rootDir = resolve(argument(argv, "root") ?? process.cwd());
  const outRoot = resolve(argument(argv, "out") ?? resolve(rootDir, "results/skill-ir/stage-m-frozen-magpie-panel-001"));
  const resultsRoot = resolve(rootDir, "results/skill-ir");
  const fromResults = relative(resultsRoot, outRoot);
  if (!fromResults || fromResults === ".." || fromResults.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromResults)) {
    throw new Error("Stage M output must be under results/skill-ir");
  }
  const stage = argument(argv, "stage");
  if (phase === "status" && stage !== "qualification" && stage !== "matrix") throw new Error("--stage=qualification|matrix is required for status");
  return { phase: phase as "prepare-qualification" | "qualification" | "prepare-matrix" | "matrix" | "status", rootDir, outRoot, lockPath: argument(argv, "lock") ?? STAGE_M_LOCK_PATH, stage };
}

async function main() {
  const args = parseStageMPanelArgs(process.argv.slice(2));
  if (args.phase === "prepare-qualification" || args.phase === "prepare-matrix") {
    const phase = args.phase === "prepare-qualification" ? "qualification" : "matrix";
    return prepareStageMPanelRun({ rootDir: args.rootDir, outRoot: args.outRoot, phase, lockPath: args.lockPath });
  }
  if (args.phase === "qualification" || args.phase === "matrix") {
    return executeStageMPanelRun({ rootDir: args.rootDir, outRoot: args.outRoot, phase: args.phase, lockPath: args.lockPath });
  }
  const context = await loadAndValidateStageMPanel(args.rootDir, args.lockPath);
  const phase = args.stage as "qualification" | "matrix";
  const rows = phase === "qualification" ? context.qualificationRows : context.matrixRows;
  const observed = await readStageMSerialRun({ activeDir: resolve(args.outRoot, `${phase}-run`), experimentId: context.lock.experimentId, lockSha256: context.lockSha256, rows });
  return { phase: observed.state.phase, completedRows: observed.state.completedRows, dispatchCount: observed.state.dispatchCount, failure: observed.state.failure };
}

if (import.meta.main) {
  main().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (typeof result === "object" && result !== null && "status" in result
      && (result.status === "failed" || result.status === "blocked")) process.exitCode = 1;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
