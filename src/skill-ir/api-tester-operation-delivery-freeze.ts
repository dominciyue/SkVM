import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema, parseSafeRelativePath } from "../benchmarks/skill-ir/artifact-package";
import { API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2 } from "./api-tester-production-contract-v2";
import {
  ApiTesterV2FeatureMigrationSelectionSchema,
} from "../benchmarks/skill-ir/api-tester-v2-feature-migration";
import { ApiTesterOperationDevelopmentReportSchema } from "./api-tester-operation-development";
import { ApiTesterOperationDependencyRevisionReportSchema } from "./api-tester-operation-dependency-verification-revision";
import {
  ApiTesterOperationInputInventorySchema,
  ApiTesterOperationInputManifestSchema,
  ApiTesterOperationInputReportSchema,
  runApiTesterOperationInput,
  verifyApiTesterOperationInputOutput,
} from "./api-tester-operation-input";

export const API_TESTER_OPERATION_CANDIDATE_IDENTITY =
  "skill-ir-api-tester-operation-candidate-001" as const;
export const API_TESTER_OPERATION_CANDIDATE_PATH =
  "benchmarks/skill-ir/classification/api-tester-operation-candidate-v1.json" as const;
export const API_TESTER_OPERATION_DELIVERY_IDENTITY =
  "skill-ir-api-tester-operation-delivery-freeze-development-001" as const;
export const API_TESTER_OPERATION_DELIVERY_ROOT =
  "results/skill-ir/api-tester-operation-delivery-freeze-development-001" as const;
export const API_TESTER_OPERATION_DELIVERY_MAIN_ROOT =
  `${API_TESTER_OPERATION_DELIVERY_ROOT}/main` as const;
export const API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT =
  `${API_TESTER_OPERATION_DELIVERY_ROOT}/clean` as const;

const ROW_IDS = [
  "real-opengrok-api",
  "real-box-openapi",
  "real-meilisearch-api",
  "real-bangumi-api",
  "real-deepl-openapi",
  "real-hfs-openapi",
] as const;

const SOURCE_SELECTION_PATH =
  "benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-001/source-selection.json" as const;
const BASELINE_REVISION_PATH =
  "results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json" as const;

const IMPLEMENTATION_FILES = [
  { role: "ordinary-entry", path: "src/skill-ir/api-tester-operation-input.ts" },
  { role: "ordinary-cli", path: "src/skill-ir/api-tester-operation-input-run.ts" },
  { role: "source-enumeration-projection", path: "src/skill-ir/api-tester-operation-source.ts" },
  { role: "operation-admission", path: "src/skill-ir/api-tester-operation-admission.ts" },
  { role: "independent-coverage-dependency", path: "src/skill-ir/api-tester-operation-coverage.ts" },
  { role: "v2-support-contract", path: "src/skill-ir/api-tester-production-contract-v2.ts" },
  { role: "v2-generator-checker", path: "src/skill-ir/api-tester-production-programs-v2.ts" },
  { role: "v2-artifact-runner", path: "src/skill-ir/api-tester-production-artifact-v2.ts" },
  { role: "safe-path-contract", path: "src/benchmarks/skill-ir/artifact-package.ts" },
] as const;

const DigestRefSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();
const SizedDigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().positive(),
}).strict();

export const ApiTesterOperationCandidateSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-candidate/v1"),
  identity: z.literal(API_TESTER_OPERATION_CANDIDATE_IDENTITY),
  frozenAt: z.string().datetime(),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  entry: z.object({
    cli: z.literal("src/skill-ir/api-tester-operation-input-run.ts"),
    library: z.literal("src/skill-ir/api-tester-operation-input.ts"),
    invocation: z.literal("--root=<input-root> --manifest=<manifest.json> --node=<node>"),
    manifestSchemaVersion: z.literal("skill-ir-api-tester-operation-input-manifest/v1"),
    outputVerifier: z.literal("verifyApiTesterOperationInputOutput"),
  }).strict(),
  implementation: z.array(z.object({
    role: z.enum(IMPLEMENTATION_FILES.map((file) => file.role)),
    path: SafeRelativePathSchema,
    sha256: Sha256Schema,
  }).strict()).length(IMPLEMENTATION_FILES.length),
  dependencies: z.object({
    package: DigestRefSchema,
    lock: DigestRefSchema,
  }).strict(),
  validation: z.object({
    report: DigestRefSchema,
    archiveManifest: DigestRefSchema,
    portableSemanticSha256: Sha256Schema,
  }).strict(),
  historicalEvidence: z.object({
    task1: DigestRefSchema,
    task2: DigestRefSchema,
    dependencyRevision: DigestRefSchema,
  }).strict(),
  runtime: z.object({
    bun: z.literal("1.3.14"),
    node: z.literal("v23.8.0"),
  }).strict(),
  sourceValidityPolicy: z.object({
    missingConstructionReference: z.literal("block-affected-operation-without-guessing"),
    externalResponseReference: z.literal("retain-source-validity-advisory"),
  }).strict(),
  claimPolicy: z.object({
    localOperationPassIsDocumentPass: z.literal(false),
    localOperationPassIsLiveApiProof: z.literal(false),
    frozenWholeDocumentRealAccepted: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
  }).strict(),
  prospective: z.object({
    inputSelection: z.literal("not-started"),
    predictions: z.literal("not-authored"),
    prospectiveRuns: z.literal(0),
    rows: z.tuple([]),
    rowPredictions: z.tuple([]),
  }).strict(),
}).strict().superRefine((candidate, context) => {
  const paths = candidate.implementation.map((file) => file.path);
  const expectedPaths = IMPLEMENTATION_FILES.map((file) => file.path);
  if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) {
    context.addIssue({ code: "custom", path: ["implementation"], message: "candidate implementation closure or order drifted" });
  }
  if (candidate.implementation.some((file, index) => file.role !== IMPLEMENTATION_FILES[index]?.role)) {
    context.addIssue({ code: "custom", path: ["implementation"], message: "candidate implementation role drifted" });
  }
});

export type ApiTesterOperationCandidate = z.infer<typeof ApiTesterOperationCandidateSchema>;

const RowComparisonSchema = z.object({
  operationUniverse: z.boolean(),
  admission: z.boolean(),
  dependencies: z.boolean(),
  checkerPass: z.boolean(),
  status: z.enum(["pass", "fail"]),
}).strict().superRefine((comparison, context) => {
  const pass = comparison.operationUniverse && comparison.admission && comparison.dependencies && comparison.checkerPass;
  if ((comparison.status === "pass") !== pass) {
    context.addIssue({ code: "custom", path: ["status"], message: "row comparison status drifted" });
  }
});

const DeliveryRowSchema = z.object({
  rowId: z.enum(ROW_IDS),
  format: z.enum(["json", "yaml"]),
  source: SizedDigestRefSchema,
  license: SizedDigestRefSchema,
  manifest: DigestRefSchema,
  outputManifest: DigestRefSchema,
  operationReport: z.object({
    path: SafeRelativePathSchema,
    sha256: Sha256Schema,
    portableSemanticSha256: Sha256Schema,
  }).strict(),
  totals: z.object({
    operations: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    checked: z.number().int().nonnegative(),
  }).strict(),
  sourceIssues: z.object({ blockers: z.number().int().nonnegative(), advisories: z.number().int().nonnegative() }).strict(),
  comparison: RowComparisonSchema,
}).strict().superRefine((row, context) => {
  if (row.totals.operations !== row.totals.accepted + row.totals.rejected + row.totals.unresolved) {
    context.addIssue({ code: "custom", path: ["totals"], message: "row operation totals drifted" });
  }
});

export const ApiTesterOperationDeliveryValidationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-delivery-validation-report/v1"),
  identity: z.literal(API_TESTER_OPERATION_DELIVERY_IDENTITY),
  status: z.enum(["passed-with-source-blocker", "failed"]),
  completedAt: z.string().datetime(),
  inputs: z.object({
    sourceSelection: DigestRefSchema,
    baselineRevision: z.object({
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
      runSemanticSha256: Sha256Schema,
    }).strict(),
  }).strict(),
  rows: z.array(DeliveryRowSchema).length(ROW_IDS.length),
  totals: z.object({
    documents: z.literal(6),
    operations: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    checked: z.number().int().nonnegative(),
    obligations: z.object({ total: z.number().int().nonnegative(), covered: z.number().int().nonnegative() }).strict(),
  }).strict(),
  retainedIssues: z.object({
    meilisearchMissingTotalReference: z.literal(true),
    bangumiExternalResponseAdvisoryOperations: z.literal(19),
  }).strict(),
  gates: z.object({
    sixSourceComparison: z.enum(["pass", "fail"]),
    strictOutputs: z.enum(["pass", "fail"]),
    implementationCorrectness: z.enum(["pass", "fail"]),
    sourceCorrectness: z.literal("blocked"),
  }).strict(),
  accounting: z.object({
    runtime: z.object({ modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    separate: z.literal(true),
  }).strict(),
  protectedBoundary: z.object({
    frozenWholeDocumentRealAccepted: z.literal(0),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
    claimsLiveApiBehavior: z.literal(false),
  }).strict(),
  portableSemanticSha256: Sha256Schema,
}).strict().superRefine((report, context) => {
  if (JSON.stringify(report.rows.map((row) => row.rowId)) !== JSON.stringify(ROW_IDS)) {
    context.addIssue({ code: "custom", path: ["rows"], message: "delivery rows must retain the exposed-source order" });
  }
  const sums = report.rows.reduce((total, row) => ({
    operations: total.operations + row.totals.operations,
    accepted: total.accepted + row.totals.accepted,
    rejected: total.rejected + row.totals.rejected,
    unresolved: total.unresolved + row.totals.unresolved,
    checked: total.checked + row.totals.checked,
  }), { operations: 0, accepted: 0, rejected: 0, unresolved: 0, checked: 0 });
  for (const key of Object.keys(sums) as Array<keyof typeof sums>) {
    if (sums[key] !== report.totals[key]) {
      context.addIssue({ code: "custom", path: ["totals", key], message: `delivery ${key} total drifted` });
    }
  }
  const comparisonsPass = report.rows.every((row) => row.comparison.status === "pass");
  if ((report.gates.sixSourceComparison === "pass") !== comparisonsPass
    || (report.gates.implementationCorrectness === "pass") !== (
      comparisonsPass && report.gates.strictOutputs === "pass" && report.totals.obligations.total === report.totals.obligations.covered
    )
    || (report.status === "passed-with-source-blocker") !== (report.gates.implementationCorrectness === "pass")) {
    context.addIssue({ code: "custom", path: ["gates"], message: "delivery validation gates drifted" });
  }
});

export type ApiTesterOperationDeliveryValidationReport = z.infer<
  typeof ApiTesterOperationDeliveryValidationReportSchema
>;

export const ApiTesterOperationArchiveManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-archive-manifest/v1"),
  archiveId: z.string().regex(/^[a-z][a-z0-9-]{0,95}$/u),
  files: z.array(DigestRefSchema).min(1),
}).strict().superRefine((manifest, context) => {
  const paths = manifest.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify([...paths].sort(compareText))) {
    context.addIssue({ code: "custom", path: ["files"], message: "archive paths must be unique and sorted" });
  }
  if (paths.includes("archive-manifest.json")) {
    context.addIssue({ code: "custom", path: ["files"], message: "archive manifest must not list itself" });
  }
});

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function pathWithin(parent: string, candidate: string): boolean {
  const local = relative(resolve(parent), resolve(candidate));
  return local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
}

function contained(rootDir: string, candidate: string, label: string): string {
  if (isAbsolute(candidate)) throw new Error(`${label} must be a safe relative path`);
  const safe = parseSafeRelativePath(portable(candidate));
  const root = resolve(rootDir);
  const absolute = resolve(root, safe);
  if (!pathWithin(root, absolute) || absolute === root) throw new Error(`${label} escapes its root`);
  return absolute;
}

async function readDigestRef(rootDir: string, path: string): Promise<{ path: string; sha256: string }> {
  const safe = parseSafeRelativePath(path);
  const bytes = await readFile(contained(rootDir, safe, `candidate input ${safe}`));
  return { path: safe, sha256: sha256(bytes) };
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
    const path = current ? `${current}/${entry.name}` : entry.name;
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw new Error(`archive contains a symbolic link: ${path}`);
    if (stat.isDirectory()) files.push(...await listFiles(root, path));
    else if (stat.isFile()) files.push(path);
    else throw new Error(`archive contains an unsupported entry: ${path}`);
  }
  return files.sort(compareText);
}

function stableOperationRows(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!isRecord(row) || !isRecord(row.source) || !isRecord(row.admission)) return row;
    return {
      source: {
        key: row.source.key,
        locator: row.source.locator,
        operationId: row.source.operationId,
        summary: row.source.summary,
      },
      admission: {
        operationKey: row.admission.operationKey,
        status: row.admission.status,
        findings: row.admission.findings,
        firstObservedRejection: row.admission.firstObservedRejection,
        normalizedOperation: row.admission.normalizedOperation,
      },
    };
  });
}

function stableDependencies(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!isRecord(row)) return row;
    return {
      operationKey: row.operationKey,
      status: row.status,
      checks: row.checks,
      dimensions: row.dimensions,
      sourceIssues: row.sourceIssues,
      projectedIssues: row.projectedIssues,
      errors: row.errors,
    };
  });
}

export function compareApiTesterOperationDeliveryRow(input: {
  baselineOperations: unknown[];
  currentOperations: unknown[];
  baselineDependencies: unknown[];
  currentDependencies: unknown[];
  baselineChecked: number;
  currentChecked: number;
}): z.infer<typeof RowComparisonSchema> {
  const baselineUniverse = stableOperationRows(input.baselineOperations).map((row) => {
    const value = row as { source: unknown };
    return value.source;
  });
  const currentUniverse = stableOperationRows(input.currentOperations).map((row) => {
    const value = row as { source: unknown };
    return value.source;
  });
  const operationUniverse = canonical(baselineUniverse) === canonical(currentUniverse);
  const admission = canonical(stableOperationRows(input.baselineOperations))
    === canonical(stableOperationRows(input.currentOperations));
  const dependencies = canonical(stableDependencies(input.baselineDependencies))
    === canonical(stableDependencies(input.currentDependencies));
  const checkerPass = input.baselineChecked === input.currentChecked;
  return RowComparisonSchema.parse({
    operationUniverse,
    admission,
    dependencies,
    checkerPass,
    status: operationUniverse && admission && dependencies && checkerPass ? "pass" : "fail",
  });
}

export function compareApiTesterOperationDeliveryTotals(
  actual: {
    operations: number;
    accepted: number;
    rejected: number;
    unresolved: number;
    checked: number;
    obligations: { total: number; covered: number };
  },
  expected: {
    operations: number;
    accepted: number;
    rejected: number;
    unresolved: number;
    checkerPassed: number;
    obligations: { total: number; covered: number };
  },
): boolean {
  return actual.operations === expected.operations
    && actual.accepted === expected.accepted
    && actual.rejected === expected.rejected
    && actual.unresolved === expected.unresolved
    && actual.checked === expected.checkerPassed
    && actual.obligations.total === expected.obligations.total
    && actual.obligations.covered === expected.obligations.covered;
}

export async function buildApiTesterOperationCandidate(options: {
  rootDir: string;
  frozenAt: string;
  bunVersion: string;
  nodeVersion: string;
  validation: { path: string };
}): Promise<ApiTesterOperationCandidate> {
  const rootDir = resolve(options.rootDir);
  const validationReportPath = parseSafeRelativePath(options.validation.path);
  const validationArchivePath = parseSafeRelativePath(portable(join(dirname(validationReportPath), "archive-manifest.json")));
  const validationReport = ApiTesterOperationDeliveryValidationReportSchema.parse(JSON.parse(
    await readFile(contained(rootDir, validationReportPath, "candidate validation report"), "utf8"),
  ));
  const implementation = await Promise.all(IMPLEMENTATION_FILES.map(async (file) => ({
    ...file,
    sha256: sha256(await readFile(contained(rootDir, file.path, `candidate implementation ${file.path}`))),
  })));
  return ApiTesterOperationCandidateSchema.parse({
    schemaVersion: "skill-ir-api-tester-operation-candidate/v1",
    identity: API_TESTER_OPERATION_CANDIDATE_IDENTITY,
    frozenAt: options.frozenAt,
    supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
    entry: {
      cli: "src/skill-ir/api-tester-operation-input-run.ts",
      library: "src/skill-ir/api-tester-operation-input.ts",
      invocation: "--root=<input-root> --manifest=<manifest.json> --node=<node>",
      manifestSchemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
      outputVerifier: "verifyApiTesterOperationInputOutput",
    },
    implementation,
    dependencies: {
      package: await readDigestRef(rootDir, "package.json"),
      lock: await readDigestRef(rootDir, "bun.lock"),
    },
    validation: {
      report: await readDigestRef(rootDir, validationReportPath),
      archiveManifest: await readDigestRef(rootDir, validationArchivePath),
      portableSemanticSha256: validationReport.portableSemanticSha256,
    },
    historicalEvidence: {
      task1: await readDigestRef(rootDir, "results/skill-ir/api-tester-operation-admission-development-001/report.json"),
      task2: await readDigestRef(rootDir, "results/skill-ir/api-tester-operation-validation-development-001/report.json"),
      dependencyRevision: await readDigestRef(rootDir, "results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json"),
    },
    runtime: { bun: options.bunVersion, node: options.nodeVersion },
    sourceValidityPolicy: {
      missingConstructionReference: "block-affected-operation-without-guessing",
      externalResponseReference: "retain-source-validity-advisory",
    },
    claimPolicy: {
      localOperationPassIsDocumentPass: false,
      localOperationPassIsLiveApiProof: false,
      frozenWholeDocumentRealAccepted: 0,
      readinessChanges: 0,
      claimsHumanSavings: false,
    },
    prospective: {
      inputSelection: "not-started",
      predictions: "not-authored",
      prospectiveRuns: 0,
      rows: [],
      rowPredictions: [],
    },
  });
}

export async function verifyApiTesterOperationCandidate(options: {
  rootDir: string;
  candidatePath: string;
  bunVersion: string;
  nodeVersion: string;
  nodeExecutable: string;
  gitExecutable: string;
}): Promise<{ status: "verified"; identity: typeof API_TESTER_OPERATION_CANDIDATE_IDENTITY; prospectiveRuns: 0; validationPortableSemanticSha256: string }> {
  const rootDir = resolve(options.rootDir);
  const candidate = ApiTesterOperationCandidateSchema.parse(JSON.parse(await readFile(
    contained(rootDir, options.candidatePath, "operation candidate"),
    "utf8",
  )));
  if (candidate.runtime.bun !== options.bunVersion || candidate.runtime.node !== options.nodeVersion) {
    throw new Error("operation candidate runtime mismatch");
  }
  const expected = await buildApiTesterOperationCandidate({
    rootDir,
    frozenAt: candidate.frozenAt,
    bunVersion: options.bunVersion,
    nodeVersion: options.nodeVersion,
    validation: { path: candidate.validation.report.path },
  });
  if (canonical(candidate) !== canonical(expected)) throw new Error("operation candidate closure mismatch");
  const validationArchiveRoot = dirname(contained(rootDir, candidate.validation.report.path, "candidate validation report"));
  await verifyApiTesterOperationArchiveGitClosure({
    rootDir,
    archiveRoot: validationArchiveRoot,
    gitExecutable: options.gitExecutable,
  });
  const validation = await verifyApiTesterOperationDeliveryValidation({
    rootDir,
    archiveRoot: validationArchiveRoot,
    nodeExecutable: options.nodeExecutable,
  });
  if (validation.portableSemanticSha256 !== candidate.validation.portableSemanticSha256) {
    throw new Error("operation candidate validation semantic mismatch");
  }
  return {
    status: "verified",
    identity: candidate.identity,
    prospectiveRuns: candidate.prospective.prospectiveRuns,
    validationPortableSemanticSha256: candidate.validation.portableSemanticSha256,
  };
}

export async function createApiTesterOperationArchiveManifest(options: {
  rootDir: string;
  archiveId: string;
}): Promise<z.infer<typeof ApiTesterOperationArchiveManifestSchema>> {
  const rootDir = resolve(options.rootDir);
  const files = (await listFiles(rootDir)).filter((path) => path !== "archive-manifest.json");
  return ApiTesterOperationArchiveManifestSchema.parse({
    schemaVersion: "skill-ir-api-tester-operation-archive-manifest/v1",
    archiveId: options.archiveId,
    files: await Promise.all(files.map(async (path) => ({ path, sha256: sha256(await readFile(join(rootDir, path))) }))),
  });
}

export async function verifyApiTesterOperationArchive(options: {
  rootDir: string;
}): Promise<{ status: "verified"; files: number; archiveId: string }> {
  const rootDir = resolve(options.rootDir);
  const manifest = ApiTesterOperationArchiveManifestSchema.parse(JSON.parse(
    await readFile(join(rootDir, "archive-manifest.json"), "utf8"),
  ));
  const actual = await listFiles(rootDir);
  const expected = [...manifest.files.map((file) => file.path), "archive-manifest.json"].sort(compareText);
  if (canonical(actual) !== canonical(expected)) {
    throw new Error(`archive closure mismatch: expected=${expected.join(",")} actual=${actual.join(",")}`);
  }
  for (const file of manifest.files) {
    if (sha256(await readFile(join(rootDir, file.path))) !== file.sha256) {
      throw new Error(`archive digest mismatch: ${file.path}`);
    }
  }
  return { status: "verified", files: manifest.files.length, archiveId: manifest.archiveId };
}

export async function verifyApiTesterOperationArchiveGitClosure(options: {
  rootDir: string;
  archiveRoot: string;
  gitExecutable: string;
}): Promise<{ status: "verified"; files: number }> {
  const rootDir = resolve(options.rootDir);
  const archiveRoot = resolve(options.archiveRoot);
  if (!pathWithin(rootDir, archiveRoot) || archiveRoot === rootDir) {
    throw new Error("archive Git root must remain below repository root");
  }
  const archiveRelative = parseSafeRelativePath(portable(relative(rootDir, archiveRoot)));
  const manifest = ApiTesterOperationArchiveManifestSchema.parse(JSON.parse(
    await readFile(join(archiveRoot, "archive-manifest.json"), "utf8"),
  ));
  const expected = [...manifest.files.map((file) => `${archiveRelative}/${file.path}`), `${archiveRelative}/archive-manifest.json`]
    .sort(compareText);
  const git = spawnSync(options.gitExecutable, [
    "-c", `safe.directory=${portable(rootDir)}`,
    "ls-tree", "-r", "--name-only", "HEAD", "--", archiveRelative,
  ], { cwd: rootDir, encoding: "utf8" });
  if (git.status !== 0) throw new Error(`archive Git closure inspection failed: ${git.stderr.trim()}`);
  const actual = git.stdout.split(/\r?\n/u).filter(Boolean).map(portable).sort(compareText);
  if (canonical(actual) !== canonical(expected)) {
    throw new Error(`archive Git closure mismatch: expected=${expected.length} actual=${actual.length}`);
  }
  return { status: "verified", files: expected.length };
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function relativeRef(rootDir: string, path: string): string {
  const local = portable(relative(resolve(rootDir), resolve(path)));
  return parseSafeRelativePath(local);
}

function deliveryPortableDigest(report: Omit<ApiTesterOperationDeliveryValidationReport, "portableSemanticSha256">): string {
  return sha256(canonical({
    schemaVersion: report.schemaVersion,
    identity: report.identity,
    status: report.status,
    baselineRunSemanticSha256: report.inputs.baselineRevision.runSemanticSha256,
    rows: report.rows.map((row) => ({
      rowId: row.rowId,
      format: row.format,
      sourceSha256: row.source.sha256,
      licenseSha256: row.license.sha256,
      operationPortableSemanticSha256: row.operationReport.portableSemanticSha256,
      totals: row.totals,
      sourceIssues: row.sourceIssues,
      comparison: row.comparison,
    })),
    totals: report.totals,
    retainedIssues: report.retainedIssues,
    gates: report.gates,
    accounting: report.accounting,
    protectedBoundary: report.protectedBoundary,
  }));
}

async function parseBaselineEvidence(rootDir: string): Promise<{
  revisionBytes: Buffer;
  revision: z.infer<typeof ApiTesterOperationDependencyRevisionReportSchema>;
  replay: z.infer<typeof ApiTesterOperationDevelopmentReportSchema>;
  inventories: Map<string, JsonRecord>;
}> {
  const revisionBytes = await readFile(contained(rootDir, BASELINE_REVISION_PATH, "baseline dependency revision"));
  const revision = ApiTesterOperationDependencyRevisionReportSchema.parse(JSON.parse(revisionBytes.toString("utf8")));
  const replayPath = contained(rootDir, revision.replay.report.path, "baseline dependency replay");
  const replayBytes = await readFile(replayPath);
  if (sha256(replayBytes) !== revision.replay.report.sha256) throw new Error("baseline dependency replay digest mismatch");
  const replay = ApiTesterOperationDevelopmentReportSchema.parse(JSON.parse(replayBytes.toString("utf8")));
  const inventories = new Map<string, JsonRecord>();
  for (const document of replay.documents) {
    const inventoryPath = resolve(dirname(replayPath), parseSafeRelativePath(document.inventory.path));
    if (!pathWithin(dirname(replayPath), inventoryPath)) throw new Error(`baseline inventory escapes replay root: ${document.rowId}`);
    const bytes = await readFile(inventoryPath);
    if (sha256(bytes) !== document.inventory.sha256) throw new Error(`baseline inventory digest mismatch: ${document.rowId}`);
    const value = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(value)) throw new Error(`baseline inventory is not an object: ${document.rowId}`);
    inventories.set(document.rowId, value);
  }
  return { revisionBytes, revision, replay, inventories };
}

async function readJsonObject(path: string, label: string): Promise<JsonRecord> {
  const value = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function rowData(value: JsonRecord, rowId: string): { operations: unknown[]; dependencies: unknown[] } {
  if (!Array.isArray(value.operations) || !Array.isArray(value.dependencyVerification)) {
    throw new Error(`operation inventory is incomplete: ${rowId}`);
  }
  return { operations: value.operations, dependencies: value.dependencyVerification };
}

export async function runApiTesterOperationDeliveryValidation(options: {
  rootDir: string;
  cacheRoot: string;
  nodeExecutable: string;
  outputRoot: string;
  completedAt?: string;
}): Promise<ApiTesterOperationDeliveryValidationReport> {
  const rootDir = resolve(options.rootDir);
  const cacheRoot = resolve(options.cacheRoot);
  const outputRoot = resolve(options.outputRoot);
  if (!pathWithin(rootDir, outputRoot) || outputRoot === rootDir) {
    throw new Error("delivery validation output must remain below the repository root");
  }
  try {
    await lstat(outputRoot);
    throw new Error(`delivery validation output already exists: ${outputRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const selectionBytes = await readFile(contained(rootDir, SOURCE_SELECTION_PATH, "exposed source selection"));
  const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  if (JSON.stringify(selection.selected.map((row) => row.rowId)) !== JSON.stringify(ROW_IDS)) {
    throw new Error("exposed source selection row identity drifted");
  }
  const baseline = await parseBaselineEvidence(rootDir);
  const archivedSelectionPath = join(outputRoot, "inputs/source-selection.json");
  await mkdir(dirname(archivedSelectionPath), { recursive: true });
  await writeFile(archivedSelectionPath, selectionBytes, { flag: "wx" });
  const rows: z.infer<typeof DeliveryRowSchema>[] = [];
  let obligationsTotal = 0;
  let obligationsCovered = 0;
  let strictOutputs = true;
  const completedAt = options.completedAt ?? new Date().toISOString();

  for (const source of selection.selected) {
    const rowId = z.enum(ROW_IDS).parse(source.rowId);
    const cachedSourcePath = contained(cacheRoot, source.cachePath, `exposed source ${rowId}`);
    const cachedLicensePath = contained(cacheRoot, source.license.cachePath, `exposed license ${rowId}`);
    const [sourceBytes, licenseBytes] = await Promise.all([readFile(cachedSourcePath), readFile(cachedLicensePath)]);
    if (sourceBytes.byteLength !== source.bytes || sha256(sourceBytes) !== source.sha256
      || licenseBytes.byteLength !== source.license.bytes || sha256(licenseBytes) !== source.license.sha256) {
      throw new Error(`exposed source/license digest drift: ${rowId}`);
    }
    const extension = source.format === "json" ? ".json" : [".yaml", ".yml"].includes(extname(source.cachePath).toLowerCase())
      ? extname(source.cachePath).toLowerCase() : ".yaml";
    const sourceRelativePath = `inputs/${rowId}/source${extension}`;
    const licenseRelativePath = `inputs/${rowId}/LICENSE`;
    const manifestRelativePath = `runs/${rowId}/manifest.json`;
    const sourceArchivePath = join(outputRoot, sourceRelativePath);
    const licenseArchivePath = join(outputRoot, licenseRelativePath);
    const manifestArchivePath = join(outputRoot, manifestRelativePath);
    await Promise.all([
      mkdir(dirname(sourceArchivePath), { recursive: true }),
      mkdir(dirname(manifestArchivePath), { recursive: true }),
    ]);
    await Promise.all([
      copyFile(cachedSourcePath, sourceArchivePath),
      copyFile(cachedLicensePath, licenseArchivePath),
    ]);
    const manifest = ApiTesterOperationInputManifestSchema.parse({
      schemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
      identity: "skill-ir-api-tester-operation-input-development-001",
      bindingId: rowId,
      supportContractId: API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
      input: { path: sourceRelativePath, format: source.format, bytes: source.bytes, sha256: source.sha256 },
      output: { path: `runs/${rowId}/output`, writeMode: "exclusive-create-once" },
    });
    const manifestText = jsonText(manifest);
    await writeFile(manifestArchivePath, manifestText, { encoding: "utf8", flag: "wx" });
    const report = await runApiTesterOperationInput({
      rootDir: outputRoot,
      manifestPath: manifestRelativePath,
      nodeExecutable: options.nodeExecutable,
      completedAt,
    });
    try {
      await verifyApiTesterOperationInputOutput({
        rootDir: outputRoot,
        manifestPath: manifestRelativePath,
        nodeExecutable: options.nodeExecutable,
      });
    } catch (error) {
      strictOutputs = false;
      throw error;
    }
    const outputBase = join(outputRoot, `runs/${rowId}/output`);
    const inventory = ApiTesterOperationInputInventorySchema.parse(JSON.parse(
      await readFile(join(outputBase, "operation-inventory.json"), "utf8"),
    ));
    const baselineInventory = baseline.inventories.get(rowId);
    if (!baselineInventory) throw new Error(`baseline inventory missing: ${rowId}`);
    const old = rowData(baselineInventory, rowId);
    const baselineDocument = baseline.replay.documents.find((document) => document.rowId === rowId);
    if (!baselineDocument) throw new Error(`baseline document missing: ${rowId}`);
    const comparison = compareApiTesterOperationDeliveryRow({
      baselineOperations: old.operations,
      currentOperations: inventory.operations,
      baselineDependencies: old.dependencies,
      currentDependencies: inventory.dependencyVerification,
      baselineChecked: baselineDocument.artifact.checkedOperationCount,
      currentChecked: report.totals.artifactCheckedPassedOperations,
    });
    obligationsTotal += report.obligationCoverage.total;
    obligationsCovered += report.obligationCoverage.covered;
    const outputManifestBytes = await readFile(join(outputBase, "output-manifest.json"));
    const operationReportBytes = await readFile(join(outputBase, "report.json"));
    rows.push(DeliveryRowSchema.parse({
      rowId,
      format: source.format,
      source: { path: sourceRelativePath, sha256: source.sha256, bytes: source.bytes },
      license: { path: licenseRelativePath, sha256: source.license.sha256, bytes: source.license.bytes },
      manifest: { path: manifestRelativePath, sha256: sha256(manifestText) },
      outputManifest: { path: `runs/${rowId}/output/output-manifest.json`, sha256: sha256(outputManifestBytes) },
      operationReport: {
        path: `runs/${rowId}/output/report.json`,
        sha256: sha256(operationReportBytes),
        portableSemanticSha256: report.portableSemanticSha256,
      },
      totals: {
        operations: report.totals.operations,
        accepted: report.totals.accepted,
        rejected: report.totals.rejected,
        unresolved: report.totals.unresolved,
        checked: report.totals.artifactCheckedPassedOperations,
      },
      sourceIssues: { blockers: report.sourceIssues.blocking, advisories: report.sourceIssues.advisories },
      comparison,
    }));
  }

  const totals = rows.reduce((value, row) => ({
    documents: 6 as const,
    operations: value.operations + row.totals.operations,
    accepted: value.accepted + row.totals.accepted,
    rejected: value.rejected + row.totals.rejected,
    unresolved: value.unresolved + row.totals.unresolved,
    checked: value.checked + row.totals.checked,
    obligations: { total: obligationsTotal, covered: obligationsCovered },
  }), { documents: 6 as const, operations: 0, accepted: 0, rejected: 0, unresolved: 0, checked: 0, obligations: { total: 0, covered: 0 } });
  const expected = baseline.revision.comparison.totals.fresh;
  const totalComparison = compareApiTesterOperationDeliveryTotals(totals, expected);
  const meilisearch = rows.find((row) => row.rowId === "real-meilisearch-api");
  const bangumi = rows.find((row) => row.rowId === "real-bangumi-api");
  const retainedIssues = {
    meilisearchMissingTotalReference: meilisearch?.sourceIssues.blockers === 1,
    bangumiExternalResponseAdvisoryOperations: bangumi?.sourceIssues.advisories ?? -1,
  };
  const sixSourceComparison = totalComparison && rows.every((row) => row.comparison.status === "pass");
  const implementationCorrectness = sixSourceComparison && strictOutputs && obligationsTotal === obligationsCovered
    && retainedIssues.meilisearchMissingTotalReference && retainedIssues.bangumiExternalResponseAdvisoryOperations === 19;
  const reportWithoutDigest: Omit<ApiTesterOperationDeliveryValidationReport, "portableSemanticSha256"> = {
    schemaVersion: "skill-ir-api-tester-operation-delivery-validation-report/v1",
    identity: API_TESTER_OPERATION_DELIVERY_IDENTITY,
    status: implementationCorrectness ? "passed-with-source-blocker" : "failed",
    completedAt,
    inputs: {
      sourceSelection: { path: "inputs/source-selection.json", sha256: sha256(selectionBytes) },
      baselineRevision: {
        path: BASELINE_REVISION_PATH,
        sha256: sha256(baseline.revisionBytes),
        runSemanticSha256: baseline.revision.runSemanticSha256,
      },
    },
    rows,
    totals,
    retainedIssues: {
      meilisearchMissingTotalReference: z.literal(true).parse(retainedIssues.meilisearchMissingTotalReference),
      bangumiExternalResponseAdvisoryOperations: z.literal(19).parse(retainedIssues.bangumiExternalResponseAdvisoryOperations),
    },
    gates: {
      sixSourceComparison: sixSourceComparison ? "pass" : "fail",
      strictOutputs: strictOutputs ? "pass" : "fail",
      implementationCorrectness: implementationCorrectness ? "pass" : "fail",
      sourceCorrectness: "blocked",
    },
    accounting: {
      runtime: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      developmentAgentUsage: "host-external-not-measured-by-runner",
      separate: true,
    },
    protectedBoundary: {
      frozenWholeDocumentRealAccepted: 0,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      readinessChanges: 0,
      claimsHumanSavings: false,
      claimsLiveApiBehavior: false,
    },
  };
  const report = ApiTesterOperationDeliveryValidationReportSchema.parse({
    ...reportWithoutDigest,
    portableSemanticSha256: deliveryPortableDigest(reportWithoutDigest),
  });
  await writeFile(join(outputRoot, "validation-report.json"), jsonText(report), { encoding: "utf8", flag: "wx" });
  const archiveManifest = await createApiTesterOperationArchiveManifest({
    rootDir: outputRoot,
    archiveId: "api-tester-operation-delivery-main",
  });
  await writeFile(join(outputRoot, "archive-manifest.json"), jsonText(archiveManifest), { encoding: "utf8", flag: "wx" });
  return report;
}

export async function verifyApiTesterOperationDeliveryValidation(options: {
  rootDir: string;
  archiveRoot: string;
  nodeExecutable: string;
}): Promise<{ status: "verified"; portableSemanticSha256: string; operations: number; accepted: number; checked: number }> {
  const rootDir = resolve(options.rootDir);
  const archiveRoot = resolve(options.archiveRoot);
  await verifyApiTesterOperationArchive({ rootDir: archiveRoot });
  const report = ApiTesterOperationDeliveryValidationReportSchema.parse(JSON.parse(
    await readFile(join(archiveRoot, "validation-report.json"), "utf8"),
  ));
  const selectionBytes = await readFile(join(archiveRoot, report.inputs.sourceSelection.path));
  if (sha256(selectionBytes) !== report.inputs.sourceSelection.sha256) throw new Error("delivery source selection digest mismatch");
  const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  const baseline = await parseBaselineEvidence(rootDir);
  if (sha256(baseline.revisionBytes) !== report.inputs.baselineRevision.sha256
    || baseline.revision.runSemanticSha256 !== report.inputs.baselineRevision.runSemanticSha256) {
    throw new Error("delivery baseline revision binding mismatch");
  }
  let obligationsTotal = 0;
  let obligationsCovered = 0;
  const verifiedRows: z.infer<typeof DeliveryRowSchema>[] = [];
  for (const [index, row] of report.rows.entries()) {
    const source = selection.selected[index];
    if (!source || source.rowId !== row.rowId || source.format !== row.format) throw new Error(`delivery source row drift: ${row.rowId}`);
    const sourceBytes = await readFile(join(archiveRoot, row.source.path));
    const licenseBytes = await readFile(join(archiveRoot, row.license.path));
    const manifestBytes = await readFile(join(archiveRoot, row.manifest.path));
    const outputManifestBytes = await readFile(join(archiveRoot, row.outputManifest.path));
    const operationReportBytes = await readFile(join(archiveRoot, row.operationReport.path));
    if (sourceBytes.byteLength !== row.source.bytes || sha256(sourceBytes) !== row.source.sha256
      || licenseBytes.byteLength !== row.license.bytes || sha256(licenseBytes) !== row.license.sha256
      || sha256(manifestBytes) !== row.manifest.sha256 || sha256(outputManifestBytes) !== row.outputManifest.sha256
      || sha256(operationReportBytes) !== row.operationReport.sha256) {
      throw new Error(`delivery row digest mismatch: ${row.rowId}`);
    }
    await verifyApiTesterOperationInputOutput({
      rootDir: archiveRoot,
      manifestPath: row.manifest.path,
      nodeExecutable: options.nodeExecutable,
    });
    const operationReport = ApiTesterOperationInputReportSchema.parse(JSON.parse(operationReportBytes.toString("utf8")));
    const manifest = ApiTesterOperationInputManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    const inventory = ApiTesterOperationInputInventorySchema.parse(JSON.parse(await readFile(
      join(archiveRoot, manifest.output.path, "operation-inventory.json"),
      "utf8",
    )));
    const baselineInventory = baseline.inventories.get(row.rowId);
    const baselineDocument = baseline.replay.documents.find((document) => document.rowId === row.rowId);
    if (!baselineInventory || !baselineDocument) throw new Error(`delivery baseline row missing: ${row.rowId}`);
    const old = rowData(baselineInventory, row.rowId);
    const comparison = compareApiTesterOperationDeliveryRow({
      baselineOperations: old.operations,
      currentOperations: inventory.operations,
      baselineDependencies: old.dependencies,
      currentDependencies: inventory.dependencyVerification,
      baselineChecked: baselineDocument.artifact.checkedOperationCount,
      currentChecked: operationReport.totals.artifactCheckedPassedOperations,
    });
    obligationsTotal += operationReport.obligationCoverage.total;
    obligationsCovered += operationReport.obligationCoverage.covered;
    verifiedRows.push(DeliveryRowSchema.parse({
      ...row,
      totals: {
        operations: operationReport.totals.operations,
        accepted: operationReport.totals.accepted,
        rejected: operationReport.totals.rejected,
        unresolved: operationReport.totals.unresolved,
        checked: operationReport.totals.artifactCheckedPassedOperations,
      },
      sourceIssues: { blockers: operationReport.sourceIssues.blocking, advisories: operationReport.sourceIssues.advisories },
      comparison,
    }));
  }
  const expected = baseline.revision.comparison.totals.fresh;
  if (canonical(verifiedRows) !== canonical(report.rows)
    || obligationsTotal !== report.totals.obligations.total || obligationsCovered !== report.totals.obligations.covered
    || !compareApiTesterOperationDeliveryTotals(report.totals, expected)) {
    throw new Error("delivery validation semantic comparison drift");
  }
  const { portableSemanticSha256: _digest, ...reportWithoutDigest } = report;
  if (deliveryPortableDigest(reportWithoutDigest) !== report.portableSemanticSha256) {
    throw new Error("delivery validation portable semantic digest mismatch");
  }
  if (report.gates.implementationCorrectness !== "pass") throw new Error("delivery implementation correctness gate failed");
  return {
    status: "verified",
    portableSemanticSha256: report.portableSemanticSha256,
    operations: report.totals.operations,
    accepted: report.totals.accepted,
    checked: report.totals.checked,
  };
}
