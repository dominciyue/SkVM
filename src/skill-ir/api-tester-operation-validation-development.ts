import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema } from "../benchmarks/skill-ir/artifact-package";
import { ApiTesterV2FeatureMigrationSelectionSchema } from "../benchmarks/skill-ir/api-tester-v2-feature-migration";
import {
  ApiTesterOperationDevelopmentReportSchema,
  verifyApiTesterOperationDevelopmentReport,
} from "./api-tester-operation-development";
import {
  API_TESTER_OPERATION_FAULT_EXPECTATIONS,
  API_TESTER_OPERATION_TRANSFORM_REGISTRY,
  evaluateApiTesterOperationTransform,
  runApiTesterOperationFaultDetection,
  selectApiTesterOperationValidationBranch,
} from "./api-tester-operation-validation";

export const API_TESTER_OPERATION_VALIDATION_IDENTITY =
  "skill-ir-api-tester-operation-validation-development-001" as const;
export const API_TESTER_OPERATION_VALIDATION_CONTRACT_PATH =
  "benchmarks/skill-ir/pilots/api-tester/operation-validation-development-001/validation-contract.json" as const;
export const API_TESTER_OPERATION_VALIDATION_REPORT_PATH =
  "results/skill-ir/api-tester-operation-validation-development-001/report.json" as const;
export const API_TESTER_OPERATION_COMBINED_IDENTITY =
  "skill-ir-api-tester-operation-development-001" as const;
export const API_TESTER_OPERATION_COMBINED_REPORT_PATH =
  "results/skill-ir/api-tester-operation-development-001/report.json" as const;

const EXPECTED_ROWS = [
  "real-opengrok-api",
  "real-box-openapi",
  "real-meilisearch-api",
  "real-bangumi-api",
  "real-deepl-openapi",
  "real-hfs-openapi",
] as const;
const EXPECTED_TRANSFORMS = [
  "object-order",
  "formatting",
  "json-yaml",
  "irrelevant-description",
  "add-unsupported-operation",
  "local-ref-inline",
] as const;
const EXPECTED_FAULTS = [
  "operation-omission",
  "operation-duplicate",
  "parameter-dependency-loss",
  "reference-dependency-loss",
  "security-dependency-loss",
  "summary-drift",
  "false-acceptance",
  "artifact-endpoint-loss",
  "artifact-witness-loss",
] as const;
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const DigestPathSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();

export const ApiTesterOperationValidationContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-validation-contract/v1"),
  identity: z.literal(API_TESTER_OPERATION_VALIDATION_IDENTITY),
  createdAt: z.string().datetime(),
  task1: z.object({
    commit: CommitSchema,
    report: z.object({
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
      portableSemanticSha256: Sha256Schema,
    }).strict(),
  }).strict(),
  transforms: z.array(z.enum(EXPECTED_TRANSFORMS)).length(6),
  faults: z.array(z.enum(EXPECTED_FAULTS)).length(9),
  cleanReproduction: z.object({
    checkout: z.literal("detached-task1-commit"),
    installCommand: z.literal("bun install --frozen-lockfile --offline"),
    task1Command: z.string().min(1),
    reportPath: SafeRelativePathSchema,
    bunLockSha256: Sha256Schema,
    networkAllowed: z.literal(false),
  }).strict(),
  output: z.object({
    validationPath: SafeRelativePathSchema,
    validationReport: z.literal("report.json"),
    combinedPath: SafeRelativePathSchema,
    combinedReport: z.literal("report.json"),
    writeMode: z.literal("exclusive-create-once"),
  }).strict(),
  policy: z.object({
    realDocuments: z.literal(6),
    derivedInputsAreIndependentSamples: z.literal(false),
    syntheticFaultFixturesCountAsRealSuccess: z.literal(false),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    secondProfiles: z.literal(0),
    q4Runs: z.literal(0),
    readinessChanges: z.literal(0),
  }).strict(),
  accounting: z.object({
    runtimeModelCalls: z.literal(0),
    runtimeApiCalls: z.literal(0),
    runtimePaidCalls: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    developmentSeparateFromRuntime: z.literal(true),
  }).strict(),
}).strict().superRefine((contract, context) => {
  if (JSON.stringify(contract.transforms) !== JSON.stringify(EXPECTED_TRANSFORMS)) {
    context.addIssue({ code: "custom", path: ["transforms"], message: "transform preregistration order drifted" });
  }
  if (JSON.stringify(contract.faults) !== JSON.stringify(EXPECTED_FAULTS)) {
    context.addIssue({ code: "custom", path: ["faults"], message: "fault preregistration order drifted" });
  }
});

export type ApiTesterOperationValidationContract = z.infer<
  typeof ApiTesterOperationValidationContractSchema
>;

const TransformRegistrationSchema = z.object({
  type: z.enum(EXPECTED_TRANSFORMS),
  applicability: z.string().min(1),
  expectedRelation: z.string().min(1),
  comparisonFields: z.array(z.string().min(1)).min(1),
}).strict();

const TransformCaseSchema = z.object({
  rowId: z.enum(EXPECTED_ROWS),
  type: z.enum(EXPECTED_TRANSFORMS),
  applicability: z.enum(["applicable", "not-applicable"]),
  status: z.enum(["pass", "fail", "not-applicable"]),
  reason: z.string().min(1).nullable(),
  comparisonFields: z.array(z.string().min(1)).min(1),
  parentSha256: Sha256Schema,
  derivedSha256: Sha256Schema.nullable(),
  parentFormat: z.enum(["json", "yaml"]),
  derivedFormat: z.enum(["json", "yaml"]).nullable(),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean()])),
  errors: z.array(z.string().min(1)),
}).strict();

const FaultCaseSchema = z.object({
  fault: z.enum(EXPECTED_FAULTS),
  detectorLayer: z.enum(["source-coverage", "dependency-verifier", "admission-consistency", "independent-checker"]),
  code: z.string().min(1),
  detected: z.boolean(),
}).strict();

const SourceBlockerSchema = z.object({
  kind: z.literal("source-dependency"),
  rowId: z.enum(EXPECTED_ROWS),
  operationKey: z.string().min(1),
  locator: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  disposition: z.literal("excluded-from-accepted-set-no-semantic-guess"),
}).strict();

const CleanReproductionSchema = z.object({
  status: z.literal("pass"),
  checkout: z.object({
    commit: CommitSchema,
    detached: z.literal(true),
    trackedChanges: z.literal(0),
    onlyExpectedResultUntracked: z.literal(true),
    locationClass: z.literal("project-local-ignored-worktree"),
  }).strict(),
  install: z.object({
    command: z.literal("bun install --frozen-lockfile --offline"),
    status: z.literal("pass"),
    bunLockSha256: Sha256Schema,
    networkAllowed: z.literal(false),
    installedPackages: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) }).strict()).min(2),
  }).strict(),
  run: z.object({
    command: z.string().min(1),
    report: DigestPathSchema,
    strictVerification: z.literal("pass"),
  }).strict(),
  comparison: z.object({
    portableSemanticDigestEqual: z.literal(true),
    totalsEqual: z.literal(true),
    gatesEqual: z.literal(true),
    obligationsEqual: z.literal(true),
    inventoryAndArtifactDigestsEqual: z.literal(true),
  }).strict(),
  environment: z.object({
    platform: z.string().min(1),
    release: z.string().min(1),
    arch: z.string().min(1),
    bunVersion: z.string().min(1),
    nodeVersion: z.string().min(1),
  }).strict(),
}).strict();

export const ApiTesterOperationValidationDevelopmentReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-validation-development-report/v1"),
  identity: z.literal(API_TESTER_OPERATION_VALIDATION_IDENTITY),
  status: z.literal("completed-with-source-blocker"),
  completedAt: z.string().datetime(),
  inputs: z.object({
    contract: DigestPathSchema,
    task1: z.object({ commit: CommitSchema, report: DigestPathSchema, portableSemanticSha256: Sha256Schema }).strict(),
  }).strict(),
  branch: z.literal("real-positive"),
  task1Verification: z.object({
    status: z.literal("verified"),
    documents: z.literal(6),
    operations: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    checked: z.number().int().nonnegative(),
    inventoriesVerified: z.literal(6),
    artifactsVerified: z.number().int().nonnegative(),
    portableSemanticSha256: Sha256Schema,
  }).strict(),
  sourceBlockers: z.array(SourceBlockerSchema).min(1),
  transforms: z.object({
    registrations: z.array(TransformRegistrationSchema).length(6),
    cases: z.array(TransformCaseSchema).length(36),
    totals: z.object({
      derivedInputs: z.literal(36),
      applicable: z.number().int().nonnegative(),
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      notApplicable: z.number().int().nonnegative(),
      independentRealSamplesAdded: z.literal(0),
    }).strict(),
  }).strict(),
  faultDetection: z.object({
    fixtureClass: z.literal("deterministic-synthetic-checker-and-verifier-fixtures"),
    countsAsRealSuccess: z.literal(false),
    cases: z.array(FaultCaseSchema).length(9),
    totals: z.object({ injected: z.literal(9), detected: z.number().int().nonnegative(), missed: z.number().int().nonnegative() }).strict(),
  }).strict(),
  cleanReproduction: CleanReproductionSchema,
  gates: z.object({
    task1Evidence: z.literal("pass"),
    metamorphicRelations: z.enum(["pass", "fail"]),
    faultDetection: z.enum(["pass", "fail"]),
    cleanReproduction: z.enum(["pass", "fail"]),
    implementationCorrectness: z.enum(["pass", "fail"]),
    sourceCorrectness: z.literal("blocked"),
    boundedReliability: z.enum(["pass", "fail"]),
  }).strict(),
  accounting: z.object({
    runtime: z.object({
      modelCalls: z.literal(0),
      apiCalls: z.literal(0),
      paidCalls: z.literal(0),
      wallClockMillis: z.number().int().nonnegative(),
      sourceBytesRead: z.number().int().nonnegative(),
    }).strict(),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    separate: z.literal(true),
  }).strict(),
  protectedBoundary: z.object({
    frozenWholeDocumentRealAccepted: z.literal(0),
    changesFrozenHistory: z.literal(false),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    secondProfiles: z.literal(0),
    q4Runs: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
    claimsEcosystemAdmission: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
  portableSemanticSha256: Sha256Schema,
}).strict().superRefine((report, context) => {
  if (JSON.stringify(report.transforms.registrations) !== JSON.stringify(API_TESTER_OPERATION_TRANSFORM_REGISTRY)) {
    context.addIssue({
      code: "custom",
      path: ["transforms", "registrations"],
      message: "transform registrations drifted from the implementation registry",
    });
  }
  const transformKeys = report.transforms.cases.map((entry) => `${entry.rowId}:${entry.type}`);
  const expectedKeys = EXPECTED_ROWS.flatMap((rowId) => EXPECTED_TRANSFORMS.map((type) => `${rowId}:${type}`));
  const applicable = report.transforms.cases.filter((entry) => entry.applicability === "applicable");
  const passed = report.transforms.cases.filter((entry) => entry.status === "pass");
  const failed = report.transforms.cases.filter((entry) => entry.status === "fail");
  const notApplicable = report.transforms.cases.filter((entry) => entry.status === "not-applicable");
  if (JSON.stringify(transformKeys) !== JSON.stringify(expectedKeys)
    || new Set(transformKeys).size !== transformKeys.length) {
    context.addIssue({ code: "custom", path: ["transforms", "cases"], message: "transform cases must cover the exact six-by-six matrix" });
  }
  if (applicable.length !== report.transforms.totals.applicable
    || passed.length !== report.transforms.totals.passed
    || failed.length !== report.transforms.totals.failed
    || notApplicable.length !== report.transforms.totals.notApplicable
    || applicable.length + notApplicable.length !== 36
    || passed.length + failed.length !== applicable.length) {
    context.addIssue({ code: "custom", path: ["transforms", "totals"], message: "transform denominators drifted" });
  }
  report.transforms.cases.forEach((entry, index) => {
    const registration = API_TESTER_OPERATION_TRANSFORM_REGISTRY.find((candidate) => candidate.type === entry.type);
    if (!registration || JSON.stringify(entry.comparisonFields) !== JSON.stringify(registration.comparisonFields)) {
      context.addIssue({
        code: "custom",
        path: ["transforms", "cases", index, "comparisonFields"],
        message: "transform comparison fields drifted from the implementation registry",
      });
    }
    if (entry.applicability === "applicable") {
      if (entry.status === "not-applicable" || entry.reason !== null
        || entry.derivedSha256 === null || entry.derivedFormat === null
        || (entry.status === "pass" && entry.errors.length !== 0)
        || (entry.status === "fail" && entry.errors.length === 0)) {
        context.addIssue({
          code: "custom",
          path: ["transforms", "cases", index],
          message: "applicable transform state is internally inconsistent",
        });
      }
    } else if (entry.status !== "not-applicable" || entry.reason === null
      || entry.derivedSha256 !== null || entry.derivedFormat !== null || entry.errors.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["transforms", "cases", index],
        message: "not-applicable transform state is internally inconsistent",
      });
    }
  });
  const detected = report.faultDetection.cases.filter((entry) => entry.detected).length;
  const faultMappings = report.faultDetection.cases.map(({ fault, detectorLayer, code }) => ({ fault, detectorLayer, code }));
  if (JSON.stringify(faultMappings) !== JSON.stringify(API_TESTER_OPERATION_FAULT_EXPECTATIONS)
    || detected !== report.faultDetection.totals.detected
    || 9 - detected !== report.faultDetection.totals.missed) {
    context.addIssue({ code: "custom", path: ["faultDetection"], message: "fault denominators drifted" });
  }
  const boundedPass = report.transforms.totals.failed === 0
    && report.faultDetection.totals.missed === 0
    && report.cleanReproduction.status === "pass";
  if ((report.gates.metamorphicRelations === "pass") !== (report.transforms.totals.failed === 0)
    || (report.gates.faultDetection === "pass") !== (report.faultDetection.totals.missed === 0)
    || report.gates.cleanReproduction !== "pass"
    || (report.gates.boundedReliability === "pass") !== boundedPass
    || (report.gates.implementationCorrectness === "pass") !== boundedPass) {
    context.addIssue({ code: "custom", path: ["gates"], message: "Task 2 gates drifted from their evidence" });
  }
});

export type ApiTesterOperationValidationDevelopmentReport = z.infer<
  typeof ApiTesterOperationValidationDevelopmentReportSchema
>;

export const ApiTesterOperationCombinedReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-combined-report/v1"),
  identity: z.literal(API_TESTER_OPERATION_COMBINED_IDENTITY),
  status: z.literal("completed-with-source-blocker"),
  completedAt: z.string().datetime(),
  task1: z.object({
    status: z.literal("completed-with-source-blocker"),
    commit: CommitSchema,
    report: DigestPathSchema,
    portableSemanticSha256: Sha256Schema,
    documents: z.literal(6),
    operations: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().positive(),
    checked: z.number().int().nonnegative(),
  }).strict(),
  task2: z.object({
    status: z.literal("passed"),
    branch: z.literal("real-positive"),
    report: DigestPathSchema,
    portableSemanticSha256: Sha256Schema,
    transforms: z.object({ derivedInputs: z.literal(36), applicable: z.number().int(), passed: z.number().int(), notApplicable: z.number().int() }).strict(),
    faults: z.object({ injected: z.literal(9), detected: z.literal(9) }).strict(),
    cleanReproduction: z.literal("pass"),
  }).strict(),
  remainingIssues: z.array(SourceBlockerSchema).min(1),
  accounting: z.object({
    runtimeModelCalls: z.literal(0),
    runtimeApiCalls: z.literal(0),
    runtimePaidCalls: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    developmentSeparateFromRuntime: z.literal(true),
  }).strict(),
  protectedBoundary: z.object({
    frozenWholeDocumentRealAccepted: z.literal(0),
    changesFrozenHistory: z.literal(false),
    derivedInputsAreIndependentSamples: z.literal(false),
    syntheticFaultFixturesCountAsRealSuccess: z.literal(false),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
    claimsEcosystemAdmission: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
  portableSemanticSha256: Sha256Schema,
}).strict();

export type ApiTesterOperationCombinedReport = z.infer<typeof ApiTesterOperationCombinedReportSchema>;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

async function readDigestBound(rootDir: string, reference: { path: string; sha256: string }, label: string) {
  const bytes = await readRegularFile(contained(rootDir, reference.path, label), label);
  if (sha256(bytes) !== reference.sha256) throw new Error(`${label} digest drift`);
  return bytes;
}

async function runProcess(command: string, args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 30_000);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

function portableValidationDigest(
  report: Omit<ApiTesterOperationValidationDevelopmentReport, "portableSemanticSha256">,
): string {
  return sha256(jsonText({
    ...report,
    completedAt: "<excluded>",
    accounting: { ...report.accounting, runtime: { ...report.accounting.runtime, wallClockMillis: 0 } },
    cleanReproduction: {
      ...report.cleanReproduction,
      run: { ...report.cleanReproduction.run, report: { ...report.cleanReproduction.run.report, sha256: "<excluded>" } },
      environment: { platform: "<excluded>", release: "<excluded>", arch: "<excluded>", bunVersion: "<excluded>", nodeVersion: "<excluded>" },
    },
  }));
}

function portableCombinedDigest(report: Omit<ApiTesterOperationCombinedReport, "portableSemanticSha256">): string {
  return sha256(jsonText({ ...report, completedAt: "<excluded>" }));
}

function evidenceDigests(report: z.infer<typeof ApiTesterOperationDevelopmentReportSchema>) {
  return report.documents.map((document) => ({
    rowId: document.rowId,
    inventorySha256: document.inventory.sha256,
    artifact: document.artifact.evidence,
  }));
}

async function packageVersion(root: string, name: string): Promise<{ name: string; version: string }> {
  const value = JSON.parse(await readRegularFile(join(root, "node_modules", name, "package.json"), `installed ${name} package`).then((bytes) => bytes.toString("utf8")));
  if (!value || value.name !== name || typeof value.version !== "string") throw new Error(`installed ${name} package identity drift`);
  return { name, version: value.version };
}

async function sourceBlockers(
  rootDir: string,
  reportPath: string,
  report: z.infer<typeof ApiTesterOperationDevelopmentReportSchema>,
) {
  const blockers: z.infer<typeof SourceBlockerSchema>[] = [];
  const reportRoot = dirname(contained(rootDir, reportPath, "Task 1 report"));
  for (const document of report.documents) {
    const bytes = await readDigestBound(reportRoot, document.inventory, `Task 1 inventory ${document.rowId}`);
    const inventory = JSON.parse(bytes.toString("utf8")) as {
      operations?: Array<{
        source?: { key?: unknown };
        admission?: { status?: unknown; findings?: Array<{ code?: unknown; locator?: unknown; message?: unknown }> } | null;
      }>;
    };
    for (const operation of inventory.operations ?? []) {
      if (operation.admission?.status !== "unresolved") continue;
      const finding = operation.admission.findings?.find((entry) =>
        typeof entry.code === "string" && typeof entry.locator === "string" && typeof entry.message === "string");
      if (typeof operation.source?.key !== "string" || !finding) throw new Error(`unresolved inventory row lacks evidence: ${document.rowId}`);
      blockers.push(SourceBlockerSchema.parse({
        kind: "source-dependency",
        rowId: document.rowId,
        operationKey: operation.source.key,
        locator: finding.locator,
        code: finding.code,
        message: finding.message,
        disposition: "excluded-from-accepted-set-no-semantic-guess",
      }));
    }
  }
  return blockers;
}

export async function runApiTesterOperationValidationDevelopment(options: {
  rootDir: string;
  cacheRoot: string;
  cleanRoot: string;
  nodeExecutable: string;
  gitExecutable: string;
  validationOutputRoot?: string;
  combinedOutputRoot?: string;
  completedAt?: string;
}): Promise<{ validation: ApiTesterOperationValidationDevelopmentReport; combined: ApiTesterOperationCombinedReport }> {
  const started = performance.now();
  const rootDir = resolve(options.rootDir);
  const cacheRoot = resolve(options.cacheRoot);
  const cleanRoot = resolve(options.cleanRoot);
  const contractPath = contained(rootDir, API_TESTER_OPERATION_VALIDATION_CONTRACT_PATH, "validation contract");
  const contractBytes = await readRegularFile(contractPath, "validation contract");
  const contract = ApiTesterOperationValidationContractSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  const task1Bytes = await readDigestBound(rootDir, contract.task1.report, "Task 1 report");
  const task1 = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(task1Bytes.toString("utf8")));
  const task1Verified = await verifyApiTesterOperationDevelopmentReport({ rootDir, cacheRoot });
  if (task1.portableSemanticSha256 !== contract.task1.report.portableSemanticSha256
    || selectApiTesterOperationValidationBranch(task1) !== "real-positive") {
    throw new Error("Task 1 evidence did not select the preregistered real-positive branch");
  }
  const blockers = await sourceBlockers(rootDir, contract.task1.report.path, task1);
  if (blockers.length === 0) throw new Error("Task 1 report no longer contains its explicit source blocker");

  const selectionBytes = await readDigestBound(rootDir, task1.inputs.selection, "Task 1 source selection");
  const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  const transformCases: z.infer<typeof TransformCaseSchema>[] = [];
  let sourceBytesRead = 0;
  for (const source of selection.selected) {
    const sourceBytes = await readRegularFile(contained(cacheRoot, source.cachePath, `source ${source.rowId}`), `source ${source.rowId}`);
    if (sourceBytes.byteLength !== source.bytes || sha256(sourceBytes) !== source.sha256) {
      throw new Error(`source bytes drifted before Task 2 transforms: ${source.rowId}`);
    }
    sourceBytesRead += sourceBytes.byteLength;
    const sourceText = sourceBytes.toString("utf8");
    for (const registration of API_TESTER_OPERATION_TRANSFORM_REGISTRY) {
      transformCases.push(TransformCaseSchema.parse({
        rowId: source.rowId,
        ...evaluateApiTesterOperationTransform({ sourceText, format: source.format, type: registration.type }),
      }));
    }
  }
  const applicable = transformCases.filter((entry) => entry.applicability === "applicable").length;
  const passed = transformCases.filter((entry) => entry.status === "pass").length;
  const failed = transformCases.filter((entry) => entry.status === "fail").length;
  const notApplicable = transformCases.filter((entry) => entry.status === "not-applicable").length;
  const faults = await runApiTesterOperationFaultDetection({
    nodeExecutable: options.nodeExecutable,
    fixtureRoot: join(rootDir, "src", "skill-ir", "fixtures", "api-tester-production-v2", "local-ref-arrays"),
  });
  const detected = faults.filter((entry) => entry.detected).length;

  const [cleanHead, cleanBranch, cleanDiff, cleanStatus, nodeVersion] = await Promise.all([
    runProcess(options.gitExecutable, ["-c", `safe.directory=${cleanRoot.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], cleanRoot),
    runProcess(options.gitExecutable, ["-c", `safe.directory=${cleanRoot.replaceAll("\\", "/")}`, "branch", "--show-current"], cleanRoot),
    runProcess(options.gitExecutable, ["-c", `safe.directory=${cleanRoot.replaceAll("\\", "/")}`, "diff", "--quiet", "HEAD", "--"], cleanRoot),
    runProcess(options.gitExecutable, ["-c", `safe.directory=${cleanRoot.replaceAll("\\", "/")}`, "status", "--porcelain=v1"], cleanRoot),
    runProcess(options.nodeExecutable, ["--version"], cleanRoot),
  ]);
  const expectedUntrackedPrefix = `?? ${contract.cleanReproduction.reportPath.slice(0, contract.cleanReproduction.reportPath.lastIndexOf("/report.json"))}/`;
  const statusLines = cleanStatus.stdout.split(/\r?\n/u).filter(Boolean);
  if (cleanHead.exitCode !== 0 || cleanHead.stdout.trim() !== contract.task1.commit
    || cleanBranch.exitCode !== 0 || cleanBranch.stdout.trim() !== ""
    || cleanDiff.exitCode !== 0 || cleanStatus.exitCode !== 0
    || statusLines.some((line) => line !== expectedUntrackedPrefix)
    || nodeVersion.exitCode !== 0) {
    throw new Error("clean reproduction checkout identity or cleanliness drifted");
  }
  const cleanVerified = await verifyApiTesterOperationDevelopmentReport({
    rootDir: cleanRoot,
    reportPath: contract.cleanReproduction.reportPath,
    cacheRoot,
  });
  const cleanReportPath = contained(cleanRoot, contract.cleanReproduction.reportPath, "clean Task 1 report");
  const cleanReportBytes = await readRegularFile(cleanReportPath, "clean Task 1 report");
  const cleanTask1 = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(cleanReportBytes.toString("utf8")));
  const cleanComparison = {
    portableSemanticDigestEqual: cleanTask1.portableSemanticSha256 === task1.portableSemanticSha256,
    totalsEqual: JSON.stringify(cleanTask1.totals) === JSON.stringify(task1.totals),
    gatesEqual: JSON.stringify(cleanTask1.gates) === JSON.stringify(task1.gates),
    obligationsEqual: JSON.stringify(cleanTask1.obligationCoverage) === JSON.stringify(task1.obligationCoverage),
    inventoryAndArtifactDigestsEqual: JSON.stringify(evidenceDigests(cleanTask1)) === JSON.stringify(evidenceDigests(task1)),
  } as const;
  if (Object.values(cleanComparison).some((value) => !value)
    || cleanVerified.portableSemanticSha256 !== task1.portableSemanticSha256) {
    throw new Error("clean reproduction semantic evidence drifted from Task 1");
  }
  const cleanLockBytes = await readRegularFile(join(cleanRoot, "bun.lock"), "clean bun.lock");
  if (sha256(cleanLockBytes) !== contract.cleanReproduction.bunLockSha256) throw new Error("clean bun.lock digest drift");
  const installedPackages = await Promise.all([packageVersion(cleanRoot, "yaml"), packageVersion(cleanRoot, "zod")]);
  const cleanReproduction = CleanReproductionSchema.parse({
    status: "pass",
    checkout: {
      commit: cleanHead.stdout.trim(),
      detached: true,
      trackedChanges: 0,
      onlyExpectedResultUntracked: true,
      locationClass: "project-local-ignored-worktree",
    },
    install: {
      command: contract.cleanReproduction.installCommand,
      status: "pass",
      bunLockSha256: contract.cleanReproduction.bunLockSha256,
      networkAllowed: false,
      installedPackages,
    },
    run: {
      command: contract.cleanReproduction.task1Command,
      report: { path: contract.cleanReproduction.reportPath, sha256: sha256(cleanReportBytes) },
      strictVerification: "pass",
    },
    comparison: cleanComparison,
    environment: {
      platform: platform(),
      release: release(),
      arch: arch(),
      bunVersion: Bun.version,
      nodeVersion: nodeVersion.stdout.trim(),
    },
  });

  const completedAt = options.completedAt ?? new Date().toISOString();
  const validationWithoutDigest: Omit<ApiTesterOperationValidationDevelopmentReport, "portableSemanticSha256"> = {
    schemaVersion: "skill-ir-api-tester-operation-validation-development-report/v1",
    identity: API_TESTER_OPERATION_VALIDATION_IDENTITY,
    status: "completed-with-source-blocker",
    completedAt,
    inputs: {
      contract: { path: API_TESTER_OPERATION_VALIDATION_CONTRACT_PATH, sha256: sha256(contractBytes) },
      task1: {
        commit: contract.task1.commit,
        report: { path: contract.task1.report.path, sha256: contract.task1.report.sha256 },
        portableSemanticSha256: contract.task1.report.portableSemanticSha256,
      },
    },
    branch: "real-positive",
    task1Verification: {
      ...task1Verified,
      inventoriesVerified: z.literal(6).parse(task1Verified.inventoriesVerified),
    },
    sourceBlockers: blockers,
    transforms: {
      registrations: API_TESTER_OPERATION_TRANSFORM_REGISTRY,
      cases: transformCases,
      totals: { derivedInputs: 36, applicable, passed, failed, notApplicable, independentRealSamplesAdded: 0 },
    },
    faultDetection: {
      fixtureClass: "deterministic-synthetic-checker-and-verifier-fixtures",
      countsAsRealSuccess: false,
      cases: faults,
      totals: { injected: 9, detected, missed: 9 - detected },
    },
    cleanReproduction,
    gates: {
      task1Evidence: "pass",
      metamorphicRelations: failed === 0 ? "pass" : "fail",
      faultDetection: detected === 9 ? "pass" : "fail",
      cleanReproduction: "pass",
      implementationCorrectness: failed === 0 && detected === 9 ? "pass" : "fail",
      sourceCorrectness: "blocked",
      boundedReliability: failed === 0 && detected === 9 ? "pass" : "fail",
    },
    accounting: {
      runtime: {
        modelCalls: 0,
        apiCalls: 0,
        paidCalls: 0,
        wallClockMillis: Math.max(0, Math.round(performance.now() - started)),
        sourceBytesRead,
      },
      developmentAgentUsage: "host-external-not-measured-by-runner",
      separate: true,
    },
    protectedBoundary: {
      frozenWholeDocumentRealAccepted: 0,
      changesFrozenHistory: false,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      q1ReservedAccesses: 0,
      secondProfiles: 0,
      q4Runs: 0,
      readinessChanges: 0,
      claimsHumanSavings: false,
      claimsEcosystemAdmission: false,
    },
    claimBoundary: "This development result validates representation invariance, named fault detection, and clean offline reproduction for the Task 1 bounded operation pipeline. The 36 derivatives are not independent real samples, synthetic fault fixtures do not count as real successes, one source dependency remains unresolved, and no whole-document, arbitrary OpenAPI, real API behavior, human-savings, ecosystem-admission, held-out, cross-profile, or readiness claim is made.",
  };
  const validation = ApiTesterOperationValidationDevelopmentReportSchema.parse({
    ...validationWithoutDigest,
    portableSemanticSha256: portableValidationDigest(validationWithoutDigest),
  });

  const validationOutputRoot = resolve(options.validationOutputRoot
    ?? contained(rootDir, contract.output.validationPath, "validation output"));
  const combinedOutputRoot = resolve(options.combinedOutputRoot
    ?? contained(rootDir, contract.output.combinedPath, "combined output"));
  await Promise.all([mkdir(validationOutputRoot, { recursive: false }), mkdir(combinedOutputRoot, { recursive: false })]);
  const validationText = jsonText(validation);
  await writeFile(join(validationOutputRoot, contract.output.validationReport), validationText, { encoding: "utf8", flag: "wx" });

  const combinedWithoutDigest: Omit<ApiTesterOperationCombinedReport, "portableSemanticSha256"> = {
    schemaVersion: "skill-ir-api-tester-operation-combined-report/v1",
    identity: API_TESTER_OPERATION_COMBINED_IDENTITY,
    status: "completed-with-source-blocker",
    completedAt,
    task1: {
      status: "completed-with-source-blocker",
      commit: contract.task1.commit,
      report: { path: contract.task1.report.path, sha256: contract.task1.report.sha256 },
      portableSemanticSha256: task1.portableSemanticSha256,
      documents: 6,
      operations: task1.totals.operations,
      accepted: task1.totals.accepted,
      rejected: task1.totals.rejected,
      unresolved: task1.totals.unresolved,
      checked: task1.totals.artifactCheckedPassedOperations,
    },
    task2: {
      status: "passed",
      branch: "real-positive",
      report: { path: API_TESTER_OPERATION_VALIDATION_REPORT_PATH, sha256: sha256(validationText) },
      portableSemanticSha256: validation.portableSemanticSha256,
      transforms: { derivedInputs: 36, applicable, passed, notApplicable },
      faults: { injected: 9, detected: detected as 9 },
      cleanReproduction: "pass",
    },
    remainingIssues: blockers,
    accounting: {
      runtimeModelCalls: 0,
      runtimeApiCalls: 0,
      runtimePaidCalls: 0,
      developmentAgentUsage: "host-external-not-measured-by-runner",
      developmentSeparateFromRuntime: true,
    },
    protectedBoundary: {
      frozenWholeDocumentRealAccepted: 0,
      changesFrozenHistory: false,
      derivedInputsAreIndependentSamples: false,
      syntheticFaultFixturesCountAsRealSuccess: false,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      readinessChanges: 0,
      claimsHumanSavings: false,
      claimsEcosystemAdmission: false,
    },
    claimBoundary: "Task 1 and Task 2 are complete as bounded development evidence, with one explicitly retained source-dependency blocker. Local operation success and validation do not change the frozen whole-document 0/6 or establish arbitrary OpenAPI, real API behavior, human savings, ecosystem admission, held-out, cross-profile, or readiness claims.",
  };
  const combined = ApiTesterOperationCombinedReportSchema.parse({
    ...combinedWithoutDigest,
    portableSemanticSha256: portableCombinedDigest(combinedWithoutDigest),
  });
  await writeFile(join(combinedOutputRoot, contract.output.combinedReport), jsonText(combined), { encoding: "utf8", flag: "wx" });
  return { validation, combined };
}

export async function verifyApiTesterOperationValidationDevelopmentReport(options: {
  rootDir: string;
  cacheRoot?: string;
  nodeExecutable?: string;
  cleanRoot?: string;
}): Promise<{
  status: "verified";
  branch: "real-positive";
  derivedInputs: number;
  applicable: number;
  passed: number;
  notApplicable: number;
  faults: number;
  faultsDetected: number;
  cleanReproduction: "pass";
  task1PortableSemanticSha256: string;
}> {
  const rootDir = resolve(options.rootDir);
  const reportBytes = await readRegularFile(contained(rootDir, API_TESTER_OPERATION_VALIDATION_REPORT_PATH, "Task 2 report"), "Task 2 report");
  const report = ApiTesterOperationValidationDevelopmentReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
  const { portableSemanticSha256, ...withoutDigest } = report;
  if (portableValidationDigest(withoutDigest) !== portableSemanticSha256) throw new Error("Task 2 portable semantic digest drift");
  const contractBytes = await readDigestBound(rootDir, report.inputs.contract, "Task 2 contract");
  const contract = ApiTesterOperationValidationContractSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  if (report.inputs.task1.commit !== contract.task1.commit
    || report.inputs.task1.report.path !== contract.task1.report.path
    || report.inputs.task1.report.sha256 !== contract.task1.report.sha256
    || report.inputs.task1.portableSemanticSha256 !== contract.task1.report.portableSemanticSha256) {
    throw new Error("Task 2 Task 1 binding drift");
  }
  await readDigestBound(rootDir, report.inputs.task1.report, "Task 1 report from Task 2");
  const task1Verified = await verifyApiTesterOperationDevelopmentReport({ rootDir, ...(options.cacheRoot ? { cacheRoot: options.cacheRoot } : {}) });
  if (task1Verified.portableSemanticSha256 !== report.task1Verification.portableSemanticSha256) {
    throw new Error("Task 2 Task 1 verification drift");
  }
  if (options.cacheRoot) {
    const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(
      await readFile(contained(rootDir, "benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-001/source-selection.json", "selection"), "utf8"),
    ));
    const replayed: z.infer<typeof TransformCaseSchema>[] = [];
    for (const source of selection.selected) {
      const sourceText = await readFile(contained(resolve(options.cacheRoot), source.cachePath, `source ${source.rowId}`), "utf8");
      for (const registration of API_TESTER_OPERATION_TRANSFORM_REGISTRY) {
        replayed.push(TransformCaseSchema.parse({
          rowId: source.rowId,
          ...evaluateApiTesterOperationTransform({ sourceText, format: source.format, type: registration.type }),
        }));
      }
    }
    if (JSON.stringify(replayed) !== JSON.stringify(report.transforms.cases)) throw new Error("Task 2 transform replay drift");
  }
  if (options.nodeExecutable) {
    const replayedFaults = await runApiTesterOperationFaultDetection({
      nodeExecutable: options.nodeExecutable,
      fixtureRoot: join(rootDir, "src", "skill-ir", "fixtures", "api-tester-production-v2", "local-ref-arrays"),
    });
    if (JSON.stringify(replayedFaults) !== JSON.stringify(report.faultDetection.cases)) throw new Error("Task 2 fault replay drift");
  }
  if (options.cleanRoot) {
    const cleanVerified = await verifyApiTesterOperationDevelopmentReport({
      rootDir: options.cleanRoot,
      reportPath: contract.cleanReproduction.reportPath,
      ...(options.cacheRoot ? { cacheRoot: options.cacheRoot } : {}),
    });
    const cleanBytes = await readRegularFile(contained(options.cleanRoot, contract.cleanReproduction.reportPath, "clean report"), "clean report");
    if (sha256(cleanBytes) !== report.cleanReproduction.run.report.sha256
      || cleanVerified.portableSemanticSha256 !== report.inputs.task1.portableSemanticSha256) {
      throw new Error("Task 2 clean reproduction replay drift");
    }
  }
  const combinedBytes = await readRegularFile(contained(rootDir, API_TESTER_OPERATION_COMBINED_REPORT_PATH, "combined report"), "combined report");
  const combined = ApiTesterOperationCombinedReportSchema.parse(JSON.parse(combinedBytes.toString("utf8")));
  const { portableSemanticSha256: combinedDigest, ...combinedWithoutDigest } = combined;
  if (portableCombinedDigest(combinedWithoutDigest) !== combinedDigest
    || combined.task2.report.sha256 !== sha256(reportBytes)
    || combined.task2.portableSemanticSha256 !== report.portableSemanticSha256) {
    throw new Error("combined report digest closure drift");
  }
  return {
    status: "verified",
    branch: report.branch,
    derivedInputs: report.transforms.totals.derivedInputs,
    applicable: report.transforms.totals.applicable,
    passed: report.transforms.totals.passed,
    notApplicable: report.transforms.totals.notApplicable,
    faults: report.faultDetection.totals.injected,
    faultsDetected: report.faultDetection.totals.detected,
    cleanReproduction: report.cleanReproduction.status,
    task1PortableSemanticSha256: report.inputs.task1.portableSemanticSha256,
  };
}
