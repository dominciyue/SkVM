import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import os from "node:os"
import path from "node:path"
const api = await import("./ordinary-author-capture.ts").catch(() => ({} as any)) as any
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ar-author-log-")), logRoot = path.join(root, "log"), directory = path.join(logRoot, "20261004-013045-run"), output = path.join(root, "archive")
  await mkdir(directory, { recursive: true }); await mkdir(output)
  const taskKey = "natural-01ad17fd2754", filename = `conv-001-${taskKey}.jsonl`
  return { root, logRoot, directory, output, taskKey, filename, stdout: `Conversation logging enabled: ${directory}\n` }
}
test("ordinary author capture binds the actual task conversation log and preserves raw bytes", async () => {
  expect(typeof api.captureOrdinaryAuthorConversation).toBe("function")
  const f = await fixture(), raw = Buffer.from([JSON.stringify({ type: "request" }), JSON.stringify({ type: "response", tokens: { input: 12, output: 3, cacheRead: 4, cacheWrite: 0 } })].join("\n") + "\n")
  await writeFile(path.join(f.directory, f.filename), raw)
  await writeFile(path.join(f.directory, "conv-001-natural-d82d449c4684.jsonl"), JSON.stringify({ type: "request" }) + "\n")
  const result = await api.captureOrdinaryAuthorConversation(f)
  expect(result).toMatchObject({ providerCalls: 1, respondedCalls: 1, knownTokens: { input: 12, output: 3, cacheRead: 4, cacheWrite: 0 }, actualUSD: null })
  expect(result.sourceCaptureFiles).toHaveLength(1)
  expect(gunzipSync(await readFile(path.join(f.output, result.sourceCaptureFiles[0].archive))).equals(raw)).toBe(true)
})
test("missing author conversation records stay unknown even when runtime capture metadata exists", async () => {
  expect(typeof api.captureOrdinaryAuthorConversation).toBe("function")
  const f = await fixture(), result = await api.captureOrdinaryAuthorConversation(f)
  expect(result.providerCalls).toBeNull()
  expect(result.respondedCalls).toBeNull()
  expect(result.knownTokens).toEqual({ input: null, output: null, cacheRead: null, cacheWrite: null })
})
test("the normal timestamped conv-log prefix identifies the same task archive", async () => {
  const f = await fixture()
  await writeFile(path.join(f.directory, f.filename), JSON.stringify({ type: "request" }) + "\n")
  const result = await api.captureOrdinaryAuthorConversation({ ...f, stdout: `01:30:45.827 [INFO ] [conv-log] ${f.stdout}` })
  expect(result.providerCalls).toBe(1)
  expect(result.sourceCaptureFiles).toHaveLength(1)
})
test("stdout cannot bind an outside log directory and missing response usage is explicit", async () => {
  expect(typeof api.captureOrdinaryAuthorConversation).toBe("function")
  const f = await fixture()
  await writeFile(path.join(f.directory, f.filename), JSON.stringify({ type: "request" }) + "\n" + JSON.stringify({ type: "response", tokens: { output: 9 } }) + "\n")
  const result = await api.captureOrdinaryAuthorConversation(f)
  expect(result.knownTokens).toEqual({ input: 0, output: 9, cacheRead: 0, cacheWrite: 0 })
  expect(result.missingUsageResponses).toEqual({ input: 1, output: 0, cacheRead: 1, cacheWrite: 1 })
  const outside = await api.captureOrdinaryAuthorConversation({ ...f, stdout: `Conversation logging enabled: ${f.root}\n` })
  expect(outside.providerCalls).toBeNull()
})
