import path from "node:path"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
const id = process.argv[2] ?? "wire-1"
if (!/^wire-\d+$/.test(id)) throw new Error("Unsafe probe identity")
const base = path.join(import.meta.dir, "probes", id), original = path.join(import.meta.dir, "probes/wire-1")
if (existsSync(path.join(base, "run"))) throw new Error("Probe already claimed; use a new repair identity and preserve the old result")
if (id === "wire-1") {
  await mkdir(path.join(base, "source"), { recursive: true })
  await writeFile(path.join(base, "source/entry.ts"), "export function inspect(enabled: boolean) {\n  if (!enabled) return false\n  return true\n}\n", { encoding: "utf8", flag: "wx" })
  await writeFile(path.join(base, "input.json"), JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "wire-probe", repository: "neutral-wire-probe", sourceRef: "probe-v1", sourceRoot: "source", allowedPaths: ["entry.ts"], brief: "Investigate inspect in the provided source. Does it return true for both enabled and disabled inputs? Give the relevant source branches with citations; enabled is unspecified.", mode: "behavior" }, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
}
await mkdir(base, { recursive: true })
await writeFile(path.join(base, "identity.json"), JSON.stringify({ id, implementationRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), repairOf: id === "wire-1" ? null : "wire-1", inputFile: path.join(original, "input.json"), budgets: { maxDispatches: 6, maxToolCalls: 8, maxTokens: 4000 } }, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
const report = await executeLocalInquiryRun({ inputFile: path.join(original, "input.json"), outDir: path.join(base, "run"), model: "xty/gpt-5.6-sol", method: "M", strategy: "domain-evidence-v1", execution: { maxDispatches: 6, maxToolCalls: 8, maxTokens: 4000, perCallTimeoutMs: 300000, sessionTimeoutMs: 900000 } })
await writeFile(path.join(base, "report.json"), JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
const run = "sessionPath" in report && report.sessionPath ? JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8")) : undefined
console.log(JSON.stringify({ status: report.status, sessionPath: "sessionPath" in report ? report.sessionPath : null, calls: run?.telemetry?.providerCalls, final: run?.final, diagnostics: run?.validation?.diagnostics, error: run?.error, probesOnly: true, qualityClaim: false }))
