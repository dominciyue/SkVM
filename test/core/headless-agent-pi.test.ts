import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test"
import path from "node:path"
import { mkdtempSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"

// ---------------------------------------------------------------------------
// Mock @mariozechner/pi-coding-agent at the package level. The stubs below
// record what skvm passes them so the test can assert wiring is correct.
// ---------------------------------------------------------------------------

let lastCreateOpts: any = null
let lastSubscribe: ((e: any) => void) | null = null
let lastPromptText: string | null = null
let promptDelayMs = 0
let abortCalled = false
let promptShouldError = false
let promptThrowsAfterEvents = false
let promptFileEdit: ((cwd: string) => Promise<void>) | undefined
// Captures the raw models.json string that pi-driver wrote to disk, read at
// ModelRegistry.create() time (the driver writes models.json just before
// calling create). null means no file was written (or create was not called).
let capturedModelsJson: string | null = null

// Set of "provider/modelId" keys that ModelRegistry.inMemory().find() treats
// as built-in (catalogued). Tests populate this to exercise the probe branch.
const catalogued = new Set<string>()

mock.module("@mariozechner/pi-coding-agent", () => {
  return {
    createAgentSession: async (opts: any) => {
      lastCreateOpts = opts
      return {
        session: {
          subscribe: (listener: (e: any) => void) => {
            lastSubscribe = listener
            return () => { /* unsubscribe */ }
          },
          prompt: async (text: string) => {
            lastPromptText = text
            await promptFileEdit?.(opts.cwd)
            if (promptDelayMs > 0) {
              await new Promise(r => setTimeout(r, promptDelayMs))
            }
            // Emit a synthetic agent_end so piEventsToRunRecord has data.
            if (promptShouldError) {
              lastSubscribe?.({
                type: "agent_end",
                messages: [{
                  role: "assistant",
                  content: [{ type: "text", text: "" }],
                  api: "openai", provider: "openai", model: "gpt-4o-mini",
                  usage: {
                    input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
                    totalTokens: 0,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                  },
                  stopReason: "error",
                  errorMessage: "fake provider 5xx",
                  timestamp: Date.now(),
                }],
              })
            } else {
              lastSubscribe?.({
                type: "agent_end",
                messages: [{
                  role: "assistant",
                  content: [{ type: "text", text: "done" }],
                  api: "openai", provider: "openai", model: "gpt-4o-mini",
                  usage: {
                    input: 10, output: 20, cacheRead: 0, cacheWrite: 0,
                    totalTokens: 30,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.0042 },
                  },
                  stopReason: "stop",
                  timestamp: Date.now(),
                }],
              })
            }
            if (promptThrowsAfterEvents) throw new Error("transport interrupted after response")
          },
          abort: async () => { abortCalled = true },
          dispose: () => { /* noop */ },
        },
      }
    },
    AuthStorage: {
      inMemory: () => ({
        _kv: new Map<string, string>(),
        setRuntimeApiKey(provider: string, key: string) { this._kv.set(provider, key) },
      }),
    },
    ModelRegistry: {
      // Probe registry (builtins-only). Determines the branch taken in pi-driver.
      inMemory: (_auth: any) => ({
        find: (provider: string, modelId: string) => {
          if (modelId.includes("nonexistent")) return undefined
          if (catalogued.has(`${provider}/${modelId}`)) return { provider, id: modelId, reasoning: false } as any
          return undefined
        },
      }),
      // Real registry (after models.json written). Resolves all ids except "nonexistent".
      // Also captures the models.json content so tests can assert which branch was taken.
      create: (_auth: any, modelsPath: string) => {
        try { capturedModelsJson = readFileSync(modelsPath, "utf8") } catch { capturedModelsJson = null }
        return {
          find: (provider: string, modelId: string) => {
            if (modelId.includes("nonexistent")) return undefined
            return { provider, id: modelId, reasoning: false } as any
          },
        }
      },
    },
    SessionManager: { inMemory: (_cwd: string) => ({ /* opaque */ }) },
    SettingsManager: { create: (_cwd: string, _agentDir: string) => ({ /* opaque */ }) },
    DefaultResourceLoader: class { constructor(_opts: any) {} async reload() {} },
    readTool: { name: "read" },
    bashTool: { name: "bash" },
    editTool: { name: "edit" },
    writeTool: { name: "write" },
    grepTool: { name: "grep" },
    findTool: { name: "find" },
    lsTool: { name: "ls" },
  }
})

// Import-under-test must come AFTER mock.module setup.
import { runHeadlessAgent } from "../../src/core/headless-agent/index.ts"
import { invalidateConfigCache } from "../../src/core/config.ts"
import { runOptimizer } from "../../src/jit-optimize/optimizer.ts"

const SKVM_CACHE = process.env.SKVM_CACHE!
const CONFIG_PATH = path.join(SKVM_CACHE, "skvm.config.json")

beforeAll(async () => {
  invalidateConfigCache()
  await Bun.write(CONFIG_PATH, JSON.stringify({
    providers: {
      routes: [
        { match: "anthropic/*", kind: "anthropic", apiKey: "sk-test-key" },
        { match: "ipads/*", kind: "openai-compatible", baseUrl: "http://localhost:9/v1", apiKey: "x" },
      ],
    },
    headlessAgent: { driver: "pi" },
  }))
})

afterAll(() => {
  try { rmSync(CONFIG_PATH, { force: true }) } catch {}
  invalidateConfigCache()
})

beforeEach(() => {
  lastCreateOpts = null
  lastSubscribe = null
  lastPromptText = null
  promptDelayMs = 0
  abortCalled = false
  promptShouldError = false
  promptThrowsAfterEvents = false
  promptFileEdit = undefined
  capturedModelsJson = null
  catalogued.clear()
})

describe("runHeadlessAgent (driver=pi, library mode)", () => {
  test("wires model, apiKey, cwd, tools, prompt correctly", async () => {
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-driver-test-"))
    try {
      const result = await runHeadlessAgent({
        cwd: workDir,
        prompt: "say hi",
        model: "anthropic/claude-sonnet-4.6",
        timeoutMs: 5000,
      })

      // Result shape
      expect(result.driver).toBe("pi")
      expect(result.exitCode).toBe(0)
      expect(result.timedOut).toBe(false)
      expect(result.cost).toBeCloseTo(0.0042)
      expect(result.tokens.input).toBe(10)
      expect(result.tokens.output).toBe(20)

      // createAgentSession received expected wiring
      expect(lastCreateOpts.cwd).toBe(workDir)
      expect(lastCreateOpts.model.provider).toBe("anthropic")
      expect(lastCreateOpts.model.id).toBe("claude-sonnet-4.6")
      expect(Array.isArray(lastCreateOpts.tools)).toBe(true)
      expect(lastCreateOpts.tools.map((t: any) => t.name).sort())
        .toEqual(["bash", "edit", "find", "grep", "ls", "read", "write"])

      // Credentials injected into AuthStorage, not process.env
      const auth = lastCreateOpts.authStorage
      expect(auth._kv.get("anthropic")).toBe("sk-test-key")

      // Prompt got prefixed with the "no clarifying questions" preamble
      expect(lastPromptText).toContain("Do not ask clarifying questions")
      expect(lastPromptText).toContain("say hi")
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("throws HeadlessAgentError when model not registered", async () => {
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-driver-test-"))
    try {
      await expect(
        runHeadlessAgent({
          cwd: workDir, prompt: "x",
          model: "anthropic/nonexistent-model",
        })
      ).rejects.toThrow(/could not resolve model/)
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("aborts session on timeout and throws", async () => {
    promptDelayMs = 1000

    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-driver-test-"))
    try {
      await expect(
        runHeadlessAgent({
          cwd: workDir,
          prompt: "x",
          model: "anthropic/claude-sonnet-4.6",
          timeoutMs: 50,
        })
      ).rejects.toThrow(/timed out/)
      expect(abortCalled).toBe(true)
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("throws HeadlessAgentError when pi reports stopReason=error", async () => {
    promptShouldError = true
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-driver-test-"))
    try {
      await expect(
        runHeadlessAgent({
          cwd: workDir, prompt: "x",
          model: "anthropic/claude-sonnet-4.6",
          timeoutMs: 5000,
        })
      ).rejects.toThrow(/stopReason=error: fake provider 5xx/)
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("retains observed usage and events when a session throws after a response", async () => {
    promptThrowsAfterEvents = true
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-partial-test-"))
    try {
      const result = await runHeadlessAgent({
        cwd: workDir, prompt: "x", model: "anthropic/claude-sonnet-4.6", throwOnError: false,
      })
      expect(result.exitCode).toBe(1)
      expect(result.tokens.input).toBe(10)
      expect(result.tokens.output).toBe(20)
      expect(result.cost).toBeCloseTo(0.0042)
      expect(JSON.parse(result.rawStdout)).toHaveLength(1)
      expect(result.rawStderr).toContain("transport interrupted")
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("optimizer preserves timeout evidence before rejecting the candidate", async () => {
    promptDelayMs = 60
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-optimizer-timeout-test-"))
    const skillDir = path.join(workDir, "skill")
    const recordDir = path.join(workDir, "record")
    try {
      await Bun.write(path.join(skillDir, "SKILL.md"), "# Example\nTransform user inputs.\n")
      await expect(runOptimizer({ skillDir, evidences: [] }, {
        model: "anthropic/claude-sonnet-4.6", driver: "pi", timeoutMs: 10, recordDir,
      })).rejects.toThrow(/timed out/)
      expect(JSON.parse(await Bun.file(path.join(recordDir, "stdout.log")).text())).toHaveLength(1)
      const terminal = await Bun.file(path.join(recordDir, "run-result.json")).json()
      expect(terminal.exitCode).toBe(1)
      expect(terminal.timedOut).toBe(true)
      expect(terminal.tokens.input).toBe(10)
      expect(terminal.reportedCostUsd).toBeCloseTo(0.0042)
      expect(terminal.usageScope).toBe("observed-events-only")
      expect(await Bun.file(path.join(recordDir, "submission.json")).exists()).toBe(false)
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("optimizer retains candidate bytes before downstream rollback can remove them", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "skvm-candidate-record-"))
    const skillDir = path.join(root, "skill")
    const recordDir = path.join(root, "record")
    let workspace: string | undefined
    try {
      await Bun.write(path.join(skillDir, "SKILL.md"), "# Original\n")
      promptFileEdit = async (cwd) => {
        await Bun.write(path.join(cwd, "SKILL.md"), "# Revised\n")
        await Bun.write(path.join(cwd, "scripts/process.mjs"), "console.log('candidate')\n")
        await Bun.write(path.join(cwd, ".optimize/submission.json"), JSON.stringify({
          changedFiles: ["SKILL.md", "scripts/process.mjs"], changes: [], actions: [], noChanges: false,
        }))
      }
      const result = await runOptimizer({ skillDir, evidences: [] }, {
        model: "anthropic/claude-sonnet-4.6", driver: "pi", recordDir,
      })
      workspace = result.workspaceDir
      expect(await Bun.file(path.join(recordDir, "candidate/scripts/process.mjs")).text()).toBe("console.log('candidate')\n")
      expect(await Bun.file(path.join(recordDir, "candidate/SKILL.md")).text()).toBe("# Revised\n")
      expect(await Bun.file(path.join(recordDir, "candidate/.optimize/submission.json")).exists()).toBe(false)
    } finally {
      if (workspace) rmSync(workspace, { recursive: true, force: true })
      rmSync(root, { recursive: true, force: true })
    }
  })

  // -------------------------------------------------------------------------
  // Catalogue-probe branch coverage (Codex P1 regression fix)
  // These tests assert WHICH models.json branch was taken, not just that the
  // run succeeded. An inverted `isCatalogued` condition would cause both to fail.
  // -------------------------------------------------------------------------

  test("uncatalogued id → registers a custom model stub in models.json", async () => {
    // catalogued is empty (cleared in beforeEach) — claude-sonnet-4.6 is NOT
    // in the probe registry, so the driver must call renderPiModelRegistration
    // and write a models:[{id}] entry.
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-driver-test-"))
    try {
      const result = await runHeadlessAgent({
        cwd: workDir,
        prompt: "say hi",
        model: "anthropic/claude-sonnet-4.6",
        timeoutMs: 5000,
      })
      expect(result.driver).toBe("pi")
      expect(result.exitCode).toBe(0)

      // The driver must have written a models.json with a models array entry.
      expect(capturedModelsJson).not.toBeNull()
      const doc = JSON.parse(capturedModelsJson!)
      expect(doc.providers.anthropic.models).toEqual([{ id: "claude-sonnet-4.6" }])
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("catalogued id (non-openai-compatible) → no models.json written", async () => {
    // Mark claude-sonnet-4.6 as built-in. The anthropic route is NOT
    // openai-compatible, so renderPiBaseUrlOverride returns null → no file written.
    // An inverted branch would write a registration stub instead.
    catalogued.add("anthropic/claude-sonnet-4.6")
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-driver-test-"))
    try {
      const result = await runHeadlessAgent({
        cwd: workDir,
        prompt: "say hi",
        model: "anthropic/claude-sonnet-4.6",
        timeoutMs: 5000,
      })
      expect(result.driver).toBe("pi")
      expect(result.exitCode).toBe(0)

      // renderPiBaseUrlOverride returns null for non-openai-compatible routes,
      // so the driver must NOT write models.json at all.
      expect(capturedModelsJson).toBeNull()
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })

  test("catalogued id (openai-compatible) → baseUrl-only models.json, no models array", async () => {
    // ipads/gpt-5.5 is NOT in catalogued by default, so first mark it as built-in.
    catalogued.add("openai/gpt-5.5")
    const workDir = mkdtempSync(path.join(tmpdir(), "skvm-pi-driver-test-"))
    try {
      const result = await runHeadlessAgent({
        cwd: workDir,
        prompt: "say hi",
        model: "ipads/gpt-5.5",
        timeoutMs: 5000,
      })
      expect(result.driver).toBe("pi")
      expect(result.exitCode).toBe(0)

      // renderPiBaseUrlOverride for an openai-compatible route returns a baseUrl-only
      // doc — no models[] array, preserving the built-in model's metadata.
      expect(capturedModelsJson).not.toBeNull()
      const doc = JSON.parse(capturedModelsJson!)
      expect(doc.providers.openai.baseUrl).toBe("http://localhost:9/v1")
      expect(doc.providers.openai.models).toBeUndefined()
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })
})
