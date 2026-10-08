import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { operationWork, diagnosticWork, structuralDependencyRevision, sourceRelationRevision } from "./operation-work.ts"
import { createSourceMaterials } from "../../task-dsl/authorization/source-materials.ts"
import { projectSourceMaterials } from "./source-material-projection.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"

test("early method capture relations retain external targets and negative ordinary-class dependencies", async () => {
  const files = [{ path: "app.py", content: "from base import Parent\nclass Gate(Parent):\n    def prepare(self, actor):\n        return actor\n    def entry(self, actor):\n        return self.guard(flag=self.prepare(actor), actor=actor)\n" }, { path: "base.py", content: "class Parent:\n    def guard(self, actor, flag):\n        return actor\n" }], index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), source = index.symbols.find(s => s.name === "entry")!, revision = sourceRelationRevision(index, source.id, "app.Gate"), call = index.relatedCalls(source.id, "app.Gate").find(c => c.expression === "self.guard")!
  expect(call.methodCapture).toBeDefined()
  expect(call.argumentFacts!.map(a => a.parameterName)).toEqual(["flag", "actor"])
  for (const content of ["class Parent:\n    def guard(self, actor, flag):\n        raise Denied\n", "class Parent:\n    def guard(self, actor, flag):\n        return actor\n    def __getattribute__(self, name):\n        return dynamic(name)\n", "@decorate\nclass Parent:\n    def guard(self, actor, flag):\n        return actor\n", "class Parent(Unknown):\n    def guard(self, actor, flag):\n        return actor\n"]) {
    const changed = await buildStructureIndex(files.map(f => f.path === "base.py" ? { ...f, content } : f), { repository: "anonymous", sourceRef: "r" })
    expect(changed.symbols.find(s => s.id === source.id)!.sha256).toBe(source.sha256)
    expect(sourceRelationRevision(changed, source.id, "app.Gate")).not.toBe(revision)
    if (!content.includes("raise Denied")) expect(changed.relatedCalls(source.id, "app.Gate").find(c => c.expression === "self.guard")!.methodCapture).toBeUndefined()
  }
  const unrelated = await buildStructureIndex([...files, { path: "other.py", content: "class Gate:\n    def __getattribute__(self, name):\n        return dynamic(name)\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(sourceRelationRevision(unrelated, source.id, "app.Gate")).toBe(revision)
})

test("field method captures retain external target and negative descriptor bytes without unrelated homonyms", async () => {
  const files = [{ path: "app.py", content: "from base import Parent\nclass Gate(Parent):\n    def prepare(self):\n        self.handler = self.guard\n        return True\n    def entry(self, actor):\n        self.prepare()\n        return self.handler(actor)\n" }, { path: "base.py", content: "class Parent:\n    def guard(self, actor):\n        return actor\n" }], index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" })
  for (const name of ["prepare", "entry"]) {
    const source = index.symbols.find(s => s.name === name)!, revision = sourceRelationRevision(index, source.id, "app.Gate")
    for (const content of ["class Parent:\n    def guard(self, actor):\n        raise Denied\n", "class Parent:\n    def guard(self, actor):\n        return actor\n    def __getattribute__(self, name):\n        return dynamic(name)\n"]) {
      const changed = await buildStructureIndex(files.map(f => f.path === "base.py" ? { ...f, content } : f), { repository: "anonymous", sourceRef: "r" })
      expect(changed.symbols.find(s => s.id === source.id)!.sha256).toBe(source.sha256)
      expect(sourceRelationRevision(changed, source.id, "app.Gate")).not.toBe(revision)
    }
    const unrelated = await buildStructureIndex([...files, { path: "other.py", content: "class Gate:\n    def guard(self, actor):\n        raise Denied\n" }], { repository: "anonymous", sourceRef: "r" })
    expect(sourceRelationRevision(unrelated, source.id, "app.Gate")).toBe(revision)
  }
})

test("a structurally bound omitted helper becomes a read, then an interpretation action", async () => {
  const index = await buildStructureIndex([{ path: "view.py", content: "def create(caller, item):\n    return check(caller, item)\ndef check(caller, item):\n    return caller == item.owner\n" }], { repository: "fixture", sourceRef: "r" })
  const entry = index.symbols.find(s => s.name === "create")!, helper = index.symbols.find(s => s.name === "check")!
  const a = operationWork(index, entry.id, [], [])
  expect(a.actions.find(a => a.candidateId === helper.id)!.kind).toBe("read")
  const b = operationWork(index, entry.id, [helper.id], [])
  expect(b.actions.find(a => a.candidateId === helper.id)!.kind).toBe("interpret")
  expect(operationWork(index, entry.id, [helper.id], [helper.id]).actions).toEqual([])
})
test("unknown receiver is an explicit relation gap and wrong same-name module is excluded", async () => {
  const index = await buildStructureIndex([{ path: "a.py", content: "def create(x):\n    return x.check()\n" }, { path: "b.py", content: "def check():\n    return True\n" }], { repository: "fixture", sourceRef: "r" })
  const work = operationWork(index, index.symbols.find(s => s.name === "create")!.id, [], [])
  expect(work.actions).toEqual([])
  expect(work.gaps[0]!.expression).toBe("x.check")
})
test("framework candidates follow inherited serializer and actual override", async () => {
  const index = await buildStructureIndex([{ path: "rest_framework/mixins.py", content: "class CreateMixin:\n    def create(self, request):\n        return self.perform_create(request)\n    def perform_create(self, serializer):\n        return serializer.save()\n" }, { path: "app/views.py", content: "from rest_framework.mixins import CreateMixin as Parent\nclass Serializer:\n    def validate_item(self, item):\n        return item\n    def create(self, data):\n        return data\nclass View(Parent):\n    serializer_class = Serializer\n" }], { repository: "fixture", sourceRef: "r" })
  const cls = index.symbols.find(s => s.qualifiedName === "app.views.View")!
  const work = operationWork(index, cls.id, [], [])
  expect(work.actions.map(a => index.symbols.find(s => s.id === a.candidateId)!.qualifiedName)).toContain("rest_framework.mixins.CreateMixin.create")
  expect(work.actions.map(a => index.symbols.find(s => s.id === a.candidateId)!.qualifiedName)).toContain("app.views.Serializer.validate_item")
  expect(work.frameworkDependencies.length).toBeGreaterThan(0)
})
test("framework override bypass excludes base create, and serializer names in another module are not receivers", async () => {
  const index = await buildStructureIndex([{ path: "rest_framework/mixins.py", content: "class Base:\n    def create(self):\n        return self.perform_create()\n" }, { path: "app/view.py", content: "from rest_framework.mixins import Base\nclass View(Base):\n    serializer_class = DynamicFactory()\n    def create(self):\n        return None\n" }, { path: "other.py", content: "class DynamicFactory:\n    def validate_document(self, document):\n        return document\n" }], { repository: "fixture", sourceRef: "r" })
  const work = operationWork(index, index.symbols.find(s => s.qualifiedName === "app.view.View")!.id, [], [])
  const names = work.actions.map(a => index.symbols.find(s => s.id === a.candidateId)!.qualifiedName)
  expect(names).toContain("app.view.View.create")
  expect(names).not.toContain("rest_framework.mixins.Base.create")
  expect(names).not.toContain("other.DynamicFactory.validate_document")
})

test("object and call diagnostics target the exact retained source transaction without inventing a binding", () => {
  const unit: any = { handle: "u", questionId: "q", itemId: "i", source: { id: "s", path: "view.py", startLine: 4, endLine: 8 }, blocks: [] }
  const slice: any = { rules: [{ key: "effect", questionId: "q", sourceOrigin: { handle: "u", block: "body", step: "save" } }] }
  const work = diagnosticWork([
    { code: "control-object-mismatch", path: "effect", questionId: "q", message: "Wrong resource identity", severity: "error" },
    { code: "semantic-argument-unbound", path: "questions.q.u", questionId: "q", message: "Unbound at body.call;", severity: "error" },
  ], [unit], slice)
  expect(work.map(a => a.kind)).toEqual(["reinterpret", "link"])
  expect(work[0]!.handle).toBe("u")
  expect(work[0]!.source).toEqual(unit.source)
  expect(work[0]!.request).toMatchObject({ kind: "defer", revisit: "u" })
  expect(work.every(a => a.reason.includes("identity") || a.reason.includes("Unbound"))).toBe(true)
})

test("missing source and conditional premises have distinct actions and no fabricated source target", () => {
  const work = diagnosticWork([
    { code: "decisive-dependency-open", path: "q", message: "helper has not been interpreted", severity: "error" },
    { code: "unresolved-path-condition", path: "q", message: "unknown caller role", severity: "error" },
  ], [], { rules: [] } as any)
  expect(work.map(a => a.kind)).toEqual(["inspect-dependency", "conditional-answer"])
  expect(work.every(a => !a.handle && !a.source)).toBe(true)
})
test("a request wrapper diagnostic revisits its retained original source rather than a synthetic handle", () => {
  const original: any = { handle: "retained", questionId: "source-question", itemId: "source-item", source: { id: "s", path: "app.py", sha256: "sha", startLine: 4, endLine: 8 }, blocks: [] }
  const projected = { ...original, handle: "$request-relation", questionId: "other-question" }
  const work = diagnosticWork([{ code: "semantic-return-object-incompatible", path: "questions.other-question.$request-relation", questionId: "other-question", message: "Wrong dependency return object", severity: "error" }], [original], { rules: [] } as any, [projected])
  expect(work[0]).toMatchObject({ kind: "reinterpret", handle: "retained", questionId: "other-question", itemId: "source-item", request: { kind: "defer", revisit: "retained" } })
})

test("framework configuration is expanded at the class entry once and method work preserves its actual receiver", async () => {
  const index = await buildStructureIndex([{ path: "rest_framework/base.py", content: "class Base:\n    def initial(self):\n        return self.check_permissions()\n    def check_permissions(self):\n        return True\n    def create(self):\n        return self.perform_create()\n    def perform_create(self):\n        return True\n" }, { path: "app.py", content: "from rest_framework.base import Base\nclass Serializer:\n    def is_valid(self):\n        return self.validate()\n    def validate(self):\n        return True\nclass Permission:\n    def has_permission(self):\n        return True\nclass View(Base):\n    serializer_class = Serializer\n    permission_classes = (Permission,)\n    def perform_create(self):\n        return False\n" }], { repository: "fixture", sourceRef: "r" })
  const root = index.symbols.find(s => s.qualifiedName === "app.View")!, work = operationWork(index, root.id, [], [])
  const selected = (name: string) => work.actions.find(a => index.symbols.find(s => s.id === a.candidateId)?.qualifiedName === name)
  expect(selected("app.Serializer.is_valid")?.receiverClass).toBe("app.Serializer")
  expect(selected("app.Permission.has_permission")?.receiverClass).toBe("app.Permission")
  const create = index.lookupMethod("app.View", "create")[0]!, method = operationWork(index, create.id, [], [], "app.View")
  expect(method.actions.map(a => index.symbols.find(s => s.id === a.candidateId)!.qualifiedName)).toEqual(["app.View.perform_create"])
  expect(method.actions[0]?.receiverClass).toBe("app.View")
})

test("the same inherited body keeps separate actual receiver candidates", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Base:\n    def check(self):\n        return True\nclass A(Base):\n    pass\nclass B(Base):\n    pass\ndef create(a: A, b: B):\n    return a.check() and b.check()\n" }], { repository: "fixture", sourceRef: "r" })
  const work = operationWork(index, index.symbols.find(s => s.qualifiedName === "app.create")!.id, [], [])
  expect(work.actions.map(a => a.receiverClass)).toEqual(["app.A", "app.B"])
})

test("FastAPI dependency aliases and registration context are actual source work without an explicit model call", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "from fastapi import APIRouter, Depends as Dependency\nrouter = APIRouter()\ndef identify():\n    return True\n@router.post('/items')\ndef entry(actor=Dependency(identify)):\n    return True\n" }], { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.name === "entry")!, work = operationWork(index, entry.id, [], [])
  expect(work.actions.some(a => index.symbols.find(s => s.id === a.candidateId)?.name === "identify" && a.decisive)).toBe(true)
  const registration = work.actions.find(a => a.relationId === index.routes[0]!.sourceCallId)!
  expect(index.symbols.find(s => s.id === registration.candidateId)?.attributes.routeModel).toBe("fastapi-source-router/v1")
  expect(work.actions.every(a => index.symbols.some(s => s.id === a.candidateId))).toBe(true)
})

test("a same-named local Depends function does not create framework dependency work", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "from fastapi import APIRouter\nrouter = APIRouter()\ndef Depends(x):\n    return x\ndef identify():\n    return True\n@router.post('/items')\ndef entry(actor=Depends(identify)):\n    return True\n" }], { repository: "anonymous", sourceRef: "r" })
  const work = operationWork(index, index.symbols.find(s => s.name === "entry")!.id, [], [])
  expect(work.actions.some(a => index.symbols.find(s => s.id === a.candidateId)?.name === "identify")).toBe(false)
})

test("source-assisted DRF method entry retains dispatch permission duties once without create-only serializer work", async () => {
  const index = await buildStructureIndex([{ path: "rest_framework/views.py", content: "class Base:\n    def initial(self):\n        return self.check_permissions()\n    def check_permissions(self):\n        return True\n    def get_permissions(self):\n        return []\n    def create(self):\n        return True\n" }, { path: "app.py", content: "from rest_framework.views import Base\nclass View(Base):\n    def download(self, request):\n        return request\n" }], { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.name === "download")!
  const work = operationWork(index, entry.id, [], [], undefined, { sourceAssisted: true, operationRoot: true })
  expect(work.actions.map(a => index.symbols.find(s => s.id === a.candidateId)!.name)).toEqual(["initial", "check_permissions", "get_permissions"])
  expect(work.actions.every(a => a.receiverClass === "app.View")).toBe(true)
  expect(operationWork(index, entry.id, [], [], "app.View", { sourceAssisted: true, operationRoot: false }).actions).toEqual([])
})
test("a current source-qualified dispatch override is an explicit framework boundary", async () => {
  const index = await buildStructureIndex([{ path: "rest_framework/views.py", content: "class Base:\n    def dispatch(self, request):\n        self.initial(request)\n        return self.handle(request)\n    def initial(self, request):\n        return True\n" }, { path: "app.py", content: "from rest_framework.views import Base\nclass View(Base):\n    def dispatch(self, request):\n        return self.handle(request)\n    def handle(self, request):\n        return True\n" }], { repository: "anonymous", sourceRef: "r" })
  const work = operationWork(index, index.symbols.find(s => s.qualifiedName === "app.View.handle")!.id, [], [], undefined, { sourceAssisted: true, operationRoot: true })
  const dispatch = work.actions.find(a => index.symbols.find(s => s.id === a.candidateId)?.name === "dispatch")
  expect(dispatch).toMatchObject({ frameworkBoundary: true, decisive: true, receiverClass: "app.View" })
  expect(index.symbols.find(s => s.id === dispatch!.candidateId)!.qualifiedName).toBe("app.View.dispatch")
})

test("v5 framework footprints ignore unrelated files and retain actual inherited permission changes", async () => {
  const files = [
    { path: "rest_framework/views.py", content: "class Base:\n    def dispatch(self, request):\n        self.initial(request)\n        return request\n    def initial(self, request):\n        return self.check_permissions(request)\n    def check_permissions(self, request):\n        return True\n" },
    { path: "guards.py", content: "class Permit:\n    def has_permission(self, request, view):\n        return True\n" },
    { path: "app.py", content: "from rest_framework.views import Base\nfrom guards import Permit\nclass View(Base):\n    permission_classes = (Permit,)\n    def action(self, request):\n        return request\n" },
    { path: "rest_framework/unused.py", content: "class Unused:\n    def check(self):\n        return True\n" },
  ]
  const index = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.qualifiedName === "app.View.action")!
  const work = operationWork(index, entry.id, [], [], "app.View", { sourceAssisted: true, operationRoot: true, questionDirected: true })
  const dependency = work.frameworkDependencies.find(d => d.kind === "framework-model")!
  expect(dependency.key).toBe("drf-source-dispatch/v2:app.View")
  const unrelated = await buildStructureIndex(files.map(f => f.path.endsWith("unused.py") ? { ...f, content: f.content.replace("True", "False") } : f), { repository: "anonymous", sourceRef: "r" })
  expect(structuralDependencyRevision(unrelated, dependency)).toBe(dependency.revision)
  for (const changedPath of ["rest_framework/views.py", "guards.py"]) {
    const changed = await buildStructureIndex(files.map(f => f.path === changedPath ? { ...f, content: f.content.replace("True", "False") } : f), { repository: "anonymous", sourceRef: "r" })
    expect(structuralDependencyRevision(changed, dependency)).not.toBe(dependency.revision)
  }
})
test("a request dependency body change revokes its owner's framework footprint through source-bound candidate IDs", async () => {
  const files = [{ path: "auth.py", content: "def verify():\n    return True\n" }, { path: "app.py", content: 'from fastapi import APIRouter, Depends\nfrom auth import verify\nrouter = APIRouter()\n@router.post("/work")\ndef endpoint(actor=Depends(verify)):\n    return True\n' }]
  const before = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), entry = before.symbols.find(s => s.name === "endpoint")!
  const work = operationWork(before, entry.id, [], [], undefined, { sourceAssisted: true, operationRoot: true, questionDirected: true }), dependency = work.frameworkDependencies.find(d => d.key === `fastapi-source-injection/v1:${entry.id}`)!
  const after = await buildStructureIndex(files.map(f => f.path === "auth.py" ? { ...f, content: f.content.replace("True", "False") } : f), { repository: "anonymous", sourceRef: "r" })
  expect(after.symbols.find(s => s.name === "endpoint")!.id).toBe(entry.id)
  expect(after.requestDependencies(entry.id)[0]!.candidateIds).not.toEqual(before.requestDependencies(entry.id)[0]!.candidateIds)
  expect(structuralDependencyRevision(after, dependency)).not.toBe(dependency.revision)
})

test("v5 exposes exact source middleware methods and external gaps without claiming adoption", async () => {
  const index = await buildStructureIndex([
    { path: "filter.py", content: "class Gate:\n    def __init__(self, app):\n        self.app = app\n    async def __call__(self, scope, receive, send):\n        await self.app(scope, receive, send)\n" },
    { path: "app.py", content: 'from fastapi import FastAPI\nfrom filter import Gate\nfrom outside import Cors\napp = FastAPI()\napp.add_middleware(Gate)\napp.add_middleware(Cors)\n@app.post("/work")\ndef endpoint():\n    return True\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.name === "endpoint")!, work = operationWork(index, entry.id, [], [], undefined, { sourceAssisted: true, operationRoot: true, questionDirected: true })
  const middleware = work.actions.filter(a => a.receiverClass === "filter.Gate")
  expect(middleware.map(a => index.symbols.find(s => s.id === a.candidateId)!.name)).toEqual(["__init__", "__call__"])
  expect(middleware.every(a => a.frameworkBoundary && a.decisive && a.kind === "read")).toBe(true)
  expect(work.frameworkGaps.some(g => g.code === "framework-middleware-source-missing" && g.reason.includes("outside.Cors"))).toBe(true)
  const interpreted = operationWork(index, entry.id, middleware.map(a => a.candidateId), middleware.map(a => ({ id: a.candidateId, receiverClass: a.receiverClass })), undefined, { sourceAssisted: true, operationRoot: true, questionDirected: true })
  expect(interpreted.actions.filter(a => a.receiverClass === "filter.Gate").every(a => a.kind === "link" && a.frameworkBoundary)).toBe(true)
})

test("middleware source changes invalidate its route footprint while unrelated source remains reusable", async () => {
  const files = [
    { path: "filter.py", content: "class Gate:\n    async def __call__(self, scope, receive, send):\n        return True\n" },
    { path: "app.py", content: 'from fastapi import FastAPI\nfrom filter import Gate\napp = FastAPI()\napp.add_middleware(Gate)\n@app.post("/work")\ndef endpoint():\n    return True\n' },
  ]
  const before = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), entry = before.symbols.find(s => s.name === "endpoint")!
  const work = operationWork(before, entry.id, [], [], undefined, { sourceAssisted: true, operationRoot: true, questionDirected: true })
  const dependency = work.frameworkDependencies.find(d => d.key === `fastapi-source-asgi/v1:${before.routes[0]!.id}`)!
  expect(dependency).toBeDefined()
  const unrelated = await buildStructureIndex([...files, { path: "unused.py", content: "def elsewhere():\n    return False\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(structuralDependencyRevision(unrelated, dependency)).toBe(dependency.revision)
  const changed = await buildStructureIndex(files.map(f => f.path === "filter.py" ? { ...f, content: f.content.replace("True", "False") } : f), { repository: "anonymous", sourceRef: "r" })
  expect(changed.routes[0]!.id).toBe(before.routes[0]!.id)
  expect(structuralDependencyRevision(changed, dependency)).not.toBe(dependency.revision)
})

test("v5 DRF action work binds registration and mapping source to the actual method receiver", async () => {
  const files = [
    { path: "rest_framework/decorators.py", content: "def action(methods=None, detail=None):\n    return None\nclass MethodMapper:\n    def __init__(self, action, methods):\n        return None\n" },
    { path: "rest_framework/views.py", content: "class Base:\n    def dispatch(self, request):\n        return request\n    def as_view(cls, actions=None):\n        return actions\n    def get_extra_actions(cls):\n        return []\n" },
    { path: "app.py", content: "from rest_framework.views import Base\nfrom rest_framework.decorators import action\nclass View(Base):\n    @action(methods=['get'], detail=True)\n    def fetch(self, request):\n        return request\n" },
  ]
  const before = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" }), entry = before.symbols.find(s => s.qualifiedName === "app.View.fetch")!
  const work = operationWork(before, entry.id, [], [], "app.View", { sourceAssisted: true, operationRoot: true, questionDirected: true })
  const factory = work.actions.find(a => before.symbols.find(s => s.id === a.candidateId)?.qualifiedName === "rest_framework.decorators.action")!
  expect(factory).toMatchObject({ decisive: true, frameworkBoundary: true, kind: "read" })
  const dependency = work.frameworkDependencies.find(d => d.key === "drf-source-action/v1:app.View")!
  expect(dependency).toBeDefined()
  const changed = await buildStructureIndex(files.map(f => f.path.endsWith("decorators.py") ? { ...f, content: f.content.replace("None\nclass", "True\nclass") } : f), { repository: "anonymous", sourceRef: "r" })
  expect(structuralDependencyRevision(changed, dependency)).not.toBe(dependency.revision)
  const unrelated = await buildStructureIndex([...files, { path: "decoy.py", content: "def action():\n    return False\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(structuralDependencyRevision(unrelated, dependency)).toBe(dependency.revision)
  expect(work.frameworkGaps.some(g => g.code === "framework-action-registration-missing")).toBe(true)
})
test("a dynamic HTTP declaration retains source work at its method entry", async () => {
  const index = await buildStructureIndex([
    { path: "rest_framework/decorators.py", content: "def action(methods=None, detail=None):\n    return None\nclass MethodMapper:\n    def __init__(self, action, methods):\n        return None\n" },
    { path: "rest_framework/views.py", content: "class Base:\n    def dispatch(self, request):\n        return request\n" },
    { path: "app.py", content: "from rest_framework.views import Base\nfrom rest_framework.decorators import action\nclass View(Base):\n    @action(methods=verbs, detail=True)\n    def fetch(self, request):\n        return request\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  const work = operationWork(index, index.symbols.find(s => s.name === "fetch")!.id, [], [], "app.View", { sourceAssisted: true, operationRoot: true, questionDirected: true })
  expect(work.frameworkGaps.some(g => g.code === "framework-action-methods-dynamic")).toBe(true)
  const interpreted = operationWork(index, index.symbols.find(s => s.name === "fetch")!.id, [], work.actions.map(a => ({ id: a.candidateId, receiverClass: a.receiverClass })), "app.View", { sourceAssisted: true, operationRoot: true, questionDirected: true })
  expect(interpreted.actions.find(a => index.symbols.find(s => s.id === a.candidateId)?.qualifiedName === "rest_framework.decorators.action")).toMatchObject({ kind: "link", frameworkBoundary: true })
})

const genericDecoratorFiles = [
  { path: "wrappers.py", content: "def factory():\n    def apply(cls):\n        cls.changed = True\n        return cls\n    return apply\n" },
  { path: "app.py", content: "from wrappers import factory\n@factory()\nclass Parent:\n    def run(self):\n        return True\nclass Child(Parent):\n    pass\nclass Other:\n    def run(self):\n        return False\n" },
]
test("v5 generic class transformation remains an exact source boundary after its bodies are read and interpreted", async () => {
  const index = await buildStructureIndex(genericDecoratorFiles, { repository: "anonymous", sourceRef: "r" }), entry = index.lookupMethod("app.Child", "run")[0]!
  const options = { sourceAssisted: true, questionDirected: true, operationRoot: true }
  const first = operationWork(index, entry.id, [], [], "app.Child", options)
  const factory = index.symbols.find(s => s.qualifiedName === "wrappers.factory")!, returned = index.symbols.find(s => s.qualifiedName === "wrappers.factory.apply")!
  expect(first.actions.filter(a => [factory.id, returned.id].includes(a.candidateId))).toHaveLength(2)
  expect(first.actions.every(a => a.decisive && a.frameworkBoundary && !a.receiverClass)).toBe(true)
  expect(first.frameworkGaps).toContainEqual(expect.objectContaining({ code: "source-class-decorator-transformation-unadopted", receiverClass: "app.Child" }))
  const read = operationWork(index, entry.id, [factory.id, returned.id], [], "app.Child", options)
  expect(read.actions.every(a => a.kind === "interpret")).toBe(true)
  const interpreted = operationWork(index, entry.id, [], [factory.id, returned.id], "app.Child", options)
  expect(interpreted.actions.every(a => a.kind === "link")).toBe(true)
  expect(interpreted.frameworkGaps).toEqual(first.frameworkGaps)
  expect(operationWork(index, entry.id, [], [], "app.Child", { sourceAssisted: true, operationRoot: true }).frameworkDependencies).toEqual([])
})
test("generic decorator dependency revisions follow the actual receiver and selected source, not global namesakes", async () => {
  const before = await buildStructureIndex(genericDecoratorFiles, { repository: "anonymous", sourceRef: "r" }), entry = before.lookupMethod("app.Child", "run")[0]!
  const options = { sourceAssisted: true, questionDirected: true, operationRoot: true }
  const dependency = operationWork(before, entry.id, [], [], "app.Child", options).frameworkDependencies.find(d => d.key === "source-class-decorator/v1:app.Child")!
  expect(dependency).toBeDefined()
  expect(operationWork(before, before.lookupMethod("app.Other", "run")[0]!.id, [], [], "app.Other", options).frameworkDependencies).toEqual([])
  const unrelated = await buildStructureIndex([...genericDecoratorFiles, { path: "decoy.py", content: "def factory():\n    return None\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(structuralDependencyRevision(unrelated, dependency)).toBe(dependency.revision)
  const changed = await buildStructureIndex(genericDecoratorFiles.map(f => f.path === "wrappers.py" ? { ...f, content: f.content.replace("True", "False") } : f), { repository: "anonymous", sourceRef: "r" })
  expect(structuralDependencyRevision(changed, dependency)).not.toBe(dependency.revision)
  const removed = await buildStructureIndex(genericDecoratorFiles.filter(f => f.path !== "wrappers.py"), { repository: "anonymous", sourceRef: "r" })
  expect(structuralDependencyRevision(removed, dependency)).not.toBe(dependency.revision)
})
test("a decorator footprint retains the actual subclass bytes when its inherited declaration is unchanged", async () => {
  const files = [...genericDecoratorFiles, { path: "child.py", content: "from app import Parent\nclass Actual(Parent):\n    flag = True\n" }], identity = { repository: "anonymous", sourceRef: "r" }
  const index = await buildStructureIndex(files, identity), entry = index.lookupMethod("child.Actual", "run")[0]!
  const dependency = operationWork(index, entry.id, [], [], "child.Actual", { questionDirected: true }).frameworkDependencies.find(d => d.key === "source-class-decorator/v1:child.Actual")!
  const changed = await buildStructureIndex(files.map(f => f.path === "child.py" ? { ...f, content: f.content.replace("True", "False") } : f), identity)
  expect(structuralDependencyRevision(changed, dependency)).not.toBe(dependency.revision)
})
test("decorator body changes withdraw only its receiver's material and source work never counts as framework use", async () => {
  const identity = { repository: "anonymous", sourceRef: "r" }, index = await buildStructureIndex(genericDecoratorFiles, identity), store = createSourceMaterials({ ...identity, semanticVersion: "question-control/v1" }), units: any[] = []
  const options = { sourceAssisted: true, questionDirected: true, operationRoot: true }
  for (const [receiverClass, questionId] of [["app.Child", "a"], ["app.Other", "b"]]) {
    const source = index.lookupMethod(receiverClass!, "run")[0]!, unit: any = { handle: questionId, itemId: questionId, questionId, op: "add", role: "entry", receiverClass, source: { id: source.id, path: source.path, sha256: source.sha256, startLine: source.startLine, endLine: source.endLine }, start: "body", coverage: "path", complete: true, evidenceIds: ["ev"], parameters: [{ name: "self", type: "value" }], blocks: [{ name: "body", steps: [{ kind: "return", name: "done", value: true, outcome: "allow", claim: "Anonymous source method body; decorator unadopted" }] }] }
    store.accept(unit, [{ kind: "source-span", key: source.path, revision: source.sha256 }, { kind: "symbol-resolution", key: source.id, revision: source.sha256 }, ...operationWork(index, source.id, [], [], receiverClass, options).frameworkDependencies], "test-authored")
    units.push(unit)
  }
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "a", request: "First body", entryHint: "run" }, { id: "b", request: "Other body", entryHint: "run" }], questions: [{ id: "a", operationId: "a", intent: "behavior", request: "First body", premises: [] }, { id: "b", operationId: "b", intent: "behavior", request: "Other body", premises: [] }] })
  const before = projectSourceMaterials(program, units, store.snapshot(), index)
  expect(before.units.map(u => u.handle)).toEqual(["a", "b"])
  expect(before.uses.filter(u => u.kind === "framework")).toEqual([])
  const after = await buildStructureIndex(genericDecoratorFiles.map(f => f.path === "wrappers.py" ? { ...f, content: f.content.replace("True", "False") } : f), identity)
  expect(projectSourceMaterials(program, units, store.snapshot(), after).units.map(u => u.handle)).toEqual(["b"])
})
