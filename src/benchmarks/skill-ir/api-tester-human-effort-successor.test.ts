import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  ApiTesterHumanEffortProtocolSchema,
  HumanEffortRowSchema,
  buildHumanEffortReport,
  deriveActiveMinutes,
  type HumanEffortRow,
} from "./api-tester-human-effort-successor"

function digest(char: string): string {
  return char.repeat(64)
}

const protocol = {
  schemaVersion: "skill-ir-api-tester-human-effort-protocol/v1",
  protocolId: "skill-ir-api-tester-human-effort-successor-design-001",
  status: "design-only-not-authorized",
  priorIdentity: "skill-ir-api-tester-trace-public-answer-paid-development-001",
  researchQuestion: "Under the same deterministic quality standard, how does active human effort differ between manual authoring and deterministic-candidate review/repair?",
  scope: {
    developmentOnly: true,
    permitsHeldOut: false,
    paidExecutionAuthorized: false,
    usesLlmTrace: false,
    claimScope: "participant-and-task-conditional",
  },
  design: {
    arms: [
      { id: "manual-from-scratch", startingPoint: "public-task-and-openapi-only" },
      { id: "deterministic-candidate-review-repair", startingPoint: "public-task-openapi-and-deterministic-candidate" },
    ],
    candidateConstruction: {
      kind: "deterministic-openapi",
      modelRequired: false,
      comparatorRequired: true,
      generator: { path: "src/benchmarks/skill-ir/api-tester-artifact-compiler.ts", sha256: digest("f") },
    },
    participantSlots: ["participant-01", "participant-02"],
    participantsMustNotAuthorTasksOrScorer: true,
    publicDevelopmentTasksRequired: 4,
    matchedPairsRequired: 2,
    taskSetStatus: "not-authored",
    assignment: {
      kind: "balanced-crossover",
      sequences: ["ABBA", "BAAB"],
      rowsPerParticipant: 4,
      expectedRows: 8,
    },
    timeboxMinutesPerRow: 30,
    maximumSubmissionsPerRow: 2,
  },
  quality: {
    scorer: { path: "src/bench/evaluators/api-tester-grade.ts", sha256: digest("a") },
    sameScorerForBothArms: true,
    allHardGatesRequired: true,
    finalPassRequiredForTimeComparison: true,
  },
  accounting: {
    units: ["agentRuns", "providerModelRequests", "tokens", "currencyCost", "activeHumanMinutes", "modifiedLoc", "failedAttempts"],
    unknownValuesRemainNull: true,
    platformEngineeringSeparated: true,
  },
  stopRules: {
    failuresRemainInDenominator: true,
    noReplacement: true,
    noHistoricalMinuteBackfill: true,
    noMinimumHumanEffortClaim: true,
  },
} as const

function row(input: {
  rowIndex: number
  participantId: "participant-01" | "participant-02"
  taskId: string
  matchedPairId: "pair-01" | "pair-02"
  arm: "manual-from-scratch" | "deterministic-candidate-review-repair"
  activeMinutes: number
  passed?: boolean
}): HumanEffortRow {
  const startedAt = new Date(Date.UTC(2026, 8, 6, 0, input.rowIndex, 0))
  const endedAt = new Date(startedAt.getTime() + input.activeMinutes * 60_000)
  const passed = input.passed ?? true
  return HumanEffortRowSchema.parse({
    rowIndex: input.rowIndex,
    participantId: input.participantId,
    taskId: input.taskId,
    matchedPairId: input.matchedPairId,
    arm: input.arm,
    orderIndex: input.rowIndex <= 4 ? input.rowIndex : input.rowIndex - 4,
    recordedProspectively: true,
    intervals: [{
      activity: input.arm === "manual-from-scratch" ? "authoring" : "review",
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    }],
    attempts: [{
      attemptIndex: 1,
      completedAt: endedAt.toISOString(),
      outputSha256: digest("b"),
      scorerReportSha256: digest("c"),
      qualityPassed: passed,
      failedCriteria: passed ? [] : ["api-security-response"],
    }],
    finalStatus: passed ? "passed" : "failed",
    candidate: input.arm === "manual-from-scratch"
      ? null
      : { generatorSha256: digest("d"), initialCandidateSha256: digest("e") },
    modifiedLoc: input.arm === "manual-from-scratch" ? null : 3,
    activityAccounting: {
      agentRuns: 0,
      providerModelRequests: 0,
      toolCalls: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      currencyCost: { currency: "USD", amount: 0 },
    },
  })
}

describe("API Tester human-effort successor design", () => {
  test("keeps the checked-in design bound to the deterministic generator and scorer", async () => {
    const rootDir = process.cwd()
    const designPath = path.join(
      rootDir,
      "benchmarks/skill-ir/pilots/api-tester/human-effort-successor-design-001.json",
    )
    const parsed = ApiTesterHumanEffortProtocolSchema.parse(
      JSON.parse(await readFile(designPath, "utf8")),
    )
    for (const reference of [
      parsed.design.candidateConstruction.generator,
      parsed.quality.scorer,
    ]) {
      const actual = createHash("sha256")
        .update(await readFile(path.join(rootDir, reference.path)))
        .digest("hex")
      expect(actual).toBe(reference.sha256)
    }
  })

  test("is a design-only, zero-model balanced crossover with a blocked task set", () => {
    const parsed = ApiTesterHumanEffortProtocolSchema.parse(protocol)
    expect(parsed.status).toBe("design-only-not-authorized")
    expect(parsed.scope).toMatchObject({
      permitsHeldOut: false,
      paidExecutionAuthorized: false,
      usesLlmTrace: false,
    })
    expect(parsed.design).toMatchObject({
      taskSetStatus: "not-authored",
      publicDevelopmentTasksRequired: 4,
      matchedPairsRequired: 2,
      assignment: { expectedRows: 8 },
      candidateConstruction: {
        generator: { path: "src/benchmarks/skill-ir/api-tester-artifact-compiler.ts" },
      },
    })
  })

  test("derives active time from prospective non-overlapping intervals", () => {
    const value = row({
      rowIndex: 1,
      participantId: "participant-01",
      taskId: "task-01",
      matchedPairId: "pair-01",
      arm: "manual-from-scratch",
      activeMinutes: 12,
    })
    expect(deriveActiveMinutes(value.intervals)).toBe(12)
    expect(() => HumanEffortRowSchema.parse({
      ...value,
      intervals: [
        { activity: "authoring", startedAt: "2026-09-06T00:00:00.000Z", endedAt: "2026-09-06T00:10:00.000Z" },
        { activity: "authoring", startedAt: "2026-09-06T00:05:00.000Z", endedAt: "2026-09-06T00:15:00.000Z" },
      ],
    })).toThrow()
  })

  test("requires candidate provenance only in the review/repair arm and keeps model activity zero", () => {
    const manual = row({
      rowIndex: 1,
      participantId: "participant-01",
      taskId: "task-01",
      matchedPairId: "pair-01",
      arm: "manual-from-scratch",
      activeMinutes: 10,
    })
    expect(() => HumanEffortRowSchema.parse({ ...manual, candidate: { generatorSha256: digest("d"), initialCandidateSha256: digest("e") } })).toThrow()
    expect(() => HumanEffortRowSchema.parse({
      ...manual,
      activityAccounting: { ...manual.activityAccounting, providerModelRequests: 1 },
    })).toThrow()
  })

  test("reports descriptive effort only for same-quality complete rows", () => {
    const tasks = ["pair-01-a", "pair-01-b", "pair-02-a", "pair-02-b"]
    const rows = [
      row({ rowIndex: 1, participantId: "participant-01", taskId: tasks[0]!, matchedPairId: "pair-01", arm: "manual-from-scratch", activeMinutes: 14 }),
      row({ rowIndex: 2, participantId: "participant-01", taskId: tasks[1]!, matchedPairId: "pair-01", arm: "deterministic-candidate-review-repair", activeMinutes: 8 }),
      row({ rowIndex: 3, participantId: "participant-01", taskId: tasks[2]!, matchedPairId: "pair-02", arm: "deterministic-candidate-review-repair", activeMinutes: 7 }),
      row({ rowIndex: 4, participantId: "participant-01", taskId: tasks[3]!, matchedPairId: "pair-02", arm: "manual-from-scratch", activeMinutes: 13 }),
      row({ rowIndex: 5, participantId: "participant-02", taskId: tasks[0]!, matchedPairId: "pair-01", arm: "deterministic-candidate-review-repair", activeMinutes: 9 }),
      row({ rowIndex: 6, participantId: "participant-02", taskId: tasks[1]!, matchedPairId: "pair-01", arm: "manual-from-scratch", activeMinutes: 15 }),
      row({ rowIndex: 7, participantId: "participant-02", taskId: tasks[2]!, matchedPairId: "pair-02", arm: "manual-from-scratch", activeMinutes: 12 }),
      row({ rowIndex: 8, participantId: "participant-02", taskId: tasks[3]!, matchedPairId: "pair-02", arm: "deterministic-candidate-review-repair", activeMinutes: 8 }),
    ]
    const report = buildHumanEffortReport(ApiTesterHumanEffortProtocolSchema.parse({ ...protocol, design: { ...protocol.design, taskSetStatus: "frozen" } }), rows)
    expect(report.status).toBe("completed-descriptive")
    expect(report.qualityComparableRows).toBe(8)
    expect(report.activeHumanMinutes).toEqual({
      manualFromScratch: 54,
      candidateReviewRepair: 32,
      differenceCandidateMinusManual: -22,
    })
    expect(report.claimBoundary).toContain("does not estimate minimum human effort")
  })

  test("retains failures and blocks the effort comparison", () => {
    const failed = row({
      rowIndex: 1,
      participantId: "participant-01",
      taskId: "pair-01-a",
      matchedPairId: "pair-01",
      arm: "deterministic-candidate-review-repair",
      activeMinutes: 30,
      passed: false,
    })
    const report = buildHumanEffortReport(
      ApiTesterHumanEffortProtocolSchema.parse({ ...protocol, design: { ...protocol.design, taskSetStatus: "frozen" } }),
      [failed],
    )
    expect(report.status).toBe("blocked-incomplete-or-quality")
    expect(report.rows).toHaveLength(1)
    expect(report.qualityComparableRows).toBe(0)
    expect(report.activeHumanMinutes).toBeNull()
  })
})
