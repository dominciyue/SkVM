import { describe, expect, test } from "bun:test"
import {
  HistoryEntrySchema,
  OptimizeSubmissionSchema,
  type OptimizationAction,
} from "../../src/jit-optimize/types.ts"
import {
  actionKindMismatchDiagnostic,
  validateOptimizationActions,
} from "../../src/jit-optimize/action-plan.ts"
import { normalizeSubmission } from "../../src/jit-optimize/optimizer.ts"

function action(
  id: string,
  overrides: Partial<OptimizationAction> = {},
): OptimizationAction {
  return {
    id,
    kind: "restructure-docs",
    evidenceIds: ["0"],
    sourceRefs: ["SKILL.md#workflow"],
    dependsOn: [],
    inputs: [],
    outputs: ["SKILL.md"],
    preconditions: [],
    changedPaths: ["SKILL.md"],
    residualDuties: ["Agent still chooses the applicable branch."],
    verification: ["Read the revised branch and run its focused test."],
    ...overrides,
  }
}

describe("validateOptimizationActions", () => {
  test("accepts a pure-document action with an intentionally empty input list", () => {
    const result = validateOptimizationActions([action("docs-only")])

    expect(result.actions).toEqual([action("docs-only")])
    expect(result.diagnostics).toEqual([])
  })

  test("rejects duplicate ids with precise locations instead of executing either copy", () => {
    const result = validateOptimizationActions([
      action("same"),
      action("same", { outputs: ["references/details.md"] }),
      action("independent"),
    ])

    expect(result.actions.map((item) => item.id)).toEqual(["independent"])
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-action-id", actionId: "same", locator: "actions[0].id" }),
      expect.objectContaining({ code: "duplicate-action-id", actionId: "same", locator: "actions[1].id" }),
    ]))
  })

  test("rejects only the action with an unknown dependency and keeps an independent action", () => {
    const result = validateOptimizationActions([
      action("blocked", { dependsOn: ["missing"] }),
      action("independent"),
    ])

    expect(result.actions.map((item) => item.id)).toEqual(["independent"])
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "unknown-action-dependency",
      actionId: "blocked",
      locator: "actions[0].dependsOn[0]",
    }))
  })

  test("rejects a dependency cycle while retaining actions outside it", () => {
    const result = validateOptimizationActions([
      action("a", { dependsOn: ["b"] }),
      action("b", { dependsOn: ["a"] }),
      action("independent"),
    ])

    expect(result.actions.map((item) => item.id)).toEqual(["independent"])
    expect(result.diagnostics.filter((item) => item.code === "action-dependency-cycle"))
      .toHaveLength(2)
  })

  test("does not fill missing required fields merely because actions are optional", () => {
    const result = validateOptimizationActions([
      { id: "incomplete", kind: "generate-script" },
      action("independent"),
    ])

    expect(result.actions.map((item) => item.id)).toEqual(["independent"])
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "invalid-action",
      locator: "actions[0]",
    }))
  })
})

describe("action declaration diagnostics", () => {
  test("retains the wrong field value and the local repair path", () => {
    const diagnostic = actionKindMismatchDiagnostic({
      action: action("local-script", {
        kind: "domain-backend",
        sourceRefs: ["scripts/convert.py#main"],
      }),
      supportedLocalPaths: ["scripts/convert.py"],
      suggestedKind: "reuse-script",
    })

    expect(diagnostic).toMatchObject({
      code: "action-kind-mismatch",
      field: "kind",
      originalValue: "domain-backend",
      supportedLocalPaths: ["scripts/convert.py"],
      suggestedValue: "reuse-script",
    })
    expect(diagnostic.message).toContain("registered backend")
  })
})

describe("action-plan compatibility and persistence", () => {
  test("legacy submissions without actions keep their existing normalized behavior", () => {
    const parsed = OptimizeSubmissionSchema.parse({ noChanges: true })
    const normalized = normalizeSubmission(parsed)

    expect(normalized.noChanges).toBe(true)
    expect(normalized.actions).toEqual([])
    expect(normalized.actionDiagnostics).toEqual([])
  })

  test("normalization preserves valid actions and reports invalid siblings", () => {
    const parsed = OptimizeSubmissionSchema.parse({
      rootCause: "Repeated work is not represented as an executable step.",
      reasoning: "One action is complete and one is malformed.",
      confidence: 0.8,
      changedFiles: ["SKILL.md"],
      changes: [{ file: "SKILL.md", description: "route to the action", generality: "other document tasks" }],
      actions: [action("valid"), { id: "invalid" }],
    })
    const normalized = normalizeSubmission(parsed)

    expect(normalized.actions?.map((item) => item.id)).toEqual(["valid"])
    expect(normalized.actionDiagnostics).toContainEqual(expect.objectContaining({ code: "invalid-action" }))
  })

  test("history schema round-trips action plans and their diagnostics", () => {
    const parsed = HistoryEntrySchema.parse({
      timestamp: "2026-09-13T00:00:00Z",
      round: 1,
      rootCause: "repeated work",
      reasoning: "a reusable script is available",
      changes: [],
      changedFiles: [],
      confidence: 0.8,
      trainScore: null,
      testScore: null,
      improved: null,
      actions: [action("reuse", { kind: "reuse-script" })],
      actionDiagnostics: [{
        code: "unknown-action-dependency",
        severity: "error",
        actionId: "omitted",
        locator: "actions[1].dependsOn[0]",
        message: "dependency missing was not available",
      }],
    })

    expect(parsed.actions?.[0]?.kind).toBe("reuse-script")
    expect(parsed.actionDiagnostics?.[0]?.locator).toBe("actions[1].dependsOn[0]")
  })
})
