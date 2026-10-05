import { expect, test } from "bun:test"
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
const api = await import("./study.ts").catch(() => ({} as any))
const { executeLocalInquiryRun } = await import("../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts")
const row = (id: string) => ({ id, task: "memos-remove", method: "D1", strategy: "guided-evidence-v2", components: ["wire", "checker"] })
const options = (extra = {}) => ({ revision: "test-revision", model: "mock", budgets: { maxDispatches: 12 }, concurrency: 2, ...extra })
const temp = () => mkdtemp(path.join(os.tmpdir(), "authorization-ar-driver-"))
const focusedCandidateFailure = () => ({ status: "completed-with-diagnostics", ordinaryEntry: "skvm run", validation: { valid: false }, sourceVerification: { valid: true }, finalProse: "Source explanation preserves its unresolved dependency.", domain: { closed: true, check: { structureValid: false, sourceBound: true, diagnostics: [{ code: "focus-result-stale" }] } }, history: [{ call: { name: "authorization_check_result" }, exitCode: 0, output: { valid: false, diagnostics: [{ code: "focus-result-stale" }, { code: "semantic-result-schema" }] } }] })

test("known focused native candidate rejection is not a shared checker failure", () => {
  expect(api.mechanicalReview(focusedCandidateFailure()).failure.components).toEqual(["model-draft"])
  for (const invalid of [{ ...focusedCandidateFailure(), attempts: [{ status: "pending" }] }, { ...focusedCandidateFailure(), error: "Runtime crashed" }, { ...focusedCandidateFailure(), history: [{ call: { name: "authorization_check_result" }, exitCode: 1, output: { status: "error", message: "Unexpected runtime crash" } }] }]) expect(api.mechanicalReview(invalid).failure.components).not.toEqual(["model-draft"])
})

test("a hash-bound model candidate reclassification permits listed same-task work but retains the original failure", async () => {
  const root = await temp(), report = focusedCandidateFailure()
  await api.developRows(root, [row("candidate")], options({ execute: async () => report, evaluate: async () => ({ failure: { category: "state/checker", rootCause: "Old broad classification", components: ["checker"] } }) }))
  const artifact = "runs/candidate/attempt-1/report.json", proof = "candidate-review.json"
  await writeFile(path.join(root, proof), JSON.stringify({ providerCalls: 0, checkerCorrectlyRejectedCandidate: true }))
  const hash = async (file: string) => createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")
  const release = { failureId: "candidate-attempt-1", originalArtifactSha256: await hash(artifact), releasedComponents: ["checker"], eligibleRows: ["next"], retainTaskPause: false, classification: "model-candidate", rationale: "Exact known response violated current focus; no shared failure or unknown completion", verificationArtifacts: [{ path: proof, sha256: await hash(proof) }] }
  await writeFile(path.join(root, "scope-adjudications.jsonl"), JSON.stringify(release) + "\n")
  const result = await api.developRows(root, [row("next"), row("unlisted")], options({ concurrency: 1, execute: async () => ({ status: "completed" }), evaluate: async () => ({}) }))
  expect(result.rows[0].status).toBe("completed")
  expect(result.rows[1].status).toBe("not-run-after-defect")
  expect((await json(path.join(root, artifact))).report.status).toBe("completed-with-diagnostics")
  await writeFile(path.join(root, artifact), JSON.stringify({ identity: { row: row("candidate") }, report: { ...report, attempts: [{ status: "pending" }] } }))
  release.originalArtifactSha256 = await hash(artifact)
  await writeFile(path.join(root, "scope-adjudications.jsonl"), JSON.stringify(release) + "\n")
  await expect(api.developRows(root, [row("another")], options({ execute: async () => ({ status: "completed" }), evaluate: async () => ({}) }))).rejects.toThrow("known model candidate")
})
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
async function knownRepairChain(root: string) {
  const rows = [row("chain")], run = options({ concurrency: 1, execute: async () => ({ status: "completed", telemetry: { providerCalls: 1 } }), evaluate: async () => ({ failure: { category: "schema/wire", rootCause: "known responded failure", components: ["wire"] } }) })
  await api.developRows(root, rows, run)
  await api.developRows(root, rows, { ...run, repairId: "first-repair", repairOf: "chain/attempt-1" })
  return { rows, run }
}
test("a shared defect pauses affected dispatch while retaining the other in-flight answer", async () => {
  expect(typeof api.developRows).toBe("function")
  const root = await temp(), started: string[] = []
  let release!: () => void
  const ready = new Promise<void>(resolve => { release = resolve })
  const result = await api.developRows(root, [row("first"), row("in-flight"), row("remaining")], options({
    execute: async (r: any) => { started.push(r.id); if (r.id === "first") await ready; else release(); return { status: "completed", final: r.id } },
    evaluate: async (r: any) => r.id === "first" ? { failure: { category: "schema/wire", rootCause: "conflicting aliases", components: ["wire"] } } : {},
  }))
  expect(started.sort()).toEqual(["first", "in-flight"])
  expect(result.rows.find((r: any) => r.id === "remaining").status).toBe("not-run-after-defect")
  expect((await json(path.join(root, "runs/in-flight/attempt-1/report.json"))).report.final).toBe("in-flight")
  const failures = (await readFile(path.join(root, "failures.jsonl"), "utf8")).trim().split("\n").map(s => JSON.parse(s))
  expect(failures[0]).toMatchObject({ runId: "first", repairId: null, outcome: "unresolved", originalArtifact: "runs/first/attempt-1/report.json" })
})
test("repair attempts never overwrite the first answer and accumulate calls with unknown cost", async () => {
  expect(typeof api.developRows).toBe("function")
  const root = await temp(), first = [row("logical")]
  const run = (text: string, calls: number) => options({ concurrency: 1, execute: async () => ({ status: "completed", final: text, telemetry: { providerCalls: calls, totalActualUsd: null } }), evaluate: async () => ({}) })
  await api.developRows(root, first, run("original", 2))
  await api.developRows(root, first, { ...run("corrected", 3), repairId: "repair-wire", repairOf: "logical/attempt-1" })
  const replay = await api.replay(root)
  expect(replay.rows[0]).toMatchObject({ firstAttempt: "runs/logical/attempt-1/report.json", repairAttempts: ["runs/logical/attempt-2/report.json"], providerCalls: 5, totalActualUsd: null })
  expect((await json(path.join(root, "runs/logical/attempt-1/report.json"))).report.final).toBe("original")
  expect(replay.providerCallsDuringReplay).toBe(0)
  const next = await api.developRows(root, first, run("never", 9))
  expect(next.rows[0].status).toBe("already-retained")
})
test("a valid justified unknown is a boundary, not a mandatory repair", async () => {
  expect(typeof api.developRows).toBe("function")
  expect(api.mechanicalReview({ status: "completed", validation: { valid: true }, final: { questions: [{ behavior: { disposition: "unknown" }, missing: [{ kind: "deployment-unverified", detail: "live role assignment unavailable" }] }] } })).toEqual({})
  const root = await temp(), result = await api.developRows(root, [row("boundary"), row("next")], options({ concurrency: 1, execute: async () => ({ status: "completed", validation: { valid: true } }), evaluate: async (_r: any, report: any) => api.mechanicalReview(report) }))
  expect(result.rows.every((r: any) => r.status === "completed")).toBe(true)
})
test("a network transport failure is infrastructure rather than a model schema defect", () => {
  expect(api.mechanicalReview({ status: "transport-failed", error: "ProviderNetworkError: network error: Unable to connect" }).failure.category).toBe("infrastructure")
})
test("known native final checks rejected by their advertised schema remain model draft failures", () => {
  const rejected = { call: { name: "authorization_check_result" }, exitCode: 1, output: { phase: "authorization_check_result", status: "error", diagnostics: [{ code: "invalid_enum_value", path: "result.questions.0.policyAssessment.status", message: "Invalid enum value" }] } }
  const report = { status: "completed-with-diagnostics", ordinaryEntry: "skvm run", finalProse: "Raw answer, no checked result.", validation: { valid: false }, history: [rejected], domain: { closed: true } }
  expect(api.mechanicalReview(report).failure.components).toEqual(["model-draft"])
  for (const invalid of [{ ...report, history: [{ ...rejected, output: { status: "error", message: "Unexpected runtime crash" } }] }, { ...report, finalProse: "" }, { ...report, attempts: [{ status: "pending" }] }]) expect(api.mechanicalReview(invalid).failure.components).not.toEqual(["model-draft"])
})

test("a known closed native answer with a source-bound checked candidate retains model extraction failures", () => {
  const report = { status: "completed-with-diagnostics", ordinaryEntry: "skvm run", finalProse: "Source relations remain unresolved.", validation: { valid: false }, domain: { closed: true, check: { structureValid: true, sourceBound: true, ruleConsistency: false, diagnostics: [{ code: "semantic-callee-uninterpreted" }] }, semantic: { assemblies: [{ derived: { questions: [{ questionId: "q" }] }, diagnostics: [] }] } } }
  expect(api.mechanicalReview(report).failure.components).toEqual(["model-draft"])
  for (const invalid of [{ ...report, finalProse: "" }, { ...report, domain: { ...report.domain, closed: false } }, { ...report, attempts: [{ status: "pending" }] }, { ...report, error: "Unexpected execution failure" }, { ...report, domain: { ...report.domain, check: { ...report.domain.check, sourceBound: false } } }]) expect(api.mechanicalReview(invalid).failure.components).not.toEqual(["model-draft"])
})

test("a delivered source-bound inconsistent model draft remains a failed row without pausing unrelated shared machinery", async () => {
  const root = await temp(), started: string[] = []
  const failed = { status: "completed-with-diagnostics", final: { questions: [{ questionId: "draft", behavior: { disposition: "conditional" } }] }, validation: { valid: false, diagnostics: [{ code: "object-binding-missing" }] }, domain: { check: { structureValid: true, sourceBound: true, ruleConsistency: false } } }
  const review = api.mechanicalReview(failed)
  expect(review.failure).toMatchObject({ category: "semantic-extraction", components: ["model-draft"] })
  const result = await api.developRows(root, [row("draft"), { ...row("different"), task: "different-source" }], options({ concurrency: 1, execute: async (r: any) => { started.push(r.id); return r.id === "draft" ? failed : { status: "completed", validation: { valid: true } } }, evaluate: async (_r: any, report: any) => api.mechanicalReview(report) }))
  expect(started).toEqual(["draft", "different"])
  expect(result.rows[0].review.failure.category).toBe("semantic-extraction")
  expect((await json(path.join(root, "runs/draft/attempt-1/report.json"))).report.validation.valid).toBe(false)
  for (const report of [{ ...failed, final: undefined }, { ...failed, final: { questions: [] } }, { ...failed, error: "unexpected runtime error" }, { ...failed, domain: { check: { structureValid: true, sourceBound: false, ruleConsistency: false } } }, { ...failed, domain: { check: { structureValid: false, sourceBound: true, ruleConsistency: false } } }]) {
    expect(api.mechanicalReview(report).failure.components).toEqual(["checker", "delivery"])
  }
})
test("archived rejected semantic candidates are row failures even when no source-bound entry was accepted", () => {
  const diagnostic = { code: "semantic-duplicate", path: "semanticBlocks.q.entry.steps", message: "Semantic names must be unique in this local scope.", severity: "error" }
  const failed = { status: "completed-with-diagnostics", final: { questions: [{ questionId: "q" }] }, validation: { valid: false, diagnostics: [diagnostic] }, domain: { check: { structureValid: true, sourceBound: false, ruleConsistency: false, diagnostics: [diagnostic] }, semantic: { records: [{ accepted: false, diagnostics: [diagnostic] }], assemblies: [] } } }
  expect(api.mechanicalReview(failed).failure).toMatchObject({ category: "semantic-extraction", components: ["model-draft"] })
  const resultDiagnostic = { code: "semantic-path-missing", path: "q.invented-path", message: "Use a CURRENT feasible host path id", severity: "error" }
  const native = { ...failed, final: undefined, finalProse: "Partial source answer; check was rejected.", domain: { ...failed.domain, closed: true, check: { ...failed.domain.check, diagnostics: [diagnostic, resultDiagnostic] }, semantic: { ...failed.domain.semantic, assemblies: [{ derived: { questions: [{ questionId: "q" }] }, diagnostics: [resultDiagnostic] }] } } }
  expect(api.mechanicalReview(native).failure.components).toEqual(["model-draft"])
  for (const report of [
    { ...failed, domain: { ...failed.domain, semantic: { records: [], assemblies: [] } } },
    { ...failed, validation: { ...failed.validation, diagnostics: [{ ...diagnostic, message: "Unmatched runtime failure" }] } },
    { ...failed, error: "Unexpected execution failure" },
    { ...failed, final: undefined },
    { ...native, finalProse: "" },
    { ...failed, domain: { ...failed.domain, check: { ...failed.domain.check, structureValid: false } } },
  ]) expect(api.mechanicalReview(report).failure.components).toEqual(["checker", "delivery"])
})
test("a repair identity only reopens its own retained attempt and cannot bypass another shared defect", async () => {
  const root = await temp(), execute = async () => ({ status: "completed", telemetry: { providerCalls: 1 } })
  await api.developRows(root, [row("first"), row("other")], options({ execute, evaluate: async () => ({ failure: { category: "schema/wire", rootCause: "separate retained defect", components: ["wire"] } }) }))
  const started: string[] = []
  const result = await api.developRows(root, [row("first")], options({ repairId: "repair-first", repairOf: "first/attempt-1", execute: async (r: any) => { started.push(r.id); return execute() }, evaluate: async () => ({}) }))
  expect(started).toEqual([])
  expect(result.rows[0]).toMatchObject({ status: "not-run-after-defect", failureId: "other-attempt-1" })
})
test("a named repair reopens its verified known ancestry without rewriting retained failures", async () => {
  const root = await temp(), { rows, run } = await knownRepairChain(root)
  const files = ["failures.jsonl", "runs/chain/attempt-1/report.json", "runs/chain/attempt-2/report.json"]
  const before = await Promise.all(files.map(file => readFile(path.join(root, file), "utf8")))
  let dispatches = 0
  const result = await api.developRows(root, rows, { ...run, repairId: "second-repair", repairOf: "chain/attempt-2", execute: async () => { dispatches++; return { status: "completed", telemetry: { providerCalls: 1 } } }, evaluate: async () => ({}) })
  expect(dispatches).toBe(1)
  expect(result.rows[0]).toMatchObject({ status: "completed", attempt: 3 })
  expect(await Promise.all(files.map(file => readFile(path.join(root, file), "utf8")))).toEqual(before)
  expect((await api.replay(root)).rows[0]).toMatchObject({ providerCalls: 3, repairAttempts: ["runs/chain/attempt-2/report.json", "runs/chain/attempt-3/report.json"] })
})
test("verified repair ancestry cannot bypass another failure outside the named chain", async () => {
  const root = await temp(), { rows, run } = await knownRepairChain(root)
  const unrelated = { id: "other-attempt-1", runId: "other", outcome: "unresolved", originalArtifact: "runs/other/attempt-1/report.json", components: ["wire"] }
  await writeFile(path.join(root, "failures.jsonl"), JSON.stringify(unrelated) + "\n", { flag: "a" })
  let dispatches = 0
  const result = await api.developRows(root, rows, { ...run, repairId: "next", repairOf: "chain/attempt-2", execute: async () => { dispatches++; return { status: "completed" } } })
  expect(dispatches).toBe(0)
  expect(result.rows[0]).toMatchObject({ status: "not-run-after-defect", failureId: "other-attempt-1" })
})
for (const [label, reference] of [["orphan", "chain/attempt-99"], ["cross-row", "other/attempt-1"], ["escaping", "../chain/attempt-1"], ["self-cycle", "chain/attempt-2"]] as const) test(`a ${label} retained repair ancestor is refused before dispatch`, async () => {
  const root = await temp(), { rows, run } = await knownRepairChain(root), directory = path.join(root, "runs/chain/attempt-2")
  const retained = await json(path.join(directory, "report.json"))
  retained.identity.repairOf = reference
  await writeFile(path.join(directory, "claim.json"), JSON.stringify(retained.identity))
  await writeFile(path.join(directory, "report.json"), JSON.stringify(retained))
  let dispatches = 0
  await expect(api.developRows(root, rows, { ...run, repairId: "next", repairOf: "chain/attempt-2", execute: async () => { dispatches++; return { status: "completed" } } })).rejects.toThrow(/original attempt|repair ancestry/)
  expect(dispatches).toBe(0)
})
test("a changed ancestor claim and an unknown ancestor remain sealed under a known child", async () => {
  for (const shape of ["identity-mismatch", "unknown-status", "pending-attempt"] as const) {
    const root = await temp(), { rows, run } = await knownRepairChain(root), directory = path.join(root, "runs/chain/attempt-1")
    const retained = await json(path.join(directory, "report.json"))
    if (shape === "identity-mismatch") await writeFile(path.join(directory, "claim.json"), JSON.stringify({ ...retained.identity, model: "different" }))
    else {
      retained.report = shape === "unknown-status" ? { status: "completion-unknown", providerDispatches: 1 } : { status: "completed", attempts: [{ status: "pending" }], telemetry: { providerCalls: 1 } }
      await writeFile(path.join(directory, "report.json"), JSON.stringify(retained))
    }
    let dispatches = 0
    await expect(api.developRows(root, rows, { ...run, repairId: "next", repairOf: "chain/attempt-2", execute: async () => { dispatches++; return { status: "completed" } } })).rejects.toThrow(/original attempt identity|unknown completion/)
    expect(dispatches).toBe(0)
  }
})
test("an ancestor failure ID cannot exempt a different artifact or row", async () => {
  const root = await temp(), { rows, run } = await knownRepairChain(root)
  const failures = (await readFile(path.join(root, "failures.jsonl"), "utf8")).trim().split("\n").map(s => JSON.parse(s))
  failures[0].originalArtifact = "runs/other/attempt-1/report.json"
  failures[0].runId = "other"
  await writeFile(path.join(root, "failures.jsonl"), failures.map(f => JSON.stringify(f)).join("\n") + "\n")
  let dispatches = 0
  await expect(api.developRows(root, rows, { ...run, repairId: "next", repairOf: "chain/attempt-2", execute: async () => { dispatches++; return { status: "completed" } } })).rejects.toThrow(/ancestor failure identity/)
  expect(dispatches).toBe(0)
})
test("repair references must name an existing same-row completed claim before dispatch", async () => {
  const root = await temp(), started: string[] = []
  const run = options({ concurrency: 1, execute: async (r: any) => { started.push(r.id); return { status: "completed" } }, evaluate: async () => ({}) })
  await api.developRows(root, [row("first")], run)
  for (const [id, repairOf] of [["other", "first/attempt-1"], ["first", "first/attempt-99"], ["first", "../first/attempt-1"]] as const) {
    await expect(api.developRows(root, [row(id)], { ...run, repairId: "repair-test", repairOf })).rejects.toThrow(/original attempt/)
  }
  await expect(api.developRows(root, [{ ...row("first"), task: "renamed-original" }], { ...run, repairId: "repair-test", repairOf: "first/attempt-1" })).rejects.toThrow(/original attempt identity/)
  expect(started).toEqual(["first"])
})
test("a response of unknown completion is retained without another paid repair dispatch", async () => {
  const root = await temp(), run = options({ execute: async () => ({ status: "completion-unknown", providerDispatches: 1 }), evaluate: async () => ({}) })
  await api.developRows(root, [row("unknown")], run)
  await expect(api.developRows(root, [row("unknown")], { ...run, repairId: "repair-test", repairOf: "unknown/attempt-1" })).rejects.toThrow(/unknown completion/)
})
test("a dispatched SDK timeout cannot bypass repair sealing under an old transport-failed status", async () => {
  const root = await temp(), run = options({ execute: async () => ({ status: "transport-failed", providerDispatches: 1, attempts: [{ status: "error", error: { name: "ProviderNetworkError", message: "The operation timed out." } }] }), evaluate: async () => ({}) })
  await api.developRows(root, [row("sdk-unknown")], run)
  await expect(api.developRows(root, [row("sdk-unknown")], { ...run, repairId: "must-not-resend", repairOf: "sdk-unknown/attempt-1" })).rejects.toThrow(/unknown completion/)
})
test("pre-dispatch provider failure is retained with zero calls without reading a nonexistent run", async () => {
  const report = { status: "provider-unavailable", providerDispatches: 0, sessionPath: "nonexistent-pre-dispatch-session" }
  expect(await api.retainLocalRun(report)).toEqual(report)
})
test("a misclassified outer failure can recover only from an inspected zero-dispatch session", async () => {
  const root = await temp(), source = path.join(root, "source")
  await mkdir(source); await writeFile(path.join(source, "entry.ts"), "export function inspect() { return true }\n")
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "test", repository: "test", sourceRef: "test", sourceRoot: "source", allowedPaths: ["entry.ts"], brief: "Inspect the entry behavior." }))
  await api.developRows(root, [row("pre-dispatch")], options({ execute: async (_r: any, outDir: string) => { await executeLocalInquiryRun({ inputFile, outDir, model: "mock", providerFactory: () => { throw new Error("route unavailable before dispatch") } }); return { status: "completion-unknown", providerDispatches: null } }, evaluate: async () => ({}) }))
  const repaired = await api.developRows(root, [row("pre-dispatch")], options({ repairId: "archive-fix", repairOf: "pre-dispatch/attempt-1", execute: async () => ({ status: "completed", providerDispatches: 2 }), evaluate: async () => ({}) }))
  expect(repaired.rows[0].status).toBe("completed")
  expect((await api.replay(root)).rows[0]).toMatchObject({ providerCalls: 2, classificationCorrections: [{ artifact: "runs/pre-dispatch/attempt-1/report.json", verifiedStatus: "provider-unavailable", providerCalls: 0 }] })
  expect((await json(path.join(root, "runs/pre-dispatch/attempt-1/report.json"))).report.status).toBe("completion-unknown")
})

test("a verified scoped adjudication releases only its distinct mechanism row and seals the failed task", async () => {
  const root = await temp(), started: string[] = []
  await api.developRows(root, [row("unknown")], options({ execute: async () => ({ status: "timeout-unknown", providerDispatches: 1 }), evaluate: async () => ({ failure: { category: "infrastructure", rootCause: "Unknown final request", components: ["wire"] } }) }))
  const artifact = "runs/unknown/attempt-1/report.json", proof = "offline.json"
  await writeFile(path.join(root, proof), JSON.stringify({ providerCalls: 0, fixed: "pure envelope" }))
  const hash = async (file: string) => createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")
  const release = { failureId: "unknown-attempt-1", originalArtifactSha256: await hash(artifact), releasedComponents: ["wire"], eligibleRows: ["probe", "renamed"], retainTaskPause: true, rationale: "Shared envelope repair verified offline; source task and main panel stay unresolved", verificationArtifacts: [{ path: proof, sha256: await hash(proof) }] }
  await writeFile(path.join(root, "scope-adjudications.jsonl"), JSON.stringify(release) + "\n")
  const rows = [{ ...row("probe"), task: "different-source", kind: "source-window-mechanism" }, { ...row("panel"), task: "different-source", kind: "quality" }, { ...row("renamed"), kind: "source-window-mechanism" }]
  const run = options({ concurrency: 1, execute: async (r: any) => { started.push(r.id); return { status: "completed" } }, evaluate: async () => ({}) })
  const result = await api.developRows(root, rows, run)
  expect(started).toEqual(["probe"])
  expect(result.rows.find((r: any) => r.id === "renamed")).toMatchObject({ status: "not-run-after-defect", failureId: "unknown-attempt-1" })
  expect(result.rows.find((r: any) => r.id === "panel").status).toBe("not-run-after-defect")
  expect((await json(path.join(root, artifact))).report.status).toBe("timeout-unknown")
  await writeFile(path.join(root, proof), "changed verification")
  await expect(api.developRows(root, rows, run)).rejects.toThrow(/adjudication evidence/)
  expect(started).toEqual(["probe"])
})

test("replay rejects a claim attempt number that differs from its directory before review binding", async () => {
  const root = await temp(), identity = { row: row("mismatched"), attempt: 2 }, dir = path.join(root, "runs/mismatched/attempt-1")
  await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, "claim.json"), JSON.stringify(identity)); await writeFile(path.join(dir, "report.json"), JSON.stringify({ identity, report: { providerDispatches: 1 } }))
  await expect(api.replay(root)).rejects.toThrow(/attempt identity/)
})

test("an explicit hash-bound row release permits a quality row while unlisted rows and the unknown task stay paused", async () => {
  const root = await temp(), started: string[] = []
  await api.developRows(root, [row("unknown")], options({ execute: async () => ({ status: "timeout-unknown", providerDispatches: 1 }), evaluate: async () => ({ failure: { category: "infrastructure", rootCause: "Unknown request remains sealed", components: ["wire"] } }) }))
  const artifact = "runs/unknown/attempt-1/report.json", proof = "shared-repair.json"
  await writeFile(path.join(root, proof), JSON.stringify({ providerCalls: 0, sharedEngineeringVerified: true, taskCompleted: false }))
  const hash = async (file: string) => createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")
  await writeFile(path.join(root, "scope-adjudications.jsonl"), JSON.stringify({ failureId: "unknown-attempt-1", originalArtifactSha256: await hash(artifact), releasedComponents: ["wire"], eligibleRows: ["quality-explicit", "quality-original-task"], retainTaskPause: true, rationale: "Only the named different-task quality row uses repaired shared machinery; original task stays sealed", verificationArtifacts: [{ path: proof, sha256: await hash(proof) }] }) + "\n")
  const rows = [{ ...row("quality-explicit"), task: "different-source", kind: "quality" }, { ...row("quality-unlisted"), task: "different-source", kind: "quality" }, { ...row("quality-original-task"), kind: "quality" }]
  const result = await api.developRows(root, rows, options({ concurrency: 1, execute: async (r: any) => { started.push(r.id); return { status: "completed" } }, evaluate: async () => ({}) }))
  expect(started).toEqual(["quality-explicit"])
  expect(result.rows.find((r: any) => r.id === "quality-unlisted")).toMatchObject({ status: "not-run-after-defect", failureId: "unknown-attempt-1" })
  expect(result.rows.find((r: any) => r.id === "quality-original-task")).toMatchObject({ status: "not-run-after-defect", failureId: "unknown-attempt-1" })
  expect((await json(path.join(root, artifact))).report.status).toBe("timeout-unknown")
})
test("a missing first report is never relabeled as the next repair report", async () => {
  const root = await temp(), identity = (attempt: number) => ({ row: row("missing"), attempt })
  for (const number of [1, 2]) { const dir = path.join(root, `runs/missing/attempt-${number}`); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, "claim.json"), JSON.stringify(identity(number))); if (number === 2) await writeFile(path.join(dir, "report.json"), JSON.stringify({ identity: identity(number), report: { providerDispatches: 3, totalActualUsd: null } })) }
  expect((await api.replay(root)).rows[0]).toMatchObject({ firstAttempt: null, repairAttempts: ["runs/missing/attempt-2/report.json"], providerCalls: null, knownProviderCalls: 3, totalActualUsd: null })
})
test("invalid numeric accounting remains unknown rather than creating negative known savings", async () => {
  const root = await temp(), identity = { row: row("invalid-cost"), attempt: 1 }, dir = path.join(root, "runs/invalid-cost/attempt-1")
  await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, "claim.json"), JSON.stringify(identity))
  for (const value of [-1, Infinity]) {
    const content = JSON.stringify({ identity, report: { providerDispatches: value, totalActualUsd: value } }).replaceAll('"providerDispatches":null', '"providerDispatches":1e400').replaceAll('"totalActualUsd":null', '"totalActualUsd":1e400')
    await writeFile(path.join(dir, "report.json"), content)
    expect((await api.replay(root)).rows[0]).toMatchObject({ providerCalls: null, knownProviderCalls: 0, knownUsdSubtotal: 0, totalActualUsd: null })
  }
})
test("native pre-dispatch inspection reopens only hash-bound zero-call originals and preserves their unknown report", async () => {
  for (const actualCalls of [null, 1]) {
    const root = await temp(), original = [row("native-zero")], run = options({ execute: async () => ({ status: "completion-unknown", providerDispatches: actualCalls }), evaluate: async () => ({}) })
    await api.developRows(root, original, run)
    const directory = path.join(root, "runs/native-zero/attempt-1"), hash = async (name: string) => createHash("sha256").update(await readFile(path.join(directory, name))).digest("hex")
    await writeFile(path.join(directory, "proof.json"), JSON.stringify({ phase: "input-validation", inspected: true }))
    const inspection = { status: "input-invalid-before-dispatch", providerDispatches: 0, claimSha256: await hash("claim.json"), reportSha256: await hash("report.json"), evidence: [{ path: "proof.json", sha256: await hash("proof.json") }] }, inspectZeroDispatch = async () => inspection
    let dispatches = 0
    const repair = { ...run, repairId: "relative-root", repairOf: "native-zero/attempt-1", inspectZeroDispatch, execute: async () => { dispatches++; return { status: "completed", providerDispatches: 2 } } }
    if (actualCalls === 1) { await expect(api.developRows(root, original, repair)).rejects.toThrow(/unknown completion/); expect(dispatches).toBe(0) }
    else {
      const before = await readFile(path.join(directory, "report.json"), "utf8")
      expect((await api.replay(root, { inspectZeroDispatch })).rows[0]).toMatchObject({ providerCalls: 0, totalActualUsd: 0 })
      expect((await api.developRows(root, original, repair)).rows[0].status).toBe("completed")
      expect((await api.replay(root, { inspectZeroDispatch })).rows[0]).toMatchObject({ providerCalls: 2, classificationCorrections: [{ artifact: "runs/native-zero/attempt-1/report.json", verifiedStatus: "input-invalid-before-dispatch", providerCalls: 0 }] })
      expect(await readFile(path.join(directory, "report.json"), "utf8")).toBe(before)
      await writeFile(path.join(directory, "proof.json"), "tampered")
      await expect(api.developRows(root, original, repair)).rejects.toThrow(/inspection evidence/)
    }
  }
})
