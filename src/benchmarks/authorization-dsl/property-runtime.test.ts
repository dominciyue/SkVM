import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"

test("v4 retains local source fields, advances an eight-anchor frontier and merges their unknown failures", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ax-runtime-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n" + Array.from({ length: 18 }, (_, i) => `    actor.context_${i}()\n`).join("") + "    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["app.py"], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v4", sourceAssisted: true })
  await runtime.sync()
  const context: any = runtime.promptContext(), id = context.focus.id
  expect(context.tasks[0].propertyDemand.frontier).toHaveLength(8)
  const sourceId = context.tasks[0].sourceSkeleton.sourceId, whole = (await tools.sourceSkeleton(sourceId))!
  expect(whole.anchors.filter(a => a.kind === "call")).toHaveLength(18)
  let current = context, submitted = 0
  for (let round = 0; round < 3; round++) {
    expect(current.focus.id).toBe(id)
    const task = current.tasks[0], d = task.propertyDemand
    const annotations = d.frontier.map((r: any) => ({ anchorId: r.anchorId, role: "context", explanation: "Test-authored source context or normal return", ...(r.field === "returnOutcome" ? { returnOutcome: "allow" } : {}) }))
    submitted += annotations.length
    const result = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: id, interpretation: { schemaVersion: "source-interpretation/v1", revision: whole.revision, annotations } })
    if (round < 2) { expect(result.diagnostics.length).toBeGreaterThan(0); current = runtime.promptContext() }
    else expect(result.diagnostics.some(d => /semantic-(path|node)-limit|source-interpretation/.test(d.code))).toBe(false)
  }
  const report = runtime.report()
  expect(submitted).toBe(19)
  expect(report.focus!.sourceDrafts[0]!.interpretation.annotations).toHaveLength(19)
  expect(report.propertyAnalysis!.metrics.contextOriginsRepresented).toBe(18)
  expect(report.propertyAnalysis!.demands[0]!.coverage.propertyCovered).toBe(true)
  expect(report.propertyAnalysis!.demands[0]!.coverage.wholeAnswerSufficient).toBe(false)
  expect(report.sourceMaterials!.materials).toHaveLength(1)
  expect(report.slice.rules.filter(r => r.terminal).map(r => r.outcome ?? "unknown").sort()).toEqual(["allow", "unknown"])
  expect(report.promptPayloads!.length).toBeGreaterThan(0)
  expect(report.promptPayloads!.every(p => p.bytes > 0)).toBe(true)
})

test("v4 prioritizes a decisive source shared by original questions while retaining every duty", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ax-shared-demand-"))
  await writeFile(path.join(sourceRoot, "single.py"), "def entry():\n    return False\n")
  await writeFile(path.join(sourceRoot, "shared.py"), "def entry():\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "single", request: "Inspect single.entry", entryHint: "single.entry" }, { id: "shared", request: "Inspect shared.entry", entryHint: "shared.entry" }], questions: [{ id: "a", operationId: "single", intent: "behavior", request: "Inspect single.entry", premises: [] }, { id: "b", operationId: "shared", intent: "behavior", request: "Inspect shared.entry", premises: [] }, { id: "c", operationId: "shared", intent: "scope", request: "Explain shared.entry limits", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v4", sourceAssisted: true })
  await runtime.sync()
  expect(tools.history[0]!.arguments).toMatchObject({ path: "shared.py" })
  const context: any = runtime.promptContext()
  expect(context.focus.questionId).toBe("b")
  expect(context.tasks[0].propertyDemand.affectedQuestionIds).toEqual(["b", "c"])
  expect(runtime.report().worklist!.items.filter(i => i.origin === "question-duty")).toHaveLength(12)
  expect(program.questions.map(q => q.id)).toEqual(["a", "b", "c"])
})

test("v5 cannot close a method while the source-qualified upstream framework boundary is unlinked", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-framework-boundary-"))
  await mkdir(path.join(sourceRoot, "rest_framework"))
  await writeFile(path.join(sourceRoot, "rest_framework/views.py"), "class Base:\n    def dispatch(self, request):\n        self.initial(request)\n        return self.handle(request)\n    def initial(self, request):\n        return self.check_permissions(request)\n    def check_permissions(self, request):\n        return False\n")
  await writeFile(path.join(sourceRoot, "app.py"), "from rest_framework.views import Base\nclass View(Base):\n    def handle(self, request):\n        return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.View.handle", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true })
  await runtime.sync()
  const context: any = runtime.promptContext(), task = context.tasks[0]
  const accepted = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: context.focus.id, interpretation: { schemaVersion: "source-interpretation/v1", revision: task.sourceSkeleton.revision, annotations: task.sourceSkeleton.anchors.filter((a: any) => a.kind === "return").map((a: any) => ({ anchorId: a.id, role: "context", returnOutcome: "allow", explanation: "The method normally returns True" })) } })
  expect(accepted.diagnostics).toEqual([])
  const checked = await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Method-only result omits upstream framework" }, branches: [], evidenceIds: task.evidenceIds, missing: [] }], observations: [], scope: "local" })
  expect(checked.taskResolution).toBe("partial")
  expect(checked.diagnostics.map(d => d.code)).toContain("decisive-dependency-open")
  expect(checked.questionChecks[0]!.evidenceCoverage).toBe("unresolved")
})
