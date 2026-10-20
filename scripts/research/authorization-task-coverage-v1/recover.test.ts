import { test, expect } from "bun:test"
import { recoverEmptyTurn } from "./recover.ts"
test("empty interrupted turn preserves identity and debits elapsed budget", () => {
  const events = [
    { method: "skvm/account/identity", lifecycle: { threadId: "t", turnId: "u", toolsSha256: "sha", persistence: "confirmed" } },
    { direction: "client", method: "turn/start", params: { input: [{ text: "prompt" }] } }
  ]
  const result = recoverEmptyTurn(events, { status: "terminal-found", terminalStatus: "interrupted", threadId: "t", turnId: "u" }, 100, 1100)
  expect(result.account.lifecycle).toMatchObject({ threadId: "t", turnId: "u", localExecution: "closed", providerTerminalObserved: true })
  expect(result.remainingMs).toBe(2699000)
  expect(result.account.usage).toBeNull()
  expect(() => recoverEmptyTurn([...events, { method: "item/tool/call" }], { status: "terminal-found", terminalStatus: "interrupted", threadId: "t", turnId: "u" }, 100, 1100)).toThrow()
  expect(() => recoverEmptyTurn(events, { status: "nonterminal", threadId: "t", turnId: "u" }, 100, 1100)).toThrow()
})
