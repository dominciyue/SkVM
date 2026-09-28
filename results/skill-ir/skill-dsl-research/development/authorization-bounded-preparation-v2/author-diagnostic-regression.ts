import { checkEditorStructure } from "../../../../../src/benchmarks/authorization-dsl/editor-support/schema.ts"
import { normalizeAuthorizationAuthoringInput } from "../../../../../src/benchmarks/authorization-dsl/authoring.ts"
import { root, json, save } from "./common.ts"
import path from "node:path"
const cases = []
for (const id of ["memos-space-policy-dsl-original", "paperless-note-source-dsl-original"]) {
  const first = await json(path.join(root, "author-attempts", `${id}.first.json`)), value = JSON.parse(first.response.text).assessment
  const old = normalizeAuthorizationAuthoringInput(value), full = checkEditorStructure(value)
  if (old.status !== "needs-input" || old.diagnostics.length !== 1 || full.valid || !full.diagnostics.some(d => d.path === "/request") || !full.diagnostics.some(d => d.path === "/policies")) throw new Error("Incomplete diagnostic counterexample did not reproduce")
  cases.push({ id, oldDiagnostics: old.diagnostics, completeStructuralDiagnostics: full.diagnostics })
}
await save(path.join(root, "author-diagnostic-regression.json"), { status: "reproduced", cases, providerCalls: 0, correctionLimit: 2, cause: "Research author guidance/diagnostics incomplete; no shared analysis contract change" })
process.stdout.write("Two incomplete author diagnostic counterexamples reproduced with zero provider calls.\n")
