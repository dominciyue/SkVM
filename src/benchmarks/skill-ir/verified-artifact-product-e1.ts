import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { runVerifiedArtifactCli } from "../../skill-ir/verified-artifact-cli";
import {
  VerifiedArtifactWorkflowConfigSchema,
  validateVerifiedArtifactProduct,
} from "../../skill-ir/verified-artifact-product";
import { OptimizationCostAccountingReportSchema } from "./optimization-cost-accounting";
import { ReviewedAotPairedQualityEvidenceSchema } from "./reviewed-aot-efficiency-readonly-contract";
import { sha256Bytes } from "./source-fixture";
import { ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY } from "./verified-artifact-product-env-checker";

export const ENV_MANAGER_E1_CONFIG_PATH =
  "benchmarks/skill-ir/pilots/env-manager/verified-artifact-product-e1.json";
export const ENV_MANAGER_A_OPTIONAL_CONFIG_PATH =
  "benchmarks/skill-ir/pilots/env-manager/verified-artifact-product-machine-checked.json";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const EvidenceRefSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();

export const EnvManagerMachineCheckedProductReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-machine-checked-product-demonstration/v1"),
  status: z.literal("passed"),
  workflowId: z.literal("env-manager-verified-artifact-machine-checked"),
  completedAt: z.string().datetime(),
  product: z.object({
    manifest: EvidenceRefSchema,
    qualityEvidence: EvidenceRefSchema,
    costReport: EvidenceRefSchema,
  }).strict(),
  quality: z.object({
    evidence: z.literal("machine-checked"),
    criteriaPassed: z.literal(3),
    criteriaTotal: z.literal(3),
    checker: EvidenceRefSchema,
    evaluator: EvidenceRefSchema,
    historicalEquivalentPairs: z.literal(4),
    historicalQualityEvidence: EvidenceRefSchema,
  }).strict(),
  tokenEconomics: z.object({
    source: z.literal("digest-bound-historical-original-plus-current-deterministic-artifact"),
    historicalCostEvidence: EvidenceRefSchema,
    originalSamples: z.literal(4),
    originalAggregateModelTokens: z.literal(202010),
    originalModelTokensPerRun: z.literal(50502.5),
    artifactModelTokensPerRun: z.literal(0),
    oneTimeModelTokens: z.literal(9358),
    breakEvenCalls: z.literal(1),
  }).strict(),
  currentStageAccounting: z.object({
    apiCalls: z.literal(0),
    modelCalls: z.literal(0),
    paidCalls: z.literal(0),
    historicalOriginalRowsReused: z.literal(4),
  }).strict(),
  researchPromotion: z.literal("eligible-for-authority-review-not-promoted"),
  authorizations: z.object({
    heldOut: z.literal(false),
    portfolioMutation: z.literal(false),
    readinessMutation: z.literal(false),
    dslExpansion: z.literal(false),
    externalSkillExecution: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

const FixtureAuthority = {
  path: "benchmarks/skill-ir/pilots/env-manager/successor-v3/development/tasks.json",
  sha256: "86fa152ed164041885565125c7f6e4e4ca504a58d2ca15457e106e0bab4b7832",
  taskId: "env-manager-scorer-authority-node-dev-001",
} as const;

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: z.string().min(1),
    split: z.literal("development"),
    fixtures: z.record(z.string(), z.string()),
  }).passthrough()).min(1),
}).passthrough();

function contained(rootDir: string, relativePath: string): string {
  if (!relativePath || isAbsolute(relativePath) || relativePath.includes("\\")
    || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`unsafe fixture path: ${relativePath}`);
  }
  const root = resolve(rootDir);
  const target = resolve(root, ...relativePath.split("/"));
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(fromRoot)) throw new Error(`fixture path escapes workdir: ${relativePath}`);
  return target;
}

async function materializeFixture(rootDir: string, workDir: string) {
  await mkdir(workDir, { recursive: true });
  if ((await readdir(workDir)).length > 0) throw new Error(`E1 workdir must be empty: ${workDir}`);
  const taskSetPath = contained(rootDir, FixtureAuthority.path);
  const bytes = await readFile(taskSetPath);
  if (sha256Bytes(bytes) !== FixtureAuthority.sha256) throw new Error("E1 fixture authority digest mismatch");
  const taskSet = TaskSetSchema.parse(JSON.parse(bytes.toString("utf8")));
  const task = taskSet.tasks.find((entry) => entry.id === FixtureAuthority.taskId);
  if (!task) throw new Error(`E1 fixture task is missing: ${FixtureAuthority.taskId}`);
  for (const [relativePath, contents] of Object.entries(task.fixtures)) {
    const target = contained(workDir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
    if ((await lstat(target)).isSymbolicLink()) throw new Error(`fixture link is forbidden: ${relativePath}`);
  }
  return {
    role: "fixture-only" as const,
    authority: { path: FixtureAuthority.path, sha256: FixtureAuthority.sha256 },
    taskId: FixtureAuthority.taskId,
    fixtureCount: Object.keys(task.fixtures).length,
    evaluatorLoaded: false as const,
  };
}

export async function runEnvManagerVerifiedArtifactE1(options: {
  rootDir: string;
  workDir: string;
  outDir: string;
  acceptedAt: string;
  acceptanceHumanMinutes: number;
  acceptanceNote: string;
}) {
  const rootDir = resolve(options.rootDir);
  const workDir = resolve(options.workDir);
  const outDir = resolve(options.outDir);
  const fixtureMaterialization = await materializeFixture(rootDir, workDir);
  const product = await runVerifiedArtifactCli([
    `--root=${rootDir}`,
    `--config=${ENV_MANAGER_E1_CONFIG_PATH}`,
    `--workdir=${workDir}`,
    `--out=${outDir}`,
    "--accept",
    `--accepted-at=${options.acceptedAt}`,
    `--human-minutes=${options.acceptanceHumanMinutes}`,
    `--note=${options.acceptanceNote}`,
  ], rootDir);
  return { fixtureMaterialization, product };
}

async function digestRef(baseDir: string, relativePath: string) {
  const bytes = await readFile(join(baseDir, relativePath));
  return { path: relativePath.replaceAll("\\", "/"), sha256: sha256Bytes(bytes) };
}

export async function runEnvManagerVerifiedArtifactMachineChecked(options: {
  rootDir: string;
  workDir: string;
  runRoot: string;
  completedAt: string;
}) {
  const rootDir = resolve(options.rootDir);
  const workDir = resolve(options.workDir);
  const runRoot = resolve(options.runRoot);
  const completedAt = z.string().datetime().parse(options.completedAt);
  await mkdir(runRoot, { recursive: true });
  if ((await readdir(runRoot)).length > 0) throw new Error(`machine-checked product run root must be empty: ${runRoot}`);
  const configBytes = await readFile(join(rootDir, ENV_MANAGER_A_OPTIONAL_CONFIG_PATH));
  const config = VerifiedArtifactWorkflowConfigSchema.parse(JSON.parse(configBytes.toString("utf8")));
  if (config.quality.mode !== "machine-checked" || config.production.originalRuntime.status !== "measured") {
    throw new Error("Env A-optional config must bind machine quality and measured original runtime");
  }
  const fixtureMaterialization = await materializeFixture(rootDir, workDir);
  const productDir = join(runRoot, "product");
  const product = await runVerifiedArtifactCli([
    `--root=${rootDir}`,
    `--config=${ENV_MANAGER_A_OPTIONAL_CONFIG_PATH}`,
    `--workdir=${workDir}`,
    `--out=${productDir}`,
  ], rootDir);
  const validated = await validateVerifiedArtifactProduct(productDir);
  if (validated.qualityEvidence.qualityEvidence !== "machine-checked"
    || !/^env-manager-v3 public criteria 3\/3; evaluatorSha256=[0-9a-f]{64}$/u.test(validated.qualityEvidence.detail)) {
    throw new Error("Env product checker did not establish all three public criteria");
  }

  const historicalCostRef = config.production.originalRuntime.evidence;
  const historicalCostBytes = await readFile(contained(rootDir, historicalCostRef.path));
  if (sha256Bytes(historicalCostBytes) !== historicalCostRef.sha256) throw new Error("historical Env cost digest mismatch");
  const historicalCost = OptimizationCostAccountingReportSchema.parse(JSON.parse(historicalCostBytes.toString("utf8")));
  const historicalQualityRef = historicalCost.quality.evidence;
  const historicalQualityBytes = await readFile(contained(rootDir, historicalQualityRef.path));
  if (sha256Bytes(historicalQualityBytes) !== historicalQualityRef.sha256) {
    throw new Error("historical Env quality digest mismatch");
  }
  const historicalQuality = ReviewedAotPairedQualityEvidenceSchema.parse(
    JSON.parse(historicalQualityBytes.toString("utf8")),
  );
  const evaluatorBytes = await readFile(contained(rootDir, ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY.path));
  if (sha256Bytes(evaluatorBytes) !== ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY.sha256) {
    throw new Error("Env evaluator digest mismatch while building product report");
  }
  const oneTimeModelTokens = [
    historicalCost.production.oneTime.compile.modelTokens,
    historicalCost.production.oneTime.profile.modelTokens,
    historicalCost.production.oneTime.package.modelTokens,
  ].reduce((sum, value) => {
    if (value.status !== "measured") throw new Error("historical Env one-time token evidence is incomplete");
    return sum + value.value;
  }, 0);
  if (!historicalCost.quality.equivalent || !historicalQuality.qualityEquivalent
    || historicalQuality.counts.completePairs !== 4 || !historicalQuality.gate.passed
    || historicalCost.production.runtime.original.samples !== 4
    || historicalCost.production.runtime.original.aggregateModelTokens !== 202010
    || historicalCost.production.runtime.original.modelTokensPerRun !== 50502.5
    || historicalCost.production.runtime.optimized.modelTokensPerRun !== 0
    || oneTimeModelTokens !== 9358
    || historicalCost.breakEven.status !== "computed" || historicalCost.breakEven.calls !== 1
    || product.cost.production.oneTime.modelTokens.status !== "measured"
    || product.cost.production.oneTime.modelTokens.value !== 9358
    || product.cost.breakEven.status !== "computed" || product.cost.breakEven.calls !== 1) {
    throw new Error("Env machine-checked product economics do not match frozen authority");
  }

  const report = EnvManagerMachineCheckedProductReportSchema.parse({
    schemaVersion: "skill-ir-env-manager-machine-checked-product-demonstration/v1",
    status: "passed",
    workflowId: config.workflowId,
    completedAt,
    product: {
      manifest: await digestRef(runRoot, "product/product-manifest.json"),
      qualityEvidence: await digestRef(runRoot, "product/quality-evidence.json"),
      costReport: await digestRef(runRoot, "product/cost-report.json"),
    },
    quality: {
      evidence: "machine-checked",
      criteriaPassed: 3,
      criteriaTotal: 3,
      checker: config.quality.checker,
      evaluator: ENV_MANAGER_PRODUCT_EVALUATOR_AUTHORITY,
      historicalEquivalentPairs: historicalQuality.counts.completePairs,
      historicalQualityEvidence: historicalQualityRef,
    },
    tokenEconomics: {
      source: "digest-bound-historical-original-plus-current-deterministic-artifact",
      historicalCostEvidence: historicalCostRef,
      originalSamples: historicalCost.production.runtime.original.samples,
      originalAggregateModelTokens: historicalCost.production.runtime.original.aggregateModelTokens,
      originalModelTokensPerRun: historicalCost.production.runtime.original.modelTokensPerRun,
      artifactModelTokensPerRun: product.cost.production.recurring.artifact.modelTokensPerRun,
      oneTimeModelTokens,
      breakEvenCalls: product.cost.breakEven.calls,
    },
    currentStageAccounting: { apiCalls: 0, modelCalls: 0, paidCalls: 0, historicalOriginalRowsReused: 4 },
    researchPromotion: "eligible-for-authority-review-not-promoted",
    authorizations: {
      heldOut: false,
      portfolioMutation: false,
      readinessMutation: false,
      dslExpansion: false,
      externalSkillExecution: false,
    },
    claimBoundary: "The current product execution is a zero-model deterministic Env artifact checked against three public v3 criteria. Original recurring tokens and four-pair equivalence are imported from the named digest-bound historical research evidence; they were not rerun in this stage. The product is eligible for authority review but does not itself mutate research portfolio or readiness.",
  });
  await writeFile(join(runRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { fixtureMaterialization, product, report };
}

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const rootDir = resolve(flag(args, "root") ?? process.cwd());
  const workDir = flag(args, "workdir");
  const outDir = flag(args, "out");
  const quality = flag(args, "quality") ?? "user-accepted";
  if (quality === "machine-checked") {
    const completedAt = flag(args, "completed-at");
    if (!workDir || !outDir || !completedAt) {
      throw new Error("Env A-optional requires --workdir, --out, and --completed-at");
    }
    const result = await runEnvManagerVerifiedArtifactMachineChecked({
      rootDir,
      workDir: resolve(rootDir, workDir),
      runRoot: resolve(rootDir, outDir),
      completedAt,
    });
    process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  } else {
    if (quality !== "user-accepted") throw new Error("--quality must be user-accepted or machine-checked");
    const acceptedAt = flag(process.argv.slice(2), "accepted-at");
    const acceptanceNote = flag(process.argv.slice(2), "note");
    const acceptanceHumanMinutes = Number(flag(process.argv.slice(2), "human-minutes"));
    if (!workDir || !outDir || !acceptedAt || !acceptanceNote
      || !Number.isFinite(acceptanceHumanMinutes) || acceptanceHumanMinutes <= 0) {
      throw new Error("E1 requires --workdir, --out, --accepted-at, --human-minutes, and --note");
    }
    const result = await runEnvManagerVerifiedArtifactE1({
      rootDir,
      workDir: resolve(rootDir, workDir),
      outDir: resolve(rootDir, outDir),
      acceptedAt,
      acceptanceHumanMinutes,
      acceptanceNote,
    });
    process.stdout.write(`${JSON.stringify({
      status: "complete",
      fixtureMaterialization: result.fixtureMaterialization,
      qualityEvidence: result.product.cost.qualityEvidence,
      claim: result.product.cost.claim,
      breakEven: result.product.cost.breakEven,
      coreBranchDelta: result.product.candidate.coreBranchDelta,
    }, null, 2)}\n`);
  }
}
