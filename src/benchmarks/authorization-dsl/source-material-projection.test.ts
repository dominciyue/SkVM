import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { createSourceMaterials } from "../../task-dsl/authorization/source-materials.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { lowerSemanticFlow } from "../../task-dsl/authorization/semantic-flow.ts"
import { lowerSourceInterpretation } from "../../task-dsl/authorization/source-interpretation.ts"
import { sourceRelationRevision } from "./operation-work.ts"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
const api = await import("./source-material-projection.ts").catch(() => ({} as any))
const content = "def entry(actor):\n    return helper(actor)\ndef helper(actor):\n    return actor\ndef unrelated(actor):\n    return actor\n"
const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect entry", premises: [] }, { id: "other", operationId: "op", intent: "scope", request: "Explain alternatives", premises: [] }] })
async function fixture() {
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  const unit = (name: string): any => { const s = index.symbols.find(s => s.name === name)!; return { questionId: "q", itemId: name, handle: name, op: "add", role: name === "entry" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, evidenceIds: ["ev"], start: "body", complete: true, coverage: "path", parameters: [{ name: "actor", type: "principal" }], blocks: [{ name: "body", steps: [{ kind: "return", name: "returned", claim: "Test-authored source return", object: "actor", ...(name === "entry" ? { outcome: "allow" } : {}) }] }] } }
  const entry = unit("entry"), helper = unit("helper"), unrelated = unit("unrelated"), call = index.relatedCalls(entry.source.id)[0]!
  entry.blocks[0].steps.unshift({ kind: "call", name: "call", claim: "Actual source relation", sourceCallId: call.id, symbol: "helper", arguments: [{ parameter: "actor", object: "actor" }] })
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "finite-control/v1" })
  const accept = (u: any) => store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
  return { index, entry, helper, unrelated, store, accept }
}
test("helper-only materials have no projection; a later actual entry uses only its reachable helper", async () => {
  const f = await fixture(); const helper = f.accept(f.helper); f.accept(f.unrelated)
  expect(api.projectSourceMaterials(program, [], f.store.snapshot(), f.index).units).toEqual([])
  const entry = f.accept(f.entry), projected = api.projectSourceMaterials(program, [f.entry], f.store.snapshot(), f.index)
  expect(projected.units).toHaveLength(4)
  expect(new Set(projected.uses.map((u: any) => u.materialId))).toEqual(new Set([entry.id, helper.id]))
  expect(projected.uses.filter((u: any) => u.kind === "call").every((u: any) => !!u.relationId && u.arguments[0].object === "actor")).toBe(true)
  expect(api.projectSourceMaterials(program, [], f.store.snapshot(), f.index).uses).toEqual([])
  expect(f.store.snapshot().materials.filter(m => m.current)).toHaveLength(3)
})
test("a foreign source call identity never adopts a same-named helper", async () => {
  const f = await fixture(); f.entry.blocks[0].steps[0].sourceCallId = "other-owner-call"; f.accept(f.helper); f.accept(f.entry)
  const projected = api.projectSourceMaterials(program, [f.entry], f.store.snapshot(), f.index)
  expect(projected.uses.filter((u: any) => u.kind === "call")).toEqual([])
  expect(projected.units.filter((u: any) => u.role === "helper")).toEqual([])
})

test("an exact call with a swapped actual argument cannot adopt otherwise valid helper material", async () => {
  const f = await fixture(); f.entry.blocks[0].steps[0].arguments[0].object = "different_actor"; f.accept(f.helper); f.accept(f.entry)
  expect(api.projectSourceMaterials(program, [f.entry], f.store.snapshot(), f.index).uses.filter((u: any) => u.kind === "call")).toEqual([])
})
test("an entry reaccepted after an intermediate interpretation projects its actual reachable helper", async () => {
  const f = await fixture(), helper = f.accept(f.helper), original = f.accept(f.entry)
  const intermediate = structuredClone(f.entry)
  intermediate.blocks[0].steps[0].claim = "Intermediate test-authored call interpretation"
  f.accept(intermediate)
  const refreshed = { ...f.entry, handle: "current-entry", itemId: "current-focus", op: "replace", evidenceIds: ["current-evidence"] }
  f.accept(refreshed)
  const projected = api.projectSourceMaterials(program, [refreshed], f.store.snapshot(), f.index)
  expect(projected.units).toHaveLength(4)
  expect(new Set(projected.uses.map((u: any) => u.materialId))).toEqual(new Set([original.id, helper.id]))
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(projected.units.filter((u: any) => u.role === "entry").every((u: any) => u.handle === "current-entry")).toBe(true)
})
test("production v3 persists helper-only material before any entry and emits no answer rules", async () => {
  const f = await fixture(), sourceRoot = await mkdtemp(path.join(os.tmpdir(), "aw-material-runtime-"))
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1" })
  f.accept(f.helper)
  const domain = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v3" as any, sourceAssisted: true, initialSemanticUnits: [f.helper], initialSourceMaterials: f.store.snapshot() })
  expect((domain.report() as any).sourceMaterials.materials.filter((m: any) => m.current)).toHaveLength(1)
  expect((domain.report() as any).sourceMaterials.materials.find((m: any) => m.current).interpretationSource).toBe("test-authored")
  expect(domain.report().slice.rules).toEqual([])
})

test("v5 material footprints belong to their source receiver rather than the whole work queue", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-framework-footprints-"))
  await mkdir(path.join(sourceRoot, "rest_framework"))
  await writeFile(path.join(sourceRoot, "rest_framework/views.py"), "class Base:\n    def dispatch(self, request):\n        return True\n")
  await writeFile(path.join(sourceRoot, "alpha.py"), "from rest_framework.views import Base\nclass Alpha(Base):\n    def run_alpha(self, request):\n        return True\ndef helper(request):\n    return request\n")
  await writeFile(path.join(sourceRoot, "beta.py"), "from rest_framework.views import Base\nclass Beta(Base):\n    def run_beta(self, request):\n        return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "alpha", request: "run_alpha", entryHint: "run_alpha" }, { id: "beta", request: "run_beta", entryHint: "run_beta" }], questions: [{ id: "a", operationId: "alpha", intent: "behavior", request: "run_alpha", premises: [] }, { id: "b", operationId: "beta", intent: "behavior", request: "run_beta", premises: [] }] })
  const units: any[] = []
  for (const [name, questionId] of [["run_alpha", "a"], ["run_beta", "b"], ["helper", "a"]]) {
    const s = tools.structure!.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: s.path, startLine: s.startLine, endLine: s.endLine })
    units.push({ itemId: name, handle: name, questionId, op: "add", role: name === "helper" ? "helper" : "entry", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, receiverClass: s.className, evidenceIds: read.evidence.map(e => e.id), coverage: "path", start: "body", complete: true, parameters: s.parameters.map(p => ({ name: p.name, type: "value" })), blocks: [{ name: "body", steps: [{ kind: "return", name: "done", claim: "Anonymous actual source return", value: true, ...(name === "helper" ? {} : { outcome: "allow" }) }] }] })
  }
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true, initialSemanticUnits: units })
  await runtime.sync(false)
  const { questionId: _q, evidenceIds: _e, source: _s, receiverClass: _r, ...replacement } = units[0]
  await runtime.propose({ schemaVersion: "authorization-semantic-update/v1", semanticBlocks: [{ ...replacement, op: "replace" }] })
  const materials = runtime.report().sourceMaterials!.materials.filter(m => m.current)
  const keys = (name: string) => materials.find(m => m.unit.handle === name)!.dependencies.filter(d => d.kind === "framework-model").map(d => d.key)
  expect(keys("run_alpha")).toEqual(["drf-source-dispatch/v2:alpha.Alpha"])
  expect(keys("run_beta")).toEqual(["drf-source-dispatch/v2:beta.Beta"])
  expect(keys("helper")).toEqual([])
  const snapshot = runtime.report().sourceMaterials!, files = await Promise.all(["alpha.py", "beta.py", "rest_framework/views.py"].map(async file => ({ path: file, content: await readFile(path.join(sourceRoot, file), "utf8") })))
  const project = async (current: typeof files) => api.projectSourceMaterials(program, units, snapshot, await buildStructureIndex(current, { repository: "anonymous", sourceRef: "r" }))
  expect((await project([...files, { path: "rest_framework/unused.py", content: "class Unused:\n    def check(self):\n        return False\n" }])).units.map((u: any) => u.handle).sort()).toEqual(["run_alpha", "run_beta"])
  expect((await project(files.map(f => f.path === "beta.py" ? { ...f, content: f.content.replace("True", "False") } : f))).units.map((u: any) => u.handle)).toEqual(["run_alpha"])
  expect((await project(files.map(f => f.path === "rest_framework/views.py" ? { ...f, content: f.content.replace("True", "False") } : f))).uses).toEqual([])
})

async function requestFixture(nested = false, registered = true, transform: (source: string) => string = source => source) {
  const content = transform(`from fastapi import APIRouter, Depends, Request\nrouter = APIRouter()\n${nested ? "def lookup(request: Request):\n    actor = request.user\n    return actor\ndef verify(actor=Depends(lookup)):\n    return actor\n" : "def verify(request: Request):\n    raise Denied()\n"}${registered ? '@router.post("/work")\n' : ""}def endpoint(request: Request, actor=Depends(verify)):\n    resource = request.resource\n    write(actor, resource)\n    return True\n`)
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }), accepted: any[] = []
  const accept = (name: string, role: string, steps: any[], types: Record<string, string> = {}) => {
    const source = index.symbols.find(s => s.name === name)!, unit: any = { itemId: name, handle: name, questionId: "q", op: "add", role, source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, evidenceIds: [`ev-${source.id}`], coverage: "path", start: "body", complete: true, fallthrough: "allow", parameters: source.parameters.map(p => ({ name: p.name, type: types[p.name] ?? "value" })), blocks: [{ name: "body", steps }] }
    store.accept(unit, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }], "test-authored"); accepted.push(unit); return unit
  }
  if (registered && index.symbols.some(s => s.name === "POST /work")) accept("POST /work", "helper", [{ kind: "context", name: "registration", claim: "Actual source registration", relationship: "route-registration" }])
  if (nested) accept("lookup", "helper", [{ kind: "bind", name: "actor", type: "principal", claim: "Test-authored source object reading" }, { kind: "return", name: "returned", object: "actor", claim: "Actual actor return" }])
  accept("verify", "helper", nested ? [{ kind: "return", name: "returned", object: "actor", claim: "Actual dependency return" }] : [{ kind: "raise", name: "denied", exceptionType: "Denied", failureKind: "authorization", claim: "Actual source rejection" }], nested ? { actor: "principal" } : {})
  const entry = accept("endpoint", "entry", [{ kind: "bind", name: "resource", type: "resource", claim: "Test-authored source resource reading" }, { kind: "effect", name: "write", principal: "actor", resource: "resource", operation: "write", claim: "Actual protected source write" }, { kind: "return", name: "done", value: true, outcome: "allow", claim: "Test-authored entry outcome" }], { actor: "principal" })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "request", request: "POST /work", entryHint: "endpoint" }], questions: [{ id: "q", operationId: "request", intent: "behavior", request: "Inspect this request", premises: [] }] })
  return { index, store, accepted, entry, program, project: (snapshot = store.snapshot()) => api.projectSourceMaterials(program, accepted, snapshot, index, { questionDirected: true }) }
}
test("v5 request projection runs the actual source dependency before the endpoint effect", async () => {
  const f = await requestFixture(), projected = f.project()
  expect(projected.uses.filter((u: any) => u.kind === "framework")).toHaveLength(2)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(f.store.snapshot().materials.find(m => m.unit.handle === "endpoint")!.unit.parameters.some(p => p.name === "actor")).toBe(true)
})
test("a proven framework request supplies Request to a dependency even without an endpoint Request parameter", async () => {
  const f = await requestFixture(false, true, source => source.replace("def endpoint(request: Request, actor=", "def endpoint(actor=").replace("resource = request.resource", "resource = object()")), projected = f.project()
  expect(lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }).delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(projected.uses.find((u: any) => u.kind === "entry").contextArguments).toEqual([{ parameter: "$request-context", object: "$request-context" }])
  expect(projected.uses.find((u: any) => u.frameworkModel === "fastapi-source-injection/v1").arguments).toEqual([{ parameter: "request", object: "$request-context" }])
  expect(f.entry.parameters.map((p: any) => p.name)).toEqual(["actor"])
})
test("v5 nested request dependencies return the same typed principal to the endpoint", async () => {
  const f = await requestFixture(true), projected = f.project()
  expect(projected.uses.filter((u: any) => u.kind === "framework")).toHaveLength(3)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.kind === "effect").map(r => r.principal)).toEqual(lowered.delta.rules.filter(r => r.kind === "binding" && r.bindingKind === "principal").map(r => r.bindingKey))
  expect(projected.units.find((u: any) => u.role === "entry").parameters.map((p: any) => p.name)).toEqual(["request"])
  const outer = projected.uses.find((u: any) => u.kind === "framework" && u.sourceId === f.accepted.find(u => u.handle === "verify").source.id)
  expect(outer.arguments).toEqual([])
  expect(outer.contextArguments).toEqual([{ parameter: "$request-context", object: "request" }])
})
test("dependencies with only injected arguments need no synthetic Request parameter", async () => {
  const f = await requestFixture(true, true, source => source.replace("def lookup(request: Request):", "def lookup():")), projected = f.project()
  const outer = projected.uses.find((u: any) => u.kind === "framework" && u.sourceId === f.accepted.find(u => u.handle === "verify").source.id)
  expect(outer.arguments).toEqual([])
  expect(projected.units.find((u: any) => u.handle === outer.projectedHandle).parameters).toEqual([])
  expect(lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true }).diagnostics).toEqual([])
})
test("an unadopted request dependency remains a source gap before the endpoint", async () => {
  const f = await requestFixture(), snapshot = f.store.snapshot(); snapshot.materials = snapshot.materials.filter(m => m.unit.handle !== "verify")
  const lowered = lowerSemanticFlow(f.project(snapshot).units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics.map(d => d.code)).toContain("framework-dependency-uninterpreted")
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
})
test("ordinary Python default declarations never invoke request dependencies", async () => {
  const f = await requestFixture(false, false), projected = f.project()
  expect(projected.uses.filter((u: any) => u.kind === "framework")).toEqual([])
  expect(lowerSemanticFlow(projected.units).delta.rules.some(r => r.kind === "effect")).toBe(true)
})
for (const [statement, expected] of [["Request = replacement\n", "framework-request-argument-unbound"], ["verify = replacement\n", "framework-dependency-target-rebound"], ["verify.__code__ = replacement\n", "framework-dependency-target-rebound"], ["Depends = replacement\n", "framework-constructor-rebound"]] as const) test(`rebound request source binding ${statement.trim()} withdraws its original proof`, async () => {
  const f = await requestFixture(false, true, source => source.replace('@router.post("/work")', `${statement}@router.post("/work")`))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(expected!)
  expect(f.project().uses.filter((u: any) => u.kind === "framework" && u.frameworkModel === "fastapi-source-injection/v1")).toEqual([])
})
test("a rebound router constructor retains a boundary rather than executing a framework model", async () => {
  const f = await requestFixture(false, true, source => source.replace("router = APIRouter()", "APIRouter = replacement\nrouter = APIRouter()"))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain("framework-route-binding-unresolved")
  expect(f.project().uses.filter((u: any) => u.kind === "framework")).toEqual([])
})
for (const [declaration, code] of [["if configured:\n    def verify(request: Request):\n        raise Denied()\n", "framework-dependency-target-binding-unresolved"], ["@replacement\ndef verify(request: Request):\n    raise Denied()\n", "framework-dependency-target-wrapper-unmodeled"]]) test(`request projection retains ${code}`, async () => {
  const f = await requestFixture(false, true, source => source.replace("def verify(request: Request):\n    raise Denied()\n", declaration!))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(code!)
})
test("an injected Request parameter is not a proven external request environment", async () => {
  const f = await requestFixture(true, true, source => source.replace("def endpoint(request: Request,", "def endpoint(request: Request=Depends(lookup),"))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain("framework-request-argument-unbound")
})
test("an annotation dependency stays a named boundary until its injection form is supported", async () => {
  const f = await requestFixture(false, true, source => "from typing import Annotated\n" + source.replace("actor=Depends(verify)", "actor: Annotated[object, Depends(verify)]"))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain("framework-dependency-annotation-unsupported")
  expect(f.project().uses.filter((u: any) => u.frameworkModel === "fastapi-source-injection/v1")).toEqual([])
})

test("actual source pack forwarding adopts a rejecting helper before the following effect", async () => {
  const source = "class Gate:\n    def entry(self, actor, *args, **kwargs):\n        self.guard(actor, *args, **kwargs)\n        write()\n        return True\n    def guard(self, actor, *rest, **options):\n        raise Denied()\n"
  const index = await buildStructureIndex([{ path: "app.py", content: source }], { repository: "anonymous", sourceRef: "r" })
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }), accepted: any[] = []
  const add = (name: string, steps: any[]) => {
    const s = index.symbols.find(s => s.name === name)!, u: any = { itemId: name, handle: name, questionId: "q", op: "add", role: name === "entry" ? "entry" : "helper", source: { id: s.id, path: s.path, sha256: s.sha256, startLine: s.startLine, endLine: s.endLine }, receiverClass: "app.Gate", evidenceIds: ["ev"], start: "body", complete: true, coverage: "path", parameters: s.parameters.map(p => ({ name: p.name, type: p.name === "actor" ? "principal" : "value" })), blocks: [{ name: "body", steps }] }
    store.accept(u, [{ kind: "source-span", key: s.path, revision: s.sha256 }, { kind: "symbol-resolution", key: s.id, revision: s.sha256 }], "test-authored"); accepted.push(u); return u
  }
  add("guard", [{ kind: "raise", name: "rejected", claim: "Anonymous source rejection", exceptionType: "Denied", failureKind: "authorization" }])
  const s = index.symbols.find(s => s.name === "entry")!, call = index.relatedCalls(s.id, "app.Gate").find(c => c.expression === "self.guard")!
  add("entry", [{ kind: "call", name: "guard", claim: "Actual source forwarding", symbol: "self.guard", sourceCallId: call.id, arguments: [{ parameter: "self", object: "self" }, { parameter: "actor", object: "actor" }, { parameter: "rest", object: "args" }, { parameter: "options", object: "kwargs" }] }, { kind: "effect", name: "write", claim: "Anonymous following operation", operation: "write" }, { kind: "return", name: "done", claim: "Anonymous source return", outcome: "allow", value: true }])
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "request", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "request", intent: "behavior", request: "Inspect source continuation", premises: [] }] })
  const projected = api.projectSourceMaterials(p, accepted, store.snapshot(), index, { questionDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const tampered = structuredClone(accepted); tampered.find(u => u.role === "entry").blocks[0].steps[0].arguments[3].object = "different_pack"
  const tamperedStore = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  for (const u of tampered) tamperedStore.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
  expect(api.projectSourceMaterials(p, tampered, tamperedStore.snapshot(), index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toEqual([])
})
for (const [replacement, code] of [["router = APIRouter(dependencies=[Depends(global_guard)])", "framework-router-options-unmodeled"], ["router = APIRouter(route_class=CustomRoute)", "framework-router-options-unmodeled"], ["router = APIRouter()\nrouter.dependency_overrides[verify] = replacement", "framework-dependency-overrides-unmodeled"]]) test(`request projection retains ${code} for source-visible request configuration`, async () => {
  const f = await requestFixture(false, true, source => source.replace("router = APIRouter()", replacement!))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(code!)
  expect(f.project().uses.filter((u: any) => u.kind === "framework")).toEqual([])
})
for (const [statement, code] of [["router.dependency_overrides.update({verify: replacement})", "framework-dependency-overrides-unmodeled"], ["router.add_middleware(Middleware)", "framework-router-options-unmodeled"], ["router.add_api_route('/other', replacement)", "framework-router-options-unmodeled"], ["parent = APIRouter()\nparent.mount('/v1', router)", "route-prefix-dynamic"]] as const) test(`source-visible framework modification ${statement} retains ${code}`, async () => {
  const f = await requestFixture(false, true, source => source.replace("import APIRouter,", "import FastAPI as APIRouter,").replace('@router.post("/work")', `def replacement():\n    return True\nclass Middleware:\n    pass\n${statement}\n@router.post("/work")`))
  expect(lowerSemanticFlow(f.project().units).diagnostics.map(d => d.code)).toContain(code)
  expect(f.project().uses.filter((u: any) => u.kind === "framework")).toEqual([])
})

test("source-assisted local capture adoption keeps rejection before the following write and rejects a swapped capture", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-local-capture-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor, decoy):\n    def guard():\n        selected = actor\n        raise Denied\n    guard()\n    write()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, accepted: any[] = []
  for (const name of ["entry", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }), skeleton = (await tools.sourceSkeleton(source.id))!
    expect(skeleton.gaps).toEqual([])
    const actor = skeleton.anchors.find(a => a.kind === "parameter" && a.name === "actor")!
    if (name === "guard") expect(actor).toMatchObject({ syntax: "source_capture", selector: { startLine: 3, endLine: 3 }, capture: { ownerId: index.symbols.find(s => s.name === "entry")!.id, ownerSha256: source.sha256 } })
    const annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return" || a.kind === "raise" || a.name === "selected").map(a => ({ anchorId: a.id, role: a.kind === "parameter" || a.name === "selected" ? "principal" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous test-authored current source meaning", ...(a.name === "selected" ? { aliasAnchorId: actor.id } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}), ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    expect(result.unit!.complete).toBe(true)
    accepted.push({ ...result.unit!, questionId: "q", evidenceIds: read.evidence.map(e => e.id), source: skeleton.source })
  }
  expect(accepted[1].parameters).toEqual([{ name: "actor", type: "principal" }])
  expect(accepted[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call").arguments).toEqual([{ parameter: "actor", object: "actor" }])
  const store = () => {
    const s = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of accepted) s.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
    return s.snapshot()
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect continuation", premises: [] }] })
  const snapshot = store(), projected = api.projectSourceMaterials(p, accepted, snapshot, index, { questionDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const changed = await buildStructureIndex([{ path: "app.py", content: (await readFile(path.join(sourceRoot, "app.py"), "utf8")).replace("selected = actor", "selected = decoy") }], { repository: "anonymous", sourceRef: "r" })
  expect(api.projectSourceMaterials(p, accepted, snapshot, changed, { questionDirected: true }).uses).toEqual([])
  const guard = index.symbols.find(s => s.name === "guard")!, skeleton = (await tools.sourceSkeleton(guard.id))!
  const omitted = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.name === "selected" || a.kind === "raise").map(a => ({ anchorId: a.id, role: a.name === "selected" ? "principal" : "context", explanation: "Anonymous role without a captured actor type or alias", ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) })), unresolved: [] }, { index, itemId: "guard", handle: "guard", questionId: "q", role: "helper" })
  expect(omitted.unit!.parameters).toEqual([{ name: "actor", type: "value" }])
  const prior = accepted[1]; accepted[1] = { ...prior, ...omitted.unit! }
  expect(lowerSemanticFlow(api.projectSourceMaterials(p, accepted, store(), index, { questionDirected: true }).units, { compositional: true, propertyDirected: true }).diagnostics.map(d => d.code)).toContain("semantic-argument-unbound")
  accepted[1] = prior
  accepted[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call").arguments[0].object = "decoy"
  expect(api.projectSourceMaterials(p, accepted, store(), index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toEqual([])
})

test("a proved local callee remains inside the actual source branch", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-local-conditional-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n    def guard():\n        return actor\n    if False:\n        guard()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  expect(skeleton.flow[0]!.kind).toBe("branch")
  expect(skeleton.anchors.find(a => a.id === skeleton.flow[0]!.then![0]!.anchorId)!.call!.expression).toBe("guard")
  const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "return").map(a => ({ anchorId: a.id, role: "context", returnOutcome: "allow", explanation: "Anonymous source normal return" })), unresolved: [] }, { index: tools.structure, itemId: "entry", handle: "entry", questionId: "q", role: "entry", propertyDirected: true })
  expect(result.diagnostics).toEqual([])
  expect(result.unit!.blocks.flatMap(b => b.steps).filter(s => s.kind === "call")).toEqual([])
})

test("adopted public import helpers depend on selected hop bytes while unrelated exports stay outside their footprint", async () => {
  const files = [{ path: "app.py", content: "from api import helper\ndef entry(actor):\n    return helper(actor)\n" }, { path: "api/__init__.py", content: "from implementation import helper\n" }, { path: "implementation.py", content: "def helper(actor):\n    return actor\n" }], identity = { repository: "anonymous", sourceRef: "r" }, index = await buildStructureIndex(files, identity)
  const entrySource = index.symbols.find(s => s.name === "entry")!, helperSource = index.symbols.find(s => s.name === "helper")!, call = index.relatedCalls(entrySource.id)[0]!, accepted: any[] = []
  const store = createSourceMaterials({ ...identity, semanticVersion: "question-control/v1" })
  for (const source of [entrySource, helperSource]) {
    const u: any = { questionId: "q", itemId: source.name, handle: source.name, op: "add", role: source.name === "entry" ? "entry" : "helper", source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, evidenceIds: ["ev"], coverage: "path", start: "body", complete: true, parameters: [{ name: "actor", type: "principal" }], blocks: [{ name: "body", steps: [...source.name === "entry" ? [{ kind: "call", name: "helper", claim: "Anonymous actual public source call", symbol: "helper", sourceCallId: call.id, arguments: [{ parameter: "actor", object: "actor" }] }] : [], { kind: "return", name: "returned", claim: "Anonymous actual source return", object: "actor", ...source.name === "entry" ? { outcome: "allow" } : {} }] }] }
    accepted.push(u)
    store.accept(u, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }, { kind: "candidate-set", key: `relations:${source.id}:`, revision: sourceRelationRevision(index, source.id)! }], "test-authored")
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect source", premises: [] }] }), snapshot = store.snapshot()
  expect(api.projectSourceMaterials(p, accepted, snapshot, index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const changed = await buildStructureIndex(files.map(s => s.path === "api/__init__.py" ? { ...s, content: s.content + "# selected import bytes changed\n" } : s), identity)
  expect(api.projectSourceMaterials(p, accepted, snapshot, changed, { questionDirected: true }).uses).toEqual([])
  const unrelated = await buildStructureIndex([...files, { path: "other/__init__.py", content: "from implementation import helper\n" }], identity)
  expect(api.projectSourceMaterials(p, accepted, snapshot, unrelated, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
})

test("source-assisted returned callable adoption preserves creation, capture and rejection order", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-returned-adoption-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def create(principal):\n    def guard():\n        selected = principal\n        raise Denied\n    return guard\ndef entry(actor, decoy):\n    check = create(actor)\n    check()\n    write()\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, accepted: any[] = []
  for (const name of ["entry", "create", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!, read = await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine }), skeleton = (await tools.sourceSkeleton(source.id))!
    expect(skeleton.gaps).toEqual([])
    const principal = skeleton.anchors.find(a => a.kind === "parameter" && a.name === "principal")
    const annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return" || a.kind === "raise" || a.name === "selected").map(a => ({ anchorId: a.id, role: a.kind === "parameter" && a.syntax !== "source_callable_instance" || a.name === "selected" ? "principal" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous test-authored current source meaning", ...(a.name === "selected" ? { aliasAnchorId: principal!.id } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    expect(result.unit!.complete).toBe(true)
    accepted.push({ ...result.unit!, questionId: "q", evidenceIds: read.evidence.map(e => e.id), source: skeleton.source })
  }
  expect(accepted[1].blocks.flatMap((b: any) => b.steps).find((s: any) => s.bindingName === "guard")).toMatchObject({ kind: "bind", type: "value" })
  expect(accepted[2].parameters.find((p: any) => p.name.startsWith("source-callable-"))).toMatchObject({ type: "value" })
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual creation and continuation", premises: [] }] })
  const project = (units = accepted, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
    return api.projectSourceMaterials(p, units, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const skipped = structuredClone(accepted)
  for (const block of skipped[0].blocks) block.steps = block.steps.map((s: any) => s.kind === "call" && s.symbol === "create" ? { kind: "context", name: s.name, relationship: "dispatch-binding", claim: "Test deliberately omits actual creation" } : s)
  expect(project(skipped).uses.filter((u: any) => u.kind === "call")).toEqual([])
  const swapped = structuredClone(accepted)
  swapped[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "check").arguments.find((a: any) => a.parameter === "principal").object = "decoy"
  expect(project(swapped).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const overwritten = structuredClone(accepted)
  overwritten[0].blocks[0].steps.splice(1, 0, { kind: "bind", name: "forged-instance", bindingName: "check", type: "value", claim: "Test overwrites the factory result" })
  expect(project(overwritten).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const omittedInstance = structuredClone(accepted)
  omittedInstance[2].parameters = omittedInstance[2].parameters.filter((p: any) => !p.name.startsWith("source-callable-"))
  expect(project(omittedInstance).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const reordered = structuredClone(accepted)
  for (const block of reordered[0].blocks) {
    const creation = block.steps.findIndex((s: any) => s.kind === "call" && s.symbol === "create"), invocation = block.steps.findIndex((s: any) => s.kind === "call" && s.symbol === "check")
    if (creation >= 0 && invocation >= 0) [block.steps[creation], block.steps[invocation]] = [block.steps[invocation], block.steps[creation]]
  }
  expect(project(reordered).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const stale = structuredClone(accepted)
  stale[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "create").callee = "guard"
  const rebound = project(stale)
  expect(rebound.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(rebound.units.find((u: any) => u.role === "entry").blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "create").callee).toBe("create")
  const changed = await buildStructureIndex([{ path: "app.py", content: (await readFile(path.join(sourceRoot, "app.py"), "utf8")).replace("selected = principal", "selected = None") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(accepted, changed).uses).toEqual([])
})

test("source-assisted field adoption preserves returned resource identity across current helper calls", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-adoption-")), content = "def select(target):\n    return target\ndef prepare(ctx, target):\n    ctx.saved = select(target)\n    return ctx.saved\ndef guard(target):\n    raise Denied\ndef entry(ctx, target, decoy):\n    selected = prepare(ctx, target)\n    guard(ctx.saved)\n    write()\n    return True\n"
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "prepare", "select", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!, annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return" || a.kind === "raise").map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "ctx" ? "context" : "resource" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous source field and actual returned resource", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    expect(result.unit!.complete).toBe(true)
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}`, revision: sourceRelationRevision(index, u.source.id)! }], "test-authored")
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current field object and following write", premises: [] }] }), snapshot = store.snapshot(), projected = api.projectSourceMaterials(p, units, snapshot, index, { questionDirected: true }), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(3)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.fieldChanges[0]!.source).toBe(lowered.delta.rules.find(r => r.bindingName === "target")!.bindingKey)
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace("ctx.saved = select(target)", "ctx.saved = None") }], { repository: "anonymous", sourceRef: "r" })
  expect(api.projectSourceMaterials(p, units, snapshot, changed, { questionDirected: true }).uses).toEqual([])
})

for (const nested of [false, true]) test(`repeated identical stateful calls preserve each actual result in ${nested ? "same-line arguments" : "field stores"}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-occurrences-")), content = `def choose(ctx):
    selected = ctx.current
    ctx.current = ctx.next
    return selected
def guard(target):
    target.checked = True
    raise Denied
def consume(left, right):
    guard(right)
def entry(ctx, a, b):
    ctx.current = a
    ctx.next = b
${nested ? "    consume(choose(ctx), choose(ctx))" : "    ctx.first = choose(ctx)\n    ctx.second = choose(ctx)\n    guard(ctx.second)"}
    write()
    return True
`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "choose", "guard", ...nested ? ["consume"] : []]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!, current = skeleton.anchors.find(a => a.name === "ctx.current" && !a.fieldWrite)
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise"].includes(a.kind) || a.name === "selected" || a.id === current?.id).map(a => ({ anchorId: a.id, role: a.name === "selected" || a.id === current?.id ? "resource" : a.kind === "parameter" ? a.name === "ctx" ? "context" : "resource" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous current source and distinct stateful call results", ...(a.name === "selected" ? { aliasAnchorId: current!.id } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
  const snapshot = () => {
    for (const u of units) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }], "test-authored")
    return store.snapshot()
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect the second actual result", premises: [] }] }), projected = api.projectSourceMaterials(p, units, snapshot(), index, { questionDirected: true }), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(nested ? 4 : 3)
  expect(lowered.diagnostics).toEqual([])
  const identity = (name: string) => lowered.delta.rules.find(r => r.bindingName === name)!.bindingKey!
  expect(lowered.fieldChanges.find(c => c.field === "checked")!.object).toBe(identity("b"))
  if (!nested) {
    expect(lowered.fieldChanges.find(c => c.field === "first")!.source).toBe(identity("a"))
    expect(lowered.fieldChanges.find(c => c.field === "second")!.source).toBe(identity("b"))
  } else {
    const consume = units[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "consume")
    expect(new Set(consume.arguments.map((a: any) => a.object)).size).toBe(2)
    consume.arguments[1].object = consume.arguments[0].object
    expect(api.projectSourceMaterials(p, units, snapshot(), index, { questionDirected: true }).uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  }
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
})

test("a new inherited setter withdraws an earlier ordinary source field store", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-field-setter-footprint-")), files = [{ path: "app.py", content: "from base import Base\nclass View(Base):\n    def entry(self, target):\n        self.saved = target\n        return True\n" }, { path: "base.py", content: "class Base:\n    pass\n" }]
  for (const file of files) await writeFile(path.join(sourceRoot, file.path), file.content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, source = index.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id, "app.View"))!
  expect(skeleton.gaps).toEqual([])
  const annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.name === "target" ? "resource" : "context", explanation: "Anonymous current source field", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  const unit: any = { ...result.unit!, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds, receiverClass: "app.View" }, store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" }), revision = sourceRelationRevision(index, source.id, "app.View")!
  store.accept(unit, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }, { kind: "candidate-set", key: `relations:${source.id}:app.View`, revision }], "test-authored")
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect actual setter behavior", premises: [] }] }), snapshot = store.snapshot()
  expect(api.projectSourceMaterials(p, [unit], snapshot, index, { questionDirected: true }).uses).toHaveLength(1)
  const changed = await buildStructureIndex(files.map(f => f.path === "base.py" ? { ...f, content: "class Base:\n    def __setattr__(self, name, value):\n        raise Denied\n" } : f), { repository: "anonymous", sourceRef: "r" })
  expect(sourceRelationRevision(changed, source.id, "app.View")).not.toBe(revision)
  expect(api.projectSourceMaterials(p, [unit], snapshot, changed, { questionDirected: true }).uses).toEqual([])
  const unrelated = await buildStructureIndex([...files, { path: "unrelated.py", content: "class Other:\n    def __setattr__(self, name, value):\n        raise Denied\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(sourceRelationRevision(unrelated, source.id, "app.View")).toBe(revision)
})

test("a source-assisted method alias adopts the actual receiver only after its ordinary creation", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-alias-adoption-")), content = "class Gate:\n    def entry(self, actor, decoy, *args, **kwargs):\n        handler = self.guard\n        handler(actor, *args, **kwargs)\n        write()\n        return True\n    def guard(self, actor, *rest, **options):\n        raise Denied\n"
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "guard"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "self" ? "context" : ["actor", "decoy"].includes(a.name!) ? "principal" : "condition" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : "condition" : "context", explanation: "Anonymous ordinary method alias and actual receiver", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect method alias continuation", premises: [] }] })
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
  const skipped = structuredClone(units), entry = skipped[0].blocks.flatMap((b: any) => b.steps), creation = entry.find((s: any) => s.kind === "assign-value" && s.result === "handler")
  expect(creation).toBeDefined()
  Object.assign(creation, { kind: "context", relationship: "dispatch-binding" })
  delete creation.result; delete creation.value
  expect(project(skipped).uses.filter((u: any) => u.kind === "call")).toEqual([])
  const swapped = structuredClone(units)
  swapped[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call").arguments[0].object = "decoy"
  expect(project(swapped).uses.filter((u: any) => u.kind === "call")).toEqual([])
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace("handler = self.guard", "handler = self.other") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})
for (const selected of [true, false]) test(`finite method choice executes its original selected branch before write: ${selected}`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-choice-")), content = `class Gate:\n    def entry(self, actor):\n        if ${selected ? "True" : "False"}:\n            handler = self.guard\n        else:\n            handler = self.fallback\n        handler(actor)\n        write()\n        return True\n    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  for (const name of ["entry", "guard", "fallback"]) {
    const source = index.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
    expect(skeleton.gaps).toEqual([])
    const annotations = skeleton.anchors.filter(a => ["parameter", "condition", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "self" ? "context" : "principal" : a.kind === "condition" || a.kind === "call" && a.call!.expression !== "write" ? "condition" : a.kind === "call" ? "effect" : "context", explanation: "Anonymous finite ordinary method selection", ...(a.kind === "condition" ? { condition: { op: "eq", left: { literal: selected }, right: { literal: true } } } : {}), ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const result = lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass: "app.Gate" })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current method choice", premises: [] }] })
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(2)
  expect(lowered.diagnostics.map(d => d.code)).toEqual(selected ? [] : ["semantic-exception-type-unknown"])
  expect(lowered.delta.rules.filter(r => r.terminal && r.outcome).map(r => r.outcome)).toEqual([selected ? "deny" : "allow"])
  expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(!selected)
  const proof = index.relatedCalls(units[0].source.id, "app.Gate").find(c => c.expression === "handler")!.methodChoices!
  const skipped = structuredClone(units), creation = skipped[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`)
  Object.assign(creation, { kind: "context", relationship: "dispatch-binding" }); delete creation.result; delete creation.value
  expect(project(skipped).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const wrongGuard = structuredClone(units), choice = wrongGuard[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "choose" && s.name.startsWith("method-choice-"))
  choice.cases[0].condition.left.binding = "actor"
  const wrongGuardUses = project(wrongGuard).uses.filter((u: any) => u.kind === "call").length
  const moved = structuredClone(units), origin = moved[0].blocks.find((b: any) => b.steps.some((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`)), destination = moved[0].blocks.find((b: any) => b.steps.some((s: any) => s.name === `assign-${proof.choices[1]!.anchorId}`))
  destination.steps.unshift(origin.steps.splice(origin.steps.findIndex((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`), 1)[0])
  expect(project(moved).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const missingInit = structuredClone(units)
  missingInit[0].blocks.find((b: any) => b.name === missingInit[0].start).steps = missingInit[0].blocks.find((b: any) => b.name === missingInit[0].start).steps.filter((s: any) => !s.name.startsWith("method-choice-init-"))
  expect(project(missingInit).uses.filter((u: any) => u.kind === "call")).toHaveLength(0)
  const lateInit = structuredClone(units), lateStart = lateInit[0].blocks.find((b: any) => b.name === lateInit[0].start), initIndex = lateStart.steps.findIndex((s: any) => s.name.startsWith("method-choice-init-"))
  lateStart.steps.push(lateStart.steps.splice(initIndex, 1)[0])
  const lateInitUses = project(lateInit).uses.filter((u: any) => u.kind === "call").length
  const duplicate = structuredClone(units), duplicatedCreation = duplicate[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name === `assign-${proof.choices[0]!.anchorId}`)
  duplicate[0].blocks.find((b: any) => b.name === duplicate[0].start).steps.splice(1, 0, structuredClone(duplicatedCreation))
  expect(() => project(duplicate)).toThrow("source-material-semantic-invalid")
  const missingFailure = structuredClone(units), failureChoose = missingFailure[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "choose" && s.name.startsWith("method-choice-"))
  missingFailure[0].blocks.find((b: any) => b.name === failureChoose.otherwise).steps = [{ kind: "return", name: "wrong-default", claim: "Forged uncreated path", outcome: "allow", value: true }]
  expect([lateInitUses, project(missingFailure).uses.filter((u: any) => u.kind === "call").length]).toEqual([0, 0])
  const duplicateCall = structuredClone(units), variant = duplicateCall[0].blocks.find((b: any) => b.steps.some((s: any) => s.kind === "call" && s.symbol === "handler")), copiedCall = structuredClone(variant.steps.find((s: any) => s.kind === "call"))
  copiedCall.name = "forged-extra-invocation"; variant.steps.push(copiedCall)
  const duplicateProjection = project(duplicateCall)
  expect(duplicateProjection.units.flatMap((u: any) => u.blocks.flatMap((b: any) => b.steps)).find((s: any) => s.name === copiedCall.name).callee).toBeUndefined()
  expect([wrongGuardUses, duplicateProjection.uses.filter((u: any) => u.kind === "call").length]).toEqual([0, 0])
  const wrongReceiver = structuredClone(units)
  wrongReceiver[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call" && s.symbol === "handler").arguments[0].object = "actor"
  expect(project(wrongReceiver).uses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace("handler = self.guard", "handler = self.fallback") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})

for (const { selector, extraMethods } of [...["'guard'", "'fallback'", "'missing'", "selected", "pick('guard')"].map(selector => ({ selector, extraMethods: 0 })), { selector: "pick('guard')", extraMethods: 14 }]) test(`getattr current source tokens preserve actual selection and unknown default: ${selector} with ${extraMethods} extra methods`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-method-lookup-")), content = `def pick(value):\n    return value\nclass Gate:\n    def entry(self, actor, selected):\n        handler = getattr(self, ${selector}, self.fallback)\n        handler(actor)\n        write()\n        return True\n    def guard(self, actor):\n        raise Denied\n    def fallback(self, actor):\n        return actor\n${Array.from({ length: extraMethods }, (_, i) => `    def other${i}(self, actor):\n        return actor\n`).join("")}`
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), index = tools.structure!, units: any[] = []
  let entryInterpretation: any
  for (const name of ["entry", "guard", "fallback", ...selector.startsWith("pick(") ? ["pick"] : []]) {
    const source = index.symbols.find(s => s.name === name)!, receiverClass = source.className ? "app.Gate" : undefined
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id, receiverClass))!
    expect(skeleton.gaps.map(g => g.code)).toEqual(name === "entry" && selector === "'missing'" ? ["source-method-lookup-attribute-unmodeled"] : [])
    const annotations = skeleton.anchors.filter(a => ["parameter", "call", "return", "raise"].includes(a.kind)).map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : ["selected", "value"].includes(a.name!) ? "condition" : "context" : a.kind === "call" ? a.call!.expression === "write" ? "effect" : a.call!.expression === "getattr" ? "context" : "condition" : "context", explanation: "Anonymous current ordinary getattr selection", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}), ...(a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
    const interpretation = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }
    if (name === "entry") entryInterpretation = interpretation
    const result = lowerSourceInterpretation(skeleton, interpretation, { index, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper" })
    expect(result.diagnostics).toEqual([])
    units.push({ ...result.unit!, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source, receiverClass })
  }
  const p = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "entry", entryHint: "entry" }], questions: [{ id: "q", operationId: "op", intent: "behavior", request: "Inspect current getattr selection", premises: [] }] })
  if (extraMethods) {
    const nativeProgram = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.Gate.entry", entryHint: "entry", premises: [] }] })
    const runtime = createInquiryDomainRuntime({ program: nativeProgram, tools, strategy: "operation-evidence-v5", sourceAssisted: true, initialSemanticUnits: units.slice(1) })
    await runtime.sync()
    const current: any = runtime.promptContext()
    const accepted = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: current.focus.id, interpretation: { ...entryInterpretation, revision: current.tasks[0].sourceSkeleton.revision } })
    expect(accepted.diagnostics).toEqual([])
    expect(runtime.report().semantic?.units.find(u => u.role === "entry")?.blocks).toHaveLength(35)
  }
  const project = (adopted = units, current = index) => {
    const store = createSourceMaterials({ repository: "anonymous", sourceRef: "r", semanticVersion: "question-control/v1" })
    for (const u of adopted) store.accept(u, [{ kind: "source-span", key: u.source.path, revision: u.source.sha256 }, { kind: "symbol-resolution", key: u.source.id, revision: u.source.sha256 }, { kind: "candidate-set", key: `relations:${u.source.id}:app.Gate`, revision: sourceRelationRevision(index, u.source.id, "app.Gate")! }], "test-authored")
    return api.projectSourceMaterials(p, adopted, store.snapshot(), current, { questionDirected: true })
  }
  const projected = project(), lowered = lowerSemanticFlow(projected.units, { compositional: true, propertyDirected: true })
  expect(projected.uses.filter((u: any) => u.kind === "call")).toHaveLength(selector.startsWith("pick(") ? 3 : selector === "selected" ? 2 : selector === "'missing'" ? 0 : 1)
  if (selector === "'guard'" || selector.startsWith("pick(")) {
    expect(lowered.diagnostics).toEqual([])
    expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(false)
    expect(lowered.delta.rules.filter(r => r.terminal && r.outcome).map(r => r.outcome)).toEqual(["deny"])
  } else if (selector === "'fallback'") {
    expect(lowered.diagnostics.map(d => d.code)).toEqual(["semantic-exception-type-unknown"])
    expect(lowered.delta.rules.some(r => r.kind === "effect")).toBe(true)
  } else expect(lowered.diagnostics.map(d => d.code)).toContain("source-method-lookup-attribute-unmodeled")
  const proof = index.relatedCalls(units[0].source.id, "app.Gate").find(c => c.expression === "handler")!.methodLookup!
  const missing = structuredClone(units), start = missing[0].blocks.find((b: any) => b.name === missing[0].start)
  start.steps = start.steps.filter((s: any) => s.name !== `method-lookup-${proof.creationCallId}`)
  expect(project(missing).uses.filter((u: any) => u.kind === "call")).toHaveLength(selector.startsWith("pick(") ? 1 : 0)
  if (proof.choices.length) {
    const wrongSelector = structuredClone(units), selection = wrongSelector[0].blocks.flatMap((b: any) => b.steps).find((s: any) => s.name === `method-lookup-${proof.creationCallId}`)
    selection.cases[0].condition.left = { binding: "different_selector" }
    expect(project(wrongSelector).uses.filter((u: any) => u.kind === "call")).toHaveLength(selector.startsWith("pick(") ? 1 : 0)
  }
  const changed = await buildStructureIndex([{ path: "app.py", content: content.replace(`getattr(self, ${selector},`, "getattr(self, 'other',") }], { repository: "anonymous", sourceRef: "r" })
  expect(project(units, changed).uses).toEqual([])
})
