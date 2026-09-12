import { createHash } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";
const FINAL_PATH = `${RESULT_ROOT}/final-report.json`;
const VERIFICATION_PATH = `${RESULT_ROOT}/delivery-verification.json`;
const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;

export const CURRENT_V2_N15_EVIDENCE_PATHS = {
  sourceLedger: `${RESULT_ROOT}/corpus/source-ledger.json`,
  dutyMatrix: `${RESULT_ROOT}/corpus/duty-matrix.json`,
  gapMatrix: `${RESULT_ROOT}/baseline/gap-matrix.json`,
  sourceClosure: `${RESULT_ROOT}/source-closure/report.json`,
  consumer: `${RESULT_ROOT}/integration/consumer-report.json`,
  engine: `${RESULT_ROOT}/integration/engine-report.json`,
  inputLock: `${RESULT_ROOT}/development/input-lock.json`,
  firstRun: `${RESULT_ROOT}/development/first-run.json`,
  revision: `${RESULT_ROOT}/development/revision-001.json`,
  readiness: `${RESULT_ROOT}/readiness/report.json`,
  research: `${RESULT_ROOT}/prospective/not-executed-report.json`,
  comparison: `${RESULT_ROOT}/comparison/revision-003/schemathesis-report.json`,
  meilisearch: `${RESULT_ROOT}/source-repair/meilisearch-resolution.json`,
  bangumi: `${RESULT_ROOT}/source-repair/bangumi-external-closure.json`,
  archiveSearch: `${RESULT_ROOT}/archive-recovery/clean-002-search.json`,
  cleanReplay: `${RESULT_ROOT}/clean-replay/report.json`,
  statusSnapshot: `${RESULT_ROOT}/execution-status.json`,
} as const;

const EXPECTED_SCHEMAS: Record<keyof typeof CURRENT_V2_N15_EVIDENCE_PATHS, string> = {
  sourceLedger: "skill-family-current-v2-source-ledger/v1",
  dutyMatrix: "skill-family-current-v2-duty-matrix/v1",
  gapMatrix: "skill-family-current-v2-gap-matrix/v1",
  sourceClosure: "skill-family-current-v2-source-closure-report/v1",
  consumer: "skill-family-current-v2-n5-consumer/v1",
  engine: "skill-family-current-v2-n8-engine/v1",
  inputLock: "skill-family-current-v2-n10-input-lock/v1",
  firstRun: "skill-family-current-v2-n10-first-run/v1",
  revision: "skill-family-current-v2-n10-revision/v1",
  readiness: "skill-family-current-v2-readiness/v1",
  research: "skill-family-current-v2-research-not-executed/v1",
  comparison: "skill-family-current-v2-n13-comparison/v1",
  meilisearch: "skill-family-current-v2-n4-meilisearch-resolution/v1",
  bangumi: "skill-family-current-v2-n4-bangumi-external-closure/v1",
  archiveSearch: "skill-family-current-v2-n6-archive-search/v1",
  cleanReplay: "skill-family-current-v2-n14-clean-replay/v1",
  statusSnapshot: "skill-family-current-v2-execution-status/v1",
};

type Binding = { path: string; sha256: string; bytes: number };
type EvidenceName = keyof typeof CURRENT_V2_N15_EVIDENCE_PATHS;
type EvidenceReports = Record<EvidenceName, Record<string, any>>;

type CommandEvidence = {
  id: string;
  executable: string;
  arguments: string[];
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
};

export type CurrentV2N15DeliveryVerification = {
  schemaVersion: "skill-family-current-v2-n15-delivery-verification/v1";
  identity: typeof IDENTITY;
  exposure: "development-delivery";
  deliveryCodeCommit: string;
  evidenceCommit: string;
  verifiedAt: string;
  commands: CommandEvidence[];
  summary: {
    focusedPassed: number;
    focusedFailed: number;
    assertions: number;
    typecheckExitCode: number;
    docLinkUnitExitCode: number;
    docLinkFullExitCode: number;
    brokenDocReferences: number;
    legacyDocReferences: number;
    retiredDocReferences: number;
    diffCheckExitCode: number;
    trackedClean: boolean;
    headMatchesOrigin: boolean;
  };
  decision: "passed" | "failed";
  issues: string[];
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0; nativeLoopbackHttpCalls: 0 };
};

export type CurrentV2N15BuildInput = {
  deliveryCodeCommit: string;
  evidenceCommit: string;
  generatedAt: string;
  evidence: Record<EvidenceName, Binding>;
  deliveryVerification: Binding;
  verification: CurrentV2N15DeliveryVerification;
  reports: EvidenceReports;
};

export type CurrentV2N15FinalReport = {
  schemaVersion: "skill-family-current-v2-final/v1";
  identity: typeof IDENTITY;
  exposure: "development-final-delivery";
  generatedAt: string;
  deliveryCodeCommit: string;
  evidenceCommit: string;
  decision: "completed" | "completed-with-engineering-shortfall";
  inputs: {
    ordinary: { taskContract: "skvm-api-task/v1"; source: "OpenAPI-3.0.x-JSON-or-YAML"; output: string[] };
    development: { responsibilityBodies: number; responsibilityMembers: number; repositoryOrigins: number;
      realApiContracts: number; providers: number; operations: number; taskContracts: number };
  };
  runnableEntry: { directCommand: string; bindingCommand: string; consumerBoundary: string };
  engineeringDelivery: {
    status: "complete" | "usable-with-shortfall";
    fullyImplementedTaskSlices: Array<{ id: string; qualification: string }>;
    planRelations: { requirementChangesPlan: boolean; outputChangesPlan: boolean; provenanceRenamePreservesSemantics: boolean };
    sourceClosure: { tasks: number; passed: number; partial: number; blocked: number };
    panel: { uniqueInputs: number; providers: number; operations: number; tasks: number; taskComplete: number;
      packageChecksPassed: number; required: number; checkedExported: number; unresolved: number;
      demandComparisons: number; demandComparisonsPassed: number; completeTaskIds: string[] };
    native: { attempted: number; executed: number; passed: number; failed: number; errors: number; skipped: number };
    faultInjection: { injected: number; correctlyDetected: number; missed: number; notApplicable: number };
    cleanReplay: { status: string; attempt: number; n8Cases: number; n10Tasks: number; nativeLoopbackHttpCalls: number };
    shortfalls: string[];
  };
  researchOutcome: {
    status: "not-executed";
    candidate: null;
    tasks: Array<{ taskId: string; status: string; reason: string }>;
    transfer: "not-assessed";
    prospectiveRuns: 0;
    preparation: { ready: false; missingConditions: string[] };
  };
  maintenance: {
    meilisearch: { decision: string; affectedOperation: string };
    bangumi: { decision: string; affectedOperations: number; resolvedReferenceIssues: number; liveApiValidityEstablished: boolean };
    historicalClean002: { decision: string; recoveredExact: boolean; historicalGapRemains: boolean };
    externalComparison: { decision: string; baselinePassed: number; baselineRuns: number; faultDetected: number;
      faultMissed: number; faultNotApplicable: number };
  };
  cost: { projectRuntime: { sourceApiCalls: number; businessApiCalls: number; modelCalls: number; paidCalls: number;
    nativeLoopbackHttpCalls: number; monetaryCost: "not-measured" }; developmentAgent: string; separate: true };
  humanBoundary: { mappingAuthority: string; semanticReview: string; measuredHumanTime: false; humanSavingsClaimed: false };
  protectedBoundary: { historicalDocumentResult: "0/6-unchanged"; heldOutReads: 0; q1ReservedReads: 0;
    prospectiveRuns: 0; historicalReadinessChanged: false };
  remainingIssues: string[];
  nextSteps: string[];
  provenance: { evidence: Record<EvidenceName, Binding>; deliveryVerification: Binding };
  claimLimits: string[];
  portableSemanticSha256: string;
};

const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stable = (value: unknown) => JSON.stringify(canonical(value));
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const portable = (value: string) => value.replaceAll("\\", "/");

function validBinding(binding: Binding) {
  const path = portable(binding.path);
  return path.startsWith(`${RESULT_ROOT}/`) && !isAbsolute(binding.path) && !path.split("/").includes("..")
    && HEX_64.test(binding.sha256) && Number.isInteger(binding.bytes) && binding.bytes > 0;
}

function number(value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`N15 invalid denominator: ${label}`);
  return Number(value);
}

function assertEvidence(input: CurrentV2N15BuildInput) {
  if (!HEX_40.test(input.deliveryCodeCommit) || !HEX_40.test(input.evidenceCommit)
    || !Number.isFinite(Date.parse(input.generatedAt))) throw new Error("N15 commit or time binding is invalid");
  const expectedNames = Object.keys(CURRENT_V2_N15_EVIDENCE_PATHS).sort();
  if (stable(Object.keys(input.evidence).sort()) !== stable(expectedNames)) throw new Error("N15 evidence set is incomplete");
  for (const name of expectedNames as EvidenceName[]) {
    const binding = input.evidence[name];
    const report = input.reports[name];
    if (!validBinding(binding) || binding.path !== CURRENT_V2_N15_EVIDENCE_PATHS[name]) {
      throw new Error(`N15 evidence binding is invalid: ${name}`);
    }
    if (!object(report) || report.schemaVersion && report.schemaVersion !== EXPECTED_SCHEMAS[name]
      || report.identity && report.identity !== IDENTITY) throw new Error(`N15 evidence identity/schema mismatch: ${name}`);
  }
  if (!validBinding(input.deliveryVerification) || input.deliveryVerification.path !== VERIFICATION_PATH
    || input.verification.schemaVersion !== "skill-family-current-v2-n15-delivery-verification/v1"
    || input.verification.identity !== IDENTITY || input.verification.deliveryCodeCommit !== input.deliveryCodeCommit
    || input.verification.evidenceCommit !== input.evidenceCommit || input.verification.decision !== "passed") {
    throw new Error("N15 delivery verification binding is invalid");
  }
}

function digestReport(report: CurrentV2N15FinalReport) {
  return sha(stable({ ...report, generatedAt: null, portableSemanticSha256: null }));
}

export function buildCurrentV2N15FinalReport(input: CurrentV2N15BuildInput): CurrentV2N15FinalReport {
  assertEvidence(input);
  const { reports } = input;
  const lock = reports.inputLock.summary;
  const first = reports.firstRun.summary;
  const replay = reports.cleanReplay.replay;
  const nativeFixtures = reports.consumer.fixtures ?? [];
  const native = nativeFixtures.reduce((total: Record<string, number>, row: Record<string, any>) => {
    for (const key of ["tests", "executed", "passed", "failed", "errors", "skipped"]) {
      total[key] = (total[key] ?? 0) + number(row.junit?.[key], `consumer.${key}`);
    }
    return total;
  }, {});
  const counts = {
    uniqueInputs: number(first.uniqueInputs, "firstRun.uniqueInputs"),
    providers: number(first.providers, "firstRun.providers"),
    operations: number(first.operationDenominator, "firstRun.operations"),
    tasks: number(first.taskContracts, "firstRun.tasks"),
    taskComplete: number(first.taskComplete, "firstRun.taskComplete"),
    packageChecksPassed: number(first.packageChecksPassed, "firstRun.packageChecksPassed"),
    required: number(first.requiredObligationDenominator, "firstRun.required"),
    checkedExported: number(first.checkedExportedRequiredObligations, "firstRun.checkedExported"),
    unresolved: number(first.unresolvedRequiredObligations, "firstRun.unresolved"),
    comparisons: number(first.comparisons, "firstRun.comparisons"),
    comparisonsPassed: number(first.comparisonsPassed, "firstRun.comparisonsPassed"),
  };
  if (counts.uniqueInputs !== number(lock.uniqueInputs, "lock.uniqueInputs")
    || counts.providers !== number(lock.providers, "lock.providers")
    || counts.operations !== number(lock.operationDenominator, "lock.operations")
    || counts.tasks !== number(lock.taskContracts, "lock.tasks")
    || counts.tasks !== number(replay.n10.tasks, "replay.tasks")
    || counts.taskComplete !== number(replay.n10.taskComplete, "replay.taskComplete")
    || counts.packageChecksPassed !== number(replay.n10.packageChecksPassed, "replay.packageChecksPassed")
    || counts.required !== number(replay.n10.required, "replay.required")
    || counts.checkedExported !== number(replay.n10.checkedExported, "replay.checkedExported")
    || counts.unresolved !== number(replay.n10.unresolved, "replay.unresolved")
    || counts.required !== counts.checkedExported + counts.unresolved
    || reports.firstRun.tasks?.length !== counts.tasks) throw new Error("N15 denominator mismatch across lock, first run, and clean replay");
  if (native.tests !== native.executed + native.skipped
    || native.executed !== native.passed + native.failed + native.errors
    || stable({ attempted: native.tests, executed: native.executed, passed: native.passed, failed: native.failed,
      errors: native.errors, skipped: native.skipped }) !== stable({ attempted: replay.native.attempted,
      executed: replay.native.executed, passed: replay.native.passed, failed: replay.native.failed,
      errors: replay.native.errors, skipped: replay.native.skipped })) {
    throw new Error("N15 native denominator mismatch");
  }
  const researchTasks = reports.research.tasks ?? [];
  if (reports.research.decision !== "research-not-executed" || researchTasks.length !== 3
    || researchTasks.some((row: Record<string, any>) => row.status !== "not-executed")
    || reports.cleanReplay.researchCandidate !== null
    || reports.research.protectedState?.prospectiveRuns !== 0) throw new Error("N15 research chain must remain not-executed");
  const protectedState = reports.statusSnapshot.protectedState;
  if (protectedState?.historicalDocumentResult !== "0/6-unchanged" || protectedState.heldOutReads !== 0
    || protectedState.q1ReservedReads !== 0 || protectedState.prospectiveRuns !== 0
    || reports.statusSnapshot.tasks?.N14?.status !== "completed" || reports.statusSnapshot.tasks?.N15?.status !== "pending") {
    throw new Error("N15 protected or pre-delivery status binding is invalid");
  }
  const engineeringComplete = reports.firstRun.methodGate?.decision === "method-ready"
    && reports.readiness.dimensions?.capability?.status === "ready" && counts.comparisonsPassed === counts.comparisons;
  const shortfalls = engineeringComplete ? [] : [
    `N10 capability gate is ${reports.firstRun.methodGate?.decision ?? "unknown"}; only ${counts.comparisonsPassed}/${counts.comparisons} fixed demand-change relations passed.`,
    `${counts.taskComplete}/${counts.tasks} fixed tasks are complete; ${counts.unresolved}/${counts.required} required obligations remain unresolved.`,
    "The current nonempty form-v1 and JSON-only constraint-negative contracts do not preserve all Visier task semantics.",
  ];
  const verification = input.verification.summary;
  if (verification.focusedFailed !== 0 || verification.focusedPassed < 1 || verification.typecheckExitCode !== 0
    || verification.docLinkUnitExitCode !== 0 || verification.docLinkFullExitCode !== 0
    || verification.brokenDocReferences !== 0 || verification.legacyDocReferences !== 0
    || verification.diffCheckExitCode !== 0 || !verification.trackedClean || !verification.headMatchesOrigin) {
    throw new Error("N15 delivery verification did not pass");
  }
  const report: CurrentV2N15FinalReport = {
    schemaVersion: "skill-family-current-v2-final/v1",
    identity: IDENTITY,
    exposure: "development-final-delivery",
    generatedAt: input.generatedAt,
    deliveryCodeCommit: input.deliveryCodeCommit,
    evidenceCommit: input.evidenceCommit,
    decision: engineeringComplete ? "completed" : "completed-with-engineering-shortfall",
    inputs: {
      ordinary: { taskContract: "skvm-api-task/v1", source: "OpenAPI-3.0.x-JSON-or-YAML",
        output: ["checked-request-json", "selected-pytest-package"] },
      development: {
        responsibilityBodies: number(reports.sourceLedger.summary?.bodies, "source bodies"),
        responsibilityMembers: number(reports.dutyMatrix.summary?.members, "responsibility members"),
        repositoryOrigins: number(reports.sourceLedger.summary?.repositoryOrigins, "repository origins"),
        realApiContracts: counts.uniqueInputs,
        providers: counts.providers,
        operations: counts.operations,
        taskContracts: counts.tasks,
      },
    },
    runnableEntry: {
      directCommand: reports.engine.command,
      bindingCommand: reports.engine.bindingCommand,
      consumerBoundary: "pytest execution requires an explicit task-selected local oracle; request-json is a checked data artifact",
    },
    engineeringDelivery: {
      status: engineeringComplete ? "complete" : "usable-with-shortfall",
      fullyImplementedTaskSlices: [
        { id: "checked-request-json-task", qualification: "all selected required obligations are checked/exported under the fixed OpenAPI 3.0.x support contract" },
        { id: "selected-pytest-loopback-task", qualification: "the emitted task-selected suite is executed against an explicit local oracle and no required row remains unresolved" },
      ],
      planRelations: {
        requirementChangesPlan: reports.gapMatrix.relations?.requirementChangeChangesPlan === true,
        outputChangesPlan: reports.gapMatrix.relations?.outputChangeChangesPlan === true,
        provenanceRenamePreservesSemantics: reports.gapMatrix.relations?.memberAndRepositoryRenamePreservesSemantics === true,
      },
      sourceClosure: {
        tasks: number(reports.sourceClosure.realSummary?.tasks, "source closure tasks"),
        passed: number(reports.sourceClosure.realSummary?.passed, "source closure passed"),
        partial: number(reports.sourceClosure.realSummary?.partial, "source closure partial"),
        blocked: number(reports.sourceClosure.realSummary?.blocked, "source closure blocked"),
      },
      panel: { uniqueInputs: counts.uniqueInputs, providers: counts.providers, operations: counts.operations,
        tasks: counts.tasks, taskComplete: counts.taskComplete, packageChecksPassed: counts.packageChecksPassed,
        required: counts.required, checkedExported: counts.checkedExported, unresolved: counts.unresolved,
        demandComparisons: counts.comparisons, demandComparisonsPassed: counts.comparisonsPassed,
        completeTaskIds: reports.firstRun.tasks.filter((row: Record<string, any>) => row.taskComplete).map((row: Record<string, any>) => row.taskId) },
      native: { attempted: native.tests, executed: native.executed, passed: native.passed, failed: native.failed,
        errors: native.errors, skipped: native.skipped },
      faultInjection: {
        injected: number(reports.consumer.faultInjection?.summary?.injected, "fault injected"),
        correctlyDetected: number(reports.consumer.faultInjection?.summary?.correctlyDetected, "fault detected"),
        missed: number(reports.consumer.faultInjection?.summary?.missed, "fault missed"),
        notApplicable: number(reports.consumer.faultInjection?.summary?.notApplicable, "fault not applicable"),
      },
      cleanReplay: { status: reports.cleanReplay.decision, attempt: number(reports.cleanReplay.attempt, "clean attempt"),
        n8Cases: number(replay.n8.cases, "clean n8 cases"), n10Tasks: number(replay.n10.tasks, "clean n10 tasks"),
        nativeLoopbackHttpCalls: number(replay.native.loopbackHttpCalls, "clean native loopback") },
      shortfalls,
    },
    researchOutcome: {
      status: "not-executed",
      candidate: null,
      tasks: researchTasks.map((row: Record<string, any>) => ({ taskId: row.taskId, status: row.status, reason: row.reason })),
      transfer: "not-assessed",
      prospectiveRuns: 0,
      preparation: { ready: false, missingConditions: [
        "n10-capability-gate-not-ready", "candidate-not-frozen", "selection-and-evaluation-protocol-not-locked",
        "post-acquisition-predictions-not-locked",
      ] },
    },
    maintenance: {
      meilisearch: { decision: reports.meilisearch.resolution?.decision,
        affectedOperation: reports.meilisearch.resolution?.affectedOperation },
      bangumi: { decision: reports.bangumi.resolution?.decision,
        affectedOperations: number(reports.bangumi.summary?.affectedOperations, "bangumi affected operations"),
        resolvedReferenceIssues: number(reports.bangumi.summary?.parsedReferenceIssues, "bangumi resolved refs"),
        liveApiValidityEstablished: reports.bangumi.resolution?.liveApiValidityEstablished === true },
      historicalClean002: { decision: reports.archiveSearch.result?.decision,
        recoveredExact: reports.archiveSearch.result?.recoveredExact === true,
        historicalGapRemains: reports.archiveSearch.result?.historicalGapRemains === true },
      externalComparison: { decision: reports.comparison.decision,
        baselinePassed: number(reports.comparison.summary?.baselinePassed, "external baseline passed"),
        baselineRuns: number(reports.comparison.summary?.baselineRuns, "external baseline runs"),
        faultDetected: number(reports.comparison.summary?.correctlyDetectedFaults, "external fault detected"),
        faultMissed: number(reports.comparison.summary?.missedFaults, "external fault missed"),
        faultNotApplicable: number(reports.comparison.summary?.notApplicableFaults, "external fault n/a") },
    },
    cost: {
      projectRuntime: { sourceApiCalls: number(reports.statusSnapshot.accounting?.sourceApiCalls, "source calls"),
        businessApiCalls: number(reports.statusSnapshot.accounting?.businessApiCalls, "business calls"),
        modelCalls: number(reports.statusSnapshot.accounting?.modelCalls, "model calls"),
        paidCalls: number(reports.statusSnapshot.accounting?.paidCalls, "paid calls"),
        nativeLoopbackHttpCalls: number(reports.statusSnapshot.accounting?.nativeLoopbackHttpCalls, "native loopback"),
        monetaryCost: "not-measured" },
      developmentAgent: String(reports.statusSnapshot.accounting?.developmentAgentCost ?? "not-measured"),
      separate: true,
    },
    humanBoundary: { mappingAuthority: "agent-reviewed-existing-ledger",
      semanticReview: "natural-language mapping was not independently human-validated and remains reviewable",
      measuredHumanTime: false, humanSavingsClaimed: false },
    protectedBoundary: { historicalDocumentResult: "0/6-unchanged", heldOutReads: 0, q1ReservedReads: 0,
      prospectiveRuns: 0, historicalReadinessChanged: false },
    remainingIssues: [...reports.statusSnapshot.unresolvedIssues, ...shortfalls],
    nextSteps: [
      "Use the ordinary task command for supported OpenAPI 3.0.x request-json or explicitly-oracled pytest work; inspect taskComplete and required-obligation states per task.",
      "If development resumes, add a shared semantics-preserving representation for the documented form-minimal and constraint-negative gaps, then rerun the fixed N10 panel under a new development revision.",
      "Only after the capability gate passes, separately preregister a candidate, selection/evaluation/failure protocol, and predictions before reading or running new prospective inputs.",
    ],
    provenance: { evidence: input.evidence, deliveryVerification: input.deliveryVerification },
    claimLimits: [
      "A locally checked operation/task does not establish a complete source document, whole skill, or live API behavior.",
      "The research chain was not executed; this report contains neither a positive nor negative prospective transfer result.",
      "Historical document-level 0/6, readiness, held-out/Q1 state, and missing clean-002 evidence are unchanged.",
      "No human-time or human-savings measurement was performed.",
    ],
    portableSemanticSha256: "",
  };
  report.portableSemanticSha256 = digestReport(report);
  return report;
}

async function command(options: { id: string; executable: string; arguments: string[]; cwd: string; timeoutMs?: number }) {
  const started = performance.now();
  const process_ = Bun.spawn([options.executable, ...options.arguments], {
    cwd: options.cwd, env: process.env, stdout: "pipe", stderr: "pipe", windowsHide: true,
  });
  const stdoutPromise = new Response(process_.stdout).text();
  const stderrPromise = new Response(process_.stderr).text();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<number>((resolveTimeout) => {
    timer = setTimeout(() => { timedOut = true; process_.kill(); resolveTimeout(-1); }, options.timeoutMs ?? 300_000);
  });
  const exitCode = await Promise.race([process_.exited, timeout]);
  if (timer) clearTimeout(timer);
  if (timedOut) await process_.exited.catch(() => -1);
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return { id: options.id, executable: portable(options.executable), arguments: options.arguments.map(portable),
    exitCode, timedOut, durationMs: Number((performance.now() - started).toFixed(3)), stdout, stderr } satisfies CommandEvidence;
}

function testSummary(output: string) {
  return { passed: Number(/([0-9]+) pass/u.exec(output)?.[1] ?? 0), failed: Number(/([0-9]+) fail/u.exec(output)?.[1] ?? 0),
    assertions: Number(/([0-9]+) expect\(\) calls/u.exec(output)?.[1] ?? 0) };
}

async function gitBytes(repositoryRoot: string, arguments_: string[]) {
  const process_ = Bun.spawn(["git", ...arguments_], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [bytes, stderr, exitCode] = await Promise.all([
    new Response(process_.stdout).arrayBuffer(), new Response(process_.stderr).text(), process_.exited,
  ]);
  if (exitCode !== 0) throw new Error(`N15 git ${arguments_.join(" ")} failed: ${stderr.trim()}`);
  return new Uint8Array(bytes);
}

async function readEvidenceCommit(repositoryRoot: string, evidenceCommit: string) {
  const reports = {} as EvidenceReports;
  const evidence = {} as Record<EvidenceName, Binding>;
  for (const [name, path] of Object.entries(CURRENT_V2_N15_EVIDENCE_PATHS) as Array<[EvidenceName, string]>) {
    const bytes = await gitBytes(repositoryRoot, ["show", `${evidenceCommit}:${path}`]);
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, any>;
    if (value.schemaVersion !== EXPECTED_SCHEMAS[name] || value.identity !== IDENTITY) {
      throw new Error(`N15 exact-commit evidence identity/schema mismatch: ${name}`);
    }
    reports[name] = value;
    evidence[name] = { path, sha256: sha(bytes), bytes: bytes.byteLength };
  }
  return { reports, evidence };
}

async function writeExclusive(path: string, bytes: Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}

const FOCUSED_TESTS = [
  "./src/skill-ir/skill-family-current-v2-corpus.test.ts",
  "./src/skill-ir/api-task-contract.test.ts",
  "./src/skill-ir/api-task-plan.test.ts",
  "./src/skill-ir/skill-family-current-v2-n2.test.ts",
  "./src/skill-ir/api-tester-source-closure.test.ts",
  "./src/skill-ir/skill-family-current-v2-n3.test.ts",
  "./src/skill-ir/api-task-artifact.test.ts",
  "./src/skill-ir/skill-family-current-v2-n5.test.ts",
  "./src/skill-ir/api-task-run.test.ts",
  "./src/cli/api-task.test.ts",
  "./src/skill-ir/skill-family-current-v2-n8.test.ts",
  "./src/skill-ir/skill-family-current-v2-n10.test.ts",
  "./src/skill-ir/skill-family-current-v2-readiness.test.ts",
  "./src/skill-ir/skill-family-current-v2-research.test.ts",
  "./src/skill-ir/skill-family-current-v2-n13.test.ts",
  "./src/skill-ir/skill-family-current-v2-n4.test.ts",
  "./src/skill-ir/skill-family-current-v2-n6.test.ts",
  "./src/skill-ir/skill-family-current-v2-n14.test.ts",
  "./src/skill-ir/skill-family-current-v2-n15.test.ts",
  "./scripts/skill-ir/skill-family-current-v2-prospective.test.ts",
] as const;

export async function writeCurrentV2N15Delivery(options: {
  repositoryRoot: string;
  deliveryCodeCommit: string;
  evidenceCommit: string;
  generatedAt?: string;
}) {
  if (!HEX_40.test(options.deliveryCodeCommit) || !HEX_40.test(options.evidenceCommit)) throw new Error("N15 commits are invalid");
  const [headBytes, originBytes] = await Promise.all([
    gitBytes(options.repositoryRoot, ["rev-parse", "HEAD"]),
    gitBytes(options.repositoryRoot, ["rev-parse", "origin/skill-ir-aot"]),
  ]);
  const head = new TextDecoder().decode(headBytes).trim();
  const origin = new TextDecoder().decode(originBytes).trim();
  if (head !== options.deliveryCodeCommit || origin !== options.deliveryCodeCommit) throw new Error("N15 delivery code is not the pushed HEAD");
  const [focused, typecheck, docUnit, docFull, diffCheck, tracked] = await Promise.all([
    command({ id: "focused-tests", executable: process.execPath, arguments: ["test", ...FOCUSED_TESTS],
      cwd: options.repositoryRoot, timeoutMs: 300_000 }),
    command({ id: "typecheck", executable: process.execPath, arguments: ["run", "typecheck"],
      cwd: options.repositoryRoot, timeoutMs: 300_000 }),
    command({ id: "doc-link-unit", executable: "python", arguments: ["scripts/check_skill_ir_doc_links_test.py"],
      cwd: options.repositoryRoot, timeoutMs: 120_000 }),
    command({ id: "doc-link-full", executable: "python", arguments: ["scripts/check_skill_ir_doc_links.py", "--root", "."],
      cwd: options.repositoryRoot, timeoutMs: 180_000 }),
    command({ id: "diff-check", executable: "git", arguments: ["diff", "--check"], cwd: options.repositoryRoot }),
    command({ id: "tracked-clean", executable: "git", arguments: ["status", "--porcelain", "--untracked-files=no"], cwd: options.repositoryRoot }),
  ]);
  const focusedSummary = testSummary(`${focused.stdout}\n${focused.stderr}`);
  let docResult: Record<string, any> = {};
  try { docResult = JSON.parse(docFull.stdout); } catch { docResult = {}; }
  const summary = {
    focusedPassed: focusedSummary.passed,
    focusedFailed: focusedSummary.failed,
    assertions: focusedSummary.assertions,
    typecheckExitCode: typecheck.exitCode,
    docLinkUnitExitCode: docUnit.exitCode,
    docLinkFullExitCode: docFull.exitCode,
    brokenDocReferences: Array.isArray(docResult.brokenReferences) ? docResult.brokenReferences.length : -1,
    legacyDocReferences: Array.isArray(docResult.legacyReferences) ? docResult.legacyReferences.length : -1,
    retiredDocReferences: Array.isArray(docResult.retiredReferences) ? docResult.retiredReferences.length : -1,
    diffCheckExitCode: diffCheck.exitCode,
    trackedClean: tracked.exitCode === 0 && tracked.stdout.trim() === "",
    headMatchesOrigin: head === origin,
  };
  const issues = [
    ...(focused.exitCode === 0 && focusedSummary.failed === 0 && focusedSummary.passed > 0 ? [] : ["focused-tests-failed"]),
    ...(typecheck.exitCode === 0 ? [] : ["typecheck-failed"]),
    ...(docUnit.exitCode === 0 ? [] : ["doc-link-unit-failed"]),
    ...(docFull.exitCode === 0 && summary.brokenDocReferences === 0 && summary.legacyDocReferences === 0 ? [] : ["doc-link-full-failed"]),
    ...(diffCheck.exitCode === 0 ? [] : ["git-diff-check-failed"]),
    ...(summary.trackedClean ? [] : ["tracked-worktree-dirty-before-delivery"]),
    ...(summary.headMatchesOrigin ? [] : ["delivery-head-not-pushed"]),
  ];
  const verification: CurrentV2N15DeliveryVerification = {
    schemaVersion: "skill-family-current-v2-n15-delivery-verification/v1",
    identity: IDENTITY,
    exposure: "development-delivery",
    deliveryCodeCommit: options.deliveryCodeCommit,
    evidenceCommit: options.evidenceCommit,
    verifiedAt: options.generatedAt ?? new Date().toISOString(),
    commands: [focused, typecheck, docUnit, docFull, diffCheck, tracked],
    summary,
    decision: issues.length === 0 ? "passed" : "failed",
    issues,
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 },
  };
  const verificationBytes = new TextEncoder().encode(`${JSON.stringify(verification, null, 2)}\n`);
  await writeExclusive(join(options.repositoryRoot, VERIFICATION_PATH), verificationBytes);
  if (verification.decision !== "passed") return { outcome: "failed" as const, verification, report: null };
  const { reports, evidence } = await readEvidenceCommit(options.repositoryRoot, options.evidenceCommit);
  const final = buildCurrentV2N15FinalReport({
    deliveryCodeCommit: options.deliveryCodeCommit,
    evidenceCommit: options.evidenceCommit,
    generatedAt: verification.verifiedAt,
    evidence,
    deliveryVerification: { path: VERIFICATION_PATH, sha256: sha(verificationBytes), bytes: verificationBytes.byteLength },
    verification,
    reports,
  });
  const reportBytes = new TextEncoder().encode(`${JSON.stringify(final, null, 2)}\n`);
  await writeExclusive(join(options.repositoryRoot, FINAL_PATH), reportBytes);
  return { outcome: "completed" as const, verification, report: final,
    files: [{ path: VERIFICATION_PATH, sha256: sha(verificationBytes), bytes: verificationBytes.byteLength },
      { path: FINAL_PATH, sha256: sha(reportBytes), bytes: reportBytes.byteLength }] };
}

export async function verifyCurrentV2N15Delivery(options: { repositoryRoot: string; report: CurrentV2N15FinalReport }) {
  const errors = new Set<string>();
  let verification: CurrentV2N15DeliveryVerification | null = null;
  try {
    const binding = options.report.provenance.deliveryVerification;
    if (!validBinding(binding) || binding.path !== VERIFICATION_PATH) throw new Error("path");
    const bytes = new Uint8Array(await readFile(join(options.repositoryRoot, binding.path)));
    if (sha(bytes) !== binding.sha256 || bytes.byteLength !== binding.bytes) errors.add("N15_DELIVERY_VERIFICATION_BINDING_MISMATCH");
    verification = JSON.parse(new TextDecoder().decode(bytes)) as CurrentV2N15DeliveryVerification;
    if (verification.schemaVersion !== "skill-family-current-v2-n15-delivery-verification/v1"
      || verification.identity !== IDENTITY || verification.deliveryCodeCommit !== options.report.deliveryCodeCommit
      || verification.evidenceCommit !== options.report.evidenceCommit || verification.decision !== "passed") {
      errors.add("N15_DELIVERY_VERIFICATION_INVALID");
    }
  } catch {
    errors.add("N15_DELIVERY_VERIFICATION_UNREADABLE");
  }
  let material: Awaited<ReturnType<typeof readEvidenceCommit>> | null = null;
  try {
    material = await readEvidenceCommit(options.repositoryRoot, options.report.evidenceCommit);
    for (const name of Object.keys(CURRENT_V2_N15_EVIDENCE_PATHS) as EvidenceName[]) {
      if (stable(material.evidence[name]) !== stable(options.report.provenance.evidence[name])) {
        errors.add(`N15_EVIDENCE_BINDING_MISMATCH:${name}`);
      }
    }
  } catch (error) {
    errors.add(`N15_EVIDENCE_UNREADABLE:${error instanceof Error ? error.message : String(error)}`);
  }
  if (verification && material) {
    try {
      const rebuilt = buildCurrentV2N15FinalReport({
        deliveryCodeCommit: options.report.deliveryCodeCommit,
        evidenceCommit: options.report.evidenceCommit,
        generatedAt: options.report.generatedAt,
        evidence: material.evidence,
        deliveryVerification: options.report.provenance.deliveryVerification,
        verification,
        reports: material.reports,
      });
      if (stable(rebuilt) !== stable(options.report)) errors.add("N15_FINAL_REPORT_RECOMPUTATION_MISMATCH");
    } catch (error) {
      errors.add(`N15_FINAL_REPORT_RECOMPUTATION_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { status: errors.size === 0 ? "pass" as const : "fail" as const, errors: [...errors].sort() };
}

export const CURRENT_V2_N15_FINAL_PATH = FINAL_PATH;
export const CURRENT_V2_N15_VERIFICATION_PATH = VERIFICATION_PATH;
