import { dirname, join, resolve } from "node:path"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { runDelayedSourceProcessReplay } from "./delayed-source-process-replay.ts"
import {
  buildDurableRuntimeTraceValidationReport,
  verifyDurableRuntimeTraceValidationReport,
} from "./durable-runtime-trace-validation.ts"

const PINNED_RUNTIME_DIR = ".skvm/runtime/bun-1.3.13-source-2026-07-27"

export function parseDurableRuntimeTraceValidationArgs(argv: string[]) {
  let root = process.cwd()
  let out: string | undefined
  let verify: string | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root=")) root = arg.slice("--root=".length)
    else if (arg.startsWith("--out=")) out = arg.slice("--out=".length)
    else if (arg.startsWith("--verify-only=")) verify = arg.slice("--verify-only=".length)
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if ((out ? 1 : 0) + (verify ? 1 : 0) !== 1) {
    throw new Error("Provide exactly one of --out or --verify-only")
  }
  return { root: resolve(root), out, verify }
}

async function main() {
  const args = parseDurableRuntimeTraceValidationArgs(process.argv.slice(2))
  if (args.verify) {
    const report = JSON.parse(await Bun.file(resolve(args.root, args.verify)).text())
    await verifyDurableRuntimeTraceValidationReport(args.root, report)
    console.log(JSON.stringify({ verified: true, report: args.verify }))
    return
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-durable-trace-validation-"))
  const tracePath = resolve(temporaryRoot, "runtime-trace.jsonl")
  const previousTracePath = process.env.SKVM_DURABLE_RUNTIME_TRACE
  try {
    process.env.SKVM_DURABLE_RUNTIME_TRACE = tracePath
    const sourceReplay = await runDelayedSourceProcessReplay({
      rootDir: args.root,
      temporaryRoot: resolve(temporaryRoot, "source-replay"),
      bunExecutable: resolve(args.root, PINNED_RUNTIME_DIR, "bun.exe"),
      nodeExecutable: resolve(args.root, PINNED_RUNTIME_DIR, "node.exe"),
      delayScale: 0,
    })
    const traceText = await Bun.file(tracePath).text()
    const report = await buildDurableRuntimeTraceValidationReport({
      rootDir: args.root,
      traceText,
      sourceReplay,
    })
    const outPath = resolve(args.root, args.out!)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(JSON.stringify({
      out: args.out,
      status: report.status,
      events: report.trace.events,
      segments: report.trace.segments.length,
    }))
  } finally {
    if (previousTracePath === undefined) delete process.env.SKVM_DURABLE_RUNTIME_TRACE
    else process.env.SKVM_DURABLE_RUNTIME_TRACE = previousTracePath
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
