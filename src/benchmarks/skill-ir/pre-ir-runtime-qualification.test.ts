import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS,
  projectQualifiedPreIrCommand,
  summarizePreIrRuntimeQualification,
  verifyPreIrExecutionRuntimeGuard,
} from "./pre-ir-runtime-qualification.ts"
import { sha256Bytes } from "./source-fixture.ts"

const sourceCommit = "a".repeat(40)

function successfulExecutions() {
  return Array.from({ length: PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS }, (_, index) => ({
    exitCode: 0,
    timedOut: false,
    durationMs: index + 1,
    stdout: "private help text",
    stderr: "",
  }))
}

describe("pre-IR execution runtime qualification", () => {
  test("freezes a fixed 20-probe zero-failure compact report", () => {
    const report = summarizePreIrRuntimeQualification({
      qualificationId: "experimental-design-v2-compiled-runtime-win32-v1",
      executable: { path: ".skvm/runtime/skvm.exe", sha256: "b".repeat(64) },
      sourceCommit,
      bunVersion: "1.3.14",
      platform: "win32",
      arch: "x64",
      executions: successfulExecutions(),
    })

    expect(report.status).toBe("passed")
    expect(report.probe).toEqual({
      args: ["--help"],
      attempts: 20,
      successes: 20,
      failures: 0,
      timeouts: 0,
      bunCrashes: 0,
    })
    expect(report.issues).toEqual([])
    expect(JSON.stringify(report)).not.toContain("private help text")
    expect(JSON.stringify(report)).not.toMatch(/[A-Z]:\\\\/)
  })

  test("fails qualification when a probe has a Bun crash signature", () => {
    const executions = successfulExecutions()
    executions[7] = {
      exitCode: 3,
      timedOut: false,
      durationMs: 8,
      stdout: "",
      stderr: "panic(main thread): Internal assertion failure",
    }

    const report = summarizePreIrRuntimeQualification({
      qualificationId: "experimental-design-v2-compiled-runtime-win32-v1",
      executable: { path: ".skvm/runtime/skvm.exe", sha256: "b".repeat(64) },
      sourceCommit,
      bunVersion: "1.3.14",
      platform: "win32",
      arch: "x64",
      executions,
    })

    expect(report.status).toBe("failed")
    expect(report.probe).toMatchObject({ successes: 19, failures: 1, bunCrashes: 1 })
    expect(report.issues).toEqual(["bun-runtime-crash", "nonzero-exit"])
    expect(JSON.stringify(report)).not.toContain("Internal assertion")
  })

  test("verifies executable and report digests and rejects platform drift", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "pre-ir-runtime-qualification-"))
    try {
      const executablePath = path.join(rootDir, "runtime", "skvm.exe")
      const reportPath = path.join(rootDir, "runtime", "qualification.json")
      await mkdir(path.dirname(executablePath), { recursive: true })
      await writeFile(executablePath, "qualified runtime", "utf8")
      const executableSha256 = sha256Bytes(Buffer.from("qualified runtime", "utf8"))
      const report = summarizePreIrRuntimeQualification({
        qualificationId: "experimental-design-v2-compiled-runtime-win32-v1",
        executable: { path: "runtime/skvm.exe", sha256: executableSha256 },
        sourceCommit,
        bunVersion: "1.3.14",
        platform: process.platform,
        arch: process.arch,
        executions: successfulExecutions(),
      })
      const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8")
      await writeFile(reportPath, reportBytes)
      const guard = {
        kind: "compiled-skvm" as const,
        commandMode: "direct" as const,
        sourceCommit,
        executable: { path: "runtime/skvm.exe", sha256: executableSha256 },
        qualification: { path: "runtime/qualification.json", sha256: sha256Bytes(reportBytes) },
      }

      await expect(verifyPreIrExecutionRuntimeGuard(guard, rootDir)).resolves.toEqual(report)
      await expect(verifyPreIrExecutionRuntimeGuard({
        ...guard,
        executable: { ...guard.executable, sha256: "0".repeat(64) },
      }, rootDir)).rejects.toThrow("digest mismatch")

      await writeFile(reportPath, `${JSON.stringify({
        ...report,
        runtime: { ...report.runtime, platform: process.platform === "win32" ? "linux" : "win32" },
      }, null, 2)}\n`, "utf8")
      const driftBytes = await Bun.file(reportPath).arrayBuffer()
      await expect(verifyPreIrExecutionRuntimeGuard({
        ...guard,
        qualification: { ...guard.qualification, sha256: sha256Bytes(Buffer.from(driftBytes)) },
      }, rootDir)).rejects.toThrow("platform")
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test("projects only the exact workspace command prefix to a direct executable", () => {
    expect(projectQualifiedPreIrCommand(
      ["bun", "run", "skvm", "run", "--task=task.json", "--model=xty/gpt-5.6-sol"],
      "D:/runtime/skvm.exe",
    )).toEqual([
      path.resolve("D:/runtime/skvm.exe"),
      "run",
      "--task=task.json",
      "--model=xty/gpt-5.6-sol",
    ])
    expect(() => projectQualifiedPreIrCommand(
      ["bun", "src/index.ts", "run"],
      "D:/runtime/skvm.exe",
    )).toThrow("command prefix")
  })
})
