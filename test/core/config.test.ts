import { test, expect, describe } from "bun:test"
import os from "node:os"
import path from "node:path"
import { expandHome, getRuntimeLogDir, safeModelName } from "../../src/core/config.ts"

// The routing-prefix convention (resolveBackendModel / routeProviderName) is
// the provider registry's knowledge — tests live in test/providers/registry.test.ts.

describe("expandHome", () => {
  test("uses the operating-system home when HOME is absent", () => {
    expect(process.env.HOME).toBeUndefined()
    expect(expandHome("~/.skvm")).toBe(path.join(os.homedir(), ".skvm"))
  })
})

describe("safeModelName", () => {
  test("slugifies the full CLI id; distinct providers get distinct slugs", () => {
    // Separation is deliberate — `openai/gpt-4o` and `ipads/gpt-4o` route
    // through different endpoints with potentially different behavior, so
    // their cached artifacts should not collide.
    expect(safeModelName("openai/gpt-4o")).toBe("openai--gpt-4o")
    expect(safeModelName("ipads/gpt-4o")).toBe("ipads--gpt-4o")
    expect(safeModelName("openrouter/anthropic/claude-opus-4.6"))
      .toBe("openrouter--anthropic--claude-opus-4.6")
    expect(safeModelName("anthropic/claude-sonnet-4.6"))
      .toBe("anthropic--claude-sonnet-4.6")
  })

  test("replaces / with -- and : with _", () => {
    expect(safeModelName("openrouter/meta/llama-3.1:free"))
      .toBe("openrouter--meta--llama-3.1_free")
  })

  test("rejects empty / dot-segment ids", () => {
    expect(() => safeModelName("")).toThrow()
    expect(() => safeModelName("..")).toThrow()
  })
})

describe("getRuntimeLogDir", () => {
  test("uses a bounded stable task segment without allowing path traversal", () => {
    const first = path.basename(getRuntimeLogDir(
      "bare-agent",
      "xty/gpt-5.6-sol",
      `../${"same-prefix-".repeat(8)}alpha`,
    ))
    const second = path.basename(getRuntimeLogDir(
      "bare-agent",
      "xty/gpt-5.6-sol",
      `../${"same-prefix-".repeat(8)}beta`,
    ))

    expect(first.length).toBeLessThanOrEqual(32)
    expect(second.length).toBeLessThanOrEqual(32)
    expect(first).not.toBe(second)
    expect(first).not.toContain("..")
    expect(first).toMatch(/-[a-f0-9]{8}$/)
  })
})
