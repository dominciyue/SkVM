import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { resolveInstalledPiPackageCommand } from "../../adapters/pi.ts"
import { runSubprocess, type SubprocessResult } from "../../core/subprocess.ts"
import { Sha256Schema } from "./artifact-package.ts"
import { sha256Bytes } from "./source-fixture.ts"

const FailureClassSchema = z.enum([
  "none",
  "command-unavailable",
  "invalid-command",
  "timeout",
  "node-nonzero",
  "pi-nonzero",
  "mixed-version-streams",
  "node-version-invalid",
  "pi-version-mismatch",
])

export const PiPackageExecutionProbeReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-pi-package-execution-probe/v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  commandKind: z.enum(["node-installed-package-cli", "unavailable"]),
  node: z.object({
    version: z.string(),
    executableSha256: Sha256Schema,
  }).strict().nullable(),
  pi: z.object({
    version: z.string(),
    packageJsonSha256: Sha256Schema,
    cliSha256: Sha256Schema,
  }).strict().nullable(),
  execution: z.object({
    exitCode: z.number().int().nullable(),
    timedOut: z.boolean(),
    durationMs: z.number().nonnegative(),
    failureClass: FailureClassSchema,
  }).strict(),
}).strict()

export type PiPackageExecutionProbeReport = z.infer<typeof PiPackageExecutionProbeReportSchema>

type ProbeDependencies = {
  resolveCommand?: () => Promise<string[] | null>
  execute?: (command: string[], cwd: string) => Promise<SubprocessResult>
  fileDigest?: (filePath: string) => Promise<string>
}

function versionFromStreams(result: SubprocessResult): { value: string; mixed: boolean } {
  const streams = [result.stdout.trim(), result.stderr.trim()].filter(Boolean)
  return { value: streams.length === 1 ? streams[0]! : "", mixed: streams.length > 1 }
}

function failedReport(
  commandKind: "node-installed-package-cli" | "unavailable",
  failureClass: z.infer<typeof FailureClassSchema>,
  execution?: Partial<Pick<SubprocessResult, "exitCode" | "timedOut" | "durationMs">>,
  node: PiPackageExecutionProbeReport["node"] = null,
  pi: PiPackageExecutionProbeReport["pi"] = null,
): PiPackageExecutionProbeReport {
  return PiPackageExecutionProbeReportSchema.parse({
    schemaVersion: "skill-ir-pi-package-execution-probe/v1",
    methodEvidence: false,
    status: "failed",
    commandKind,
    node,
    pi,
    execution: {
      exitCode: execution?.exitCode ?? null,
      timedOut: execution?.timedOut ?? false,
      durationMs: execution?.durationMs ?? 0,
      failureClass,
    },
  })
}

export async function runPiPackageExecutionProbe(
  input: { rootDir: string; outPath?: string },
  dependencies: ProbeDependencies = {},
): Promise<PiPackageExecutionProbeReport> {
  const rootDir = path.resolve(input.rootDir)
  const packageDir = path.resolve(rootDir, "node_modules/@mariozechner/pi-coding-agent")
  const resolveCommand = dependencies.resolveCommand
    ?? (() => resolveInstalledPiPackageCommand({ packageDir }))
  const execute = dependencies.execute
    ?? ((command, cwd) => runSubprocess(command, { cwd, timeoutMs: 30000 }))
  const fileDigest = dependencies.fileDigest
    ?? (async (filePath) => sha256Bytes(await readFile(filePath)))

  const command = await resolveCommand()
  let report: PiPackageExecutionProbeReport
  if (!command) {
    report = failedReport("unavailable", "command-unavailable")
  } else if (
    command.length !== 2
    || command.some((part) => part.includes(`${path.sep}.bin${path.sep}`))
    || path.basename(command[1]!) !== "cli.js"
    || path.basename(path.dirname(command[1]!)) !== "dist"
  ) {
    report = failedReport("node-installed-package-cli", "invalid-command")
  } else {
    const cwd = await mkdtemp(path.join(tmpdir(), "skvm-pi-执行-"))
    try {
      const nodeExecution = await execute([command[0]!, "--version"], cwd)
      const piExecution = await execute([...command, "--version"], cwd)
      const durationMs = nodeExecution.durationMs + piExecution.durationMs
      const exitCode = piExecution.exitCode
      const timedOut = nodeExecution.timedOut || piExecution.timedOut
      const nodeVersion = versionFromStreams(nodeExecution)
      const piVersion = versionFromStreams(piExecution)
      const node = {
        version: nodeVersion.value,
        executableSha256: await fileDigest(command[0]!),
      }
      const pi = {
        version: piVersion.value,
        packageJsonSha256: await fileDigest(path.resolve(path.dirname(command[1]!), "../package.json")),
        cliSha256: await fileDigest(command[1]!),
      }

      if (timedOut) report = failedReport("node-installed-package-cli", "timeout", { exitCode, timedOut, durationMs }, node, pi)
      else if (nodeExecution.exitCode !== 0) report = failedReport("node-installed-package-cli", "node-nonzero", { exitCode: nodeExecution.exitCode, durationMs }, node, pi)
      else if (piExecution.exitCode !== 0) report = failedReport("node-installed-package-cli", "pi-nonzero", { exitCode, durationMs }, node, pi)
      else if (nodeVersion.mixed || piVersion.mixed) report = failedReport("node-installed-package-cli", "mixed-version-streams", { exitCode, durationMs }, node, pi)
      else if (!/^v\d+\.\d+\.\d+$/u.test(nodeVersion.value)) report = failedReport("node-installed-package-cli", "node-version-invalid", { exitCode, durationMs }, node, pi)
      else if (piVersion.value !== "0.67.68") report = failedReport("node-installed-package-cli", "pi-version-mismatch", { exitCode, durationMs }, node, pi)
      else {
        report = PiPackageExecutionProbeReportSchema.parse({
          schemaVersion: "skill-ir-pi-package-execution-probe/v1",
          methodEvidence: false,
          status: "passed",
          commandKind: "node-installed-package-cli",
          node,
          pi,
          execution: { exitCode, timedOut: false, durationMs, failureClass: "none" },
        })
      }
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }

  if (input.outPath) {
    const outPath = path.resolve(input.outPath)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }
  return report
}

function parseArgs(argv: string[]): { rootDir: string; outPath: string } {
  let rootDir = process.cwd()
  let outPath: string | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice("--root-dir=".length)
    else if (arg.startsWith("--out=")) outPath = arg.slice("--out=".length)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!outPath) throw new Error("--out is required")
  return { rootDir, outPath }
}

if (import.meta.main) {
  runPiPackageExecutionProbe(parseArgs(process.argv.slice(2)))
    .then((report) => {
      console.log(JSON.stringify({ status: report.status }, null, 2))
      if (report.status !== "passed") process.exitCode = 1
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
