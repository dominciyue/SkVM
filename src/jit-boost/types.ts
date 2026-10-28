import { z } from "zod"

// ---------------------------------------------------------------------------
// Param definitions (per-parameter extraction config)
// ---------------------------------------------------------------------------

/** Rich param definition with extraction hints */
export const ParamDefSchema = z.object({
  type: z.enum(["string", "number"]),
  /** Human-readable description of what this param is (used for LLM extraction) */
  description: z.string(),
  /** Regex with ONE capture group to extract this param from a user prompt */
  extractPattern: z.string().optional(),
})

export type ParamDef = z.infer<typeof ParamDefSchema>

/** Backward compatible: accepts "string"/"number" (old format) or ParamDef (new format) */
export const ParamValueSchema = z.union([z.string(), ParamDefSchema])

/** Normalize a param value to the rich ParamDef format */
export function normalizeParamDef(paramName: string, value: string | ParamDef): ParamDef {
  if (typeof value === "string") {
    return { type: value as "string" | "number", description: paramName }
  }
  return value
}

// ---------------------------------------------------------------------------
// Boost Candidate (generated at AOT / compile time)
// ---------------------------------------------------------------------------

export const SubworkflowSchema = z.object({
  remainingTask: z.string().min(1),
  bindings: z.array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).default([]),
  steps: z.array(z.object({
    id: z.string().min(1),
    argv: z.array(z.string()).min(1),
    timeoutMs: z.number().int().positive().optional(),
    outputs: z.array(z.object({
      path: z.string().min(1),
      format: z.enum(["text", "json"]),
      minimumBytes: z.number().int().nonnegative().optional(),
      requiredKeys: z.array(z.string()).optional(),
    })).min(1),
  })).min(1),
}).refine(flow => new Set(flow.steps.map(step => step.id)).size === flow.steps.length, "step IDs must be unique")

export type Subworkflow = z.infer<typeof SubworkflowSchema>

export const BoostCandidateSchema = z.object({
  purposeId: z.string(),
  keywords: z.array(z.string()).min(1),
  /** Regex pattern matching LLM-generated code structure */
  codeSignature: z.string(),
  /** Executable code with ${param} placeholders */
  functionTemplate: z.string(),
  /** Input/output parameter definitions: param name → type string or rich ParamDef */
  params: z.record(ParamValueSchema),
  materializationType: z.enum(["shell", "python"]),
  /** Tool types to monitor for signature matches (per-candidate override) */
  monitoredTools: z.array(z.string()).optional(),
  /** Opt-in checked local prefix; legacy templates still replace the whole task. */
  subworkflow: SubworkflowSchema.optional(),
})

export type BoostCandidate = z.infer<typeof BoostCandidateSchema>

// ---------------------------------------------------------------------------
// Monitor State (runtime tracking per candidate)
// ---------------------------------------------------------------------------

export const MonitorStateSchema = z.object({
  candidateId: z.string(),
  hitCount: z.number().default(0),
  consecutiveMatches: z.number().default(0),
  promoted: z.boolean().default(false),
  fallbackCount: z.number().default(0),
})

export type MonitorState = z.infer<typeof MonitorStateSchema>

// ---------------------------------------------------------------------------
// Solidification State (persisted per variant)
// ---------------------------------------------------------------------------

export const SolidificationEntrySchema = z.object({
  candidate: BoostCandidateSchema,
  state: MonitorStateSchema,
  promotedAt: z.string().optional(),
})

export type SolidificationEntry = z.infer<typeof SolidificationEntrySchema>

export const SolidificationStateSchema = z.object({
  skillId: z.string(),
  entries: z.array(SolidificationEntrySchema),
  updatedAt: z.string(),
})

export type SolidificationState = z.infer<typeof SolidificationStateSchema>

// ---------------------------------------------------------------------------
// Boost Candidates File (written by compiler, read at runtime)
// ---------------------------------------------------------------------------

export const BoostCandidatesFileSchema = z.object({
  candidates: z.array(BoostCandidateSchema),
})

export type BoostCandidatesFile = z.infer<typeof BoostCandidatesFileSchema>

// ---------------------------------------------------------------------------
// Boost Stats (runtime introspection)
// ---------------------------------------------------------------------------

export interface BoostStats {
  totalCandidates: number
  promotedCount: number
  totalHits: number
  totalFallbacks: number
  candidates: {
    purposeId: string
    promoted: boolean
    hitCount: number
    consecutiveMatches: number
    fallbackCount: number
  }[]
}
