import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { RunExecutionObservationSchema, type RunExecutionObservation } from "../../core/types"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring"
import { runResourceProbeFile } from "./resource-contract-run"
import { executeGenericPlanRow } from "./real-agent-run"
import { scoreRealAgentRuns } from "./score-real-agent-runs"
import { sha256Bytes } from "./source-fixture"
import { buildExecutionEnvelope } from "./static-development-v2-run"
import type { ProspectiveDevelopmentLock, ProspectiveDevelopmentPlan } from "./prospective-development"
import {
  buildProspectiveDevelopmentQualification,
  type ProspectiveDevelopmentQualification,
} from "./prospective-development-qualification"

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(root, target))
    else if (entry.isFile()) files.push(path.relative(root, target).replaceAll("\\", "/"))
  }
  return files.sort((left, right) => left.localeCompare(right, "en"))
}

function observationPath(row: ProspectiveDevelopmentPlan["plan"][number]): string {
  const argument = row.command.find((item) => item.startsWith("--execution-observation="))
  if (!argument) throw new Error(`Prospective development observation path missing: ${row.caseId}`)
  return argument.slice("--execution-observation=".length)
}

async function readObservation(
  target: string,
  raw: RawAgentRunRow & { outerTimedOut?: boolean },
): Promise<RunExecutionObservation> {
  try {
    return RunExecutionObservationSchema.parse(JSON.parse(await readFile(target, "utf8")))
  } catch {
    return {
      schemaVersion: "skvm-run-execution-observation/v1",
      process: {
        exitCode: raw.exitCode,
        termination: raw.outerTimedOut ? "absolute-timeout" : raw.exitCode === 0 ? "natural" : "crash",
        durationMs: raw.durationMs,
      },
      activity: {
        requestDispatched: false,
        providerResponses: 0,
        assistantMessages: 0,
        toolCalls: 0,
        toolResults: 0,
      },
      terminal: { present: false },
      usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: raw.exitCode === 0 ? "incompatible" : "empty", unknownTypes: [] },
    }
  }
}

export async function executeProspectiveDevelopmentRow(input: {
  row: ProspectiveDevelopmentPlan["plan"][number]
  lock: ProspectiveDevelopmentLock
  env?: Record<string, string | undefined>
}) {
  const target = observationPath(input.row)
  await rm(target, { force: true })
  const raw = await executeGenericPlanRow(input.row, {
    outerWatchdogMs: input.lock.runtime.outerWatchdogMs,
    exposeOuterTimedOut: true,
  }, input.env ?? process.env) as RawAgentRunRow & { outerTimedOut?: boolean }
  const taskId = input.row.caseId.split(":").at(-1)
  if (!taskId) throw new Error(`Prospective development task identity missing: ${input.row.caseId}`)
  const files = await listFiles(input.row.workDir)
  return {
    raw,
    files,
    envelope: buildExecutionEnvelope({
      experimentId: input.lock.experimentId,
      taskId,
      system: input.row.system,
      candidateBlock: input.row.runIndex,
      attemptId: `${taskId}:block-${input.row.runIndex}:${input.row.system}`,
      observation: await readObservation(target, raw),
      outputFileCount: files.length,
      outerWatchdog: raw.outerTimedOut,
    }),
  }
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

export async function runProspectiveDevelopmentQualification(input: {
  rootDir: string
  lockPath: string
  outDir: string
  lock: ProspectiveDevelopmentLock
  plan: ProspectiveDevelopmentPlan
  env?: Record<string, string | undefined>
}): Promise<ProspectiveDevelopmentQualification> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.resolve(input.outDir)
  await mkdir(outDir, { recursive: true })
  const resourcePath = path.join(outDir, "resource-probe.json")
  const resource = await runResourceProbeFile({
    rootDir,
    contract: input.lock.frozenInputs.resourceContract.path,
    out: path.relative(rootDir, resourcePath).replaceAll("\\", "/"),
  })
  const key = (input.env ?? process.env)[input.lock.runtime.apiKeyEnv]
  if (!key?.trim()) throw new Error(`Missing ${input.lock.runtime.apiKeyEnv}`)
  const rows = input.plan.plan.filter((row) =>
    row.system === input.lock.qualification.system
    && row.runIndex === input.lock.qualification.candidateBlock
    && row.caseId.endsWith(`:${input.lock.qualification.taskId}`))
  if (rows.length !== 1) throw new Error(`Prospective qualification requires one row, got ${rows.length}`)
  const executed = await executeProspectiveDevelopmentRow({
    row: rows[0]!, lock: input.lock, env: { ...(input.env ?? process.env), SKVM_AUTO_PROBE: "0" },
  })
  const rawPath = path.join(outDir, "raw-runs.jsonl")
  await writeFile(rawPath, `${JSON.stringify(executed.raw)}\n`, "utf8")
  const scoredPath = path.join(outDir, "scored-runs.jsonl")
  await scoreRealAgentRuns({
    raw: rawPath,
    tasks: input.lock.frozenInputs.tasks.path,
    corpus: input.lock.corpus,
    rootDir,
    out: scoredPath,
  })
  const scored = (await readJsonl<ScoredAgentRunRow>(scoredPath))[0]
  const expectedFiles = [
    ...input.lock.publicContract.protectedInputs,
    ...input.lock.publicContract.exactOutputs,
  ].sort((left, right) => left.localeCompare(right, "en"))
  const qualification = buildProspectiveDevelopmentQualification({
    experimentId: input.lock.experimentId,
    lockSha256: sha256Bytes(await readFile(input.lockPath)),
    resource: {
      status: resource.status === "ok" ? "ok" : "failed",
      reportPath: path.relative(rootDir, resourcePath).replaceAll("\\", "/"),
      reportSha256: sha256Bytes(await readFile(resourcePath)),
    },
    envelope: executed.envelope,
    scorer: {
      rowProduced: scored !== undefined,
      deterministicEvaluator: scored?.successSource === "deterministic-evaluator",
      semanticSuccess: scored?.success ?? null,
    },
    exactOutputsPresent: JSON.stringify(executed.files) === JSON.stringify(expectedFiles),
  })
  await writeFile(path.join(path.dirname(outDir), "qualification.json"), `${JSON.stringify(qualification, null, 2)}\n`, "utf8")
  return qualification
}
