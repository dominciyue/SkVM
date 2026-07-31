import { describe, expect, test } from "bun:test"
import {
  assessExperimentalDesignSkillUniqueAnalysis,
  deriveExperimentalDesignSkillUniqueOracle,
} from "./experimental-design-skill-unique-oracle.ts"

const nestedGraph = {
  schemaVersion: "skill-ir-experimental-design-study-graph/v1",
  studyId: "nested-cells",
  question: "Does diet alter expression?",
  entities: [
    { type: "cage", parentType: null, totalCount: 8 },
    { type: "mouse", parentType: "cage", totalCount: 32 },
    { type: "cell", parentType: "mouse", totalCount: 3200 },
  ],
  treatment: { name: "diet", assignedToEntityType: "cage" },
  response: { name: "expression", observedOnEntityType: "cell" },
}

describe("experimental-design skill-unique oracle", () => {
  test("derives replicate, count, measurement, lineage, and pseudoreplication", () => {
    expect(deriveExperimentalDesignSkillUniqueOracle(nestedGraph)).toEqual({
      status: "confirmed",
      studyId: "nested-cells",
      independentReplicateUnit: "cage",
      independentReplicateCount: 8,
      measurementUnit: "cell",
      pseudoreplicationRisk: true,
      lineage: ["cage", "mouse", "cell"],
    })
  })

  test("accepts aggregate and lower-level hierarchical alternatives", () => {
    const oracle = deriveExperimentalDesignSkillUniqueOracle(nestedGraph)
    expect(oracle.status).toBe("confirmed")
    if (oracle.status !== "confirmed") return

    expect(assessExperimentalDesignSkillUniqueAnalysis(oracle, {
      studyId: "nested-cells",
      analysisUnit: "cage",
      groupingFactors: [],
      method: "Aggregate before comparing groups",
      rationale: "One value per independently treated cage.",
    })).toEqual({ valid: true, requiredGroupingFactors: [] })

    expect(assessExperimentalDesignSkillUniqueAnalysis(oracle, {
      studyId: "nested-cells",
      analysisUnit: "cell",
      groupingFactors: ["mouse", "cage"],
      method: "任意混合模型",
      rationale: "保留下层观测并表示完整嵌套。",
    })).toEqual({ valid: true, requiredGroupingFactors: ["cage", "mouse"] })

    expect(assessExperimentalDesignSkillUniqueAnalysis(oracle, {
      studyId: "nested-cells",
      analysisUnit: "mouse",
      groupingFactors: ["cage"],
      method: "Mouse summaries with cage grouping",
      rationale: "Mice remain nested in treatment cages.",
    })).toEqual({ valid: true, requiredGroupingFactors: ["cage"] })
  })

  test("rejects missing, invented, duplicate, and non-lineage grouping", () => {
    const oracle = deriveExperimentalDesignSkillUniqueOracle(nestedGraph)
    if (oracle.status !== "confirmed") throw new Error("fixture must be confirmed")

    expect(assessExperimentalDesignSkillUniqueAnalysis(oracle, {
      studyId: "nested-cells",
      analysisUnit: "cell",
      groupingFactors: ["mouse"],
      method: "incomplete",
      rationale: "missing cage",
    }).valid).toBe(false)
    expect(assessExperimentalDesignSkillUniqueAnalysis(oracle, {
      studyId: "nested-cells",
      analysisUnit: "cell",
      groupingFactors: ["mouse", "cage", "batch"],
      method: "invented",
      rationale: "batch is not in the graph",
    }).valid).toBe(false)
    expect(assessExperimentalDesignSkillUniqueAnalysis(oracle, {
      studyId: "nested-cells",
      analysisUnit: "cell",
      groupingFactors: ["mouse", "cage", "cage"],
      method: "duplicate",
      rationale: "duplicate group",
    }).valid).toBe(false)
    expect(assessExperimentalDesignSkillUniqueAnalysis(oracle, {
      studyId: "nested-cells",
      analysisUnit: "participant",
      groupingFactors: [],
      method: "outside",
      rationale: "not an entity",
    }).valid).toBe(false)
  })

  test("does not invent an oracle when public hierarchy evidence is missing", () => {
    const missingParent = structuredClone(nestedGraph)
    delete (missingParent.entities[1] as { parentType?: string | null }).parentType
    expect(deriveExperimentalDesignSkillUniqueOracle(missingParent)).toMatchObject({
      status: "unconfirmed",
      reason: "invalid-public-study-graph",
    })

    const responseAboveTreatment = structuredClone(nestedGraph)
    responseAboveTreatment.treatment.assignedToEntityType = "cell"
    responseAboveTreatment.response.observedOnEntityType = "cage"
    expect(deriveExperimentalDesignSkillUniqueOracle(responseAboveTreatment)).toMatchObject({
      status: "unconfirmed",
      reason: "invalid-public-study-graph",
    })
  })

  test("reports no pseudoreplication when treatment and measurement units match", () => {
    const graph = {
      ...nestedGraph,
      studyId: "cage-level-response",
      response: { name: "cage_consumption", observedOnEntityType: "cage" },
    }
    expect(deriveExperimentalDesignSkillUniqueOracle(graph)).toMatchObject({
      status: "confirmed",
      independentReplicateUnit: "cage",
      measurementUnit: "cage",
      pseudoreplicationRisk: false,
      lineage: ["cage"],
    })
  })
})
