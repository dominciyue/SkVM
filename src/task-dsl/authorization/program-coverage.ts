import { z } from "zod"
import { SourceCitationSchema } from "./question-workflow.ts"

export const AuthoringTargetModeSchema = z.enum(["current-input", "reusable"])
export type AuthoringTargetMode = z.infer<typeof AuthoringTargetModeSchema>
/** Source-authored relationships, not execution syntax or a coverage certificate. */
export const ProgramCallRelationSchema = z.object({
  stepId: z.string().min(1).max(256), activation: z.enum(["always", "conditional", "unreviewed"]),
  activationDependencyIds: z.array(z.string().min(1).max(256)).max(32).optional(),
  completion: z.enum(["required", "caught", "unreviewed"]), completionGuardId: z.string().min(1).max(256).optional(),
  completionMeaning: z.enum(["normal-return", "finite-marker"]).optional(),
  successorStepIds: z.array(z.string().min(1).max(256)).max(128).default([]),
  resultUse: z.enum(["used", "ignored", "unreviewed"]), reason: z.string().min(1).max(4000),
}).strict()
export const AuthoringTargetSchema = z.object({
  mode: AuthoringTargetModeSchema,
  coverage: z.array(z.object({ id: z.string().min(1).max(256), source: SourceCitationSchema, stepIds: z.array(z.string().min(1).max(256)).max(128), disposition: z.enum(["implemented", "unwritten", "external"]), reason: z.string().max(4000).optional(), call: ProgramCallRelationSchema.optional() }).strict()).max(64).default([]),
}).strict()

/** Author declarations only; reference validity is never semantic coverage proof. */
export function projectAuthoringTarget(raw: any, requestedMode?: AuthoringTargetMode, programSupport: "rules" | "execute" = "execute") {
  const parsed = AuthoringTargetSchema.safeParse(raw?.authoringTarget)
  const declared = parsed.success ? parsed.data : undefined
  const mode = requestedMode ?? declared?.mode ?? "current-input"
  const stepIds = new Set((Array.isArray(raw?.resourceWorkflow?.steps) ? raw.resourceWorkflow.steps : []).map((s: any) => s?.id))
  const coverage = (declared?.coverage ?? []).map(item => ({ ...item, missingStepIds: item.stepIds.filter(id => !stepIds.has(id)), semanticSupport: "unreviewed" }))
  return { mode, declaredMode: declared?.mode, coverage, coverageStatus: coverage.length ? "author-declared-unreviewed" : "undeclared", completion: "unreviewed",
    inputSemantics: "A supplied mapping is a complete finite object: field:{of,key,default:{literal:...}} uses its explicit default only when that known object lacks the key. Explicit null and empty string are present values; an unknown parent or external result remains unknown, not a missing key. A record is unknown if any field is unknown; inspect individual step values for retained local computations. Source calls (including methods named get) are syntax only: inspect actual receiver type and source arguments before choosing a default. No method name infers a result.",
    instruction: mode === "reusable" ? `Author one source-supported program for the declared task scope across varying inputs. The current scenario is only one execution instance. Read source branches and declare implemented/unwritten/external coverage with source and stepIds; an untriggered source branch is still authoring work. ${programSupport === "rules" ? "Inspect raw rules and schema/source-structure diagnostics and patch source-supported gaps; host execution and trials are unavailable." : "Test variations with authorization_program_trial and patch actual gaps."} Empty or self-reported coverage never proves completeness. Do not invent external facts or classify a writable source branch as external merely because the current input does not trigger it.` : "Current-input authoring remains supported; current computation does not certify other inputs or the complete original task." }
}
