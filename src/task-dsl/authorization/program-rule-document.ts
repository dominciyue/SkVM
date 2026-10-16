import { ResourceStepSchema } from "./resource-relations.ts"

export type ProgramRuleDocument = {
  schemaVersion: "authorization-program-rules/v1"
  programId: string
  markdown: string
  representedStepIds: string[]
  semanticSupport: "author-declared-unreviewed"
}
/** Raw-only deterministic presentation. Validation labels malformed slots but
 * never substitutes parsed defaults, repairs meanings or evaluates expressions. */
export function renderProgramRuleDocument(raw: unknown): ProgramRuleDocument {
  const value: any = raw
  const steps: any[] = Array.isArray(value?.resourceWorkflow?.steps) ? value.resourceWorkflow.steps : []
  const representedStepIds = steps.map((s, i) => typeof s?.id === "string" ? s.id : `$invalid-step-${i}`)
  const json = (v: unknown) => "```json\n" + (JSON.stringify(v, null, 2) ?? "null") + "\n```"
  const lines = ["# Author-declared program rules", "", "These rules are the author's unreviewed declarations. No current execution, outcome or source certification is supplied by this document. Literal descriptions remain author statements.", ""]
  for (const [i, step] of steps.entries()) {
    const parsed = ResourceStepSchema.safeParse(step)
    lines.push(`## Step ${i + 1}: ${JSON.stringify(representedStepIds[i])}`, "", parsed.success ? `Operation: ${parsed.data.op}.` : "Unsupported or malformed step; exact authored data retained below.", "", json(step), "")
  }
  lines.push("## Complete authored program", "", "All scope, input declarations, expressions, sources, coverage, gaps and unsupported fields are preserved here, including the original step order.", "", json(raw), "")
  return { schemaVersion: "authorization-program-rules/v1", programId: typeof value?.id === "string" ? value.id : "undeclared", markdown: lines.join("\n"), representedStepIds, semanticSupport: "author-declared-unreviewed" }
}
