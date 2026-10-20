import path from "node:path"
import { readFile } from "node:fs/promises"
import { executeResourceWorkflow } from "../../../src/task-dsl/authorization/resource-relations.ts"
import { base, load, save, hash } from "./evidence.ts"

// A concrete source-review counterexample, not target service execution.
const file = path.join(base, "automatic/G-final.json"), raw = await load(file)
const input = await load(path.join(base, "inputs/gitea-original.json"))
const facts = structuredClone(input.resourceInputs["create-issue"])
facts.errors.responseLoad = "injected-converter-LoadAttachments-error"
const execution = executeResourceWorkflow(raw.resourceWorkflow, facts)
if (execution.events.find(e => e.outcome === "rejected")?.id !== "response_load_completed" || execution.returned !== undefined)
  throw new Error("counterexample-no-longer-reproduces")
const sha256 = hash(await readFile(file))
const review = {
  task: "G", sha256, providerCalls: 0, businessWrites: 0, isolatedSourceTestExecutions: 0,
  sourceRef: "fc28937a8d772fe9e4025c9b5f24d5db4d86610b",
  scope: "Finite reader field handling and create/mentions/close/refetch order; no live execution or database commit proof.",
  counterexample: {
    id: "converter-load-error-still-returns-201", facts, execution,
    sourceExpected: { httpStatus: 201, payload: "empty api.Issue value (serialization fields not executed here)", reason: "toIssue catches LoadAttachments and other loader errors by returning &api.Issue{}; ToAPIIssue has no error return and the handler passes its value directly to ctx.JSON(StatusCreated,...)." },
    sourceBasis: ["services/convert/issue.go:32-48", "services/convert/issue.go:70-107", "routers/api/v1/repo/issue.go:646-652"],
    rawBasis: "automatic/G-final.json:768-789",
    discrepancy: "The raw rejects response_load_completed and claims no 201 response is established. This is false for the supplied responseLoad meaning, including a converter LoadAttachments error after successful refetch.",
    severity: "core response/error claim in the original consumer question"
  },
  supportedLocalFacts: [
    "Issue-read route admission differs from CanWrite-gated deadline/milestone/assignee/labels.",
    "Projects are passed outside the writer-only field branch.",
    "LoadPoster and blocking precede the transaction callback; mentions follow it; optional close precedes refetch and conversion."
  ],
  limitations: [
    "UnitAccessMode admin override and anonymous/everyone maps are not fully represented.",
    "Conjoined route guards do not establish exact middleware first-error precedence.",
    "Writer assignee name lookup, assignability and assignee blocking are incomplete.",
    "Guard/value effectStepIds are not external-call evidence; shared projection keeps effects unknown.",
    "No transaction durability or complete response serialization proof."
  ],
  independentReview: { permissionFields: "bt_g_permission_audit found no concrete counterexample within its bounded inspection, retained permission/middleware/assignee limits", effectsErrors: "bt_g_effect_audit identified converter counterexample; main directly reviewed all frozen raw and exact converter/handler source anchors, then reproduced finite rejection" },
  eligible: false,
  reason: "A known misleading response/error behavior affects the unchanged consumer question. Keep the chronological final raw untouched, retain AE-G in the planned denominator, and dispatch no AE-G model call. Reference consumers remain independent.",
  manualSemanticEdits: false
}
await save(path.join(base, "evaluation/G-source-review.json"), review)
await save(path.join(base, "automatic/G-eligibility.json"), { task: "G", sha256, eligible: false, scope: review.scope, reason: review.reason, sourceReview: "evaluation/G-source-review.json" })
console.log(JSON.stringify({ sha256, eligible: false, counterexample: review.counterexample.id }, null, 2))
