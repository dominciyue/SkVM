import type {
  AuthorizationEntry,
  AuthorizationObligation,
  AuthorizationPolicySource,
  AuthorizationPrincipal,
  AuthorizationResource,
  AuthorizationTaskV0,
  Diagnostic,
} from "./schema.ts"

export interface CompiledAuthorizationObligation {
  id: string
  authorObligationId: string
  entryId: string
  obligation: AuthorizationObligation
  principal?: AuthorizationPrincipal
  resource?: AuthorizationResource
  entry?: AuthorizationEntry
  policySource?: AuthorizationPolicySource
}

export type BlockedAuthorizationReason =
  | "invalid-reference"
  | "ambiguous-reference"
  | "policy-conflicted"
  | "policy-unresolved"

export interface BlockedAuthorizationObligation extends CompiledAuthorizationObligation {
  blockedBy: BlockedAuthorizationReason
}

export interface CompiledAuthorizationTask {
  task: AuthorizationTaskV0
  status: "ready" | "partial" | "blocked" | "needs-input"
  runnableObligations: CompiledAuthorizationObligation[]
  blockedObligations: BlockedAuthorizationObligation[]
  diagnostics: Diagnostic[]
}

interface EntityIndex<T extends { id: string }> {
  values: Map<string, T>
  duplicates: Set<string>
}

function indexEntities<T extends { id: string }>(
  values: T[],
  collectionPath: string,
  diagnostics: Diagnostic[],
): EntityIndex<T> {
  const index = new Map<string, T>()
  const duplicates = new Set<string>()
  values.forEach((value, position) => {
    if (index.has(value.id)) {
      duplicates.add(value.id)
      diagnostics.push({
        code: "duplicate-id",
        message: `Duplicate ${collectionPath} id \"${value.id}\" is ambiguous.`,
        path: `${collectionPath}.${position}.id`,
        severity: "error",
      })
      return
    }
    index.set(value.id, value)
  })
  return { values: index, duplicates }
}

function addReferenceDiagnostic(
  diagnostics: Diagnostic[],
  path: string,
  collection: string,
  id: string,
  ambiguous: boolean,
): void {
  diagnostics.push({
    code: ambiguous ? "ambiguous-reference" : "dangling-reference",
    message: ambiguous
      ? `${collection} id \"${id}\" is duplicated and cannot be resolved.`
      : `${collection} id \"${id}\" does not exist.`,
    path,
    severity: "error",
  })
}

export function compileAuthorizationTask(task: AuthorizationTaskV0): CompiledAuthorizationTask {
  const diagnostics: Diagnostic[] = []
  const policies = indexEntities(task.policySources, "policySources", diagnostics)
  const principals = indexEntities(task.principals, "principals", diagnostics)
  const resources = indexEntities(task.resources, "resources", diagnostics)
  const entries = indexEntities(task.entries, "entries", diagnostics)
  const obligationIds = indexEntities(task.obligations, "obligations", diagnostics)

  if (task.obligations.length === 0) {
    diagnostics.push({
      code: "empty-obligations",
      message: "At least one explicit authorization obligation is required before analysis can run.",
      path: "obligations",
      severity: "error",
    })
    return {
      task,
      status: "needs-input",
      runnableObligations: [],
      blockedObligations: [],
      diagnostics,
    }
  }

  const runnableObligations: CompiledAuthorizationObligation[] = []
  const blockedObligations: BlockedAuthorizationObligation[] = []

  task.obligations.forEach((obligation, obligationIndex) => {
    const principal = principals.values.get(obligation.principalId)
    const resource = resources.values.get(obligation.resourceId)
    const policySource = policies.values.get(obligation.policySourceId)
    let obligationBlockedBy: BlockedAuthorizationReason | undefined

    const referenceChecks = [
      {
        id: obligation.principalId,
        value: principal,
        index: principals,
        collection: "principal",
        path: `obligations.${obligationIndex}.principalId`,
      },
      {
        id: obligation.resourceId,
        value: resource,
        index: resources,
        collection: "resource",
        path: `obligations.${obligationIndex}.resourceId`,
      },
      {
        id: obligation.policySourceId,
        value: policySource,
        index: policies,
        collection: "policy source",
        path: `obligations.${obligationIndex}.policySourceId`,
      },
    ]

    for (const reference of referenceChecks) {
      const ambiguous = reference.index.duplicates.has(reference.id)
      if (!reference.value || ambiguous) {
        addReferenceDiagnostic(diagnostics, reference.path, reference.collection, reference.id, ambiguous)
        obligationBlockedBy = ambiguous ? "ambiguous-reference" : "invalid-reference"
      }
    }

    if (obligationIds.duplicates.has(obligation.id)) {
      obligationBlockedBy = "ambiguous-reference"
    }

    if (!obligationBlockedBy && policySource?.acceptance.status === "conflicted") {
      obligationBlockedBy = "policy-conflicted"
    } else if (!obligationBlockedBy && policySource?.acceptance.status === "unresolved") {
      obligationBlockedBy = "policy-unresolved"
    }

    obligation.entryIds.forEach((entryId, entryIndex) => {
      const entry = entries.values.get(entryId)
      const ambiguous = entries.duplicates.has(entryId)
      let blockedBy = obligationBlockedBy
      if (!entry || ambiguous) {
        addReferenceDiagnostic(
          diagnostics,
          `obligations.${obligationIndex}.entryIds.${entryIndex}`,
          "entry",
          entryId,
          ambiguous,
        )
        blockedBy = ambiguous ? "ambiguous-reference" : "invalid-reference"
      }

      const compiled: CompiledAuthorizationObligation = {
        id: `${obligation.id}::${entryId}`,
        authorObligationId: obligation.id,
        entryId,
        obligation,
        principal,
        resource,
        entry,
        policySource,
      }
      if (blockedBy) {
        blockedObligations.push({ ...compiled, blockedBy })
      } else {
        runnableObligations.push(compiled)
      }
    })
  })

  const status = runnableObligations.length > 0
    ? (blockedObligations.length > 0 ? "partial" : "ready")
    : "blocked"

  return { task, status, runnableObligations, blockedObligations, diagnostics }
}
