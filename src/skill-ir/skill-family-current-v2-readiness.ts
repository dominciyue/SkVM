import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";
const STATUS_PATH = `${RESULT_ROOT}/execution-status.json`;
const EVIDENCE_PATHS = [
  `${RESULT_ROOT}/baseline/gap-matrix.json`,
  `${RESULT_ROOT}/source-closure/report.json`,
  `${RESULT_ROOT}/integration/consumer-report.json`,
  `${RESULT_ROOT}/integration/engine-report.json`,
  `${RESULT_ROOT}/development/first-run.json`,
  `${RESULT_ROOT}/development/revision-001.json`,
  "docs/skill-ir/skill-ir-aot-optimization-spec.md",
] as const;

export type ReadinessStatus = "ready" | "not-ready" | "not-assessed";
export type ReadinessDimension = { status: ReadinessStatus; reasons: string[]; evidence: string[] };

export type CurrentV2ReadinessInput = {
  methodChecks: {
    taskContract: boolean;
    completePlan: boolean;
    mappingUncertainty: boolean;
    sourceClosure: boolean;
    independentChecker: boolean;
    assignedFaultDetection: boolean;
    ordinaryEntry: boolean;
  };
  methodGatePassed: boolean;
  tasks: Array<{
    taskId: string;
    sourceBlocking: number;
    sourceAssessed: boolean;
    packageCheck: "pass" | "fail" | "not-produced";
    runStatus: string;
    taskComplete: boolean;
  }>;
  protocol: {
    codeCandidateLocked: boolean;
    selectionRulesLocked: boolean;
    evaluationPolicyLocked: boolean;
    failurePolicyLocked: boolean;
  };
  prospective: {
    authorized: boolean;
    selectedSourcesSufficient: boolean;
    postAcquisitionPredictionsLocked: boolean;
    authorizedUnseenReads: number;
    protectedReadViolations: number;
    prospectiveRuns: number;
  };
  transferResult: "passed" | "failed" | null;
  reproduction: {
    ordinaryEntryReplay: boolean;
    bundleReplay: boolean;
    nativeFixtureReplay: boolean;
  };
};

export type CurrentV2ReadinessDerivation = {
  dimensions: {
    method: ReadinessDimension;
    capability: ReadinessDimension;
    sourceInput: ReadinessDimension;
    protocol: ReadinessDimension;
    prospective: ReadinessDimension;
    transfer: ReadinessDimension;
    reproducible: ReadinessDimension;
    authorizedUnseenRead: ReadinessDimension;
    protectedIsolation: ReadinessDimension;
  };
  tasks: Array<{
    taskId: string;
    source: ReadinessDimension;
    input: ReadinessDimension;
    capability: ReadinessDimension;
  }>;
};

type FileBinding = { path: string; commit: string; sha256: string; bytes: number };

export type CurrentV2ReadinessReport = CurrentV2ReadinessDerivation & {
  schemaVersion: "skill-family-current-v2-readiness/v1";
  identity: typeof IDENTITY;
  exposure: "development";
  evaluatedAt: string;
  codeCommit: string;
  bindings: { statusBefore: FileBinding; evidence: FileBinding[] };
  inputSnapshot: CurrentV2ReadinessInput;
  summary: {
    taskCount: number;
    sourceReady: number;
    inputReady: number;
    capabilityReady: number;
    capabilityNotReady: number;
    capabilityNotAssessed: number;
  };
  decision: "engineering-ready-research-not-ready" | "research-protocol-ready" | "not-ready";
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0; nativeLoopbackHttpCalls: 0 };
  claimLimits: string[];
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stable = (value: unknown) => JSON.stringify(canonical(value));

function dimension(status: ReadinessStatus, reasons: string[], evidence: string[]): ReadinessDimension {
  return { status, reasons: [...new Set(reasons)].sort(), evidence: [...new Set(evidence)].sort() };
}

export function deriveCurrentV2Readiness(input: CurrentV2ReadinessInput): CurrentV2ReadinessDerivation {
  const tasks = input.tasks.map((row) => ({
    taskId: row.taskId,
    source: !row.sourceAssessed
      ? dimension("not-assessed", ["task-source-not-assessed"], [row.taskId])
      : row.sourceBlocking > 0
        ? dimension("not-ready", ["task-source-blocking-dependency"], [row.taskId])
        : dimension("ready", ["task-source-closure-ready"], [row.taskId]),
    input: row.runStatus !== "completed"
      ? dimension("not-assessed", ["task-input-not-run"], [row.taskId])
      : row.packageCheck !== "pass"
        ? dimension("not-ready", ["task-package-check-not-pass"], [row.taskId])
        : dimension("ready", ["task-input-bound-and-package-checked"], [row.taskId]),
    capability: row.runStatus !== "completed"
      ? dimension("not-assessed", ["task-capability-not-run"], [row.taskId])
      : row.taskComplete
        ? dimension("ready", ["all-required-task-obligations-checked-exported"], [row.taskId])
        : dimension("not-ready", ["required-task-obligations-unresolved-or-failed"], [row.taskId]),
  }));

  const methodMissing = Object.entries(input.methodChecks).filter(([, value]) => !value).map(([key]) => `method-check-missing:${key}`);
  const method = methodMissing.length
    ? dimension("not-ready", methodMissing, ["N2", "N3", "N5", "N8"])
    : dimension("ready", ["task-engine-method-contracts-verified"], ["N2", "N3", "N5", "N8"]);
  const capability = input.methodGatePassed
    ? dimension("ready", ["n10-method-gate-passed"], ["N10:first-run", "N10:revision"])
    : dimension("not-ready", ["n10-method-gate-not-ready"], ["N10:first-run", "N10:revision"]);
  const sourceNotReady = tasks.filter((row) => row.source.status === "not-ready").length;
  const sourceNotAssessed = tasks.filter((row) => row.source.status === "not-assessed").length;
  const sourceInput = tasks.length === 0 || sourceNotAssessed > 0
    ? dimension("not-assessed", ["one-or-more-task-sources-not-assessed"], tasks.map((row) => row.taskId))
    : sourceNotReady > 0
      ? dimension("not-ready", ["one-or-more-task-sources-blocked"], tasks.map((row) => row.taskId))
      : dimension("ready", ["all-fixed-task-sources-closure-ready"], tasks.map((row) => row.taskId));

  const protocolMissing = Object.entries(input.protocol).filter(([, value]) => !value).map(([key]) => `protocol-lock-missing:${key}`);
  const protocol = protocolMissing.length
    ? dimension("not-ready", protocolMissing, ["N9", "N11:T0"])
    : dimension("ready", ["candidate-selection-evaluation-and-failure-policy-locked"], ["N9", "N11:T0"]);
  const prospectiveReasons = [
    ...(protocol.status === "ready" ? [] : ["protocol-not-ready"]),
    ...(input.prospective.authorized ? [] : ["unseen-read-not-authorized"]),
    ...(input.prospective.selectedSourcesSufficient ? [] : ["selected-task-sources-insufficient"]),
    ...(input.prospective.postAcquisitionPredictionsLocked ? [] : ["post-acquisition-predictions-not-locked"]),
    ...(input.prospective.protectedReadViolations === 0 ? [] : ["protected-read-violation"]),
  ];
  const prospective = prospectiveReasons.length
    ? dimension("not-ready", prospectiveReasons, ["N9", "N11"])
    : dimension("ready", ["protocol-source-input-and-prediction-ready"], ["N9", "N11"]);
  const transfer = input.prospective.prospectiveRuns === 0
    ? dimension("not-assessed", ["no-prospective-first-run"], ["N12"])
    : input.transferResult === "passed"
      ? dimension("ready", ["prospective-transfer-passed"], ["N12"])
      : input.transferResult === "failed"
        ? dimension("not-ready", ["prospective-transfer-failed"], ["N12"])
        : dimension("not-assessed", ["prospective-run-result-unavailable"], ["N12"]);
  const reproductionMissing = Object.entries(input.reproduction).filter(([, value]) => !value).map(([key]) => `replay-missing:${key}`);
  const reproducible = reproductionMissing.length
    ? dimension("not-ready", reproductionMissing, ["N5", "N8"])
    : dimension("ready", ["ordinary-entry-bundle-and-native-fixture-replay-pass"], ["N5", "N8"]);
  const authorizedUnseenRead = input.prospective.authorized
    ? dimension("ready", ["unseen-read-authorized-subject-to-locked-protocol"], ["project-spec:14.28"])
    : dimension("not-ready", ["unseen-read-not-authorized"], ["project-spec:14.28"]);
  const protectedIsolation = input.prospective.protectedReadViolations === 0
    ? dimension("ready", ["no-protected-read-violation-recorded"], ["status-before-N7"])
    : dimension("not-ready", ["protected-read-violation"], ["status-before-N7"]);
  return {
    dimensions: { method, capability, sourceInput, protocol, prospective, transfer, reproducible, authorizedUnseenRead, protectedIsolation },
    tasks,
  };
}

async function gitBytes(repositoryRoot: string, arguments_: string[]): Promise<Uint8Array> {
  const process = Bun.spawn(["git", ...arguments_], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`git ${arguments_.join(" ")} failed: ${stderr.trim()}`);
  return new Uint8Array(stdout);
}

async function committedFile(repositoryRoot: string, commit: string, path: string): Promise<{ binding: FileBinding; bytes: Uint8Array }> {
  const bytes = await gitBytes(repositoryRoot, ["show", `${commit}:${path}`]);
  return { binding: { path, commit, sha256: sha(bytes), bytes: bytes.byteLength }, bytes };
}

export async function buildCurrentV2ReadinessReport(options: {
  repositoryRoot: string;
  codeCommit: string;
  evaluatedAt: string;
}): Promise<CurrentV2ReadinessReport> {
  if (!/^[0-9a-f]{40}$/u.test(options.codeCommit)) throw new Error("N7 code commit is invalid");
  const [statusFile, ...evidenceFiles] = await Promise.all([
    committedFile(options.repositoryRoot, options.codeCommit, STATUS_PATH),
    ...EVIDENCE_PATHS.map((path) => committedFile(options.repositoryRoot, options.codeCommit, path)),
  ]);
  const parse = (index: number) => JSON.parse(new TextDecoder().decode(evidenceFiles[index]!.bytes));
  const status = JSON.parse(new TextDecoder().decode(statusFile.bytes));
  const gap = parse(0), closure = parse(1), consumer = parse(2), engine = parse(3), firstRun = parse(4), revision = parse(5);
  const specText = new TextDecoder().decode(evidenceFiles[6]!.bytes);
  if (status.identity !== IDENTITY || status.currentStage !== "N7" || status.tasks?.N10?.status !== "completed-with-limitation") {
    throw new Error("N7 status snapshot is not at the post-N10 boundary");
  }
  if (gap.schemaVersion !== "skill-family-current-v2-gap-matrix/v1"
    || closure.schemaVersion !== "skill-family-current-v2-source-closure-report/v1" || closure.decision !== "passed"
    || consumer.schemaVersion !== "skill-family-current-v2-n5-consumer/v1" || consumer.decision !== "passed"
    || engine.schemaVersion !== "skill-family-current-v2-n8-engine/v1" || engine.decision !== "passed"
    || firstRun.schemaVersion !== "skill-family-current-v2-n10-first-run/v1"
    || revision.schemaVersion !== "skill-family-current-v2-n10-revision/v1") {
    throw new Error("N7 evidence prerequisite is invalid");
  }
  const inputSnapshot: CurrentV2ReadinessInput = {
    methodChecks: {
      taskContract: gap.relations?.requirementChangeChangesPlan === true,
      completePlan: gap.demonstrations?.every((row: Record<string, any>) => row.verification?.status === "pass") === true,
      mappingUncertainty: gap.mappingReview?.sourceSkills >= 3
        && gap.mappingReview.rows?.every((row: Record<string, any>) => row.residualDutiesPreserved === true),
      sourceClosure: closure.decision === "passed",
      independentChecker: firstRun.summary?.packageChecksPassed === firstRun.summary?.taskContracts
        && firstRun.summary?.packageChecksFailedOrMissing === 0,
      assignedFaultDetection: consumer.faultInjection?.summary?.correctlyDetected === 8
        && consumer.faultInjection?.summary?.missed === 0,
      ordinaryEntry: engine.relations?.documentedCliExecuted === true
        && engine.relations?.bundleReplayMatchesBindings === true,
    },
    methodGatePassed: firstRun.methodGate?.decision === "passed" && revision.decision === "no-revision-needed",
    tasks: firstRun.tasks.map((row: Record<string, any>) => ({
      taskId: row.taskId,
      sourceBlocking: row.sourceClosureSummary?.blocking ?? 0,
      sourceAssessed: object(row.sourceClosureSummary),
      packageCheck: row.packageCheck,
      runStatus: row.runStatus,
      taskComplete: row.taskComplete,
    })),
    protocol: {
      codeCandidateLocked: status.tasks?.N9?.status === "completed",
      selectionRulesLocked: status.tasks?.N11?.status === "completed",
      evaluationPolicyLocked: status.tasks?.N11?.status === "completed",
      failurePolicyLocked: status.tasks?.N11?.status === "completed",
    },
    prospective: {
      authorized: /远端 API 和付费模型/u.test(specText),
      selectedSourcesSufficient: status.tasks?.N11?.status === "completed",
      postAcquisitionPredictionsLocked: status.tasks?.N11?.status === "completed",
      authorizedUnseenReads: 0,
      protectedReadViolations: (status.protectedState?.heldOutReads ?? 0) + (status.protectedState?.q1ReservedReads ?? 0),
      prospectiveRuns: status.protectedState?.prospectiveRuns ?? 0,
    },
    transferResult: null,
    reproduction: {
      ordinaryEntryReplay: engine.relations?.documentedCliExecuted === true,
      bundleReplay: engine.relations?.bundleReplayMatchesBindings === true,
      nativeFixtureReplay: consumer.fixtures?.filter((row: Record<string, any>) => row.status === "pass").length >= 2
        && consumer.accounting?.loopbackHttpCalls === 4,
    },
  };
  const derived = deriveCurrentV2Readiness(inputSnapshot);
  const summary = {
    taskCount: derived.tasks.length,
    sourceReady: derived.tasks.filter((row) => row.source.status === "ready").length,
    inputReady: derived.tasks.filter((row) => row.input.status === "ready").length,
    capabilityReady: derived.tasks.filter((row) => row.capability.status === "ready").length,
    capabilityNotReady: derived.tasks.filter((row) => row.capability.status === "not-ready").length,
    capabilityNotAssessed: derived.tasks.filter((row) => row.capability.status === "not-assessed").length,
  };
  const decision: CurrentV2ReadinessReport["decision"] = derived.dimensions.protocol.status === "ready"
    ? "research-protocol-ready"
    : derived.dimensions.method.status === "ready" && derived.dimensions.reproducible.status === "ready"
      ? "engineering-ready-research-not-ready"
      : "not-ready";
  return {
    schemaVersion: "skill-family-current-v2-readiness/v1",
    identity: IDENTITY,
    exposure: "development",
    evaluatedAt: options.evaluatedAt,
    codeCommit: options.codeCommit,
    bindings: { statusBefore: statusFile.binding, evidence: evidenceFiles.map((row) => row.binding) },
    inputSnapshot,
    ...derived,
    summary,
    decision,
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 },
    claimLimits: [
      "This task/source-scoped readiness report does not modify historical portfolio readiness.",
      "Method readiness is separate from N10 capability and prospective eligibility.",
      "Authorized unseen reads may be nonzero without being protected-read violations.",
      "Transfer remains not-assessed until a separately locked prospective first run exists.",
      "Current replay evidence is not a clean-environment result; N14 assesses that separately.",
    ],
  };
}

export async function verifyCurrentV2ReadinessReport(options: {
  repositoryRoot: string;
  report?: CurrentV2ReadinessReport;
}): Promise<{ status: "pass" | "fail"; errors: string[] }> {
  const errors = new Set<string>();
  let report = options.report;
  try {
    report ??= JSON.parse(await readFile(join(options.repositoryRoot, `${RESULT_ROOT}/readiness/report.json`), "utf8"));
  } catch {
    return { status: "fail", errors: ["READINESS_REPORT_UNREADABLE"] };
  }
  if (!report) return { status: "fail", errors: ["READINESS_REPORT_UNREADABLE"] };
  if (report.schemaVersion !== "skill-family-current-v2-readiness/v1" || report.identity !== IDENTITY
    || report.exposure !== "development" || !/^[0-9a-f]{40}$/u.test(report.codeCommit)) {
    errors.add("READINESS_HEADER_INVALID");
  }
  try {
    const expected = await buildCurrentV2ReadinessReport({
      repositoryRoot: options.repositoryRoot,
      codeCommit: report.codeCommit,
      evaluatedAt: report.evaluatedAt,
    });
    if (stable({ dimensions: report.dimensions, tasks: report.tasks, summary: report.summary, decision: report.decision })
      !== stable({ dimensions: expected.dimensions, tasks: expected.tasks, summary: expected.summary, decision: expected.decision })) {
      errors.add("READINESS_DERIVATION_MISMATCH");
    }
    if (stable(report.bindings) !== stable(expected.bindings)) errors.add("READINESS_BINDING_MISMATCH");
    if (stable(report) !== stable(expected)) errors.add("READINESS_REPORT_MISMATCH");
  } catch {
    errors.add("READINESS_RECOMPUTATION_FAILED");
  }
  if (Object.values(report.accounting).some((value) => value !== 0)) errors.add("READINESS_ACCOUNTING_NONZERO");
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort() };
}

export async function writeCurrentV2ReadinessReport(options: {
  repositoryRoot: string;
  codeCommit: string;
  evaluatedAt: string;
}): Promise<{ report: CurrentV2ReadinessReport; file: { path: string; sha256: string; bytes: number } }> {
  const report = await buildCurrentV2ReadinessReport(options);
  const relativePath = `${RESULT_ROOT}/readiness/report.json`;
  const text = `${JSON.stringify(report, null, 2)}\n`;
  await mkdir(dirname(join(options.repositoryRoot, relativePath)), { recursive: true });
  await writeFile(join(options.repositoryRoot, relativePath), text, { flag: "wx" });
  return { report, file: { path: relativePath, sha256: sha(text), bytes: Buffer.byteLength(text) } };
}
