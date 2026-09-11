import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { AcquisitionError, createAcquirer, type Request } from "./deadline-acquire";
import { preflightSkillEligibility, type EligibilityInput, type EligibilityRecord } from "../../src/skill-ir/skill-family-eligibility";
import { buildObligationLedger, normalizeObligationTerm, OBLIGATION_TERM_LEXICON, type LedgerObligationInput } from "../../src/skill-ir/skill-family-obligation-ledger";
import { gitBlobOid } from "../../src/benchmarks/skill-ir/public-skill-responsibility-corpus-archive";
import { parseApiTesterOperationSource } from "../../src/skill-ir/api-tester-operation-source";
import { buildClassConstruction, CLASS_CONSTRUCTION_PROFILE } from "../../src/skill-ir/skill-family-class-construction";
import { deriveObligationOutcomes, mergeInputOutcomes } from "../../src/skill-ir/skill-family-class-construction";
import {
  ApiTesterOperationInputReportSchema,
  runApiTesterOperationInput,
  verifyApiTesterOperationInputOutput,
} from "../../src/skill-ir/api-tester-operation-input";

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
  "method-not-ready": 8,
  "blocked-before-evaluation": 8,
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

/** Append-only merge used when a later discovery pass supplies cached metadata. */
export function mergeCandidatePools(
  existing: ReturnType<typeof buildCandidatePool>,
  incoming: ReturnType<typeof buildCandidatePool>,
): ReturnType<typeof buildCandidatePool> {
  const candidates = [...existing.candidates];
  const seen = new Set(candidates.map((candidate) => candidate.sha));
  for (const candidate of incoming.candidates) {
    if (seen.has(candidate.sha)) continue;
    seen.add(candidate.sha);
    candidates.push({
      ...candidate,
      candidateId: `candidate-${String(candidates.length + 1).padStart(3, "0")}`,
      bodyRead: false,
      selection: "uninspected",
    });
  }
  const failures = [...existing.failures];
  const failureKeys = new Set(failures.map((failure) => `${failure.repository}\u0000${failure.path}\u0000${failure.reason}`));
  for (const failure of incoming.failures) {
    const key = `${failure.repository}\u0000${failure.path}\u0000${failure.reason}`;
    if (failureKeys.has(key)) continue;
    failureKeys.add(key);
    failures.push(failure);
  }
  return { ...existing, candidates, failures };
}

export type ExtractedResponsibility = ReturnType<typeof buildObligationLedger>["rows"][number];

/** Build a source-located denominator from body text before any construction. */
export function extractResponsibilities(input: { memberId: string; sourcePath: string; body: string }): ExtractedResponsibility[] {
  const obligations: LedgerObligationInput[] = [];
  const seenKeys = new Set<string>();
  const lines = input.body.split(/\r?\n/u);
  for (const [index, rawLine] of lines.entries()) {
    const text = rawLine.trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    const matches = OBLIGATION_TERM_LEXICON.filter((entry) => entry.terms.some((term) => lower.includes(term.toLowerCase())));
    const uniqueKeys = [...new Set(matches.map((entry) => entry.key))];
    for (const key of uniqueKeys) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      obligations.push({
        obligationId: `${input.memberId}:duty-${String(obligations.length + 1).padStart(3, "0")}-${key}`,
        key,
        text,
        sourceLocator: `${input.sourcePath}:${index + 1}`,
        sourceVerified: true,
      });
    }
    if (!uniqueKeys.length && /\b(?:must|should|required|generate|output|test|validate|auth|live|business)\b|(?:必须|应当|生成|输出|测试|鉴权)/iu.test(text)) {
      obligations.push({
        obligationId: `${input.memberId}:unmapped-${String(obligations.length + 1).padStart(3, "0")}`,
        text,
        sourceLocator: `${input.sourcePath}:${index + 1}`,
        sourceVerified: true,
      });
    }
  }
  if (!obligations.length) obligations.push({
    obligationId: `${input.memberId}:unresolved-001`,
    text: "No normalized responsibility could be located in the source body.",
    sourceLocator: `${input.sourcePath}:0`,
    sourceVerified: false,
  });
  return buildObligationLedger({ memberId: input.memberId, obligations }).rows;
}

export type TaskInputBinding = {
  inputId: string;
  provider: string;
  sourcePath: string;
  localPath: string;
  format: "json" | "yaml";
  bytes: number;
  sha256: string;
  exposure: "development";
};

/** Normalize the already exposed OpenAPI input index without reading bytes. */
export function buildTaskInputBindings(value: unknown, inputRoot: string): TaskInputBinding[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { inputs?: unknown }).inputs)) return [];
  const rows: TaskInputBinding[] = [];
  for (const item of (value as { inputs: unknown[] }).inputs) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.status !== "acquired" || typeof row.inputId !== "string" || typeof row.provider !== "string"
      || typeof row.sourcePath !== "string" || typeof row.localPath !== "string"
      || !["json", "yaml"].includes(String(row.format)) || typeof row.byteLength !== "number"
      || !Number.isInteger(row.byteLength) || row.byteLength <= 0 || typeof row.sha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(row.sha256)) continue;
    rows.push({
      inputId: row.inputId,
      provider: row.provider,
      sourcePath: row.sourcePath,
      localPath: join(inputRoot, row.localPath).replaceAll("\\", "/"),
      format: row.format as "json" | "yaml",
      bytes: row.byteLength,
      sha256: row.sha256,
      exposure: "development",
    });
  }
  return rows;
}

export type EligibilitySummaryRow = {
  candidateId: string;
  skillId: string;
  repository: string;
  decision: EligibilityRecord["decision"];
  applicableInputCount: number;
};

export type UnhydratedEligibilitySummaryRow = Omit<EligibilitySummaryRow, "repository"> & { repository?: string };

/** Bind repository identity from the independently persisted source ledger. */
export function hydrateEligibilityRepositories(
  rows: UnhydratedEligibilitySummaryRow[],
  sources: Array<{ candidateId: string; repository: string }>,
): EligibilitySummaryRow[] {
  const repositoryByCandidate = new Map(sources.map((source) => [source.candidateId, source.repository]));
  return rows.map((row) => {
    const repository = repositoryByCandidate.get(row.candidateId);
    if (!repository) throw new Error(`repository evidence missing for ${row.candidateId}`);
    if (row.repository && row.repository !== repository) throw new Error(`repository evidence mismatch for ${row.candidateId}`);
    return { ...row, repository };
  });
}

/** Select development members by frozen metadata order, one per repository. */
export function selectDevelopmentMembers(rows: EligibilitySummaryRow[], limit = 6): EligibilitySummaryRow[] {
  const selected: EligibilitySummaryRow[] = [];
  const seenRepositories = new Set<string>();
  const ordered = [...rows].sort((a, b) => a.repository.toLowerCase().localeCompare(b.repository.toLowerCase())
    || a.skillId.localeCompare(b.skillId) || a.candidateId.localeCompare(b.candidateId));
  for (const row of ordered) {
    if (row.decision !== "eligible" || row.applicableInputCount < 2 || seenRepositories.has(row.repository.toLowerCase())) continue;
    seenRepositories.add(row.repository.toLowerCase());
    selected.push(row);
    if (selected.length >= limit) break;
  }
  return selected;
}

/** Bind inputs in the original archived index order; construction outcomes are not consulted. */
export function selectDevelopmentInputs(inputs: TaskInputBinding[], count = 2): TaskInputBinding[] {
  return inputs.slice(0, Math.max(0, count));
}

export type GapObservation = {
  gapId: string;
  memberId: string;
  repository: string;
  inputId: string;
  layer: "source" | "construction" | "checker" | "dependency";
  status: "unresolved" | "source-blocked" | "failed" | "advisory";
  classContract: boolean;
  module: string;
  independentOracle: string;
  reason: string;
};

export type GapMatrixReport = {
  schemaVersion: "skill-family-class-proof-gap-matrix/v1";
  identity: typeof CLASS_PROOF_IDENTITY;
  observations: GapObservation[];
  gaps: Array<{
    gapId: string;
    occurrenceMembers: number;
    memberIds: string[];
    affectedInputs: string[];
    currentStatus: GapObservation["status"];
    classContract: boolean;
    existingModules: string[];
    independentOracles: string[];
    reasons: string[];
  }>;
  repairs: Array<{
    gapId: string;
    status: "repaired" | "retained";
    classContract: boolean;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    implementation: string[];
    regressionTests: string[];
  }>;
  constructionSnapshots?: Array<{
    inputId: string;
    checkerPassed: boolean;
    enumeration: { complete: boolean; operations: number; issues: string[] };
    availability: Record<string, { constructed: number; unresolved: number; reasons: string[] }>;
  }>;
  baseline?: Array<Record<string, unknown>>;
  totals: { observations: number; gapKinds: number; contractInternal: number; sourceShortfall: number };
};

export type GapRepairEvidence = GapMatrixReport["repairs"][number];

export type DevelopmentGateInput = {
  memberCount: number;
  inputBindings: number;
  expectedInputsPerMember: number;
  explainedInputs: number;
  acceptedArtifacts: number;
  checkedAcceptedArtifacts: number;
  coreObligations: number;
  constructedCoreObligations: number;
  repositoryDispatchDetected: boolean;
  infrastructureFailures: number;
};

export function deriveDevelopmentGate(input: DevelopmentGateInput) {
  const coreCoverage = input.coreObligations > 0 ? input.constructedCoreObligations / input.coreObligations : 0;
  const protocolReady = input.infrastructureFailures === 0
    && input.acceptedArtifacts === input.checkedAcceptedArtifacts;
  const inputReady = input.memberCount > 0
    && input.expectedInputsPerMember >= 2
    && input.inputBindings >= input.memberCount * input.expectedInputsPerMember
    && input.explainedInputs === input.inputBindings;
  const capabilityReady = protocolReady && inputReady && !input.repositoryDispatchDetected && coreCoverage >= 0.9;
  const reasons: string[] = [];
  if (!protocolReady) reasons.push("protocol-or-artifact-check-failure");
  if (!inputReady) reasons.push("input-denominator-incomplete");
  if (input.repositoryDispatchDetected) reasons.push("repository-specific-dispatch-detected");
  if (coreCoverage < 0.9) reasons.push("core-obligation-coverage-below-90-percent");
  return { protocolReady, inputReady, capabilityReady, coreCoverage, reasons };
}

const GAP_STATUS_RANK: Record<GapObservation["status"], number> = {
  advisory: 1,
  unresolved: 2,
  "source-blocked": 3,
  failed: 4,
};

/** Aggregate independently observed failures without collapsing member/input denominators. */
export function buildGapMatrix(observations: GapObservation[], repairs: GapRepairEvidence[] = []): GapMatrixReport {
  const groups = new Map<string, {
    observations: GapObservation[];
    memberIds: Set<string>;
    affectedInputs: Set<string>;
    modules: Set<string>;
    oracles: Set<string>;
    reasons: Set<string>;
    status: GapObservation["status"];
    classContract: boolean;
  }>();
  const unique = new Map<string, GapObservation>();
  for (const observation of observations) {
    for (const field of [observation.gapId, observation.memberId, observation.repository, observation.inputId,
      observation.module, observation.independentOracle, observation.reason]) {
      if (!field.trim()) throw new Error("gap observation fields must be non-empty");
    }
    const observationKey = [observation.gapId, observation.memberId, observation.inputId, observation.layer, observation.reason].join("\u0000");
    if (unique.has(observationKey)) continue;
    unique.set(observationKey, observation);
    const group = groups.get(observation.gapId) ?? {
      observations: [], memberIds: new Set<string>(), affectedInputs: new Set<string>(), modules: new Set<string>(),
      oracles: new Set<string>(), reasons: new Set<string>(), status: observation.status, classContract: observation.classContract,
    };
    group.observations.push(observation);
    group.memberIds.add(observation.memberId);
    group.affectedInputs.add(observation.inputId);
    group.modules.add(observation.module);
    group.oracles.add(observation.independentOracle);
    group.reasons.add(observation.reason);
    if (GAP_STATUS_RANK[observation.status] > GAP_STATUS_RANK[group.status]) group.status = observation.status;
    group.classContract = group.classContract && observation.classContract;
    groups.set(observation.gapId, group);
  }
  const normalizedObservations = [...unique.values()].sort((a, b) => a.gapId.localeCompare(b.gapId)
    || a.memberId.localeCompare(b.memberId) || a.inputId.localeCompare(b.inputId) || a.reason.localeCompare(b.reason));
  const gaps = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([gapId, group]) => ({
    gapId,
    occurrenceMembers: group.memberIds.size,
    memberIds: [...group.memberIds].sort(),
    affectedInputs: [...group.affectedInputs].sort(),
    currentStatus: group.status,
    classContract: group.classContract,
    existingModules: [...group.modules].sort(),
    independentOracles: [...group.oracles].sort(),
    reasons: [...group.reasons].sort(),
  }));
  return {
    schemaVersion: "skill-family-class-proof-gap-matrix/v1",
    identity: CLASS_PROOF_IDENTITY,
    observations: normalizedObservations,
    gaps,
    repairs: [...repairs].sort((left, right) => left.gapId.localeCompare(right.gapId)),
    constructionSnapshots: [],
    totals: {
      observations: normalizedObservations.length,
      gapKinds: gaps.length,
      contractInternal: gaps.filter((gap) => gap.classContract).length,
      sourceShortfall: gaps.filter((gap) => !gap.classContract).length,
    },
  };
}

type AcquiredSourceRow = {
  candidateId: string;
  skillId: string;
  repository: string;
  commit: string | null;
  skillPath: string;
  sha: string;
  license: string | null;
  role: "screened-reserve";
  acquisition: "cached-development" | "github-blob" | "failed";
  bodyReadForScreening: boolean;
  bodyReadForConstruction: boolean;
  bodyPath: string | null;
  bodySha256: string | null;
  bodyBytes: number;
  directResources: Array<{ sourcePath: string; localPath: string; sha256: string; bytes: number }>;
  eligibility: EligibilityRecord | null;
  responsibilities: ExtractedResponsibility[];
  issues: string[];
  requestLog: Array<{ endpoint: string; status: "cached" | "success" | "failed"; attempts: number; error: string | null }>;
};

type ScreeningAcquisitionResult = {
  sourceLedger: { schemaVersion: "skill-family-class-proof-source-ledger/v1"; identity: typeof CLASS_PROOF_IDENTITY; rows: AcquiredSourceRow[]; failures: CandidateMetadataFailure[]; accounting: { modelCalls: 0; apiCalls: number; paidCalls: 0 }; protectedBoundary: { heldOutAccesses: 0; q1ReservedAccesses: 0; prospectiveRuns: 0; readinessChanges: 0 } };
  eligibility: { schemaVersion: "skill-family-class-proof-eligibility/v1"; identity: typeof CLASS_PROOF_IDENTITY; taskInputs: TaskInputBinding[]; rows: Array<{ candidateId: string; skillId: string; decision: EligibilityRecord["decision"]; applicableInputCount: number; exclusionReasons: string[]; evidence: EligibilityRecord["evidence"] }>; totals: { candidates: number; eligible: number; excluded: number; uncertain: number } };
  responsibilities: { schemaVersion: "skill-family-class-proof-responsibility-ledger/v1"; identity: typeof CLASS_PROOF_IDENTITY; rows: Array<{ candidateId: string; skillId: string; role: "screened-reserve"; duties: ExtractedResponsibility[]; coreConstructible: number; outsideClass: number; unresolved: number }> };
  taskInputs: TaskInputBinding[];
  status: ClassProofStatus;
};

function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEvidenceSegment(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/gu, "_");
  return normalized || "item";
}

function sourceIndexSkillMap(value: unknown): Map<string, { repository: string; commit: string; skillPath: string; files: Array<Record<string, unknown>> }> {
  const result = new Map<string, { repository: string; commit: string; skillPath: string; files: Array<Record<string, unknown>> }>();
  if (!value || typeof value !== "object" || !Array.isArray((value as { skills?: unknown }).skills)) return result;
  for (const item of (value as { skills: unknown[] }).skills) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.repository !== "string" || typeof row.commit !== "string" || typeof row.skillPath !== "string") continue;
    const files = Array.isArray(row.files) ? row.files.filter((file): file is Record<string, unknown> => Boolean(file) && typeof file === "object") : [];
    result.set(`${row.repository}\u0000${row.skillPath}`, { repository: row.repository, commit: row.commit, skillPath: row.skillPath, files });
  }
  return result;
}

async function loadDevelopmentTaskInputs(root: string): Promise<{ bindings: TaskInputBinding[]; resources: EligibilityInput["resources"] }> {
  const inputRoot = join(root, "results/skill-ir/skill-family-deepening-20260911/api-inputs");
  const indexPath = join(inputRoot, "inputs.json");
  const bindings = buildTaskInputBindings(JSON.parse(await readFile(indexPath, "utf8")), "results/skill-ir/skill-family-deepening-20260911/api-inputs");
  const resources: NonNullable<EligibilityInput["resources"]> = [];
  for (const binding of bindings) {
    const bytes = await readFile(resolve(root, binding.localPath));
    if (bytes.byteLength !== binding.bytes || sha256Bytes(bytes) !== binding.sha256) throw new Error(`task input digest mismatch: ${binding.inputId}`);
    resources.push({ path: binding.sourcePath, text: bytes.toString("utf8"), format: binding.format });
  }
  return { bindings, resources };
}

function isContractResource(path: string, bytes: Buffer): boolean {
  return /\.(?:json|ya?ml)$/iu.test(path) && /(?:^|[\s"'])openapi\s*[:"]\s*3\.0/iu.test(bytes.toString("utf8"));
}

async function copySourceResource(root: string, evidenceRoot: string, candidateId: string, sourcePath: string, localPath: string): Promise<{ sourcePath: string; localPath: string; sha256: string; bytes: number }> {
  const source = resolve(root, localPath);
  const bytes = await readFile(source);
  const targetRelative = `sources/${safeEvidenceSegment(candidateId)}/resources/${safeEvidenceSegment(sourcePath.replace(/[\\/]/gu, "_"))}`;
  const target = join(evidenceRoot, targetRelative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { encoding: "utf8", flag: "wx" }).catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(target);
    if (!existing.equals(bytes)) throw new Error(`source resource drift: ${sourcePath}`);
  });
  return { sourcePath, localPath: targetRelative, sha256: sha256Bytes(bytes), bytes: bytes.byteLength };
}

/** Acquire screened source bodies, bind fixed development inputs, and run the pure preflight. */
export async function runScreeningAcquisition(root: string, options: { request?: Request; remoteLimit?: number } = {}): Promise<ScreeningAcquisitionResult> {
  const absoluteRoot = resolve(root);
  const evidenceRoot = join(absoluteRoot, CLASS_PROOF_RESULT_RELATIVE);
  await mkdir(evidenceRoot, { recursive: true });
  const policy = JSON.parse(await readFile(join(evidenceRoot, "screening-policy.json"), "utf8")) as ReturnType<typeof buildScreeningPolicy>;
  const pool = JSON.parse(await readFile(join(evidenceRoot, "candidate-pool.json"), "utf8")) as ReturnType<typeof buildCandidatePool>;
  if (policy.identity !== CLASS_PROOF_IDENTITY || pool.identity !== CLASS_PROOF_IDENTITY || pool.bodyReadForConstruction !== 0) throw new Error("screening policy or pool is not frozen");
  const sourceIndexPath = join(absoluteRoot, "results/skill-ir/skill-family-deepening-20260911/sources.json");
  const sourceMap = sourceIndexSkillMap(JSON.parse(await readFile(sourceIndexPath, "utf8")));
  const task = await loadDevelopmentTaskInputs(absoluteRoot);
  await persistStableJson(join(evidenceRoot, "task-inputs.json"), {
    schemaVersion: "skill-family-class-proof-task-inputs/v1",
    identity: CLASS_PROOF_IDENTITY,
    inputs: task.bindings,
    sourceIndex: "results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json",
    exposure: "development",
    protectedBoundary: { heldOutAccesses: 0, q1ReservedAccesses: 0, prospectiveRuns: 0 },
  });

  const cachedCandidates = pool.candidates.filter((candidate) => candidate.source === "cached-development"
    && sourceMap.has(`${candidate.repository}\u0000${candidate.path}`));
  const remoteCandidates = pool.candidates.filter((candidate) => candidate.source === "github-search"
    && !sourceMap.has(`${candidate.repository}\u0000${candidate.path}`)).slice(0, options.remoteLimit ?? 8);
  const selected = [...cachedCandidates, ...remoteCandidates];
  const failures: CandidateMetadataFailure[] = [];
  const rows: AcquiredSourceRow[] = [];
  let apiCalls = 0;
  const acquirer = remoteCandidates.length ? await createAcquirer(evidenceRoot, options.request) : null;
  for (const candidate of selected) {
    const issues: string[] = [];
    const requestLog: AcquiredSourceRow["requestLog"] = [];
    let body: Buffer | null = null;
    let commit: string | null = null;
    let acquisition: AcquiredSourceRow["acquisition"] = "failed";
    let license: string | null = candidate.license ?? null;
    const cached = sourceMap.get(`${candidate.repository}\u0000${candidate.path}`);
    if (cached) {
      try {
        const skillFile = cached.files.find((file) => file.kind === "skill");
        if (typeof skillFile?.localPath !== "string") throw new Error("cached-skill-local-path-missing");
        body = await readFile(resolve(absoluteRoot, "results/skill-ir/skill-family-deepening-20260911", skillFile.localPath));
        if (gitBlobOid(body) !== candidate.sha) throw new Error("cached-skill-git-blob-digest-mismatch");
        commit = cached.commit;
        acquisition = "cached-development";
        requestLog.push({ endpoint: skillFile.localPath, status: "cached", attempts: 0, error: null });
        const repositoryRow = JSON.parse(await readFile(sourceIndexPath, "utf8")) as { repositories?: Array<Record<string, unknown>> };
        const metadata = repositoryRow.repositories?.find((item) => item.repository === candidate.repository);
        if (typeof metadata?.license === "string") license = metadata.license;
      } catch (error) {
        issues.push(String(error));
      }
    } else if (acquirer) {
      const endpoint = `repos/${candidate.repository}/git/blobs/${candidate.sha}`;
      apiCalls += 1;
      try {
        const response = await requestWithRetry(acquirer, endpoint);
        const payload = JSON.parse(response.body.toString("utf8"));
        if (payload?.encoding !== "base64" || typeof payload.content !== "string") throw new Error("github-blob-encoding-unsupported");
        body = Buffer.from(payload.content.replace(/\s+/gu, ""), "base64");
        if (gitBlobOid(body) !== candidate.sha) throw new Error("github-blob-digest-mismatch");
        acquisition = "github-blob";
        requestLog.push({ endpoint, status: "success", attempts: response.attempts, error: null });
        issues.push("commit-not-pinned-by-search-metadata");
      } catch (error) {
        requestLog.push({ endpoint, status: "failed", attempts: 1, error: String(error) });
        issues.push(String(error));
      }
    }
    const bodyPath = body ? `sources/${safeEvidenceSegment(candidate.candidateId)}/SKILL.md` : null;
    let bodySha256: string | null = null;
    let directResources: AcquiredSourceRow["directResources"] = [];
    let eligibility: EligibilityRecord | null = null;
    let responsibilities: ExtractedResponsibility[] = [];
    if (body && bodyPath) {
      const target = join(evidenceRoot, bodyPath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body, { flag: "wx" }).catch(async (error) => {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (!(await readFile(target)).equals(body)) throw new Error(`source body drift: ${candidate.candidateId}`);
      });
      bodySha256 = sha256Bytes(body);
      const directContractResources: NonNullable<EligibilityInput["resources"]> = [];
      if (cached) {
        for (const file of cached.files) {
          if (file.kind !== "resource" || typeof file.localPath !== "string" || typeof file.sourcePath !== "string") continue;
          try {
            const copied = await copySourceResource(absoluteRoot, evidenceRoot, candidate.candidateId, file.sourcePath, `results/skill-ir/skill-family-deepening-20260911/${file.localPath}`);
            directResources.push(copied);
            const sourceBytes = await readFile(resolve(absoluteRoot, "results/skill-ir/skill-family-deepening-20260911", file.localPath));
            if (isContractResource(file.sourcePath, sourceBytes)) directContractResources.push({ path: file.sourcePath, text: sourceBytes.toString("utf8"), format: /\.json$/iu.test(file.sourcePath) ? "json" : "yaml" });
          } catch (error) { issues.push(`resource:${file.sourcePath}:${String(error)}`); }
        }
      }
      eligibility = preflightSkillEligibility({ skillId: `${candidate.repository}:${candidate.path}`, sourcePath: candidate.path, body: body.toString("utf8"), resources: [...task.resources ?? [], ...directContractResources] });
      responsibilities = extractResponsibilities({ memberId: `${candidate.repository}:${candidate.path}`, sourcePath: candidate.path, body: body.toString("utf8") });
      if (commit === null) issues.push("source-commit-unresolved");
    } else {
      failures.push({ repository: candidate.repository, path: candidate.path, reason: issues.join("; ") || "source-body-not-acquired" });
    }
    rows.push({
      candidateId: candidate.candidateId,
      skillId: `${candidate.repository}:${candidate.path}`,
      repository: candidate.repository,
      commit,
      skillPath: candidate.path,
      sha: candidate.sha,
      license,
      role: "screened-reserve",
      acquisition,
      bodyReadForScreening: Boolean(body),
      bodyReadForConstruction: false,
      bodyPath,
      bodySha256,
      bodyBytes: body?.byteLength ?? 0,
      directResources,
      eligibility,
      responsibilities,
      issues,
      requestLog,
    });
  }
  const eligibleRows = rows.filter((row) => row.eligibility?.decision === "eligible");
  const eligibilityReport = {
    schemaVersion: "skill-family-class-proof-eligibility/v1" as const,
    identity: CLASS_PROOF_IDENTITY,
    taskInputs: task.bindings,
    rows: rows.filter((row) => row.eligibility).map((row) => ({ candidateId: row.candidateId, skillId: row.skillId, repository: row.repository, decision: row.eligibility!.decision, applicableInputCount: row.eligibility!.applicableInputs.length, exclusionReasons: row.eligibility!.exclusionReasons, evidence: row.eligibility!.evidence })),
    totals: { candidates: rows.length, eligible: eligibleRows.length, excluded: rows.filter((row) => row.eligibility?.decision === "excluded").length, uncertain: rows.filter((row) => row.eligibility?.decision === "uncertain").length },
  };
  const responsibilityReport = {
    schemaVersion: "skill-family-class-proof-responsibility-ledger/v1" as const,
    identity: CLASS_PROOF_IDENTITY,
    rows: rows.filter((row) => row.eligibility).map((row) => ({
      candidateId: row.candidateId,
      skillId: row.skillId,
      role: row.role,
      duties: row.responsibilities,
      coreConstructible: row.responsibilities.filter((duty) => duty.plannedDisposition === "to-construct").length,
      outsideClass: row.responsibilities.filter((duty) => duty.plannedDisposition === "outside-class").length,
      unresolved: row.responsibilities.filter((duty) => duty.plannedDisposition === "unresolved" || duty.plannedDisposition === "source-blocked").length,
    })),
  };
  const sourceLedger = {
    schemaVersion: "skill-family-class-proof-source-ledger/v1" as const,
    identity: CLASS_PROOF_IDENTITY,
    rows,
    failures,
    accounting: { modelCalls: 0 as const, apiCalls, paidCalls: 0 as const },
    protectedBoundary: { heldOutAccesses: 0 as const, q1ReservedAccesses: 0 as const, prospectiveRuns: 0 as const, readinessChanges: 0 as const },
  };
  await persistStableJson(join(evidenceRoot, "source-ledger.json"), sourceLedger);
  await persistStableJson(join(evidenceRoot, "eligibility.json"), eligibilityReport);
  await persistStableJson(join(evidenceRoot, "responsibility-ledger.json"), responsibilityReport);
  const current = await runStatus(absoluteRoot);
  const next = transitionStatus(current.currentStep, "development");
  const status = await writeStatus(absoluteRoot, {
    currentStep: next,
    lastCompletedStep: "development",
    externalAccounting: { ...current.externalAccounting, apiCalls: current.externalAccounting.apiCalls + apiCalls },
    failureSummary: [...new Set([...current.failureSummary, ...failures.map((failure) => `${failure.repository}:${failure.path}: ${failure.reason}`)])],
  });
  return { sourceLedger, eligibility: eligibilityReport, responsibilities: responsibilityReport, taskInputs: task.bindings, status };
}

type DevelopmentLedgerResult = {
  ledger: {
    schemaVersion: "skill-family-class-proof-development-ledger/v1";
    identity: typeof CLASS_PROOF_IDENTITY;
    constructionProfile: typeof CLASS_CONSTRUCTION_PROFILE;
    inputSelectionRule: string;
    members: Array<Record<string, unknown>>;
    totals: { eligibleScreened: number; developmentMembers: number; repositoryDistinct: number; inputQualifiedMembers: number; inputBindings: number; coreObligations: number; coreConstructible: number; unresolvedObligations: number; outsideClassDuties: number };
    accounting: { modelCalls: 0; apiCalls: 0; paidCalls: 0 };
    protectedBoundary: { heldOutAccesses: 0; q1ReservedAccesses: 0; prospectiveRuns: 0 };
  };
  status: ClassProofStatus;
};

/** Establish the pre-construction responsibility and input denominator. */
export async function runDevelopmentLedger(root: string): Promise<DevelopmentLedgerResult> {
  const absoluteRoot = resolve(root);
  const evidenceRoot = join(absoluteRoot, CLASS_PROOF_RESULT_RELATIVE);
  const eligibility = JSON.parse(await readFile(join(evidenceRoot, "eligibility.json"), "utf8")) as {
    rows: Array<UnhydratedEligibilitySummaryRow & { exclusionReasons: string[]; evidence: unknown[] }>;
    totals: { eligible: number };
  };
  const sourceLedger = JSON.parse(await readFile(join(evidenceRoot, "source-ledger.json"), "utf8")) as { rows: AcquiredSourceRow[] };
  const responsibility = JSON.parse(await readFile(join(evidenceRoot, "responsibility-ledger.json"), "utf8")) as { rows: Array<{ candidateId: string; skillId: string; duties: ExtractedResponsibility[] }> };
  const archivedTask = JSON.parse(await readFile(join(evidenceRoot, "task-inputs.json"), "utf8")) as { inputs: TaskInputBinding[] };
  const task = await loadDevelopmentTaskInputs(absoluteRoot);
  const archivedDigests = new Map(archivedTask.inputs.map((input) => [input.inputId, input.sha256]));
  if (task.bindings.some((input) => archivedDigests.get(input.inputId) !== input.sha256)
    || archivedDigests.size !== task.bindings.length) {
    throw new Error("archived task-input binding set no longer matches the fixed development input index");
  }
  const selectionRows = hydrateEligibilityRepositories(eligibility.rows, sourceLedger.rows);
  const selected = selectDevelopmentMembers(selectionRows, 6);
  const inputBindings = selectDevelopmentInputs(task.bindings, 2);
  const sourceByCandidate = new Map(sourceLedger.rows.map((row) => [row.candidateId, row]));
  const dutiesByCandidate = new Map(responsibility.rows.map((row) => [row.candidateId, row.duties]));
  const members: Array<Record<string, unknown>> = [];
  for (const candidate of selected) {
    const source = sourceByCandidate.get(candidate.candidateId);
    const duties = dutiesByCandidate.get(candidate.candidateId) ?? [];
    const boundInputs = inputBindings;
    const inputEvidence = [] as Array<Record<string, unknown>>;
    for (const binding of boundInputs) {
      const bytes = await readFile(resolve(absoluteRoot, binding.localPath));
      const parsed = parseApiTesterOperationSource(bytes.toString("utf8"), binding.format);
      inputEvidence.push({
        inputId: binding.inputId,
        provider: binding.provider,
        path: binding.localPath,
        format: binding.format,
        bytes: bytes.byteLength,
        sha256: sha256Bytes(bytes),
        operationCount: parsed.enumeration.operations.length,
        enumerationComplete: parsed.enumeration.complete,
        enumerationIssues: parsed.enumeration.unresolved,
        coverageRequirement: "one bound input row per fixed development-index entry; no outcome-based replacement",
        expectedChecker: "api-tester-operation-input-independent-coverage-and-dependency-checker",
      });
    }
    members.push({
      candidateId: candidate.candidateId,
      memberId: candidate.skillId,
      repository: candidate.repository,
      role: "development",
      source: { commit: source?.commit ?? null, skillPath: source?.skillPath ?? null, bodyPath: source?.bodyPath ?? null, bodySha256: source?.bodySha256 ?? null },
      duties,
      inputBindings: inputEvidence,
      denominator: {
        coreObligations: duties.filter((duty) => duty.plannedDisposition === "to-construct").length,
        outsideClassDuties: duties.filter((duty) => duty.plannedDisposition === "outside-class").length,
        unresolvedDuties: duties.filter((duty) => duty.plannedDisposition === "unresolved" || duty.plannedDisposition === "source-blocked").length,
      },
      plannedDisposition: candidate.applicableInputCount >= inputBindings.length && inputBindings.length >= 2 ? "development-ready" : "reserve-shortfall",
    });
  }
  const coreObligations = members.reduce((sum, member) => sum + Number((member.denominator as Record<string, number>).coreObligations ?? 0), 0);
  const coreConstructible = members.reduce((sum, member) => sum + Number((member.denominator as Record<string, number>).coreObligations ?? 0), 0);
  const unresolvedObligations = members.reduce((sum, member) => sum + Number((member.denominator as Record<string, number>).unresolvedDuties ?? 0), 0);
  const outsideClassDuties = members.reduce((sum, member) => sum + Number((member.denominator as Record<string, number>).outsideClassDuties ?? 0), 0);
  const ledger = {
    schemaVersion: "skill-family-class-proof-development-ledger/v1" as const,
    identity: CLASS_PROOF_IDENTITY,
    constructionProfile: CLASS_CONSTRUCTION_PROFILE,
    inputSelectionRule: "first two entries in the archived development input index; fixed before construction and never replaced by outcome",
    members,
    totals: {
      eligibleScreened: eligibility.totals.eligible,
      developmentMembers: members.length,
      repositoryDistinct: new Set(members.map((member) => member.repository)).size,
      inputQualifiedMembers: members.filter((member) => Array.isArray(member.inputBindings) && (member.inputBindings as unknown[]).length >= 2).length,
      inputBindings: members.reduce((sum, member) => sum + (Array.isArray(member.inputBindings) ? member.inputBindings.length : 0), 0),
      coreObligations,
      coreConstructible,
      unresolvedObligations,
      outsideClassDuties,
    },
    accounting: { modelCalls: 0 as const, apiCalls: 0 as const, paidCalls: 0 as const },
    protectedBoundary: { heldOutAccesses: 0 as const, q1ReservedAccesses: 0 as const, prospectiveRuns: 0 as const },
  };
  await persistStableJson(join(evidenceRoot, "development-ledger.json"), ledger);
  const current = await runStatus(absoluteRoot);
  const status = await writeStatus(absoluteRoot, {
    currentStep: transitionStatus(current.currentStep, "development"),
    lastCompletedStep: "development",
    failureSummary: [...new Set([...current.failureSummary, ...(members.length < 6 ? ["development-member-shortfall"] : []), ...(members.some((member) => (member.denominator as Record<string, number>).unresolvedDuties > 0) ? ["unresolved-responsibility-locators-retained"] : [])])],
  });
  return { ledger, status };
}

type GapMatrixRunResult = { report: GapMatrixReport; status: ClassProofStatus };

type DevelopmentRunRecord = {
  candidateId: string;
  memberId: string;
  repository: string;
  inputId: string;
  input: { path: string; format: "json" | "yaml"; bytes: number; sha256: string };
  manifestPath: string;
  outputPath: string;
  construction: {
    checkerPassed: boolean;
    checkerFailures: string[];
    enumeration: { complete: boolean; operations: number; issues: string[] };
    availability: Record<string, { constructed: number; unresolved: number; reasons: string[] }>;
    obligations: ReturnType<typeof deriveObligationOutcomes>;
  };
  runner: {
    status: "completed" | "completed-with-source-advisory" | "completed-with-source-blocker" | "failed" | "not-run";
    totals: { operations: number; accepted: number; rejected: number; unresolved: number; artifactCheckedPassedOperations: number };
    gates: Record<string, string>;
    sourceIssues: Record<string, unknown>;
    reportPath: string | null;
    verifier: { status: "verified" | "failed"; operations: number; accepted: number; checked: number; portableSemanticSha256?: string; error?: string };
  };
  failureClass: "none" | "source-blocked" | "unsupported-by-contract" | "constructor-error" | "checker-failure" | "infrastructure-failure";
  elapsedMillis: number;
};

type DevelopmentRunsReport = {
  schemaVersion: "skill-family-class-proof-development-runs/v1";
  identity: typeof CLASS_PROOF_IDENTITY;
  constructionProfile: typeof CLASS_CONSTRUCTION_PROFILE;
  inputSelectionRule: string;
  members: Array<{ candidateId: string; memberId: string; repository: string; runs: DevelopmentRunRecord[]; mergedObligations: ReturnType<typeof mergeInputOutcomes>; coreCoverage: number }>;
  runs: DevelopmentRunRecord[];
  gate: ReturnType<typeof deriveDevelopmentGate> & { repositoryDispatchDetected: boolean; infrastructureFailures: number };
  categories: Record<DevelopmentRunRecord["failureClass"], number>;
  accounting: { modelCalls: 0; apiCalls: 0; paidCalls: 0; runtimeCalls: number };
  protectedBoundary: { heldOutAccesses: 0; q1ReservedAccesses: 0; prospectiveRuns: 0; readinessChanges: 0 };
};

function classifyConstructionGap(kind: string, reason: string): { gapId: string; module: string; oracle: string } {
  if (/format\s+url/iu.test(reason)) return {
    gapId: "format-url-witness",
    module: "src/skill-ir/api-schema-witness.ts",
    oracle: "src/skill-ir/api-schema-checker.ts:createDirectionalSchemaChecker",
  };
  if (/reference|\$ref/iu.test(reason)) return {
    gapId: "reference-resolution",
    module: "src/skill-ir/api-schema-witness.ts",
    oracle: "src/skill-ir/api-schema-checker.ts:createDirectionalSchemaChecker",
  };
  if (/array|encoding|form/iu.test(reason)) return {
    gapId: "array-or-form-encoding",
    module: "src/skill-ir/api-parameter-wire.ts",
    oracle: "src/skill-ir/api-request-specimens-checker.ts:verifySpecimens",
  };
  return {
    gapId: `construction-${kind}`,
    module: "src/skill-ir/skill-family-class-construction.ts",
    oracle: "src/skill-ir/api-request-specimens-checker.ts:verifySpecimens",
  };
}

async function readHistoricalUrlBaseline(root: string): Promise<Array<Record<string, unknown>>> {
  const paths = [
    "results/skill-ir/skill-family-minimum-delivery-20260911/calibration/jeremy-automating-api-testing/jeremy-automating-api-testing__onepassword-connect.json",
    "results/skill-ir/skill-family-minimum-delivery-20260911/calibration/lambda-api-to-testcase/lambda-api-to-testcase__onepassword-connect.json",
    "results/skill-ir/skill-family-minimum-delivery-20260911/calibration/pactflow-openapi-parser/pactflow-openapi-parser__onepassword-connect.json",
  ];
  const rows: Array<Record<string, unknown>> = [];
  for (const path of paths) {
    try {
      const report = JSON.parse(await readFile(join(root, path), "utf8")) as {
        memberId?: string;
        inputId?: string;
        availability?: Record<string, { constructed: number; unresolved: number; reasons: string[] }>;
      };
      const availability = report.availability ?? {};
      const formatRows = Object.entries(availability).filter(([, value]) => value.reasons.some((reason) => /format\s+url/iu.test(reason)));
      rows.push({
        path,
        memberId: report.memberId ?? null,
        inputId: report.inputId ?? null,
        formatRows: formatRows.map(([kind, value]) => ({ kind, constructed: value.constructed, unresolved: value.unresolved, reasons: value.reasons })),
        unresolvedCases: formatRows.reduce((sum, [, value]) => sum + value.unresolved, 0),
      });
    } catch (error) {
      rows.push({ path, error: String(error) });
    }
  }
  return rows;
}

/** Record actual shared construction gaps and a before/after repair without selecting primary inputs. */
export async function runGapMatrix(root: string): Promise<GapMatrixRunResult> {
  const absoluteRoot = resolve(root);
  const evidenceRoot = join(absoluteRoot, CLASS_PROOF_RESULT_RELATIVE);
  const ledger = JSON.parse(await readFile(join(evidenceRoot, "development-ledger.json"), "utf8")) as {
    members: Array<{
      memberId: string;
      repository: string;
      inputBindings: Array<{ inputId: string; path: string; format: "json" | "yaml" }>;
      duties: ExtractedResponsibility[];
    }>;
  };
  const observations: GapObservation[] = [];
  type ConstructionSnapshot = NonNullable<GapMatrixReport["constructionSnapshots"]>[number];
  const snapshots = new Map<string, ConstructionSnapshot>();
  for (const member of ledger.members) {
    for (const binding of member.inputBindings) {
      const source = await readFile(resolve(absoluteRoot, binding.path));
      const construction = buildClassConstruction(source.toString("utf8"), binding.format);
      if (!snapshots.has(binding.inputId)) snapshots.set(binding.inputId, {
        inputId: binding.inputId,
        checkerPassed: construction.checkerPassed,
        enumeration: construction.enumeration,
        availability: construction.availability,
      });
      if (!construction.checkerPassed) observations.push({
        gapId: "construction-checker-failure",
        memberId: member.memberId,
        repository: member.repository,
        inputId: binding.inputId,
        layer: "checker",
        status: "failed",
        classContract: true,
        module: "src/skill-ir/skill-family-class-construction.ts",
        independentOracle: "api-request-specimens-checker.ts + api-request-body-negatives-checker.ts",
        reason: construction.checkerFailures.join("; ") || "class construction checker failed",
      });
      if (!construction.enumeration.complete) observations.push({
        gapId: "operation-enumeration-incomplete",
        memberId: member.memberId,
        repository: member.repository,
        inputId: binding.inputId,
        layer: "dependency",
        status: "failed",
        classContract: true,
        module: "src/skill-ir/api-tester-operation-source.ts",
        independentOracle: "src/skill-ir/api-tester-operation-coverage.ts:independentlyEnumerateApiTesterOperations",
        reason: construction.enumeration.issues.join("; ") || "operation enumeration incomplete",
      });
      for (const [kind, availability] of Object.entries(construction.availability)) {
        if (availability.unresolved <= 0) continue;
        const reason = availability.reasons[0] ?? "no constructed case for declared kind";
        const representative = classifyConstructionGap(kind, reason);
        observations.push({
          gapId: representative.gapId,
          memberId: member.memberId,
          repository: member.repository,
          inputId: binding.inputId,
          layer: "construction",
          status: "unresolved",
          classContract: true,
          module: representative.module,
          independentOracle: representative.oracle,
          reason: `${kind}: ${reason}`,
        });
      }
      const unresolvedDuties = member.duties.filter((duty) => duty.plannedDisposition === "unresolved" || duty.plannedDisposition === "source-blocked");
      if (unresolvedDuties.length) observations.push({
        gapId: "unresolved-source-duty",
        memberId: member.memberId,
        repository: member.repository,
        inputId: binding.inputId,
        layer: "source",
        status: "source-blocked",
        classContract: false,
        module: "scripts/skill-ir/skill-family-class-proof.ts:extractResponsibilities",
        independentOracle: "source-locator and obligation-ledger validator",
        reason: `${unresolvedDuties.length} source duty rows have no normalized class locator`,
      });
    }
  }
  const baseline = await readHistoricalUrlBaseline(absoluteRoot);
  const connect = snapshots.get("onepassword-connect");
  const baselineUnresolved = baseline.reduce((sum, row) => sum + Number(row.unresolvedCases ?? 0), 0);
  const currentUnresolved = connect ? Object.values(connect.availability).reduce((sum, row) => sum + row.unresolved, 0) : null;
  const repairs: GapRepairEvidence[] = [{
    gapId: "format-url-witness",
    status: currentUnresolved === 0 ? "repaired" : "retained",
    classContract: true,
    before: {
      evidencePaths: baseline.map((row) => row.path),
      observedMembers: baseline.filter((row) => !row.error).length,
      unresolvedCasesAcrossBaselineReports: baselineUnresolved,
      reason: "offline witness generator rejected the source's format: url",
    },
    after: {
      inputId: "onepassword-connect",
      unresolvedCases: currentUnresolved,
      checkerPassed: connect?.checkerPassed ?? false,
      validFullUnresolved: connect?.availability["valid-full"]?.unresolved ?? null,
    },
    implementation: [
      "src/skill-ir/api-schema-witness.ts: deterministic URL witness",
      "src/skill-ir/api-schema-checker.ts: standard URL parser validation",
    ],
    regressionTests: [
      "src/skill-ir/api-schema-witness.test.ts: OpenAPI url format",
      "src/skill-ir/skill-family-class-construction.test.ts",
    ],
  }];
  const report = buildGapMatrix(observations, repairs);
  report.constructionSnapshots = [...snapshots.values()].sort((left, right) => left.inputId.localeCompare(right.inputId));
  report.baseline = baseline;
  await persistStableJson(join(evidenceRoot, "gap-matrix.json"), report);
  const current = await runStatus(absoluteRoot);
  const status = await writeStatus(absoluteRoot, {
    currentStep: transitionStatus(current.currentStep, "development"),
    lastCompletedStep: "development",
    failureSummary: [...new Set([
      ...current.failureSummary,
      "r5-gap-matrix-recorded",
      ...(report.totals.contractInternal ? [] : ["r5-contract-internal-gap-shortfall"]),
    ])],
  });
  return { report, status };
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function classifyDevelopmentRunFailure(input: {
  construction: DevelopmentRunRecord["construction"];
  runnerError: string | null;
  runnerReport: DevelopmentRunRecord["runner"];
}): DevelopmentRunRecord["failureClass"] {
  if (input.construction.checkerFailures.length) return "checker-failure";
  if (input.runnerError) {
    if (/unsupported|rejected|unresolved/iu.test(input.runnerError)) return "unsupported-by-contract";
    return "infrastructure-failure";
  }
  if (input.runnerReport.verifier.status !== "verified") return "infrastructure-failure";
  if (input.runnerReport.sourceIssues && Number(input.runnerReport.sourceIssues.blocking ?? 0) > 0) return "source-blocked";
  if (input.runnerReport.status === "failed") return "constructor-error";
  if (input.runnerReport.totals.accepted === 0) return "unsupported-by-contract";
  return "none";
}

function obligationLedgerFromRows(memberId: string, rows: ExtractedResponsibility[]) {
  return {
    schemaVersion: "skill-family-obligation-ledger/v1" as const,
    classId: "api-contract-driven-offline-test-construction" as const,
    memberId,
    rows,
    rowCount: rows.length,
    plannedConstructionCount: rows.filter((row) => row.plannedDisposition === "to-construct").length,
    denominatorSha256: sha256Bytes(JSON.stringify(rows)),
  };
}

async function runOneDevelopmentInput(
  absoluteRoot: string,
  evidenceRoot: string,
  member: { candidateId: string; memberId: string; repository: string; duties: ExtractedResponsibility[] },
  binding: { inputId: string; path: string; format: "json" | "yaml"; bytes: number; sha256: string },
): Promise<DevelopmentRunRecord> {
  const started = Date.now();
  const sourceBytes = await readFile(resolve(absoluteRoot, binding.path));
  if (sourceBytes.byteLength !== binding.bytes || sha256Bytes(sourceBytes) !== binding.sha256) throw new Error(`development input digest mismatch: ${binding.inputId}`);
  const construction = buildClassConstruction(sourceBytes.toString("utf8"), binding.format);
  const obligations = deriveObligationOutcomes(obligationLedgerFromRows(member.memberId, member.duties), construction);
  const runRelative = `development-runs/${safeEvidenceSegment(member.candidateId)}/${safeEvidenceSegment(binding.inputId)}`;
  const runRoot = join(evidenceRoot, runRelative);
  await mkdir(join(runRoot, "input"), { recursive: true });
  const inputRelative = `input/openapi.${binding.format === "json" ? "json" : "yaml"}`;
  const inputTarget = join(runRoot, inputRelative);
  try {
    const existing = await readFile(inputTarget);
    if (!existing.equals(sourceBytes)) throw new Error(`development run input drift: ${binding.inputId}`);
  } catch (error) {
    if (!isMissing(error)) throw error;
    await writeFile(inputTarget, sourceBytes, { flag: "wx" });
  }
  const bindingId = `class-proof-${safeEvidenceSegment(member.candidateId)}-${safeEvidenceSegment(binding.inputId)}`.toLowerCase();
  const manifest = {
    schemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
    identity: "skill-ir-api-tester-operation-input-development-001",
    bindingId,
    supportContractId: "api-tester-openapi-subset-v2",
    input: { path: inputRelative, format: binding.format, bytes: sourceBytes.byteLength, sha256: sha256Bytes(sourceBytes) },
    output: { path: "output", writeMode: "exclusive-create-once" },
  } as const;
  const manifestPath = join(runRoot, "manifest.json");
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(manifest)) throw new Error(`development manifest drift: ${binding.inputId}`);
  } catch (error) {
    if (!isMissing(error)) throw error;
    await writeFile(manifestPath, jsonText(manifest), { flag: "wx", encoding: "utf8" });
  }
  await persistStableJson(join(runRoot, "invocation.json"), {
    schemaVersion: "skill-family-class-proof-development-invocation/v1",
    memberId: member.memberId,
    candidateId: member.candidateId,
    inputId: binding.inputId,
    runner: "runApiTesterOperationInput -> verifyApiTesterOperationInputOutput",
    nodeExecutable: process.execPath,
    runtime: { bun: Bun.version, node: process.version },
    manifestPath: "manifest.json",
    completedAt: "2026-09-12T00:00:00.000Z",
    protectedBoundary: { heldOutAccesses: 0, q1ReservedAccesses: 0, prospectiveRuns: 0, readinessChanges: 0 },
  });
  let report: ReturnType<typeof ApiTesterOperationInputReportSchema.parse> | null = null;
  let runnerError: string | null = null;
  const reportPath = join(runRoot, "output/report.json");
  try {
    report = ApiTesterOperationInputReportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
  } catch (error) {
    if (!isMissing(error)) runnerError = String(error);
  }
  if (!report && !runnerError) {
    try {
      report = ApiTesterOperationInputReportSchema.parse(await runApiTesterOperationInput({
        rootDir: runRoot,
        manifestPath: "manifest.json",
        nodeExecutable: process.execPath,
        completedAt: "2026-09-12T00:00:00.000Z",
      }));
    } catch (error) {
      runnerError = error instanceof Error ? error.message : String(error);
      await persistStableJson(join(runRoot, "runner-error.json"), { error: runnerError });
    }
  }
  let verifier: DevelopmentRunRecord["runner"]["verifier"] = { status: "failed", operations: 0, accepted: 0, checked: 0 };
  if (report) {
    try {
      verifier = await verifyApiTesterOperationInputOutput({ rootDir: runRoot, manifestPath: "manifest.json", nodeExecutable: process.execPath });
    } catch (error) {
      verifier = { ...verifier, error: error instanceof Error ? error.message : String(error) };
    }
  }
  const runner: DevelopmentRunRecord["runner"] = report ? {
    status: report.status,
    totals: report.totals,
    gates: report.gates,
    sourceIssues: report.sourceIssues,
    reportPath: "output/report.json",
    verifier,
  } : {
    status: "not-run",
    totals: { operations: 0, accepted: 0, rejected: 0, unresolved: 0, artifactCheckedPassedOperations: 0 },
    gates: {},
    sourceIssues: {},
    reportPath: null,
    verifier,
  };
  const record: DevelopmentRunRecord = {
    candidateId: member.candidateId,
    memberId: member.memberId,
    repository: member.repository,
    inputId: binding.inputId,
    input: { path: binding.path, format: binding.format, bytes: sourceBytes.byteLength, sha256: sha256Bytes(sourceBytes) },
    manifestPath: `${runRelative}/manifest.json`,
    outputPath: `${runRelative}/output`,
    construction: {
      checkerPassed: construction.checkerPassed,
      checkerFailures: construction.checkerFailures,
      enumeration: construction.enumeration,
      availability: construction.availability,
      obligations,
    },
    runner,
    failureClass: classifyDevelopmentRunFailure({ construction: {
      checkerPassed: construction.checkerPassed,
      checkerFailures: construction.checkerFailures,
      enumeration: construction.enumeration,
      availability: construction.availability,
      obligations,
    }, runnerError, runnerReport: runner }),
    elapsedMillis: Math.max(0, Date.now() - started),
  };
  await persistStableJson(join(runRoot, "run-summary.json"), record);
  return record;
}

/** Execute the fixed development slice once per member/input and derive the capability gate. */
export async function runDevelopmentRuns(root: string): Promise<{ report: DevelopmentRunsReport; status: ClassProofStatus }> {
  const absoluteRoot = resolve(root);
  const evidenceRoot = join(absoluteRoot, CLASS_PROOF_RESULT_RELATIVE);
  const reportPath = join(evidenceRoot, "development-runs.json");
  try {
    const existing = JSON.parse(await readFile(reportPath, "utf8")) as DevelopmentRunsReport;
    const current = await runStatus(absoluteRoot);
    const status = await writeStatus(absoluteRoot, { currentStep: current.currentStep, lastCompletedStep: current.lastCompletedStep });
    return { report: existing, status };
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const ledger = JSON.parse(await readFile(join(evidenceRoot, "development-ledger.json"), "utf8")) as {
    members: Array<{ candidateId: string; memberId: string; repository: string; duties: ExtractedResponsibility[]; inputBindings: Array<{ inputId: string; path: string; format: "json" | "yaml"; bytes: number; sha256: string }> }>;
  };
  const records: DevelopmentRunRecord[] = [];
  for (const member of ledger.members) {
    for (const binding of member.inputBindings) {
      records.push(await runOneDevelopmentInput(absoluteRoot, evidenceRoot, member, binding));
    }
  }
  records.sort((left, right) => left.memberId.localeCompare(right.memberId) || left.inputId.localeCompare(right.inputId));
  const members = ledger.members.map((member) => {
    const runs = records.filter((record) => record.candidateId === member.candidateId);
    const mergedObligations = mergeInputOutcomes(runs.map((run) => ({ inputId: run.inputId, outcomes: run.construction.obligations.outcomes })));
    const core = member.duties.filter((duty) => duty.plannedDisposition === "to-construct").length;
    const constructed = mergedObligations.filter((outcome) => outcome.outcome === "constructed").length;
    return { candidateId: member.candidateId, memberId: member.memberId, repository: member.repository, runs, mergedObligations, coreCoverage: core > 0 ? constructed / core : 0 };
  });
  const source = await readFile(join(absoluteRoot, "src/skill-ir/skill-family-class-construction.ts"), "utf8");
  const repositoryDispatchDetected = /candidate\.(?:repository|skillId)|skillId\s*===|repository\s*===/u.test(source);
  const acceptedArtifacts = records.reduce((sum, record) => sum + record.runner.totals.accepted, 0);
  const checkedAcceptedArtifacts = records.reduce((sum, record) => sum + record.runner.totals.artifactCheckedPassedOperations, 0);
  const coreObligations = ledger.members.reduce((sum, member) => sum + member.duties.filter((duty) => duty.plannedDisposition === "to-construct").length, 0);
  const constructedCoreObligations = members.reduce((sum, member) => sum + member.mergedObligations.filter((outcome) => outcome.outcome === "constructed").length, 0);
  const infrastructureFailures = records.filter((record) => record.failureClass === "infrastructure-failure").length;
  const gate = deriveDevelopmentGate({
    memberCount: members.length,
    inputBindings: records.length,
    expectedInputsPerMember: 2,
    explainedInputs: records.filter((record) => record.runner.verifier.status === "verified").length,
    acceptedArtifacts,
    checkedAcceptedArtifacts,
    coreObligations,
    constructedCoreObligations,
    repositoryDispatchDetected,
    infrastructureFailures,
  });
  const categories = { none: 0, "source-blocked": 0, "unsupported-by-contract": 0, "constructor-error": 0, "checker-failure": 0, "infrastructure-failure": 0 } as Record<DevelopmentRunRecord["failureClass"], number>;
  for (const record of records) categories[record.failureClass] += 1;
  const report: DevelopmentRunsReport = {
    schemaVersion: "skill-family-class-proof-development-runs/v1",
    identity: CLASS_PROOF_IDENTITY,
    constructionProfile: CLASS_CONSTRUCTION_PROFILE,
    inputSelectionRule: "development-ledger fixed first two archived input-index entries; no outcome replacement",
    members,
    runs: records,
    gate: { ...gate, repositoryDispatchDetected, infrastructureFailures },
    categories,
    accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0, runtimeCalls: records.length * 2 },
    protectedBoundary: { heldOutAccesses: 0, q1ReservedAccesses: 0, prospectiveRuns: 0, readinessChanges: 0 },
  };
  await persistStableJson(reportPath, report);
  const current = await runStatus(absoluteRoot);
  const next = gate.capabilityReady ? "capability-ready" : "method-not-ready";
  const status = await writeStatus(absoluteRoot, {
    currentStep: transitionStatus(current.currentStep, next),
    lastCompletedStep: next,
    failureSummary: [...new Set([
      ...current.failureSummary,
      ...(gate.capabilityReady ? [] : ["development-capability-gate-failed"]),
      ...Object.entries(categories).filter(([key, value]) => key !== "none" && value > 0).map(([key, value]) => `development-${key}:${value}`),
    ])],
  });
  return { report, status };
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

async function persistAppendOnlyCandidatePool(path: string, candidatePool: ReturnType<typeof buildCandidatePool>): Promise<ReturnType<typeof buildCandidatePool>> {
  try {
    await writeFile(path, jsonText(candidatePool), { encoding: "utf8", flag: "wx" });
    return candidatePool;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(path, "utf8")) as ReturnType<typeof buildCandidatePool>;
    if (existing.bodyReadForConstruction !== 0 || existing.candidates.some((candidate) => candidate.bodyRead !== false)) {
      throw new Error("candidate pool is no longer metadata-only");
    }
    const merged = mergeCandidatePools(existing, candidatePool);
    const prefix = merged.candidates.slice(0, existing.candidates.length);
    if (JSON.stringify(prefix) !== JSON.stringify(existing.candidates)) throw new Error("candidate pool prefix drift");
    await writeFile(path, jsonText(merged), { encoding: "utf8" });
    return merged;
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
  // Keep a generous metadata-only cap so the already exposed development
  // corpus is not displaced by noisy search hits; body acquisition remains
  // separately selected after this frozen prefix.
  const generatedPool = buildCandidatePool([...cachedRows, ...discovered, ...discoveryFailures], 512);
  const candidatePool = await persistAppendOnlyCandidatePool(join(evidenceRoot, "candidate-pool.json"), generatedPool);
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
  const absoluteRoot = resolve(root);
  const current = await runStatus(absoluteRoot);
  const next = validateStatus({
    ...current,
    ...patch,
    branch: git(absoluteRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
    head: git(absoluteRoot, ["rev-parse", "HEAD"]),
    upstream: git(absoluteRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || null,
    trackedStatus: git(absoluteRoot, ["status", "--short", "--branch"]),
    updatedAt: new Date().toISOString(),
  });
  await writeFile(statusPath(absoluteRoot), `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8" });
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
  } else if (step === "screening-acquisition") {
    const result = await runScreeningAcquisition(root);
    console.log(JSON.stringify({
      status: "screened",
      identity: CLASS_PROOF_IDENTITY,
      candidates: result.eligibility.totals.candidates,
      eligible: result.eligibility.totals.eligible,
      excluded: result.eligibility.totals.excluded,
      uncertain: result.eligibility.totals.uncertain,
      taskInputs: result.taskInputs.length,
      apiCalls: result.sourceLedger.accounting.apiCalls,
    }, null, 2));
  } else if (step === "development-ledger") {
    const result = await runDevelopmentLedger(root);
    console.log(JSON.stringify({
      status: "development-ledger-ready",
      identity: CLASS_PROOF_IDENTITY,
      members: result.ledger.totals.developmentMembers,
      repositoryDistinct: result.ledger.totals.repositoryDistinct,
      inputQualifiedMembers: result.ledger.totals.inputQualifiedMembers,
      coreObligations: result.ledger.totals.coreObligations,
      outsideClassDuties: result.ledger.totals.outsideClassDuties,
    }, null, 2));
  } else if (step === "gap-matrix") {
    const result = await runGapMatrix(root);
    console.log(JSON.stringify({
      status: "gap-matrix-recorded",
      identity: CLASS_PROOF_IDENTITY,
      observations: result.report.totals.observations,
      gapKinds: result.report.totals.gapKinds,
      contractInternal: result.report.totals.contractInternal,
      sourceShortfall: result.report.totals.sourceShortfall,
      repairs: result.report.repairs.map((repair) => ({ gapId: repair.gapId, status: repair.status })),
    }, null, 2));
  } else if (step === "development-runs") {
    const result = await runDevelopmentRuns(root);
    console.log(JSON.stringify({
      status: result.report.gate.capabilityReady ? "capability-ready" : "method-not-ready",
      identity: CLASS_PROOF_IDENTITY,
      members: result.report.members.length,
      inputs: result.report.runs.length,
      operations: result.report.runs.reduce((sum, run) => sum + run.runner.totals.operations, 0),
      accepted: result.report.runs.reduce((sum, run) => sum + run.runner.totals.accepted, 0),
      checked: result.report.runs.reduce((sum, run) => sum + run.runner.totals.artifactCheckedPassedOperations, 0),
      gate: result.report.gate,
      categories: result.report.categories,
    }, null, 2));
  } else {
    throw new Error("usage: bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status|screening-policy|screening-acquisition|development-ledger|gap-matrix|development-runs");
  }
}
