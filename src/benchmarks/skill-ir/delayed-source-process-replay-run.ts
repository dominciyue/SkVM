import { dirname, join, resolve } from "node:path"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import {
  runDelayedSourceProcessReplay,
  verifyDelayedSourceProcessReplayReport,
} from "./delayed-source-process-replay.ts"

const PINNED_RUNTIME_DIR = ".skvm/runtime/bun-1.3.13-source-2026-07-27"

export function parseDelayedSourceProcessReplayArgs(argv: string[]) {
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
  const args = parseDelayedSourceProcessReplayArgs(process.argv.slice(2))
  const bunExecutable = resolve(args.root, PINNED_RUNTIME_DIR, "bun.exe")
  const nodeExecutable = resolve(args.root, PINNED_RUNTIME_DIR, "node.exe")
  if (args.verify) {
    const report = JSON.parse(await Bun.file(resolve(args.root, args.verify)).text())
    await verifyDelayedSourceProcessReplayReport(args.root, report, { bunExecutable, nodeExecutable })
    console.log(JSON.stringify({ verified: true, report: args.verify }))
    return
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-delayed-source-replay-"))
  try {
    const report = await runDelayedSourceProcessReplay({
      rootDir: args.root,
      temporaryRoot,
      bunExecutable,
      nodeExecutable,
      delayScale: 1,
    })
    const outPath = resolve(args.root, args.out!)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(JSON.stringify({
      out: args.out,
      runtimePassed: report.runtimePassed,
      passed: report.passed,
      rows: report.counts.observedRows,
      maximumDurationMs: Math.max(...report.rows.map((row) => row.durationMs)),
    }))
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
