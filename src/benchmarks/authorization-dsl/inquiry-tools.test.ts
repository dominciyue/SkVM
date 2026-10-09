import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, symlink, cp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"

test("production source identities and restored evidence survive a real directory copy and budget change", async () => {
  const original = await mkdtemp(path.join(os.tmpdir(), "av-identity-")), moved = await mkdtemp(path.join(os.tmpdir(), "av-moved-"))
  await writeFile(path.join(original, "app.py"), "def outer(x):\n    return inner(x)\ndef inner(x):\n    return x\n")
  await writeFile(path.join(original, "extra.ts"), "export function auxiliary() { return true; }\n")
  await cp(original, moved, { recursive: true })
  for (const structure of [false, true]) {
    const base = { sourceRoot: original, allowedPaths: ["."], repository: "fixture", sourceRef: "r", structure, maxToolCalls: 24 }
    const a = await createInquiryTools(base), b = await createInquiryTools({ ...base, sourceRoot: moved, maxToolCalls: 64 })
    expect(a.locateSymbols("outer")).toEqual(b.locateSymbols("outer"))
    expect(a.locateSymbols("auxiliary")).toEqual(b.locateSymbols("auxiliary"))
    expect(a.structure?.revision).toBe(b.structure?.revision)
    const read = await a.execute("source_read", { path: "app.py", startLine: 1, endLine: 2 })
    expect(b.restoreEvidence(read.evidence).diagnostics).toEqual([])
    expect(b.evidence).toEqual(read.evidence)
  }
})

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
test("directory selectors search only indexed descendants with original evidence and no prefix collision", async () => {
  const { root } = await fixture()
  await mkdir(path.join(root, "src-other"))
  await writeFile(path.join(root, "src-other/helper.ts"), "export function authorizeRecord() { return 'sibling'; }\n")
  const tools = await createInquiryTools({ sourceRoot: root, allowedPaths: ["src/entry.ts", "src/helper.ts", "src-other/helper.ts"], repository: "synthetic", sourceRef: "fixed" })
  const search = await tools.execute("source_search", { text: "authorizeRecord", path: "src" })
  expect(search.status).toBe("ok")
  expect(search.matches.map(m => m.path)).toEqual(["src/entry.ts", "src/helper.ts"])
  expect(search.evidence.map(e => e.path)).toEqual(["src/entry.ts", "src/helper.ts"])
  expect(search.evidence.every(e => e.sourceRef === "fixed" && e.text.includes("authorizeRecord"))).toBe(true)
  const file = await tools.execute("source_search", { text: "authorizeRecord", path: "src/helper.ts" })
  expect(file.evidence[0]!.id).toBe(search.evidence[1]!.id)
  const symbol = await tools.execute("source_symbol", { name: "authorizeRecord", path: "src" })
  expect(symbol.candidates.map(c => c.path)).toEqual(["src/helper.ts"])
  expect((await tools.execute("source_search", { text: "authorizeRecord", path: "." })).matches).toHaveLength(3)
  expect((await tools.execute("source_read", { path: "src", startLine: 1, endLine: 1 })).code).toBe("source-out-of-scope")
  expect(tools.files.map(f => f.path)).not.toContain("src/other.ts")
})
test("directory selectors preserve scope safety and source identity checks", async () => {
  const { tools, root } = await fixture()
  for (const selector of ["oracle", ".env", "../src", "C:/src", "src//", "src/missing"]) {
    for (const name of ["source_search", "source_symbol"]) {
      const result = await tools.execute(name, { path: selector, ...(name === "source_search" ? { text: "authorizeRecord" } : { name: "authorizeRecord" }) })
      expect(result.code).toBe("source-out-of-scope")
      expect(result.evidence).toEqual([])
    }
  }
  const read = await tools.execute("source_search", { text: "authorizeRecord", path: "src" })
  expect(read.status).toBe("ok")
  await writeFile(path.join(root, "src/helper.ts"), "export function authorizeRecord() { return 'changed'; }\n")
  expect((await tools.execute("source_search", { text: "authorizeRecord", path: "src" })).code).toBe("source-changed")
  expect((await tools.execute("source_symbol", { name: "authorizeRecord", path: "src" })).code).toBe("source-changed")
  expect(tools.evidence).toContainEqual(read.evidence[1]!)
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
test("physical source budget includes indexing and every identity-checked reread", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-read-budget-")), source = "export function entry() { return true; }\n", size = Buffer.byteLength(source)
  await writeFile(path.join(root, "entry.ts"), source)
  const tools = await createInquiryTools({ sourceRoot: root, allowedPaths: ["entry.ts"], repository: "neutral", sourceRef: "fixed", maxReadBytes: size * 2 })
  expect((await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })).status).toBe("ok")
  const retained = [...tools.evidence]
  expect((await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })).code).toBe("read-budget")
  expect(tools.ioReadBytes).toBe(size * 2)
  expect(tools.evidence).toEqual(retained)
})
test("indexed search spends physical rereads on matching files and preserves budget for the helper body", async () => {
  const { root, tools: original } = await fixture(), indexBytes = original.indexBytes, helperBytes = original.files.find(f => f.path === "src/helper.ts")!.bytes
  const tools = await createInquiryTools({ sourceRoot: root, allowedPaths: ["src"], repository: "synthetic", sourceRef: "fixed", maxReadBytes: indexBytes + helperBytes * 2 })
  const missing = await tools.execute("source_search", { text: "absentLiteral" })
  expect(missing.status).toBe("ok")
  expect(tools.ioReadBytes).toBe(indexBytes)
  const search = await tools.execute("source_search", { text: "return false" })
  expect(search.status).toBe("ok")
  expect(search.matches.map(m => m.path)).toEqual(["src/helper.ts"])
  expect((await tools.execute("source_read", { path: "src/helper.ts", startLine: 1, endLine: 3 })).status).toBe("ok")
  expect(tools.ioReadBytes).toBe(indexBytes + helperBytes * 2)
})
test("final snapshot detects an unmatched file edit and a new indexed path without a live search", async () => {
  for (const added of [false, true]) {
    const { root, tools } = await fixture()
    expect((await tools.execute("source_search", { text: "newMatch" })).matches).toEqual([])
    await writeFile(path.join(root, added ? "src/added.ts" : "src/entry.ts"), "export function newMatch() { return true; }\n")
    expect(await (tools as any).verifySnapshot()).toMatchObject({ valid: false, code: "source-changed" })
  }
})

test("preparation reports ordered phases and file timings within the unchanged allowed scope", async () => {
  const { root } = await fixture(), events: any[] = []
  await writeFile(path.join(root, "src/helper.py"), "def helper(x):\n    return x\n")
  const tools = await createInquiryTools({ sourceRoot: root, allowedPaths: ["src/helper.py"], repository: "neutral", sourceRef: "r", structure: true, preparation: { onProgress: (event: any) => events.push(event) } } as any)
  expect(events.filter(e => e.state === "started").map(e => e.phase)).toEqual(["walk", "load", "lexical", "ast", "postprocess"])
  expect(events.at(-1)).toMatchObject({ phase: "complete", state: "completed", completedFiles: 1, totalFiles: 1, bytes: tools.indexBytes })
  expect(events.every(e => e.elapsedMs >= 0)).toBe(true)
  expect(events.filter(e => e.phase === "ast" && e.currentPath === "src/helper.py").length).toBeGreaterThan(0)
  expect(tools.files.map(f => f.path)).toEqual(["src/helper.py"])
})
test("preparation failure retains its exact walk path and phase", async () => {
  const { root } = await fixture(), events: any[] = []
  await expect(createInquiryTools({ sourceRoot: root, allowedPaths: ["src/absent.py"], repository: "neutral", sourceRef: "r", preparation: { onProgress: (event: any) => events.push(event) } } as any)).rejects.toThrow()
  expect(events.at(-1)).toMatchObject({ phase: "walk", state: "failed", currentPath: "src/absent.py" })
  expect(events.at(-1).error).toContain("ENOENT")
})
test("cancellation during source preparation terminates before AST/runtime construction", async () => {
  const { root } = await fixture(), events: any[] = [], controller = new AbortController()
  await expect(createInquiryTools({ sourceRoot: root, allowedPaths: ["src/helper.ts"], repository: "neutral", sourceRef: "r", structure: true, preparation: { signal: controller.signal, onProgress: (event: any) => { events.push(event); if (event.phase === "lexical" && event.state === "completed") controller.abort() } } } as any)).rejects.toThrow("cancelled")
  expect(events.at(-1)).toMatchObject({ state: "cancelled", phase: "lexical" })
  expect(events.some(e => e.phase === "ast" || e.phase === "complete")).toBe(false)
})
test("module order extraction reuses syntax events locally and revalidates changed source bytes", async () => {
  const { root } = await fixture(), source = Array.from({ length: 120 }, (_, i) => `v${i} = lookup(${i})`).join("\n") + "\n"
  await writeFile(path.join(root, "large.py"), source)
  const options = { sourceRoot: root, allowedPaths: ["large.py"], repository: "neutral", sourceRef: "r", structure: true }
  const first = await createInquiryTools(options)
  expect((first.structure?.preparation as any).sourceOrder).toBeDefined()
  expect((first.structure?.preparation as any).sourceOrder.eventComputations).toBeLessThan(500)
  expect((first.structure?.preparation as any).sourceOrder.eventCacheHits).toBeGreaterThan(120)
  const unchanged = await createInquiryTools(options)
  expect(unchanged.structure?.revision).toBe(first.structure?.revision)
  await writeFile(path.join(root, "large.py"), source + "v120 = different(v1)\n")
  const changed = await createInquiryTools(options)
  expect(changed.structure?.revision).not.toBe(first.structure?.revision)
  expect(changed.structure?.calls.some(c => c.expression === "different")).toBe(true)
})
test("AST cancellation terminates its owned worker while syntax extraction is running", async () => {
  const { root } = await fixture(), controller = new AbortController(), events: any[] = []
  await writeFile(path.join(root, "busy.py"), Array.from({ length: 700 }, (_, i) => `x${i} = helper(${i})`).join("\n") + "\n")
  let heartbeat = false
  await expect(createInquiryTools({ sourceRoot: root, allowedPaths: ["busy.py"], repository: "neutral", sourceRef: "r", structure: true, preparation: { signal: controller.signal, onProgress: (event: any) => { events.push(event); if (event.detail === "syntax-facts-start") setTimeout(() => { heartbeat = true; controller.abort() }, 1) } } } as any)).rejects.toThrow("cancelled")
  expect(heartbeat).toBe(true)
  expect(events.at(-1)).toMatchObject({ phase: "ast", currentPath: "busy.py", state: "cancelled", detail: "owned-worker-exited" })
  expect(events.some(e => e.phase === "complete")).toBe(false)
})
test("both public entrances stop cancelled preparation before model dispatch", async () => {
  const { root } = await fixture(), controller = new AbortController(); controller.abort()
  const inquiry = { schemaVersion: "authorization-inquiry/v1" as const, mode: "behavior" as const, questions: [{ id: "q", request: "Inspect original source behavior", premises: [] }] }
  let dispatches = 0
  const provider: any = { name: "mock", complete: async () => { dispatches++; throw new Error("No model dispatch is permitted") } }
  await expect(runAuthorizationInquiry({ sourceRoot: root, allowedPaths: ["src"], repository: "neutral", sourceRef: "r", brief: "Inspect original source behavior", inquiry, provider, method: "M", strategy: "operation-evidence-v7", preparation: { signal: controller.signal } })).rejects.toThrow("cancelled")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", sourceRoot: ".", allowedPaths: ["src"], repository: "neutral", sourceRef: "r", inquiry }))
  await expect(createNativeInquiryRuntime({ inputFile, workDir: root, domainTools: true, strategy: "operation-evidence-v7", preparation: { signal: controller.signal } } as any)).rejects.toThrow("cancelled")
  expect(dispatches).toBe(0)
})
