import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { EvalCriterionSchema } from "../../core/types";
import {
  InitialWorkdirManifestSchema,
  readInitialWorkdirManifest,
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
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
  compileStructuralExecutionPlan,
  CrossArtifactConsistencyParametersSchema,
  evaluateCrossArtifactConsistencyPrimitive,
  StructuralTargetBindingSchema,
  type StructuralExecutionPlan,
} from "./automatic-structural-execution";
import { buildStructuralValidationPackage } from "./automatic-structural-execution-runtime";
import { sha256Bytes } from "./source-fixture";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();
const AuthoringSchema = z.object({
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  humanMinutes: z.number().int().nonnegative(),
}).strict();

const ManualComparisonSchema = z.object({
  id: IdentifierSchema,
  automaticCriterionIds: z.array(IdentifierSchema).min(1),
  manualCriterionId: IdentifierSchema,
  comparability: z.enum(["exact", "manual-stricter", "domain-bundled"]),
  reason: z.string().min(1),
}).strict();

const StructuralExecutionShadowCaseSchema = z.object({
  caseId: IdentifierSchema,
  expectedCandidateDigest: Sha256Schema,
  taskSet: DigestRefSchema,
  manualEvaluatorModule: DigestRefSchema,
  taskId: IdentifierSchema,
  bindings: z.array(StructuralTargetBindingSchema),
  manualComparisons: z.array(ManualComparisonSchema).min(1),
}).strict();

export const StructuralExecutionShadowCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-structural-execution-shadow-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  automaticDomainCatalog: DigestRefSchema,
  automaticDomainReport: DigestRefSchema,
  adapterAuthoring: AuthoringSchema,
  cases: z.array(StructuralExecutionShadowCaseSchema).length(7),
  domainProbe: z.object({
    caseId: IdentifierSchema,
    predicate: z.literal("cross-artifact-consistency"),
    criterionId: IdentifierSchema,
    parameters: CrossArtifactConsistencyParametersSchema,
    declarationAuthoring: AuthoringSchema,
  }).strict(),
}).strict().superRefine((catalog, context) => {
  const ids = catalog.cases.map((entry) => entry.caseId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "case ids must be unique" });
  if (!ids.includes(catalog.domainProbe.caseId)) context.addIssue({ code: "custom", message: "domain probe case is missing" });
});

export type StructuralExecutionShadowCatalog = z.infer<typeof StructuralExecutionShadowCatalogSchema>;

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
type ScenarioId = "baseline" | "input-tamper" | "missing-output" | "extra-output" | "json-shape-drift";

const ManualCriterionResultSchema = z.object({
  status: z.enum(["pass", "fail", "infrastructure-failure"]),
  details: z.string().optional(),
}).strict();

const StructuralScenarioSchema = z.object({
  id: z.enum(["baseline", "input-tamper", "missing-output", "extra-output", "json-shape-drift"]),
  mutatedPath: SafePathSchema.optional(),
  automatic: z.object({
    status: z.enum(["pass", "fail"]),
    runtimeStatus: z.enum(["complete", "protected-input-failure", "infrastructure-failure", "validation-failure"]),
    errors: z.array(z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/u),
      relativePath: SafePathSchema.optional(),
      contractRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u).optional(),
    }).strict()),
    predicateStatus: z.record(z.string(), z.enum(["pass", "fail"])),
    expectedViolation: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/u).nullable(),
    expectedViolationDetected: z.boolean(),
  }).strict(),
  manualCriterionStatus: z.record(z.string(), ManualCriterionResultSchema),
}).strict();

const StructuralManualComparisonResultSchema = ManualComparisonSchema.extend({
  observed: z.array(z.object({
    scenarioId: z.enum(["baseline", "input-tamper", "missing-output", "extra-output", "json-shape-drift"]),
    automatic: z.enum(["pass", "fail"]),
    manual: z.enum(["pass", "fail", "infrastructure-failure"]),
    agreement: z.boolean(),
  }).strict()).min(1),
  observedAgreementCount: z.number().int().nonnegative(),
  observedDifferenceCount: z.number().int().nonnegative(),
  manualInfrastructureCount: z.number().int().nonnegative(),
  exactExecutionParity: z.enum(["established", "different", "not-claimable"]),
}).strict().superRefine((comparison, context) => {
  if (comparison.observedAgreementCount + comparison.observedDifferenceCount + comparison.manualInfrastructureCount !== comparison.observed.length) {
    context.addIssue({ code: "custom", message: "manual comparison accounting does not conserve observations" });
  }
  if (comparison.comparability !== "exact" && comparison.exactExecutionParity !== "not-claimable") {
    context.addIssue({ code: "custom", message: "non-exact manual comparison cannot claim exact execution parity" });
  }
});

export const StructuralExecutionShadowReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-structural-execution-shadow-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  implementation: z.array(DigestRefSchema).min(1),
  candidateFreezeCompletedBeforeTaskOrEvaluatorRead: z.literal(true),
  generationFreeze: z.array(z.object({ caseId: IdentifierSchema, candidateDigest: Sha256Schema }).strict()).length(7),
  adapterAccounting: AuthoringSchema.extend({
    parityCatalogLoc: z.number().int().positive(),
    bindingPathCount: z.number().int().nonnegative(),
    manualOracleMappingCount: z.number().int().nonnegative(),
    coreBranchDelta: z.literal(0),
  }).strict(),
  cases: z.array(z.object({
    caseId: IdentifierSchema,
    taskId: IdentifierSchema,
    candidateDigest: Sha256Schema,
    structuralPlanDigest: Sha256Schema,
    packageManifestDigest: Sha256Schema,
    packageBytes: z.number().int().positive(),
    structuralPredicateCounts: z.record(z.string(), z.number().int().nonnegative()),
    accounting: z.object({
      fromTaskDeclaration: z.number().int().nonnegative(),
      parityAdapterBindings: z.number().int().nonnegative(),
      manualOracleMappings: z.number().int().nonnegative(),
      automaticRuntimeChecks: z.number().int().nonnegative(),
      coreBranchDelta: z.literal(0),
    }).strict(),
    scenarios: z.array(StructuralScenarioSchema).min(4),
    manualComparisons: z.array(StructuralManualComparisonResultSchema).min(1),
    semanticParity: z.literal("not-established"),
  }).strict()).length(7),
  domainProbe: z.object({
    predicate: z.literal("cross-artifact-consistency"),
    criterionId: IdentifierSchema,
    genericPrimitive: z.literal("json-pointer-relation"),
    declarationParameterCount: z.number().int().positive(),
    declarationAuthoring: AuthoringSchema,
    probeExecution: z.object({ baseline: z.literal("pass"), mismatch: z.literal("fail") }).strict(),
    coreBranchDelta: z.literal(0),
    productionGeneralization: z.literal("not-established"),
    semanticParity: z.literal("not-established"),
    ceiling: z.string().min(1),
  }).strict(),
  summary: z.object({
    caseCount: z.literal(7),
    genericPredicateCount: z.number().int().nonnegative(),
    scenarioExecutionCount: z.number().int().positive(),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
    casesWithPassingStructuralBaseline: z.number().int().min(0).max(7),
    exactManualComparisonsEstablished: z.number().int().nonnegative(),
    semanticParity: z.literal("not-established"),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (new Set(report.cases.map((entry) => entry.caseId)).size !== report.cases.length) {
    context.addIssue({ code: "custom", message: "report case ids must be unique" });
  }
  const scenarioCount = report.cases.reduce((sum, entry) => sum + entry.scenarios.length, 0);
  if (scenarioCount !== report.summary.scenarioExecutionCount) {
    context.addIssue({ code: "custom", message: "scenario execution count does not match cases" });
  }
  const predicateCount = report.cases.reduce((sum, entry) =>
    sum + Object.values(entry.structuralPredicateCounts).reduce((subtotal, count) => subtotal + count, 0), 0);
  if (predicateCount !== report.summary.genericPredicateCount) {
    context.addIssue({ code: "custom", message: "generic predicate count does not match cases" });
  }
  const passingBaselines = report.cases.filter((entry) =>
    entry.scenarios.find((scenario) => scenario.id === "baseline")?.automatic.status === "pass").length;
  if (passingBaselines !== report.summary.casesWithPassingStructuralBaseline) {
    context.addIssue({ code: "custom", message: "passing structural baseline count does not match cases" });
  }
  const exactEstablished = report.cases.flatMap((entry) => entry.manualComparisons)
    .filter((entry) => entry.exactExecutionParity === "established").length;
  if (exactEstablished !== report.summary.exactManualComparisonsEstablished) {
    context.addIssue({ code: "custom", message: "exact execution parity count does not match cases" });
  }
  const freezeByCase = new Map(report.generationFreeze.map((entry) => [entry.caseId, entry.candidateDigest]));
  if (freezeByCase.size !== report.cases.length
    || report.cases.some((entry) => freezeByCase.get(entry.caseId) !== entry.candidateDigest)) {
    context.addIssue({ code: "custom", message: "generation freeze does not match report cases" });
  }
});

export type StructuralExecutionShadowReport = z.infer<typeof StructuralExecutionShadowReportSchema>;

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

function jsonShapeValue(target: StructuralExecutionPlan["targets"][number]): unknown {
  if (target.structure?.kind !== "json-object") return {};
  return Object.fromEntries(target.structure.requiredFields.map((field) => [field, []]));
}

async function materializeStructuralOutputs(
  workDir: string,
  initialManifest: z.infer<typeof InitialWorkdirManifestSchema>,
  plan: StructuralExecutionPlan,
): Promise<void> {
  const initialFiles = new Set(initialManifest.entries.filter((entry) => entry.type === "file").map((entry) => entry.path));
  for (const target of plan.targets.filter((entry) => entry.role === "output")) {
    if (target.prefixes.length > 0) throw new Error(`output ${target.id} lacks a concrete parity binding`);
    for (const outputPath of target.paths) {
      if (initialFiles.has(outputPath)) continue;
      const destination = resolve(workDir, outputPath);
      await mkdir(dirname(destination), { recursive: true });
      const content = target.format === "json"
        ? jsonText(jsonShapeValue(target))
        : "structural parity placeholder\n";
      await writeFile(destination, content, "utf8");
    }
  }
}

function targetsForPredicate(plan: StructuralExecutionPlan, predicate: string) {
  const targetById = new Map(plan.targets.map((target) => [target.id, target]));
  const entry = plan.predicates.find((candidate) => candidate.predicate === predicate);
  return entry?.targetRefs.map((targetRef) => targetById.get(targetRef)!).filter(Boolean) ?? [];
}

async function applyScenarioMutation(options: {
  id: ScenarioId;
  workDir: string;
  initialManifest: z.infer<typeof InitialWorkdirManifestSchema>;
  plan: StructuralExecutionPlan;
}): Promise<string | undefined> {
  if (options.id === "baseline") return undefined;
  const initialFiles = new Set(options.initialManifest.entries.filter((entry) => entry.type === "file").map((entry) => entry.path));
  if (options.id === "input-tamper") {
    const targets = targetsForPredicate(options.plan, "input-integrity");
    const selected = targets.flatMap((target) => [
      ...target.paths.filter((path) => initialFiles.has(path)),
      ...target.prefixes.flatMap((prefix) => [...initialFiles].filter((path) => path.startsWith(`${prefix}/`))),
    ])[0];
    if (!selected) throw new Error("input-tamper scenario has no concrete input");
    await writeFile(resolve(options.workDir, selected), "structural parity tamper\n", "utf8");
    return selected;
  }
  if (options.id === "missing-output") {
    const selected = options.plan.targets
      .filter((target) => target.role === "output" && target.required)
      .flatMap((target) => target.paths)
      .find((path) => !initialFiles.has(path));
    if (!selected) throw new Error("missing-output scenario has no newly created required output");
    await rm(resolve(options.workDir, selected), { force: true });
    return selected;
  }
  if (options.id === "extra-output") {
    const selected = "unexpected-structural-parity.txt";
    await writeFile(resolve(options.workDir, selected), "unexpected\n", "utf8");
    return selected;
  }
  const selected = targetsForPredicate(options.plan, "json-shape")
    .flatMap((target) => target.paths)[0];
  if (!selected) throw new Error("json-shape-drift scenario has no JSON output");
  await writeFile(resolve(options.workDir, selected), "{}\n", "utf8");
  return selected;
}

function expectedViolation(id: ScenarioId): string | undefined {
  switch (id) {
    case "baseline": return undefined;
    case "input-tamper": return "INPUT_MODIFIED";
    case "missing-output": return "OUTPUT_MISSING";
    case "extra-output": return "UNEXPECTED_ENTRY";
    case "json-shape-drift": return "JSON_REQUIRED_FIELD_MISSING";
  }
}

async function runManualCriteria(
  task: Task,
  runs: Array<{ id: ScenarioId; workDir: string; initialWorkdirManifest: InitialWorkdirManifestReference }>,
  caseRoot: string,
  evaluatorModule: string,
) {
  const inputPath = join(caseRoot, "manual-evaluator-input.json");
  await writeFile(inputPath, jsonText({ evaluatorModule, eval: task.eval, runs }), "utf8");
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
  if (exitCode !== 0) throw new Error(`manual evaluator subprocess failed: ${stderr.trim()}`);
  const parsed = z.record(z.string(), z.record(z.string(), ManualCriterionResultSchema)).parse(JSON.parse(stdout.trim()));
  return new Map(Object.entries(parsed).map(([id, results]) => [id, new Map(Object.entries(results))]));
}

function predicateStatuses(plan: StructuralExecutionPlan, errors: Array<{ contractRef?: string }>) {
  const failed = new Set(errors.flatMap((entry) => entry.contractRef ? [entry.contractRef] : []));
  return Object.fromEntries(plan.predicates.map((predicate) => [
    predicate.criterionId,
    failed.has(predicate.criterionId) ? "fail" : "pass",
  ]));
}

function countPredicates(plan: StructuralExecutionPlan) {
  return Object.fromEntries(["input-integrity", "output-presence", "exact-output-set", "json-shape"]
    .map((predicate) => [predicate, plan.predicates.filter((entry) => entry.predicate === predicate).length])) as Record<string, number>;
}

function pointerGet(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  return pointer.slice(1).split("/").reduce<unknown>((current, raw) => {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    return typeof current === "object" && current !== null ? (current as Record<string, unknown>)[key] : undefined;
  }, value);
}

function pointerDocument(pointer: string, value: unknown): unknown {
  if (pointer === "") return value;
  const root: Record<string, unknown> = {};
  let current = root;
  const segments = pointer.slice(1).split("/").map((entry) => entry.replaceAll("~1", "/").replaceAll("~0", "~"));
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) current[segment] = value;
    else current = current[segment] = {};
  }
  return root;
}

async function runDomainProbe(options: {
  rootDir: string;
  executionRoot: string;
  catalog: StructuralExecutionShadowCatalog;
  tasks: Map<string, Task>;
}) {
  const probe = options.catalog.domainProbe;
  const task = options.tasks.get(probe.caseId)!;
  const workDir = join(options.executionRoot, "domain-probe", "workdir");
  await materializeFixtures(workDir, task);
  const comparison = probe.parameters.comparisons[0]!;
  const leftDocument = JSON.parse(await readFile(resolve(workDir, comparison.left.path), "utf8")) as unknown;
  const leftValue = pointerGet(leftDocument, comparison.left.jsonPointer);
  if (leftValue === undefined) throw new Error("domain probe left parameter does not resolve");
  await mkdir(dirname(resolve(workDir, comparison.right.path)), { recursive: true });
  await writeFile(resolve(workDir, comparison.right.path), jsonText(pointerDocument(comparison.right.jsonPointer, leftValue)), "utf8");
  const baseline = await evaluateCrossArtifactConsistencyPrimitive(workDir, probe.parameters);
  await writeFile(resolve(workDir, comparison.right.path), jsonText(pointerDocument(comparison.right.jsonPointer, "__mismatch__")), "utf8");
  const mismatch = await evaluateCrossArtifactConsistencyPrimitive(workDir, probe.parameters);
  return {
    predicate: probe.predicate,
    criterionId: probe.criterionId,
    genericPrimitive: "json-pointer-relation",
    declarationParameterCount: probe.parameters.comparisons.length,
    declarationAuthoring: probe.declarationAuthoring,
    probeExecution: { baseline: baseline.status, mismatch: mismatch.status },
    coreBranchDelta: 0 as const,
    productionGeneralization: "not-established" as const,
    semanticParity: "not-established" as const,
    ceiling: "One declaration-parameterized probe executes without a skill branch; the remaining natural-language domain predicates still lack pointer, normalization, runtime-command, or source-oracle parameters.",
  };
}

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/automatic-structural-execution.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution-checker.ts",
  "src/benchmarks/skill-ir/automatic-structural-manual-checker.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution-runtime.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution-shadow.ts",
  "src/benchmarks/skill-ir/automatic-structural-execution-shadow-run.ts",
] as const;

export async function runStructuralExecutionShadow(
  rootDir: string,
  rawCatalog: StructuralExecutionShadowCatalog,
  outDir: string,
  options: { measurementCompletedAt: string },
) {
  const catalog = StructuralExecutionShadowCatalogSchema.parse(rawCatalog);
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt);
  const domainCatalogBytes = await readPinned(rootDir, catalog.automaticDomainCatalog);
  const domainReportBytes = await readPinned(rootDir, catalog.automaticDomainReport);
  const domainCatalog = DomainAutomaticConstructionShadowCatalogSchema.parse(JSON.parse(domainCatalogBytes.toString("utf8")));
  const domainReport = DomainAutomaticConstructionShadowReportSchema.parse(JSON.parse(domainReportBytes.toString("utf8")));
  const domainCases = new Map(domainCatalog.cases.map((entry) => [entry.caseId, entry]));
  const frozenDigests = new Map(domainReport.generationFreeze.map((entry) => [entry.caseId, entry.candidateDigest]));

  const generated = new Map<string, {
    candidate: DomainAutomaticConstructionResult;
    digest: string;
    plan: StructuralExecutionPlan;
    sourceBytes: Buffer;
  }>();
  for (const caseConfig of catalog.cases) {
    const domainCase = domainCases.get(caseConfig.caseId);
    if (!domainCase) throw new Error(`automatic-domain case is missing: ${caseConfig.caseId}`);
    const candidate = await constructDomainSkillCandidates(rootDir, domainCase.generationInput);
    const digest = sha256Bytes(Buffer.from(jsonText(candidate)));
    if (digest !== caseConfig.expectedCandidateDigest || digest !== frozenDigests.get(caseConfig.caseId)) {
      throw new Error(`candidate freeze drift for ${caseConfig.caseId}`);
    }
    generated.set(caseConfig.caseId, {
      candidate,
      digest,
      plan: compileStructuralExecutionPlan(candidate, caseConfig.bindings),
      sourceBytes: await readFile(containedPath(rootDir, domainCase.generationInput.source.path)),
    });
  }

  // Task files, evaluator payloads, and manual checker modules are intentionally read only after every candidate digest is frozen.
  const tasks = new Map<string, Task>();
  const manualEvaluatorModules = new Map<string, string>();
  for (const caseConfig of catalog.cases) {
    const taskSet = TaskSetSchema.parse(JSON.parse((await readPinned(rootDir, caseConfig.taskSet)).toString("utf8")));
    await readPinned(rootDir, caseConfig.manualEvaluatorModule);
    const task = taskSet.tasks.find((entry) => entry.id === caseConfig.taskId);
    if (!task) throw new Error(`task ${caseConfig.taskId} is missing for ${caseConfig.caseId}`);
    tasks.set(caseConfig.caseId, task);
    manualEvaluatorModules.set(caseConfig.caseId, containedPath(rootDir, caseConfig.manualEvaluatorModule.path));
  }

  const executionRoot = await mkdtemp(join(tmpdir(), "skill-ir-structural-shadow-"));
  try {
    const cases = [];
    for (const caseConfig of catalog.cases) {
      const frozen = generated.get(caseConfig.caseId)!;
      const task = tasks.get(caseConfig.caseId)!;
      const seedWorkDir = join(executionRoot, caseConfig.caseId, "seed-workdir");
      await materializeFixtures(seedWorkDir, task);
      const seedManifestReference = await writeInitialWorkdirManifest({
        workDir: seedWorkDir,
        manifestPath: join(executionRoot, caseConfig.caseId, "seed-initial-manifest.json"),
      });
      const seedManifest = await readInitialWorkdirManifest({ workDir: seedWorkDir, reference: seedManifestReference });
      const packageRecord = await buildStructuralValidationPackage({
        packageDir: join(executionRoot, caseConfig.caseId, "package"),
        candidate: frozen.candidate,
        plan: frozen.plan,
        initialManifest: seedManifest,
        sourceBytes: frozen.sourceBytes,
        taskId: task.id,
        taskPrompt: task.prompt,
      });
      const scenarioIds: ScenarioId[] = ["baseline", "input-tamper", "missing-output", "extra-output"];
      if (frozen.plan.predicates.some((entry) => entry.predicate === "json-shape")) scenarioIds.push("json-shape-drift");
      const scenarios = [];
      const manualRuns: Array<{ id: ScenarioId; workDir: string; initialWorkdirManifest: InitialWorkdirManifestReference }> = [];
      const manualByComparison = new Map(caseConfig.manualComparisons.map((entry) => [entry.id, [] as Array<{
        scenarioId: ScenarioId;
        automatic: "pass" | "fail";
        manual: "pass" | "fail" | "infrastructure-failure";
        agreement: boolean;
      }>]));
      for (const scenarioId of scenarioIds) {
        const scenarioRoot = join(executionRoot, caseConfig.caseId, "scenarios", scenarioId);
        const workDir = join(scenarioRoot, "workdir");
        await materializeFixtures(workDir, task);
        const manifestReference = await writeInitialWorkdirManifest({
          workDir,
          manifestPath: join(scenarioRoot, "initial-workdir-manifest.json"),
        });
        const initialManifest = await readInitialWorkdirManifest({ workDir, reference: manifestReference });
        if (JSON.stringify(initialManifest) !== JSON.stringify(seedManifest)) {
          throw new Error(`scenario fixture drift for ${caseConfig.caseId}/${scenarioId}`);
        }
        await materializeStructuralOutputs(workDir, initialManifest, frozen.plan);
        const mutatedPath = await applyScenarioMutation({ id: scenarioId, workDir, initialManifest, plan: frozen.plan });
        const runtime = await runValidatedArtifactPlan({ package: packageRecord, workDir });
        if (!runtime.validation) throw new Error(`structural runtime produced no validation for ${caseConfig.caseId}/${scenarioId}`);
        const expectedCode = expectedViolation(scenarioId);
        const automaticStatus = runtime.validation.status;
        const predicateStatus = predicateStatuses(frozen.plan, runtime.validation.errors);
        manualRuns.push({ id: scenarioId, workDir, initialWorkdirManifest: manifestReference });
        scenarios.push({
          id: scenarioId,
          mutatedPath,
          automatic: {
            status: automaticStatus,
            runtimeStatus: runtime.status,
            errors: runtime.validation.errors,
            predicateStatus,
            expectedViolation: expectedCode ?? null,
            expectedViolationDetected: expectedCode === undefined
              ? runtime.validation.status === "pass"
              : runtime.validation.errors.some((entry) => entry.code === expectedCode),
          },
        });
      }
      const manualByScenario = await runManualCriteria(
        task,
        manualRuns,
        join(executionRoot, caseConfig.caseId),
        manualEvaluatorModules.get(caseConfig.caseId)!,
      );
      const scenariosWithManual = scenarios.map((scenario) => {
        const manual = manualByScenario.get(scenario.id);
        if (!manual) throw new Error(`manual scenario ${scenario.id} is missing`);
        for (const comparison of caseConfig.manualComparisons) {
          const manualResult = manual.get(comparison.manualCriterionId);
          if (!manualResult) throw new Error(`manual criterion ${comparison.manualCriterionId} is missing`);
          const automatic = comparison.automaticCriterionIds.every((id) => scenario.automatic.predicateStatus[id] === "pass")
            ? "pass" as const
            : "fail" as const;
          manualByComparison.get(comparison.id)!.push({
            scenarioId: scenario.id,
            automatic,
            manual: manualResult.status,
            agreement: manualResult.status !== "infrastructure-failure" && automatic === manualResult.status,
          });
        }
        return { ...scenario, manualCriterionStatus: Object.fromEntries(manual) };
      });
      cases.push({
        caseId: caseConfig.caseId,
        taskId: task.id,
        candidateDigest: frozen.digest,
        structuralPlanDigest: sha256Bytes(Buffer.from(jsonText(frozen.plan))),
        packageManifestDigest: sha256Bytes(await readFile(join(packageRecord.packageDir, "package-manifest.json"))),
        packageBytes: packageRecord.packageBytes,
        structuralPredicateCounts: countPredicates(frozen.plan),
        accounting: {
          fromTaskDeclaration: frozen.plan.predicates.length,
          parityAdapterBindings: caseConfig.bindings.reduce((sum, entry) => sum + entry.paths.length, 0),
          manualOracleMappings: caseConfig.manualComparisons.length,
          automaticRuntimeChecks: frozen.plan.predicates.length,
          coreBranchDelta: 0,
        },
        scenarios: scenariosWithManual,
        manualComparisons: caseConfig.manualComparisons.map((comparison) => {
          const observed = manualByComparison.get(comparison.id)!;
          const manualInfrastructureCount = observed.filter((entry) => entry.manual === "infrastructure-failure").length;
          const observedAgreementCount = observed.filter((entry) => entry.agreement).length;
          return {
            ...comparison,
            observed,
            observedAgreementCount,
            observedDifferenceCount: observed.length - observedAgreementCount - manualInfrastructureCount,
            manualInfrastructureCount,
            exactExecutionParity: comparison.comparability === "exact"
              ? (observed.every((entry) => entry.agreement) ? "established" : "different")
              : "not-claimable",
          };
        }),
        semanticParity: "not-established" as const,
      });
    }

    const domainProbe = await runDomainProbe({ rootDir, executionRoot, catalog, tasks });
    const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
      path,
      sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
    })));
    const scenarioExecutionCount = cases.reduce((sum, entry) => sum + entry.scenarios.length, 0);
    const report = StructuralExecutionShadowReportSchema.parse({
      schemaVersion: "skill-ir-structural-execution-shadow-report/v1" as const,
      catalogId: catalog.catalogId,
      catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog))),
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      implementation,
      candidateFreezeCompletedBeforeTaskOrEvaluatorRead: true as const,
      generationFreeze: cases.map((entry) => ({ caseId: entry.caseId, candidateDigest: entry.candidateDigest })),
      adapterAccounting: {
        ...catalog.adapterAuthoring,
        parityCatalogLoc: jsonText(catalog).split(/\r?\n/u).length,
        bindingPathCount: catalog.cases.reduce((sum, entry) => sum + entry.bindings.reduce((subtotal, binding) => subtotal + binding.paths.length, 0), 0),
        manualOracleMappingCount: catalog.cases.reduce((sum, entry) => sum + entry.manualComparisons.length, 0),
        coreBranchDelta: 0 as const,
      },
      cases,
      domainProbe,
      summary: {
        caseCount: cases.length,
        genericPredicateCount: cases.reduce((sum, entry) => sum + Object.values(entry.structuralPredicateCounts).reduce((subtotal, count) => subtotal + count, 0), 0),
        scenarioExecutionCount,
        paidCalls: 0 as const,
        heldOutAccesses: 0 as const,
        coreBranchDelta: 0 as const,
        casesWithPassingStructuralBaseline: cases.filter((entry) =>
          entry.scenarios.find((scenario) => scenario.id === "baseline")?.automatic.status === "pass").length,
        exactManualComparisonsEstablished: cases.flatMap((entry) => entry.manualComparisons)
          .filter((entry) => entry.exactExecutionParity === "established").length,
        semanticParity: "not-established" as const,
      },
    });
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "report.json"), jsonText(report), "utf8");
    return report;
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
