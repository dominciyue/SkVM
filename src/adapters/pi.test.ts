import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { runSubprocess } from "../core/subprocess.ts"
import {
  resolveInstalledPiPackageCommand,
  resolvePiOnPath,
  selectManagedPiModelsJson,
  withPiInjectedAgentsFile,
} from "./pi.ts"

const tempDirs: string[] = []

afterAll(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true })
})

describe("Pi adapter command resolution", () => {
  test("registers uncatalogued openai-compatible models on the completions API", () => {
    const route = {
      match: "xty/*",
      kind: "openai-compatible" as const,
      apiKeyEnv: "SKVM_XTY_API_KEY",
      baseUrl: "https://svip.xty.app/v1",
    }
    expect(JSON.parse(selectManagedPiModelsJson(route, "deepseek-v4-pro", false)!)).toEqual({
      providers: {
        openai: {
          baseUrl: "https://svip.xty.app/v1",
          models: [{ id: "deepseek-v4-pro", api: "openai-completions" }],
        },
      },
    })
    expect(JSON.parse(selectManagedPiModelsJson(route, "gpt-5.4", true)!)).toEqual({
      providers: { openai: { baseUrl: "https://svip.xty.app/v1" } },
    })
  })

  test("uses Bun's cross-platform PATH resolver without spawning Unix which", () => {
    const calls: string[] = []
    const resolved = resolvePiOnPath((name) => {
      calls.push(name)
      return "C:\\workspace\\node_modules\\.bin\\pi.exe"
    })
    expect(calls).toEqual(["pi"])
    expect(resolved).toEqual(["C:\\workspace\\node_modules\\.bin\\pi.exe"])
  })

  test("returns null when Pi is absent from PATH", () => {
    expect(resolvePiOnPath(() => null)).toBeNull()
  })

  test("runs the installed Pi package through Node from a non-ASCII cwd", async () => {
    const packageDir = path.resolve(rootDir, "node_modules/@mariozechner/pi-coding-agent")
    const node = Bun.which("node")
    expect(node).toBeTruthy()
    const command = await resolveInstalledPiPackageCommand({
      packageDir,
      which: (name) => name === "node" ? node : null,
    })
    expect(command).toEqual([node!, path.join(packageDir, "dist/cli.js")])
    expect(command?.some((part) => part.includes(`${path.sep}.bin${path.sep}`))).toBe(false)

    const workDir = await mkdtemp(path.join(tmpdir(), "skvm-pi-中文-"))
    tempDirs.push(workDir)
    const result = await runSubprocess([...command!, "--version"], { cwd: workDir, timeoutMs: 30000 })
    expect(result).toMatchObject({ exitCode: 0, timedOut: false })
    const streams = [result.stdout.trim(), result.stderr.trim()].filter(Boolean)
    expect(streams).toEqual(["0.67.68"])
  })

  test("does not select the installed package tier without both Node and the CLI", async () => {
    expect(await resolveInstalledPiPackageCommand({
      packageDir: path.join(tmpdir(), "missing-pi-package"),
      which: () => "C:\\Program Files\\nodejs\\node.exe",
    })).toBeNull()
    expect(await resolveInstalledPiPackageCommand({
      packageDir: path.resolve(rootDir, "node_modules/@mariozechner/pi-coding-agent"),
      which: () => null,
    })).toBeNull()
  })

  test("removes a harness-owned AGENTS.md after the Pi subprocess", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "skvm-pi-agents-"))
    tempDirs.push(workDir)
    await withPiInjectedAgentsFile(workDir, "temporary skill\n", async () => {
      expect(await readFile(path.join(workDir, "AGENTS.md"), "utf8")).toBe("temporary skill\n")
    })
    expect(await Bun.file(path.join(workDir, "AGENTS.md")).exists()).toBe(false)
  })

  test("restores a pre-existing AGENTS.md byte-for-byte after the Pi subprocess", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "skvm-pi-agents-existing-"))
    tempDirs.push(workDir)
    const agentsPath = path.join(workDir, "AGENTS.md")
    const original = new Uint8Array([0xef, 0xbb, 0xbf, 0x62, 0x61, 0x73, 0x65, 0x0d, 0x0a])
    await writeFile(agentsPath, original)
    await withPiInjectedAgentsFile(workDir, "temporary skill\n", async () => {
      expect(await readFile(agentsPath, "utf8")).toBe("temporary skill\n")
    })
    expect(new Uint8Array(await readFile(agentsPath))).toEqual(original)
  })
})

const rootDir = path.resolve(import.meta.dir, "../..")
