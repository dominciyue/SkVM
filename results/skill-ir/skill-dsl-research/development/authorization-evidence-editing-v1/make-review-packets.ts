import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const configBytes = await readFile(path.join(root, "panel-config.json"))
const config = JSON.parse(configBytes.toString("utf8")) as { units: Array<{ id: string; caseId: string; arm: string; phase: string; input: string }> }
const configSha256 = hash(configBytes)
const replay = await readJson(path.join(root, "replay.json"))
if (replay.configSha256 !== configSha256 || replay.planned !== 40 || replay.terminal !== 40 || replay.rows.some((row: any) => row.status !== "completed" || row.inspectedStatus !== "completed"))
  throw new Error("Generation is not closed and offline-replayed")
const briefs = await readJson(path.join(root, "public-briefs.json")) as { commonInstruction: string; cases: Array<{ id: string }> }
const packets = path.join(root, "evaluator", "packets")
await mkdir(packets, { recursive: true })
const map: Record<string, unknown> = {}
const accountRows: Array<Record<string, unknown>> = []
for (const unit of config.units) {
  const stored = await readJson(path.join(root, "runs", unit.id, "unit.json"))
  if (stored.configSha256 !== configSha256 || stored.unit.id !== unit.id || stored.report.status !== "completed") throw new Error(`Unit identity/status changed: ${unit.id}`)
  const report = stored.report
  const session = path.join(root, "runs", unit.id, "sessions", report.sessionId)
  const [run, sourceBundle] = await Promise.all([readJson(path.join(session, "run.json")), readJson(path.join(session, "source-bundle.json"))])
  if (run.status !== "completed" || !report.canonicalResult?.results?.length || !report.wireResult?.results?.length) throw new Error(`Missing completed answer: ${unit.id}`)
  const brief = briefs.cases.find(item => item.id === unit.caseId)
  if (!brief) throw new Error(`Missing public brief ${unit.caseId}`)
  const anonymousId = `r-${hash(`${configSha256}:${unit.id}`).slice(0, 12)}`
  if (map[anonymousId]) throw new Error(`Duplicate anonymous id ${anonymousId}`)
  const packet = { schemaVersion: "authorization-aj-review-packet/v1", anonymousId, caseId: unit.caseId,
    evidenceLayer: unit.input, publicInstruction: briefs.commonInstruction, publicBrief: brief,
    sourceBundle, answer: { canonicalResult: report.canonicalResult, wireResult: report.wireResult,
      observedDecisions: report.observedDecisions },
    sourceScope: "supplied fixed-context only; no target execution" }
  const serialized = `${JSON.stringify(packet, null, 2)}\n`
  await writeFile(path.join(packets, `${anonymousId}.json`), serialized, { flag: "wx" })
  map[anonymousId] = { unitId: unit.id, caseId: unit.caseId, arm: unit.arm, phase: unit.phase,
    evidenceLayer: unit.input, packetSha256: hash(serialized), answerSha256: hash(JSON.stringify(packet.answer)) }
  const attempts = run.attempts ?? []
  accountRows.push({ id: unit.id, caseId: unit.caseId, arm: unit.arm, phase: unit.phase, status: report.status,
    finalKind: run.finalKind, firstResponse: run.firstResponse ?? null,
    providerCalls: report.telemetry?.providerCalls ?? null, respondedCalls: report.telemetry?.respondedCalls ?? null,
    unknownUsageCalls: report.telemetry?.unknownUsageCalls ?? null, knownTokens: report.telemetry?.knownTokens ?? null,
    tokensStatus: report.telemetry?.tokensStatus ?? null, actualUsdStatus: report.telemetry?.actualUsdStatus ?? null,
    totalActualUsd: report.telemetry?.totalActualUsd ?? null,
    fallbackCalls: attempts.filter((attempt: any) => attempt.transport === "prompt-parse").length,
    repairCalls: attempts.filter((attempt: any) => attempt.phase === "domain-repair").length,
    knownDurationMs: attempts.reduce((sum: number, attempt: any) => sum + (attempt.response?.durationMs ?? 0), 0),
    promptCharacters: report.promptCharacters })
}
const reviewMap = { schemaVersion: "authorization-aj-review-map/v1", configSha256,
  generatedAfterAllPanelUnitsClosed: true, anonymousPackets: Object.keys(map).length, map }
await writeFile(path.join(root, "evaluator", "review-map.json"), `${JSON.stringify(reviewMap, null, 2)}\n`, { flag: "wx" })
const account = { schemaVersion: "authorization-aj-generation-account/v1", configSha256, planned: accountRows.length,
  completed: accountRows.filter(row => row.status === "completed").length,
  providerCalls: accountRows.reduce((sum, row) => sum + Number(row.providerCalls ?? 0), 0),
  fallbackCalls: accountRows.reduce((sum, row) => sum + Number(row.fallbackCalls ?? 0), 0),
  repairCalls: accountRows.reduce((sum, row) => sum + Number(row.repairCalls ?? 0), 0),
  knownTokens: accountRows.reduce<Record<string, number>>((sum, row) => {
    const tokens = row.knownTokens as Record<string, number> | null
    for (const key of ["input", "output", "cacheRead", "cacheWrite"]) sum[key] = (sum[key] ?? 0) + (tokens?.[key] ?? 0)
    return sum
  }, {} as Record<string, number>),
  actualUsdStatus: accountRows.every(row => row.actualUsdStatus === "complete") ? "complete" : "unknown",
  totalActualUsd: accountRows.every(row => row.actualUsdStatus === "complete") ? accountRows.reduce<number>((sum, row) => sum + Number(row.totalActualUsd ?? 0), 0) : null,
  rows: accountRows }
await writeFile(path.join(root, "generation-account.json"), `${JSON.stringify(account, null, 2)}\n`, { flag: "wx" })
process.stdout.write(`${JSON.stringify({ packets: Object.keys(map).length, configSha256, providerCalls: account.providerCalls,
  fallbackCalls: account.fallbackCalls, repairCalls: account.repairCalls, knownTokens: account.knownTokens,
  actualUsdStatus: account.actualUsdStatus })}\n`)
