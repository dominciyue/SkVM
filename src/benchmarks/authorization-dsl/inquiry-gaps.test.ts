import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"

async function setup(content = "def entry(flag):\n    if flag:\n        return True\n    return False\n", mode = "behavior") {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-gaps-"))
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["."], structure: true })
  const input = { schemaVersion: "authorization-inquiry/v1", mode, questions: [{ id: "q", request: "Inspect app.entry for the unspecified caller conditions", premises: [] }] }
  const program = compileAuthorizationInquiry(input, { allowMissingPolicy: true })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v1", sourceAssisted: true })
  await runtime.sync()
  const context: any = runtime.promptContext(), skeleton = context.tasks[0]?.sourceSkeleton
  const interpretation = skeleton && { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.map((a: any) => ({ anchorId: a.id, role: a.kind === "condition" || a.kind === "call" ? "condition" : "context", explanation: a.kind === "return" ? "Actual source returning branch" : "Actual shown source role", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: "flag" }, right: { literal: true } } } : a.kind === "return" ? { returnOutcome: a.valueExpression === "False" ? "deny" : "allow" } : {}) })), unresolved: [] }
  const interpret = () => runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: context.focus.id, interpretation })
  const finish = (extra = {}) => {
    const final: any = runtime.promptContext({ finalOnly: true })
    return runtime.assembleResult({ schemaVersion: "authorization-focused-result/v1", focusId: final.focus.id, answers: [{ explanation: "Source behavior is conditional on the supplied flag; both alternatives remain.", ...extra }], scope: "Current shown source" })
  }
  return { sourceRoot, tools, program, runtime, context, interpret, finish }
}

test("an actually read unlinked callee is an interpretation gap rather than an unread source gap", async () => {
  const f = await setup("def entry(flag):\n    output = decide(flag)\n    return True\ndef decide(flag):\n    return flag\n")
  await f.interpret()
  expect(f.tools.evidence.some(e => e.quote.includes("def decide"))).toBe(true)
  const delivery = f.runtime.deliverySnapshot()
  expect(delivery.gaps.some(g => g.kind === "interpretation-gap" && /decide|callee|interpret/.test(g.detail))).toBe(true)
  expect(delivery.gaps.some(g => g.kind === "source-gap" && g.detail.includes("decide"))).toBe(false)
  const assembled = f.finish()
  expect((assembled.result as any).questions[0].missing.some((m: any) => m.kind === "interpretation-gap")).toBe(true)
})

test("an incompletely read original function keeps a distinct source gap and no shown skeleton", async () => {
  const f = await setup("def entry(flag):\n" + "    # original source line\n".repeat(400) + "    return True\n")
  expect(f.runtime.deliverySnapshot().gaps).toContainEqual(expect.objectContaining({ kind: "source-gap", code: "source-range-unread" }))
  const entry = f.runtime.report().worklist!.items.find(i => i.origin === "question-duty" && i.kind === "entry")!
  expect(entry.progress).toMatchObject({ found: true, read: false, skeleton: false, interpreted: false })
  expect(f.context.tasks).toHaveLength(0)
})

test("unknown user conditions permit a complete behavior answer without independent policy", async () => {
  const f = await setup()
  await f.interpret()
  const assembled = f.finish(), checked = await f.runtime.validate(assembled.result), delivery = f.runtime.deliverySnapshot()
  expect(checked).toMatchObject({ ruleConsistency: true, taskResolution: "bounded" })
  expect(delivery.gaps.some(g => g.kind === "premise-unknown")).toBe(true)
  expect(delivery.gaps.some(g => g.kind === "policy-unspecified")).toBe(false)
  expect((delivery.machineAnswer as any).questions[0].behavior.disposition).toBe("conditional")
  expect(delivery.check?.revision).toBe(delivery.revision)
  expect(delivery.obligations).toHaveLength(6)
})

test("missing conformance policy blocks only the independent comparison while retaining source behavior", async () => {
  const f = await setup(undefined, "conformance")
  expect(f.program.status).toBe("ready")
  await f.interpret()
  const assembled = f.finish()
  await f.runtime.validate(assembled.result)
  const delivery = f.runtime.deliverySnapshot()
  expect(delivery.gaps.find(g => g.kind === "policy-unspecified")).toMatchObject({ affects: "conformance" })
  expect((delivery.machineAnswer as any).questions[0]).toMatchObject({ behavior: { disposition: "conditional" }, policyAssessment: { status: "undetermined" } })
  expect(compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "conformance", questions: [{ id: "q", request: "Inspect source", premises: [] }] }).status).toBe("needs-input")
})

test("failed final checks retain current independent source explanations without inheriting a valid result", async () => {
  const f = await setup()
  await f.interpret()
  const assembled = f.finish({ disposition: "allow" })
  expect(assembled.diagnostics.some(d => d.code === "semantic-disposition-conflict")).toBe(true)
  await f.runtime.validate(assembled.result)
  const delivery = f.runtime.deliverySnapshot()
  expect(delivery.check).toMatchObject({ revision: delivery.revision, ruleConsistency: false })
  expect(delivery.retainedSources).toHaveLength(1)
  expect(delivery.retainedSources[0]!.explanations.some(e => e.includes("Actual source"))).toBe(true)
  expect(delivery.semanticSupport).toBe("unreviewed")
})

test("a rejected current update immediately withdraws an old delivery and source invalidation removes its live explanations", async () => {
  const f = await setup()
  await f.interpret()
  const assembled = f.finish()
  await f.runtime.validate(assembled.result)
  expect(f.runtime.deliverySnapshot().check?.ruleConsistency).toBe(true)
  await f.runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: "stale", interpretation: {} })
  expect(f.runtime.deliverySnapshot().machineAnswer).toBeUndefined()
  expect(f.runtime.deliverySnapshot().check).toBeUndefined()
  expect(f.runtime.deliverySnapshot().retainedSources).toHaveLength(1)
  await writeFile(path.join(f.sourceRoot, "app.py"), "def entry(flag):\n    return False\n")
  await f.tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 2 })
  await f.runtime.sync(false)
  expect(f.runtime.deliverySnapshot().retainedSources).toHaveLength(0)
  expect(f.runtime.deliverySnapshot().gaps.some(g => g.kind === "source-gap" && g.code === "source-invalidated")).toBe(true)
})

test("final snapshot verification withdraws frozen source delivery while preserving historical checks", async () => {
  const f = await setup()
  await f.interpret()
  await f.runtime.validate(f.finish().result)
  f.runtime.close()
  expect(f.runtime.deliverySnapshot().check?.ruleConsistency).toBe(true)
  await writeFile(path.join(f.sourceRoot, "app.py"), "def entry(flag):\n    return False\n")
  expect(await f.tools.verifySnapshot()).toMatchObject({ valid: false })
  const delivery = f.runtime.deliverySnapshot(), report = f.runtime.report()
  expect(delivery.machineAnswer).toBeUndefined()
  expect(delivery.check).toBeUndefined()
  expect(delivery.retainedSources).toEqual([])
  expect(delivery.gaps).toContainEqual(expect.objectContaining({ kind: "source-gap", code: "source-invalidated" }))
  expect(report.delivery).toEqual(delivery)
  expect(report.check).toBeUndefined()
  expect(report.checkHistory).toHaveLength(1)
})
