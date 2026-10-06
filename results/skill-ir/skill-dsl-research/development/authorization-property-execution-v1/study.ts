import { createHash, randomBytes } from "node:crypto"
import { readFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { runCodexAccountSession } from "../../../../../src/adapters/codex-account-session.ts"

const root = import.meta.dir
type Position = { id: string; stage: string; kind: string; order: number; status: string; attempts: string[] }
type Manifest = { schemaVersion: string; positions: Position[]; limits: { smokeTimeoutMs: number }; [key: string]: unknown }
async function write(file: string, value: unknown) { await Bun.write(file, JSON.stringify(value, null, 2) + "\n") }
export async function smoke(revision?: "bounded-code-mode") {
  const manifest = await Bun.file(path.join(root, "manifest.json")).json() as Manifest
  const position = manifest.positions.find(p => p.id === "account-anonymous-tool-smoke")!
  if ((!revision && position.attempts.length) || (revision && (position.attempts.length !== 1 || position.attempts[0] !== "account-anonymous-tool-smoke/original"))) throw new Error("Only the original and one named smoke revision are permitted.")
  const id = "account-anonymous-tool-smoke/" + (revision ?? "original"), out = path.join(root, "attempts", id)
  await mkdir(out, { recursive: true })
  const rulePath = "C:/Users/14182/.codex/AGENTS.md"
  // The main developer read this generic, user-supplied policy before admission.
  const sha256 = createHash("sha256").update(await readFile(rulePath)).digest("hex")
  const key = randomBytes(12).toString("hex"), answer = "lookup-" + randomBytes(24).toString("hex")
  const lookup = new Map([[key, answer]]), calls: unknown[] = []
  await write(path.join(root, "account-boundary.json"), { schemaVersion: "codex-account-boundary/v1", instructionSources: [{ path: rulePath, sha256 }], review: "Main AI verified current user-supplied generic agent/tool policy only; no task answers, evaluator or development logs. Identical across experiment arms." })
  await write(path.join(out, "claim.json"), { id, kind: revision ? "revision" : "first", ...(revision ? { parent: position.attempts[0], change: "Enable bounded official Code Mode host, restore typed dynamic specs and verify shared callback/config boundaries." } : {}), model: "gpt-5.6-sol", effort: "high", startedAt: new Date().toISOString(), expectedAnswerLocation: "host-only lookup table", timeoutMs: manifest.limits.smokeTimeoutMs, targetExecutions: 0 })
  position.status = "running"; position.attempts.push(id)
  await write(path.join(root, "manifest.json"), manifest)
  const result = await runCodexAccountSession({ model: "gpt-5.6-sol", effort: "high", cwd: root,
    instructionSources: [{ path: rulePath, sha256 }], timeoutMs: manifest.limits.smokeTimeoutMs,
    system: "This is a bounded anonymous lookup. Use the supplied dynamic tool to retrieve the value. Do not use native execution, files, network or agents. Return the retrieved value verbatim as the final answer.",
    prompt: "Call anonymous_lookup with key " + key + ". The answer exists only in the host lookup table.",
    tools: [{ name: "anonymous_lookup", description: "Retrieve one value from the host's anonymous table.", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false } }],
    execute: async call => { calls.push(call); const args = call.arguments as { key?: unknown }; return { output: JSON.stringify({ value: typeof args.key === "string" ? lookup.get(args.key) ?? null : null }), exitCode: 0, durationMs: 0 } } })
  await write(path.join(out, "account.json"), result)
  const consumed = result.status === "completed" && calls.length > 0 && result.text.trim() === answer
  await write(path.join(out, "evaluation.json"), { status: result.status, hostToolCalls: calls.length, toolConsumed: consumed,
    key, answer, finalExact: result.text.trim() === answer, targetExecutions: 0, actualUsd: null, providerRequests: null })
  position.status = consumed ? "completed" : "failed"
  await write(path.join(root, "manifest.json"), manifest)
  console.log(JSON.stringify({ status: result.status, reason: result.reason, hostToolCalls: calls.length, finalExact: result.text.trim() === answer, usage: result.usage, capability: result.capability?.status }))
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "smoke") await smoke()
  else if (command === "smoke-bounded-code-mode") await smoke("bounded-code-mode")
  else throw new Error("Supported current study command: smoke")
}
