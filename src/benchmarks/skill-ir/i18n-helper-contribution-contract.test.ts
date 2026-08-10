import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchTaskFileSchema } from "../../bench/types.ts"
import { PublicOutputAbiV2Schema } from "../../bench/public-output-abi-v2.ts"

const ROOT = "benchmarks/skill-ir/pilots/i18n-helper/contribution-v1"

type Task = {
  id: string
  split: "development" | "held-out"
  prompt: string
  fixtures: Record<string, string>
  eval: Array<{ id: string; weight: number; evaluatorId: string }>
  hardGateIds: string[]
  passThreshold: number
}

async function readJson(relativePath: string): Promise<any> {
  return JSON.parse(await readFile(`${ROOT}/${relativePath}`, "utf8"))
}

describe("i18n-helper contribution-identifiable benchmark contract", () => {
  test("freezes a public 2+2 task surface without answer-bearing keys", async () => {
    const [contract, development, heldout] = await Promise.all([
      readJson("public-contract.json"),
      readJson("development/tasks.json"),
      readJson("heldout/tasks.json"),
    ])
    const tasks = [...development.tasks, ...heldout.tasks] as Task[]

    expect(PublicOutputAbiV2Schema.parse(contract.outputAbi)).toEqual(contract.outputAbi)
    expect(BenchTaskFileSchema.array().parse(tasks)).toHaveLength(4)
    expect(development.skillId).toBe("i18n-helper-contribution-v1")
    expect(heldout.skillId).toBe("i18n-helper-contribution-v1")
    expect(development.tasks.map((task: Task) => task.split)).toEqual(["development", "development"])
    expect(heldout.tasks.map((task: Task) => task.split)).toEqual(["held-out", "held-out"])
    expect(new Set(tasks.map((task) => task.id)).size).toBe(4)

    for (const task of tasks) {
      expect(JSON.parse(task.fixtures["i18n-contract.json"]!)).toEqual(contract)
      expect(task.fixtures["baseline/src/App.tsx"]).toBe(task.fixtures["src/App.tsx"])
      expect(task.fixtures["baseline/src/Panel.tsx"]).toBe(task.fixtures["src/Panel.tsx"])
      expect(task.fixtures["baseline/src/locales/zh-CN.json"]).toBeDefined()
      expect(task.fixtures["baseline/src/locales/en-US.json"]).toBeDefined()
      expect(task.eval.reduce((sum, criterion) => sum + criterion.weight, 0)).toBeCloseTo(1)
      expect(task.eval.every((criterion) => criterion.evaluatorId === "skill-ir-i18n-helper-contribution-v1")).toBe(true)
      expect(task.hardGateIds).toEqual(task.eval.map((criterion) => criterion.id))
      expect(task.passThreshold).toBe(1)
      expect(task.prompt).not.toMatch(/(?:welcome|save|notice|inventory)\.[a-z0-9_.-]+/iu)
    }
  })

  test("keeps evaluator evidence out and binds each semantic claim to public sources", async () => {
    const [contractText, developmentText, heldoutText, auditText] = await Promise.all([
      readFile(`${ROOT}/public-contract.json`, "utf8"),
      readFile(`${ROOT}/development/tasks.json`, "utf8"),
      readFile(`${ROOT}/heldout/tasks.json`, "utf8"),
      readFile(`${ROOT}/public-contract-source-audit.json`, "utf8"),
    ])
    const audit = JSON.parse(auditText) as {
      contractId: string
      claims: Array<{ id: string; origin: string; quote: string }>
      excludedEvidenceClasses: string[]
    }

    expect(audit.contractId).toBe("i18n-helper-contribution-identifiable-v1")
    expect(audit.claims.filter((claim) => claim.origin === "skill-source")).toHaveLength(5)
    expect(audit.claims.every((claim) => claim.quote.length > 8)).toBe(true)
    expect(audit.excludedEvidenceClasses).toEqual(expect.arrayContaining([
      "evaluator-payload",
      "held-out-runtime-output",
      "historical-result",
      "secret-value",
    ]))
    expect(`${contractText}\n${developmentText}\n${heldoutText}\n${auditText}`).not.toMatch(
      /TEST_ONLY_|expectedAnswer|modelOutput|raw-runs|historicalResult/iu,
    )
  })
})
