import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  parsePreIrRuntimeQualificationArgs,
  runPreIrRuntimeQualification,
} from "./pre-ir-runtime-qualification-run.ts"
import { PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS } from "./pre-ir-runtime-qualification.ts"

describe("pre-IR runtime qualification runner", () => {
  test("parses only the frozen qualification inputs", () => {
    expect(parsePreIrRuntimeQualificationArgs([
      "--executable=.skvm/runtime/skvm.exe",
      "--qualification-id=experimental-design-v2-compiled-runtime-win32-v1",
      `--source-commit=${"a".repeat(40)}`,
      "--out=results/skill-ir/runtime-qualification.json",
    ])).toMatchObject({
      executablePath: ".skvm/runtime/skvm.exe",
      qualificationId: "experimental-design-v2-compiled-runtime-win32-v1",
      sourceCommit: "a".repeat(40),
    })
    expect(() => parsePreIrRuntimeQualificationArgs([
      "--executable=.skvm/runtime/skvm.exe",
      "--qualification-id=runtime-v1",
      `--source-commit=${"a".repeat(40)}`,
      "--out=results/report.json",
      "--attempts=2",
    ])).toThrow("Unknown argument")
  })

  test("runs exactly 20 probes and writes a compact passed report", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "runtime-qualification-run-"))
    try {
      await writeFile(path.join(rootDir, "skvm.exe"), "test executable", "utf8")
      let calls = 0
      const result = await runPreIrRuntimeQualification({
        rootDir,
        executablePath: "skvm.exe",
        qualificationId: "experimental-design-v2-compiled-runtime-win32-v1",
        sourceCommit: "a".repeat(40),
        outPath: "qualification.json",
      }, {
        runProbe: async (command) => {
          calls += 1
          expect(command).toEqual([path.join(rootDir, "skvm.exe"), "--help"])
          return { exitCode: 0, timedOut: false, durationMs: 1, stdout: "private", stderr: "" }
        },
        bunVersion: "1.3.14-test",
      })

      expect(calls).toBe(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS)
      expect(result.status).toBe("passed")
      const persisted = JSON.parse(await readFile(path.join(rootDir, "qualification.json"), "utf8"))
      expect(persisted).toEqual(result)
      expect(JSON.stringify(persisted)).not.toContain("private")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
