import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { currentV2LoopbackFixtures, type CurrentV2LoopbackFixture } from "./skill-family-current-v2-n5";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";
const TOOL_VERSION = "4.27.0" as const;
const INPUT_PATHS = [
  `${RESULT_ROOT}/integration/consumer-report.json`,
  `${RESULT_ROOT}/integration/engine-report.json`,
  `${RESULT_ROOT}/development/first-run.json`,
] as const;
const CHECKS = [
  "not_a_server_error",
  "status_code_conformance",
  "content_type_conformance",
  "response_headers_conformance",
  "response_schema_conformance",
  "negative_data_rejection",
  "positive_data_acceptance",
] as const;
type CheckName = typeof CHECKS[number];
type FaultId = "undocumented-status" | "missing-response-header" | "invalid-response-body";
type Binding = { path: string; sha256: string; bytes: number; commit?: string };

export type CurrentV2AddedValueEvidence = {
  traceability: {
    requiredObligations: number;
    locatedObligations: number;
    checkedExported: number;
    unresolved: number;
    packageChecksPassed: number;
    allRequiredObligationsLocated: boolean;
  };
  sameSourceTaskDelta: {
    sourceInputId: string;
    taskIds: string[];
    semanticPlansDiffer: boolean;
    requiredOutcomesDiffer: boolean;
    constructedCounts: number[];
  };
  replay: {
    bundleReplayMatchesBindings: boolean;
    documentedCliExecuted: boolean;
    repositoryAgnosticDispatch: boolean;
  };
  partialOutput: { incompleteTasks: number; locatedReasons: number; distinctReasons: string[] };
  modelCalls: number;
};

type ExternalObservation = {
  method: string;
  target: string;
  contentType: string;
  traceHeader: string;
  body: string;
  fixturePredicateValid: boolean;
  responseStatus: number;
  faultApplied: boolean;
};

type SchemathesisRun = {
  scenarioId: string;
  fixtureId: string;
  faultId: FaultId | null;
  expectedCheck: CheckName | null;
  commandTemplate: string[];
  durationMs: number;
  exitCode: number;
  timedOut: boolean;
  requestBudget: number;
  requestCount: number;
  uniqueWireRequests: number;
  validFixtureRequests: number;
  operationHit: boolean;
  budgetExceeded: boolean;
  faultAppliedCount: number;
  failureChecks: CheckName[];
  expectedCheckDetected: boolean | null;
  observations: ExternalObservation[];
  rawBindings: Binding[];
};

export type CurrentV2N13ToolBaseline = {
  schemaVersion: "skill-family-current-v2-n13-tool-baseline/v1";
  identity: typeof IDENTITY;
  exposure: "synthetic-development-comparison";
  codeCommit: string;
  executedAt: string;
  tool: {
    name: "Schemathesis";
    requiredVersion: typeof TOOL_VERSION;
    actualVersion: string;
    executableName: string;
    pythonVersion: string;
    versionBinding: Binding;
    helpBinding: Binding;
    dependencyFreezeBinding: Binding;
    requiredHelpOptionsPresent: boolean;
  };
  contract: {
    fixtureIds: ["json-reference", "form-wire"];
    sourceSha256: Record<string, string>;
    phase: "fuzzing";
    mode: "positive";
    maxExamplesPerOperation: 2;
    workers: 1;
    requestTimeoutSeconds: 5;
    maxTimeSeconds: 30;
    requestRetries: 0;
    seed: 20260912;
    deterministic: true;
    uniqueInputs: true;
    database: "none";
    checks: CheckName[];
  };
  skvmBaseline: {
    sourceReport: Binding;
    fixtures: Array<{
      fixtureId: string;
      sourceSha256: string;
      requestCount: number;
      uniqueWireRequests: number;
      executed: number;
      passed: number;
      durationMs: null;
    }>;
    timingNote: string;
  };
  runs: SchemathesisRun[];
  summary: {
    baselineRuns: number;
    baselinePassed: number;
    baselineRequests: number;
    baselineUniqueWireRequests: number;
    baselineValidFixtureRequests: number;
    faultInjections: number;
    correctlyDetectedFaults: number;
    missedFaults: number;
    notApplicableFaults: number;
    actualLoopbackHttpCalls: number;
  };
  accounting: {
    sourceApiCalls: 0;
    businessApiCalls: 0;
    modelCalls: 0;
    paidCalls: 0;
    loopbackHttpCalls: number;
    dependencyDownloadRequests: "not-measured";
  };
  claimLimits: string[];
};

export type CurrentV2N13Report = {
  schemaVersion: "skill-family-current-v2-n13-comparison/v1";
  identity: typeof IDENTITY;
  exposure: "development";
  evaluatedAt: string;
  codeCommit: string;
  inputBindings: Binding[];
  toolBaselineBinding: Binding;
  addedValueBinding: Binding;
  addedValueEvidence: CurrentV2AddedValueEvidence;
  summary: CurrentV2N13ToolBaseline["summary"];
  decision: "completed" | "completed-with-limitation";
  issues: string[];
  nextTask: "N4";
  accounting: CurrentV2N13ToolBaseline["accounting"];
  claimLimits: string[];
};

const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stable = (value: unknown) => JSON.stringify(canonical(value));
const portable = (path: string) => path.replaceAll("\\", "/");

async function git(repositoryRoot: string, arguments_: string[]) {
  const process = Bun.spawn(["git", ...arguments_], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout: new Uint8Array(stdout), stderr, exitCode };
}

async function committedBytes(repositoryRoot: string, commit: string, path: string) {
  const result = await git(repositoryRoot, ["show", `${commit}:${path}`]);
  if (result.exitCode !== 0) throw new Error(`N13 cannot read ${path} at ${commit}: ${result.stderr.trim()}`);
  return result.stdout;
}

async function committedJson(repositoryRoot: string, commit: string | undefined, path: string) {
  if (commit) return JSON.parse(new TextDecoder().decode(await committedBytes(repositoryRoot, commit, path)));
  return JSON.parse(await readFile(join(repositoryRoot, path), "utf8"));
}

async function bindingForFile(repositoryRoot: string, absolutePath: string): Promise<Binding> {
  const bytes = new Uint8Array(await readFile(absolutePath));
  return { path: portable(relative(repositoryRoot, absolutePath)), sha256: sha(bytes), bytes: bytes.byteLength };
}

async function committedBinding(repositoryRoot: string, commit: string, path: string): Promise<Binding> {
  const bytes = await committedBytes(repositoryRoot, commit, path);
  return { path, commit, sha256: sha(bytes), bytes: bytes.byteLength };
}

async function writeExclusive(path: string, value: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { flag: "wx" });
}

export function createCurrentV2SchemathesisArguments(options: {
  sourcePath: string;
  baseUrl: string;
  reportDirectory: string;
}): string[] {
  return [
    "run",
    options.sourcePath,
    `--url=${options.baseUrl}`,
    "--workers=1",
    "--max-time=30",
    "--phases=fuzzing",
    `--checks=${CHECKS.join(",")}`,
    "--request-timeout=5",
    "--request-retries=0",
    "--mode=positive",
    "--max-examples=2",
    "--seed=20260912",
    "--generation-deterministic",
    "--generation-unique-inputs",
    "--generation-database=none",
    "--no-color",
    "--report=json,har,ndjson",
    `--report-dir=${options.reportDirectory}`,
    `--report-json-path=${join(options.reportDirectory, "report.json")}`,
    `--report-har-path=${join(options.reportDirectory, "report.har")}`,
    `--report-ndjson-path=${join(options.reportDirectory, "report.ndjson")}`,
    "--report-preserve-bytes",
  ];
}

export function collectSchemathesisFailureChecks(value: unknown): CheckName[] {
  const found = new Set<CheckName>();
  const allowed = new Set<string>(CHECKS);
  const walk = (entry: unknown, failureContext: boolean) => {
    if (typeof entry === "string") {
      if (failureContext && allowed.has(entry)) found.add(entry as CheckName);
      return;
    }
    if (Array.isArray(entry)) {
      for (const child of entry) walk(child, failureContext);
      return;
    }
    if (!object(entry)) return;
    const status = String(entry.status ?? entry.outcome ?? "").toLowerCase();
    const objectFailure = failureContext || status.includes("fail") || status.includes("error");
    for (const [key, child] of Object.entries(entry)) {
      walk(child, objectFailure || /fail|error|violation/u.test(key.toLowerCase()));
    }
  };
  walk(value, false);
  return [...found].sort();
}

export async function deriveCurrentV2AddedValueEvidence(
  repositoryRoot: string,
  commit?: string,
): Promise<CurrentV2AddedValueEvidence> {
  const [firstRun, engine, consumer] = await Promise.all([
    committedJson(repositoryRoot, commit, `${RESULT_ROOT}/development/first-run.json`),
    committedJson(repositoryRoot, commit, `${RESULT_ROOT}/integration/engine-report.json`),
    committedJson(repositoryRoot, commit, `${RESULT_ROOT}/integration/consumer-report.json`),
  ]);
  const tasks = firstRun.tasks as any[];
  const obligations = tasks.flatMap((task) => task.obligationResults ?? []);
  const requiredObligations = tasks.reduce((sum, task) => sum + Number(task.required?.total ?? 0), 0);
  const located = obligations.filter((row) => typeof row.obligationId === "string" && typeof row.requirementId === "string"
    && typeof row.operationKey === "string" && typeof row.status === "string" && Array.isArray(row.artifactIds));
  const groups = new Map<string, any[]>();
  for (const task of tasks.filter((row) => row.taskComplete)) {
    const rows = groups.get(task.sourceInputId) ?? [];
    rows.push(task);
    groups.set(task.sourceInputId, rows);
  }
  const pair = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sourceInputId, rows]) => ({
    sourceInputId,
    rows: rows.sort((a, b) => a.taskId.localeCompare(b.taskId)),
  })).find(({ rows }) => rows.length >= 2
    && new Set(rows.map((row) => row.semanticPlanSha256)).size > 1
    && new Set(rows.map((row) => stable(row.required))).size > 1);
  if (!pair) throw new Error("N13 same-source task-conditioned delta is unavailable");
  const chosen = pair.rows.slice(0, 2);
  const incomplete = tasks.filter((row) => !row.taskComplete);
  const reasons = incomplete.flatMap((row) => row.obligationResults ?? []).filter((row: any) => row.status !== "checked-exported")
    .map((row: any) => String(row.reason ?? "")).filter(Boolean);
  return {
    traceability: {
      requiredObligations,
      locatedObligations: located.length,
      checkedExported: Number(firstRun.summary.checkedExportedRequiredObligations),
      unresolved: Number(firstRun.summary.unresolvedRequiredObligations),
      packageChecksPassed: Number(firstRun.summary.packageChecksPassed),
      allRequiredObligationsLocated: located.length === requiredObligations,
    },
    sameSourceTaskDelta: {
      sourceInputId: pair.sourceInputId,
      taskIds: chosen.map((row) => row.taskId),
      semanticPlansDiffer: new Set(chosen.map((row) => row.semanticPlanSha256)).size === chosen.length,
      requiredOutcomesDiffer: new Set(chosen.map((row) => stable(row.required))).size === chosen.length,
      constructedCounts: chosen.map((row) => Number(row.backend?.constructed ?? row.backend?.selectedRows ?? 0)),
    },
    replay: {
      bundleReplayMatchesBindings: engine.relations?.bundleReplayMatchesBindings === true,
      documentedCliExecuted: engine.relations?.documentedCliExecuted === true,
      repositoryAgnosticDispatch: engine.relations?.repositoryAgnosticDispatch === true,
    },
    partialOutput: {
      incompleteTasks: incomplete.length,
      locatedReasons: reasons.length,
      distinctReasons: [...new Set<string>(reasons)].sort(),
    },
    modelCalls: Number(firstRun.accounting?.projectModelCalls ?? 0)
      + Number(engine.accounting?.projectModelCalls ?? 0) + Number(consumer.accounting?.projectModelCalls ?? 0),
  };
}

async function runProcess(options: {
  executable: string;
  arguments: string[];
  cwd: string;
  environment?: Record<string, string | undefined>;
  timeoutMs: number;
}) {
  const process = Bun.spawn([options.executable, ...options.arguments], {
    cwd: options.cwd,
    env: { ...processEnv(), ...options.environment },
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    process.kill();
  }, options.timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]).finally(() => clearTimeout(timer));
  return { stdout, stderr, exitCode, timedOut };
}

function processEnv(): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(process.env));
}

async function mutateResponse(response: Response, fault: FaultId | null, apply: boolean): Promise<Response> {
  if (!fault || !apply) return response;
  const headers = new Headers(response.headers);
  const body = await response.text();
  if (fault === "missing-response-header") headers.delete("x-count");
  return new Response(fault === "invalid-response-body" ? JSON.stringify({ status: "broken" }) : body, {
    status: fault === "undocumented-status" ? 201 : response.status,
    headers,
  });
}

async function readReportsForChecks(paths: string[]) {
  const values: unknown[] = [];
  for (const path of paths) {
    try {
      const text = await readFile(path, "utf8");
      if (path.endsWith(".ndjson")) {
        for (const line of text.split(/\r?\n/u).filter(Boolean)) values.push(JSON.parse(line));
      } else values.push(JSON.parse(text));
    } catch {
      // Missing or malformed external reports remain visible in raw bindings and run status.
    }
  }
  return [...new Set(values.flatMap(collectSchemathesisFailureChecks))].sort() as CheckName[];
}

async function runExternalScenario(options: {
  repositoryRoot: string;
  executable: string;
  fixture: CurrentV2LoopbackFixture;
  comparisonRoot: string;
  scenarioId: string;
  faultId: FaultId | null;
  expectedCheck: CheckName | null;
}): Promise<SchemathesisRun> {
  const directory = join(options.comparisonRoot, "raw", options.scenarioId);
  const reportDirectory = join(directory, "reports");
  await mkdir(reportDirectory, { recursive: true });
  const sourcePath = join(directory, "source.json");
  await writeExclusive(sourcePath, options.fixture.source);
  const observations: ExternalObservation[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const result = await options.fixture.respond(request);
      const apply = result.observation.valid;
      const response = await mutateResponse(result.response, options.faultId, apply);
      observations.push({
        method: result.observation.method,
        target: result.observation.target,
        contentType: result.observation.headers["content-type"] ?? "",
        traceHeader: result.observation.headers["x-trace"] ?? "",
        body: result.observation.body,
        fixturePredicateValid: result.observation.valid,
        responseStatus: response.status,
        faultApplied: !!options.faultId && apply,
      });
      return response;
    },
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const arguments_ = createCurrentV2SchemathesisArguments({ sourcePath, baseUrl, reportDirectory });
  const started = performance.now();
  let processResult: Awaited<ReturnType<typeof runProcess>>;
  try {
    processResult = await runProcess({
      executable: options.executable,
      arguments: arguments_,
      cwd: options.repositoryRoot,
      timeoutMs: 45_000,
      environment: {
        HTTP_PROXY: "http://127.0.0.1:1",
        HTTPS_PROXY: "http://127.0.0.1:1",
        ALL_PROXY: "http://127.0.0.1:1",
        NO_PROXY: "127.0.0.1,localhost",
        PYTHONDONTWRITEBYTECODE: "1",
      },
    });
  } finally {
    await server.stop(true);
  }
  const durationMs = Number((performance.now() - started).toFixed(3));
  const stdoutPath = join(directory, "stdout.txt");
  const stderrPath = join(directory, "stderr.txt");
  const observationsPath = join(directory, "observations.json");
  await Promise.all([
    writeExclusive(stdoutPath, processResult.stdout),
    writeExclusive(stderrPath, processResult.stderr),
    writeExclusive(observationsPath, `${JSON.stringify(observations, null, 2)}\n`),
  ]);
  const possibleRaw = [
    sourcePath,
    stdoutPath,
    stderrPath,
    observationsPath,
    join(reportDirectory, "report.json"),
    join(reportDirectory, "report.har"),
    join(reportDirectory, "report.ndjson"),
  ];
  const existingRaw: string[] = [];
  for (const path of possibleRaw) {
    try {
      if ((await stat(path)).isFile()) existingRaw.push(path);
    } catch {
      // Absence is captured by the report instead of being fabricated.
    }
  }
  const failureChecks = await readReportsForChecks([
    join(reportDirectory, "report.json"),
    join(reportDirectory, "report.ndjson"),
  ]);
  const unique = new Set(observations.map((row) => sha(stable({
    method: row.method,
    target: row.target,
    contentType: row.contentType,
    traceHeader: row.traceHeader,
    body: row.body,
  }))));
  return {
    scenarioId: options.scenarioId,
    fixtureId: options.fixture.id,
    faultId: options.faultId,
    expectedCheck: options.expectedCheck,
    commandTemplate: createCurrentV2SchemathesisArguments({
      sourcePath: "<source.json>", baseUrl: "<loopback-origin>", reportDirectory: "<report-directory>",
    }),
    durationMs,
    exitCode: processResult.exitCode,
    timedOut: processResult.timedOut,
    requestBudget: 2,
    requestCount: observations.length,
    uniqueWireRequests: unique.size,
    validFixtureRequests: observations.filter((row) => row.fixturePredicateValid).length,
    operationHit: observations.length > 0,
    budgetExceeded: observations.length > 2,
    faultAppliedCount: observations.filter((row) => row.faultApplied).length,
    failureChecks,
    expectedCheckDetected: options.expectedCheck === null ? null
      : processResult.exitCode !== 0 && failureChecks.includes(options.expectedCheck),
    observations,
    rawBindings: await Promise.all(existingRaw.map((path) => bindingForFile(options.repositoryRoot, path))),
  };
}

function renderAddedValue(tool: CurrentV2N13ToolBaseline, evidence: CurrentV2AddedValueEvidence) {
  const baseline = tool.runs.filter((row) => row.faultId === null);
  const faults = tool.runs.filter((row) => row.faultId !== null);
  return `# N13 external comparison and bounded added value

This is development evidence on two deterministic synthetic loopback fixtures. It does not establish live API behavior or research transfer.

## Controlled comparison

- Schemathesis ${tool.tool.actualVersion}; positive fuzzing; at most 2 examples per operation; one worker; 5-second request timeout; 30-second run timeout; zero retries; deterministic seed 20260912.
- The SkVM baseline and Schemathesis use the exact N5 source bytes and hand-written predicates. SkVM executed ${tool.skvmBaseline.fixtures.reduce((sum, row) => sum + row.requestCount, 0)} requests; Schemathesis baseline executed ${tool.summary.baselineRequests} requests (${tool.summary.baselineUniqueWireRequests} unique wire requests).
- External baseline runs passed ${tool.summary.baselinePassed}/${tool.summary.baselineRuns}. Actual results: ${baseline.map((row) => `${row.fixtureId}=${row.exitCode === 0 ? "pass" : "fail"}`).join(", ")}.
- Named response faults were detected by their assigned Schemathesis checks in ${tool.summary.correctlyDetectedFaults}/${tool.summary.faultInjections} cases; missed=${tool.summary.missedFaults}, not-applicable=${tool.summary.notApplicableFaults}. ${faults.map((row) => `${row.faultId}:${row.expectedCheckDetected === true ? "detected" : row.faultAppliedCount === 0 ? "not-applicable" : "missed"}`).join(", ")}.

Timing is reported per run in the machine report, but it is not used for a throughput ranking: Schemathesis performs randomized/property-based execution while SkVM emits deterministic task-selected witnesses.

## Measured integration value

- Traceability: ${evidence.traceability.locatedObligations}/${evidence.traceability.requiredObligations} required obligations retain requirement, operation, artifact and checker-local status; ${evidence.traceability.checkedExported} are checked-exported and ${evidence.traceability.unresolved} remain explicitly unresolved.
- Task conditioning: the same ${evidence.sameSourceTaskDelta.sourceInputId} source produced different semantic plans and required outcomes for ${evidence.sameSourceTaskDelta.taskIds.join(" versus ")}; constructed counts are ${evidence.sameSourceTaskDelta.constructedCounts.join(" versus ")}.
- Offline replay: bundle binding replay=${evidence.replay.bundleReplayMatchesBindings}, documented CLI executed=${evidence.replay.documentedCliExecuted}, repository-agnostic dispatch=${evidence.replay.repositoryAgnosticDispatch}, project model calls=${evidence.modelCalls}.
- Explainable partial output: ${evidence.partialOutput.incompleteTasks} incomplete tasks retain ${evidence.partialOutput.locatedReasons} located obligation reasons rather than disappearing from the denominator.

## Boundaries

Schemathesis already provides OpenAPI-derived property-based testing and response checks; this project does not claim that invention. External-tool success does not replace the SkVM package checker, and SkVM traceability does not increase the external-tool pass count. The comparison does not prove superiority over Schemathesis or other API testing tools.
`;
}

function summarizeRuns(runs: SchemathesisRun[]): CurrentV2N13ToolBaseline["summary"] {
  const baseline = runs.filter((row) => row.faultId === null);
  const faults = runs.filter((row) => row.faultId !== null);
  const notApplicableFaults = faults.filter((row) => row.faultAppliedCount === 0).length;
  const correctlyDetectedFaults = faults.filter((row) => row.expectedCheckDetected === true).length;
  return {
    baselineRuns: baseline.length,
    baselinePassed: baseline.filter((row) => row.exitCode === 0 && !row.timedOut && !row.budgetExceeded).length,
    baselineRequests: baseline.reduce((sum, row) => sum + row.requestCount, 0),
    baselineUniqueWireRequests: baseline.reduce((sum, row) => sum + row.uniqueWireRequests, 0),
    baselineValidFixtureRequests: baseline.reduce((sum, row) => sum + row.validFixtureRequests, 0),
    faultInjections: faults.length,
    correctlyDetectedFaults,
    missedFaults: faults.length - correctlyDetectedFaults - notApplicableFaults,
    notApplicableFaults,
    actualLoopbackHttpCalls: runs.reduce((sum, row) => sum + row.requestCount, 0),
  };
}

async function createToolBaseline(options: {
  repositoryRoot: string;
  comparisonRoot: string;
  codeCommit: string;
  executedAt: string;
  executable: string;
}): Promise<CurrentV2N13ToolBaseline> {
  const rawToolDirectory = join(options.comparisonRoot, "raw", "tool");
  await mkdir(rawToolDirectory, { recursive: true });
  const version = await runProcess({ executable: options.executable, arguments: ["--version"], cwd: options.repositoryRoot, timeoutMs: 10_000 });
  const help = await runProcess({ executable: options.executable, arguments: ["run", "--help"], cwd: options.repositoryRoot, timeoutMs: 10_000 });
  const pythonExecutable = join(dirname(options.executable), process.platform === "win32" ? "python.exe" : "python");
  const python = await runProcess({ executable: pythonExecutable, arguments: ["-X", "utf8", "-c", "import sys; print(sys.version)"], cwd: options.repositoryRoot, timeoutMs: 10_000 });
  const freeze = await runProcess({ executable: pythonExecutable, arguments: ["-X", "utf8", "-m", "pip", "freeze", "--all"], cwd: options.repositoryRoot, timeoutMs: 30_000 });
  if (version.exitCode !== 0 || !version.stdout.includes(TOOL_VERSION)) throw new Error(`N13 requires Schemathesis ${TOOL_VERSION}`);
  const requiredHelp = ["--max-time", "--request-timeout", "--max-examples", "--seed", "--generation-deterministic", "--report-json-path"];
  if (help.exitCode !== 0 || !requiredHelp.every((option) => help.stdout.includes(option))) throw new Error("N13 Schemathesis help contract unavailable");
  const versionPath = join(rawToolDirectory, "version.txt");
  const helpPath = join(rawToolDirectory, "run-help.txt");
  const freezePath = join(rawToolDirectory, "dependency-freeze.txt");
  await Promise.all([
    writeExclusive(versionPath, version.stdout + version.stderr),
    writeExclusive(helpPath, help.stdout + help.stderr),
    writeExclusive(freezePath, freeze.stdout + freeze.stderr),
  ]);
  const fixtures = currentV2LoopbackFixtures();
  const definitions: Array<{ scenarioId: string; fixture: CurrentV2LoopbackFixture; faultId: FaultId | null; expectedCheck: CheckName | null }> = [
    { scenarioId: "baseline-json-reference", fixture: fixtures[0]!, faultId: null, expectedCheck: null },
    { scenarioId: "baseline-form-wire", fixture: fixtures[1]!, faultId: null, expectedCheck: null },
    { scenarioId: "fault-undocumented-status", fixture: fixtures[0]!, faultId: "undocumented-status", expectedCheck: "status_code_conformance" },
    { scenarioId: "fault-missing-response-header", fixture: fixtures[0]!, faultId: "missing-response-header", expectedCheck: "response_headers_conformance" },
    { scenarioId: "fault-invalid-response-body", fixture: fixtures[0]!, faultId: "invalid-response-body", expectedCheck: "response_schema_conformance" },
  ];
  const runs: SchemathesisRun[] = [];
  for (const definition of definitions) runs.push(await runExternalScenario({
    repositoryRoot: options.repositoryRoot,
    executable: options.executable,
    fixture: definition.fixture,
    comparisonRoot: options.comparisonRoot,
    scenarioId: definition.scenarioId,
    faultId: definition.faultId,
    expectedCheck: definition.expectedCheck,
  }));
  const consumer = await committedJson(options.repositoryRoot, options.codeCommit, INPUT_PATHS[0]);
  const skvmFixtures = consumer.fixtures.map((fixture: any) => ({
    fixtureId: fixture.fixtureId,
    sourceSha256: fixture.sourceSha256,
    requestCount: fixture.requestObservations.length,
    uniqueWireRequests: new Set(fixture.requestObservations.map((row: any) => sha(stable({
      method: row.method,
      target: row.target,
      contentType: row.headers?.["content-type"] ?? "",
      traceHeader: row.headers?.["x-trace"] ?? "",
      body: row.body,
    })))).size,
    executed: fixture.junit.executed,
    passed: fixture.junit.passed,
    durationMs: null,
  }));
  const summary = summarizeRuns(runs);
  return {
    schemaVersion: "skill-family-current-v2-n13-tool-baseline/v1",
    identity: IDENTITY,
    exposure: "synthetic-development-comparison",
    codeCommit: options.codeCommit,
    executedAt: options.executedAt,
    tool: {
      name: "Schemathesis",
      requiredVersion: TOOL_VERSION,
      actualVersion: /version\s+([^\s]+)/u.exec(version.stdout)?.[1] ?? "unknown",
      executableName: basename(options.executable),
      pythonVersion: python.stdout.trim(),
      versionBinding: await bindingForFile(options.repositoryRoot, versionPath),
      helpBinding: await bindingForFile(options.repositoryRoot, helpPath),
      dependencyFreezeBinding: await bindingForFile(options.repositoryRoot, freezePath),
      requiredHelpOptionsPresent: true,
    },
    contract: {
      fixtureIds: ["json-reference", "form-wire"],
      sourceSha256: Object.fromEntries(fixtures.map((fixture) => [fixture.id, sha(fixture.source)])),
      phase: "fuzzing",
      mode: "positive",
      maxExamplesPerOperation: 2,
      workers: 1,
      requestTimeoutSeconds: 5,
      maxTimeSeconds: 30,
      requestRetries: 0,
      seed: 20260912,
      deterministic: true,
      uniqueInputs: true,
      database: "none",
      checks: [...CHECKS],
    },
    skvmBaseline: {
      sourceReport: await committedBinding(options.repositoryRoot, options.codeCommit, INPUT_PATHS[0]),
      fixtures: skvmFixtures,
      timingNote: "The archived SkVM consumer does not expose a directly comparable end-to-end wall clock; no speed ranking is made.",
    },
    runs,
    summary,
    accounting: {
      sourceApiCalls: 0,
      businessApiCalls: 0,
      modelCalls: 0,
      paidCalls: 0,
      loopbackHttpCalls: summary.actualLoopbackHttpCalls,
      dependencyDownloadRequests: "not-measured",
    },
    claimLimits: [
      "The external comparison uses deterministic synthetic loopback fixtures, not a live API.",
      "Schemathesis response checks do not replace or increase SkVM checker results.",
      "SkVM task traceability is an integration contribution, not a claim that schema-derived API testing is novel.",
      "Run timing is not used for an uncontrolled throughput comparison.",
    ],
  };
}

function validateToolBaseline(tool: CurrentV2N13ToolBaseline): string[] {
  const errors: string[] = [];
  if (tool.schemaVersion !== "skill-family-current-v2-n13-tool-baseline/v1" || tool.identity !== IDENTITY
    || tool.tool.actualVersion !== TOOL_VERSION || !tool.tool.requiredHelpOptionsPresent) errors.push("N13_TOOL_HEADER_INVALID");
  if (tool.contract.maxExamplesPerOperation !== 2 || tool.contract.requestTimeoutSeconds !== 5
    || tool.contract.maxTimeSeconds !== 30 || tool.contract.requestRetries !== 0 || tool.contract.seed !== 20260912
    || tool.contract.phase !== "fuzzing" || tool.contract.mode !== "positive") errors.push("N13_COMPARISON_CONTRACT_MISMATCH");
  if (tool.runs.length !== 5 || tool.runs.some((run) => run.budgetExceeded)) errors.push("N13_RUN_DENOMINATOR_MISMATCH");
  if (stable(tool.summary) !== stable(summarizeRuns(tool.runs))) errors.push("N13_SUMMARY_MISMATCH");
  return errors;
}

export async function writeCurrentV2N13Comparison(options: {
  repositoryRoot: string;
  codeCommit: string;
  executedAt: string;
  schemathesisExecutable: string;
}): Promise<{ report: CurrentV2N13Report; files: Binding[] }> {
  if (!/^[0-9a-f]{40}$/u.test(options.codeCommit)) throw new Error("N13 code commit is invalid");
  const comparisonRoot = join(options.repositoryRoot, RESULT_ROOT, "comparison");
  await mkdir(comparisonRoot, { recursive: true });
  const tool = await createToolBaseline({ ...options, comparisonRoot, executable: options.schemathesisExecutable });
  const toolPath = join(comparisonRoot, "tool-baseline.json");
  await writeExclusive(toolPath, `${JSON.stringify(tool, null, 2)}\n`);
  const addedValueEvidence = await deriveCurrentV2AddedValueEvidence(options.repositoryRoot, options.codeCommit);
  const addedValueText = renderAddedValue(tool, addedValueEvidence);
  const addedValuePath = join(comparisonRoot, "added-value.md");
  await writeExclusive(addedValuePath, addedValueText);
  const issues = [
    ...(tool.summary.baselinePassed < tool.summary.baselineRuns ? ["external-baseline-has-failures"] : []),
    ...(tool.summary.correctlyDetectedFaults < tool.summary.faultInjections - tool.summary.notApplicableFaults
      ? ["external-tool-missed-assigned-faults"] : []),
  ];
  const report: CurrentV2N13Report = {
    schemaVersion: "skill-family-current-v2-n13-comparison/v1",
    identity: IDENTITY,
    exposure: "development",
    evaluatedAt: options.executedAt,
    codeCommit: options.codeCommit,
    inputBindings: await Promise.all(INPUT_PATHS.map((path) => committedBinding(options.repositoryRoot, options.codeCommit, path))),
    toolBaselineBinding: await bindingForFile(options.repositoryRoot, toolPath),
    addedValueBinding: await bindingForFile(options.repositoryRoot, addedValuePath),
    addedValueEvidence,
    summary: tool.summary,
    decision: issues.length === 0 ? "completed" : "completed-with-limitation",
    issues,
    nextTask: "N4",
    accounting: tool.accounting,
    claimLimits: tool.claimLimits,
  };
  const reportPath = join(comparisonRoot, "schemathesis-report.json");
  await writeExclusive(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    report,
    files: await Promise.all([reportPath, toolPath, addedValuePath].map((path) => bindingForFile(options.repositoryRoot, path))),
  };
}

export async function verifyCurrentV2N13Comparison(options: {
  repositoryRoot: string;
  report?: CurrentV2N13Report;
}): Promise<{ status: "pass" | "fail"; errors: string[] }> {
  const errors = new Set<string>();
  let report = options.report;
  try {
    report ??= JSON.parse(await readFile(join(options.repositoryRoot, RESULT_ROOT, "comparison", "schemathesis-report.json"), "utf8"));
  } catch {
    return { status: "fail", errors: ["N13_REPORT_UNREADABLE"] };
  }
  if (!report || report.schemaVersion !== "skill-family-current-v2-n13-comparison/v1" || report.identity !== IDENTITY
    || !/^[0-9a-f]{40}$/u.test(report.codeCommit)) return { status: "fail", errors: ["N13_REPORT_HEADER_INVALID"] };
  let tool: CurrentV2N13ToolBaseline | undefined;
  try {
    const toolPath = join(options.repositoryRoot, report.toolBaselineBinding.path);
    const bytes = new Uint8Array(await readFile(toolPath));
    if (sha(bytes) !== report.toolBaselineBinding.sha256 || bytes.byteLength !== report.toolBaselineBinding.bytes) errors.add("N13_TOOL_BINDING_MISMATCH");
    tool = JSON.parse(new TextDecoder().decode(bytes));
    for (const error of validateToolBaseline(tool!)) errors.add(error);
    for (const binding of tool!.runs.flatMap((run) => run.rawBindings).concat([
      tool!.tool.versionBinding, tool!.tool.helpBinding, tool!.tool.dependencyFreezeBinding,
    ])) {
      const raw = new Uint8Array(await readFile(join(options.repositoryRoot, binding.path)));
      if (sha(raw) !== binding.sha256 || raw.byteLength !== binding.bytes) errors.add("N13_RAW_BINDING_MISMATCH");
    }
  } catch {
    errors.add("N13_TOOL_REPORT_UNREADABLE");
  }
  try {
    const expectedInputs = await Promise.all(INPUT_PATHS.map((path) => committedBinding(options.repositoryRoot, report!.codeCommit, path)));
    if (stable(report.inputBindings) !== stable(expectedInputs)) errors.add("N13_INPUT_BINDING_MISMATCH");
    const evidence = await deriveCurrentV2AddedValueEvidence(options.repositoryRoot, report.codeCommit);
    if (stable(evidence) !== stable(report.addedValueEvidence)) errors.add("N13_ADDED_VALUE_EVIDENCE_MISMATCH");
    if (tool) {
      const expectedText = renderAddedValue(tool, evidence);
      const actualText = await readFile(join(options.repositoryRoot, report.addedValueBinding.path), "utf8");
      if (sha(actualText) !== report.addedValueBinding.sha256 || Buffer.byteLength(actualText) !== report.addedValueBinding.bytes
        || actualText !== expectedText) errors.add("N13_ADDED_VALUE_BINDING_MISMATCH");
      if (stable(report.summary) !== stable(tool.summary) || stable(report.accounting) !== stable(tool.accounting)) errors.add("N13_REPORT_SUMMARY_MISMATCH");
      const expectedIssues = [
        ...(tool.summary.baselinePassed < tool.summary.baselineRuns ? ["external-baseline-has-failures"] : []),
        ...(tool.summary.correctlyDetectedFaults < tool.summary.faultInjections - tool.summary.notApplicableFaults
          ? ["external-tool-missed-assigned-faults"] : []),
      ];
      if (stable(report.issues) !== stable(expectedIssues)
        || report.decision !== (expectedIssues.length === 0 ? "completed" : "completed-with-limitation")) {
        errors.add("N13_DECISION_MISMATCH");
      }
    }
  } catch {
    errors.add("N13_RECOMPUTATION_FAILED");
  }
  if (report.accounting.sourceApiCalls !== 0 || report.accounting.businessApiCalls !== 0
    || report.accounting.modelCalls !== 0 || report.accounting.paidCalls !== 0) errors.add("N13_EXTERNAL_ACCOUNTING_INVALID");
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort() };
}
