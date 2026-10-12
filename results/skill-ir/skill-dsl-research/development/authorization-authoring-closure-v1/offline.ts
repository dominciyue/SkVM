import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { checkAuthorizationInquiry, saveLocalInquiryCheck, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"

const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), examples = path.join(repo, "examples/authorization-assessment")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const save = async (p: string, v: unknown) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(v, null, 2) + "\n", "utf8") }
const shareOnly = process.argv.includes("--share")
const observations: any[] = shareOnly ? (await load(path.join(base, "verification/offline-progress.json"))).filter((o: any) => o.task === "download") : []
for (const task of shareOnly ? ["share"] : ["download", "share"]) {
  const example = path.join(examples, task === "download" ? "download-workflow" : "share-create-workflow")
  const variants = task === "download" ? ["root-default", "empty-version", "denied", "missing-owner", "root-fallback", "explicit-version", "null-actor", "stale-helper"] : ["allowed", "denied", "missing-principal", "wrong-resource", "wrong-actor", "unknown-grants"]
  for (const variant of variants) {
    const origin = path.join(example, `inputs/${["explicit-version", "null-actor", "stale-helper"].includes(variant) ? "root-default" : variant}.json`), input = await load(origin), authored = await load(path.join(example, "program.json")), q = authored.scope.questionId
    input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(origin), input.sourceRoot)).split(path.sep).join("/")
    if (variant === "explicit-version") input.resourceInputs[q].request.version = "12"
    if (variant === "null-actor") input.resourceInputs[q].actor = null
    if (variant === "stale-helper") for (const s of authored.resourceWorkflow.steps) for (const cite of [s.source, ...(s.sources ?? [])]) if (cite.path === "src/documents/permissions.py") cite.sha256 = "0".repeat(64)
    const inputFile = path.join(base, `inputs/offline-${task}-${variant}.json`), programFile = path.join(base, `offline-programs/${task}-${variant}.json`)
    await save(inputFile, input); await save(programFile, authored)
    const checked = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive" }), execution = (checked.executableContract as any)?.resourceExecution
    assert.equal(checked.status, "valid", JSON.stringify(checked.diagnostics)); assert.ok(execution)
    if (task === "download") {
      if (variant === "root-default") assert.equal(execution.returned.file_document_id, 11)
      if (["empty-version", "explicit-version"].includes(variant)) assert.equal(execution.returned.file_document_id, 12)
      if (variant === "denied") assert.equal(execution.termination, "HttpResponseForbidden")
      if (["missing-owner", "null-actor", "stale-helper"].includes(variant)) assert.ok(execution.conditions.length || execution.gaps.some((g: string) => g.includes("source")))
    } else {
      if (variant === "allowed") assert.equal(execution.returned.document_id, 10)
      if (["denied", "wrong-resource", "wrong-actor"].includes(variant)) assert.equal(execution.termination, "serializer-object-permission-denied")
      if (variant === "missing-principal") assert.equal(execution.termination, "endpoint-authentication-denied")
      if (variant === "unknown-grants") assert.ok(execution.conditions.length)
    }
    observations.push({ task, variant, providerCalls: 0, returned: execution.returned, termination: execution.termination, conditions: execution.conditions, gaps: execution.gaps, diagnostics: checked.executableContract?.diagnostics })
    await save(path.join(base, "verification/offline-progress.json"), observations)
    console.log(JSON.stringify({ task, variant, passed: true }))
    if (task === "share" && variant === "allowed") {
      const saved = await saveLocalInquiryCheck(inputFile, programFile, path.join(base, "zero-model/share-allowed"), checked, { executionPolicy: "progressive" })
      assert.equal((await inspectLocalInquiry(saved.sessionPath)).execution.resourceExecution.returned.document_id, 10)
      const runtime = await createNativeInquiryRuntime({ inputFile, domainProgramFile: programFile, workDir: base, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", maxToolCalls: 128 })
      try {
        const report: any = runtime.report(), draft = report.domain.programDraft.currentDraft, steps = draft.raw.resourceWorkflow.steps, source = steps.at(-1).source
        const patch: any = { baseRevision: draft.revision, upsertSteps: [{ id: "development_guard", op: "guard", test: { op: "eq", left: { literal: 1 }, right: { literal: 2 } }, failure: "development-rejection", source }], stepOrder: [...steps.slice(0, -1).map((s: any) => s.id), "development_guard", steps.at(-1).id] }
        await runtime.execute({ id: "ordered-share", name: "authorization_program_patch", arguments: patch })
        assert.equal(runtime.report().domain!.executableContract!.resourceExecution!.termination, "development-rejection")
        const next: any = runtime.report().domain!.programDraft.currentDraft
        const bad = JSON.parse((await runtime.execute({ id: "bad-order", name: "authorization_program_patch", arguments: { baseRevision: next.revision, upsertSteps: [], removeStepIds: ["development_guard"], stepOrder: next.raw.resourceWorkflow.steps.map((s: any) => s.id) } })).output)
        assert.ok(bad.controlDiagnostics.some((d: any) => d.code === "program-patch-order"))
        assert.equal(runtime.report().domain!.programDraft.currentDraft!.revision, next.revision)
        await runtime.execute({ id: "remove-share-guard", name: "authorization_program_patch", arguments: { baseRevision: next.revision, upsertSteps: [], removeStepIds: ["development_guard"], stepOrder: steps.map((s: any) => s.id) } })
        assert.equal((runtime.report().domain!.executableContract!.resourceExecution!.returned as any).document_id, 10)
        const retained: any = JSON.parse(JSON.stringify(runtime.report().domain!.programDraft.currentDraft))
        const restored = await createNativeInquiryRuntime({ inputFile, workDir: base, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", maxToolCalls: 128, reuse: { info: {} as any, seed: { delta: { schemaVersion: "authorization-control-slice/v1", rules: [], dependencies: [], bindings: [], policyRules: [] }, evidence: runtime.report().evidence, programDraft: retained } } })
        try {
          if (!restored.report().domain) await restored.execute({ id: "prepare-restored-share", name: "authorization_prepare_properties", arguments: { schemaVersion: "authorization-property-intent/v1", questions: [{ questionId: q, state: "residual", reason: "Continue source program authoring; original duty remains" }] } })
          assert.equal(restored.report().domain!.programDraft.currentDraft!.revision, retained.revision)
          assert.equal(restored.report().domain!.executableContract, undefined)
          const details = JSON.parse((await restored.execute({ id: "raw-detail", name: "authorization_program_details", arguments: { view: "draft", expectedRevision: retained.revision, stepId: steps.at(-1).id } })).output)
          assert.equal(details.steps.length, 1); assert.equal(details.events.length, 0)
        } finally { await restored.close() }
        observations.push({ task: "share", variant: "ordered-edit-rejected-order-removal-and-restore", providerCalls: 0, passed: true, semanticSupport: "developer-authored development check" })
      } finally { await runtime.close() }
    }
  }
}
const legacy = path.resolve(base, "../authorization-incremental-program-v1/runs/A1-first/sessions/2026-10-12T103607737Z-12e84cc9")
assert.equal((await inspectLocalInquiry(legacy)).execution.schemaVersion, "authorization-execution/v1")
await save(path.join(base, "verification/offline.json"), { providerCalls: 0, observations, legacyV1Inspectable: true, interpretation: "Existing developer programs and finite exposed inputs. No automatic author transfer or research readiness claim." })
console.log(JSON.stringify({ passed: observations.length, providerCalls: 0, legacyV1Inspectable: true }))
