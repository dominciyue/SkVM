import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  parsePreIrFetchActiveQualificationArgs,
  runPreIrFetchActiveQualification,
} from "./pre-ir-fetch-active-qualification-run.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/experimental-design-v2-runtime-qualified-calibration-lock.json",
)

async function writePublicContract(workDir: string): Promise<void> {
  await mkdir(workDir, { recursive: true })
  await writeFile(path.join(workDir, "design-contract.json"), JSON.stringify({
    outputs: [
      "design/design-plan.json",
      "design/allocation.csv",
      "design/design-report.md",
    ],
  }), "utf8")
}

describe("pre-IR fetch-active runtime qualification", () => {
  test("parses the closed lock-bound CLI", () => {
    expect(parsePreIrFetchActiveQualificationArgs([
      `--root-dir=${rootDir}`,
      `--lock=${lockPath}`,
      "--qualification-id=experimental-design-v2-fetch-active-runtime-v1",
      "--out-dir=results/skill-ir/fetch-active-test",
      "--report=results/skill-ir/fetch-active-test.json",
    ])).toMatchObject({
      qualificationId: "experimental-design-v2-fetch-active-runtime-v1",
    })
    expect(() => parsePreIrFetchActiveQualificationArgs([
      `--lock=${lockPath}`,
      "--qualification-id=x",
      "--out-dir=x",
      "--report=x.json",
      "--retries=1",
    ])).toThrow("Unknown argument")
  })

  test("passes only when the real route exits cleanly and every public output exists", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "fetch-active-pass-"))
    try {
      const report = await runPreIrFetchActiveQualification({
        rootDir,
        lockPath,
        qualificationId: "experimental-design-v2-fetch-active-runtime-pass-v1",
        outDir,
        reportPath: path.join(outDir, "report.json"),
      }, async (entry) => {
        await writePublicContract(entry.workDir)
        const designDir = path.join(entry.workDir, "design")
        await mkdir(designDir, { recursive: true })
        await Promise.all([
          writeFile(path.join(designDir, "design-plan.json"), "{}\n", "utf8"),
          writeFile(path.join(designDir, "allocation.csv"), "order,unit_id,stratum,arm\n", "utf8"),
          writeFile(path.join(designDir, "design-report.md"), "report\n", "utf8"),
        ])
        return { exitCode: 0, timedOut: false, durationMs: 10, stdout: "private", stderr: "" }
      })

      expect(report).toMatchObject({
        schemaVersion: "skill-ir-fetch-active-runtime-qualification/v1",
        methodEvidence: false,
        status: "passed",
        outputMaterialization: { declared: 3, present: 3, missing: [] },
        diagnostic: { failureCode: "none" },
      })
      expect(JSON.stringify(report)).not.toContain("private")
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 15_000)

  test("freezes a Bun crash as failed without requiring task outputs", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "fetch-active-fail-"))
    try {
      const report = await runPreIrFetchActiveQualification({
        rootDir,
        lockPath,
        qualificationId: "experimental-design-v2-fetch-active-runtime-fail-v1",
        outDir,
        reportPath: path.join(outDir, "report.json"),
      }, async (entry) => {
        await writePublicContract(entry.workDir)
        return {
          exitCode: 3,
          timedOut: false,
          durationMs: 10,
          stdout: "",
          stderr: "Bun v1.3.14 (0d9b296a) Windows x64\npanic(main thread): Internal assertion failure",
        }
      })

      expect(report).toMatchObject({
        status: "failed",
        outputMaterialization: { declared: 3, present: 0 },
        diagnostic: { failureCode: "bun-internal-assertion" },
      })
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  }, 15_000)
})
