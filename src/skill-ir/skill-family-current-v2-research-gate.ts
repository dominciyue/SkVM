import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const RESULT_ROOT = "results/skill-ir/skill-family-current-v2-source-repair-001";
const BOUND_PATHS = [
  `${RESULT_ROOT}/execution-status.json`,
  `${RESULT_ROOT}/development/first-run.json`,
  `${RESULT_ROOT}/development/revision-001.json`,
  `${RESULT_ROOT}/readiness/report.json`,
] as const;
const FORBIDDEN_PATHS = [
  `${RESULT_ROOT}/candidate/code-lock.json`,
  `${RESULT_ROOT}/candidate/support-matrix.json`,
  `${RESULT_ROOT}/prospective/code-candidate-lock.json`,
  `${RESULT_ROOT}/prospective/protocol.json`,
  `${RESULT_ROOT}/prospective/source-lock.json`,
  `${RESULT_ROOT}/prospective/predictions.json`,
  `${RESULT_ROOT}/prospective/first-run-report.json`,
] as const;

type FileBinding = { path: string; commit: string; sha256: string; bytes: number };

export type CurrentV2ResearchNotExecutedReport = {
  schemaVersion: "skill-family-current-v2-research-not-executed/v1";
  identity: typeof IDENTITY;
  exposure: "development";
  evaluatedAt: string;
  codeCommit: string;
  bindings: FileBinding[];
  gate: {
    n10MethodGate: "method-not-ready";
    n10RevisionDecision: "no-safe-shared-revision";
    readinessDecision: "engineering-ready-research-not-ready";
    capabilityStatus: "not-ready";
    protocolStatus: "not-ready";
    prospectiveStatus: "not-ready";
    transferStatus: "not-assessed";
  };
  tasks: Array<{ taskId: "N9" | "N11" | "N12"; status: "not-executed"; reason: string }>;
  forbiddenArtifacts: Array<{ path: string; existsAtCodeCommit: false }>;
  protectedState: { heldOutReads: number; q1ReservedReads: number; prospectiveRuns: number };
  decision: "research-not-executed";
  nextEngineeringTask: "N13";
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

async function gitResult(repositoryRoot: string, arguments_: string[]) {
  const process = Bun.spawn(["git", ...arguments_], { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout: new Uint8Array(stdout), stderr, exitCode };
}

async function committedFile(repositoryRoot: string, commit: string, path: string): Promise<{ binding: FileBinding; value: any }> {
  const result = await gitResult(repositoryRoot, ["show", `${commit}:${path}`]);
  if (result.exitCode !== 0) throw new Error(`research gate cannot read ${path}: ${result.stderr.trim()}`);
  return {
    binding: { path, commit, sha256: sha(result.stdout), bytes: result.stdout.byteLength },
    value: JSON.parse(new TextDecoder().decode(result.stdout)),
  };
}

async function existsAtCommit(repositoryRoot: string, commit: string, path: string): Promise<boolean> {
  return (await gitResult(repositoryRoot, ["cat-file", "-e", `${commit}:${path}`])).exitCode === 0;
}

export async function buildCurrentV2ResearchNotExecutedReport(options: {
  repositoryRoot: string;
  codeCommit: string;
  evaluatedAt: string;
}): Promise<CurrentV2ResearchNotExecutedReport> {
  if (!/^[0-9a-f]{40}$/u.test(options.codeCommit)) throw new Error("research gate code commit is invalid");
  const files = await Promise.all(BOUND_PATHS.map((path) => committedFile(options.repositoryRoot, options.codeCommit, path)));
  const [status, firstRun, revision, readiness] = files.map((row) => row.value);
  if (status.identity !== IDENTITY || status.currentStage !== "N9" || status.tasks?.N7?.status !== "completed"
    || status.tasks?.N10?.status !== "completed-with-limitation") {
    throw new Error("research gate status snapshot is not at N9 after limited N10 and completed N7");
  }
  if (firstRun.methodGate?.decision !== "method-not-ready"
    || revision.decision !== "no-safe-shared-revision"
    || readiness.decision !== "engineering-ready-research-not-ready"
    || readiness.dimensions?.capability?.status !== "not-ready"
    || readiness.dimensions?.protocol?.status !== "not-ready"
    || readiness.dimensions?.prospective?.status !== "not-ready"
    || readiness.dimensions?.transfer?.status !== "not-assessed") {
    throw new Error("research gate prerequisite decisions do not prohibit candidate freeze");
  }
  const forbiddenArtifacts = await Promise.all(FORBIDDEN_PATHS.map(async (path) => ({
    path,
    existsAtCodeCommit: await existsAtCommit(options.repositoryRoot, options.codeCommit, path),
  })));
  if (forbiddenArtifacts.some((row) => row.existsAtCodeCommit)) throw new Error("research artifact exists despite failed method gate");
  return {
    schemaVersion: "skill-family-current-v2-research-not-executed/v1",
    identity: IDENTITY,
    exposure: "development",
    evaluatedAt: options.evaluatedAt,
    codeCommit: options.codeCommit,
    bindings: files.map((row) => row.binding),
    gate: {
      n10MethodGate: "method-not-ready",
      n10RevisionDecision: "no-safe-shared-revision",
      readinessDecision: "engineering-ready-research-not-ready",
      capabilityStatus: "not-ready",
      protocolStatus: "not-ready",
      prospectiveStatus: "not-ready",
      transferStatus: "not-assessed",
    },
    tasks: [
      { taskId: "N9", status: "not-executed", reason: "n10-method-gate-not-ready" },
      { taskId: "N11", status: "not-executed", reason: "candidate-freeze-not-executed" },
      { taskId: "N12", status: "not-executed", reason: "protocol-and-predictions-not-locked" },
    ],
    forbiddenArtifacts: forbiddenArtifacts as CurrentV2ResearchNotExecutedReport["forbiddenArtifacts"],
    protectedState: {
      heldOutReads: status.protectedState?.heldOutReads ?? 0,
      q1ReservedReads: status.protectedState?.q1ReservedReads ?? 0,
      prospectiveRuns: status.protectedState?.prospectiveRuns ?? 0,
    },
    decision: "research-not-executed",
    nextEngineeringTask: "N13",
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 },
    claimLimits: [
      "No candidate code lock, source selection, prediction, or prospective first-run was created.",
      "Not-executed is a protocol outcome, not a negative transfer result.",
      "N14 may replay engineering code only and cannot promote it to a research candidate.",
      "Historical held-out, Q1, readiness, and document-level 0/6 facts remain unchanged.",
    ],
  };
}

export async function verifyCurrentV2ResearchNotExecutedReport(options: {
  repositoryRoot: string;
  report?: CurrentV2ResearchNotExecutedReport;
}): Promise<{ status: "pass" | "fail"; errors: string[] }> {
  const errors = new Set<string>();
  let report = options.report;
  try {
    report ??= JSON.parse(await readFile(join(options.repositoryRoot, `${RESULT_ROOT}/prospective/not-executed-report.json`), "utf8"));
  } catch {
    return { status: "fail", errors: ["RESEARCH_GATE_REPORT_UNREADABLE"] };
  }
  if (!report) return { status: "fail", errors: ["RESEARCH_GATE_REPORT_UNREADABLE"] };
  if (report.schemaVersion !== "skill-family-current-v2-research-not-executed/v1" || report.identity !== IDENTITY
    || report.exposure !== "development" || !/^[0-9a-f]{40}$/u.test(report.codeCommit)) {
    errors.add("RESEARCH_GATE_HEADER_INVALID");
  }
  try {
    const expected = await buildCurrentV2ResearchNotExecutedReport({
      repositoryRoot: options.repositoryRoot,
      codeCommit: report.codeCommit,
      evaluatedAt: report.evaluatedAt,
    });
    if (stable({ gate: report.gate, tasks: report.tasks, forbiddenArtifacts: report.forbiddenArtifacts, decision: report.decision })
      !== stable({ gate: expected.gate, tasks: expected.tasks, forbiddenArtifacts: expected.forbiddenArtifacts, decision: expected.decision })) {
      errors.add("RESEARCH_GATE_DECISION_MISMATCH");
    }
    if (stable(report.bindings) !== stable(expected.bindings)) errors.add("RESEARCH_GATE_BINDING_MISMATCH");
    if (stable(report) !== stable(expected)) errors.add("RESEARCH_GATE_REPORT_MISMATCH");
  } catch {
    errors.add("RESEARCH_GATE_RECOMPUTATION_FAILED");
  }
  if (Object.values(report.protectedState).some((value) => value !== 0)) errors.add("RESEARCH_GATE_PROTECTED_COUNTER_NONZERO");
  if (Object.values(report.accounting).some((value) => value !== 0)) errors.add("RESEARCH_GATE_ACCOUNTING_NONZERO");
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort() };
}

export async function writeCurrentV2ResearchNotExecutedReport(options: {
  repositoryRoot: string;
  codeCommit: string;
  evaluatedAt: string;
}): Promise<{ report: CurrentV2ResearchNotExecutedReport; file: { path: string; sha256: string; bytes: number } }> {
  const report = await buildCurrentV2ResearchNotExecutedReport(options);
  const relativePath = `${RESULT_ROOT}/prospective/not-executed-report.json`;
  const text = `${JSON.stringify(report, null, 2)}\n`;
  await mkdir(dirname(join(options.repositoryRoot, relativePath)), { recursive: true });
  await writeFile(join(options.repositoryRoot, relativePath), text, { flag: "wx" });
  return { report, file: { path: relativePath, sha256: sha(text), bytes: Buffer.byteLength(text) } };
}
