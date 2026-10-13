import { z } from "zod"
import { SourceCitationSchema } from "./question-workflow.ts"

export const AuthoringTargetModeSchema = z.enum(["current-input", "reusable"])
export type AuthoringTargetMode = z.infer<typeof AuthoringTargetModeSchema>
export const AuthoringTargetSchema = z.object({
  mode: AuthoringTargetModeSchema,
  coverage: z.array(z.object({ id: z.string().min(1).max(256), source: SourceCitationSchema, stepIds: z.array(z.string().min(1).max(256)).max(128), disposition: z.enum(["implemented", "unwritten", "external"]), reason: z.string().max(4000).optional() }).strict()).max(64).default([]),
}).strict()

/** Author declarations only; reference validity is never semantic coverage proof. */
export function projectAuthoringTarget(raw: any, requestedMode?: AuthoringTargetMode) {
  const parsed = AuthoringTargetSchema.safeParse(raw?.authoringTarget)
  const declared = parsed.success ? parsed.data : undefined
  const mode = requestedMode ?? declared?.mode ?? "current-input"
  const stepIds = new Set((Array.isArray(raw?.resourceWorkflow?.steps) ? raw.resourceWorkflow.steps : []).map((s: any) => s?.id))
  const coverage = (declared?.coverage ?? []).map(item => ({ ...item, missingStepIds: item.stepIds.filter(id => !stepIds.has(id)), semanticSupport: "unreviewed" }))
  return { mode, declaredMode: declared?.mode, coverage, coverageStatus: coverage.length ? "author-declared-unreviewed" : "undeclared", completion: "unreviewed",
    instruction: mode === "reusable" ? "Author one source-supported program for the declared task scope across varying inputs. The current scenario is only one execution instance. Read source branches and declare implemented/unwritten/external coverage with source and stepIds; an untriggered source branch is still authoring work. Test variations with authorization_program_trial and patch actual gaps. Empty or self-reported coverage never proves completeness. Do not invent external facts or classify a writable source branch as external merely because the current input does not trigger it." : "Current-input authoring remains supported; current computation does not certify other inputs or the complete original task." }
}
