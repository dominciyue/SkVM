import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadSkill } from "./skill-loader.ts"

describe("skill bundle source closure", () => {
  test("does not promote generated interpreter caches into the skill resource closure", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-skill-loader-"))
    try {
      await mkdir(path.join(root, "scripts", "__pycache__"), { recursive: true })
      await writeFile(path.join(root, "SKILL.md"), "# Skill\n", "utf8")
      await writeFile(path.join(root, "scripts", "run.py"), "print('ok')\n", "utf8")
      await writeFile(path.join(root, "scripts", "__pycache__", "run.cpython-312.pyc"), "cache\n", "utf8")
      const skill = await loadSkill(root)
      expect(skill.bundleFiles).toEqual(["scripts/run.py"])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
