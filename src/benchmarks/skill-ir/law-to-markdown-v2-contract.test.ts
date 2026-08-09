import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchTaskFileSchema } from "../../bench/types.ts"

const ROOT = "benchmarks/skill-ir/pilots/law-to-markdown/v2"

describe("law-to-markdown v2 public contract", () => {
  test("freezes a separate 2+2 benchmark with a public semantic contract", async () => {
    const contract = JSON.parse(await readFile(`${ROOT}/public-contract.json`, "utf8")) as {
      schemaVersion: string
      protectedInputs: string[]
      outputs: { review: string; deliverable: string }
      reviewEvidence: { openingMarker: string; fields: string[] }
    }
    const development = JSON.parse(await readFile(`${ROOT}/development/tasks.json`, "utf8")) as {
      skillId: string
      tasks: Array<{ id: string; split: string; fixtures: Record<string, string> }>
    }
    const heldout = JSON.parse(await readFile(`${ROOT}/heldout/tasks.json`, "utf8")) as {
      skillId: string
      tasks: Array<{ id: string; split: string }>
    }
    expect(BenchTaskFileSchema.array().parse([...development.tasks, ...heldout.tasks])).toHaveLength(4)

    expect(contract.schemaVersion).toBe("skill-ir-law-to-markdown-public-contract/v2")
    expect(contract.protectedInputs).toEqual(["document.txt", "law-contract.json"])
    expect(contract.outputs).toEqual({
      review: "markdown/document/document+审核报告.md",
      deliverable: "markdown/document/document+最终成果.md",
    })
    expect(contract.reviewEvidence.openingMarker).toBe("```json law-review-evidence")
    expect(contract.reviewEvidence.fields).toEqual(["inputPath", "documentClass", "deliverable"])
    expect(development.skillId).toBe("law-to-markdown-v2")
    expect(heldout.skillId).toBe("law-to-markdown-v2")
    expect(development.tasks).toHaveLength(2)
    expect(heldout.tasks).toHaveLength(2)
    expect(development.tasks.every((task) => task.split === "development")).toBe(true)
    expect(heldout.tasks.every((task) => task.split === "held-out")).toBe(true)
    expect(new Set([...development.tasks, ...heldout.tasks].map((task) => task.id)).size).toBe(4)
    expect(development.tasks.every((task) =>
      JSON.stringify(JSON.parse(task.fixtures["law-contract.json"]!)) === JSON.stringify(contract)
    )).toBe(true)
  })

  test("does not place private evaluator evidence in the public task files", async () => {
    const text = await Promise.all([
      readFile(`${ROOT}/public-contract.json`, "utf8"),
      readFile(`${ROOT}/development/tasks.json`, "utf8"),
      readFile(`${ROOT}/heldout/tasks.json`, "utf8"),
    ]).then((values) => values.join("\n"))
    expect(text).not.toMatch(/TEST_ONLY_|gold|expectedAnswer|evaluatorPayload|modelOutput/iu)
  })
})
