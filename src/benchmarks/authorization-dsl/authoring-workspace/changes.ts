import { stableAuthorizationJson } from "../../../task-dsl/authorization/result.ts"
import type { AuthorizationAuthoringInputV2 } from "../authoring-v2.ts"
import type { AuthorizationWorkspacePlan } from "./plan.ts"

export interface AuthorizationWorkspaceSnapshot {
  base: AuthorizationAuthoringInputV2 | null
  plan: AuthorizationWorkspacePlan
}

export interface AuthorizationWorkspaceChangeReport {
  status: "valid" | "invalid"
  commonChangedFields: string[]
  variants: Array<{
    id: string
    membership: "retained" | "added" | "removed"
    effectiveChangedFields: string[]
    inheritedChangedFields: string[]
    overriddenChangedFields: string[]
    reviewReasons: string[]
  }>
  diagnostics: string[]
}

const fields = [
  "taskId", "request", "repository", "sourceRef", "sourceRoot", "sources",
  "policies", "principals", "resources", "entries", "scenarios",
  "additionalQuestions", "additionalConstraints", "analysisContract",
] as const satisfies readonly (keyof AuthorizationAuthoringInputV2)[]

const equal = (left: unknown, right: unknown): boolean => stableAuthorizationJson(left) === stableAuthorizationJson(right)

export function snapshotAuthorizationWorkspace(plan: AuthorizationWorkspacePlan): AuthorizationWorkspaceSnapshot {
  return { base: plan.base ?? null, plan }
}

/** Read-only declaration diff. It does not validate a previous model answer. */
export function compareAuthorizationWorkspaces(
  before: AuthorizationWorkspaceSnapshot,
  after: AuthorizationWorkspaceSnapshot,
): AuthorizationWorkspaceChangeReport {
  if (before.plan.status !== "valid" || after.plan.status !== "valid" || !before.base || !after.base) {
    return {
      status: "invalid", commonChangedFields: [], variants: [],
      diagnostics: [
        ...before.plan.diagnostics.map(item => `before ${item.variantId ?? "$"} ${item.field}: ${item.message}`),
        ...after.plan.diagnostics.map(item => `after ${item.variantId ?? "$"} ${item.field}: ${item.message}`),
        ...(!before.base || !after.base ? ["A verified base snapshot is required for each workspace."] : []),
      ],
    }
  }
  const commonChangedFields = fields.filter(field => !equal(before.base![field], after.base![field]))
  const oldById = new Map(before.plan.variants.map(variant => [variant.id, variant]))
  const newById = new Map(after.plan.variants.map(variant => [variant.id, variant]))
  const ids = [...new Set([...oldById.keys(), ...newById.keys()])].sort()
  const variants = ids.map(id => {
    const old = oldById.get(id), current = newById.get(id)
    if (!old || !current) return {
      id, membership: old ? "removed" as const : "added" as const,
      effectiveChangedFields: [], inheritedChangedFields: [], overriddenChangedFields: [],
      reviewReasons: [old ? "variant-removed" : "variant-added"],
    }
    // Relocation text is not a model-visible source change; the captured bytes are.
    const effectiveChangedFields: string[] = fields.filter(field => field !== "sourceRoot" && !equal(old.input[field], current.input[field]))
    if (old.sourceContentSha256 !== current.sourceContentSha256) {
      effectiveChangedFields.push("sourceContent")
    }
    const inheritedChangedFields = commonChangedFields.filter(field => current.provenance.fieldOrigins[field] === "base")
    const overriddenChangedFields = commonChangedFields.filter(field => current.provenance.fieldOrigins[field] !== "base")
    const reviewReasons = [
      ...(effectiveChangedFields.length ? ["effective-input-changed"] : []),
      ...(overriddenChangedFields.length ? ["common-change-overridden"] : []),
    ]
    return { id, membership: "retained" as const, effectiveChangedFields, inheritedChangedFields, overriddenChangedFields, reviewReasons }
  })
  return { status: "valid", commonChangedFields, variants, diagnostics: [] }
}
