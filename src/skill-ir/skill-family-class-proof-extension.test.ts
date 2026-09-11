import { describe, expect, test } from "bun:test";
import {
  deriveE1Decision,
  deriveExtensionE5Summary,
  deriveNextExtensionTask,
  selectExtensionMembers,
} from "./skill-family-class-proof-extension";

describe("class-proof extension planning", () => {
  test("does not invent a shared repair for a one-member gap", () => {
    const decision = deriveE1Decision({
      commonGaps: [{
        gapId: "strict-extra-fields",
        memberIds: ["member-a"],
        occurrenceCount: 1,
        classContract: true,
        actionable: true,
      }],
    });
    expect(decision.status).toBe("not-applicable");
    expect(decision.repeatedContractInternalGaps).toEqual([]);
    expect(decision.reason).toMatch(/two independent members/u);
  });

  test("selects eligible extension members by repository without outcome data", () => {
    const selected = selectExtensionMembers({
      eligibleRows: [
        { candidateId: "c0", memberId: "m0", repository: "0/repo", eligibility: "excluded", applicableInputCount: 99, bodyAvailable: true },
        { candidateId: "c3", memberId: "m3", repository: "z/repo", eligibility: "eligible", applicableInputCount: 2, bodyAvailable: true },
        { candidateId: "c1", memberId: "m1", repository: "a/repo", eligibility: "eligible", applicableInputCount: 2, bodyAvailable: true },
        { candidateId: "c2", memberId: "m2", repository: "a/repo", eligibility: "eligible", applicableInputCount: 99, bodyAvailable: true },
        { candidateId: "c4", memberId: "m4", repository: "b/repo", eligibility: "eligible", applicableInputCount: 2, bodyAvailable: false },
        { candidateId: "c5", memberId: "m5", repository: "c/repo", eligibility: "eligible", applicableInputCount: 2, bodyAvailable: true },
      ],
      excludedCandidateIds: ["c3"],
      targetCount: 2,
    });
    expect(selected.map((row) => row.candidateId)).toEqual(["c1", "c5"]);
    expect(selected.every((row) => row.eligibility === "eligible" && row.bodyAvailable && row.applicableInputCount >= 2)).toBe(true);
  });

  test("summarizes the complete cross-format capability matrix without collapsing failures", () => {
    const capabilities = ["$ref", "arrays", "form", "decimal", "header", "negative-witness"] as const;
    const summary = deriveExtensionE5Summary([
      ...capabilities.flatMap((capability) => [
        { capability, format: "json", ordering: "canonical", status: "pass" as const } as const,
        { capability, format: "yaml", ordering: "reversed", status: "pass" as const } as const,
      ]),
      { capability: "arrays", format: "yaml", ordering: "combined", status: "fail" as const } as const,
    ]);
    expect(summary.registeredCapabilities).toHaveLength(6);
    expect(summary.cases).toBe(13);
    expect(summary.passed).toBe(12);
    expect(summary.failed).toBe(1);
    expect(summary.missingCapabilities).toEqual([]);
  });

  test("resumes from the first unfinished extension task", () => {
    expect(deriveNextExtensionTask({
      E1: "not-applicable",
      E2: "complete",
      E3: "pending",
      E4: "running",
      E5: "pending",
      E6: "pending",
    })).toBe("E3");
    expect(deriveNextExtensionTask({
      E1: "not-applicable",
      E2: "complete",
      E3: "complete",
      E4: "complete",
      E5: "complete",
      E6: "complete",
    })).toBeNull();
  });
});
