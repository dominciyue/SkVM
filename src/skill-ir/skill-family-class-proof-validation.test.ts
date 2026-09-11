import { describe, expect, test } from "bun:test";
import {
  CLASS_PROOF_FAULT_INJECTION_REGISTRY,
  CLASS_PROOF_METAMORPHIC_TRANSFORM_REGISTRY,
  buildClassProofBoundaryCases,
  evaluateClassProofMetamorphicCase,
  runClassProofFaultDetection,
  summarizeClassProofFaults,
} from "./skill-family-class-proof-validation";

const FIXTURE = `openapi: 3.1.0
info:
  title: validation fixture
  version: 1.0.0
components:
  schemas:
    Name:
      type: string
      minLength: 2
    Item:
      type: object
      required: [name]
      properties:
        name:
          $ref: '#/components/schemas/Name'
paths:
  /items:
    get:
      responses:
        '200': { description: ok }
        '400': { description: bad }
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Item'
      responses:
        '201': { description: created }
        '400': { description: bad }
`;

describe("class-proof validation contract", () => {
  test("pre-registers every required transform and six legal synthetic boundaries", () => {
    expect(CLASS_PROOF_METAMORPHIC_TRANSFORM_REGISTRY.map((row) => row.type)).toEqual([
      "object-order",
      "formatting",
      "json-yaml",
      "irrelevant-description",
      "add-unsupported-operation",
      "local-ref-inline",
    ]);
    expect(buildClassProofBoundaryCases(FIXTURE, "yaml")).toHaveLength(6);
    expect(buildClassProofBoundaryCases(FIXTURE, "yaml").every((row) => row.origin === "synthetic-boundary")).toBe(true);
  });

  test("binds a derived case to parent bytes and records the comparison contract", () => {
    const result = evaluateClassProofMetamorphicCase({
      inputId: "synthetic-fixture",
      memberId: "synthetic-fixture",
      sourcePath: "fixture.yaml",
      sourceText: FIXTURE,
      format: "yaml",
      type: "object-order",
      origin: "synthetic-boundary",
    });
    expect(result.parent.sha256).not.toBe(result.derived?.sha256);
    expect(result.status).toBe("pass");
    expect(result.comparisonFields).toContain("normalizedSemantics");
    expect(result.parent.path).toBe("fixture.yaml");
  });

  test("pre-registers and summarizes layered fault injections without hiding misses", () => {
    expect(CLASS_PROOF_FAULT_INJECTION_REGISTRY.map((row) => row.fault)).toEqual(expect.arrayContaining([
      "operation-list-omission",
      "operation-list-duplicate",
      "artifact-operation-omission",
      "parameter-inheritance-loss",
      "reference-definition-loss",
      "security-requirement-loss",
      "field-constraint-loss",
      "array-encoding-loss",
      "status-evidence-loss",
      "input-binding-mismatch",
      "contract-binding-mismatch",
      "artifact-binding-mismatch",
    ]));
    const summary = summarizeClassProofFaults([
      { fault: "operation-list-omission", detectorLayer: "source-coverage", expectedCode: "ANALYZER_OPERATION_OMITTED", detected: true, detail: "x" },
      { fault: "status-evidence-loss", detectorLayer: "independent-checker", expectedCode: "SECURITY_RESPONSE_FAILED", detected: false, detail: "x" },
      { fault: "input-binding-mismatch", detectorLayer: "package-binding", expectedCode: "INPUT_BINDING_MISMATCH", detected: true, detail: "x" },
    ]);
    expect(summary).toEqual({ injected: 3, detected: 2, missed: 1, notApplicable: 0, unresolved: 0 });
  });

  test("runs every pre-registered synthetic fault in its declared detector layer", async () => {
    const rows = await runClassProofFaultDetection({
      nodeExecutable: process.execPath,
      fixtureRoot: `${import.meta.dir}/fixtures/api-tester-production-v2/local-ref-arrays`,
    });
    expect(rows).toHaveLength(CLASS_PROOF_FAULT_INJECTION_REGISTRY.length);
    expect(summarizeClassProofFaults(rows)).toEqual({
      injected: CLASS_PROOF_FAULT_INJECTION_REGISTRY.length,
      detected: CLASS_PROOF_FAULT_INJECTION_REGISTRY.length,
      missed: 0,
      notApplicable: 0,
      unresolved: 0,
    });
    expect(rows.every((row) => row.detected && row.applicability === "applicable")).toBe(true);
  });
});
