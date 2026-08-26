import { isDeepStrictEqual } from "node:util";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import "../../bench/evaluators/index";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import type { SkillIRBenchmarkTask, SkvmTaskJson } from "./real-agent";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import { executeRestrictedDomainPlan, RestrictedDomainPlanSchema } from "./automatic-restricted-domain-plan";
import { ReviewedAotConstructionCostReadinessReportSchema } from "./reviewed-aot-construction-cost-readiness";
import { ReviewRequiredReportSchema } from "./review-required";
import { scoreRawRunRows, type RawAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(300).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const FrozenFileSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();
const TaskIdSchema = z.enum([
  "env-manager-scorer-authority-node-dev-001",
  "env-manager-scorer-authority-vite-dev-002",
]);
const SystemSchema = z.enum(["original", "reviewed-aot"]);

export const REVIEWED_AOT_EFFICIENCY_POLICY_PATH =
  "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-v1.json";
export const REVIEWED_AOT_EFFICIENCY_FREEZE_PATH =
  "results/skill-ir/reviewed-aot-efficiency-matrix-freeze-v1.json";
const CONSTRUCTION_READINESS_PATH =
  "results/skill-ir/reviewed-aot-construction-cost-readiness-env-2026-08-26.json";

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-matrix.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-matrix-run.ts",
  "src/benchmarks/skill-ir/real-agent-run.ts",
  "src/benchmarks/skill-ir/real-agent.ts",
  "src/benchmarks/skill-ir/matrix.ts",
  "src/benchmarks/skill-ir/corpus-registry.ts",
  "src/benchmarks/skill-ir/prospective-development-run.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/scoring.ts",
  "src/benchmarks/skill-ir/optimization-cost-accounting.ts",
  "src/core/workdir-manifest.ts",
] as const;

const FROZEN_INPUT_PATHS = {
  source: "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md",
  tasks: "benchmarks/skill-ir/pilots/env-manager/successor-v3/development/tasks.json",
  scorer: "src/bench/evaluators/env-manager-grade-v3.ts",
  evaluatorRegistry: "src/bench/evaluators/index.ts",
  automaticPlan: "results/skill-ir/automatic-domain-plan-generic-repair-env-2026-08-25/generated-plan.json",
  reviewPatch: "benchmarks/skill-ir/pilots/env-manager/review-required/review-patch.ts",
  reviewReport: "results/skill-ir/review-required-env-2026-08-26/report.json",
  corpusManifest: "benchmarks/skill-ir/corpus/corpora/pilot.json",
  resourceContract: "benchmarks/skill-ir/pilots/env-manager/successor-v3/resource-contract.json",
  packageJson: "package.json",
  bunLock: "bun.lock",
  adapterSource: "src/adapters/pi.ts",
  piCli: "node_modules/@mariozechner/pi-coding-agent/dist/cli.js",
  sourceEntrypoint: "src/index.ts",
} as const;

const FrozenInputsSchema = z.object(Object.fromEntries(
  Object.keys(FROZEN_INPUT_PATHS).map((key) => [key, FrozenFileSchema]),
) as { [K in keyof typeof FROZEN_INPUT_PATHS]: typeof FrozenFileSchema }).strict();

export const ReviewedAotEfficiencyPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-policy/v1"),
  experimentId: z.literal("env-manager-reviewed-aot-efficiency-v1"),
  frozenAt: z.literal("2026-08-26T04:30:00.000Z"),
  timing: z.literal("after-construction-cost-readiness-before-paid-matrix"),
  caseId: z.literal("env-manager"),
  constructionCostReadiness: FrozenFileSchema,
  frozenInputs: FrozenInputsSchema,
  implementation: z.array(FrozenFileSchema).length(IMPLEMENTATION_PATHS.length),
  harness: z.object({
    adapter: z.literal("pi"),
    adapterVersion: z.literal("0.67.68"),
    mode: z.literal("managed"),
    nodeCommand: z.literal("node"),
    bunVersion: z.string().min(1),
  }).strict(),
  model: z.object({ route: z.literal("xty/gpt-5.6-sol"), family: z.literal("gpt") }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    retries: z.literal(0),
    absoluteTimeoutMs: z.literal(600000),
    idleTimeoutMs: z.literal(120000),
    maxSteps: z.literal(30),
    outerWatchdogMs: z.literal(660000),
  }).strict(),
  denominator: z.object({
    rows: z.literal(8),
    pairs: z.literal(4),
    paidOriginalRows: z.literal(4),
    deterministicReviewedAotRows: z.literal(4),
    taskIds: z.tuple([TaskIdSchema, TaskIdSchema]),
    repetitions: z.literal(2),
    systems: z.tuple([z.literal("original"), z.literal("reviewed-aot")]),
    order: z.literal("task-then-repetition-then-system"),
    retries: z.literal(0),
    forwardOnly: z.literal(true),
  }).strict(),
  productionOneTime: z.object({
    compileModelTokens: z.number().int().nonnegative(),
    profileModelTokens: z.number().int().nonnegative(),
    packageModelTokens: z.number().int().nonnegative(),
    missing: z.tuple([]),
  }).strict(),
  researchAccounting: z.object({
    includeConstructionSynthesisAttempt: z.literal(true),
    includeEveryMatrixRow: z.literal(true),
    requireInputOutputAndCacheUsage: z.literal(true),
    scorerDurationMeasuredSeparately: z.literal(true),
    humanReviewSeparated: z.literal(true),
  }).strict(),
  decisionRules: z.object({
    qualityEquivalent: z.literal("reviewed-aot-no-pairwise-regression-and-all-reviewed-rows-pass"),
    efficiencyPositive: z.literal("public-cost-builder-only-after-complete-eight-row-and-all-attempt-ledgers"),
  }).strict(),
  authorization: z.object({
    currentStagePaidCalls: z.literal(0),
    freezeOnly: z.literal(true),
    paidMatrixBeforeFreeze: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("qualification-repeat"),
    z.literal("historical-runtime-row-reuse"),
    z.literal("retry-or-reserve-selection"),
    z.literal("post-hoc-row-selection"),
    z.literal("human-time-in-break-even-token-denominator"),
    z.literal("held-out"),
    z.literal("readiness-promotion"),
  ]),
  claimBoundary: z.literal("The frozen matrix may measure reviewed-AOT quality and token efficiency on two development tasks only. Production AOT tokens, research all-attempt cost, and human review remain separate; no held-out, readiness, or general automation claim is authorized."),
}).strict().superRefine((policy, context) => {
  if (policy.denominator.taskIds[0] === policy.denominator.taskIds[1]
    || policy.denominator.rows !== policy.denominator.pairs * policy.denominator.systems.length
    || policy.denominator.paidOriginalRows + policy.denominator.deterministicReviewedAotRows !== policy.denominator.rows) {
    context.addIssue({ code: "custom", message: "reviewed-AOT denominator arithmetic drift" });
  }
});

export type ReviewedAotEfficiencyPolicy = z.infer<typeof ReviewedAotEfficiencyPolicySchema>;

export const ReviewedAotEfficiencyRowSchema = z.object({
  taskId: TaskIdSchema,
  repetition: z.union([z.literal(1), z.literal(2)]),
  system: SystemSchema,
  paid: z.boolean(),
}).strict();
export type ReviewedAotEfficiencyRow = z.infer<typeof ReviewedAotEfficiencyRowSchema>;

export const ReviewedAotEfficiencyFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-freeze/v1"),
  freezeId: z.literal("env-reviewed-aot-efficiency-identity-v1"),
  status: z.literal("passed"),
  identityClosure: z.object({
    policy: FrozenFileSchema,
    constructionCostReadiness: FrozenFileSchema,
    frozenInputs: FrozenInputsSchema,
    implementation: z.array(FrozenFileSchema).length(IMPLEMENTATION_PATHS.length),
  }).strict(),
  plan: z.object({
    rows: z.literal(8),
    pairs: z.literal(4),
    paidOriginalRows: z.literal(4),
    deterministicReviewedAotRows: z.literal(4),
    orderedRows: z.array(ReviewedAotEfficiencyRowSchema).length(8),
    resumablePrefixRows: z.literal(0),
    retries: z.literal(0),
    forwardOnly: z.literal(true),
  }).strict(),
  deterministicDryRun: z.object({
    tasks: z.literal(2),
    fullPassTasks: z.literal(2),
    modelTokens: z.literal(0),
    patchBundleSha256: Sha256Schema,
  }).strict(),
  accounting: z.object({ currentStagePaidCalls: z.literal(0), matrixExecuted: z.literal(false) }).strict(),
  authorizations: z.object({
    paidMatrix: z.literal(true),
    heldOut: z.literal(false),
    efficiencyClaim: z.literal(false),
  }).strict(),
  sensitiveData: z.object({
    apiCredentialContentConsumed: z.literal(false),
    modelOutputContentConsumed: z.literal(false),
    heldOutConsumed: z.literal(false),
  }).strict(),
  claimBoundary: z.literal("This zero-paid freeze validates the exact eight-row identity and the reviewed-AOT deterministic arm. It authorizes four later original-system calls with zero retries; it does not itself establish recurring savings or an efficiency-positive result."),
}).strict();

export type ReviewedAotEfficiencyFreeze = z.infer<typeof ReviewedAotEfficiencyFreezeSchema>;

type OriginalPlanRow = Awaited<ReturnType<typeof buildPlan>>[number];

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function contained(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return candidate;
}

async function frozen(rootDir: string, path: string) {
  const absolute = contained(rootDir, path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`frozen input must be a regular file: ${path}`);
  return FrozenFileSchema.parse({ path, sha256: sha256Bytes(await readFile(absolute)) });
}

async function verify(rootDir: string, ref: z.infer<typeof FrozenFileSchema>): Promise<Buffer> {
  const absolute = contained(rootDir, ref.path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`frozen input must be a regular file: ${ref.path}`);
  const bytes = await readFile(absolute);
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`reviewed-AOT digest mismatch for ${ref.path}`);
  return bytes;
}

function managedPlan(rows: OriginalPlanRow[], policy: ReviewedAotEfficiencyPolicy, rootDir: string) {
  return rows.map((row) => {
    const observationPath = join(row.workDir, "..", "execution-observation.json");
    return {
      ...row,
      command: [
        process.execPath, "run", contained(rootDir, policy.frozenInputs.sourceEntrypoint.path), "run",
        ...row.command.slice(4).filter((argument) => !argument.startsWith("--adapter-config=")
          && !argument.startsWith("--timeout-ms=") && !argument.startsWith("--idle-timeout-ms=")
          && !argument.startsWith("--max-steps=") && !argument.startsWith("--execution-observation=")),
        "--adapter-config=managed",
        `--timeout-ms=${policy.runtime.absoluteTimeoutMs}`,
        `--idle-timeout-ms=${policy.runtime.idleTimeoutMs}`,
        `--max-steps=${policy.runtime.maxSteps}`,
        `--execution-observation=${observationPath}`,
      ],
    };
  });
}

export async function buildReviewedAotOriginalPlan(options: {
  rootDir: string;
  outDir: string;
  policy: ReviewedAotEfficiencyPolicy;
}): Promise<{ args: RealAgentRunArgs; rows: OriginalPlanRow[] }> {
  const rootDir = resolve(options.rootDir);
  const args: RealAgentRunArgs = {
    corpus: "pilot",
    model: options.policy.model.route,
    modelFamily: options.policy.model.family,
    adapter: options.policy.harness.adapter,
    adapterVersion: options.policy.harness.adapterVersion,
    repetitions: options.policy.denominator.repetitions,
    panelConfigId: options.policy.experimentId,
    outDir: join(resolve(options.outDir), "model-run"),
    limit: options.policy.denominator.paidOriginalRows,
    execute: false,
    retries: 0,
    retryDelayMs: 0,
    outerWatchdogMs: options.policy.runtime.outerWatchdogMs,
    rootDir,
    allowTasksAuthored: false,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set(["env-manager-v3"]),
    systems: new Set(["original"]),
    contexts: new Set(["clean"]),
    agents: new Set(["skvm"]),
    environments: new Set(["windows"]),
    tasks: new Set(options.policy.denominator.taskIds),
    requireEnv: new Set([options.policy.runtime.apiKeyEnv]),
  };
  const rows = managedPlan(await buildPlan(args), options.policy, rootDir);
  if (rows.length !== 4) throw new Error(`reviewed-AOT original plan row drift: ${rows.length}`);
  return { args, rows };
}

export function orderedReviewedAotRows(
  policy: ReviewedAotEfficiencyPolicy,
  originalRows: OriginalPlanRow[],
): ReviewedAotEfficiencyRow[] {
  const ordered: ReviewedAotEfficiencyRow[] = [];
  for (const taskId of policy.denominator.taskIds) {
    for (let repetition = 1 as 1 | 2; repetition <= policy.denominator.repetitions; repetition += 1) {
      const matches = originalRows.filter((row) => row.caseId.endsWith(`:${taskId}`) && row.runIndex === repetition);
      if (matches.length !== 1 || matches[0]!.system !== "original") {
        throw new Error(`reviewed-AOT original plan identity drift: ${taskId}/${repetition}`);
      }
      ordered.push({ taskId, repetition, system: "original", paid: true });
      ordered.push({ taskId, repetition, system: "reviewed-aot", paid: false });
    }
  }
  return z.array(ReviewedAotEfficiencyRowSchema).length(8).parse(ordered);
}

export function assertReviewedAotEfficiencyPrefix(
  rows: ReviewedAotEfficiencyRow[],
  prefix: ReviewedAotEfficiencyRow[],
): void {
  if (prefix.length > rows.length) throw new Error("reviewed-AOT prefix length mismatch");
  for (let index = 0; index < prefix.length; index += 1) {
    if (!isDeepStrictEqual(prefix[index], rows[index])) {
      throw new Error(`reviewed-AOT prefix identity mismatch at row ${index + 1}`);
    }
  }
}

export async function buildReviewedAotEfficiencyPolicy(rootDirInput: string): Promise<ReviewedAotEfficiencyPolicy> {
  const rootDir = resolve(rootDirInput);
  const constructionCostReadiness = await frozen(rootDir, CONSTRUCTION_READINESS_PATH);
  const readiness = ReviewedAotConstructionCostReadinessReportSchema.parse(JSON.parse(
    (await readFile(contained(rootDir, CONSTRUCTION_READINESS_PATH), "utf8")),
  ));
  if (readiness.status !== "ready-to-freeze-efficiency-identity"
    || !readiness.authorization.freezeEightRowPolicy
    || readiness.authorization.paidMatrixExecution
    || !readiness.productionOneTime.complete
    || readiness.productionOneTime.missing.length !== 0) {
    throw new Error("reviewed-AOT construction cost is not ready for policy freeze");
  }
  const frozenInputEntries = await Promise.all(Object.entries(FROZEN_INPUT_PATHS).map(async ([key, path]) =>
    [key, await frozen(rootDir, path)] as const));
  return ReviewedAotEfficiencyPolicySchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-policy/v1",
    experimentId: "env-manager-reviewed-aot-efficiency-v1",
    frozenAt: "2026-08-26T04:30:00.000Z",
    timing: "after-construction-cost-readiness-before-paid-matrix",
    caseId: "env-manager",
    constructionCostReadiness,
    frozenInputs: Object.fromEntries(frozenInputEntries),
    implementation: await Promise.all(IMPLEMENTATION_PATHS.map((path) => frozen(rootDir, path))),
    harness: { adapter: "pi", adapterVersion: "0.67.68", mode: "managed", nodeCommand: "node", bunVersion: Bun.version },
    model: { route: "xty/gpt-5.6-sol", family: "gpt" },
    runtime: {
      apiKeyEnv: "SKVM_XTY_API_KEY", retries: 0, absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000, maxSteps: 30, outerWatchdogMs: 660000,
    },
    denominator: {
      rows: 8, pairs: 4, paidOriginalRows: 4, deterministicReviewedAotRows: 4,
      taskIds: ["env-manager-scorer-authority-node-dev-001", "env-manager-scorer-authority-vite-dev-002"],
      repetitions: 2, systems: ["original", "reviewed-aot"],
      order: "task-then-repetition-then-system", retries: 0, forwardOnly: true,
    },
    productionOneTime: {
      compileModelTokens: readiness.productionOneTime.builderMapping.compileModelTokens,
      profileModelTokens: readiness.productionOneTime.builderMapping.profileModelTokens,
      packageModelTokens: readiness.productionOneTime.builderMapping.packageModelTokens,
      missing: [],
    },
    researchAccounting: {
      includeConstructionSynthesisAttempt: true, includeEveryMatrixRow: true,
      requireInputOutputAndCacheUsage: true, scorerDurationMeasuredSeparately: true,
      humanReviewSeparated: true,
    },
    decisionRules: {
      qualityEquivalent: "reviewed-aot-no-pairwise-regression-and-all-reviewed-rows-pass",
      efficiencyPositive: "public-cost-builder-only-after-complete-eight-row-and-all-attempt-ledgers",
    },
    authorization: {
      currentStagePaidCalls: 0, freezeOnly: true, paidMatrixBeforeFreeze: false,
      heldOut: false, readinessPromotion: false,
    },
    prohibited: [
      "qualification-repeat", "historical-runtime-row-reuse", "retry-or-reserve-selection",
      "post-hoc-row-selection", "human-time-in-break-even-token-denominator", "held-out", "readiness-promotion",
    ],
    claimBoundary: "The frozen matrix may measure reviewed-AOT quality and token efficiency on two development tasks only. Production AOT tokens, research all-attempt cost, and human review remain separate; no held-out, readiness, or general automation claim is authorized.",
  });
}

export async function validateReviewedAotEfficiencyPolicy(input: unknown, rootDirInput: string) {
  const rootDir = resolve(rootDirInput);
  const policy = ReviewedAotEfficiencyPolicySchema.parse(input);
  if (policy.constructionCostReadiness.path !== CONSTRUCTION_READINESS_PATH
    || !isDeepStrictEqual(Object.fromEntries(Object.entries(policy.frozenInputs).map(([key, ref]) => [key, ref.path])), FROZEN_INPUT_PATHS)
    || !isDeepStrictEqual(policy.implementation.map((ref) => ref.path), [...IMPLEMENTATION_PATHS])) {
    throw new Error("reviewed-AOT policy authority path drift");
  }
  const allRefs = [policy.constructionCostReadiness, ...Object.values(policy.frozenInputs), ...policy.implementation];
  const verified = new Map<string, Buffer>();
  for (const ref of allRefs) verified.set(ref.path, await verify(rootDir, ref));
  const readiness = ReviewedAotConstructionCostReadinessReportSchema.parse(JSON.parse(
    verified.get(policy.constructionCostReadiness.path)!.toString("utf8"),
  ));
  const review = ReviewRequiredReportSchema.parse(JSON.parse(
    verified.get(policy.frozenInputs.reviewReport.path)!.toString("utf8"),
  ));
  if (readiness.status !== "ready-to-freeze-efficiency-identity"
    || !readiness.authorization.freezeEightRowPolicy || readiness.authorization.paidMatrixExecution
    || !readiness.productionOneTime.complete || readiness.productionOneTime.missing.length !== 0
    || !isDeepStrictEqual(policy.productionOneTime, {
      compileModelTokens: readiness.productionOneTime.builderMapping.compileModelTokens,
      profileModelTokens: readiness.productionOneTime.builderMapping.profileModelTokens,
      packageModelTokens: readiness.productionOneTime.builderMapping.packageModelTokens,
      missing: [],
    })
    || review.inputs.automaticPlan.sha256 !== policy.frozenInputs.automaticPlan.sha256
    || review.patch.sha256 !== policy.frozenInputs.reviewPatch.sha256
    || readiness.evidence.reviewReport.sha256 !== policy.frozenInputs.reviewReport.sha256) {
    throw new Error("reviewed-AOT construction or package identity drift");
  }
  const packageJson = JSON.parse(verified.get(policy.frozenInputs.packageJson.path)!.toString("utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declaredPi = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"];
  if (declaredPi !== policy.harness.adapterVersion || Bun.version !== policy.harness.bunVersion
    || !Bun.which(policy.harness.nodeCommand)) {
    throw new Error("reviewed-AOT harness identity drift");
  }
  const temporary = await mkdtemp(join(tmpdir(), "skill-ir-reviewed-aot-plan-"));
  try {
    const originalPlan = await buildReviewedAotOriginalPlan({ rootDir, outDir: temporary, policy });
    const rows = orderedReviewedAotRows(policy, originalPlan.rows);
    return { policy, readiness, review, rows, originalPlan };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function materialize(task: SkvmTaskJson, workDir: string): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const [path, content] of Object.entries(task.fixtures ?? {})) {
    const target = resolve(workDir, SafePathSchema.parse(path));
    const fromRoot = relative(resolve(workDir), target);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`fixture escapes workdir: ${path}`);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

export async function buildReviewedAotBundle(options: {
  rootDir: string;
  outDir: string;
  policy: ReviewedAotEfficiencyPolicy;
  review: z.infer<typeof ReviewRequiredReportSchema>;
}) {
  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });
  const build = await Bun.build({
    entrypoints: [contained(options.rootDir, options.policy.frozenInputs.reviewPatch.path)],
    outdir: outDir,
    target: "node",
    format: "esm",
    sourcemap: "none",
    minify: false,
  });
  if (!build.success || build.outputs.length !== 1) throw new Error("reviewed-AOT patch bundle compile failed");
  const bundleBytes = Buffer.from(await build.outputs[0]!.arrayBuffer());
  if (sha256Bytes(bundleBytes) !== options.review.construction.package.patchBundleSha256) {
    throw new Error("reviewed-AOT patch bundle identity drift");
  }
  return { path: build.outputs[0]!.path, sha256: sha256Bytes(bundleBytes) };
}

export async function executeReviewedAotRow(options: {
  rootDir: string;
  policy: ReviewedAotEfficiencyPolicy;
  originalRow: OriginalPlanRow;
  bundlePath: string;
  workDir: string;
}): Promise<RawAgentRunRow> {
  const task = JSON.parse(await readFile(options.originalRow.taskPath, "utf8")) as SkillIRBenchmarkTask & SkvmTaskJson;
  await materialize(task, options.workDir);
  const manifestPath = join(options.workDir, "..", "initial-workdir-manifest.json");
  const initialWorkdirManifest = await writeInitialWorkdirManifest({ workDir: options.workDir, manifestPath });
  const plan = RestrictedDomainPlanSchema.parse(JSON.parse(await readFile(
    contained(options.rootDir, options.policy.frozenInputs.automaticPlan.path), "utf8",
  )));
  const started = performance.now();
  await executeRestrictedDomainPlan({
    workDir: options.workDir,
    plan,
    readablePaths: Object.keys(task.fixtures ?? {}),
    writablePaths: [".env.example", ".env.schema.json", "env-report.json"],
  });
  const environment: Record<string, string> = {};
  for (const name of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "ComSpec"]) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  const child = Bun.spawn([
    process.execPath,
    options.bundlePath,
    `--workdir=${options.workDir}`,
    "--interface=env-audit-interface.json",
  ], { cwd: options.workDir, env: environment, stdout: "pipe", stderr: "pipe", windowsHide: true });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  return {
    caseId: options.originalRow.caseId,
    system: "reviewed-aot" as never,
    model: "direct-deterministic",
    modelFamily: "none",
    adapter: "reviewed-aot-runtime",
    adapterVersion: "reviewed-aot-runtime-v1",
    runIndex: options.originalRow.runIndex,
    panelConfigId: options.policy.experimentId,
    taskPath: options.originalRow.taskPath,
    workDir: options.workDir,
    initialWorkdirManifest,
    exitCode,
    runStatus: exitCode === 0 ? "ok" : "adapter-crashed",
    durationMs: performance.now() - started,
    stdout: `${stdout.trim()}\nfinal output: reviewed AOT deterministic execution complete\ntokens: in=0 out=0`,
    stderr,
    successSource: "execution-only",
    attempts: 1,
  };
}

async function deterministicDryRun(rootDir: string, policy: ReviewedAotEfficiencyPolicy, review: z.infer<typeof ReviewRequiredReportSchema>) {
  const temporary = await mkdtemp(join(tmpdir(), "skill-ir-reviewed-aot-dry-run-"));
  try {
    const plan = await buildReviewedAotOriginalPlan({ rootDir, outDir: temporary, policy });
    const bundle = await buildReviewedAotBundle({ rootDir, outDir: join(temporary, "bundle"), policy, review });
    const taskSet = JSON.parse(await readFile(contained(rootDir, policy.frozenInputs.tasks.path), "utf8")) as {
      tasks: SkillIRBenchmarkTask[];
    };
    const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
    let fullPassTasks = 0;
    for (const taskId of policy.denominator.taskIds) {
      const originalRow = plan.rows.find((row) => row.caseId.endsWith(`:${taskId}`) && row.runIndex === 1);
      if (!originalRow) throw new Error(`reviewed-AOT dry-run missing ${taskId}`);
      const raw = await executeReviewedAotRow({
        rootDir, policy, originalRow, bundlePath: bundle.path, workDir: join(temporary, "workdirs", taskId),
      });
      const [scored] = await scoreRawRunRows([raw], taskById);
      if (scored?.success && scored.evaluatorScore === 1 && scored.tokenCost === 0) fullPassTasks += 1;
    }
    return { tasks: 2 as const, fullPassTasks, modelTokens: 0 as const, patchBundleSha256: bundle.sha256 };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function buildReviewedAotEfficiencyFreeze(
  rootDirInput: string,
  policyInput: unknown,
): Promise<ReviewedAotEfficiencyFreeze> {
  const rootDir = resolve(rootDirInput);
  const validated = await validateReviewedAotEfficiencyPolicy(policyInput, rootDir);
  const dryRun = await deterministicDryRun(rootDir, validated.policy, validated.review);
  if (dryRun.fullPassTasks !== 2) throw new Error("reviewed-AOT deterministic dry-run did not fully pass both tasks");
  return ReviewedAotEfficiencyFreezeSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-freeze/v1",
    freezeId: "env-reviewed-aot-efficiency-identity-v1",
    status: "passed",
    identityClosure: {
      policy: {
        path: REVIEWED_AOT_EFFICIENCY_POLICY_PATH,
        sha256: sha256Bytes(Buffer.from(jsonText(validated.policy), "utf8")),
      },
      constructionCostReadiness: validated.policy.constructionCostReadiness,
      frozenInputs: validated.policy.frozenInputs,
      implementation: validated.policy.implementation,
    },
    plan: {
      rows: 8, pairs: 4, paidOriginalRows: 4, deterministicReviewedAotRows: 4,
      orderedRows: validated.rows, resumablePrefixRows: 0, retries: 0, forwardOnly: true,
    },
    deterministicDryRun: dryRun,
    accounting: { currentStagePaidCalls: 0, matrixExecuted: false },
    authorizations: { paidMatrix: true, heldOut: false, efficiencyClaim: false },
    sensitiveData: { apiCredentialContentConsumed: false, modelOutputContentConsumed: false, heldOutConsumed: false },
    claimBoundary: "This zero-paid freeze validates the exact eight-row identity and the reviewed-AOT deterministic arm. It authorizes four later original-system calls with zero retries; it does not itself establish recurring savings or an efficiency-positive result.",
  });
}

export async function validateReviewedAotEfficiencyFreeze(
  input: unknown,
  rootDirInput: string,
  policyInput: unknown,
): Promise<ReviewedAotEfficiencyFreeze> {
  const rootDir = resolve(rootDirInput);
  const freeze = ReviewedAotEfficiencyFreezeSchema.parse(input);
  const validated = await validateReviewedAotEfficiencyPolicy(policyInput, rootDir);
  if (!isDeepStrictEqual(freeze.identityClosure.constructionCostReadiness, validated.policy.constructionCostReadiness)
    || !isDeepStrictEqual(freeze.identityClosure.frozenInputs, validated.policy.frozenInputs)
    || !isDeepStrictEqual(freeze.identityClosure.implementation, validated.policy.implementation)
    || !isDeepStrictEqual(freeze.plan.orderedRows, validated.rows)) {
    throw new Error("reviewed-AOT freeze identity drift");
  }
  for (const ref of [freeze.identityClosure.policy, freeze.identityClosure.constructionCostReadiness,
    ...Object.values(freeze.identityClosure.frozenInputs), ...freeze.identityClosure.implementation]) {
    await verify(rootDir, ref);
  }
  return freeze;
}

export async function writeReviewedAotEfficiencyFreezeArtifacts(rootDirInput: string) {
  const rootDir = resolve(rootDirInput);
  const policy = await buildReviewedAotEfficiencyPolicy(rootDir);
  const policyPath = contained(rootDir, REVIEWED_AOT_EFFICIENCY_POLICY_PATH);
  await mkdir(resolve(policyPath, ".."), { recursive: true });
  await writeFile(policyPath, jsonText(policy), "utf8");
  const freeze = await buildReviewedAotEfficiencyFreeze(rootDir, policy);
  const freezePath = contained(rootDir, REVIEWED_AOT_EFFICIENCY_FREEZE_PATH);
  await mkdir(resolve(freezePath, ".."), { recursive: true });
  await writeFile(freezePath, jsonText(freeze), "utf8");
  return { policy, freeze };
}

if (import.meta.main) {
  writeReviewedAotEfficiencyFreezeArtifacts(process.cwd()).then(({ freeze }) => console.log(JSON.stringify({
    status: freeze.status,
    rows: freeze.plan.rows,
    paidRows: freeze.plan.paidOriginalRows,
    currentStagePaidCalls: freeze.accounting.currentStagePaidCalls,
    matrixExecuted: freeze.accounting.matrixExecuted,
  }, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
