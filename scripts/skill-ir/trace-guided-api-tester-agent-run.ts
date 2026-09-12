import { createHash } from "node:crypto"
import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { z } from "zod"
import { runHeadlessAgent } from "../../src/core/headless-agent/index.ts"
import { piEventsToRunRecord, type PiEvent } from "../../src/core/pi-runtime.ts"
import { analyzeSkillConsumption } from "../../src/jit-optimize/consumption.ts"
import { prepareApiTesterProductionArtifactV2 } from "../../src/skill-ir/api-tester-production-artifact-v2.ts"
import { ApiTesterProductionBindingSchemaV2 } from "../../src/skill-ir/api-tester-production-contract-v2.ts"

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function flags(args: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") || result.has(key)) {
      throw new Error(`Expected unique --name value pairs; received ${JSON.stringify(args)}`)
    }
    result.set(key, value)
  }
  return result
}

async function emptyDirectory(path: string, label: string): Promise<void> {
  await mkdir(path, { recursive: true })
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(path)).length > 0) {
    throw new Error(`${label} must be a new empty non-symlink directory: ${path}`)
  }
}

async function runChecker(input: {
  checker: string
  binding: string
  contract: string
  workDir: string
  inputSha256: string
}): Promise<{ exitCode: number; stdout: string; stderr: string; report: unknown }> {
  const child = Bun.spawn([
    "node",
    input.checker,
    "--binding", input.binding,
    "--contract", input.contract,
    "--workdir", input.workDir,
    "--input-sha256", input.inputSha256,
  ], { cwd: input.workDir, stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  let report: unknown = null
  try { report = JSON.parse(stdout) } catch { /* preserve raw output */ }
  return { exitCode, stdout, stderr, report }
}

async function main(args: string[]): Promise<void> {
  const values = flags(args)
  const skillDir = values.get("--skill-dir")
  const bindingPath = values.get("--binding")
  const inputPath = values.get("--input")
  const runDirValue = values.get("--run-dir")
  const evidenceDirValue = values.get("--evidence-dir")
  const model = values.get("--model")
  const condition = values.get("--condition")
  const requireHelper = values.get("--require-helper") === "true"
  if (!skillDir || !bindingPath || !inputPath || !runDirValue || !evidenceDirValue || !model || !condition) {
    throw new Error("Required: --skill-dir --binding --input --run-dir --evidence-dir --model --condition [--require-helper true|false]")
  }
  const allowed = new Set([
    "--skill-dir", "--binding", "--input", "--run-dir", "--evidence-dir",
    "--model", "--condition", "--require-helper",
  ])
  const unknown = [...values.keys()].filter((key) => !allowed.has(key))
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`)

  const runDir = resolve(runDirValue)
  const evidenceDir = resolve(evidenceDirValue)
  await Promise.all([emptyDirectory(runDir, "run directory"), emptyDirectory(evidenceDir, "evidence directory")])
  const workDir = join(runDir, "work")
  const oracleOut = join(runDir, "oracle")
  await mkdir(workDir, { recursive: true })
  await cp(resolve(skillDir), join(workDir, "skill"), { recursive: true, errorOnExist: true })

  const bindingBytes = await readFile(resolve(bindingPath))
  const binding = ApiTesterProductionBindingSchemaV2.parse(JSON.parse(bindingBytes.toString("utf8")))
  const workBinding = join(workDir, "binding.json")
  const workInput = join(workDir, binding.input.path)
  await mkdir(dirname(workInput), { recursive: true })
  await Promise.all([
    writeFile(workBinding, bindingBytes, { flag: "wx" }),
    copyFile(resolve(inputPath), workInput),
  ])
  const beforeInput = await readFile(workInput)
  const inputSha256 = sha256(beforeInput)

  const oracle = await prepareApiTesterProductionArtifactV2({
    rootDir: dirname(resolve(bindingPath)),
    bindingPath: basename(resolve(bindingPath)),
    workDir,
    outDir: oracleOut,
  })
  const verificationDir = join(workDir, "verification")
  await mkdir(verificationDir, { recursive: true })
  await Promise.all([
    copyFile(join(oracle.packageDir, oracle.manifest.binding.path), join(verificationDir, "binding.json")),
    copyFile(join(oracle.packageDir, oracle.manifest.publicContract.path), join(verificationDir, "public-contract.json")),
    copyFile(join(oracle.packageDir, oracle.manifest.programs.checker.path), join(verificationDir, "check.mjs")),
  ])

  const prompt = `First read ./skill/SKILL.md and use it as the task method. Complete this bounded offline API Tester task in the current directory.

Inputs and immutable verification resources:
- ./binding.json (v2 ordinary-input binding)
- ./${binding.input.path} (OpenAPI input; SHA-256 ${inputSha256})
- ./verification/public-contract.json and ./verification/check.mjs

Produce the binding-declared ./plan.json and ./report.md without modifying any input or verification file. If the skill provides a matching deterministic helper, invoke that helper with --binding ./binding.json, --workdir ., --out-dir ../solidification-output, and --node node. The helper output directory must be a sibling because the package forbids work/output overlap. Resolve helper paths relative to ./skill/SKILL.md. If there is no helper, implement the required outputs from the public contract and checker rather than inventing API behavior.

Run this independent check before finishing:
node verification/check.mjs --binding verification/binding.json --contract verification/public-contract.json --workdir . --input-sha256 ${inputSha256}

Do not call a live API. In the final response, state whether the local checker passed and explicitly retain live API behavior, credentials, server state, and unsupported schema features as residual duties. Do not ask a question.`

  const startedAt = new Date().toISOString()
  const result = await runHeadlessAgent({
    cwd: workDir,
    prompt,
    model,
    driver: "pi",
    timeoutMs: 600_000,
    throwOnError: false,
  })
  const endedAt = new Date().toISOString()
  const events = z.array(z.unknown()).parse(JSON.parse(result.rawStdout)) as PiEvent[]
  const runRecord = piEventsToRunRecord(events).finish({
    workDir,
    durationMs: result.durationMs,
    ...(result.timedOut
      ? { runStatus: "timeout" as const }
      : result.exitCode === 0
        ? {}
        : { runStatus: "adapter-crashed" as const }),
  })
  const consumption = analyzeSkillConsumption(runRecord.steps)
  const checker = await runChecker({
    checker: join(oracle.packageDir, oracle.manifest.programs.checker.path),
    binding: join(oracle.packageDir, oracle.manifest.binding.path),
    contract: join(oracle.packageDir, oracle.manifest.publicContract.path),
    workDir,
    inputSha256,
  })
  const afterInput = await readFile(workInput)
  const inputPreserved = sha256(afterInput) === inputSha256
  const qualityPassed = checker.exitCode === 0
    && (checker.report as { status?: unknown } | null)?.status === "pass"
  const helperRequirementPassed = !requireHelper
    || (consumption.helperInvoked && consumption.helperSucceeded
      && await Bun.file(join(runDir, "solidification-output", "run-report.json")).exists())
  const status = result.exitCode === 0 && runRecord.runStatus === "ok" && consumption.skillRead
    && inputPreserved && qualityPassed && helperRequirementPassed
    ? "passed"
    : "failed"

  const rawTracePath = join(evidenceDir, "raw-trace.json")
  await writeFile(rawTracePath, result.rawStdout, { encoding: "utf8", flag: "wx" })
  const report = {
    schemaVersion: "skill-ir-trace-guided-agent-consumption/v1",
    identity: `trace-guided-api-tester-${condition}`,
    status,
    condition,
    source: {
      skillDir: resolve(skillDir),
      skillSha256: sha256(await readFile(join(resolve(skillDir), "SKILL.md"))),
      bindingSha256: sha256(bindingBytes),
      inputSha256,
    },
    runtime: {
      startedAt,
      endedAt,
      runDir,
      model,
      driver: result.driver,
      bunVersion: Bun.version,
      nodeVersion: process.version,
    },
    targetAgent: {
      exitCode: result.exitCode,
      runStatus: runRecord.runStatus,
      durationMs: result.durationMs,
      usageAvailable: runRecord.usageAvailable ?? true,
      tokens: result.tokens,
      reportedCostUsd: result.cost,
      actualCostUsd: "unknown-provider-pricing",
      finalText: runRecord.text,
    },
    toolEvidence: consumption,
    verification: {
      inputPreserved,
      helperRequired: requireHelper,
      helperRequirementPassed,
      checkerExitCode: checker.exitCode,
      checkerStderr: checker.stderr,
      checkerReport: checker.report,
      qualityPassed,
    },
    trace: {
      path: "raw-trace.json",
      sha256: sha256(await readFile(rawTracePath)),
      eventCount: events.length,
    },
    claimBoundary: "This is one development target-agent execution. Local checker success does not prove live API behavior, held-out generalization, readiness or human savings.",
  }
  await writeFile(join(evidenceDir, "report.json"), jsonText(report), { encoding: "utf8", flag: "wx" })
  process.stdout.write(jsonText(report))
  if (status !== "passed") process.exitCode = 1
}

await main(process.argv.slice(2))
