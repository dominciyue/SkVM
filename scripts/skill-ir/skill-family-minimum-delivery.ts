import { readFile, writeFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export const OBLIGATION_DISPOSITIONS = ["constructed", "rejected-with-reason", "unresolved", "outside-class", "source-blocked"] as const;
export const EVIDENCE_ROLES = ["calibration-only", "development-shadow", "primary-heldout", "primary-revision"] as const;
const COMMIT = /^[0-9a-f]{40}$/;

export type Manifest = Record<string, any>;

function fail(message: string): never { throw new Error(`invalid stage manifest: ${message}`); }
function array(value: unknown, name: string): any[] { if (!Array.isArray(value)) fail(`${name} must be an array`); return value; }
function relative(value: unknown, name: string) {
  if (typeof value !== "string" || !value || isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.split(/[\\/]+/).includes("..")) fail(`${name} path is unsafe`);
}

export function validateManifest(input: unknown): { ok: true; manifest: Manifest } {
  if (!input || typeof input !== "object") fail("manifest must be an object");
  const m = input as Manifest;
  if (m.schemaVersion !== "skill-family-minimum-delivery/v1") fail("schemaVersion");
  const s = m.stage;
  if (!s || s.identity !== "skill-family-minimum-delivery-001" || s.family !== "api-contract-driven-offline-test-construction" || s.class !== "api-contract-driven-offline-test-construction" || s.planRevision !== 2) fail("stage identity/family/class/planRevision");
  for (const key of ["head", "contractCommit", "implementationCommit"]) if (typeof s[key] !== "string" || !COMMIT.test(s[key])) fail(`stage ${key}`);
  if (typeof s.branch !== "string" || !s.branch) fail("stage branch");
  const repo = m.repositoryState;
  if (!repo || typeof repo.branch !== "string" || repo.branch !== s.branch || typeof repo.head !== "string" || repo.head !== s.head || !COMMIT.test(repo.head) || (repo.upstream !== null && typeof repo.upstream !== "string") || typeof repo.trackedWorktreeStatus !== "string" || typeof repo.untrackedFilesPresent !== "boolean") fail("repositoryState");
  if (!Number.isInteger(m.bodyReadCount) || m.bodyReadCount < 0) fail("bodyReadCount");
  if (!["planned", "calibrating", "shadow", "gate-ready", "method-frozen", "heldout-running", "revised-once", "no-revision", "reported"].includes(m.status)) fail("status");
  if (m.bodyReadCount !== 0 && !["method-frozen", "heldout-running", "revised-once", "no-revision", "reported"].includes(m.status)) fail("bodyReadCount must be zero before freeze");
  if (!m.protected || Object.values(m.protected).some((v) => v !== true)) fail("protected flags");
  const members = array(m.members, "members"); const roles = array(m.evidenceRoles, "evidenceRoles"); const obligations = array(m.obligations, "obligations"); const artifacts = array(m.artifacts, "artifacts");
  const memberIds = new Set<string>(); const inputIds = new Set<string>();
  for (const member of members) {
    if (typeof member.memberId !== "string" || !member.memberId || memberIds.has(member.memberId)) fail("duplicate or empty memberId"); memberIds.add(member.memberId); relative(member.sourcePath, `member ${member.memberId} sourcePath`);
    for (const input of array(member.inputs, `member ${member.memberId} inputs`)) { if (typeof input.inputId !== "string" || !input.inputId || inputIds.has(input.inputId)) fail("duplicate or empty inputId"); inputIds.add(input.inputId); relative(input.path, `input ${input.inputId} path`); }
  }
  if (roles.length !== members.length) fail("each member must have exactly one evidence role");
  const roleByMember = new Map<string, string>(); const bindings = new Set<string>();
  for (const row of roles) { if (!memberIds.has(row.memberId) || !EVIDENCE_ROLES.includes(row.role) || typeof row.roleBindingId !== "string" || !row.roleBindingId || row.roleLocked !== true || roleByMember.has(row.memberId) || bindings.has(row.roleBindingId) || !Array.isArray(row.inputIds)) fail("evidence role or roleBinding"); const member = members.find((m) => m.memberId === row.memberId)!; if (JSON.stringify([...row.inputIds].sort()) !== JSON.stringify(member.inputs.map((i: any) => i.inputId).sort())) fail("role inputIds"); bindings.add(row.roleBindingId); roleByMember.set(row.memberId, row.role); }
  const seenObligations = new Set<string>();
  for (const member of members) if (member.inputs.length && !obligations.some((o) => o.memberId === member.memberId)) fail("member inputs require obligation");
  for (const row of obligations) { const unmapped = row.key === null && ["unresolved", "source-blocked"].includes(row.disposition) && typeof row.reason === "string" && row.reason.length > 0; if (!memberIds.has(row.memberId) || typeof row.obligationId !== "string" || !row.obligationId || (!unmapped && (typeof row.key !== "string" || !row.key)) || seenObligations.has(`${row.memberId}:${row.obligationId}`)) fail("obligation identity"); seenObligations.add(`${row.memberId}:${row.obligationId}`); if (!OBLIGATION_DISPOSITIONS.includes(row.disposition)) fail("obligation disposition"); if (typeof row.sourceLocator !== "string" || !row.sourceLocator) fail("obligation source locator"); }
  const artifactIds = new Set<string>();
  for (const row of artifacts) { if (!['accepted', 'rejected', 'unresolved'].includes(row.status)) fail("artifact status"); if (typeof row.artifactId !== "string" || !row.artifactId || artifactIds.has(row.artifactId) || !memberIds.has(row.memberId) || !inputIds.has(row.inputId)) fail("artifact identity or reference"); artifactIds.add(row.artifactId); if (row.status === "accepted") { const c = row.checkerEvidence; if (!c || typeof c.checkerId !== "string" || !c.checkerId || typeof c.checkerVersion !== "string" || !c.checkerVersion || typeof c.reportPath !== "string" || typeof c.reportSha256 !== "string" || !/^[0-9a-f]{64}$/.test(c.reportSha256) || c.independent !== true || c.passed !== true) fail("accepted artifact requires complete checker evidence"); relative(c.reportPath, "checker reportPath"); } }
  if (m.status === "calibrating" && (!members.length || !roles.length)) fail("calibrating requires members and evidence roles");
  for (const row of roles) { const expected: Record<string, string[]> = { "calibration-only": ["planned", "calibrating", "shadow", "gate-ready", "method-frozen", "heldout-running", "no-revision", "revised-once", "reported"], "development-shadow": ["shadow", "gate-ready", "method-frozen", "heldout-running", "no-revision", "revised-once", "reported"], "primary-heldout": ["method-frozen", "heldout-running", "no-revision", "revised-once", "reported"], "primary-revision": ["revised-once", "reported"] }; if (!expected[row.role]!.includes(m.status)) fail("role changes after construction"); }
  return { ok: true, manifest: m };
}

export function parseManifest(text: string): Manifest { let parsed: unknown; try { parsed = JSON.parse(text); } catch { fail("invalid JSON"); } return validateManifest(parsed).manifest; }

export async function runManifestCli(manifestPath: string, outPath: string) { relative(manifestPath, "manifest"); relative(outPath, "out"); const root = await realpath(process.cwd()); const source = await realpath(resolve(root, manifestPath)); const destination = resolve(root, outPath); const parent = await realpath(dirname(destination)); if (!source.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`) || !parent.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) fail("path escapes cwd"); const manifest = parseManifest(await readFile(source, "utf8")); await writeFile(destination, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" }); return manifest; }

if (import.meta.main) {
  const manifest = process.argv.find((v) => v.startsWith("--manifest="))?.slice(11);
  const out = process.argv.find((v) => v.startsWith("--out="))?.slice(6);
  const step = process.argv.find((v) => v.startsWith("--step="))?.slice(7);
  const status = process.argv.find((v) => v.startsWith("--status="))?.slice(9);
  const implementationCommit = process.argv.find((v) => v.startsWith("--implementation-commit="))?.slice(24);
  if (manifest && out) { await runManifestCli(manifest, out); }
  else {
    const { continueStage, runStatus, runM1, runP0, runP1, runFreezeGate, runM2, runM3, runM4, runM5, runM6, syncStageManifest, writeCleanReproduction } = await import("../../src/skill-ir/skill-family-minimum-delivery-run");
    const root = process.cwd();
    if (step === "status") console.log(JSON.stringify(await runStatus(root), null, 2));
    else if (step === "m1") console.log(JSON.stringify(await runM1(root).then((r) => ({ selected: r.panel.selectedMemberIds, complete: r.members.map((m) => m.completeForClassScope) })), null, 2));
    else if (step === "p0") console.log(JSON.stringify(await runP0(root), null, 2));
    else if (step === "p1") console.log(JSON.stringify(await runP1(root), null, 2));
    else if (step === "g") console.log(JSON.stringify(await runFreezeGate(root), null, 2));
    else if (step === "m2") console.log(JSON.stringify(await runM2(root), null, 2));
    else if (step === "m3") console.log(JSON.stringify(await runM3(root).then((r) => ({ members: r.members.map((m: any) => ({ memberId: m.memberId, inputQualified: m.inputQualified, inClass: m.inClass, inventorySource: m.extraction?.inventorySource, acceptedArtifactCount: m.acceptedArtifactCount })), accounting: r.accounting })), null, 2));
    else if (step === "m4") console.log(JSON.stringify(await runM4(root), null, 2));
    else if (step === "m5") console.log(JSON.stringify(await runM5(root), null, 2));
    else if (step === "m6") console.log(JSON.stringify(await runM6(root).then((r) => ({ decision: r.decision, reason: r.reason, inputQualifiedCount: r.inputQualifiedCount })), null, 2));
    else if (step === "reproduce") console.log(JSON.stringify(await writeCleanReproduction(root, out), null, 2));
    else if (step === "manifest") {
      if (!implementationCommit || !["no-revision", "revised-once", "reported"].includes(status ?? "")) throw new Error("manifest step requires --status=no-revision|revised-once|reported and --implementation-commit=<40-hex>");
      const manifest = await syncStageManifest(root, status as "no-revision" | "revised-once" | "reported", implementationCommit);
      console.log(JSON.stringify({ status: manifest.status, bodyReadCount: manifest.bodyReadCount, members: manifest.members.length, obligations: manifest.obligations.length, artifacts: manifest.artifacts.length }, null, 2));
    }
    else if (step === "continue" || process.argv.includes("--continue")) {
      const halt = new Set(["reported", "stopped", "clean-reproduction-required"]);
      let last = await continueStage(root);
      console.log(JSON.stringify({ step: last.step }, null, 2));
      while (!halt.has(last.step)) {
        last = await continueStage(root);
        console.log(JSON.stringify({ step: last.step }, null, 2));
      }
    } else throw new Error("usage: --manifest=<path> --out=<path> | --step=status|m1|p0|p1|g|m2|m3|m4|m5|m6|manifest|reproduce|continue");
  }
}
