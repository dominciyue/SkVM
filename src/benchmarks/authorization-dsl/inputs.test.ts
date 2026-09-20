import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { parseAuthorizationTask } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import { renderAuthorizationTask } from "../../task-dsl/authorization/render.ts"
import { loadExactSourceBundle, renderSourceBundle } from "./inputs.ts"

const cleanupRoots: string[] = []

async function makeFixture(): Promise<{ parent: string; caseRoot: string }> {
  const parent = await mkdtemp(join(tmpdir(), "skvm-authorization-inputs-"))
  cleanupRoots.push(parent)
  const caseRoot = join(parent, "authorization-case")
  await mkdir(join(caseRoot, "inputs", "sample"), { recursive: true })
  await mkdir(join(caseRoot, "oracles"), { recursive: true })
  await writeFile(
    join(caseRoot, "inputs", "sample", "task.json"),
    JSON.stringify({ task: "inspect the declared entry" }),
    "utf8",
  )
  await writeFile(
    join(caseRoot, "inputs", "sample", "source.ts"),
    "export function allowed() { return true }\n",
    "utf8",
  )
  await writeFile(join(caseRoot, "oracles", "answer.json"), "ORACLE_SECRET", "utf8")
  return { parent, caseRoot }
}

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

describe("loadExactSourceBundle", () => {
  it("reads exactly the allowlisted input files and leaves oracle bytes out of the prompt", async () => {
    const { caseRoot } = await makeFixture()
    const loaded = await loadExactSourceBundle({
      caseRoot,
      repository: "https://example.test/acme/repository",
      sourceRef: "revision-1",
      allowedInputFiles: [
        "inputs/sample/task.json",
        "inputs/sample/source.ts",
      ],
      originalLocationsByFile: {
        "inputs/sample/source.ts": ["src/source.ts:40-72"],
      },
    })

    expect(loaded.success).toBe(true)
    if (loaded.success) {
      expect(loaded.bundle.files.map(file => file.relativePath)).toEqual([
        "inputs/sample/task.json",
        "inputs/sample/source.ts",
      ])
      const rendered = renderSourceBundle(loaded.bundle)
      expect(rendered).toContain("inspect the declared entry")
      expect(rendered).toContain("export function allowed")
      expect(rendered).not.toContain("ORACLE_SECRET")
      expect(rendered).not.toContain("oracles/answer.json")
    }
  })

  it("loads all three real declarations from exact inputs without oracle hints", async () => {
    const repositoryRoot = resolve(import.meta.dir, "../../..")
    const caseRoot = join(
      repositoryRoot,
      "results",
      "skill-ir",
      "skill-dsl-research",
      "cases",
      "authorization",
    )
    const developmentRoot = join(
      repositoryRoot,
      "results",
      "skill-ir",
      "skill-dsl-research",
      "development",
      "authorization-v0",
    )
    const manifest = await Bun.file(join(caseRoot, "manifest.json")).json() as {
      repository: { url: string; sourceRef: string }
      cases: Array<{ id: string; allowedInputFiles: string[] }>
    }
    const authoringMap = await Bun.file(join(developmentRoot, "authoring-map.json")).json() as {
      cases: Array<{ caseId: string }>
    }

    expect(authoringMap.cases.map(item => item.caseId).sort()).toEqual(
      manifest.cases.map(item => item.id).sort(),
    )

    for (const caseDefinition of manifest.cases) {
      const rawDeclaration = await Bun.file(
        join(developmentRoot, "declarations", `${caseDefinition.id}.json`),
      ).json()
      const serialized = JSON.stringify(rawDeclaration)
      expect(serialized).not.toContain("GHSA-")
      expect(serialized).not.toContain("d11e06f")
      expect(serialized).not.toContain("\"disposition\"")
      expect(serialized).not.toContain("\"correctDisposition\"")

      const parsed = parseAuthorizationTask(rawDeclaration)
      expect(parsed.success).toBe(true)
      if (!parsed.success) continue
      const compiled = compileAuthorizationTask(parsed.task)
      expect(compiled.status).toBe("ready")
      const baseline = renderAuthorizationTask(compiled, "B")
      const domain = renderAuthorizationTask(compiled, "D")
      expect(domain.facts).toEqual(baseline.facts)
      expect(baseline.prompt.match(/<SOURCE_CONTEXT_INSERTED_BY_HOST>/g)).toHaveLength(1)
      expect(domain.prompt.match(/<SOURCE_CONTEXT_INSERTED_BY_HOST>/g)).toHaveLength(1)

      const loaded = await loadExactSourceBundle({
        caseRoot,
        repository: manifest.repository.url,
        sourceRef: manifest.repository.sourceRef,
        allowedInputFiles: caseDefinition.allowedInputFiles,
      })
      expect(loaded.success).toBe(true)
      if (loaded.success) {
        expect(loaded.bundle.files).toHaveLength(caseDefinition.allowedInputFiles.length)
        expect(loaded.bundle.files.every(file => file.relativePath.startsWith("inputs/"))).toBe(true)
      }
    }
  })

  it("rejects parent traversal and absolute paths before reading", async () => {
    const { caseRoot } = await makeFixture()
    const outside = join(dirname(caseRoot), "outside.txt")
    await writeFile(outside, "outside", "utf8")

    for (const unsafePath of ["../outside.txt", outside]) {
      const loaded = await loadExactSourceBundle({
        caseRoot,
        repository: "https://example.test/acme/repository",
        sourceRef: "revision-1",
        allowedInputFiles: [unsafePath],
      })

      expect(loaded.success).toBe(false)
      if (!loaded.success) {
        expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "unsafe-input-path" }))
      }
    }
  })

  it("rejects a symlink or junction that resolves outside the case root", async () => {
    const { parent, caseRoot } = await makeFixture()
    const outsideDirectory = join(parent, "outside")
    await mkdir(outsideDirectory)
    await writeFile(join(outsideDirectory, "secret.txt"), "outside secret", "utf8")
    const linkPath = join(caseRoot, "inputs", "sample", "linked")
    await symlink(outsideDirectory, linkPath, "junction")

    const loaded = await loadExactSourceBundle({
      caseRoot,
      repository: "https://example.test/acme/repository",
      sourceRef: "revision-1",
      allowedInputFiles: ["inputs/sample/linked/secret.txt"],
    })

    expect(loaded.success).toBe(false)
    if (!loaded.success) {
      expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: "symlink-escape" }))
    }
  })

  it("returns a missing-input diagnostic instead of widening the search", async () => {
    const { caseRoot } = await makeFixture()
    const loaded = await loadExactSourceBundle({
      caseRoot,
      repository: "https://example.test/acme/repository",
      sourceRef: "revision-1",
      allowedInputFiles: ["inputs/sample/missing.ts"],
    })

    expect(loaded.success).toBe(false)
    if (!loaded.success) {
      expect(loaded.diagnostics).toEqual([
        expect.objectContaining({
          code: "missing-input",
          path: "allowedInputFiles.0",
        }),
      ])
    }
  })

  it("keeps crop-local line numbers distinct from original source locations", async () => {
    const { caseRoot } = await makeFixture()
    const loaded = await loadExactSourceBundle({
      caseRoot,
      repository: "https://example.test/acme/repository",
      sourceRef: "revision-1",
      allowedInputFiles: ["inputs/sample/source.ts"],
      originalLocationsByFile: {
        "inputs/sample/source.ts": ["src/source.ts:40-72", "src/source.ts:90-94"],
      },
    })

    expect(loaded.success).toBe(true)
    if (loaded.success) {
      expect(loaded.bundle.files[0]).toEqual(expect.objectContaining({
        cropRange: { startLine: 1, endLine: 1 },
        originalLocations: ["src/source.ts:40-72", "src/source.ts:90-94"],
      }))
      expect(renderSourceBundle(loaded.bundle)).toContain("crop lines 1-1; original locations: src/source.ts:40-72, src/source.ts:90-94")
    }
  })
})
