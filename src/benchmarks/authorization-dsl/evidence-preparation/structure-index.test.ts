import { expect, test } from "bun:test"
import { buildStructureIndex } from "./structure-index.ts"

test("imported module instances bind their actual class methods across source roots and aliases", async () => {
  const index = await buildStructureIndex([
    { path: "backend/pkg/store.py", content: "class Table:\n    def get(self, key):\n        return key\n    def get_for(self, key, actor):\n        return key\nRecords = Table()\n" },
    { path: "backend/pkg/entry.py", content: "from pkg.store import Records as Repo\nimport pkg.store as models\ndef entry(key, actor):\n    first = Repo.get(key)\n    second = models.Records.get_for(key, actor)\n    unknown.get(key)\n    return first\n" },
    { path: "decoy.py", content: "class Table:\n    def get(self, key):\n        return None\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  for (const [expression, method] of [["Repo.get", "get"], ["models.Records.get_for", "get_for"]]) {
    const call = index.calls.find(c => c.expression === expression)!
    expect(call.resolution).toBe("resolved")
    expect(call.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === `backend.pkg.store.Table.${method}`)!.id])
    expect(call.receiverClass).toBe("backend.pkg.store.Table")
  }
  expect(index.calls.find(c => c.expression === "unknown.get")!.resolution).toBe("unresolved")
})

test("unique module receiver proofs retain the declaration bytes and never leak through shadowing", async () => {
  const store = "class Registry:\n    def find(self, owner_id):\n        return owner_id\nReady = Registry()\nRebound = Registry()\nRebound = unknown()\n"
  const index = await buildStructureIndex([
    { path: "lib/catalog.py", content: store },
    { path: "entry.py", content: "from lib.catalog import Ready as repo\nfrom lib.catalog import Rebound\ndef entry(actor):\n    return repo.find(actor.id)\ndef shadow(repo):\n    return repo.find(0)\ndef rebound():\n    return Rebound.find(0)\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.qualifiedName === "entry.entry")!
  const call: any = index.relatedCalls(entry.id)[0]!
  expect(call.receiverBinding).toEqual({ schemaVersion: "source-module-instance/v1", name: "lib.catalog.Ready", className: "lib.catalog.Registry", classSha256: index.symbols.find(s => s.qualifiedName === "lib.catalog.Registry")!.sha256, source: { path: "lib/catalog.py", sha256: index.symbols.find(s => s.qualifiedName === "lib.catalog.Registry")!.sha256, startLine: 4, endLine: 4 } })
  for (const name of ["shadow", "rebound"]) expect((index.relatedCalls(index.symbols.find(s => s.qualifiedName === `entry.${name}`)!.id)[0] as any).receiverBinding).toBeUndefined()
})

test("consumer alias rebindings and source-visible module attribute writes withdraw receiver proofs", async () => {
  for (const change of ["repo = unknown()\n", "if flag:\n    repo = unknown()\n", "def change():\n    global repo\n    repo = unknown()\n", "import catalog as storage\nstorage.Ready = unknown()\n"]) {
    const index = await buildStructureIndex([
      { path: "catalog.py", content: "class Registry:\n    def find(self):\n        return True\nReady = Registry()\n" },
      { path: "entry.py", content: "from catalog import Ready as repo\n" + change + "def entry():\n    return repo.find()\n" },
    ], { repository: "anonymous", sourceRef: "r" })
    const call: any = index.relatedCalls(index.symbols.find(s => s.qualifiedName === "entry.entry")!.id)[0]!
    expect(call.receiverBinding).toBeUndefined()
    expect(call.resolution).toBe("unresolved")
  }
})

test("local module instances bind without inferring dynamic or rebound receivers", async () => {
  const content = "class Table:\n    def get(self, key):\n        return key\nReady = Table()\nDynamic = factory()\nRebound = Table()\nRebound = other()\nConditional = Table()\nif flag:\n    Conditional = other()\ndef entry(key):\n    Ready.get(key)\n    Dynamic.get(key)\n    Rebound.get(key)\n    Conditional.get(key)\n"
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "Ready.get")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Table.get")!.id])
  for (const name of ["Dynamic", "Rebound", "Conditional"]) expect(index.calls.find(c => c.expression === `${name}.get`)!.resolution).toBe("unresolved")
})

test("parameters and local values shadow imported instances while typed local constructors remain usable", async () => {
  const index = await buildStructureIndex([
    { path: "store.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\n" },
    { path: "entry.py", content: "from store import Store\nclass Other:\n    def get(self):\n        return False\ndef parameter(Store):\n    return Store.get()\ndef literal():\n    Store = None\n    return Store.get()\ndef dynamic():\n    Store = factory()\n    return Store.get()\ndef local():\n    Store = Other()\n    return Store.get()\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  for (const name of ["parameter", "literal", "dynamic"]) {
    const owner = index.symbols.find(s => s.qualifiedName === `entry.${name}`)!
    expect(index.relatedCalls(owner.id).find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
  }
  const local = index.symbols.find(s => s.qualifiedName === "entry.local")!
  expect(index.relatedCalls(local.id).find(c => c.expression === "Store.get")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "entry.Other.get")!.id])
})

test("an imported instance does not pick one of two source modules with the same suffix", async () => {
  const content = "class Table:\n    def get(self):\n        return True\nStore = Table()\n"
  const index = await buildStructureIndex([{ path: "one/pkg/store.py", content }, { path: "two/pkg/store.py", content }, { path: "entry.py", content: "from pkg.store import Store\ndef entry():\n    return Store.get()\n" }], { repository: "anonymous", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
})

test("non-call module rebinding and a loop-local name do not leak the original instance", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\nfor Store in values:\n    pass\nClean = Table()\ndef entry():\n    Store.get()\n    for Clean in values:\n        Clean.get()\n" }], { repository: "anonymous", sourceRef: "r" })
  for (const name of ["Store", "Clean"]) expect(index.calls.find(c => c.expression === `${name}.get`)!.resolution).toBe("unresolved")
})

test("instance declaration file changes invalidate candidate dependencies even when its class file is unchanged", async () => {
  const files = [{ path: "table.py", content: "class Table:\n    def get(self):\n        return True\n" }, { path: "binding.py", content: "from table import Table\nStore = Table(1)\n" }, { path: "entry.py", content: "from binding import Store\ndef entry():\n    return Store.get()\n" }]
  const first = await buildStructureIndex(files, { repository: "anonymous", sourceRef: "r" })
  const second = await buildStructureIndex(files.map(f => f.path === "binding.py" ? { ...f, content: f.content.replace("Table(1)", "Table(2)") } : f), { repository: "anonymous", sourceRef: "r" })
  expect(second.calls.find(c => c.expression === "Store.get")!.resolution).toBe("resolved")
  expect(second.candidateRevision("table.Table", "get")).not.toBe(first.candidateRevision("table.Table", "get"))
})

test("local imports and nested declarations shadow a module instance", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\ndef imported():\n    from unknown import Store\n    return Store.get()\ndef nested():\n    class Store:\n        pass\n    return Store.get()\n" }], { repository: "anonymous", sourceRef: "r" })
  for (const name of ["imported", "nested"]) expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === `app.${name}`)!.id).find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
})

test("conditional imports and global writes invalidate the initial module instance", async () => {
  for (const changed of ["if flag:\n    from unknown import Store\n", "def change():\n    global Store\n    Store = unknown()\n"]) {
    const index = await buildStructureIndex([{ path: "app.py", content: "class Table:\n    def get(self):\n        return True\nStore = Table()\n" + changed + "def entry():\n    return Store.get()\n" }], { repository: "anonymous", sourceRef: "r" })
    expect(index.relatedCalls(index.symbols.find(s => s.qualifiedName === "app.entry")!.id).find(c => c.expression === "Store.get")!.resolution).toBe("unresolved")
  }
})

test("FastAPI constructor aliases, constant prefixes and includes bind the decorated handler", async () => {
  const index = await buildStructureIndex([
    { path: "api/items.py", content: 'from fastapi import APIRouter as Router\nBASE = "/items"\nrouter = Router(prefix=BASE)\n@router.post("/create")\ndef create_item(request):\n    return request\n' },
    { path: "app.py", content: 'import fastapi as web\nfrom api.items import router as items\napp = web.FastAPI()\napp.include_router(items, prefix="/v1")\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  const handler = index.symbols.find(s => s.qualifiedName === "api.items.create_item")!
  expect(index.routes).toContainEqual(expect.objectContaining({ method: "POST", path: "/v1/items/create", candidateIds: [handler.id], model: "fastapi-source-router/v1" }))
  expect(index.routes.every(r => r.handlerExpression === "create_item")).toBe(true)
})

test("dynamic prefixes and pseudo routers remain gaps, while duplicate real bindings stay visible", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import APIRouter\nrouter = APIRouter()\ndynamic = APIRouter(prefix=get_prefix())\nfake = Logger()\n@router.post("/items")\ndef first(x):\n    return x\n@router.post("/items")\ndef second(x):\n    return x\n@dynamic.post("/hidden")\ndef hidden(x):\n    return x\n@fake.post("/fake")\ndef decoy(x):\n    return x\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes.map(r => r.path)).toEqual(["/items", "/items"])
  expect(index.diagnostics).toContainEqual(expect.objectContaining({ path: "app.py", code: "route-prefix-dynamic", line: 11 }))
  expect(index.diagnostics).toContainEqual(expect.objectContaining({ path: "app.py", code: "route-router-unresolved", line: 14 }))
})
test("unknown include_router parents cannot promote a child into a mounted request route", async () => {
  for (const constructor of ["Fake()", "factory()", "unknown"]) {
    const index = await buildStructureIndex([{ path: "app.py", content: `from fastapi import APIRouter\nrouter = APIRouter()\napp = ${constructor}\napp.include_router(router)\n@router.post("/work")\ndef endpoint():\n    return True\n` }], { repository: "anonymous", sourceRef: "r" })
    expect(index.routes).toEqual([])
    expect(index.diagnostics).toContainEqual(expect.objectContaining({ handlerId: index.symbols.find(s => s.name === "endpoint")!.id, code: "route-prefix-dynamic" }))
  }
})
test("an imported dependency cannot retain a function replaced in its defining module", async () => {
  const index = await buildStructureIndex([{ path: "auth.py", content: "def verify():\n    return True\nverify = replacement\n" }, { path: "app.py", content: 'from fastapi import APIRouter, Depends\nfrom auth import verify\nrouter = APIRouter()\n@router.post("/work")\ndef endpoint(actor=Depends(verify)):\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.requestDependencies(index.symbols.find(s => s.name === "endpoint")!.id)).toContainEqual(expect.objectContaining({ resolution: "unresolved", gap: "framework-dependency-target-rebound" }))
})

test("cross-root import aliases and multiple static mounts preserve all route alternatives", async () => {
  const index = await buildStructureIndex([
    { path: "backend/pkg/items.py", content: 'from fastapi import APIRouter\nrouter = APIRouter(prefix="/items")\n@router.post("/create")\ndef create(x):\n    return x\n' },
    { path: "backend/pkg/main.py", content: 'from fastapi import FastAPI\nfrom pkg.items import router\napp = FastAPI()\napp.include_router(router, prefix="/v1")\napp.include_router(router, prefix="/v2")\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes.map(r => r.path)).toEqual(["/v1/items/create", "/v2/items/create"])
})

test("runtime settings and traversal order do not change source identities or structural revisions", async () => {
  const files = [{ path: "app.py", content: "def outer(x):\n    return inner(x)\ndef inner(x):\n    return x\n" }, { path: "other.py", content: "def unrelated():\n    return False\n" }]
  const first = { repository: "fixture", sourceRef: "r", sourceRoot: "D:/a", maxToolCalls: 24 }
  const a = await buildStructureIndex(files, first)
  const second = { ...first, sourceRoot: "D:/b", maxToolCalls: 64 }
  const b = await buildStructureIndex([...files].reverse(), second)
  expect(a.symbols.map(s => s.id)).toEqual(b.symbols.map(s => s.id))
  expect(a.calls.map(c => c.id)).toEqual(b.calls.map(c => c.id))
  expect(a.revision).toBe(b.revision)
  expect(a.candidateRevision("app.outer", "outer")).toBe(b.candidateRevision("app.outer", "outer"))
  const changedRef = await buildStructureIndex(files, { ...first, sourceRef: "other" })
  const changedBytes = await buildStructureIndex([{ ...files[0]!, content: files[0]!.content.replace("return x", "return False") }, files[1]!], first)
  expect(changedRef.symbols[0]!.id).not.toBe(a.symbols[0]!.id)
  expect(changedRef.revision).not.toBe(a.revision)
  expect(changedBytes.symbols[0]!.id).not.toBe(a.symbols[0]!.id)
})

test("Python alias and inheritance bind actual overrides, not unique lexical names", async () => {
  const index = await buildStructureIndex([
    { path: "pkg/base.py", content: "class Base:\n    def create(self, request):\n        return request\n" },
    { path: "pkg/other.py", content: "def create(request):\n    return None\n# def fake():\n" },
    { path: "pkg/view.py", content: "from pkg.base import Base as Parent\nclass View(Parent):\n    def create(self, request):\n        return self.check(request)\n    def check(self, request):\n        return request\nclass Child(View):\n    pass\n" },
  ], { repository: "fixture", sourceRef: "r" })
  expect(index.lookupMethod("pkg.view.Child", "create").map(s => s.qualifiedName)).toEqual(["pkg.view.View.create"])
  expect(index.symbols.some(s => s.name === "fake")).toBe(false)
  const call = index.calls.find(c => c.expression === "self.check")!
  expect(call.resolution).toBe("resolved")
  expect(call.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "pkg.view.View.check")!.id])
  expect(call.arguments).toEqual(["request"])
  expect(index.lookupMethod("pkg.other", "create")).toEqual([])
})
test("Go imported alias, receiver type and returned object remain source-bound", async () => {
  const index = await buildStructureIndex([
    { path: "svc/service.go", content: "package svc\ntype Service struct {}\nfunc (s *Service) Create(x *Item) *Item { return x }\nfunc Create(x *Item) *Item { return x }\n" },
    { path: "api/handler.go", content: 'package api\nimport alias "example/svc"\nfunc Handle(s *alias.Service, x *alias.Item) { s.Create(x); alias.Create(x); unknown.Create(x) }\n' },
  ], { repository: "fixture", sourceRef: "r" })
  const method = index.calls.find(c => c.expression === "s.Create")!
  expect(method.resolution).toBe("resolved")
  expect(index.symbols.find(s => s.id === method.candidateIds[0])!.qualifiedName).toBe("svc.Service.Create")
  expect(index.calls.find(c => c.expression === "alias.Create")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "svc.Create")!.id])
  expect(index.calls.find(c => c.expression === "unknown.Create")!.resolution).toBe("unresolved")
  expect(index.symbols.find(s => s.qualifiedName === "svc.Service.Create")!.returns).toContain("*Item")
})
test("candidate revision detects new override while old read file is unchanged", async () => {
  const files = [{ path: "base.py", content: "class Base:\n    def create(self):\n        return self\n" }, { path: "child.py", content: "from base import Base\nclass Child(Base):\n    pass\n" }]
  const a = await buildStructureIndex(files, { repository: "fixture", sourceRef: "r" })
  files[1]!.content = "from base import Base\nclass Child(Base):\n    def create(self):\n        return None\n"
  const b = await buildStructureIndex(files, { repository: "fixture", sourceRef: "r" })
  expect(a.candidateRevision("child.Child", "create")).not.toBe(b.candidateRevision("child.Child", "create"))
  expect(a.lookupMethod("child.Child", "create")[0]!.path).toBe("base.py")
  expect(b.lookupMethod("child.Child", "create")[0]!.path).toBe("child.py")
})
test("route callbacks bind their actual imported handler and preserve middleware/parameter syntax", async () => {
  const index = await buildStructureIndex([{ path: "api/route.go", content: 'package api\nimport handlers "example/handler"\nfunc Routes(m Router) { m.Post("/items", token(), reader(), handlers.Create) }\n' }, { path: "handler/create.go", content: "package handler\nfunc Create(ctx *Context) {}\n" }, { path: "other/create.go", content: "package other\nfunc Create() {}\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.routes).toContainEqual(expect.objectContaining({ method: "POST", path: "/items", handlerExpression: "handlers.Create", candidateIds: [index.symbols.find(s => s.qualifiedName === "handler.Create")!.id], middlewareExpressions: ["token()", "reader()"] }))
  expect(index.routes.some(r => r.candidateIds.includes(index.symbols.find(s => s.qualifiedName === "other.Create")!.id))).toBe(false)
})
test("declared returned-object assignment binds a receiver, while dynamic returns stay unresolved", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class Item:\n    def check(self):\n        return True\ndef lookup() -> Item:\n    return Item()\ndef dynamic():\n    return external()\ndef create():\n    selected = lookup()\n    selected.check()\n    other = dynamic()\n    other.check()\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "selected.check")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Item.check")!.id])
  expect(index.calls.find(c => c.expression === "other.check")!.resolution).toBe("unresolved")
})
test("chained Go combo registration uses enclosing group paths without inventing a path argument", async () => {
  const index = await buildStructureIndex([{ path: "api.go", content: 'package api\nimport h "example/handler"\nfunc Routes(m Router) { m.Group("/items", func() { m.Combo("").Get(h.List).Post(token(), h.Create) }) }\n' }, { path: "handler/h.go", content: "package handler\nfunc Create() {}\nfunc List() {}\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.routes.find(r => r.method === "POST")).toMatchObject({ path: "/items", handlerExpression: "h.Create", middlewareExpressions: ["token()"] })
})
test("multiline Go chained verbs keep the exact nested route, middleware and handler", async () => {
  const index = await buildStructureIndex([{ path: "api.go", content: 'package api\nimport h "example/handler"\nfunc Routes(m Router) {\n m.Group("/objects", func() {\n  m.Group("/{id}", func() {\n   m.Combo("").Get(h.List).\n    Post(token(), h.Create)\n  })\n })\n}\n' }, { path: "handler/h.go", content: "package handler\nfunc Create() {}\nfunc List() {}\n" }], { repository: "fixture", sourceRef: "r" })
  const create = index.symbols.find(s => s.qualifiedName === "handler.Create")!
  expect(index.routes.filter(r => r.method === "POST")).toEqual([expect.objectContaining({ path: "/objects/{id}", handlerExpression: "h.Create", candidateIds: [create.id], middlewareExpressions: ["token()"], startLine: 6, endLine: 7 })])
})
test("permission class aliases resolve only to their actual imported class", async () => {
  const index = await buildStructureIndex([{ path: "permissions.py", content: "class P:\n    def has_permission(self):\n        return True\n" }, { path: "other.py", content: "class P:\n    def has_permission(self):\n        return False\n" }, { path: "view.py", content: "from permissions import P as Alias\nclass V:\n    permission_classes = (Alias,)\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.resolveName("Alias", "view.py").map(s => s.qualifiedName)).toEqual(["permissions.P"])
})

test("a qualified Go import keeps its longest actual module match instead of a shorter homonym", async () => {
  const index = await buildStructureIndex([{ path: "api/api.go", content: 'package api\nimport h "example/a/handler"\nfunc Entry() { h.Create() }\n' }, { path: "a/handler/create.go", content: "package handler\nfunc Create() {}\n" }, { path: "handler/create.go", content: "package handler\nfunc Create() {}\n" }], { repository: "fixture", sourceRef: "r" })
  expect(index.calls.find(c => c.expression === "h.Create")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "a/handler.Create")!.id])
})

test("Python literal prefixes preserve source router registrations and dynamic formatted paths stay gaps", async () => {
  const index = await buildStructureIndex([{ path: "rest_framework/views.py", content: "class APIView:\n    pass\n" }, { path: "app.py", content: 'from rest_framework.views import APIView\nclass View(APIView):\n    pass\nrouter.register(r"items", View)\nrouter.register(u\'other\', View)\nrouter.register(f"{name}", View)\n' }], { repository: "fixture", sourceRef: "r" })
  expect(index.routes.map(r => r.path)).toEqual(["items", "other"])
})

test("inherited self calls retain the actual receiver for downstream overrides", async () => {
  const index = await buildStructureIndex([{ path: "base.py", content: "class Base:\n    def create(self):\n        return self.check()\n    def check(self):\n        return True\n" }, { path: "view.py", content: "from base import Base\nclass View(Base):\n    def check(self):\n        return False\n" }], { repository: "fixture", sourceRef: "r" })
  const create = index.lookupMethod("view.View", "create")[0]!
  const call: any = index.relatedCalls(create.id, "view.View")[0]!
  expect(call.receiverClass).toBe("view.View")
  expect(call.candidateIds).toEqual([index.lookupMethod("view.View", "check")[0]!.id])
})

test("zero-argument super follows the actual C3 receiver after the defining class", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: "class First:\n    def create(self):\n        return super().create()\nclass Base:\n    def create(self):\n        return self.check()\nclass Other:\n    def create(self):\n        return False\nclass View(First, Base):\n    def check(self):\n        return True\nclass Alternate(First, Other):\n    pass\nclass Dynamic(First):\n    def create(self):\n        return super(unknown, self).create()\n" }], { repository: "fixture", sourceRef: "r" })
  const first = index.lookupMethod("app.View", "create")[0]!
  const call = index.relatedCalls(first.id, "app.View").find(c => c.expression === "super().create")!
  expect(call.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Base.create")!.id])
  expect(call.receiverClass).toBe("app.View")
  expect(index.relatedCalls(first.id, "app.Alternate").find(c => c.expression === "super().create")!.candidateIds).toEqual([index.symbols.find(s => s.qualifiedName === "app.Other.create")!.id])
  expect(index.relatedCalls(index.lookupMethod("app.Dynamic", "create")[0]!.id, "app.Dynamic").find(c => c.expression === "super(unknown, self).create")!.resolution).toBe("unresolved")
})

test("current route middleware facts retain actual registration context and constructor/entry sources", async () => {
  const index = await buildStructureIndex([
    { path: "api.py", content: 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/work")\ndef endpoint():\n    return True\n' },
    { path: "guards.py", content: "class Guard:\n    def __init__(self, app, flag=False):\n        self.app = app\n    async def __call__(self, scope, receive, send):\n        await self.app(scope, receive, send)\n" },
    { path: "main.py", content: 'from fastapi import FastAPI\nfrom api import router\nfrom guards import Guard as Filter\napp = FastAPI()\nif enabled:\n    app.add_middleware(Filter, flag=True)\napp.include_router(router, prefix="/v1")\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  const middleware = (index as any).requestMiddleware(index.routes[0]!.id)
  expect(middleware).toHaveLength(1)
  expect(middleware[0]).toMatchObject({ sourceCallId: index.calls.find(c => c.expression === "app.add_middleware")!.id, expression: "Filter", qualifiedName: "guards.Guard", arguments: ["flag=True"], receiverClass: "guards.Guard", registrationContext: [{ kind: "if_statement", expression: "enabled" }], executionOrder: "unproven" })
  expect(middleware[0].methodCandidates.map((m: any) => index.symbols.find(s => s.id === m.candidateId)!.qualifiedName)).toEqual(["guards.Guard.__init__", "guards.Guard.__call__"])
  expect(middleware[0].source).toMatchObject({ path: "main.py", startLine: 6, endLine: 6 })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-options-unmodeled")
})

test("middleware metadata never selects an unrelated namesake or a rebound class", async () => {
  for (const replace of ["", "Filter = replacement\n"]) {
    const index = await buildStructureIndex([
      { path: "main.py", content: 'from fastapi import FastAPI\nfrom external import Cors as Filter\napp = FastAPI()\n' + replace + 'app.add_middleware(Filter)\n@app.post("/work")\ndef endpoint():\n    return True\n' },
      { path: "decoy.py", content: "class Cors:\n    async def __call__(self, scope, receive, send):\n        return None\n" },
    ], { repository: "anonymous", sourceRef: "r" })
    const middleware = (index as any).requestMiddleware(index.routes[0]!.id)
    expect(middleware[0].methodCandidates).toEqual([])
    expect(middleware[0].gap).toBe(replace ? "framework-middleware-target-rebound" : "framework-middleware-source-missing")
  }
})

test("a source alias that modifies the real application cannot leave its route closed", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\napp = FastAPI()\nalias = app\nalias.add_middleware(Unknown)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-options-unmodeled")
})

test("middleware parameter shadowing cannot borrow a module class candidate", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\nclass Filter:\n    async def __call__(self, scope, receive, send):\n        return None\napp = FastAPI()\ndef configure(Filter):\n    app.add_middleware(Filter)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  const middleware = index.requestMiddleware(index.routes[0]!.id)[0]!
  expect(middleware.methodCandidates).toEqual([])
  expect(middleware.gap).toBe("framework-middleware-target-shadowed")
})

test("a source-root-qualified BaseHTTPMiddleware still offers the actual dispatch override", async () => {
  const index = await buildStructureIndex([
    { path: "vendor/starlette/middleware/base.py", content: "class BaseHTTPMiddleware:\n    def __init__(self, app):\n        self.app = app\n    async def __call__(self, scope, receive, send):\n        return await self.dispatch(scope, self.app)\n    async def dispatch(self, request, call_next):\n        return await call_next(request)\n" },
    { path: "app.py", content: 'from fastapi import FastAPI\nfrom starlette.middleware.base import BaseHTTPMiddleware\nclass Header(BaseHTTPMiddleware):\n    async def dispatch(self, request, call_next):\n        response = await call_next(request)\n        response.headers.update(extra_headers)\n        return response\napp = FastAPI()\napp.add_middleware(Header)\n@app.post("/work")\ndef endpoint():\n    return True\n' },
  ], { repository: "anonymous", sourceRef: "r" })
  const middleware = index.requestMiddleware(index.routes[0]!.id)[0]!
  expect(middleware.methodCandidates.map(m => index.symbols.find(s => s.id === m.candidateId)!.qualifiedName)).toContain("app.Header.dispatch")
  expect(middleware.receiverClass).toBe("app.Header")
  expect(middleware.gap).toBeUndefined()
})

test("middleware configuration preserves repeated positional expressions after its target", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\nclass Filter:\n    async def __call__(self, scope, receive, send):\n        return None\napp = FastAPI()\napp.add_middleware(Filter, Filter, option=Filter)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.requestMiddleware(index.routes[0]!.id)[0]!.arguments).toEqual(["Filter", "option=Filter"])
})

test("a rebound potential application alias is explicitly uncertain rather than a proven registration", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\napp = FastAPI()\nalias = app\nalias = replacement\nalias.add_middleware(Unknown)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  const middleware = index.requestMiddleware(index.routes[0]!.id)[0]!
  expect(middleware).toMatchObject({ registrationBinding: "possible", gap: "framework-middleware-router-alias-unresolved" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-alias-unresolved")
})

test("cross-root imported application aliases retain the real modification and its binding proof", async () => {
  const index = await buildStructureIndex([
    { path: "backend/pkg/main.py", content: 'from fastapi import FastAPI\napp = FastAPI()\n@app.post("/work")\ndef endpoint():\n    return True\n' },
    { path: "backend/pkg/binding.py", content: "from pkg.main import app\nalias = app\n" },
    { path: "backend/pkg/configure.py", content: "from pkg.binding import alias\nalias.add_middleware(Unknown)\n" },
  ], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-options-unmodeled")
  expect(index.requestMiddleware(index.routes[0]!.id)).toContainEqual(expect.objectContaining({ routerName: "backend.pkg.main.app", registrationBinding: "resolved", source: expect.objectContaining({ path: "backend/pkg/configure.py" }) }))
})

test("a function's global alias write retains its possible application modification", async () => {
  const index = await buildStructureIndex([{ path: "app.py", content: 'from fastapi import FastAPI\napp = FastAPI()\nalias = None\ndef configure():\n    global alias\n    alias = app\n    alias.add_middleware(Unknown)\n@app.post("/work")\ndef endpoint():\n    return True\n' }], { repository: "anonymous", sourceRef: "r" })
  expect(index.routes[0]!.bindingGap).toBe("framework-router-alias-unresolved")
  expect(index.requestMiddleware(index.routes[0]!.id)[0]!).toMatchObject({ registrationBinding: "possible", registrationContext: [{ kind: "function_definition", expression: "configure" }] })
})
