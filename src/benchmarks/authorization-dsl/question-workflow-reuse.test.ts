import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { planInquiryReuse } from "./inquiry-reuse.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { compileExecutableContract } from "../../task-dsl/authorization/executable-contract.ts"

test("question workflow restores R0 evidence without a checked property or any R1 meaning", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "be-r0-")); await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n    return actor\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 2 })
  const input: any = { schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry", premises: [] }] } }
  const prior: any = { status: "completed", sourceFiles: tools.files, evidence: tools.evidence, sourceVerification: { valid: true }, final: { oldAnswer: "MUST_NEVER_RESTORE" }, domain: { closed: true } }
  const options: any = { currentInput: input, previousInput: input, previousRun: prior, previousSessionId: "previous", currentFiles: tools.files, currentStructure: tools.structure, currentMethod: "D1", previousMethod: "D1", currentStrategy: "question-checked-v1", previousStrategy: "question-checked-v1", currentModel: "gpt-5.6-sol", previousModel: "gpt-5.6-sol" }
  const plan: any = planInquiryReuse(options)
  expect(plan.status).toBe("reusable")
  expect(plan.info.layers.R0.available).toBe(true); expect(plan.info.layers.R1.available).toBe(false); expect(plan.info.layers.R2.available).toBe(false)
  expect(plan.seed.evidence).toHaveLength(1); expect(plan.seed.delta.rules).toEqual([])
  expect(JSON.stringify(plan.seed)).not.toContain("MUST_NEVER_RESTORE")
  const changed = structuredClone(input); changed.inquiry.questions[0].premises = [{ text: "actor is absent", origin: "user" }]
  expect(planInquiryReuse({ ...options, currentInput: changed }).status).toBe("reusable")
  expect(planInquiryReuse({ ...options, previousRun: { ...prior, status: "completion-unknown" } }).status).toBe("needs-fresh-analysis")
})

test("editing one persisted program retains independently compiled source meaning for another question", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bf-independent-reuse-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n    return helper(actor)\n\ndef helper(who):\n    return True\n\ndef independent(actor):\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 8 })
  const input: any = { schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: ".", allowedPaths: ["app.py"], inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", premises: [] }, { id: "other", request: "Inspect independent", premises: [] }] } }
  const at = (startLine: number, endLine: number, text?: string) => ({ path: "app.py", startLine, endLine, ...(text ? { text } : {}) })
  const declaration = (startLine: number, endLine: number, parameter: string, statements: any[]) => ({ schemaVersion: "authorization-question-declaration/v1", source: at(startLine, endLine), statements: [{ kind: "object", expression: parameter, as: "principal", because: "Actual formal" }, ...statements] })
  const contract = (questionId: string, sourceDeclarations: any[]) => ({ schemaVersion: "authorization-executable-contract/v1", id: questionId, scope: { kind: "function-contract", questionId, root: sourceDeclarations[0].source, upstream: [] }, sourceDeclarations, queries: [], assumptions: [] })
  const program = compileAuthorizationInquiry(input.inquiry)
  const original = contract("q", [declaration(1, 2, "actor", [{ kind: "dependency", at: at(2, 2, "helper(actor)"), because: "Actual call" }, { kind: "statement", at: at(2, 2, "return helper(actor)"), because: "Actual return" }]), declaration(4, 5, "who", [{ kind: "statement", at: at(5, 5, "return True"), because: "Actual return" }])])
  const independent = contract("other", [declaration(7, 8, "actor", [{ kind: "statement", at: at(8, 8, "return False"), because: "Actual return" }])])
  const first = await compileExecutableContract(original, { tools, program }), other = await compileExecutableContract(independent, { tools, program })
  expect(first.diagnostics).toEqual([]); expect(other.diagnostics).toEqual([])
  if (!("sourceMaterials" in first) || !("sourceMaterials" in other)) throw new Error("Missing compiled fixture")
  const prior: any = { status: "completed", sourceFiles: tools.files, evidence: tools.evidence, sourceVerification: { valid: true }, domain: { closed: true, executableContract: { program: original }, sourceMaterials: { ...first.sourceMaterials, materials: [...first.sourceMaterials.materials, ...other.sourceMaterials.materials] }, slice: { bindings: [], policyRules: [] } } }
  const planned: any = planInquiryReuse({ currentInput: input, previousInput: input, previousRun: prior, previousSessionId: "previous", currentFiles: tools.files, currentStructure: tools.structure, currentMethod: "D1", previousMethod: "D1", currentStrategy: "question-checked-v1", previousStrategy: "question-checked-v1", currentModel: "gpt-5.6-sol", previousModel: "gpt-5.6-sol", domainProgram: { previousSha256: "original-bytes", currentSha256: "edited-bytes" } })
  expect(planned.status).toBe("reusable")
  expect(planned.seed.semanticUnits.map((u: any) => u.questionId)).toEqual(["other"])
  expect(planned.info.layers.R1.retainedMaterials).toBe(1)
  expect(planned.info.invalidatedMaterials).toHaveLength(2)
  expect(planned.info.layers.R2.available).toBe(false)
})

test("changed source bytes retain an unrelated file's material and withdraw pinned resource values", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bj-source-reuse-"))
  // Keep the complete function owner distinct from the whole-module span.
  await writeFile(path.join(sourceRoot, "changed.py"), "marker = True\n\ndef local(actor):\n    return True\n")
  await writeFile(path.join(sourceRoot, "independent.py"), "marker = True\n\ndef other(actor):\n    return False\n")
  const context = { sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["changed.py", "independent.py"], structure: true, controlSemantics: "finite-control/v1" as const, propertyDirected: true, questionDirected: true }
  const tools = await createInquiryTools(context)
  for (const file of context.allowedPaths) await tools.execute("source_read", { path: file, startLine: 1, endLine: 4 })
  const input: any = { schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: ".", allowedPaths: context.allowedPaths, inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect the first helper", premises: [] }, { id: "other", request: "Retain independent helper", premises: [] }] } }
  const at = (file: string) => ({ path: file, startLine: 3, endLine: 4 })
  const contract = (questionId: string, file: string, resourceWorkflow?: any) => ({ schemaVersion: "authorization-executable-contract/v1", id: questionId, scope: { kind: "function-contract", questionId, root: at(file), upstream: [] }, sourceDeclarations: [{ schemaVersion: "authorization-question-declaration/v1", source: at(file), statements: [{ kind: "object", expression: "actor", as: "principal", because: "Actual parameter" }] }], queries: [], assumptions: [], ...(resourceWorkflow ? { resourceWorkflow } : {}) })
  const program = compileAuthorizationInquiry(input.inquiry)
  const raw = contract("q", "changed.py", { inputs: [], steps: [
    { id: "independent", op: "value", value: { literal: 31 }, source: at("independent.py") },
    { id: "decisive", op: "value", value: { literal: true }, source: at("changed.py") },
    { id: "result", op: "return", value: { ref: "decisive" }, source: at("changed.py") },
  ] })
  const first = await compileExecutableContract(raw, { tools, program, executionPolicy: "progressive" })
  const independent = await compileExecutableContract(contract("other", "independent.py"), { tools, program })
  if (!("sourceMaterials" in first) || !("sourceMaterials" in independent)) throw new Error(JSON.stringify({ first: first.diagnostics, independent: independent.diagnostics }))
  expect(first.resourceExecution!.returned).toBe(true)
  const prior: any = { status: "completed", sourceFiles: tools.files, evidence: tools.evidence, sourceVerification: { valid: true }, domain: { closed: true, executableContract: { program: first.contract }, sourceMaterials: { ...first.sourceMaterials, materials: [...first.sourceMaterials.materials, ...independent.sourceMaterials.materials] }, slice: { bindings: [], policyRules: [] } } }
  await writeFile(path.join(sourceRoot, "changed.py"), "marker = True\n\ndef local(actor):\n    return False\n")
  const current = await createInquiryTools(context)
  const planned: any = planInquiryReuse({ currentInput: input, previousInput: input, previousRun: prior, previousSessionId: "previous", currentFiles: current.files, currentStructure: current.structure, currentMethod: "D1", previousMethod: "D1", currentStrategy: "question-checked-v1", previousStrategy: "question-checked-v1", currentModel: "gpt-5.6-sol", previousModel: "gpt-5.6-sol" })
  expect(planned.info.change).toBe("source-changed")
  expect(planned.seed.semanticUnits.map((u: any) => u.questionId)).toEqual(["other"])
  expect(planned.info.invalidatedMaterials).toHaveLength(1)
  expect(planned.info.invalidatedMaterials[0].reasons.join(" ")).toContain("changed-or-unavailable")
  expect(planned.info.layers.R2.available).toBe(false)
  current.restoreEvidence(planned.seed.evidence)
  await current.execute("source_read", { path: "changed.py", startLine: 1, endLine: 4 })
  const stale = await compileExecutableContract(first.contract, { tools: current, program, executionPolicy: "progressive" })
  if (!("resourceExecution" in stale)) throw new Error("Missing stale resource diagnostic")
  expect(stale.resourceExecution!.returned).toBeUndefined()
  expect(stale.resourceExecution!.values.independent).toBe(31)
  expect(stale.resourceExecution!.gaps).toContain("resource-source-stale:changed.py")
})
