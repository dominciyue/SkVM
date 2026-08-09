import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  assessWorkdirDelta,
  InitialWorkdirManifestSchema,
  readInitialWorkdirManifest,
  writeInitialWorkdirManifest,
} from "./workdir-manifest.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createRunRoot(): Promise<{ root: string; workDir: string; manifestPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "skvm-workdir-manifest-"))
  roots.push(root)
  const workDir = join(root, "workdir")
  await mkdir(join(workDir, "references"), { recursive: true })
  await writeFile(join(workDir, "study.json"), "{\"studyId\":\"s1\"}\n", "utf8")
  await writeFile(join(workDir, "references", "guide.md"), "public guide\n", "utf8")
  return { root, workDir, manifestPath: join(root, "initial-workdir-manifest.json") }
}

describe("initial workdir manifest", () => {
  test("rejects unsafe, duplicate, and unsorted manifest entries", () => {
    expect(() => InitialWorkdirManifestSchema.parse({
      schemaVersion: "skvm-initial-workdir-manifest/v1",
      entries: [{ path: "../outside", type: "file", sha256: "0".repeat(64) }],
    })).toThrow();
    expect(() => InitialWorkdirManifestSchema.parse({
      schemaVersion: "skvm-initial-workdir-manifest/v1",
      entries: [
        { path: "same", type: "directory" },
        { path: "same", type: "directory" },
      ],
    })).toThrow("unique");
    expect(() => InitialWorkdirManifestSchema.parse({
      schemaVersion: "skvm-initial-workdir-manifest/v1",
      entries: [
        { path: "z", type: "directory" },
        { path: "a", type: "directory" },
      ],
    })).toThrow("sorted");
  });

  test("writes a deterministic external manifest and verifies its digest", async () => {
    const { workDir, manifestPath } = await createRunRoot()
    const reference = await writeInitialWorkdirManifest({ workDir, manifestPath })
    const manifest = await readInitialWorkdirManifest({ workDir, reference })

    expect(reference.path).toBe(manifestPath)
    expect(reference.sha256).toBe(
      createHash("sha256").update(await readFile(manifestPath)).digest("hex"),
    )
    expect(manifest.entries.map((entry) => `${entry.type}:${entry.path}`)).toEqual([
      "directory:references",
      "file:references/guide.md",
      "file:study.json",
    ])
  })

  test("rejects a manifest path inside the agent workdir", async () => {
    const { workDir } = await createRunRoot()
    await expect(
      writeInitialWorkdirManifest({
        workDir,
        manifestPath: join(workDir, "initial-workdir-manifest.json"),
      }),
    ).rejects.toThrow("outside workdir")
  })

  test("rejects digest drift", async () => {
    const { workDir, manifestPath } = await createRunRoot()
    const reference = await writeInitialWorkdirManifest({ workDir, manifestPath })
    await writeFile(manifestPath, "{}\n", "utf8")
    await expect(readInitialWorkdirManifest({ workDir, reference })).rejects.toThrow("digest")
  })

  test("rejects symlink or junction entries when the host can create them", async () => {
    const { root, workDir, manifestPath } = await createRunRoot()
    const target = join(root, "outside")
    await mkdir(target)
    try {
      await symlink(target, join(workDir, "linked"), process.platform === "win32" ? "junction" : "dir")
    } catch {
      return
    }
    await expect(writeInitialWorkdirManifest({ workDir, manifestPath })).rejects.toThrow(
      "unsafe workdir entry",
    )
  })
})

describe("workdir delta", () => {
  test("allows unchanged initial resources plus exactly the declared outputs", async () => {
    const { workDir, manifestPath } = await createRunRoot()
    const reference = await writeInitialWorkdirManifest({ workDir, manifestPath })
    await mkdir(join(workDir, "design"))
    await writeFile(join(workDir, "design", "design-plan.json"), "{}\n", "utf8")
    await writeFile(join(workDir, "design", "allocation.csv"), "order,unitId,stratum,arm\n", "utf8")
    await writeFile(join(workDir, "design", "design-report.md"), "report\n", "utf8")

    const result = await assessWorkdirDelta({
      workDir,
      initialManifest: await readInitialWorkdirManifest({ workDir, reference }),
      allowedNewDirectories: ["design"],
      requiredNewFiles: [
        "design/design-plan.json",
        "design/allocation.csv",
        "design/design-report.md",
      ],
    })

    expect(result).toEqual({ status: "pass", violations: [] })
  })

  test("reports missing output, unexpected output, initial mutation, and initial deletion", async () => {
    const { workDir, manifestPath } = await createRunRoot()
    const reference = await writeInitialWorkdirManifest({ workDir, manifestPath })
    const initialManifest = await readInitialWorkdirManifest({ workDir, reference })
    await writeFile(join(workDir, "study.json"), "changed\n", "utf8")
    await rm(join(workDir, "references", "guide.md"))
    await writeFile(join(workDir, "debug.log"), "extra\n", "utf8")

    const result = await assessWorkdirDelta({
      workDir,
      initialManifest,
      allowedNewDirectories: ["design"],
      requiredNewFiles: ["design/design-plan.json"],
    })

    expect(result.status).toBe("fail")
    expect(result.violations).toEqual([
      { code: "UNEXPECTED_ENTRY", path: "debug.log" },
      { code: "REQUIRED_OUTPUT_MISSING", path: "design/design-plan.json" },
      { code: "INITIAL_ENTRY_MISSING", path: "references/guide.md" },
      { code: "INITIAL_FILE_MODIFIED", path: "study.json" },
    ])
  })

  test("allows only explicitly declared initial files to be modified", async () => {
    const { workDir, manifestPath } = await createRunRoot()
    const reference = await writeInitialWorkdirManifest({ workDir, manifestPath })
    const initialManifest = await readInitialWorkdirManifest({ workDir, reference })
    await writeFile(join(workDir, "study.json"), "changed\n", "utf8")
    await writeFile(join(workDir, "references", "guide.md"), "unauthorized\n", "utf8")

    const result = await assessWorkdirDelta({
      workDir,
      initialManifest,
      allowedNewDirectories: [],
      requiredNewFiles: [],
      allowedModifiedFiles: ["study.json"],
    })

    expect(result).toEqual({
      status: "fail",
      violations: [{ code: "INITIAL_FILE_MODIFIED", path: "references/guide.md" }],
    })
  })
})
