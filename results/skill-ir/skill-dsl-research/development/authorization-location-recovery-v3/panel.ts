import { readFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { checkLocalAuthorizationInput, executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { root, json, save, bind, hash, verify, verifyStudy, absolute, exists, configureProvider, claim, journal, sessionAccount, aggregateUsage } from "./common.ts"
const mode = process.argv[2]
if (!["freeze", "check", "run", "replay"].includes(mode ?? "")) throw new Error("Usage: panel.ts freeze|check|run|replay [--count=1..20]")
const plan = await verifyStudy()
if (mode === "freeze") {
  const prep = await json(path.join(root, "preparation-summary.json"))
  if (prep.closed !== 8) throw new Error("Preparation denominator must close first")
  const cases = []
  for (const c of plan.cases.filter((c: any) => plan.units.some((u: any) => u.caseId === c.id))) {
    const file = path.join(root, "inputs", c.id, "automatic-v3", "assessment.json"), material: any = { "old-auto": c.oldMaterial }
    if (!await exists(file)) material["new-auto"] = { blocked: true, reason: "new-preparation-failed" }
    else {
      const loaded = await loadLocalAuthorizationInput(file); if (loaded.status !== "valid") throw new Error("Invalid frozen input " + c.id)
      const sources = []; for (const f of loaded.normalizedInput.sources) sources.push(await bind(path.resolve(path.dirname(file), loaded.normalizedInput.sourceRoot, f)))
      material["new-auto"] = { input: await bind(file), report: await bind(path.join(path.dirname(file), "report.json")), sources }
    }
    cases.push({ id: c.id, markdown: c.markdown, material })
  }
  await save(path.join(root, "panel-config.json"), { schemaVersion: "authorization-al-panel/v1", planSha256: hash(await readFile(path.join(root, "study-plan.json"))), model: plan.model, executionOptions: plan.executionOptions, cases, units: plan.units }, true)
  console.log(JSON.stringify({ status: "frozen", qualityRows: 20, providerCalls: 0 }))
} else {
  const config = await json(path.join(root, "panel-config.json")), configSha256 = hash(await readFile(path.join(root, "panel-config.json")))
  if (config.units.length !== 20 || config.planSha256 !== hash(await readFile(path.join(root, "study-plan.json")))) throw new Error("Panel identity changed")
  await verify(config.cases.flatMap((c: any) => Object.values(c.material).flatMap((m: any) => m.blocked ? [] : [m.input, m.report, ...m.sources])))
  if (mode === "check") {
    const rows = []
    for (const c of config.cases) for (const [material, m] of Object.entries(c.material) as [string, any][]) {
      if (m.blocked || !config.units.some((u: any) => u.caseId === c.id && u.material === material)) continue
      const report = await checkLocalAuthorizationInput(absolute(m.input), "B", "plain", "v6", "standard", "explicit-v1")
      if (report.status !== "valid") throw new Error("Check failed " + c.id + "/" + material)
      rows.push({ caseId: c.id, material, scope: report.scopePreview, promptCharacters: report.promptCharacters })
    }
    await save(path.join(root, "panel-check.json"), { rows, realProviderCalls: 0 })
    console.log(JSON.stringify({ checked: rows.length, providerCalls: 0 }))
  } else if (mode === "run") {
    const count = Number(process.argv.find(a => a.startsWith("--count="))?.slice(8) ?? 20)
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Invalid count")
    let done = 0, failures = 0
    for (const unit of config.units) {
      const outRoot = path.join(root, "runs", unit.id)
      if (await exists(path.join(outRoot, "claim.json"))) continue
      const c = config.cases.find((c: any) => c.id === unit.caseId), m = c.material[unit.material]
      if (!m.blocked) configureProvider(config.model)
      if (!await claim(outRoot, { unit, configSha256 })) continue
      let report: any
      console.log(JSON.stringify({ id: unit.id, action: "analysis-start" }))
      if (m.blocked) report = { status: "preparation-blocked", providerCalls: 0, reason: m.reason }
      else {
        const common = { inputFile: absolute(m.input), model: config.model, outRoot, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, reasoningStrategy: "standard" as const, executionOptions: config.executionOptions }
        report = unit.arm === "markdown" ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(absolute(c.markdown), "utf8"), instructionOrigin: "independent-author", instructionPath: c.markdown.path } }) : await executeLocalAuthorizationRun({ ...common, method: "plain" })
      }
      await save(path.join(outRoot, "unit.json"), { unit, configSha256, report }, true)
      await journal("AL10", { id: unit.id, status: report.status, calls: report.telemetry?.providerCalls ?? 0 })
      console.log(JSON.stringify({ id: unit.id, status: report.status, calls: report.telemetry?.providerCalls ?? 0 }))
      failures = ["transport-failed", "timeout-unknown", "provider-unavailable"].includes(report.status) ? failures + 1 : 0
      if (++done >= count || failures >= 2) break
    }
  } else {
    const rows = []
    for (const unit of config.units) {
      const dir = path.join(root, "runs", unit.id), file = path.join(dir, "unit.json")
      if (!await exists(file)) { rows.push({ ...unit, status: await exists(path.join(dir, "claim.json")) ? "completion-unknown" : "not-dispatched" }); continue }
      const stored = await json(file); if (stored.configSha256 !== configSha256 || stored.unit.id !== unit.id) throw new Error("Stored identity changed")
      if (stored.report.sessionId) { const inspected = await inspectLocalAuthorizationOutput(dir); if (inspected.status !== stored.report.status) throw new Error("Inspect differs") }
      rows.push({ ...unit, status: stored.report.status, sessionId: stored.report.sessionId ?? null, account: await sessionAccount(dir, stored.report) })
    }
    const replay = { schemaVersion: "authorization-al-panel-replay/v1", configSha256, planned: 20, closed: rows.filter(r => !["completion-unknown", "not-dispatched"].includes(r.status)).length, rows, usage: aggregateUsage(rows.flatMap(r => r.account ? [r.account] : [])), commandProviderCalls: 0 }
    await save(path.join(root, "panel-replay.json"), replay); console.log(JSON.stringify(replay))
  }
}
