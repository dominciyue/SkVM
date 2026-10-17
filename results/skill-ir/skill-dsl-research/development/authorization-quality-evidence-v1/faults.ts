import path from "node:path"
import { base, repo, load, save, hash, relative } from "./study.ts"
import { projectProgramCallRelations } from "../../../../../src/task-dsl/authorization/program-obligations.ts"
import { executeResourceWorkflow } from "../../../../../src/task-dsl/authorization/resource-relations.ts"
import { checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { assessBehaviorTrace } from "../authorization-purpose-scoped-program-v1/behavior-assessment.ts"
import { finiteExpectation } from "./offline.ts"
import { question } from "../authorization-reusable-program-v1/cases.ts"
export async function verifyFaults() {
  const at = { path: "anonymous.py", startLine: 5, endLine: 5 }, truth = (binding: string) => ({ op: "truthy", language: "python", value: { binding } })
  const fixture: any = { resourceWorkflow: { inputs: [], steps: [{ id: "present", op: "value", value: { literal: false }, source: at }, { id: "needsCheck", op: "value", value: { literal: true }, source: at }, { id: "invoke", op: "external", name: "remote", arguments: { actor: { literal: 7 } }, when: { op: "all", args: [truth("present"), truth("needsCheck")] }, source: at }, { id: "result", op: "return", value: { literal: 1 }, source: at }] }, authoringTarget: { mode: "reusable", coverage: [{ id: "call", source: at, stepIds: ["invoke"], disposition: "implemented", call: { stepId: "invoke", activation: "conditional", activationDependencyIds: ["present", "needsCheck"], completion: "caught", resultUse: "ignored", reason: "Developer fixture tests structural activation; no source claim." } }] } }
  const broken = structuredClone(fixture); broken.resourceWorkflow.steps[2].when = truth("needsCheck")
  const good = projectProgramCallRelations(fixture)[0]!, bad = projectProgramCallRelations(broken)[0]!
  if (good.diagnostics.includes("activation-dependency-unconnected") || !bad.diagnostics.includes("activation-dependency-unconnected")) throw new Error("Outer removal not detected")
  const cleanRun = executeResourceWorkflow(fixture.resourceWorkflow, {}), brokenRun = executeResourceWorkflow(broken.resourceWorkflow, {})
  if (cleanRun.events.find(e => e.id === "invoke")?.outcome !== "skipped" || brokenRun.events.find(e => e.id === "invoke")?.outcome === "skipped") throw new Error("Activation fixture has no behavioral contrast")
  const rawFile = path.join(base, "authoring/automatic-program.json"), originalBytes = await Bun.file(rawFile).text(), raw = JSON.parse(originalBytes)
  const target = raw.resourceWorkflow.steps.find((s: any) => s.op === "external" && s.name === "ObjectPermissionChecker.has_perm")
  if (!target) throw new Error("No applicable resource call in selected raw")
  target.arguments.resource = { literal: 999999 }
  const mutant = path.join(base, "verification/mutations/misbound-resource.json"); await save(mutant, raw)
  const inputFile = path.join(base, "evaluation/selected/inputs/historical18-granted.json"), input = await load(inputFile)
  const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", mutant, { executionPolicy: "progressive" })
  const { traceExpected } = finiteExpectation(input.resourceInputs[question], input.externalAssumptions[question]), trace = assessBehaviorTrace(checked.executableContract?.resourceExecution, traceExpected)
  if (trace.pass || !trace.failures.includes("ordered-exact-external-calls")) throw new Error("Wrong resource not detected by independent trace expectation")
  if (hash(await Bun.file(rawFile).text()) !== hash(originalBytes)) throw new Error("Selected raw changed")
  const result = { providerCalls: 0, targetExecutions: 0, selectedRawSha256: hash(originalBytes), outer: { origin: "developer-authored-mechanism-fixture", reason: "Selected automatic A0 still omits the outer activation, so a removal counterfactual cannot be attributed to that raw.", before: good.diagnostics, after: bad.diagnostics, detected: true }, resource: { origin: "copy-of-selected-model-raw", mutant: relative(mutant), changedStep: target.id, independentTrace: trace, hostConditions: checked.executableContract?.resourceExecution?.conditions, interpretation: "Host exposes unmatched external fact; only independent source-grounded trace review identifies the wrong resource. No semantic proof is claimed." }, selectedRawUnchanged: true, stale: { reference: relative(path.join(base, "verification/portable.json")), pending: true } }
  const portable = await load(path.join(base, "verification/portable.json")).catch(() => undefined)
  if (portable) Object.assign(result.stale, { pending: false, oldReturnWithdrawn: portable.oldReturnWithdrawn, originalUnchanged: portable.mutation.originalUnchanged })
  await save(path.join(base, "verification/fault-injection.json"), result); return { outerDetected: true, resourceDetected: true, originalUnchanged: true }
}
if (import.meta.main) console.log(JSON.stringify(await verifyFaults()))
