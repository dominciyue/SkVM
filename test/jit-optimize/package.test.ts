import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import {
  buildOptimizedSkillPackage,
  OPTIMIZED_SKILL_PACKAGE_MANIFEST,
  OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION,
  OPTIMIZED_SKILL_PACKAGE_USER_GUIDE,
  publishOptimizedSkillPackageAtomically,
  readOptimizedSkillPackageUserSummary,
  verifyOptimizedSkillPackage,
} from "../../src/jit-optimize/package.ts"

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
  finalActions?: unknown[]
  validation?: {
    status: "passed" | "partial" | "failed" | "not-run"
    retainedActionIds: string[]
    unvalidatedActionIds: string[]
    rejectedActionIds: string[]
    programRuns: number
    caseRuns: number
    independentCaseRuns: number
  }
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
  if (bestRound > 0 && (options.finalActions || options.validation)) {
    const validation = options.validation
      ? { ...options.validation, reportPath: `round-${bestRound}-validation/report.json` }
      : undefined
    await put(proposalDir, "history.json", JSON.stringify({
      bestRound,
      bestRoundReason: "actual final snapshot",
      entries: [{
        timestamp: "2026-09-13T00:00:00.000Z",
        round: bestRound,
        rootCause: "test",
        reasoning: "test",
        changes: [],
        changedFiles: Object.keys(options.round ?? options.original),
        actions: options.finalActions ?? options.actions ?? [],
        ...(validation ? { validation } : {}),
        confidence: 1,
        trainScore: null,
        testScore: null,
        improved: null,
      }],
    }))
    if (validation) {
      await put(proposalDir, validation.reportPath, JSON.stringify({
        schemaVersion: "jit-optimize-validation-lifecycle/v1",
        createdAt: "2026-09-13T00:00:01.000Z",
        round: bestRound,
        sourceMode: "execution-log-local-validation",
        sourceTaskReplayed: false,
        actions: [],
        resolution: {
          status: validation.status,
          retainedActionIds: validation.retainedActionIds,
          unvalidatedActionIds: validation.unvalidatedActionIds,
          rejected: validation.rejectedActionIds.map((actionId) => ({ actionId })),
          feedback: [],
          rollbackGroups: [],
        },
        execution: {
          programRuns: validation.programRuns,
          helpRuns: 0,
          caseRuns: validation.caseRuns,
          independentCaseRuns: validation.independentCaseRuns,
          reusedActionObservations: 0,
        },
      }))
    }
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
  test("does not expose a half-written package when staging fails", async () => {
    const root = await tempRoot()
    const packageDir = path.join(root, "atomic-package")

    await expect(publishOptimizedSkillPackageAtomically(packageDir, async (stagingDir) => {
      await put(stagingDir, "SKILL.md", "# Half written\n")
      throw new Error("injected mid-export failure")
    })).rejects.toThrow("injected mid-export failure")

    await expect(stat(packageDir)).rejects.toThrow()
    expect((await readdir(root)).filter((name) => name.includes("skvm-export"))).toEqual([])
  })

  test("does not touch a non-empty user target while preparing atomic export", async () => {
    const root = await tempRoot()
    const packageDir = path.join(root, "existing-package")
    await put(packageDir, "user.txt", "preserve\n")
    let populateCalls = 0

    await expect(publishOptimizedSkillPackageAtomically(packageDir, async () => {
      populateCalls++
    })).rejects.toThrow("Package output directory must be empty")

    expect(populateCalls).toBe(0)
    expect(await readFile(path.join(packageDir, "user.txt"), "utf8")).toBe("preserve\n")
  })

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
    expect(verified.manifest.schemaVersion).toBe(OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION)
    expect(verified.manifest.validation).toEqual(expect.objectContaining({
      status: "passed",
      scope: "package-file-closure",
      behaviorStatus: "not-run",
      deliveryStatus: "draft",
    }))
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

  test("ships a concise user guide and structured callable-step summary", async () => {
    const generated = action("render", "generate-script", {
      changedPaths: ["bin/render.mjs"],
      inputs: ["input CSV selected by the task"],
      outputs: ["result.json"],
      preconditions: ["CSV has name and code columns"],
      residualDuties: ["review unsupported input shapes"],
    })
    const { proposalDir, packageDir } = await makeProposal({
      original: { "SKILL.md": "# Original\n" },
      round: {
        "SKILL.md": "# Optimized\nRun bin/render.mjs for supported CSV input.\n",
        "bin/render.mjs": "console.log('render')\n",
      },
      actions: [generated],
      finalActions: [generated],
      validation: {
        status: "passed",
        retainedActionIds: ["render"],
        unvalidatedActionIds: [],
        rejectedActionIds: [],
        programRuns: 1,
        caseRuns: 1,
        independentCaseRuns: 1,
      },
    })

    await buildOptimizedSkillPackage({ proposalDir, packageDir })
    const summary = await readOptimizedSkillPackageUserSummary(packageDir)
    const guide = await readFile(path.join(packageDir, OPTIMIZED_SKILL_PACKAGE_USER_GUIDE), "utf8")

    expect(summary.deliveryStatus).toBe("validated-recommendation")
    expect(summary.useCommand).toContain("skvm run --prompt")
    expect(summary.steps).toEqual([expect.objectContaining({
      actionId: "render",
      command: "node bin/render.mjs",
      inputs: ["input CSV selected by the task"],
      outputs: ["result.json"],
    })])
    expect(summary.residualDuties).toEqual(["review unsupported input shapes"])
    expect(guide).toContain("## Use this package")
    expect(guide).toContain("node bin/render.mjs")
    expect(guide).toContain("review unsupported input shapes")
  })

  test("excludes Python cache artifacts from proposal snapshots while rejecting them inside an exported package", async () => {
    const { proposalDir, packageDir } = await makeProposal({
      original: {
        "SKILL.md": "# Original\n",
        "scripts/run.py": "print('stable')\n",
        "scripts/__pycache__/run.cpython-312.pyc": "original cache\n",
      },
      round: {
        "SKILL.md": "# Optimized\n",
        "scripts/run.py": "print('stable')\n",
        "scripts/__pycache__/run.cpython-312.pyc": "validation-mutated cache\n",
        "scripts/__pycache__/helper.cpython-312.pyc": "validation-created cache\n",
      },
      actions: [action("docs", "restructure-docs", { changedPaths: ["SKILL.md"] })],
    })

    await buildOptimizedSkillPackage({ proposalDir, packageDir })
    const verified = await verifyOptimizedSkillPackage(packageDir)

    expect(verified.manifest.actualDiff).toEqual({ added: [], modified: ["SKILL.md"], deleted: [], moved: [] })
    expect(verified.manifest.files.some((file) => file.path.includes("__pycache__") || file.path.endsWith(".pyc"))).toBe(false)
    expect(await Bun.file(path.join(packageDir, "scripts", "__pycache__", "run.cpython-312.pyc")).exists()).toBe(false)

    await put(packageDir, "scripts/__pycache__/injected.cpython-312.pyc", "unexpected cache\n")
    await expect(verifyOptimizedSkillPackage(packageDir)).rejects.toThrow("Package file closure mismatch")
  })

  test("binds final-snapshot validation and final actions instead of a stale optimizer submission", async () => {
    const kept = action("kept-program", "generate-script", { changedPaths: ["bin/kept.mjs"] })
    const rolledBack = action("rolled-back-program", "generate-script", { changedPaths: ["bin/removed.mjs"] })
    const { proposalDir, packageDir } = await makeProposal({
      original: { "SKILL.md": "# Original\n" },
      round: { "SKILL.md": "# Optimized\n", "bin/kept.mjs": "console.log('kept')\n" },
      actions: [kept, rolledBack],
      finalActions: [kept],
      validation: {
        status: "passed",
        retainedActionIds: ["kept-program"],
        unvalidatedActionIds: [],
        rejectedActionIds: [],
        programRuns: 1,
        caseRuns: 1,
        independentCaseRuns: 1,
      },
    })

    await buildOptimizedSkillPackage({ proposalDir, packageDir })
    const verified = await verifyOptimizedSkillPackage(packageDir)

    expect(verified.manifest.implementations.map((item) => item.actionId)).toEqual(["kept-program"])
    expect(verified.manifest.validation).toEqual(expect.objectContaining({
      behaviorStatus: "passed",
      deliveryStatus: "validated-recommendation",
      behaviorScope: "action-local-program-cases",
      retainedActionIds: ["kept-program"],
      independentCaseRuns: 1,
      report: expect.objectContaining({ path: "optimization-validation-report.json" }),
    }))
    expect(await Bun.file(path.join(packageDir, "optimization-validation-report.json")).exists()).toBe(true)
  })

  test("exports partial local validation as a draft with concrete unvalidated actions", async () => {
    const checked = action("checked", "generate-script", { changedPaths: ["bin/checked.mjs"] })
    const pending = action("pending", "restructure-docs", { changedPaths: ["SKILL.md"] })
    const { proposalDir, packageDir } = await makeProposal({
      original: { "SKILL.md": "# Original\n" },
      round: { "SKILL.md": "# Changed\n", "bin/checked.mjs": "console.log('ok')\n" },
      actions: [checked, pending],
      finalActions: [checked, pending],
      validation: {
        status: "partial",
        retainedActionIds: ["checked"],
        unvalidatedActionIds: [],
        rejectedActionIds: ["pending"],
        programRuns: 1,
        caseRuns: 1,
        independentCaseRuns: 1,
      },
    })

    await buildOptimizedSkillPackage({ proposalDir, packageDir })
    const verified = await verifyOptimizedSkillPackage(packageDir)

    expect(verified.manifest.validation).toEqual(expect.objectContaining({
      behaviorStatus: "partial",
      deliveryStatus: "draft",
      retainedActionIds: ["checked"],
      rejectedActionIds: ["pending"],
    }))
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

  test("keeps a legacy v1 package readable without rewriting its manifest", async () => {
    const root = await tempRoot()
    const packageDir = path.join(root, "legacy-package")
    await put(packageDir, "SKILL.md", "# Legacy\n")
    const skillBytes = await readFile(path.join(packageDir, "SKILL.md"))
    const digest = new Bun.CryptoHasher("sha256").update(skillBytes).digest("hex")
    const manifest = {
      schemaVersion: "skvm-optimized-skill-package/v1",
      identity: "legacy:v1",
      exposure: "development",
      proposal: {
        dirName: "legacy-proposal",
        bestRound: 1,
        meta: { path: "meta.json", bytes: 2, sha256: "0".repeat(64) },
      },
      snapshots: { originalClosureSha256: "1".repeat(64), selectedClosureSha256: "2".repeat(64) },
      actualDiff: { added: [], modified: ["SKILL.md"], deleted: [], moved: [] },
      files: [{ path: "SKILL.md", bytes: skillBytes.byteLength, sha256: digest }],
      implementations: [],
      runtime: { runtimes: [], dependencyFiles: [] },
      validation: { status: "passed", scope: "package-file-closure", behaviorStatus: "not-run" },
      claimBoundary: "Legacy development package.",
    }
    const manifestPath = path.join(packageDir, OPTIMIZED_SKILL_PACKAGE_MANIFEST)
    const originalManifest = `${JSON.stringify(manifest, null, 2)}\n`
    await writeFile(manifestPath, originalManifest)

    const verified = await verifyOptimizedSkillPackage(packageDir)

    expect(verified.manifest.schemaVersion).toBe("skvm-optimized-skill-package/v1")
    expect(await readFile(manifestPath, "utf8")).toBe(originalManifest)
  })
})
