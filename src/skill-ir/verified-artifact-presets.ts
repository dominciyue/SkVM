import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import {
  compileApiTesterValidatedArtifact,
  loadApiTesterArtifactCompilerInput,
  type ApiTesterArtifactVariantId,
} from "../benchmarks/skill-ir/api-tester-artifact-compiler";
import {
  selectApiTesterArtifactVariant,
} from "../benchmarks/skill-ir/api-tester-artifact-development";
import {
  validateValidatedArtifactPackage,
  type ValidatedArtifactPackage,
} from "../benchmarks/skill-ir/validated-artifact-catalog";
import { runValidatedArtifactPlan } from "../benchmarks/skill-ir/validated-artifact-runtime";
import { parseSafeRelativePath } from "../benchmarks/skill-ir/artifact-package";
import { sha256Bytes } from "../benchmarks/skill-ir/source-fixture";

export const API_TESTER_ARTIFACT_LOCK_PATH =
  "benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json";
export const API_TESTER_TASKS_PATH = "benchmarks/skill-ir/pilots/api-tester/development/tasks.json";
export const ENV_MANAGER_PRODUCT_RUNNER_PATH =
  "src/benchmarks/skill-ir/verified-artifact-product-e1.ts";

const StageOrder = ["compile", "review-or-accept", "package", "run", "cost"] as const;
const VariantSchema = z.enum(["openapi-json", "openapi-yaml"]);

export const ArtifactPresetResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-artifact-cli-result/v1"),
  status: z.literal("passed"),
  preset: z.enum(["api-tester", "env-manager"]),
  variant: VariantSchema.optional(),
  workflowId: z.string().min(1),
  stageOrder: z.tuple([
    z.literal("compile"),
    z.literal("review-or-accept"),
    z.literal("package"),
    z.literal("run"),
    z.literal("cost"),
  ]),
  stageStatus: z.object({
    compile: z.string().min(1),
    review: z.string().min(1),
    package: z.string().min(1),
    run: z.string().min(1),
    cost: z.string().min(1),
  }).strict(),
  artifact: z.object({
    packagePath: z.string().min(1),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).strict(),
  quality: z.object({
    mode: z.literal("machine-checked"),
    result: z.literal("pass"),
    checkerPath: z.string().min(1),
    checkerSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
  }).strict(),
  coreBranchDelta: z.literal(0),
  outputPath: z.literal("cli-report.json"),
  claimBoundary: z.string().min(1),
}).strict();

export type ArtifactPresetResult = z.infer<typeof ArtifactPresetResultSchema>;

export type ArtifactPresetOptions = {
  rootDir: string;
  workDir: string;
  outDir: string;
  completedAt: string;
} & (
  | { preset: "env-manager" }
  | { preset: "api-tester"; variant: ApiTesterArtifactVariantId }
);

export function resolveArtifactNodeExecutable(options: {
  env?: Readonly<Record<string, string | undefined>>;
  which?: (command: string) => string | null;
} = {}): string {
  const configured = (options.env ?? process.env).SKVM_NODE?.trim();
  if (configured) return configured;
  const discovered = (options.which ?? Bun.which)("node");
  if (!discovered) {
    throw new Error("API Tester artifact runtime requires Node.js on PATH or an explicit SKVM_NODE");
  }
  return discovered;
}

export function resolveArtifactBunExecutable(options: {
  env?: Readonly<Record<string, string | undefined>>;
  which?: (command: string) => string | null;
} = {}): string {
  const env = options.env ?? process.env;
  const configured = env.SKVM_BUN_BIN?.trim() || env.SKVM_BUN?.trim();
  if (configured) return configured;
  const discovered = (options.which ?? Bun.which)("bun");
  if (!discovered) {
    throw new Error("Env Manager artifact preset requires Bun on PATH or an explicit SKVM_BUN_BIN");
  }
  return discovered;
}

type ApiTask = {
  id: string;
  split: string;
  fixtures?: Record<string, string>;
};

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function ensureEmptyDirectory(directory: string, label: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular directory`);
  if ((await readdir(directory)).length > 0) throw new Error(`${label} must be empty: ${directory}`);
}

function contained(rootDir: string, relativePath: string): string {
  const root = resolve(rootDir);
  const safe = parseSafeRelativePath(relativePath);
  const target = resolve(root, safe);
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`fixture path escapes workdir: ${relativePath}`);
  }
  return target;
}

async function readApiTasks(rootDir: string): Promise<ApiTask[]> {
  const value = JSON.parse(await readFile(join(rootDir, API_TESTER_TASKS_PATH), "utf8")) as {
    skillId?: unknown;
    tasks?: unknown;
  };
  if (value.skillId !== "api-tester" || !Array.isArray(value.tasks)) {
    throw new Error("API Tester task registry identity mismatch");
  }
  return value.tasks.map((task) => {
    if (!task || typeof task !== "object") throw new Error("API Tester task entry is invalid");
    const typed = task as Record<string, unknown>;
    if (typeof typed.id !== "string" || typed.split !== "development"
      || !typed.fixtures || typeof typed.fixtures !== "object") {
      throw new Error("API Tester preset accepts only development tasks with fixtures");
    }
    return {
      id: typed.id,
      split: typed.split,
      fixtures: typed.fixtures as Record<string, string>,
    };
  });
}

async function materializeApiTask(rootDir: string, workDir: string, variant: ApiTesterArtifactVariantId) {
  await ensureEmptyDirectory(workDir, "API Tester workdir");
  const candidates = (await readApiTasks(rootDir)).filter((task) =>
    selectApiTesterArtifactVariant(task.fixtures ?? {}) === variant);
  if (candidates.length !== 1) throw new Error(`API Tester variant ${variant} maps to ${candidates.length} tasks`);
  const task = candidates[0]!;
  for (const [path, contents] of Object.entries(task.fixtures ?? {})) {
    const destination = contained(workDir, path);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, contents, "utf8");
  }
  return { taskId: task.id, fixtureCount: Object.keys(task.fixtures ?? {}).length };
}

function frozenPackageFor(lock: any, variant: ApiTesterArtifactVariantId) {
  return variant === "openapi-json" ? lock.frozenPackages.openapiJson : lock.frozenPackages.openapiYaml;
}

async function assertFrozenPackageParity(
  rootDir: string,
  variant: ApiTesterArtifactVariantId,
  packageRecord: ValidatedArtifactPackage,
  lock: any,
): Promise<void> {
  const frozen = frozenPackageFor(lock, variant);
  const frozenDir = resolve(rootDir, frozen.directory);
  const frozenManifest = await readFile(join(frozenDir, "package-manifest.json"));
  if (sha256Bytes(frozenManifest) !== frozen.manifest.sha256) {
    throw new Error(`API Tester ${variant} frozen package manifest digest mismatch`);
  }
  const currentManifestBytes = await readFile(join(packageRecord.packageDir, "package-manifest.json"));
  if (sha256Bytes(currentManifestBytes) !== sha256Bytes(frozenManifest)) {
    throw new Error(`API Tester ${variant} compiled package manifest drift`);
  }
  const files = [
    "package-manifest.json",
    packageRecord.manifest.provenance.path,
    packageRecord.manifest.executionPlan.path,
    ...packageRecord.manifest.artifacts.map((artifact) => artifact.path),
  ];
  for (const file of files) {
    const current = sha256Bytes(await readFile(join(packageRecord.packageDir, file)));
    const frozenDigest = sha256Bytes(await readFile(join(frozenDir, file)));
    if (current !== frozenDigest) throw new Error(`API Tester ${variant} package closure drift: ${file}`);
  }
}

async function runApiTesterPreset(options: Extract<ArtifactPresetOptions, { preset: "api-tester" }>)
  : Promise<ArtifactPresetResult> {
  const rootDir = resolve(options.rootDir);
  const outDir = resolve(options.outDir);
  const artifactDir = join(outDir, "artifact");
  await ensureEmptyDirectory(outDir, "artifact output directory");

  const lock = JSON.parse(await readFile(join(rootDir, API_TESTER_ARTIFACT_LOCK_PATH), "utf8"));
  const input = await loadApiTesterArtifactCompilerInput(rootDir, options.variant);
  await compileApiTesterValidatedArtifact(input, artifactDir);
  const packageRecord = await validateValidatedArtifactPackage(artifactDir);
  await assertFrozenPackageParity(rootDir, options.variant, packageRecord, lock);
  const task = await materializeApiTask(rootDir, options.workDir, options.variant);
  const execution = await runValidatedArtifactPlan({
    package: packageRecord,
    workDir: options.workDir,
    env: { SKVM_NODE: resolveArtifactNodeExecutable() },
  });
  if (execution.status !== "complete") throw new Error(`API Tester artifact runtime failed: ${execution.status}`);

  const checker = packageRecord.manifest.artifacts.find((artifact) => artifact.id === "api-test-checker");
  if (!checker) throw new Error("API Tester package checker artifact is missing");
  const report = ArtifactPresetResultSchema.parse({
    schemaVersion: "skill-ir-artifact-cli-result/v1",
    status: "passed",
    preset: "api-tester",
    variant: options.variant,
    workflowId: `api-tester-${options.variant}-verified-artifact`,
    stageOrder: StageOrder,
    stageStatus: {
      compile: "frozen-compiler-replay",
      review: "frozen-artifact-and-checker-binding",
      package: `byte-parity:${options.variant}`,
      run: `deterministic-complete:${task.taskId}`,
      cost: "zero-model-token",
    },
    artifact: {
      packagePath: "artifact",
      manifestSha256: sha256Bytes(await readFile(join(artifactDir, "package-manifest.json"))),
    },
    quality: {
      mode: "machine-checked",
      result: "pass",
      checkerPath: `artifact/${checker.path}`,
      checkerSha256: checker.sha256,
    },
    accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
    coreBranchDelta: 0,
    outputPath: "cli-report.json",
    claimBoundary: "This top-level preset replays the frozen API Tester compiler, package, checker, and deterministic runtime on one public development fixture. It establishes a zero-model engineering path only; it does not establish a new research result, held-out behavior, or cross-model stability.",
  });
  await writeFile(join(outDir, "cli-report.json"), jsonText(report), "utf8");
  return report;
}

async function runEnvManagerPreset(options: Extract<ArtifactPresetOptions, { preset: "env-manager" }>)
  : Promise<ArtifactPresetResult> {
  const rootDir = resolve(options.rootDir);
  const outDir = resolve(options.outDir);
  const runnerPath = contained(rootDir, ENV_MANAGER_PRODUCT_RUNNER_PATH);
  const child = Bun.spawn([
    resolveArtifactBunExecutable(),
    "run",
    runnerPath,
    "--quality=machine-checked",
    `--root=${rootDir}`,
    `--workdir=${resolve(options.workDir)}`,
    `--out=${outDir}`,
    `--completed-at=${options.completedAt}`,
  ], {
    cwd: rootDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`Env Manager product CLI failed (${exitCode}): ${stderr.trim() || stdout.trim()}`);
  }
  const result = z.object({
    status: z.literal("passed"),
    workflowId: z.string().min(1),
    product: z.object({
      manifest: z.object({
        path: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/u),
      }).strict(),
    }).passthrough(),
    quality: z.object({
      checker: z.object({
        path: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/u),
      }).strict(),
    }).passthrough(),
    currentStageAccounting: z.object({
      modelCalls: z.literal(0),
      apiCalls: z.literal(0),
      paidCalls: z.literal(0),
    }).passthrough(),
  }).passthrough().parse(JSON.parse(stdout));
  const productManifestBytes = await readFile(join(outDir, "product", "product-manifest.json"));
  if (sha256Bytes(productManifestBytes) !== result.product.manifest.sha256) {
    throw new Error("Env Manager product manifest digest differs from the machine-checked report");
  }
  const productManifest = z.object({
    artifact: z.object({
      manifestSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    }).passthrough(),
  }).passthrough().parse(JSON.parse(productManifestBytes.toString("utf8")));
  const report = ArtifactPresetResultSchema.parse({
    schemaVersion: "skill-ir-artifact-cli-result/v1",
    status: "passed",
    preset: "env-manager",
    workflowId: result.workflowId,
    stageOrder: StageOrder,
    stageStatus: {
      compile: "existing-product-runner",
      review: "machine-checked",
      package: "digest-bound-product-package",
      run: "deterministic-complete",
      cost: "historical-original-plus-zero-model-artifact",
    },
    artifact: {
      packagePath: "product/artifact",
      manifestSha256: productManifest.artifact.manifestSha256,
    },
    quality: {
      mode: "machine-checked",
      result: "pass",
      checkerPath: result.quality.checker.path,
      checkerSha256: result.quality.checker.sha256,
    },
    accounting: {
      modelCalls: result.currentStageAccounting.modelCalls,
      apiCalls: result.currentStageAccounting.apiCalls,
      paidCalls: result.currentStageAccounting.paidCalls,
    },
    coreBranchDelta: 0,
    outputPath: "cli-report.json",
    claimBoundary: "This top-level preset reuses the existing Env Manager machine-checked product runner and digest-bound historical evidence. It is a zero-model engineering replay and does not mutate research portfolio, readiness, held-out state, or the frozen original rows.",
  });
  await writeFile(join(outDir, "cli-report.json"), jsonText(report), "utf8");
  return report;
}

export async function runArtifactPreset(options: ArtifactPresetOptions): Promise<ArtifactPresetResult> {
  return options.preset === "api-tester"
    ? runApiTesterPreset(options)
    : runEnvManagerPreset(options);
}
