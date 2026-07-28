import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { resolvePiOnPath, withPiInjectedAgentsFile } from "./pi.ts"

const tempDirs: string[] = []

afterAll(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true })
})

describe("Pi adapter command resolution", () => {
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
