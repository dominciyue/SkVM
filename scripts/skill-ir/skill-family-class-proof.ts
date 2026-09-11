import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AcquisitionError, createAcquirer, type Request } from "./deadline-acquire";
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

export type CandidateMetadata = {
  repository: string;
  path: string;
  sha: string;
  branch?: string;
  license?: string | null;
  source?: "github-search" | "cached-development" | "synthetic";
};

export type CandidatePoolRow = CandidateMetadata & {
  candidateId: string;
  bodyRead: false;
  selection: "uninspected";
};

export type CandidateMetadataFailure = {
  repository: string;
  path: string;
  reason: string;
};

/** Convert only metadata from an already archived development source index. */
export function candidateMetadataFromSourceIndex(value: unknown): Array<CandidateMetadata & { error?: string }> {
  if (!value || typeof value !== "object") throw new Error("source index must be an object");
  const index = value as { repositories?: unknown; skills?: unknown };
  const licenses = new Map<string, string | null>();
  const rows: Array<CandidateMetadata & { error?: string }> = [];
  if (Array.isArray(index.repositories)) {
    for (const item of index.repositories) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.repository !== "string") continue;
      licenses.set(row.repository, typeof row.license === "string" ? row.license : null);
      if (row.status === "failed") rows.push({
        repository: row.repository,
        path: "(repository)",
        sha: "",
        license: licenses.get(row.repository) ?? null,
        source: "cached-development",
        error: typeof row.reason === "string" ? row.reason : "source-index-repository-failed",
      });
    }
  }
  if (Array.isArray(index.skills)) {
    for (const item of index.skills) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const repository = typeof row.repository === "string" ? row.repository : "";
      const path = typeof row.skillPath === "string" ? row.skillPath : "";
      const files = Array.isArray(row.files) ? row.files : [];
      const skillFile = files.find((file) => file && typeof file === "object"
        && (file as Record<string, unknown>).kind === "skill") as Record<string, unknown> | undefined;
      const sha = typeof skillFile?.gitBlobOid === "string" ? skillFile.gitBlobOid
        : typeof skillFile?.sha === "string" ? skillFile.sha : "";
      if (!repository || !path || !sha) {
        rows.push({ repository, path: path || "(skill)", sha, license: licenses.get(repository) ?? null,
          source: "cached-development", error: "source-index-skill-metadata-missing" });
        continue;
      }
      rows.push({ repository, path, sha, license: licenses.get(repository) ?? null, source: "cached-development" });
    }
  }
  return rows;
}

/** Parse a GitHub code-search response without retaining response/body bytes. */
export function parseGithubSearchItems(value: unknown): { rows: CandidateMetadata[]; failures: CandidateMetadataFailure[] } {
  const rows: CandidateMetadata[] = [];
  const failures: CandidateMetadataFailure[] = [];
  const items = value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)
    ? (value as { items: unknown[] }).items : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const repository = row.repository && typeof row.repository === "object"
      && typeof (row.repository as Record<string, unknown>).full_name === "string"
      ? (row.repository as Record<string, unknown>).full_name as string : "";
    const path = typeof row.path === "string" ? row.path : "";
    const sha = typeof row.sha === "string" ? row.sha : "";
    if (!repository || !path || !/(^|\/)SKILL\.md$/u.test(path)) continue;
    if (!/^[0-9a-f]{40}$/u.test(sha)) {
      failures.push({ repository, path, reason: "search-result-sha-missing" });
      continue;
    }
    const repositoryData = row.repository as Record<string, unknown>;
    rows.push({ repository, path, sha,
      branch: typeof repositoryData.default_branch === "string" ? repositoryData.default_branch : undefined,
      license: null, source: "github-search" });
  }
  return { rows, failures };
}

export function buildCandidatePool(rows: Array<CandidateMetadata & { error?: string }>, limit = 15) {
  const failures: CandidateMetadataFailure[] = [];
  const usable = rows.filter((row) => {
    if (row.error) {
      failures.push({ repository: row.repository, path: row.path, reason: row.error });
      return false;
    }
    if (!row.repository || !row.path || !row.sha) {
      failures.push({ repository: row.repository || "(unknown)", path: row.path || "(unknown)", reason: "candidate-metadata-missing" });
      return false;
    }
    return true;
  });
  const candidates: CandidatePoolRow[] = selectCandidateMetadata(usable, Math.max(1, limit)).map((row, index) => ({
    ...row,
    candidateId: `candidate-${String(index + 1).padStart(3, "0")}`,
    bodyRead: false,
    selection: "uninspected",
  }));
  return {
    schemaVersion: "skill-family-class-proof-candidate-pool/v1",
    identity: CLASS_PROOF_IDENTITY,
    bodyReadForConstruction: 0,
    candidates,
    failures,
  };
}

export function buildScreeningPolicy() {
  return {
    schemaVersion: "skill-family-class-proof-screening-policy/v1",
    identity: CLASS_PROOF_IDENTITY,
    classId: "openapi-contract-to-offline-request-specimen" as const,
    minApplicableInputsPerMember: 2,
    allowedFormats: ["json", "yaml"] as const,
    openapiVersion: "3.0.x" as const,
    bodyReadForConstruction: 0,
    outcomeDrivenReplacement: false,
    candidateOrder: "repository,path,sha lexical after metadata filtering" as const,
    developmentMinimum: 6,
    screenedReserveMinimum: 6,
  };
}

type ScreeningPolicyRun = {
  policy: ReturnType<typeof buildScreeningPolicy>;
  candidatePool: ReturnType<typeof buildCandidatePool>;
  discovery: {
    schemaVersion: "skill-family-class-proof-discovery/v1";
    queries: string[];
    attempts: Array<{ query: string; endpoint: string; status: "success" | "failed"; itemCount: number; error: string | null }>;
    failures: CandidateMetadataFailure[];
    apiCalls: number;
  };
  status: ClassProofStatus;
};

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function persistStableJson(path: string, value: unknown): Promise<void> {
  const text = jsonText(value);
  try {
    await writeFile(path, text, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(path, "utf8");
    if (existing !== text) throw new Error(`evidence drift at ${path}`);
  }
}

async function requestWithRetry(acquirer: Awaited<ReturnType<typeof createAcquirer>>, endpoint: string): Promise<{ body: Buffer; attempts: number }> {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      return { body: (await acquirer.get(endpoint)).body, attempts };
    } catch (error) {
      if (!(error instanceof AcquisitionError) || !["transient", "transport-failure", "rate-limit"].includes(error.category) || attempts >= 3) throw error;
      const delay = error.retryAt ? Math.max(0, Math.min(5_000, new Date(error.retryAt).getTime() - Date.now())) : attempts * 250;
      if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
}

/** Freeze the class policy and metadata-only candidate pool before body reads. */
export async function runScreeningPolicy(root: string, options: {
  sourceIndexPath?: string;
  queries?: string[];
  request?: Request;
  network?: boolean;
} = {}): Promise<ScreeningPolicyRun> {
  const absoluteRoot = resolve(root);
  const evidenceRoot = join(absoluteRoot, CLASS_PROOF_RESULT_RELATIVE);
  await mkdir(evidenceRoot, { recursive: true });
  const policy = buildScreeningPolicy();
  await persistStableJson(join(evidenceRoot, "screening-policy.json"), policy);

  const sourceIndexPath = resolve(absoluteRoot, options.sourceIndexPath
    ?? "results/skill-ir/skill-family-deepening-20260911/sources.json");
  let cachedRows: Array<CandidateMetadata & { error?: string }> = [];
  const sourceFailures: CandidateMetadataFailure[] = [];
  try {
    cachedRows = candidateMetadataFromSourceIndex(JSON.parse(await readFile(sourceIndexPath, "utf8")));
  } catch (error) {
    sourceFailures.push({ repository: "(source-index)", path: sourceIndexPath, reason: String(error) });
  }

  const queries = options.queries ?? [
    "OpenAPI testing filename:SKILL.md",
    "API contract test filename:SKILL.md",
    "Swagger request examples filename:SKILL.md",
  ];
  const attempts: ScreeningPolicyRun["discovery"]["attempts"] = [];
  const discovered: CandidateMetadata[] = [];
  const discoveryFailures: CandidateMetadataFailure[] = [...sourceFailures];
  let apiCalls = 0;
  if (options.network !== false) {
    const acquirer = await createAcquirer(evidenceRoot, options.request);
    for (const query of queries) {
      const endpoint = `search/code?q=${encodeURIComponent(query)}&per_page=100`;
      apiCalls += 1;
      try {
        const response = await requestWithRetry(acquirer, endpoint);
        const parsed = parseGithubSearchItems(JSON.parse(response.body.toString("utf8")));
        discovered.push(...parsed.rows);
        discoveryFailures.push(...parsed.failures);
        attempts.push({ query, endpoint, status: "success", itemCount: parsed.rows.length, error: null });
      } catch (error) {
        attempts.push({ query, endpoint, status: "failed", itemCount: 0, error: String(error) });
        discoveryFailures.push({ repository: "(github-search)", path: query, reason: String(error) });
      }
    }
  }
  const candidatePool = buildCandidatePool([...cachedRows, ...discovered, ...discoveryFailures], 64);
  await persistStableJson(join(evidenceRoot, "candidate-pool.json"), candidatePool);
  const discovery = {
    schemaVersion: "skill-family-class-proof-discovery/v1" as const,
    queries,
    attempts,
    failures: candidatePool.failures,
    apiCalls,
  };
  await persistStableJson(join(evidenceRoot, "screening-discovery.json"), discovery);
  const current = await runStatus(absoluteRoot);
  const next = transitionStatus(current.currentStep, "screening");
  const status = await writeStatus(absoluteRoot, {
    currentStep: next,
    lastCompletedStep: "screening",
    externalAccounting: { ...current.externalAccounting, apiCalls: current.externalAccounting.apiCalls + apiCalls },
    failureSummary: [...new Set([...current.failureSummary, ...candidatePool.failures.map((failure) => `${failure.repository}:${failure.path}: ${failure.reason}`)])],
  });
  return { policy, candidatePool, discovery, status };
}

export function selectCandidateMetadata(rows: CandidateMetadata[], limit = 15): CandidateMetadata[] {
  const sorted = [...rows].sort((a, b) =>
    a.repository.toLowerCase().localeCompare(b.repository.toLowerCase())
    || a.path.localeCompare(b.path)
    || a.sha.localeCompare(b.sha));
  const seen = new Set<string>();
  const selected: CandidateMetadata[] = [];
  for (const row of sorted) {
    const key = row.sha;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(row);
    if (selected.length >= limit) break;
  }
  return selected;
}

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
  } else if (step === "screening-policy") {
    const result = await runScreeningPolicy(root);
    console.log(JSON.stringify({
      status: "policy-frozen",
      identity: CLASS_PROOF_IDENTITY,
      candidates: result.candidatePool.candidates.length,
      repositories: new Set(result.candidatePool.candidates.map((candidate) => candidate.repository)).size,
      bodyReadForConstruction: result.candidatePool.bodyReadForConstruction,
      apiCalls: result.discovery.apiCalls,
    }, null, 2));
  } else {
    throw new Error("usage: bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status|screening-policy");
  }
}
