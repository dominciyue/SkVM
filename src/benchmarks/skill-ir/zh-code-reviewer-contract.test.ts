import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ResourceContractSchema } from "./resource-contract.ts"
import {
  ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS,
  ZH_CODE_REVIEWER_HELDOUT_TASK_IDS,
  buildZhCodeReviewerTaskSet,
  validateZhCodeReviewerSourceClosure,
  validateZhCodeReviewerTaskSet,
  validateZhCodeReviewerTaskSplitFreeze,
} from "./zh-code-reviewer-contract.ts"

const rootDir = process.cwd()
const pilotRoot = path.join(rootDir, "benchmarks/skill-ir/pilots/zh-code-reviewer")

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(pilotRoot, relativePath), "utf8")) as unknown
}

describe("zh-code-reviewer method-development contract", () => {
  test("binds the exact MIT upstream source closure", async () => {
    const closure = await validateZhCodeReviewerSourceClosure(rootDir)
    expect(closure).toMatchObject({
      commit: "1e221579b0504082d25d5548b194399a7785f10f",
      upstreamSkillSha256: "bd4c5dc751189b073173e7715e9c8cfca62662cf9a2847f346f708c33328bdfe",
      upstreamLicenseSha256: "494baa32c21079f6ab4cb73815fa8b119045e22f0d8b5c2bd553c4a0905ac1b2",
    })
  })

  test("freezes an offline source-review resource contract", async () => {
    const contract = ResourceContractSchema.parse(await readJson("resource-contract.json"))
    expect(contract).toMatchObject({
      inputFormats: ["javascript", "typescript"],
      network: "forbidden",
      packageInstall: "forbidden",
      interpreter: { fallbackCommand: "node", minimumVersion: "23" },
      probe: { requiredModules: [] },
    })
  })

  test("publishes evidence locations and severity semantics without finding answers", async () => {
    const publicInterface = await readJson("review-interface.json") as Record<string, unknown>
    expect(publicInterface).toMatchObject({
      schemaVersion: "skill-ir-zh-code-reviewer-interface/v1",
      outputs: ["code-review.json", "code-review.md"],
      finding: {
        requiredFields: ["category", "severity", "path", "line", "symbol", "impact", "recommendation"],
      },
      severity: {
        values: ["critical", "major", "minor"],
      },
    })
    const visible = JSON.stringify(publicInterface)
    expect(visible).not.toMatch(/expectedAnswer|goldAnswer|sourceQuote|oracle|sql-injection|hardcoded-secret/iu)
  })

  test("rebuilds the committed 2+2 split", async () => {
    const interfaceBytes = await readFile(path.join(pilotRoot, "review-interface.json"))
    const development = await readJson("development/tasks.json")
    const heldout = await readJson("heldout/tasks.json")
    expect(development).toEqual(buildZhCodeReviewerTaskSet("development", interfaceBytes))
    expect(heldout).toEqual(buildZhCodeReviewerTaskSet("heldout", interfaceBytes))
    expect(validateZhCodeReviewerTaskSet(development, "development", interfaceBytes).tasks.map((task) => task.id))
      .toEqual([...ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS])
    expect(validateZhCodeReviewerTaskSet(heldout, "heldout", interfaceBytes).tasks.map((task) => task.id))
      .toEqual([...ZH_CODE_REVIEWER_HELDOUT_TASK_IDS])
  })

  test("rejects gold, held-out, and forbidden execution permissions", async () => {
    const interfaceBytes = await readFile(path.join(pilotRoot, "review-interface.json"))
    const development = buildZhCodeReviewerTaskSet("development", interfaceBytes)

    const goldLeak = structuredClone(development) as unknown as Record<string, unknown>
    ;(goldLeak.tasks as Array<Record<string, unknown>>)[0]!.expectedAnswer = "private findings"
    expect(() => validateZhCodeReviewerTaskSet(goldLeak, "development", interfaceBytes)).toThrow("forbidden evidence")

    const heldoutLeak = structuredClone(development)
    heldoutLeak.tasks[0]!.prompt += " TEST_ONLY_HELDOUT_ZH_CODE_REVIEWER"
    expect(() => validateZhCodeReviewerTaskSet(heldoutLeak, "development", interfaceBytes)).toThrow("held-out evidence")

    const networkLeak = structuredClone(development)
    networkLeak.tasks[0]!.prompt += " Install dependencies from the network."
    expect(() => validateZhCodeReviewerTaskSet(networkLeak, "development", interfaceBytes)).toThrow("forbidden execution")
  })

  test("validates the task split freeze and detects drift", async () => {
    const freeze = await readJson("task-split-freeze.json")
    const validated = await validateZhCodeReviewerTaskSplitFreeze({ rootDir, freeze })
    expect(validated.development.taskIds).toEqual([...ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS])
    expect(validated.heldout.taskIds).toEqual([...ZH_CODE_REVIEWER_HELDOUT_TASK_IDS])

    const drift = structuredClone(freeze) as { heldout: { sha256: string } }
    drift.heldout.sha256 = "0".repeat(64)
    await expect(validateZhCodeReviewerTaskSplitFreeze({ rootDir, freeze: drift })).rejects.toThrow("digest mismatch")
  })
})
