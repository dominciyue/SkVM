import { expect, test } from "bun:test";
import { buildObligationLedger } from "./skill-family-obligation-ledger";
import { buildClassConstruction, deriveObligationOutcomes, mergeInputOutcomes } from "./skill-family-class-construction";

const document = `openapi: 3.0.3
info: { title: t, version: "1" }
paths:
  /widgets:
    post:
      operationId: createWidget
      security: [{ apiKey: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              required: [name, size]
              properties:
                name: { type: string, minLength: 2, maxLength: 40 }
                size: { type: integer, minimum: 1, maximum: 9 }
                shape: { type: string, enum: [round, square] }
      responses: { "201": { description: ok } }
components:
  securitySchemes:
    apiKey: { type: apiKey, in: header, name: X-Key }
`;

test("construction reports independent checker status and source case availability", () => {
  const built = buildClassConstruction(document, "yaml");
  expect(built.specimenVerification?.status).toBe("pass");
  expect(built.negativeVerification?.status).toBe("pass");
  expect(built.checkerPassed).toBe(true);
  expect(built.availability["valid-full"]!.constructed).toBeGreaterThan(0);
  expect(built.availability["enum"]!.constructed).toBeGreaterThan(0);
  expect(built.availability["additionalProperties"]!.constructed).toBeGreaterThan(0);
  expect(built.availability["uniqueItems"]).toBeUndefined();
});

test("enumeration issues preserve source error code, locator, and message", () => {
  const built = buildClassConstruction(JSON.stringify({
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: { "/broken": 7 },
  }), "json");
  expect(built.enumeration.issues).toContain(
    "INVALID_PATH_ITEM at #/paths/~1broken: invalid path item /broken",
  );
});

test("obligations without a source instance stay unresolved rather than rejected", () => {
  const ledger = buildObligationLedger({ memberId: "m", obligations: [
    { obligationId: "a", key: "valid-request", text: "valid request", sourceLocator: "S:1", sourceVerified: true },
    { obligationId: "b", key: "enum-violation", text: "enum", sourceLocator: "S:2", sourceVerified: true },
    { obligationId: "c", key: "strict-extra-fields", text: "extra", sourceLocator: "S:3", sourceVerified: true },
  ] });
  const built = buildClassConstruction(document, "yaml");
  const outcomes = deriveObligationOutcomes(ledger, built);
  expect(outcomes.outcomes.map((row) => row.outcome)).toEqual(["constructed", "constructed", "constructed"]);
  expect(outcomes.memberCaseCount).toBeGreaterThan(0);

  const bare = buildClassConstruction(`openapi: 3.0.3\ninfo: { title: t, version: "1" }\npaths:\n  /p:\n    get:\n      responses: { "200": { description: ok } }\n`, "yaml");
  const bareOutcomes = deriveObligationOutcomes(ledger, bare);
  expect(bareOutcomes.outcomes.find((row) => row.obligationId === "b")!.outcome).toBe("unresolved");
  expect(bareOutcomes.outcomes.find((row) => row.obligationId === "b")!.reason).toMatch(/no source instance/);
});

test("a failed independent checker rejects every construction row for that input", () => {
  const ledger = buildObligationLedger({ memberId: "m", obligations: [{ obligationId: "a", key: "valid-request", text: "valid request", sourceLocator: "S:1", sourceVerified: true }] });
  const built = buildClassConstruction(document, "yaml");
  const tampered = { ...built, checkerPassed: false, checkerFailures: ["independent specimen checker failed"] };
  const outcomes = deriveObligationOutcomes(ledger, tampered);
  expect(outcomes.outcomes[0]!.outcome).toBe("rejected-with-reason");
  expect(outcomes.accepted).toBe(false);
});

test("merging inputs requires every input with a source instance to construct", () => {
  const merged = mergeInputOutcomes([
    { inputId: "i1", outcomes: [{ obligationId: "a", outcome: "constructed", reason: null }, { obligationId: "b", outcome: "unresolved", reason: "no source instance for enum in bound input" }] },
    { inputId: "i2", outcomes: [{ obligationId: "a", outcome: "rejected-with-reason", reason: "checker failed" }, { obligationId: "b", outcome: "constructed", reason: null }] },
  ]);
  expect(merged.find((row) => row.obligationId === "a")!.outcome).toBe("rejected-with-reason");
  expect(merged.find((row) => row.obligationId === "b")!.outcome).toBe("constructed");
  expect(mergeInputOutcomes([{ inputId: "i1", outcomes: [{ obligationId: "a", outcome: "unresolved", reason: "no source instance" }] }])[0]!.outcome).toBe("unresolved");
  expect(() => mergeInputOutcomes([])).toThrow(/at least one input/);
});

test("a source that the profile cannot parse is recorded, not thrown away", () => {
  const built = buildClassConstruction("openapi: 3.1.0\ninfo: { title: t, version: \"1\" }\npaths: {}\n", "yaml");
  expect(built.checkerPassed).toBe(false);
  expect(built.checkerFailures.join(" ")).toMatch(/3\.0|specimens/i);
});
