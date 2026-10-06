import { expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createPackageWriter } from "./author.ts"

test("account author writer preserves every draft and only writes the two root artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-author-"))
  const writer = await createPackageWriter({ workDir: path.join(root, "workspace"), archiveDir: path.join(root, "writes"), maxToolCalls: 8, sourceToolCalls: () => 0 })
  await expect(writer.execute({ path: "../source/app.py", content: "changed" })).rejects.toThrow()
  await writer.execute({ path: "inquiry.json", content: "{\"first\":true}\r\n" })
  await writer.execute({ path: "inquiry.json", content: "{\"second\":true}\n" })
  expect(await readFile(path.join(root, "workspace/inquiry.json"), "utf8")).toBe("{\"second\":true}\n")
  const drafts = writer.report()
  expect(drafts).toHaveLength(2)
  expect(await readFile(drafts[0]!.archive, "utf8")).toBe("{\"first\":true}\r\n")
  expect(drafts[0]!.sha256).not.toBe(drafts[1]!.sha256)
})
test("source and artifact writes share the author budget and UTF-8 byte cap", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-author-budget-"))
  let sourceCalls = 2
  const writer = await createPackageWriter({ workDir: path.join(root, "workspace"), archiveDir: path.join(root, "writes"), maxToolCalls: 3, sourceToolCalls: () => sourceCalls })
  const first = await writer.execute({ path: "USAGE.md", content: "Source stays read-only." })
  expect(first.exitCode).toBe(0)
  expect((await writer.execute({ path: "inquiry.json", content: "{}" })).exitCode).toBe(1)
  expect(writer.report()).toHaveLength(1)
  sourceCalls = 0
  await expect(writer.execute({ path: "USAGE.md", content: "汉".repeat(400000) })).rejects.toThrow("byte")
})
