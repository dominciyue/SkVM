import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { BareAgentAdapter } from "../../src/adapters/bare-agent.ts"
import { DurableRuntimeTrace } from "../../src/core/durable-runtime-trace.ts"
import type { CompletionParams, LLMProvider, LLMResponse } from "../../src/providers/types.ts"
import type { RuntimeHooks } from "../../src/runtime/types.ts"
import { Solidifier } from "../../src/jit-boost/solidifier.ts"
import type { BoostCandidate } from "../../src/jit-boost/types.ts"
import { createHash } from "node:crypto"

let workDir: string
beforeEach(async () => { workDir = await mkdtemp(path.join(tmpdir(), "skvm-subworkflow-")) })
afterEach(async () => { await rm(workDir, { recursive: true, force: true }) })

function answer(text = "Finished remaining task"): LLMResponse {
  return { text, toolCalls: [], tokens: { input: 12, output: 4, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "end_turn" }
}

test("local subworkflow results reach the real continuation, trace and run observation", async () => {
  let seen: CompletionParams | undefined
  const provider: LLMProvider = {
    name: "continuation-observer",
    async complete(params) { seen = structuredClone(params); return answer() },
    async completeWithToolResults() { throw new Error("no model tool calls in this case") },
  }
  const hooks: RuntimeHooks = { beforeLLM: [async (ctx) => {
    expect(ctx.iteration).toBe(1)
    return {
      action: "continue", toolResults: [{ id: "local-1", name: "execute_command", input: { argv: ["local"] }, output: "prepared 3 rows", exitCode: 0, durationMs: 2 }],
      checkpoint: { workflowId: "prepare", status: "completed", completed: [{ stepId: "rows", outputs: ["rows.json"] }], remainingSteps: [], remainingTask: "Explain the three rows" },
    }
  }] }
  const adapter = new BareAgentAdapter(() => provider, hooks)
  await adapter.setup({ model: "test", maxSteps: 3, timeoutMs: 2000 })
  const traceFile = path.join(workDir, "runtime.jsonl")
  const result = await adapter.run({ prompt: "Prepare and explain rows", workDir, runtimeTrace: new DurableRuntimeTrace(traceFile) })
  expect(JSON.stringify(seen?.messages)).toContain("Explain the three rows")
  expect(JSON.stringify(seen?.messages)).toContain("prepared 3 rows")
  expect(result.text).toBe("Finished remaining task")
  expect(result.steps.filter(s => s.role === "tool").flatMap(s => s.toolCalls).map(t => t.id)).toContain("local-1")
  expect(result.executionObservation?.activity).toMatchObject({ providerResponses: 1, assistantMessages: 1, toolResults: 1 })
  const events = (await Bun.file(traceFile).text()).trim().split(/\r?\n/).map(line => JSON.parse(line))
  expect(events.filter(e => e.event === "subworkflow-checkpoint")).toHaveLength(1)
  expect(events.filter(e => e.event === "provider-request-start")).toHaveLength(1)
})

function candidate(badSecond: boolean): BoostCandidate {
  return {
    purposeId: "prepare-rows", keywords: ["rows"], codeSignature: "prepare", functionTemplate: "echo legacy-placeholder", params: {}, materializationType: "shell",
    subworkflow: {
      remainingTask: "Write report.txt using rows.json and summary.json; fix summary if necessary",
      bindings: [],
      steps: [
        { id: "prepare", argv: [process.execPath, "-e", "const fs=require('fs');fs.appendFileSync('count.txt','1');fs.writeFileSync('rows.json',JSON.stringify({rows:[1,2,3]}))"], outputs: [{ path: "rows.json", format: "json", requiredKeys: ["rows"] }, { path: "count.txt", format: "text" }] },
        { id: "summarize", argv: [process.execPath, "-e", `require('fs').writeFileSync('summary.json',${JSON.stringify(badSecond ? "{}" : '{"sum":6}')})`], outputs: [{ path: "summary.json", format: "json", requiredKeys: ["sum"] }] },
      ],
    },
  } as BoostCandidate
}

function activeSolidifier(c: BoostCandidate) {
  const solidifier = new Solidifier([c])
  solidifier.getEntries()[0]!.state.promoted = true
  return solidifier
}

test.each([false, true])("checked prefix is retained and model completes remaining files (invalid=%s)", async (badSecond) => {
  const solidifier = activeSolidifier(candidate(badSecond))
  let calls = 0
  const provider: LLMProvider = {
    name: "repair-observer",
    async complete(params) {
      calls++
      const checkpoint = JSON.stringify(params.messages)
      expect(checkpoint).toContain(badSecond ? 'recover' : 'completed')
      expect(checkpoint).toContain("rows.json")
      expect(await Bun.file(path.join(workDir, "count.txt")).text()).toBe("1")
      expect(await Bun.file(path.join(workDir, "summary.json")).exists()).toBe(!badSecond)
      if (badSecond) expect(checkpoint).toContain("missing required key: sum")
      return { ...answer(), stopReason: "tool_use", toolCalls: [
        ...(badSecond ? [{ id: "repair", name: "write_file", arguments: { path: "summary.json", content: '{"sum":6}' } }] : []),
        { id: "finish", name: "write_file", arguments: { path: "report.txt", content: "Three rows, sum=6" } },
      ] }
    },
    async completeWithToolResults(_params, results) { calls++; expect(results.length).toBe(badSecond ? 2 : 1); return answer() },
  }
  const adapter = new BareAgentAdapter(() => provider, { beforeLLM: [solidifier.createBeforeLLMHook()] })
  await adapter.setup({ model: "test", maxSteps: 4, timeoutMs: 5000 })
  const result = await adapter.run({ prompt: "Prepare rows and write report", workDir })
  expect(result.runStatus).toBe("ok")
  expect(calls).toBe(2)
  expect(await Bun.file(path.join(workDir, "report.txt")).text()).toBe("Three rows, sum=6")
  expect(await Bun.file(path.join(workDir, "count.txt")).text()).toBe("1")
  expect(solidifier.getEntries()[0]!.state.fallbackCount).toBe(badSecond ? 1 : 0)
})

test("mid-task handoff keeps the last model exchange exactly once and in order", async () => {
  const turns: number[] = []
  let modelCalls = 0
  const provider: LLMProvider = {
    name: "mid-task-observer",
    async complete(params) {
      modelCalls++
      if (modelCalls === 1) return { ...answer("create source"), stopReason: "tool_use", toolCalls: [{ id: "source", name: "write_file", arguments: { path: "source.txt", content: "input" } }] }
      const content = params.messages.map(m => m.content).join("\n")
      expect(content.indexOf("[Called:")).toBeLessThan(content.indexOf("[Validated subworkflow"))
      expect(content.split("[Tool result source]")).toHaveLength(2)
      return answer()
    },
    async completeWithToolResults() { throw new Error("latest exchange must precede host checkpoint") },
  }
  const adapter = new BareAgentAdapter(() => provider, { beforeLLM: [async ctx => {
    turns.push(ctx.iteration)
    if (ctx.iteration !== 2) return { action: "passthrough" }
    expect(ctx.previousToolCalls.map(t => t.id)).toEqual(["source"])
    return { action: "continue", toolResults: [], checkpoint: { workflowId: "middle", status: "completed", completed: [], remainingSteps: [], remainingTask: "Finish report" } }
  }] })
  await adapter.setup({ model: "test", maxSteps: 3, timeoutMs: 2000 })
  expect((await adapter.run({ prompt: "prepare then finish", workDir })).runStatus).toBe("ok")
  expect(turns).toEqual([1, 2])
  expect(modelCalls).toBe(2)
})

test("expired local work does not dispatch another model request", async () => {
  let calls = 0
  const provider: LLMProvider = { name: "deadline-observer", async complete() { calls++; return answer() }, async completeWithToolResults() { calls++; return answer() } }
  const adapter = new BareAgentAdapter(() => provider, { beforeLLM: [async () => {
    await Bun.sleep(40)
    return { action: "continue", toolResults: [], checkpoint: { workflowId: "slow", status: "recover", completed: [], remainingSteps: ["unfinished"], remainingTask: "finish" } }
  }] })
  await adapter.setup({ model: "test", maxSteps: 3, timeoutMs: 10 })
  expect((await adapter.run({ prompt: "slow local operation", workDir })).runStatus).toBe("timeout")
  expect(calls).toBe(0)
})

test("recovery provider failure remains a task failure with the valid prefix preserved", async () => {
  const provider: LLMProvider = { name: "failed-recovery", async complete() { throw new Error("recovery unavailable") }, async completeWithToolResults() { throw new Error("unused") } }
  const adapter = new BareAgentAdapter(() => provider, { beforeLLM: [activeSolidifier(candidate(true)).createBeforeLLMHook()] })
  await adapter.setup({ model: "test", maxSteps: 3, timeoutMs: 5000 })
  const result = await adapter.run({ prompt: "rows", workDir })
  expect(result.runStatus).toBe("adapter-crashed")
  expect(result.executionObservation?.terminal?.present).toBe(false)
  expect(result.executionObservation?.activity.requestDispatched).toBe(true)
  expect(await Bun.file(path.join(workDir, "count.txt")).text()).toBe("1")
  expect(await Bun.file(path.join(workDir, "summary.json")).exists()).toBe(false)
})

test("stale dependency skips execution and passes a named reason to the agent", async () => {
  await Bun.write(path.join(workDir, "input.txt"), "new")
  const c = candidate(false)
  c.subworkflow!.bindings = [{ path: "input.txt", sha256: createHash("sha256").update("old").digest("hex") }]
  const hook = activeSolidifier(c).createBeforeLLMHook()
  const result = await hook({ prompt: "rows", iteration: 1, workDir, previousToolCalls: [] })
  expect(result.action).toBe("continue")
  if (result.action !== "continue") throw new Error("missing stale checkpoint")
  expect(result.checkpoint.status).toBe("stale")
  expect(result.checkpoint.failed?.diagnostic).toContain("dependency changed: input.txt")
  expect(result.toolResults).toHaveLength(0)
  expect(await Bun.file(path.join(workDir, "count.txt")).exists()).toBe(false)
})

test("a missing workspace produces a named checkpoint instead of silent passthrough", async () => {
  const result = await activeSolidifier(candidate(false)).createBeforeLLMHook()({ prompt: "rows", iteration: 1, workDir: path.join(workDir, "missing"), previousToolCalls: [] })
  expect(result.action).toBe("continue")
  if (result.action !== "continue") throw new Error("missing failure checkpoint")
  expect(result.checkpoint.status).toBe("stale")
  expect(result.checkpoint.failed?.diagnostic).toContain("workspace unavailable")
  expect(result.toolResults).toHaveLength(0)
})

test("whole-task replacement after model work retains both sets of tool receipts", async () => {
  let calls = 0
  const provider: LLMProvider = {
    name: "legacy-replace-observer",
    async complete() { calls++; return { ...answer(), stopReason: "tool_use", toolCalls: [{ id: "initial", name: "write_file", arguments: { path: "before.txt", content: "done" } }] } },
    async completeWithToolResults() { throw new Error("replace should skip the next model call") },
  }
  const adapter = new BareAgentAdapter(() => provider, { beforeLLM: [async ctx => ctx.iteration === 1 ? { action: "passthrough" } : { action: "replace", text: "all done", toolResults: [{ id: "local-final", name: "execute_command", input: {}, output: "done", exitCode: 0 }] }] })
  await adapter.setup({ model: "test", maxSteps: 3, timeoutMs: 2000 })
  const result = await adapter.run({ prompt: "finish", workDir })
  expect(result.text).toBe("all done")
  expect(calls).toBe(1)
  expect(result.steps.flatMap(s => s.role === "tool" ? s.toolCalls : []).map(t => t.id)).toEqual(["initial", "local-final"])
  expect(result.executionObservation?.activity).toMatchObject({ providerResponses: 1, toolResults: 2 })
})

test("failed step restores an overwritten prefix artifact and stops dependent steps", async () => {
  const c = candidate(false)
  c.subworkflow!.steps[1] = { id: "break", argv: [process.execPath, "-e", "require('fs').writeFileSync('rows.json','bad');process.exit(7)"], outputs: [{ path: "rows.json", format: "json", requiredKeys: ["rows"] }] }
  c.subworkflow!.steps.push({ id: "dependent", argv: [process.execPath, "-e", "require('fs').writeFileSync('should-not-exist.txt','bad')"], outputs: [{ path: "should-not-exist.txt", format: "text" }] })
  const result = await activeSolidifier(c).createBeforeLLMHook()({ prompt: "rows", iteration: 1, workDir, previousToolCalls: [] })
  expect(result.action).toBe("continue")
  if (result.action !== "continue") throw new Error("missing recovery")
  expect(result.checkpoint.completed.map(s => s.stepId)).toEqual(["prepare"])
  expect(result.checkpoint.remainingSteps).toEqual(["break", "dependent"])
  expect(result.checkpoint.failed?.invalidatedOutputs).toEqual(["should-not-exist.txt"])
  expect(result.toolResults.at(-1)?.exitCode).toBe(7)
  expect(await Bun.file(path.join(workDir, "rows.json")).json()).toEqual({ rows: [1, 2, 3] })
  expect(await Bun.file(path.join(workDir, "should-not-exist.txt")).exists()).toBe(false)
})
