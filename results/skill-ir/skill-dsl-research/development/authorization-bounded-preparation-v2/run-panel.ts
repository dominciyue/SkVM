import { readFile } from "node:fs/promises"
import path from "node:path"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog, renderSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "../../../../../src/task-dsl/authorization/semantics.ts"
import { root, repo, json, save, hash, bind, verify, absolute, exists, journal, updateState } from "./common.ts"

const mode = process.argv[2]
if (!["freeze", "check", "run", "status", "replay"].includes(mode ?? "")) throw new Error("Usage: bun run-panel.ts freeze|check|run|status|replay [--count=1..40]")
const planBytes = await readFile(path.join(root, "study-plan.json")), plan = JSON.parse(planBytes.toString("utf8"))
// No evaluator/oracle is opened by any generation path.
await verify([...plan.implementation, plan.publicBriefs, ...plan.cases.flatMap((c: any) => [c.input, c.markdown, ...c.sourceFiles])])
if (mode === "freeze") {
  const prepared = await json(path.join(root, "preparation-summary.json")), cases = []
  if (prepared.rows.some((r: any) => ["not-dispatched", "completion-unknown"].includes(r.status))) throw new Error("Preparation jobs are not closed; never resend an unknown job")
  for (const item of plan.cases) {
    const material: Record<string, unknown> = {}
    for (const route of ["explicit-v1", "automatic-v2"]) {
      const inputFile = path.join(root, "inputs", item.id, route, "assessment.json")
      if (!await exists(inputFile)) { material[route] = { blocked: true, reason: "preparation-failed" }; continue }
      const loaded = await loadLocalAuthorizationInput(inputFile)
      if (loaded.status !== "valid") throw new Error(`Invalid material ${item.id}/${route}`)
      const sources = []
      for (const file of loaded.normalizedInput.sources) sources.push(await bind(path.resolve(path.dirname(inputFile), loaded.normalizedInput.sourceRoot, file)))
      material[route] = { input: await bind(inputFile), report: await bind(path.join(path.dirname(inputFile), "report.json")), sources, taskId: loaded.task.taskId, publicInstructionSha256: hash(loaded.analysisContract?.publicInstruction ?? "") }
    }
    cases.push({ id: item.id, markdown: item.markdown, material })
  }
  await save(path.join(root, "panel-config.json"), { schemaVersion: "authorization-ak-panel/v1", registeredBeforeAnalysis: true, studyPlanSha256: hash(planBytes), model: plan.model, executionOptions: plan.executionOptions, cases, units: plan.units }, true)
  process.stdout.write(`${JSON.stringify({ status: "frozen", units: 40, preparationJobs: 8 })}\n`)
} else {
  const configBytes = await readFile(path.join(root, "panel-config.json")), config = JSON.parse(configBytes.toString("utf8")), configSha256 = hash(configBytes)
  if (config.studyPlanSha256 !== hash(planBytes) || config.units.length !== 40 || new Set(config.units.map((u: any) => u.id)).size !== 40) throw new Error("Panel registration identity/denominator changed")
  const files = config.cases.flatMap((c: any) => Object.values(c.material).flatMap((m: any) => m.blocked ? [] : [m.input, m.report, ...m.sources]))
  await verify(files)
  process.env.SKVM_AUTO_PROBE = "0"; process.env.SKVM_CACHE = path.join(repo, ".skvm")
  const locate = (unit: any) => { const item = config.cases.find((c: any) => c.id === unit.caseId); return { item, material: item.material[unit.material] } }
  async function runUnit(unit: any, mock = false) {
    const { item, material } = locate(unit), outRoot = path.join(root, mock ? "mock-runs" : "runs", unit.id), claim = path.join(outRoot, "claim.json")
    if (await exists(claim)) return { id: unit.id, status: "preserved-no-resend" }
    await save(claim, { unit, configSha256, createdAt: new Date().toISOString(), noAutomaticResend: true }, true)
    if (material.blocked) { const report = { status: "preparation-blocked", providerCalls: 0, reason: material.reason }; await save(path.join(outRoot, "unit.json"), { unit, configSha256, report }, true); return { id: unit.id, status: report.status } }
    let providerFactory
    if (mock) {
      const loaded = await loadLocalAuthorizationInput(absolute(material.input)); if (loaded.status !== "valid") throw new Error("Mock input invalid")
      const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle); if (!catalog.success) throw new Error("Mock catalog invalid")
      const source = catalog.catalog.sources[0]!
      providerFactory = () => ({ name: "AK-offline-mock", complete: async () => ({ text: "", toolCalls: [{ id: "mock", name: "submit_authorization_result", arguments: { results: compileAuthorizationTask(loaded.task).runnableObligations.map(o => ({ obligationId: o.id, decision: o.obligation.expectation === "conditional" ? { kind: "conditional-policy", policyStatus: "undetermined" } : { kind: "observed", observed: "unknown" }, explanation: "Offline lifecycle only.", facts: ["entry", "binding", "control", "effect", "condition"].map((kind, i) => ({ id: `f${i}`, kind, statement: "Mock source reference only.", citations: [{ sourceId: source.sourceId, startLine: source.lines[0]!.lineNumber, endLine: source.lines[0]!.lineNumber }] })), decisiveMissingFacts: ["Real model analysis."], suggestedObservations: ["No target execution."], branchResults: [] })) } }], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" as const }), completeWithToolResults: async () => { throw new Error("No executable continuation") } })
    }
    process.stdout.write(`${JSON.stringify({ id: unit.id, action: "start", mock })}\n`)
    const common = { inputFile: absolute(material.input), model: config.model, outRoot, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, reasoningStrategy: "standard" as const, executionOptions: config.executionOptions, ...(providerFactory ? { providerFactory } : {}) }
    const report = unit.arm.startsWith("M") ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(absolute(item.markdown), "utf8"), instructionOrigin: "independent-author", instructionPath: item.markdown.path } }) : await executeLocalAuthorizationRun({ ...common, method: "plain" })
    await save(path.join(outRoot, "unit.json"), { unit, configSha256, report }, true)
    const telemetry = "telemetry" in report ? report.telemetry : undefined
    await journal(mock ? "AK10-mock" : "AK10", { id: unit.id, status: report.status, providerCalls: telemetry?.providerCalls })
    return { id: unit.id, status: report.status, providerCalls: telemetry?.providerCalls, sessionId: "sessionId" in report ? report.sessionId : undefined }
  }
  if (mode === "check") {
    const checked = []
    for (const item of config.cases) for (const [route, material] of Object.entries(item.material) as Array<[string, any]>) {
      if (material.blocked) { checked.push({ id: item.id, route, status: "preparation-blocked" }); continue }
      const report = await checkLocalAuthorizationInput(absolute(material.input), "B", "plain", "v6", "standard", "explicit-v1")
      const loaded = await loadLocalAuthorizationInput(absolute(material.input))
      if (report.status !== "valid" || loaded.status !== "valid") throw new Error(`Check failed ${item.id}/${route}`)
      checked.push({ id: item.id, route, status: report.status, scope: report.scopePreview, sourceCharacters: renderSourceBundle(loaded.sourceBundle).length, previewCharacters: report.preview?.length, sharedSourceSha256: hash(JSON.stringify(loaded.sourceBundle)) })
    }
    const mock = []
    for (const unit of config.units.filter((u: any) => u.phase === "initial" && (u.caseId === "owui-file" || u.arm === "D1" && ["memos-get-shared", "memos-member-leave"].includes(u.caseId)))) mock.push(await runUnit(unit, true))
    if (mock.some(r => !["completed", "preparation-blocked", "preserved-no-resend"].includes(r.status))) throw new Error("Offline lifecycle failed")
    await save(path.join(root, "pre-run-check.json"), { configSha256, checked, mock, realProviderCalls: 0, targetExecutions: 0 })
    process.stdout.write(`${JSON.stringify({ status: "valid", checked: checked.length, mock: mock.length, realProviderCalls: 0 })}\n`)
  } else if (mode === "run") {
    const count = Number(process.argv.find(a => a.startsWith("--count="))?.slice(8) ?? 1)
    if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error("--count must be 1..40")
    let dispatched = 0, failures = 0
    for (const unit of config.units) {
      if (dispatched >= count) break
      if (await exists(path.join(root, "runs", unit.id, "claim.json"))) continue
      try {
        const row = await runUnit(unit); dispatched++; process.stdout.write(`${JSON.stringify(row)}\n`)
        failures = ["transport-failed", "timeout-unknown"].includes(row.status) ? failures + 1 : 0
      } catch (error) { await save(path.join(root, "runs", unit.id, "unit-error.json"), { message: String(error), preserveNoResend: true }, true); process.stderr.write(`Stopped after unexpected unit error: ${String(error)}\n`); break }
      if (failures >= 2) { process.stderr.write("Stopped after two consecutive infrastructure failures.\n"); break }
    }
  } else {
    const rows = []
    for (const unit of config.units) {
      const outRoot = path.join(root, "runs", unit.id), record = path.join(outRoot, "unit.json")
      if (!await exists(record)) { rows.push({ ...unit, status: await exists(path.join(outRoot, "claim.json")) ? "completion-unknown" : "not-dispatched" }); continue }
      const stored = await json(record)
      if (stored.configSha256 !== configSha256 || stored.unit.id !== unit.id) throw new Error("Stored run identity drift")
      const inspected = mode === "replay" && stored.report.status !== "preparation-blocked" ? await inspectLocalAuthorizationOutput(outRoot) : null
      if (inspected && inspected.status !== stored.report.status) throw new Error(`Inspect differs ${unit.id}`)
      rows.push({ ...unit, status: stored.report.status, ...(inspected ? { inspectedStatus: inspected.status } : {}) })
    }
    const result = { schemaVersion: "authorization-ak-panel-replay/v1", configSha256, planned: 40, terminal: rows.filter(r => !["completion-unknown", "not-dispatched"].includes(r.status)).length, rows, providerCallsThisCommand: 0, targetExecutions: 0 }
    if (mode === "replay") await save(path.join(root, "replay.json"), result)
    await updateState("AK10", { undispatched: { preparationJobs: 0, qualitySessions: rows.filter(r => r.status === "not-dispatched").length, authorDeliveries: 8, consumerSessions: 8 }, dispatchedUnknownRequests: rows.filter(r => ["completion-unknown", "timeout-unknown"].includes(r.status)).map(r => r.id), nextCommand: "continue only unclaimed units; after closure create anonymous review packets" })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }
}
