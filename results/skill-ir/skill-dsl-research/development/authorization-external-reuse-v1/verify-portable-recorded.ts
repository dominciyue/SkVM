import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { executeLocalAuthorizationRun } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"

// Delivery verification only: replay retained wire through an injected provider.
// These fresh local sessions are not new model observations or replacement evidence.
const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const workspace = await mkdtemp(path.join(os.tmpdir(), "skvm-ab-recorded-"))
await cp(path.join(repo, "examples/authorization-assessment/reusable-skill"), path.join(workspace, "skill"), { recursive: true })
const config = await read(path.join(root, "panel-config.json"))
let replayCalls = 0
const records: any[] = []
async function cli(cwd: string, args: string[]) {
  const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), "authorization", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (exit !== 0) throw new Error(`${args.join(" ")}: ${stderr}\n${stdout}`)
  return JSON.parse(stdout)
}
for (const project of ["linkding", "todo"]) {
  const cwd = path.join(workspace, project)
  await mkdir(cwd)
  await cp(path.join(root, "public", project, "project"), path.join(cwd, "project"), { recursive: true })
  const cases = config.cases.filter((c: any) => c.project === project)
  const sessions = new Map<string, string>()
  for (const c of cases) {
    const inputName = path.basename(c.dsl)
    const inputFile = path.join(cwd, inputName)
    await cp(path.join(repo, c.dsl), inputFile)
    const stored = await read(path.join(root, "runs", c.id + "-dsl", "unit.json"))
    const sourceSession = path.join(root, "runs", c.id + "-dsl", "sessions", stored.report.sessionId)
    const run = await read(path.join(sourceSession, "run.json"))
    const artifact = run[run.finalKind]
    const out = `runs/${c.id}`
    const check = await cli(cwd, ["check", `--input=./${inputName}`, "--method=plain", "--wire=v4"])
    if (check.status !== "valid") throw new Error(`${c.id}: check failed`)
    const report = await executeLocalAuthorizationRun({ inputFile, outRoot: path.join(cwd, out), model: "mock/recorded-ab-wire", method: "plain", wireVersion: "v4", providerFactory: () => ({
      name: "offline-recorded-wire", async complete() {
        replayCalls++
        return { text: "", toolCalls: [{ id: "recorded", name: "submit_authorization_result", arguments: artifact.wireResult }], tokens: { input: 0, output: 0 }, durationMs: 0, stopReason: "tool_use" as const }
      }, async completeWithToolResults() { throw new Error("Recorded verification has no tool execution") },
    }) })
    const inspected = await cli(cwd, ["inspect", `--out=./${out}`])
    const relativeSession = path.relative(cwd, report.sessionPath).replaceAll("\\", "/")
    const current = await cli(cwd, ["compare", `--previous=./${relativeSession}`, `--input=./${inputName}`])
    if (report.status !== "completed" || inspected.status !== "completed" || current.status !== "current") throw new Error(`${c.id}: lifecycle failed`)
    const replay = await read(path.join(report.sessionPath, "run.json"))
    if (JSON.stringify(replay[replay.finalKind].result.results) !== JSON.stringify(artifact.result.results)) throw new Error(`${c.id}: semantic payload changed`)
    sessions.set(c.id, relativeSession)
    records.push({ case: c.id, project, check: check.status, inspect: inspected.status, compare: current.status, originalResultPayloadPreserved: true, sourceSessionId: stored.report.sessionId, recordedWireSha256: createHash("sha256").update(JSON.stringify(artifact.wireResult)).digest("hex"), commandInput: `./${inputName}`, session: relativeSession })
  }
  for (const c of cases.filter((c: any) => c.id.endsWith("-changed"))) {
    const previous = sessions.get(c.id.replace(/-changed$/, "-original"))!
    const impact = await cli(cwd, ["compare", `--previous=./${previous}`, `--input=./${path.basename(c.dsl)}`])
    if (impact.status !== "needs-review") throw new Error(`${c.id}: changed task not detected`)
    records.find(r => r.case === c.id).changedCompare = impact
  }
}
const summary = { schemaVersion: "authorization-ab-portable-recorded-verification/v1", workspace, retainedForInspection: true, runtime: "existing checkout and installed Bun dependencies", deliveryOnly: true, sourceOfResponses: "unchanged retained AB DSL wire outputs through injected offline provider", newModelObservations: 0, networkProviderCalls: 0, targetExecutions: 0, replayCalls, records }
await writeFile(path.join(root, "portable-recorded-verification.json"), JSON.stringify(summary, null, 2) + "\n")
console.log(JSON.stringify({ states: records.length, replayCalls, networkProviderCalls: 0, payloadsPreserved: true, workspace }))
