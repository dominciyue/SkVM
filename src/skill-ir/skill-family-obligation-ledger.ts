import { createHash } from "node:crypto";

/**
 * Normalized obligation ledger for the class
 * `api-contract-driven-offline-test-construction`.
 *
 * The ledger sits between source-grounded duty extraction and construction so a
 * member's class-scoped denominator is fixed before any artifact exists, and so
 * an unmapped or unverifiable obligation can never disappear into an accepted
 * count.
 */
export const OBLIGATION_LEDGER_SCHEMA_VERSION = "skill-family-obligation-ledger/v1" as const;
export const OBLIGATION_LEDGER_CLASS_ID = "api-contract-driven-offline-test-construction" as const;

export type ClassRole = "in-class-constructible" | "in-class-unsupported" | "outside-class";
export type Disposition = "constructed" | "rejected-with-reason" | "unresolved" | "outside-class" | "source-blocked";
export type PlannedDisposition = "to-construct" | "unresolved" | "outside-class" | "source-blocked";
export type EvidenceKind = "specimen-case" | "negative-case" | "operation-enumeration" | "reference-resolution" | "security-extraction" | "none";

export type VocabularyEntry = { role: ClassRole; evidence: EvidenceKind; caseKinds: string[]; quantifier: "any" | "all"; rationale: string };

const RANGE_KINDS = ["minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"];

const constructible = (evidence: EvidenceKind, caseKinds: string[], rationale: string, quantifier: "any" | "all" = "any"): VocabularyEntry => ({ role: "in-class-constructible", evidence, caseKinds, quantifier, rationale });
const unsupported = (rationale: string): VocabularyEntry => ({ role: "in-class-unsupported", evidence: "none", caseKinds: [], quantifier: "any", rationale });
const outside = (rationale: string): VocabularyEntry => ({ role: "outside-class", evidence: "none", caseKinds: [], quantifier: "any", rationale });

/**
 * Locked class vocabulary. `in-class-constructible` means the obligation can be
 * discharged by an offline artifact built from the public contract and checked
 * by an independent checker. `in-class-unsupported` stays inside the class
 * denominator as unresolved work. `outside-class` needs a live service,
 * business state, implementation source, another vendor tool, or a human.
 */
export const CLASS_OBLIGATION_VOCABULARY: Record<string, VocabularyEntry> = {
  "all-operations": constructible("operation-enumeration", [], "operation inventory is enumerated from the contract and checked independently"),
  "request-contract": constructible("operation-enumeration", [], "request parameter and body inventory is projected from the contract"),
  "inherited-parameters": constructible("operation-enumeration", [], "path-level parameter inheritance is projected and dependency-verified"),
  metadata: constructible("operation-enumeration", [], "operation identity and metadata are read from the contract"),
  references: constructible("reference-resolution", [], "local references are resolved and unresolved references are reported"),
  security: constructible("security-extraction", [], "declared security requirements are extracted per operation"),
  "valid-request": constructible("specimen-case", ["valid-minimal", "valid-full"], "a schema-valid request specimen is assembled offline"),
  "minimal-and-full": constructible("specimen-case", ["valid-minimal", "valid-full"], "minimal and full witnesses are separate constructed specimens", "all"),
  "format-witness": constructible("specimen-case", ["valid-full"], "format-constrained values are produced inside the full witness"),
  "pattern-witness": constructible("specimen-case", ["valid-full"], "pattern-constrained values are produced inside the full witness"),
  "missing-required": constructible("negative-case", ["missing-required"], "required-property removal is constructed and independently rechecked"),
  "wrong-type": constructible("negative-case", ["wrong-type"], "type violations are constructed from the declared type"),
  "out-of-range": constructible("negative-case", RANGE_KINDS, "numeric, length and size bound violations are constructed from declared bounds"),
  "enum-violation": constructible("negative-case", ["enum"], "enum violations are constructed from the declared value set"),
  "pattern-violation": constructible("negative-case", ["pattern"], "pattern violations are constructed from the declared pattern"),
  "strict-extra-fields": constructible("negative-case", ["additionalProperties"], "additional-property violations are constructed where the schema forbids them"),

  "malformed-body": unsupported("syntactically malformed payloads are not constructed; only schema-invalid payloads are"),
  "auth-variants": unsupported("missing or wrong credential request variants are contract-derivable but not implemented"),
  "requested-output-format": unsupported("native framework output conformance is not implemented; artifacts use the project schema"),
  parameterization: unsupported("parameterized native test emission is not implemented"),
  "response-contract": unsupported("response schema inventory is analyzed elsewhere and is not part of this profile"),
  "response-assertions": unsupported("response expectation emission is not implemented in this profile"),
  "response-schema": unsupported("response schema assertion emission is not implemented in this profile"),
  "response-examples": unsupported("saved response example emission is not implemented in this profile"),
  headers: unsupported("response header expectations are handled by a separate profile"),
  "all-documented-statuses": unsupported("per-status case emission is not implemented"),
  "coverage-summary": unsupported("member-facing coverage report emission is not implemented"),
  "gap-accounting": unsupported("member-facing gap report emission is not implemented"),
  "schema-variants": unsupported("oneOf/anyOf branch enumeration is not implemented; the first viable branch is used"),
  discriminator: unsupported("discriminator-driven variant selection is not implemented"),
  "negative-fuzzing": unsupported("structural fuzzing beyond declared keyword violations is not implemented"),
  "oversized-body": unsupported("size-limit violation construction is not implemented"),
  "unsupported-media": unsupported("media-type violation construction is not implemented"),
  "error-cases": unsupported("generic error-case construction without a declared keyword is not implemented"),
  "negative-flags": unsupported("vendor negative-schema flags are not emitted"),
  "folder-grouping": unsupported("vendor collection grouping is not emitted"),
  "environment-file": unsupported("vendor environment files are not emitted"),
  "mock-output": unsupported("mock server artifacts are not emitted"),
  "load-output": unsupported("load test artifacts are not emitted"),
  "pact-output": unsupported("consumer contract artifacts are not emitted"),
  "report-template": unsupported("member report templates are not emitted"),
  "ci-step": unsupported("CI configuration emission is not implemented"),
  "run-instructions": unsupported("run instruction emission is not implemented"),
  pagination: unsupported("pagination expectation emission is not implemented"),

  "live-execution": outside("requires executing requests against a live service"),
  "live-state": outside("requires business state in a live service"),
  "crud-lifecycle": outside("requires ordered execution and persistence in a live service"),
  idempotency: outside("requires repeated live execution to observe an effect"),
  concurrency: outside("requires concurrent live execution"),
  "rate-limit": outside("requires live throttling behavior"),
  "not-found": outside("requires knowledge of absent live resources"),
  "pagination-filtering": outside("requires live collections to page and filter"),
  fixtures: outside("requires environment-specific setup and cleanup"),
  "failure-attribution": outside("requires observed live failures to attribute"),
  "task-semantic-confirmation": outside("requires a human or task-owner decision"),
  "interactive-followup": outside("requires an interactive exchange with the user"),
  "implementation-analysis": outside("requires implementation source, not the public contract"),
  "ui-validation": outside("requires a user interface under test"),
  "abuse-cases": outside("requires security semantics not present in the contract"),
  "cross-field": outside("requires business rules not present in the contract"),
  pairwise: outside("requires business risk weighting not present in the contract"),
  "data-consistency": outside("requires business invariants and live state"),
  graphql: outside("requires a GraphQL endpoint rather than an OpenAPI contract"),
  "graphql-introspection": outside("requires live GraphQL introspection"),
  "dataset-bindings": outside("requires a vendor dataset and execution platform"),
};

/**
 * Locked free-text lexicon used when a member's obligations arrive as source
 * sentences instead of curated keys. Matching is ordered and case-insensitive;
 * an unmatched obligation stays in the denominator as unresolved.
 */
export const OBLIGATION_TERM_LEXICON: Array<{ key: string; terms: string[] }> = [
  { key: "graphql-introspection", terms: ["graphql introspection", "introspect the graphql", "introspection query"] },
  { key: "graphql", terms: ["graphql"] },
  { key: "live-execution", terms: ["execute the test", "run the test", "against the live", "live service", "live api", "live endpoint", "runtime execution", "execute requests", "run the suite", "actually call"] },
  { key: "failure-attribution", terms: ["attribute failure", "diagnose failure", "triage", "root cause"] },
  { key: "crud-lifecycle", terms: ["crud", "create read update delete", "lifecycle", "create then delete", "verify persistence"] },
  { key: "idempotency", terms: ["idempoten"] },
  { key: "concurrency", terms: ["concurren", "race condition", "parallel request"] },
  { key: "rate-limit", terms: ["rate limit", "throttl", "429"] },
  { key: "not-found", terms: ["not found", "404 for a missing", "nonexistent resource", "non-existent resource"] },
  { key: "pagination-filtering", terms: ["pagination and filter", "paginate and filter", "filtering and sorting"] },
  { key: "pagination", terms: ["pagination", "paging metadata", "page metadata"] },
  { key: "fixtures", terms: ["fixture", "setup and cleanup", "test data setup", "seed data", "teardown"] },
  { key: "task-semantic-confirmation", terms: ["ask the user", "clarify with", "confirm with the", "resolve ambiguity with", "clarifying question"] },
  { key: "interactive-followup", terms: ["offer to", "follow-up documentation", "interactive follow"] },
  { key: "implementation-analysis", terms: ["read the controller", "inspect the implementation", "source code of the service", "read the handler", "existing tests in the repository"] },
  { key: "ui-validation", terms: ["user interface", " ui ", "browser"] },
  { key: "abuse-cases", terms: ["abuse case", "sql injection", "security attack", "penetration"] },
  { key: "cross-field", terms: ["cross-field", "cross field", "business rule", "business logic constraint"] },
  { key: "pairwise", terms: ["pairwise", "combinatorial reduction"] },
  { key: "data-consistency", terms: ["data consistency", "state consistency"] },
  { key: "dataset-bindings", terms: ["dataset", "drift dataset", "execution platform binding"] },
  { key: "live-state", terms: ["database state", "stateful data", "persisted state", "live state"] },

  { key: "minimal-and-full", terms: ["minimal and full", "minimal payload and", "required-only and full", "minimal request and full"] },
  { key: "missing-required", terms: ["missing required", "omit a required", "required field is absent", "without required"] },
  { key: "wrong-type", terms: ["wrong type", "invalid type", "type mismatch", "incorrect data type"] },
  { key: "out-of-range", terms: ["out of range", "out-of-range", "boundary value", "exceed the maximum", "below the minimum", "length limit", "too long", "too short", "boundary case"] },
  { key: "enum-violation", terms: ["invalid enum", "enum violation", "value outside the enum", "not in the allowed values"] },
  { key: "pattern-violation", terms: ["pattern violation", "violates the pattern", "invalid format string", "regex violation"] },
  { key: "strict-extra-fields", terms: ["additional propert", "extra field", "unexpected field", "unknown propert"] },
  { key: "malformed-body", terms: ["malformed", "invalid json syntax", "broken payload"] },
  { key: "negative-fuzzing", terms: ["fuzz", "random mutation"] },
  { key: "oversized-body", terms: ["oversized", "payload too large", "413"] },
  { key: "unsupported-media", terms: ["unsupported media", "415", "wrong content type"] },
  { key: "auth-variants", terms: ["without authentication", "invalid token", "expired token", "missing credential", "auth variant", "unauthorized request", "401", "403"] },
  { key: "format-witness", terms: ["format-constrained", "respect the declared format", "valid format value"] },
  { key: "pattern-witness", terms: ["matches the pattern", "pattern-conforming"] },
  { key: "valid-request", terms: ["valid request", "happy path", "valid payload", "well-formed request", "successful request", "valid example request", "example request body", "request example"] },

  { key: "schema-variants", terms: ["oneof", "anyof", "allof", "schema variant", "branch of the schema"] },
  { key: "discriminator", terms: ["discriminator"] },
  { key: "references", terms: ["$ref", "resolve reference", "resolve the reference", "dereference", "referenced schema"] },
  { key: "inherited-parameters", terms: ["inherited parameter", "path-level parameter", "path level parameter"] },
  { key: "all-operations", terms: ["every endpoint", "all endpoints", "each endpoint", "every operation", "all operations", "each operation", "catalog the endpoint", "enumerate the endpoint"] },
  { key: "request-contract", terms: ["request schema", "request contract", "request parameters", "parameters and body"] },
  { key: "security", terms: ["security scheme", "authentication scheme", "declared security", "auth requirement"] },
  { key: "metadata", terms: ["operation metadata", "operationid", "tags and summary"] },

  { key: "all-documented-statuses", terms: ["documented status", "every status code", "each response status"] },
  { key: "response-schema", terms: ["response schema", "validate the response body", "response body schema"] },
  { key: "response-examples", terms: ["saved response", "response example"] },
  { key: "response-assertions", terms: ["assert the response", "response assertion", "check the response"] },
  { key: "response-contract", terms: ["response contract", "response definition"] },
  { key: "headers", terms: ["response header", "header assertion"] },
  { key: "coverage-summary", terms: ["coverage summary", "coverage report", "summarize coverage", "endpoint matrix"] },
  { key: "gap-accounting", terms: ["gap", "not covered", "exclusion", "known limitation"] },
  { key: "requested-output-format", terms: ["requested framework", "output format", "emit tests in", "generate tests in", "postman collection", "pytest", "jest", "playwright", "test file"] },
  { key: "parameterization", terms: ["parameteriz", "test.each", "data-driven test"] },
  { key: "run-instructions", terms: ["install and run", "run instruction", "how to run"] },
  { key: "ci-step", terms: ["ci pipeline", "ci step", "github action", "continuous integration"] },
  { key: "report-template", terms: ["report template", "consolidated statistics"] },
  { key: "environment-file", terms: ["environment file", "environment variable file"] },
  { key: "folder-grouping", terms: ["folder", "group by tag", "collection structure"] },
  { key: "mock-output", terms: ["mock server", "mock output", "stub server"] },
  { key: "load-output", terms: ["load test", "k6", "performance test"] },
  { key: "pact-output", terms: ["pact", "consumer contract", "consumer-driven contract"] },
  { key: "negative-flags", terms: ["negative schema flag", "negative flag"] },
  { key: "error-cases", terms: ["error case", "invalid input", "negative case", "negative test"] },
];

for (const entry of OBLIGATION_TERM_LEXICON) {
  if (!CLASS_OBLIGATION_VOCABULARY[entry.key]) throw new Error(`lexicon references unknown class obligation key: ${entry.key}`);
}

export function normalizeObligationTerm(text: string): { key: string; matchedTerm: string } | null {
  const haystack = ` ${String(text).toLowerCase().replace(/\s+/gu, " ")} `;
  for (const entry of OBLIGATION_TERM_LEXICON) {
    for (const term of entry.terms) if (haystack.includes(term)) return { key: entry.key, matchedTerm: term };
  }
  return null;
}

export type LedgerObligationInput = { obligationId: string; key?: string; text: string; sourceLocator: string; sourceVerified: boolean };
export type LedgerRow = {
  obligationId: string; key: string | null; keySource: "declared" | "normalized" | "unmapped"; matchedTerm: string | null;
  text: string; sourceLocator: string; role: ClassRole | null; evidence: EvidenceKind; caseKinds: string[]; quantifier: "any" | "all";
  plannedDisposition: PlannedDisposition; reason: string | null;
};
export type ObligationLedger = {
  schemaVersion: typeof OBLIGATION_LEDGER_SCHEMA_VERSION; classId: typeof OBLIGATION_LEDGER_CLASS_ID;
  memberId: string; rows: LedgerRow[]; rowCount: number; plannedConstructionCount: number; denominatorSha256: string;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function buildObligationLedger(input: { memberId: string; obligations: LedgerObligationInput[] }): ObligationLedger {
  if (typeof input?.memberId !== "string" || !input.memberId) throw new Error("obligation ledger requires a memberId");
  if (!Array.isArray(input.obligations) || input.obligations.length === 0) throw new Error("obligation ledger requires at least one obligation");
  const seen = new Set<string>();
  const rows = input.obligations.map((obligation) => {
    if (typeof obligation?.obligationId !== "string" || !obligation.obligationId) throw new Error("obligation identity is required");
    if (seen.has(obligation.obligationId)) throw new Error(`duplicate obligation identity: ${obligation.obligationId}`);
    seen.add(obligation.obligationId);
    if (typeof obligation.sourceLocator !== "string" || !obligation.sourceLocator.trim()) throw new Error(`obligation source locator is required: ${obligation.obligationId}`);
    if (typeof obligation.text !== "string" || !obligation.text.trim()) throw new Error(`obligation text is required: ${obligation.obligationId}`);
    if (typeof obligation.sourceVerified !== "boolean") throw new Error(`obligation sourceVerified is required: ${obligation.obligationId}`);
    let key: string | null = null, keySource: LedgerRow["keySource"] = "unmapped", matchedTerm: string | null = null;
    if (obligation.key !== undefined) {
      if (!CLASS_OBLIGATION_VOCABULARY[obligation.key]) throw new Error(`unknown class obligation key: ${obligation.key}`);
      key = obligation.key; keySource = "declared";
    } else {
      const normalized = normalizeObligationTerm(obligation.text);
      if (normalized) { key = normalized.key; keySource = "normalized"; matchedTerm = normalized.matchedTerm; }
    }
    const entry = key ? CLASS_OBLIGATION_VOCABULARY[key]! : null;
    const plannedDisposition: PlannedDisposition = !obligation.sourceVerified ? "source-blocked"
      : !entry ? "unresolved"
        : entry.role === "outside-class" ? "outside-class"
          : entry.role === "in-class-unsupported" ? "unresolved" : "to-construct";
    const reason = !obligation.sourceVerified ? "source locator not verified against the fixed source body"
      : !entry ? "unmapped-obligation-term"
        : entry.role === "in-class-unsupported" ? "in-class-unsupported" : null;
    return { obligationId: obligation.obligationId, key, keySource, matchedTerm, text: obligation.text, sourceLocator: obligation.sourceLocator,
      role: entry?.role ?? null, evidence: entry?.evidence ?? "none", caseKinds: entry?.caseKinds ?? [], quantifier: entry?.quantifier ?? "any",
      plannedDisposition, reason } satisfies LedgerRow;
  });
  return {
    schemaVersion: OBLIGATION_LEDGER_SCHEMA_VERSION, classId: OBLIGATION_LEDGER_CLASS_ID, memberId: input.memberId, rows,
    rowCount: rows.length, plannedConstructionCount: rows.filter((row) => row.plannedDisposition === "to-construct").length,
    denominatorSha256: sha256(JSON.stringify(rows.map((row) => [row.obligationId, row.key, row.sourceLocator, row.plannedDisposition]))),
  };
}

export type ConstructionOutcome = { obligationId: string; outcome: "constructed" | "rejected-with-reason" | "unresolved"; reason: string | null };
export type ResolvedObligationLedger = ObligationLedger & {
  resolved: Array<LedgerRow & { disposition: Disposition; resolutionReason: string | null }>;
  dispositions: Record<Disposition, number>;
};

const OUTCOMES = ["constructed", "rejected-with-reason", "unresolved"];

/**
 * Apply construction outcomes to a planned ledger. The row set is immutable:
 * every planned construction row must receive exactly one outcome, and no other
 * row may be resolved, added, or deleted.
 */
export function resolveObligationLedger(ledger: ObligationLedger, outcomes: ConstructionOutcome[]): ResolvedObligationLedger {
  const recomputed = sha256(JSON.stringify(ledger.rows.map((row) => [row.obligationId, row.key, row.sourceLocator, row.plannedDisposition])));
  if (recomputed !== ledger.denominatorSha256 || ledger.rows.length !== ledger.rowCount) throw new Error("obligation denominator changed after it was fixed");
  const byId = new Map<string, ConstructionOutcome>();
  for (const outcome of outcomes) {
    const row = ledger.rows.find((candidate) => candidate.obligationId === outcome.obligationId);
    if (!row) throw new Error(`unknown obligation in outcome list: ${outcome.obligationId}`);
    if (row.plannedDisposition !== "to-construct") throw new Error(`only planned construction rows accept an outcome: ${outcome.obligationId}`);
    if (byId.has(outcome.obligationId)) throw new Error(`duplicate outcome for obligation: ${outcome.obligationId}`);
    if (!OUTCOMES.includes(outcome.outcome)) throw new Error(`unsupported construction outcome: ${String(outcome.outcome)}`);
    if (outcome.outcome !== "constructed" && !outcome.reason) throw new Error(`outcome requires a reason: ${outcome.obligationId}`);
    byId.set(outcome.obligationId, outcome);
  }
  const missing = ledger.rows.filter((row) => row.plannedDisposition === "to-construct" && !byId.has(row.obligationId));
  if (missing.length) throw new Error(`every planned construction row needs an outcome; missing ${missing.map((row) => row.obligationId).join(",")}`);
  const resolved = ledger.rows.map((row) => {
    const outcome = byId.get(row.obligationId);
    const disposition: Disposition = outcome ? outcome.outcome : row.plannedDisposition as Exclude<PlannedDisposition, "to-construct">;
    return { ...row, disposition, resolutionReason: outcome ? outcome.reason : row.reason };
  });
  const dispositions = { constructed: 0, "rejected-with-reason": 0, unresolved: 0, "outside-class": 0, "source-blocked": 0 } as Record<Disposition, number>;
  for (const row of resolved) dispositions[row.disposition] += 1;
  return { ...ledger, resolved, dispositions };
}
