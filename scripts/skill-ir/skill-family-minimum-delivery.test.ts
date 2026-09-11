import { expect, test } from "bun:test";
import { parseManifest, runManifestCli, validateManifest } from "./skill-family-minimum-delivery";

const base = () => ({
  schemaVersion: "skill-family-minimum-delivery/v1",
  stage: { identity: "skill-family-minimum-delivery-001", family: "api-contract-driven-offline-test-construction", class: "api-contract-driven-offline-test-construction", planRevision: 2, branch: "skill-family-minimum-delivery-001", head: "a".repeat(40), contractCommit: "b".repeat(40), implementationCommit: "c".repeat(40) },
  status: "planned", bodyReadCount: 0,
  repositoryState: { branch: "skill-family-minimum-delivery-001", head: "a".repeat(40), upstream: "origin/skill-family-minimum-delivery-001", trackedWorktreeStatus: "clean", untrackedFilesPresent: true },
  protected: { historicalResults: true, heldoutSources: true, firstRuns: true },
  evidenceRoles: [{ memberId: "m1", role: "calibration-only", roleBindingId: "m1-calibration", roleLocked: true, inputIds: ["i1"] }],
  members: [{ memberId: "m1", sourcePath: "fixtures/m1", inputs: [{ inputId: "i1", path: "fixtures/input.yaml" }] }],
  obligations: [{ memberId: "m1", obligationId: "o1", key: "m1:o1", disposition: "constructed", sourceLocator: "SKILL.md#1" }],
  artifacts: [{ artifactId: "a1", memberId: "m1", inputId: "i1", status: "accepted", checkerEvidence: { checkerId: "checker-v1", checkerVersion: "1", reportPath: "reports/a1.json", reportSha256: "d".repeat(64), independent: true, passed: true } }],
});

test("accepts the minimum valid manifest", () => expect(validateManifest(base())).toEqual({ ok: true, manifest: base() }));
test("rejects duplicate member and input IDs", () => {
  const m = base(); m.members.push({ memberId: "m1", sourcePath: "fixtures/m2", inputs: [] });
  expect(() => validateManifest(m)).toThrow(/memberId/);
  const n = base(); n.members[0]!.inputs.push({ inputId: "i1", path: "fixtures/other.yaml" });
  expect(() => validateManifest(n)).toThrow(/inputId/);
});
test("rejects unclassified obligations", () => { const m = base(); m.obligations[0]!.disposition = "accepted"; expect(() => validateManifest(m)).toThrow(/disposition/); });
test("rejects accepted artifacts without independent checker evidence", () => { const m = base(); delete m.artifacts[0]!.checkerEvidence; expect(() => validateManifest(m)).toThrow(/checker evidence/); });
test("rejects role changes after construction", () => { const m = base(); m.evidenceRoles[0]!.role = "primary-heldout"; m.status = "shadow"; expect(() => validateManifest(m)).toThrow(/role/); });
test("rejects body reads before freeze and absolute paths", () => { const m = base(); m.bodyReadCount = 1; expect(() => validateManifest(m)).toThrow(/bodyReadCount/); const n = base(); n.members[0]!.sourcePath = "C:/outside"; expect(() => validateManifest(n)).toThrow(/path is unsafe/); });
test("parseManifest returns validated JSON", () => expect(parseManifest(JSON.stringify(base())).stage.identity).toBe("skill-family-minimum-delivery-001"));
test("rejects family mismatch, traversal paths, duplicate or missing role bindings", () => {
  const family = base(); family.stage.family = "other"; expect(() => validateManifest(family)).toThrow(/family/);
  for (const path of ["../outside", "x\\../outside", "\\\\server\\share\\x", "C:/outside"]) { const m = base(); m.members[0]!.sourcePath = path; expect(() => validateManifest(m)).toThrow(/path/); }
  const role = base(); role.evidenceRoles.push({ ...role.evidenceRoles[0] }); expect(() => validateManifest(role)).toThrow(/role/);
  const missing = base(); delete missing.evidenceRoles[0]!.roleBindingId; expect(() => validateManifest(missing)).toThrow(/roleBinding/);
});
test("rejects incomplete obligations, artifacts and invalid references", () => {
  const m = base(); m.obligations[0]!.obligationId = ""; expect(() => validateManifest(m)).toThrow(/obligation/);
  const n = base(); n.members[0]!.inputs = [{ inputId: "i1", path: "fixtures/input.yaml" }]; n.obligations = []; expect(() => validateManifest(n)).toThrow(/obligation/);
  const a = base(); a.artifacts[0]!.checkerEvidence.checkerVersion = ""; expect(() => validateManifest(a)).toThrow(/checker evidence/);
  const b = base(); b.artifacts[0]!.memberId = "missing"; expect(() => validateManifest(b)).toThrow(/artifact/);
});
test("CLI rejects unsafe paths", async () => { await expect(runManifestCli("../manifest.json", "out.json")).rejects.toThrow(/path/); });
test("rejects empty calibrating panels but permits planned empty panels", () => { const m = base(); m.status = "calibrating"; m.members = []; m.evidenceRoles = []; m.obligations = []; m.artifacts = []; expect(() => validateManifest(m)).toThrow(/calibrating/); const p = base(); p.members = []; p.evidenceRoles = []; p.obligations = []; p.artifacts = []; expect(validateManifest(p).ok).toBe(true); });
test("rejects stage and repository identity drift, and accepts null upstream", () => { const m = base(); m.repositoryState.upstream = null; expect(validateManifest(m).ok).toBe(true); const n = base(); n.repositoryState.branch = "other"; expect(() => validateManifest(n)).toThrow(/repositoryState/); const h = base(); h.stage.head = "e".repeat(40); expect(() => validateManifest(h)).toThrow(/repositoryState/); });
test("rejects unsupported artifact status and duplicate obligation IDs", () => { const m = base(); m.artifacts[0].status = "accepted-ish"; expect(() => validateManifest(m)).toThrow(/artifact status/); const n = base(); n.obligations.push({ ...n.obligations[0], key: "other" }); expect(() => validateManifest(n)).toThrow(/obligation identity/); });
test("requires role input IDs to match member inputs", () => { const m = base(); m.evidenceRoles[0].inputIds = []; expect(() => validateManifest(m)).toThrow(/inputIds/); });
test("requires non-empty IDs and role inputIds array", () => { const m = base(); m.members[0].memberId = ""; expect(() => validateManifest(m)).toThrow(/memberId/); const n = base(); n.members[0].inputs[0].inputId = ""; expect(() => validateManifest(n)).toThrow(/inputId/); const r = base(); r.evidenceRoles[0].inputIds = "i1"; expect(() => validateManifest(r)).toThrow(/role|inputIds/); });

test("reported manifests retain immutable calibration and shadow history", () => {
  const m = base();
  m.status = "reported";
  expect(validateManifest(m).ok).toBe(true);
  const shadow = base();
  shadow.status = "reported";
  shadow.evidenceRoles[0].role = "development-shadow";
  expect(validateManifest(shadow).ok).toBe(true);
});

test("no-revision manifests reject primary-revision rows", () => {
  const m = base();
  m.status = "no-revision";
  m.evidenceRoles[0].role = "primary-revision";
  expect(() => validateManifest(m)).toThrow(/role/);
});

test("allows repeated normalized obligation keys when source obligation IDs remain unique", () => {
  const m = base();
  m.obligations.push({ ...m.obligations[0], obligationId: "o2" });
  expect(validateManifest(m).ok).toBe(true);
});

test("runner imports manifest validation from a side-effect-free module", async () => {
  const runner = await Bun.file(new URL("../../src/skill-ir/skill-family-minimum-delivery-run.ts", import.meta.url)).text();
  expect(runner).not.toContain("../../scripts/skill-ir/skill-family-minimum-delivery");
  expect(runner).toContain('from "./skill-family-stage-manifest"');
});
