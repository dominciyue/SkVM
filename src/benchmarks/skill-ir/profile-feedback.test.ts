import { describe, expect, test } from "bun:test";
import type { SkillIR } from "../../skill-ir/schema";
import type { ScoredAgentRunRow } from "./scoring";
import {
  buildProfiledIRFromScoredRows,
  mergeProfileAnnotationsIntoIR,
  scoredRowsToExecutionTraces,
  targetRefForFailedCriterion,
} from "./profile-feedback";
import { buildProfileFeedbackArtifacts } from "./profile-feedback-run";

function reportIr(): SkillIR {
  return {
    schemaVersion: "skill-ir/v1",
    id: "skill-report-synthesis",
    name: "Report Synthesis",
    category: ["generative", "workflow", "constraint-heavy"],
    intent: "Synthesize notes into a bounded structured report.",
    source: { kind: "inline", text: "Use Summary, Evidence, Evidence Limitations, and Next Steps." },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [],
    rules: [
      {
        id: "rule-required-sections",
        sourceText: "Required sections are present.",
        level: "must",
        scope: "output",
        checkability: "runtime",
        severity: "high",
        normalizedForm: "The report includes Summary, Evidence, Evidence Limitations, and Next Steps.",
      },
      {
        id: "rule-evidence-limits",
        sourceText: "Evidence limitation is mentioned.",
        level: "must",
        scope: "output",
        checkability: "runtime",
        severity: "high",
        normalizedForm: "The report states evidence limits and avoids broad claims.",
      },
    ],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  };
}

function scoredRow(overrides: Partial<ScoredAgentRunRow> = {}): ScoredAgentRunRow {
  return {
    caseId: "skill-report-synthesis:skvm:linux:compressed:report-overclaim-hard-001",
    system: "original",
    skill: "skill-report-synthesis",
    agent: "skvm",
    environment: "linux",
    context: "compressed",
    task: "report-overclaim-hard-001",
    taskSplit: "held-out",
    success: false,
    ruleViolations: 1,
    stepCoverage: 1,
    latencyMs: 1200,
    tokenCost: 400,
    successSource: "heuristic-success-criteria",
    failedCriteria: ["Required sections are present."],
    ...overrides,
  };
}

describe("profile feedback from scored results", () => {
  test("maps failed success criteria to stable IR target refs", () => {
    expect(targetRefForFailedCriterion("Required sections are present.", reportIr())).toBe(
      "rule-required-sections",
    );
    expect(targetRefForFailedCriterion("Evidence limitation is mentioned.", reportIr())).toBe(
      "rule-evidence-limits",
    );
  });

  test("turns non-infrastructure scored failures into execution trace events", () => {
    const traces = scoredRowsToExecutionTraces(
      [
        scoredRow(),
        scoredRow({
          caseId: "skill-report-synthesis:skvm:linux:compressed:report-conflicting-notes-hard-002",
          task: "report-conflicting-notes-hard-002",
          success: false,
          failureType: "infrastructure",
          failedCriteria: ["process exited with code 1"],
        }),
      ],
      new Map([["skill-report-synthesis", reportIr()]]),
    );

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      traceId: "score-skill-report-synthesis-skvm-linux-compressed-report-overclaim-hard-001-original",
      skillId: "skill-report-synthesis",
      success: false,
      taskId: "report-overclaim-hard-001",
      tokenCost: 400,
      events: [
        {
          kind: "rule-violation",
          targetRef: "rule-required-sections",
          message: "Failed criterion: Required sections are present.",
        },
      ],
    });
  });

  test("merges profile annotations into an IR copy without mutating the base IR", () => {
    const base = reportIr();
    const derived = mergeProfileAnnotationsIntoIR(base, [
      {
        id: "profile-rule-required-sections",
        sourceTrace: "trace-1",
        targetRef: "rule-required-sections",
        observation: "frequent-failure",
        evidenceCount: 1,
        suggestedPass: "profile-guided-repair",
      },
    ]);

    expect(base.profile).toEqual([]);
    expect(derived.profile).toHaveLength(1);
    expect(derived.profile[0]?.targetRef).toBe("rule-required-sections");
  });

  test("builds profiled IR from scored rows with a configurable evidence threshold", () => {
    const base = reportIr();
    const derived = buildProfiledIRFromScoredRows(base, [scoredRow()], { minEvidence: 1 });

    expect(derived.profile).toContainEqual({
      id: "profile-rule-required-sections",
      sourceTrace: "score-skill-report-synthesis-skvm-linux-compressed-report-overclaim-hard-001-original",
      targetRef: "rule-required-sections",
      observation: "frequent-failure",
      evidenceCount: 1,
      suggestedPass: "profile-guided-repair",
    });
  });

  test("builds per-skill overlay and final IR artifacts with summary metadata for the CLI", () => {
    const artifacts = buildProfileFeedbackArtifacts(
      [scoredRow()],
      new Map([["skill-report-synthesis", reportIr()]]),
      { sourceSystem: "original", minEvidence: 1 },
    );

    expect(artifacts.summary).toEqual({
      sourceSystem: "original",
      taskSplit: undefined,
      minEvidence: 1,
      inputRows: 1,
      tracedRows: 1,
      profiledSkills: [
        {
          skillId: "skill-report-synthesis",
          annotationCount: 1,
          outputPaths: {
            overlay: "overlay/skill-report-synthesis.json",
            finalIR: "final-ir/skill-report-synthesis.json",
            compatibilityIR: "ir/skill-report-synthesis.json",
          },
          annotations: [
            {
              id: "profile-rule-required-sections",
              sourceTrace: "score-skill-report-synthesis-skvm-linux-compressed-report-overclaim-hard-001-original",
              targetRef: "rule-required-sections",
              observation: "frequent-failure",
              evidenceCount: 1,
              suggestedPass: "profile-guided-repair",
            },
          ],
        },
      ],
    });
    expect(artifacts.overlaysBySkill.get("skill-report-synthesis")).toEqual({
      skillId: "skill-report-synthesis",
      annotations: [
        {
          id: "profile-rule-required-sections",
          sourceTrace: "score-skill-report-synthesis-skvm-linux-compressed-report-overclaim-hard-001-original",
          targetRef: "rule-required-sections",
          observation: "frequent-failure",
          evidenceCount: 1,
          suggestedPass: "profile-guided-repair",
        },
      ],
    });
    const finalIR = artifacts.finalIRsBySkill.get("skill-report-synthesis");
    expect(finalIR?.profile).toHaveLength(1);
    expect(finalIR?.checks.map((check) => check.id)).toContain("check-rule-required-sections");
    expect(finalIR?.checks.map((check) => check.id)).toContain("check-rule-required-sections-profile");
    expect(finalIR?.recovery.map((policy) => policy.id)).toContain("recover-rule-required-sections");
  });
});
