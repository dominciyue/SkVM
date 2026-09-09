import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema } from "../benchmarks/skill-ir/artifact-package";
import {
  API_TESTER_OPERATION_DEVELOPMENT_REPORT_PATH,
  ApiTesterOperationDevelopmentReportSchema,
  runApiTesterOperationDevelopment,
  verifyApiTesterOperationDevelopmentReport,
} from "./api-tester-operation-development";
import { verifyApiTesterProjectionDependencies } from "./api-tester-operation-coverage";
import { parseApiTesterOperationSource, projectApiTesterOperation } from "./api-tester-operation-source";

export const API_TESTER_OPERATION_DEPENDENCY_REVISION_IDENTITY =
  "skill-ir-api-tester-operation-dependency-verification-revision-development-001" as const;
export const API_TESTER_OPERATION_DEPENDENCY_REVISION_CONTRACT_PATH =
  "benchmarks/skill-ir/pilots/api-tester/operation-dependency-verification-revision-development-001/development-contract.json" as const;
export const API_TESTER_OPERATION_DEPENDENCY_REVISION_REPORT_PATH =
  "results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json" as const;

const CASES = [
  "unchanged-projection-control",
  "response-component-schema-drift",
  "nested-parameter-schema-drift",
  "same-name-api-key-scheme-drift",
] as const;
const ROW_IDS = [
  "real-opengrok-api",
  "real-box-openapi",
  "real-meilisearch-api",
  "real-bangumi-api",
  "real-deepl-openapi",
  "real-hfs-openapi",
] as const;
const LEGACY_CHECKS = [
  "operationPresent",
  "parametersPreserved",
  "referencesPreserved",
  "securityPreserved",
  "requestPreserved",
  "responsesPreserved",
] as const;
const EXPECTED_CASE_ERRORS = [
  [],
  ["REFERENCE_DEPENDENCY_LOST", "RESPONSE_DEPENDENCY_LOST"],
  ["PARAMETER_DEPENDENCY_LOST", "REFERENCE_DEPENDENCY_LOST"],
  ["SECURITY_DEPENDENCY_LOST"],
] as const;
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const DigestPathSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();

export const ApiTesterOperationDependencyRevisionContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-dependency-verification-revision-contract/v1"),
  identity: z.literal(API_TESTER_OPERATION_DEPENDENCY_REVISION_IDENTITY),
  createdAt: z.string().datetime(),
  reviewBaseline: z.object({
    commit: CommitSchema,
    task1Report: z.object({
      path: z.literal(API_TESTER_OPERATION_DEVELOPMENT_REPORT_PATH),
      sha256: Sha256Schema,
      portableSemanticSha256: Sha256Schema,
    }).strict(),
  }).strict(),
  sourceSelection: DigestPathSchema,
  implementation: z.object({ files: z.array(DigestPathSchema).min(3) }).strict(),
  cases: z.array(z.object({
    case: z.enum(CASES),
    kind: z.enum(["control", "fault"]),
    baselineStatus: z.literal("pass"),
    expectedRepairedStatus: z.enum(["pass", "fail"]),
    expectedErrors: z.array(z.string()),
    detectorLayer: z.literal("dependency-verifier"),
  }).strict()).length(4),
  output: z.object({
    path: z.literal("results/skill-ir/api-tester-operation-dependency-verification-revision-development-001"),
    replayDirectory: z.literal("replay"),
    reportFile: z.literal("report.json"),
    writeMode: z.literal("exclusive-create-once"),
  }).strict(),
  policy: z.object({
    realDocuments: z.literal(6),
    syntheticFaultsCountAsRealSuccess: z.literal(false),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    secondProfiles: z.literal(0),
    q4Runs: z.literal(0),
    readinessChanges: z.literal(0),
    networkAllowed: z.literal(false),
  }).strict(),
  accounting: z.object({
    runtimeModelCalls: z.literal(0),
    runtimeApiCalls: z.literal(0),
    runtimePaidCalls: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    developmentSeparateFromRuntime: z.literal(true),
  }).strict(),
}).strict().superRefine((contract, context) => {
  if (JSON.stringify(contract.cases.map((entry) => entry.case)) !== JSON.stringify(CASES)) {
    context.addIssue({ code: "custom", path: ["cases"], message: "revision cases must retain their preregistered order" });
  }
  const expectedStatuses = ["pass", "fail", "fail", "fail"];
  if (JSON.stringify(contract.cases.map((entry) => entry.expectedRepairedStatus)) !== JSON.stringify(expectedStatuses)
    || contract.cases[0]?.kind !== "control" || contract.cases.slice(1).some((entry) => entry.kind !== "fault")) {
    context.addIssue({ code: "custom", path: ["cases"], message: "revision control/fault expectations drifted" });
  }
  if (JSON.stringify(contract.cases.map((entry) => entry.expectedErrors)) !== JSON.stringify(EXPECTED_CASE_ERRORS)
    || contract.cases.some((entry) => entry.detectorLayer !== "dependency-verifier")) {
    context.addIssue({ code: "custom", path: ["cases"], message: "revision detector layer or expected errors drifted" });
  }
});

export type ApiTesterOperationDependencyRevisionContract = z.infer<
  typeof ApiTesterOperationDependencyRevisionContractSchema
>;

const CaseResultSchema = z.object({
  case: z.enum(CASES),
  kind: z.enum(["control", "fault"]),
  detectorLayer: z.literal("dependency-verifier"),
  baselineStatus: z.literal("pass"),
  baselineDisposition: z.enum(["expected-control-pass", "false-pass"]),
  repairedStatus: z.enum(["pass", "fail"]),
  repairedErrors: z.array(z.string()),
  dimensions: z.object({
    projectionPreservation: z.enum(["pass", "fail"]),
    constructionObligations: z.enum(["pass", "fail"]),
    sourceValidity: z.enum(["pass", "fail"]),
  }).strict(),
  detected: z.boolean(),
}).strict();

const ResultTotalsSchema = z.object({
  operations: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  checkerPassed: z.number().int().nonnegative(),
  obligations: z.object({
    total: z.number().int().nonnegative(),
    covered: z.number().int().nonnegative(),
    uncovered: z.number().int().nonnegative(),
    status: z.enum(["pass", "fail", "not-applicable"]),
  }).strict(),
}).strict();

const ComparisonCheckSchema = z.object({
  operationUniverse: z.boolean(),
  admission: z.boolean(),
  dependencies: z.boolean(),
  checkerPass: z.boolean(),
}).strict();

const ResultComparisonSchema = z.object({
  status: z.enum(["pass", "fail"]),
  totals: z.object({ baseline: ResultTotalsSchema, fresh: ResultTotalsSchema }).strict(),
  aggregateChecks: z.object({
    operationUniverse: z.boolean(),
    admission: z.boolean(),
    dependencies: z.boolean(),
    checkerPass: z.boolean(),
    obligationCoverage: z.boolean(),
  }).strict(),
  documents: z.array(z.object({
    rowId: z.enum(ROW_IDS),
    checks: ComparisonCheckSchema,
    baseline: z.object({ operations: z.number().int(), accepted: z.number().int(), dependencyPassed: z.number().int(), checkerPassed: z.number().int() }).strict(),
    fresh: z.object({
      operations: z.number().int(),
      accepted: z.number().int(),
      dependencyPassed: z.number().int(),
      checkerPassed: z.number().int(),
      dependencyDimensions: z.object({
        evaluated: z.number().int().nonnegative(),
        projectionPreservationPassed: z.number().int().nonnegative(),
        constructionObligationsPassed: z.number().int().nonnegative(),
        sourceValidityPassed: z.number().int().nonnegative(),
      }).strict(),
    }).strict(),
  }).strict()).length(6),
}).strict();

const SourceBlockerSchema = z.object({
  rowId: z.enum(ROW_IDS),
  operationKey: z.string().min(1),
  reference: z.string().min(1),
  locator: z.string().min(1),
  resolution: z.string().min(1),
  constructionObligation: z.literal(true),
  disposition: z.literal("source-blocker-not-guessed"),
}).strict();

const CleanReproductionSchema = z.object({
  status: z.literal("pass"),
  commit: CommitSchema,
  detached: z.literal(true),
  report: DigestPathSchema,
  runSemanticSha256: Sha256Schema,
  comparison: z.object({
    sameRevisionCommit: z.literal(true),
    runSemanticDigestEqual: z.literal(true),
    caseOutcomesEqual: z.literal(true),
    sixDocumentComparisonEqual: z.literal(true),
    freshTask1PortableDigestEqual: z.literal(true),
  }).strict(),
}).strict();

export const ApiTesterOperationDependencyRevisionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-dependency-verification-revision-report/v1"),
  identity: z.literal(API_TESTER_OPERATION_DEPENDENCY_REVISION_IDENTITY),
  status: z.enum(["run-complete-with-source-blocker", "passed-with-source-blocker", "failed"]),
  completedAt: z.string().datetime(),
  revision: z.object({
    commit: CommitSchema,
    detached: z.boolean(),
    implementation: z.array(DigestPathSchema).min(3),
  }).strict(),
  inputs: z.object({
    contract: DigestPathSchema,
    baselineTask1: z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema, portableSemanticSha256: Sha256Schema }).strict(),
    sourceSelection: DigestPathSchema,
  }).strict(),
  cases: z.object({
    results: z.array(CaseResultSchema).length(4),
    totals: z.object({ controls: z.literal(1), baselineMisses: z.literal(3), faultsInjected: z.literal(3), repairedDetected: z.number().int().min(0).max(3) }).strict(),
  }).strict(),
  replay: z.object({ report: DigestPathSchema, portableSemanticSha256: Sha256Schema }).strict(),
  comparison: ResultComparisonSchema,
  sourceBlockers: z.array(SourceBlockerSchema).min(1),
  cleanReproduction: CleanReproductionSchema.nullable(),
  gates: z.object({
    faultDetection: z.enum(["pass", "fail"]),
    sixDocumentImpact: z.enum(["pass", "fail"]),
    cleanReproduction: z.enum(["pass", "fail", "not-run"]),
    implementationCorrectness: z.enum(["pass", "fail", "pending-clean-reproduction"]),
    sourceCorrectness: z.literal("blocked"),
  }).strict(),
  accounting: z.object({
    runtime: z.object({
      modelCalls: z.literal(0),
      apiCalls: z.literal(0),
      paidCalls: z.literal(0),
      wallClockMillis: z.number().int().nonnegative(),
    }).strict(),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    separate: z.literal(true),
  }).strict(),
  protectedBoundary: z.object({
    realDocuments: z.literal(6),
    frozenWholeDocumentRealAccepted: z.literal(0),
    changesFrozenOrPriorEvidence: z.literal(false),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    secondProfiles: z.literal(0),
    q4Runs: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
    claimsEcosystemAdmission: z.literal(false),
  }).strict(),
  runSemanticSha256: Sha256Schema,
  portableSemanticSha256: Sha256Schema,
}).strict().superRefine((report, context) => {
  if (JSON.stringify(report.cases.results.map((entry) => entry.case)) !== JSON.stringify(CASES)
    || report.cases.results[0]?.baselineDisposition !== "expected-control-pass"
    || report.cases.results.slice(1).some((entry) => entry.baselineDisposition !== "false-pass")) {
    context.addIssue({ code: "custom", path: ["cases", "results"], message: "baseline control/miss registry drifted" });
  }
  const expectedStatuses = ["pass", "fail", "fail", "fail"];
  if (JSON.stringify(report.cases.results.map((entry) => entry.repairedStatus)) !== JSON.stringify(expectedStatuses)
    || report.cases.results.some((entry, index) => !EXPECTED_CASE_ERRORS[index]!.every((error) => entry.repairedErrors.includes(error)))) {
    context.addIssue({ code: "custom", path: ["cases", "results"], message: "repaired case outcomes drifted" });
  }
  const detected = report.cases.results.filter((entry) => entry.kind === "fault" && entry.detected).length;
  const faultsPass = detected === 3 && report.cases.results[0]?.detected === true;
  if (detected !== report.cases.totals.repairedDetected
    || (report.gates.faultDetection === "pass") !== faultsPass) {
    context.addIssue({ code: "custom", path: ["cases"], message: "fault totals or gate drifted" });
  }
  if ((report.gates.sixDocumentImpact === "pass") !== (report.comparison.status === "pass")) {
    context.addIssue({ code: "custom", path: ["gates", "sixDocumentImpact"], message: "impact gate drifted" });
  }
  const cleanState = report.cleanReproduction ? "pass" : "not-run";
  if (report.gates.cleanReproduction !== cleanState) {
    context.addIssue({ code: "custom", path: ["gates", "cleanReproduction"], message: "clean-reproduction gate drifted" });
  }
});

export type ApiTesterOperationDependencyRevisionReport = z.infer<
  typeof ApiTesterOperationDependencyRevisionReportSchema
>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, canonicalValue(value[key])]));
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function pathWithin(parent: string, child: string): boolean {
  const local = relative(resolve(parent), resolve(child));
  return local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
}

function contained(root: string, path: string, label: string): string {
  const target = resolve(root, path);
  if (!pathWithin(root, target)) throw new Error(`${label} escapes its root`);
  return target;
}

function portablePath(value: string): string {
  return value.replaceAll("\\", "/");
}

async function readRegularFile(path: string, label: string): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return readFile(path);
}

async function readDigestBound(root: string, reference: { path: string; sha256: string }, label: string): Promise<Buffer> {
  const bytes = await readRegularFile(contained(root, reference.path, label), label);
  if (sha256(bytes) !== reference.sha256) throw new Error(`${label} digest drift`);
  return bytes;
}

const FAULT_SOURCE = {
  openapi: "3.1.0",
  info: { title: "dependency revision", version: "1" },
  security: [{ ApiKey: [] }],
  components: {
    parameters: {
      Limit: { name: "limit", in: "query", schema: { $ref: "#/components/schemas/LimitValue" } },
    },
    responses: {
      ItemResponse: {
        description: "ok",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ItemPayload" } } },
      },
    },
    schemas: {
      ItemPayload: { type: "string" },
      LimitValue: { type: "integer", minimum: 1 },
    },
    securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
  },
  paths: {
    "/items": {
      get: {
        parameters: [{ $ref: "#/components/parameters/Limit" }],
        responses: {
          "200": { $ref: "#/components/responses/ItemResponse" },
          "400": { description: "bad" },
          "401": { description: "unauthorized" },
        },
      },
    },
  },
};

export function evaluateApiTesterOperationDependencyRevisionCases(): z.infer<typeof CaseResultSchema>[] {
  const parsed = parseApiTesterOperationSource(JSON.stringify(FAULT_SOURCE), "json");
  if (!parsed.document) throw new Error("dependency revision fixture did not parse");
  const base = projectApiTesterOperation(parsed.document, "GET /items").document;
  const projected = CASES.map(() => structuredClone(base));
  (((projected[1]!.components as JsonRecord).schemas as JsonRecord).ItemPayload as JsonRecord).type = "integer";
  (((projected[2]!.components as JsonRecord).schemas as JsonRecord).LimitValue as JsonRecord).minimum = 99;
  (((projected[3]!.components as JsonRecord).securitySchemes as JsonRecord).ApiKey as JsonRecord).name = "X-Other";
  return CASES.map((caseName, index) => {
    const repaired = verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: "GET /items",
      projectedDocument: projected[index],
    });
    const kind = index === 0 ? "control" as const : "fault" as const;
    const expectedStatus = index === 0 ? "pass" : "fail";
    const errors = EXPECTED_CASE_ERRORS[index]!;
    return CaseResultSchema.parse({
      case: caseName,
      kind,
      detectorLayer: "dependency-verifier",
      baselineStatus: "pass",
      baselineDisposition: index === 0 ? "expected-control-pass" : "false-pass",
      repairedStatus: repaired.status,
      repairedErrors: repaired.errors,
      dimensions: repaired.dimensions,
      detected: repaired.status === expectedStatus && errors.every((error) => repaired.errors.includes(error as never)),
    });
  });
}

type Inventory = {
  operations: Array<{ source: unknown; admission: unknown }>;
  dependencyVerification: Array<{ operationKey: string; status: string; checks: Record<string, boolean>; errors: string[] }>;
};

async function readReportAndInventories(rootDir: string, reportPath: string) {
  const absoluteReport = contained(rootDir, reportPath, "operation report");
  const report = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(await readFile(absoluteReport, "utf8")));
  const reportRoot = dirname(absoluteReport);
  const inventories = await Promise.all(report.documents.map(async (document) => ({
    rowId: document.rowId,
    document,
    inventory: JSON.parse(await readFile(contained(reportRoot, document.inventory.path, `inventory ${document.rowId}`), "utf8")) as Inventory,
  })));
  return { report, inventories };
}

function legacyDependencyOutcome(inventory: Inventory): unknown {
  return inventory.dependencyVerification.map((entry) => ({
    operationKey: entry.operationKey,
    status: entry.status,
    checks: Object.fromEntries(LEGACY_CHECKS.map((key) => [key, entry.checks[key]])),
    errors: entry.errors,
  }));
}

function dependencyDimensions(inventory: Inventory) {
  return {
    evaluated: inventory.dependencyVerification.length,
    projectionPreservationPassed: inventory.dependencyVerification.filter((entry) => entry.checks.projectionPreservation === true).length,
    constructionObligationsPassed: inventory.dependencyVerification.filter((entry) => entry.checks.constructionObligations === true).length,
    sourceValidityPassed: inventory.dependencyVerification.filter((entry) => entry.checks.sourceValidity === true).length,
  };
}

function resultTotals(report: z.infer<typeof ApiTesterOperationDevelopmentReportSchema>) {
  return {
    operations: report.totals.operations,
    accepted: report.totals.accepted,
    rejected: report.totals.rejected,
    unresolved: report.totals.unresolved,
    checkerPassed: report.totals.artifactCheckedPassedOperations,
    obligations: report.obligationCoverage,
  };
}

export async function compareApiTesterOperationDependencyRevisionResults(input: {
  rootDir: string;
  baselineReportPath: string;
  freshReportPath: string;
}): Promise<z.infer<typeof ResultComparisonSchema>> {
  const rootDir = resolve(input.rootDir);
  await Promise.all([
    verifyApiTesterOperationDevelopmentReport({ rootDir, reportPath: input.baselineReportPath }),
    verifyApiTesterOperationDevelopmentReport({ rootDir, reportPath: input.freshReportPath }),
  ]);
  const [baseline, fresh] = await Promise.all([
    readReportAndInventories(rootDir, input.baselineReportPath),
    readReportAndInventories(rootDir, input.freshReportPath),
  ]);
  const documents = ROW_IDS.map((rowId) => {
    const before = baseline.inventories.find((entry) => entry.rowId === rowId)!;
    const after = fresh.inventories.find((entry) => entry.rowId === rowId)!;
    const checks = {
      operationUniverse: canonical(before.inventory.operations.map((entry) => entry.source))
        === canonical(after.inventory.operations.map((entry) => entry.source)),
      admission: canonical(before.inventory.operations.map((entry) => entry.admission))
        === canonical(after.inventory.operations.map((entry) => entry.admission)),
      dependencies: canonical(legacyDependencyOutcome(before.inventory))
        === canonical(legacyDependencyOutcome(after.inventory)),
      checkerPass: before.document.artifact.checkedOperationCount === after.document.artifact.checkedOperationCount,
    };
    return {
      rowId,
      checks,
      baseline: {
        operations: before.document.enumeration.operationCount,
        accepted: before.document.admission.accepted,
        dependencyPassed: before.inventory.dependencyVerification.filter((entry) => entry.status === "pass").length,
        checkerPassed: before.document.artifact.checkedOperationCount,
      },
      fresh: {
        operations: after.document.enumeration.operationCount,
        accepted: after.document.admission.accepted,
        dependencyPassed: after.inventory.dependencyVerification.filter((entry) => entry.status === "pass").length,
        checkerPassed: after.document.artifact.checkedOperationCount,
        dependencyDimensions: dependencyDimensions(after.inventory),
      },
    };
  });
  const baselineTotals = resultTotals(baseline.report);
  const freshTotals = resultTotals(fresh.report);
  const aggregateChecks = {
    operationUniverse: documents.every((entry) => entry.checks.operationUniverse),
    admission: documents.every((entry) => entry.checks.admission),
    dependencies: documents.every((entry) => entry.checks.dependencies),
    checkerPass: documents.every((entry) => entry.checks.checkerPass)
      && baselineTotals.checkerPassed === freshTotals.checkerPassed,
    obligationCoverage: canonical(baselineTotals.obligations) === canonical(freshTotals.obligations),
  };
  return ResultComparisonSchema.parse({
    status: Object.values(aggregateChecks).every(Boolean) ? "pass" : "fail",
    totals: { baseline: baselineTotals, fresh: freshTotals },
    aggregateChecks,
    documents,
  });
}

async function currentRevision(rootDir: string, gitExecutable: string) {
  const run = async (args: string[]) => {
    const child = Bun.spawn([gitExecutable, "-c", `safe.directory=${portablePath(rootDir)}`, ...args], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
  };
  const [head, branch, tracked, staged] = await Promise.all([
    run(["rev-parse", "HEAD"]),
    run(["symbolic-ref", "--quiet", "--short", "HEAD"]),
    run(["diff", "--quiet"]),
    run(["diff", "--cached", "--quiet"]),
  ]);
  if (head.exitCode !== 0 || tracked.exitCode !== 0 || staged.exitCode !== 0) {
    throw new Error(`revision checkout is not a clean tracked commit: ${head.stderr || tracked.stderr || staged.stderr}`);
  }
  return { commit: CommitSchema.parse(head.stdout), detached: branch.exitCode !== 0 };
}

export function assertDependencyRevisionCheckoutBinding(
  reportRevision: { commit: string; detached: boolean },
  checkoutRevision: { commit: string; detached: boolean },
): void {
  if (reportRevision.commit !== checkoutRevision.commit || reportRevision.detached !== checkoutRevision.detached) {
    throw new Error("dependency revision checkout binding drift");
  }
}

function extractSourceBlockers(inventories: Awaited<ReturnType<typeof readReportAndInventories>>["inventories"]) {
  return inventories.flatMap(({ rowId, inventory }) => inventory.operations.flatMap((entry) => {
    if (!isRecord(entry.source) || !isRecord(entry.admission) || entry.admission.status !== "unresolved"
      || typeof entry.source.key !== "string" || !Array.isArray(entry.source.references)) return [];
    const operationKey = entry.source.key;
    const references = entry.source.references;
    return references.flatMap((reference: unknown) => {
      if (!isRecord(reference) || reference.constructionObligation !== true || reference.resolution === "resolved"
        || typeof reference.ref !== "string" || typeof reference.locator !== "string"
        || typeof reference.resolution !== "string") return [];
      return [{
        rowId,
        operationKey,
        reference: reference.ref,
        locator: reference.locator,
        resolution: reference.resolution,
        constructionObligation: true as const,
        disposition: "source-blocker-not-guessed" as const,
      }];
    });
  })).sort((left, right) => compareText(`${left.rowId}:${left.operationKey}:${left.reference}`, `${right.rowId}:${right.operationKey}:${right.reference}`));
}

function runSemanticDigest(input: {
  cases: z.infer<typeof CaseResultSchema>[];
  comparison: z.infer<typeof ResultComparisonSchema>;
  sourceBlockers: z.infer<typeof SourceBlockerSchema>[];
  freshTask1PortableSemanticSha256: string;
}): string {
  return sha256(jsonText(input));
}

function portableReportDigest(report: Omit<ApiTesterOperationDependencyRevisionReport, "portableSemanticSha256">): string {
  return sha256(jsonText({
    ...report,
    completedAt: "<excluded>",
    accounting: { ...report.accounting, runtime: { ...report.accounting.runtime, wallClockMillis: 0 } },
  }));
}

async function readRevisionReport(rootDir: string, reportPath: string) {
  const bytes = await readRegularFile(contained(rootDir, reportPath, "dependency revision report"), "dependency revision report");
  const report = ApiTesterOperationDependencyRevisionReportSchema.parse(JSON.parse(bytes.toString("utf8")));
  const { portableSemanticSha256, ...withoutDigest } = report;
  if (portableReportDigest(withoutDigest) !== portableSemanticSha256) throw new Error("dependency revision portable digest drift");
  return { bytes, report };
}

export async function runApiTesterOperationDependencyVerificationRevision(options: {
  rootDir: string;
  cacheRoot: string;
  nodeExecutable: string;
  gitExecutable: string;
  outputRoot?: string;
  completedAt?: string;
  cleanRoot?: string;
  cleanReportPath?: string;
}): Promise<ApiTesterOperationDependencyRevisionReport> {
  const started = performance.now();
  const rootDir = resolve(options.rootDir);
  const contractBytes = await readRegularFile(
    contained(rootDir, API_TESTER_OPERATION_DEPENDENCY_REVISION_CONTRACT_PATH, "dependency revision contract"),
    "dependency revision contract",
  );
  const contract = ApiTesterOperationDependencyRevisionContractSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  const revision = await currentRevision(rootDir, options.gitExecutable);
  const ancestor = Bun.spawnSync([
    options.gitExecutable,
    "-c",
    `safe.directory=${portablePath(rootDir)}`,
    "merge-base",
    "--is-ancestor",
    contract.reviewBaseline.commit,
    revision.commit,
  ], { cwd: rootDir, stdout: "pipe", stderr: "pipe" });
  if (ancestor.exitCode !== 0) throw new Error("revision commit is not descended from the review baseline");
  await Promise.all(contract.implementation.files.map((file) => readDigestBound(rootDir, file, `implementation ${file.path}`)));
  const baselineBytes = await readDigestBound(rootDir, contract.reviewBaseline.task1Report, "baseline Task 1 report");
  const baseline = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(baselineBytes.toString("utf8")));
  if (baseline.portableSemanticSha256 !== contract.reviewBaseline.task1Report.portableSemanticSha256) {
    throw new Error("baseline Task 1 portable digest drift");
  }
  await readDigestBound(rootDir, contract.sourceSelection, "six-source selection");
  await verifyApiTesterOperationDevelopmentReport({
    rootDir,
    reportPath: contract.reviewBaseline.task1Report.path,
    cacheRoot: options.cacheRoot,
  });

  const outputRoot = resolve(options.outputRoot ?? contained(rootDir, contract.output.path, "dependency revision output"));
  if (!pathWithin(rootDir, outputRoot)) throw new Error("dependency revision output must remain inside the repository checkout");
  await mkdir(outputRoot, { recursive: false });
  const replayRoot = join(outputRoot, contract.output.replayDirectory);
  const fresh = await runApiTesterOperationDevelopment({
    rootDir,
    cacheRoot: options.cacheRoot,
    nodeExecutable: options.nodeExecutable,
    outputRoot: replayRoot,
    ...(options.completedAt ? { completedAt: options.completedAt } : {}),
  });
  const replayReportPath = portablePath(relative(rootDir, join(replayRoot, "report.json")));
  await verifyApiTesterOperationDevelopmentReport({ rootDir, reportPath: replayReportPath, cacheRoot: options.cacheRoot });
  const comparison = await compareApiTesterOperationDependencyRevisionResults({
    rootDir,
    baselineReportPath: contract.reviewBaseline.task1Report.path,
    freshReportPath: replayReportPath,
  });
  const cases = evaluateApiTesterOperationDependencyRevisionCases();
  const repairedDetected = cases.filter((entry) => entry.kind === "fault" && entry.detected).length;
  const freshEvidence = await readReportAndInventories(rootDir, replayReportPath);
  const sourceBlockers = z.array(SourceBlockerSchema).min(1).parse(extractSourceBlockers(freshEvidence.inventories));
  const semanticDigest = runSemanticDigest({
    cases,
    comparison,
    sourceBlockers,
    freshTask1PortableSemanticSha256: fresh.portableSemanticSha256,
  });

  let cleanReproduction: z.infer<typeof CleanReproductionSchema> | null = null;
  if ((options.cleanRoot === undefined) !== (options.cleanReportPath === undefined)) {
    throw new Error("cleanRoot and cleanReportPath must be provided together");
  }
  if (options.cleanRoot && options.cleanReportPath) {
    const cleanRoot = resolve(options.cleanRoot);
    const clean = await readRevisionReport(cleanRoot, options.cleanReportPath);
    if (!clean.report.revision.detached || clean.report.cleanReproduction !== null) {
      throw new Error("clean evidence must be a detached reproduction-only report");
    }
    await verifyApiTesterOperationDependencyRevisionReport({
      rootDir: cleanRoot,
      reportPath: options.cleanReportPath,
      cacheRoot: options.cacheRoot,
      gitExecutable: options.gitExecutable,
      allowMissingCleanReproduction: true,
    });
    const comparisonFields = {
      sameRevisionCommit: clean.report.revision.commit === revision.commit,
      runSemanticDigestEqual: clean.report.runSemanticSha256 === semanticDigest,
      caseOutcomesEqual: canonical(clean.report.cases) === canonical({ results: cases, totals: { controls: 1, baselineMisses: 3, faultsInjected: 3, repairedDetected } }),
      sixDocumentComparisonEqual: canonical(clean.report.comparison) === canonical(comparison),
      freshTask1PortableDigestEqual: clean.report.replay.portableSemanticSha256 === fresh.portableSemanticSha256,
    };
    if (!Object.values(comparisonFields).every(Boolean)) throw new Error("clean reproduction semantic comparison failed");
    cleanReproduction = CleanReproductionSchema.parse({
      status: "pass",
      commit: clean.report.revision.commit,
      detached: true,
      report: { path: options.cleanReportPath, sha256: sha256(clean.bytes) },
      runSemanticSha256: clean.report.runSemanticSha256,
      comparison: comparisonFields,
    });
  }

  const faultPass = repairedDetected === 3 && cases[0]?.detected === true;
  const cleanGate = cleanReproduction ? "pass" as const : "not-run" as const;
  const implementationCorrectness = !faultPass || comparison.status !== "pass"
    ? "fail" as const
    : cleanReproduction ? "pass" as const : "pending-clean-reproduction" as const;
  const status = implementationCorrectness === "fail"
    ? "failed" as const
    : cleanReproduction ? "passed-with-source-blocker" as const : "run-complete-with-source-blocker" as const;
  const reportWithoutDigest: Omit<ApiTesterOperationDependencyRevisionReport, "portableSemanticSha256"> = {
    schemaVersion: "skill-ir-api-tester-operation-dependency-verification-revision-report/v1",
    identity: API_TESTER_OPERATION_DEPENDENCY_REVISION_IDENTITY,
    status,
    completedAt: options.completedAt ?? new Date().toISOString(),
    revision: { commit: revision.commit, detached: revision.detached, implementation: contract.implementation.files },
    inputs: {
      contract: { path: API_TESTER_OPERATION_DEPENDENCY_REVISION_CONTRACT_PATH, sha256: sha256(contractBytes) },
      baselineTask1: contract.reviewBaseline.task1Report,
      sourceSelection: contract.sourceSelection,
    },
    cases: { results: cases, totals: { controls: 1, baselineMisses: 3, faultsInjected: 3, repairedDetected } },
    replay: { report: { path: replayReportPath, sha256: sha256(await readFile(join(replayRoot, "report.json"))) }, portableSemanticSha256: fresh.portableSemanticSha256 },
    comparison,
    sourceBlockers,
    cleanReproduction,
    gates: {
      faultDetection: faultPass ? "pass" : "fail",
      sixDocumentImpact: comparison.status,
      cleanReproduction: cleanGate,
      implementationCorrectness,
      sourceCorrectness: "blocked",
    },
    accounting: {
      runtime: { modelCalls: 0, apiCalls: 0, paidCalls: 0, wallClockMillis: Math.max(0, Math.round(performance.now() - started)) },
      developmentAgentUsage: "host-external-not-measured-by-runner",
      separate: true,
    },
    protectedBoundary: {
      realDocuments: 6,
      frozenWholeDocumentRealAccepted: 0,
      changesFrozenOrPriorEvidence: false,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      q1ReservedAccesses: 0,
      secondProfiles: 0,
      q4Runs: 0,
      readinessChanges: 0,
      claimsHumanSavings: false,
      claimsEcosystemAdmission: false,
    },
    runSemanticSha256: semanticDigest,
  };
  const report = ApiTesterOperationDependencyRevisionReportSchema.parse({
    ...reportWithoutDigest,
    portableSemanticSha256: portableReportDigest(reportWithoutDigest),
  });
  await writeFile(join(outputRoot, contract.output.reportFile), jsonText(report), { encoding: "utf8", flag: "wx" });
  return report;
}

export async function verifyApiTesterOperationDependencyRevisionReport(options: {
  rootDir: string;
  gitExecutable: string;
  reportPath?: string;
  cacheRoot?: string;
  cleanRoot?: string;
  allowMissingCleanReproduction?: boolean;
}): Promise<{ status: "verified"; commit: string; faultsDetected: number; comparison: "pass"; cleanReproduction: "pass" | "not-run" }> {
  const rootDir = resolve(options.rootDir);
  const reportPath = options.reportPath ?? API_TESTER_OPERATION_DEPENDENCY_REVISION_REPORT_PATH;
  const { report } = await readRevisionReport(rootDir, reportPath);
  const checkoutRevision = await currentRevision(rootDir, options.gitExecutable);
  assertDependencyRevisionCheckoutBinding(report.revision, checkoutRevision);
  const contractBytes = await readDigestBound(rootDir, report.inputs.contract, "dependency revision contract");
  const contract = ApiTesterOperationDependencyRevisionContractSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  if (report.inputs.contract.path !== API_TESTER_OPERATION_DEPENDENCY_REVISION_CONTRACT_PATH
    || canonical(report.inputs.baselineTask1) !== canonical(contract.reviewBaseline.task1Report)
    || canonical(report.inputs.sourceSelection) !== canonical(contract.sourceSelection)
    || canonical(report.revision.implementation) !== canonical(contract.implementation.files)) {
    throw new Error("dependency revision contract binding drift");
  }
  await Promise.all(contract.implementation.files.map((file) => readDigestBound(rootDir, file, `implementation ${file.path}`)));
  await verifyApiTesterOperationDevelopmentReport({
    rootDir,
    reportPath: report.inputs.baselineTask1.path,
    ...(options.cacheRoot ? { cacheRoot: options.cacheRoot } : {}),
  });
  await verifyApiTesterOperationDevelopmentReport({
    rootDir,
    reportPath: report.replay.report.path,
    ...(options.cacheRoot ? { cacheRoot: options.cacheRoot } : {}),
  });
  const replayBytes = await readDigestBound(rootDir, report.replay.report, "fresh replay report");
  const replay = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(replayBytes.toString("utf8")));
  if (replay.portableSemanticSha256 !== report.replay.portableSemanticSha256) throw new Error("fresh replay portable digest drift");
  const comparison = await compareApiTesterOperationDependencyRevisionResults({
    rootDir,
    baselineReportPath: report.inputs.baselineTask1.path,
    freshReportPath: report.replay.report.path,
  });
  const cases = evaluateApiTesterOperationDependencyRevisionCases();
  const freshEvidence = await readReportAndInventories(rootDir, report.replay.report.path);
  const sourceBlockers = z.array(SourceBlockerSchema).min(1).parse(extractSourceBlockers(freshEvidence.inventories));
  const semanticDigest = runSemanticDigest({ cases, comparison, sourceBlockers, freshTask1PortableSemanticSha256: replay.portableSemanticSha256 });
  if (canonical(cases) !== canonical(report.cases.results)
    || canonical(comparison) !== canonical(report.comparison)
    || canonical(sourceBlockers) !== canonical(report.sourceBlockers)
    || semanticDigest !== report.runSemanticSha256) {
    throw new Error("dependency revision live replay drift");
  }
  if (!report.cleanReproduction && !options.allowMissingCleanReproduction) throw new Error("dependency revision lacks clean reproduction evidence");
  if (report.cleanReproduction) {
    if (!options.cleanRoot) throw new Error("cleanRoot is required to verify clean reproduction evidence");
    const cleanRoot = resolve(options.cleanRoot);
    const clean = await readRevisionReport(cleanRoot, report.cleanReproduction.report.path);
    if (sha256(clean.bytes) !== report.cleanReproduction.report.sha256
      || clean.report.revision.commit !== report.cleanReproduction.commit
      || !clean.report.revision.detached
      || clean.report.cleanReproduction !== null
      || clean.report.runSemanticSha256 !== report.runSemanticSha256
      || canonical(clean.report.cases) !== canonical(report.cases)
      || canonical(clean.report.comparison) !== canonical(report.comparison)
      || clean.report.replay.portableSemanticSha256 !== report.replay.portableSemanticSha256) {
      throw new Error("clean reproduction evidence drift");
    }
    await verifyApiTesterOperationDependencyRevisionReport({
      rootDir: cleanRoot,
      gitExecutable: options.gitExecutable,
      reportPath: report.cleanReproduction.report.path,
      ...(options.cacheRoot ? { cacheRoot: options.cacheRoot } : {}),
      allowMissingCleanReproduction: true,
    });
  }
  return {
    status: "verified",
    commit: report.revision.commit,
    faultsDetected: report.cases.totals.repairedDetected,
    comparison: z.literal("pass").parse(report.comparison.status),
    cleanReproduction: report.cleanReproduction ? "pass" : "not-run",
  };
}
