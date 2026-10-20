import { expect, test } from "bun:test"
import { executeResourceWorkflow } from "./resource-relations.ts"
import { projectProgramOutcome } from "./program-outcome.ts"

const source = { path: "anonymous.go", startLine: 1, endLine: 9, sha256: "a".repeat(64) }
const value = (id: string, v: any) => ({ id, op: "value", value: { literal: v }, source })
const guard = (id: string, pass: boolean, resource = 7) => ({ id, op: "guard", test: { op: "eq", left: { literal: pass }, right: { literal: true } }, principal: { literal: 2 }, resource: { literal: resource }, permission: "read", failure: "error", source })
const call = (id: string) => ({ id, op: "external", name: id, arguments: { actor: { literal: 2 }, object: { literal: 7 } }, source })
const relation = (kind: string, extra: any = {}) => ({ id: "r", source, stepIds: ["entry", "guard", "effect"], disposition: "implemented", relation: { kind, ...extra } })
function outcome(steps: any[], claim: any, assumptions: any[] = []) {
  const program = { resourceWorkflow: { inputs: [], steps, gaps: [] }, authoringTarget: { mode: "reusable", coverage: Array.isArray(claim) ? claim : [claim] } }
  const resourceExecution = executeResourceWorkflow(program.resourceWorkflow, {}, { externalAssumptions: assumptions })
  return projectProgramOutcome({ program, resourceExecution }) as any
}
const fact = (name: string) => ({ name, arguments: { actor: 2, object: 7 }, value: true, reason: "Supplied fake result" })
test("BT anonymous read: inactive entry or another object cannot protect the current effect", () => {
  const claim = relation("guard-effect", { entryStepId: "entry", guardStepId: "guard", effectStepId: "effect", principalArgument: "actor", resourceArgument: "object" })
  expect(outcome([value("entry", true), guard("guard", true), call("effect")], claim, [fact("effect")]).relations[0].status).toBe("consistent")
  expect(outcome([value("entry", false), guard("guard", true), call("effect")], claim, [fact("effect")]).relations[0].diagnostics).toContain("entry-inactive")
  expect(outcome([value("entry", true), guard("guard", true, 99), call("effect")], claim, [fact("effect")]).relations[0].diagnostics).toContain("guard-effect-resource-mismatch")
})
test("BT same denial does not erase store-before-rejection order", () => {
  const claim = { ...relation("ordered-prefix"), stepIds: ["store", "deny"] }
  const sourceOrder = outcome([call("store"), guard("deny", false)], claim, [fact("store")])
  const earlyDenial = outcome([guard("deny", false), call("store")], claim, [fact("store")])
  expect(sourceOrder.execution).toBe(earlyDenial.execution)
  expect(sourceOrder.relations[0].status).toBe("consistent")
  expect(earlyDenial.relations[0].diagnostics).toContain("required-prefix-event-missing:store")
})
test("BT an unrelated rejected guard cannot certify an unobserved relation tail", () => {
  const claim = { ...relation("ordered-prefix"), stepIds: ["store", "later"] }
  const out = outcome([call("store"), guard("unrelated", false), call("later")], claim, [fact("store")])
  expect(out.relations[0].status).toBe("unknown")
  expect(out.relations[0].diagnostics).toContain("order-tail-not-observed")
})
test("BT create then refetch failure preserves effect request, completion and unknown commit", () => {
  const claim = { ...relation("ordered-prefix", { effectStepIds: ["create"] }), stepIds: ["create", "created", "refetch", "readOK"] }
  const steps = [call("create"), guard("created", true), call("refetch"), guard("readOK", false)]
  const out = outcome(steps, claim, [fact("create"), fact("refetch")])
  expect(out.relations[0].effects[0]).toMatchObject({ stepId: "create", request: "observed", completion: "unknown", durableCommit: "unknown", targetExecution: false })
  expect(out.relations[0].firstStop).toBe("readOK")
  const dependent = { ...guard("created", true), test: { op: "eq", left: { binding: "create" }, right: { literal: true } } }
  const completion = { id: "create-completion", source, stepIds: ["create", "created", "refetch"], disposition: "implemented", call: { stepId: "create", activation: "always", completion: "required", completionGuardId: "created", completionMeaning: "finite-marker", successorStepIds: ["refetch"], resultUse: "ignored", reason: "Source-reviewed fake completion marker" } }
  const completed = outcome([steps[0], dependent, ...steps.slice(2)], [claim, completion], [fact("create"), fact("refetch")])
  expect(completed.relations[0].effects[0].completion).toBe("declared-finite-marker")
  expect(completed.relations[0].effects[0].durableCommit).toBe("unknown")
  const never = outcome([guard("readOK", false), ...steps.slice(0, 3)], claim)
  expect(never.relations[0].effects[0].request).toBe("not-observed")
})
test("BT missing execution, unread source and omitted entry stay named unknown", () => {
  const claim = relation("guard-effect", { entryStepId: "entry", guardStepId: "guard", effectStepId: "effect", principalArgument: "actor", resourceArgument: "object" })
  const raw = { authoringTarget: { coverage: [claim] } }
  expect((projectProgramOutcome({ program: raw }) as any).relations[0].diagnostics).toContain("execution-unavailable")
  const missing = outcome([guard("guard", true), call("effect")], claim, [fact("effect")]).relations[0]
  expect(missing.status).toBe("unknown")
  expect(missing.diagnostics).toContain("entry-evidence-missing")
  const unread = outcome([value("entry", true), guard("guard", true), call("effect")], { ...claim, source: { ...source, sha256: undefined } }, [fact("effect")]).relations[0]
  expect(unread.status).toBe("unknown")
  expect(unread.diagnostics).toContain("relation-source-unverified")
})
