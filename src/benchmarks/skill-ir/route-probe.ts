import { join } from "node:path";
import type { ExperimentSystem } from "./matrix";
import { type RealAgentRunArgs } from "./real-agent-run";
import { classifyFailureType } from "./scoring";

export type ProbeStatus = "ok" | "timeout" | "infrastructure" | "agent";

export type ProbeExecution = {
  exitCode?: number;
  timedOut: boolean;
  durationMs?: number;
  stdout: string;
  stderr: string;
};

export type BuildProbeRunArgsOptions = {
  model: string;
  adapter: string;
  outDir: string;
  rootDir: string;
  system: ExperimentSystem;
  context: string;
  agent: string;
  environment: string;
  task: string;
};

export type ProbeSummaryInput = {
  model: string;
  caseId: string;
  system: ExperimentSystem;
  command: string[];
  execution: ProbeExecution;
  stdoutTailChars: number;
  stderrTailChars: number;
};

export type ProbeSummary = {
  model: string;
  caseId: string;
  system: ExperimentSystem;
  status: ProbeStatus;
  exitCode?: number;
  timedOut: boolean;
  durationMs?: number;
  command: string[];
  stdoutTail: string;
  stderrTail: string;
};

function modelSlug(model: string): string {
  return model.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function parseModelList(value: string): string[] {
  const models = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (models.length === 0) {
    throw new Error("--models must include at least one model id");
  }
  return models;
}

export function classifyProbeExecution(execution: Pick<ProbeExecution, "exitCode" | "timedOut" | "stdout" | "stderr">): ProbeStatus {
  if (execution.timedOut) {
    return "timeout";
  }
  if (execution.exitCode === 0) {
    return "ok";
  }
  return classifyFailureType({
    exitCode: execution.exitCode ?? 1,
    stdout: execution.stdout,
    stderr: execution.stderr,
  });
}

export function tailText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(value.length - maxChars);
}

export function buildProbeRunArgs(opts: BuildProbeRunArgsOptions): RealAgentRunArgs {
  return {
    model: opts.model,
    adapter: opts.adapter,
    outDir: join(opts.outDir, modelSlug(opts.model)),
    limit: 1,
    execute: false,
    retries: 0,
    retryDelayMs: 0,
    rootDir: opts.rootDir,
    systems: new Set([opts.system]),
    contexts: new Set([opts.context]),
    agents: new Set([opts.agent]),
    environments: new Set([opts.environment]),
    tasks: new Set([opts.task]),
  };
}

export async function runCommandWithTimeout(command: string[], timeoutMs: number): Promise<ProbeExecution> {
  const startedAt = Date.now();
  const proc = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  let timer: Timer | undefined;

  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      resolve("timeout");
    }, timeoutMs);
  });

  const exited = proc.exited.then((exitCode) => exitCode);
  const exitOrTimeout = await Promise.race([exited, timeout]);
  if (timer) {
    clearTimeout(timer);
  }

  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return {
    exitCode: exitOrTimeout === "timeout" ? undefined : exitOrTimeout,
    timedOut,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
  };
}

export function summarizeProbeResult(input: ProbeSummaryInput): ProbeSummary {
  return {
    model: input.model,
    caseId: input.caseId,
    system: input.system,
    status: classifyProbeExecution(input.execution),
    exitCode: input.execution.exitCode,
    timedOut: input.execution.timedOut,
    durationMs: input.execution.durationMs,
    command: input.command,
    stdoutTail: tailText(input.execution.stdout, input.stdoutTailChars),
    stderrTail: tailText(input.execution.stderr, input.stderrTailChars),
  };
}
