import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  PiPackageExecutionProbeReportSchema,
  runPiPackageExecutionProbe,
} from "./pi-package-execution-probe.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const tempDirs: string[] = []

afterAll(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true })
})

describe("Pi package execution probe", () => {
  test("freezes a successful Node package CLI spawn without paths or raw streams", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "skvm-pi-probe-"))
    tempDirs.push(outDir)
    const outPath = path.join(outDir, "probe.json")
    const report = await runPiPackageExecutionProbe({ rootDir, outPath })

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-pi-package-execution-probe/v1",
      methodEvidence: false,
      status: "passed",
      commandKind: "node-installed-package-cli",
      pi: { version: "0.67.68" },
      execution: { exitCode: 0, timedOut: false, failureClass: "none" },
    })
    expect(report.node).not.toBeNull()
    expect(report.node!.version).toMatch(/^v\d+\.\d+\.\d+$/u)
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(rootDir)
    expect(serialized).not.toContain(".bin")
    expect(serialized).not.toContain("stdout")
    expect(serialized).not.toContain("stderr")
    expect(PiPackageExecutionProbeReportSchema.parse(
      JSON.parse(await readFile(outPath, "utf8")),
    )).toEqual(report)
  })

  test("fails closed when the direct package command is unavailable", async () => {
    const report = await runPiPackageExecutionProbe({ rootDir }, {
      resolveCommand: async () => null,
    })
    expect(report).toMatchObject({
      status: "failed",
      commandKind: "unavailable",
      execution: { failureClass: "command-unavailable" },
    })
  })

  test("fails closed on version drift, timeout, or mixed output streams", async () => {
    const command = ["C:\\Program Files\\nodejs\\node.exe", "C:\\pi\\dist\\cli.js"]
    const base = {
      resolveCommand: async () => command,
      fileDigest: async () => "a".repeat(64),
    }
    const nodeResult = {
      exitCode: 0,
      stdout: "v22.0.0\n",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }
    const mismatch = await runPiPackageExecutionProbe({ rootDir }, {
      ...base,
      execute: async (cmd) => cmd.includes("--version") && cmd.length === 2
        ? nodeResult
        : { ...nodeResult, stdout: "0.67.67\n" },
    })
    expect(mismatch).toMatchObject({ status: "failed", execution: { failureClass: "pi-version-mismatch" } })

    const timedOut = await runPiPackageExecutionProbe({ rootDir }, {
      ...base,
      execute: async () => ({ ...nodeResult, exitCode: 1, timedOut: true }),
    })
    expect(timedOut).toMatchObject({ status: "failed", execution: { failureClass: "timeout" } })

    const mixed = await runPiPackageExecutionProbe({ rootDir }, {
      ...base,
      execute: async (cmd) => cmd.length === 2
        ? nodeResult
        : { ...nodeResult, stdout: "0.67.68\n", stderr: "0.67.68\n" },
    })
    expect(mixed).toMatchObject({ status: "failed", execution: { failureClass: "mixed-version-streams" } })
  })
})
