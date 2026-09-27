import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const configBytes = await readFile(path.join(root, "panel-config.json"), "utf8")
const config = JSON.parse(configBytes)
const hash = createHash("sha256").update(configBytes).digest("hex")
type Row = { id: string; phase: string; arm: string; caseId: string; wire: string; assessmentMode: string; status: string; providerCalls: number | null; respondedCalls: number | null; unknownUsageCalls: number | null; actualUsdStatus: string; totalActualUsd: number | null; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number } | null; finalKind: string | null }
const rows: Row[] = []
for (const unit of config.units) {
  const dir = path.join(root, "runs", unit.id)
  const claim = JSON.parse(await readFile(path.join(dir, "claim.json"), "utf8"))
  const record = JSON.parse(await readFile(path.join(dir, "unit.json"), "utf8"))
  if (claim.configSha256 !== hash || record.configSha256 !== hash || claim.unit.id !== unit.id || record.unit.id !== unit.id) throw Error(`Unit identity drift: ${unit.id}`)
  const report = record.report
  const telemetry = report.telemetry ?? {}
  rows.push({ id: unit.id, phase: unit.phase, arm: unit.arm, caseId: unit.caseId, wire: unit.wire, assessmentMode: unit.assessmentMode, status: report.status,
    providerCalls: telemetry.providerCalls ?? null, respondedCalls: telemetry.respondedCalls ?? null, unknownUsageCalls: telemetry.unknownUsageCalls ?? null,
    actualUsdStatus: telemetry.actualUsdStatus ?? "unknown", totalActualUsd: telemetry.totalActualUsd ?? null,
    tokens: telemetry.knownTokens ?? null, finalKind: report.finalKind ?? null })
}
const count = (items: typeof rows) => Object.fromEntries([...new Set(items.map(row => row.status))].sort().map(status => [status, items.filter(row => row.status === status).length]))
const sum = (items: typeof rows, field: "providerCalls" | "respondedCalls" | "unknownUsageCalls") => items.reduce((total, row) => total + (row[field] ?? 0), 0)
const tokens = rows.reduce((total, row) => ({ input: total.input + (row.tokens?.input ?? 0), output: total.output + (row.tokens?.output ?? 0), cacheRead: total.cacheRead + (row.tokens?.cacheRead ?? 0), cacheWrite: total.cacheWrite + (row.tokens?.cacheWrite ?? 0) }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const byPhase = Object.fromEntries(["initial", "repeat", "outcome-only"].map(phase => { const items = rows.filter(row => row.phase === phase); return [phase, { planned: items.length, statuses: count(items), providerCalls: sum(items, "providerCalls") }] }))
const byArm = Object.fromEntries(["M0", "D0", "M1", "D1"].map(arm => { const items = rows.filter(row => row.arm === arm); return [arm, { planned: items.length, statuses: count(items), providerCalls: sum(items, "providerCalls") }] }))
const account = { schemaVersion: "authorization-ai-generation-account/v1", configSha256: hash, planned: rows.length, statuses: count(rows), byPhase, byArm,
  providerCalls: sum(rows, "providerCalls"), respondedCalls: sum(rows, "respondedCalls"), unknownUsageCalls: sum(rows, "unknownUsageCalls"), knownTokens: tokens,
  actualUsd: rows.every(row => row.actualUsdStatus === "complete") ? rows.reduce((total, row) => total + (row.totalActualUsd ?? 0), 0) : null,
  actualUsdStatus: rows.every(row => row.actualUsdStatus === "complete") ? "complete" : "unknown",
  targetExecutions: 0, automaticResends: 0, rows }
await writeFile(path.join(root, "generation-account.json"), `${JSON.stringify(account, null, 2)}\n`, { flag: "wx" })
console.log(JSON.stringify({ planned: account.planned, statuses: account.statuses, providerCalls: account.providerCalls, respondedCalls: account.respondedCalls, unknownUsageCalls: account.unknownUsageCalls, knownTokens: account.knownTokens, actualUsdStatus: account.actualUsdStatus, byPhase }))
