import { expect, test } from "bun:test"
import { buildStructureIndex } from "./evidence-preparation/structure-index.ts"
import { operationWork } from "./operation-work.ts"

test("source work carries bounded argument previews and exact retrievable decorator source", async () => {
  const longText = "z".repeat(12000)
  const content = `def details(text):\n    return text\ndef factory(**kwargs):\n    def apply(cls):\n        return cls\n    return apply\n@factory(example=details("${longText}"))\nclass View:\n    def entry(self):\n        return True\n`
  const index = await buildStructureIndex([{ path: "app.py", content }], { repository: "anonymous", sourceRef: "r" })
  const entry = index.symbols.find(s => s.qualifiedName === "app.View.entry")!
  const work = operationWork(index, entry.id, [], [], "app.View", { questionDirected: true })
  expect(work.actions.length).toBeGreaterThan(0)
  expect(work.actions.every(a => Buffer.byteLength(a.reason) < 1500)).toBe(true)
  expect(work.actions.some(a => a.reason.includes("source arguments omitted") && a.reason.includes("app.py:7"))).toBe(true)
  const decorator = index.classDecorators("app.View")[0]!
  expect(decorator.arguments.join()).toContain(longText)
  expect(work.frameworkGaps.length).toBeGreaterThan(0)
  expect(work.actions.every(a => a.frameworkBoundary)).toBe(true)
})
