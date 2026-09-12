import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { runApiTask } from "./api-task-run";
import { runN5ConsumerEvidence } from "./skill-family-current-v2-n5";
import { runN8EngineEvidence } from "./skill-family-current-v2-n8";
import {
  readN10RequiredCompletionCounts,
  summarizeN10FirstRunRows,
  type N10DevelopmentLock,
  type N10FirstRunSummaryRow,
} from "./skill-family-current-v2-n10";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";
const DEVELOPMENT_ROOT = `${RESULT_ROOT}/development`;
const N5_REPORT = `${RESULT_ROOT}/integration/consumer-report.json`;
const N8_REPORT = `${RESULT_ROOT}/integration/engine-report.json`;
const N10_LOCK = `${DEVELOPMENT_ROOT}/input-lock.json`;
const N10_FIRST_RUN = `${DEVELOPMENT_ROOT}/first-run.json`;
const PYTHON_MANIFEST = "results/skill-ir/skill-family-current-clean-20260911/python-dependencies.json";
const PYTHON_ARCHIVE_SHA256 = "4337563df85d7ae9a6669aaf757b87e594189f077883bd03f5ecbd0b8dcac1de" as const;
const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;

type Binding = { path: string; sha256: string; bytes: number };

type NativeInput = {
  fixtures: Array<{
    fixtureId: string;
    status: string;
    junit: { tests: number; executed: number; passed: number; failed: number; errors: number; skipped: number };
  }>;
  accounting: { loopbackHttpCalls: number; remoteHttpCalls: number; projectModelCalls: number; paidCalls: number };
};

export type CurrentV2N14NativeSummary = {
  attempted: number;
  executed: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  loopbackHttpCalls: number;
  remoteHttpCalls: number;
  projectModelCalls: number;
  paidCalls: number;
  conservation: boolean;
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stable = (value: unknown) => JSON.stringify(canonical(value));
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export function summarizeCurrentV2N14NativeConsumer(input: NativeInput): CurrentV2N14NativeSummary {
  const sum = (key: keyof NativeInput["fixtures"][number]["junit"]) =>
    input.fixtures.reduce((total, fixture) => total + fixture.junit[key], 0);
  for (const fixture of input.fixtures) {
    const values = Object.values(fixture.junit);
    if (values.some((value) => !Number.isInteger(value) || value < 0)
      || fixture.junit.executed !== fixture.junit.tests - fixture.junit.skipped
      || fixture.junit.executed !== fixture.junit.passed + fixture.junit.failed + fixture.junit.errors) {
      throw new Error(`N14 native JUnit denominator is invalid: ${fixture.fixtureId}`);
    }
  }
  const summary = {
    attempted: sum("tests"),
    executed: sum("executed"),
    passed: sum("passed"),
    failed: sum("failed"),
    errors: sum("errors"),
    skipped: sum("skipped"),
    loopbackHttpCalls: input.accounting.loopbackHttpCalls,
    remoteHttpCalls: input.accounting.remoteHttpCalls,
    projectModelCalls: input.accounting.projectModelCalls,
    paidCalls: input.accounting.paidCalls,
    conservation: true,
  };
  summary.conservation = summary.attempted === summary.executed + summary.skipped
    && summary.executed === summary.passed + summary.failed + summary.errors;
  return summary;
}

function packageSha256(row: Record<string, any>) {
  return row.taskPackageSha256 ?? row.firstBuild?.taskPackageSha256 ?? null;
}

function taskSemantic(row: Record<string, any>) {
  return {
    taskId: row.taskId,
    taskComplete: row.taskComplete,
    packageCheck: row.packageCheck,
    required: row.required,
    semanticPlanSha256: row.semanticPlanSha256,
    taskPackageSha256: packageSha256(row),
    backend: row.backend,
    consumer: row.consumer,
    obligationResults: row.obligationResults,
    sourceClosureSummary: row.sourceClosureSummary,
  };
}

function failureSemantic(row: Record<string, any>) {
  return {
    taskId: row.taskId,
    taskComplete: row.taskComplete,
    required: row.required,
    obligationResults: row.obligationResults,
  };
}

export function compareCurrentV2N14TaskRows(baseline: Record<string, any>, replay: Record<string, any>) {
  const failureSemanticsEqual = stable(failureSemantic(baseline)) === stable(failureSemantic(replay));
  const semanticEqual = stable(taskSemantic(baseline)) === stable(taskSemantic(replay));
  return {
    taskId: baseline.taskId,
    semanticEqual,
    failureSemanticsEqual,
    packageDigestEqual: packageSha256(baseline) === packageSha256(replay),
    passed: semanticEqual && failureSemanticsEqual,
  };
}

export type CurrentV2N14ReportInput = {
  codeCommit: string;
  completedAt: string;
  attempt: number;
  checkout: {
    path: string;
    head: string;
    detached: boolean;
    trackedCleanBefore: boolean;
    trackedCleanAfter: boolean;
  };
  dependencies: {
    bunInstall: { command: string; exitCode: number; lockSha256: string };
    python: {
      manifestSha256: string;
      archiveSha256: string;
      archiveBytes: number;
      distributions: number;
      files: number;
      extractVerified: boolean;
    };
  };
  research: { chainStatus: "not-executed"; candidate: null; prospectiveRuns: 0 };
  replay: {
    n8: { status: "pass" | "fail"; cases: number; bundleReplay: boolean };
    n10: {
      status: "pass" | "fail";
      tasks: number;
      packageChecksPassed: number;
      taskComplete: number;
      required: number;
      checkedExported: number;
      unresolved: number;
      failureSemanticsEqual: boolean;
    };
    native: {
      status: "pass" | "fail";
      attempted: number;
      executed: number;
      passed: number;
      failed: number;
      errors: number;
      skipped: number;
      loopbackHttpCalls: number;
      directPackageExecution: boolean;
    };
  };
  verification: {
    focusedTests: { exitCode: number; passed: number; failed: number };
    typecheck: { exitCode: number };
  };
  provenance: { attempt: Binding; insideReport: Binding; archiveManifest: Binding };
};

export type CurrentV2N14CleanReplayReport = {
  schemaVersion: "skill-family-current-v2-n14-clean-replay/v1";
  identity: typeof IDENTITY;
  exposure: "development-clean-replay";
  engineeringCodeCommit: string;
  researchCandidate: null;
  completedAt: string;
  attempt: number;
  checkout: CurrentV2N14ReportInput["checkout"];
  dependencies: CurrentV2N14ReportInput["dependencies"];
  research: CurrentV2N14ReportInput["research"];
  replay: CurrentV2N14ReportInput["replay"];
  verification: CurrentV2N14ReportInput["verification"];
  provenance: CurrentV2N14ReportInput["provenance"];
  decision: "passed" | "failed";
  issues: string[];
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0; nativeLoopbackHttpCalls: number };
  protectedBoundary: {
    historicalDocumentResult: "0/6-unchanged";
    heldOutReads: 0;
    q1ReservedReads: 0;
    prospectiveRuns: 0;
    historicalRunner001Or002Runs: 0;
    historicalClean002Overwritten: false;
  };
  claimLimits: string[];
  portableSemanticSha256: string;
};

function reportDigest(report: CurrentV2N14CleanReplayReport) {
  return sha(stable({ ...report, completedAt: null, checkout: { ...report.checkout, path: "<environment-path>" },
    portableSemanticSha256: null }));
}

export function buildCurrentV2N14CleanReplayReport(input: CurrentV2N14ReportInput): CurrentV2N14CleanReplayReport {
  if (!HEX_40.test(input.codeCommit) || input.checkout.head !== input.codeCommit) throw new Error("N14 engineering code commit is invalid");
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error("N14 attempt is invalid");
  if (!Number.isFinite(Date.parse(input.completedAt))) throw new Error("N14 completion time is invalid");
  if (input.research.chainStatus !== "not-executed" || input.research.candidate !== null
    || input.research.prospectiveRuns !== 0) throw new Error("N14 must not invent a research candidate");
  if (!HEX_64.test(input.dependencies.bunInstall.lockSha256)
    || !HEX_64.test(input.dependencies.python.manifestSha256)
    || input.dependencies.python.archiveSha256 !== PYTHON_ARCHIVE_SHA256
    || input.dependencies.python.archiveBytes !== 904839
    || input.dependencies.python.distributions !== 13
    || input.dependencies.python.files !== 356) throw new Error("N14 dependency binding is invalid");
  const denominators = [
    input.replay.n8.cases,
    input.replay.n10.tasks,
    input.replay.n10.packageChecksPassed,
    input.replay.n10.taskComplete,
    input.replay.n10.required,
    input.replay.n10.checkedExported,
    input.replay.n10.unresolved,
    input.replay.native.attempted,
    input.replay.native.executed,
    input.replay.native.passed,
    input.replay.native.failed,
    input.replay.native.errors,
    input.replay.native.skipped,
    input.replay.native.loopbackHttpCalls,
    input.verification.focusedTests.passed,
    input.verification.focusedTests.failed,
  ];
  if (denominators.some((value) => !Number.isInteger(value) || value < 0)
    || input.replay.n10.taskComplete > input.replay.n10.tasks
    || input.replay.n10.packageChecksPassed > input.replay.n10.tasks
    || input.replay.n10.required !== input.replay.n10.checkedExported + input.replay.n10.unresolved) {
    throw new Error("N14 denominator is invalid");
  }
  for (const binding of Object.values(input.provenance)) {
    if (!validProvenancePath(binding.path) || !HEX_64.test(binding.sha256)
      || !Number.isInteger(binding.bytes) || binding.bytes < 1) {
      throw new Error("N14 provenance path or binding is invalid");
    }
  }
  const issues: string[] = [];
  if (!input.checkout.detached || !input.checkout.trackedCleanBefore || !input.checkout.trackedCleanAfter) issues.push("clean-checkout-invalid");
  if (input.dependencies.bunInstall.exitCode !== 0 || input.dependencies.bunInstall.command !== "bun install --frozen-lockfile --offline") {
    issues.push("bun-offline-install-failed");
  }
  if (!input.dependencies.python.extractVerified) issues.push("python-offline-dependencies-unverified");
  if (input.replay.n8.status !== "pass" || input.replay.n8.cases !== 4 || !input.replay.n8.bundleReplay) issues.push("n8-replay-mismatch");
  if (input.replay.n10.status !== "pass" || input.replay.n10.tasks !== 9
    || input.replay.n10.packageChecksPassed !== 9 || !input.replay.n10.failureSemanticsEqual) issues.push("n10-replay-mismatch");
  if (input.replay.native.status !== "pass" || !input.replay.native.directPackageExecution
    || input.replay.native.attempted !== input.replay.native.executed + input.replay.native.skipped
    || input.replay.native.executed !== input.replay.native.passed + input.replay.native.failed + input.replay.native.errors
    || input.replay.native.failed !== 0 || input.replay.native.errors !== 0) issues.push("native-consumer-replay-failed");
  if (input.verification.focusedTests.exitCode !== 0 || input.verification.focusedTests.failed !== 0
    || input.verification.focusedTests.passed < 1) issues.push("focused-tests-failed");
  if (input.verification.typecheck.exitCode !== 0) issues.push("typecheck-failed");
  const base: CurrentV2N14CleanReplayReport = {
    schemaVersion: "skill-family-current-v2-n14-clean-replay/v1",
    identity: IDENTITY,
    exposure: "development-clean-replay",
    engineeringCodeCommit: input.codeCommit,
    researchCandidate: null,
    completedAt: input.completedAt,
    attempt: input.attempt,
    checkout: input.checkout,
    dependencies: input.dependencies,
    research: input.research,
    replay: input.replay,
    verification: input.verification,
    provenance: input.provenance,
    decision: issues.length === 0 ? "passed" : "failed",
    issues,
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0,
      nativeLoopbackHttpCalls: input.replay.native.loopbackHttpCalls },
    protectedBoundary: {
      historicalDocumentResult: "0/6-unchanged",
      heldOutReads: 0,
      q1ReservedReads: 0,
      prospectiveRuns: 0,
      historicalRunner001Or002Runs: 0,
      historicalClean002Overwritten: false,
    },
    claimLimits: [
      "This is an engineering clean replay, not a research candidate, prospective run, or transfer result.",
      "Synthetic loopback execution does not establish live API behavior; skipped tests are not passes.",
      "Matching task packages preserve the fixed development support contract and do not change historical 0/6 or readiness.",
    ],
    portableSemanticSha256: "",
  };
  base.portableSemanticSha256 = reportDigest(base);
  return base;
}

type CommandEvidence = {
  id: string;
  executable: string;
  arguments: string[];
  cwd: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
};

type ArchiveManifest = {
  schemaVersion: "skill-family-current-v2-n14-archive/v1";
  identity: typeof IDENTITY;
  attempt: number;
  codeCommit: string;
  root: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  totals: { files: number; bytes: number };
};

type InsideReport = {
  schemaVersion: "skill-family-current-v2-n14-inside/v1";
  identity: typeof IDENTITY;
  codeCommit: string;
  executedAt: string;
  checkout: {
    path: string;
    head: string;
    branch: string | null;
    detached: boolean;
    trackedCleanBefore: boolean;
    trackedCleanAfter: boolean;
  };
  environment: {
    platform: string;
    release: string;
    architecture: string;
    bun: string;
    node: string;
    python: string;
    pythonExecutable: string;
  };
  baselineBindings: Record<string, Binding>;
  replay: {
    n8: { status: "pass" | "fail"; cases: number; bundleReplay: boolean; semanticEqual: boolean };
    n10: {
      status: "pass" | "fail";
      tasks: number;
      packageChecksPassed: number;
      taskComplete: number;
      required: number;
      checkedExported: number;
      unresolved: number;
      failureSemanticsEqual: boolean;
      summaryEqual: boolean;
      taskComparisons: ReturnType<typeof compareCurrentV2N14TaskRows>[];
    };
    native: CurrentV2N14NativeSummary & {
      status: "pass" | "fail";
      semanticEqual: boolean;
      directPackageExecution: true;
    };
  };
  verification: {
    focusedTests: CommandEvidence & { summary: { passed: number; failed: number; assertions: number } };
    typecheck: CommandEvidence;
  };
  archiveSourceRoot: string;
  decision: "passed" | "failed";
  issues: string[];
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0; nativeLoopbackHttpCalls: number };
  protectedBoundary: {
    historicalDocumentResult: "0/6-unchanged";
    heldOutReads: 0;
    q1ReservedReads: 0;
    prospectiveRuns: 0;
    historicalRunner001Or002Runs: 0;
  };
};

const portable = (value: string) => value.replaceAll("\\", "/");

function validProvenancePath(path: string) {
  const normalized = portable(path);
  return normalized.startsWith(`${RESULT_ROOT}/clean-replay/`)
    && !isAbsolute(path) && !normalized.split("/").includes("..");
}

function safeOutside(repositoryRoot: string, path: string) {
  if (!isAbsolute(path)) return false;
  const fromRepository = relative(resolve(repositoryRoot), resolve(path));
  return isAbsolute(fromRepository) || fromRepository === ".." || fromRepository.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}

function containsPath(ancestor: string, candidate: string) {
  const fromAncestor = relative(resolve(ancestor), resolve(candidate));
  return fromAncestor === "" || (!isAbsolute(fromAncestor) && fromAncestor !== ".." && !fromAncestor.startsWith(`..${sep}`));
}

export function areCurrentV2N14ExternalPathsDisjoint(left: string, right: string) {
  return !containsPath(left, right) && !containsPath(right, left);
}

export function currentV2N14WorktreeAddArguments(checkoutRoot: string, codeCommit: string) {
  return [
    "-c", "core.autocrlf=false",
    "-c", "core.eol=lf",
    "-c", "core.longpaths=true",
    "worktree", "add", "--detach", checkoutRoot, codeCommit,
  ];
}

async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function command(options: {
  id: string;
  executable: string;
  arguments: string[];
  cwd: string;
  timeoutMs?: number;
  environment?: NodeJS.ProcessEnv;
}): Promise<CommandEvidence> {
  const started = performance.now();
  const process_ = Bun.spawn([options.executable, ...options.arguments], {
    cwd: options.cwd,
    env: options.environment ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const stdoutPromise = new Response(process_.stdout).text();
  const stderrPromise = new Response(process_.stderr).text();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<number>((resolveTimeout) => {
    timer = setTimeout(() => {
      timedOut = true;
      process_.kill();
      resolveTimeout(-1);
    }, options.timeoutMs ?? 180_000);
  });
  const exitCode = await Promise.race([process_.exited, timeout]);
  if (timer) clearTimeout(timer);
  if (timedOut) await process_.exited.catch(() => -1);
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    id: options.id,
    executable: portable(options.executable),
    arguments: options.arguments.map(portable),
    cwd: portable(options.cwd),
    exitCode,
    timedOut,
    durationMs: Number((performance.now() - started).toFixed(3)),
    stdout,
    stderr,
  };
}

function requirePassed(result: CommandEvidence) {
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`${result.id} failed (${result.exitCode}): ${result.stderr.trim()}`);
  }
  return result;
}

async function boundFile(repositoryRoot: string, path: string): Promise<Binding> {
  const bytes = new Uint8Array(await readFile(join(repositoryRoot, path)));
  return { path: portable(path), sha256: sha(bytes), bytes: bytes.byteLength };
}

async function writeExclusive(path: string, bytes: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}

function parsedTestSummary(output: string) {
  const pass = /([0-9]+) pass/u.exec(output);
  const fail = /([0-9]+) fail/u.exec(output);
  const assertions = /([0-9]+) expect\(\) calls/u.exec(output);
  return { passed: Number(pass?.[1] ?? 0), failed: Number(fail?.[1] ?? 0), assertions: Number(assertions?.[1] ?? 0) };
}

function n5Semantic(report: Record<string, any>) {
  return {
    schemaVersion: report.schemaVersion,
    identity: report.identity,
    fixtures: (report.fixtures ?? []).map((fixture: Record<string, any>) => ({
      fixtureId: fixture.fixtureId,
      sourceSha256: fixture.sourceSha256,
      taskSha256: fixture.taskSha256,
      packageSha256: fixture.packageSha256,
      fixtureSha256: fixture.fixtureSha256,
      suiteSha256: fixture.suiteSha256,
      packageCheck: fixture.packageCheck,
      taskComplete: fixture.taskComplete,
      selectedRowIds: fixture.selectedRowIds,
      oracleCheck: fixture.oracleCheck,
      junit: fixture.junit,
      requestObservations: fixture.requestObservations,
      status: fixture.status,
    })),
    faultInjection: {
      preregisteredDesign: report.faultInjection?.preregisteredDesign,
      cases: (report.faultInjection?.cases ?? []).map((row: Record<string, any>) => ({
        id: row.id,
        expectedLayer: row.expectedLayer,
        expectedMarker: row.expectedMarker,
        detectedAtExpectedLayer: row.detectedAtExpectedLayer,
      })),
      summary: report.faultInjection?.summary,
    },
    accounting: report.accounting,
    decision: report.decision,
  };
}

function n8Semantic(report: Record<string, any>) {
  return {
    schemaVersion: report.schemaVersion,
    identity: report.identity,
    supportProfile: report.supportProfile,
    command: report.command,
    bindingCommand: report.bindingCommand,
    workspace: report.workspace,
    cases: report.cases,
    bundleReplay: report.bundleReplay,
    cli: report.cli,
    legacyProductionV2: report.legacyProductionV2,
    genericDispatchScan: report.genericDispatchScan,
    relations: report.relations,
    accounting: report.accounting,
    decision: report.decision,
  };
}

async function runN10Replay(options: {
  checkoutRoot: string;
  archiveRoot: string;
  pythonExecutable: string;
}) {
  const developmentDirectory = join(options.checkoutRoot, DEVELOPMENT_ROOT);
  const [lock, baseline] = await Promise.all([
    readFile(join(options.checkoutRoot, N10_LOCK), "utf8").then((value) => JSON.parse(value) as N10DevelopmentLock),
    readFile(join(options.checkoutRoot, N10_FIRST_RUN), "utf8").then((value) => JSON.parse(value) as Record<string, any>),
  ]);
  const outputRoot = join(options.archiveRoot, "n10", "packages");
  await mkdir(outputRoot, { recursive: true });
  const rows: Array<Record<string, any>> = [];
  const comparisons: ReturnType<typeof compareCurrentV2N14TaskRows>[] = [];
  for (const lockTask of lock.tasks) {
    const outputDirectory = join(outputRoot, lockTask.taskId);
    const run = await runApiTask({
      taskPath: join(developmentDirectory, lockTask.taskPath),
      outputDirectory,
      pythonExecutable: options.pythonExecutable,
    });
    const packageBytes = new Uint8Array(await readFile(join(outputDirectory, "task-package.json")));
    const artifact = JSON.parse(new TextDecoder().decode(packageBytes)) as Record<string, any>;
    const source = lock.sources.find((row) => row.inputId === lockTask.sourceInputId);
    const row = {
      taskId: lockTask.taskId,
      provider: source?.provider ?? "unknown",
      expectedTaskComplete: lockTask.expected.taskComplete,
      runStatus: run.status,
      taskComplete: run.taskComplete,
      packageCheck: run.packageCheck.status,
      required: readN10RequiredCompletionCounts(artifact),
      nativeExecuted: Number((run.consumer as any)?.junit?.executed ?? 0),
      modificationCount: 0,
      semanticPlanSha256: artifact.plan.semanticPlanSha256,
      taskPackageSha256: sha(packageBytes),
      backend: run.backend,
      consumer: run.consumer,
      obligationResults: artifact.obligationResults,
      sourceClosureSummary: artifact.sourceClosure.summary,
      accounting: run.accounting,
    };
    rows.push(row);
    const original = baseline.tasks.find((candidate: Record<string, any>) => candidate.taskId === lockTask.taskId);
    comparisons.push(original ? compareCurrentV2N14TaskRows(original, row) : {
      taskId: lockTask.taskId,
      semanticEqual: false,
      failureSemanticsEqual: false,
      packageDigestEqual: false,
      passed: false,
    });
  }
  const relationResults = lock.comparisons.map((relation) => {
    const left = rows.find((row) => row.taskId === relation.leftTaskId);
    const right = rows.find((row) => row.taskId === relation.rightTaskId);
    return Boolean(left?.semanticPlanSha256 && right?.semanticPlanSha256
      && left.semanticPlanSha256 !== right.semanticPlanSha256
      && left.taskPackageSha256 !== right.taskPackageSha256
      && left.taskComplete && right.taskComplete);
  });
  const summaryRows: N10FirstRunSummaryRow[] = rows.map((row) => ({
    taskId: row.taskId,
    provider: row.provider,
    taskComplete: row.taskComplete,
    expectedTaskComplete: row.expectedTaskComplete,
    packageCheck: row.packageCheck,
    required: row.required,
    nativeExecuted: row.nativeExecuted,
    modificationCount: row.modificationCount,
  }));
  const summary = summarizeN10FirstRunRows({
    uniqueInputs: lock.summary.uniqueInputs,
    providers: lock.summary.providers,
    operationDenominator: lock.summary.operationDenominator,
    comparisonTotal: relationResults.length,
    comparisonPassed: relationResults.filter(Boolean).length,
    rows: summaryRows,
  });
  const report = {
    schemaVersion: "skill-family-current-v2-n14-n10-replay/v1",
    identity: IDENTITY,
    baselineSummary: baseline.summary,
    summary,
    summaryEqual: stable(summary) === stable(baseline.summary),
    taskComparisons: comparisons,
    rows,
    status: stable(summary) === stable(baseline.summary) && comparisons.every((row) => row.passed)
      ? "pass" as const : "fail" as const,
  };
  await writeExclusive(join(options.archiveRoot, "n10", "replay-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function runCurrentV2N14Inside(options: {
  checkoutRoot: string;
  outputRoot: string;
  codeCommit: string;
  pythonExecutable: string;
  executedAt?: string;
}): Promise<InsideReport> {
  if (!HEX_40.test(options.codeCommit) || !isAbsolute(options.outputRoot) || !isAbsolute(options.pythonExecutable)) {
    throw new Error("N14 inside arguments are invalid");
  }
  const gitHead = requirePassed(await command({ id: "inside-git-head", executable: "git",
    arguments: ["-c", "core.longpaths=true", "rev-parse", "HEAD"], cwd: options.checkoutRoot }));
  const gitBranch = requirePassed(await command({ id: "inside-git-branch", executable: "git",
    arguments: ["branch", "--show-current"], cwd: options.checkoutRoot }));
  const cleanBefore = requirePassed(await command({ id: "inside-git-clean-before", executable: "git",
    arguments: ["-c", "core.longpaths=true", "status", "--porcelain", "--untracked-files=no"], cwd: options.checkoutRoot }));
  const head = gitHead.stdout.trim();
  const branch = gitBranch.stdout.trim() || null;
  if (head !== options.codeCommit || branch !== null || cleanBefore.stdout.trim() !== "") {
    throw new Error("N14 checkout is not the requested clean detached commit");
  }
  const archiveRoot = join(options.outputRoot, "replay", "archive");
  await mkdir(archiveRoot, { recursive: true });
  const baselineBindings = Object.fromEntries(await Promise.all([
    N5_REPORT, N8_REPORT, N10_LOCK, N10_FIRST_RUN, PYTHON_MANIFEST, "bun.lock",
  ].map(async (path) => [path, await boundFile(options.checkoutRoot, path)])));

  const [baselineN8, baselineN5] = await Promise.all([
    readFile(join(options.checkoutRoot, N8_REPORT), "utf8").then(JSON.parse),
    readFile(join(options.checkoutRoot, N5_REPORT), "utf8").then(JSON.parse),
  ]);
  const freshN8 = await runN8EngineEvidence({ repositoryRoot: options.checkoutRoot });
  await mkdir(join(archiveRoot, "n8"), { recursive: true });
  await writeExclusive(join(archiveRoot, "n8", "replay-report.json"), `${JSON.stringify(freshN8, null, 2)}\n`);
  const n8Equal = stable(n8Semantic(freshN8)) === stable(n8Semantic(baselineN8));
  const n8 = {
    status: freshN8.decision === "passed" && n8Equal ? "pass" as const : "fail" as const,
    cases: freshN8.cases.length,
    bundleReplay: freshN8.relations.bundleReplayMatchesBindings,
    semanticEqual: n8Equal,
  };

  const n10Report = await runN10Replay({
    checkoutRoot: options.checkoutRoot,
    archiveRoot,
    pythonExecutable: options.pythonExecutable,
  });
  const n10 = {
    status: n10Report.status,
    tasks: n10Report.rows.length,
    packageChecksPassed: n10Report.rows.filter((row) => row.packageCheck === "pass").length,
    taskComplete: n10Report.summary.taskComplete,
    required: n10Report.summary.requiredObligationDenominator,
    checkedExported: n10Report.summary.checkedExportedRequiredObligations,
    unresolved: n10Report.summary.unresolvedRequiredObligations,
    failureSemanticsEqual: n10Report.taskComparisons.every((row) => row.failureSemanticsEqual),
    summaryEqual: n10Report.summaryEqual,
    taskComparisons: n10Report.taskComparisons,
  };

  const nativeRoot = join(archiveRoot, "native");
  const freshN5 = await runN5ConsumerEvidence({ outputDirectory: nativeRoot, pythonExecutable: options.pythonExecutable });
  const nativeSummary = summarizeCurrentV2N14NativeConsumer(freshN5);
  const nativeSemanticEqual = stable(n5Semantic(freshN5)) === stable(n5Semantic(baselineN5));
  const native = {
    ...nativeSummary,
    status: freshN5.decision === "passed" && nativeSemanticEqual && nativeSummary.conservation
      && nativeSummary.failed === 0 && nativeSummary.errors === 0 ? "pass" as const : "fail" as const,
    semanticEqual: nativeSemanticEqual,
    directPackageExecution: true as const,
  };

  const testEnvironment = {
    ...process.env,
    PATH: `${dirname(options.pythonExecutable)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
    PYTHONDONTWRITEBYTECODE: "1",
    PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1",
  };
  const focused = await command({
    id: "inside-focused-tests",
    executable: process.execPath,
    arguments: ["test",
      "./src/skill-ir/api-task-artifact.test.ts",
      "./src/skill-ir/api-task-run.test.ts",
      "./src/skill-ir/skill-family-current-v2-n10.test.ts",
      "./src/skill-ir/skill-family-current-v2-n14.test.ts",
      "./scripts/skill-ir/skill-family-current-v2-prospective.test.ts"],
    cwd: options.checkoutRoot,
    timeoutMs: 180_000,
    environment: testEnvironment,
  });
  const focusedSummary = parsedTestSummary(`${focused.stdout}\n${focused.stderr}`);
  const typecheck = await command({ id: "inside-typecheck", executable: process.execPath,
    arguments: ["run", "typecheck"], cwd: options.checkoutRoot, timeoutMs: 240_000 });
  const cleanAfter = requirePassed(await command({ id: "inside-git-clean-after", executable: "git",
    arguments: ["-c", "core.longpaths=true", "status", "--porcelain", "--untracked-files=no"], cwd: options.checkoutRoot }));
  const issues = [
    ...(n8.status === "pass" ? [] : ["n8-semantic-replay-mismatch"]),
    ...(n10.status === "pass" ? [] : ["n10-semantic-replay-mismatch"]),
    ...(native.status === "pass" ? [] : ["native-package-consumer-mismatch"]),
    ...(focused.exitCode === 0 && focusedSummary.failed === 0 && focusedSummary.passed > 0 ? [] : ["focused-tests-failed"]),
    ...(typecheck.exitCode === 0 ? [] : ["typecheck-failed"]),
    ...(cleanAfter.stdout.trim() === "" ? [] : ["checkout-tracked-dirty-after-replay"]),
  ];
  const python = requirePassed(await command({ id: "inside-python-version", executable: options.pythonExecutable,
    arguments: ["-X", "utf8", "-I", "-B", "-c", "import sys; print(sys.version)"], cwd: options.checkoutRoot }));
  const report: InsideReport = {
    schemaVersion: "skill-family-current-v2-n14-inside/v1",
    identity: IDENTITY,
    codeCommit: options.codeCommit,
    executedAt: options.executedAt ?? new Date().toISOString(),
    checkout: {
      path: portable(options.checkoutRoot),
      head,
      branch,
      detached: branch === null,
      trackedCleanBefore: cleanBefore.stdout.trim() === "",
      trackedCleanAfter: cleanAfter.stdout.trim() === "",
    },
    environment: {
      platform: platform(),
      release: release(),
      architecture: arch(),
      bun: Bun.version,
      node: process.version,
      python: python.stdout.trim(),
      pythonExecutable: portable(options.pythonExecutable),
    },
    baselineBindings,
    replay: { n8, n10, native },
    verification: { focusedTests: { ...focused, summary: focusedSummary }, typecheck },
    archiveSourceRoot: portable(archiveRoot),
    decision: issues.length === 0 ? "passed" : "failed",
    issues,
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0,
      nativeLoopbackHttpCalls: native.loopbackHttpCalls },
    protectedBoundary: {
      historicalDocumentResult: "0/6-unchanged",
      heldOutReads: 0,
      q1ReservedReads: 0,
      prospectiveRuns: 0,
      historicalRunner001Or002Runs: 0,
    },
  };
  await writeExclusive(join(options.outputRoot, "replay", "inside-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function treeFiles(root: string) {
  const files: Array<{ path: string; source: string; bytes: number; sha256: string }> = [];
  async function visit(relativePath: string) {
    const full = join(root, relativePath);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error("N14 archive source contains a link");
    if (info.isDirectory()) {
      for (const child of (await readdir(full)).sort()) await visit(relativePath ? join(relativePath, child) : child);
      return;
    }
    if (!info.isFile()) throw new Error("N14 archive source contains a non-regular entry");
    const bytes = new Uint8Array(await readFile(full));
    files.push({ path: portable(relativePath), source: full, bytes: bytes.byteLength, sha256: sha(bytes) });
  }
  await visit("");
  return files;
}

async function copyArchive(sourceRoot: string, destinationRoot: string) {
  if (await exists(destinationRoot)) throw new Error("N14 archive destination already exists");
  const files = await treeFiles(sourceRoot);
  for (const file of files) {
    const destination = join(destinationRoot, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file.source, destination, 1);
  }
  const copied = await treeFiles(destinationRoot);
  if (stable(files.map(({ source: _, ...file }) => file)) !== stable(copied.map(({ source: _, ...file }) => file))) {
    throw new Error("N14 archive copy changed file bytes");
  }
  return copied.map(({ source: _, ...file }) => file);
}

function commandSummary(result: CommandEvidence) {
  return { id: result.id, executable: result.executable, arguments: result.arguments, cwd: result.cwd,
    exitCode: result.exitCode, timedOut: result.timedOut, durationMs: result.durationMs,
    stdout: result.stdout, stderr: result.stderr };
}

export async function runCurrentV2N14CleanReplay(options: {
  repositoryRoot: string;
  codeCommit: string;
  checkoutRoot: string;
  outputRoot: string;
  pythonBaseExecutable: string;
  pythonArchive: string;
  attempt: number;
  completedAt?: string;
}) {
  if (!HEX_40.test(options.codeCommit) || !Number.isInteger(options.attempt) || options.attempt < 1
    || !safeOutside(options.repositoryRoot, options.checkoutRoot) || !safeOutside(options.repositoryRoot, options.outputRoot)
    || !areCurrentV2N14ExternalPathsDisjoint(options.checkoutRoot, options.outputRoot)
    || !isAbsolute(options.pythonBaseExecutable) || !isAbsolute(options.pythonArchive)) {
    throw new Error("N14 preparation arguments are invalid");
  }
  const resultRoot = join(options.repositoryRoot, RESULT_ROOT, "clean-replay");
  await mkdir(resultRoot, { recursive: true });
  const attemptName = String(options.attempt).padStart(3, "0");
  const attemptRelative = `${RESULT_ROOT}/clean-replay/attempt-${attemptName}.json`;
  const attemptPath = join(options.repositoryRoot, attemptRelative);
  if (await exists(attemptPath)) throw new Error(`N14 attempt ${attemptName} already exists`);
  const commands: CommandEvidence[] = [];
  let inside: InsideReport | null = null;
  let insideBinding: Binding | null = null;
  let archiveBinding: Binding | null = null;
  try {
    if (await exists(options.checkoutRoot)) throw new Error("N14 checkout path already exists");
    if (await exists(options.outputRoot)) throw new Error("N14 output path already exists");
    const checkoutAdd = await command({ id: "worktree-add", executable: "git",
      arguments: currentV2N14WorktreeAddArguments(options.checkoutRoot, options.codeCommit), cwd: options.repositoryRoot });
    commands.push(checkoutAdd);
    requirePassed(checkoutAdd);
    await mkdir(options.outputRoot, { recursive: false });

    const head = await command({ id: "checkout-head", executable: "git",
      arguments: ["-c", "core.longpaths=true", "rev-parse", "HEAD"], cwd: options.checkoutRoot });
    commands.push(head);
    requirePassed(head);
    if (head.stdout.trim() !== options.codeCommit) throw new Error("N14 detached checkout HEAD mismatch");
    const branch = await command({ id: "checkout-branch", executable: "git",
      arguments: ["branch", "--show-current"], cwd: options.checkoutRoot });
    commands.push(branch);
    requirePassed(branch);
    if (branch.stdout.trim() !== "") throw new Error("N14 checkout is not detached");
    const cleanBefore = await command({ id: "checkout-clean-before", executable: "git",
      arguments: ["-c", "core.longpaths=true", "status", "--porcelain", "--untracked-files=no"], cwd: options.checkoutRoot });
    commands.push(cleanBefore);
    requirePassed(cleanBefore);
    if (cleanBefore.stdout.trim() !== "") throw new Error("N14 checkout is dirty before setup");

    for (const path of [N5_REPORT, N8_REPORT, N10_LOCK, N10_FIRST_RUN, PYTHON_MANIFEST, "bun.lock"]) {
      const [checkoutBytes, committedBytes] = await Promise.all([
        readFile(join(options.checkoutRoot, path)).then((value) => new Uint8Array(value)),
        gitFileBytes(options.repositoryRoot, options.codeCommit, path),
      ]);
      if (sha(checkoutBytes) !== sha(committedBytes) || checkoutBytes.byteLength !== committedBytes.byteLength) {
        throw new Error(`N14 checkout bytes differ from the bound commit: ${path}`);
      }
    }

    const manifestBytes = new Uint8Array(await readFile(join(options.checkoutRoot, PYTHON_MANIFEST)));
    const pythonManifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<string, any>;
    const archiveBytes = new Uint8Array(await readFile(options.pythonArchive));
    const pythonBytes = new Uint8Array(await readFile(options.pythonBaseExecutable));
    if (sha(archiveBytes) !== PYTHON_ARCHIVE_SHA256 || archiveBytes.byteLength !== 904839
      || pythonManifest.archive?.sha256 !== PYTHON_ARCHIVE_SHA256
      || pythonManifest.archive?.bytes !== archiveBytes.byteLength
      || pythonManifest.runtime?.executableSha256 !== sha(pythonBytes)
      || pythonManifest.distributions?.length !== 13 || pythonManifest.files?.length !== 356) {
      throw new Error("N14 external Python dependency binding mismatch");
    }
    const lockBytes = new Uint8Array(await readFile(join(options.checkoutRoot, "bun.lock")));
    const bunInstall = await command({ id: "bun-offline-install", executable: process.execPath,
      arguments: ["install", "--frozen-lockfile", "--offline"], cwd: options.checkoutRoot, timeoutMs: 180_000 });
    commands.push(bunInstall);
    requirePassed(bunInstall);

    const venvRoot = join(options.outputRoot, "venv");
    const venv = await command({ id: "python-venv", executable: options.pythonBaseExecutable,
      arguments: ["-X", "utf8", "-I", "-B", "-m", "venv", "--without-pip", venvRoot],
      cwd: options.checkoutRoot, timeoutMs: 120_000 });
    commands.push(venv);
    requirePassed(venv);
    const venvPython = process.platform === "win32" ? join(venvRoot, "Scripts", "python.exe") : join(venvRoot, "bin", "python");
    const sitePackages = process.platform === "win32" ? join(venvRoot, "Lib", "site-packages")
      : join(venvRoot, "lib", `python${pythonManifest.runtime.markerEnvironment.python_version}`, "site-packages");
    const dependencyScript = join(options.checkoutRoot, "scripts", "skill-ir", "python_offline_dependencies.py");
    const manifestPath = join(options.checkoutRoot, PYTHON_MANIFEST);
    const extract = await command({ id: "python-extract", executable: options.pythonBaseExecutable,
      arguments: ["-X", "utf8", "-I", "-B", dependencyScript, "extract", "--manifest", manifestPath,
        "--archive", options.pythonArchive, "--target", sitePackages], cwd: options.checkoutRoot, timeoutMs: 120_000 });
    commands.push(extract);
    requirePassed(extract);
    const verify = await command({ id: "python-verify", executable: venvPython,
      arguments: ["-X", "utf8", "-I", "-B", dependencyScript, "verify", "--manifest", manifestPath,
        "--target", sitePackages], cwd: options.checkoutRoot, timeoutMs: 120_000 });
    commands.push(verify);
    requirePassed(verify);

    const insideCommand = await command({ id: "inside-replay", executable: process.execPath,
      arguments: ["./scripts/skill-ir/skill-family-current-v2-clean-replay.ts", "--mode=inside",
        `--output=${options.outputRoot}`, `--code-commit=${options.codeCommit}`, `--python=${venvPython}`],
      cwd: options.checkoutRoot, timeoutMs: 600_000,
      environment: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1" } });
    commands.push(insideCommand);
    requirePassed(insideCommand);
    const insideSourcePath = join(options.outputRoot, "replay", "inside-report.json");
    const insideSourceBytes = new Uint8Array(await readFile(insideSourcePath));
    inside = JSON.parse(new TextDecoder().decode(insideSourceBytes)) as InsideReport;
    if (inside.decision !== "passed" || inside.codeCommit !== options.codeCommit) {
      throw new Error(`N14 inside replay failed: ${inside.issues.join("; ")}`);
    }
    const cleanAfter = await command({ id: "checkout-clean-after", executable: "git",
      arguments: ["-c", "core.longpaths=true", "status", "--porcelain", "--untracked-files=no"], cwd: options.checkoutRoot });
    commands.push(cleanAfter);
    requirePassed(cleanAfter);
    if (cleanAfter.stdout.trim() !== "") throw new Error("N14 checkout is dirty after replay");

    const insideRelative = `${RESULT_ROOT}/clean-replay/cache/inside-report-attempt-${attemptName}.json`;
    const insidePath = join(options.repositoryRoot, insideRelative);
    await writeExclusive(insidePath, insideSourceBytes);
    insideBinding = { path: insideRelative, sha256: sha(insideSourceBytes), bytes: insideSourceBytes.byteLength };

    const archiveRelative = `${RESULT_ROOT}/clean-replay/archive/attempt-${attemptName}`;
    const archiveRoot = join(options.repositoryRoot, archiveRelative);
    const archivedFiles = await copyArchive(join(options.outputRoot, "replay", "archive"), archiveRoot);
    const archiveManifest: ArchiveManifest = {
      schemaVersion: "skill-family-current-v2-n14-archive/v1",
      identity: IDENTITY,
      attempt: options.attempt,
      codeCommit: options.codeCommit,
      root: archiveRelative,
      files: archivedFiles,
      totals: { files: archivedFiles.length, bytes: archivedFiles.reduce((total, file) => total + file.bytes, 0) },
    };
    const archiveManifestRelative = `${RESULT_ROOT}/clean-replay/archive-manifest-attempt-${attemptName}.json`;
    const archiveManifestPath = join(options.repositoryRoot, archiveManifestRelative);
    const archiveManifestBytes = new TextEncoder().encode(`${JSON.stringify(archiveManifest, null, 2)}\n`);
    await writeExclusive(archiveManifestPath, archiveManifestBytes);
    archiveBinding = { path: archiveManifestRelative, sha256: sha(archiveManifestBytes), bytes: archiveManifestBytes.byteLength };

    const attempt = {
      schemaVersion: "skill-family-current-v2-n14-attempt/v1",
      identity: IDENTITY,
      attempt: options.attempt,
      codeCommit: options.codeCommit,
      status: "passed",
      completedAt: options.completedAt ?? new Date().toISOString(),
      checkout: { path: portable(options.checkoutRoot), outputRoot: portable(options.outputRoot), detached: true },
      commands: commands.map(commandSummary),
      dependencies: {
        bunLock: { path: "bun.lock", sha256: sha(lockBytes), bytes: lockBytes.byteLength },
        pythonManifest: { path: PYTHON_MANIFEST, sha256: sha(manifestBytes), bytes: manifestBytes.byteLength },
        pythonArchive: { path: portable(options.pythonArchive), sha256: sha(archiveBytes), bytes: archiveBytes.byteLength },
        pythonBase: { path: portable(options.pythonBaseExecutable), sha256: sha(pythonBytes), bytes: pythonBytes.byteLength },
      },
      insideReport: insideBinding,
      archiveManifest: archiveBinding,
      researchCandidate: null,
      protectedReads: 0,
      historicalRunner001Or002Runs: 0,
    };
    const attemptBytes = new TextEncoder().encode(`${JSON.stringify(attempt, null, 2)}\n`);
    const attemptBinding = { path: attemptRelative, sha256: sha(attemptBytes), bytes: attemptBytes.byteLength };
    const final = buildCurrentV2N14CleanReplayReport({
      codeCommit: options.codeCommit,
      completedAt: attempt.completedAt,
      attempt: options.attempt,
      checkout: inside.checkout,
      dependencies: {
        bunInstall: { command: "bun install --frozen-lockfile --offline", exitCode: bunInstall.exitCode, lockSha256: sha(lockBytes) },
        python: { manifestSha256: sha(manifestBytes), archiveSha256: sha(archiveBytes), archiveBytes: archiveBytes.byteLength,
          distributions: pythonManifest.distributions.length, files: pythonManifest.files.length, extractVerified: verify.exitCode === 0 },
      },
      research: { chainStatus: "not-executed", candidate: null, prospectiveRuns: 0 },
      replay: {
        n8: { status: inside.replay.n8.status, cases: inside.replay.n8.cases, bundleReplay: inside.replay.n8.bundleReplay },
        n10: { status: inside.replay.n10.status, tasks: inside.replay.n10.tasks,
          packageChecksPassed: inside.replay.n10.packageChecksPassed, taskComplete: inside.replay.n10.taskComplete,
          required: inside.replay.n10.required, checkedExported: inside.replay.n10.checkedExported,
          unresolved: inside.replay.n10.unresolved, failureSemanticsEqual: inside.replay.n10.failureSemanticsEqual },
        native: { status: inside.replay.native.status, attempted: inside.replay.native.attempted,
          executed: inside.replay.native.executed, passed: inside.replay.native.passed,
          failed: inside.replay.native.failed, errors: inside.replay.native.errors, skipped: inside.replay.native.skipped,
          loopbackHttpCalls: inside.replay.native.loopbackHttpCalls, directPackageExecution: true },
      },
      verification: {
        focusedTests: { exitCode: inside.verification.focusedTests.exitCode,
          passed: inside.verification.focusedTests.summary.passed, failed: inside.verification.focusedTests.summary.failed },
        typecheck: { exitCode: inside.verification.typecheck.exitCode },
      },
      provenance: { attempt: attemptBinding, insideReport: insideBinding, archiveManifest: archiveBinding },
    });
    if (final.decision !== "passed") throw new Error(`N14 final report failed: ${final.issues.join("; ")}`);
    await writeExclusive(attemptPath, attemptBytes);
    const reportRelative = `${RESULT_ROOT}/clean-replay/report.json`;
    const reportPath = join(options.repositoryRoot, reportRelative);
    const reportBytes = new TextEncoder().encode(`${JSON.stringify(final, null, 2)}\n`);
    await writeExclusive(reportPath, reportBytes);
    return {
      outcome: "passed" as const,
      report: final,
      files: [attemptBinding, insideBinding, archiveBinding,
        { path: reportRelative, sha256: sha(reportBytes), bytes: reportBytes.byteLength }],
      archivedFiles: archiveManifest.totals,
    };
  } catch (error) {
    const failure = {
      schemaVersion: "skill-family-current-v2-n14-attempt/v1",
      identity: IDENTITY,
      attempt: options.attempt,
      codeCommit: options.codeCommit,
      status: "failed",
      completedAt: options.completedAt ?? new Date().toISOString(),
      checkout: { path: portable(options.checkoutRoot), outputRoot: portable(options.outputRoot) },
      commands: commands.map(commandSummary),
      error: error instanceof Error ? error.message : String(error),
      insideDecision: inside?.decision ?? null,
      insideReport: insideBinding,
      archiveManifest: archiveBinding,
      researchCandidate: null,
      protectedReads: 0,
      historicalRunner001Or002Runs: 0,
    };
    const bytes = new TextEncoder().encode(`${JSON.stringify(failure, null, 2)}\n`);
    await writeExclusive(attemptPath, bytes);
    return {
      outcome: "failed" as const,
      report: null,
      files: [{ path: attemptRelative, sha256: sha(bytes), bytes: bytes.byteLength }],
      issues: [failure.error],
    };
  }
}

export async function preserveCurrentV2N14UnverifiedReport(options: {
  repositoryRoot: string;
  report: CurrentV2N14CleanReplayReport;
  verificationErrors: string[];
  observedAt?: string;
}) {
  if (!Number.isInteger(options.report.attempt) || options.report.attempt < 1
    || options.verificationErrors.length < 1 || options.verificationErrors.some((error) => !error)) {
    throw new Error("N14 unverified report preservation input is invalid");
  }
  const attemptName = String(options.report.attempt).padStart(3, "0");
  const sourceRelative = `${RESULT_ROOT}/clean-replay/report.json`;
  const sourcePath = join(options.repositoryRoot, sourceRelative);
  const sourceBytes = new Uint8Array(await readFile(sourcePath));
  const sourceSha256 = sha(sourceBytes);
  const archiveRelative = `${RESULT_ROOT}/clean-replay/unverified-report-attempt-${attemptName}.json`;
  const archivePath = join(options.repositoryRoot, archiveRelative);
  if (await exists(archivePath)) {
    const archivedBytes = new Uint8Array(await readFile(archivePath));
    if (sha(archivedBytes) !== sourceSha256 || archivedBytes.byteLength !== sourceBytes.byteLength) {
      throw new Error("N14 existing unverified report archive differs from report.json");
    }
  } else {
    await copyFile(sourcePath, archivePath, 1);
  }
  const archivedBytes = new Uint8Array(await readFile(archivePath));
  if (sha(archivedBytes) !== sourceSha256 || archivedBytes.byteLength !== sourceBytes.byteLength) {
    throw new Error("N14 unverified report archive changed bytes");
  }
  const failureRelative = `${RESULT_ROOT}/clean-replay/verification-failure-attempt-${attemptName}.json`;
  const failurePath = join(options.repositoryRoot, failureRelative);
  let failureBytes: Uint8Array;
  if (await exists(failurePath)) {
    failureBytes = new Uint8Array(await readFile(failurePath));
    const failure = JSON.parse(new TextDecoder().decode(failureBytes)) as Record<string, any>;
    if (failure.report?.sha256 !== sourceSha256 || failure.report?.bytes !== sourceBytes.byteLength
      || stable(failure.verificationErrors) !== stable([...options.verificationErrors].sort())) {
      throw new Error("N14 existing verification failure record differs from observed failure");
    }
  } else {
    const failure = {
      schemaVersion: "skill-family-current-v2-n14-verification-failure/v1",
      identity: IDENTITY,
      exposure: "development-clean-replay",
      attempt: options.report.attempt,
      engineeringCodeCommit: options.report.engineeringCodeCommit,
      observedAt: options.observedAt ?? new Date().toISOString(),
      failedLayer: "strict-package-binding-verifier",
      report: { originalPath: sourceRelative, archivedPath: archiveRelative,
        sha256: sourceSha256, bytes: sourceBytes.byteLength },
      verificationErrors: [...options.verificationErrors].sort(),
      decision: "failed",
      claimLimits: [
        "The internal replay reported passed, but N14 did not pass because independent strict verification failed.",
        "This record preserves the failure and does not authorize treating attempt 1 as clean-replay evidence.",
      ],
    };
    failureBytes = new TextEncoder().encode(`${JSON.stringify(failure, null, 2)}\n`);
    await writeExclusive(failurePath, failureBytes);
  }
  await unlink(sourcePath);
  return {
    report: { path: archiveRelative, sha256: sourceSha256, bytes: sourceBytes.byteLength },
    failure: { path: failureRelative, sha256: sha(failureBytes), bytes: failureBytes.byteLength },
  };
}

async function gitFileBytes(repositoryRoot: string, commit: string, path: string) {
  const process_ = Bun.spawn(["git", "show", `${commit}:${path}`], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [buffer, stderr, exitCode] = await Promise.all([
    new Response(process_.stdout).arrayBuffer(), new Response(process_.stderr).text(), process_.exited,
  ]);
  if (exitCode !== 0) throw new Error(`N14 cannot read ${path} from ${commit}: ${stderr.trim()}`);
  return new Uint8Array(buffer);
}

export async function verifyCurrentV2N14CleanReplay(options: {
  repositoryRoot: string;
  report: CurrentV2N14CleanReplayReport;
}) {
  const errors = new Set<string>();
  let attempt: Record<string, any> | null = null;
  let inside: InsideReport | null = null;
  let manifest: ArchiveManifest | null = null;
  for (const [name, binding] of Object.entries(options.report.provenance)) {
    if (!validProvenancePath(binding.path)) {
      errors.add(`N14_${name.toUpperCase()}_PATH_INVALID`);
      continue;
    }
    try {
      const bytes = new Uint8Array(await readFile(join(options.repositoryRoot, binding.path)));
      if (sha(bytes) !== binding.sha256 || bytes.byteLength !== binding.bytes) errors.add(`N14_${name.toUpperCase()}_BINDING_MISMATCH`);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (name === "attempt") attempt = parsed;
      else if (name === "insideReport") inside = parsed;
      else if (name === "archiveManifest") manifest = parsed;
    } catch {
      errors.add(`N14_${name.toUpperCase()}_UNREADABLE`);
    }
  }
  if (!attempt || attempt.schemaVersion !== "skill-family-current-v2-n14-attempt/v1"
    || attempt.status !== "passed" || attempt.codeCommit !== options.report.engineeringCodeCommit
    || attempt.attempt !== options.report.attempt || attempt.completedAt !== options.report.completedAt
    || attempt.researchCandidate !== null || attempt.protectedReads !== 0 || attempt.historicalRunner001Or002Runs !== 0) {
    errors.add("N14_ATTEMPT_INVALID");
  } else {
    const commands = new Map((attempt.commands ?? []).map((row: Record<string, any>) => [row.id, row]));
    for (const id of ["worktree-add", "checkout-clean-before", "bun-offline-install", "python-venv",
      "python-extract", "python-verify", "inside-replay", "checkout-clean-after"]) {
      const row = commands.get(id) as Record<string, any> | undefined;
      if (!row || row.exitCode !== 0 || row.timedOut !== false) errors.add(`N14_COMMAND_INVALID:${id}`);
    }
    const bun = commands.get("bun-offline-install") as Record<string, any> | undefined;
    if (!bun || stable(bun.arguments) !== stable(["install", "--frozen-lockfile", "--offline"])) {
      errors.add("N14_BUN_INSTALL_NOT_OFFLINE_LOCKED");
    }
    if (stable(attempt.insideReport) !== stable(options.report.provenance.insideReport)
      || stable(attempt.archiveManifest) !== stable(options.report.provenance.archiveManifest)) {
      errors.add("N14_ATTEMPT_PROVENANCE_MISMATCH");
    }
    const dependencies = attempt.dependencies as Record<string, any> | undefined;
    if (!dependencies
      || dependencies.bunLock?.sha256 !== options.report.dependencies.bunInstall.lockSha256
      || dependencies.pythonManifest?.sha256 !== options.report.dependencies.python.manifestSha256
      || dependencies.pythonArchive?.sha256 !== options.report.dependencies.python.archiveSha256
      || dependencies.pythonArchive?.bytes !== options.report.dependencies.python.archiveBytes) {
      errors.add("N14_ATTEMPT_DEPENDENCY_MISMATCH");
    }
  }
  if (!inside || inside.schemaVersion !== "skill-family-current-v2-n14-inside/v1"
    || inside.codeCommit !== options.report.engineeringCodeCommit || inside.decision !== "passed"
    || inside.checkout.head !== options.report.engineeringCodeCommit || !inside.checkout.detached
    || !inside.checkout.trackedCleanBefore || !inside.checkout.trackedCleanAfter
    || stable(inside.checkout) !== stable(options.report.checkout)) {
    errors.add("N14_INSIDE_REPORT_INVALID");
  } else {
    for (const binding of Object.values(inside.baselineBindings)) {
      try {
        const bytes = await gitFileBytes(options.repositoryRoot, options.report.engineeringCodeCommit, binding.path);
        if (sha(bytes) !== binding.sha256 || bytes.byteLength !== binding.bytes) errors.add(`N14_BASELINE_BINDING_MISMATCH:${binding.path}`);
      } catch {
        errors.add(`N14_BASELINE_UNREADABLE:${binding.path}`);
      }
    }
    const replaySummary = {
      n8: { status: inside.replay.n8.status, cases: inside.replay.n8.cases, bundleReplay: inside.replay.n8.bundleReplay },
      n10: { status: inside.replay.n10.status, tasks: inside.replay.n10.tasks,
        packageChecksPassed: inside.replay.n10.packageChecksPassed, taskComplete: inside.replay.n10.taskComplete,
        required: inside.replay.n10.required, checkedExported: inside.replay.n10.checkedExported,
        unresolved: inside.replay.n10.unresolved, failureSemanticsEqual: inside.replay.n10.failureSemanticsEqual },
      native: { status: inside.replay.native.status, attempted: inside.replay.native.attempted,
        executed: inside.replay.native.executed, passed: inside.replay.native.passed,
        failed: inside.replay.native.failed, errors: inside.replay.native.errors, skipped: inside.replay.native.skipped,
        loopbackHttpCalls: inside.replay.native.loopbackHttpCalls,
        directPackageExecution: inside.replay.native.directPackageExecution },
    };
    const verificationSummary = {
      focusedTests: { exitCode: inside.verification.focusedTests.exitCode,
        passed: inside.verification.focusedTests.summary.passed, failed: inside.verification.focusedTests.summary.failed },
      typecheck: { exitCode: inside.verification.typecheck.exitCode },
    };
    if (stable(replaySummary) !== stable(options.report.replay)
      || stable(verificationSummary) !== stable(options.report.verification)
      || !inside.replay.n8.semanticEqual || !inside.replay.n10.summaryEqual
      || !inside.replay.n10.taskComparisons.every((row) => row.passed)
      || !inside.replay.native.semanticEqual || !inside.replay.native.conservation
      || inside.accounting.sourceApiCalls !== 0 || inside.accounting.businessApiCalls !== 0
      || inside.accounting.modelCalls !== 0 || inside.accounting.paidCalls !== 0
      || inside.protectedBoundary.heldOutReads !== 0 || inside.protectedBoundary.q1ReservedReads !== 0
      || inside.protectedBoundary.prospectiveRuns !== 0
      || inside.protectedBoundary.historicalRunner001Or002Runs !== 0) {
      errors.add("N14_INSIDE_SUMMARY_MISMATCH");
    }
  }
  const expectedArchiveRoot = `${RESULT_ROOT}/clean-replay/archive/attempt-${String(options.report.attempt).padStart(3, "0")}`;
  if (!manifest || manifest.schemaVersion !== "skill-family-current-v2-n14-archive/v1"
    || manifest.codeCommit !== options.report.engineeringCodeCommit || manifest.attempt !== options.report.attempt
    || portable(manifest.root) !== expectedArchiveRoot || isAbsolute(manifest.root)
    || portable(manifest.root).split("/").includes("..") || manifest.files.length !== manifest.totals.files
    || manifest.files.reduce((total, file) => total + file.bytes, 0) !== manifest.totals.bytes) {
    errors.add("N14_ARCHIVE_MANIFEST_INVALID");
  } else {
    const paths = new Set<string>();
    for (const file of manifest.files) {
      if (!file.path || isAbsolute(file.path) || file.path.split(/[\\/]+/u).includes("..") || paths.has(file.path)) {
        errors.add("N14_ARCHIVE_PATH_INVALID");
        continue;
      }
      paths.add(file.path);
      try {
        const bytes = new Uint8Array(await readFile(join(options.repositoryRoot, manifest.root, file.path)));
        if (sha(bytes) !== file.sha256 || bytes.byteLength !== file.bytes) errors.add(`N14_ARCHIVE_FILE_MISMATCH:${file.path}`);
      } catch {
        errors.add(`N14_ARCHIVE_FILE_UNREADABLE:${file.path}`);
      }
    }
    for (const required of ["n8/replay-report.json", "n10/replay-report.json", "native/consumer-report.json"]) {
      if (!paths.has(required)) errors.add(`N14_ARCHIVE_REQUIRED_FILE_MISSING:${required}`);
    }
    if ([...paths].filter((path) => path.endsWith("task-package.json")).length < 11
      || [...paths].filter((path) => path.endsWith("pytest.junit.xml")).length < 2) {
      errors.add("N14_ARCHIVE_PACKAGE_DENOMINATOR_INVALID");
    }
  }
  try {
    const rebuilt = buildCurrentV2N14CleanReplayReport({
      codeCommit: options.report.engineeringCodeCommit,
      completedAt: options.report.completedAt,
      attempt: options.report.attempt,
      checkout: options.report.checkout,
      dependencies: options.report.dependencies,
      research: options.report.research,
      replay: options.report.replay,
      verification: options.report.verification,
      provenance: options.report.provenance,
    });
    if (stable(rebuilt) !== stable(options.report)) errors.add("N14_REPORT_RECOMPUTATION_MISMATCH");
  } catch {
    errors.add("N14_REPORT_RECOMPUTATION_FAILED");
  }
  return { status: errors.size === 0 ? "pass" as const : "fail" as const, errors: [...errors].sort() };
}
