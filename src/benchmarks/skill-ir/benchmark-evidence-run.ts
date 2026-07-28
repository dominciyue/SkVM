import { dirname, join, resolve } from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import {
  buildBenchmarkEvidenceReport,
  compareMeasurementContracts,
  evidenceRef,
  projectRawRuntimeEvidence,
  summarizeRunnerBoundary,
  summarizeSkillOptimization,
  verifyEvidenceRefs,
  type EvidenceRef,
  type RunnerPlanProjection,
} from "./benchmark-evidence.ts"

type JsonRecord = Record<string, unknown>

const EVIDENCE_PATHS = {
  v1Audit: "results/skill-ir/benchmark-contract-audit/experimental-design.json",
  v2Audit: "results/skill-ir/benchmark-contract-audit/experimental-design-v2.json",
  v2Materialization: "results/skill-ir/benchmark-contract-audit/experimental-design-v2-materialization.json",
  v1Gate: "results/skill-ir/experimental-design-baseline-calibration-2026-07-25/gate-report.json",
  v2Gate: "results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/gate.json",
  v1Plan: "results/skill-ir/experimental-design-baseline-calibration-2026-07-25/plan.json",
  v2Plan: "results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/plan.json",
  v1Raw: "results/skill-ir/experimental-design-baseline-calibration-2026-07-25/run/raw-runs.jsonl",
  v2Raw: "results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/run/raw-runs.jsonl",
  envManager: "results/skill-ir/env-manager-contract-repair-v4-development-evidence-2026-07-22/summary.json",
  lawDevelopment: "results/skill-ir/law-to-markdown-validated-artifact-development-run-2026-07-24/summary.json",
  lawHeldout: "results/skill-ir/law-to-markdown-validated-artifact-heldout-run-2026-07-24/summary.json",
} as const

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object at ${label}`)
  }
  return value as JsonRecord
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected array at ${label}`)
  return value
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected number at ${label}`)
  }
  return value
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Expected boolean at ${label}`)
  return value
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Expected string at ${label}`)
  return value
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text())
}

function projectPlan(value: unknown): RunnerPlanProjection {
  const plan = record(value, "plan")
  const lock = record(plan.lock, "plan.lock")
  const rows = array(plan.plan, "plan.plan").map((row, index) =>
    record(row, `plan.plan[${index}]`))
  const frozenRunnerPaths: string[] = []
  const frozenImplementations = lock.frozenImplementations
  if (frozenImplementations) {
    const modelRunner = record(record(frozenImplementations, "frozenImplementations").modelRunner, "modelRunner")
    frozenRunnerPaths.push(string(modelRunner.path, "modelRunner.path"))
  }
  const executionRuntime = lock.executionRuntime
  if (executionRuntime) {
    for (const item of array(record(executionRuntime, "executionRuntime").orchestration, "orchestration")) {
      const path = string(record(item, "orchestration item").path, "orchestration.path")
      if (path.endsWith("real-agent-run.ts")) frozenRunnerPaths.push(path)
    }
  }
  const commands = rows.map((row, rowIndex) =>
    array(row.command, `plan.plan[${rowIndex}].command`).map((part, partIndex) =>
      string(part, `command[${partIndex}]`)))
  return {
    frozenRunnerPaths: [...new Set(frozenRunnerPaths)],
    adapter: string(record(lock.adapter, "lock.adapter").id, "lock.adapter.id"),
    commands,
    initialWorkdirManifestRows: rows.filter((row) =>
      typeof row.initialWorkdirManifestPath === "string").length,
    nodeHttpHelperBound: Boolean(lock.nodeHttpTransport),
  }
}

function projectOperationalGate(value: unknown) {
  const gate = record(value, "gate")
  const counts = record(gate.counts, "gate.counts")
  const infrastructureFailures = number(counts.infrastructureFailures, "infrastructureFailures")
  const completePairs = number(counts.completePairs, "completePairs")
  const explicitComparable = counts.comparablePairs
  return {
    passed: boolean(gate.passed, "gate.passed"),
    expectedRows: number(counts.expectedRows, "expectedRows"),
    observedRows: number(counts.observedRows, "observedRows"),
    completePairs,
    infrastructureFailures,
    comparablePairs: typeof explicitComparable === "number"
      ? explicitComparable
      : infrastructureFailures === 0 ? completePairs : null,
    differingPairs: number(counts.differingPairs, "differingPairs"),
  }
}

function projectOptimizationInputs(envValue: unknown, lawDevValue: unknown, lawHeldValue: unknown, v2GateValue: unknown) {
  const env = record(envValue, "env-manager summary")
  const envPaired = record(env.pairedComplete, "env.pairedComplete")
  const envGate = record(env.gate, "env.gate")
  const envGateCounts = record(envGate.counts, "env.gate.counts")
  const envClaim = record(env.claimBoundary, "env.claimBoundary")

  const lawDev = record(lawDevValue, "law development summary")
  const lawDevSystems = record(lawDev.systems, "lawDev.systems")
  const lawDevGate = record(lawDev.gate, "lawDev.gate")
  const lawHeld = record(lawHeldValue, "law heldout summary")
  const lawHeldSystems = record(lawHeld.systems, "lawHeld.systems")
  const lawHeldGate = record(lawHeld.gate, "lawHeld.gate")
  const lawHeldCounts = record(lawHeld.counts, "lawHeld.counts")
  const lawHeldCost = record(lawHeld.cost, "lawHeld.cost")

  const v2Gate = record(v2GateValue, "v2 gate")
  const v2Counts = record(v2Gate.counts, "v2 counts")
  const v2Interpretation = record(v2Gate.interpretation, "v2 interpretation")

  return {
    envManager: {
      pairedGenerations: number(envPaired.generations, "env generations"),
      preMeanScore: number(envPaired.preMeanScore, "env pre mean"),
      postMeanScore: number(envPaired.postMeanScore, "env post mean"),
      infrastructureFailures: number(envGateCounts.infrastructureFailures, "env infrastructure"),
      developmentGatePassed: boolean(envClaim.developmentGatePassed, "env gate"),
      heldOutExecuted: boolean(envClaim.heldOutExecuted, "env heldout"),
    },
    lawToMarkdown: {
      developmentGatePassed: boolean(lawDevGate.passed, "law dev gate"),
      developmentArtifactMean: number(
        record(lawDevSystems["validated-artifact"], "law dev artifact").meanScoreIncludingMissing,
        "law dev artifact mean",
      ),
      developmentStaticMean: number(
        record(lawDevSystems["ir-static"], "law dev static").meanScoreIncludingMissing,
        "law dev static mean",
      ),
      heldOutGatePassed: boolean(lawHeldGate.passed, "law held gate"),
      heldOutArtifactMean: number(
        record(lawHeldSystems["validated-artifact"], "law held artifact").meanScoreIncludingMissing,
        "law held artifact mean",
      ),
      heldOutStaticMean: number(
        record(lawHeldSystems["ir-static"], "law held static").meanScoreIncludingMissing,
        "law held static mean",
      ),
      heldOutRegressions: number(lawHeldCounts.pairwiseRegressions, "law held regressions"),
      breakEvenAvailable: lawHeldCost.breakEven !== "not-computed-quality-gate-pending",
    },
    experimentalDesign: {
      measurementContractPassed: true,
      baselineGatePassed: boolean(v2Gate.passed, "v2 gate passed"),
      infrastructureFailures: number(v2Counts.infrastructureFailures, "v2 infrastructure"),
      comparablePairs: number(v2Counts.comparablePairs, "v2 comparable pairs"),
      baseIrAuditAllowed: boolean(v2Interpretation.baseIrAuditAllowed, "v2 base IR allowed"),
      heldOutExecuted: false,
    },
  }
}

async function generate(root: string) {
  const absolute = Object.fromEntries(Object.entries(EVIDENCE_PATHS).map(([key, path]) =>
    [key, join(root, path)])) as Record<keyof typeof EVIDENCE_PATHS, string>
  const values = Object.fromEntries(await Promise.all(Object.entries(absolute).map(async ([key, path]) =>
    [key, key.endsWith("Raw") ? await Bun.file(path).text() : await readJson(path)]))) as Record<string, unknown>

  const measurement = compareMeasurementContracts(
    values.v1Audit,
    values.v2Audit,
    values.v2Materialization,
  )
  const operational = {
    comparableAcrossVersions: false,
    reason: "v1 measurement contract failed; v2 latest matrix contains infrastructure failures",
    v1: projectOperationalGate(values.v1Gate),
    v2: projectOperationalGate(values.v2Gate),
  }
  const runnerBoundary = summarizeRunnerBoundary({
    v1Plan: projectPlan(values.v1Plan),
    v2Plan: projectPlan(values.v2Plan),
    v1Raw: projectRawRuntimeEvidence(string(values.v1Raw, "v1 raw")),
    v2Raw: projectRawRuntimeEvidence(string(values.v2Raw, "v2 raw")),
  })
  const optimization = summarizeSkillOptimization(projectOptimizationInputs(
    values.envManager,
    values.lawDevelopment,
    values.lawHeldout,
    values.v2Gate,
  ))
  const refs = await Promise.all(Object.values(absolute).map((path) => evidenceRef(root, path)))
  return {
    ...buildBenchmarkEvidenceReport({ measurement, operational, runnerBoundary, optimization }),
    benchmarkFamily: "experimental-design",
    generatedDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()),
    methodEvidence: false,
    provenance: refs.sort((left, right) => left.path.localeCompare(right.path)),
  }
}

function parseArgs(argv: string[]) {
  const rootArg = argv.find((arg) => arg.startsWith("--root="))?.slice("--root=".length)
  const outArg = argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length)
  const verifyArg = argv.find((arg) => arg.startsWith("--verify-only="))?.slice("--verify-only=".length)
  return { root: resolve(rootArg ?? process.cwd()), out: outArg, verify: verifyArg }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.verify) {
    const report = record(await readJson(resolve(args.root, args.verify)), "report")
    const refs = array(report.provenance, "report.provenance").map((value, index) => {
      const ref = record(value, `provenance[${index}]`)
      return { path: string(ref.path, "ref.path"), sha256: string(ref.sha256, "ref.sha256") }
    }) satisfies EvidenceRef[]
    await verifyEvidenceRefs(args.root, refs)
    console.log(JSON.stringify({ verified: refs.length, report: args.verify }))
    return
  }
  if (!args.out) throw new Error("Usage: benchmark-evidence-run.ts --out=<path> [--root=<repo>]")
  const report = await generate(args.root)
  const outPath = resolve(args.root, args.out)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({ out: args.out, evidence: report.provenance.length }))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
