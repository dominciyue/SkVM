import { expect, test } from "bun:test";
import {
  buildClassDecisionCore,
  buildFinalStageReport,
  finalizeStageManifest,
  selectHeldoutMetadata,
  verifyStageReportCandidate,
} from "./skill-family-minimum-delivery-run";

const item = (repo: string, path: string, fork = false) => ({
  sha: "b".repeat(40), path, html_url: `https://github.com/${repo}/blob/main/${path}`,
  repository: { full_name: repo, fork, owner: { login: repo.split("/")[0] } },
});

test("held-out metadata selection keeps five distinct non-exposed repositories", () => {
  const excluded = new Set(["LambdaTest/agent-skills", "a5c-ai/babysitter"]);
  const items = [
    item("LambdaTest/agent-skills", "api/SKILL.md"),
    item("new-one/skills", "skills/openapi-tester/SKILL.md"),
    item("new-two/kit", "api-testing/SKILL.md"),
    item("new-three/qa", "openapi/SKILL.md"),
    item("forked/copy", "api-testing/SKILL.md", true),
    item("new-four/tools", "swagger-contract/SKILL.md"),
    item("new-five/agent", "skills/automating-api-testing/SKILL.md"),
    item("new-six/extra", "docs/readme.md"),
  ];
  const selected = selectHeldoutMetadata(items, excluded);
  expect(selected.candidates.map((row) => row.repository)).toEqual([
    "new-one/skills", "new-two/kit", "new-three/qa", "new-four/tools", "new-five/agent",
  ]);
  expect(selected.selected.map((row) => row.repository)).toHaveLength(3);
  expect(selected.reserve.repository).toBe("new-four/tools");
  expect(selected.exclusions.some((row) => row.reason === "previously-exposed")).toBe(true);
  expect(selected.exclusions.some((row) => row.reason === "fork")).toBe(true);
  expect(selected.bodyReadCount).toBe(0);
});

test("held-out selection fails closed below five metadata candidates", () => {
  expect(() => selectHeldoutMetadata([item("new-one/skills", "openapi/SKILL.md")], new Set())).toThrow(/five metadata/);
});

test("OpenAPI search hits still fill the five-candidate pool when the path is generic", () => {
  const items = [
    item("new-one/skills", "SKILL.md"),
    item("new-two/kit", "skills/demo/SKILL.md"),
    item("new-three/qa", "SKILL.md"),
    item("new-four/tools", "SKILL.md"),
    item("new-five/agent", "skills/openapi-tester/SKILL.md"),
  ];
  const selected = selectHeldoutMetadata(items, new Set());
  expect(selected.candidates).toHaveLength(5);
  expect(selected.selected[0]!.repository).toBe("new-five/agent");
});

test("held-out discovery calls the provided search function", async () => {
  const { discoverHeldoutMetadata } = await import("./skill-family-minimum-delivery-run");
  let called = 0;
  const items = ["a", "b", "c", "d", "e"].map((id) => item(`owner-${id}/repo`, "openapi/SKILL.md"));
  const found = await discoverHeldoutMetadata({
    excluded: new Set(),
    search: async () => { called += 1; return { total_count: 5, items }; },
  });
  expect(called).toBe(1);
  expect(found.selected!.candidates).toHaveLength(5);
  expect(found.sourceApiCalls).toBe(1);
});

test("local markdown refs stay inside the skill tree", async () => {
  const { localMarkdownRefs } = await import("./skill-family-minimum-delivery-run");
  expect(localMarkdownRefs("[x](references/a.md) [y](https://ex/a.md) [z](../escape.md)", "skills/openapi/SKILL.md")).toEqual(["skills/openapi/references/a.md"]);
});

const decisionInput = () => ({
  p0: { methodReady: true, accounting: { modelCalls: 0, paidCalls: 0, sourceApiCalls: 0, knownInputTokens: 0, knownOutputTokens: 0, billing: "unknown", developmentAgentCost: "unmeasured" } },
  p1: { methodReady: true, accounting: { modelCalls: 0, paidCalls: 0, sourceApiCalls: 0, knownInputTokens: 0, knownOutputTokens: 0, billing: "unknown", developmentAgentCost: "unmeasured" } },
  gate: { status: "method-frozen", gates: { D: { accounting: { modelCalls: 0, paidCalls: 0, sourceApiCalls: 1, knownInputTokens: 0, knownOutputTokens: 0, billing: "unknown", developmentAgentCost: "unmeasured" } } } },
  panel: { provenance: { distinctOwners: true, distinctRepositories: true, knownExactCopyAmongSelected: false, knownForkAmongSelected: false } },
  responsibilities: { members: [] },
  selection: {
    bodyReadCount: 0,
    selectedIds: ["a:SKILL.md", "b:SKILL.md", "c:SKILL.md"],
    reserveId: "d:SKILL.md",
    candidates: [
      { candidateId: "a:SKILL.md", repository: "owner-a/repo", owner: "owner-a", fork: false },
      { candidateId: "b:SKILL.md", repository: "owner-b/repo", owner: "owner-b", fork: false },
      { candidateId: "c:SKILL.md", repository: "owner-c/repo", owner: "owner-c", fork: false },
      { candidateId: "d:SKILL.md", repository: "owner-d/repo", owner: "owner-d", fork: false },
    ],
  },
  fetch: { lockBodyReadCount: 0, bodyReadCount: 3, reserveUnread: true, sourceApiCalls: 4, modelCalls: 0, paidCalls: 0 },
  first: {
    firstRunSeparated: true,
    repositorySpecificDispatch: 0,
    repairRows: 0,
    accounting: { modelCalls: 3, paidCalls: 3, sourceApiCalls: 0, knownInputTokens: 10, knownOutputTokens: 20, billing: "unknown", developmentAgentCost: "unmeasured" },
    members: ["a", "b", "c"].map((id) => ({
      memberId: id,
      candidateId: `${id}:SKILL.md`,
      repository: `owner-${id}/repo`,
      owner: `owner-${id}`,
      inClass: false,
      inputQualified: false,
      applicableInputCount: 0,
      acceptedArtifactCount: 0,
      classified: true,
      completeForClassScope: true,
      denominatorSha256: id.repeat(64).slice(0, 64),
      duties: [{ dutyId: `${id}-duty` }],
      resolved: { resolved: [{ obligationId: `${id}-obligation`, disposition: "unresolved" }] },
      dispositions: { constructed: 0, "rejected-with-reason": 0, unresolved: 1, "outside-class": 0, "source-blocked": 0 },
      artifacts: [],
    })),
  },
  revision: { sharedRevision: "none-required", firstRunSeparated: true, repositorySpecificDispatch: 0, failureClassification: { unresolvedSharedDefect: false } },
});

test("class decision closes independence, duty, input, checker, adaptation, and cost denominators", () => {
  const core = buildClassDecisionCore(decisionInput());
  expect(core.decision).toBe("insufficient-evidence");
  expect(core.independence).toMatchObject({ selectedCount: 3, distinctOwners: true, distinctRepositories: true, reserveUnread: true });
  expect(core.classScopedDutyDenominator).toMatchObject({ memberCount: 3, dutyCount: 3, obligationCount: 3, completeMemberCount: 3 });
  expect(core.inputDenominator).toEqual({ selectedMemberCount: 3, inputQualifiedMemberCount: 0, applicableInputCount: 0 });
  expect(core.checkerStatus).toEqual({ acceptedArtifactCount: 0, acceptedWithPassingIndependentChecker: 0, acceptedCheckerCoverage: 1, allAcceptedPassed: true });
  expect(core.adaptation).toEqual({ repositorySpecificDispatch: 0, primaryRepairRows: 0, sharedRevision: "none-required", sharedRuleChanges: 0 });
  expect(core.accounting.totals).toMatchObject({ sourceApiCalls: 5, modelCalls: 3, paidCalls: 3, knownInputTokens: 10, knownOutputTokens: 20, billing: "unknown" });
});

test("class decision rejects drift between the frozen selection and first-run members", () => {
  const input = decisionInput();
  input.first.members[2]!.candidateId = "replacement:SKILL.md";
  expect(() => buildClassDecisionCore(input)).toThrow(/selection.*first-run|first-run.*selection/iu);
});

test("class decision cannot ignore a non-independent held-out selection", () => {
  const input = decisionInput();
  input.selection.candidates[1]!.owner = "owner-a";
  const core = buildClassDecisionCore(input);
  expect(core.independence).toMatchObject({ eligible: false, distinctOwners: false });
  expect(core.decision).toBe("insufficient-evidence");
  expect(core.reason).toMatch(/independent|owner/iu);
});

test("clean reproduction verifies a separate candidate digest and final report binds that evidence", () => {
  const core = buildClassDecisionCore(decisionInput());
  const candidate = {
    schemaVersion: "skill-family-minimum-delivery-report-candidate/v1",
    identity: "skill-family-minimum-delivery-001",
    decision: core.decision,
    semanticSnapshotSha256: "1".repeat(64),
    evidenceBindings: [{ path: "decision.json", sha256: "2".repeat(64) }],
  };
  const verified = verifyStageReportCandidate({
    candidate,
    candidateSha256: "3".repeat(64),
    recomputedSemanticSnapshotSha256: "1".repeat(64),
    recomputedEvidenceBindings: candidate.evidenceBindings,
  });
  expect(verified.status).toBe("passed");
  expect(() => verifyStageReportCandidate({ ...verified.inputs, recomputedSemanticSnapshotSha256: "4".repeat(64) })).toThrow(/semantic snapshot/iu);
  const clean = {
    schemaVersion: "skill-family-minimum-delivery-clean-reproduction/v1",
    status: "passed",
    sourceReportPath: "results/stage/report-candidate.json",
    sourceReportSha256: "3".repeat(64),
    semanticSnapshotSha256: "1".repeat(64),
    evidenceBindingsVerified: true,
    checkerBindingsVerified: true,
    cleanCheckout: true,
    reproductionCommit: "a".repeat(40),
    calls: { sourceApiCalls: 0, modelCalls: 0, paidCalls: 0 },
  };
  const final = buildFinalStageReport(candidate, clean, "5".repeat(64));
  expect(final.reproduction).toMatchObject({ cleanCheckout: "passed", reproductionCommit: "a".repeat(40), cleanReportSha256: "5".repeat(64) });
  expect(final.reproduction).not.toHaveProperty("reportSha256");
  expect(() => buildFinalStageReport(candidate, { ...clean, calls: {} }, "5".repeat(64))).toThrow(/external calls|call accounting/iu);
});

test("finalized stage manifest preserves baseline identity and binds the live evidence checkpoint", () => {
  const baseline = {
    schemaVersion: "skill-family-minimum-delivery/v1",
    stage: { identity: "skill-family-minimum-delivery-001", family: "api-contract-driven-offline-test-construction", class: "api-contract-driven-offline-test-construction", planRevision: 2, branch: "skill-family-minimum-delivery-001", head: "1".repeat(40), contractCommit: "1".repeat(40), implementationCommit: "1".repeat(40) },
    repositoryState: { branch: "skill-family-minimum-delivery-001", head: "1".repeat(40), upstream: null, trackedWorktreeStatus: "clean", untrackedFilesPresent: true },
    protected: { historicalResults: true, heldoutSources: true, firstRuns: true },
  };
  const manifest = finalizeStageManifest(baseline, {
    status: "no-revision",
    bodyReadCount: 3,
    implementationCommit: "2".repeat(40),
    observedState: { branch: "skill-family-minimum-delivery-001", head: "3".repeat(40), upstream: null, trackedWorktreeStatus: "clean", untrackedFilesPresent: true },
    members: [{ memberId: "cal:a" }, { memberId: "shadow:a" }, { memberId: "heldout:a" }],
    evidenceRoles: [
      { memberId: "cal:a", role: "calibration-only" },
      { memberId: "shadow:a", role: "development-shadow" },
      { memberId: "heldout:a", role: "primary-heldout" },
    ],
    obligations: [], artifacts: [], accounting: { paidCalls: 3 }, evidenceIndex: [],
  });
  expect(manifest.stage).toMatchObject({ head: "1".repeat(40), contractCommit: "2".repeat(40), implementationCommit: "2".repeat(40) });
  expect(manifest).toMatchObject({ status: "no-revision", bodyReadCount: 3, checkpoint: { observedHead: "3".repeat(40) } });
  expect(manifest.evidenceRoles.map((row: any) => row.role)).toEqual(["calibration-only", "development-shadow", "primary-heldout"]);
});
