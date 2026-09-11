import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLASS_PROOF_IDENTITY,
  CLASS_PROOF_RESULT_RELATIVE,
  deriveTransferDecision,
  buildScreeningPolicy,
  buildCandidatePool,
  mergeCandidatePools,
  candidateMetadataFromSourceIndex,
  parseGithubSearchItems,
  runScreeningPolicy,
  extractResponsibilities,
  buildTaskInputBindings,
  hydrateEligibilityRepositories,
  buildGapMatrix,
  deriveDevelopmentGate,
  selectDevelopmentMembers,
  selectDevelopmentInputs,
  selectPrimaryInputBindings,
  selectPrimaryMembers,
  buildMethodLock,
  summarizePrimaryFirstRuns,
  deriveRevisionDecision,
  deriveProspectivePreparation,
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

  test("derives metadata from the prior source index without reading skill bodies", () => {
    const rows = candidateMetadataFromSourceIndex({
      repositories: [
        { repository: "owner/repo", license: "MIT", status: "processed" },
        { repository: "gone/repo", status: "failed", reason: "not found" },
      ],
      skills: [{
        repository: "owner/repo",
        skillPath: "skills/api/SKILL.md",
        commit: "c".repeat(40),
        files: [{ kind: "skill", gitBlobOid: "a".repeat(40) }],
      }],
    });
    expect(rows).toEqual([
      { repository: "gone/repo", path: "(repository)", sha: "", license: null, source: "cached-development", error: "not found" },
      { repository: "owner/repo", path: "skills/api/SKILL.md", sha: "a".repeat(40), license: "MIT", source: "cached-development" },
    ]);
    expect(rows.some((row) => "body" in row)).toBe(false);
  });

  test("normalizes GitHub search metadata and retains malformed-item failures", () => {
    const rows = parseGithubSearchItems({
      items: [
        { path: "skills/a/SKILL.md", sha: "b".repeat(40), repository: { full_name: "z/repo", default_branch: "main" } },
        { path: "README.md", sha: "c".repeat(40), repository: { full_name: "z/repo" } },
        { path: "skills/b/SKILL.md", repository: { full_name: "z/repo" } },
      ],
    });
    expect(rows.rows).toEqual([{ repository: "z/repo", path: "skills/a/SKILL.md", sha: "b".repeat(40), branch: "main", license: null, source: "github-search" }]);
    expect(rows.failures).toEqual([{ repository: "z/repo", path: "skills/b/SKILL.md", reason: "search-result-sha-missing" }]);
  });

  test("appends new metadata without rewriting the already frozen candidate prefix", () => {
    const existing = buildCandidatePool([{ repository: "a/repo", path: "SKILL.md", sha: "a".repeat(40) }]);
    const added = buildCandidatePool([
      { repository: "a/repo", path: "SKILL.md", sha: "a".repeat(40) },
      { repository: "b/repo", path: "SKILL.md", sha: "b".repeat(40) },
    ]);
    const merged = mergeCandidatePools(existing, added);
    expect(merged.candidates.map((row) => row.candidateId)).toEqual(["candidate-001", "candidate-002"]);
    expect(merged.candidates.map((row) => row.sha)).toEqual(["a".repeat(40), "b".repeat(40)]);
    expect(merged.candidates.every((row) => row.bodyRead === false)).toBe(true);
  });

  test("freezes policy and metadata pool before any body construction", async () => {
    const root = await mkdtemp(join(tmpdir(), "class-proof-screening-"));
    try {
      await writeFile(join(root, "sources.json"), JSON.stringify({ repositories: [], skills: [] }));
      const calls: string[] = [];
      const result = await runScreeningPolicy(root, {
        sourceIndexPath: "sources.json",
        queries: ["OpenAPI filename:SKILL.md"],
        request: async (endpoint) => {
          calls.push(endpoint);
          return { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ items: [
            { path: "skills/api/SKILL.md", sha: "a".repeat(40), repository: { full_name: "z/repo", default_branch: "main" } },
          ] })) };
        },
      });
      expect(calls).toHaveLength(1);
      expect(result.policy.bodyReadForConstruction).toBe(0);
      expect(result.candidatePool.bodyReadForConstruction).toBe(0);
      expect(result.candidatePool.candidates[0]?.bodyRead).toBe(false);
      expect(result.status.currentStep).toBe("screening");
      expect(JSON.parse(await readFile(join(root, CLASS_PROOF_RESULT_RELATIVE, "screening-policy.json"), "utf8")).identity).toBe(CLASS_PROOF_IDENTITY);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("extracts source-located core and outside-class duties without accepting unlocated text", () => {
    const rows = extractResponsibilities({
      memberId: "owner/repo:skill",
      sourcePath: "SKILL.md",
      body: [
        "Use an OpenAPI contract and enumerate every endpoint.",
        "Generate valid request examples and test cases.",
        "Authenticate against the live service and clean up fixtures.",
        "One unmapped business rule may need human review.",
      ].join("\n"),
    });
    expect(rows.some((row) => row.key === "all-operations" && row.sourceLocator === "SKILL.md:1" && row.plannedDisposition === "to-construct")).toBe(true);
    expect(rows.some((row) => row.key === "valid-request" && row.sourceLocator === "SKILL.md:2" && row.plannedDisposition === "to-construct")).toBe(true);
    expect(rows.some((row) => row.key === "live-execution" && row.plannedDisposition === "outside-class")).toBe(true);
    expect(rows.every((row) => row.sourceLocator.includes("SKILL.md:") || row.sourceLocator.startsWith("body:"))).toBe(true);
  });

  test("binds only fixed development API inputs in the archived index order", () => {
    const bindings = buildTaskInputBindings({
      schemaVersion: "skill-family-api-inputs/v1",
      exposure: "development",
      repository: "owner/contracts",
      commit: "c".repeat(40),
      inputs: [
        {
          inputId: "zeta-first",
          provider: "Demo Z",
          sourcePath: "zeta/openapi.yaml",
          sourceUrl: "https://example.invalid/zeta.yaml",
          status: "acquired",
          localPath: "sources/zeta.yaml",
          format: "yaml",
          byteLength: 3,
          sha256: "a".repeat(64),
          qualification: { eligible: true, reason: null },
          error: null,
        },
        {
          inputId: "alpha-second",
          provider: "Demo A",
          sourcePath: "alpha/openapi.json",
          sourceUrl: "https://example.invalid/alpha.json",
          status: "acquired",
          localPath: "sources/alpha.json",
          format: "json",
          byteLength: 4,
          sha256: "b".repeat(64),
          qualification: { eligible: true, reason: null },
          error: null,
        },
      ],
    }, "results/skill-ir/skill-family-deepening-20260911/api-inputs");
    expect(bindings.map((binding) => binding.inputId)).toEqual(["zeta-first", "alpha-second"]);
    expect(bindings[0]).toEqual({
      inputId: "zeta-first",
      provider: "Demo Z",
      sourcePath: "zeta/openapi.yaml",
      localPath: "results/skill-ir/skill-family-deepening-20260911/api-inputs/sources/zeta.yaml",
      format: "yaml",
      bytes: 3,
      sha256: "a".repeat(64),
      exposure: "development",
    });
  });

  test("selects one eligible development member per repository before construction", () => {
    const selected = selectDevelopmentMembers([
      { candidateId: "c2", skillId: "b/repo:two", repository: "b/repo", decision: "eligible" as const, applicableInputCount: 2 },
      { candidateId: "c1", skillId: "a/repo:one", repository: "a/repo", decision: "eligible" as const, applicableInputCount: 2 },
      { candidateId: "c3", skillId: "a/repo:three", repository: "a/repo", decision: "eligible" as const, applicableInputCount: 2 },
      { candidateId: "c4", skillId: "c/repo:four", repository: "c/repo", decision: "excluded" as const, applicableInputCount: 2 },
    ], 2);
    expect(selected.map((row) => row.candidateId)).toEqual(["c1", "c2"]);
  });

  test("hydrates missing eligibility repositories only from the matching source ledger", () => {
    const rows = hydrateEligibilityRepositories([
      { candidateId: "c1", skillId: "a/repo:one", decision: "eligible" as const, applicableInputCount: 2 },
    ], [
      { candidateId: "c1", repository: "a/repo" },
    ]);
    expect(rows[0]?.repository).toBe("a/repo");
    expect(() => hydrateEligibilityRepositories([
      { candidateId: "missing", skillId: "x/repo:one", decision: "eligible" as const, applicableInputCount: 2 },
    ], [])).toThrow(/repository evidence missing/u);
  });

  test("binds the first two fixed input-index entries without inspecting outcomes", () => {
    const inputs = [
      { inputId: "two", provider: "B", sourcePath: "two.yaml", localPath: "two", format: "yaml" as const, bytes: 2, sha256: "b".repeat(64), exposure: "development" as const },
      { inputId: "one", provider: "A", sourcePath: "one.yaml", localPath: "one", format: "yaml" as const, bytes: 1, sha256: "a".repeat(64), exposure: "development" as const },
      { inputId: "three", provider: "C", sourcePath: "three.yaml", localPath: "three", format: "yaml" as const, bytes: 3, sha256: "c".repeat(64), exposure: "development" as const },
    ];
    expect(selectDevelopmentInputs(inputs, 2).map((row) => row.inputId)).toEqual(["two", "one"]);
  });

  test("aggregates gap observations by class gap without letting one member hide another", () => {
    const report = buildGapMatrix([
      {
        gapId: "format-url-witness",
        memberId: "owner/a:skill",
        repository: "owner/a",
        inputId: "input-one",
        layer: "construction",
        status: "unresolved",
        classContract: true,
        module: "src/skill-ir/api-schema-witness.ts",
        independentOracle: "src/skill-ir/api-schema-checker.ts",
        reason: "unsupported: format url",
      },
      {
        gapId: "format-url-witness",
        memberId: "owner/b:skill",
        repository: "owner/b",
        inputId: "input-one",
        layer: "construction",
        status: "unresolved",
        classContract: true,
        module: "src/skill-ir/api-schema-witness.ts",
        independentOracle: "src/skill-ir/api-schema-checker.ts",
        reason: "unsupported: format url",
      },
      {
        gapId: "source-reference",
        memberId: "owner/a:skill",
        repository: "owner/a",
        inputId: "input-two",
        layer: "source",
        status: "source-blocked",
        classContract: false,
        module: "scripts/skill-ir/skill-family-class-proof.ts",
        independentOracle: "source locator validator",
        reason: "external reference is not archived",
      },
    ]);
    expect(report.gaps).toHaveLength(2);
    expect(report.gaps[0]).toMatchObject({ gapId: "format-url-witness", occurrenceMembers: 2, affectedInputs: ["input-one"], classContract: true });
    expect(report.gaps[0]?.existingModules).toEqual(["src/skill-ir/api-schema-witness.ts"]);
    expect(report.gaps[1]).toMatchObject({ gapId: "source-reference", occurrenceMembers: 1, classContract: false });
  });

  test("derives the development capability gate from independent denominators", () => {
    expect(deriveDevelopmentGate({
      memberCount: 3,
      inputBindings: 6,
      expectedInputsPerMember: 2,
      explainedInputs: 6,
      acceptedArtifacts: 4,
      checkedAcceptedArtifacts: 4,
      coreObligations: 20,
      constructedCoreObligations: 19,
      repositoryDispatchDetected: false,
      infrastructureFailures: 0,
    })).toMatchObject({ protocolReady: true, inputReady: true, capabilityReady: true });
    expect(deriveDevelopmentGate({
      memberCount: 3,
      inputBindings: 6,
      expectedInputsPerMember: 2,
      explainedInputs: 6,
      acceptedArtifacts: 6,
      checkedAcceptedArtifacts: 6,
      coreObligations: 20,
      constructedCoreObligations: 10,
      repositoryDispatchDetected: false,
      infrastructureFailures: 0,
    })).toMatchObject({ protocolReady: true, inputReady: true, capabilityReady: false });
    expect(deriveDevelopmentGate({
      memberCount: 3,
      inputBindings: 6,
      expectedInputsPerMember: 2,
      explainedInputs: 5,
      acceptedArtifacts: 6,
      checkedAcceptedArtifacts: 6,
      coreObligations: 20,
      constructedCoreObligations: 20,
      repositoryDispatchDetected: false,
      infrastructureFailures: 0,
    })).toMatchObject({ protocolReady: true, inputReady: false, capabilityReady: false });
  });

  test("selects repository-distinct primary and reserve members without outcome data", () => {
    const rows = [
      { candidateId: "c4", skillId: "z/skill", repository: "z/repo", decision: "eligible" as const, applicableInputCount: 2, skillPath: "z/SKILL.md" },
      { candidateId: "c3", skillId: "a/late", repository: "a/repo", decision: "eligible" as const, applicableInputCount: 2, skillPath: "z/SKILL.md", accepted: 0 },
      { candidateId: "c2", skillId: "a/early", repository: "a/repo", decision: "eligible" as const, applicableInputCount: 2, skillPath: "a/SKILL.md", accepted: 99 },
      { candidateId: "c1", skillId: "b/skill", repository: "b/repo", decision: "eligible" as const, applicableInputCount: 2, skillPath: "b/SKILL.md" },
      { candidateId: "c5", skillId: "c/skill", repository: "c/repo", decision: "eligible" as const, applicableInputCount: 1, skillPath: "c/SKILL.md" },
      { candidateId: "dev", skillId: "d/dev", repository: "d/repo", decision: "eligible" as const, applicableInputCount: 2, skillPath: "dev/SKILL.md" },
    ];
    const plan = selectPrimaryMembers(rows, new Set(["dev"]), { primaryCount: 3, reserveCount: 2 });
    expect(plan.primary.map((row) => row.candidateId)).toEqual(["c2", "c1", "c4"]);
    expect(plan.primary.map((row) => row.repository)).toEqual(["a/repo", "b/repo", "z/repo"]);
    expect(plan.reserve.map((row) => row.candidateId)).toEqual(["c3"]);
    expect(plan.ineligibleAfterScreening.map((row) => row.candidateId)).toEqual(["c5"]);
    expect(plan.outcomeDataUsed).toBe(false);
  });

  test("builds an immutable method lock with separate screening and primary reads", () => {
    const lock = buildMethodLock({
      implementationCommit: "a".repeat(40),
      classContractCommit: "b".repeat(40),
      classContractSha256: "c".repeat(64),
      screenedCandidateCount: 39,
      eligibleCandidateCount: 12,
      developmentCandidateIds: ["candidate-060"],
      primary: [{ candidateId: "candidate-091", repository: "owner/repo", skillPath: "skills/api/SKILL.md", sha: "d".repeat(40), applicableInputCount: 2 }],
      reserve: [{ candidateId: "candidate-092", repository: "other/repo", skillPath: "SKILL.md", sha: "e".repeat(40), applicableInputCount: 2 }],
      screeningBodyReadCount: 39,
    });
    expect(lock.lockBeforePrimaryRead).toBe(true);
    expect(lock.readAccounting).toEqual({ screeningBodyReadCount: 39, primaryBodyReadCount: 0 });
    expect(lock.thresholds.minPrimaryMembers).toBe(3);
    expect(lock.revisionPolicy.maxSharedRevisions).toBe(1);
    expect(lock.primary[0]?.candidateId).toBe("candidate-091");
  });

  test("anchors primary inputs to the agreed development ledger order", () => {
    const taskBindings = [
      { inputId: "adatree", provider: "A", sourcePath: "a.yaml", localPath: "a.yaml", format: "yaml" as const, bytes: 1, sha256: "a".repeat(64), exposure: "development" as const },
      { inputId: "onepassword-connect", provider: "1Password", sourcePath: "one.yaml", localPath: "one.yaml", format: "yaml" as const, bytes: 2, sha256: "b".repeat(64), exposure: "development" as const },
      { inputId: "onepassword-partnership", provider: "1Password", sourcePath: "two.yaml", localPath: "two.yaml", format: "yaml" as const, bytes: 3, sha256: "c".repeat(64), exposure: "development" as const },
    ];
    const members = [
      { inputBindings: [
        { inputId: "onepassword-connect", format: "yaml" as const, bytes: 2, sha256: "b".repeat(64), path: "one.yaml" },
        { inputId: "onepassword-partnership", format: "yaml" as const, bytes: 3, sha256: "c".repeat(64), path: "two.yaml" },
      ] },
      { inputBindings: [
        { inputId: "onepassword-connect", format: "yaml" as const, bytes: 2, sha256: "b".repeat(64), path: "one.yaml" },
        { inputId: "onepassword-partnership", format: "yaml" as const, bytes: 3, sha256: "c".repeat(64), path: "two.yaml" },
      ] },
    ];
    expect(selectPrimaryInputBindings(taskBindings, members).map((row) => row.inputId)).toEqual([
      "onepassword-connect", "onepassword-partnership",
    ]);
    expect(() => selectPrimaryInputBindings(taskBindings, [members[0]!, { inputBindings: [members[0]!.inputBindings[1]!, members[0]!.inputBindings[0]!] }])).toThrow(/input binding order mismatch/u);
  });

  test("summarizes primary first-run denominators without hiding missing or duplicate rows", () => {
    const base = (memberId: string, inputId: string, accepted: number, checked: number, outcome: "constructed" | "unresolved") => ({
      memberId,
      inputId,
      inputValid: true,
      runner: {
        status: "completed" as const,
        totals: { operations: 2, accepted, rejected: 2 - accepted, unresolved: 0, artifactCheckedPassedOperations: checked },
        verifier: { status: "verified" as const, operations: 2, accepted, checked },
      },
      construction: { obligations: { outcomes: [{ obligationId: `${memberId}:core`, outcome, reason: null }] } },
      failureClass: "none" as const,
    });
    const summary = summarizePrimaryFirstRuns({
      records: [
        base("m1", "i1", 1, 1, "constructed"),
        base("m1", "i2", 0, 0, "unresolved"),
        base("m2", "i1", 1, 1, "unresolved"),
      ],
      expectedMemberIds: ["m1", "m2"],
      expectedInputIds: ["i1", "i2"],
      coreObligationIdsByMember: { m1: ["m1:core"], m2: ["m2:core"] },
    });
    expect(summary.expectedRuns).toBe(4);
    expect(summary.actualRuns).toBe(3);
    expect(summary.missingRuns).toBe(1);
    expect(summary.duplicateRuns).toBe(0);
    expect(summary.acceptedArtifacts).toBe(2);
    expect(summary.checkedAcceptedArtifacts).toBe(2);
    expect(summary.checkerPassRate).toBe(1);
    expect(summary.firstRunAcceptedMembers).toBe(2);
    expect(summary.coreObligations).toBe(2);
    expect(summary.constructedCoreObligations).toBe(1);
    expect(summary.coreCoverage).toBe(0.5);
    expect(summary.protocolReady).toBe(false);
    expect(summary.capabilityReady).toBe(false);
  });

  test("does not count a duplicate primary first-run row as coverage", () => {
    const row = {
      memberId: "m1",
      inputId: "i1",
      inputValid: true,
      runner: {
        status: "completed" as const,
        totals: { operations: 1, accepted: 1, rejected: 0, unresolved: 0, artifactCheckedPassedOperations: 1 },
        verifier: { status: "verified" as const, operations: 1, accepted: 1, checked: 1 },
      },
      construction: { obligations: { outcomes: [{ obligationId: "m1:core", outcome: "constructed" as const, reason: null }] } },
      failureClass: "none" as const,
    };
    const summary = summarizePrimaryFirstRuns({
      records: [row, row],
      expectedMemberIds: ["m1"],
      expectedInputIds: ["i1"],
      coreObligationIdsByMember: { m1: ["m1:core"] },
    });
    expect(summary.duplicateRuns).toBe(1);
    expect(summary.protocolReady).toBe(false);
    expect(summary.inputReady).toBe(false);
  });

  test("requires a shared revision only for the same contract gap across two members", () => {
    expect(deriveRevisionDecision({
      gaps: [{ gapId: "strict-extra-fields", memberId: "m1", classContract: true, status: "unresolved" }],
    }).decision).toBe("no-revision");
    expect(deriveRevisionDecision({
      gaps: [
        { gapId: "format-url", memberId: "m1", classContract: true, status: "failed" },
        { gapId: "format-url", memberId: "m2", classContract: true, status: "unresolved" },
      ],
    }).decision).toBe("revision-required");
    expect(deriveRevisionDecision({
      gaps: [
        { gapId: "source-locator", memberId: "m1", classContract: false, status: "source-blocked" },
        { gapId: "source-locator", memberId: "m2", classContract: false, status: "source-blocked" },
      ],
    }).decision).toBe("no-revision");
  });

  test("keeps prospective preparation separate from the four development gates", () => {
    const result = deriveProspectivePreparation({
      protocolReady: true,
      inputReady: true,
      capabilityReady: true,
      transferDecision: "bounded-positive",
      methodLocked: true,
      prospectiveIdentityLocked: false,
      inputSelectionPreRegistered: false,
      predictionPlanPreRegistered: false,
      readinessDecisionRecorded: false,
      unseenInputsAccessed: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.decision).toBe("not-ready");
    expect(result.missingConditions).toEqual([
      "prospective-identity-not-locked",
      "prospective-input-selection-not-pre-registered",
      "prospective-prediction-plan-not-pre-registered",
      "prospective-readiness-decision-not-recorded",
    ]);
  });

  test("never permits prospective preparation when a development gate is incomplete", () => {
    const result = deriveProspectivePreparation({
      protocolReady: false,
      inputReady: true,
      capabilityReady: false,
      transferDecision: "insufficient-evidence",
      methodLocked: false,
      prospectiveIdentityLocked: true,
      inputSelectionPreRegistered: true,
      predictionPlanPreRegistered: true,
      readinessDecisionRecorded: true,
      unseenInputsAccessed: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.missingConditions).toEqual([
      "development-protocol-not-ready",
      "development-capability-not-ready",
      "method-not-locked",
      "transfer-decision-not-positive",
    ]);
  });
});
