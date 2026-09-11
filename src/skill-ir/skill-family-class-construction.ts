import { buildApiRequestSpecimens, type ApiRequestSpecimens } from "./api-request-specimens";
import { verifyApiRequestSpecimens } from "./api-request-specimens-checker";
import { buildApiRequestBodyNegatives, type ApiRequestBodyNegatives } from "./api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "./api-request-body-negatives-checker";
import type { ConstructionOutcome, ObligationLedger } from "./skill-family-obligation-ledger";

/**
 * Class-scoped construction for `api-contract-driven-offline-test-construction`.
 *
 * One frozen path runs for every member: build offline request specimens and
 * schema-derived body negatives from the bound public contract, verify both with
 * the existing independent checkers, then report which source case kinds actually
 * exist and which of them were constructed. Nothing here reads a member name, a
 * repository, or a file path, so no member can take a private code path.
 */
export const CLASS_CONSTRUCTION_PROFILE = "skill-family-class-construction/v1" as const;
export const CLASS_CONSTRUCTION_CHECKERS = [
  { checkerId: "api-request-specimens-checker", checkerVersion: "api-request-specimens/v1" },
  { checkerId: "api-request-body-negatives-checker", checkerVersion: "api-request-body-negatives/v1" },
] as const;

export type CaseAvailability = Record<string, { constructed: number; unresolved: number; reasons: string[] }>;
export type ClassConstruction = {
  profile: typeof CLASS_CONSTRUCTION_PROFILE;
  specimens: ApiRequestSpecimens | null;
  negatives: ApiRequestBodyNegatives | null;
  specimenVerification: ReturnType<typeof verifyApiRequestSpecimens> | null;
  negativeVerification: ReturnType<typeof verifyApiRequestBodyNegatives> | null;
  checkerPassed: boolean;
  checkerFailures: string[];
  enumeration: { complete: boolean; operations: number; issues: string[] };
  availability: CaseAvailability;
};

const bump = (availability: CaseAvailability, kind: string, constructed: boolean, reasons: string[]) => {
  const row = availability[kind] ?? (availability[kind] = { constructed: 0, unresolved: 0, reasons: [] });
  if (constructed) row.constructed += 1;
  else { row.unresolved += 1; for (const reason of reasons) if (!row.reasons.includes(reason)) row.reasons.push(reason); }
};

const negativeKind = (obligationId: string) => obligationId.slice(obligationId.lastIndexOf(":") + 1);

function formatEnumerationIssue(issue: unknown): string {
  if (typeof issue === "string") return issue;
  if (issue && typeof issue === "object") {
    const row = issue as Record<string, unknown>;
    if (typeof row.code === "string" && typeof row.locator === "string" && typeof row.message === "string") {
      return `${row.code} at ${row.locator}: ${row.message}`;
    }
  }
  return JSON.stringify(issue) ?? String(issue);
}

export function buildClassConstruction(source: string, format: "json" | "yaml"): ClassConstruction {
  const result: ClassConstruction = { profile: CLASS_CONSTRUCTION_PROFILE, specimens: null, negatives: null, specimenVerification: null,
    negativeVerification: null, checkerPassed: false, checkerFailures: [], enumeration: { complete: false, operations: 0, issues: [] }, availability: {} };
  try {
    result.specimens = buildApiRequestSpecimens(source, format);
    result.specimenVerification = verifyApiRequestSpecimens(source, format, result.specimens);
    result.negatives = buildApiRequestBodyNegatives(source, format);
    result.negativeVerification = verifyApiRequestBodyNegatives(source, format, result.negatives);
  } catch (error) {
    result.checkerFailures.push(`construction failed before independent verification: ${String(error)}`);
    return result;
  }
  if (result.specimenVerification.status !== "pass") result.checkerFailures.push(`independent specimen checker: ${result.specimenVerification.status}`);
  if (result.negativeVerification.status !== "pass") result.checkerFailures.push(`independent body negative checker: ${result.negativeVerification.status}`);
  result.checkerPassed = result.checkerFailures.length === 0;
  result.enumeration = {
    complete: result.specimens.enumerationComplete,
    operations: result.specimens.operations.length,
    issues: result.specimens.enumerationIssues.map(formatEnumerationIssue),
  };
  for (const operation of result.specimens.operations) {
    for (const issue of operation.issues) if (!result.enumeration.issues.includes(issue)) result.enumeration.issues.push(issue);
    for (const advisory of operation.sourceAdvisories as Array<{ code?: string; reference?: string; locator?: string }>) {
      const text = `${advisory.code ?? "SOURCE_ADVISORY"}: ${advisory.reference ?? advisory.locator ?? operation.key}`;
      if (!result.enumeration.issues.includes(text)) result.enumeration.issues.push(text);
    }
    for (const specimen of operation.cases) {
      const kind = specimen.omit === null ? (specimen.mode === "full" ? "valid-full" : "valid-minimal") : "presence-negative";
      bump(result.availability, kind, specimen.status === "constructed", specimen.reasons);
    }
  }
  for (const operation of result.negatives.operations) {
    for (const negative of operation.cases) bump(result.availability, negativeKind(negative.obligationId), negative.status === "constructed", negative.reasons);
  }
  return result;
}

export type ObligationOutcomeReport = {
  outcomes: ConstructionOutcome[];
  memberCaseCount: number;
  accepted: boolean;
  constructedKinds: string[];
};

/**
 * Map a member's planned construction rows onto the shared construction result.
 * Only the case kinds the member actually declares are counted for that member,
 * so two members with different duties never share an artifact outcome.
 */
export function deriveObligationOutcomes(ledger: ObligationLedger, construction: ClassConstruction): ObligationOutcomeReport {
  const outcomes: ConstructionOutcome[] = [];
  const constructedKinds = new Set<string>();
  let memberCaseCount = 0;
  for (const row of ledger.rows) {
    if (row.plannedDisposition !== "to-construct") continue;
    if (!construction.checkerPassed) {
      outcomes.push({ obligationId: row.obligationId, outcome: "rejected-with-reason", reason: construction.checkerFailures.join("; ") || "independent checker did not pass" });
      continue;
    }
    if (row.evidence === "operation-enumeration") {
      const ok = construction.enumeration.complete && construction.enumeration.operations > 0 && construction.specimens!.operations.every((operation) => operation.caseInventoryComplete);
      if (ok) memberCaseCount += construction.enumeration.operations;
      outcomes.push(ok
        ? { obligationId: row.obligationId, outcome: "constructed", reason: null }
        : { obligationId: row.obligationId, outcome: "rejected-with-reason", reason: `operation inventory incomplete: ${construction.enumeration.issues.slice(0, 5).join("; ") || "no operation in source"}` });
      continue;
    }
    if (row.evidence === "reference-resolution") {
      const issues = construction.enumeration.issues.filter((issue) => /reference|\$ref/iu.test(issue));
      if (!issues.length) memberCaseCount += 1;
      outcomes.push(issues.length
        ? { obligationId: row.obligationId, outcome: "rejected-with-reason", reason: `unresolved source references: ${issues.slice(0, 5).join("; ")}` }
        : { obligationId: row.obligationId, outcome: "constructed", reason: null });
      continue;
    }
    if (row.evidence === "security-extraction") {
      const ok = construction.enumeration.operations > 0 && construction.specimens!.operations.every((operation) => Array.isArray(operation.security));
      if (ok) memberCaseCount += construction.enumeration.operations;
      outcomes.push(ok
        ? { obligationId: row.obligationId, outcome: "constructed", reason: null }
        : { obligationId: row.obligationId, outcome: "rejected-with-reason", reason: "declared security requirements were not extracted for every operation" });
      continue;
    }
    const present = row.caseKinds.filter((kind) => construction.availability[kind]);
    if (!present.length) {
      outcomes.push({ obligationId: row.obligationId, outcome: "unresolved", reason: `no source instance for ${row.caseKinds.join("|")} in bound input` });
      continue;
    }
    const satisfied = row.quantifier === "all"
      ? row.caseKinds.every((kind) => (construction.availability[kind]?.constructed ?? 0) > 0)
      : present.some((kind) => construction.availability[kind]!.constructed > 0);
    if (!satisfied) {
      const reasons = present.flatMap((kind) => construction.availability[kind]!.reasons).slice(0, 5);
      outcomes.push({ obligationId: row.obligationId, outcome: "rejected-with-reason", reason: `construction refused: ${reasons.join("; ") || "no constructed case"}` });
      continue;
    }
    for (const kind of present) if (construction.availability[kind]!.constructed > 0) { constructedKinds.add(kind); memberCaseCount += construction.availability[kind]!.constructed; }
    outcomes.push({ obligationId: row.obligationId, outcome: "constructed", reason: null });
  }
  const accepted = construction.checkerPassed && memberCaseCount > 0 && outcomes.some((outcome) => outcome.outcome === "constructed");
  return { outcomes, memberCaseCount, accepted, constructedKinds: [...constructedKinds].sort() };
}

const RANK = { "rejected-with-reason": 3, constructed: 2, unresolved: 1 } as const;

/**
 * Combine per-input outcomes for one member. A refusal in any bound input wins,
 * so a second input can never hide a failure. An input that simply lacks the
 * source feature stays unresolved and cannot cancel a real construction.
 */
export function mergeInputOutcomes(inputs: Array<{ inputId: string; outcomes: ConstructionOutcome[] }>): ConstructionOutcome[] {
  if (!inputs.length) throw new Error("merging requires at least one input");
  const merged = new Map<string, ConstructionOutcome & { rank: number }>();
  for (const input of inputs) {
    for (const outcome of input.outcomes) {
      const reason = outcome.reason === null ? null : `${input.inputId}: ${outcome.reason}`;
      const rank = RANK[outcome.outcome];
      const previous = merged.get(outcome.obligationId);
      if (!previous || rank > previous.rank) merged.set(outcome.obligationId, { obligationId: outcome.obligationId, outcome: outcome.outcome, reason, rank });
    }
  }
  return [...merged.values()].map(({ rank: _rank, ...row }) => row);
}
