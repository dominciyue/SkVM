import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { buildOptimizedSkillPackage, verifyOptimizedSkillPackage } from "../../src/jit-optimize/package.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "skvm-general-package-"))
  roots.push(root)
  return root
}

async function put(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

async function makeProposal(options: {
  original: Record<string, string>
  round?: Record<string, string>
  actions?: unknown[]
  bestRound?: number
}): Promise<{ proposalDir: string; packageDir: string }> {
  const root = await tempRoot()
  const proposalDir = path.join(root, "proposal-20260913")
  const originalDir = path.join(proposalDir, "original")
  const bestRound = options.bestRound ?? 1
  await mkdir(originalDir, { recursive: true })
  for (const [file, content] of Object.entries(options.original)) await put(originalDir, file, content)
  const roundDir = path.join(proposalDir, `round-${bestRound}`)
  if (bestRound === 0) {
    await cp(originalDir, roundDir, { recursive: true })
  } else {
    await mkdir(roundDir, { recursive: true })
    for (const [file, content] of Object.entries(options.round ?? options.original)) await put(roundDir, file, content)
  }
  await put(proposalDir, "meta.json", JSON.stringify({
    schemaVersion: 1,
    skillName: "portable-skill",
    skillDir: originalDir,
    harness: "bare-agent",
    optimizerModel: "provider/optimizer",
    targetModel: "provider/target",
    source: "test",
    timestamp: "20260913T000000000Z",
    status: "pending",
    acceptedRound: null,
    bestRound,
    bestRoundReason: bestRound === 0 ? "no change" : "actual changed snapshot",
    roundCount: bestRound + 1,
  }))
  if (bestRound > 0 && options.actions) {
    await put(proposalDir, `round-${bestRound}-optimizer/submission.json`, JSON.stringify({
      rootCause: "test",
      reasoning: "test",
      confidence: 1,
      changedFiles: [],
      actions: options.actions,
    }))
  }
  return { proposalDir, packageDir: path.join(root, "exported") }
}

function action(id: string, kind: "reuse-script" | "generate-script" | "restructure-docs", overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind,
    evidenceIds: ["0"],
    sourceRefs: [],
    dependsOn: [],
    inputs: ["user file"],
    outputs: ["result file"],
    preconditions: [],
    changedPaths: [],
    residualDuties: ["review the result"],
    verification: ["run a deterministic check"],
    ...overrides,
  }
}

describe("buildOptimizedSkillPackage", () => {
  test("exports an actual docs-only snapshot with moves/deletions and preserves licenses plus hidden resources", async () => {
    const source = {
      "SKILL.md": "# Original\n",
      "LICENSE.txt": "license bytes\n",
      ".skill-config/rules.json": "{\"strict\":true}\n",
      "references/old-name.md": "move me unchanged\n",
      "references/delete-me.md": "obsolete\n",
    }
    const { proposalDir, packageDir } = await makeProposal({
      original: source,
      round: {
        "SKILL.md": "# Optimized\n\nRead references/new-name.md when needed.\n",
        "LICENSE.txt": "license bytes\n",
        ".skill-config/rules.json": "{\"strict\":true}\n",
        "references/new-name.md": "move me unchanged\n",
        "references/added.md": "new guidance\n",
      },
      actions: [action("docs", "restructure-docs", { changedPaths: ["SKILL.md", "references/new-name.md"] })],
    })
    const before: Array<[string, string]> = await Promise.all(Object.keys(source).map(async (file) => [
      file,
      await readFile(path.join(proposalDir, "original", file), "utf8"),
    ]))

    const result = await buildOptimizedSkillPackage({ proposalDir, packageDir })

    expect(result.status).toBe("exported")
    expect(result.validation).toBe("passed")
    expect(await readFile(path.join(packageDir, "SKILL.md"), "utf8")).toContain("# Optimized")
    expect(await readFile(path.join(packageDir, "LICENSE.txt"), "utf8")).toBe("license bytes\n")
    expect(await readFile(path.join(packageDir, ".skill-config/rules.json"), "utf8")).toContain("strict")
    expect(await readFile(path.join(packageDir, "references/new-name.md"), "utf8")).toBe("move me unchanged\n")
    expect(await Bun.file(path.join(packageDir, "references/delete-me.md")).exists()).toBe(false)
    expect(await Bun.file(path.join(packageDir, "scripts/api-task-solidify.js")).exists()).toBe(false)
    expect(await Bun.file(path.join(packageDir, "references/api-tester-solidification-v2.md")).exists()).toBe(false)

    const verified = await verifyOptimizedSkillPackage(packageDir)
    expect(verified.manifest.validation).toEqual({ status: "passed", scope: "package-file-closure", behaviorStatus: "not-run" })
    expect(verified.manifest.actualDiff.moved).toEqual([{ from: "references/old-name.md", to: "references/new-name.md" }])
    expect(verified.manifest.actualDiff.added).toEqual(["references/added.md"])
    expect(verified.manifest.actualDiff.modified).toEqual(["SKILL.md"])
    expect(verified.manifest.actualDiff.deleted).toEqual(["references/delete-me.md"])
    expect(verified.manifest.implementations[0]?.kind).toBe("restructure-docs")
    for (const [file, content] of before) {
      expect(await readFile(path.join(proposalDir, "original", file), "utf8")).toBe(content)
    }
  })

  test("exports reused and generated program packages from unrelated names without API injection", async () => {
    const scenarios: Array<{
      name: string
      original: Record<string, string>
      round: Record<string, string>
      selectedAction: ReturnType<typeof action>
      expectedEntry: string
      expectedRuntime: string
    }> = [
      {
        name: "reuse",
        original: { "SKILL.md": "# A\n", "tools/convert.py": "print('source')\n", "requirements.txt": "x==1\n" },
        round: { "SKILL.md": "# A improved\n", "tools/convert.py": "print('source')\n", "requirements.txt": "x==1\n" },
        selectedAction: action("run-existing", "reuse-script", { sourceRefs: ["tools/convert.py"] }),
        expectedEntry: "tools/convert.py",
        expectedRuntime: "python",
      },
      {
        name: "generated",
        original: { "SKILL.md": "# B\n" },
        round: { "SKILL.md": "# B with helper\n", "bin/transform.mjs": "console.log('parameterized')\n" },
        selectedAction: action("run-generated", "generate-script", { changedPaths: ["bin/transform.mjs"] }),
        expectedEntry: "bin/transform.mjs",
        expectedRuntime: "node",
      },
    ]
    for (const scenario of scenarios) {
      const { proposalDir, packageDir } = await makeProposal({
        original: scenario.original,
        round: scenario.round,
        actions: [scenario.selectedAction],
      })
      const result = await buildOptimizedSkillPackage({ proposalDir, packageDir })
      expect(result.status).toBe("exported")
      const verified = await verifyOptimizedSkillPackage(packageDir)
      expect(verified.manifest.implementations).toContainEqual(expect.objectContaining({
        actionId: scenario.selectedAction.id,
        status: "selected",
        entry: scenario.expectedEntry,
        runtime: scenario.expectedRuntime,
      }))
      expect(verified.manifest.runtime.dependencyFiles).toEqual(scenario.name === "reuse" ? ["requirements.txt"] : [])
      expect(verified.manifest.files.some((file) => file.path.includes("api-task"))).toBe(false)
    }
  })

  test("returns truthful no-change without creating an exported package", async () => {
    const { proposalDir, packageDir } = await makeProposal({
      original: { "SKILL.md": "# Unchanged\n", ".hidden": "keep\n" },
      bestRound: 0,
    })

    const result = await buildOptimizedSkillPackage({ proposalDir, packageDir })

    expect(result).toEqual({
      status: "no-change",
      sourceProposalDir: path.resolve(proposalDir),
      validation: "not-run",
    })
    await expect(stat(packageDir)).rejects.toThrow()
  })
})
