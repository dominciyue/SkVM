import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  API_TESTER_OPERATION_VALIDATION_CONTRACT_PATH,
  ApiTesterOperationCombinedReportSchema,
  ApiTesterOperationValidationContractSchema,
  ApiTesterOperationValidationDevelopmentReportSchema,
  verifyApiTesterOperationValidationDevelopmentReport,
} from "./api-tester-operation-validation-development";

describe("API Tester operation validation development evidence", () => {
  test("pins Task 1 and preregisters the complete transform/fault set", async () => {
    const contract = ApiTesterOperationValidationContractSchema.parse(JSON.parse(
      await readFile(API_TESTER_OPERATION_VALIDATION_CONTRACT_PATH, "utf8"),
    ));
    expect(contract.task1).toEqual({
      commit: "f92e8a1f95a061af921fe476aa90016b2b627153",
      report: {
        path: "results/skill-ir/api-tester-operation-admission-development-001/report.json",
        sha256: "d2fbe27a27b5d7d94f8ab2aeb45c0fb23c610f0bd47d82cdd04ee4bd4c37b2c6",
        portableSemanticSha256: "1a14ed36ebc185befcb4f3d2c03f95d89bd1e8a1a89da560a9c6eb35b89a1e87",
      },
    });
    expect(contract.transforms).toHaveLength(6);
    expect(contract.faults).toHaveLength(9);
    expect(contract.cleanReproduction).toMatchObject({
      checkout: "detached-task1-commit",
      installCommand: "bun install --frozen-lockfile --offline",
      networkAllowed: false,
    });
    expect(contract.policy).toMatchObject({
      realDocuments: 6,
      derivedInputsAreIndependentSamples: false,
      syntheticFaultFixturesCountAsRealSuccess: false,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      readinessChanges: 0,
    });
  });

  test("strictly replays Task 2 relations, detectors, and clean evidence", async () => {
    const verified = await verifyApiTesterOperationValidationDevelopmentReport({
      rootDir: process.cwd(),
    });
    expect(verified).toMatchObject({
      status: "verified",
      branch: "real-positive",
      derivedInputs: 36,
      applicable: 34,
      passed: 34,
      notApplicable: 2,
      faults: 9,
      faultsDetected: 9,
      cleanReproduction: "pass",
      task1PortableSemanticSha256: "1a14ed36ebc185befcb4f3d2c03f95d89bd1e8a1a89da560a9c6eb35b89a1e87",
    });
  });

  test("rejects transform state and comparison-field drift from the preregistered registry", async () => {
    const report = ApiTesterOperationValidationDevelopmentReportSchema.parse(JSON.parse(
      await readFile("results/skill-ir/api-tester-operation-validation-development-001/report.json", "utf8"),
    ));
    const stateDrift = structuredClone(report);
    stateDrift.transforms.cases[0]!.applicability = "not-applicable";
    expect(ApiTesterOperationValidationDevelopmentReportSchema.safeParse(stateDrift).success).toBe(false);

    const fieldsDrift = structuredClone(report);
    fieldsDrift.transforms.cases[0]!.comparisonFields = ["unregistered-field"];
    expect(ApiTesterOperationValidationDevelopmentReportSchema.safeParse(fieldsDrift).success).toBe(false);

    const registrationDrift = structuredClone(report);
    registrationDrift.transforms.registrations[0]!.expectedRelation = "weakened relation";
    expect(ApiTesterOperationValidationDevelopmentReportSchema.safeParse(registrationDrift).success).toBe(false);
  });

  test("rejects fault detector layer or stable-code drift from the implementation registry", async () => {
    const report = ApiTesterOperationValidationDevelopmentReportSchema.parse(JSON.parse(
      await readFile("results/skill-ir/api-tester-operation-validation-development-001/report.json", "utf8"),
    ));
    const layerDrift = structuredClone(report);
    layerDrift.faultDetection.cases[0]!.detectorLayer = "independent-checker";
    expect(ApiTesterOperationValidationDevelopmentReportSchema.safeParse(layerDrift).success).toBe(false);

    const codeDrift = structuredClone(report);
    codeDrift.faultDetection.cases[0]!.code = "WRONG_STABLE_CODE";
    expect(ApiTesterOperationValidationDevelopmentReportSchema.safeParse(codeDrift).success).toBe(false);
  });

  test("combined report preserves the source blocker without failing the bounded Task 2 evidence", async () => {
    const combined = ApiTesterOperationCombinedReportSchema.parse(JSON.parse(
      await readFile("results/skill-ir/api-tester-operation-development-001/report.json", "utf8"),
    ));
    expect(combined).toMatchObject({
      status: "completed-with-source-blocker",
      task1: { status: "completed-with-source-blocker", operations: 562, accepted: 112, checked: 112, unresolved: 1 },
      task2: { status: "passed", branch: "real-positive" },
      remainingIssues: [{
        kind: "source-dependency",
        rowId: "real-meilisearch-api",
        operationKey: "GET /tasks",
        locator: "#/paths/~1tasks/get/parameters/0",
      }],
      protectedBoundary: { frozenWholeDocumentRealAccepted: 0, changesFrozenHistory: false },
    });
  });
});
