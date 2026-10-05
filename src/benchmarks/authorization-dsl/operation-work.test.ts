import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { operationWork, diagnosticWork } from "./operation-work.ts"

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
