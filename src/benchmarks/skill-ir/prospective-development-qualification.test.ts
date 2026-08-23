import { describe, expect, test } from "bun:test"
import {
  buildProspectiveDevelopmentQualification,
  ProspectiveDevelopmentQualificationSchema,
} from "./prospective-development-qualification"
import type { ExecutionEnvelope } from "./execution-resilience"

function envelope(classification: ExecutionEnvelope["classification"]): ExecutionEnvelope {
  return {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: "bids-prospective-development-2026-08-23",
    taskId: "bids-entity-order-dev-001",
    system: "original",
    candidateBlock: 1,
    attemptId: "bids-entity-order-dev-001:qualification:original",
    process: { started: true, exitCode: classification === "semantic-complete" ? 0 : null, termination:
      classification === "active-idle-timeout" ? "idle-timeout" : "natural", durationMs: 1234 },
    activity: { requestDispatched: true, providerResponses: 1, assistantMessages: 1, toolCalls: 0, toolResults: 0 },
    terminal: { present: classification === "semantic-complete" },
    usage: { available: true, input: 10, output: 2, cacheRead: 3, cacheWrite: 0 },
    parser: { outcome: "ok", unknownTypes: [] },
    outputs: { fileCount: 2 },
    classification,
    replacementEligible: false,
  }
}

describe("prospective development qualification", () => {
  test("passes active observed execution with a runnable deterministic scorer even when the task fails", () => {
    const report = buildProspectiveDevelopmentQualification({
      experimentId: "bids-prospective-development-2026-08-23",
      lockSha256: "a".repeat(64),
      resource: { status: "ok", reportPath: "qualification/resource-probe.json", reportSha256: "b".repeat(64) },
      envelope: envelope("active-idle-timeout"),
      scorer: { rowProduced: true, deterministicEvaluator: true, semanticSuccess: false },
      exactOutputsPresent: false,
    })

    expect(report.status).toBe("passed")
    expect(report.checks).toEqual({ resource: true, route: true, observability: true, scorer: true })
    expect(report.disclosure).toEqual({ exactOutputsPresent: false, semanticSuccess: false, usedAsGate: false })
    expect(report.authorizations.paidMatrix).toBe(true)
  })

  test("fails pre-semantic or parser-incompatible execution and missing scorer rows", () => {
    const preSemantic = envelope("pre-semantic-idle-timeout")
    preSemantic.activity = {
      requestDispatched: true, providerResponses: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0,
    }
    preSemantic.parser = { outcome: "empty", unknownTypes: [] }
    const report = buildProspectiveDevelopmentQualification({
      experimentId: preSemantic.experimentId,
      lockSha256: "a".repeat(64),
      resource: { status: "ok", reportPath: "qualification/resource-probe.json", reportSha256: "b".repeat(64) },
      envelope: preSemantic,
      scorer: { rowProduced: false, deterministicEvaluator: false, semanticSuccess: null },
      exactOutputsPresent: false,
    })
    expect(report.status).toBe("failed")
    expect(report.checks).toMatchObject({ route: false, observability: false, scorer: false })
    expect(report.authorizations.paidMatrix).toBe(false)

    expect(() => ProspectiveDevelopmentQualificationSchema.parse({
      ...report,
      authorizations: { ...report.authorizations, heldOut: true },
    })).toThrow()
  })
})
