import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadSkill } from "../core/skill-loader.ts"
import {
  compileNamespacedSkillResources,
  materializeNamespacedSkillResources,
  verifyNamespacedSkillResources,
} from "./resource-namespace.ts"

async function syntheticSkill(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-resource-skill-"))
  await mkdir(path.join(root, "scripts"))
  await mkdir(path.join(root, "references"))
  await writeFile(path.join(root, "SKILL.md"), [
    "# Synthetic skill",
    "Run `scripts/run.py` and read `references/guide.md`.",
    "",
  ].join("\n"), "utf8")
  await writeFile(path.join(root, "scripts/run.py"), "print('ok')\n", "utf8")
  await writeFile(path.join(root, "references/guide.md"), "# Guide\n", "utf8")
  await writeFile(path.join(root, "LICENSE.upstream"), "MIT\n", "utf8")
  return root
}

describe("optimized namespaced skill resources", () => {
  test("compiles deterministically, rewrites public resource paths, and isolates passive resources", async () => {
    const skillRoot = await syntheticSkill()
    const workRoot = await mkdtemp(path.join(tmpdir(), "skvm-resource-work-"))
    try {
      const skill = await loadSkill(skillRoot)
      const first = await compileNamespacedSkillResources(skill)
      const second = await compileNamespacedSkillResources(skill)
      expect(first).toEqual(second)
      expect(first.status).toBe("ready")
      expect(first.rewrites.map((entry) => entry.sourcePath)).toEqual(["references/guide.md", "scripts/run.py"])
      expect(first.compiledSkillContent).toContain(first.rewrites[0]!.targetPath)
      expect(first.compiledSkillContent).not.toContain("`scripts/run.py`")

      const manifest = await materializeNamespacedSkillResources({ package: first, skill, workDir: workRoot })
      expect(manifest.namespaceRoot.startsWith(".skvm/skill-resources/")).toBe(true)
      expect(await Bun.file(path.join(workRoot, "LICENSE.upstream")).exists()).toBe(false)
      expect(await Bun.file(path.join(workRoot, "scripts/run.py")).exists()).toBe(false)
      expect(await Bun.file(path.join(workRoot, ...first.rewrites[1]!.targetPath.split("/"))).exists()).toBe(true)
      await expect(verifyNamespacedSkillResources({ workDir: workRoot, manifest })).resolves.toBeUndefined()
    } finally {
      await rm(skillRoot, { recursive: true, force: true })
      await rm(workRoot, { recursive: true, force: true })
    }
  })

  test("blocks an unresolved public resource reference instead of guessing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-resource-blocked-"))
    try {
      await mkdir(path.join(root, "scripts"))
      await writeFile(path.join(root, "SKILL.md"), "Run scripts/missing.py\n", "utf8")
      await writeFile(path.join(root, "scripts/available.py"), "print('ok')\n", "utf8")
      const packageCandidate = await compileNamespacedSkillResources(await loadSkill(root))
      expect(packageCandidate.status).toBe("blocked")
      expect(packageCandidate.unresolvedReferences).toEqual(["scripts/missing.py"])
      const workRoot = await mkdtemp(path.join(tmpdir(), "skvm-resource-blocked-work-"))
      try {
        await expect(materializeNamespacedSkillResources({
          package: packageCandidate,
          skill: await loadSkill(root),
          workDir: workRoot,
        })).rejects.toThrow("blocked")
      } finally {
        await rm(workRoot, { recursive: true, force: true })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("fails closed when a namespaced resource is modified or replaced by a symlink", async () => {
    const skillRoot = await syntheticSkill()
    const workRoot = await mkdtemp(path.join(tmpdir(), "skvm-resource-integrity-"))
    try {
      const compiled = await compileNamespacedSkillResources(await loadSkill(skillRoot))
      const skill = await loadSkill(skillRoot)
      const manifest = await materializeNamespacedSkillResources({ package: compiled, skill, workDir: workRoot })
      const resourcePath = path.join(workRoot, ...compiled.rewrites[1]!.targetPath.split("/"))
      await writeFile(resourcePath, "tampered\n", "utf8")
      await expect(verifyNamespacedSkillResources({ workDir: workRoot, manifest }))
        .rejects.toThrow("resource digest mismatch")
      const outside = path.join(workRoot, "outside.py")
      await writeFile(outside, "outside\n", "utf8")
      try {
        await rm(resourcePath)
        await symlink(outside, resourcePath, "file")
        await expect(verifyNamespacedSkillResources({ workDir: workRoot, manifest }))
          .rejects.toThrow("symlink")
      } catch (error) {
        if (!["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
      }
    } finally {
      await rm(skillRoot, { recursive: true, force: true })
      await rm(workRoot, { recursive: true, force: true })
    }
  })

  test("rewrites resource references in both real script-bearing method cases", async () => {
    const cases = [
      { id: "law-to-markdown", path: "benchmarks/skill-ir/pilots/law-to-markdown/source/SKILL.md" },
      { id: "experimental-design", path: "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md" },
    ]
    for (const source of cases) {
      const compiled = await compileNamespacedSkillResources(
        await loadSkill(path.join(process.cwd(), ...source.path.split("/"))),
        { packageId: source.id },
      )
      expect(compiled.status).toBe("ready")
      expect(compiled.rewrites.length).toBeGreaterThan(0)
      expect(compiled.rewrites.every((entry) => entry.targetPath.startsWith(".skvm/skill-resources/"))).toBe(true)
      expect(compiled.unresolvedReferences).toEqual([])
    }
  })
})
