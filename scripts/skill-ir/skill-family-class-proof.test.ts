import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLASS_PROOF_IDENTITY,
  CLASS_PROOF_RESULT_RELATIVE,
  deriveTransferDecision,
  buildScreeningPolicy,
  buildCandidatePool,
  selectCandidateMetadata,
  runStatus,
  screenCandidate,
  transitionStatus,
} from "./skill-family-class-proof";
import type { EligibilityInput } from "../../src/skill-ir/skill-family-eligibility";

describe("skill-family class-proof status", () => {
  test("returns and persists a planned status without external work", async () => {
    const root = await mkdtemp(join(tmpdir(), "class-proof-status-"));
    try {
      const status = await runStatus(root);
      expect(status.identity).toBe(CLASS_PROOF_IDENTITY);
      expect(status.planRevision).toBe(1);
      expect(status.currentStep).toBe("planned");
      expect(status.lastCompletedStep).toBeNull();
      expect(status.externalAccounting).toEqual({ modelCalls: 0, apiCalls: 0, paidCalls: 0 });
      expect(status.protectedReads).toEqual({ heldOut: 0, q1Reserved: 0, historicalResultsChanged: false });
      expect(JSON.parse(await readFile(join(root, CLASS_PROOF_RESULT_RELATIVE, "execution-status.json"), "utf8"))).toEqual(status);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not invoke construction when preflight rejects a candidate", () => {
    const candidate: EligibilityInput = {
      skillId: "owner/rejected:skill",
      sourcePath: "SKILL.md",
      body: "Run authenticated requests against the live service.",
      resources: [],
    };
    let constructionCalls = 0;
    const result = screenCandidate(candidate, () => { constructionCalls += 1; });
    expect(result.eligibility.decision).toBe("excluded");
    expect(result.constructionAttempted).toBe(false);
    expect(constructionCalls).toBe(0);
    expect(result.eligibility.modelCalls).toBe(0);
  });

  test("allows only forward state transitions", () => {
    expect(transitionStatus("planned", "screening")).toBe("screening");
    expect(transitionStatus("screening", "development")).toBe("development");
    expect(() => transitionStatus("development", "planned")).toThrow(/backward/u);
    expect(() => transitionStatus("reported", "primary-running")).toThrow(/backward/u);
  });

  test("derives positive only from the registered denominators", () => {
    expect(deriveTransferDecision({ primaryMembers: 3, inputQualifiedMembers: 3, minInputsPerMember: 2, coreCoverage: 0.9, firstRunAcceptedMembers: 2, checkerPassRate: 1 })).toBe("bounded-positive");
    expect(deriveTransferDecision({ primaryMembers: 3, inputQualifiedMembers: 3, minInputsPerMember: 2, coreCoverage: 0.95, firstRunAcceptedMembers: 3, checkerPassRate: 1 })).toBe("strong-positive");
    expect(deriveTransferDecision({ primaryMembers: 2, inputQualifiedMembers: 2, minInputsPerMember: 2, coreCoverage: 1, firstRunAcceptedMembers: 2, checkerPassRate: 1 })).toBe("insufficient-evidence");
    expect(deriveTransferDecision({ primaryMembers: 3, inputQualifiedMembers: 3, minInputsPerMember: 2, coreCoverage: 0.4, firstRunAcceptedMembers: 1, checkerPassRate: 0.5 })).toBe("bounded-negative");
  });

  test("freezes screening policy independently of construction outcomes", () => {
    const policy = buildScreeningPolicy();
    expect(policy.classId).toBe("openapi-contract-to-offline-request-specimen");
    expect(policy.minApplicableInputsPerMember).toBe(2);
    expect(policy.bodyReadForConstruction).toBe(0);
    expect(policy.outcomeDrivenReplacement).toBe(false);
  });

  test("selects metadata deterministically and removes repository/blob duplicates", () => {
    const selected = selectCandidateMetadata([
      { repository: "z/repo", path: "b/SKILL.md", sha: "2" },
      { repository: "a/repo", path: "z/SKILL.md", sha: "1" },
      { repository: "a/repo", path: "a/SKILL.md", sha: "1" },
      { repository: "b/repo", path: "a/SKILL.md", sha: "2" },
    ], 10);
    expect(selected.map((row) => `${row.repository}:${row.path}`)).toEqual([
      "a/repo:a/SKILL.md",
      "b/repo:a/SKILL.md",
    ]);
  });

  test("candidate pool retains metadata failures without exposing body bytes", () => {
    const pool = buildCandidatePool([
      { repository: "owner/repo", path: "skills/api/SKILL.md", sha: "a", license: "MIT" },
      { repository: "owner/repo", path: "skills/api/SKILL.md", sha: "a", license: "MIT", error: "rate limited" },
      { repository: "other/repo", path: "SKILL.md", sha: "b", license: null, error: "missing license" },
    ]);
    expect(pool.candidates).toHaveLength(1);
    expect(pool.candidates.every((row) => row.bodyRead)).toBe(false);
    expect(pool.failures).toEqual([
      { repository: "owner/repo", path: "skills/api/SKILL.md", reason: "rate limited" },
      { repository: "other/repo", path: "SKILL.md", reason: "missing license" },
    ]);
  });
});
