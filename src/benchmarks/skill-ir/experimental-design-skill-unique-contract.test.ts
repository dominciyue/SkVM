import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS,
  EXPERIMENTAL_DESIGN_SKILL_UNIQUE_HELDOUT_TASK_IDS,
  ExperimentalDesignSkillUniqueStudyGraphSchema,
  buildExperimentalDesignSkillUniqueTaskSet,
  validateExperimentalDesignSkillUniqueTaskSet,
  validateExperimentalDesignSkillUniqueTaskSplitFreeze,
} from "./experimental-design-skill-unique-contract.ts"

const rootDir = process.cwd()
const capabilityRoot = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique",
)

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(capabilityRoot, relativePath), "utf8")) as unknown
}

describe("experimental-design skill-unique contract", () => {
  test("accepts a single rooted treatment-to-response hierarchy", () => {
    const graph = ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
      schemaVersion: "skill-ir-experimental-design-study-graph/v1",
      studyId: "nested-cells",
      question: "Does treatment change the cellular response?",
      entities: [
        { type: "cage", parentType: null, totalCount: 8 },
        { type: "mouse", parentType: "cage", totalCount: 32 },
        { type: "cell", parentType: "mouse", totalCount: 3200 },
      ],
      treatment: { name: "diet", assignedToEntityType: "cage" },
      response: { name: "expression", observedOnEntityType: "cell" },
    })

    expect(graph.entities).toHaveLength(3)
  })

  test("rejects duplicate, cyclic, multi-root, and disconnected graphs", () => {
    const base = {
      schemaVersion: "skill-ir-experimental-design-study-graph/v1" as const,
      studyId: "invalid",
      question: "invalid graph",
      entities: [
        { type: "cage", parentType: null, totalCount: 4 },
        { type: "mouse", parentType: "cage", totalCount: 16 },
      ],
      treatment: { name: "diet", assignedToEntityType: "cage" },
      response: { name: "weight", observedOnEntityType: "mouse" },
    }

    expect(() => ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
      ...base,
      entities: [...base.entities, { type: "mouse", parentType: "cage", totalCount: 8 }],
    })).toThrow()
    expect(() => ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
      ...base,
      entities: [
        { type: "cage", parentType: "mouse", totalCount: 4 },
        { type: "mouse", parentType: "cage", totalCount: 16 },
      ],
    })).toThrow()
    expect(() => ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
      ...base,
      entities: [...base.entities, { type: "batch", parentType: null, totalCount: 2 }],
    })).toThrow()
    expect(() => ExperimentalDesignSkillUniqueStudyGraphSchema.parse({
      ...base,
      treatment: { name: "diet", assignedToEntityType: "mouse" },
      response: { name: "cage-response", observedOnEntityType: "cage" },
    })).toThrow()
  })

  test("rebuilds the committed 2+2 split without task-visible answers", async () => {
    const interfaceBytes = await readFile(path.join(capabilityRoot, "public-interface.json"))
    const development = await readJson("development/tasks.json")
    const heldout = await readJson("heldout/tasks.json")

    expect(development).toEqual(buildExperimentalDesignSkillUniqueTaskSet("development", interfaceBytes))
    expect(heldout).toEqual(buildExperimentalDesignSkillUniqueTaskSet("heldout", interfaceBytes))
    expect(validateExperimentalDesignSkillUniqueTaskSet(
      development,
      "development",
      interfaceBytes,
    ).tasks.map((task) => task.id)).toEqual([
      ...EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS,
    ])
    expect(validateExperimentalDesignSkillUniqueTaskSet(
      heldout,
      "heldout",
      interfaceBytes,
    ).tasks.map((task) => task.id)).toEqual([
      ...EXPERIMENTAL_DESIGN_SKILL_UNIQUE_HELDOUT_TASK_IDS,
    ])

    const visible = JSON.stringify(development)
    expect(visible).not.toMatch(/expected|gold|answer|sourceQuote|TEST_ONLY_HELDOUT/iu)
    expect(visible).not.toContain("the replicate is whatever the treatment")
    expect(visible).not.toContain("parentType 回溯")
  })

  test("rejects gold and held-out leakage in development tasks", async () => {
    const interfaceBytes = await readFile(path.join(capabilityRoot, "public-interface.json"))
    const taskSet = buildExperimentalDesignSkillUniqueTaskSet("development", interfaceBytes)
    const goldLeak = structuredClone(taskSet) as unknown as Record<string, unknown>
    ;(goldLeak.tasks as Array<Record<string, unknown>>)[0]!.expectedAnswer = "cage"
    expect(() => validateExperimentalDesignSkillUniqueTaskSet(
      goldLeak,
      "development",
      interfaceBytes,
    )).toThrow("forbidden evidence")

    const heldoutLeak = structuredClone(taskSet)
    heldoutLeak.tasks[0]!.prompt += " TEST_ONLY_HELDOUT_SKILL_UNIQUE"
    expect(() => validateExperimentalDesignSkillUniqueTaskSet(
      heldoutLeak,
      "development",
      interfaceBytes,
    )).toThrow("held-out evidence")
  })

  test("validates the split freeze and detects task drift", async () => {
    const freeze = await readJson("task-split-freeze.json")
    const validated = await validateExperimentalDesignSkillUniqueTaskSplitFreeze({
      rootDir,
      freeze,
    })
    expect(validated.capabilityId).toBe("experimental-design-v2-skill-unique")
    expect(validated.development.taskIds).toEqual([
      ...EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS,
    ])
    expect(validated.heldout.taskIds).toEqual([
      ...EXPERIMENTAL_DESIGN_SKILL_UNIQUE_HELDOUT_TASK_IDS,
    ])

    const drift = structuredClone(freeze) as {
      development: { sha256: string }
    }
    drift.development.sha256 = "0".repeat(64)
    await expect(validateExperimentalDesignSkillUniqueTaskSplitFreeze({
      rootDir,
      freeze: drift,
    })).rejects.toThrow("digest mismatch")
  })
})
