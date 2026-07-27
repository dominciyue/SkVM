import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { SafeRelativePathSchema } from "./artifact-package.ts"
import {
  PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS,
  summarizePreIrRuntimeQualification,
  type PreIrRuntimeQualificationReport,
} from "./pre-ir-runtime-qualification.ts"
import { runCommandWithTimeout, type ProbeExecution } from "./route-probe.ts"
import { sha256Bytes } from "./source-fixture.ts"

const QUALIFICATION_TIMEOUT_MS = 30_000

export type PreIrRuntimeQualificationArgs = {
  rootDir: string
  executablePath: string
  qualificationId: string
  sourceCommit: string
  outPath: string
}

type RuntimeQualificationOverrides = {
  runProbe?: (command: string[], timeoutMs: number) => Promise<ProbeExecution>
  bunVersion?: string
}

export async function runPreIrRuntimeQualification(
  opts: PreIrRuntimeQualificationArgs,
  overrides: RuntimeQualificationOverrides = {},
): Promise<PreIrRuntimeQualificationReport> {
  const rootDir = path.resolve(opts.rootDir)
  const executableRelative = SafeRelativePathSchema.parse(opts.executablePath.replaceAll("\\", "/"))
  const outRelative = SafeRelativePathSchema.parse(opts.outPath.replaceAll("\\", "/"))
  if (!/^[0-9a-f]{40}$/.test(opts.sourceCommit)) {
    throw new Error("Runtime qualification source commit must be a 40-character lowercase Git SHA")
  }
  const executablePath = path.resolve(rootDir, executableRelative)
  const executableStat = await stat(executablePath)
  if (!executableStat.isFile()) throw new Error("Runtime qualification executable must be a regular file")
  const executableSha256 = sha256Bytes(await readFile(executablePath))
  const runProbe = overrides.runProbe ?? runCommandWithTimeout
  const executions: ProbeExecution[] = []
  for (let attempt = 0; attempt < PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS; attempt += 1) {
    executions.push(await runProbe([executablePath, "--help"], QUALIFICATION_TIMEOUT_MS))
  }
  const report = summarizePreIrRuntimeQualification({
    qualificationId: opts.qualificationId,
    executable: { path: executableRelative, sha256: executableSha256 },
    sourceCommit: opts.sourceCommit,
    bunVersion: overrides.bunVersion ?? Bun.version,
    platform: process.platform,
    arch: process.arch,
    executions,
  })
  const outPath = path.resolve(rootDir, outRelative)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

export function parsePreIrRuntimeQualificationArgs(argv: string[]): PreIrRuntimeQualificationArgs {
  let rootDir = process.cwd()
  let executablePath: string | undefined
  let qualificationId: string | undefined
  let sourceCommit: string | undefined
  let outPath: string | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice("--root-dir=".length)
    else if (arg.startsWith("--executable=")) executablePath = arg.slice("--executable=".length)
    else if (arg.startsWith("--qualification-id=")) qualificationId = arg.slice("--qualification-id=".length)
    else if (arg.startsWith("--source-commit=")) sourceCommit = arg.slice("--source-commit=".length)
    else if (arg.startsWith("--out=")) outPath = arg.slice("--out=".length)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!executablePath) throw new Error("--executable is required")
  if (!qualificationId) throw new Error("--qualification-id is required")
  if (!sourceCommit) throw new Error("--source-commit is required")
  if (!outPath) throw new Error("--out is required")
  return { rootDir: path.resolve(rootDir), executablePath, qualificationId, sourceCommit, outPath }
}

if (import.meta.main) {
  runPreIrRuntimeQualification(parsePreIrRuntimeQualificationArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify(report, null, 2))
      if (report.status !== "passed") process.exitCode = 1
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
