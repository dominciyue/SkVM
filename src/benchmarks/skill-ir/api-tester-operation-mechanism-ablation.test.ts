import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH,
  API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH,
  apiTesterOperationMechanismAblationPortableSha256,
  buildApiTesterOperationMechanismAblationReport,
  parseApiTesterOperationMechanismAblationCommand,
  verifyApiTesterOperationMechanismAblationReport,
} from "./api-tester-operation-mechanism-ablation";

const repositoryRoot = process.cwd();
const inputPaths = [
  API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH,
  "results/skill-ir/api-tester-operation-admission-development-001/report.json",
  "results/skill-ir/api-tester-operation-validation-development-001/report.json",
  "results/skill-ir/public-structure-offline-family-contract-revision-development-002/report.json",
  "results/skill-ir/api-tester-operation-prospective-001/source-selection/failure-audit.json",
] as const;

describe("API Tester operation mechanism ablation", () => {
  test("derives all three preregistered panels and rejects a coordinated report resign", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-api-mechanism-ablation-"));
    try {
      for (const path of inputPaths) {
        await mkdir(dirname(join(rootDir, path)), { recursive: true });
        await writeFile(join(rootDir, path), await readFile(join(repositoryRoot, path)));
      }
      const report = await buildApiTesterOperationMechanismAblationReport({
        rootDir,
        protocolPath: API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH,
        outputPath: API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH,
        completedAt: "2026-09-10T12:10:00.000Z",
      });
      expect(report.panels.operationSegmentation).toMatchObject({
        universe: { documents: 6, operations: 562 },
        wholeDocument: { admittedDocuments: 0, operationsCovered: 0 },
        operationLevel: { acceptedOperations: 112, checkerPassedOperations: 112, rejectedOperations: 449, unresolvedOperations: 1 },
        delta: { additionalCheckerPassedOperations: 112 },
      });
      expect(report.panels.independentDependencyVerification).toMatchObject({
        universe: { injectedFaults: 9, dependencyTargetedFaults: 3 },
        fullVerifier: { correctLayerDetected: 9, missed: 0 },
        noDependencyVerifier: { correctLayerDetected: 6, missed: 3 },
      });
      expect(report.panels.completeResponsibilityDenominator).toMatchObject({
        operations: { complete: 562, visibleInAcceptedOnly: 112, hidden: 450, hiddenRejected: 449, hiddenUnresolved: 1, documentsWithHidden: 6 },
        family: { complete: 7, visibleInCurrentSupportedOnly: 2, hidden: 5, skills: 6, skillsWithHidden: 4 },
      });
      await expect(verifyApiTesterOperationMechanismAblationReport({
        rootDir,
        protocolPath: API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH,
        reportPath: API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH,
      })).resolves.toMatchObject({ status: "verified-development-mechanism-ablation", operations: 562, faults: 9, responsibilities: 7 });

      const reportPath = join(rootDir, API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH);
      const tampered = JSON.parse(await readFile(reportPath, "utf8"));
      tampered.panels.operationSegmentation.operationLevel.acceptedOperations += 1;
      tampered.portableSemanticSha256 = apiTesterOperationMechanismAblationPortableSha256(tampered);
      await writeFile(reportPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
      await expect(verifyApiTesterOperationMechanismAblationReport({
        rootDir,
        protocolPath: API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH,
        reportPath: API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH,
      })).rejects.toThrow(/operation|derived|drift|semantic/iu);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("keeps the CLI bound to the preregistered protocol and output", () => {
    expect(parseApiTesterOperationMechanismAblationCommand([
      "--mode=create", "--root=.", `--protocol=${API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH}`,
      `--out=${API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH}`, "--completed-at=2026-09-10T12:10:00.000Z",
    ])).toMatchObject({ mode: "create", completedAt: "2026-09-10T12:10:00.000Z" });
    expect(() => parseApiTesterOperationMechanismAblationCommand([
      "--mode=verify", "--root=.", `--protocol=${API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH}`,
      "--out=results/alternate.json",
    ])).toThrow(/--out must be/iu);
    expect(() => parseApiTesterOperationMechanismAblationCommand([
      "--mode=verify", "--root=.", `--protocol=${API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH}`,
      `--out=${API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH}`, "--prospective=true",
    ])).toThrow(/unknown argument/iu);
  });
});
