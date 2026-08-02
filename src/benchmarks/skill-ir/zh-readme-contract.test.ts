import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ResourceContractSchema } from "./resource-contract.ts"
import {
  ZH_README_DEVELOPMENT_TASK_IDS,
  ZH_README_HELDOUT_TASK_IDS,
  buildZhReadmeTaskSet,
  validateZhReadmeSourceClosure,
  validateZhReadmeTaskSet,
  validateZhReadmeTaskSplitFreeze,
} from "./zh-readme-contract.ts"

const rootDir = process.cwd()
const pilotRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/zh-readme")

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(pilotRoot, relativePath), "utf8")) as unknown
}

describe("zh-readme method-development contract", () => {
  test("binds the exact MIT upstream source closure", async () => {
    const closure = await validateZhReadmeSourceClosure(rootDir)
    expect(closure).toMatchObject({
      commit: "1e221579b0504082d25d5548b194399a7785f10f",
      upstreamSkillSha256: "e30e84d26619413df6e2f5a02c0392f54f027acb7d8333545e62c336551be85b",
      upstreamLicenseSha256: "494baa32c21079f6ab4cb73815fa8b119045e22f0d8b5c2bd553c4a0905ac1b2",
    })
  })

  test("freezes an offline repository-reading resource contract", async () => {
    const contract = ResourceContractSchema.parse(await readJson("resource-contract.json"))
    expect(contract).toMatchObject({
      inputFormats: ["json", "toml", "javascript", "python", "markdown", "text"],
      network: "forbidden",
      packageInstall: "forbidden",
      interpreter: { fallbackCommand: "node", minimumVersion: "23" },
      probe: { requiredModules: [] },
    })
  })

  test("publishes source-derived README semantics without private facts", async () => {
    const publicInterface = await readJson("readme-interface.json") as Record<string, unknown>
    expect(publicInterface).toMatchObject({
      schemaVersion: "skill-ir-zh-readme-interface/v1",
      outputs: ["README.zh-CN.md"],
      language: { primary: "zh-CN", technicalEnglishAllowed: true },
      outputPolicy: { exactOutputSet: true, protectedInputsMutable: false },
    })
    const visible = JSON.stringify(publicInterface)
    expect(visible).not.toMatch(/expectedAnswer|goldAnswer|sourceQuote|oracle|echo-lab|note-index/iu)
  })

  test("rebuilds the committed 2+2 repository split", async () => {
    const interfaceBytes = await readFile(path.join(pilotRoot, "readme-interface.json"))
    const development = await readJson("development/tasks.json")
    const heldout = await readJson("heldout/tasks.json")
    expect(development).toEqual(buildZhReadmeTaskSet("development", interfaceBytes))
    expect(heldout).toEqual(buildZhReadmeTaskSet("heldout", interfaceBytes))
    expect(validateZhReadmeTaskSet(development, "development", interfaceBytes).tasks.map((task) => task.id))
      .toEqual([...ZH_README_DEVELOPMENT_TASK_IDS])
    expect(validateZhReadmeTaskSet(heldout, "heldout", interfaceBytes).tasks.map((task) => task.id))
      .toEqual([...ZH_README_HELDOUT_TASK_IDS])
  })

  test("rejects gold, held-out, and forbidden execution permissions", async () => {
    const interfaceBytes = await readFile(path.join(pilotRoot, "readme-interface.json"))
    const development = buildZhReadmeTaskSet("development", interfaceBytes)

    const goldLeak = structuredClone(development) as unknown as Record<string, unknown>
    ;(goldLeak.tasks as Array<Record<string, unknown>>)[0]!.expectedAnswer = "private repository facts"
    expect(() => validateZhReadmeTaskSet(goldLeak, "development", interfaceBytes)).toThrow("forbidden evidence")

    const heldoutLeak = structuredClone(development)
    heldoutLeak.tasks[0]!.prompt += " TEST_ONLY_HELDOUT_ZH_README"
    expect(() => validateZhReadmeTaskSet(heldoutLeak, "development", interfaceBytes)).toThrow("held-out evidence")

    const networkLeak = structuredClone(development)
    networkLeak.tasks[0]!.prompt += " Install packages and inspect the live website."
    expect(() => validateZhReadmeTaskSet(networkLeak, "development", interfaceBytes)).toThrow("forbidden execution")
  })

  test("validates the task split freeze and detects drift", async () => {
    const freeze = await readJson("task-split-freeze.json")
    const validated = await validateZhReadmeTaskSplitFreeze({ rootDir, freeze })
    expect(validated.development.taskIds).toEqual([...ZH_README_DEVELOPMENT_TASK_IDS])
    expect(validated.heldout.taskIds).toEqual([...ZH_README_HELDOUT_TASK_IDS])

    const drift = structuredClone(freeze) as { development: { sha256: string } }
    drift.development.sha256 = "0".repeat(64)
    await expect(validateZhReadmeTaskSplitFreeze({ rootDir, freeze: drift })).rejects.toThrow("digest mismatch")
  })
})
