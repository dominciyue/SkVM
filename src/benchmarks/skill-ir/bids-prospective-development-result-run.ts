import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest"
import { compileBidsValidatedArtifact, loadBidsArtifactCompilerInput } from "./bids-artifact-compiler"
import { BidsTaskSetSchema } from "./bids-contract"
import { BidsProspectiveConstructionReportSchema } from "./bids-prospective-construction"
import { validateProspectiveDevelopmentAnalysisPolicy } from "./prospective-development-analysis"
import { buildProspectiveDevelopmentResult } from "./prospective-development-result"
import type { ExecutionEnvelope } from "./execution-resilience"
import { scoreRealAgentRuns } from "./score-real-agent-runs"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring"
import { sha256Bytes } from "./source-fixture"
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog"
import { runValidatedArtifactPlan } from "./validated-artifact-runtime"

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

async function main() {
  const rootDir = path.resolve(process.cwd())
  const outDir = path.join(rootDir, "results/skill-ir/bids-prospective-development-v1")
  const controlDir = path.join(outDir, "artifact-control")
  const packageDir = path.join(controlDir, "package")
  const policyPath = path.join(rootDir, "benchmarks/skill-ir/pilots/bids/prospective-development-analysis-policy.json")
  const policy = await validateProspectiveDevelopmentAnalysisPolicy(
    JSON.parse(await readFile(policyPath, "utf8")), rootDir,
  )
  await rm(controlDir, { recursive: true, force: true })
  await mkdir(controlDir, { recursive: true })
  await compileBidsValidatedArtifact(await loadBidsArtifactCompilerInput(rootDir), packageDir)
  const artifactPackage = await validateValidatedArtifactPackage(packageDir)
  const tasksPath = path.join(rootDir, "benchmarks/skill-ir/pilots/bids/development/tasks.json")
  const tasks = BidsTaskSetSchema.parse(JSON.parse(await readFile(tasksPath, "utf8")))
  const rawRows: RawAgentRunRow[] = []
  for (const task of tasks.tasks) {
    for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
      const workDir = path.join(controlDir, "workdirs", task.id, `run-${runIndex}`)
      await mkdir(workDir, { recursive: true })
      for (const [relativePath, contents] of Object.entries(task.fixtures)) {
        const target = path.resolve(workDir, ...relativePath.split("/"))
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, contents, "utf8")
      }
      const manifestPath = path.join(path.dirname(workDir), `initial-workdir-manifest-${runIndex}.json`)
      const initialWorkdirManifest = await writeInitialWorkdirManifest({ workDir, manifestPath })
      const startedAt = performance.now()
      const runtime = await runValidatedArtifactPlan({ package: artifactPackage, workDir })
      const complete = runtime.status === "complete" && runtime.validation?.status === "pass"
      rawRows.push({
        caseId: `bids:skvm:windows:clean:${task.id}`,
        system: "validated-artifact",
        model: "deterministic/bids-artifact",
        modelFamily: "deterministic",
        adapter: "validated-artifact",
        adapterVersion: artifactPackage.manifest.schemaVersion,
        runIndex,
        panelConfigId: policy.analysisId,
        taskPath: tasksPath,
        workDir,
        initialWorkdirManifest,
        exitCode: complete ? 0 : 1,
        runStatus: complete ? "ok" : "adapter-crashed",
        durationMs: Math.round(performance.now() - startedAt),
        stdout: complete ? "validated BIDS artifact complete" : "",
        stderr: complete ? "" : "validated BIDS artifact failed",
        successSource: "execution-only",
      })
    }
  }
  const rawPath = path.join(controlDir, "raw-runs.jsonl")
  await writeFile(rawPath, `${rawRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
  const scoredPath = path.join(controlDir, "scored-runs.jsonl")
  await scoreRealAgentRuns({
    raw: rawPath,
    tasks: path.relative(rootDir, tasksPath).replaceAll("\\", "/"),
    corpus: "pilot",
    rootDir,
    out: scoredPath,
  })
  const [modelRows, artifactRows, envelopes, construction] = await Promise.all([
    readJsonl<ScoredAgentRunRow>(path.join(outDir, "run/scored-runs.jsonl")),
    readJsonl<ScoredAgentRunRow>(scoredPath),
    readJsonl<ExecutionEnvelope>(path.join(outDir, "run/execution-envelopes.jsonl")),
    readFile(path.join(rootDir, "results/skill-ir/bids-prospective-construction-v1/report.json"), "utf8")
      .then(JSON.parse).then((value) => BidsProspectiveConstructionReportSchema.parse(value)),
  ])
  const relative = (target: string) => path.relative(rootDir, target).replaceAll("\\", "/")
  const evidence = async (target: string) => ({
    path: relative(target),
    sha256: sha256Bytes(await readFile(target)),
  })
  const modelRawPath = path.join(outDir, "run/raw-runs.jsonl")
  const modelScoredPath = path.join(outDir, "run/scored-runs.jsonl")
  const envelopePath = path.join(outDir, "run/execution-envelopes.jsonl")
  const constructionPath = path.join(rootDir, "results/skill-ir/bids-prospective-construction-v1/report.json")
  const result = buildProspectiveDevelopmentResult({
    experimentId: "bids-prospective-development-2026-08-23",
    analysisPolicySha256: sha256Bytes(await readFile(policyPath)),
    modelRows,
    artifactRows,
    classifications: envelopes.map((item) => item.classification),
    evidence: {
      modelRaw: await evidence(modelRawPath),
      modelScored: await evidence(modelScoredPath),
      executionEnvelopes: await evidence(envelopePath),
      artifactRaw: await evidence(rawPath),
      artifactScored: await evidence(scoredPath),
      constructionReport: await evidence(constructionPath),
    },
    executionTotals: envelopes.reduce((total, item) => ({
      input: total.input + item.usage.input,
      output: total.output + item.usage.output,
      cacheRead: total.cacheRead + item.usage.cacheRead,
      cacheWrite: total.cacheWrite + item.usage.cacheWrite,
      durationMs: total.durationMs + item.process.durationMs,
    }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, durationMs: 0 }),
    maximumActiveExecutionFailures: policy.measurementEligibility.maximumActiveExecutionFailures,
    maximumParserOrRuntimeBlockers: policy.measurementEligibility.maximumParserOrRuntimeBlockers,
    automaticConstructionEligible: construction.prePaidGate.automaticCostEligible,
  })
  await writeFile(path.join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return result
}

if (import.meta.main) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
