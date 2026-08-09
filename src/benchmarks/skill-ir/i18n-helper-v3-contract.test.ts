import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { BenchTaskFileSchema } from "../../bench/types.ts"
import { PublicOutputAbiV2Schema } from "../../bench/public-output-abi-v2.ts"
import {
  MethodCaseTaskSplitFreezeSchema,
  verifyMethodCaseTaskSplitFreeze,
} from "./method-case-task-split-freeze.ts"

const root = "benchmarks/skill-ir/pilots/i18n-helper/v3"

describe("i18n-helper v3 public contract", () => {
  test("publishes explicit array semantics in all 2+2 task fixtures", async () => {
    const contract = JSON.parse(await readFile(`${root}/public-contract.json`, "utf8")) as any
    const developmentText = await readFile(`${root}/development/tasks.json`, "utf8")
    const heldoutText = await readFile(`${root}/heldout/tasks.json`, "utf8")
    const development = JSON.parse(developmentText) as any
    const heldout = JSON.parse(heldoutText) as any

    expect(contract.schemaVersion).toBe("skill-ir-i18n-helper-public-contract/v3")
    expect(contract.contractId).toBe("i18n-helper-react-i18next-v3")
    expect(PublicOutputAbiV2Schema.parse(contract.outputAbi)).toEqual(contract.outputAbi)
    expect(contract.outputAbi.fields.scannedFiles.schema).toMatchObject({
      type: "array", order: "ordered", duplicates: "forbid",
    })
    expect(contract.outputAbi.fields.extractedKeys.schema).toMatchObject({
      type: "array", order: "set-like", duplicates: "forbid",
    })
    for (const locale of ["zh-CN", "en-US"]) {
      expect(contract.outputAbi.fields.missingKeys.schema.fields[locale].schema).toMatchObject({
        type: "array", order: "set-like", duplicates: "forbid",
      })
    }

    expect(development.skillId).toBe("i18n-helper-v3")
    expect(heldout.skillId).toBe("i18n-helper-v3")
    expect(development.tasks).toHaveLength(2)
    expect(heldout.tasks).toHaveLength(2)
    expect(BenchTaskFileSchema.array().parse([...development.tasks, ...heldout.tasks])).toHaveLength(4)
    expect(development.tasks.every((task: any) => task.split === "development")).toBe(true)
    expect(heldout.tasks.every((task: any) => task.split === "held-out")).toBe(true)
    expect([...development.tasks, ...heldout.tasks].every((task: any) =>
      JSON.stringify(JSON.parse(task.fixtures["i18n-contract.json"])) === JSON.stringify(contract)
    )).toBe(true)
    expect(`${developmentText}\n${heldoutText}`).not.toMatch(
      /TEST_ONLY_|gold|expectedAnswer|evaluatorPayload|modelOutput|historicalResult/iu,
    )
  })

  test("keeps the source audit public and excludes evaluation evidence", async () => {
    const auditText = await readFile(`${root}/public-contract-source-audit.json`, "utf8")
    const audit = JSON.parse(auditText) as any
    expect(audit.contractId).toBe("i18n-helper-react-i18next-v3")
    expect(audit.claims.some((claim: any) => claim.id === "array-semantics")).toBe(true)
    expect(audit.excludedEvidenceClasses).toEqual(expect.arrayContaining([
      "evaluator-payload",
      "held-out-runtime-output",
      "historical-result",
      "profile-feedback",
      "secret-value",
    ]))
    expect(auditText).not.toMatch(/expectedAnswer|modelOutput|raw-runs/iu)
  })

  test("binds the 2+2 split to the pre-scorer task commit", async () => {
    const freeze = MethodCaseTaskSplitFreezeSchema.parse(JSON.parse(
      await readFile(`${root}/task-split-freeze.json`, "utf8"),
    ))
    expect(freeze.benchmarkId).toBe("i18n-helper-v3")
    expect(freeze.taskCommit).toBe("249a7b4c007f3f49a0e9bfadfaf27acb7ecce2cc")
    expect(freeze.developmentTasks.taskIds).toEqual([
      "i18n-helper-v3-react-basic-dev-001",
      "i18n-helper-v3-react-interpolation-dev-002",
    ])
    expect(freeze.heldoutTasks.taskIds).toEqual([
      "i18n-helper-v3-react-notice-heldout-001",
      "i18n-helper-v3-react-count-heldout-002",
    ])
    await expect(verifyMethodCaseTaskSplitFreeze(process.cwd(), freeze)).resolves.toEqual(freeze)
  })
})
