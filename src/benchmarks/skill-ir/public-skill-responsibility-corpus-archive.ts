import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { z } from "zod";
import { PublicSkillCorpusSelectionSchema } from "./public-skill-responsibility-corpus";
import {
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
} from "./public-skill-responsibility-corpus-paths";

export const PUBLIC_SKILL_SOURCE_ARCHIVE_SCHEMA_VERSION = "skill-ir-public-skill-responsibility-source-archive/v1" as const;
const Sha1Schema = z.string().regex(/^[0-9a-f]{40}$/u);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const ArchiveFileSchema = z.object({
  kind: z.enum(["skill", "license", "resource"]),
  sourcePath: z.string().min(1),
  archivePath: z.string().min(1).nullable(),
  retention: z.enum(["archived", "locator-only"]),
  retentionReason: z.string().min(1).nullable(),
  byteLength: z.number().int().nonnegative(),
  sha256: Sha256Schema,
  gitBlobOid: Sha1Schema,
}).strict().superRefine((value, context) => {
  if (value.retention === "archived" && (value.archivePath === null || value.retentionReason !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "archived file requires archivePath and no retentionReason" });
  }
  if (value.retention === "locator-only" && (value.archivePath !== null || value.retentionReason === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "locator-only file requires retentionReason and no archivePath" });
  }
});

const ArchiveIssueSchema = z.object({
  code: z.string().min(1),
  reference: z.string(),
  paths: z.array(z.string()),
}).strict();

export const PublicSkillSourceArchiveManifestSchema = z.object({
  schemaVersion: z.literal(PUBLIC_SKILL_SOURCE_ARCHIVE_SCHEMA_VERSION),
  identity: z.literal("skill-ir-public-skill-responsibility-corpus-development-001"),
  status: z.enum(["source-archive-complete", "source-archive-incomplete"]),
  selection: z.object({
    path: z.string().min(1),
    commit: Sha1Schema,
    sha256: Sha256Schema,
    committedAt: z.string().datetime(),
  }).strict(),
  firstBodyExposureAt: z.string().datetime(),
  rows: z.array(z.object({
    selectionRank: z.number().int().min(1).max(40),
    repositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
    commit: Sha1Schema,
    skillPath: z.string().min(1),
    status: z.enum(["complete", "resource-closure-incomplete", "locator-only"]),
    files: z.array(ArchiveFileSchema).min(2).max(100),
    issues: z.array(ArchiveIssueSchema),
  }).strict()).length(40),
  accounting: z.object({
    publicSourceRequests: z.number().int().positive(),
    publicSourceBytes: z.number().int().nonnegative(),
    archivedFiles: z.number().int().nonnegative(),
    archivedBytes: z.number().int().nonnegative(),
    locatorOnlyFiles: z.number().int().nonnegative(),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    pendingProspectiveAccesses: z.literal(0),
  }).strict(),
}).strict();

export type PublicSkillSourceArchiveManifest = z.infer<typeof PublicSkillSourceArchiveManifestSchema>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function gitBlobOid(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

const GitTreeEntrySchema = z.object({
  path: z.string().min(1),
  oid: z.string().regex(/^[0-9a-f]{40}$/u),
  size: z.number().int().nonnegative().nullable(),
  type: z.enum(["blob", "tree", "commit"]),
  mode: z.enum(["040000", "100644", "100755", "120000", "160000"]),
}).strict();

export type PublicSkillResourceClosureIssue = {
  code:
    | "external-resource"
    | "missing-resource"
    | "path-escape"
    | "unsupported-submodule"
    | "unsupported-symlink"
    | "resource-too-large"
    | "file-count-budget-exceeded"
    | "total-bytes-budget-exceeded";
  reference: string;
  paths: string[];
};

export type PublicSkillResourceClosurePlan = {
  status: "complete" | "resource-closure-incomplete";
  skillPath: string;
  packageRoot: string;
  resources: Array<{
    path: string;
    oid: string;
    size: number;
    mode: "100644" | "100755";
    reasons: Array<"explicit-file" | "named-directory">;
  }>;
  issues: PublicSkillResourceClosureIssue[];
  accounting: { files: number; bytes: number };
};

type ResourceReference = {
  raw: string;
  kind: "markdown" | "code" | "named-directory";
};

function codePointCompare(left: string, right: string): number {
  const a = [...left].map((value) => value.codePointAt(0)!);
  const b = [...right].map((value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function extractReferences(body: string, directories: readonly string[]): ResourceReference[] {
  const references: ResourceReference[] = [];
  for (const match of body.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    let target = match[1]!.trim();
    if (target.startsWith("<") && target.includes(">")) {
      target = target.slice(1, target.indexOf(">"));
    } else {
      target = target.split(/\s+/u)[0]!;
    }
    references.push({ raw: target, kind: "markdown" });
  }
  for (const match of body.matchAll(/`([^`\r\n]+)`/gu)) {
    const target = match[1]!.trim();
    if (target.includes("/") || target.includes("\\") || /\.[A-Za-z0-9_-]+$/u.test(target) || directories.includes(target)) {
      references.push({ raw: target, kind: "code" });
    }
  }
  for (const directory of directories) {
    const escaped = directory.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (new RegExp(`\\b${escaped}(?:[/\\\\]|\\s+director(?:y|ies)\\b)`, "iu").test(body)) {
      references.push({ raw: directory, kind: "named-directory" });
    }
  }
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}\0${reference.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withoutQueryOrFragment(value: string): string {
  const boundary = [value.indexOf("?"), value.indexOf("#")].filter((index) => index >= 0);
  return boundary.length === 0 ? value : value.slice(0, Math.min(...boundary));
}

function issue(
  issues: PublicSkillResourceClosureIssue[],
  code: PublicSkillResourceClosureIssue["code"],
  reference: string,
  paths: string[] = [],
): void {
  issues.push({ code, reference, paths: [...paths].sort(codePointCompare) });
}

export function planPublicSkillResourceClosure(options: {
  skillPath: string;
  skillBody: string;
  treeEntries: unknown;
  directlyNamedDirectories: readonly string[];
  maximumFiles: number;
  maximumTotalBytes: number;
  maximumBytesPerResource: number;
}): PublicSkillResourceClosurePlan {
  const skillPath = normalizeRepositoryRelativePath(options.skillPath, "skillPath");
  const packageRoot = posix.dirname(skillPath);
  const treeEntries = z.array(GitTreeEntrySchema).parse(options.treeEntries);
  const directories = z.array(z.string().min(1)).parse(options.directlyNamedDirectories);
  const maximumFiles = z.number().int().nonnegative().parse(options.maximumFiles);
  const maximumTotalBytes = z.number().int().nonnegative().parse(options.maximumTotalBytes);
  const maximumBytesPerResource = z.number().int().nonnegative().parse(options.maximumBytesPerResource);
  const byPath = new Map<string, z.infer<typeof GitTreeEntrySchema>>();
  for (const entry of treeEntries) {
    const path = normalizeRepositoryRelativePath(entry.path, "Git tree entry path");
    if (byPath.has(path)) throw new Error(`duplicate Git tree entry path: ${path}`);
    byPath.set(path, { ...entry, path });
  }

  const issues: PublicSkillResourceClosureIssue[] = [];
  const candidates = new Map<string, {
    path: string;
    oid: string;
    size: number;
    mode: "100644" | "100755";
    reasons: Set<"explicit-file" | "named-directory">;
  }>();

  const addEntry = (entry: z.infer<typeof GitTreeEntrySchema>, reference: ResourceReference): void => {
    if (entry.type === "commit" || entry.mode === "160000") {
      issue(issues, "unsupported-submodule", reference.raw, [entry.path]);
      return;
    }
    if (entry.mode === "120000") {
      issue(issues, "unsupported-symlink", reference.raw, [entry.path]);
      return;
    }
    if (entry.type !== "blob" || (entry.mode !== "100644" && entry.mode !== "100755") || entry.size === null) return;
    const existing = candidates.get(entry.path);
    const reason = reference.kind === "named-directory" ? "named-directory" : "explicit-file";
    if (existing) {
      existing.reasons.add(reason);
    } else {
      candidates.set(entry.path, { ...entry, mode: entry.mode, size: entry.size, reasons: new Set([reason]) });
    }
  };

  for (const reference of extractReferences(options.skillBody, directories)) {
    if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/u.test(reference.raw)) {
      issue(issues, "external-resource", reference.raw);
      continue;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(withoutQueryOrFragment(reference.raw).replaceAll("\\", "/"));
    } catch {
      issue(issues, "missing-resource", reference.raw);
      continue;
    }
    if (!decoded || decoded.startsWith("#")) continue;
    let path: string;
    if (decoded.startsWith("/")) {
      path = posix.normalize(decoded.replace(/^\/+/, ""));
    } else if (reference.kind === "code" && byPath.has(decoded)) {
      path = posix.normalize(decoded);
    } else {
      path = posix.normalize(posix.join(packageRoot, decoded));
    }
    if (!path || path === "." || path === ".." || path.startsWith("../") || posix.isAbsolute(path)) {
      issue(issues, "path-escape", reference.raw);
      continue;
    }
    const target = byPath.get(path);
    if (!target) {
      issue(issues, "missing-resource", reference.raw, [path]);
      continue;
    }
    if (target.type === "tree" || target.mode === "040000") {
      const prefix = `${path}/`;
      const descendants = treeEntries.filter((entry) => entry.path.startsWith(prefix)).sort((a, b) => codePointCompare(a.path, b.path));
      if (descendants.length === 0) issue(issues, "missing-resource", reference.raw, [path]);
      for (const descendant of descendants) addEntry(descendant, { ...reference, kind: "named-directory" });
      continue;
    }
    addEntry(target, reference);
  }

  const eligible = [...candidates.values()].sort((a, b) => codePointCompare(a.path, b.path));
  const withinPerFile = eligible.filter((entry) => {
    if (entry.size <= maximumBytesPerResource) return true;
    issue(issues, "resource-too-large", entry.path, [entry.path]);
    return false;
  });
  const withinCount = withinPerFile.slice(0, maximumFiles);
  if (withinPerFile.length > maximumFiles) {
    issue(issues, "file-count-budget-exceeded", "resource closure", withinPerFile.slice(maximumFiles).map((entry) => entry.path));
  }
  const selected: typeof withinCount = [];
  const totalOverflow: string[] = [];
  let bytes = 0;
  for (const entry of withinCount) {
    if (bytes + entry.size > maximumTotalBytes) {
      totalOverflow.push(entry.path);
      continue;
    }
    selected.push(entry);
    bytes += entry.size;
  }
  if (totalOverflow.length > 0) issue(issues, "total-bytes-budget-exceeded", "resource closure", totalOverflow);

  return {
    status: issues.length === 0 ? "complete" : "resource-closure-incomplete",
    skillPath,
    packageRoot,
    resources: selected.map((entry) => ({
      path: entry.path,
      oid: entry.oid,
      size: entry.size,
      mode: entry.mode,
      reasons: [...entry.reasons].sort(),
    })),
    issues,
    accounting: { files: selected.length, bytes },
  };
}

async function listArchiveFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => codePointCompare(left.name, right.name));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = join(directory, entry.name);
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`source archive contains a symbolic link or junction: ${relativePath}`);
    if (info.isDirectory()) {
      files.push(...await listArchiveFiles(target, relativePath));
    } else if (info.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`source archive contains an unsupported filesystem entry: ${relativePath}`);
    }
  }
  return files;
}

function exactPaths(actual: readonly string[], expected: readonly string[], label: string): void {
  const left = [...actual].sort(codePointCompare);
  const right = [...expected].sort(codePointCompare);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} file set / closure mismatch`);
  }
}

async function gitBytes(rootDir: string, gitExecutable: string, args: string[]): Promise<Uint8Array> {
  const child = Bun.spawn([
    gitExecutable,
    "-c",
    `safe.directory=${rootDir.replaceAll("\\", "/")}`,
    ...args,
  ], { cwd: rootDir, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`source archive Git binding failed: ${stderr.trim()}`);
  return new Uint8Array(stdout);
}

async function gitText(rootDir: string, gitExecutable: string, args: string[]): Promise<string> {
  return new TextDecoder().decode(await gitBytes(rootDir, gitExecutable, args)).trim();
}

export async function verifyPublicSkillSourceArchiveFiles(options: {
  rootDir: string;
  archiveDir: string;
  gitExecutable: string;
}): Promise<{
  status: "verified-source-archive";
  rows: 40;
  archivedFiles: number;
  locatorOnlyFiles: number;
  archivedBytes: number;
}> {
  const rootDir = resolve(options.rootDir);
  const archiveDir = normalizeRepositoryRelativePath(options.archiveDir, "archiveDir");
  const manifestFile = await resolveContainedExistingFile(
    rootDir,
    `${archiveDir}/archive-manifest.json`,
    "public skill source archive manifest",
  );
  const archiveRoot = dirname(manifestFile);
  const manifest = PublicSkillSourceArchiveManifestSchema.parse(JSON.parse(await readFile(manifestFile, "utf8")));
  const selectionPath = normalizeRepositoryRelativePath(manifest.selection.path, "selection path");
  const selectionFile = await resolveContainedExistingFile(rootDir, selectionPath, "public skill metadata selection");
  const selectionBytes = await readFile(selectionFile);
  if (sha256(selectionBytes) !== manifest.selection.sha256) throw new Error("source archive selection digest drift");
  const selectionGitBytes = await gitBytes(rootDir, options.gitExecutable, ["show", `${manifest.selection.commit}:${selectionPath}`]);
  if (sha256(selectionGitBytes) !== manifest.selection.sha256) throw new Error("source archive selection Git-bound digest drift");
  const selection = PublicSkillCorpusSelectionSchema.parse(JSON.parse(selectionBytes.toString("utf8")));
  if (selection.status !== "frozen-selection-pending-commit"
    || selection.selected.length !== 40
    || selection.totals.selectedSkills !== 40
    || selection.totals.selectedRepositories < 8
    || selection.totals.bodyExposures !== 0) {
    throw new Error("source archive requires an executable zero-exposure 40-row metadata selection");
  }
  const { portableSemanticSha256, ...selectionSemantic } = selection;
  if (sha256(new TextEncoder().encode(canonical(selectionSemantic))) !== portableSemanticSha256) {
    throw new Error("source archive selection portable semantic digest drift");
  }
  const committedAt = Date.parse(manifest.selection.committedAt);
  const exposedAt = Date.parse(manifest.firstBodyExposureAt);
  const gitCommittedAtText = await gitText(rootDir, options.gitExecutable, ["show", "-s", "--format=%cI", manifest.selection.commit]);
  const gitCommittedAt = Date.parse(gitCommittedAtText);
  if (!Number.isFinite(gitCommittedAt) || new Date(gitCommittedAt).toISOString() !== manifest.selection.committedAt) {
    throw new Error("selection committedAt does not match the bound Git commit");
  }
  if (exposedAt < committedAt) throw new Error("first body exposure precedes the selection commit");

  const expectedRanks = Array.from({ length: 40 }, (_, index) => index + 1);
  exactPaths(manifest.rows.map((row) => String(row.selectionRank)), expectedRanks.map(String), "selection rank");
  const selectedTuples = new Set<string>();
  const archivePaths = new Set<string>();
  let archivedFiles = 0;
  let archivedBytes = 0;
  let locatorOnlyFiles = 0;
  let publicSourceBytes = 0;
  let hasIncompleteRow = false;

  for (const row of manifest.rows) {
    const selected = selection.selected[row.selectionRank - 1];
    if (!selected
      || selected.selectionRank !== row.selectionRank
      || selected.repositoryFullName !== row.repositoryFullName
      || selected.commit !== row.commit
      || selected.path !== row.skillPath) {
      throw new Error(`source archive row ${row.selectionRank} does not match the bound selection`);
    }
    const skillPath = normalizeRepositoryRelativePath(row.skillPath, `row ${row.selectionRank} skillPath`);
    const tuple = `${row.repositoryFullName.toLowerCase()}\0${row.commit}\0${skillPath}`;
    if (selectedTuples.has(tuple)) throw new Error(`duplicate source archive selection tuple at row ${row.selectionRank}`);
    selectedTuples.add(tuple);
    const skillFiles = row.files.filter((file) => file.kind === "skill");
    const licenseFiles = row.files.filter((file) => file.kind === "license");
    if (skillFiles.length !== 1) {
      throw new Error(`row ${row.selectionRank} must contain exactly one skill file record`);
    }
    if (licenseFiles.length !== 1) {
      throw new Error(`row ${row.selectionRank} must contain exactly one license file record`);
    }
    const skillFile = skillFiles[0]!;
    const licenseFile = licenseFiles[0]!;
    if (skillFile.sourcePath !== selected.path
      || skillFile.byteLength !== selected.blobSize
      || skillFile.gitBlobOid !== selected.blobOid) {
      throw new Error(`row ${row.selectionRank} skill file does not match the bound selection`);
    }
    if (licenseFile.sourcePath !== selected.license.authorityPath
      || licenseFile.byteLength !== selected.license.size
      || licenseFile.gitBlobOid !== selected.license.blobOid) {
      throw new Error(`row ${row.selectionRank} license file does not match the bound selection`);
    }
    const sourcePaths = row.files.map((file) => normalizeRepositoryRelativePath(file.sourcePath, `row ${row.selectionRank} source path`));
    if (new Set(sourcePaths).size !== sourcePaths.length) throw new Error(`row ${row.selectionRank} contains duplicate source paths`);
    if (row.status === "complete" && row.issues.length > 0) throw new Error(`complete row ${row.selectionRank} contains issues`);
    if (row.status !== "complete" && row.issues.length === 0) throw new Error(`incomplete row ${row.selectionRank} lacks an issue`);
    if (row.status !== "complete") hasIncompleteRow = true;
    const rowBytes = row.files.reduce((total, file) => total + file.byteLength, 0);
    if (rowBytes > 5 * 1024 * 1024) throw new Error(`row ${row.selectionRank} exceeds the per-skill byte budget`);

    for (const file of row.files) {
      publicSourceBytes += file.byteLength;
      if (file.kind === "resource" && file.byteLength > 1024 * 1024) {
        throw new Error(`row ${row.selectionRank} resource exceeds the per-resource byte budget: ${file.sourcePath}`);
      }
      if (file.retention === "locator-only") {
        locatorOnlyFiles += 1;
        hasIncompleteRow = true;
        continue;
      }
      const archivePath = normalizeRepositoryRelativePath(file.archivePath!, `row ${row.selectionRank} archive path`);
      if (archivePath === "archive-manifest.json") throw new Error("archive file record cannot replace the manifest");
      if (archivePaths.has(archivePath)) throw new Error(`duplicate source archive path: ${archivePath}`);
      archivePaths.add(archivePath);
      archivedFiles += 1;
      archivedBytes += file.byteLength;
    }
  }

  if (manifest.status === "source-archive-complete" && hasIncompleteRow) {
    throw new Error("complete source archive contains an incomplete or locator-only row");
  }
  if (manifest.status === "source-archive-incomplete" && !hasIncompleteRow) {
    throw new Error("incomplete source archive lacks an incomplete row");
  }
  const actualFiles = await listArchiveFiles(archiveRoot);
  exactPaths(actualFiles, ["archive-manifest.json", ...archivePaths], "source archive");

  for (const row of manifest.rows) {
    for (const file of row.files) {
      if (file.retention !== "archived") continue;
      const target = await resolveContainedExistingFile(archiveRoot, file.archivePath!, `row ${row.selectionRank} archived file`);
      const bytes = await readFile(target);
      if (bytes.byteLength !== file.byteLength) throw new Error(`archive byte length drift at ${file.archivePath}`);
      if (sha256(bytes) !== file.sha256) throw new Error(`archive digest / sha256 drift at ${file.archivePath}`);
      if (gitBlobOid(bytes) !== file.gitBlobOid) throw new Error(`archive Git blob OID drift at ${file.archivePath}`);
    }
  }

  if (manifest.accounting.publicSourceBytes !== publicSourceBytes
    || manifest.accounting.archivedFiles !== archivedFiles
    || manifest.accounting.archivedBytes !== archivedBytes
    || manifest.accounting.locatorOnlyFiles !== locatorOnlyFiles) {
    throw new Error("source archive accounting drift");
  }
  return {
    status: "verified-source-archive",
    rows: 40,
    archivedFiles,
    locatorOnlyFiles,
    archivedBytes,
  };
}
