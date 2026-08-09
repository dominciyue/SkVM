import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchTaskFileSchema } from "../../bench/types.ts"
import { PublicOutputAbiSchema } from "../../bench/public-output-abi.ts"

const cases = [
  {
    label: "Law v3",
    root: "benchmarks/skill-ir/pilots/law-to-markdown/v3",
    skillId: "law-to-markdown-v3",
    contractVersion: "skill-ir-law-to-markdown-public-contract/v3",
    contractId: "law-to-markdown-public-contract-v3",
    contractFixture: "law-contract.json",
  },
  {
    label: "i18n v2",
    root: "benchmarks/skill-ir/pilots/i18n-helper/v2",
    skillId: "i18n-helper-v2",
    contractVersion: "skill-ir-i18n-helper-public-contract/v2",
    contractId: "i18n-helper-react-i18next-v2",
    contractFixture: "i18n-contract.json",
  },
] as const

describe("public output ABI successor contracts", () => {
  for (const item of cases) {
    test(`${item.label} publishes a complete ABI in every visible task contract`, async () => {
      const contract = JSON.parse(await readFile(`${item.root}/public-contract.json`, "utf8")) as {
        schemaVersion: string
        contractId: string
        outputAbi: unknown
      }
      const developmentText = await readFile(`${item.root}/development/tasks.json`, "utf8")
      const heldoutText = await readFile(`${item.root}/heldout/tasks.json`, "utf8")
      const development = JSON.parse(developmentText) as {
        skillId: string
        tasks: Array<{ split: string; fixtures: Record<string, string> }>
      }
      const heldout = JSON.parse(heldoutText) as {
        skillId: string
        tasks: Array<{ split: string; fixtures: Record<string, string> }>
      }

      expect(contract.schemaVersion).toBe(item.contractVersion)
      expect(contract.contractId).toBe(item.contractId)
      expect(JSON.stringify(PublicOutputAbiSchema.parse(contract.outputAbi))).toBe(JSON.stringify(contract.outputAbi))
      expect(development.skillId).toBe(item.skillId)
      expect(heldout.skillId).toBe(item.skillId)
      expect(development.tasks).toHaveLength(2)
      expect(heldout.tasks).toHaveLength(2)
      expect(BenchTaskFileSchema.array().parse([...development.tasks, ...heldout.tasks])).toHaveLength(4)
      expect(development.tasks.every((task) => task.split === "development")).toBe(true)
      expect(heldout.tasks.every((task) => task.split === "held-out")).toBe(true)
      expect([...development.tasks, ...heldout.tasks].every((task) =>
        JSON.stringify(JSON.parse(task.fixtures[item.contractFixture]!)) === JSON.stringify(contract)
      )).toBe(true)
      expect(`${developmentText}\n${heldoutText}`).not.toMatch(
        /TEST_ONLY_|gold|expectedAnswer|evaluatorPayload|modelOutput|historicalResult/iu,
      )
    })
  }

  test("uses unambiguous Law and i18n report field shapes", async () => {
    const law = JSON.parse(await readFile(`${cases[0].root}/public-contract.json`, "utf8")) as any
    const i18n = JSON.parse(await readFile(`${cases[1].root}/public-contract.json`, "utf8")) as any
    expect(law.reviewEvidence.fields).toEqual(["inputPath", "documentClass", "deliverablePath"])
    expect(law.outputAbi.fields.deliverablePath).toEqual({
      required: true,
      schema: {
        type: "string",
        nullable: true,
        enum: ["markdown/document/document+最终成果.md"],
      },
    })
    expect(i18n.outputAbi.fields.missingKeys.schema).toMatchObject({
      type: "object",
      nullable: false,
      additionalProperties: false,
      fields: {
        "zh-CN": { required: true, schema: { type: "array", nullable: false } },
        "en-US": { required: true, schema: { type: "array", nullable: false } },
      },
    })
  })
})
