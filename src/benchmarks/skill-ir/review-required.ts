import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { EvalCriterionSchema } from "../../core/types";
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
  snapshotWorkdir,
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest";
import { ThinTaskDescriptionSchema } from "./automatic-domain-construction";
import { GenericDomainPlanRepairReportSchema } from "./automatic-domain-plan-generic-repair";
import { summarizeManualEvaluation } from "./automatic-domain-plan-manual-parity";
import { executeRestrictedDomainPlan, RestrictedDomainPlanSchema } from "./automatic-restricted-domain-plan";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: IdentifierSchema,
    split: z.literal("development"),
    prompt: z.string().min(1),
    fixtures: z.record(z.string()),
    eval: z.array(EvalCriterionSchema).min(1),
    hardGateIds: z.array(z.string()).default([]),
    passThreshold: z.number().min(0).max(1),
  }).passthrough()).min(2),
}).passthrough();

export const ReviewRequiredCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-review-required-catalog/v1"),
  catalogId: IdentifierSchema,
  caseId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  automaticReport: DigestRefSchema,
  automaticPlan: DigestRefSchema,
  source: DigestRefSchema,
  taskDescription: DigestRefSchema,
  taskSet: DigestRefSchema,
  manualEvaluatorModule: DigestRefSchema,
  taskIds: z.tuple([IdentifierSchema, IdentifierSchema]).refine((ids) => ids[0] !== ids[1]),
  publicInterfacePath: SafePathSchema,
  declaredOutputPaths: z.array(SafePathSchema).min(1),
  patchPath: SafePathSchema,
  budget: z.object({
    maximumHumanMinutes: z.number().positive().max(240),
    maximumPaidCalls: z.literal(0),
    retries: z.literal(0),
  }).strict(),
}).strict();

export type ReviewRequiredCatalog = z.infer<typeof ReviewRequiredCatalogSchema>;

const CriterionSchema = z.object({
  id: z.string().min(1),
  weight: z.number().positive(),
  hardGate: z.boolean(),
  status: z.enum(["pass", "fail", "infrastructure-failure"]),
}).strict();

const EvaluationSchema = z.object({
  criteria: z.array(CriterionSchema).min(1),
  summary: z.object({
    passedCriteria: z.number().int().nonnegative(),
    criterionCount: z.number().int().positive(),
    passRate: z.number().min(0).max(1),
    weightedScore: z.number().min(0).max(1),
    passThreshold: z.number().min(0).max(1),
    hardGatePassed: z.boolean(),
    thresholdPassed: z.boolean(),
    infrastructureFailures: z.number().int().nonnegative(),
    fullCriterionPass: z.boolean(),
    distanceToFull: z.number().int().nonnegative(),
  }).strict(),
}).strict();

const AggregateEvaluationSchema = z.object({
  passedCriteria: z.number().int().nonnegative(),
  criterionCount: z.number().int().positive(),
  fullParityTasks: z.number().int().min(0).max(2),
  distanceToFull: z.number().int().nonnegative(),
}).strict();

const StageCostSchema = z.object({
  modelCalls: z.number().int().nonnegative(),
  modelTokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
}).strict();

export const ReviewRequiredReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-review-required-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  caseId: IdentifierSchema,
  status: z.literal("review-required"),
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  inputs: z.object({
    automaticReport: DigestRefSchema,
    automaticPlan: DigestRefSchema,
    source: DigestRefSchema,
    taskDescription: DigestRefSchema,
    taskSet: DigestRefSchema,
    manualEvaluatorModule: DigestRefSchema,
  }).strict(),
  implementation: z.array(DigestRefSchema).min(1),
  patch: z.object({
    path: SafePathSchema,
    sha256: Sha256Schema,
    physicalLoc: z.number().int().positive(),
    humanMinutes: z.number().nonnegative().max(240),
    authoringStartedAt: z.string().datetime(),
    authoringCompletedAt: z.string().datetime(),
    sourceAudit: z.literal("passed"),
    coreBranchDelta: z.literal(0),
    projectModelCalls: z.literal(0),
  }).strict(),
  construction: z.object({
    synthesis: StageCostSchema.extend({ evidence: DigestRefSchema }),
    reviewPatch: StageCostSchema.extend({
      humanMinutes: z.number().nonnegative(),
      physicalLoc: z.number().int().positive(),
      durationDisposition: z.literal("human-time-recorded-separately"),
    }),
    compile: StageCostSchema,
    profile: StageCostSchema.extend({ disposition: z.literal("not-applicable-profile-empty") }),
    package: StageCostSchema.extend({
      bytes: z.number().int().positive(),
      manifestSha256: Sha256Schema,
      planSha256: Sha256Schema,
      patchBundleSha256: Sha256Schema,
    }),
  }).strict(),
  tasks: z.array(z.object({
    taskId: IdentifierSchema,
    automaticPlan: z.object({ runtimeComplete: z.boolean(), durationMs: z.number().nonnegative(), exactOutputDelta: z.boolean() }).strict(),
    reviewPatch: z.object({ runtimeComplete: z.boolean(), durationMs: z.number().nonnegative(), exactOutputDelta: z.boolean() }).strict(),
    protectedInputsPreservedAfterAutomatic: z.boolean(),
    protectedInputsPreservedAfterReview: z.boolean(),
    automaticOnly: EvaluationSchema,
    reviewed: EvaluationSchema,
    fullReviewedParity: z.boolean(),
  }).strict()).length(2),
  automaticOnly: z.object({
    reproducedFrozenEvidence: z.boolean(),
    summary: AggregateEvaluationSchema,
  }).strict(),
  reviewed: z.object({ summary: AggregateEvaluationSchema }).strict(),
  automaticPlanDigestPreserved: z.boolean(),
  automationEligibilityChanged: z.literal(false),
  optimizedClassificationChanged: z.literal(false),
  readinessChanged: z.literal(false),
  replicationAuthorized: z.literal(false),
  authorization: z.object({
    paidCalls: z.literal(0),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccessesByPatch: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  const automaticPassed = report.tasks.reduce((sum, task) => sum + task.automaticOnly.summary.passedCriteria, 0);
  const reviewedPassed = report.tasks.reduce((sum, task) => sum + task.reviewed.summary.passedCriteria, 0);
  const criterionCount = report.tasks.reduce((sum, task) => sum + task.reviewed.summary.criterionCount, 0);
  const reviewedFull = report.tasks.filter((task) => task.fullReviewedParity).length;
  if (report.automaticOnly.summary.passedCriteria !== automaticPassed
    || report.reviewed.summary.passedCriteria !== reviewedPassed
    || report.automaticOnly.summary.criterionCount !== criterionCount
    || report.reviewed.summary.criterionCount !== criterionCount
    || report.reviewed.summary.fullParityTasks !== reviewedFull) {
    context.addIssue({ code: "custom", message: "review-required summaries do not conserve task evidence" });
  }
});

export type ReviewRequiredReport = z.infer<typeof ReviewRequiredReportSchema>;

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/review-required.ts",
  "src/benchmarks/skill-ir/review-required-run.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/automatic-structural-manual-checker.ts",
  "src/core/workdir-manifest.ts",
] as const;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(containedPath(rootDir, ref.path));
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}`);
  return bytes;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

export function auditReviewPatchSource(sourceText: string, taskAnswerLiterals: string[]): void {
  const forbiddenSinks = [
    "src/bench/evaluators", "results/skill-ir", "held-out", "heldOut", "evaluatorId", "gold",
    "fetch(", "Bun.spawn", "node:child_process", "child_process", "process.env", "http://", "https://",
    "import(", "require(",
  ];
  for (const sink of forbiddenSinks) {
    if (sourceText.includes(sink)) throw new Error(`review patch contains forbidden sink: ${sink}`);
  }
  for (const literal of taskAnswerLiterals) {
    if (literal && sourceText.includes(literal)) throw new Error("review patch contains task-answer literal");
  }
  const imports = [...sourceText.matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1]!);
  const allowedImports = new Set(["node:fs/promises", "node:path"]);
  if (imports.length === 0 || imports.some((entry) => !allowedImports.has(entry))) {
    throw new Error("review patch imports exceed the deterministic file adapter allowlist");
  }
}

async function materialize(workDir: string, fixtures: Record<string, string>): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const [path, content] of Object.entries(fixtures)) {
    const target = containedPath(workDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function protectedInputsPreserved(
  workDir: string,
  manifestReference: InitialWorkdirManifestReference,
): Promise<boolean> {
  const initial = await readInitialWorkdirManifest({ workDir, reference: manifestReference });
  const current = new Map((await snapshotWorkdir(workDir)).map((entry) => [entry.path, entry]));
  return initial.entries.every((entry) => JSON.stringify(current.get(entry.path)) === JSON.stringify(entry));
}

async function exactOutputDelta(
  workDir: string,
  manifestReference: InitialWorkdirManifestReference,
  outputPaths: string[],
): Promise<boolean> {
  const initialManifest = await readInitialWorkdirManifest({ workDir, reference: manifestReference });
  const delta = await assessWorkdirDelta({
    workDir,
    initialManifest,
    allowedNewDirectories: [],
    requiredNewFiles: outputPaths,
  });
  return delta.status === "pass";
}

type Task = z.infer<typeof TaskSetSchema>["tasks"][number];
type Status = "pass" | "fail" | "infrastructure-failure";

async function runManualEvaluator(options: {
  evaluatorModule: string;
  taskRoot: string;
  task: Task;
  runId: string;
  workDir: string;
  initialWorkdirManifest: InitialWorkdirManifestReference;
}) {
  const inputPath = join(options.taskRoot, `${options.runId}-evaluator-input.json`);
  await writeFile(inputPath, jsonText({
    evaluatorModule: options.evaluatorModule,
    eval: options.task.eval,
    runs: [{ id: options.runId, workDir: options.workDir, initialWorkdirManifest: options.initialWorkdirManifest }],
  }), "utf8");
  const child = Bun.spawn([
    process.execPath,
    resolve(import.meta.dir, "automatic-structural-manual-checker.ts"),
    "--input",
    inputPath,
  ], { stdout: "pipe", stderr: "pipe", windowsHide: true });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`manual evaluator failed: ${sha256Bytes(Buffer.from(stderr, "utf8"))}`);
  const observations = z.record(z.string(), z.record(z.string(), z.object({
    status: z.enum(["pass", "fail", "infrastructure-failure"]),
    details: z.string().optional(),
  }).strict())).parse(JSON.parse(stdout.trim()));
  const statuses = observations[options.runId];
  if (!statuses) throw new Error(`manual evaluator omitted ${options.runId}`);
  const hardGates = new Set(options.task.hardGateIds);
  const criteria = options.task.eval.map((criterion, index) => {
    if (!criterion.id) throw new Error(`criterion ${index} has no id`);
    const observed = statuses[criterion.id];
    if (!observed) throw new Error(`manual evaluator omitted criterion ${criterion.id}`);
    return CriterionSchema.parse({
      id: criterion.id,
      weight: criterion.weight ?? 1,
      hardGate: hardGates.has(criterion.id),
      status: observed.status as Status,
    });
  });
  return EvaluationSchema.parse({
    criteria,
    summary: summarizeManualEvaluation({ criteria, passThreshold: options.task.passThreshold }),
  });
}

function aggregate(tasks: Array<{ evaluation: z.infer<typeof EvaluationSchema>; full: boolean }>) {
  const passedCriteria = tasks.reduce((sum, task) => sum + task.evaluation.summary.passedCriteria, 0);
  const criterionCount = tasks.reduce((sum, task) => sum + task.evaluation.summary.criterionCount, 0);
  return AggregateEvaluationSchema.parse({
    passedCriteria,
    criterionCount,
    fullParityTasks: tasks.filter((task) => task.full).length,
    distanceToFull: criterionCount - passedCriteria,
  });
}

async function buildReviewedPackage(options: {
  rootDir: string;
  packageDir: string;
  planBytes: Buffer;
  patchPath: string;
  patchBytes: Buffer;
}) {
  await mkdir(options.packageDir, { recursive: true });
  const compileStarted = performance.now();
  const build = await Bun.build({
    entrypoints: [containedPath(options.rootDir, options.patchPath)],
    outdir: join(options.packageDir, "artifacts"),
    target: "node",
    format: "esm",
    sourcemap: "none",
    minify: false,
  });
  const compileDurationMs = performance.now() - compileStarted;
  if (!build.success || build.outputs.length !== 1) throw new Error("review patch compile failed");
  const patchBundlePath = build.outputs[0]!.path;
  const patchBundleBytes = Buffer.from(await build.outputs[0]!.arrayBuffer());
  const packageStarted = performance.now();
  const planPath = join(options.packageDir, "automatic-plan.json");
  await writeFile(planPath, options.planBytes);
  const manifest = {
    schemaVersion: "skill-ir-reviewed-aot-package/v1",
    automaticPlan: { path: "automatic-plan.json", sha256: sha256Bytes(options.planBytes) },
    reviewPatch: {
      sourcePath: options.patchPath,
      sourceSha256: sha256Bytes(options.patchBytes),
      bundlePath: relative(options.packageDir, patchBundlePath).replaceAll("\\", "/"),
      bundleSha256: sha256Bytes(patchBundleBytes),
    },
  };
  const manifestText = jsonText(manifest);
  await writeFile(join(options.packageDir, "package-manifest.json"), manifestText, "utf8");
  const packageDurationMs = performance.now() - packageStarted;
  return {
    patchBundlePath,
    compileDurationMs,
    packageDurationMs,
    manifestSha256: sha256Bytes(Buffer.from(manifestText, "utf8")),
    planSha256: manifest.automaticPlan.sha256,
    patchBundleSha256: manifest.reviewPatch.bundleSha256,
    packageBytes: options.planBytes.byteLength + patchBundleBytes.byteLength + Buffer.byteLength(manifestText),
  };
}

async function runPatch(options: {
  patchBundlePath: string;
  workDir: string;
  publicInterfacePath: string;
  outputCount: number;
}) {
  const environment: Record<string, string> = {};
  for (const name of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "ComSpec"]) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  const started = performance.now();
  const child = Bun.spawn([
    process.execPath,
    options.patchBundlePath,
    `--workdir=${options.workDir}`,
    `--interface=${options.publicInterfacePath}`,
  ], { cwd: options.workDir, env: environment, stdout: "pipe", stderr: "pipe", windowsHide: true });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const durationMs = performance.now() - started;
  if (exitCode !== 0) throw new Error(`review patch failed: ${sha256Bytes(Buffer.from(stderr, "utf8"))}`);
  const result = z.object({ status: z.literal("patched"), outputs: z.number().int().positive() }).strict()
    .parse(JSON.parse(stdout.trim()));
  if (result.outputs !== options.outputCount) throw new Error("review patch output count drift");
  return durationMs;
}

export async function runReviewRequiredSlice(options: {
  rootDir: string;
  catalog: ReviewRequiredCatalog;
  outputPath: string;
  measurementCompletedAt?: string;
  humanMinutes: number;
}): Promise<ReviewRequiredReport> {
  const rootDir = resolve(options.rootDir);
  const catalog = ReviewRequiredCatalogSchema.parse(options.catalog);
  const catalogText = jsonText(catalog);
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt ?? new Date().toISOString());
  if (Date.parse(completedAt) < Date.parse(catalog.measurementStartedAt)) throw new Error("review completion precedes start");
  if (Date.parse(completedAt) > Date.now()) throw new Error("review completion is in the future");
  const elapsedMinutes = (Date.parse(completedAt) - Date.parse(catalog.measurementStartedAt)) / 60_000;
  const humanMinutes = z.number().nonnegative().max(catalog.budget.maximumHumanMinutes).parse(options.humanMinutes);
  if (humanMinutes > elapsedMinutes) throw new Error("human minutes exceed prospective wall-clock window");

  const [automaticReportBytes, planBytes, , descriptionBytes, taskSetBytes, , patchBytes] = await Promise.all([
    readPinned(rootDir, catalog.automaticReport),
    readPinned(rootDir, catalog.automaticPlan),
    readPinned(rootDir, catalog.source),
    readPinned(rootDir, catalog.taskDescription),
    readPinned(rootDir, catalog.taskSet),
    readPinned(rootDir, catalog.manualEvaluatorModule),
    readFile(containedPath(rootDir, catalog.patchPath)),
  ]);
  const automaticReport = GenericDomainPlanRepairReportSchema.parse(JSON.parse(automaticReportBytes.toString("utf8")));
  const plan = RestrictedDomainPlanSchema.parse(JSON.parse(planBytes.toString("utf8")));
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionBytes.toString("utf8")));
  const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
  if (automaticReport.generatedPlan?.sha256 !== catalog.automaticPlan.sha256
    || automaticReport.generatedPlan.path !== catalog.automaticPlan.path) {
    throw new Error("automatic report and plan identity disagree");
  }
  const descriptionOutputs = description.outputs.map((output) => output.path);
  if (JSON.stringify(descriptionOutputs) !== JSON.stringify(catalog.declaredOutputPaths)) {
    throw new Error("review-required declared output identity drift");
  }
  const tasks = catalog.taskIds.map((taskId) => {
    const task = taskSet.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new Error(`review-required task set is missing ${taskId}`);
    return task;
  });
  for (const task of tasks) {
    const publicInterfaceText = task.fixtures[catalog.publicInterfacePath];
    if (publicInterfaceText === undefined) {
      throw new Error(`review-required task ${task.id} is missing the public interface`);
    }
    const publicInterface = z.object({
      outputs: z.record(SafePathSchema),
    }).passthrough().parse(JSON.parse(publicInterfaceText));
    if (JSON.stringify(Object.values(publicInterface.outputs)) !== JSON.stringify(catalog.declaredOutputPaths)) {
      throw new Error(`review-required task ${task.id} public output identity drift`);
    }
  }
  const answerLiterals = tasks.flatMap((task) => Object.values(task.fixtures)
    .flatMap((value) => value.match(/TEST_ONLY_[A-Za-z0-9_]+/gu) ?? []));
  const patchText = patchBytes.toString("utf8");
  auditReviewPatchSource(patchText, answerLiterals);
  if (patchText.includes(`\"${catalog.caseId}\"`)) throw new Error("review patch contains case-id branch literal");

  const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
  })));
  const workRoot = await mkdtemp(join(tmpdir(), "skill-ir-review-required-"));
  try {
    const packageResult = await buildReviewedPackage({
      rootDir,
      packageDir: join(workRoot, "package"),
      planBytes,
      patchPath: catalog.patchPath,
      patchBytes,
    });
    const taskReports: z.infer<typeof ReviewRequiredReportSchema>["tasks"] = [];
    for (const task of tasks) {
      const taskRoot = join(workRoot, task.id);
      const workDir = join(taskRoot, "workdir");
      await materialize(workDir, task.fixtures);
      const initialManifest = await writeInitialWorkdirManifest({
        workDir,
        manifestPath: join(taskRoot, "initial-workdir-manifest.json"),
      });
      const automaticStarted = performance.now();
      await executeRestrictedDomainPlan({
        workDir,
        plan,
        readablePaths: Object.keys(task.fixtures),
        writablePaths: catalog.declaredOutputPaths,
      });
      const automaticDurationMs = performance.now() - automaticStarted;
      const automaticProtected = await protectedInputsPreserved(workDir, initialManifest);
      const automaticDelta = await exactOutputDelta(workDir, initialManifest, catalog.declaredOutputPaths);
      const automaticOnly = await runManualEvaluator({
        evaluatorModule: containedPath(rootDir, catalog.manualEvaluatorModule.path),
        taskRoot,
        task,
        runId: "automatic-only",
        workDir,
        initialWorkdirManifest: initialManifest,
      });
      const patchDurationMs = await runPatch({
        patchBundlePath: packageResult.patchBundlePath,
        workDir,
        publicInterfacePath: catalog.publicInterfacePath,
        outputCount: catalog.declaredOutputPaths.length,
      });
      const reviewedProtected = await protectedInputsPreserved(workDir, initialManifest);
      const reviewedDelta = await exactOutputDelta(workDir, initialManifest, catalog.declaredOutputPaths);
      const reviewed = await runManualEvaluator({
        evaluatorModule: containedPath(rootDir, catalog.manualEvaluatorModule.path),
        taskRoot,
        task,
        runId: "reviewed",
        workDir,
        initialWorkdirManifest: initialManifest,
      });
      taskReports.push({
        taskId: task.id,
        automaticPlan: { runtimeComplete: true, durationMs: automaticDurationMs, exactOutputDelta: automaticDelta },
        reviewPatch: { runtimeComplete: true, durationMs: patchDurationMs, exactOutputDelta: reviewedDelta },
        protectedInputsPreservedAfterAutomatic: automaticProtected,
        protectedInputsPreservedAfterReview: reviewedProtected,
        automaticOnly,
        reviewed,
        fullReviewedParity: reviewed.summary.fullCriterionPass && reviewedProtected && reviewedDelta,
      });
    }

    const frozenCriteria = new Map((automaticReport.parity?.tasks ?? []).map((task) => [
      task.taskId,
      task.postPlan.criteria.map((criterion) => ({ id: criterion.id, status: criterion.status })),
    ]));
    const reproducedFrozenEvidence = taskReports.every((task) => JSON.stringify(
      task.automaticOnly.criteria.map((criterion) => ({ id: criterion.id, status: criterion.status })),
    ) === JSON.stringify(frozenCriteria.get(task.taskId)));
    if (!reproducedFrozenEvidence) throw new Error("fresh automatic-only workdir does not reproduce frozen evidence");
    const finalPlanSha256 = sha256Bytes(await readFile(containedPath(rootDir, catalog.automaticPlan.path)));
    const automaticSummary = aggregate(taskReports.map((task) => ({
      evaluation: task.automaticOnly,
      full: task.automaticOnly.summary.fullCriterionPass
        && task.protectedInputsPreservedAfterAutomatic && task.automaticPlan.exactOutputDelta,
    })));
    const reviewedSummary = aggregate(taskReports.map((task) => ({
      evaluation: task.reviewed,
      full: task.fullReviewedParity,
    })));
    const patchPhysicalLoc = patchText.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
    const synthesisTokens = automaticReport.tokens
      ? automaticReport.tokens.input + automaticReport.tokens.output
      : null;
    if (automaticReport.summary.paidCalls !== 1 || synthesisTokens === null) {
      throw new Error("automatic synthesis cost is not complete");
    }
    const report = ReviewRequiredReportSchema.parse({
      schemaVersion: "skill-ir-review-required-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: sha256Bytes(Buffer.from(catalogText, "utf8")),
      caseId: catalog.caseId,
      status: "review-required",
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      inputs: {
        automaticReport: catalog.automaticReport,
        automaticPlan: catalog.automaticPlan,
        source: catalog.source,
        taskDescription: catalog.taskDescription,
        taskSet: catalog.taskSet,
        manualEvaluatorModule: catalog.manualEvaluatorModule,
      },
      implementation,
      patch: {
        path: catalog.patchPath,
        sha256: sha256Bytes(patchBytes),
        physicalLoc: patchPhysicalLoc,
        humanMinutes,
        authoringStartedAt: catalog.measurementStartedAt,
        authoringCompletedAt: completedAt,
        sourceAudit: "passed",
        coreBranchDelta: 0,
        projectModelCalls: 0,
      },
      construction: {
        synthesis: {
          modelCalls: 1,
          modelTokens: synthesisTokens,
          durationMs: automaticReport.durationMs,
          evidence: catalog.automaticReport,
        },
        reviewPatch: {
          modelCalls: 0,
          modelTokens: 0,
          durationMs: 0,
          humanMinutes,
          physicalLoc: patchPhysicalLoc,
          durationDisposition: "human-time-recorded-separately",
        },
        compile: { modelCalls: 0, modelTokens: 0, durationMs: packageResult.compileDurationMs },
        profile: {
          modelCalls: 0,
          modelTokens: 0,
          durationMs: 0,
          disposition: "not-applicable-profile-empty",
        },
        package: {
          modelCalls: 0,
          modelTokens: 0,
          durationMs: packageResult.packageDurationMs,
          bytes: packageResult.packageBytes,
          manifestSha256: packageResult.manifestSha256,
          planSha256: packageResult.planSha256,
          patchBundleSha256: packageResult.patchBundleSha256,
        },
      },
      tasks: taskReports,
      automaticOnly: { reproducedFrozenEvidence, summary: automaticSummary },
      reviewed: { summary: reviewedSummary },
      automaticPlanDigestPreserved: finalPlanSha256 === catalog.automaticPlan.sha256,
      automationEligibilityChanged: false,
      optimizedClassificationChanged: false,
      readinessChanged: false,
      replicationAuthorized: false,
      authorization: { paidCalls: 0, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccessesByPatch: 0 },
    });
    await atomicWrite(options.outputPath, jsonText(report));
    return report;
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}
