import { test, expect } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { BareAgentAdapter } from "./bare-agent.ts"
import { emptyTokenUsage } from "../core/types.ts"
import type { LLMProvider } from "../providers/types.ts"
test("ordinary bare-agent injects whole skill and uses real restricted continuation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ao-bare-")); await mkdir(path.join(root, "source"))
  await writeFile(path.join(root, "source/entry.ts"), "export function entry() { return false; }\n")
  const input = path.join(root, "input.json")
  await writeFile(input, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "x", repository: "synthetic", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], brief: "Can anyone call entry?" }))
  let calls = 0
  const response = (text: string, toolCalls: any[] = []) => ({ text, toolCalls, tokens: emptyTokenUsage(), durationMs: 0, stopReason: toolCalls.length ? "tool_use" as const : "end_turn" as const })
  const provider: LLMProvider = { name: "mock", complete: async p => { calls++; expect(p.system).toContain("FULL_ORIGINAL_TAIL"); expect(p.tools?.map(t => t.name)).not.toContain("execute_command"); return response("", [{ id: "r", name: "source_read", arguments: { path: "entry.ts", startLine: 1, endLine: 1 } }]) }, completeWithToolResults: async (_p, results) => { calls++; expect(results[0]!.content).toContain("return false"); return response("Entry denies; original source only.") } }
  const adapter = new BareAgentAdapter(() => provider)
  await adapter.setup({ model: "mock/model", maxSteps: 12, timeoutMs: 10000, providerOptions: { authorizationScope: input } })
  const run = await adapter.run({ prompt: "Can anyone call entry?", workDir: root, skill: { content: "Read source. FULL_ORIGINAL_TAIL", meta: { name: "original", description: "Original skill" }, mode: "inject" } })
  expect(run.runStatus).toBe("ok")
  expect(calls).toBe(2)
  expect(run.authorizationInquiry?.telemetry).toBeDefined()
})

test("adapter rejects illegal strategy before provider creation and passes the shared domain runtime into ordinary use", async () => {
  let providers = 0
  const adapter = new BareAgentAdapter(() => { providers++; throw new Error("No provider expected") })
  for (const authorizationStrategy of ["domain-evidence-v1", "guided-evidence-v2"]) await expect(adapter.setup({ model: "mock/test", maxSteps: 12, timeoutMs: 10000, providerOptions: { authorizationScope: "input.json", authorizationStrategy } })).rejects.toThrow("domain-tools")
  expect(providers).toBe(0)
})
