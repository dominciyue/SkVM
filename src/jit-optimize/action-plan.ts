import {
  OptimizationActionSchema,
  type OptimizationAction,
  type OptimizationActionDiagnostic,
} from "./types.ts"

/**
 * Build a repairable semantic diagnostic without pretending that the local
 * program is a runtime failure. The caller supplies only paths it has already
 * resolved inside the candidate skill root.
 */
export function actionKindMismatchDiagnostic(options: {
  action: OptimizationAction
  supportedLocalPaths: readonly string[]
  suggestedKind: "reuse-script" | "generate-script"
}): OptimizationActionDiagnostic {
  const { action } = options
  const paths = [...new Set(options.supportedLocalPaths)].sort((left, right) => left.localeCompare(right, "en"))
  return {
    code: "action-kind-mismatch",
    severity: "error",
    actionId: action.id,
    locator: `action:${action.id}.kind`,
    message: `Action ${action.id} declares kind=${action.kind}, but the candidate exposes local executable path(s) ${paths.join(", ") || "(none)"}. Use ${options.suggestedKind}; domain-backend is reserved for a registered backend.`,
    field: "kind",
    originalValue: action.kind,
    supportedLocalPaths: paths,
    suggestedValue: options.suggestedKind,
  }
}

export interface OptimizationActionValidationResult {
  actions: OptimizationAction[]
  diagnostics: OptimizationActionDiagnostic[]
}

interface LocatedAction {
  action: OptimizationAction
  index: number
}

function invalidActionDiagnostic(index: number, input: unknown): OptimizationActionDiagnostic {
  const parsed = OptimizationActionSchema.safeParse(input)
  const details = parsed.success
    ? "unknown validation failure"
    : parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
      .join("; ")
  const actionId = typeof input === "object" && input !== null && typeof (input as { id?: unknown }).id === "string"
    ? (input as { id: string }).id
    : undefined
  return {
    code: "invalid-action",
    severity: "error",
    ...(actionId ? { actionId } : {}),
    locator: `actions[${index}]`,
    message: `Action is incomplete or syntactically invalid: ${details}`,
  }
}

function cycleMembers(actions: LocatedAction[]): Set<string> {
  const byId = new Map(actions.map((item) => [item.action.id, item]))
  const state = new Map<string, "visiting" | "visited">()
  const stack: string[] = []
  const members = new Set<string>()

  const visit = (id: string): void => {
    const prior = state.get(id)
    if (prior === "visited") return
    if (prior === "visiting") {
      const start = stack.lastIndexOf(id)
      for (const member of stack.slice(start)) members.add(member)
      return
    }
    state.set(id, "visiting")
    stack.push(id)
    for (const dep of byId.get(id)?.action.dependsOn ?? []) visit(dep)
    stack.pop()
    state.set(id, "visited")
  }

  for (const item of actions) visit(item.action.id)
  return members
}

function pruneUnknownDependencies(
  active: Map<string, LocatedAction>,
  diagnostics: OptimizationActionDiagnostic[],
): void {
  let changed = true
  while (changed) {
    changed = false
    for (const [id, item] of [...active]) {
      const missingIndex = item.action.dependsOn.findIndex((dep) => !active.has(dep))
      if (missingIndex < 0) continue
      const dependency = item.action.dependsOn[missingIndex]!
      diagnostics.push({
        code: "unknown-action-dependency",
        severity: "error",
        actionId: id,
        locator: `actions[${item.index}].dependsOn[${missingIndex}]`,
        message: `Required dependency ${dependency} is not an available valid action.`,
      })
      active.delete(id)
      changed = true
    }
  }
}

/**
 * Validate actions independently, then enforce id/dependency graph integrity.
 * Invalid actions and their dependants are rejected without discarding valid,
 * independent siblings or the submission's evidence/opportunity audit.
 */
export function validateOptimizationActions(inputs: readonly unknown[]): OptimizationActionValidationResult {
  const diagnostics: OptimizationActionDiagnostic[] = []
  const located: LocatedAction[] = []
  for (const [index, input] of inputs.entries()) {
    const parsed = OptimizationActionSchema.safeParse(input)
    if (!parsed.success) {
      diagnostics.push(invalidActionDiagnostic(index, input))
      continue
    }
    located.push({ action: parsed.data, index })
  }

  const byId = new Map<string, LocatedAction[]>()
  for (const item of located) {
    const same = byId.get(item.action.id) ?? []
    same.push(item)
    byId.set(item.action.id, same)
  }
  const duplicateIds = new Set<string>()
  for (const [id, same] of byId) {
    if (same.length < 2) continue
    duplicateIds.add(id)
    for (const item of same) {
      diagnostics.push({
        code: "duplicate-action-id",
        severity: "error",
        actionId: id,
        locator: `actions[${item.index}].id`,
        message: `Action id ${id} is duplicated; no copy is executable.`,
      })
    }
  }

  const active = new Map(
    located
      .filter((item) => !duplicateIds.has(item.action.id))
      .map((item) => [item.action.id, item]),
  )
  pruneUnknownDependencies(active, diagnostics)

  const cycles = cycleMembers([...active.values()])
  for (const id of cycles) {
    const item = active.get(id)!
    diagnostics.push({
      code: "action-dependency-cycle",
      severity: "error",
      actionId: id,
      locator: `actions[${item.index}].dependsOn`,
      message: `Action ${id} participates in a dependency cycle.`,
    })
    active.delete(id)
  }
  pruneUnknownDependencies(active, diagnostics)

  return {
    actions: located
      .filter((item) => active.has(item.action.id))
      .map((item) => item.action),
    diagnostics,
  }
}
