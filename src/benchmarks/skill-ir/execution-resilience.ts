import { z } from "zod";

export const ExecutionFailureClassificationSchema = z.enum([
  "qualification-failure",
  "transport-transient",
  "empty-terminal",
  "pre-semantic-idle-timeout",
  "parser-incompatible",
  "runtime-crash",
  "active-idle-timeout",
  "active-absolute-timeout",
  "step-limit",
  "semantic-complete",
  "measurement-invalid",
]);

export type ExecutionFailureClassification = z.infer<typeof ExecutionFailureClassificationSchema>;

const ProcessTerminationSchema = z.enum([
  "natural",
  "crash",
  "idle-timeout",
  "absolute-timeout",
  "step-limit",
  "outer-watchdog",
]);

export const ExecutionEnvelopeSchema = z.object({
  schemaVersion: z.literal("skill-ir-execution-envelope/v1"),
  experimentId: z.string().min(1),
  taskId: z.string().min(1),
  system: z.string().min(1),
  candidateBlock: z.number().int().positive(),
  attemptId: z.string().min(1),
  process: z.object({
    started: z.boolean(),
    exitCode: z.number().int().nullable(),
    termination: ProcessTerminationSchema,
    durationMs: z.number().nonnegative(),
  }).strict(),
  activity: z.object({
    requestDispatched: z.boolean(),
    providerResponses: z.number().int().nonnegative(),
    assistantMessages: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    toolResults: z.number().int().nonnegative(),
    firstActivityMs: z.number().nonnegative().optional(),
    lastActivityMs: z.number().nonnegative().optional(),
  }).strict(),
  terminal: z.object({
    present: z.boolean(),
    stopReason: z.string().min(1).optional(),
  }).strict(),
  usage: z.object({
    available: z.boolean(),
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
  }).strict(),
  parser: z.object({
    outcome: z.enum(["ok", "empty", "incompatible"]),
    unknownTypes: z.array(z.string().min(1)),
  }).strict(),
  outputs: z.object({ fileCount: z.number().int().nonnegative() }).strict(),
  transientError: z.enum(["provider-5xx", "rate-limit", "connection-reset", "network-timeout"]).optional(),
  classification: ExecutionFailureClassificationSchema,
  replacementEligible: z.boolean(),
}).strict();

export type ExecutionEnvelope = z.infer<typeof ExecutionEnvelopeSchema>;

export type ExecutionClassification = Pick<ExecutionEnvelope, "classification" | "replacementEligible">;

function hasSemanticActivity(envelope: ExecutionEnvelope): boolean {
  if (envelope.parser.outcome === "empty") return false;
  const { activity, usage } = envelope;
  return activity.providerResponses > 0
    || activity.assistantMessages > 0
    || activity.toolCalls > 0
    || activity.toolResults > 0
    || usage.input + usage.output + usage.cacheRead + usage.cacheWrite > 0;
}

export function classifyExecutionEnvelope(input: ExecutionEnvelope): ExecutionClassification {
  const envelope = ExecutionEnvelopeSchema.parse(input);
  const active = hasSemanticActivity(envelope);
  if (envelope.parser.outcome === "incompatible" || envelope.parser.unknownTypes.length > 0) {
    return { classification: "parser-incompatible", replacementEligible: false };
  }
  if (envelope.process.termination === "step-limit") {
    return { classification: "step-limit", replacementEligible: false };
  }
  if (envelope.process.termination === "idle-timeout") {
    return active
      ? { classification: "active-idle-timeout", replacementEligible: false }
      : { classification: "pre-semantic-idle-timeout", replacementEligible: true };
  }
  if (
    envelope.process.termination === "absolute-timeout"
    || envelope.process.termination === "outer-watchdog"
  ) {
    return { classification: "active-absolute-timeout", replacementEligible: false };
  }
  if (envelope.transientError !== undefined && !active) {
    return { classification: "transport-transient", replacementEligible: true };
  }
  const usageTotal = envelope.usage.input + envelope.usage.output
    + envelope.usage.cacheRead + envelope.usage.cacheWrite;
  if (
    envelope.parser.outcome === "empty"
    && usageTotal === 0
    && envelope.activity.toolCalls === 0
    && envelope.activity.toolResults === 0
  ) {
    return { classification: "empty-terminal", replacementEligible: true };
  }
  if (!envelope.process.started) {
    return { classification: "qualification-failure", replacementEligible: false };
  }
  if (envelope.process.termination === "crash" || envelope.process.exitCode !== 0) {
    return { classification: "runtime-crash", replacementEligible: false };
  }
  return { classification: "semantic-complete", replacementEligible: false };
}

export type MatchedExecutionBlock = {
  taskId: string;
  candidateBlock: number;
};

export type ReplacedExecutionBlock = MatchedExecutionBlock & {
  reasons: ExecutionFailureClassification[];
};

export type MatchedExecutionBlockSelection = {
  complete: boolean;
  selectedBlocks: MatchedExecutionBlock[];
  replacedBlocks: ReplacedExecutionBlock[];
  attemptedRows: number;
  selectedRows: number;
  abortReason?: "replacement-budget-exhausted" | "incomplete-block" | "execution-blocker";
};

/**
 * Execute candidate blocks sequentially so reserve consumption is decided
 * before scorer output exists and future blocks are never run unnecessarily.
 */
export async function executeMatchedExecutionBlocks(input: {
  taskIds: readonly string[];
  systems: readonly string[];
  targetBlocksPerTask: number;
  reserveBlocksPerTask: number;
  executeBlock: (taskId: string, candidateBlock: number) => Promise<ExecutionEnvelope[]>;
}): Promise<MatchedExecutionBlockSelection & { envelopes: ExecutionEnvelope[] }> {
  const envelopes: ExecutionEnvelope[] = [];
  const selectedBlocks: MatchedExecutionBlock[] = [];
  const replacedBlocks: ReplacedExecutionBlock[] = [];
  const maximumCandidate = input.targetBlocksPerTask + input.reserveBlocksPerTask;
  let abortReason: MatchedExecutionBlockSelection["abortReason"];

  for (const taskId of input.taskIds) {
    let selectedForTask = 0;
    for (let candidateBlock = 1; candidateBlock <= maximumCandidate; candidateBlock += 1) {
      if (selectedForTask >= input.targetBlocksPerTask) break;
      const rows = await input.executeBlock(taskId, candidateBlock);
      envelopes.push(...rows);
      const block = selectMatchedExecutionBlocks({
        taskIds: [taskId],
        systems: input.systems,
        targetBlocksPerTask: 1,
        reserveBlocksPerTask: 0,
        envelopes: rows.map((row) => ({ ...row, candidateBlock: 1 })),
      });
      if (block.abortReason === "incomplete-block" || block.abortReason === "execution-blocker") {
        abortReason = block.abortReason;
        break;
      }
      if (block.replacedBlocks.length > 0) {
        replacedBlocks.push({ taskId, candidateBlock, reasons: block.replacedBlocks[0]!.reasons });
      } else {
        selectedBlocks.push({ taskId, candidateBlock });
        selectedForTask += 1;
      }
    }
    if (abortReason) break;
    if (selectedForTask < input.targetBlocksPerTask) {
      abortReason = "replacement-budget-exhausted";
      break;
    }
  }

  return {
    complete: abortReason === undefined,
    selectedBlocks,
    replacedBlocks,
    attemptedRows: envelopes.length,
    selectedRows: selectedBlocks.length * new Set(input.systems).size,
    ...(abortReason ? { abortReason } : {}),
    envelopes,
  };
}

export function selectMatchedExecutionBlocks(input: {
  taskIds: readonly string[];
  systems: readonly string[];
  targetBlocksPerTask: number;
  reserveBlocksPerTask: number;
  envelopes: readonly ExecutionEnvelope[];
}): MatchedExecutionBlockSelection {
  if (!Number.isInteger(input.targetBlocksPerTask) || input.targetBlocksPerTask < 1) {
    throw new Error("targetBlocksPerTask must be a positive integer");
  }
  if (!Number.isInteger(input.reserveBlocksPerTask) || input.reserveBlocksPerTask < 0) {
    throw new Error("reserveBlocksPerTask must be a non-negative integer");
  }
  const expectedSystems = new Set(input.systems);
  if (expectedSystems.size !== input.systems.length || expectedSystems.size < 2) {
    throw new Error("matched block systems must be unique");
  }
  const parsed = input.envelopes.map((item) => ExecutionEnvelopeSchema.parse(item));
  for (const envelope of parsed) {
    const canonical = classifyExecutionEnvelope(envelope);
    if (
      envelope.classification !== canonical.classification
      || envelope.replacementEligible !== canonical.replacementEligible
    ) {
      throw new Error(`Execution envelope classification mismatch: ${envelope.attemptId}`);
    }
  }
  const selectedBlocks: MatchedExecutionBlock[] = [];
  const replacedBlocks: ReplacedExecutionBlock[] = [];
  let abortReason: MatchedExecutionBlockSelection["abortReason"];
  const maximumCandidate = input.targetBlocksPerTask + input.reserveBlocksPerTask;

  for (const taskId of input.taskIds) {
    let selectedForTask = 0;
    for (let candidateBlock = 1; candidateBlock <= maximumCandidate; candidateBlock += 1) {
      if (selectedForTask >= input.targetBlocksPerTask) break;
      const rows = parsed.filter((item) => item.taskId === taskId && item.candidateBlock === candidateBlock);
      const systems = new Set(rows.map((item) => item.system));
      if (rows.length !== expectedSystems.size || [...expectedSystems].some((system) => !systems.has(system))) {
        abortReason = "incomplete-block";
        break;
      }
      const blocker = rows.some((item) =>
        item.classification === "parser-incompatible"
        || item.classification === "runtime-crash"
        || item.classification === "qualification-failure"
        || item.classification === "measurement-invalid");
      if (blocker) {
        abortReason = "execution-blocker";
        break;
      }
      const replacementReasons = [...new Set(rows
        .filter((item) => item.replacementEligible)
        .map((item) => item.classification))];
      if (replacementReasons.length > 0) {
        replacedBlocks.push({ taskId, candidateBlock, reasons: replacementReasons });
        continue;
      }
      selectedBlocks.push({ taskId, candidateBlock });
      selectedForTask += 1;
    }
    if (abortReason) break;
    if (selectedForTask < input.targetBlocksPerTask) {
      abortReason = "replacement-budget-exhausted";
      break;
    }
  }

  return {
    complete: abortReason === undefined,
    selectedBlocks,
    replacedBlocks,
    attemptedRows: parsed.length,
    selectedRows: selectedBlocks.length * expectedSystems.size,
    ...(abortReason ? { abortReason } : {}),
  };
}
