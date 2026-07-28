import { dirname, resolve } from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import {
  buildTrajectoryShapeAudit,
  verifyTrajectoryShapeAuditReport,
} from "./trajectory-shape-audit.ts"

const INPUTS = {
  rawPath: "results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/run/raw-runs.jsonl",
  planPath: "results/skill-ir/experimental-design-v2-source-route-diagnostic-calibration-2026-07-28/plan.json",
  replayReportPath: "results/skill-ir/experimental-design-v2-source-process-replay-2026-07-29.json",
  sessionsPath: ".skvm/log/sessions.jsonl",
  logRoot: ".skvm/log",
  matrixStartSessionId: "20260728-234900-run-bare-agent-gpt-5.6-sol-experimental-design-v2-stratified-dev",
} as const

const IMPLEMENTATION_EVIDENCE = [
  "src/benchmarks/skill-ir/trajectory-shape-audit.ts",
  "src/benchmarks/skill-ir/trajectory-shape-audit-run.ts",
] as const

export function parseTrajectoryShapeAuditArgs(argv: string[]) {
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
  const args = parseTrajectoryShapeAuditArgs(process.argv.slice(2))
  if (args.verify) {
    const report = JSON.parse(await Bun.file(resolve(args.root, args.verify)).text())
    await verifyTrajectoryShapeAuditReport(args.root, report)
    console.log(JSON.stringify({ verified: true, report: args.verify }))
    return
  }
  const report = await buildTrajectoryShapeAudit({
    root: args.root,
    rawPath: resolve(args.root, INPUTS.rawPath),
    planPath: resolve(args.root, INPUTS.planPath),
    replayReportPath: resolve(args.root, INPUTS.replayReportPath),
    sessionsPath: resolve(args.root, INPUTS.sessionsPath),
    logRoot: resolve(args.root, INPUTS.logRoot),
    matrixStartSessionId: INPUTS.matrixStartSessionId,
    additionalEvidencePaths: IMPLEMENTATION_EVIDENCE.map((path) => resolve(args.root, path)),
  })
  const outPath = resolve(args.root, args.out!)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({
    out: args.out,
    rows: report.counts.rows,
    trajectoryAvailable: report.counts.trajectoryAvailable,
    replayCoverage: report.replayCoverage.successfulEnvelopeCovered,
  }))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
