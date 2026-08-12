import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import {
  MethodCaseDevelopmentFreezeSchema,
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
      expect(verified.schemaVersion).toBe("skill-ir-method-case-task-split-freeze/v1")
      expect(verified.taskCommit).toBe(taskCommit)
      expect(verified.developmentTasks.taskIds).toHaveLength(2)
      if (verified.schemaVersion !== "skill-ir-method-case-task-split-freeze/v1") {
        throw new Error("expected historical 2+2 task split freeze")
      }
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

  test("permits an explicit development-only freeze without inventing held-out tasks", () => {
    const frozenFile = { path: "fixtures/example.json", sha256: "0".repeat(64) }
    expect(MethodCaseDevelopmentFreezeSchema.parse({
      schemaVersion: "skill-ir-method-case-development-freeze/v1",
      benchmarkId: "env-manager-v3",
      taskCommit: "1".repeat(40),
      publicContract: { ...frozenFile, path: "public-interface.json" },
      publicContractSourceAudit: { ...frozenFile, path: "public-contract-source-audit.json" },
      developmentTasks: {
        ...frozenFile,
        path: "development/tasks.json",
        split: "development",
        taskIds: ["task-a", "task-b"],
      },
      heldoutBoundary: {
        status: "not-authored",
        permitsExecution: false,
        futureTasksRequireFreshIsolation: true,
      },
      sourceClosure: [{ ...frozenFile, path: "source/SKILL.md" }],
    })).toMatchObject({
      heldoutBoundary: { status: "not-authored", permitsExecution: false },
    })
  })
})
