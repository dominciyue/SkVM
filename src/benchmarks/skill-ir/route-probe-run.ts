import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExperimentSystem } from "./matrix";
import { assertRequiredEnv, buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import {
  buildProbeRunArgs,
  parseModelList,
  runCommandWithTimeout,
  summarizeProbeResult,
  type ProbeSummary,
} from "./route-probe";

type RouteProbeArgs = {
  models: string[];
  adapter: string;
  outDir: string;
  rootDir: string;
  system: ExperimentSystem;
  context: string;
  agent: string;
  environment: string;
  task: string;
  timeoutMs: number;
  requireEnv?: Set<string>;
  stdoutTailChars: number;
  stderrTailChars: number;
};

function parseArgs(argv: string[]): RouteProbeArgs {
  const args: RouteProbeArgs = {
    models: [],
    adapter: "bare-agent",
    outDir: "results/skill-ir/route-probe",
    rootDir: process.cwd(),
    system: "original",
    context: "compressed",
    agent: "skvm",
    environment: "linux",
    task: "report-overclaim-hard-001",
    timeoutMs: 30_000,
    stdoutTailChars: 1200,
    stderrTailChars: 1200,
  };

  for (const arg of argv) {
    if (arg.startsWith("--models=")) {
      args.models = parseModelList(arg.slice("--models=".length));
    } else if (arg.startsWith("--adapter=")) {
      args.adapter = arg.slice("--adapter=".length);
    } else if (arg.startsWith("--out-dir=")) {
      args.outDir = arg.slice("--out-dir=".length);
    } else if (arg.startsWith("--root-dir=")) {
      args.rootDir = arg.slice("--root-dir=".length);
    } else if (arg.startsWith("--system=")) {
      args.system = arg.slice("--system=".length) as ExperimentSystem;
    } else if (arg.startsWith("--context=")) {
      args.context = arg.slice("--context=".length);
    } else if (arg.startsWith("--agent=")) {
      args.agent = arg.slice("--agent=".length);
    } else if (arg.startsWith("--environment=")) {
      args.environment = arg.slice("--environment=".length);
    } else if (arg.startsWith("--task=")) {
      args.task = arg.slice("--task=".length);
    } else if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number.parseInt(arg.slice("--timeout-ms=".length), 10);
    } else if (arg.startsWith("--require-env=")) {
      args.requireEnv = new Set(arg.slice("--require-env=".length).split(",").filter(Boolean));
    } else if (arg.startsWith("--stdout-tail-chars=")) {
      args.stdoutTailChars = Number.parseInt(arg.slice("--stdout-tail-chars=".length), 10);
    } else if (arg.startsWith("--stderr-tail-chars=")) {
      args.stderrTailChars = Number.parseInt(arg.slice("--stderr-tail-chars=".length), 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.models.length === 0) {
    throw new Error("--models is required");
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  if (!Number.isFinite(args.stdoutTailChars) || args.stdoutTailChars < 0) {
    throw new Error("--stdout-tail-chars must be a non-negative integer");
  }
  if (!Number.isFinite(args.stderrTailChars) || args.stderrTailChars < 0) {
    throw new Error("--stderr-tail-chars must be a non-negative integer");
  }

  return args;
}

function assertProbeEnv(args: RouteProbeArgs): void {
  const [model] = args.models;
  if (!model) {
    throw new Error("--models is required");
  }
  const checkArgs: RealAgentRunArgs = {
    model,
    adapter: args.adapter,
    outDir: args.outDir,
    limit: 1,
    execute: true,
    retries: 0,
    retryDelayMs: 0,
    rootDir: args.rootDir,
    requireEnv: args.requireEnv,
  };
  assertRequiredEnv(checkArgs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertProbeEnv(args);
  await mkdir(args.outDir, { recursive: true });

  const outPath = join(args.outDir, "probe-results.jsonl");
  await writeFile(outPath, "", "utf8");
  const summaries: ProbeSummary[] = [];

  for (const model of args.models) {
    const runArgs = buildProbeRunArgs({
      model,
      adapter: args.adapter,
      outDir: join(args.outDir, "artifacts"),
      rootDir: args.rootDir,
      system: args.system,
      context: args.context,
      agent: args.agent,
      environment: args.environment,
      task: args.task,
    });
    const [entry] = await buildPlan(runArgs);
    if (!entry) {
      throw new Error(`Probe plan was empty for model ${model}`);
    }

    const execution = await runCommandWithTimeout(entry.command, args.timeoutMs);
    const summary = summarizeProbeResult({
      model,
      caseId: entry.caseId,
      system: entry.system,
      command: entry.command,
      execution,
      stdoutTailChars: args.stdoutTailChars,
      stderrTailChars: args.stderrTailChars,
    });
    summaries.push(summary);
    await writeFile(outPath, `${JSON.stringify(summary)}\n`, { flag: "a" });
  }

  console.log(JSON.stringify({ count: summaries.length, out: outPath, summaries }, null, 2));
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
