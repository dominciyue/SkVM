import { z } from "zod";

export const TraceEventSchema = z.object({
  kind: z.enum(["tool-call", "tool-error", "step-complete", "step-skip", "rule-violation", "output-check"]),
  targetRef: z.string().min(1),
  message: z.string().min(1),
});

const ExecutionTraceBaseSchema = z.object({
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

const RUN_IDENTITY_FIELDS = [
  "model",
  "modelFamily",
  "adapter",
  "adapterVersion",
  "runIndex",
  "panelConfigId",
] as const;

export const ExecutionTraceSchema = ExecutionTraceBaseSchema.extend({
  model: z.string().min(1).optional(),
  modelFamily: z.string().min(1).optional(),
  adapter: z.string().min(1).optional(),
  adapterVersion: z.string().min(1).optional(),
  runIndex: z.number().int().positive().optional(),
  panelConfigId: z.string().min(1).optional(),
}).superRefine((trace, ctx) => {
  const identityFieldCount = RUN_IDENTITY_FIELDS.filter((field) => trace[field] !== undefined).length;
  if (identityFieldCount !== 0 && identityFieldCount !== RUN_IDENTITY_FIELDS.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Execution trace must omit run identity or provide the complete run identity",
    });
  }
});

export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;
