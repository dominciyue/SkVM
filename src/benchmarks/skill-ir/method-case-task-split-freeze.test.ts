import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import {
  verifyMethodCaseTaskSplitFreeze,
} from "./method-case-task-split-freeze.ts"

const rootDir = process.cwd()

describe("generic method-case task split freeze", () => {
  for (const [label, freezePath, taskCommit] of [
    ["law v2", "benchmarks/skill-ir/pilots/law-to-markdown/v2/task-split-freeze.json", "b8b2fd7fc15c121bc24c472fca10368f8340b6a0"],
    ["i18n helper", "benchmarks/skill-ir/pilots/i18n-helper/task-split-freeze.json", "12d653ab9a8be7662d05d0bae196223a778cb22d"],
    ["law v3", "benchmarks/skill-ir/pilots/law-to-markdown/v3/task-split-freeze.json", "0fb51dd5deaed602f4e5b18d733c8e5c7b1e81a9"],
    ["i18n helper v2", "benchmarks/skill-ir/pilots/i18n-helper/v2/task-split-freeze.json", "0fb51dd5deaed602f4e5b18d733c8e5c7b1e81a9"],
  ] as const) {
    test(`verifies ${label} against committed source, contract, and 2+2 tasks`, async () => {
      const freeze = JSON.parse(await readFile(freezePath, "utf8"))
      const verified = await verifyMethodCaseTaskSplitFreeze(rootDir, freeze)
      expect(verified.taskCommit).toBe(taskCommit)
      expect(verified.developmentTasks.taskIds).toHaveLength(2)
      expect(verified.heldoutTasks.taskIds).toHaveLength(2)
    })
  }

  test("rejects digest drift and forbidden evidence fields", async () => {
    const freezePath = "benchmarks/skill-ir/pilots/i18n-helper/task-split-freeze.json"
    const freeze = JSON.parse(await readFile(freezePath, "utf8"))
    await expect(verifyMethodCaseTaskSplitFreeze(rootDir, {
      ...freeze,
      publicContract: { ...freeze.publicContract, sha256: "0".repeat(64) },
    })).rejects.toThrow("digest")
    await expect(verifyMethodCaseTaskSplitFreeze(rootDir, {
      ...freeze,
      evaluatorPayload: { answer: "private" },
    })).rejects.toThrow()
  })
})
