import { expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { selectPosition, modelInputPath, reserveAttempt, replayAccounting, positionTemplates, nativeInvocation, nativeCompletionStatus, loadAdmittedAuthor, sha, archiveInquiryResult, configureStudyRuntime, currentStatus } from "./study.ts"
import { resolveConfigWritePath, invalidateConfigCache } from "../../../../../src/core/config.ts"
import { executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { RUN_FLAGS } from "../../../../../src/cli/run.ts"
import { ReviewAdmissionSchema, AttemptReportSchema, type Manifest } from "./types.ts"
import { emptyTokenUsage } from "../../../../../src/core/types.ts"
import type { AuthorizationProviderAttempt, AuthorizationLifecycleEvent } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

test("finite positions require exact unique registered identities and reject evaluator inputs", () => {
  const positions = positionTemplates(), manifest = { positions } as Manifest
  expect(positions).toHaveLength(26)
  expect(selectPosition(manifest, "debug-paperless-download-D1").task).toBe("paperless-download")
  for (const invalid of ["debug-paperless", "debug-paperless-download", "debug-paperless-download-D1/other", "not-registered"]) expect(() => selectPosition(manifest, invalid)).toThrow()
  expect(() => selectPosition({ ...manifest, positions: [...positions, positions[0]!] }, positions[0]!.id)).toThrow()
  for (const invalid of ["evaluations/answers.json", "model/inputs/../../evaluations/answers.json", "model/inputs/task.json/other", "D:/evaluation.json"]) expect(() => modelInputPath("D:/av", invalid)).toThrow()
  expect(modelInputPath("D:/av", "model/inputs/paperless-download-original.json").replaceAll("\\", "/")).toBe("D:/av/model/inputs/paperless-download-original.json")
})

test("concurrent independent status patches preserve every position and readers receive complete JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "av-status-"))
  await writeFile(path.join(directory, "status.json"), JSON.stringify({ existing: "retained" }))
  const worker = path.join(directory, "writer.ts")
  await writeFile(worker, `import { currentStatus } from ${JSON.stringify(path.join(import.meta.dir, "study.ts"))};\nconst directory=process.argv[2]!, identity=process.argv[3]!;\nawait Promise.all(Array.from({length:12},(_,i)=>currentStatus({[identity+"-"+i]:"archived"},directory)));\n`)
  const children = ["one", "two", "three"].map(identity => Bun.spawn([process.execPath, worker, directory, identity], { stdout: "pipe", stderr: "pipe" }))
  let reading = true, readerError: unknown
  const reader = (async () => { while (reading) { try { JSON.parse(await readFile(path.join(directory, "status.json"), "utf8")) } catch (cause) { readerError = cause; break } await Bun.sleep(1) } })()
  const outcomes = await Promise.all(children.map(async child => ({ code: await child.exited, error: await new Response(child.stderr).text() })))
  reading = false; await reader
  expect(outcomes).toEqual(outcomes.map(() => ({ code: 0, error: "" })))
  expect(readerError).toBeUndefined()
  const recorded = JSON.parse(await readFile(path.join(directory, "status.json"), "utf8"))
  expect(recorded.existing).toBe("retained")
  for (const identity of ["one", "two", "three"]) for (let i = 0; i < 12; i++) expect(recorded[`${identity}-${i}`]).toBe("archived")
}, 30000)

test("a delayed accounting snapshot cannot lower the total already archived by another position", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "av-status-accounting-"))
  await writeFile(path.join(directory, "status.json"), JSON.stringify({ providerCalls: 9 }))
  await currentStatus({ providerCalls: 3, phase: "independent-position" }, directory)
  expect(JSON.parse(await readFile(path.join(directory, "status.json"), "utf8"))).toMatchObject({ providerCalls: 9, phase: "independent-position" })
  await currentStatus({ providerCalls: 12 }, directory)
  expect(JSON.parse(await readFile(path.join(directory, "status.json"), "utf8"))).toMatchObject({ providerCalls: 12 })
})

test("first attempts cannot be overwritten and named revisions require an existing explicit parent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "av-attempt-")), first = await reserveAttempt(root, "position", undefined)
  expect(first.attemptId).toBe("first")
  expect(() => reserveAttempt(root, "position", undefined)).toThrow()
  expect(() => reserveAttempt(root, "position", { label: "repair", parent: "missing" })).toThrow()
  const next = await reserveAttempt(root, "position", { label: "repair", parent: "first" })
  expect(next.attemptId).toBe("revision-repair")
  expect(JSON.parse(await readFile(path.join(next.directory, "claim.json"), "utf8"))).toMatchObject({ revision: "repair", parent: "first" })
  expect(() => reserveAttempt(root, "position", { label: "repair", parent: "first" })).toThrow()
})

test("raw replay counts one actual attempt once, including late usage, recovery and cache read", () => {
  const original: AuthorizationProviderAttempt = { id: "provider-attempt-1", phase: "initial", transport: "schema-tool", status: "timeout", startedAt: "2026-10-06T00:00:00Z", request: { messageCount: 1, messageCharacters: 1, toolNames: [], executableTools: false }, usage: null, costUsd: null, transportAttempts: "unknown", localConsumer: "closed", remoteCompletion: "unknown" }
  const late = { ...original, usage: { ...emptyTokenUsage(), input: 10, output: 2, cacheRead: 8 }, costUsd: 0.1, lateSettlement: { kind: "response" as const, settledAt: "2026-10-06T00:00:03Z" } }
  const recovery: AuthorizationProviderAttempt = { ...original, id: "provider-attempt-2", status: "response", localConsumer: "accepted", remoteCompletion: "response", usage: { ...emptyTokenUsage(), input: 5, output: 1, cacheRead: 4 }, costUsd: 0.2, recovery: { policyVersion: "authorization-readonly-recovery/v1", parentAttemptId: original.id, number: 1, reason: "bounded recovery" } }
  const events: AuthorizationLifecycleEvent[] = [{ sequence: 1, kind: "dispatch", at: original.startedAt, attemptId: original.id, attempt: original }, { sequence: 2, kind: "late-response", at: late.lateSettlement.settledAt, attemptId: original.id, attempt: late }, { sequence: 3, kind: "response", at: late.lateSettlement.settledAt, attemptId: recovery.id, attempt: recovery }]
  const replay = replayAccounting([original, recovery], events)
  expect(replay.summary.providerCalls).toBe(2)
  expect(replay.summary.knownTokens).toMatchObject({ input: 15, output: 3, cacheRead: 12 })
  expect(replay.recoveries).toBe(1); expect(replay.lateSettlements).toBe(1)
  expect(replay.acceptedResponses).toBe(1)
  expect(replay.originalUnknownAttempts).toBe(1)
  expect(replay.summary.totalActualUsd).toBeCloseTo(0.3)
})

test("native completion requires a nonempty final from a natural terminal response", () => {
  const base = { arm: "D-S" as const, cliExitCode: 0, processExitCode: 0, terminalPresent: true, final: "", checkedResult: false, provenanceErrors: [] as string[] }
  expect(nativeCompletionStatus(base)).toBe("native-empty-final")
  expect(nativeCompletionStatus({ ...base, arm: "N", checkedResult: true, final: " \n " })).toBe("native-empty-final")
  expect(nativeCompletionStatus({ ...base, terminalPresent: false, final: "Still inspecting" })).toBe("native-terminal-absent")
  expect(nativeCompletionStatus({ ...base, final: "Bounded report" })).toBe("native-partial-delivered")
  expect(nativeCompletionStatus({ ...base, final: "Bounded report", checkedResult: true })).toBe("native-checked-delivered")
  expect(nativeCompletionStatus({ ...base, arm: "N", final: "Bounded report" })).toBe("native-delivered")
})

test("all quality arms expose the same real session/output/recovery caps through the normal CLI", () => {
  const manifest = { testedModel: "xty/gpt-5.6-sol", budgets: { maxDispatches: 24, maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, maxTokens: 6000, perCallTimeoutMs: 300000, sessionTimeoutMs: 7500000 } } as Manifest
  for (const arm of ["N", "M-S", "D-S"] as const) {
    const row = positionTemplates().find(p => p.id === `quality-paperless-download-${arm}`)!
    const args = nativeInvocation(row, manifest, { prompt: "Unchanged full task", scopeFile: "D:/scope.json", skillFile: "D:/full/SKILL.md", workDir: "D:/workspace", traceFile: "D:/trace.json" })
    const parsed = RUN_FLAGS.parse(args.slice(1))
    if (parsed.help) throw new Error("Expected an executable normal-run invocation")
    expect(parsed["authorization-session-timeout-ms"]).toBe(7500000)
    expect(parsed["timeout-ms"]).toBe(7500000)
    expect(parsed["authorization-request-timeout-ms"]).toBe(300000)
    expect(parsed["authorization-max-output-tokens"]).toBe(6000)
    expect(parsed["authorization-readonly-recovery"]).toBe(true)
    expect(parsed["authorization-domain-tools"]).toBe(arm !== "N")
    expect(parsed["authorization-method"]).toBe(arm === "N" ? undefined : arm === "M-S" ? "M" : "D1")
  }
})

test("admission and replay archives reject traversal and ambiguous attempt identities", () => {
  const admission = { schemaVersion: "authorization-av-author-admission/v1", status: "accepted", authorPosition: "author-paperless-download-original", authorAttempt: "first", inquirySha256: "a".repeat(64), usageSha256: "b".repeat(64), reviewer: "independent-readonly-ai-plus-main-adjudication", reason: "Reviewed exact original task" }
  expect(ReviewAdmissionSchema.safeParse(admission).success).toBe(true)
  for (const authorAttempt of ["../other", "first/child", "D:/outside", "revision-", ""] ) expect(ReviewAdmissionSchema.safeParse({ ...admission, authorAttempt }).success).toBe(false)
  const report = { schemaVersion: "authorization-av-attempt/v1", positionId: "native-paperless-download-original", attemptId: "first", revision: null, parent: null, startedAt: "2026-10-06", implementationRevision: "fixed", model: "xty/gpt-5.6-sol", inputSha256: "a".repeat(64), sourceFiles: [], skillBundleSha256: null, status: "native-delivered", providerCalls: 1, targetExecutions: 0, raw: { kind: "native", file: "raw/native-trace.json.gz" }, final: "Original final" }
  expect(AttemptReportSchema.safeParse(report).success).toBe(true)
  for (const file of ["../outside.json", "raw/../../evaluations/answer.json", "D:/outside.json"]) expect(AttemptReportSchema.safeParse({ ...report, raw: { kind: "native", file } }).success).toBe(false)
})

test("consumer admission binds exact author position, attempt, original input and structural record", async () => {
  const studyRoot = await mkdtemp(path.join(os.tmpdir(), "av-admission-")), position = positionTemplates().find(p => p.id === "consumer-paperless-download-original")!, author = positionTemplates().find(p => p.id === position.authorPosition)!
  const origin = path.join(studyRoot, "positions", author.id, "first"); await mkdir(origin, { recursive: true })
  const inquiry = Buffer.from("original author bytes"), usage = Buffer.from("original usage bytes"), inputSha256 = "c".repeat(64)
  await writeFile(path.join(origin, "authored-inquiry.json"), inquiry); await writeFile(path.join(origin, "authored-USAGE.md"), usage)
  const admission = { schemaVersion: "authorization-av-author-admission/v1", status: "accepted", authorPosition: author.id, authorAttempt: "first", inquirySha256: sha(inquiry), usageSha256: sha(usage), reviewer: "independent-readonly-ai-plus-main-adjudication", reason: "Original task faithfully retained" }
  const manifest = { positions: [position, author], inputs: [{ id: author.inputId, task: author.task, sha256: inputSha256 }], testedModel: "xty/gpt-5.6-sol" } as Manifest
  const report = { schemaVersion: "authorization-av-attempt/v1", positionId: author.id, attemptId: "first", revision: null, parent: null, startedAt: "2026-10-06", implementationRevision: "fixed", model: manifest.testedModel, inputSha256, sourceFiles: [], skillBundleSha256: null, status: "authored-awaiting-review", providerCalls: 1, targetExecutions: 0, raw: { kind: "author", file: "raw/author-run.json" }, final: "Authored" }
  const record = { status: "structurally-valid-awaiting-independent-admission", artifacts: { "inquiry.json": { sha256: sha(inquiry), bytes: inquiry.length }, "USAGE.md": { sha256: sha(usage), bytes: usage.length } } }
  await writeFile(path.join(origin, "report.json"), JSON.stringify(report)); await writeFile(path.join(origin, "author-validation.json"), JSON.stringify(record))
  expect((await loadAdmittedAuthor(studyRoot, manifest, position, admission)).inquiry).toEqual(inquiry)
  for (const patch of [{ positionId: "author-paperless-download-changed" }, { attemptId: "revision-other" }, { inputSha256: "d".repeat(64) }, { status: "author-invalid" }, { raw: { kind: "native", file: "raw/native-trace.json.gz" } }]) {
    await writeFile(path.join(origin, "report.json"), JSON.stringify({ ...report, ...patch }))
    expect(() => loadAdmittedAuthor(studyRoot, manifest, position, admission)).toThrow()
  }
})

test("study runtime uses the production cache environment for actual model routing", async () => {
  const cachePath = await mkdtemp(path.join(os.tmpdir(), "av-route-")), old = process.env.SKVM_CACHE
  try { configureStudyRuntime({ cachePath }); expect(resolveConfigWritePath()).toBe(path.join(cachePath, "skvm.config.json")) }
  finally { if (old === undefined) delete process.env.SKVM_CACHE; else process.env.SKVM_CACHE = old; invalidateConfigCache() }
})

test("a retained provider-unavailable session archives zero actual calls without inventing run.json", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "av-zero-provider-")), source = path.join(directory, "source"); await mkdir(source)
  await writeFile(path.join(source, "entry.py"), "def entry():\n    return False\n")
  const inputFile = path.join(directory, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["entry.py"], brief: "Inspect entry" }))
  const report = await executeLocalInquiryRun({ inputFile, outDir: path.join(directory, "inquiry"), model: "mock/model", method: "D1", strategy: "operation-evidence-v2", providerFactory: () => { throw new Error("Controlled provider unavailable before any dispatch") } })
  expect(report.status).toBe("provider-unavailable")
  const archived = await archiveInquiryResult(directory, report)
  expect(archived).toMatchObject({ status: "provider-unavailable", providerCalls: 0, raw: { kind: "inquiry", file: "raw/inquiry-not-dispatched.json" } })
  expect(JSON.parse(await readFile(path.join(directory, archived.raw.file), "utf8"))).toMatchObject({ attempts: [], events: [], report: { providerDispatches: 0 } })
})
