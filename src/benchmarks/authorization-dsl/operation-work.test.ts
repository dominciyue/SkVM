import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { operationWork, diagnosticWork, structuralDependencyRevision } from "./operation-work.ts"

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
