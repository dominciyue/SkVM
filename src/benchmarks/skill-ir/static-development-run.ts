import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildStaticDevelopmentPlan, type StaticDevelopmentPlan } from "./static-development";

export type StaticDevelopmentRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
  phase: "plan";
};

export function parseStaticDevelopmentRunArgs(argv: string[]): StaticDevelopmentRunArgs {
  const args: Partial<StaticDevelopmentRunArgs> = { rootDir: process.cwd() };
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--lock=")) args.lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--phase=")) {
      const phase = arg.slice("--phase=".length);
      if (phase !== "plan") throw new Error("Static development phase currently supports plan only");
      args.phase = phase;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.lockPath || !args.outDir || args.phase !== "plan") {
    throw new Error("Static development requires --lock, --out-dir, and --phase=plan");
  }
  return args as StaticDevelopmentRunArgs;
}

function serializablePlan(result: StaticDevelopmentPlan): Record<string, unknown> {
  return {
    ...result,
    runArgs: {
      ...result.runArgs,
      skills: result.runArgs.skills ? [...result.runArgs.skills] : undefined,
      systems: result.runArgs.systems ? [...result.runArgs.systems] : undefined,
      contexts: result.runArgs.contexts ? [...result.runArgs.contexts] : undefined,
      agents: result.runArgs.agents ? [...result.runArgs.agents] : undefined,
      environments: result.runArgs.environments ? [...result.runArgs.environments] : undefined,
      tasks: result.runArgs.tasks ? [...result.runArgs.tasks] : undefined,
      requireEnv: result.runArgs.requireEnv ? [...result.runArgs.requireEnv] : undefined,
    },
  };
}

export async function runStaticDevelopmentPlan(
  args: StaticDevelopmentRunArgs,
): Promise<{ experimentId: string; phase: "plan"; rows: number; planPath: string }> {
  const result = await buildStaticDevelopmentPlan(args);
  const outDir = path.isAbsolute(args.outDir) ? path.resolve(args.outDir) : path.resolve(args.rootDir, args.outDir);
  await mkdir(outDir, { recursive: true });
  const planPath = path.join(outDir, "plan.json");
  await writeFile(planPath, `${JSON.stringify(serializablePlan(result), null, 2)}\n`, "utf8");
  return { experimentId: result.experimentId, phase: "plan", rows: result.plan.length, planPath };
}

if (import.meta.main) {
  runStaticDevelopmentPlan(parseStaticDevelopmentRunArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
