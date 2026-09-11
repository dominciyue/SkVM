import { expect, test } from "bun:test";
import { CLASS_OBLIGATION_VOCABULARY, buildObligationLedger, normalizeObligationTerm, resolveObligationLedger } from "./skill-family-obligation-ledger";

const row = (over: Record<string, unknown> = {}) => ({ obligationId: "o1", text: "construct a valid request for each endpoint", sourceLocator: "SKILL.md:74-80", sourceVerified: true, ...over });
const ledger = (rows = [row()]) => buildObligationLedger({ memberId: "m1", obligations: rows as any });

test("vocabulary keys carry exactly one class role and constructible keys name case kinds", () => {
  for (const [key, entry] of Object.entries(CLASS_OBLIGATION_VOCABULARY)) {
    expect(["in-class-constructible", "in-class-unsupported", "outside-class"]).toContain(entry.role);
    expect(entry.rationale.length).toBeGreaterThan(0);
    if (entry.role === "in-class-constructible") expect(entry.evidence).not.toBe("none");
    else expect(entry.caseKinds).toEqual([]);
    expect(key).toMatch(/^[a-z][a-z0-9-]*$/u);
  }
});

test("normalization is deterministic and fails closed on unknown terms", () => {
  expect(normalizeObligationTerm("Generate a valid request body for every operation")?.key).toBe("valid-request");
  expect(normalizeObligationTerm("Execute the suite against the live staging service")?.key).toBe("live-execution");
  expect(normalizeObligationTerm("Ask the maintainer which colour the logo should be")).toBeNull();
  expect(normalizeObligationTerm("VALID REQUEST")?.key).toBe(normalizeObligationTerm("valid request")?.key);
});

test("explicit keys win over free-text normalization", () => {
  const built = ledger([row({ key: "live-execution" })]);
  expect(built.rows[0]!.key).toBe("live-execution");
  expect(built.rows[0]!.plannedDisposition).toBe("outside-class");
  expect(built.rows[0]!.keySource).toBe("declared");
});

test("planned dispositions follow the class role", () => {
  const built = ledger([row({ obligationId: "a", key: "valid-request" }), row({ obligationId: "b", key: "requested-output-format" }),
    row({ obligationId: "c", key: "crud-lifecycle" }), row({ obligationId: "d", text: "invent a brand new duty nobody named" })]);
  expect(built.rows.map((r) => r.plannedDisposition)).toEqual(["to-construct", "unresolved", "outside-class", "unresolved"]);
  expect(built.rows[3]!.reason).toBe("unmapped-obligation-term");
  expect(built.rows[1]!.reason).toBe("in-class-unsupported");
});

test("unverified source locators are source-blocked, never silently dropped", () => {
  const built = ledger([row({ key: "valid-request", sourceVerified: false })]);
  expect(built.rows[0]!.plannedDisposition).toBe("source-blocked");
  expect(built.rowCount).toBe(1);
});

test("rejects duplicate identities, empty locators and unknown declared keys", () => {
  expect(() => ledger([row(), row()])).toThrow(/duplicate obligation/);
  expect(() => ledger([row({ sourceLocator: "" })])).toThrow(/source locator/);
  expect(() => ledger([row({ key: "not-a-real-key" })])).toThrow(/unknown class obligation key/);
  expect(() => buildObligationLedger({ memberId: "", obligations: [row()] as any })).toThrow(/memberId/);
  expect(() => buildObligationLedger({ memberId: "m1", obligations: [] })).toThrow(/at least one obligation/);
});

test("resolution keeps the denominator immutable", () => {
  const built = ledger([row({ obligationId: "a", key: "valid-request" }), row({ obligationId: "b", key: "crud-lifecycle" })]);
  const resolved = resolveObligationLedger(built, [{ obligationId: "a", outcome: "constructed", reason: null }]);
  expect(resolved.dispositions).toEqual({ constructed: 1, "rejected-with-reason": 0, unresolved: 0, "outside-class": 1, "source-blocked": 0 });
  expect(resolved.denominatorSha256).toBe(built.denominatorSha256);
  expect(() => resolveObligationLedger(built, [])).toThrow(/every planned construction/);
  expect(() => resolveObligationLedger(built, [{ obligationId: "a", outcome: "constructed", reason: null }, { obligationId: "z", outcome: "constructed", reason: null }])).toThrow(/unknown obligation/);
  expect(() => resolveObligationLedger(built, [{ obligationId: "b", outcome: "constructed", reason: null }, { obligationId: "a", outcome: "constructed", reason: null }])).toThrow(/only planned construction rows/);
  expect(() => resolveObligationLedger({ ...built, rows: built.rows.slice(0, 1) }, [{ obligationId: "a", outcome: "constructed", reason: null }])).toThrow(/denominator/);
});

test("rejected and unresolved outcomes require a reason", () => {
  const built = ledger([row({ obligationId: "a", key: "valid-request" })]);
  expect(() => resolveObligationLedger(built, [{ obligationId: "a", outcome: "rejected-with-reason", reason: null }])).toThrow(/reason/);
  expect(resolveObligationLedger(built, [{ obligationId: "a", outcome: "unresolved", reason: "no source instance in bound inputs" }]).dispositions.unresolved).toBe(1);
});

test("accepted is never a disposition", () => {
  const built = ledger([row({ obligationId: "a", key: "valid-request" })]);
  expect(() => resolveObligationLedger(built, [{ obligationId: "a", outcome: "accepted" as never, reason: null }])).toThrow(/outcome/);
});
