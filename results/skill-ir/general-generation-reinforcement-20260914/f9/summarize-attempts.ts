import path from "node:path"
import os from "node:os"
import { writeFile } from "node:fs/promises"

const root = path.resolve(import.meta.dirname)
const repo = path.resolve(root, "../../../../")
const relative = (file: string) => path.relative(repo, file).replaceAll("\\", "/")
const contains = (file: string) => {
  const rel = path.relative(root, file)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}
const sessions = new Map<string, any>()
const proposals = new Map<string, any>()
const packages: any[] = []
const unknown: any[] = []
const optimizerUsage: any[] = []
async function readJson(file: string): Promise<any | undefined> {
  try { return await Bun.file(file).json() } catch { return undefined }
}
for (const scanRoot of [root, path.join(os.homedir(), ".skvm", "log", "runtime")]) {
  for await (const found of new Bun.Glob("**/optimization-session.json").scan({ cwd: scanRoot, absolute: true })) {
    const session = await readJson(found)
    if (!session || !contains(session.binding?.workDir ?? "")) continue
    const runPath = session.artifacts?.runResult?.path
    const run = runPath ? await readJson(runPath) : undefined
    sessions.set(session.runId, {
      runId: session.runId,
      evidence: relative(found),
      startedAt: session.startedAt,
      model: session.binding.model,
      skill: relative(session.binding.selectedSkillPath),
      workDir: relative(session.binding.workDir),
      source: session.sourceRun,
      capture: session.capture?.status,
      optimization: session.optimization,
      tokens: run?.tokens ?? null,
      durationMs: run?.durationMs ?? null,
      reportedCost: run?.cost ?? null,
      actualUsd: null,
    })
    if (!run) unknown.push({ kind: "source-usage-unavailable", evidence: relative(found) })
    if (session.optimization?.proposalDir) proposals.set(session.optimization.proposalDir, null)
  }
}
for await (const found of new Bun.Glob("**/proposals/jit-optimize/**/meta.json").scan({ cwd: root, absolute: true })) {
  proposals.set(path.dirname(found), null)
}
for await (const found of new Bun.Glob("**/optimization-manifest.json").scan({ cwd: root, absolute: true })) {
  // Only delivered package roots, not cached proposal snapshots or source deployments.
  const rel = path.relative(root, found).replaceAll("\\", "/")
  if (/(?:^|\/)(?:cache[^/]*|\.skvm|proposals|tmp[^/]*)(?:\/|$)/u.test(rel)) continue
  const manifest = await readJson(found)
  if (!manifest?.schemaVersion?.startsWith("skvm-optimized-skill-package/")) continue
  packages.push({
    path: relative(path.dirname(found)), identity: manifest.identity,
    proposal: manifest.proposal?.dirName, diff: manifest.actualDiff,
    implementations: manifest.implementations, validation: manifest.validation,
  })
}
for (const [directory] of proposals) {
  const meta = await readJson(path.join(directory, "meta.json"))
  const history = await readJson(path.join(directory, "history.json"))
  const terminalRuns: any[] = []
  for await (const found of new Bun.Glob("round-*-optimizer/run-result.json").scan({ cwd: directory, absolute: true })) {
    const run = await readJson(found)
    if (run) terminalRuns.push({ evidence: relative(found), ...run })
  }
  const roundUsage = (history?.rounds ?? []).filter((round: any) => !round.isBaseline)
    .map((round: any) => round.optimizer?.tokens)
  if (roundUsage.length > 0) optimizerUsage.push(...roundUsage)
  else if (terminalRuns.length > 0) optimizerUsage.push(...terminalRuns.map((run) => run.tokens))
  else optimizerUsage.push(null)
  proposals.set(directory, {
    path: relative(directory),
    timestamp: meta?.timestamp ?? null,
    optimizerModel: meta?.optimizerModel ?? null,
    status: meta?.status ?? "unavailable",
    bestRound: meta?.bestRound ?? null,
    reason: meta?.bestRoundReason ?? null,
    rounds: (history?.rounds ?? []).map((round: any) => ({
      round: round.round, isBaseline: round.isBaseline,
      optimizer: round.optimizer, validation: round.validation ?? null,
    })),
    actions: history?.entries?.at(-1)?.actions ?? null,
    terminalRuns,
    actualUsd: null,
  })
  if (roundUsage.length === 0 && terminalRuns.length === 0) unknown.push({ kind: "optimizer-terminal-usage-unavailable", evidence: relative(directory) })
}
const sum = (items: any[]) => {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const missing: Record<string, number> = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  for (const item of items) {
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      if (typeof item?.[key] === "number") totals[key] += item[key]
      else missing[key]++
    }
  }
  return { observedSubtotals: totals, missingFields: missing }
}
const report = {
  schemaVersion: "skill-ir-development-attempt-reconciliation/v1",
  recordedAt: new Date().toISOString(),
  scope: "F9 sessions whose workDir is inside this identity, plus this identity's proposal histories and delivered packages.",
  sources: [...sessions.values()],
  proposals: [...proposals.values()],
  packages,
  costs: {
    source: sum([...sessions.values()].map((session) => session.tokens)),
    optimizerIncludingRecordedRepair: sum(optimizerUsage),
    optimizerAccounting: "Use aggregate history once per completed proposal; terminal observed usage only when history has no round usage. Never add terminal rows to their already aggregated history.",
    actualUsd: null,
    providerReportedZeroIsNotActualCost: true,
    projectDeveloperAgentCost: "not-measured",
  },
  unknown,
  claimBoundary: "Partial accounting until every dispatched attempt has a terminal usage record. No fee, successful program, or savings is inferred from missing data.",
}
const output = path.resolve(process.argv[2] ?? path.join(root, "attempt-reconciliation.json"))
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ sources: report.sources.length, proposals: report.proposals.length, packages: packages.length, costs: report.costs, unknownCount: unknown.length }, null, 2))
