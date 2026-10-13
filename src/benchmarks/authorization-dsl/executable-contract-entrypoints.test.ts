import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationInquiryCli } from "../../cli/authorization-inquiry.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry, compareLocalInquiry, saveLocalInquiryCheck } from "./inquiry-local.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import { createProgramDraft } from "../../task-dsl/authorization/resource-program-draft.ts"
import { questionWorkflowDefinitions, RESOURCE_PROGRAM_TEMPLATE } from "./question-workflow-wire.ts"
test("native author inspects an empty draft then reads and submits its first program", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive" })
  try {
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Retain the original duty" }] } })
    const empty = JSON.parse((await runtime.execute({ id: "empty", name: "authorization_program_details", arguments: { view: "draft" } })).output)
    expect(empty.events).toEqual([])
    expect(empty.steps).toEqual([])
    await runtime.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    await runtime.execute({ id: "first", name: "authorization_program", arguments: { ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "helper", op: "external", name: "perform", arguments: {}, source: at(4, 8) }, { id: "result", op: "return", value: { literal: 7 }, source: at(8) }] } } })
    expect(runtime.report().domain!.executableContract!.resourceExecution!.returned).toBe(7)
    const context: any = await runtime.accountContext(false)
    expect(context.authoring.firstDraftToolUnit).toBe(4)
    expect(context.authoring.changes.at(-1).returned).toBe(7)
    expect(context.authoring.externalBoundaries[0].kind).toBe("source-visible-unwritten")
    expect(context.authoring.externalBoundaries[0].candidates[0].read).toBe(true)
  } finally { await runtime.close() }
})
test("fresh account author cannot receive evaluator or reference bytes from its sibling workspace", async () => {
  const f = await contractFiles(), marker = "BJ_PRIVATE_EVALUATION_728491"
  await mkdir(path.join(f.root, "evaluation")); await writeFile(path.join(f.root, "evaluation/expected.json"), JSON.stringify({ marker }))
  await writeFile(path.join(f.root, "reference-program.json"), JSON.stringify({ marker }))
  let packetChecked = false
  const report: any = await executeLocalInquiryRun({ inputFile: f.inputFile, outDir: path.join(f.root, "isolation-out"), purpose: "isolation-author", attempt: "first", model: "gpt-5.6-sol", strategy: "question-checked-v1", harness: "codex-account", programMode: "edit", executionPolicy: "progressive", accountTransportFactory: contractConsumer(() => {}, { tool: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Retain original duty" }] } }, packet => {
    packetChecked = true
    expect(JSON.stringify(packet)).not.toContain(marker)
    expect(JSON.stringify(packet)).not.toContain("reference-program.json")
  }), execution: { sessionTimeoutMs: 5000 } })
  expect(report.status).toBe("completed")
  expect(report.telemetry.account.turns[0].lifecycle.purpose).toBe("isolation-author")
  expect(packetChecked).toBe(true)
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit" })
  try {
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Retain duty" }] } })
    const reply = await runtime.execute({ id: "excluded", name: "source_read", arguments: { path: "../evaluation/expected.json", startLine: 1, endLine: 1 } })
    expect(reply.output).not.toContain(marker)
    expect(JSON.stringify(await runtime.accountContext(false))).not.toContain(marker)
    expect(runtime.report().sourceFiles.map(file => file.path)).toEqual(["app.py"])
  } finally { await runtime.close() }
})
test("native early checkpoint keeps source reads available and occurs once after twelve exploration units", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", maxToolCalls: 32 })
  try {
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Retain the original duty" }] } })
    for (let unit = 1; unit <= 12; unit++) await runtime.execute({ id: `read-${unit}`, name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    const first: any = await runtime.accountContext(false)
    expect(first.authoring.checkpoint.explorationUnits).toBe(12)
    expect(first.authoring.checkpoint.completeSources[0].symbol).toContain("local")
    expect(first.authoring.remainingActions).toBeGreaterThan(0)
    const after = await runtime.execute({ id: "continue-read", name: "source_read", arguments: { path: "app.py", startLine: 4, endLine: 8 } })
    expect(after.exitCode).toBe(0)
    const next: any = await runtime.accountContext(false)
    expect(next.authoring.checkpoint).toEqual(first.authoring.checkpoint)
    expect(next.remainingDuties.map((q: any) => q.questionId)).toEqual(["q", "other"])
  } finally { await runtime.close() }
})
test("explicit same-operation binding survives check native patch previous and current-input recomputation", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.inquiry = { ...input.inquiry, schemaVersion: "authorization-inquiry/v2", operations: [{ id: "operation", request: "Inspect the local operation" }], questions: input.inquiry.questions.map((q: any) => ({ ...q, operationId: "operation", intent: "behavior" })) }
  input.resourceInputs = { q: { item: { id: 17 } } }
  input.externalAssumptions = { q: [{ name: "store", arguments: { key: 17 }, value: true, reason: "Current scenario fact" }] }
  input.contractInputs = { q: { actor: { allowed: false } }, other: { actor: { allowed: true } } }
  const program = { ...f.contract, queries: [], scope: { ...f.contract.scope, questionId: "other" }, inputBinding: { questionId: "q" }, resourceWorkflow: { inputs: ["item"], steps: [
    { id: "store", op: "external", name: "store", arguments: { key: { field: { of: { ref: "item" }, key: "id" } } }, source: at(8) },
    { id: "permitted", op: "guard", test: { op: "truthy", language: "python", value: { binding: "store" } }, failure: "denied", source: at(5) },
    { id: "result", op: "return", value: { field: { of: { ref: "item" }, key: "id" } }, source: at(8) },
  ] } }
  await writeFile(f.inputFile, JSON.stringify(input)); await writeFile(f.domainProgramFile, JSON.stringify(program))
  const checked: any = await checkAuthorizationInquiry(f.inputFile, "D1", "question-checked-v1", f.domainProgramFile, { executionPolicy: "progressive" })
  expect(checked.status, JSON.stringify(checked.diagnostics)).toBe("valid")
  expect(checked.executableContract.resourceExecution.returned).toBe(17)
  expect(checked.executableContract.conditions).toEqual(input.contractInputs.other)
  expect(checked.executableContract.inputBinding.inputQuestionId).toBe("q")
  const native = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", domainProgramFile: f.domainProgramFile, programMode: "edit", executionPolicy: "progressive" })
  try {
    expect(native.argumentDiagnostics({ id: "program", name: "authorization_program", arguments: program })).toBeUndefined()
    expect(native.report().domain!.executableContract!.resourceExecution!.returned).toBe(17)
    const initial: any = native.report().domain!.executableContract!
    await native.execute({ id: "revoke", name: "authorization_program_patch", arguments: { baseRevision: initial.currentDraft.revision, inputBinding: null, upsertSteps: [] } })
    expect(native.report().domain!.executableContract!.resourceExecution!.returned).toBeUndefined()
    const unbound: any = native.report().domain!.executableContract!
    await native.execute({ id: "bind", name: "authorization_program_patch", arguments: { baseRevision: unbound.currentDraft.revision, inputBinding: { questionId: "q" }, upsertSteps: [] } })
    expect(native.report().domain!.executableContract!.resourceExecution!.returned).toBe(17)
  } finally { await native.close() }
  const common = { inputFile: f.inputFile, outDir: path.join(f.root, "binding-out"), model: "gpt-5.6-sol", strategy: "question-checked-v1" as const, harness: "codex-account" as const, programMode: "edit" as const, executionPolicy: "progressive" as const, execution: { sessionTimeoutMs: 5000 } }
  const consumer = (value: number) => contractConsumer(reply => {
    expect(reply.toolResult.executableContract.resourceExecution.returned).toBe(value)
    expect(reply.toolResult.executableContract.conditions).toEqual(input.contractInputs.other)
  })
  const first: any = await executeLocalInquiryRun({ ...common, domainProgramFile: f.domainProgramFile, accountTransportFactory: consumer(17) })
  expect(first.status).toBe("completed")
  input.resourceInputs.q.item.id = 19; input.externalAssumptions.q[0].arguments.key = 19
  await writeFile(f.inputFile, JSON.stringify(input))
  const next: any = await executeLocalInquiryRun({ ...common, previous: first.sessionPath, accountTransportFactory: consumer(19) })
  expect(next.status).toBe("completed")
  expect(next.reuse.answerReused).toBe(false)
  const inspected = await inspectLocalInquiry(next.sessionPath)
  expect(inspected.execution.inputBinding.inputQuestionId).toBe("q")
  expect(await readFile(path.join(next.sessionPath, "execution.md"), "utf8")).toContain('"inputQuestionId": "q"')
})
test("native and structured author input binding exposes a real question mismatch without injecting its facts", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.resourceInputs = { q: { item: { id: 17 } } }
  const program = { ...f.contract, scope: { ...f.contract.scope, questionId: "other" }, resourceWorkflow: { inputs: ["item"], steps: [{ id: "result", op: "return", value: { binding: "item.id" }, source: at(8) }] } }
  await writeFile(f.inputFile, JSON.stringify(input)); await writeFile(f.domainProgramFile, JSON.stringify(program))
  const native = await createNativeInquiryRuntime({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit", programContext: "compact", executionPolicy: "progressive" })
  let expected: any
  try {
    const context: any = await native.accountContext(false)
    expected = context.authoring.inputBindings
    expect(expected.questionId).toBe("other")
    expect(expected.missingDeclaredNames).toEqual(["item"])
    expect(expected.suppliedScopes[0].questionId).toBe("q")
    expect(native.report().domain!.executableContract!.resourceExecution!.inputs).toEqual({})
    expect(native.report().domain!.executableContract!.resourceExecution!.returned).toBeUndefined()
  } finally { await native.close() }
  let count = 0, structured: any
  const provider: any = { name: "input-binding-mock", async complete(params: any) {
    const text = params.messages.map((m: any) => m.content).join("\n")
    const current = JSON.parse(text.split("Current local explanation context: ").at(-1)!.split("\n\nRemaining dispatches:")[0]!)
    structured = current.authoring.inputBindings
    const action = count++ === 0 ? { kind: "program", name: "authorization_program_details", arguments: { stepId: "result" } } : { kind: "final", schemaVersion: "authorization-focused-result/v1", focusId: current.focus.id, answers: ["The chosen question has no item input.", "The other original duty remains unresolved."].map(explanation => ({ explanation, missing: [{ kind: "source-gap", detail: "Current input binding is unresolved" }] })), scope: "Local fixture only" }
    return { text: "", toolCalls: [{ id: `binding-${count}`, name: params.tools[0].name, arguments: action }], stopReason: "tool_use", tokens: emptyTokenUsage(), durationMs: 0 }
  }, async completeWithToolResults() { throw new Error("unused") } }
  const run = await runAuthorizationInquiry({ ...input, sourceRoot: path.join(f.root, "source"), provider, method: "D1", strategy: "question-checked-v1", domainProgram: program, programMode: "edit", executionPolicy: "progressive", programContext: "compact", maxDispatches: 4 })
  expect(structured).toEqual(expected)
  expect(run.domain!.executableContract!.resourceExecution!.inputs).toEqual({})
  expect(run.domain!.executableContract!.resourceExecution!.returned).toBeUndefined()
})
test("ordinary account rejects a malformed workflow without changing the archived adopted original", async () => {
  const f = await contractFiles(), invalid = { ...f.contract, resourceWorkflow: { inputs: [], steps: { broken: true } } }
  const report: any = await executeLocalInquiryRun({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir: path.join(f.root, "malformed-archive"), model: "gpt-5.6-sol", strategy: "question-checked-v1", harness: "codex-account", programMode: "edit", executionPolicy: "progressive", accountTransportFactory: contractConsumer(reply => expect(reply.toolResult.code).toBe("account-tool-arguments-invalid"), { tool: "authorization_program", arguments: invalid }), execution: { sessionTimeoutMs: 5000 } })
  const inspected = await inspectLocalInquiry(report.sessionPath)
  expect(inspected.execution.currentDraft.raw).toEqual(f.contract)
  expect(inspected.execution.adoptedDraft.raw).toEqual(f.contract)
  expect(await readFile(path.join(report.sessionPath, "execution.md"), "utf8")).toContain("Current raw draft")
})
test("advertised author template provides a complete declaration envelope and executes after source substitution", async () => {
  const f = await contractFiles(), template: any = structuredClone(RESOURCE_PROGRAM_TEMPLATE)
  expect(template.sourceDeclarations[0].source).toBeDefined()
  expect(template.sourceDeclarations[0].statements).toEqual([])
  expect(questionWorkflowDefinitions("question-checked-v1").find(t => t.name === "authorization_program")!.description).toContain(JSON.stringify(RESOURCE_PROGRAM_TEMPLATE))
  template.scope.questionId = "q"; template.scope.root = at(1, 2)
  template.sourceDeclarations[0].source = at(1, 2)
  template.resourceWorkflow = { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 7 }, source: at(8) }] }
  await writeFile(f.domainProgramFile, JSON.stringify(template))
  const check: any = await checkAuthorizationInquiry(f.inputFile, "D1", "question-checked-v1", f.domainProgramFile, { executionPolicy: "progressive" })
  expect(check.status).toBe("valid")
  expect(check.executableContract.resourceExecution.returned).toBe(7)
  expect(check.executableContract.evaluation.questions[1].properties).toEqual([])
})
test("strict ordinary entry accepts a runnable program with an unreachable-step warning", async () => {
  const f = await contractFiles()
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 7 }, source: at(8) }, { id: "late", op: "guard", test: { op: "eq", left: { literal: 1 }, right: { literal: 2 } }, failure: "denied", source: at(5) }] } }))
  const checked = await checkAuthorizationInquiry(f.inputFile, "D1", "question-checked-v1", f.domainProgramFile)
  expect(checked.status).toBe("valid")
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", domainProgramFile: f.domainProgramFile, programMode: "edit" })
  try { expect(runtime.report().domain!.executableContract!.resourceExecution!.returned).toBe(7) } finally { await runtime.close() }
})
test("ordinary incomplete author session archives its raw draft and remaining duties without an active program", async () => {
  const f = await contractFiles(); let count = 0
  const invalid = { ...f.contract, scope: { ...f.contract.scope, questionId: "missing" }, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { bad: true }, source: at(8) }] } }
  const provider: any = { name: "draft-archive", async complete(params: any) {
    const n = count++
    if (n > 1) throw new Error("mock-interrupted-after-draft")
    const arguments_ = n === 0 ? { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Original duty still needs investigation" }] } : { kind: "program", name: "authorization_program", arguments: invalid }
    return { text: "", toolCalls: [{ id: `draft-${n}`, name: params.tools[0].name, arguments: arguments_ }], stopReason: "tool_use", tokens: emptyTokenUsage(), durationMs: 0 }
  }, async completeWithToolResults() { throw new Error("unused") } }
  const report: any = await executeLocalInquiryRun({ inputFile: f.inputFile, outDir: path.join(f.root, "draft-out"), model: "mock", strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", providerFactory: () => provider, execution: { maxDispatches: 8 } })
  const inspected = await inspectLocalInquiry(report.sessionPath)
  expect(inspected.execution.schemaVersion).toBe("authorization-execution/v2")
  expect(inspected.execution.currentDraft.raw).toEqual({ ...invalid, resourceWorkflow: { ...invalid.resourceWorkflow, gaps: [] } })
  expect(inspected.execution.finalRevision).toBeUndefined()
  expect(inspected.execution.remainingDuties.map((q: any) => q.questionId)).toEqual(["q", "other"])
  expect(await readFile(path.join(report.sessionPath, "execution.md"), "utf8")).toContain("Current raw draft")
})
test("native recovery restores the raw author draft after task preparation creates the runtime", async () => {
  const f = await contractFiles(), draft = createProgramDraft({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 7 }, source: at(8) }] } })
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", reuse: { info: {} as any, seed: { delta: { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }, evidence: [], programDraft: draft } } })
  try {
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Original duty remains" }] } })
    const context: any = await runtime.accountContext(false)
    expect(context.authoring.draftRevision).toBe(draft.revision)
    expect(runtime.report().domain!.programDraft.currentDraft).toEqual(draft)
    await runtime.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    await runtime.execute({ id: "patch", name: "authorization_program_patch", arguments: { baseRevision: draft.revision, upsertSteps: [{ id: "result", op: "return", value: { literal: 19 }, source: at(8) }] } })
    expect(runtime.report().domain!.executableContract!.resourceExecution!.returned).toBe(19)
  } finally { await runtime.close() }
})

test("structured author uses program then ordered patch then details and delivers all original duties", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8")); let count = 0
  input.inquiry.questions[1].properties = [{ id: "remaining", kind: "effect-reachability", requirement: input.inquiry.questions[1].request }]
  input.inquiry = { ...input.inquiry, schemaVersion: "authorization-inquiry/v2", operations: [{ id: "operation", request: "Inspect local operation" }], questions: input.inquiry.questions.map((q: any) => ({ ...q, operationId: "operation", intent: "behavior" })) }
  input.resourceInputs = { q: { item: { id: 7 } } }
  const value = { id: "value", op: "value", value: { field: { of: { ref: "item" }, key: "id" } }, source: at(8) }
  const initial = { ...f.contract, scope: { ...f.contract.scope, questionId: "other" }, queries: [], resourceWorkflow: { inputs: ["item"], steps: [value, { id: "result", op: "return", value: { ref: "value" }, source: at(8) }] } }
  const contexts: any[] = []
  const provider: any = { name: "ordered-author", async complete(params: any) {
    const text = params.messages.map((m: any) => m.content).join("\n"), n = count++
    const current = JSON.parse(text.split("Current local explanation context: ").at(-1)!.split("\n\nRemaining dispatches:")[0]!)
    contexts.push(current)
    const revision = current.authoring?.draftRevision
    const action = n === 0 ? { kind: "program", name: "authorization_program_details", arguments: { view: "draft" } } : n === 1 ? { kind: "tool", calls: [{ name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } }] } : n === 2 ? { kind: "program", name: "authorization_program", arguments: initial } : n === 3 ? { kind: "program", name: "authorization_program_patch", arguments: { baseRevision: revision, inputBinding: { questionId: "q" }, upsertSteps: [] } } : n === 4 ? { kind: "program", name: "authorization_program_patch", arguments: { baseRevision: revision, upsertSteps: [{ id: "permission", op: "guard", test: { op: "eq", left: { literal: 1 }, right: { literal: 2 } }, failure: "denied", source: at(5) }], stepOrder: ["value", "permission", "result"] } } : n === 5 ? { kind: "program", name: "authorization_program_details", arguments: { view: "draft", expectedRevision: revision } } : { kind: "final", schemaVersion: "authorization-focused-result/v1", focusId: current.focus.id, answers: ["Finite guard rejected; source meanings remain unreviewed.", "Other original duty remains unresolved."].map(explanation => ({ explanation, missing: [{ kind: "source-gap", detail: "Original source duty still needs investigation" }] })), scope: "Local fixture only" }
    return { text: "", toolCalls: [{ id: `ordered-${n}`, name: params.tools[0].name, arguments: action }], stopReason: "tool_use", tokens: emptyTokenUsage(), durationMs: 0 }
  }, async completeWithToolResults() { throw new Error("unused") } }
  const run = await runAuthorizationInquiry({ ...input, sourceRoot: path.join(f.root, "source"), provider, method: "D1", strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", programContext: "compact", maxDispatches: 11 })
  expect(contexts[1].authoring.goal).toContain("Continue authoring")
  expect(run.wireFailures).toEqual([])
  expect(contexts[3].authoring.inputBindings.missingDeclaredNames).toEqual(["item"])
  expect(contexts[4].authoring.computed.returned).toBe(7)
  expect(run.domain!.executableContract!.resourceExecution!.termination).toBe("denied")
  expect(run.domain!.executableContract!.resourceExecution!.events.map(e => e.id)).toEqual(["value", "permission"])
  const details: any[] = run.steps.filter(s => s.kind === "program" && (s.value as any).name === "authorization_program_details")
  expect(details[0].value.output.events).toEqual([])
  expect(details[1].value.output.events).toHaveLength(2)
  expect((run.final as any).questions.map((q: any) => q.questionId)).toEqual(["q", "other"])
  const loop: any = run.domain!.executableContract
  expect(loop.authorLoop.firstDraftToolUnit).toBe(3)
  expect(loop.authorLoop.patchCount).toBe(2)
})
test("structured provider can patch a draft and request actual compact program details", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8")); let count = 0
  const program = { ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 7 }, source: at(8) }] } }
  const provider: any = { name: "program-mock", async complete(params: any) {
    const text = params.messages.map((m: any) => m.content).join("\n"), n = count++
    const revision = /"draftRevision":"([a-f0-9]+)"/.exec(text)?.[1]
    const value = n === 0 ? { kind: "program", name: "authorization_program_patch", arguments: { baseRevision: revision, upsertSteps: [{ id: "result", op: "return", value: { literal: 19 }, source: at(8) }] } } : { kind: "program", name: "authorization_program_details", arguments: { stepId: "result" } }
    if (n >= 2) throw new Error("mock-stop-after-details")
    return { text: "", toolCalls: [{ id: `p${n}`, name: params.tools[0].name, arguments: value }], stopReason: "tool_use", tokens: emptyTokenUsage(), durationMs: 0 }
  }, async completeWithToolResults() { throw new Error("unused") } }
  const run = await runAuthorizationInquiry({ ...input, sourceRoot: path.join(f.root, "source"), provider, method: "D1", strategy: "question-checked-v1", domainProgram: program, programMode: "edit", executionPolicy: "progressive", programContext: "compact", maxDispatches: 12 })
  expect(run.wireFailures.filter(failure => failure.sequence <= 2)).toHaveLength(0)
  expect(run.domain!.executableContract!.resourceExecution!.returned).toBe(19)
  const details: any = run.steps.find((s: any) => s.kind === "program" && s.value.name === "authorization_program_details")
  expect(details.value.output.events[0].outputs.value).toBe(19)
  expect(run.requests[1]!.params.messages.map(m => m.content).join("\n")).not.toContain('"currentDraft":{"revision"')
})
const source = "def local(actor, target):\n    return perform(actor, target)\n\ndef perform(who, item):\n    if not who.allowed:\n        return False\n    item.sent = True\n    return item\n"
test("public account author continues twice with one runtime budget and archives every answer and draft before reply", async () => {
  const { runCodexAccountInquiry } = await import("../../adapters/codex-account.ts")
  const { resolveInquiryContext } = await import("./inquiry-context.ts")
  const contexts: any[] = []
  const decode = (wire: any) => { const value = resolveInquiryContext(wire, contexts); contexts.push(wire); return value }
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.inquiry = { ...input.inquiry, schemaVersion: "authorization-inquiry/v2", operations: [{ id: "operation", request: "Inspect local" }], questions: input.inquiry.questions.map((q: any) => ({ ...q, operationId: "operation", intent: "behavior" })) }
  input.resourceInputs = { q: { item: { id: 7 } } }; await writeFile(f.inputFile, JSON.stringify(input))
  const raw = { ...f.contract, scope: { ...f.contract.scope, questionId: "other" }, queries: [], resourceWorkflow: { inputs: ["item"], steps: [{ id: "value", op: "value", value: { field: { of: { ref: "item" }, key: "id" } }, source: at(8) }, { id: "result", op: "return", value: { ref: "value" }, source: at(8) }] } }
  let turn = 0, calls = 0, context: any, checkpointSeen = false
  const traceDir = path.join(f.root, "raw")
  const factory = () => {
    let receive = (_m: any) => {}, actions: any[] = []
    const finish = () => receive({ method: "turn/completed", params: { threadId: "thread", turn: { id: `turn-${turn}`, status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: `answer-${turn}` }] } } })
    const next = () => { const action = actions.shift(); if (!action) return finish(); receive({ id: `rpc-${++calls}`, method: "item/tool/call", params: { threadId: "thread", turnId: `turn-${turn}`, callId: `call-${calls}`, ...action } }) }
    return { isolation: { kind: "test-transport" as const, reason: "anonymous author" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
      if (m.method === "initialize") receive({ id: m.id, result: {} })
      if (m.method === "thread/read") receive({ id: m.id, result: { thread: { id: "thread", ephemeral: false, turns: [{ id: `turn-${turn}`, status: "completed" }] } } })
      if (["thread/start", "thread/resume"].includes(m.method)) receive({ id: m.id, result: { thread: { id: "thread", ephemeral: false }, model: "gpt-5.6-sol" } })
      if (m.method === "turn/start") {
        turn++; context = decode(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1]))
        actions = turn === 1 ? [{ tool: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Keep duty" }] } }, { tool: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } }] : turn === 2 ? [{ tool: "authorization_program", arguments: raw }] : [{ tool: "authorization_program_patch", arguments: { baseRevision: context.authoring.draftRevision, inputBinding: { questionId: "q" }, upsertSteps: [] } }]
        receive({ id: m.id, result: { turn: { id: `turn-${turn}` } } }); queueMicrotask(next)
      }
      if (m.result?.contentItems) {
        const reply = JSON.parse(m.result.contentItems[0].text); context = decode(reply.currentContext)
        if (turn === 2) {
          const saved = JSON.parse(require("node:fs").readFileSync(path.join(traceDir, "program-checkpoint-1.json"), "utf8"))
          expect(saved.draft.currentDraft.raw).toEqual(raw)
          expect(saved.identity).toMatchObject({ threadId: "thread", turnId: "turn-2" }); checkpointSeen = true
        }
        queueMicrotask(next)
      }
    } }
  }
  const run: any = await runCodexAccountInquiry({ inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", maxToolCalls: 16, timeoutMs: 5000, traceDir, transportFactory: factory })
  expect(turn, JSON.stringify(run.account.authorContinuation)).toBe(3)
  expect(checkpointSeen).toBe(true)
  expect(run.account.turns.map((t: any) => t.text)).toEqual(["answer-1", "answer-2", "answer-3"])
  expect(run.native.toolBudget.totalUsed).toBe(4)
  expect(run.native.toolBudget.totalLimit).toBe(16)
  expect(run.native.domain.executableContract.candidate.resourceExecution.returned, JSON.stringify(run.native.domain.executableContract.candidate.diagnostics)).toBe(7)
  expect(run.account.authorContinuation.stopReason).toBe("author-continuation-limit")
})
const at = (startLine: number, endLine = startLine, text?: string) => ({ path: "app.py", startLine, endLine, ...(text ? { text } : {}) })
test("compact edit keeps authoring responsibility after computation and consume stays read-only", async () => {
  const f = await contractFiles()
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { record: { selected: { literal: 7 } } }, source: at(8) }], gaps: ["Related response not modeled"] } }))
  for (const programMode of ["edit", "consume"] as const) {
    const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", domainProgramFile: f.domainProgramFile, programContext: "compact", programMode, executionPolicy: "progressive" })
    try {
      const context: any = await runtime.accountContext(false)
      expect(context.programMode).toBe(programMode)
      expect(context.currentStage).toBeDefined()
      expect(context.sourceWindows).toBeDefined()
      expect(context.sourceIndex.length).toBeGreaterThan(0)
      expect(context.executableContract.questions.map((q: any) => q.questionId)).toEqual(["q", "other"])
      expect(context.executableContract.returned).toEqual({ selected: 7 })
      if (programMode === "edit") {
        expect(context.authoring.goal).toContain("Continue authoring")
        expect(context.authoring.draftRevision).toHaveLength(64)
        expect(context.authoring.questions[1].computedFields).toEqual([])
        expect(context.authoring.completion).toBe("unreviewed")
        expect(context.instruction).toContain("authorization_program_patch")
      } else expect(context.authoring).toBeUndefined()
      const opened = JSON.parse((await runtime.execute({ id: "open-source", name: "source_read", arguments: { path: context.sourceIndex[0].path, startLine: context.sourceIndex[0].startLine, endLine: context.sourceIndex[0].endLine } })).output)
      expect(opened.status).toBe("ok")
    } finally { await runtime.close() }
  }
})
test("a saved candidate can be restored for a revision patch without adopting its old result", async () => {
  const f = await contractFiles()
  const opts = { inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1" as const, domainProgramFile: f.domainProgramFile, programMode: "edit" as const, executionPolicy: "progressive" as const }
  const first = await createNativeInquiryRuntime(opts)
  await first.execute({ id: "draft", name: "authorization_program", arguments: { ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { bad: true }, source: at(8) }] } } })
  const draft = JSON.parse(JSON.stringify((first.report().domain!.executableContract as any).currentDraft))
  expect((first.report().domain!.executableContract as any).adoptedDraft.raw).toEqual(f.contract)
  await first.close()
  const next = await createNativeInquiryRuntime({ ...opts, reuse: { info: {} as any, seed: { delta: { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }, evidence: [], programDraft: draft } } } as any)
  try {
    const before: any = next.report().domain!.executableContract!
    expect(before.currentDraft.revision).toBe(draft.revision)
    expect(before.resourceExecution).toBeUndefined()
    await next.execute({ id: "patch", name: "authorization_program_patch", arguments: { baseRevision: draft.revision, upsertSteps: [{ id: "result", op: "return", value: { literal: 19 }, source: at(8) }] } })
    expect(next.report().domain!.executableContract!.resourceExecution!.returned).toBe(19)
  } finally { await next.close() }
})
test("compact native feedback sends summaries and actual detail tools retain source and events", async () => {
  const f = await contractFiles()
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 17 }, source: at(8), because: "Source return" }] } }))
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", domainProgramFile: f.domainProgramFile, programContext: "compact" } as any)
  try {
    const context: any = await runtime.accountContext(false)
    expect(context.executableContract.returned).toBe(17)
    expect(context.executableContract.program).toBeUndefined()
    const checked = JSON.parse((await runtime.execute({ id: "check", name: "authorization_check_properties", arguments: {} })).output)
    expect(checked.executableContract.program).toBeUndefined()
    expect(checked.executableContract.returned).toBe(17)
    const details = JSON.parse((await runtime.execute({ id: "details", name: "authorization_program_details", arguments: { stepId: "result" } })).output)
    expect(details.events[0].outputs.value).toBe(17)
    expect(details.steps[0].source.path).toBe("app.py")
    expect(runtime.report().domain!.executableContract!.resourceExecution!.events[0]!.inputs).toEqual({ expression: { literal: 17 } })
  } finally { await runtime.close() }
})
test("ordinary native partial program patch repairs only one node and archives missing source", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive" })
  const program = { ...f.contract, resourceWorkflow: { inputs: [], steps: [
    { id: "kept", op: "value", value: { literal: 7 }, source: at(1, 2) },
    { id: "broken", op: "value", value: { bad: true } },
    { id: "result", op: "return", value: { ref: "broken" }, source: at(8) },
  ] } }
  try {
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Retain original duty" }] } })
    await runtime.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    expect(runtime.argumentDiagnostics({ id: "draft", name: "authorization_program", arguments: program })).toBeUndefined()
    await runtime.execute({ id: "draft", name: "authorization_program", arguments: program })
    const before: any = runtime.report().domain!.executableContract!
    expect(before.resourceExecution.values.kept).toBe(7)
    expect(before.resourceExecution.returned).toBeUndefined()
    const patch = { baseRevision: before.currentDraft.revision, upsertSteps: [{ id: "broken", op: "value", value: { literal: 9 }, source: at(1, 2) }] }
    expect(runtime.argumentDiagnostics({ id: "patch", name: "authorization_program_patch", arguments: patch })).toBeUndefined()
    await runtime.execute({ id: "patch", name: "authorization_program_patch", arguments: patch })
    const after: any = runtime.report().domain!.executableContract!
    expect(after.resourceExecution.returned).toBe(9)
    expect(after.program.resourceWorkflow.steps.map((s: any) => s.id)).toEqual(["kept", "broken", "result"])
    await runtime.execute({ id: "stale", name: "authorization_program_patch", arguments: patch })
    expect(runtime.report().domain!.executableContract!.revision).toBe(after.revision)
    await writeFile(f.domainProgramFile, JSON.stringify(program))
    const output: string[] = [], errors: string[] = []
    expect(await runAuthorizationInquiryCli(["check", `--input=${f.inputFile}`, `--out=${path.join(f.root, "partial")}`, "--strategy=question-checked-v1", "--execution-policy=progressive", `--domain-program=${f.domainProgramFile}`], { stdout: t => output.push(t), stderr: t => errors.push(t) }), errors.join("\n")).toBe(0)
    expect((await inspectLocalInquiry(JSON.parse(output[0]!).sessionPath)).execution.resourceExecution.values.kept).toBe(7)
  } finally { await runtime.close() }
})
test("progressive public check keeps local diagnostics and exposes resource computation", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.resourceInputs = { q: { object: { id: 17 } } }
  await writeFile(f.inputFile, JSON.stringify(input))
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, sourceDeclarations: [...f.contract.sourceDeclarations, { bad: true }], resourceWorkflow: { inputs: ["object"], steps: [{ id: "result", op: "return", value: { ref: "object" }, source: at(8), because: "Return selected item" }] } }))
  const output: string[] = []
  expect(await runAuthorizationInquiryCli(["check", `--input=${f.inputFile}`, "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`, "--execution-policy=progressive"], { stdout: text => output.push(text), stderr: () => {} })).toBe(0)
  const checked = JSON.parse(output[0]!)
  expect(checked.executableContract.units).toHaveLength(2)
  expect(checked.executableContract.resourceExecution.returned).toEqual({ id: 17 })
  expect(checked.executableContract.diagnostics.length).toBeGreaterThan(0)
})
test("zero-model check can save an ordinary inspectable execution session", async () => {
  const f = await contractFiles(), output: string[] = []
  expect(await runAuthorizationInquiryCli(["check", `--input=${f.inputFile}`, `--out=${path.join(f.root, "offline")}`, "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`], { stdout: text => output.push(text), stderr: () => {} })).toBe(0)
  const checked = JSON.parse(output[0]!), report = await inspectLocalInquiry(checked.sessionPath)
  expect(report.model).toBe("none")
  expect(report.telemetry.providerCalls).toBe(0)
  expect(report.execution.finalRevision).toBe(checked.executableContract.revision)
})
test("consume retains accepted program and checks while model proposals become drafts", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", domainProgramFile: f.domainProgramFile })
  try {
    const before = runtime.report().domain!.executableContract!
    await runtime.execute({ id: "replace", name: "authorization_declare", arguments: { ...f.contract, id: "replacement" } })
    await runtime.rejectArguments({ id: "bad", name: "authorization_declare", arguments: {} }, [{ code: "invalid", path: "$", message: "Malformed draft" }] as any)
    const after: any = runtime.report().domain!.executableContract!
    expect(after.revision).toBe(before.revision)
    expect(after.evaluation).toEqual(before.evaluation)
    expect(after.programMode).toBe("consume")
    expect(after.drafts).toHaveLength(2)
  } finally { await runtime.close() }
})
test("native program authoring has one advertised action while legacy declarations still parse", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive" })
  try {
    expect(runtime.definitions.find(d => d.name === "authorization_program")?.inputSchema.type).toBe("object")
    expect(runtime.definitions.find(d => d.name === "authorization_declare")?.inputSchema.oneOf).toBeUndefined()
    const thin: any = structuredClone(f.contract)
    delete thin.schemaVersion
    thin.notes = "Preserved author explanation"
    thin.scope.root = { symbol: "local" }
    for (const [i, declaration] of thin.sourceDeclarations.entries()) { delete declaration.schemaVersion; declaration.source = { symbol: i ? "perform" : "local" } }
    expect(runtime.argumentDiagnostics({ id: "thin", name: "authorization_program", arguments: thin })).toBeUndefined()
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Retain original duty" }] } })
    await runtime.execute({ id: "source", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    const proposed = JSON.parse((await runtime.execute({ id: "program", name: "authorization_program", arguments: thin })).output)
    expect(proposed.controlDiagnostics).toEqual([])
    expect(runtime.report().domain?.executableContract?.program.id).toBe(f.contract.id)
  } finally { await runtime.close() }
})
test("matched Markdown supplies original source meanings as data without creating a program", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.sourceNotes = { format: "markdown", text: "Authored source summary: local calls perform; meaning remains unreviewed." }
  input.resourceInputs = { q: { object: { id: 7 } } }
  await writeFile(f.inputFile, JSON.stringify(input))
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-guided-v1", method: "M" })
  try {
    expect(runtime.system).toContain(input.sourceNotes.text)
    expect(runtime.system).toContain('"object":{"id":7}')
    expect(runtime.report().domain?.executableContract).toBeUndefined()
  } finally { await runtime.close() }
})
test("ordinary session archives host execution and inspect verifies its projection", async () => {
  const f = await contractFiles()
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 17 }, source: at(8), because: "Example finite return" }] } }))
  const report: any = await executeLocalInquiryRun({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir: path.join(f.root, "execution-out"), model: "gpt-5.6-sol", strategy: "question-checked-v1", harness: "codex-account", accountTransportFactory: contractConsumer(), execution: { sessionTimeoutMs: 5000 } })
  const execution = JSON.parse(await readFile(path.join(report.sessionPath, "execution.json"), "utf8"))
  expect(execution.resourceExecution.events[0].executor).toBe("host")
  const readable = await readFile(path.join(report.sessionPath, "execution.md"), "utf8")
  expect(readable).toContain("Example finite return")
  expect(readable.indexOf("Current result")).toBeLessThan(readable.indexOf("## 1."))
  expect(readable).toContain("Detailed inputs and events: execution.json")
  expect((await inspectLocalInquiry(report.sessionPath)).execution.resourceExecution.returned).toBe(17)
  await writeFile(path.join(report.sessionPath, "execution.json"), "{}")
  await expect(inspectLocalInquiry(report.sessionPath)).rejects.toThrow("execution archive changed")
})
test("resource-only input change preserves R1 and recomputes the same archived program", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.resourceInputs = { q: { selected: { id: 1 } } }
  await writeFile(f.inputFile, JSON.stringify(input))
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: ["selected"], steps: [{ id: "returned", op: "return", value: { ref: "selected" }, source: at(8), because: "Return selected object" }] } }))
  const report: any = await executeLocalInquiryRun({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir: path.join(f.root, "change-out"), model: "gpt-5.6-sol", strategy: "question-checked-v1", harness: "codex-account", accountTransportFactory: contractConsumer(), execution: { sessionTimeoutMs: 5000 } })
  input.resourceInputs.q.selected.id = 2
  await writeFile(f.inputFile, JSON.stringify(input))
  const compared: any = await compareLocalInquiry(f.inputFile, report.sessionPath)
  expect(compared.reuseEligibility.info.layers.R1.available).toBe(true)
  expect(compared.resourceInputsOnly).toBe(true)
  expect(compared.executableContract.resourceExecution.returned).toEqual({ id: 2 })
  expect(compared.providerCalls).toBe(0)
  expect(compared.answerReused).toBe(false)
})
export async function contractFiles() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bf-contract-entry-")); await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source/app.py"), source)
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect local: Authorization before the target write", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "Authorization before the target write" }] }, { id: "other", request: "Retain the other original duty", premises: [] }] }
  const contract = { schemaVersion: "authorization-executable-contract/v1", id: "authored-local", scope: { kind: "function-contract", questionId: "q", root: at(1, 2), upstream: ["Request authentication is outside this local contract"] }, sourceDeclarations: [
    { schemaVersion: "authorization-question-declaration/v1", source: at(1, 2), statements: [{ kind: "object", expression: "actor", as: "principal", because: "Actual formal" }, { kind: "object", expression: "target", as: "resource", because: "Actual formal" }, { kind: "dependency", at: at(2, 2, "perform(actor, target)"), because: "Actual call" }, { kind: "statement", at: at(2, 2, "return perform(actor, target)"), because: "Actual return" }] },
    { schemaVersion: "authorization-question-declaration/v1", source: at(4, 8), statements: [{ kind: "object", expression: "who", as: "principal", because: "Actual formal" }, { kind: "object", expression: "item", as: "resource", because: "Actual formal" }, { kind: "condition", at: at(5, 5, "not who.allowed"), test: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "who.allowed" } } }, authorizes: { principal: "who", resource: "item", when: "false" }, because: "Source control before write" }, { kind: "statement", at: at(6), because: "Refusal return" }, { kind: "effect", at: at(7), principal: "who", resource: "item", because: "Actual write" }, { kind: "statement", at: at(8), because: "Object return" }] },
  ], queries: [{ property: "auth", effect: at(7, 7, "item.sent = True"), guard: at(5, 5, "not who.allowed") }], assumptions: [] }
  const inputFile = path.join(root, "input.json"), domainProgramFile = path.join(root, "program.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], inquiry }))
  await writeFile(domainProgramFile, JSON.stringify(contract)); return { root, inputFile, domainProgramFile, contract }
}
test("ordinary check imports a source contract with zero model calls and real read accounting", async () => {
  const f = await contractFiles(), output: string[] = []
  const code = await runAuthorizationInquiryCli(["check", `--input=${f.inputFile}`, "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`], { stdout: (text: string) => output.push(text), stderr: () => {} })
  expect(code).toBe(0)
  const checked = JSON.parse(output[0]!)
  expect(checked.providerCalls).toBe(0)
  expect(checked.executableContract.evaluation.questions.find((q: any) => q.questionId === "q").properties[0].status).toBe("checked")
  expect(checked.executableContract.materialUses.some((u: any) => u.kind === "call")).toBe(true)
  expect(checked.sourceAccounting.toolCalls).toBeGreaterThan(0)
  expect(checked.executableContract.sourceMaterials.materials.every((m: any) => m.interpretationSource === "authored-file")).toBe(true)
})

test("ordinary file and native entrypoints recompute explicit inputs after moving the package", async () => {
  const f = await contractFiles(), base = JSON.parse(await readFile(f.inputFile, "utf8"))
  base.inquiry.questions[0].request = "Inspect local: Reachability of the target write"
  base.inquiry.questions[0].properties[0] = { id: "auth", kind: "effect-reachability", requirement: "Reachability of the target write" }
  const moved = await mkdtemp(path.join(os.tmpdir(), "bf-contract-moved-"))
  await mkdir(path.join(moved, "source")); await writeFile(path.join(moved, "source/app.py"), source)
  const inputFile = path.join(moved, "input.json"), domainProgramFile = path.join(moved, "program.json")
  await writeFile(domainProgramFile, JSON.stringify(f.contract))
  for (const [value, expected] of [[true, "conditional"], [false, "unreachable"], [undefined, "conditional"]] as const) {
    const contractInputs = value === undefined ? undefined : { q: { actor: { allowed: value } } }
    await writeFile(inputFile, JSON.stringify({ ...base, contractInputs }))
    const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", domainProgramFile)
    expect(checked.status, JSON.stringify(checked.diagnostics)).toBe("valid")
    expect(checked.providerCalls).toBe(0)
    expect(checked.executableContract.evaluation.questions[0].properties[0].value).toBe(expected)
    const native = await createNativeInquiryRuntime({ inputFile, workDir: moved, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile })
    try {
      const report = native.report().domain?.executableContract
      expect(report?.conditions).toEqual(contractInputs?.q ?? {})
      expect(report?.evaluation?.questions[0]?.properties[0]?.value).toBe(expected)
      expect(report?.requestOperationCertified).toBe(false)
    } finally { await native.close() }
  }
  await writeFile(inputFile, JSON.stringify({ ...base, contractInputs: { q: { "$guard": true } } }))
  const invalid: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", domainProgramFile)
  expect(invalid.diagnostics.some((d: any) => d.code === "contract-input-parameter")).toBe(true)
})
test("ordinary native file import and model declaration adopt the same contract core", async () => {
  const f = await contractFiles()
  const imported = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile } as any)
  try {
    const context: any = await imported.accountContext(false)
    expect(context.executableContract.program.id).toBe(f.contract.id)
    const property = imported.report().domain?.executableContract?.evaluation?.questions.find((q: any) => q.questionId === "q")?.properties[0]
    expect(property?.status, JSON.stringify({ gaps: property?.gaps, projection: imported.report().domain?.materialProjection, units: imported.report().domain?.semantic?.units.map(u => ({ questionId: u.questionId, role: u.role, handle: u.handle })), rules: imported.report().domain?.slice.rules.map(r => ({ kind: r.kind, origin: r.sourceOrigin })) })).toBe("checked")
    expect(imported.report().program?.questions.map(q => q.id)).toEqual(["q", "other"])
  } finally { await imported.close() }
  // No authored file is loaded in the model path. It must read original source.
  const model = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1" })
  try {
    const prepared = await model.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "No narrow query was requested" }] } })
    expect(prepared.exitCode).toBe(0)
    const read = await model.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    model.accountSent(JSON.stringify({ toolResult: JSON.parse(read.output), currentContext: await model.accountContext(false) }))
    const declared = await model.execute({ id: "declare", name: "authorization_declare", arguments: f.contract })
    expect(JSON.parse(declared.output).controlDiagnostics).toEqual([])
    expect(model.report().domain?.executableContract?.evaluation?.questions.find((q: any) => q.questionId === "q")?.properties[0]?.status).toBe("checked")
  } finally { await model.close() }
})

test("a rejected declaration for another original question preserves the local contract property", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile, programMode: "edit" })
  try {
    const rejected = JSON.parse((await runtime.execute({ id: "unowned-other", name: "authorization_declare", arguments: { schemaVersion: "authorization-question-declaration/v1", questionId: "other", source: at(1, 8), statements: [{ kind: "object", expression: "actor", as: "principal", because: "This broad window has no current owner" }] } })).output)
    await runtime.execute({ id: "check-current", name: "authorization_check_properties", arguments: {} })
    expect(runtime.report().domain?.propertyAnalysis?.checks?.questions.find(q => q.questionId === "q")?.properties[0]?.status).toBe("checked")
    expect(rejected.controlDiagnostics).toContainEqual(expect.objectContaining({ code: "question-source-unread-or-unowned", questionId: "other" }))
    expect(runtime.report().domain?.semantic?.units).toHaveLength(2)
    expect(runtime.report().domain?.delivery?.gaps.some(g => g.questionId === "other" && g.code === "question-source-unread-or-unowned")).toBe(true)
  } finally { await runtime.close() }
})

function contractConsumer(onCheck = (reply: any) => {
  expect(reply.toolResult.executableContract.program.id).toBe("authored-local")
  expect(reply.toolResult.propertyChecks.questions.find((q: any) => q.questionId === "q").properties[0].status).toBe("checked")
}, call: { tool: string; arguments: unknown } = { tool: "authorization_check_properties", arguments: {} }, onStart = (_packet: any) => {}) {
  let receive = (_message: any) => {}
  return () => ({ isolation: { kind: "test-transport" as const, reason: "Anonymous finite contract consumer" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(message: any) {
    if (message.method === "initialize") receive({ id: message.id, result: {} })
    if (message.method === "thread/start") receive({ id: message.id, result: { thread: { id: "thread" }, model: "gpt-5.6-sol" } })
    if (message.method === "turn/start") {
      onStart(message.params)
      receive({ id: message.id, result: { turn: { id: "turn" } } })
      queueMicrotask(() => receive({ id: "rpc-check", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "check", ...call } }))
    }
    if (message.result?.contentItems) {
      const reply = JSON.parse(message.result.contentItems[0].text)
      onCheck(reply)
      receive({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "The local authorization guard controls the target write. The other original duty remains unresolved." }] } } })
    }
  } })
}

test("ordinary run archives exact program bytes and previous restores only the current source contract", async () => {
  const f = await contractFiles(), original = await readFile(f.domainProgramFile, "utf8"), outDir = path.join(f.root, "sessions-out")
  const first: any = await executeLocalInquiryRun({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir, model: "gpt-5.6-sol", method: "D1", strategy: "question-checked-v1", harness: "codex-account", accountTransportFactory: contractConsumer(), execution: { sessionTimeoutMs: 5000 } } as any)
  expect(first.status).toBe("completed")
  expect(first.domainProgram.sha256).toHaveLength(64)
  expect(await readFile(path.join(first.sessionPath, "domain-program.json"), "utf8")).toBe(original)
  expect((await inspectLocalInquiry(first.sessionPath)).domain.executableContract.evaluation.questions[0].properties[0].status).toBe("checked")
  await writeFile(f.domainProgramFile, "changed external file")
  expect((await inspectLocalInquiry(first.sessionPath)).domainProgram).toEqual(first.domainProgram)
  const next: any = await executeLocalInquiryRun({ inputFile: f.inputFile, previous: first.sessionPath, outDir, model: "gpt-5.6-sol", method: "D1", strategy: "question-checked-v1", harness: "codex-account", accountTransportFactory: contractConsumer(), execution: { sessionTimeoutMs: 5000 } })
  expect(next.status).toBe("completed")
  expect(next.domainProgram.origin).toBe("previous-program")
  expect(next.domain.executableContract.evaluation).toBeDefined()
  expect(next.reuse.answerReused).toBe(false)
  expect(next.reuse.materialsUsed).toBeGreaterThan(0)
  await writeFile(path.join(first.sessionPath, "domain-program.json"), "tampered archive")
  await expect(inspectLocalInquiry(first.sessionPath)).rejects.toThrow("program archive changed")
})

test("previous with an edited program excludes its omitted helper meanings", async () => {
  const f = await contractFiles(), outDir = path.join(f.root, "edited-program-out")
  const common = { inputFile: f.inputFile, outDir, model: "gpt-5.6-sol", method: "D1" as const, strategy: "question-checked-v1" as const, harness: "codex-account" as const, execution: { sessionTimeoutMs: 5000 } }
  const first: any = await executeLocalInquiryRun({ ...common, domainProgramFile: f.domainProgramFile, accountTransportFactory: contractConsumer() })
  expect(first.status).toBe("completed")
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, sourceDeclarations: [f.contract.sourceDeclarations[0]], queries: [] }))
  const compared: any = await compareLocalInquiry(f.inputFile, first.sessionPath, "question-checked-v1", f.domainProgramFile)
  expect(compared.domainProgramChanged).toBe(true)
  const checkUnknown = (reply: any) => expect(reply.toolResult.propertyChecks.questions.find((q: any) => q.questionId === "q").properties[0].status).toBe("unknown")
  const fresh: any = await executeLocalInquiryRun({ ...common, domainProgramFile: f.domainProgramFile, accountTransportFactory: contractConsumer(checkUnknown) })
  const previous: any = await executeLocalInquiryRun({ ...common, previous: first.sessionPath, domainProgramFile: f.domainProgramFile, accountTransportFactory: contractConsumer(checkUnknown) })
  expect(previous.status).toBe("completed")
  expect(previous.domain.semantic.units).toEqual(fresh.domain.semantic.units)
  expect(previous.domain.materialUses).toEqual(fresh.domain.materialUses)
  expect(previous.domain.semantic.units).toHaveLength(1)
  expect(previous.reuse.layers.R0.available).toBe(true)
  expect(previous.domain.delivery.obligations.some((d: any) => d.questionId === "other")).toBe(true)
  expect(previous.reuse.answerReused).toBe(false)
})

test("previous reuses source meaning after local input changes and recomputes current values", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8")), outDir = path.join(f.root, "input-change-out")
  input.inquiry.questions[0].request = "Inspect local: Reachability of the target write"
  input.inquiry.questions[0].properties[0] = { id: "auth", kind: "effect-reachability", requirement: "Reachability of the target write" }
  input.contractInputs = { q: { actor: { allowed: false } } }
  await writeFile(f.inputFile, JSON.stringify(input))
  const common = { inputFile: f.inputFile, outDir, model: "gpt-5.6-sol", method: "D1" as const, strategy: "question-checked-v1" as const, harness: "codex-account" as const, execution: { sessionTimeoutMs: 5000 } }
  const property = (reply: any) => reply.toolResult.propertyChecks.questions.find((q: any) => q.questionId === "q").properties[0]
  const first: any = await executeLocalInquiryRun({ ...common, domainProgramFile: f.domainProgramFile, accountTransportFactory: contractConsumer(reply => expect(property(reply).value).toBe("unreachable")) })
  expect(first.status).toBe("completed")
  for (const value of [true, undefined]) {
    if (value === undefined) delete input.contractInputs
    else input.contractInputs = { q: { actor: { allowed: value } } }
    await writeFile(f.inputFile, JSON.stringify(input))
    const compared: any = await compareLocalInquiry(f.inputFile, first.sessionPath, common.strategy)
    expect(compared.reuseEligibility.status).toBe("reusable")
    expect(compared.reuseEligibility.info.layers.R1.available).toBe(true)
    const current = () => contractConsumer(reply => {
      expect(property(reply).value).toBe("conditional")
      expect(reply.toolResult.executableContract.conditions).toEqual(value === undefined ? {} : { actor: { allowed: true } })
    })
    const fresh: any = await executeLocalInquiryRun({ ...common, domainProgramFile: f.domainProgramFile, accountTransportFactory: current() })
    const previous: any = await executeLocalInquiryRun({ ...common, previous: first.sessionPath, accountTransportFactory: current() })
    expect(previous.status).toBe("completed")
    expect(previous.domain.executableContract.evaluation).toEqual(fresh.domain.executableContract.evaluation)
    expect(previous.reuse.materialsRestored).toBe(2)
    expect(previous.reuse.materialsUsed).toBeGreaterThan(0)
    expect(previous.reuse.answerReused).toBe(false)
    expect(previous.reuse.layers.R2.available).toBe(false)
  }
  input.inquiry.questions[1].request = "A different original duty"
  await writeFile(f.inputFile, JSON.stringify(input))
  expect((await compareLocalInquiry(f.inputFile, first.sessionPath, common.strategy) as any).reuseEligibility.status).toBe("needs-fresh-analysis")
})

test("a complete current contract repairs only the rejected exact source declaration", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile, programMode: "edit" })
  const property = () => runtime.report().domain!.executableContract!.evaluation!.questions.find(q => q.questionId === "q")!.properties[0]!
  try {
    expect(property().status, JSON.stringify(property().gaps)).toBe("checked")
    const declaration = { ...f.contract.sourceDeclarations[1], questionId: "q" }
    const rejected = JSON.parse((await runtime.execute({ id: "unowned-helper", name: "authorization_declare", arguments: declaration })).output)
    expect(rejected.controlDiagnostics).toContainEqual(expect.objectContaining({ code: "question-source-unread-or-unowned", questionId: "q" }))
    await runtime.accountContext(false)
    expect(property().status).toBe("unknown")
    const repaired = JSON.parse((await runtime.execute({ id: "complete-repair", name: "authorization_declare", arguments: f.contract })).output)
    expect(repaired.controlDiagnostics).toEqual([])
    expect(property().status).toBe("checked")
    const broad = { ...declaration, source: at(1, 8) }
    expect(JSON.parse((await runtime.execute({ id: "broad-rejection", name: "authorization_declare", arguments: broad })).output).controlDiagnostics.length).toBeGreaterThan(0)
    await runtime.accountContext(false)
    await runtime.execute({ id: "complete-but-not-broad-repair", name: "authorization_declare", arguments: f.contract })
    expect(property().status).toBe("unknown")
    expect(property().gaps).toContain("property-current-source-rejected:question-source-unread-or-unowned")
    for (const source of [{ ...declaration.source, sha256: "0".repeat(64) }, { ...declaration.source, receiverClass: "AnotherReceiver" }]) {
      await runtime.execute({ id: "different-source-rejection", name: "authorization_declare", arguments: { ...declaration, source } })
      await runtime.execute({ id: "complete-but-not-other-source-repair", name: "authorization_declare", arguments: f.contract })
      expect(property().status).toBe("unknown")
    }
  } finally { await runtime.close() }
})

test("replacing a native program retires only the old program's source units", async () => {
  const f = await contractFiles()
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile, programMode: "edit" })
  try {
    expect(runtime.report().domain?.semantic?.units).toHaveLength(2)
    const result = await runtime.execute({ id: "replace", name: "authorization_declare", arguments: { ...f.contract, sourceDeclarations: [f.contract.sourceDeclarations[0]], queries: [] } })
    expect(JSON.parse(result.output).controlDiagnostics).toEqual([])
    expect(runtime.report().domain?.semantic?.units).toHaveLength(1)
    expect(runtime.report().domain?.materialUses).toHaveLength(1)
    expect(runtime.report().domain?.sourceMaterials?.materials.filter(m => m.current)).toHaveLength(1)
    expect(runtime.report().domain?.sourceMaterials?.retired.some(m => m.reason === "domain-program-replaced")).toBe(true)
    expect(runtime.report().program?.questions.map(q => q.id)).toEqual(["q", "other"])
  } finally { await runtime.close() }
})

test("compare detects program edits and final source verification withdraws a stale contract verdict", async () => {
  const f = await contractFiles(), output: string[] = []
  const code = await runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "cli-out")}`, "--model=unused", "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`], { stdout: (text: string) => output.push(text), stderr: () => {}, providerFactory: () => { throw new Error("offline provider") } })
  expect(code).toBe(1)
  const report = JSON.parse(output[0]!)
  expect(report.domainProgram.sha256).toHaveLength(64)
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, id: "edited" }))
  const compared: any = await compareLocalInquiry(f.inputFile, report.sessionPath, "question-checked-v1", f.domainProgramFile)
  expect(compared.domainProgramChanged).toBe(true)
  expect(compared.providerCalls).toBe(0)
  expect(compared.status).toBe("needs-review")
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", method: "D1", domainProgramFile: f.domainProgramFile, programMode: "edit" })
  await writeFile(path.join(f.root, "source/app.py"), source.replace("item.sent = True", "item.sent = False"))
  await runtime.close()
  expect(runtime.report().sourceVerification?.valid).toBe(false)
  expect(runtime.report().domain?.executableContract?.status).toBe("invalidated")
  expect(runtime.report().domain?.executableContract?.evaluation).toBeUndefined()
})

test("compare exposes condition-only recomputation on the same archived program without dispatch", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8")), output: string[] = []
  input.inquiry.questions[0].request = "Inspect local: Reachability of the target write"
  input.inquiry.questions[0].properties[0] = { id: "auth", kind: "effect-reachability", requirement: "Reachability of the target write" }
  input.contractInputs = { q: { actor: { allowed: true } } }
  await writeFile(f.inputFile, JSON.stringify(input))
  await runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "compare-out")}`, "--model=unused", "--strategy=question-checked-v1", `--domain-program=${f.domainProgramFile}`], { stdout: (text: string) => output.push(text), stderr: () => {}, providerFactory: () => { throw new Error("offline provider") } })
  const prior = JSON.parse(output[0]!)
  input.contractInputs.q.actor.allowed = false
  await writeFile(f.inputFile, JSON.stringify(input))
  const compared: any = await compareLocalInquiry(f.inputFile, prior.sessionPath, "question-checked-v1")
  expect(compared.contractInputsChanged).toBe(true)
  expect(compared.contractInputsOnly).toBe(true)
  expect(compared.domainProgramChanged).toBe(false)
  expect(compared.affectedComputation).toContain("function-entry-values")
  expect(compared.executableContract.evaluation.questions[0].properties[0].value).toBe("unreachable")
  expect(compared.providerCalls).toBe(0)
  expect(compared.answerReused).toBe(false)
})

test("a successful patch then rejected patch serializes and resumes from the last accepted draft", async () => {
  const f = await contractFiles()
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 7 }, source: at(8) }] } }))
  const first = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainProgramFile: f.domainProgramFile, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive" })
  let retained: any
  try {
    await first.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Original duty retained" }] } })
    const revision = first.report().domain!.programDraft.currentDraft!.revision
    await first.execute({ id: "accepted", name: "authorization_program_patch", arguments: { baseRevision: revision, upsertSteps: [{ id: "result", op: "return", value: { literal: 19 }, source: at(8) }] } })
    const accepted = first.report().domain!.programDraft.currentDraft!
    const rejected = JSON.parse((await first.execute({ id: "rejected", name: "authorization_program_patch", arguments: { baseRevision: accepted.revision, upsertSteps: [], stepOrder: ["missing"] } })).output)
    expect(rejected.controlDiagnostics.some((d: any) => d.code === "program-patch-order")).toBe(true)
    expect(first.report().domain!.programDraft.currentDraft).toEqual(accepted)
    retained = JSON.parse(JSON.stringify(first.report().domain!.programDraft.currentDraft))
  } finally { await first.close() }
  const resumed = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", reuse: { info: {} as any, seed: { delta: { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }, evidence: [], programDraft: retained } } })
  try {
    await resumed.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Original duty retained" }] } })
    const before: any = await resumed.accountContext(false)
    expect(before.authoring.draftRevision).toBe(retained.revision)
    expect(before.authoring.computed).toBeUndefined()
    await resumed.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    await resumed.execute({ id: "repair", name: "authorization_program_patch", arguments: { baseRevision: retained.revision, upsertSteps: [{ id: "result", op: "return", value: { literal: 23 }, source: at(8) }] } })
    expect(resumed.report().domain!.executableContract!.resourceExecution!.returned).toBe(23)
    expect(resumed.report().domain!.programDraft.authorLoop!.firstProgramToolUnit).toBeUndefined()
    expect(resumed.report().program!.questions.map(q => q.id)).toEqual(["q", "other"])
  } finally { await resumed.close() }
})

test("two operations with same-name facts support explicit same-operation binding and diagnose cross-operation patches", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.inquiry = { ...input.inquiry, schemaVersion: "authorization-inquiry/v2", operations: [{ id: "first", request: "Inspect the first operation" }, { id: "second", request: "Inspect the independent operation" }], questions: [...input.inquiry.questions.map((q: any) => ({ ...q, operationId: "first", intent: "behavior" })), { id: "decoy", operationId: "second", intent: "behavior", request: "Retain independent duty", premises: [] }] }
  input.resourceInputs = { other: { item: { id: 37 } }, decoy: { item: { id: 99 } } }
  const contract = { ...f.contract, inputBinding: { questionId: "other" }, resourceWorkflow: { inputs: ["item"], steps: [{ id: "result", op: "return", value: { field: { of: { ref: "item" }, key: "id" } }, source: at(8) }] } }
  await writeFile(f.inputFile, JSON.stringify(input)); await writeFile(f.domainProgramFile, JSON.stringify(contract))
  const checked: any = await checkAuthorizationInquiry(f.inputFile, "D1", "question-checked-v1", f.domainProgramFile, { executionPolicy: "progressive" })
  expect(checked.providerCalls).toBe(0)
  expect(checked.executableContract.resourceExecution.returned).toBe(37)
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainProgramFile: f.domainProgramFile, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive" })
  try {
    await runtime.execute({ id: "prepare", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: ["other", "decoy"].map(questionId => ({ questionId, state: "residual", reason: "Original duty retained" })) } })
    await runtime.execute({ id: "wrong-operation", name: "authorization_program_patch", arguments: { baseRevision: runtime.report().domain!.programDraft.currentDraft!.revision, upsertSteps: [], inputBinding: { questionId: "decoy" } } })
    const wrong: any = await runtime.accountContext(false)
    expect(wrong.authoring.firstBlocker.code).toBe("program-input-operation-mismatch")
    expect(wrong.authoring.inputBindings.inputNames).toEqual([])
    expect(wrong.authoring.computed.returned).toBeUndefined()
    expect(JSON.stringify(wrong.authoring.inputBindings.values)).not.toContain("99")
    await runtime.execute({ id: "same-operation", name: "authorization_program_patch", arguments: { baseRevision: runtime.report().domain!.programDraft.currentDraft!.revision, upsertSteps: [], inputBinding: { questionId: "other" } } })
    expect(runtime.report().domain!.executableContract!.resourceExecution!.returned).toBe(37)
    expect(runtime.report().program!.questions.map(q => q.id)).toEqual(["q", "other", "decoy"])
  } finally { await runtime.close() }
})

test("ordinary compare cannot rebind an archived unpinned raw program to changed source bytes", async () => {
  const f = await contractFiles()
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 17 }, source: at(7) }] } }))
  const checked = await checkAuthorizationInquiry(f.inputFile, "D1", "question-checked-v1", f.domainProgramFile, { executionPolicy: "progressive" })
  const archived = await saveLocalInquiryCheck(f.inputFile, f.domainProgramFile, path.join(f.root, "offline-archive"), checked, { executionPolicy: "progressive" })
  expect(checked.executableContract && "resourceExecution" in checked.executableContract && checked.executableContract.resourceExecution!.returned).toBe(17)
  await writeFile(path.join(f.root, "source/app.py"), source.replace("item.sent = True", "item.sent = False"))
  const compared: any = await compareLocalInquiry(f.inputFile, archived.sessionPath, "question-checked-v1", undefined, { executionPolicy: "progressive" })
  expect(compared.sourceChanged).toBe(true)
  expect(compared.providerCalls).toBe(0)
  expect(compared.executableContract?.resourceExecution?.returned).toBeUndefined()
  expect(compared.executableContract?.diagnostics.some((d: any) => /source-stale|resource-source/.test(d.code))).toBe(true)
  expect(compared.programSourceBasis).toBe("previous-canonical-source-snapshot")
  expect(JSON.parse(await readFile(f.domainProgramFile, "utf8")).resourceWorkflow.steps[0].source.sha256).toBeUndefined()
  expect(compared.answerReused).toBe(false)
})

test("changed-source compare cannot substitute a later adopted program for the original archived file", async () => {
  const f = await contractFiles(), raw = { ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 17 }, source: at(7) }] } }
  await writeFile(f.domainProgramFile, JSON.stringify(raw))
  const previous: any = await executeLocalInquiryRun({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir: path.join(f.root, "edited-session"), model: "gpt-5.6-sol", method: "D1", strategy: "question-checked-v1", harness: "codex-account", programMode: "edit", executionPolicy: "progressive", accountTransportFactory: contractConsumer(reply => {
    expect(reply.toolResult.executableContract.resourceExecution.returned).toBe(19)
  }, { tool: "authorization_program_patch", arguments: { baseRevision: createProgramDraft(raw).revision, upsertSteps: [{ id: "result", op: "return", value: { literal: 19 }, source: at(7) }] } }), execution: { sessionTimeoutMs: 5000 } })
  expect(previous.domain.executableContract.adoptedDraft.raw.resourceWorkflow.steps[0].value.literal).toBe(19)
  await writeFile(path.join(f.root, "source/app.py"), source.replace("item.sent = True", "item.sent = False"))
  const compared: any = await compareLocalInquiry(f.inputFile, previous.sessionPath, "question-checked-v1", undefined, { executionPolicy: "progressive" })
  expect(compared.programSourceBasis).toBe("missing-previous-source-basis")
  expect(compared.executableContract.resourceExecution).toBeUndefined()
  expect(compared.contractDiagnostics[0].code).toBe("contract-source-basis-missing")
})

test("previous consumption of the same frozen raw file stops on changed source before account dispatch", async () => {
  const f = await contractFiles()
  await writeFile(f.domainProgramFile, JSON.stringify({ ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 17 }, source: at(7) }] } }))
  const options = { inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir: path.join(f.root, "source-change-run"), model: "gpt-5.6-sol", method: "D1" as const, strategy: "question-checked-v1" as const, harness: "codex-account" as const, executionPolicy: "progressive" as const, accountTransportFactory: contractConsumer(() => {}), execution: { sessionTimeoutMs: 5000 } }
  const first: any = await executeLocalInquiryRun(options)
  expect(first.status).toBe("completed")
  await writeFile(path.join(f.root, "source/app.py"), source.replace("item.sent = True", "item.sent = False"))
  let dispatched = false
  const next: any = await executeLocalInquiryRun({ ...options, previous: first.sessionPath, accountTransportFactory: () => { dispatched = true; return contractConsumer(() => {})() } })
  expect(next.status).toBe("invalid")
  expect(next.providerCalls).toBe(0)
  expect(next.executableContract?.resourceExecution?.returned).toBeUndefined()
  expect(next.diagnostics.some((d: any) => /source-stale/.test(d.code))).toBe(true)
  expect(dispatched).toBe(false)
})

test("source-changed previous edit without importing the old file restores only a repairable raw draft", async () => {
  const f = await contractFiles(), raw = { ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 17 }, source: at(7) }] } }
  await writeFile(f.domainProgramFile, JSON.stringify(raw))
  const first: any = await executeLocalInquiryRun({ inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir: path.join(f.root, "initial"), model: "gpt-5.6-sol", strategy: "question-checked-v1", harness: "codex-account", executionPolicy: "progressive", accountTransportFactory: contractConsumer(() => {}), execution: { sessionTimeoutMs: 5000 } })
  await writeFile(path.join(f.root, "source/app.py"), source.replace("item.sent = True", "item.sent = False"))
  const next: any = await executeLocalInquiryRun({ inputFile: f.inputFile, previous: first.sessionPath, outDir: path.join(f.root, "repair"), model: "gpt-5.6-sol", strategy: "question-checked-v1", harness: "codex-account", programMode: "edit", executionPolicy: "progressive", accountTransportFactory: contractConsumer(reply => {
    expect(reply.currentContext.authoring.draftRevision).toBe(first.domain.programDraft.currentDraft.revision)
    expect(reply.currentContext.authoring.computed).toBeUndefined()
    expect(reply.currentContext.remainingDuties.map((q: any) => q.questionId)).toEqual(["q", "other"])
  }, { tool: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: "other", state: "residual", reason: "Original duty retained" }] } }), execution: { sessionTimeoutMs: 5000 } })
  expect(next.status).toBe("completed")
  expect(next.reuse.change).toBe("source-changed")
  expect(next.reuse.answerReused).toBe(false)
  expect(next.domain.executableContract).toBeUndefined()
  expect(next.domain.programDraft.currentDraft.raw).toEqual(raw)
})

test("a partial progressive precheck cannot reimport stale frozen resource sources for account consumption", async () => {
  const f = await contractFiles(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  input.allowedPaths.push("helper.py")
  await writeFile(f.inputFile, JSON.stringify(input))
  await writeFile(path.join(f.root, "source/helper.py"), "# Independent selection\n\ndef select_version():\n    return 17\n")
  const raw = { ...f.contract, resourceWorkflow: { inputs: [], steps: [{ id: "result", op: "return", value: { literal: 17 }, source: { path: "helper.py", startLine: 3, endLine: 4 } }] } }
  await writeFile(f.domainProgramFile, JSON.stringify(raw))
  const options = { inputFile: f.inputFile, domainProgramFile: f.domainProgramFile, outDir: path.join(f.root, "partial-source-change"), model: "gpt-5.6-sol", strategy: "question-checked-v1" as const, harness: "codex-account" as const, executionPolicy: "progressive" as const, execution: { sessionTimeoutMs: 5000 } }
  const first: any = await executeLocalInquiryRun({ ...options, accountTransportFactory: contractConsumer(() => {}) })
  expect(first.status).toBe("completed")
  expect(first.domain.executableContract.resourceExecution.returned).toBe(17)
  await writeFile(path.join(f.root, "source/helper.py"), "# Independent selection\n\ndef select_version():\n    return 19\n")
  let dispatched = false
  const next: any = await executeLocalInquiryRun({ ...options, previous: first.sessionPath, accountTransportFactory: () => { dispatched = true; return contractConsumer(() => {})() } })
  expect(next.status).toBe("invalid")
  expect(next.providerCalls).toBe(0)
  expect(next.executableContract.resourceExecution.returned).toBeUndefined()
  expect(next.executableContract.evaluation.questions.find((q: any) => q.questionId === "q").properties[0].status).toBe("checked")
  expect(next.diagnostics.some((d: any) => d.code === "contract-resource-source" && d.message.startsWith("resource-source-stale:"))).toBe(true)
  expect(dispatched).toBe(false)
  expect(JSON.parse(await readFile(f.domainProgramFile, "utf8"))).toEqual(raw)
})
