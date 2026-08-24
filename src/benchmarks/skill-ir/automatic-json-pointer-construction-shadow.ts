import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { EvalCriterionSchema } from "../../core/types";
import {
  readInitialWorkdirManifest,
  snapshotWorkdir,
  writeInitialWorkdirManifest,
} from "../../core/workdir-manifest";
import {
  THIN_TASK_DESCRIPTION_LIMITS,
  ThinTaskDescriptionSchema,
  constructDomainSkillCandidates,
  type DomainAutomaticConstructionResult,
} from "./automatic-domain-construction";
import {
  DomainAutomaticConstructionShadowCatalogSchema,
  DomainAutomaticConstructionShadowReportSchema,
} from "./automatic-domain-construction-shadow";
import {
  JsonPointerCopyDeclarationSchema,
  compileAutomaticJsonPointerConstructionPlan,
  evaluateAutomaticJsonPointerRelations,
  evaluateAutomaticJsonPointerReuseGate,
  type JsonPointerCopyDeclaration,
} from "./automatic-json-pointer-construction";
import { buildAutomaticJsonPointerConstructionPackage } from "./automatic-json-pointer-construction-runtime";
import {
  AutomaticOutputConstructionShadowCatalogSchema,
  AutomaticOutputConstructionShadowReportSchema,
} from "./automatic-output-construction-shadow";
import {
  AutomaticOutputUnresolvedSchema,
  compileAutomaticOutputConstructionPlan,
  evaluateAutomaticOutputRelations,
} from "./automatic-output-construction";
import {
  StructuralExecutionShadowCatalogSchema,
  StructuralExecutionShadowReportSchema,
} from "./automatic-structural-execution-shadow";
import {
  compileStructuralExecutionPlan,
  type StructuralExecutionPlan,
} from "./automatic-structural-execution";
import { sha256Bytes } from "./source-fixture";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();
const PublicTextSchema = z.string().min(1).max(600);
const ClassificationSchema = z.enum([
  "pointer-projectable",
  "selector-lookup-projectable",
  "needs-domain-runtime",
]);

const AuthoringSchema = z.object({
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  humanMinutes: z.number().int().nonnegative(),
}).strict();

const UnresolvedClassificationSchema = z.object({
  unresolved: AutomaticOutputUnresolvedSchema,
  classification: ClassificationSchema,
  rationale: PublicTextSchema,
}).strict();

const CatalogCaseSchema = z.object({
  caseId: IdentifierSchema,
  expectedCandidateDigest: Sha256Schema,
  taskDescription: DigestRefSchema,
  jsonPointerDeclaration: DigestRefSchema.extend({ authoring: AuthoringSchema }).strict(),
  remainingUnresolvedClassifications: z.array(UnresolvedClassificationSchema).min(1),
}).strict().superRefine((entry, context) => {
  const keys = entry.remainingUnresolvedClassifications.map((item) => unresolvedKey(item.unresolved));
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", message: "remaining unresolved classifications must be unique" });
  }
});

export const AutomaticJsonPointerConstructionShadowCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-json-pointer-construction-shadow-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  parentCatalog: DigestRefSchema,
  parentReport: DigestRefSchema,
  costBoundary: z.object({
    meteredScope: z.literal("declaration-and-shadow-after-core-green"),
    preMeasurementCoreWork: z.literal("not-measured"),
  }).strict(),
  cases: z.array(CatalogCaseSchema).length(2),
}).strict().superRefine((catalog, context) => {
  if (new Set(catalog.cases.map((entry) => entry.caseId)).size !== catalog.cases.length) {
    context.addIssue({ code: "custom", message: "JSON Pointer shadow cases must be unique" });
  }
});

export type AutomaticJsonPointerConstructionShadowCatalog = z.infer<
  typeof AutomaticJsonPointerConstructionShadowCatalogSchema
>;

const ManualCriterionResultSchema = z.object({
  status: z.enum(["pass", "fail", "infrastructure-failure"]),
  details: z.string().optional(),
}).strict();

const GeneratedFileSchema = z.object({
  path: SafePathSchema,
  sha256: Sha256Schema,
  wasAbsentInitially: z.boolean(),
}).strict();

const CaseAccountingSchema = z.object({
  baseTaskDescriptionLoc: z.number().int().positive(),
  jsonPointerDeclarationLoc: z.number().int().positive(),
  combinedLoc: z.number().int().positive(),
  baseSemanticEntries: z.number().int().positive(),
  jsonPointerSemanticEntries: z.number().int().positive(),
  combinedSemanticEntries: z.number().int().positive(),
  withinThinLimit: z.boolean(),
  declarationHumanMinutes: z.number().int().nonnegative(),
}).strict().superRefine((accounting, context) => {
  if (accounting.baseTaskDescriptionLoc + accounting.jsonPointerDeclarationLoc !== accounting.combinedLoc
    || accounting.baseSemanticEntries + accounting.jsonPointerSemanticEntries !== accounting.combinedSemanticEntries) {
    context.addIssue({ code: "custom", message: "per-case declaration accounting does not conserve" });
  }
  const expectedWithin = accounting.combinedLoc <= THIN_TASK_DESCRIPTION_LIMITS.maxLoc
    && accounting.combinedSemanticEntries <= THIN_TASK_DESCRIPTION_LIMITS.maxSemanticEntries;
  if (accounting.withinThinLimit !== expectedWithin) {
    context.addIssue({ code: "custom", message: "per-case thin-limit status is inconsistent" });
  }
});

const ShadowCaseSchema = z.object({
  caseId: IdentifierSchema,
  taskId: IdentifierSchema,
  candidateDigest: Sha256Schema,
  structuralPlanDigest: Sha256Schema,
  basePlanDigest: Sha256Schema,
  pointerPlanDigest: Sha256Schema,
  packageManifestDigest: Sha256Schema,
  packageBytes: z.number().int().positive(),
  declaration: z.object({ reference: DigestRefSchema, operationCount: z.number().int().positive() }).strict(),
  declarationAccounting: CaseAccountingSchema,
  construction: z.object({
    status: z.literal("partial"),
    generatedFiles: z.array(GeneratedFileSchema).min(1),
    baseProjectedFieldCount: z.number().int().positive(),
    pointerCopiedFieldCount: z.number().int().positive(),
    parentUnresolvedCount: z.number().int().positive(),
    remainingUnresolved: z.array(AutomaticOutputUnresolvedSchema).min(1),
    remainingUnresolvedClassifications: z.array(UnresolvedClassificationSchema).min(1),
  }).strict(),
  execution: z.object({
    packageStatus: z.enum(["complete", "process-failure", "validation-failure", "infrastructure-failure", "protected-input-failure"]),
    processStatus: z.enum(["complete", "failed"]),
    validationStatus: z.enum(["pass", "fail"]).nullable(),
    validationErrorCodes: z.array(z.string()),
    generatedFilesWereAbsentInitially: z.boolean(),
    protectedInputsPreserved: z.boolean(),
    modelGenerationTokens: z.literal(0),
    modelRepairTokens: z.literal(0),
  }).strict(),
  sourceFieldRelationExecution: z.object({
    primitive: z.literal("source-field-projection"),
    relationCount: z.number().int().positive(),
    baseline: z.literal("pass"),
  }).strict(),
  pointerRelationExecution: z.object({
    primitive: z.literal("copy-json-value"),
    relationCount: z.number().int().positive(),
    baseline: z.literal("pass"),
    mismatch: z.literal("fail"),
  }).strict(),
  manualComparison: z.object({
    criterionCount: z.number().int().positive(),
    passedCriteria: z.number().int().nonnegative(),
    failedCriteria: z.number().int().nonnegative(),
    infrastructureFailureCriteria: z.number().int().nonnegative(),
    criteria: z.record(z.string(), ManualCriterionResultSchema),
    fullParity: z.literal("not-established"),
  }).strict().superRefine((comparison, context) => {
    if (comparison.passedCriteria + comparison.failedCriteria + comparison.infrastructureFailureCriteria
      !== comparison.criterionCount) {
      context.addIssue({ code: "custom", message: "manual criterion accounting does not conserve" });
    }
  }),
  semanticParity: z.literal("not-established"),
  automaticEligibility: z.literal(false),
}).strict().superRefine((entry, context) => {
  const remaining = entry.construction.remainingUnresolved.map(unresolvedKey).sort();
  const classified = entry.construction.remainingUnresolvedClassifications
    .map((item) => unresolvedKey(item.unresolved)).sort();
  if (!isDeepStrictEqual(remaining, classified)) {
    context.addIssue({ code: "custom", message: "every remaining unresolved item must have exactly one classification" });
  }
  if (entry.construction.parentUnresolvedCount
    !== entry.construction.pointerCopiedFieldCount + entry.construction.remainingUnresolved.length) {
    context.addIssue({ code: "custom", message: "resolved and remaining unresolved work does not conserve" });
  }
});

export const AutomaticJsonPointerConstructionShadowReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-json-pointer-construction-shadow-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  implementation: z.array(DigestRefSchema).min(1),
  declarationAndClassificationFreezeCompletedBeforeCurrentRunTaskOrEvaluatorRead: z.literal(true),
  generationFreeze: z.array(z.object({ caseId: IdentifierSchema, candidateDigest: Sha256Schema }).strict()).length(2),
  declarationAccounting: z.object({
    meteredScope: z.literal("declaration-and-shadow-after-core-green"),
    preMeasurementCoreWork: z.literal("not-measured"),
    baseTaskDescriptionLoc: z.number().int().positive(),
    jsonPointerDeclarationLoc: z.number().int().positive(),
    combinedLoc: z.number().int().positive(),
    baseSemanticEntries: z.number().int().positive(),
    jsonPointerSemanticEntries: z.number().int().positive(),
    combinedSemanticEntries: z.number().int().positive(),
    allCasesWithinThinLimit: z.boolean(),
    meteredHumanMinutes: z.number().int().nonnegative(),
    declarationHumanMinutes: z.number().int().nonnegative(),
    coreBranchDelta: z.literal(0),
  }).strict(),
  cases: z.array(ShadowCaseSchema).length(2),
  reuseGate: z.object({
    status: z.literal("passed"),
    primitive: z.literal("copy-json-value"),
    distinctPassingCases: z.literal(2),
    requiredDistinctCases: z.literal(2),
    coreBranchDelta: z.literal(0),
    fullDeclaredDomainPredicateParity: z.literal("not-established"),
  }).strict(),
  ceiling: z.object({
    classificationCounts: z.object({
      pointerProjectable: z.number().int().nonnegative(),
      selectorLookupProjectable: z.number().int().nonnegative(),
      needsDomainRuntime: z.number().int().nonnegative(),
    }).strict(),
    projectableByProjectionOrQuery: z.number().int().nonnegative(),
    theoreticalProjectionQueryUnresolvedFloor: z.number().int().nonnegative(),
    selectorLookupImplemented: z.literal(false),
    interpretation: z.literal("prospective-ceiling-not-implementation-evidence"),
  }).strict(),
  summary: z.object({
    caseCount: z.literal(2),
    generatedFileCount: z.number().int().positive(),
    baseProjectedFieldCount: z.number().int().positive(),
    pointerCopiedFieldCount: z.number().int().positive(),
    parentUnresolvedCount: z.number().int().positive(),
    remainingUnresolvedCount: z.number().int().positive(),
    completeConstructionCases: z.literal(0),
    fullSemanticParityCases: z.literal(0),
    automaticEligibilityCases: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    compilerEvaluatorPayloadAccesses: z.literal(0),
    manualOracleReads: z.literal(2),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  const freeze = new Map(report.generationFreeze.map((entry) => [entry.caseId, entry.candidateDigest]));
  if (freeze.size !== report.cases.length
    || report.cases.some((entry) => freeze.get(entry.caseId) !== entry.candidateDigest)) {
    context.addIssue({ code: "custom", message: "JSON Pointer construction freeze does not match report cases" });
  }
  const generated = report.cases.reduce((sum, entry) => sum + entry.construction.generatedFiles.length, 0);
  const baseProjected = report.cases.reduce((sum, entry) => sum + entry.construction.baseProjectedFieldCount, 0);
  const copied = report.cases.reduce((sum, entry) => sum + entry.construction.pointerCopiedFieldCount, 0);
  const parent = report.cases.reduce((sum, entry) => sum + entry.construction.parentUnresolvedCount, 0);
  const remaining = report.cases.reduce((sum, entry) => sum + entry.construction.remainingUnresolved.length, 0);
  if (generated !== report.summary.generatedFileCount
    || baseProjected !== report.summary.baseProjectedFieldCount
    || copied !== report.summary.pointerCopiedFieldCount
    || parent !== report.summary.parentUnresolvedCount
    || remaining !== report.summary.remainingUnresolvedCount) {
    context.addIssue({ code: "custom", message: "JSON Pointer construction summary does not conserve case counts" });
  }
  const classifications = report.cases.flatMap((entry) => entry.construction.remainingUnresolvedClassifications);
  const expectedCounts = {
    pointerProjectable: classifications.filter((entry) => entry.classification === "pointer-projectable").length,
    selectorLookupProjectable: classifications.filter((entry) => entry.classification === "selector-lookup-projectable").length,
    needsDomainRuntime: classifications.filter((entry) => entry.classification === "needs-domain-runtime").length,
  };
  if (!isDeepStrictEqual(report.ceiling.classificationCounts, expectedCounts)
    || report.ceiling.projectableByProjectionOrQuery
      !== expectedCounts.pointerProjectable + expectedCounts.selectorLookupProjectable
    || report.ceiling.theoreticalProjectionQueryUnresolvedFloor !== expectedCounts.needsDomainRuntime
    || classifications.length !== remaining) {
    context.addIssue({ code: "custom", message: "projection/query ceiling does not conserve classified unresolved work" });
  }
  const accounting = report.declarationAccounting;
  if (accounting.baseTaskDescriptionLoc + accounting.jsonPointerDeclarationLoc !== accounting.combinedLoc
    || accounting.baseSemanticEntries + accounting.jsonPointerSemanticEntries !== accounting.combinedSemanticEntries
    || accounting.declarationHumanMinutes
      !== report.cases.reduce((sum, entry) => sum + entry.declarationAccounting.declarationHumanMinutes, 0)
    || accounting.allCasesWithinThinLimit !== report.cases.every((entry) => entry.declarationAccounting.withinThinLimit)) {
    context.addIssue({ code: "custom", message: "aggregate declaration accounting does not conserve" });
  }
});

export type AutomaticJsonPointerConstructionShadowReport = z.infer<
  typeof AutomaticJsonPointerConstructionShadowReportSchema
>;

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: IdentifierSchema,
    split: z.string(),
    prompt: z.string(),
    fixtures: z.record(z.string()).optional(),
    eval: z.array(EvalCriterionSchema),
  }).passthrough()),
}).passthrough();
type Task = z.infer<typeof TaskSetSchema>["tasks"][number];

function unresolvedKey(entry: z.infer<typeof AutomaticOutputUnresolvedSchema>): string {
  return `${entry.targetRef}:${entry.path ?? ""}:${entry.field ?? ""}:${entry.reason}`;
}

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes repository root: ${path}`);
  return candidate;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(containedPath(rootDir, ref.path));
  const actual = sha256Bytes(bytes);
  if (actual !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}: expected ${ref.sha256}, received ${actual}`);
  return bytes;
}

async function materializeFixtures(workDir: string, task: Task): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const [fixturePath, content] of Object.entries(task.fixtures ?? {})) {
    const destination = resolve(workDir, SafePathSchema.parse(fixturePath));
    const fromRoot = relative(resolve(workDir), destination);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`fixture escapes workdir: ${fixturePath}`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
}

async function runManualCriteria(options: {
  task: Task;
  workDir: string;
  manifestReference: { path: string; sha256: string };
  evaluatorModule: string;
  inputPath: string;
}) {
  await writeFile(options.inputPath, jsonText({
    evaluatorModule: options.evaluatorModule,
    eval: options.task.eval,
    runs: [{ id: "generated", workDir: options.workDir, initialWorkdirManifest: options.manifestReference }],
  }), "utf8");
  const child = Bun.spawn([
    process.execPath,
    resolve(import.meta.dir, "automatic-structural-manual-checker.ts"),
    "--input",
    options.inputPath,
  ], { stdout: "pipe", stderr: "pipe", windowsHide: true });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`manual evaluator subprocess failed: ${stderr.trim()}`);
  const parsed = z.record(z.string(), z.record(z.string(), ManualCriterionResultSchema)).parse(JSON.parse(stdout.trim()));
  return parsed.generated ?? {};
}

function pointerSet(root: Record<string, unknown>, pointer: string, value: unknown): void {
  const segments = pointer.slice(1).split("/").map((raw) => raw.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current = root;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) current[segment] = value;
    else {
      const next = current[segment];
      current = typeof next === "object" && next !== null && !Array.isArray(next)
        ? next as Record<string, unknown>
        : current[segment] = {};
    }
  }
}

function semanticEntries(rawDescription: unknown): number {
  const description = ThinTaskDescriptionSchema.parse(rawDescription);
  const structural = description.outputs.reduce((sum, entry) =>
    sum + (entry.structure.kind === "json-object" ? entry.structure.requiredFields.length : 0), 0);
  return description.inputs.length + description.outputs.length + description.passCriteria.length + structural;
}

async function protectedInputsPreserved(
  initialEntries: Awaited<ReturnType<typeof snapshotWorkdir>>,
  currentEntries: Awaited<ReturnType<typeof snapshotWorkdir>>,
  protectedPaths: string[],
): Promise<boolean> {
  const initial = new Map(initialEntries.filter((entry) => entry.type === "file").map((entry) => [entry.path, entry.sha256]));
  const current = new Map(currentEntries.filter((entry) => entry.type === "file").map((entry) => [entry.path, entry.sha256]));
  return protectedPaths.every((path) => initial.get(path) !== undefined && initial.get(path) === current.get(path));
}

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/automatic-json-pointer-construction.ts",
  "src/benchmarks/skill-ir/automatic-json-pointer-construction-runner.ts",
  "src/benchmarks/skill-ir/automatic-json-pointer-construction-checker.ts",
  "src/benchmarks/skill-ir/automatic-json-pointer-construction-runtime.ts",
  "src/benchmarks/skill-ir/automatic-json-pointer-construction-shadow.ts",
  "src/benchmarks/skill-ir/automatic-json-pointer-construction-shadow-run.ts",
  "src/benchmarks/skill-ir/automatic-output-construction.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution.ts",
  "src/benchmarks/skill-ir/validated-artifact-assembly.ts",
  "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
] as const;

export async function runAutomaticJsonPointerConstructionShadow(
  rootDir: string,
  rawCatalog: AutomaticJsonPointerConstructionShadowCatalog,
  outDir: string,
  options: { measurementCompletedAt: string; meteredHumanMinutes: number },
): Promise<AutomaticJsonPointerConstructionShadowReport> {
  const catalog = AutomaticJsonPointerConstructionShadowCatalogSchema.parse(rawCatalog);
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt);
  const parentCatalog = AutomaticOutputConstructionShadowCatalogSchema.parse(JSON.parse(
    (await readPinned(rootDir, catalog.parentCatalog)).toString("utf8"),
  ));
  const parentReport = AutomaticOutputConstructionShadowReportSchema.parse(JSON.parse(
    (await readPinned(rootDir, catalog.parentReport)).toString("utf8"),
  ));
  if (parentReport.catalogSha256 !== catalog.parentCatalog.sha256) throw new Error("parent output catalog identity mismatch");
  const parentCases = new Map(parentReport.cases.map((entry) => [entry.caseId, entry]));

  const structuralCatalog = StructuralExecutionShadowCatalogSchema.parse(JSON.parse(
    (await readPinned(rootDir, parentCatalog.structuralCatalog)).toString("utf8"),
  ));
  const structuralReport = StructuralExecutionShadowReportSchema.parse(JSON.parse(
    (await readPinned(rootDir, parentCatalog.structuralReport)).toString("utf8"),
  ));
  const structuralCases = new Map(structuralCatalog.cases.map((entry) => [entry.caseId, entry]));
  const structuralFreeze = new Map(structuralReport.generationFreeze.map((entry) => [entry.caseId, entry.candidateDigest]));
  const domainCatalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(
    (await readPinned(rootDir, structuralCatalog.automaticDomainCatalog)).toString("utf8"),
  ));
  const domainReport = DomainAutomaticConstructionShadowReportSchema.parse(JSON.parse(
    (await readPinned(rootDir, structuralCatalog.automaticDomainReport)).toString("utf8"),
  ));
  const domainCases = new Map(domainCatalog.cases.map((entry) => [entry.caseId, entry]));
  const domainFreeze = new Map(domainReport.generationFreeze.map((entry) => [entry.caseId, entry.candidateDigest]));

  const frozen = new Map<string, {
    candidate: DomainAutomaticConstructionResult;
    candidateDigest: string;
    structuralPlan: StructuralExecutionPlan;
    sourceBytes: Buffer;
    declaration: JsonPointerCopyDeclaration;
    declarationBytes: Buffer;
    descriptionBytes: Buffer;
    description: unknown;
    classifications: z.infer<typeof UnresolvedClassificationSchema>[];
  }>();
  for (const caseConfig of catalog.cases) {
    const structuralCase = structuralCases.get(caseConfig.caseId);
    const domainCase = domainCases.get(caseConfig.caseId);
    const parentCase = parentCases.get(caseConfig.caseId);
    if (!structuralCase || !domainCase || !parentCase) throw new Error(`parent shadow case is missing: ${caseConfig.caseId}`);
    if (!isDeepStrictEqual(domainCase.generationInput.taskDescription, {
      ...caseConfig.taskDescription,
      authoring: domainCase.generationInput.taskDescription.authoring,
    })) throw new Error(`task description identity drift for ${caseConfig.caseId}`);
    const [declarationBytes, descriptionBytes] = await Promise.all([
      readPinned(rootDir, caseConfig.jsonPointerDeclaration),
      readPinned(rootDir, caseConfig.taskDescription),
    ]);
    const declaration = JsonPointerCopyDeclarationSchema.parse(JSON.parse(declarationBytes.toString("utf8")));
    const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionBytes.toString("utf8")));
    const candidate = await constructDomainSkillCandidates(rootDir, domainCase.generationInput);
    const candidateDigest = sha256Bytes(Buffer.from(jsonText(candidate)));
    if (candidateDigest !== caseConfig.expectedCandidateDigest
      || candidateDigest !== structuralFreeze.get(caseConfig.caseId)
      || candidateDigest !== domainFreeze.get(caseConfig.caseId)
      || candidateDigest !== parentCase.candidateDigest) {
      throw new Error(`candidate freeze drift for ${caseConfig.caseId}`);
    }
    frozen.set(caseConfig.caseId, {
      candidate,
      candidateDigest,
      structuralPlan: compileStructuralExecutionPlan(candidate, structuralCase.bindings),
      sourceBytes: await readFile(containedPath(rootDir, domainCase.generationInput.source.path)),
      declaration,
      declarationBytes,
      descriptionBytes,
      description,
      classifications: caseConfig.remainingUnresolvedClassifications,
    });
  }

  // Current-run task bytes and evaluator modules are read only after declarations, classifications, and candidates freeze.
  const tasks = new Map<string, Task>();
  for (const caseConfig of catalog.cases) {
    const structuralCase = structuralCases.get(caseConfig.caseId)!;
    const taskSet = TaskSetSchema.parse(JSON.parse((await readPinned(rootDir, structuralCase.taskSet)).toString("utf8")));
    const task = taskSet.tasks.find((entry) => entry.id === structuralCase.taskId);
    if (!task) throw new Error(`task ${structuralCase.taskId} is missing for ${caseConfig.caseId}`);
    tasks.set(caseConfig.caseId, task);
  }

  const executionRoot = await mkdtemp(join(tmpdir(), "skill-ir-json-pointer-shadow-"));
  try {
    const cases = [];
    for (const caseConfig of catalog.cases) {
      const parent = structuralCases.get(caseConfig.caseId)!;
      const parentCase = parentCases.get(caseConfig.caseId)!;
      const generated = frozen.get(caseConfig.caseId)!;
      const task = tasks.get(caseConfig.caseId)!;
      const caseRoot = join(executionRoot, caseConfig.caseId);
      const workDir = join(caseRoot, "workdir");
      await materializeFixtures(workDir, task);
      const manifestReference = await writeInitialWorkdirManifest({
        workDir,
        manifestPath: join(caseRoot, "initial-workdir-manifest.json"),
      });
      const initialManifest = await readInitialWorkdirManifest({ workDir, reference: manifestReference });
      const initialPaths = new Set(initialManifest.entries.map((entry) => entry.path));
      const basePlan = await compileAutomaticOutputConstructionPlan({
        workDir,
        structuralPlan: generated.structuralPlan,
      });
      if (!isDeepStrictEqual(basePlan.unresolved, parentCase.construction.unresolved)) {
        throw new Error(`parent unresolved identity drift for ${caseConfig.caseId}`);
      }
      const pointerPlan = await compileAutomaticJsonPointerConstructionPlan({
        workDir,
        structuralPlan: generated.structuralPlan,
        basePlan,
        declaration: generated.declaration,
      });
      const classified = generated.classifications.map((entry) => unresolvedKey(entry.unresolved)).sort();
      const remaining = pointerPlan.remainingUnresolved.map(unresolvedKey).sort();
      if (!isDeepStrictEqual(classified, remaining)) {
        throw new Error(`remaining unresolved classification drift for ${caseConfig.caseId}`);
      }
      const packageRecord = await buildAutomaticJsonPointerConstructionPackage({
        packageDir: join(caseRoot, "package"),
        candidate: generated.candidate,
        structuralPlan: generated.structuralPlan,
        basePlan,
        pointerPlan,
        initialManifest,
        sourceBytes: generated.sourceBytes,
        taskId: task.id,
        taskPrompt: task.prompt,
      });
      const runtime = await runValidatedArtifactPlan({ package: packageRecord, workDir });
      const [baseRelation, pointerBaseline] = await Promise.all([
        evaluateAutomaticOutputRelations(workDir, basePlan),
        evaluateAutomaticJsonPointerRelations(workDir, pointerPlan),
      ]);
      const beforeMismatch = await snapshotWorkdir(workDir);
      const generatedFiles = await Promise.all(basePlan.outputs.map(async (entry) => ({
        path: entry.path,
        sha256: sha256Bytes(await readFile(resolve(workDir, entry.path))),
        wasAbsentInitially: !initialPaths.has(entry.path),
      })));

      await readPinned(rootDir, parent.manualEvaluatorModule);
      const manualCriteria = await runManualCriteria({
        task,
        workDir,
        manifestReference,
        evaluatorModule: containedPath(rootDir, parent.manualEvaluatorModule.path),
        inputPath: join(caseRoot, "manual-evaluator-input.json"),
      });
      const manualValues = Object.values(manualCriteria);

      const firstOperation = pointerPlan.operations[0]!;
      const outputDocument = JSON.parse(await readFile(resolve(workDir, firstOperation.target.path), "utf8")) as Record<string, unknown>;
      pointerSet(outputDocument, firstOperation.target.jsonPointer, "__mismatch__");
      await writeFile(resolve(workDir, firstOperation.target.path), jsonText(outputDocument), "utf8");
      const pointerMismatch = await evaluateAutomaticJsonPointerRelations(workDir, pointerPlan);
      const baseLoc = generated.descriptionBytes.toString("utf8").split(/\r?\n/u).length;
      const declarationLoc = generated.declarationBytes.toString("utf8").split(/\r?\n/u).length;
      const baseSemanticEntries = semanticEntries(generated.description);
      const pointerSemanticEntries = generated.declaration.operations.length;
      const combinedLoc = baseLoc + declarationLoc;
      const combinedSemanticEntries = baseSemanticEntries + pointerSemanticEntries;
      const processNode = runtime.nodes.find((entry) => entry.id === "construct-outputs");
      cases.push({
        caseId: caseConfig.caseId,
        taskId: task.id,
        candidateDigest: generated.candidateDigest,
        structuralPlanDigest: sha256Bytes(Buffer.from(jsonText(generated.structuralPlan))),
        basePlanDigest: sha256Bytes(Buffer.from(jsonText(basePlan))),
        pointerPlanDigest: sha256Bytes(Buffer.from(jsonText(pointerPlan))),
        packageManifestDigest: sha256Bytes(await readFile(join(packageRecord.packageDir, "package-manifest.json"))),
        packageBytes: packageRecord.packageBytes,
        declaration: {
          reference: { path: caseConfig.jsonPointerDeclaration.path, sha256: caseConfig.jsonPointerDeclaration.sha256 },
          operationCount: generated.declaration.operations.length,
        },
        declarationAccounting: {
          baseTaskDescriptionLoc: baseLoc,
          jsonPointerDeclarationLoc: declarationLoc,
          combinedLoc,
          baseSemanticEntries,
          jsonPointerSemanticEntries: pointerSemanticEntries,
          combinedSemanticEntries,
          withinThinLimit: combinedLoc <= THIN_TASK_DESCRIPTION_LIMITS.maxLoc
            && combinedSemanticEntries <= THIN_TASK_DESCRIPTION_LIMITS.maxSemanticEntries,
          declarationHumanMinutes: caseConfig.jsonPointerDeclaration.authoring.humanMinutes,
        },
        construction: {
          status: pointerPlan.status,
          generatedFiles,
          baseProjectedFieldCount: basePlan.outputs.reduce((sum, entry) => sum + entry.assignments.length, 0),
          pointerCopiedFieldCount: pointerPlan.operations.length,
          parentUnresolvedCount: basePlan.unresolved.length,
          remainingUnresolved: pointerPlan.remainingUnresolved,
          remainingUnresolvedClassifications: generated.classifications,
        },
        execution: {
          packageStatus: runtime.status,
          processStatus: processNode?.status ?? "failed",
          validationStatus: runtime.validation?.status ?? null,
          validationErrorCodes: runtime.validation?.errors.map((entry) => entry.code) ?? [],
          generatedFilesWereAbsentInitially: generatedFiles.every((entry) => entry.wasAbsentInitially),
          protectedInputsPreserved: await protectedInputsPreserved(
            initialManifest.entries,
            beforeMismatch,
            packageRecord.manifest.protectedInputs,
          ),
          modelGenerationTokens: runtime.modelGenerationTokens,
          modelRepairTokens: runtime.modelRepairTokens,
        },
        sourceFieldRelationExecution: {
          primitive: "source-field-projection" as const,
          relationCount: baseRelation.relationCount,
          baseline: baseRelation.status,
        },
        pointerRelationExecution: {
          primitive: "copy-json-value" as const,
          relationCount: pointerBaseline.relationCount,
          baseline: pointerBaseline.status,
          mismatch: pointerMismatch.status,
        },
        manualComparison: {
          criterionCount: manualValues.length,
          passedCriteria: manualValues.filter((entry) => entry.status === "pass").length,
          failedCriteria: manualValues.filter((entry) => entry.status === "fail").length,
          infrastructureFailureCriteria: manualValues.filter((entry) => entry.status === "infrastructure-failure").length,
          criteria: manualCriteria,
          fullParity: "not-established" as const,
        },
        semanticParity: "not-established" as const,
        automaticEligibility: false as const,
      });
    }

    const reuseGate = evaluateAutomaticJsonPointerReuseGate(cases.map((entry) => ({
      caseId: entry.caseId,
      primitive: "copy-json-value" as const,
      status: entry.pointerRelationExecution.baseline,
      skillSpecificBranches: 0,
    })));
    const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
      path,
      sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
    })));
    const baseTaskDescriptionLoc = cases.reduce((sum, entry) => sum + entry.declarationAccounting.baseTaskDescriptionLoc, 0);
    const jsonPointerDeclarationLoc = cases.reduce((sum, entry) => sum + entry.declarationAccounting.jsonPointerDeclarationLoc, 0);
    const baseSemanticEntries = cases.reduce((sum, entry) => sum + entry.declarationAccounting.baseSemanticEntries, 0);
    const jsonPointerSemanticEntries = cases.reduce((sum, entry) => sum + entry.declarationAccounting.jsonPointerSemanticEntries, 0);
    const classifications = cases.flatMap((entry) => entry.construction.remainingUnresolvedClassifications);
    const classificationCounts = {
      pointerProjectable: classifications.filter((entry) => entry.classification === "pointer-projectable").length,
      selectorLookupProjectable: classifications.filter((entry) => entry.classification === "selector-lookup-projectable").length,
      needsDomainRuntime: classifications.filter((entry) => entry.classification === "needs-domain-runtime").length,
    };
    const report = AutomaticJsonPointerConstructionShadowReportSchema.parse({
      schemaVersion: "skill-ir-automatic-json-pointer-construction-shadow-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog))),
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      implementation,
      declarationAndClassificationFreezeCompletedBeforeCurrentRunTaskOrEvaluatorRead: true,
      generationFreeze: cases.map((entry) => ({ caseId: entry.caseId, candidateDigest: entry.candidateDigest })),
      declarationAccounting: {
        ...catalog.costBoundary,
        baseTaskDescriptionLoc,
        jsonPointerDeclarationLoc,
        combinedLoc: baseTaskDescriptionLoc + jsonPointerDeclarationLoc,
        baseSemanticEntries,
        jsonPointerSemanticEntries,
        combinedSemanticEntries: baseSemanticEntries + jsonPointerSemanticEntries,
        allCasesWithinThinLimit: cases.every((entry) => entry.declarationAccounting.withinThinLimit),
        meteredHumanMinutes: options.meteredHumanMinutes,
        declarationHumanMinutes: catalog.cases.reduce((sum, entry) => sum + entry.jsonPointerDeclaration.authoring.humanMinutes, 0),
        coreBranchDelta: 0,
      },
      cases,
      reuseGate: { ...reuseGate, fullDeclaredDomainPredicateParity: "not-established" },
      ceiling: {
        classificationCounts,
        projectableByProjectionOrQuery: classificationCounts.pointerProjectable
          + classificationCounts.selectorLookupProjectable,
        theoreticalProjectionQueryUnresolvedFloor: classificationCounts.needsDomainRuntime,
        selectorLookupImplemented: false,
        interpretation: "prospective-ceiling-not-implementation-evidence",
      },
      summary: {
        caseCount: cases.length,
        generatedFileCount: cases.reduce((sum, entry) => sum + entry.construction.generatedFiles.length, 0),
        baseProjectedFieldCount: cases.reduce((sum, entry) => sum + entry.construction.baseProjectedFieldCount, 0),
        pointerCopiedFieldCount: cases.reduce((sum, entry) => sum + entry.construction.pointerCopiedFieldCount, 0),
        parentUnresolvedCount: cases.reduce((sum, entry) => sum + entry.construction.parentUnresolvedCount, 0),
        remainingUnresolvedCount: cases.reduce((sum, entry) => sum + entry.construction.remainingUnresolved.length, 0),
        completeConstructionCases: 0,
        fullSemanticParityCases: 0,
        automaticEligibilityCases: 0,
        paidCalls: 0,
        heldOutAccesses: 0,
        compilerEvaluatorPayloadAccesses: 0,
        manualOracleReads: cases.length,
        coreBranchDelta: 0,
      },
    });
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "report.json"), jsonText(report), "utf8");
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
