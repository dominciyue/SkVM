import { createHash } from "node:crypto"
import { z } from "zod"
import type { InquiryDiagnostic } from "./inquiry.ts"

const id = z.string().min(1).max(256).refine(v => !["__proto__", "prototype", "constructor"].includes(v))
export const ProgramStepPatchSchema = z.object({ baseRevision: z.string().min(1), upsertSteps: z.array(z.object({ id }).passthrough()).max(128), removeStepIds: z.array(id).max(128).optional(), inputNames: z.array(id).max(64).optional() }).strict()
export interface ProgramDraft { revision: string; raw: any }
const identity = (v: any) => JSON.stringify([v?.id, v?.scope?.questionId])
export function createProgramDraft(raw: unknown, previous?: ProgramDraft): ProgramDraft {
  const value: any = structuredClone(raw)
  if (value && typeof value === "object" && !Array.isArray(value) && !Object.hasOwn(value, "resourceWorkflow") && previous && identity(value) === identity(previous.raw) && previous.raw?.resourceWorkflow) value.resourceWorkflow = structuredClone(previous.raw.resourceWorkflow)
  return { revision: createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex"), raw: value }
}
/** Pure merge; omission preserves steps, replacement preserves their order. */
export function patchProgramDraft(current: ProgramDraft | undefined, raw: unknown): { draft?: ProgramDraft; diagnostics: InquiryDiagnostic[]; changedStepIds?: string[] } {
  const fail = (code: string, message: string) => ({ draft: current, diagnostics: [{ code, path: "$patch", message, severity: "error" as const }] })
  const parsed = ProgramStepPatchSchema.safeParse(raw)
  if (!parsed.success) return fail("program-patch-shape", parsed.error.message)
  if (!current || !current.raw || typeof current.raw !== "object") return fail("program-patch-missing", "Submit an initial program before patching its steps.")
  if (parsed.data.baseRevision !== current.revision) return fail("program-patch-stale", `Current draft revision is ${current.revision}; inspect it before applying these edits.`)
  const patch = parsed.data, upsertIds = patch.upsertSteps.map(s => s.id), remove = patch.removeStepIds ?? []
  if (new Set(upsertIds).size !== upsertIds.length || new Set(remove).size !== remove.length || upsertIds.some(id => remove.includes(id))) return fail("program-patch-conflict", "Each ID must have one explicit operation.")
  const value = structuredClone(current.raw), workflow = value.resourceWorkflow ?? { inputs: [], steps: [], gaps: [] }
  if (!Array.isArray(workflow.steps)) return fail("program-patch-workflow", "Replace the malformed workflow envelope using a full program.")
  const ids = workflow.steps.map((s: any) => s?.id)
  if (upsertIds.some(id => ids.filter((x: unknown) => x === id).length > 1)) return fail("program-patch-ambiguous", "Duplicate existing IDs require explicit removal or a full replacement.")
  workflow.steps = workflow.steps.filter((s: any) => !remove.includes(s?.id))
  for (const step of patch.upsertSteps) {
    const position = workflow.steps.findIndex((s: any) => s?.id === step.id)
    if (position < 0) workflow.steps.push(step)
    else workflow.steps[position] = step
  }
  if (workflow.steps.length > 128) return fail("program-patch-bound", "The workflow supports at most 128 steps.")
  if (patch.inputNames) workflow.inputs = patch.inputNames
  value.resourceWorkflow = workflow
  return { draft: createProgramDraft(value), diagnostics: [], changedStepIds: [...upsertIds, ...remove] }
}
