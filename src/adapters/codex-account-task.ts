import { mkdir, open, writeFile } from "node:fs/promises"
import path from "node:path"
import type { AgentAdapter, AdapterConfig, AgentStep, RunResult, ToolCall } from "../core/types.ts"
import { emptyTokenUsage } from "../core/types.ts"
import type { RuntimeHooks, SubworkflowCheckpoint } from "../runtime/types.ts"
import { createToolExecutor, ORDINARY_AGENT_TOOLS } from "./bare-agent.ts"
import { loadCodexAccountBoundary, redactCodexEvent, runCodexAccountSession, type AccountTransport } from "./codex-account-session.ts"

/** Ordinary tasks use the same admitted account session and real tool receipts as inquiry. */
export async function runCodexAccountTask(task: Parameters<AgentAdapter["run"]>[0], config: AdapterConfig,
  hooks: RuntimeHooks = {}, transportFactory?: () => AccountTransport): Promise<RunResult> {
  const options = config.providerOptions ?? {}, started = performance.now()
  const timeoutMs = task.timeoutMs ?? config.timeoutMs ?? 120000
  const traceDir = typeof options.accountTraceDir === "string" ? path.resolve(options.accountTraceDir) : undefined
  if (traceDir) await mkdir(traceDir, { recursive: true })
  const journal = traceDir ? await open(path.join(traceDir, "account-events.jsonl"), "wx") : undefined
  const steps: AgentStep[] = [], receipts: ToolCall[] = [], checkpoints: SubworkflowCheckpoint[] = []
  let skillLoaded = false, toolNumber = 0
  let system = `Complete the user's task using the supplied tools. Tool paths and commands run in this working directory: ${task.workDir}. Read actual inputs and finish all requested outputs. Report failures truthfully.`
  system += `\nThe supplied write_file and execute_command tools are host callbacks authorized to write task outputs, independent of native CLI read-only permissions. You have ${config.maxSteps ?? 64} host tool calls; use their remaining-budget feedback to finish the task and deliver an answer.`
  if (task.skill?.mode === "discover") {
    const skillFile = path.join(task.workDir, "skills", task.skill.meta.name, "SKILL.md")
    await mkdir(path.dirname(skillFile), { recursive: true }); await writeFile(skillFile, task.skill.content)
    system += `\nAvailable skill: ${task.skill.meta.name}: ${task.skill.meta.description}. Read ${path.relative(task.workDir, skillFile)} with read_file when using it.`
  } else if (task.skill) { system += `\n<skill>\n${task.skill.content}\n</skill>`; skillLoaded = true }
  const executor = createToolExecutor(task.workDir)
  let toolQueue = Promise.resolve()
  try {
    const account = await runCodexAccountSession({
      purpose: task.taskId ?? "ordinary-task", attempt: "first", model: config.model, effort: "high",
      cwd: task.workDir, system, prompt: task.prompt, tools: ORDINARY_AGENT_TOOLS,
      maxToolCalls: config.maxSteps ?? 64, answerAfterToolBudget: true, timeoutMs, transportFactory,
      instructionSources: await loadCodexAccountBoundary(typeof options.accountBoundary === "string" ? options.accountBoundary : undefined),
      onEvent: async event => { if (journal) { await journal.write(JSON.stringify(event) + "\n"); await journal.sync() } },
      beforeTurn: async remainingMs => {
        for (const hook of hooks.beforeLLM ?? []) {
          const result = await hook({ prompt: task.prompt, workDir: task.workDir, iteration: 1, previousToolCalls: receipts, remainingMs })
          if (result.action === "passthrough") continue
          for (const call of result.toolResults) {
            receipts.push(call); steps.push({ role: "tool", toolCalls: [call], timestamp: Date.now() })
            for (const after of hooks.afterTool ?? []) await after({ toolCall: call, iteration: 1, workDir: task.workDir })
          }
          const context = result.action === "continue" ? result.checkpoint : { status: "local-template-result", text: result.text }
          if (result.action === "continue") { checkpoints.push(result.checkpoint); task.runtimeTrace?.subworkflowCheckpoint(1, result.checkpoint) }
          if (journal) { await journal.write(JSON.stringify(redactCodexEvent({ method: "skvm/task/checkpoint", context, tools: result.toolResults })) + "\n"); await journal.sync() }
          // Host work is explicit context, never a fabricated assistant/tool response.
          return `${task.prompt}\n\nHost local execution checkpoint: ${JSON.stringify(context)}\nTool receipts: ${JSON.stringify(result.toolResults)}\nContinue the original task from the retained state. Failed or unknown checks require repair; completed local checks cover only their declared scope.`
        }
        return task.prompt
      },
      execute: (call, lifetime) => {
        // Account requests may arrive concurrently. Serialize mutations and their evidence capture.
        const pending = toolQueue.then(async () => {
          if (lifetime && !lifetime.isActive()) return { output: "session-closed-before-tool-dispatch", exitCode: 1, durationMs: 0 }
          const iteration = ++toolNumber
          steps.push({ role: "assistant", toolCalls: [{ id: call.id, name: call.name, input: call.arguments }], timestamp: Date.now() })
          for (const before of hooks.beforeTool ?? []) await before({ toolCall: call, prompt: task.prompt, workDir: task.workDir, iteration })
          if (lifetime && !lifetime.isActive()) return { output: "session-closed-before-tool-dispatch", exitCode: 1, durationMs: 0 }
          task.runtimeTrace?.toolBatchStart(iteration, [call])
          const result = await executor(call)
          task.runtimeTrace?.toolBatchEnd(iteration, [call], result.durationMs)
          const receipt = { id: call.id, name: call.name, input: call.arguments, ...result }
          receipts.push(receipt); steps.push({ role: "tool", toolCalls: [receipt], timestamp: Date.now() })
          for (const after of hooks.afterTool ?? []) await after({ toolCall: receipt, workDir: task.workDir, iteration })
          if (task.skill?.mode === "discover" && call.name === "read_file" && result.exitCode === 0 && path.resolve(task.workDir, String(call.arguments.path)) === path.join(task.workDir, "skills", task.skill.meta.name, "SKILL.md")) skillLoaded = true
          return result
        })
        toolQueue = pending.then(() => {}, () => {})
        return pending
      },
    })
    if (account.text) steps.push({ role: "assistant", text: account.text, toolCalls: [], timestamp: Date.now() })
    const runStatus = account.status === "completed" ? "ok" : account.status === "timeout-unknown" ? "timeout" : account.status === "undelivered" ? "parse-failed" : "adapter-crashed"
    const result: RunResult = {
      text: account.text, steps, tokens: account.usage ?? emptyTokenUsage(), cost: 0, usageAvailable: false,
      durationMs: performance.now() - started, llmDurationMs: 0, workDir: task.workDir, skillLoaded, runStatus,
      statusDetail: account.reason ?? account.status,
      accountSession: { ...account, checkpoints, ...(traceDir ? { traceDir } : {}), hookBoundary: "before-account-turn; before/after-each-host-tool", modelCallCount: null },
      ...(runStatus === "ok" ? {} : { adapterError: { exitCode: 1, stderr: account.reason ?? account.status } }),
    }
    if (traceDir) await writeFile(path.join(traceDir, "run-result.json"), JSON.stringify(redactCodexEvent(result), null, 2) + "\n", { flag: "wx" })
    task.runtimeTrace?.turnEnd(1)
    task.runtimeTrace?.finalize(1, runStatus === "ok" ? "completed" : runStatus === "timeout" ? "timeout" : "handled-error")
    for (const hook of hooks.afterRun ?? []) await hook({ result, success: runStatus === "ok" })
    return result
  } finally { await journal?.close() }
}
