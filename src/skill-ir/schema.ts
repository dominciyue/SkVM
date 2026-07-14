import { z } from "zod";

export const SkillCategorySchema = z.enum([
  "workflow",
  "tool-use",
  "constraint-heavy",
  "diagnostic",
  "generative",
  "environment-sensitive",
]);

export const SkillSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  }),
  z.object({ kind: z.literal("inline"), text: z.string().min(1) }),
]);

export const InputSpecSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
});

export const OutputSpecSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
});

export const ConditionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  checkability: z.enum(["static", "runtime", "human"]),
});

export const StepKindSchema = z.enum([
  "read",
  "analyze",
  "plan",
  "execute",
  "edit",
  "verify",
  "ask",
  "report",
]);

export const StepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  kind: StepKindSchema,
  required: z.boolean(),
  dependsOn: z.array(z.string()),
  toolRefs: z.array(z.string()),
  produces: z.array(z.string()),
  successCheckRefs: z.array(z.string()),
  failureModes: z.array(z.string()),
});

export const RuleSchema = z.object({
  id: z.string().min(1),
  sourceText: z.string().min(1),
  level: z.enum(["must", "never", "should"]),
  scope: z.enum(["planning", "tool-use", "file-edit", "git", "output", "safety", "context"]),
  checkability: z.enum(["static", "runtime", "human"]),
  severity: z.enum(["low", "medium", "high"]),
  normalizedForm: z.string().min(1),
});

export const ToolRequirementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  required: z.boolean(),
  alternatives: z.array(z.string()),
  platformNotes: z.object({
    linux: z.string().optional(),
    macos: z.string().optional(),
    windows: z.string().optional(),
  }),
  availabilityCheck: z.string().min(1),
});

export const EnvironmentAssumptionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  platforms: z.array(z.enum(["linux", "macos", "windows", "wsl", "container"])),
  checkability: z.enum(["static", "runtime", "human"]),
});

export const RuntimeCheckSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["preflight", "step-success", "rule-violation", "output"]),
  targetRef: z.string().min(1),
  command: z.string().optional(),
  assertion: z.string().min(1),
  onFailure: z.enum(["retry", "fallback", "ask-user", "abort", "report"]),
});

export const RecoveryPolicySchema = z.object({
  id: z.string().min(1),
  trigger: z.string().min(1),
  action: z.enum(["retry", "use-alternative-tool", "repair-environment", "ask-user", "stop"]),
  maxAttempts: z.number().int().min(0),
  explanation: z.string().min(1),
});

export const ProfileAnnotationSchema = z.object({
  id: z.string().min(1),
  sourceTrace: z.string().min(1),
  targetRef: z.string().min(1),
  observation: z.enum([
    "frequent-failure",
    "frequent-skip",
    "high-token-cost",
    "environment-sensitive",
    "agent-sensitive",
    "context-sensitive",
  ]),
  evidenceCount: z.number().int().min(1),
  suggestedPass: z.string().min(1),
});

export const SkillIRSchema = z.object({
  schemaVersion: z.literal("skill-ir/v1"),
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.array(SkillCategorySchema).min(1),
  intent: z.string().min(1),
  source: SkillSourceSchema,
  inputs: z.array(InputSpecSchema),
  outputs: z.array(OutputSpecSchema),
  preconditions: z.array(ConditionSchema),
  steps: z.array(StepSchema),
  rules: z.array(RuleSchema),
  tools: z.array(ToolRequirementSchema),
  environment: z.array(EnvironmentAssumptionSchema),
  checks: z.array(RuntimeCheckSchema),
  recovery: z.array(RecoveryPolicySchema),
  profile: z.array(ProfileAnnotationSchema),
});

export type SkillIR = z.infer<typeof SkillIRSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type RuntimeCheck = z.infer<typeof RuntimeCheckSchema>;
export type ProfileAnnotation = z.infer<typeof ProfileAnnotationSchema>;
