import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preflightSkillEligibility, type EligibilityInput, type EligibilityRecord } from "../../src/skill-ir/skill-family-eligibility";

export const CLASS_PROOF_IDENTITY = "skill-family-class-proof-002" as const;
export const CLASS_PROOF_PLAN_REVISION = 1 as const;
export const CLASS_PROOF_RESULT_RELATIVE = "results/skill-ir/skill-family-class-proof-20260911" as const;
export const CLASS_PROOF_STATUS_FILE = "execution-status.json" as const;

export type ClassProofStep =
  | "planned"
  | "screening"
  | "screening-shortfall"
  | "development"
  | "capability-ready"
  | "method-locked"
  | "primary-running"
  | "revised-once"
  | "no-revision"
  | "reported"
  | "extension-running"
  | "method-not-ready"
  | "blocked-before-evaluation";

export type ClassProofStatus = {
  identity: typeof CLASS_PROOF_IDENTITY;
  planRevision: typeof CLASS_PROOF_PLAN_REVISION;
  currentStep: ClassProofStep;
  lastCompletedStep: ClassProofStep | null;
  branch: string;
  head: string;
  upstream: string | null;
  trackedStatus: string;
  externalAccounting: { modelCalls: number; apiCalls: number; paidCalls: number };
  protectedReads: { heldOut: number; q1Reserved: number; historicalResultsChanged: boolean };
  failureSummary: string[];
  updatedAt: string;
};

const STEP_ORDER: Record<ClassProofStep, number> = {
  planned: 0,
  screening: 1,
  "screening-shortfall": 2,
  development: 3,
  "capability-ready": 4,
  "method-locked": 5,
  "primary-running": 6,
  "revised-once": 7,
  "no-revision": 7,
  reported: 8,
  "extension-running": 9,
  "method-not-ready": 9,
  "blocked-before-evaluation": 9,
};

export function transitionStatus(current: ClassProofStep, next: ClassProofStep): ClassProofStep {
  if (!(current in STEP_ORDER) || !(next in STEP_ORDER)) throw new Error("unknown class-proof state");
  if (STEP_ORDER[next] < STEP_ORDER[current]) throw new Error(`backward class-proof transition: ${current} -> ${next}`);
  return next;
}

export function deriveTransferDecision(input: {
  primaryMembers: number;
  inputQualifiedMembers: number;
  minInputsPerMember: number;
  coreCoverage: number;
  firstRunAcceptedMembers: number;
  checkerPassRate: number;
}): "strong-positive" | "bounded-positive" | "bounded-negative" | "insufficient-evidence" {
  if (input.inputQualifiedMembers < 3 || input.primaryMembers < 3 || input.minInputsPerMember < 2) return "insufficient-evidence";
  if (input.coreCoverage >= 0.95 && input.firstRunAcceptedMembers >= 3 && input.checkerPassRate === 1) return "strong-positive";
  if (input.coreCoverage >= 0.9 && input.firstRunAcceptedMembers >= 2 && input.checkerPassRate === 1) return "bounded-positive";
  return "bounded-negative";
}

export type ScreeningResult = {
  eligibility: EligibilityRecord;
  constructionAttempted: boolean;
};

export function screenCandidate(input: EligibilityInput, construct: () => unknown = () => undefined): ScreeningResult {
  const eligibility = preflightSkillEligibility(input);
  if (eligibility.decision !== "eligible") return { eligibility, constructionAttempted: false };
  construct();
  return { eligibility, constructionAttempted: true };
}

function git(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function statusPath(root: string): string {
  return join(root, CLASS_PROOF_RESULT_RELATIVE, CLASS_PROOF_STATUS_FILE);
}

function initialStatus(root: string): ClassProofStatus {
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const upstream = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || null;
  const trackedStatus = git(root, ["status", "--short", "--branch"]);
  return {
    identity: CLASS_PROOF_IDENTITY,
    planRevision: CLASS_PROOF_PLAN_REVISION,
    currentStep: "planned",
    lastCompletedStep: null,
    branch,
    head,
    upstream,
    trackedStatus,
    externalAccounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
    protectedReads: { heldOut: 0, q1Reserved: 0, historicalResultsChanged: false },
    failureSummary: [],
    updatedAt: new Date().toISOString(),
  };
}

function validateStatus(value: unknown): ClassProofStatus {
  if (!value || typeof value !== "object") throw new Error("class-proof status must be an object");
  const row = value as Partial<ClassProofStatus>;
  if (row.identity !== CLASS_PROOF_IDENTITY || row.planRevision !== CLASS_PROOF_PLAN_REVISION) {
    throw new Error("class-proof status identity or plan revision mismatch");
  }
  if (typeof row.currentStep !== "string" || typeof row.updatedAt !== "string") {
    throw new Error("class-proof status fields are invalid");
  }
  if (!row.externalAccounting || !row.protectedReads || !Array.isArray(row.failureSummary)) {
    throw new Error("class-proof status accounting is invalid");
  }
  return row as ClassProofStatus;
}

export async function runStatus(root: string): Promise<ClassProofStatus> {
  const absoluteRoot = resolve(root);
  const directory = join(absoluteRoot, CLASS_PROOF_RESULT_RELATIVE);
  await mkdir(directory, { recursive: true });
  const path = statusPath(absoluteRoot);
  try {
    return validateStatus(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const status = initialStatus(absoluteRoot);
  await writeFile(path, `${JSON.stringify(status, null, 2)}\n`, { flag: "wx", encoding: "utf8" });
  return status;
}

export async function writeStatus(root: string, patch: Partial<ClassProofStatus>): Promise<ClassProofStatus> {
  const current = await runStatus(root);
  const next = validateStatus({ ...current, ...patch, updatedAt: new Date().toISOString() });
  await writeFile(statusPath(resolve(root)), `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8" });
  return next;
}

if (import.meta.main) {
  const step = process.argv.find((value) => value.startsWith("--step="))?.slice("--step=".length);
  const root = process.cwd();
  if (step === "status" || step === undefined) {
    console.log(JSON.stringify(await runStatus(root), null, 2));
  } else {
    throw new Error("usage: bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status");
  }
}
