import type { RealAgentRunPlanEntry } from "./real-agent";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RunExecutionObservationSchema, type RunExecutionObservation } from "../../core/types";
import {
  classifyExecutionEnvelope,
  executeMatchedExecutionBlocks,
  type ExecutionEnvelope,
  type MatchedExecutionBlockSelection,
} from "./execution-resilience";
import type { StaticDevelopmentV2Plan } from "./static-development-v2";
import { executeGenericPlanRow } from "./real-agent-run";

export function buildExecutionEnvelope(input: {
  experimentId: string;
  taskId: string;
  system: string;
  candidateBlock: number;
  attemptId: string;
  observation: RunExecutionObservation;
  outputFileCount: number;
  outerWatchdog?: boolean;
}): ExecutionEnvelope {
  const observation = RunExecutionObservationSchema.parse(input.observation);
  const draft: ExecutionEnvelope = {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: input.experimentId,
    taskId: input.taskId,
    system: input.system,
    candidateBlock: input.candidateBlock,
    attemptId: input.attemptId,
    process: {
      started: true,
      exitCode: observation.process.exitCode,
      termination: input.outerWatchdog ? "outer-watchdog" : observation.process.termination,
      durationMs: observation.process.durationMs,
    },
    activity: observation.activity,
    terminal: observation.terminal,
    usage: observation.usage,
    parser: observation.parser,
    outputs: { fileCount: input.outputFileCount },
    ...(observation.transientError ? { transientError: observation.transientError } : {}),
    classification: "measurement-invalid",
    replacementEligible: false,
  };
  return { ...draft, ...classifyExecutionEnvelope(draft) };
}

function rowTaskId(row: Pick<RealAgentRunPlanEntry, "caseId">): string {
  const taskId = row.caseId.split(":").at(-1);
  if (!taskId) throw new Error(`Static development v2 cannot parse task id: ${row.caseId}`);
  return taskId;
}

export async function executeStaticDevelopmentV2Candidates<Raw>(input: {
  plan: StaticDevelopmentV2Plan;
  taskIds: readonly string[];
  systems: readonly string[];
  targetBlocksPerTask: number;
  reserveBlocksPerTask: number;
  executeRow: (row: RealAgentRunPlanEntry) => Promise<{ raw: Raw; envelope: ExecutionEnvelope }>;
}): Promise<{
  selection: MatchedExecutionBlockSelection;
  rawRows: Raw[];
  envelopes: ExecutionEnvelope[];
}> {
  const rawRows: Raw[] = [];
  const selected = await executeMatchedExecutionBlocks({
    taskIds: input.taskIds,
    systems: input.systems,
    targetBlocksPerTask: input.targetBlocksPerTask,
    reserveBlocksPerTask: input.reserveBlocksPerTask,
    executeBlock: async (taskId, candidateBlock) => {
      const rows = input.plan.plan.filter((row) =>
        rowTaskId(row) === taskId && row.runIndex === candidateBlock);
      if (rows.length !== input.systems.length) {
        throw new Error(`Static development v2 plan block is incomplete: ${taskId}/${candidateBlock}`);
      }
      const ordered = input.systems.map((system) => {
        const row = rows.find((item) => item.system === system);
        if (!row) throw new Error(`Static development v2 plan arm is missing: ${taskId}/${candidateBlock}/${system}`);
        return row;
      });
      const block: ExecutionEnvelope[] = [];
      for (const row of ordered) {
        const executed = await input.executeRow(row);
        rawRows.push(executed.raw);
        block.push(executed.envelope);
      }
      return block;
    },
  });
  const { envelopes, ...selection } = selected;
  return { selection, rawRows, envelopes };
}

export async function executeStaticDevelopmentV2Plan(input: {
  plan: StaticDevelopmentV2Plan;
  agentEnv?: Record<string, string | undefined>;
}): Promise<{
  selection: MatchedExecutionBlockSelection;
  rawRows: unknown[];
  envelopes: ExecutionEnvelope[];
  rawPath: string;
  envelopePath: string;
}> {
  const { plan, lock } = input.plan;
  const executed = await executeStaticDevelopmentV2Candidates({
    plan: input.plan,
    taskIds: lock.matrix.taskIds,
    systems: lock.matrix.systems,
    targetBlocksPerTask: lock.matrix.targetBlocksPerTask,
    reserveBlocksPerTask: lock.matrix.reserveBlocksPerTask,
    executeRow: async (row) => {
      const observationArg = row.command.find((arg) => arg.startsWith("--execution-observation="));
      if (!observationArg) throw new Error(`Static development v2 observation path missing: ${row.caseId}`);
      const observationPath = observationArg.slice("--execution-observation=".length);
      await rm(observationPath, { force: true });
      const raw = await executeGenericPlanRow(
        row,
        { outerWatchdogMs: lock.runtime.outerWatchdogMs, exposeOuterTimedOut: true },
        input.agentEnv ?? process.env,
      );
      let observation: RunExecutionObservation;
      try {
        observation = RunExecutionObservationSchema.parse(JSON.parse(await Bun.file(observationPath).text()));
      } catch {
        observation = {
          schemaVersion: "skvm-run-execution-observation/v1",
          process: {
            exitCode: raw.exitCode,
            termination: raw.outerTimedOut ? "absolute-timeout" : raw.exitCode === 0 ? "natural" : "crash",
            durationMs: raw.durationMs,
          },
          activity: {
            requestDispatched: false, providerResponses: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0,
          },
          terminal: { present: false },
          usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          parser: { outcome: raw.exitCode === 0 ? "incompatible" : "empty", unknownTypes: raw.exitCode === 0 ? ["missing-sidecar"] : [] },
        };
      }
      const taskId = rowTaskId(row);
      const fileCount = await countFiles(row.workDir);
      return {
        raw,
        envelope: buildExecutionEnvelope({
          experimentId: lock.experimentId,
          taskId,
          system: row.system,
          candidateBlock: row.runIndex,
          attemptId: `${taskId}:block-${row.runIndex}:${row.system}`,
          observation,
          outputFileCount: fileCount,
          outerWatchdog: raw.outerTimedOut,
        }),
      };
    },
  });
  await mkdir(input.plan.runArgs.outDir, { recursive: true });
  const rawPath = path.join(input.plan.runArgs.outDir, "raw-runs.jsonl");
  const envelopePath = path.join(input.plan.runArgs.outDir, "execution-envelopes.jsonl");
  await writeFile(rawPath, executed.rawRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  await writeFile(envelopePath, executed.envelopes.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  return { ...executed, rawPath, envelopePath };
}

async function countFiles(root: string): Promise<number> {
  let count = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) count += 1;
    }
  };
  await visit(root);
  return count;
}

export function selectRawRowsForScoring(input: {
  rawRows: Array<Record<string, unknown>>;
  selectedBlocks: Array<{ taskId: string; candidateBlock: number }>;
  envelopes: ExecutionEnvelope[];
}): Array<Record<string, unknown>> {
  const semantic = new Set(input.envelopes
    .filter((envelope) => envelope.classification === "semantic-complete")
    .map((envelope) => envelope.attemptId));
  return input.rawRows.filter((row) => {
    const caseId = String(row.caseId ?? "");
    const taskId = caseId.split(":").at(-1) ?? "";
    const block = Number(row.runIndex);
    const system = String(row.system ?? "");
    return taskId.length > 0 && semantic.has(`${taskId}:block-${block}:${system}`);
  });
}
