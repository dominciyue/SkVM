import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { z } from "zod"
import { PublicOutputAbiV2Schema } from "../../bench/public-output-abi-v2.ts"
import { BenchTaskFileSchema } from "../../bench/types.ts"

const ROOT = "benchmarks/skill-ir/pilots/i18n-helper/contribution-v2"

const SemanticsSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-report-semantics/v1"),
  originalTextPlaceholderSyntax: z.literal("single-brace"),
  localeInterpolationSyntax: z.literal("double-brace"),
  pluralKeyPolicy: z.literal("i18next-v4"),
}).strict()

type Task = {
  id: string
  split: "development" | "held-out"
  prompt: string
  fixtures: Record<string, string>
  eval: Array<{ id: string; weight: number; evaluatorId: string; payload: { schemaVersion: string } }>
  hardGateIds: string[]
  passThreshold: number
}

async function readJson(relativePath: string): Promise<any> {
  return JSON.parse(await readFile(`${ROOT}/${relativePath}`, "utf8"))
}

describe("i18n-helper contribution v2 benchmark contract", () => {
  test("publishes placeholder and plural semantics without answer-bearing keys", async () => {
    const [contract, semantics, development, heldout] = await Promise.all([
      readJson("public-contract.json"),
      readJson("i18n-report-semantics.json"),
      readJson("development/tasks.json"),
      readJson("heldout/tasks.json"),
    ])
    const tasks = [...development.tasks, ...heldout.tasks] as Task[]

    expect(PublicOutputAbiV2Schema.parse(contract.outputAbi)).toEqual(contract.outputAbi)
    expect(SemanticsSchema.parse(semantics)).toEqual(semantics)
    expect(BenchTaskFileSchema.array().parse(tasks)).toHaveLength(4)
    expect(development.skillId).toBe("i18n-helper-contribution-v2")
    expect(heldout.skillId).toBe("i18n-helper-contribution-v2")
    expect(development.tasks.map((task: Task) => task.split)).toEqual(["development", "development"])
    expect(heldout.tasks.map((task: Task) => task.split)).toEqual(["held-out", "held-out"])
    expect(new Set(tasks.map((task) => task.id)).size).toBe(4)
    expect(contract.protectedFiles).toContain("i18n-report-semantics.json")

    for (const task of tasks) {
      expect(JSON.parse(task.fixtures["i18n-contract.json"]!)).toEqual(contract)
      expect(JSON.parse(task.fixtures["i18n-report-semantics.json"]!)).toEqual(semantics)
      expect(task.fixtures["baseline/src/App.tsx"]).toBe(task.fixtures["src/App.tsx"])
      expect(task.fixtures["baseline/src/Panel.tsx"]).toBe(task.fixtures["src/Panel.tsx"])
      expect(task.eval.reduce((sum, criterion) => sum + criterion.weight, 0)).toBeCloseTo(1)
      expect(task.eval.every((criterion) => criterion.evaluatorId === "skill-ir-i18n-helper-contribution-v2")).toBe(true)
      expect(task.eval.every((criterion) => criterion.payload.schemaVersion === "skill-ir-i18n-contribution-eval/v2")).toBe(true)
      expect(task.hardGateIds).toEqual(task.eval.map((criterion) => criterion.id))
      expect(task.passThreshold).toBe(1)
      expect(task.prompt).toContain("i18n-report-semantics.json")
      expect(task.prompt).not.toMatch(/(?:welcome|save|notice|inventory)\.[a-z0-9_.-]+/iu)
    }
  })

  test("keeps gold and prior model evidence out of the prospective task identity", async () => {
    const texts = await Promise.all([
      "public-contract.json",
      "i18n-report-semantics.json",
      "development/tasks.json",
      "heldout/tasks.json",
      "public-contract-source-audit.json",
    ].map((file) => readFile(`${ROOT}/${file}`, "utf8")))

    expect(texts.join("\n")).not.toMatch(
      /TEST_ONLY_|expectedAnswer|modelOutput|raw-runs|historicalResult/iu,
    )
  })
})
