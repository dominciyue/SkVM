import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"

async function fixture(options: Record<string, number> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-source-"))
  await mkdir(path.join(root, "src"))
  await mkdir(path.join(root, "oracle"))
  await writeFile(path.join(root, "src/entry.ts"), "export function entry() {\n  return authorizeRecord();\n}\n")
  await writeFile(path.join(root, "src/helper.ts"), "export function authorizeRecord() {\n  return false;\n}\n")
  await writeFile(path.join(root, "src/other.ts"), "export function authorizeRecord() { return true; }\n")
  await writeFile(path.join(root, "oracle/answer.ts"), "CANARY_ANSWER")
  await writeFile(path.join(root, ".env"), "CANARY_SECRET")
  await writeFile(path.join(root, "entry_test.go"), "CANARY_TEST_ANSWER")
  return { root, tools: await createInquiryTools({ sourceRoot: root, allowedPaths: ["."], repository: "synthetic", sourceRef: "fixed", ...options }) }
}
test("list/search/symbol/read exposes numbered original bytes and independent same-name candidates", async () => {
  const { tools } = await fixture()
  const list = await tools.execute("source_list", {})
  expect(JSON.stringify(list)).not.toContain("answer.ts")
  expect(JSON.stringify(list)).not.toContain(".env")
  expect(JSON.stringify(list)).not.toContain("entry_test.go")
  const search = await tools.execute("source_search", { text: "authorizeRecord" })
  expect(search.matches.length).toBe(3)
  const symbol = await tools.execute("source_symbol", { name: "authorizeRecord" })
  expect(symbol.candidates.length).toBe(2)
  expect(symbol.status).toBe("ambiguous")
  const read = await tools.execute("source_read", { path: "src/helper.ts", startLine: 1, endLine: 3 })
  expect(read.evidence[0]!.text).toContain("2 |   return false;")
  expect(read.evidence[0]!.sourceRef).toBe("fixed")
  expect(tools.evidence.map(item => item.id)).toContain(read.evidence[0]!.id)
  const again = await tools.execute("source_read", { path: "src/helper.ts", startLine: 1, endLine: 3 })
  expect(again.evidence[0]!.id).toBe(read.evidence[0]!.id)
  expect(tools.evidence.filter(item => item.id === read.evidence[0]!.id).length).toBe(1)
})
test("a read extending past EOF retains the available original window and exact requested range", async () => {
  const { tools } = await fixture()
  const read = await tools.execute("source_read", { path: "src/entry.ts", startLine: 1, endLine: 4 })
  expect(read.status).toBe("ok")
  expect(read.code).toBe("source-end-clamped")
  expect(read.requested).toMatchObject({ startLine: 1, endLine: 4 })
  expect(read.evidence[0]).toMatchObject({ startLine: 1, endLine: 3 })
  expect(read.evidence[0]!.text).toContain("return authorizeRecord")
  expect((await tools.execute("source_read", { path: "src/entry.ts", startLine: 1, endLine: 3 })).evidence[0]!.id).toBe(read.evidence[0]!.id)
  for (const [startLine, endLine] of [[4, 5], [3, 2]]) expect((await tools.execute("source_read", { path: "src/entry.ts", startLine, endLine })).code).toBe("source-range")
})
test("canonical directory cycle is bounded and an escaping junction is rejected", async () => {
  const { root } = await fixture(), outside = await mkdtemp(path.join(os.tmpdir(), "ao-outside-"))
  await writeFile(path.join(outside, "hidden.ts"), "export const privateData = true;")
  await symlink(path.join(root, "src"), path.join(root, "src/cycle"), "junction")
  const cyclic = await createInquiryTools({ sourceRoot: root, allowedPaths: ["src"], repository: "synthetic", sourceRef: "fixed" })
  expect(cyclic.files.length).toBe(3)
  await symlink(outside, path.join(root, "src/escape"), "junction")
  await expect(createInquiryTools({ sourceRoot: root, allowedPaths: ["src"], repository: "synthetic", sourceRef: "fixed" })).rejects.toThrow("symlink-escape")
})
test("execution denies oracle, secret, path escape, shell and writes", async () => {
  const { tools } = await fixture()
  for (const name of ["execute_command", "write_file", "web_fetch"]) expect((await tools.execute(name, { path: "src/helper.ts", content: "bad" })).code).toBe("tool-not-registered")
  for (const file of ["oracle/answer.ts", ".env", "../outside.ts", "C:/outside.ts"]) expect((await tools.execute("source_read", { path: file, startLine: 1, endLine: 1 })).status).toBe("error")
})
test("source change stops affected reads and preserves already shown evidence", async () => {
  const { tools, root } = await fixture()
  const read = await tools.execute("source_read", { path: "src/helper.ts", startLine: 1, endLine: 3 })
  await writeFile(path.join(root, "src/helper.ts"), "export function authorizeRecord() { return true; }\n")
  expect((await tools.execute("source_read", { path: "src/helper.ts", startLine: 1, endLine: 1 })).code).toBe("source-changed")
  expect(tools.evidence[0]?.id).toBe(read.evidence[0]!.id)
})
test("file, source display and tool budgets retain concrete gaps and partial reads", async () => {
  const { tools } = await fixture({ maxFiles: 2, maxDisplayBytes: 60, maxToolCalls: 2 })
  expect(tools.scopeGaps.some(item => item.code === "file-budget")).toBe(true)
  const read = await tools.execute("source_read", { path: "src/entry.ts", startLine: 1, endLine: 3 })
  expect(["partial", "ok"]).toContain(read.status)
  expect(tools.displayBytes).toBeLessThanOrEqual(60)
  await tools.execute("source_list", {})
  expect((await tools.execute("source_list", {})).code).toBe("tool-budget")
})
