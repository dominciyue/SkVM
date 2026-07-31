import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ResourceContractSchema } from "./resource-contract.ts"
import {
  API_TESTER_DEVELOPMENT_TASK_IDS,
  API_TESTER_HELDOUT_TASK_IDS,
  buildApiTesterTaskSet,
  validateApiTesterSourceClosure,
  validateApiTesterTaskSet,
  validateApiTesterTaskSplitFreeze,
} from "./api-tester-contract.ts"

const rootDir = process.cwd()
const pilotRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/api-tester")

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(pilotRoot, relativePath), "utf8")) as unknown
}

describe("api-tester Wave B contract", () => {
  test("freezes the offline Node and yaml runtime contract", async () => {
    const contract = ResourceContractSchema.parse(await readJson("resource-contract.json"))
    expect(contract).toMatchObject({
      inputFormats: ["json", "yaml"],
      network: "forbidden",
      packageInstall: "forbidden",
      interpreter: { fallbackCommand: "node", minimumVersion: "23" },
      probe: { requiredModules: ["yaml"] },
    })
  })

  test("binds the exact MIT upstream source closure", async () => {
    const closure = await validateApiTesterSourceClosure(rootDir)
    expect(closure.commit).toBe("1e221579b0504082d25d5548b194399a7785f10f")
    expect(closure.upstreamSkillSha256).toBe("fdc81d971835c9585af9be44df9bf1ed4310029489009ddf6ace2705395b7be9")
    expect(closure.upstreamLicenseSha256).toBe("494baa32c21079f6ab4cb73815fa8b119045e22f0d8b5c2bd553c4a0905ac1b2")
    expect(closure.skillSha256).toBe("b3447ad9e341154e65d8872d5a2ae046a740979897e1921d0bdc23b70c12060a")
    expect(closure.licenseSha256).toBe("0137c0bf5ebe749bb97f8af36adbae05ed9bd19cc1f01ff30553173adb0544f7")
    expect(closure.normalization).toBe("crlf-to-lf")
  })

  test("rebuilds the committed 2+2 split from the public interface", async () => {
    const interfaceBytes = await readFile(path.join(pilotRoot, "public-interface.json"))
    const development = await readJson("development/tasks.json")
    const heldout = await readJson("heldout/tasks.json")

    expect(development).toEqual(buildApiTesterTaskSet("development", interfaceBytes))
    expect(heldout).toEqual(buildApiTesterTaskSet("heldout", interfaceBytes))
    expect(validateApiTesterTaskSet(development, "development", interfaceBytes).tasks.map((task) => task.id))
      .toEqual([...API_TESTER_DEVELOPMENT_TASK_IDS])
    expect(validateApiTesterTaskSet(heldout, "heldout", interfaceBytes).tasks.map((task) => task.id))
      .toEqual([...API_TESTER_HELDOUT_TASK_IDS])
  })

  test("publishes only the generator ABI and artifact shape, not derived cases", async () => {
    const interfaceValue = await readJson("public-interface.json") as Record<string, unknown>
    expect(interfaceValue).toMatchObject({
      schemaVersion: "skill-ir-api-tester-interface/v1",
      generator: {
        path: "api-test-generator.mjs",
        command: ["node", "api-test-generator.mjs", "--input", "<relative-openapi-path>", "--out", "<relative-plan-path>"],
      },
      outputs: [
        "api-test-generator.mjs",
        "generated/api-test-plan.json",
        "api-test-report.json",
      ],
    })
    const visible = JSON.stringify(await readJson("development/tasks.json"))
    expect(visible).not.toMatch(/expectedAnswer|goldAnswer|sourceQuote|oracle|TEST_ONLY_HELDOUT_API_TESTER/iu)
    expect(visible).not.toContain("every required property must have a missing-property case")
  })

  test("rejects development leakage and forbidden execution permissions", async () => {
    const interfaceBytes = await readFile(path.join(pilotRoot, "public-interface.json"))
    const development = buildApiTesterTaskSet("development", interfaceBytes)
    const goldLeak = structuredClone(development) as unknown as Record<string, unknown>
    ;(goldLeak.tasks as Array<Record<string, unknown>>)[0]!.goldAnswer = "private cases"
    expect(() => validateApiTesterTaskSet(goldLeak, "development", interfaceBytes)).toThrow("forbidden evidence")

    const heldoutLeak = structuredClone(development)
    heldoutLeak.tasks[0]!.prompt += " TEST_ONLY_HELDOUT_API_TESTER"
    expect(() => validateApiTesterTaskSet(heldoutLeak, "development", interfaceBytes)).toThrow("held-out evidence")

    const networkLeak = structuredClone(development)
    networkLeak.tasks[0]!.prompt += " Install dependencies from the network."
    expect(() => validateApiTesterTaskSet(networkLeak, "development", interfaceBytes)).toThrow("forbidden execution")
  })

  test("validates the split freeze and detects task drift", async () => {
    const freeze = await readJson("task-split-freeze.json")
    const validated = await validateApiTesterTaskSplitFreeze({ rootDir, freeze })
    expect(validated.skillId).toBe("api-tester")
    expect(validated.development.taskIds).toEqual([...API_TESTER_DEVELOPMENT_TASK_IDS])
    expect(validated.heldout.taskIds).toEqual([...API_TESTER_HELDOUT_TASK_IDS])

    const drift = structuredClone(freeze) as { development: { sha256: string } }
    drift.development.sha256 = "0".repeat(64)
    await expect(validateApiTesterTaskSplitFreeze({ rootDir, freeze: drift })).rejects.toThrow("digest mismatch")
  })
})
