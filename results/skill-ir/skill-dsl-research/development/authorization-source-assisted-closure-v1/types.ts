import { z } from "zod"

export const TaskSchema = z.enum(["paperless-download", "owui-ingestion", "gitea-create-issue"])
export type TaskId = z.infer<typeof TaskSchema>
export const FileIdentitySchema = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() }).strict()
export const SkillIdentitySchema = z.object({ file: z.string().min(1), files: z.array(FileIdentitySchema).min(1), bundleSha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() }).strict()
export type SkillIdentity = z.infer<typeof SkillIdentitySchema>
export const InputRegistrationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), task: TaskSchema, file: z.string().regex(/^model\/inputs\/[a-z0-9-]+\.json$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), parentFile: z.string().min(1), parentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  changes: z.array(z.string()), ready: z.boolean(), sourceFiles: z.array(FileIdentitySchema),
}).strict()
export const PositionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]+$/), kind: z.enum(["debug", "native", "author", "consumer", "variation", "quality"]),
  task: TaskSchema, inputId: z.string().regex(/^[a-z0-9-]+$/), variant: z.enum(["original", "changed", "policy", "premise", "source"]),
  arm: z.enum(["N", "M-S", "D-S", "author", "consumer", "fresh", "materials-previous"]), method: z.enum(["M", "D1"]),
  strategy: z.enum(["legacy", "operation-evidence-v2"]), providerLimit: z.number().int().positive(), dependsOn: z.array(z.string()),
  previousPosition: z.string().optional(), authorPosition: z.string().optional(),
}).strict()
export type Position = z.infer<typeof PositionSchema>
export const ManifestSchema = z.object({
  schemaVersion: z.literal("authorization-av-manifest/v1"), development: z.literal("adaptive-exposed"), baselineRevision: z.string().min(1),
  testedModel: z.literal("xty/gpt-5.6-sol"), cachePath: z.string().min(1), recoveryPolicy: z.literal("authorization-readonly-recovery/v1"),
  budgets: z.object({ maxDispatches: z.literal(24), authorDispatches: z.literal(12), maxToolCalls: z.literal(64), maxDisplayBytes: z.literal(786432), maxReadBytes: z.literal(33554432), maxFiles: z.literal(512), maxTokens: z.literal(6000), perCallTimeoutMs: z.literal(300000), sessionTimeoutMs: z.literal(7500000) }).strict(),
  inputs: z.array(InputRegistrationSchema), skills: z.object({ "paperless-download": SkillIdentitySchema, "owui-ingestion": SkillIdentitySchema, "gitea-create-issue": SkillIdentitySchema }).strict(),
  positions: z.array(PositionSchema).length(26), policyVariants: z.record(z.object({ text: z.string().min(1), origin: z.enum(["user", "external-policy"]), location: z.string().min(1) }).strict()),
  protectedHistorical: z.array(z.string()), targetExecutions: z.literal(0), evaluatorIsolation: z.literal("evaluations are never model inputs"),
}).strict().superRefine((m, c) => {
  for (const [name, entries] of [["inputs", m.inputs], ["positions", m.positions]] as const) if (new Set(entries.map(e => e.id)).size !== entries.length) c.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: "Duplicate registered identity" })
  for (const p of m.positions) {
    if (p.kind !== "consumer" && !m.inputs.some(i => i.id === p.inputId && i.task === p.task)) c.addIssue({ code: z.ZodIssueCode.custom, path: ["positions", p.id], message: "Position input missing or task mismatched" })
    if (p.providerLimit !== (p.kind === "author" ? 12 : 24)) c.addIssue({ code: z.ZodIssueCode.custom, path: ["positions", p.id], message: "Position budget differs from registration" })
    for (const id of [...p.dependsOn, ...(p.previousPosition ? [p.previousPosition] : []), ...(p.authorPosition ? [p.authorPosition] : [])]) if (!m.positions.some(q => q.id === id && q.id !== p.id)) c.addIssue({ code: z.ZodIssueCode.custom, path: ["positions", p.id], message: "Unknown dependency" })
  }
})
export type Manifest = z.infer<typeof ManifestSchema>
const attemptId = z.string().regex(/^(?:first|revision-[a-z0-9-]+)$/), digest = z.string().regex(/^[a-f0-9]{64}$/)
export const ReviewAdmissionSchema = z.object({ schemaVersion: z.literal("authorization-av-author-admission/v1"), status: z.enum(["accepted", "rejected"]), authorPosition: z.string().regex(/^author-(?:paperless-download|gitea-create-issue)-(?:original|changed)$/), authorAttempt: attemptId, inquirySha256: digest, usageSha256: digest, reviewer: z.literal("independent-readonly-ai-plus-main-adjudication"), reason: z.string().min(1) }).strict()
export const AttemptReportSchema = z.object({ schemaVersion: z.literal("authorization-av-attempt/v1"), positionId: z.string().regex(/^[A-Za-z0-9-]+$/), attemptId, revision: z.string().regex(/^[a-z0-9-]+$/).nullable(), parent: attemptId.nullable(), startedAt: z.string(), implementationRevision: z.string(), model: z.string(), inputSha256: digest, sourceFiles: z.array(FileIdentitySchema), skillBundleSha256: digest.nullable(), status: z.string(), providerCalls: z.number().int().nonnegative().nullable(), targetExecutions: z.literal(0), raw: z.object({ kind: z.enum(["inquiry", "native", "author"]), file: z.string().regex(/^raw\/[a-z0-9-]+\.json(?:\.gz)?$/) }).strict(), final: z.string(), error: z.string().optional() }).strict()
export type AttemptReport = z.infer<typeof AttemptReportSchema>
