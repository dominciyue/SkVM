import { expect, test } from "bun:test";
import { adjudicateSemanticFixture, CALIBRATION_FIXTURE_IDS } from "./skill-family-calibration-fixtures";
import { buildClassConstruction } from "./skill-family-class-construction";
import { buildObligationLedger, resolveObligationLedger } from "./skill-family-obligation-ledger";
import { deriveObligationOutcomes } from "./skill-family-class-construction";

test("every named calibration fixture has an explicit disposition", () => {
  expect(CALIBRATION_FIXTURE_IDS).toEqual([
    "conflicting-expected-status",
    "missing-host-tool-metadata",
    "guidance-not-repair-authority",
    "missing-local-reference",
    "external-response-advisory",
  ]);
  for (const id of CALIBRATION_FIXTURE_IDS) {
    const row = adjudicateSemanticFixture(id);
    expect(["unresolved", "source-blocked", "rejected-with-reason", "outside-class"]).toContain(row.disposition);
    expect(row.disposition).not.toBe("constructed");
    expect(row.reason.length).toBeGreaterThan(0);
  }
});

test("conflicting status, missing metadata and repair-guidance stay unresolved", () => {
  expect(adjudicateSemanticFixture("conflicting-expected-status").disposition).toBe("unresolved");
  expect(adjudicateSemanticFixture("missing-host-tool-metadata").disposition).toBe("unresolved");
  expect(adjudicateSemanticFixture("guidance-not-repair-authority").disposition).toBe("unresolved");
});

const missingRef = `openapi: 3.0.3
info: { title: t, version: "1" }
paths:
  /p:
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Missing" }
      responses: { "200": { description: ok } }
`;

const externalRef = `openapi: 3.0.3
info: { title: t, version: "1" }
paths:
  /p:
    post:
      requestBody:
        content:
          application/json:
            schema: { $ref: "https://example.invalid/schema.json" }
      responses: { "200": { description: ok } }
`;

test("a missing local reference is not silently accepted", () => {
  const ledger = buildObligationLedger({ memberId: "fix", obligations: [{ obligationId: "r", key: "references", text: "resolve refs", sourceLocator: "fixture:missing-local-reference", sourceVerified: true }] });
  const built = buildClassConstruction(missingRef, "yaml");
  const outcomes = deriveObligationOutcomes(ledger, built);
  expect(outcomes.accepted).toBe(false);
  expect(outcomes.outcomes[0]!.outcome).toBe("rejected-with-reason");
  const resolved = resolveObligationLedger(ledger, outcomes.outcomes);
  expect(resolved.dispositions.constructed).toBe(0);
});

test("an external response advisory is source-blocked rather than accepted", () => {
  expect(adjudicateSemanticFixture("external-response-advisory").disposition).toBe("source-blocked");
  const ledger = buildObligationLedger({ memberId: "fix", obligations: [{ obligationId: "r", key: "references", text: "resolve refs", sourceLocator: "fixture:external-response-advisory", sourceVerified: false }] });
  expect(ledger.rows[0]!.plannedDisposition).toBe("source-blocked");
  const built = buildClassConstruction(externalRef, "yaml");
  expect(built.enumeration.issues.join(" ")).toMatch(/REFERENCE_EXTERNAL/u);
  expect(deriveObligationOutcomes(ledger, built).outcomes).toEqual([]);
});
