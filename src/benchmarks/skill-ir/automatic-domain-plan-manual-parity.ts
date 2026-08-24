import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { EvalCriterionSchema } from "../../core/types";
import {
  readInitialWorkdirManifest,
  snapshotWorkdir,
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest";
import { ThinTaskDescriptionSchema } from "./automatic-domain-construction";
import { executeRestrictedDomainPlan, RestrictedDomainPlanSchema } from "./automatic-restricted-domain-plan";
import { auditRestrictedDomainPlanStaticTypes } from "./automatic-restricted-domain-plan-static-types";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();
const ManualStatusSchema = z.enum(["pass", "fail", "infrastructure-failure"]);

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: IdentifierSchema,
    split: z.literal("development"),
    fixtures: z.record(z.string()),
    eval: z.array(EvalCriterionSchema).min(1),
    hardGateIds: z.array(z.string()).default([]),
    passThreshold: z.number().min(0).max(1),
  }).passthrough()).min(2),
}).passthrough();

export const DomainPlanManualParityCaseInputSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-manual-parity-case/v1"),
  caseId: IdentifierSchema,
  plan: DigestRefSchema,
  taskDescription: DigestRefSchema,
  taskSet: DigestRefSchema,
  manualEvaluatorModule: DigestRefSchema,
  taskIds: z.tuple([IdentifierSchema, IdentifierSchema]).refine((ids) => ids[0] !== ids[1], {
    message: "manual parity task ids must differ",
  }),
}).strict();

export type DomainPlanManualParityCaseInput = z.infer<typeof DomainPlanManualParityCaseInputSchema>;

const ManualCriterionObservationSchema = z.object({
  id: z.string().min(1),
  weight: z.number().positive(),
  hardGate: z.boolean(),
  status: ManualStatusSchema,
}).strict();

const ManualEvaluationSummarySchema = z.object({
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
}).strict();

export function summarizeManualEvaluation(input: {
  criteria: Array<z.infer<typeof ManualCriterionObservationSchema>>;
  passThreshold: number;
}): z.infer<typeof ManualEvaluationSummarySchema> {
  const criteria = z.array(ManualCriterionObservationSchema).min(1).parse(input.criteria);
  const passThreshold = z.number().min(0).max(1).parse(input.passThreshold);
  const passedCriteria = criteria.filter((entry) => entry.status === "pass").length;
  const infrastructureFailures = criteria.filter((entry) => entry.status === "infrastructure-failure").length;
  const totalWeight = criteria.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedScore = criteria.reduce((sum, entry) =>
    sum + (entry.status === "pass" ? entry.weight : 0), 0) / totalWeight;
  const hardGatePassed = criteria.filter((entry) => entry.hardGate)
    .every((entry) => entry.status === "pass");
  return ManualEvaluationSummarySchema.parse({
    passedCriteria,
    criterionCount: criteria.length,
    passRate: passedCriteria / criteria.length,
    weightedScore,
    passThreshold,
    hardGatePassed,
    thresholdPassed: weightedScore >= passThreshold,
    infrastructureFailures,
    fullCriterionPass: passedCriteria === criteria.length && infrastructureFailures === 0,
    distanceToFull: criteria.length - passedCriteria,
  });
}

const EvaluationRecordSchema = z.object({
  criteria: z.array(ManualCriterionObservationSchema).min(1),
  summary: ManualEvaluationSummarySchema,
}).strict();

const TaskParitySchema = z.object({
  taskId: IdentifierSchema,
  runtime: z.object({
    status: z.enum(["complete", "failed"]),
    failureDigest: Sha256Schema.nullable(),
    staticTypeIssueCount: z.number().int().nonnegative(),
  }).strict(),
  protectedInputsPreserved: z.boolean(),
  declaredOutputs: z.object({
    total: z.number().int().positive(),
    required: z.number().int().nonnegative(),
    present: z.array(SafePathSchema),
    requiredPresent: z.array(SafePathSchema),
  }).strict(),
  baseline: EvaluationRecordSchema,
  postPlan: EvaluationRecordSchema,
  passedCriterionDelta: z.number().int(),
  weightedScoreDelta: z.number(),
  fullParity: z.boolean(),
}).strict().superRefine((task, context) => {
  const expected = task.runtime.status === "complete"
    && task.protectedInputsPreserved
    && task.postPlan.summary.fullCriterionPass;
  if (task.fullParity !== expected) {
    context.addIssue({ code: "custom", message: "task full parity does not match runtime and evaluator evidence" });
  }
});

export const DomainPlanManualParityCaseReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-manual-parity-report/v1"),
  measurementCompletedAt: z.string().datetime(),
  caseId: IdentifierSchema,
  inputs: z.object({
    plan: DigestRefSchema,
    taskDescription: DigestRefSchema,
    taskSet: DigestRefSchema,
    manualEvaluatorModule: DigestRefSchema,
  }).strict(),
  implementation: z.array(DigestRefSchema).length(6),
  tasks: z.array(TaskParitySchema).length(2),
  caseParity: z.object({
    status: z.enum(["passed", "failed"]),
    failedTaskIds: z.array(IdentifierSchema),
  }).strict(),
  summary: z.object({
    taskCount: z.literal(2),
    fullParityTasks: z.number().int().min(0).max(2),
    baselinePassedCriteria: z.number().int().nonnegative(),
    baselineCriterionCount: z.number().int().positive(),
    postPlanPassedCriteria: z.number().int().nonnegative(),
    postPlanCriterionCount: z.number().int().positive(),
    distanceToFull: z.number().int().nonnegative(),
    manualEvaluatorModuleLoads: z.literal(2),
    paidCalls: z.literal(0),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadsSentToModel: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  const full = report.tasks.filter((task) => task.fullParity).length;
  const baselinePassed = report.tasks.reduce((sum, task) => sum + task.baseline.summary.passedCriteria, 0);
  const baselineTotal = report.tasks.reduce((sum, task) => sum + task.baseline.summary.criterionCount, 0);
  const postPassed = report.tasks.reduce((sum, task) => sum + task.postPlan.summary.passedCriteria, 0);
  const postTotal = report.tasks.reduce((sum, task) => sum + task.postPlan.summary.criterionCount, 0);
  if (report.summary.fullParityTasks !== full
    || report.summary.baselinePassedCriteria !== baselinePassed
    || report.summary.baselineCriterionCount !== baselineTotal
    || report.summary.postPlanPassedCriteria !== postPassed
    || report.summary.postPlanCriterionCount !== postTotal
    || report.summary.distanceToFull !== postTotal - postPassed) {
    context.addIssue({ code: "custom", message: "manual parity summary does not conserve task evidence" });
  }
  const failedIds = report.tasks.filter((task) => !task.fullParity).map((task) => task.taskId);
  if (report.caseParity.status !== (full === 2 ? "passed" : "failed")
    || JSON.stringify(report.caseParity.failedTaskIds) !== JSON.stringify(failedIds)) {
    context.addIssue({ code: "custom", message: "case parity does not match task evidence" });
  }
});

export type DomainPlanManualParityCaseReport = z.infer<typeof DomainPlanManualParityCaseReportSchema>;

const CrossSkillSemanticParitySchema = z.object({
  status: z.enum(["passed", "failed"]),
  reason: z.enum(["none", "insufficient-distinct-skills", "case-parity-failed", "core-branch-delta"]),
  distinctSkillCount: z.number().int().nonnegative(),
  fullyPassingSkillCount: z.number().int().nonnegative(),
  coreBranchDelta: z.number().int().nonnegative(),
}).strict();

export function deriveCrossSkillSemanticParity(
  cases: Array<{
    caseId: string;
    taskCount: number;
    fullParityTasks: number;
    caseParity: { status: "passed" | "failed" };
  }>,
  coreBranchDelta: number,
) {
  const distinctSkillCount = new Set(cases.map((entry) => entry.caseId)).size;
  const fullyPassingSkillCount = cases.filter((entry) =>
    entry.taskCount === 2 && entry.fullParityTasks === 2 && entry.caseParity.status === "passed").length;
  const reason = coreBranchDelta !== 0 ? "core-branch-delta" as const
    : distinctSkillCount < 2 ? "insufficient-distinct-skills" as const
      : fullyPassingSkillCount !== distinctSkillCount ? "case-parity-failed" as const
        : "none" as const;
  return CrossSkillSemanticParitySchema.parse({
    status: reason === "none" ? "passed" : "failed",
    reason,
    distinctSkillCount,
    fullyPassingSkillCount,
    coreBranchDelta,
  });
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

async function materialize(workDir: string, fixtures: Record<string, string>): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const [path, content] of Object.entries(fixtures)) {
    const target = containedPath(workDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function inputsPreserved(
  workDir: string,
  manifestReference: InitialWorkdirManifestReference,
): Promise<boolean> {
  const initial = await readInitialWorkdirManifest({ workDir, reference: manifestReference });
  const current = new Map((await snapshotWorkdir(workDir)).map((entry) => [entry.path, entry]));
  return initial.entries.every((entry) => JSON.stringify(current.get(entry.path)) === JSON.stringify(entry));
}

async function presentPaths(workDir: string, paths: string[]): Promise<string[]> {
  const present: string[] = [];
  for (const path of paths) {
    try {
      await access(containedPath(workDir, path));
      present.push(path);
    } catch {
      // Absence is task evidence, not an infrastructure error.
    }
  }
  return present;
}

async function runManualEvaluator(options: {
  evaluatorModule: string;
  taskRoot: string;
  eval: z.infer<typeof EvalCriterionSchema>[];
  runs: Array<{ id: string; workDir: string; initialWorkdirManifest: InitialWorkdirManifestReference }>;
}) {
  const inputPath = join(options.taskRoot, "manual-evaluator-input.json");
  await writeFile(inputPath, `${JSON.stringify({
    evaluatorModule: options.evaluatorModule,
    eval: options.eval,
    runs: options.runs,
  }, null, 2)}\n`, "utf8");
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
  if (exitCode !== 0) {
    throw new Error(`manual evaluator subprocess failed: ${sha256Bytes(Buffer.from(stderr, "utf8"))}`);
  }
  return z.record(z.string(), z.record(z.string(), z.object({
    status: ManualStatusSchema,
    details: z.string().optional(),
  }).strict())).parse(JSON.parse(stdout.trim()));
}

function evaluationRecord(options: {
  eval: z.infer<typeof EvalCriterionSchema>[];
  hardGateIds: string[];
  passThreshold: number;
  statuses: Record<string, { status: z.infer<typeof ManualStatusSchema> }>;
}) {
  const hardGates = new Set(options.hardGateIds);
  const criteria = options.eval.map((criterion, index) => {
    const id = criterion.id;
    if (!id) throw new Error(`manual criterion ${index} has no id`);
    const observed = options.statuses[id];
    if (!observed) throw new Error(`manual evaluator omitted criterion ${id}`);
    return ManualCriterionObservationSchema.parse({
      id,
      weight: criterion.weight ?? 1,
      hardGate: hardGates.has(id),
      status: observed.status,
    });
  });
  return EvaluationRecordSchema.parse({
    criteria,
    summary: summarizeManualEvaluation({ criteria, passThreshold: options.passThreshold }),
  });
}

export async function runDomainPlanManualParityCase(options: {
  rootDir: string;
  input: DomainPlanManualParityCaseInput;
  outputPath: string;
  measurementCompletedAt?: string;
}): Promise<DomainPlanManualParityCaseReport> {
  const input = DomainPlanManualParityCaseInputSchema.parse(options.input);
  const [planBytes, descriptionBytes, taskSetBytes] = await Promise.all([
    readPinned(options.rootDir, input.plan),
    readPinned(options.rootDir, input.taskDescription),
    readPinned(options.rootDir, input.taskSet),
    readPinned(options.rootDir, input.manualEvaluatorModule),
  ]);
  const plan = RestrictedDomainPlanSchema.parse(JSON.parse(planBytes.toString("utf8")));
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionBytes.toString("utf8")));
  const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
  const tasks = input.taskIds.map((taskId) => {
    const task = taskSet.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new Error(`frozen task set is missing ${taskId}`);
    return task;
  });
  const implementationPaths = [
    "src/benchmarks/skill-ir/automatic-domain-plan-manual-parity.ts",
    "src/benchmarks/skill-ir/automatic-domain-plan-manual-parity-run.ts",
    "src/benchmarks/skill-ir/automatic-structural-manual-checker.ts",
    "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
    "src/benchmarks/skill-ir/automatic-restricted-domain-plan-static-types.ts",
    "src/benchmarks/skill-ir/automatic-domain-construction.ts",
  ];
  const implementation = await Promise.all(implementationPaths.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(options.rootDir, path))),
  })));
  const workRoot = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-manual-parity-"));
  try {
    const taskReports: Array<z.infer<typeof TaskParitySchema>> = [];
    for (const task of tasks) {
      const taskRoot = join(workRoot, task.id);
      const baselineWorkDir = join(taskRoot, "baseline-workdir");
      const postWorkDir = join(taskRoot, "post-plan-workdir");
      await materialize(baselineWorkDir, task.fixtures);
      await materialize(postWorkDir, task.fixtures);
      const baselineManifest = await writeInitialWorkdirManifest({
        workDir: baselineWorkDir,
        manifestPath: join(taskRoot, "baseline-initial-workdir-manifest.json"),
      });
      const postManifest = await writeInitialWorkdirManifest({
        workDir: postWorkDir,
        manifestPath: join(taskRoot, "post-plan-initial-workdir-manifest.json"),
      });
      let runtimeStatus: "complete" | "failed" = "complete";
      let failureDigest: string | null = null;
      try {
        await executeRestrictedDomainPlan({
          workDir: postWorkDir,
          plan,
          readablePaths: Object.keys(task.fixtures),
          writablePaths: description.outputs.map((output) => output.path),
        });
      } catch (error) {
        runtimeStatus = "failed";
        failureDigest = sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
      }
      const manual = await runManualEvaluator({
        evaluatorModule: containedPath(options.rootDir, input.manualEvaluatorModule.path),
        taskRoot,
        eval: task.eval,
        runs: [
          { id: "baseline", workDir: baselineWorkDir, initialWorkdirManifest: baselineManifest },
          { id: "post-plan", workDir: postWorkDir, initialWorkdirManifest: postManifest },
        ],
      });
      const baselineStatuses = manual.baseline;
      const postStatuses = manual["post-plan"];
      if (!baselineStatuses || !postStatuses) throw new Error(`manual evaluator omitted baseline or post-plan for ${task.id}`);
      const baseline = evaluationRecord({
        eval: task.eval,
        hardGateIds: task.hardGateIds,
        passThreshold: task.passThreshold,
        statuses: baselineStatuses,
      });
      const postPlan = evaluationRecord({
        eval: task.eval,
        hardGateIds: task.hardGateIds,
        passThreshold: task.passThreshold,
        statuses: postStatuses,
      });
      const present = await presentPaths(postWorkDir, description.outputs.map((output) => output.path));
      const requiredPaths = description.outputs.filter((output) => output.required).map((output) => output.path);
      const protectedInputsPreserved = await inputsPreserved(postWorkDir, postManifest);
      taskReports.push(TaskParitySchema.parse({
        taskId: task.id,
        runtime: {
          status: runtimeStatus,
          failureDigest,
          staticTypeIssueCount: auditRestrictedDomainPlanStaticTypes(plan).length,
        },
        protectedInputsPreserved,
        declaredOutputs: {
          total: description.outputs.length,
          required: requiredPaths.length,
          present,
          requiredPresent: present.filter((path) => requiredPaths.includes(path)),
        },
        baseline,
        postPlan,
        passedCriterionDelta: postPlan.summary.passedCriteria - baseline.summary.passedCriteria,
        weightedScoreDelta: postPlan.summary.weightedScore - baseline.summary.weightedScore,
        fullParity: runtimeStatus === "complete" && protectedInputsPreserved && postPlan.summary.fullCriterionPass,
      }));
    }
    const fullParityTasks = taskReports.filter((task) => task.fullParity).length;
    const failedTaskIds = taskReports.filter((task) => !task.fullParity).map((task) => task.taskId);
    const completedAt = z.string().datetime().parse(options.measurementCompletedAt ?? new Date().toISOString());
    if (Date.parse(completedAt) > Date.now()) throw new Error("manual parity completion is in the future");
    const report = DomainPlanManualParityCaseReportSchema.parse({
      schemaVersion: "skill-ir-domain-plan-manual-parity-report/v1",
      measurementCompletedAt: completedAt,
      caseId: input.caseId,
      inputs: {
        plan: input.plan,
        taskDescription: input.taskDescription,
        taskSet: input.taskSet,
        manualEvaluatorModule: input.manualEvaluatorModule,
      },
      implementation,
      tasks: taskReports,
      caseParity: {
        status: fullParityTasks === 2 ? "passed" : "failed",
        failedTaskIds,
      },
      summary: {
        taskCount: 2,
        fullParityTasks,
        baselinePassedCriteria: taskReports.reduce((sum, task) => sum + task.baseline.summary.passedCriteria, 0),
        baselineCriterionCount: taskReports.reduce((sum, task) => sum + task.baseline.summary.criterionCount, 0),
        postPlanPassedCriteria: taskReports.reduce((sum, task) => sum + task.postPlan.summary.passedCriteria, 0),
        postPlanCriterionCount: taskReports.reduce((sum, task) => sum + task.postPlan.summary.criterionCount, 0),
        distanceToFull: taskReports.reduce((sum, task) => sum + task.postPlan.summary.distanceToFull, 0),
        manualEvaluatorModuleLoads: 2,
        paidCalls: 0,
        retries: 0,
        heldOutAccesses: 0,
        evaluatorPayloadsSentToModel: 0,
        coreBranchDelta: 0,
      },
    });
    await atomicWrite(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}
