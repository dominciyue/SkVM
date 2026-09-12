import { mkdir, writeFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import { ApiTesterProductionUnsupportedError } from "../skill-ir/api-tester-production-contract.ts"
import { runApiTesterProductionArtifactV2 } from "../skill-ir/api-tester-production-artifact-v2.ts"

export interface ApiTaskSolidificationCliResult {
  exitCode: number
  stdout: string
  stderr: string
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseFlags(args: string[]): {
  binding: string
  workDir: string
  outDir: string
  nodeExecutable: string
} {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value arguments; received ${JSON.stringify(args)}`)
    }
    if (values.has(key)) throw new Error(`Duplicate argument: ${key}`)
    values.set(key, value)
  }
  const binding = values.get("--binding")
  const workDir = values.get("--workdir")
  const outDir = values.get("--out-dir")
  const nodeExecutable = values.get("--node") ?? "node"
  const known = new Set(["--binding", "--workdir", "--out-dir", "--node"])
  const unknown = [...values.keys()].filter((key) => !known.has(key))
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(", ")}`)
  if (!binding || !workDir || !outDir) {
    throw new Error("Required arguments: --binding <file> --workdir <directory> --out-dir <empty-directory> [--node <executable>]")
  }
  return {
    binding: resolve(binding),
    workDir: resolve(workDir),
    outDir: resolve(outDir),
    nodeExecutable,
  }
}

export async function runApiTaskSolidificationCli(args: string[]): Promise<ApiTaskSolidificationCliResult> {
  try {
    const flags = parseFlags(args)
    const report = await runApiTesterProductionArtifactV2({
      rootDir: dirname(flags.binding),
      bindingPath: basename(flags.binding),
      workDir: flags.workDir,
      outDir: flags.outDir,
      nodeExecutable: flags.nodeExecutable,
    })
    await mkdir(flags.outDir, { recursive: true })
    await writeFile(joinPortable(flags.outDir, "run-report.json"), jsonLine(report), {
      encoding: "utf8",
      flag: "wx",
    })
    return { exitCode: 0, stdout: jsonLine(report), stderr: "" }
  } catch (error) {
    if (error instanceof ApiTesterProductionUnsupportedError) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: jsonLine({
          status: "unsupported",
          code: error.code,
          message: error.message,
          fallbackRequired: true,
          claimBoundary: "No artifact was accepted. Continue the original API Tester workflow for unsupported duties.",
        }),
      }
    }
    return {
      exitCode: 1,
      stdout: "",
      stderr: jsonLine({
        status: "error",
        code: "SOLIDIFICATION_RUN_FAILED",
        message: error instanceof Error ? error.message : String(error),
        fallbackRequired: true,
      }),
    }
  }
}

function joinPortable(directory: string, file: string): string {
  return resolve(directory, file)
}

if (import.meta.main) {
  const result = await runApiTaskSolidificationCli(process.argv.slice(2))
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.exitCode)
}
