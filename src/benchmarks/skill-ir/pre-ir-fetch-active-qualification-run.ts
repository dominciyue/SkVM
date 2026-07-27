import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema } from "./artifact-package.ts"
import {
  assertPreIrCalibrationExecutionState,
  type PreIrCalibrationLock,
} from "./pre-ir-calibration.ts"
import {
  buildPreIrCalibrationPlan,
  withQualifiedPreIrRuntimeEnvironment,
} from "./pre-ir-calibration-run.ts"
import {
  compactPreIrRouteDiagnostic,
} from "./pre-ir-route-diagnostic.ts"
import {
  PreIrFetchActiveQualificationReportSchema,
  type PreIrFetchActiveQualificationReport,
} from "./pre-ir-fetch-active-qualification.ts"
import { runCommandWithTimeout, type ProbeExecution } from "./route-probe.ts"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import { sha256Bytes } from "./source-fixture.ts"

export type PreIrFetchActiveQualificationArgs = {
  rootDir: string
  lockPath: string
  qualificationId: string
  outDir: string
  reportPath: string
}

type ExecuteProbe = (
  entry: RealAgentRunPlanEntry,
  env: Record<string, string | undefined>,
  timeoutMs: number,
) => Promise<ProbeExecution>

function resolveFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value)
}

function requireRuntimeQualifiedLock(lock: PreIrCalibrationLock): asserts lock is Extract<
  PreIrCalibrationLock,
  {
    schemaVersion:
      | "skill-ir-runtime-qualified-pre-ir-calibration-lock/v1"
      | "skill-ir-node-http-runtime-qualified-pre-ir-calibration-lock/v1"
  }
> {
  if (
    lock.schemaVersion !== "skill-ir-runtime-qualified-pre-ir-calibration-lock/v1"
    && lock.schemaVersion !== "skill-ir-node-http-runtime-qualified-pre-ir-calibration-lock/v1"
  ) {
    throw new Error("Fetch-active qualification requires a runtime-qualified pre-IR lock")
  }
}

async function inspectPublicOutputs(workDir: string): Promise<{
  declared: number
  present: number
  missing: string[]
}> {
  const contract = z.object({
    outputs: z.array(SafeRelativePathSchema).min(1),
  }).passthrough().parse(JSON.parse(await readFile(path.join(workDir, "design-contract.json"), "utf8")))
  const missing: string[] = []
  let present = 0
  for (const relativePath of contract.outputs) {
    try {
      const stat = await lstat(path.join(workDir, ...relativePath.split("/")))
      if (!stat.isFile() || stat.isSymbolicLink()) missing.push(relativePath)
      else present++
    } catch {
      missing.push(relativePath)
    }
  }
  return { declared: contract.outputs.length, present, missing }
}

function selectProbeEntry(plan: RealAgentRunPlanEntry[], lock: PreIrCalibrationLock): RealAgentRunPlanEntry {
  const expectedCaseId = [
    lock.skillId,
    lock.matrix.agents[0],
    lock.matrix.environments[0],
    lock.matrix.contexts[0],
    lock.matrix.taskIds[0],
  ].join(":")
  const entry = plan.find((row) => row.system === "original" && row.caseId === expectedCaseId && row.runIndex === 1)
  if (!entry) throw new Error("Fetch-active qualification probe entry is missing")
  return entry
}

export async function runPreIrFetchActiveQualification(
  opts: PreIrFetchActiveQualificationArgs,
  execute: ExecuteProbe = (entry, env, timeoutMs) => runCommandWithTimeout(entry.command, timeoutMs, env),
): Promise<PreIrFetchActiveQualificationReport> {
  const rootDir = path.resolve(opts.rootDir)
  const lockPath = resolveFromRoot(rootDir, opts.lockPath)
  const outDir = resolveFromRoot(rootDir, opts.outDir)
  const reportPath = resolveFromRoot(rootDir, opts.reportPath)
  const built = await buildPreIrCalibrationPlan({ rootDir, lockPath, outDir, phase: "route-probe" })
  requireRuntimeQualifiedLock(built.lock)
  await assertPreIrCalibrationExecutionState(built.lock, rootDir)
  if (!process.env[built.lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Fetch-active qualification API key env ${built.lock.runtime.apiKeyEnv} is missing`)
  }

  const entry = selectProbeEntry(built.plan, built.lock)
  const execution = await withQualifiedPreIrRuntimeEnvironment(
    built.lock,
    rootDir,
    (env) => execute(entry, env, built.lock.runtime.routeProbeTimeoutMs),
  )
  const diagnostic = compactPreIrRouteDiagnostic({
    qualificationId: opts.qualificationId,
    calibrationId: built.lock.calibrationId,
    model: built.lock.model.route,
    caseId: entry.caseId,
    execution,
  })
  const outputMaterialization = await inspectPublicOutputs(entry.workDir)
  const status = diagnostic.failureCode === "none"
    && diagnostic.exitCode === 0
    && outputMaterialization.missing.length === 0
      ? "passed" as const
      : "failed" as const
  const lockBytes = await readFile(lockPath)
  const report = PreIrFetchActiveQualificationReportSchema.parse({
    schemaVersion: "skill-ir-fetch-active-runtime-qualification/v1",
    qualificationId: opts.qualificationId,
    calibrationId: built.lock.calibrationId,
    methodEvidence: false,
    status,
    lockSha256: sha256Bytes(lockBytes),
    runtimeCandidate: {
      sourceCommit: built.lock.executionRuntime.sourceCommit,
      executableSha256: built.lock.executionRuntime.executable.sha256,
      startupQualificationSha256: built.lock.executionRuntime.qualification.sha256,
    },
    diagnostic,
    outputMaterialization,
  })
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

export function parsePreIrFetchActiveQualificationArgs(argv: string[]): PreIrFetchActiveQualificationArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let qualificationId: string | undefined
  let outDir: string | undefined
  let reportPath: string | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = path.resolve(arg.slice("--root-dir=".length))
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length)
    else if (arg.startsWith("--qualification-id=")) qualificationId = arg.slice("--qualification-id=".length)
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length)
    else if (arg.startsWith("--report=")) reportPath = arg.slice("--report=".length)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!lockPath) throw new Error("--lock is required")
  if (!qualificationId) throw new Error("--qualification-id is required")
  if (!outDir) throw new Error("--out-dir is required")
  if (!reportPath) throw new Error("--report is required")
  return { rootDir, lockPath, qualificationId, outDir, reportPath }
}

if (import.meta.main) {
  runPreIrFetchActiveQualification(parsePreIrFetchActiveQualificationArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify({
        qualificationId: report.qualificationId,
        status: report.status,
        failureCode: report.diagnostic.failureCode,
      }, null, 2))
      if (report.status !== "passed") process.exitCode = 1
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
