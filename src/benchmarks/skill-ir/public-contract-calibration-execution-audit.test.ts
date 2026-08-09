import { describe, expect, test } from "bun:test"
import {
  classifyCalibrationExecutionObservation,
  summarizeCalibrationExecutionObservations,
} from "./public-contract-calibration-execution-audit.ts"

describe("public-contract calibration execution observability audit", () => {
  test("blocks silent zero-usage rows with no final output or public output", () => {
    expect(classifyCalibrationExecutionObservation({
      exitCode: 0,
      runStatus: "ok",
      stdout: "Run complete\nTokens: in=0 out=0",
      scoredSuccess: false,
      publicOutputStatus: "missing",
    })).toEqual({
      status: "silent-zero-usage-no-output",
      usageStatus: "reported-zero",
      finalOutputPresent: false,
      publicOutputPresent: false,
      semanticInterpretationAllowed: false,
    })
  })

  test("keeps a failed row interpretable when model execution is observable", () => {
    expect(classifyCalibrationExecutionObservation({
      exitCode: 0,
      runStatus: "ok",
      stdout: "Tokens: in=120 out=20\nFinal output:\nI could not complete the rewrite.",
      scoredSuccess: false,
      publicOutputStatus: "missing",
    })).toEqual({
      status: "observable-semantic-failure",
      usageStatus: "reported-positive",
      finalOutputPresent: true,
      publicOutputPresent: false,
      semanticInterpretationAllowed: true,
    })
  })

  test("does not relabel an explicit infrastructure failure", () => {
    expect(classifyCalibrationExecutionObservation({
      exitCode: 1,
      runStatus: "adapter-crashed",
      stdout: "Tokens: in=0 out=0",
      scoredSuccess: false,
      scoredFailureType: "infrastructure",
      publicOutputStatus: "missing",
    }).status).toBe("declared-infrastructure-failure")
  })

  test("blocks aggregate semantic interpretation without changing the frozen gate", () => {
    const summary = summarizeCalibrationExecutionObservations([
      { status: "observable-model-completion", semanticInterpretationAllowed: true },
      { status: "observable-semantic-failure", semanticInterpretationAllowed: true },
      { status: "silent-zero-usage-no-output", semanticInterpretationAllowed: false },
    ])
    expect(summary).toEqual({
      observedRows: 3,
      observableRows: 2,
      observableModelCompletions: 1,
      observableSemanticFailures: 1,
      declaredInfrastructureFailures: 0,
      silentZeroUsageNoOutputRows: 1,
      missingUsageAndOutputRows: 0,
      semanticInterpretationAllowed: false,
      decision: "execution-observability-blocked",
    })
  })
})
