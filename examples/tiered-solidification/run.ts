import path from "node:path"
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { BareAgentAdapter } from "../../src/adapters/bare-agent.ts"
import { CodexAccountAdapter } from "../../src/adapters/codex-account.ts"
import { Solidifier } from "../../src/jit-boost/solidifier.ts"
import { BoostCandidateSchema } from "../../src/jit-boost/types.ts"
import { DurableRuntimeTrace } from "../../src/core/durable-runtime-trace.ts"
import { executeRun, materializeNaturalRunTask } from "../../src/run/index.ts"
import type { LLMProvider, LLMResponse } from "../../src/providers/types.ts"

const option = (name: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const mode = option("mode") ?? "failure"
const channel = option("channel") ?? "scripted"
if (!["scripted", "account"].includes(channel)) throw new Error("--channel must be scripted or account")
if (!["success", "failure"].includes(mode)) throw new Error("--mode must be success or failure")
const output = option("out") ? path.resolve(option("out")!) : await mkdtemp(path.join(tmpdir(), "skvm-subworkflow-demo-"))
await mkdir(output, { recursive: true })
if ((await readdir(output)).length) throw new Error("Choose a fresh output directory")
const workDir = path.join(output, "work")
await mkdir(workDir, { recursive: true })
await Bun.write(path.join(workDir, "input.json"), JSON.stringify([1, 2, 3]))
const prepare = "const fs=require('fs');const rows=JSON.parse(fs.readFileSync('input.json','utf8'));fs.appendFileSync('count.txt','1');fs.writeFileSync('rows.json',JSON.stringify({rows}));"
const summarize = mode === "failure" ? "require('fs').writeFileSync('summary.json','{\"sum\":99}');" : "const fs=require('fs');const {rows}=JSON.parse(fs.readFileSync('rows.json','utf8'));fs.writeFileSync('summary.json',JSON.stringify({sum:rows.reduce((a,b)=>a+b,0)}));"
await Bun.write(path.join(workDir, "prepare.cjs"), prepare)
await Bun.write(path.join(workDir, "summarize.cjs"), summarize)
const candidate = BoostCandidateSchema.parse({
  purposeId: "rows-prefix", keywords: ["rows"], codeSignature: "rows", functionTemplate: "", materializationType: "shell", params: {},
  subworkflow: {
    remainingTask: "Use the current rows to produce summary.json with their sum, then write report.txt explaining row count and sum. Keep the validated prefix; do not rerun prepare.cjs.",
    bindings: [{ path: "prepare.cjs", sha256: createHash("sha256").update(prepare).digest("hex") }, { path: "summarize.cjs", sha256: createHash("sha256").update(summarize).digest("hex") }],
    steps: [
      { id: "prepare", argv: [process.execPath, "prepare.cjs"], outputs: [{ path: "rows.json", format: "json", requiredKeys: ["rows"] }, { path: "count.txt", format: "text" }] },
      { id: "summarize", argv: [process.execPath, "summarize.cjs"], outputs: [{ path: "summary.json", format: "json", requiredKeys: ["sum"] }], checks: [{ id: "sum", kind: "json-number", path: "summary.json", pointer: "/sum", source: "rows.json", sourcePointer: "/rows", operation: "sum" }] },
    ],
  },
})
await Bun.write(path.join(output, "candidate.json"), JSON.stringify(candidate, null, 2))
const finalResponse = (): LLMResponse => ({ text: "Report completed from the validated prefix.", toolCalls: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" })
let responses = 0
// Deliberately a scripted provider: this example verifies host wiring, not model quality.
const provider: LLMProvider = {
  name: "scripted-continuation-demo",
  async complete(params) {
    responses++
    if (!params.messages.some(m => typeof m.content === "string" && m.content.includes("[Validated subworkflow checkpoint]"))) throw new Error("Host omitted the checkpoint")
    const { rows } = JSON.parse(await readFile(path.join(workDir, "rows.json"), "utf8")) as { rows: number[] }
    const sum = rows.reduce((a, b) => a + b, 0)
    return { ...finalResponse(), text: "Continue from rows.json.", stopReason: "tool_use", toolCalls: [
      ...(mode === "failure" ? [{ id: "repair", name: "write_file", arguments: { path: "summary.json", content: JSON.stringify({ sum }) } }] : []),
      { id: "report", name: "write_file", arguments: { path: "report.txt", content: `Rows: ${rows.length}; sum: ${sum}\n` } },
    ] }
  },
  async completeWithToolResults() { responses++; return finalResponse() },
}
const solidifier = new Solidifier([candidate])
solidifier.getEntries()[0]!.state.promoted = true
const adapter = channel === "account" ? new CodexAccountAdapter() : new BareAgentAdapter(() => provider)
adapter.setHooks({ beforeLLM: [solidifier.createBeforeLLMHook()] })
const task = await materializeNaturalRunTask({ prompt: "Prepare rows and finish the summary and report.", taskPath: path.join(output, "task.json") })
const result = await executeRun({ task, adapter, adapterConfig: { model: channel === "account" ? "gpt-5.6-sol" : "scripted-demo", maxSteps: 12, timeoutMs: channel === "account" ? 240000 : 10000,
  ...(channel === "account" ? { providerOptions: { accountTraceDir: path.join(output, "account"), ...(option("boundary") ? { accountBoundary: path.resolve(option("boundary")!) } : {}) } } : {}),
}, workDir, keepWorkDir: true, runtimeTrace: new DurableRuntimeTrace(path.join(output, "runtime.jsonl")) })
const count = await readFile(path.join(workDir, "count.txt"), "utf8").catch(() => "")
const report = await readFile(path.join(workDir, "report.txt"), "utf8").catch(() => "")
const summary = await Bun.file(path.join(workDir, "summary.json")).json().catch(() => null)
const passed = result.runResult.runStatus === "ok" && count === "1" && summary?.sum === 6 && /\b3\b/.test(report) && /\b6\b/.test(report)
const evidence = { mode, channel, output, evidence: channel === "account" ? "account-development-smoke" : "deterministic-integration", passed,
  actualModelCalls: channel === "account" ? null : 0, accountTurnsDispatched: result.runResult.accountSession?.inferenceDispatched ? 1 : 0, scriptedResponses: responses, prefixExecutions: count.length, report, summary, run: result.runResult }
await Bun.write(path.join(output, "result.json"), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({ ...evidence, run: { status: result.runResult.runStatus, detail: result.runResult.statusDetail, tokens: result.runResult.tokens } }, null, 2))
if (!passed) process.exitCode = 1
