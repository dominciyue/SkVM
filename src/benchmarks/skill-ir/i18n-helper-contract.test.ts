import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchTaskFileSchema } from "../../bench/types.ts"

const ROOT = "benchmarks/skill-ir/pilots/i18n-helper"

describe("i18n-helper React+i18next pilot contract", () => {
  test("binds the exact upstream source and a narrow React+i18next contract", async () => {
    const source = await readFile(`${ROOT}/source/SKILL.md`, "utf8")
    const license = await readFile(`${ROOT}/source/LICENSE.upstream`, "utf8")
    const contract = JSON.parse(await readFile(`${ROOT}/public-contract.json`, "utf8")) as {
      schemaVersion: string
      framework: string
      allowedModifiedFiles: string[]
      requiredNewFiles: string[]
      excludedTextClasses: string[]
    }

    expect(source).toContain("name: i18n-helper")
    expect(license).toContain("MIT License")
    expect(contract.schemaVersion).toBe("skill-ir-i18n-helper-public-contract/v1")
    expect(contract.framework).toBe("react-i18next")
    expect(contract.allowedModifiedFiles).toEqual(["src/App.tsx"])
    expect(contract.requiredNewFiles).toEqual([
      "src/i18n.ts",
      "src/locales/zh-CN.json",
      "src/locales/en-US.json",
      "i18n-report.json",
    ])
    expect(contract.excludedTextClasses).toEqual([
      "import-path",
      "url",
      "technical-term",
      "test-selector",
      "debug-log",
    ])
  })

  test("freezes two development and two held-out tasks without private evidence", async () => {
    const developmentText = await readFile(`${ROOT}/development/tasks.json`, "utf8")
    const heldoutText = await readFile(`${ROOT}/heldout/tasks.json`, "utf8")
    const development = JSON.parse(developmentText) as { skillId: string; tasks: Array<{ id: string; split: string }> }
    const heldout = JSON.parse(heldoutText) as { skillId: string; tasks: Array<{ id: string; split: string }> }

    expect(development.skillId).toBe("i18n-helper")
    expect(heldout.skillId).toBe("i18n-helper")
    expect(development.tasks).toHaveLength(2)
    expect(heldout.tasks).toHaveLength(2)
    expect(development.tasks.every((task) => task.split === "development")).toBe(true)
    expect(heldout.tasks.every((task) => task.split === "held-out")).toBe(true)
    expect(BenchTaskFileSchema.array().parse([...development.tasks, ...heldout.tasks])).toHaveLength(4)
    expect(`${developmentText}\n${heldoutText}`).not.toMatch(/TEST_ONLY_|gold|expectedAnswer|evaluatorPayload|modelOutput/iu)
  })
})
