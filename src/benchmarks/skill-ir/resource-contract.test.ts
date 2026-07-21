import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  ResourceContractSchema,
  runResourceProbe,
} from "./resource-contract.ts"
import {
  parseResourceProbeArgs,
  runResourceProbeFile,
} from "./resource-contract-run.ts"

describe("resource contract", () => {
  test("parses the committed law-to-markdown contract", async () => {
    const contractPath = path.join(
      import.meta.dir,
      "../../../benchmarks/skill-ir/pilots/law-to-markdown/resource-contract.json",
    )
    const contract = ResourceContractSchema.parse(JSON.parse(await readFile(contractPath, "utf8")))

    expect(contract).toMatchObject({
      inputFormats: ["txt"],
      network: "forbidden",
      packageInstall: "forbidden",
      interpreter: {
        env: "SKVM_PYTHON",
        fallbackCommand: "python",
      },
      missingDependencyDisposition: "preflight-infrastructure",
    })
    expect(contract.probe.requiredModules).toEqual(["docx", "pdfplumber"])
  })

  test("uses the environment-selected executable without invoking a shell", async () => {
    const contract = ResourceContractSchema.parse({
      schemaVersion: "skill-ir-resource-contract/v1",
      inputFormats: ["txt"],
      network: "forbidden",
      packageInstall: "forbidden",
      interpreter: {
        env: "SKVM_TEST_RUNTIME",
        fallbackCommand: "definitely-not-a-real-command",
        minimumVersion: "1",
      },
      probe: {
        args: ["-e", "console.log('resource-probe-ok')"],
        requiredModules: ["synthetic-module"],
        successMarker: "resource-probe-ok",
      },
      missingDependencyDisposition: "preflight-infrastructure",
    })

    const result = await runResourceProbe(contract, {
      env: { SKVM_TEST_RUNTIME: process.execPath },
    })

    expect(result).toMatchObject({
      schemaVersion: "skill-ir-resource-probe-result/v1",
      methodEvidence: false,
      status: "ok",
      executableSource: "env",
      requiredModules: ["synthetic-module"],
      exitCode: 0,
    })
    expect(JSON.stringify(result)).not.toContain(process.execPath)
  })

  test("fails closed when neither selected nor fallback executable can start", async () => {
    const contract = ResourceContractSchema.parse({
      schemaVersion: "skill-ir-resource-contract/v1",
      inputFormats: ["txt"],
      network: "forbidden",
      packageInstall: "forbidden",
      interpreter: {
        env: "SKVM_MISSING_RUNTIME",
        fallbackCommand: "definitely-not-a-real-command",
        minimumVersion: "1",
      },
      probe: {
        args: ["--version"],
        requiredModules: [],
        successMarker: "never",
      },
      missingDependencyDisposition: "preflight-infrastructure",
    })

    const result = await runResourceProbe(contract, { env: {} })
    expect(result).toMatchObject({
      status: "unavailable",
      executableSource: "fallback",
      exitCode: null,
    })
    expect(result.stderrClass).toBe("spawn-failed")
  })

  test("CLI runner validates a contract and writes a compact result", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "resource-contract-cli-"))
    try {
      const contractPath = path.join(rootDir, "contract.json")
      const outPath = path.join(rootDir, "result.json")
      await writeFile(contractPath, JSON.stringify({
        schemaVersion: "skill-ir-resource-contract/v1",
        inputFormats: ["txt"],
        network: "forbidden",
        packageInstall: "forbidden",
        interpreter: {
          env: "SKVM_TEST_RUNTIME",
          fallbackCommand: "not-used",
          minimumVersion: "1",
        },
        probe: {
          args: ["-e", "console.log('resource-probe-ok')"],
          requiredModules: [],
          successMarker: "resource-probe-ok",
        },
        missingDependencyDisposition: "preflight-infrastructure",
      }), "utf8")

      const args = parseResourceProbeArgs([
        `--root-dir=${rootDir}`,
        "--contract=contract.json",
        "--out=result.json",
      ])
      const result = await runResourceProbeFile(args, {
        SKVM_TEST_RUNTIME: process.execPath,
      })

      expect(result.status).toBe("ok")
      expect(JSON.parse(await readFile(outPath, "utf8"))).toEqual(result)
      expect(() => parseResourceProbeArgs([`--root-dir=${rootDir}`, "--contract=../escape.json", "--out=result.json"])).toThrow()
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
