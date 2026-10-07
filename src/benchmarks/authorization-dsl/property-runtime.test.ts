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

test("v5 prompt preserves the current frontier while retaining the complete dependency graph in its report", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-current-demand-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n" + Array.from({ length: 18 }, (_, i) => `    actor.operation_${i}()\n`).join("") + "    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["app.py"], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true })
  await runtime.sync()
  const context: any = runtime.promptContext(), view = context.tasks[0].propertyDemand
  const complete = runtime.report().propertyAnalysis!.demands[0]!
  expect(view.dependencies).toBeUndefined()
  expect(view.required).toBeUndefined()
  expect(view.deferred).toBeUndefined()
  expect(view.frontier).toEqual(complete.frontier)
  expect(view.coverage).toEqual(complete.coverage)
  expect(view.nextWork).toEqual(complete.nextWork)
  expect(view.dependencySummary).toMatchObject({ revision: complete.dependencies!.revision, edgeCount: complete.dependencies!.edges.length, boundaryCount: complete.dependencies!.boundaries.length })
  expect(complete.dependencies!.edges.length).toBeGreaterThan(100)
  expect(complete.required).toHaveLength(19)
  expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(Buffer.byteLength(JSON.stringify(complete)) / 2)
  const whole = (await tools.sourceSkeleton(context.tasks[0].sourceSkeleton.sourceId))!
  expect(whole.anchors.filter(a => a.kind === "call")).toHaveLength(18)
})

async function requestRuntimeFixture(repeated = false, routerConfiguration = false) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-request-relations-"))
  await writeFile(path.join(sourceRoot, "app.py"), `from fastapi import APIRouter, Depends, Request\ndef inner():\n    ${repeated ? "return True" : "raise Denied()"}\nrouter = APIRouter(${routerConfiguration ? "dependencies=[Depends(inner)]" : ""})\ndef outer(request: Request, flag=Depends(inner)):\n    return True\n@router.post("/work")\ndef endpoint(request: Request, actor=Depends(outer)${repeated ? ", second=Depends(outer)" : ""}):\n    return True\n`)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "POST /work", entryHint: "app.endpoint" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect POST /work", premises: [] }, { id: "other", operationId: "op", intent: "scope", request: "Explain original request limits", premises: [] }] })
  const units: any[] = []
  for (const name of ["endpoint", "outer", "inner", "POST /work"]) {
    const s = tools.structure!.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: s.path, startLine: s.startLine, endLine: s.endLine })
    units.push({ questionId: "q", itemId: name, handle: name, op: "add", role: name === "endpoint" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, evidenceIds: read.evidence.map(e => e.id), coverage: "path", start: "body", complete: true, fallthrough: "allow", parameters: s.parameters.map(p => ({ name: p.name, type: "value" })), blocks: [{ name: "body", steps: name === "inner" && !repeated ? [{ kind: "raise", name: "denied", claim: "Actual dependency rejection", exceptionType: "Denied", failureKind: "authorization" }] : name === "POST /work" ? [{ kind: "context", name: "registration", claim: "Actual registration source", relationship: "route-registration" }] : [{ kind: "return", name: "done", value: true, claim: "Actual source return", ...(name === "endpoint" ? { outcome: "allow" } : {}) }] }] })
  }
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true, initialSemanticUnits: units })
  await runtime.sync(false); await runtime.sync(false)
  return { runtime, units }
}
test("v5 runtime links exact nested request relations and retains every original question", async () => {
  const { runtime } = await requestRuntimeFixture()
  const report = runtime.report(), boundaries = report.worklist!.items.filter(i => i.frameworkBoundary && i.decisive)
  expect(new Set(boundaries.map(i => i.selected?.name))).toEqual(new Set(["POST /work", "outer", "inner"]))
  expect(boundaries.every(i => i.progress?.read && i.progress.interpreted && i.progress.linked)).toBe(true)
  expect(report.materialUses!.filter(u => u.kind === "framework")).toHaveLength(6)
  expect(report.delivery!.gaps.filter(g => g.code === "framework-dependency-open")).toEqual([])
  expect(report.slice.rules.filter(r => r.terminal).map(r => [r.questionId, r.outcome]).sort()).toEqual([["other", "deny"], ["q", "deny"]])
})
test("one adopted dependency occurrence cannot close another occurrence of the same source", async () => {
  const { runtime, units } = await requestRuntimeFixture(true), sourceId = units.find(u => u.handle === "outer").source.id
  const report = runtime.report(), boundaries = report.worklist!.frameworkBoundaries!.filter(b => b.sourceId === sourceId)
  expect(boundaries.filter(b => b.questionId === "q").map(b => b.state).sort()).toEqual(["checked", "read"])
  expect(boundaries.filter(b => b.questionId === "other").map(b => b.state).sort()).toEqual(["checked", "read"])
  expect(new Set(boundaries.map(b => b.key)).size).toBe(2)
  expect(report.delivery!.gaps.map(g => g.code)).toContain("framework-dependency-cache-unmodeled")
  const feedback = runtime.modelFeedback()
  if (!("questionProgress" in feedback)) throw new Error("v5 question progress is missing")
  expect(feedback.questionProgress.every(q => q.openDependencies.some(d => d.state === "read"))).toBe(true)
})
test("an unsupported request configuration retains its named blocked work instead of a location task", async () => {
  const { runtime } = await requestRuntimeFixture(false, true)
  const gap = runtime.report().worklist!.items.find(i => i.code === "framework-router-options-unmodeled")
  expect(gap).toMatchObject({ state: "blocked", nextAction: { kind: "none" }, decisive: true, frameworkBoundary: true })
  const feedback = runtime.modelFeedback()
  if (!("questionProgress" in feedback)) throw new Error("v5 question progress is missing")
  expect(feedback.questionProgress.every(q => q.openDependencies.length > 0)).toBe(true)
})

test("source middleware enters the shared worklist but reading and interpreting it cannot prove pipeline adoption", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-source-middleware-"))
  await writeFile(path.join(sourceRoot, "app.py"), 'from fastapi import FastAPI\nclass Filter:\n    def __init__(self, app):\n        self.app = app\n    async def __call__(self, scope, receive, send):\n        await self.app(scope, receive, send)\napp = FastAPI()\napp.add_middleware(Filter)\n@app.post("/work")\ndef endpoint():\n    return True\n')
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "POST /work", entryHint: "app.endpoint" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect POST /work", premises: [] }] })
  const units: any[] = []
  for (const name of ["endpoint", "__init__", "__call__", "POST /work"]) {
    const s = tools.structure!.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: s.path, startLine: s.startLine, endLine: s.endLine })
    units.push({ questionId: "q", itemId: name, handle: name, op: "add", role: name === "endpoint" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, ...(s.className ? { receiverClass: s.className } : {}), evidenceIds: read.evidence.map(e => e.id), coverage: "path", start: "body", complete: true, fallthrough: "allow", parameters: s.parameters.map(p => ({ name: p.name, type: "value" })), blocks: [{ name: "body", steps: [{ kind: "return", name: "done", value: true, claim: "Test-authored source interpretation, adoption still unproven", ...(name === "endpoint" ? { outcome: "allow" } : {}) }] }] })
  }
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true, initialSemanticUnits: units })
  await runtime.sync(false); await runtime.sync(false)
  const report = runtime.report(), middleware = report.worklist!.items.filter(i => i.receiverClass === "app.Filter")
  expect(middleware.map(i => i.selected!.name).sort()).toEqual(["__call__", "__init__"])
  expect(middleware.every(i => i.progress?.read && i.progress.interpreted && !i.progress.linked)).toBe(true)
  expect(report.worklist!.frameworkBoundaries!.filter(b => b.receiverClass === "app.Filter").every(b => b.state === "read")).toBe(true)
  expect(report.delivery!.gaps.map(g => g.code)).toContain("framework-router-options-unmodeled")
  expect(report.materialUses!.filter(u => u.kind === "framework")).toEqual([])
})

test("reading and interpreting generic class decorator sources leaves the transformation blocked and the original question partial", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-class-decorator-"))
  await writeFile(path.join(sourceRoot, "wrappers.py"), "def factory():\n    def apply(cls):\n        cls.changed = True\n        return cls\n    return apply\n")
  await writeFile(path.join(sourceRoot, "app.py"), "from wrappers import factory\n@factory()\nclass View:\n    def run(self):\n        return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect class method", entryHint: "app.View.run" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect class method", premises: [] }] }), units: any[] = []
  for (const name of ["app.View.run", "wrappers.factory", "wrappers.factory.apply"]) {
    const s = tools.structure!.symbols.find(s => s.qualifiedName === name)!, read = await tools.execute("source_read", { path: s.path, startLine: s.startLine, endLine: s.endLine })
    units.push({ questionId: "q", itemId: name, handle: name.replaceAll(".", "-"), op: "add", role: name === "app.View.run" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, ...(s.className ? { receiverClass: s.className } : {}), evidenceIds: read.evidence.map(e => e.id), coverage: "path", start: "body", complete: true, parameters: s.parameters.map(p => ({ name: p.name, type: "value" })), blocks: [{ name: "body", steps: [{ kind: "return", name: "done", value: true, claim: "Anonymous test interpretation; class transformation unadopted", ...(name === "app.View.run" ? { outcome: "allow" } : {}) }] }] })
  }
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true, initialSemanticUnits: units })
  await runtime.sync(false); await runtime.sync(false)
  const report = runtime.report(), candidates = report.worklist!.items.filter(i => i.selected?.path === "wrappers.py")
  expect(candidates.length).toBeGreaterThan(0)
  expect(candidates.every(i => i.progress?.read && i.progress.interpreted && !i.progress.linked)).toBe(true)
  expect(report.worklist!.items.find(i => i.code === "source-class-decorator-transformation-unadopted")).toMatchObject({ state: "blocked", decisive: true, frameworkBoundary: true, receiverClass: "app.View" })
  expect(report.materialUses!.filter(u => u.kind === "framework")).toEqual([])
  const checked = await runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "allow", explanation: "Method body omits class transformation" }, branches: [], evidenceIds: units[0].evidenceIds, missing: [] }], observations: [], scope: "local" })
  expect(checked.taskResolution).toBe("partial")
  expect(checked.questionChecks[0]!.evidenceCoverage).toBe("unresolved")
})
