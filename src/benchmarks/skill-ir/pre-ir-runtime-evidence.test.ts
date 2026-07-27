import { describe, expect, test } from "bun:test"
import type { RawAgentRunRow } from "./scoring.ts"
import {
  hasBunRuntimeCrash,
  normalizePreIrRuntimeFailure,
} from "./pre-ir-runtime-evidence.ts"

function row(overrides: Partial<RawAgentRunRow> = {}): RawAgentRunRow {
  return {
    caseId: "experimental-design-v2:skvm:windows:clean:task",
    system: "no-skill",
    taskPath: "task.json",
    exitCode: 3,
    runStatus: "ok",
    durationMs: 1,
    stdout: "Run started",
    stderr: "Bun v1.3.14\npanic(main thread): Internal assertion failure\noh no: Bun has crashed.",
    successSource: "execution-only",
    ...overrides,
  }
}

describe("pre-IR runtime evidence normalization", () => {
  test("recognizes the frozen Bun panic signature", () => {
    expect(hasBunRuntimeCrash(row().stderr)).toBe(true)
    expect(hasBunRuntimeCrash("ordinary agent failure")).toBe(false)
  })

  test("projects a nonzero Bun panic to infrastructure without mutating raw evidence", () => {
    const raw = row()
    const normalized = normalizePreIrRuntimeFailure(raw)
    expect(normalized).toEqual({ ...raw, runStatus: "adapter-crashed" })
    expect(raw.runStatus).toBe("ok")
  })

  test("does not relabel successful or ordinary nonzero runs", () => {
    const successfulCrashText = row({ exitCode: 0 })
    const ordinaryFailure = row({ stderr: "agent command failed" })
    expect(normalizePreIrRuntimeFailure(successfulCrashText)).toBe(successfulCrashText)
    expect(normalizePreIrRuntimeFailure(ordinaryFailure)).toBe(ordinaryFailure)
  })
})
