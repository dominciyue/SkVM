import { mkdtemp, mkdir, cp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { compareAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/change-report.ts"
const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const config = JSON.parse(await readFile(path.join(root, "panel-config.json"), "utf8"))
for (const u of config.units) await readFile(path.join(root, "runs", u.id, "unit.json"))
const outside = await mkdtemp(path.join(tmpdir(), "skvm-ae-ordinary-")), records: any[] = []
for (const c of config.cases) {
  const loaded = await loadLocalAuthorizationInput(path.join(repo, c.dsl))
  if (loaded.status !== "valid") throw Error("source input")
  const dest = path.join(outside, c.id, "run"), inputFile = path.join(dest, "assessment.json")
  await mkdir(dest, { recursive: true })
  await writeFile(inputFile, loaded.rawInput)
  await cp(loaded.sourceRoot, path.join(dest, loaded.normalizedInput.sourceRoot), { recursive: true })
  for (const wire of ["v4", "v5"] as const) {
    const output: string[] = [], deps = { stdout: (v: string) => output.push(v), stderr: (v: string) => { throw Error(v) }, providerFactory: () => { throw Error("Network provider forbidden") } }
    if (await runAuthorizationCli(["check", `--input=${inputFile}`, "--method=plain", `--wire=${wire}`], deps) !== 0) throw Error("ordinary check")
    const unit = config.units.find((u: any) => u.caseId === c.id && u.arm === "dsl" && u.wire === wire)
    const stored = JSON.parse(await readFile(path.join(root, "runs", unit.id, "unit.json"), "utf8"))
    const oldRun = JSON.parse(await readFile(path.join(root, "runs", unit.id, "sessions", stored.report.sessionId, "run.json"), "utf8"))
    const artifact = oldRun.finalKind ? oldRun[oldRun.finalKind] : undefined
    if (!artifact) { records.push({ case: c.id, wire, check: "valid", replay: "no-delivered-answer", originalStatus: oldRun.status }); continue }
    let calls = 0
    const result = await executeLocalAuthorizationRun({ inputFile, model: "recorded/AE-final-wire", outRoot: path.join(dest, `replay-${wire}`), method: "plain", wireVersion: wire, providerFactory: () => ({ name: "recorded-only", async complete() { calls++; return { text: "", toolCalls: [{ id: "retained", name: "submit_authorization_result", arguments: artifact.wireResult }], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "tool_use" } }, async completeWithToolResults() { throw Error("No execution") } }) })
    if (!("sessionPath" in result)) throw Error("No session")
    const inspected = await inspectLocalAuthorizationOutput(result.sessionPath)
    if (!isDeepStrictEqual(inspected.canonicalResult, artifact.result)) throw Error("Recorded payload changed")
    const compare = await compareAuthorizationInput(result.sessionPath, inputFile)
    if (compare.status !== "current") throw Error(`Changed replay dependencies: ${JSON.stringify(compare)}`)
    records.push({ case: c.id, wire, inputSchema: JSON.parse(loaded.rawInput).schemaVersion, check: "valid", replay: result.status, replayCalls: calls, inspect: "identical-canonical", compare: compare.status, ordinarySession: result.sessionPath, sourceRun: path.relative(repo, path.join(root, "runs", unit.id)).replaceAll("\\", "/") })
  }
}
const report = { schemaVersion: "authorization-ae-portable-replay/v1", outsideDirectory: outside, networkProviderCalls: 0, newModelObservations: 0, targetExecutions: 0, records }
await writeFile(path.join(root, "ordinary-verification.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ cases: config.cases.length, records: records.length, networkProviderCalls: 0 }))
