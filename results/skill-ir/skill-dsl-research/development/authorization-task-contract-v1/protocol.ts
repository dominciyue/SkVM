import { applyTaskChange, projectCurrentTask, AuthorizationTaskChangeV1Schema, type AuthorizationTaskAuthoringV1, type AuthorizationTaskChangeV1 } from "../../../../../src/benchmarks/authorization-dsl/authoring-task.ts"

export const caseIds = ["owui-file", "paperless-download", "memos-get-shared", "paperless-share-create"] as const
export const packageIds = ["memos-space-policy", "paperless-note-premise"] as const
export type QualityRoute = "markdown" | "dsl"
export type AuthorRoute = QualityRoute | "task-authoring"
export type TaskContract = "compatibility" | "current-v1"

export function qualityUnits(ids: readonly string[] = caseIds) {
  return ids.flatMap((caseId, caseIndex) => (["compatibility", "current-v1"] as const).flatMap((taskContract, contractIndex) =>
    (["markdown", "dsl"] as const).map((route, routeIndex) => ({
      id: `q${String(caseIndex * 4 + contractIndex * 2 + routeIndex + 1).padStart(2, "0")}`,
      caseId, route, taskContract,
    }))))
}

export function authorUnits(ids: readonly string[] = packageIds) {
  return ids.flatMap(packageId => (["markdown", "dsl", "task-authoring"] as const).flatMap(route =>
    (["original", "changed"] as const).map(version => ({ id: `${packageId}-${route}-${version}`, packageId, route, version }))))
}

export const ratingRules = {
  supported: "All material claims follow supplied source and public premises; accurate bounded unknown is supported only when every requested causal explanation is addressed.",
  incomplete: "No decisive false claim, but a necessary control, requested branch, policy comparison or explanation is missing.",
  unsupported: "A material source, premise, observed decision or policy comparison claim contradicts the public task or fixed source.",
  determinate: "The actual scenario and necessary explanation are answered with supported decisions.",
  conditional: "Every requested relevant branch is causally supported and unspecified actual truth remains explicit.",
  unresolved: "The requested outcome or required branch cannot be answered, even if uncertainty is faithful.",
  blocked: "No valid delivered analysis, including author, preparation, transport and completion-unknown dependencies; retains the planned denominator.",
  firstFinal: "Rate the archived first raw answer and final delivered artifact separately. A host summary never erases a wrong raw explanation.",
  isolation: "The evaluator oracle and ratings are read only after generation closes; no answer, rating or evaluator criterion enters a generation prompt.",
}

const publicInstruction = "Use the current declared policy and explicit premises. Trace decisive control and effect, distinguish unspecified from absent, and answer requested branches without inventing runtime facts."
const responseDetail = "Report source behavior and policy comparison separately; source-external store failure is not authorization."

/** Research-only projection of the public historical brief into the ordinary current-task contract. */
export function buildCurrentAuthorTasks(brief: any): { original: AuthorizationTaskAuthoringV1; changed: AuthorizationTaskAuthoringV1; change: AuthorizationTaskChangeV1; fieldOrigins: Record<string, string> } {
  const originalInput = {
    schemaVersion: "authorization-task-authoring/v1", request: brief.question,
    policy: { text: brief.originalPolicy, location: brief.policyLocationOriginal, revision: `${brief.id}-original`, acceptance: "accepted", reason: "Explicit public task requirement; assess the current declared policy." },
    publicInstruction,
    cases: brief.scenarios.map((scenario: any) => ({
      name: scenario.key, entry: brief.entry.entryKey, principal: { role: scenario.principal },
      resource: { type: brief.kind === "policy-change" ? "space membership" : "document" },
      relation: scenario.relation, operation: scenario.operation, expectation: brief.originalExpectations[scenario.key], boundary: "declared-entry",
      premises: [{ name: scenario.premiseId, statement: scenario.premise }],
      ...(brief.kind === "premise-change" ? { conditions: { "owner-present": { basis: "Whether a different owner is present; caller is not owner." } },
        branches: [{ name: "absent", assumptions: { "owner-present": false } }, { name: "other-present", assumptions: { "owner-present": true } }] } : { branches: [] }),
      responseDetails: [responseDetail],
    })),
  }
  const original = projectCurrentTask(originalInput)
  if (original.status !== "ready") throw new Error(`Public original brief is invalid: ${brief.id} ${JSON.stringify(original.diagnostics)}`)
  const changeInput = brief.kind === "policy-change" ? {
    schemaVersion: "authorization-task-change/v1", reason: brief.changeRequest,
    policy: { text: brief.changedPolicy, location: brief.policyLocationChanged, revision: `${brief.id}-changed`, acceptance: "accepted", reason: "Explicit changed public task requirement." },
    cases: brief.scenarios.map((scenario: any) => ({ name: scenario.key, expectation: brief.changedExpectations[scenario.key] })),
  } : {
    schemaVersion: "authorization-task-change/v1", reason: brief.changeRequest,
    request: brief.question.replace("The owner's presence is unspecified in the original task: distinguish absent from other-present where it changes authorization.",
      "A different user owns the document at entry; still answer the requested absent and other-present counterfactuals separately."),
    cases: brief.scenarios.map((scenario: any) => ({ name: scenario.key, premises: [{ name: scenario.premiseId, statement: scenario.changedPremise }] })),
  }
  const change = AuthorizationTaskChangeV1Schema.parse(changeInput)
  const changed = applyTaskChange(original.current, change)
  if (changed.status !== "ready") throw new Error(`Public changed brief is invalid: ${brief.id} ${JSON.stringify(changed.diagnostics)}`)
  return { original: original.current, changed: changed.current, change,
    fieldOrigins: { policy: "brief public requirement", cases: "brief scenarios, original expectations and premises", changed: "brief changeRequest and changed values", structure: "research adapter transcribed explicit facts" } }
}
