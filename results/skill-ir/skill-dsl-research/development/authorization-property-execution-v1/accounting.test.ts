import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { gzipSync } from "node:zlib"
import { auditAccountContexts, collectAccounts, sumAccountUsage } from "./accounting.ts"
import { createInquiryContextEncoder } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"

test("account accounting keeps cache inside full input and preserves unknown rows", () => {
  const sum = sumAccountUsage([{ input: 100, output: 4, cacheRead: 80, cacheWrite: 0 }, null])
  expect(sum.input).toEqual({ knownSubtotal: 100, knownRows: 1, unknownRows: 1 })
  expect(sum.nonCachedInput.knownSubtotal).toBe(20)
  expect(sum.cacheRead.knownSubtotal).toBe(80)
  expect(sum.complete).toBe(false)
})
test("fully reported account first and revision usage remain separate additive observations", () => {
  const sum = sumAccountUsage([{ input: 50, output: 3, cacheRead: 20, cacheWrite: 0 }, { input: 80, output: 6, cacheRead: 70, cacheWrite: 0 }])
  expect(sum.input.knownSubtotal).toBe(130)
  expect(sum.nonCachedInput.knownSubtotal).toBe(40)
  expect(sum.output.knownSubtotal).toBe(9)
  expect(sum.complete).toBe(true)
})
test("inconsistent cache totals do not become a negative noncached input claim", () => {
  expect(() => sumAccountUsage([{ input: 8, output: 2, cacheRead: 9, cacheWrite: 0 }])).toThrow("cache")
})
test("smoke rows bind their actual evaluation bytes and count rejected host callbacks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-accounting-"))
  try {
    const { mkdir } = await import("node:fs/promises")
    const directory = path.join(root, "attempts", "smoke", "original")
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ positions: [{ id: "smoke", kind: "smoke", attempts: ["smoke/original"] }] }))
    const evaluation = JSON.stringify({ status: "completed" }) + "\r\n"
    await writeFile(path.join(directory, "evaluation.json"), evaluation)
    await writeFile(path.join(directory, "account.json"), JSON.stringify({ tools: [{}], toolRejections: [{}], usage: { input: 10, output: 2, cacheRead: 4, cacheWrite: 0 } }))
    const row = (await collectAccounts(root)).rows[0]
    expect(row.reportSha256).toBe(createHash("sha256").update(evaluation).digest("hex"))
    expect(row.hostToolCalls).toBe(2)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("wire audit ignores host-only copies and reports a missing outgoing packet", () => {
  const hostCopy = { direction: "host", result: { contentItems: [{ text: JSON.stringify({ currentContext: { contextSequence: 1 } }) }] } }
  expect(auditAccountContexts([hostCopy], 1)).toMatchObject({ status: "failed", packets: 0, issues: ["incomplete-wire-context: expected 1 packets, retained 0"] })
})
test("redacted source references require an exact source reconstruction and retain its distinct status", () => {
  const window = { id: "ev-source", path: "auth.py", sha256: "source-digest", startLine: 1, endLine: 2, text: "password = config.password\n" + "source text\n".repeat(100), bytes: 1227 }
  const encode = createInquiryContextEncoder(), first = encode({ sourceWindows: [window] }).context, second = encode({ sourceWindows: [window] }).context
  const events = [first, second].map(currentContext => ({ direction: "client", result: { contentItems: [{ text: redactCodexEvent(JSON.stringify({ currentContext })) }] } }))
  expect(auditAccountContexts(events, 2).status).toBe("failed")
  expect(auditAccountContexts(events, 2, new Map([[window.id, window]]))).toMatchObject({ status: "verified-with-source-reconstruction", packets: 2, restoredSourceWindows: 1, issues: [] })
  expect(auditAccountContexts(events, 2, new Map([[window.id, { ...window, text: window.text + "wrong" }]]))).toMatchObject({ status: "failed", restoredSourceWindows: 0 })
})
test("source reconstruction rejects malformed archived line ranges before slicing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-window-range-")), { mkdir } = await import("node:fs/promises")
  const digest = (value: string) => createHash("sha256").update(value).digest("hex")
  try {
    const directory = path.join(root, "attempts", "native", "original"), sourceRoot = path.join(root, "source")
    await mkdir(directory, { recursive: true }); await mkdir(sourceRoot)
    const source = "def entry():\n    return True\n", input = JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "range", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect entry authorization.", mode: "behavior" }), inputFile = path.join(root, "input.json")
    await writeFile(path.join(sourceRoot, "app.py"), source); await writeFile(inputFile, input)
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ positions: [{ id: "native", kind: "native", attempts: ["native/original"] }] }))
    await writeFile(path.join(directory, "report.json"), JSON.stringify({ status: "completed" }))
    await writeFile(path.join(directory, "claim.json"), JSON.stringify({ inputFile, inputSha256: digest(input), sourceFiles: [{ path: "app.py", sha256: digest(source) }] }))
    for (const [startLine, endLine] of [[0, 2], [1.5, 2], [1, 99], [2, 1]]) {
      const lines = source.replace(/\r?\n$/, "").split(/\r?\n/), text = lines.slice(startLine! - 1, endLine).map((line, i) => `${startLine! + i} | ${line}\n`).join("")
      const evidence = { id: `ev-${digest(["anonymous", "r", "app.py", digest(source), startLine, endLine].join("\0")).slice(0, 20)}`, path: "app.py", sha256: digest(source), startLine, endLine, bytes: Buffer.byteLength(text) }
      await writeFile(path.join(directory, "run-result.json.gz"), gzipSync(JSON.stringify({ authorizationInquiry: { evidence: [evidence], contextPayloads: [], account: { events: [] } } })))
      await expect(collectAccounts(root)).rejects.toThrow("Window range")
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
