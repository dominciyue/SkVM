import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema } from "../benchmarks/skill-ir/artifact-package";
import {
  API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY,
  API_TESTER_V2_FEATURE_MIGRATION_IDENTITY,
  ApiTesterV2FeatureMigrationFirstRunReportSchema,
  ApiTesterV2FeatureMigrationLockSchema,
  ApiTesterV2FeatureMigrationSelectionSchema,
} from "../benchmarks/skill-ir/api-tester-v2-feature-migration";
import {
  API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
  ApiTesterProductionBindingSchemaV2,
} from "./api-tester-production-contract-v2";
import {
  runApiTesterProductionArtifactV2,
  validateApiTesterProductionArtifactV2,
} from "./api-tester-production-artifact-v2";
import { ApiTesterProductionValidationReportSchemaV2 } from "./api-tester-production-programs-v2";
import {
  analyzeApiTesterOperation,
  verifyApiTesterOperationAdmissionConsistency,
} from "./api-tester-operation-admission";
import {
  verifyApiTesterOperationCoverage,
  verifyApiTesterProjectionDependencies,
} from "./api-tester-operation-coverage";
import {
  aggregateApiTesterOperations,
  parseApiTesterOperationSource,
} from "./api-tester-operation-source";

export const API_TESTER_OPERATION_DEVELOPMENT_IDENTITY =
  "skill-ir-api-tester-operation-admission-development-001" as const;
export const API_TESTER_OPERATION_DEVELOPMENT_CONTRACT_PATH =
  "benchmarks/skill-ir/pilots/api-tester/operation-admission-development-001/development-contract.json" as const;
export const API_TESTER_OPERATION_DEVELOPMENT_REPORT_PATH =
  "results/skill-ir/api-tester-operation-admission-development-001/report.json" as const;
export const API_TESTER_OPERATION_DEVELOPMENT_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-development-report/v1" as const;

const EXPECTED_ROW_IDS = [
  "real-opengrok-api",
  "real-box-openapi",
  "real-meilisearch-api",
  "real-bangumi-api",
  "real-deepl-openapi",
  "real-hfs-openapi",
] as const;
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const DigestPathSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();

export const ApiTesterOperationDevelopmentContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-development-contract/v1"),
  identity: z.literal(API_TESTER_OPERATION_DEVELOPMENT_IDENTITY),
  createdAt: z.string().datetime(),
  predecessor: z.object({
    selection: z.object({
      identity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY),
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
    }).strict(),
    lock: z.object({
      identity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_IDENTITY),
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
    }).strict(),
    firstRun: z.object({
      identity: z.literal(API_TESTER_V2_FEATURE_MIGRATION_IDENTITY),
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
      wholeDocumentRealAccepted: z.literal(0),
      wholeDocumentRealTotal: z.literal(6),
    }).strict(),
  }).strict(),
  rowIds: z.tuple(EXPECTED_ROW_IDS.map((rowId) => z.literal(rowId)) as [
    z.ZodLiteral<"real-opengrok-api">,
    z.ZodLiteral<"real-box-openapi">,
    z.ZodLiteral<"real-meilisearch-api">,
    z.ZodLiteral<"real-bangumi-api">,
    z.ZodLiteral<"real-deepl-openapi">,
    z.ZodLiteral<"real-hfs-openapi">,
  ]),
  revisionHistory: z.array(z.object({
    attempt: z.number().int().positive(),
    report: DigestPathSchema,
    portableSemanticSha256: Sha256Schema,
    rowId: z.literal("real-meilisearch-api"),
    issueCode: z.enum(["DOCUMENT_WIDE_DEPENDENCY_BLOCK", "OVERBROAD_UNRESOLVED_CLASSIFICATION"]),
    operations: z.literal(562),
    accepted: z.literal(112),
    unresolved: z.number().int().positive(),
    checked: z.number().int().nonnegative(),
    resolution: z.string().min(1),
  }).strict()).length(2).superRefine((history, context) => {
    if (JSON.stringify(history.map((entry) => entry.attempt)) !== JSON.stringify([1, 2])
      || history[0]?.issueCode !== "DOCUMENT_WIDE_DEPENDENCY_BLOCK" || history[0]?.checked !== 74
      || history[1]?.issueCode !== "OVERBROAD_UNRESOLVED_CLASSIFICATION" || history[1]?.checked !== 112) {
      context.addIssue({ code: "custom", message: "revision history must retain attempts 1 and 2 in order" });
    }
  }),
  implementation: z.object({
    supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
    admissionUnit: z.literal("operation"),
    artifactGrouping: z.literal("accepted-operations-per-source-document"),
    coverageUniverse: z.literal("independent-raw-source-bytes"),
    reuseUnchangedV2GeneratorChecker: z.literal(true),
    sourceSpecificSuccessBranches: z.literal(false),
  }).strict(),
  output: z.object({
    path: SafeRelativePathSchema,
    inventoryDirectory: SafeRelativePathSchema,
    artifactDirectory: SafeRelativePathSchema,
    reportFile: SafeRelativePathSchema,
    writeMode: z.literal("exclusive-create-once"),
  }).strict(),
  policy: z.object({
    realDocuments: z.literal(6),
    syntheticDocuments: z.literal(0),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    secondProfiles: z.literal(0),
    q4Runs: z.literal(0),
    readinessChanges: z.literal(0),
    retries: z.literal(0),
    replacements: z.literal(0),
  }).strict(),
  accounting: z.object({
    runtimeModelCalls: z.literal(0),
    runtimeApiCalls: z.literal(0),
    runtimePaidCalls: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    developmentSeparateFromRuntime: z.literal(true),
  }).strict(),
}).strict();

export type ApiTesterOperationDevelopmentContract = z.infer<
  typeof ApiTesterOperationDevelopmentContractSchema
>;

const GateSchema = z.enum(["pass", "fail"]);
const ArtifactEvidenceSchema = z.object({
  root: SafeRelativePathSchema,
  manifestSha256: Sha256Schema,
  generatorSha256: Sha256Schema,
  checkerSha256: Sha256Schema,
  planSha256: Sha256Schema,
  reportSha256: Sha256Schema,
  validationSha256: Sha256Schema,
}).strict();

const DevelopmentDocumentSchema = z.object({
  rowId: z.enum(EXPECTED_ROW_IDS),
  format: z.enum(["json", "yaml"]),
  source: z.object({
    cachePath: SafeRelativePathSchema,
    bytes: z.number().int().positive(),
    sha256: Sha256Schema,
    licenseSha256: Sha256Schema,
  }).strict(),
  inventory: DigestPathSchema,
  enumeration: z.object({
    complete: z.boolean(),
    operationCount: z.number().int().nonnegative(),
    unresolved: z.array(z.object({ code: z.string().min(1), locator: z.string().min(1), message: z.string().min(1) }).strict()),
  }).strict(),
  admission: z.object({
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    consistency: GateSchema,
  }).strict(),
  coverage: z.object({ status: GateSchema, errors: z.array(z.string().min(1)) }).strict(),
  artifact: z.object({
    status: z.enum(["passed", "not-run", "failed"]),
    acceptedOperationCount: z.number().int().nonnegative(),
    checkedOperationCount: z.number().int().nonnegative(),
    evidence: ArtifactEvidenceSchema.nullable(),
    error: z.string().min(1).nullable(),
  }).strict().superRefine((artifact, context) => {
    if (artifact.status === "passed") {
      if (!artifact.evidence || artifact.error !== null || artifact.acceptedOperationCount < 1
        || artifact.checkedOperationCount !== artifact.acceptedOperationCount) {
        context.addIssue({ code: "custom", message: "passed artifact must check every accepted operation" });
      }
    } else if (artifact.status === "not-run") {
      if (artifact.evidence !== null || artifact.error !== null || artifact.acceptedOperationCount !== 0
        || artifact.checkedOperationCount !== 0) {
        context.addIssue({ code: "custom", message: "not-run artifact requires zero accepted operations" });
      }
    } else if (artifact.evidence !== null || !artifact.error || artifact.checkedOperationCount !== 0) {
      context.addIssue({ code: "custom", message: "failed artifact requires a sanitized error and no passing evidence" });
    }
  }),
}).strict();

export const ApiTesterOperationDevelopmentReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_DEVELOPMENT_REPORT_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_DEVELOPMENT_IDENTITY),
  status: z.literal("completed"),
  completedAt: z.string().datetime(),
  inputs: z.object({
    contract: DigestPathSchema,
    selection: DigestPathSchema,
    predecessorLock: DigestPathSchema,
    predecessorReport: z.object({
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
      realAccepted: z.literal(0),
      realTotal: z.literal(6),
    }).strict(),
    priorAttempts: z.array(DigestPathSchema).default([]),
  }).strict(),
  totals: z.object({
    documents: z.literal(6),
    enumerationCompleteDocuments: z.number().int().min(0).max(6),
    operations: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    artifactCheckedPassedOperations: z.number().int().nonnegative(),
  }).strict(),
  gates: z.object({
    sourceCoverage: GateSchema,
    admissionConsistency: GateSchema,
    artifactCorrectness: GateSchema,
    correctness: GateSchema,
  }).strict(),
  obligationCoverage: z.object({
    total: z.number().int().nonnegative(),
    covered: z.number().int().nonnegative(),
    uncovered: z.number().int().nonnegative(),
    status: z.enum(["pass", "fail", "not-applicable"]),
  }).strict(),
  documents: z.array(DevelopmentDocumentSchema).length(6),
  revisions: z.array(z.object({
    rowId: z.enum(EXPECTED_ROW_IDS),
    stage: z.enum(["enumeration", "admission", "artifact", "coverage"]),
    code: z.string().min(1),
    message: z.string().min(1),
  }).strict()),
  accounting: z.object({
    runtime: z.object({
      modelCalls: z.literal(0),
      apiCalls: z.literal(0),
      paidCalls: z.literal(0),
      wallClockMillis: z.number().int().nonnegative().default(0),
      sourceBytesRead: z.number().int().nonnegative().default(0),
      licenseBytesRead: z.number().int().nonnegative().default(0),
    }).strict(),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    separate: z.literal(true),
  }).strict(),
  protectedBoundary: z.object({
    frozenWholeDocumentRealAccepted: z.literal(0),
    changesFrozenHistory: z.literal(false),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
    claimsEcosystemAdmission: z.literal(false),
  }).strict(),
  portableSemanticSha256: Sha256Schema,
}).strict().superRefine((report, context) => {
  const rowIds = report.documents.map((document) => document.rowId);
  if (JSON.stringify(rowIds) !== JSON.stringify(EXPECTED_ROW_IDS)) {
    context.addIssue({ code: "custom", path: ["documents"], message: "report must retain the exact six source rows in order" });
  }
  const sums = report.documents.reduce((value, document) => ({
    operations: value.operations + document.enumeration.operationCount,
    accepted: value.accepted + document.admission.accepted,
    rejected: value.rejected + document.admission.rejected,
    unresolved: value.unresolved + document.admission.unresolved,
    checked: value.checked + document.artifact.checkedOperationCount,
    complete: value.complete + Number(document.enumeration.complete),
  }), { operations: 0, accepted: 0, rejected: 0, unresolved: 0, checked: 0, complete: 0 });
  if (sums.operations !== report.totals.operations || sums.accepted !== report.totals.accepted
    || sums.rejected !== report.totals.rejected || sums.unresolved !== report.totals.unresolved
    || sums.checked !== report.totals.artifactCheckedPassedOperations
    || sums.complete !== report.totals.enumerationCompleteDocuments
    || sums.accepted + sums.rejected + sums.unresolved !== sums.operations) {
    context.addIssue({ code: "custom", path: ["totals"], message: "document and operation denominators must conserve exactly" });
  }
  const sourcePass = report.documents.every((document) => document.enumeration.complete && document.coverage.status === "pass");
  const admissionPass = report.documents.every((document) => document.admission.consistency === "pass");
  const artifactPass = report.documents.every((document) => document.admission.accepted === 0
    ? document.artifact.status === "not-run"
    : document.artifact.status === "passed" && document.artifact.checkedOperationCount === document.admission.accepted);
  if ((report.gates.sourceCoverage === "pass") !== sourcePass
    || (report.gates.admissionConsistency === "pass") !== admissionPass
    || (report.gates.artifactCorrectness === "pass") !== artifactPass) {
    context.addIssue({ code: "custom", path: ["gates"], message: "component gates do not match document evidence" });
  }
  const correctness = sourcePass && admissionPass && artifactPass && report.totals.unresolved === 0;
  if ((report.gates.correctness === "pass") !== correctness) {
    context.addIssue({ code: "custom", path: ["gates", "correctness"], message: "correctness gate cannot pass over a failed component" });
  }
  if (report.obligationCoverage.covered + report.obligationCoverage.uncovered !== report.obligationCoverage.total
    || (report.obligationCoverage.total === 0 && report.obligationCoverage.status !== "not-applicable")
    || (report.obligationCoverage.total > 0
      && (report.obligationCoverage.status === "pass") !== (report.obligationCoverage.uncovered === 0))) {
    context.addIssue({ code: "custom", path: ["obligationCoverage"], message: "validation obligation counts or status drifted" });
  }
});

export type ApiTesterOperationDevelopmentReport = z.infer<
  typeof ApiTesterOperationDevelopmentReportSchema
>;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function pathWithin(parent: string, child: string): boolean {
  const local = relative(resolve(parent), resolve(child));
  return local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
}

function contained(rootDir: string, path: string, label: string): string {
  const target = resolve(rootDir, path);
  if (!pathWithin(rootDir, target)) throw new Error(`${label} escapes its root`);
  return target;
}

async function readRegularFile(path: string, label: string): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return readFile(path);
}

async function readDigestBound(
  rootDir: string,
  reference: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const bytes = await readRegularFile(contained(rootDir, reference.path, label), label);
  if (sha256(bytes) !== reference.sha256) throw new Error(`${label} digest drift`);
  return bytes;
}

export function analyzeApiTesterOperationDocument(sourceText: string, format: "json" | "yaml") {
  const parsed = parseApiTesterOperationSource(sourceText, format);
  const admissions = parsed.document
    ? parsed.enumeration.operations.map((operation) => analyzeApiTesterOperation({ document: parsed.document, operation }))
    : [];
  const consistency = verifyApiTesterOperationAdmissionConsistency(admissions);
  return {
    document: parsed.document,
    enumeration: parsed.enumeration,
    admissions,
    consistency,
    summary: {
      operations: admissions.length,
      accepted: admissions.filter((row) => row.status === "accepted").length,
      rejected: admissions.filter((row) => row.status === "rejected").length,
      unresolved: admissions.filter((row) => row.status === "unresolved").length,
    },
  };
}

function semanticDigestInput(report: Omit<ApiTesterOperationDevelopmentReport, "portableSemanticSha256">): unknown {
  return {
    ...report,
    completedAt: "<excluded>",
    accounting: {
      ...report.accounting,
      runtime: { ...report.accounting.runtime, wallClockMillis: 0 },
    },
  };
}

export function computeApiTesterOperationDevelopmentPortableDigest(
  report: Omit<ApiTesterOperationDevelopmentReport, "portableSemanticSha256">,
): string {
  return sha256(jsonText(semanticDigestInput(report)));
}

const OperationInventoryVerificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-inventory/v1"),
  identity: z.literal(API_TESTER_OPERATION_DEVELOPMENT_IDENTITY),
  rowId: z.enum(EXPECTED_ROW_IDS),
  operations: z.array(z.object({
    source: z.object({ key: z.string().min(1) }).passthrough(),
    admission: z.object({ status: z.enum(["accepted", "rejected", "unresolved"]) }).passthrough().nullable(),
  }).passthrough()),
  admissionConsistency: z.object({ status: GateSchema }).passthrough(),
  coverage: z.object({ status: GateSchema }).passthrough(),
  artifact: z.object({ status: z.enum(["passed", "not-run", "failed"]) }).passthrough(),
}).passthrough();

const GeneratedReportVerificationSchema = z.object({
  schemaVersion: z.literal("api-test-report/v2"),
  bindingId: z.string().min(1),
  input: z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict(),
  publicContract: z.object({
    schemaVersion: z.literal("skill-ir-api-tester-public-contract/v2"),
    supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  }).strict(),
  generatedCaseCount: z.number().int().positive(),
  verification: z.object({
    status: z.literal("not-run"),
    checker: z.literal("independent-public-contract-v2"),
  }).strict(),
}).passthrough();

export async function verifyApiTesterOperationDevelopmentReport(options: {
  rootDir: string;
  reportPath?: string;
  cacheRoot?: string;
}): Promise<{
  status: "verified";
  documents: 6;
  operations: number;
  accepted: number;
  rejected: number;
  unresolved: number;
  checked: number;
  inventoriesVerified: number;
  artifactsVerified: number;
  portableSemanticSha256: string;
}> {
  const rootDir = resolve(options.rootDir);
  const reportPath = contained(
    rootDir,
    options.reportPath ?? API_TESTER_OPERATION_DEVELOPMENT_REPORT_PATH,
    "operation development report",
  );
  const reportBytes = await readRegularFile(reportPath, "operation development report");
  const report = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
  const { portableSemanticSha256, ...reportWithoutDigest } = report;
  if (computeApiTesterOperationDevelopmentPortableDigest(reportWithoutDigest) !== portableSemanticSha256) {
    throw new Error("operation development report portable semantic digest drift");
  }

  const contractBytes = await readDigestBound(rootDir, report.inputs.contract, "development contract");
  const contract = ApiTesterOperationDevelopmentContractSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  if (report.inputs.contract.path !== API_TESTER_OPERATION_DEVELOPMENT_CONTRACT_PATH
    || report.inputs.selection.path !== contract.predecessor.selection.path
    || report.inputs.selection.sha256 !== contract.predecessor.selection.sha256
    || report.inputs.predecessorLock.path !== contract.predecessor.lock.path
    || report.inputs.predecessorLock.sha256 !== contract.predecessor.lock.sha256
    || report.inputs.predecessorReport.path !== contract.predecessor.firstRun.path
    || report.inputs.predecessorReport.sha256 !== contract.predecessor.firstRun.sha256
    || report.inputs.predecessorReport.realAccepted !== contract.predecessor.firstRun.wholeDocumentRealAccepted
    || report.inputs.predecessorReport.realTotal !== contract.predecessor.firstRun.wholeDocumentRealTotal
    || JSON.stringify(report.inputs.priorAttempts) !== JSON.stringify(
      contract.revisionHistory.map((revision) => revision.report),
    )) {
    throw new Error("operation development report input bindings drifted from its contract");
  }

  const [selectionBytes, lockBytes, predecessorBytes, ...attemptBytes] = await Promise.all([
    readDigestBound(rootDir, report.inputs.selection, "source selection"),
    readDigestBound(rootDir, report.inputs.predecessorLock, "predecessor lock"),
    readDigestBound(rootDir, report.inputs.predecessorReport, "predecessor first-run report"),
    ...report.inputs.priorAttempts.map((reference, index) =>
      readDigestBound(rootDir, reference, `prior attempt ${index + 1}`)),
  ]);
  const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  const lock = ApiTesterV2FeatureMigrationLockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
  const predecessor = ApiTesterV2FeatureMigrationFirstRunReportSchema.parse(JSON.parse(predecessorBytes.toString("utf8")));
  if (JSON.stringify(selection.selected.map((row) => row.rowId)) !== JSON.stringify(contract.rowIds)
    || lock.selection.sha256 !== report.inputs.selection.sha256
    || predecessor.freeze.lockSha256 !== report.inputs.predecessorLock.sha256
    || predecessor.strata.realPublicInputs.accepted !== 0
    || predecessor.strata.realPublicInputs.rejected !== 6) {
    throw new Error("operation development predecessor evidence drifted");
  }
  for (const [index, bytes] of attemptBytes.entries()) {
    const attempt = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(bytes.toString("utf8")));
    const revision = contract.revisionHistory[index];
    if (!revision || attempt.gates.correctness !== "fail"
      || attempt.portableSemanticSha256 !== revision.portableSemanticSha256
      || attempt.totals.operations !== revision.operations
      || attempt.totals.accepted !== revision.accepted
      || attempt.totals.unresolved !== revision.unresolved
      || attempt.totals.artifactCheckedPassedOperations !== revision.checked) {
      throw new Error(`prior attempt evidence drift: ${index + 1}`);
    }
  }

  if (options.cacheRoot) {
    const cacheRoot = resolve(options.cacheRoot);
    for (const [index, source] of selection.selected.entries()) {
      const reported = report.documents[index];
      if (!reported || reported.rowId !== source.rowId
        || reported.format !== source.format
        || reported.source.cachePath !== source.cachePath
        || reported.source.bytes !== source.bytes
        || reported.source.sha256 !== source.sha256
        || reported.source.licenseSha256 !== source.license.sha256) {
        throw new Error(`source selection/report binding drift: ${source.rowId}`);
      }
      const [sourceBytes, licenseBytes] = await Promise.all([
        readRegularFile(contained(cacheRoot, source.cachePath, `source ${source.rowId}`), `source ${source.rowId}`),
        readRegularFile(contained(cacheRoot, source.license.cachePath, `license ${source.rowId}`), `license ${source.rowId}`),
      ]);
      if (sourceBytes.byteLength !== source.bytes || sha256(sourceBytes) !== source.sha256
        || licenseBytes.byteLength !== source.license.bytes || sha256(licenseBytes) !== source.license.sha256) {
        throw new Error(`source or license digest drift: ${source.rowId}`);
      }
    }
  }

  const resultRoot = dirname(reportPath);
  let inventoriesVerified = 0;
  let artifactsVerified = 0;
  for (const document of report.documents) {
    const inventoryBytes = await readDigestBound(resultRoot, document.inventory, `inventory ${document.rowId}`);
    const inventory = OperationInventoryVerificationSchema.parse(JSON.parse(inventoryBytes.toString("utf8")));
    const inventoryKeys = inventory.operations.map((operation) => operation.source.key);
    const inventoryStatuses = inventory.operations.map((operation) => operation.admission?.status ?? "unresolved");
    if (inventory.rowId !== document.rowId
      || inventory.operations.length !== document.enumeration.operationCount
      || new Set(inventoryKeys).size !== inventoryKeys.length
      || inventoryStatuses.filter((status) => status === "accepted").length !== document.admission.accepted
      || inventoryStatuses.filter((status) => status === "rejected").length !== document.admission.rejected
      || inventoryStatuses.filter((status) => status === "unresolved").length !== document.admission.unresolved
      || inventory.admissionConsistency.status !== document.admission.consistency
      || inventory.coverage.status !== document.coverage.status
      || inventory.artifact.status !== document.artifact.status) {
      throw new Error(`inventory/report semantic drift: ${document.rowId}`);
    }
    inventoriesVerified += 1;

    if (document.artifact.status !== "passed") continue;
    const evidence = document.artifact.evidence;
    if (!evidence) throw new Error(`passed artifact lacks evidence: ${document.rowId}`);
    const artifactRoot = contained(resultRoot, evidence.root, `artifact root ${document.rowId}`);
    const validated = await validateApiTesterProductionArtifactV2(join(artifactRoot, "artifact"));
    const [manifestBytes, planBytes, generatedReportBytes, validationBytes] = await Promise.all([
      readRegularFile(join(artifactRoot, "artifact", "package-manifest.json"), `manifest ${document.rowId}`),
      readRegularFile(join(artifactRoot, "generated-plan.json"), `generated plan ${document.rowId}`),
      readRegularFile(join(artifactRoot, "generated-report.json"), `generated report ${document.rowId}`),
      readRegularFile(join(artifactRoot, "validation-report.json"), `validation report ${document.rowId}`),
    ]);
    if (sha256(manifestBytes) !== evidence.manifestSha256
      || sha256(planBytes) !== evidence.planSha256
      || sha256(generatedReportBytes) !== evidence.reportSha256
      || sha256(validationBytes) !== evidence.validationSha256
      || validated.manifest.programs.generator.sha256 !== evidence.generatorSha256
      || validated.manifest.programs.checker.sha256 !== evidence.checkerSha256) {
      throw new Error(`artifact evidence digest drift: ${document.rowId}`);
    }
    const planKeys = artifactOperationKeys(JSON.parse(planBytes.toString("utf8")));
    const contractKeys = validated.contract.operations.map((operation) => `${operation.method} ${operation.path}`);
    const generatedReport = GeneratedReportVerificationSchema.parse(JSON.parse(generatedReportBytes.toString("utf8")));
    const validation = ApiTesterProductionValidationReportSchemaV2.parse(JSON.parse(validationBytes.toString("utf8")));
    if (planKeys.length !== document.artifact.checkedOperationCount
      || new Set(planKeys).size !== planKeys.length
      || JSON.stringify(planKeys) !== JSON.stringify(contractKeys)
      || contractKeys.length !== document.artifact.acceptedOperationCount
      || generatedReport.bindingId !== validated.binding.bindingId
      || generatedReport.input.path !== validated.binding.input.path
      || generatedReport.input.sha256 !== validated.manifest.protectedInput.sha256
      || validation.status !== "pass"
      || validation.bindingId !== validated.binding.bindingId
      || validation.inputSha256 !== validated.manifest.protectedInput.sha256
      || Object.values(validation.checks).some((passed) => !passed)) {
      throw new Error(`artifact/report semantic drift: ${document.rowId}`);
    }
    artifactsVerified += 1;
  }

  return {
    status: "verified",
    documents: 6,
    operations: report.totals.operations,
    accepted: report.totals.accepted,
    rejected: report.totals.rejected,
    unresolved: report.totals.unresolved,
    checked: report.totals.artifactCheckedPassedOperations,
    inventoriesVerified,
    artifactsVerified,
    portableSemanticSha256,
  };
}

function sanitizedError(error: unknown, replacements: string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const [index, value] of replacements.entries()) {
    if (value) message = message.replaceAll(value, `<path-${index + 1}>`);
  }
  return message || "unknown error";
}

function artifactOperationKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { endpoints?: unknown }).endpoints)) return [];
  return ((value as { endpoints: unknown[] }).endpoints).flatMap((endpoint) => {
    if (!endpoint || typeof endpoint !== "object") return [];
    const record = endpoint as Record<string, unknown>;
    return typeof record.method === "string" && typeof record.path === "string"
      ? [`${record.method} ${record.path}`] : [];
  });
}

function countCoveredObligations(
  acceptedOperations: number,
  checks: Record<string, boolean>,
): { total: number; covered: number } {
  if (acceptedOperations === 0) return { total: 0, covered: 0 };
  const operationChecks = ["operationCoverage", "arrayEncoding", "schemaDerivedCases", "securityResponse", "independenceVerification"];
  const documentChecks = ["inputGrounding", "artifactShape", "reportGrounding"];
  return {
    total: acceptedOperations * operationChecks.length + documentChecks.length,
    covered: acceptedOperations * operationChecks.filter((key) => checks[key]).length
      + documentChecks.filter((key) => checks[key]).length,
  };
}

export async function runApiTesterOperationDevelopment(options: {
  rootDir: string;
  cacheRoot: string;
  outputRoot?: string;
  nodeExecutable: string;
  completedAt?: string;
}): Promise<ApiTesterOperationDevelopmentReport> {
  const started = performance.now();
  const rootDir = resolve(options.rootDir);
  const cacheRoot = resolve(options.cacheRoot);
  const contractBytes = await readRegularFile(
    contained(rootDir, API_TESTER_OPERATION_DEVELOPMENT_CONTRACT_PATH, "development contract"),
    "development contract",
  );
  const contract = ApiTesterOperationDevelopmentContractSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  const [selectionBytes, lockBytes, predecessorBytes] = await Promise.all([
    readDigestBound(rootDir, contract.predecessor.selection, "source selection"),
    readDigestBound(rootDir, contract.predecessor.lock, "predecessor lock"),
    readDigestBound(rootDir, contract.predecessor.firstRun, "predecessor first-run report"),
  ]);
  const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  const lock = ApiTesterV2FeatureMigrationLockSchema.parse(JSON.parse(lockBytes.toString("utf8")));
  const predecessor = ApiTesterV2FeatureMigrationFirstRunReportSchema.parse(JSON.parse(predecessorBytes.toString("utf8")));
  if (JSON.stringify(selection.selected.map((row) => row.rowId)) !== JSON.stringify(contract.rowIds)
    || lock.selection.sha256 !== contract.predecessor.selection.sha256
    || predecessor.freeze.lockSha256 !== contract.predecessor.lock.sha256
    || predecessor.strata.realPublicInputs.accepted !== 0
    || predecessor.strata.realPublicInputs.rejected !== 6) {
    throw new Error("development predecessor evidence or exact six-row identity drifted");
  }
  const priorAttemptBytes = await Promise.all(contract.revisionHistory.map((revision) =>
    readDigestBound(rootDir, revision.report, `prior attempt ${revision.attempt}`)));
  for (const [index, bytes] of priorAttemptBytes.entries()) {
    const revision = contract.revisionHistory[index]!;
    const prior = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (prior.portableSemanticSha256 !== revision.portableSemanticSha256
      || prior.totals.operations !== revision.operations
      || prior.totals.accepted !== revision.accepted
      || prior.totals.unresolved !== revision.unresolved
      || prior.totals.artifactCheckedPassedOperations !== revision.checked
      || prior.gates.correctness !== "fail") {
      throw new Error(`prior attempt evidence drift: ${revision.attempt}`);
    }
  }
  const outputRoot = resolve(options.outputRoot ?? contained(rootDir, contract.output.path, "development output"));
  await mkdir(outputRoot, { recursive: false });
  const inventoryDir = join(outputRoot, contract.output.inventoryDirectory);
  const artifactDir = join(outputRoot, contract.output.artifactDirectory);
  await Promise.all([mkdir(inventoryDir), mkdir(artifactDir)]);
  const tempRoot = await mkdtemp(join(tmpdir(), "skvm-api-operation-"));
  const documents: z.infer<typeof DevelopmentDocumentSchema>[] = [];
  const revisions: ApiTesterOperationDevelopmentReport["revisions"] = contract.revisionHistory.map((revision) => ({
    rowId: revision.rowId,
    stage: "enumeration",
    code: revision.issueCode,
    message: `${revision.resolution} Prior report ${revision.report.path} (${revision.report.sha256}).`,
  }));
  let sourceBytesRead = 0;
  let licenseBytesRead = 0;
  let obligationTotal = 0;
  let obligationCovered = 0;
  try {
    for (const source of selection.selected) {
      const rowId = z.enum(EXPECTED_ROW_IDS).parse(source.rowId);
      const sourcePath = contained(cacheRoot, source.cachePath, `source ${source.rowId}`);
      const licensePath = contained(cacheRoot, source.license.cachePath, `license ${source.rowId}`);
      const [sourceBytes, licenseBytes] = await Promise.all([
        readRegularFile(sourcePath, `source ${source.rowId}`),
        readRegularFile(licensePath, `license ${source.rowId}`),
      ]);
      sourceBytesRead += sourceBytes.byteLength;
      licenseBytesRead += licenseBytes.byteLength;
      if (sourceBytes.byteLength !== source.bytes || sha256(sourceBytes) !== source.sha256
        || licenseBytes.byteLength !== source.license.bytes || sha256(licenseBytes) !== source.license.sha256) {
        throw new Error(`source or license digest drift: ${source.rowId}`);
      }
      const sourceText = sourceBytes.toString("utf8");
      const analysis = analyzeApiTesterOperationDocument(sourceText, source.format);
      for (const issue of analysis.enumeration.unresolved) {
        revisions.push({ rowId, stage: "enumeration", code: issue.code, message: issue.message });
      }
      const accepted = analysis.admissions.filter((admission) => admission.status === "accepted");
      const projectedKeys = accepted.flatMap((admission) => admission.projection?.operationKeys ?? []);
      const dependencyReports = analysis.document ? accepted.map((admission) => ({
        operationKey: admission.operationKey,
        ...verifyApiTesterProjectionDependencies({
          sourceDocument: analysis.document,
          operationKey: admission.operationKey,
          projectedDocument: admission.projection?.document,
        }),
      })) : [];
      for (const dependency of dependencyReports.filter((report) => report.status === "fail")) {
        for (const code of dependency.errors) {
          revisions.push({ rowId, stage: "admission", code, message: `${dependency.operationKey} dependency verification failed` });
        }
      }
      let contractKeys: string[] = [];
      let generatedKeys: string[] = [];
      let artifact: z.infer<typeof DevelopmentDocumentSchema>["artifact"] = {
        status: "not-run",
        acceptedOperationCount: 0,
        checkedOperationCount: 0,
        evidence: null,
        error: null,
      };
      let checks: Record<string, boolean> = {};
      if (accepted.length > 0 && analysis.enumeration.complete && analysis.consistency.status === "pass"
        && dependencyReports.every((report) => report.status === "pass") && analysis.document) {
        const perRowTemp = join(tempRoot, source.rowId);
        const bindingRoot = join(perRowTemp, "binding-root");
        const workDir = join(perRowTemp, "workdir");
        await Promise.all([mkdir(bindingRoot, { recursive: true }), mkdir(join(workDir, "input"), { recursive: true })]);
        const projection = aggregateApiTesterOperations(
          analysis.document,
          accepted.map((admission) => admission.operationKey as `${Uppercase<"get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace">} ${string}`),
        );
        const inputPath = "input/openapi.json";
        const planPath = "outputs/api-test-plan.json";
        const generatedReportPath = "outputs/api-test-report.json";
        const binding = ApiTesterProductionBindingSchemaV2.parse({
          schemaVersion: "skill-ir-api-tester-production-binding/v2",
          bindingId: source.rowId.replace(/^real-/u, "operation-"),
          input: { path: inputPath, format: "json" },
          outputs: { plan: planPath, report: generatedReportPath },
        });
        await Promise.all([
          writeFile(join(bindingRoot, "binding.json"), jsonText(binding), "utf8"),
          writeFile(join(workDir, inputPath), jsonText(projection.document), "utf8"),
        ]);
        const rowArtifactDir = join(artifactDir, source.rowId);
        try {
          const run = await runApiTesterProductionArtifactV2({
            rootDir: bindingRoot,
            bindingPath: "binding.json",
            workDir,
            outDir: rowArtifactDir,
            nodeExecutable: options.nodeExecutable,
          });
          const validated = await validateApiTesterProductionArtifactV2(join(rowArtifactDir, "artifact"));
          contractKeys = validated.contract.operations.map((operation) => `${operation.method} ${operation.path}`);
          const planBytes = await readFile(join(workDir, planPath));
          const generatedReportBytes = await readFile(join(workDir, generatedReportPath));
          generatedKeys = artifactOperationKeys(JSON.parse(planBytes.toString("utf8")));
          await Promise.all([
            copyFile(join(workDir, planPath), join(rowArtifactDir, "generated-plan.json")),
            copyFile(join(workDir, generatedReportPath), join(rowArtifactDir, "generated-report.json")),
          ]);
          checks = run.validation.checks;
          artifact = {
            status: "passed",
            acceptedOperationCount: accepted.length,
            checkedOperationCount: generatedKeys.length,
            evidence: {
              root: `${contract.output.artifactDirectory}/${source.rowId}`,
              manifestSha256: run.package.manifestSha256,
              generatorSha256: run.package.generator.sha256,
              checkerSha256: run.package.checker.sha256,
              planSha256: sha256(planBytes),
              reportSha256: sha256(generatedReportBytes),
              validationSha256: run.outputs.validationReport.sha256,
            },
            error: null,
          };
        } catch (error) {
          const message = sanitizedError(error, [rootDir, cacheRoot, tempRoot, outputRoot]);
          artifact = {
            status: "failed",
            acceptedOperationCount: accepted.length,
            checkedOperationCount: 0,
            evidence: null,
            error: message,
          };
          revisions.push({ rowId, stage: "artifact", code: "ARTIFACT_EXECUTION_FAILED", message });
        }
      }
      const coverage = verifyApiTesterOperationCoverage({
        sourceText,
        format: source.format,
        analyzedOperations: analysis.enumeration.operations.map((operation, index) => ({
          key: operation.key,
          locator: operation.locator,
          operationId: operation.operationId,
          summary: operation.summary,
          status: analysis.admissions[index]?.status ?? "unresolved",
        })),
        projectedOperationKeys: projectedKeys,
        contractOperationKeys: contractKeys,
        artifactOperationKeys: generatedKeys,
      });
      const coverageErrors = [...coverage.errors, ...dependencyReports.flatMap((report) =>
        report.errors.map((code) => `DEPENDENCY_${code}`))].sort(compareText);
      for (const code of coverageErrors) {
        revisions.push({ rowId, stage: "coverage", code, message: "source-to-artifact operation conservation failed" });
      }
      const obligations = countCoveredObligations(accepted.length, checks);
      obligationTotal += obligations.total;
      obligationCovered += obligations.covered;
      const inventoryValue = {
        schemaVersion: "skill-ir-api-tester-operation-inventory/v1",
        identity: API_TESTER_OPERATION_DEVELOPMENT_IDENTITY,
        rowId,
        source: {
          format: source.format,
          cachePath: source.cachePath,
          bytes: source.bytes,
          sha256: source.sha256,
          upstream: source.upstream,
          license: { summary: source.license.summary, sha256: source.license.sha256 },
        },
        enumeration: analysis.enumeration,
        operations: analysis.enumeration.operations.map((operation, index) => {
          const admission = analysis.admissions[index];
          return {
            source: operation,
            admission: admission ? {
              operationKey: admission.operationKey,
              status: admission.status,
              findings: admission.findings,
              firstObservedRejection: admission.firstObservedRejection,
              normalizedOperation: admission.normalizedOperation,
              projection: admission.projectionSummary,
            } : null,
          };
        }),
        admissionConsistency: analysis.consistency,
        dependencyVerification: dependencyReports,
        coverage: { ...coverage, errors: coverageErrors },
        artifact,
      };
      const inventoryText = jsonText(inventoryValue);
      const inventoryRelativePath = `${contract.output.inventoryDirectory}/${source.rowId}.json`;
      await writeFile(join(outputRoot, inventoryRelativePath), inventoryText, { encoding: "utf8", flag: "wx" });
      documents.push(DevelopmentDocumentSchema.parse({
        rowId,
        format: source.format,
        source: {
          cachePath: source.cachePath,
          bytes: source.bytes,
          sha256: source.sha256,
          licenseSha256: source.license.sha256,
        },
        inventory: { path: inventoryRelativePath, sha256: sha256(inventoryText) },
        enumeration: {
          complete: analysis.enumeration.complete,
          operationCount: analysis.summary.operations,
          unresolved: analysis.enumeration.unresolved,
        },
        admission: {
          accepted: analysis.summary.accepted,
          rejected: analysis.summary.rejected,
          unresolved: analysis.summary.unresolved,
          consistency: analysis.consistency.status,
        },
        coverage: { status: coverage.status === "pass" && coverageErrors.length === 0 ? "pass" : "fail", errors: coverageErrors },
        artifact,
      }));
    }
  } finally {
    if (pathWithin(tmpdir(), tempRoot) && tempRoot !== resolve(tmpdir())) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
  const totals = documents.reduce((value, document) => ({
    documents: 6 as const,
    enumerationCompleteDocuments: value.enumerationCompleteDocuments + Number(document.enumeration.complete),
    operations: value.operations + document.enumeration.operationCount,
    accepted: value.accepted + document.admission.accepted,
    rejected: value.rejected + document.admission.rejected,
    unresolved: value.unresolved + document.admission.unresolved,
    artifactCheckedPassedOperations: value.artifactCheckedPassedOperations + document.artifact.checkedOperationCount,
  }), { documents: 6 as const, enumerationCompleteDocuments: 0, operations: 0, accepted: 0, rejected: 0, unresolved: 0, artifactCheckedPassedOperations: 0 });
  const sourceCoverage: "pass" | "fail" = documents.every((document) => document.enumeration.complete && document.coverage.status === "pass") ? "pass" : "fail";
  const admissionConsistency: "pass" | "fail" = documents.every((document) => document.admission.consistency === "pass") ? "pass" : "fail";
  const artifactCorrectness: "pass" | "fail" = documents.every((document) => document.admission.accepted === 0
    ? document.artifact.status === "not-run"
    : document.artifact.status === "passed" && document.artifact.checkedOperationCount === document.admission.accepted) ? "pass" : "fail";
  const obligationUncovered = obligationTotal - obligationCovered;
  const reportWithoutDigest: Omit<ApiTesterOperationDevelopmentReport, "portableSemanticSha256"> = {
    schemaVersion: API_TESTER_OPERATION_DEVELOPMENT_REPORT_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_DEVELOPMENT_IDENTITY,
    status: "completed" as const,
    completedAt: options.completedAt ?? new Date().toISOString(),
    inputs: {
      contract: { path: API_TESTER_OPERATION_DEVELOPMENT_CONTRACT_PATH, sha256: sha256(contractBytes) },
      selection: { path: contract.predecessor.selection.path, sha256: sha256(selectionBytes) },
      predecessorLock: { path: contract.predecessor.lock.path, sha256: sha256(lockBytes) },
      predecessorReport: {
        path: contract.predecessor.firstRun.path,
        sha256: sha256(predecessorBytes),
        realAccepted: 0 as const,
        realTotal: 6 as const,
      },
      priorAttempts: contract.revisionHistory.map((revision) => ({
        path: revision.report.path,
        sha256: revision.report.sha256,
      })),
    },
    totals,
    gates: {
      sourceCoverage,
      admissionConsistency,
      artifactCorrectness,
      correctness: sourceCoverage === "pass" && admissionConsistency === "pass"
        && artifactCorrectness === "pass" && totals.unresolved === 0 ? "pass" as const : "fail" as const,
    },
    obligationCoverage: {
      total: obligationTotal,
      covered: obligationCovered,
      uncovered: obligationUncovered,
      status: obligationTotal === 0 ? "not-applicable" as const : obligationUncovered === 0 ? "pass" as const : "fail" as const,
    },
    documents,
    revisions,
    accounting: {
      runtime: {
        modelCalls: 0 as const,
        apiCalls: 0 as const,
        paidCalls: 0 as const,
        wallClockMillis: Math.max(0, Math.round(performance.now() - started)),
        sourceBytesRead,
        licenseBytesRead,
      },
      developmentAgentUsage: "host-external-not-measured-by-runner" as const,
      separate: true as const,
    },
    protectedBoundary: {
      frozenWholeDocumentRealAccepted: 0 as const,
      changesFrozenHistory: false as const,
      prospectiveRuns: 0 as const,
      heldOutAccesses: 0 as const,
      readinessChanges: 0 as const,
      claimsHumanSavings: false as const,
      claimsEcosystemAdmission: false as const,
    },
  };
  const report = ApiTesterOperationDevelopmentReportSchema.parse({
    ...reportWithoutDigest,
    portableSemanticSha256: computeApiTesterOperationDevelopmentPortableDigest(reportWithoutDigest),
  });
  await writeFile(join(outputRoot, contract.output.reportFile), jsonText(report), { encoding: "utf8", flag: "wx" });
  return report;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
