import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseSafeRelativePath } from "./artifact-package";
import type { ProtectedFile } from "./artifact-preflight";
import { sha256Bytes } from "./source-fixture";

export type ArtifactSnapshotPhase = "pre-repair" | "post-repair";

export type ArtifactSnapshotReference = {
  schemaVersion: "skill-ir-artifact-snapshot-ref/v1";
  generationIdentity: string;
  phase: ArtifactSnapshotPhase;
  path: string;
  sha256: string;
};

export type CaptureArtifactSnapshotInput = {
  workDir: string;
  snapshotRoot: string;
  generationIdentity: string;
  phase: ArtifactSnapshotPhase;
  protectedFiles: ProtectedFile[];
};

export type ArtifactGenerationIdentityInput = {
  caseId: string;
  model: string;
  modelFamily: string;
  adapter: string;
  adapterVersion: string;
  runIndex: number;
  panelConfigId: string;
};

type SnapshotFile = {
  relativePath: string;
  bytes: Uint8Array;
  sha256: string;
};

function assertSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
}

function isContained(root: string, candidate: string): boolean {
  const fromRoot = relative(resolve(root), resolve(candidate));
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`));
}

function assertSnapshotPath(reference: ArtifactSnapshotReference): string {
  if (!isAbsolute(reference.path)) throw new Error("Artifact snapshot path must be absolute");
  assertSha256(reference.generationIdentity, "Artifact generation identity");
  assertSha256(reference.sha256, "Artifact snapshot digest");
  const path = resolve(reference.path);
  const root = dirname(dirname(path));
  const expected = resolve(root, reference.generationIdentity, reference.phase);
  if (!isContained(root, path) || path !== expected) {
    throw new Error("Artifact snapshot path does not match its frozen identity and phase");
  }
  return path;
}

async function readSnapshotFiles(root: string, directory = root): Promise<SnapshotFile[]> {
  const files: SnapshotFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) {
      throw new Error(`Artifact snapshot may not contain symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...await readSnapshotFiles(root, absolute));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Artifact snapshot contains an unsupported entry: ${relativePath}`);
    }
    const bytes = await readFile(absolute);
    files.push({ relativePath, bytes, sha256: sha256Bytes(bytes) });
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function treeDigest(files: SnapshotFile[]): string {
  const manifest = files.map(({ relativePath, sha256 }) => `${relativePath}\0${sha256}\0`).join("");
  return sha256Bytes(Buffer.from(manifest, "utf8"));
}

export function createArtifactGenerationIdentity(input: ArtifactGenerationIdentityInput): string {
  return sha256Bytes(Buffer.from(JSON.stringify([
    input.caseId,
    input.model,
    input.modelFamily,
    input.adapter,
    input.adapterVersion,
    input.runIndex,
    input.panelConfigId,
  ]), "utf8"));
}

async function assertProtectedInputs(
  files: SnapshotFile[],
  protectedFiles: ProtectedFile[],
): Promise<void> {
  const byPath = new Map(files.map((file) => [file.relativePath, file.sha256]));
  for (const protectedFile of protectedFiles) {
    const relativePath = parseSafeRelativePath(protectedFile.relativePath);
    assertSha256(protectedFile.sha256, `Protected input digest for ${relativePath}`);
    if (byPath.get(relativePath) !== protectedFile.sha256) {
      throw new Error(`Artifact protected input is missing or changed: ${relativePath}`);
    }
  }
}

export async function captureArtifactSnapshot(
  input: CaptureArtifactSnapshotInput,
): Promise<ArtifactSnapshotReference> {
  assertSha256(input.generationIdentity, "Artifact generation identity");
  const workDir = resolve(input.workDir);
  const snapshotRoot = resolve(input.snapshotRoot);
  if (isContained(workDir, snapshotRoot) || isContained(snapshotRoot, workDir)) {
    throw new Error("Artifact snapshot root and workdir must be disjoint");
  }
  const workdirStat = await lstat(workDir).catch(() => undefined);
  if (!workdirStat?.isDirectory() || workdirStat.isSymbolicLink()) {
    throw new Error("Artifact snapshot workdir must be a regular directory");
  }

  const files = await readSnapshotFiles(workDir);
  await assertProtectedInputs(files, input.protectedFiles);
  const target = resolve(snapshotRoot, input.generationIdentity, input.phase);
  if (!isContained(snapshotRoot, target)) throw new Error("Artifact snapshot path escapes snapshot root");
  if (await lstat(target).catch(() => undefined)) {
    throw new Error(`Artifact snapshot already exists: ${input.generationIdentity}/${input.phase}`);
  }

  try {
    await mkdir(target, { recursive: true });
    for (const file of files) {
      const destination = join(target, ...file.relativePath.split("/"));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.bytes);
    }
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }

  return {
    schemaVersion: "skill-ir-artifact-snapshot-ref/v1",
    generationIdentity: input.generationIdentity,
    phase: input.phase,
    path: target,
    sha256: treeDigest(files),
  };
}

export async function verifyArtifactSnapshot(
  reference: ArtifactSnapshotReference,
): Promise<ArtifactSnapshotReference> {
  if (reference.schemaVersion !== "skill-ir-artifact-snapshot-ref/v1") {
    throw new Error(`Unsupported artifact snapshot reference: ${reference.schemaVersion}`);
  }
  const path = assertSnapshotPath(reference);
  const stat = await lstat(path).catch(() => undefined);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Artifact snapshot path is unavailable: ${path}`);
  }
  const actual = treeDigest(await readSnapshotFiles(path));
  if (actual !== reference.sha256) {
    throw new Error(`Artifact snapshot digest mismatch: expected ${reference.sha256}, got ${actual}`);
  }
  return reference;
}
