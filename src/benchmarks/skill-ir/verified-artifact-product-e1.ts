import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { runVerifiedArtifactCli } from "../../skill-ir/verified-artifact-cli";
import { sha256Bytes } from "./source-fixture";

export const ENV_MANAGER_E1_CONFIG_PATH =
  "benchmarks/skill-ir/pilots/env-manager/verified-artifact-product-e1.json";

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

function flag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  const rootDir = resolve(flag(process.argv.slice(2), "root") ?? process.cwd());
  const workDir = flag(process.argv.slice(2), "workdir");
  const outDir = flag(process.argv.slice(2), "out");
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
