import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema, parseSafeRelativePath } from "../benchmarks/skill-ir/artifact-package";
import { analyzeApiTesterOperation, verifyApiTesterOperationAdmissionConsistency } from "./api-tester-operation-admission";
import {
  independentlyEnumerateApiTesterOperations,
  verifyApiTesterOperationCoverage,
  verifyApiTesterProjectionDependencies,
} from "./api-tester-operation-coverage";
import { aggregateApiTesterOperations, parseApiTesterOperationSource } from "./api-tester-operation-source";
import {
  ApiTesterProductionRunReportSchemaV2,
  runApiTesterProductionArtifactV2,
  validateApiTesterProductionArtifactV2,
} from "./api-tester-production-artifact-v2";
import {
  API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2,
  ApiTesterProductionBindingSchemaV2,
} from "./api-tester-production-contract-v2";

export const API_TESTER_OPERATION_INPUT_IDENTITY =
  "skill-ir-api-tester-operation-input-development-001" as const;
export const API_TESTER_OPERATION_INPUT_MANIFEST_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-input-manifest/v1" as const;
export const API_TESTER_OPERATION_INPUT_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-input-report/v1" as const;
export const API_TESTER_OPERATION_INPUT_INVENTORY_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-input-inventory/v1" as const;
export const API_TESTER_OPERATION_INPUT_OUTPUT_MANIFEST_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-output-manifest/v1" as const;

const DigestRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ApiTesterOperationInputManifestSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_INPUT_MANIFEST_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_INPUT_IDENTITY),
  bindingId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  input: z.object({
    path: SafeRelativePathSchema,
    format: z.enum(["json", "yaml"]),
    bytes: z.number().int().positive(),
    sha256: Sha256Schema,
  }).strict(),
  output: z.object({
    path: SafeRelativePathSchema,
    writeMode: z.literal("exclusive-create-once"),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const extensionMatches = manifest.input.format === "json"
    ? manifest.input.path.toLowerCase().endsWith(".json")
    : /\.ya?ml$/iu.test(manifest.input.path);
  if (!extensionMatches) {
    context.addIssue({
      code: "custom",
      path: ["input", "path"],
      message: "operation input extension must match the declared format",
    });
  }
  if (manifest.output.path === manifest.input.path
    || manifest.output.path.startsWith(`${manifest.input.path}/`)
    || manifest.input.path.startsWith(`${manifest.output.path}/`)) {
    context.addIssue({ code: "custom", path: ["output", "path"], message: "operation input and output must not overlap" });
  }
});

export type ApiTesterOperationInputManifest = z.infer<typeof ApiTesterOperationInputManifestSchema>;

const OperationRowSchema = z.object({
  source: z.object({
    key: z.string().min(1),
    locator: z.string().min(1),
    operationId: z.string().nullable(),
    summary: z.string().nullable(),
  }).passthrough(),
  admission: z.object({
    operationKey: z.string().min(1),
    status: z.enum(["accepted", "rejected", "unresolved"]),
    findings: z.array(z.object({
      code: z.string().min(1),
      category: z.string().min(1),
      locator: z.string().min(1),
      message: z.string(),
    }).passthrough()),
    firstObservedRejection: z.unknown().nullable(),
    normalizedOperation: z.unknown().nullable(),
    projection: z.unknown().nullable().optional(),
  }).passthrough(),
}).strict();

const DependencyReportSchema = z.object({
  operationKey: z.string().min(1),
  status: z.enum(["pass", "fail"]),
  checks: z.record(z.string(), z.boolean()),
  dimensions: z.object({
    projectionPreservation: z.enum(["pass", "fail"]),
    constructionObligations: z.enum(["pass", "fail"]),
    sourceValidity: z.enum(["pass", "fail"]),
  }).strict(),
  sourceIssues: z.array(z.object({
    code: z.string(),
    role: z.string(),
    locator: z.string(),
    reference: z.string().nullable(),
    constructionObligation: z.boolean(),
  }).passthrough()),
  projectedIssues: z.array(z.unknown()),
  errors: z.array(z.string()),
}).passthrough();

const ArtifactEvidenceSchema = z.object({
  status: z.enum(["passed", "failed", "not-run"]),
  acceptedOperationCount: z.number().int().nonnegative(),
  checkedOperationCount: z.number().int().nonnegative(),
  root: SafeRelativePathSchema.nullable(),
  runReport: DigestRefSchema.nullable(),
  packageManifest: DigestRefSchema.nullable(),
  projectedInput: DigestRefSchema.nullable(),
  generatedPlan: DigestRefSchema.nullable(),
  generatedReport: DigestRefSchema.nullable(),
  validationReport: DigestRefSchema.nullable(),
  error: z.string().nullable(),
}).strict();

const SourceIssueSummarySchema = z.object({
  blocking: z.number().int().nonnegative(),
  advisories: z.number().int().nonnegative(),
  blockingOperations: z.array(z.string()),
  advisoryOperations: z.array(z.string()),
}).strict();

export const ApiTesterOperationInputInventorySchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_INPUT_INVENTORY_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_INPUT_IDENTITY),
  bindingId: z.string(),
  source: z.object({
    format: z.enum(["json", "yaml"]),
    bytes: z.number().int().positive(),
    sha256: Sha256Schema,
  }).strict(),
  enumeration: z.object({
    complete: z.boolean(),
    operations: z.array(z.unknown()),
    unresolved: z.array(z.unknown()),
  }).strict(),
  operations: z.array(OperationRowSchema),
  admissionConsistency: z.object({ status: z.enum(["pass", "fail"]), errors: z.array(z.string()) }).strict(),
  dependencyVerification: z.array(DependencyReportSchema),
  coverage: z.object({ status: z.enum(["pass", "fail"]), errors: z.array(z.string()) }).passthrough(),
  sourceIssues: SourceIssueSummarySchema,
  artifact: ArtifactEvidenceSchema,
}).strict();

export type ApiTesterOperationInputInventory = z.infer<typeof ApiTesterOperationInputInventorySchema>;

const GateSchema = z.object({
  sourceCoverage: z.enum(["pass", "fail"]),
  admissionConsistency: z.enum(["pass", "fail"]),
  dependencyPreservation: z.enum(["pass", "fail"]),
  artifactCorrectness: z.enum(["pass", "fail"]),
  implementationCorrectness: z.enum(["pass", "fail"]),
  sourceCorrectness: z.enum(["pass", "unverified", "blocked"]),
}).strict();

export const ApiTesterOperationInputReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_INPUT_REPORT_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_INPUT_IDENTITY),
  status: z.enum(["completed", "completed-with-source-advisory", "completed-with-source-blocker", "failed"]),
  completedAt: z.string().datetime(),
  bindingId: z.string(),
  supportContractId: z.literal(API_TESTER_PRODUCTION_SUPPORT_CONTRACT_ID_V2),
  inputs: z.object({
    manifest: DigestRefSchema,
    input: z.object({
      path: SafeRelativePathSchema,
      format: z.enum(["json", "yaml"]),
      bytes: z.number().int().positive(),
      sha256: Sha256Schema,
    }).strict(),
  }).strict(),
  outputs: z.object({
    inventory: DigestRefSchema,
    projectedInput: DigestRefSchema.nullable(),
    artifactRoot: SafeRelativePathSchema.nullable(),
    outputManifest: z.object({ path: z.literal("output-manifest.json") }).strict(),
  }).strict(),
  totals: z.object({
    operations: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    artifactCheckedPassedOperations: z.number().int().nonnegative(),
  }).strict(),
  documentDisposition: z.enum(["fully-accepted-within-local-contract", "partial", "rejected", "unresolved"]),
  gates: GateSchema,
  sourceIssues: SourceIssueSummarySchema,
  obligationCoverage: z.object({
    total: z.number().int().nonnegative(),
    covered: z.number().int().nonnegative(),
    uncovered: z.number().int().nonnegative(),
    status: z.enum(["pass", "fail", "not-applicable"]),
  }).strict(),
  accounting: z.object({
    runtime: z.object({
      modelCalls: z.literal(0),
      apiCalls: z.literal(0),
      paidCalls: z.literal(0),
      wallClockMillis: z.number().int().nonnegative(),
      sourceBytesRead: z.number().int().positive(),
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
    claimsLiveApiBehavior: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
  portableSemanticSha256: Sha256Schema,
}).strict().superRefine((report, context) => {
  if (report.totals.operations !== report.totals.accepted + report.totals.rejected + report.totals.unresolved) {
    context.addIssue({ code: "custom", path: ["totals"], message: "operation admission totals must conserve the source universe" });
  }
  if (report.obligationCoverage.uncovered !== report.obligationCoverage.total - report.obligationCoverage.covered) {
    context.addIssue({ code: "custom", path: ["obligationCoverage"], message: "obligation totals drifted" });
  }
  const implementationPass = report.gates.sourceCoverage === "pass"
    && report.gates.admissionConsistency === "pass"
    && report.gates.dependencyPreservation === "pass"
    && report.gates.artifactCorrectness === "pass";
  if ((report.gates.implementationCorrectness === "pass") !== implementationPass) {
    context.addIssue({ code: "custom", path: ["gates", "implementationCorrectness"], message: "implementation gate drifted" });
  }
});

export type ApiTesterOperationInputReport = z.infer<typeof ApiTesterOperationInputReportSchema>;

export const ApiTesterOperationOutputManifestSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_INPUT_OUTPUT_MANIFEST_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_INPUT_IDENTITY),
  bindingId: z.string(),
  files: z.array(DigestRefSchema).min(2),
}).strict().superRefine((manifest, context) => {
  const paths = manifest.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify([...paths].sort(compareText))) {
    context.addIssue({ code: "custom", path: ["files"], message: "output manifest paths must be unique and sorted" });
  }
  if (paths.includes("output-manifest.json")) {
    context.addIssue({ code: "custom", path: ["files"], message: "output manifest must not list itself" });
  }
});

type JsonRecord = Record<string, unknown>;
type OperationRow = z.infer<typeof OperationRowSchema>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

function contained(rootDir: string, candidate: string, label: string): { absolute: string; relative: string } {
  if (isAbsolute(candidate)) throw new Error(`${label} must be a safe relative path`);
  const safe = parseSafeRelativePath(portable(candidate));
  const root = resolve(rootDir);
  const absolute = resolve(root, safe);
  if (!pathWithin(root, absolute) || absolute === root) throw new Error(`${label} escapes its root`);
  return { absolute, relative: safe };
}

async function assertDirectory(path: string, label: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink directory`);
}

async function assertNoSymlinkTraversal(rootDir: string, relativePath: string, requireFile: boolean): Promise<void> {
  await assertDirectory(rootDir, "operation input root");
  let current = resolve(rootDir);
  const parts = parseSafeRelativePath(relativePath).split("/");
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`symbolic link is forbidden: ${relativePath}`);
      if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`path parent must be a directory: ${relativePath}`);
      if (index === parts.length - 1 && requireFile && !stat.isFile()) throw new Error(`path must be a regular file: ${relativePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !requireFile) return;
      throw error;
    }
  }
}

async function readManifest(rootDir: string, manifestPath: string): Promise<{
  manifest: ApiTesterOperationInputManifest;
  manifestBytes: Buffer;
  manifestRelativePath: string;
}> {
  const location = contained(rootDir, manifestPath, "operation input manifest");
  if (!location.relative.toLowerCase().endsWith(".json")) throw new Error("operation input manifest must be JSON");
  await assertNoSymlinkTraversal(rootDir, location.relative, true);
  const manifestBytes = await readFile(location.absolute);
  return {
    manifest: ApiTesterOperationInputManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8"))),
    manifestBytes,
    manifestRelativePath: location.relative,
  };
}

async function readBoundInput(rootDir: string, manifest: ApiTesterOperationInputManifest): Promise<Buffer> {
  const location = contained(rootDir, manifest.input.path, "operation input");
  await assertNoSymlinkTraversal(rootDir, location.relative, true);
  const bytes = await readFile(location.absolute);
  if (bytes.byteLength !== manifest.input.bytes || sha256(bytes) !== manifest.input.sha256) {
    throw new Error(`operation input digest mismatch: ${manifest.input.path}`);
  }
  return bytes;
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
    const local = current ? `${current}/${entry.name}` : entry.name;
    const stat = await lstat(join(root, local));
    if (stat.isSymbolicLink()) throw new Error(`operation output contains a symbolic link: ${local}`);
    if (stat.isDirectory()) result.push(...await listFiles(root, local));
    else if (stat.isFile()) result.push(local);
    else throw new Error(`operation output contains unsupported entry: ${local}`);
  }
  return result.sort(compareText);
}

function analyzeDocument(sourceText: string, format: "json" | "yaml") {
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
      operations: parsed.enumeration.operations.length,
      accepted: admissions.filter((row) => row.status === "accepted").length,
      rejected: admissions.filter((row) => row.status === "rejected").length,
      unresolved: admissions.filter((row) => row.status === "unresolved").length,
    },
  };
}

function artifactOperationKeys(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.endpoints)) return [];
  return value.endpoints.flatMap((endpoint) => {
    if (!isRecord(endpoint) || typeof endpoint.method !== "string" || typeof endpoint.path !== "string") return [];
    return [`${endpoint.method} ${endpoint.path}`];
  });
}

function countCoveredObligations(acceptedOperations: number, checks: Record<string, boolean>): { total: number; covered: number } {
  if (acceptedOperations === 0) return { total: 0, covered: 0 };
  const operationChecks = ["operationCoverage", "arrayEncoding", "schemaDerivedCases", "securityResponse", "independenceVerification"];
  const documentChecks = ["inputGrounding", "artifactShape", "reportGrounding"];
  return {
    total: acceptedOperations * operationChecks.length + documentChecks.length,
    covered: acceptedOperations * operationChecks.filter((key) => checks[key]).length
      + documentChecks.filter((key) => checks[key]).length,
  };
}

function sourceIssueSummary(
  rows: OperationRow[],
  dependencies: z.infer<typeof DependencyReportSchema>[],
): z.infer<typeof SourceIssueSummarySchema> {
  const blockingOperations = rows.filter((row) => row.admission.findings.some((finding) =>
    finding.code === "UNRESOLVED_CONSTRUCTION_REFERENCE" || finding.code === "UNRESOLVED_PATH_ITEM_REFERENCE"))
    .map((row) => row.source.key).sort(compareText);
  const advisoryOperations = dependencies.filter((dependency) => dependency.dimensions.sourceValidity === "fail"
    && dependency.sourceIssues.some((issue) => !issue.constructionObligation))
    .map((dependency) => dependency.operationKey).sort(compareText);
  return {
    blocking: new Set(blockingOperations).size,
    advisories: new Set(advisoryOperations).size,
    blockingOperations: [...new Set(blockingOperations)],
    advisoryOperations: [...new Set(advisoryOperations)],
  };
}

function portableReportDigest(report: Omit<ApiTesterOperationInputReport, "portableSemanticSha256">): string {
  const { completedAt: _completedAt, accounting, ...stable } = report;
  return sha256(canonical({
    ...stable,
    accounting: { ...accounting, runtime: { ...accounting.runtime, wallClockMillis: 0 } },
  }));
}

export function verifyApiTesterOperationInputSemantics(input: {
  sourceText: string;
  format: "json" | "yaml";
  operations: unknown[];
  projectedDocument: unknown | null;
  contractOperationKeys: string[];
  artifactOperationKeys: string[];
}): {
  status: "pass";
  coverage: ReturnType<typeof verifyApiTesterOperationCoverage>;
  dependencies: Array<ReturnType<typeof verifyApiTesterProjectionDependencies> & { operationKey: string }>;
} {
  const operations = z.array(OperationRowSchema).parse(input.operations);
  const accepted = operations.filter((row) => row.admission.status === "accepted");
  const projectedUniverse = input.projectedDocument === null
    ? { complete: true, operations: [], unresolved: [] }
    : independentlyEnumerateApiTesterOperations(JSON.stringify(input.projectedDocument), "json");
  const coverage = verifyApiTesterOperationCoverage({
    sourceText: input.sourceText,
    format: input.format,
    analyzedOperations: operations.map((row) => ({
      key: row.source.key,
      locator: row.source.locator,
      operationId: row.source.operationId,
      summary: row.source.summary,
      status: row.admission.status,
    })),
    projectedOperationKeys: projectedUniverse.operations.map((operation) => operation.key),
    contractOperationKeys: input.contractOperationKeys,
    artifactOperationKeys: input.artifactOperationKeys,
  });
  if (!projectedUniverse.complete) {
    throw new Error(`projected operation enumeration failed: ${projectedUniverse.unresolved.map((issue) => issue.code).join(",")}`);
  }
  if (coverage.status !== "pass") throw new Error(`operation source coverage failed: ${coverage.errors.join(",")}`);
  const parsed = parseApiTesterOperationSource(input.sourceText, input.format);
  if (!parsed.document && accepted.length > 0) throw new Error("accepted operations require a parsed source document");
  const dependencies = accepted.map((row) => ({
    operationKey: row.source.key,
    ...verifyApiTesterProjectionDependencies({
      sourceDocument: parsed.document,
      operationKey: row.source.key,
      projectedDocument: input.projectedDocument,
    }),
  }));
  const dependencyErrors = dependencies.flatMap((dependency) => dependency.errors);
  if (dependencies.some((dependency) => dependency.status !== "pass")) {
    throw new Error(`operation dependency verification failed: ${dependencyErrors.join(",")}`);
  }
  return { status: "pass", coverage, dependencies };
}

export async function runApiTesterOperationInput(options: {
  rootDir: string;
  manifestPath: string;
  nodeExecutable: string;
  completedAt?: string;
}): Promise<ApiTesterOperationInputReport> {
  const started = performance.now();
  const rootDir = resolve(options.rootDir);
  await assertDirectory(rootDir, "operation input root");
  const { manifest, manifestBytes, manifestRelativePath } = await readManifest(rootDir, options.manifestPath);
  const sourceBytes = await readBoundInput(rootDir, manifest);
  const sourceText = sourceBytes.toString("utf8");
  const output = contained(rootDir, manifest.output.path, "operation output");
  if (output.relative === manifestRelativePath || output.relative.startsWith(`${manifestRelativePath}/`)
    || manifestRelativePath.startsWith(`${output.relative}/`)) {
    throw new Error("operation manifest and output must not overlap");
  }
  await assertNoSymlinkTraversal(rootDir, output.relative, false);
  try {
    await lstat(output.absolute);
    throw new Error(`operation output already exists: ${output.relative}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(output.absolute), { recursive: true });
  await mkdir(output.absolute, { recursive: false });

  const analysis = analyzeDocument(sourceText, manifest.input.format);
  const rows: OperationRow[] = analysis.enumeration.operations.map((operation, index) => {
    const admission = analysis.admissions[index];
    if (!admission) throw new Error(`operation admission missing for ${operation.key}`);
    return OperationRowSchema.parse({
      source: operation,
      admission: {
        operationKey: admission.operationKey,
        status: admission.status,
        findings: admission.findings,
        firstObservedRejection: admission.firstObservedRejection,
        normalizedOperation: admission.normalizedOperation,
      },
    });
  });
  const accepted = analysis.admissions.filter((admission) => admission.status === "accepted");
  const projectedKeys = accepted.flatMap((admission) => admission.projection?.operationKeys ?? []);
  const dependencies = analysis.document ? accepted.map((admission) => ({
    operationKey: admission.operationKey,
    ...verifyApiTesterProjectionDependencies({
      sourceDocument: analysis.document,
      operationKey: admission.operationKey,
      projectedDocument: admission.projection?.document,
    }),
  })) : [];
  let projectedDocument: unknown | null = null;
  let contractKeys: string[] = [];
  let generatedKeys: string[] = [];
  let checks: Record<string, boolean> = {};
  let artifact: z.infer<typeof ArtifactEvidenceSchema> = {
    status: "not-run",
    acceptedOperationCount: accepted.length,
    checkedOperationCount: 0,
    root: null,
    runReport: null,
    packageManifest: null,
    projectedInput: null,
    generatedPlan: null,
    generatedReport: null,
    validationReport: null,
    error: null,
  };
  const tempRoot = await mkdtemp(join(tmpdir(), "skvm-api-operation-input-run-"));
  try {
    if (accepted.length > 0 && analysis.document && analysis.enumeration.complete
      && analysis.consistency.status === "pass" && dependencies.every((dependency) => dependency.status === "pass")) {
      const projection = aggregateApiTesterOperations(
        analysis.document,
        accepted.map((admission) => admission.operationKey as Parameters<typeof aggregateApiTesterOperations>[1][number]),
      );
      projectedDocument = projection.document;
      const projectedText = jsonText(projectedDocument);
      await writeFile(join(output.absolute, "projected-input.json"), projectedText, { encoding: "utf8", flag: "wx" });
      const bindingRoot = join(tempRoot, "binding");
      const workDir = join(tempRoot, "workdir");
      await Promise.all([
        mkdir(bindingRoot),
        mkdir(join(workDir, "input"), { recursive: true }),
      ]);
      const binding = ApiTesterProductionBindingSchemaV2.parse({
        schemaVersion: "skill-ir-api-tester-production-binding/v2",
        bindingId: manifest.bindingId,
        input: { path: "input/projected.json", format: "json" },
        outputs: { plan: "generated/plan.json", report: "generated/report.json" },
      });
      await Promise.all([
        writeFile(join(bindingRoot, "binding.json"), jsonText(binding), "utf8"),
        writeFile(join(workDir, "input/projected.json"), projectedText, "utf8"),
      ]);
      const artifactRoot = join(output.absolute, "artifact");
      try {
        const run = await runApiTesterProductionArtifactV2({
          rootDir: bindingRoot,
          bindingPath: "binding.json",
          workDir,
          outDir: artifactRoot,
          nodeExecutable: options.nodeExecutable,
        });
        const validated = await validateApiTesterProductionArtifactV2(join(artifactRoot, "artifact"));
        contractKeys = validated.contract.operations.map((operation) => `${operation.method} ${operation.path}`);
        const planBytes = await readFile(join(workDir, binding.outputs.plan));
        const generatedReportBytes = await readFile(join(workDir, binding.outputs.report));
        generatedKeys = artifactOperationKeys(JSON.parse(planBytes.toString("utf8")));
        const runText = jsonText(run);
        await Promise.all([
          copyFile(join(workDir, binding.outputs.plan), join(artifactRoot, "generated-plan.json")),
          copyFile(join(workDir, binding.outputs.report), join(artifactRoot, "generated-report.json")),
          writeFile(join(artifactRoot, "run-report.json"), runText, { encoding: "utf8", flag: "wx" }),
        ]);
        checks = run.validation.checks;
        artifact = ArtifactEvidenceSchema.parse({
          status: "passed",
          acceptedOperationCount: accepted.length,
          checkedOperationCount: generatedKeys.length,
          root: "artifact",
          runReport: { path: "artifact/run-report.json", sha256: sha256(runText) },
          packageManifest: { path: "artifact/artifact/package-manifest.json", sha256: run.package.manifestSha256 },
          projectedInput: { path: "projected-input.json", sha256: sha256(projectedText) },
          generatedPlan: { path: "artifact/generated-plan.json", sha256: sha256(planBytes) },
          generatedReport: { path: "artifact/generated-report.json", sha256: sha256(generatedReportBytes) },
          validationReport: { path: "artifact/validation-report.json", sha256: run.outputs.validationReport.sha256 },
          error: null,
        });
      } catch (error) {
        artifact = {
          ...artifact,
          status: "failed",
          root: "artifact",
          projectedInput: { path: "projected-input.json", sha256: sha256(projectedText) },
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  } finally {
    if (pathWithin(tmpdir(), tempRoot) && resolve(tempRoot) !== resolve(tmpdir())) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  const coverage = verifyApiTesterOperationCoverage({
    sourceText,
    format: manifest.input.format,
    analyzedOperations: rows.map((row) => ({
      key: row.source.key,
      locator: row.source.locator,
      operationId: row.source.operationId,
      summary: row.source.summary,
      status: row.admission.status,
    })),
    projectedOperationKeys: projectedKeys,
    contractOperationKeys: contractKeys,
    artifactOperationKeys: generatedKeys,
  });
  const sources = sourceIssueSummary(rows, z.array(DependencyReportSchema).parse(dependencies));
  const artifactCorrectness = accepted.length === 0
    ? artifact.status === "not-run"
    : artifact.status === "passed" && artifact.checkedOperationCount === accepted.length;
  const gates = GateSchema.parse({
    sourceCoverage: coverage.status,
    admissionConsistency: analysis.consistency.status,
    dependencyPreservation: dependencies.every((dependency) => dependency.status === "pass") ? "pass" : "fail",
    artifactCorrectness: artifactCorrectness ? "pass" : "fail",
    implementationCorrectness: coverage.status === "pass" && analysis.consistency.status === "pass"
      && dependencies.every((dependency) => dependency.status === "pass") && artifactCorrectness ? "pass" : "fail",
    sourceCorrectness: sources.blocking > 0 ? "blocked" : sources.advisories > 0 ? "unverified" : "pass",
  });
  const obligations = countCoveredObligations(accepted.length, checks);
  const inventory = ApiTesterOperationInputInventorySchema.parse({
    schemaVersion: API_TESTER_OPERATION_INPUT_INVENTORY_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_INPUT_IDENTITY,
    bindingId: manifest.bindingId,
    source: { format: manifest.input.format, bytes: sourceBytes.byteLength, sha256: sha256(sourceBytes) },
    enumeration: analysis.enumeration,
    operations: rows,
    admissionConsistency: analysis.consistency,
    dependencyVerification: dependencies,
    coverage,
    sourceIssues: sources,
    artifact,
  });
  const inventoryText = jsonText(inventory);
  await writeFile(join(output.absolute, "operation-inventory.json"), inventoryText, { encoding: "utf8", flag: "wx" });

  const documentDisposition = !analysis.enumeration.complete || analysis.summary.unresolved > 0
    ? analysis.summary.operations === 0 ? "unresolved" as const : "partial" as const
    : analysis.summary.accepted === analysis.summary.operations && analysis.summary.operations > 0 && artifactCorrectness
      ? "fully-accepted-within-local-contract" as const
      : analysis.summary.accepted === 0 ? "rejected" as const : "partial" as const;
  const status = gates.implementationCorrectness === "fail" ? "failed" as const
    : sources.blocking > 0 ? "completed-with-source-blocker" as const
      : sources.advisories > 0 ? "completed-with-source-advisory" as const : "completed" as const;
  const reportWithoutDigest: Omit<ApiTesterOperationInputReport, "portableSemanticSha256"> = {
    schemaVersion: API_TESTER_OPERATION_INPUT_REPORT_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_INPUT_IDENTITY,
    status,
    completedAt: options.completedAt ?? new Date().toISOString(),
    bindingId: manifest.bindingId,
    supportContractId: manifest.supportContractId,
    inputs: {
      manifest: { path: manifestRelativePath, sha256: sha256(manifestBytes) },
      input: { ...manifest.input, sha256: sha256(sourceBytes) },
    },
    outputs: {
      inventory: { path: "operation-inventory.json", sha256: sha256(inventoryText) },
      projectedInput: artifact.projectedInput,
      artifactRoot: artifact.root,
      outputManifest: { path: "output-manifest.json" },
    },
    totals: {
      ...analysis.summary,
      artifactCheckedPassedOperations: artifact.checkedOperationCount,
    },
    documentDisposition,
    gates,
    sourceIssues: sources,
    obligationCoverage: {
      total: obligations.total,
      covered: obligations.covered,
      uncovered: obligations.total - obligations.covered,
      status: obligations.total === 0 ? "not-applicable" : obligations.total === obligations.covered ? "pass" : "fail",
    },
    accounting: {
      runtime: {
        modelCalls: 0,
        apiCalls: 0,
        paidCalls: 0,
        wallClockMillis: Math.max(0, Math.round(performance.now() - started)),
        sourceBytesRead: sourceBytes.byteLength,
      },
      developmentAgentUsage: "host-external-not-measured-by-runner",
      separate: true,
    },
    protectedBoundary: {
      frozenWholeDocumentRealAccepted: 0,
      changesFrozenHistory: false,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      readinessChanges: 0,
      claimsHumanSavings: false,
      claimsLiveApiBehavior: false,
    },
    claimBoundary: "This development-only ordinary-input entry verifies local operation enumeration, bounded v2 construction, and independent offline checking. Local operation success does not establish whole-document success, live API behavior, arbitrary OpenAPI support, human savings, ecosystem admission, prospective performance, or readiness.",
  };
  const report = ApiTesterOperationInputReportSchema.parse({
    ...reportWithoutDigest,
    portableSemanticSha256: portableReportDigest(reportWithoutDigest),
  });
  await writeFile(join(output.absolute, "report.json"), jsonText(report), { encoding: "utf8", flag: "wx" });
  const files = await Promise.all((await listFiles(output.absolute)).map(async (path) => ({
    path,
    sha256: sha256(await readFile(join(output.absolute, path))),
  })));
  const outputManifest = ApiTesterOperationOutputManifestSchema.parse({
    schemaVersion: API_TESTER_OPERATION_INPUT_OUTPUT_MANIFEST_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_INPUT_IDENTITY,
    bindingId: manifest.bindingId,
    files,
  });
  await writeFile(join(output.absolute, "output-manifest.json"), jsonText(outputManifest), { encoding: "utf8", flag: "wx" });
  return report;
}

export async function verifyApiTesterOperationInputOutput(options: {
  rootDir: string;
  manifestPath: string;
  nodeExecutable: string;
}): Promise<{ status: "verified"; operations: number; accepted: number; checked: number; portableSemanticSha256: string }> {
  const rootDir = resolve(options.rootDir);
  const { manifest, manifestBytes, manifestRelativePath } = await readManifest(rootDir, options.manifestPath);
  const sourceBytes = await readBoundInput(rootDir, manifest);
  const sourceText = sourceBytes.toString("utf8");
  const output = contained(rootDir, manifest.output.path, "operation output");
  await assertNoSymlinkTraversal(rootDir, output.relative, false);
  await assertDirectory(output.absolute, "operation output");
  const outputManifest = ApiTesterOperationOutputManifestSchema.parse(JSON.parse(
    await readFile(join(output.absolute, "output-manifest.json"), "utf8"),
  ));
  const actualFiles = await listFiles(output.absolute);
  const expectedFiles = [...outputManifest.files.map((file) => file.path), "output-manifest.json"].sort(compareText);
  if (canonical(actualFiles) !== canonical(expectedFiles)) {
    throw new Error(`operation output closure mismatch: expected=${expectedFiles.join(",")} actual=${actualFiles.join(",")}`);
  }
  for (const ref of outputManifest.files) {
    const actual = sha256(await readFile(join(output.absolute, ref.path)));
    if (actual !== ref.sha256) throw new Error(`operation output digest mismatch: ${ref.path}`);
  }
  const reportBytes = await readFile(join(output.absolute, "report.json"));
  const inventoryBytes = await readFile(join(output.absolute, "operation-inventory.json"));
  const report = ApiTesterOperationInputReportSchema.parse(JSON.parse(reportBytes.toString("utf8")));
  const inventory = ApiTesterOperationInputInventorySchema.parse(JSON.parse(inventoryBytes.toString("utf8")));
  if (report.bindingId !== manifest.bindingId || inventory.bindingId !== manifest.bindingId
    || report.inputs.manifest.path !== manifestRelativePath || report.inputs.manifest.sha256 !== sha256(manifestBytes)
    || report.inputs.input.sha256 !== sha256(sourceBytes) || report.outputs.inventory.sha256 !== sha256(inventoryBytes)
    || outputManifest.bindingId !== manifest.bindingId) {
    throw new Error("operation input/output binding mismatch");
  }
  const analysis = analyzeDocument(sourceText, manifest.input.format);
  const expectedRows = analysis.enumeration.operations.map((operation, index) => {
    const admission = analysis.admissions[index]!;
    return OperationRowSchema.parse({
      source: operation,
      admission: {
        operationKey: admission.operationKey,
        status: admission.status,
        findings: admission.findings,
        firstObservedRejection: admission.firstObservedRejection,
        normalizedOperation: admission.normalizedOperation,
      },
    });
  });
  if (canonical(inventory.operations) !== canonical(expectedRows)
    || canonical(inventory.enumeration) !== canonical(analysis.enumeration)
    || canonical(inventory.admissionConsistency) !== canonical(analysis.consistency)) {
    throw new Error("operation inventory live analysis drift");
  }

  let projectedDocument: unknown | null = null;
  let contractKeys: string[] = [];
  let generatedKeys: string[] = [];
  if (inventory.artifact.status === "passed") {
    if (!inventory.artifact.projectedInput || !inventory.artifact.runReport || !inventory.artifact.generatedPlan
      || !inventory.artifact.generatedReport || !inventory.artifact.validationReport || !inventory.artifact.packageManifest) {
      throw new Error("passed operation artifact lacks required evidence");
    }
    projectedDocument = JSON.parse(await readFile(join(output.absolute, inventory.artifact.projectedInput.path), "utf8"));
    const validated = await validateApiTesterProductionArtifactV2(join(output.absolute, "artifact/artifact"));
    contractKeys = validated.contract.operations.map((operation) => `${operation.method} ${operation.path}`);
    const planBytes = await readFile(join(output.absolute, inventory.artifact.generatedPlan.path));
    generatedKeys = artifactOperationKeys(JSON.parse(planBytes.toString("utf8")));
    const run = ApiTesterProductionRunReportSchemaV2.parse(JSON.parse(
      await readFile(join(output.absolute, inventory.artifact.runReport.path), "utf8"),
    ));
    const generatedReportBytes = await readFile(join(output.absolute, inventory.artifact.generatedReport.path));
    const validationBytes = await readFile(join(output.absolute, inventory.artifact.validationReport.path));
    if (run.package.manifestSha256 !== inventory.artifact.packageManifest.sha256
      || run.outputs.plan.sha256 !== sha256(planBytes)
      || run.outputs.report.sha256 !== sha256(generatedReportBytes)
      || run.outputs.validationReport.sha256 !== sha256(validationBytes)
      || run.validation.status !== "pass") {
      throw new Error("operation v2 artifact evidence drift");
    }
  }
  const semantics = verifyApiTesterOperationInputSemantics({
    sourceText,
    format: manifest.input.format,
    operations: inventory.operations,
    projectedDocument,
    contractOperationKeys: contractKeys,
    artifactOperationKeys: generatedKeys,
  });
  if (canonical(semantics.coverage) !== canonical(inventory.coverage)
    || canonical(semantics.dependencies) !== canonical(inventory.dependencyVerification)) {
    throw new Error("operation independent verification evidence drift");
  }
  const { portableSemanticSha256: _digest, ...reportWithoutDigest } = report;
  if (portableReportDigest(reportWithoutDigest) !== report.portableSemanticSha256) {
    throw new Error("operation report portable semantic digest drift");
  }
  return {
    status: "verified",
    operations: report.totals.operations,
    accepted: report.totals.accepted,
    checked: report.totals.artifactCheckedPassedOperations,
    portableSemanticSha256: report.portableSemanticSha256,
  };
}
