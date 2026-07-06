import { z } from "zod";

export const TraceEventSchema = z.object({
  kind: z.enum(["tool-call", "tool-error", "step-complete", "step-skip", "rule-violation", "output-check"]),
  targetRef: z.string().min(1),
  message: z.string().min(1),
});

export const ExecutionTraceSchema = z.object({
  schemaVersion: z.literal("skill-ir-trace/v1"),
  traceId: z.string().min(1),
  skillId: z.string().min(1),
  agent: z.string().min(1),
  environment: z.string().min(1),
  context: z.string().min(1),
  taskId: z.string().min(1),
  success: z.boolean(),
  tokenCost: z.number().int().min(0),
  latencyMs: z.number().int().min(0),
  events: z.array(TraceEventSchema),
});

export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;
