import assert from "node:assert/strict"
import path from "node:path"
import { base, repo, load, save, hash } from "./study.ts"
import { executeResourceWorkflow } from "../../../../../src/task-dsl/authorization/resource-relations.ts"
import { projectProgramOutcome } from "../../../../../src/task-dsl/authorization/program-outcome.ts"
import { normalizeFields } from "../authorization-source-program-consistency-v1/study.ts"
import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
import { assessScopedTrace } from "../authorization-call-semantics-v1/scope-assessment.ts"
import { readFile } from "node:fs/promises"
const bq = path.resolve(base, "../authorization-source-program-consistency-v1"), raw = await load(path.join(bq, "authoring/automatic-program.json")), cases = await load(path.join(bq, "evaluation/cases.json")), expected = await load(path.join(bq, "evaluation/expectations.json"))
const sha = hash(await readFile(path.join(bq, "authoring/automatic-program.json"))), mapping = (await load(path.join(bq, "evaluation/reviewed-mappings.json")))[sha]
const rows = cases.map((c: any) => {
  const q = "requested-document-and-returned-file", e = expected.find((e: any) => e.name === c.name && e.group === c.group)
  const actual = executeResourceWorkflow(raw.resourceWorkflow, c.input.resourceInputs[q], { progressive: true, externalAssumptions: c.input.externalAssumptions[q] })
  return { name: c.name, fields: assessFiniteCase(e.expected, { ...actual, returned: normalizeFields(actual.returned, mapping) }).finiteMachineMatch, local: assessScopedTrace(actual, e.traceExpected).local.pass, outcome: projectProgramOutcome({ program: raw, resourceExecution: actual }).execution }
})
assert.equal(rows.length, 35); assert(rows.every((r: any) => r.fields && r.local))
const share = await load(path.resolve(base, "../authorization-quality-evidence-v1/authoring/sharelink-automatic-program.json")), shareRows=[]
for (const name of ["allowed", "denied", "missing-principal", "unknown-grants", "wrong-actor", "wrong-resource"]) {
  const input = await load(path.join(repo, `examples/authorization-assessment/share-create-workflow/inputs/${name}.json`)), q = Object.keys(input.resourceInputs)[0]!
  const execution = executeResourceWorkflow(share.resourceWorkflow, input.resourceInputs[q], { progressive: true, externalAssumptions: input.externalAssumptions?.[q] ?? [] })
  shareRows.push({ name, execution, outcome: projectProgramOutcome({ program: share, resourceExecution: execution }) })
}
await save(path.join(base, "verification/compatibility.json"), { providerCalls: 0, download: { sha256: sha, rows }, sharelink: { scope: "existing model raw compatibility only; not a new success or complete transfer", rows: shareRows } })
console.log(JSON.stringify({ download: "35/35 fields and local trace", sharelinkInputs: shareRows.length, providerCalls: 0 }))
