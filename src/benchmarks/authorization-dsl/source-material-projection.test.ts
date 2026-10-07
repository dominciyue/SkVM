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
