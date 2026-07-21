import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  InfrastructureDiagnosticLockSchema,
  auditInfrastructureRows,
  type InfrastructureDiagnosticReport,
} from "./infrastructure-diagnostic.ts"
import type { RawAgentRunRow } from "./scoring.ts"

export interface InfrastructureDiagnosticArgs {
  rootDir: string
  lock: string
  out: string
}

function safeRelativePath(value: string, label: string): string {
  if (!value || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) {
    throw new Error(`${label} must be a safe relative path`)
  }
  if (value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} must be a safe relative path`)
  }
  return value
}

export function parseInfrastructureDiagnosticArgs(argv: string[]): InfrastructureDiagnosticArgs {
  let rootDir = process.cwd()
  let lock: string | undefined
  let out: string | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = path.resolve(arg.slice("--root-dir=".length))
    else if (arg.startsWith("--lock=")) lock = safeRelativePath(arg.slice("--lock=".length), "--lock")
    else if (arg.startsWith("--out=")) out = safeRelativePath(arg.slice("--out=".length), "--out")
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!lock) throw new Error("--lock is required")
  if (!out) throw new Error("--out is required")
  return { rootDir, lock, out }
}

function resolveFromRoot(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...safeRelativePath(relativePath, "frozen path").split("/"))
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function readFrozen(rootDir: string, record: { path: string; sha256: string }, label: string): Promise<Buffer> {
  const bytes = await readFile(resolveFromRoot(rootDir, record.path))
  if (sha256(bytes) !== record.sha256) throw new Error(`${label} digest mismatch`)
  return bytes
}

export async function runInfrastructureDiagnosticFile(
  args: InfrastructureDiagnosticArgs,
): Promise<InfrastructureDiagnosticReport> {
  const lock = InfrastructureDiagnosticLockSchema.parse(JSON.parse(
    await readFile(resolveFromRoot(args.rootDir, args.lock), "utf8"),
  ))
  const [rawBytes, summaryBytes, gateBytes] = await Promise.all([
    readFrozen(args.rootDir, lock.sourceExperiment.raw, "raw"),
    readFrozen(args.rootDir, lock.sourceExperiment.summary, "summary"),
    readFrozen(args.rootDir, lock.sourceExperiment.gate, "gate"),
  ])
  const summary = JSON.parse(summaryBytes.toString("utf8")) as {
    claimBoundary?: { developmentGatePassed?: unknown; heldOutExecuted?: unknown }
  }
  const gate = JSON.parse(gateBytes.toString("utf8")) as { gate?: { passed?: unknown } }
  if (summary.claimBoundary?.developmentGatePassed !== false || summary.claimBoundary?.heldOutExecuted !== false) {
    throw new Error("Source summary is not a failed development-only experiment")
  }
  if (gate.gate?.passed !== false) throw new Error("Source development gate is not frozen failed")

  const rows = rawBytes.toString("utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as RawAgentRunRow)
  const report = auditInfrastructureRows(rows, lock)
  const outPath = resolveFromRoot(args.rootDir, args.out)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

if (import.meta.main) {
  const report = await runInfrastructureDiagnosticFile(
    parseInfrastructureDiagnosticArgs(process.argv.slice(2)),
  )
  console.log(JSON.stringify(report, null, 2))
}
