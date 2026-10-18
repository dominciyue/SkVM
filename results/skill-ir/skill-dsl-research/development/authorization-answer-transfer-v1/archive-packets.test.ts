import { test, expect } from "bun:test"
import { parseArchivedPacket } from "./archive-packets.ts"

test("archive decoding preserves ordinary packets and only repairs named redaction escapes", () => {
  expect(parseArchivedPacket('{"toolResult":{"content":"plain"}}')).toEqual({ packet: { toolResult: { content: "plain" } }, repairedEscapes: 0 })
  const archived = String.raw`{"toolResult":{"content":"source\[redacted-email]"},"currentContext":{"remainingDuties":[]}}`
  const decoded = parseArchivedPacket(archived)
  expect(decoded.repairedEscapes).toBe(1)
  expect(decoded.packet.toolResult.content).toBe(String.raw`source\[redacted-email]`)
  expect(decoded.packet.currentContext.remainingDuties).toEqual([])
  expect(() => parseArchivedPacket(String.raw`{"content":"bad\q"}`)).toThrow()
  expect(() => parseArchivedPacket('{"execution":')).toThrow()
})
