import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { readAndValidateNamespacedResourceDevelopmentQualityLock } from "./namespaced-resource-development-lock.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"

const ScoredRowSchema = z.object({
  caseId: z.string().min(1),
  system: z.string().min(1),
  task: z.string().min(1),
  runIndex: z.number().int().positive(),
  runStatus: z.string().optional(),
  success: z.boolean().optional(),
  evaluatorScore: z.number().finite().optional(),
  tokenCost: z.number().finite().nonnegative().optional(),
}).passthrough()

export type NamespacedResourceDevelopmentGateReport = {
  schemaVersion: "skill-ir-namespaced-resource-quality-development-gate/v1"
  experimentId: string
  status: "passed" | "failed"
  counts: {
    rawRows: number
    expectedRows: number
    completeQuartets: number
    expectedQuartets: number
    infrastructureFailures: number
    pairwiseRegressions: number
  }
  systems: Record<string, {
    rows: number
    successes: number
    meanScore: number
    meanTokenCost: number
  }>
  taskMeans: Record<string, number>
  gate: {
    optimizedSuccesses: number
    minimumOptimizedSuccesses: number
    optimizedMeanScore: number
    minimumOptimizedMeanScore: number
    minimumOptimizedTaskMeanScore: number
    passed: boolean
    failures: string[]
  }
  claimBoundary: string
}

function scoreOf(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0)
}

export function buildNamespacedResourceDevelopmentGateReport(opts: {
  rows: ScoredAgentRunRow[]
  lock: Awaited<ReturnType<typeof readAndValidateNamespacedResourceDevelopmentQualityLock>>["lock"]
}): NamespacedResourceDevelopmentGateReport {
  const systems: Record<string, { rows: number; successes: number; meanScore: number; meanTokenCost: number }> = {}
  for (const row of opts.rows) {
    const record = systems[row.system] ?? { rows: 0, successes: 0, meanScore: 0, meanTokenCost: 0 }
    record.rows += 1
    record.successes += row.success ? 1 : 0
    record.meanScore += scoreOf(row)
    record.meanTokenCost += row.tokenCost ?? 0
    systems[row.system] = record
  }
  for (const record of Object.values(systems)) {
    record.meanScore = record.rows === 0 ? 0 : Number((record.meanScore / record.rows).toFixed(4))
    record.meanTokenCost = record.rows === 0 ? 0 : Number((record.meanTokenCost / record.rows).toFixed(2))
  }

  const quartetMap = new Map<string, Map<string, ScoredAgentRunRow>>()
  for (const row of opts.rows) {
    const key = `${row.caseId}:${row.runIndex}`
    const quartet = quartetMap.get(key) ?? new Map<string, ScoredAgentRunRow>()
    quartet.set(row.system, row)
    quartetMap.set(key, quartet)
  }
  let pairwiseRegressions = 0
  for (const quartet of quartetMap.values()) {
    const optimized = quartet.get("optimized")
    const baselineScores = [quartet.get("original"), quartet.get("ir-static")]
      .filter((row): row is ScoredAgentRunRow => row !== undefined)
      .map(scoreOf)
    if (optimized && baselineScores.length === 2 && scoreOf(optimized) < Math.max(...baselineScores)) {
      pairwiseRegressions += 1
    }
  }

  const optimizedRows = opts.rows.filter((row) => row.system === "optimized")
  const optimizedTaskMeans = new Map<string, number[]>()
  for (const row of optimizedRows) {
    const values = optimizedTaskMeans.get(row.task) ?? []
    values.push(scoreOf(row))
    optimizedTaskMeans.set(row.task, values)
  }
  const taskMeans = Object.fromEntries([...optimizedTaskMeans].map(([task, scores]) => [
    task,
    Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(4)),
  ]))
  const optimizedMeanScore = systems.optimized?.meanScore ?? 0
  const optimizedSuccesses = systems.optimized?.successes ?? 0
  const infrastructureFailures = opts.rows.filter((row) => row.runStatus !== undefined && row.runStatus !== "ok").length
  const failures: string[] = []
  if (opts.rows.length !== opts.lock.gate.expectedRows) failures.push("row-count")
  if (quartetMap.size !== opts.lock.gate.expectedQuartets) failures.push("quartet-count")
  if (infrastructureFailures > opts.lock.gate.maximumInfrastructureFailures) failures.push("infrastructure")
  if (optimizedSuccesses < opts.lock.gate.minimumOptimizedSuccesses) failures.push("optimized-successes")
  if (optimizedMeanScore < opts.lock.gate.minimumOptimizedMeanScore) failures.push("optimized-mean-score")
  if (Object.values(taskMeans).some((score) => score < opts.lock.gate.minimumOptimizedTaskMeanScore)) failures.push("optimized-task-mean-score")
  if (pairwiseRegressions > opts.lock.gate.maximumPairwiseRegressions) failures.push("pairwise-regression")

  return {
    schemaVersion: "skill-ir-namespaced-resource-quality-development-gate/v1",
    experimentId: opts.lock.experimentId,
    status: failures.length === 0 ? "passed" : "failed",
    counts: {
      rawRows: opts.rows.length,
      expectedRows: opts.lock.gate.expectedRows,
      completeQuartets: [...quartetMap.values()].filter((quartet) =>
        opts.lock.matrix.systems.every((system) => quartet.has(system))).length,
      expectedQuartets: opts.lock.gate.expectedQuartets,
      infrastructureFailures,
      pairwiseRegressions,
    },
    systems,
    taskMeans,
    gate: {
      optimizedSuccesses,
      minimumOptimizedSuccesses: opts.lock.gate.minimumOptimizedSuccesses,
      optimizedMeanScore,
      minimumOptimizedMeanScore: opts.lock.gate.minimumOptimizedMeanScore,
      minimumOptimizedTaskMeanScore: opts.lock.gate.minimumOptimizedTaskMeanScore,
      passed: failures.length === 0,
      failures,
    },
    claimBoundary: "Frozen development evidence only; a failed gate cannot support held-out, PGO, cross-skill, stability, or Token claims.",
  }
}

async function readJsonl(filePath: string): Promise<ScoredAgentRunRow[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ScoredRowSchema.parse(JSON.parse(line)) as ScoredAgentRunRow)
}

export async function runNamespacedResourceDevelopmentGate(opts: {
  rootDir: string
  scoredPath: string
  outPath: string
}): Promise<NamespacedResourceDevelopmentGateReport> {
  const rootDir = path.resolve(opts.rootDir)
  const { lock } = await readAndValidateNamespacedResourceDevelopmentQualityLock({
    rootDir,
    lockPath: path.join(rootDir, "benchmarks", "skill-ir", "pilots", "namespaced-resource-quality-development-lock.json"),
  })
  const report = buildNamespacedResourceDevelopmentGateReport({ rows: await readJsonl(path.resolve(opts.scoredPath)), lock })
  await mkdir(path.dirname(path.resolve(opts.outPath)), { recursive: true })
  await writeFile(path.resolve(opts.outPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=")
    return [key, rest.join("=")]
  })) as Record<string, string>
  const report = await runNamespacedResourceDevelopmentGate({
    rootDir: args["root-dir"] ?? process.cwd(),
    scoredPath: args.scored ?? "results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl",
    outPath: args.out ?? "results/skill-ir/namespaced-resource-quality-development-v1-r2/gate-report.json",
  })
  console.log(JSON.stringify({ status: report.status, failures: report.gate.failures, out: args.out }, null, 2))
}
