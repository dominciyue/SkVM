import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export const OBLIGATION_DISPOSITIONS = [
  "constructed",
  "rejected-with-reason",
  "unresolved",
  "outside-class",
  "source-blocked",
] as const;

export const EVIDENCE_ROLES = [
  "calibration-only",
  "development-shadow",
  "primary-heldout",
  "primary-revision",
] as const;

const COMMIT = /^[0-9a-f]{40}$/;

export type Manifest = Record<string, any>;

function fail(message: string): never {
  throw new Error(`invalid stage manifest: ${message}`);
}

function array(value: unknown, name: string): any[] {
  if (!Array.isArray(value)) fail(`${name} must be an array`);
  return value;
}

function relative(value: unknown, name: string) {
  if (
    typeof value !== "string"
    || !value
    || isAbsolute(value)
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.startsWith("\\\\")
    || value.split(/[\\/]+/).includes("..")
  ) {
    fail(`${name} path is unsafe`);
  }
}

export function validateManifest(input: unknown): { ok: true; manifest: Manifest } {
  if (!input || typeof input !== "object") fail("manifest must be an object");
  const m = input as Manifest;
  if (m.schemaVersion !== "skill-family-minimum-delivery/v1") fail("schemaVersion");
  const s = m.stage;
  if (
    !s
    || s.identity !== "skill-family-minimum-delivery-001"
    || s.family !== "api-contract-driven-offline-test-construction"
    || s.class !== "api-contract-driven-offline-test-construction"
    || s.planRevision !== 2
  ) {
    fail("stage identity/family/class/planRevision");
  }
  for (const key of ["head", "contractCommit", "implementationCommit"]) {
    if (typeof s[key] !== "string" || !COMMIT.test(s[key])) fail(`stage ${key}`);
  }
  if (typeof s.branch !== "string" || !s.branch) fail("stage branch");
  const repo = m.repositoryState;
  if (
    !repo
    || typeof repo.branch !== "string"
    || repo.branch !== s.branch
    || typeof repo.head !== "string"
    || repo.head !== s.head
    || !COMMIT.test(repo.head)
    || (repo.upstream !== null && typeof repo.upstream !== "string")
    || typeof repo.trackedWorktreeStatus !== "string"
    || typeof repo.untrackedFilesPresent !== "boolean"
  ) {
    fail("repositoryState");
  }
  if (!Number.isInteger(m.bodyReadCount) || m.bodyReadCount < 0) fail("bodyReadCount");
  if (![
    "planned",
    "calibrating",
    "shadow",
    "gate-ready",
    "method-frozen",
    "heldout-running",
    "revised-once",
    "no-revision",
    "reported",
  ].includes(m.status)) {
    fail("status");
  }
  if (
    m.bodyReadCount !== 0
    && !["method-frozen", "heldout-running", "revised-once", "no-revision", "reported"].includes(m.status)
  ) {
    fail("bodyReadCount must be zero before freeze");
  }
  if (!m.protected || Object.values(m.protected).some((value) => value !== true)) fail("protected flags");
  const members = array(m.members, "members");
  const roles = array(m.evidenceRoles, "evidenceRoles");
  const obligations = array(m.obligations, "obligations");
  const artifacts = array(m.artifacts, "artifacts");
  const memberIds = new Set<string>();
  const inputIds = new Set<string>();
  for (const member of members) {
    if (typeof member.memberId !== "string" || !member.memberId || memberIds.has(member.memberId)) {
      fail("duplicate or empty memberId");
    }
    memberIds.add(member.memberId);
    relative(member.sourcePath, `member ${member.memberId} sourcePath`);
    for (const item of array(member.inputs, `member ${member.memberId} inputs`)) {
      if (typeof item.inputId !== "string" || !item.inputId || inputIds.has(item.inputId)) {
        fail("duplicate or empty inputId");
      }
      inputIds.add(item.inputId);
      relative(item.path, `input ${item.inputId} path`);
    }
  }
  if (roles.length !== members.length) fail("each member must have exactly one evidence role");
  const roleByMember = new Map<string, string>();
  const bindings = new Set<string>();
  for (const row of roles) {
    if (
      !memberIds.has(row.memberId)
      || !EVIDENCE_ROLES.includes(row.role)
      || typeof row.roleBindingId !== "string"
      || !row.roleBindingId
      || row.roleLocked !== true
      || roleByMember.has(row.memberId)
      || bindings.has(row.roleBindingId)
      || !Array.isArray(row.inputIds)
    ) {
      fail("evidence role or roleBinding");
    }
    const member = members.find((item) => item.memberId === row.memberId)!;
    if (JSON.stringify([...row.inputIds].sort()) !== JSON.stringify(member.inputs.map((item: any) => item.inputId).sort())) {
      fail("role inputIds");
    }
    bindings.add(row.roleBindingId);
    roleByMember.set(row.memberId, row.role);
  }
  const seenObligations = new Set<string>();
  for (const member of members) {
    if (member.inputs.length && !obligations.some((row) => row.memberId === member.memberId)) {
      fail("member inputs require obligation");
    }
  }
  for (const row of obligations) {
    const unmapped = row.key === null
      && ["unresolved", "source-blocked"].includes(row.disposition)
      && typeof row.reason === "string"
      && row.reason.length > 0;
    if (
      !memberIds.has(row.memberId)
      || typeof row.obligationId !== "string"
      || !row.obligationId
      || (!unmapped && (typeof row.key !== "string" || !row.key))
      || seenObligations.has(`${row.memberId}:${row.obligationId}`)
    ) {
      fail("obligation identity");
    }
    seenObligations.add(`${row.memberId}:${row.obligationId}`);
    if (!OBLIGATION_DISPOSITIONS.includes(row.disposition)) fail("obligation disposition");
    if (typeof row.sourceLocator !== "string" || !row.sourceLocator) fail("obligation source locator");
  }
  const artifactIds = new Set<string>();
  for (const row of artifacts) {
    if (!["accepted", "rejected", "unresolved"].includes(row.status)) fail("artifact status");
    if (
      typeof row.artifactId !== "string"
      || !row.artifactId
      || artifactIds.has(row.artifactId)
      || !memberIds.has(row.memberId)
      || !inputIds.has(row.inputId)
    ) {
      fail("artifact identity or reference");
    }
    artifactIds.add(row.artifactId);
    if (row.status === "accepted") {
      const checker = row.checkerEvidence;
      if (
        !checker
        || typeof checker.checkerId !== "string"
        || !checker.checkerId
        || typeof checker.checkerVersion !== "string"
        || !checker.checkerVersion
        || typeof checker.reportPath !== "string"
        || typeof checker.reportSha256 !== "string"
        || !/^[0-9a-f]{64}$/.test(checker.reportSha256)
        || checker.independent !== true
        || checker.passed !== true
      ) {
        fail("accepted artifact requires complete checker evidence");
      }
      relative(checker.reportPath, "checker reportPath");
    }
  }
  if (m.status === "calibrating" && (!members.length || !roles.length)) {
    fail("calibrating requires members and evidence roles");
  }
  for (const row of roles) {
    const expected: Record<string, string[]> = {
      "calibration-only": ["planned", "calibrating", "shadow", "gate-ready", "method-frozen", "heldout-running", "no-revision", "revised-once", "reported"],
      "development-shadow": ["shadow", "gate-ready", "method-frozen", "heldout-running", "no-revision", "revised-once", "reported"],
      "primary-heldout": ["method-frozen", "heldout-running", "no-revision", "revised-once", "reported"],
      "primary-revision": ["revised-once", "reported"],
    };
    if (!expected[row.role]!.includes(m.status)) fail("role changes after construction");
  }
  return { ok: true, manifest: m };
}

export function parseManifest(text: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("invalid JSON");
  }
  return validateManifest(parsed).manifest;
}

export async function runManifestCli(manifestPath: string, outPath: string) {
  relative(manifestPath, "manifest");
  relative(outPath, "out");
  const root = await realpath(process.cwd());
  const source = await realpath(resolve(root, manifestPath));
  const destination = resolve(root, outPath);
  const parent = await realpath(dirname(destination));
  const separator = process.platform === "win32" ? "\\" : "/";
  if (!source.startsWith(`${root}${separator}`) || !parent.startsWith(`${root}${separator}`)) {
    fail("path escapes cwd");
  }
  const manifest = parseManifest(await readFile(source, "utf8"));
  await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return manifest;
}
