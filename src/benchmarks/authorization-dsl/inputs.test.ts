import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { parseAuthorizationTask } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import { renderAuthorizationTask } from "../../task-dsl/authorization/render.ts"
import {
  buildAuthorizationSourceCatalog,
  loadExactSourceBundle,
  renderSourceBundle,
  resolveAuthorizationSourceCitation,
  type SourceBundle,
} from "./inputs.ts"

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
      expect(rendered).toMatch(/Source ID: src-[a-f0-9]{16}/)
      expect(rendered).toContain("1 | export function allowed() { return true }")
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

function catalogBundle(input: {
  sourceRef?: string
  files: Array<{
    relativePath: string
    content: string
    startLine?: number
    originalLocations?: string[]
  }>
}): SourceBundle {
  return {
    repository: "https://example.test/acme/catalog",
    sourceRef: input.sourceRef ?? "catalog-r1",
    sourceMode: "fixed-context",
    isolation: "exact-allowlist",
    files: input.files.map(file => {
      const lines = file.content.length === 0
        ? 0
        : file.content.replace(/\r?\n$/, "").split(/\r?\n/).length
      const startLine = file.startLine ?? 1
      return {
        relativePath: file.relativePath,
        content: file.content,
        sha256: createHash("sha256").update(file.content, "utf8").digest("hex"),
        cropRange: { startLine, endLine: startLine + lines - 1 },
        originalLocations: file.originalLocations ?? [],
      }
    }),
  }
}

describe("authorization source catalog", () => {
  it("keeps source IDs stable across array order while distinguishing equal bytes at different paths", () => {
    const files = [
      { relativePath: "inputs/example/a.ts", content: "same\n" },
      { relativePath: "inputs/example/b.ts", content: "same\n" },
    ]
    const first = buildAuthorizationSourceCatalog(catalogBundle({ files }))
    const reordered = buildAuthorizationSourceCatalog(catalogBundle({ files: [...files].reverse() }))

    expect(first.success).toBe(true)
    expect(reordered.success).toBe(true)
    if (!first.success || !reordered.success) return
    const ids = (catalog: typeof first.catalog) => Object.fromEntries(
      catalog.sources.map(source => [source.relativePath, source.sourceId]),
    )
    expect(ids(reordered.catalog)).toEqual(ids(first.catalog))
    expect(new Set(first.catalog.sources.map(source => source.sourceId)).size).toBe(2)
  })

  it("rejects duplicate source files instead of making array position part of identity", () => {
    const duplicate = { relativePath: "inputs/example/a.ts", content: "one line" }
    const built = buildAuthorizationSourceCatalog(catalogBundle({ files: [duplicate, duplicate] }))

    expect(built.success).toBe(false)
    if (!built.success) {
      expect(built.diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate-source-path" }))
    }
  })

  it("uses the displayed crop line numbers for LF or CRLF and excludes a terminal empty line", () => {
    for (const content of ["first\nsecond\n", "first\r\nsecond\r\n"]) {
      const bundle = catalogBundle({
        files: [{
          relativePath: "inputs/example/source.ts",
          content,
          startLine: 40,
          originalLocations: ["src/source.ts:140-141"],
        }],
      })
      const built = buildAuthorizationSourceCatalog(bundle)
      expect(built.success).toBe(true)
      if (!built.success) continue
      const source = built.catalog.sources[0]!
      const rendered = renderSourceBundle(bundle)
      expect(rendered).toContain("40 | first")
      expect(rendered).toContain("41 | second")
      expect(rendered).not.toContain("42 |")
      expect(source.originalLocations).toEqual(["src/source.ts:140-141"])

      const resolved = resolveAuthorizationSourceCitation(built.catalog, {
        sourceId: source.sourceId,
        startLine: 40,
        endLine: 41,
      })
      expect(resolved).toEqual({
        success: true,
        diagnostics: [],
        citation: {
          path: "inputs/example/source.ts",
          startLine: 40,
          endLine: 41,
          quote: "first\nsecond",
        },
      })
    }
  })

  it("rejects unknown, out-of-range, cross-source, and stale-ref citations", () => {
    const bundle = catalogBundle({ files: [
      { relativePath: "inputs/example/a.ts", content: "a-only" },
      { relativePath: "inputs/example/b.ts", content: "b-one\nb-two" },
    ] })
    const built = buildAuthorizationSourceCatalog(bundle)
    expect(built.success).toBe(true)
    if (!built.success) return
    const a = built.catalog.sources.find(source => source.relativePath.endsWith("a.ts"))!

    for (const reference of [
      { sourceId: "src-0000000000000000", startLine: 1, endLine: 1 },
      { sourceId: a.sourceId, startLine: 0, endLine: 1 },
      { sourceId: a.sourceId, startLine: 1, endLine: 2 },
    ]) {
      expect(resolveAuthorizationSourceCitation(built.catalog, reference).success).toBe(false)
    }

    const next = buildAuthorizationSourceCatalog(catalogBundle({
      sourceRef: "catalog-r2",
      files: [{ relativePath: "inputs/example/a.ts", content: "a-only" }],
    }))
    expect(next.success).toBe(true)
    if (next.success) {
      const stale = resolveAuthorizationSourceCitation(next.catalog, {
        sourceId: a.sourceId,
        startLine: 1,
        endLine: 1,
      })
      expect(stale.success).toBe(false)
      if (!stale.success) {
        expect(stale.diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-source-id" }))
      }
    }
  })
})
