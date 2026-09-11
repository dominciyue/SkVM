import { decodeDevelopmentUtf8 } from "./development-utf8";
import { type DutySourceFile, validateDutyDraft } from "./skill-duty-extraction";
import {
  buildObligationLedger,
  normalizeObligationTerm,
  type LedgerObligationInput,
  type ObligationLedger,
} from "./skill-family-obligation-ledger";

export type DutyDraft = NonNullable<ReturnType<typeof validateDutyDraft>["draft"]>;
export type ClassCriterionId =
  | "public-api-contract-input"
  | "explicit-coverage-requirements"
  | "offline-request-or-test-artifacts"
  | "independent-check-possible";

const TEST_KEYS = new Set([
  "valid-request", "missing-required", "wrong-type", "out-of-range", "enum-violation",
  "pattern-violation", "minimal-and-full", "format-witness", "pattern-witness", "strict-extra-fields",
]);
const COVERAGE_KEYS = new Set([...TEST_KEYS, "coverage-summary", "gap-accounting", "error-cases", "all-operations"]);

export function memberSlug(candidateId: string) {
  return candidateId.replaceAll("/", "-").replaceAll(":", "__");
}

function presentKeys(keys: Array<string | null | undefined>) {
  return new Set(keys.filter((key): key is string => typeof key === "string" && key.length > 0));
}

/**
 * Frozen class-membership questions from the candidate contract. Evaluation
 * uses source language plus mapped obligation keys. It does not branch on
 * repository or member identity.
 */
export function evaluateClassCriteria(sourceText: string, keys: Array<string | null | undefined>) {
  const present = presentKeys(keys);
  const hay = ` ${String(sourceText).toLowerCase().replace(/\s+/gu, " ")} `;
  const mentionsContract = /\bopenapi\b|\bswagger\b|\boas[\s-]?3\b|\bapi contract\b/u.test(hay);
  const hasTestConstruction = [...TEST_KEYS].some((key) => present.has(key));
  const hasNativeTests = present.has("requested-output-format") || present.has("parameterization");
  const designPrimary = /when creating api specifications|design openapi specifications|create api documentation|create a document|authoring api/u.test(hay);
  const clientPrimary = /generate a .{0,80}client|generate client sdk|openapi\.client\(/u.test(hay) && !hasTestConstruction;
  const livePrimary = (present.has("live-execution") || /exercise a real or local http|query your .{0,80} from the terminal|against the live/u.test(hay))
    && !hasTestConstruction;
  const forTestArtifacts = hasTestConstruction || (hasNativeTests && mentionsContract && !designPrimary && !clientPrimary && !livePrimary);
  const takesContractForTests = mentionsContract && forTestArtifacts && !designPrimary && !clientPrimary && !livePrimary;
  const explicitCoverage = [...COVERAGE_KEYS].some((key) => present.has(key)) && forTestArtifacts;
  const independent = hasTestConstruction;
  const criteria: Record<ClassCriterionId, { satisfied: boolean; evidence: string }> = {
    "public-api-contract-input": {
      satisfied: takesContractForTests,
      evidence: takesContractForTests
        ? "source consumes a public API contract as the primary input for request/test construction"
        : "primary task is not constructing request/test artifacts from a given public contract",
    },
    "explicit-coverage-requirements": {
      satisfied: explicitCoverage,
      evidence: explicitCoverage
        ? "mapped obligations include explicit case or coverage construction over the contract"
        : "no explicit coverage or case-construction obligations over a public contract",
    },
    "offline-request-or-test-artifacts": {
      satisfied: forTestArtifacts && !livePrimary,
      evidence: forTestArtifacts && !livePrimary
        ? "source requires offline request or test artifacts"
        : "required outputs are live execution, client generation, or spec authoring",
    },
    "independent-check-possible": {
      satisfied: independent,
      evidence: independent
        ? "in-class constructible request/negative cases can be checked from the contract"
        : "no independently checkable request/test artifacts are in the class slice",
    },
  };
  const inClass = (Object.values(criteria) as Array<{ satisfied: boolean }>).every((row) => row.satisfied);
  const inputQualified = criteria["public-api-contract-input"].satisfied;
  return {
    inClass, inputQualified, criteria, designPrimary, clientPrimary, livePrimary, hasTestConstruction, mentionsContract,
    applicableInputCount: (bound: number) => inputQualified ? bound : 0,
  };
}

export function keyFromSourceGroundedObligation(text: string, quote: string) {
  const fromText = normalizeObligationTerm(text);
  if (fromText && quote.toLowerCase().includes(fromText.matchedTerm)) return fromText;
  return normalizeObligationTerm(quote);
}

export function ledgerFromDutyDraft(memberId: string, draft: DutyDraft): ObligationLedger {
  const obligations: LedgerObligationInput[] = [];
  for (const duty of draft.responsibilities) {
    for (const [index, obligation] of duty.obligations.entries()) {
      const evidence = obligation.evidence[0]!;
      const normalized = keyFromSourceGroundedObligation(obligation.text, evidence.quote);
      obligations.push({
        obligationId: `${duty.id}/${index}`,
        text: normalized ? obligation.text : evidence.quote,
        sourceLocator: `${evidence.fileId}:${evidence.startLine}-${evidence.endLine}`,
        sourceVerified: true,
        ...(normalized ? { key: normalized.key } : {}),
      });
    }
  }
  return buildObligationLedger({ memberId, obligations });
}

export function inventoryFromSourceFiles(files: DutySourceFile[]): DutyDraft {
  const skill = files.find((file) => file.kind === "skill");
  if (!skill) throw new Error("inventory requires a skill body");
  const lines = decodeDevelopmentUtf8(skill.bytes).split(/\r?\n/u);
  type Current = { id: string; description: string; start: number; heading: string; bullets: Array<{ line: number; text: string }> };
  const responsibilities: DutyDraft["responsibilities"] = [];
  let current: Current | null = null;
  const slug = (text: string, index: number) => {
    const base = text.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 40) || "duty";
    const prefixed = /^[a-z]/u.test(base) ? base : `duty-${base}`;
    return `${prefixed}-${index}`.replace(/-+$/gu, "").slice(0, 64);
  };
  const quote = (line: number) => {
    const text = lines[line - 1] ?? "";
    return (text.trim() ? text : `line-${line}`).slice(0, 8192);
  };
  const flush = () => {
    if (!current || responsibilities.length >= 40) return;
    const obligations = (current.bullets.length
      ? current.bullets.map((bullet) => ({
        text: bullet.text.slice(0, 2000),
        evidence: [{ fileId: skill.id, startLine: bullet.line, endLine: bullet.line, quote: quote(bullet.line) }],
      }))
      : [{
        text: current.description.slice(0, 2000),
        evidence: [{ fileId: skill.id, startLine: current.start, endLine: current.start, quote: quote(current.start) }],
      }]).slice(0, 40);
    responsibilities.push({
      id: current.id,
      description: current.description.slice(0, 2000),
      evidence: [{ fileId: skill.id, startLine: current.start, endLine: current.start, quote: quote(current.start) }],
      obligations,
    });
    current = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^(#{1,3})\s+(.+)$/u.exec(lines[index]!);
    if (heading) {
      flush();
      current = { id: slug(heading[2]!, responsibilities.length), description: heading[2]!.trim(), start: index + 1, heading: lines[index]!, bullets: [] };
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/u.exec(lines[index]!);
    if (bullet && current && current.bullets.length < 40) current.bullets.push({ line: index + 1, text: bullet[1]!.trim() });
  }
  flush();
  if (!responsibilities.length) {
    const line = Math.max(1, lines.findIndex((row) => row.trim().length > 0) + 1);
    responsibilities.push({
      id: "source-body",
      description: (lines[line - 1] || "skill body").slice(0, 2000),
      evidence: [{ fileId: skill.id, startLine: line, endLine: line, quote: quote(line) }],
      obligations: [{ text: (lines[line - 1] || "skill body").slice(0, 2000), evidence: [{ fileId: skill.id, startLine: line, endLine: line, quote: quote(line) }] }],
    });
  }
  return {
    schemaVersion: "skill-duty-draft/v1",
    responsibilities,
    unresolved: ["agent-authored inventory after failed or invalid model request; semantic review is not automatically approved"],
  };
}

export function semanticAdjudications(texts: string[]) {
  return texts.flatMap((text) => {
    const key = normalizeObligationTerm(text)?.key ?? null;
    const rows: Array<{ text: string; key: string | null; disposition: "unresolved" | "outside-class"; reason: string; silentlyApproved: false }> = [];
    if (key === "live-execution" || /against the live|exercise a real or local http/iu.test(text)) {
      rows.push({ text, key, disposition: "outside-class", reason: "live execution remains outside-class", silentlyApproved: false });
    }
    if (key === "requested-output-format") {
      rows.push({ text, key, disposition: "unresolved", reason: "native emission remains in-class-unsupported", silentlyApproved: false });
    }
    if (/401|403|unauthorized|forbidden/iu.test(text)) {
      rows.push({ text, key, disposition: "unresolved", reason: "conflicting status or live-auth is not silently approved", silentlyApproved: false });
    }
    return rows;
  });
}

export type ClassDecisionLabel =
  | "bounded-positive"
  | "bounded-negative"
  | "insufficient-evidence"
  | "method-not-ready"
  | "blocked-before-evaluation";

export function decideClassResult(input: {
  methodReady: boolean;
  freezeStatus: string;
  selectedCount: number;
  members: Array<{ inputQualified: boolean; acceptedArtifactCount: number; classified: boolean }>;
  sharedRevision: "none-required" | "applied";
  remainingSharedDefect: boolean;
  acceptedHaveChecker: boolean;
}) {
  const inputQualifiedCount = input.members.filter((row) => row.inputQualified).length;
  const acceptedQualifiedCount = input.members.filter((row) => row.inputQualified && row.acceptedArtifactCount > 0).length;
  const classified = input.members.every((row) => row.classified);
  if (!input.methodReady || input.freezeStatus === "method-not-ready") {
    return { decision: "method-not-ready" as const, reason: "calibration or shadow failed before held-out evaluation", inputQualifiedCount, acceptedQualifiedCount };
  }
  if (input.freezeStatus === "blocked-before-evaluation" || input.selectedCount < 3) {
    return { decision: "blocked-before-evaluation" as const, reason: "acquisition or infrastructure prevented a fair three-member run", inputQualifiedCount, acceptedQualifiedCount };
  }
  if (input.freezeStatus !== "method-frozen") {
    return { decision: "insufficient-evidence" as const, reason: `freeze gate status is ${input.freezeStatus}`, inputQualifiedCount, acceptedQualifiedCount };
  }
  if (!classified) {
    return { decision: "insufficient-evidence" as const, reason: "held-out obligations are not fully classified", inputQualifiedCount, acceptedQualifiedCount };
  }
  if (inputQualifiedCount < 3) {
    return { decision: "insufficient-evidence" as const, reason: "fewer than three selected members are input-qualified", inputQualifiedCount, acceptedQualifiedCount };
  }
  if (!input.acceptedHaveChecker) {
    return { decision: "insufficient-evidence" as const, reason: "an accepted artifact is missing independent checker evidence", inputQualifiedCount, acceptedQualifiedCount };
  }
  if (input.remainingSharedDefect) {
    return { decision: "bounded-negative" as const, reason: "a shared checker defect remained after the permitted revision", inputQualifiedCount, acceptedQualifiedCount };
  }
  if (acceptedQualifiedCount >= 2) {
    return { decision: "bounded-positive" as const, reason: "at least two of three input-qualified members produced accepted artifacts", inputQualifiedCount, acceptedQualifiedCount };
  }
  return { decision: "bounded-negative" as const, reason: "fair three-member panel produced accepted artifacts for fewer than two input-qualified members", inputQualifiedCount, acceptedQualifiedCount };
}
