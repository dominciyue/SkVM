import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  selectOptimizationImplementation,
  selectOptimizationImplementations,
  type DomainImplementationBackend,
} from "../../src/jit-optimize/implementations.ts"
import type { OptimizationAction } from "../../src/jit-optimize/types.ts"

const dirs: string[] = []

async function skillDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  dirs.push(dir)
  await writeFile(path.join(dir, "SKILL.md"), "# Generic skill\n")
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function action(
  id: string,
  overrides: Partial<OptimizationAction> = {},
): OptimizationAction {
  return {
    id,
    kind: "reuse-script",
    evidenceIds: ["0"],
    sourceRefs: ["scripts/tool.py"],
    dependsOn: [],
    inputs: ["input file path"],
    outputs: ["output directory"],
    preconditions: ["python3 available"],
    changedPaths: ["SKILL.md"],
    residualDuties: ["agent selects whether the action applies"],
    verification: ["run with a changed input"],
    ...overrides,
  }
}

describe("selectOptimizationImplementation", () => {
  test("selects the same declared source script under two unrelated skill directories", async () => {
    const first = await skillDir("inventory-skill-")
    const second = await skillDir("document-skill-")
    for (const dir of [first, second]) {
      await mkdir(path.join(dir, "scripts"))
      await writeFile(path.join(dir, "scripts", "tool.py"), "print('ok')\n")
    }

    const selected = await Promise.all([first, second].map((skillDir) =>
      selectOptimizationImplementation({ skillDir, action: action("reuse") })))

    expect(selected.map((item) => item.status)).toEqual(["selected", "selected"])
    expect(selected.map((item) => item.entry)).toEqual(["scripts/tool.py", "scripts/tool.py"])
    expect(selected.map((item) => item.runtime)).toEqual(["python", "python"])
  })

  test("selects ordinary documentation restructuring without requiring an API binding", async () => {
    const dir = await skillDir("plain-text-skill-")
    const result = await selectOptimizationImplementation({
      skillDir: dir,
      action: action("docs", {
        kind: "restructure-docs",
        sourceRefs: ["SKILL.md"],
        inputs: [],
        outputs: ["SKILL.md", "references/details.md"],
        changedPaths: ["SKILL.md", "references/details.md"],
      }),
    })

    expect(result.status).toBe("selected")
    expect(result.kind).toBe("restructure-docs")
    expect(result.entry).toBeUndefined()
    expect(result.backendId).toBeUndefined()
  })

  test("distinguishes an unavailable domain backend from an implementation failure", async () => {
    const dir = await skillDir("domain-neutral-")
    const domainAction = action("domain", { kind: "domain-backend", sourceRefs: ["public contract"] })
    const unavailable = await selectOptimizationImplementation({ skillDir: dir, action: domainAction })
    const brokenBackend: DomainImplementationBackend = {
      id: "broken",
      supports: () => true,
      select: () => { throw new Error("backend exploded") },
    }
    const failed = await selectOptimizationImplementation({
      skillDir: dir,
      action: domainAction,
      domainBackends: [brokenBackend],
    })

    expect(unavailable).toMatchObject({ status: "not-applicable", actionId: "domain" })
    expect(failed).toMatchObject({ status: "failed", actionId: "domain", backendId: "broken" })
    expect(failed.reason).toContain("backend exploded")
  })

  test("requires a generated program to exist instead of accepting a declared path", async () => {
    const dir = await skillDir("generated-tool-")
    const generated = action("generated", {
      kind: "generate-script",
      sourceRefs: [],
      changedPaths: ["scripts/generated.mjs"],
    })
    const missing = await selectOptimizationImplementation({ skillDir: dir, action: generated })
    await mkdir(path.join(dir, "scripts"))
    await writeFile(path.join(dir, "scripts", "generated.mjs"), "console.log('ok')\n")
    const selected = await selectOptimizationImplementation({ skillDir: dir, action: generated })

    expect(missing.status).toBe("failed")
    expect(selected).toMatchObject({ status: "selected", entry: "scripts/generated.mjs", runtime: "node" })
  })

  test("continues selecting independent actions after one is not applicable", async () => {
    const dir = await skillDir("mixed-actions-")
    await mkdir(path.join(dir, "scripts"))
    await writeFile(path.join(dir, "scripts", "tool.py"), "print('ok')\n")
    const results = await selectOptimizationImplementations({
      skillDir: dir,
      actions: [
        action("domain", { kind: "domain-backend", sourceRefs: [] }),
        action("reuse"),
      ],
    })

    expect(results.map((item) => item.status)).toEqual(["not-applicable", "selected"])
  })
})
