import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import {
  RestrictedDomainPlanAttributionFreezeSchema,
  RestrictedDomainPlanAttributionReportSchema,
} from "./automatic-domain-plan-attribution";
import {
  executeRestrictedDomainPlan,
  RestrictedDomainPlanSchema,
  type RestrictedDomainPlan,
  type RestrictedDomainPlanStep,
} from "./automatic-restricted-domain-plan";
import { auditRestrictedDomainPlanStaticTypes } from "./automatic-restricted-domain-plan-static-types";
import { sha256Bytes } from "./source-fixture";

const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: z.string().min(1),
    split: z.literal("development"),
    fixtures: z.record(z.string()),
  }).passthrough()).min(2),
}).passthrough();

const FindingSchema = z.object({
  id: z.enum([
    "text-template-non-string-binding",
    "interface-derived-values-unused",
    "vite-reference-form-uncovered",
  ]),
  evidenceCount: z.number().int().positive(),
  evidenceBasis: z.enum(["plan-dataflow", "workdir-source-and-plan-regex"]),
}).strict();

const TaskObservationSchema = z.object({
  taskId: z.string().min(1),
  runtimeStatus: z.enum(["complete", "failed"]),
  failureClass: z.enum(["template-binding-type", "runtime-error"]).nullable(),
  failureDigest: Sha256Schema.nullable(),
  protectedInputsPreserved: z.boolean(),
  declaredOutputCount: z.number().int().positive(),
  declaredOutputsPresent: z.array(SafePathSchema),
  uncoveredImportMetaEnvReferences: z.number().int().nonnegative(),
  manualEvaluation: z.literal("not-run"),
}).strict().superRefine((task, context) => {
  if (task.runtimeStatus === "complete" && (task.failureClass || task.failureDigest)) {
    context.addIssue({ code: "custom", message: "complete task cannot retain failure evidence" });
  }
  if (task.runtimeStatus === "failed" && (!task.failureClass || !task.failureDigest)) {
    context.addIssue({ code: "custom", message: "failed task requires typed failure evidence" });
  }
});

export const RestrictedDomainPlanSemanticInspectionReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-semantic-inspection/v1"),
  measurementCompletedAt: z.string().datetime(),
  parents: z.object({
    attributionFreeze: DigestRefSchema,
    attributionReport: DigestRefSchema,
    generatedPlan: DigestRefSchema,
    taskSet: DigestRefSchema,
  }).strict(),
  implementation: z.array(DigestRefSchema).length(3),
  tasks: z.array(TaskObservationSchema).length(2),
  findings: z.array(FindingSchema),
  semanticParity: z.literal("not-established"),
  eligibilityChanged: z.literal(false),
  summary: z.object({
    tasksExecuted: z.literal(2),
    runtimeComplete: z.number().int().min(0).max(2),
    runtimeFailed: z.number().int().min(0).max(2),
    paidCalls: z.literal(0),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (report.summary.runtimeComplete + report.summary.runtimeFailed !== report.summary.tasksExecuted) {
    context.addIssue({ code: "custom", message: "runtime task accounting does not balance" });
  }
});

export type RestrictedDomainPlanSemanticInspectionReport = z.infer<typeof RestrictedDomainPlanSemanticInspectionReportSchema>;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function contained(rootDir: string, path: string): string {
  const candidate = resolve(rootDir, SafePathSchema.parse(path));
  const fromRoot = relative(resolve(rootDir), candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(contained(rootDir, ref.path));
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}`);
  return bytes;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

function refsForStep(step: RestrictedDomainPlanStep): string[] {
  const conditional = "when" in step && step.when ? [step.when] : [];
  const expression = (value: { kind: "ref"; ref: string } | { kind: "literal" }) => value.kind === "ref" ? [value.ref] : [];
  switch (step.op) {
    case "read-text":
    case "read-json":
    case "parse-key-value-lines":
    case "regex-find-files":
      return conditional;
    case "json-pointer":
    case "regex-test":
    case "pluck":
    case "filter-regex":
    case "project-records":
    case "copy-text":
      return [step.source, ...conditional];
    case "set-operation":
      return [step.left, step.right, ...conditional];
    case "boolean":
      return [...step.inputs, ...conditional];
    case "choose":
      return [step.condition, ...expression(step.whenTrue), ...expression(step.whenFalse), ...conditional];
    case "write-json":
      return [...step.fields.flatMap((entry) => expression(entry.value)), ...conditional];
    case "write-text-template":
      return [...step.bindings.flatMap((entry) => expression(entry.value)), ...conditional];
  }
}

function planFindings(plan: RestrictedDomainPlan) {
  const textBindingMismatches = auditRestrictedDomainPlanStaticTypes(plan).length;
  const usedRegisters = new Set(plan.steps.flatMap(refsForStep));
  const unusedInterfacePointers = plan.steps.filter((step) =>
    step.op === "json-pointer"
    && ["/reportFields", "/schemaRepresentations", "/policy"].includes(step.pointer)
    && !usedRegisters.has(step.id)).length;
  return { textBindingMismatches, unusedInterfacePointers };
}

function countUncoveredImportMetaEnvReferences(plan: RestrictedDomainPlan, fixtures: Record<string, string>): number {
  const referencePattern = /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/gu;
  const references = Object.entries(fixtures).flatMap(([path, content]) =>
    [...content.matchAll(referencePattern)].map((match) => ({ path, name: match[1]! })));
  const scanners = plan.steps.filter((step): step is Extract<RestrictedDomainPlanStep, { op: "regex-find-files" }> =>
    step.op === "regex-find-files" && step.captures.includes("name"));
  return references.filter((reference) => !scanners.some((scanner) => {
    const pathFlags = scanner.flags.replaceAll("g", "");
    if (!new RegExp(scanner.includePathPattern, pathFlags).test(reference.path)) return false;
    const flags = scanner.flags.includes("g") ? scanner.flags : `${scanner.flags}g`;
    return [...fixtures[reference.path]!.matchAll(new RegExp(scanner.contentPattern, flags))]
      .some((match) => match.groups?.name === reference.name);
  })).length;
}

async function materializeTask(workDir: string, fixtures: Record<string, string>): Promise<Map<string, string>> {
  await mkdir(workDir, { recursive: true });
  const protectedDigests = new Map<string, string>();
  for (const [path, content] of Object.entries(fixtures)) {
    const destination = contained(workDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
    protectedDigests.set(path, sha256Bytes(Buffer.from(content, "utf8")));
  }
  return protectedDigests;
}

async function protectedInputsPreserved(workDir: string, expected: Map<string, string>): Promise<boolean> {
  try {
    for (const [path, digest] of expected) {
      if (sha256Bytes(await readFile(contained(workDir, path))) !== digest) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function presentOutputs(workDir: string, paths: string[]): Promise<string[]> {
  const present: string[] = [];
  for (const path of paths) {
    try {
      await access(contained(workDir, path));
      present.push(path);
    } catch {
      // Missing output is evidence, not an inspection error.
    }
  }
  return present.sort((left, right) => left.localeCompare(right, "en"));
}

function classifyRuntimeFailure(error: unknown): "template-binding-type" | "runtime-error" {
  const message = error instanceof Error ? error.message : String(error);
  return /must be a string$/u.test(message) ? "template-binding-type" : "runtime-error";
}

export async function inspectRestrictedDomainPlanSemantics(options: {
  rootDir: string;
  attributionFreezePath: string;
  attributionReportPath: string;
  generatedPlanPath: string;
  publicContractFixturePath: string;
  outputPath: string;
  measurementCompletedAt?: string;
}): Promise<RestrictedDomainPlanSemanticInspectionReport> {
  const freezePath = SafePathSchema.parse(options.attributionFreezePath);
  const reportPath = SafePathSchema.parse(options.attributionReportPath);
  const planPath = SafePathSchema.parse(options.generatedPlanPath);
  const [freezeBytes, attributionBytes, planBytes] = await Promise.all([
    readFile(contained(options.rootDir, freezePath)),
    readFile(contained(options.rootDir, reportPath)),
    readFile(contained(options.rootDir, planPath)),
  ]);
  const freeze = RestrictedDomainPlanAttributionFreezeSchema.parse(JSON.parse(freezeBytes.toString("utf8")));
  const attribution = RestrictedDomainPlanAttributionReportSchema.parse(JSON.parse(attributionBytes.toString("utf8")));
  const plan = RestrictedDomainPlanSchema.parse(JSON.parse(planBytes.toString("utf8")));
  if (attribution.status !== "plan-produced" || !attribution.generatedPlan) throw new Error("attribution did not produce a safe plan");
  if (attribution.preModelFreezeSha256 !== sha256Bytes(freezeBytes)) throw new Error("attribution freeze identity drift");
  if (attribution.generatedPlan.path !== planPath || attribution.generatedPlan.sha256 !== sha256Bytes(planBytes)) {
    throw new Error("generated plan identity drift");
  }
  const taskSetBytes = await readPinned(options.rootDir, freeze.case.taskSet);
  const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
  const taskIds = [freeze.case.constructionTaskId, freeze.case.transferTaskId];
  const tasks = taskIds.map((taskId) => {
    const task = taskSet.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new Error(`missing frozen task ${taskId}`);
    return task;
  });
  const implementationPaths = [
    "src/benchmarks/skill-ir/automatic-domain-plan-semantic-inspection.ts",
    "src/benchmarks/skill-ir/automatic-restricted-domain-plan-static-types.ts",
    "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  ];
  const implementation = await Promise.all(implementationPaths.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(contained(options.rootDir, path))),
  })));
  const findings = planFindings(plan);
  const workRoot = await mkdtemp(join(tmpdir(), "skill-ir-domain-plan-semantic-inspection-"));
  try {
    const observations: Array<z.infer<typeof TaskObservationSchema>> = [];
    for (const task of tasks) {
      const workDir = join(workRoot, task.id);
      const protectedDigests = await materializeTask(workDir, task.fixtures);
      const rawContract = task.fixtures[options.publicContractFixturePath];
      if (!rawContract) throw new Error(`task ${task.id} lacks public contract fixture`);
      const contract = z.object({ outputs: z.record(SafePathSchema) }).passthrough().parse(JSON.parse(rawContract));
      const outputPaths = [...new Set(Object.values(contract.outputs))];
      let runtimeStatus: "complete" | "failed" = "complete";
      let failureClass: "template-binding-type" | "runtime-error" | null = null;
      let failureDigest: string | null = null;
      try {
        await executeRestrictedDomainPlan({
          workDir,
          plan,
          readablePaths: Object.keys(task.fixtures),
          writablePaths: outputPaths,
        });
      } catch (error) {
        runtimeStatus = "failed";
        failureClass = classifyRuntimeFailure(error);
        failureDigest = sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
      }
      observations.push(TaskObservationSchema.parse({
        taskId: task.id,
        runtimeStatus,
        failureClass,
        failureDigest,
        protectedInputsPreserved: await protectedInputsPreserved(workDir, protectedDigests),
        declaredOutputCount: outputPaths.length,
        declaredOutputsPresent: await presentOutputs(workDir, outputPaths),
        uncoveredImportMetaEnvReferences: countUncoveredImportMetaEnvReferences(plan, task.fixtures),
        manualEvaluation: "not-run",
      }));
    }
    const resultFindings: Array<z.infer<typeof FindingSchema>> = [];
    if (findings.textBindingMismatches > 0) resultFindings.push({
      id: "text-template-non-string-binding",
      evidenceCount: findings.textBindingMismatches,
      evidenceBasis: "plan-dataflow",
    });
    if (findings.unusedInterfacePointers > 0) resultFindings.push({
      id: "interface-derived-values-unused",
      evidenceCount: findings.unusedInterfacePointers,
      evidenceBasis: "plan-dataflow",
    });
    const uncovered = observations.reduce((sum, task) => sum + task.uncoveredImportMetaEnvReferences, 0);
    if (uncovered > 0) resultFindings.push({
      id: "vite-reference-form-uncovered",
      evidenceCount: uncovered,
      evidenceBasis: "workdir-source-and-plan-regex",
    });
    const runtimeComplete = observations.filter((task) => task.runtimeStatus === "complete").length;
    const completedAt = z.string().datetime().parse(options.measurementCompletedAt ?? new Date().toISOString());
    const report = RestrictedDomainPlanSemanticInspectionReportSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan-semantic-inspection/v1",
      measurementCompletedAt: completedAt,
      parents: {
        attributionFreeze: { path: freezePath, sha256: sha256Bytes(freezeBytes) },
        attributionReport: { path: reportPath, sha256: sha256Bytes(attributionBytes) },
        generatedPlan: { path: planPath, sha256: sha256Bytes(planBytes) },
        taskSet: freeze.case.taskSet,
      },
      implementation,
      tasks: observations,
      findings: resultFindings,
      semanticParity: "not-established",
      eligibilityChanged: false,
      summary: {
        tasksExecuted: 2,
        runtimeComplete,
        runtimeFailed: 2 - runtimeComplete,
        paidCalls: 0,
        retries: 0,
        heldOutAccesses: 0,
        evaluatorPayloadAccesses: 0,
        coreBranchDelta: 0,
      },
    });
    await atomicWrite(options.outputPath, jsonText(report));
    return report;
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}
