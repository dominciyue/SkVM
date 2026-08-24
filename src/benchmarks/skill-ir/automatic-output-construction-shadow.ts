import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { EvalCriterionSchema } from "../../core/types";
import {
  readInitialWorkdirManifest,
  snapshotWorkdir,
  writeInitialWorkdirManifest,
} from "../../core/workdir-manifest";
import {
  constructDomainSkillCandidates,
  type DomainAutomaticConstructionResult,
} from "./automatic-domain-construction";
import {
  DomainAutomaticConstructionShadowCatalogSchema,
  DomainAutomaticConstructionShadowReportSchema,
} from "./automatic-domain-construction-shadow";
import {
  AutomaticOutputConstructionPlanSchema,
  AutomaticOutputUnresolvedSchema,
  compileAutomaticOutputConstructionPlan,
  evaluateAutomaticOutputRelations,
  evaluateAutomaticOutputReuseGate,
  type AutomaticOutputConstructionPlan,
} from "./automatic-output-construction";
import { buildAutomaticOutputConstructionPackage } from "./automatic-output-construction-runtime";
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

export const AutomaticOutputConstructionShadowCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-output-construction-shadow-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  structuralCatalog: DigestRefSchema,
  structuralReport: DigestRefSchema,
  costBoundary: z.object({
    meteredScope: z.literal("shadow-integration-after-catalog-freeze"),
    preMeasurementCoreWork: z.literal("not-measured"),
  }).strict(),
  cases: z.array(z.object({
    caseId: IdentifierSchema,
    expectedCandidateDigest: Sha256Schema,
    minimumProjectionCount: z.number().int().positive(),
  }).strict()).length(2),
}).strict().superRefine((catalog, context) => {
  if (new Set(catalog.cases.map((entry) => entry.caseId)).size !== catalog.cases.length) {
    context.addIssue({ code: "custom", message: "automatic output shadow cases must be unique" });
  }
});

export type AutomaticOutputConstructionShadowCatalog = z.infer<typeof AutomaticOutputConstructionShadowCatalogSchema>;

const ManualCriterionResultSchema = z.object({
  status: z.enum(["pass", "fail", "infrastructure-failure"]),
  details: z.string().optional(),
}).strict();

const GeneratedFileSchema = z.object({
  path: SafePathSchema,
  sha256: Sha256Schema,
  wasAbsentInitially: z.boolean(),
}).strict();

const OutputShadowCaseSchema = z.object({
  caseId: IdentifierSchema,
  taskId: IdentifierSchema,
  candidateDigest: Sha256Schema,
  structuralPlanDigest: Sha256Schema,
  constructionPlanDigest: Sha256Schema,
  packageManifestDigest: Sha256Schema,
  packageBytes: z.number().int().positive(),
  construction: z.object({
    status: z.literal("partial"),
    generatedFiles: z.array(GeneratedFileSchema).min(1),
    projectedFieldCount: z.number().int().positive(),
    unresolved: z.array(AutomaticOutputUnresolvedSchema),
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
  relationExecution: z.object({
    primitive: z.literal("source-field-projection"),
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
}).strict();

export const AutomaticOutputConstructionShadowReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-output-construction-shadow-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  implementation: z.array(DigestRefSchema).min(1),
  candidateFreezeCompletedBeforeTaskOrEvaluatorRead: z.literal(true),
  generationFreeze: z.array(z.object({ caseId: IdentifierSchema, candidateDigest: Sha256Schema }).strict()).length(2),
  costAccounting: z.object({
    meteredScope: z.literal("shadow-integration-after-catalog-freeze"),
    preMeasurementCoreWork: z.literal("not-measured"),
    meteredHumanMinutes: z.number().int().nonnegative(),
    shadowDeclarationLoc: z.number().int().positive(),
    coreBranchDelta: z.literal(0),
  }).strict(),
  cases: z.array(OutputShadowCaseSchema).length(2),
  reuseGate: z.object({
    status: z.literal("passed"),
    primitive: z.literal("source-field-projection"),
    distinctPassingCases: z.literal(2),
    requiredDistinctCases: z.literal(2),
    coreBranchDelta: z.literal(0),
    fullDeclaredDomainPredicateParity: z.literal("not-established"),
  }).strict(),
  summary: z.object({
    caseCount: z.literal(2),
    generatedFileCount: z.number().int().positive(),
    projectedFieldCount: z.number().int().positive(),
    unresolvedCount: z.number().int().positive(),
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
    context.addIssue({ code: "custom", message: "output construction freeze does not match report cases" });
  }
  const generatedFileCount = report.cases.reduce((sum, entry) => sum + entry.construction.generatedFiles.length, 0);
  const projectedFieldCount = report.cases.reduce((sum, entry) => sum + entry.construction.projectedFieldCount, 0);
  const unresolvedCount = report.cases.reduce((sum, entry) => sum + entry.construction.unresolved.length, 0);
  if (generatedFileCount !== report.summary.generatedFileCount
    || projectedFieldCount !== report.summary.projectedFieldCount
    || unresolvedCount !== report.summary.unresolvedCount) {
    context.addIssue({ code: "custom", message: "output construction summary does not conserve case counts" });
  }
  if (report.cases.some((entry) => entry.automaticEligibility || entry.semanticParity !== "not-established")) {
    context.addIssue({ code: "custom", message: "partial output shadow cannot claim eligibility or semantic parity" });
  }
});

export type AutomaticOutputConstructionShadowReport = z.infer<typeof AutomaticOutputConstructionShadowReportSchema>;

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
  "src/benchmarks/skill-ir/automatic-output-construction.ts",
  "src/benchmarks/skill-ir/automatic-output-construction-runner.ts",
  "src/benchmarks/skill-ir/automatic-output-construction-checker.ts",
  "src/benchmarks/skill-ir/automatic-output-construction-runtime.ts",
  "src/benchmarks/skill-ir/automatic-output-construction-shadow.ts",
  "src/benchmarks/skill-ir/automatic-output-construction-shadow-run.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution.ts",
  "src/benchmarks/skill-ir/validated-artifact-assembly.ts",
  "src/benchmarks/skill-ir/validated-artifact-runtime.ts",
] as const;

export async function runAutomaticOutputConstructionShadow(
  rootDir: string,
  rawCatalog: AutomaticOutputConstructionShadowCatalog,
  outDir: string,
  options: { measurementCompletedAt: string; meteredHumanMinutes: number },
): Promise<AutomaticOutputConstructionShadowReport> {
  const catalog = AutomaticOutputConstructionShadowCatalogSchema.parse(rawCatalog);
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt);
  const structuralCatalogBytes = await readPinned(rootDir, catalog.structuralCatalog);
  const structuralReportBytes = await readPinned(rootDir, catalog.structuralReport);
  const structuralCatalog = StructuralExecutionShadowCatalogSchema.parse(JSON.parse(structuralCatalogBytes.toString("utf8")));
  const structuralReport = StructuralExecutionShadowReportSchema.parse(JSON.parse(structuralReportBytes.toString("utf8")));
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
  }>();
  for (const caseConfig of catalog.cases) {
    const structuralCase = structuralCases.get(caseConfig.caseId);
    const domainCase = domainCases.get(caseConfig.caseId);
    if (!structuralCase || !domainCase) throw new Error(`parent shadow case is missing: ${caseConfig.caseId}`);
    const candidate = await constructDomainSkillCandidates(rootDir, domainCase.generationInput);
    const candidateDigest = sha256Bytes(Buffer.from(jsonText(candidate)));
    if (candidateDigest !== caseConfig.expectedCandidateDigest
      || candidateDigest !== structuralFreeze.get(caseConfig.caseId)
      || candidateDigest !== domainFreeze.get(caseConfig.caseId)) {
      throw new Error(`candidate freeze drift for ${caseConfig.caseId}`);
    }
    frozen.set(caseConfig.caseId, {
      candidate,
      candidateDigest,
      structuralPlan: compileStructuralExecutionPlan(candidate, structuralCase.bindings),
      sourceBytes: await readFile(containedPath(rootDir, domainCase.generationInput.source.path)),
    });
  }

  // Task bytes, evaluator payloads, and evaluator modules are read only after every candidate digest is frozen.
  const tasks = new Map<string, Task>();
  for (const caseConfig of catalog.cases) {
    const structuralCase = structuralCases.get(caseConfig.caseId)!;
    const taskSet = TaskSetSchema.parse(JSON.parse((await readPinned(rootDir, structuralCase.taskSet)).toString("utf8")));
    const task = taskSet.tasks.find((entry) => entry.id === structuralCase.taskId);
    if (!task) throw new Error(`task ${structuralCase.taskId} is missing for ${caseConfig.caseId}`);
    tasks.set(caseConfig.caseId, task);
  }

  const executionRoot = await mkdtemp(join(tmpdir(), "skill-ir-output-shadow-"));
  try {
    const cases = [];
    for (const caseConfig of catalog.cases) {
      const parent = structuralCases.get(caseConfig.caseId)!;
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
      const constructionPlan = await compileAutomaticOutputConstructionPlan({
        workDir,
        structuralPlan: generated.structuralPlan,
      });
      const projectedFieldCount = constructionPlan.outputs.reduce((sum, entry) => sum + entry.assignments.length, 0);
      if (projectedFieldCount < caseConfig.minimumProjectionCount) {
        throw new Error(`projection floor is not met for ${caseConfig.caseId}`);
      }
      const packageRecord = await buildAutomaticOutputConstructionPackage({
        packageDir: join(caseRoot, "package"),
        candidate: generated.candidate,
        structuralPlan: generated.structuralPlan,
        constructionPlan,
        initialManifest,
        sourceBytes: generated.sourceBytes,
        taskId: task.id,
        taskPrompt: task.prompt,
      });
      const runtime = await runValidatedArtifactPlan({ package: packageRecord, workDir });
      const relationBaseline = await evaluateAutomaticOutputRelations(workDir, constructionPlan);
      const currentBeforeMismatch = await snapshotWorkdir(workDir);
      const generatedFiles = await Promise.all(constructionPlan.outputs.map(async (entry) => ({
        path: entry.path,
        sha256: sha256Bytes(await readFile(resolve(workDir, entry.path))),
        wasAbsentInitially: !initialPaths.has(entry.path),
      })));

      // Manual evaluation is deliberately post-freeze and post-generation; it never enters compiler inputs.
      await readPinned(rootDir, parent.manualEvaluatorModule);
      const manualCriteria = await runManualCriteria({
        task,
        workDir,
        manifestReference,
        evaluatorModule: containedPath(rootDir, parent.manualEvaluatorModule.path),
        inputPath: join(caseRoot, "manual-evaluator-input.json"),
      });
      const manualValues = Object.values(manualCriteria);

      const firstOutput = constructionPlan.outputs[0]!;
      const firstAssignment = firstOutput.assignments[0]!;
      const outputDocument = JSON.parse(await readFile(resolve(workDir, firstOutput.path), "utf8")) as Record<string, unknown>;
      pointerSet(outputDocument, firstAssignment.targetJsonPointer, "__mismatch__");
      await writeFile(resolve(workDir, firstOutput.path), jsonText(outputDocument), "utf8");
      const relationMismatch = await evaluateAutomaticOutputRelations(workDir, constructionPlan);
      const processNode = runtime.nodes.find((entry) => entry.id === "construct-outputs");
      cases.push({
        caseId: caseConfig.caseId,
        taskId: task.id,
        candidateDigest: generated.candidateDigest,
        structuralPlanDigest: sha256Bytes(Buffer.from(jsonText(generated.structuralPlan))),
        constructionPlanDigest: sha256Bytes(Buffer.from(jsonText(constructionPlan))),
        packageManifestDigest: sha256Bytes(await readFile(join(packageRecord.packageDir, "package-manifest.json"))),
        packageBytes: packageRecord.packageBytes,
        construction: {
          status: constructionPlan.status,
          generatedFiles,
          projectedFieldCount,
          unresolved: constructionPlan.unresolved,
        },
        execution: {
          packageStatus: runtime.status,
          processStatus: processNode?.status ?? "failed",
          validationStatus: runtime.validation?.status ?? null,
          validationErrorCodes: runtime.validation?.errors.map((entry) => entry.code) ?? [],
          generatedFilesWereAbsentInitially: generatedFiles.every((entry) => entry.wasAbsentInitially),
          protectedInputsPreserved: await protectedInputsPreserved(
            initialManifest.entries,
            currentBeforeMismatch,
            packageRecord.manifest.protectedInputs,
          ),
          modelGenerationTokens: runtime.modelGenerationTokens,
          modelRepairTokens: runtime.modelRepairTokens,
        },
        relationExecution: {
          primitive: "source-field-projection" as const,
          relationCount: relationBaseline.relationCount,
          baseline: relationBaseline.status,
          mismatch: relationMismatch.status,
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

    const baseReuseGate = evaluateAutomaticOutputReuseGate(cases.map((entry) => ({
      caseId: entry.caseId,
      primitive: "source-field-projection" as const,
      status: entry.relationExecution.baseline,
      skillSpecificBranches: 0,
    })));
    const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
      path,
      sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
    })));
    const report = AutomaticOutputConstructionShadowReportSchema.parse({
      schemaVersion: "skill-ir-automatic-output-construction-shadow-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog))),
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      implementation,
      candidateFreezeCompletedBeforeTaskOrEvaluatorRead: true,
      generationFreeze: cases.map((entry) => ({ caseId: entry.caseId, candidateDigest: entry.candidateDigest })),
      costAccounting: {
        ...catalog.costBoundary,
        meteredHumanMinutes: options.meteredHumanMinutes,
        shadowDeclarationLoc: jsonText(catalog).split(/\r?\n/u).length,
        coreBranchDelta: 0,
      },
      cases,
      reuseGate: {
        ...baseReuseGate,
        fullDeclaredDomainPredicateParity: "not-established",
      },
      summary: {
        caseCount: cases.length,
        generatedFileCount: cases.reduce((sum, entry) => sum + entry.construction.generatedFiles.length, 0),
        projectedFieldCount: cases.reduce((sum, entry) => sum + entry.construction.projectedFieldCount, 0),
        unresolvedCount: cases.reduce((sum, entry) => sum + entry.construction.unresolved.length, 0),
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
