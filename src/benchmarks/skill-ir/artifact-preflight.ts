import { copyFile, lstat, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  parseSafeRelativePath,
  validateArtifactPackage,
  type ValidatedArtifactPackage,
} from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

export type ArtifactRunScope = {
  skillId: string;
  taskId: string;
  taskSplit: string;
  model: string;
  modelFamily: string;
  adapter: string;
  adapterVersion: string;
  environment: string;
  context: string;
};

export type ProtectedFile = {
  relativePath: string;
  sha256: string;
};

export type ArtifactPreflightInput = {
  packageDir: string;
  workDir: string;
  scope: ArtifactRunScope;
  expectedContractDigest: string;
  runtimeExecutable?: string;
};

export type PreparedArtifactRun = {
  package: ValidatedArtifactPackage;
  workDir: string;
  scope: ArtifactRunScope;
  runtimeExecutable: string;
  generatedOutputs: string[];
  templates: Array<{ sourcePath: string; targetPath: string }>;
  protectedFiles: ProtectedFile[];
};

export type ProtectedWorkdirResult = {
  ok: boolean;
  mutatedPaths: string[];
};

function containedPath(root: string, relativePath: string): string {
  const safe = parseSafeRelativePath(relativePath);
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, safe);
  const fromRoot = relative(absoluteRoot, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Artifact path escapes root: ${relativePath}`);
  }
  return absolute;
}

async function listWorkdirFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const relativePath = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) {
      throw new Error(`Artifact workdir may not contain symbolic links: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...await listWorkdirFiles(root, absolute));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unsupported workdir entry type: ${relativePath}`);
    }
  }
  return files.sort();
}

async function snapshotProtectedFiles(workDir: string, excluded: Set<string>): Promise<ProtectedFile[]> {
  const protectedFiles: ProtectedFile[] = [];
  for (const relativePath of await listWorkdirFiles(workDir)) {
    if (excluded.has(relativePath)) continue;
    protectedFiles.push({
      relativePath,
      sha256: sha256Bytes(await readFile(containedPath(workDir, relativePath))),
    });
  }
  return protectedFiles;
}

function assertScope(input: ArtifactPreflightInput, packageRecord: ValidatedArtifactPackage): void {
  const { scope } = input;
  const provenance = packageRecord.provenance;
  if (scope.skillId !== packageRecord.manifest.skillId) {
    throw new Error(`Artifact skill scope mismatch: ${scope.skillId}`);
  }
  if (scope.taskSplit !== "development") {
    throw new Error(`Artifact runtime requires development task split, got ${scope.taskSplit}`);
  }
  if (!provenance.taskContract.taskIds.includes(scope.taskId)) {
    throw new Error(`Artifact task is not preregistered: ${scope.taskId}`);
  }
  if (input.expectedContractDigest !== provenance.taskContract.sha256) {
    throw new Error("Artifact task contract digest mismatch");
  }
  for (const key of ["model", "modelFamily", "adapter", "adapterVersion", "environment", "context"] as const) {
    if (scope[key] !== provenance.scope[key]) {
      throw new Error(`Artifact ${key} scope mismatch: expected ${provenance.scope[key]}, got ${scope[key]}`);
    }
  }
}

export async function preflightArtifactRun(input: ArtifactPreflightInput): Promise<PreparedArtifactRun> {
  const packageRecord = await validateArtifactPackage({
    packageDir: input.packageDir,
    expectedCatalog: "executable-artifact/v1",
  });
  assertScope(input, packageRecord);

  const workDir = resolve(input.workDir);
  const workDirStat = await stat(workDir).catch(() => undefined);
  if (!workDirStat?.isDirectory()) {
    throw new Error(`Artifact workdir must be an existing directory: ${input.workDir}`);
  }
  const runtimeExecutable = resolve(input.runtimeExecutable ?? process.execPath);
  const runtimeStat = await stat(runtimeExecutable).catch(() => undefined);
  if (!runtimeStat?.isFile()) {
    throw new Error(`Artifact checker runtime is unavailable: ${runtimeExecutable}`);
  }

  const generatedOutputs = packageRecord.manifest.generatedOutputs.map(parseSafeRelativePath);
  for (const output of generatedOutputs) containedPath(workDir, output);
  const generatedSet = new Set(generatedOutputs);
  const templates = packageRecord.manifest.artifacts
    .filter((artifact): artifact is typeof artifact & { targetPath: string } =>
      artifact.kind === "template" && artifact.targetPath !== undefined)
    .map((artifact) => {
      if (!generatedSet.has(artifact.targetPath)) {
        throw new Error(`Template target is not a declared generated output: ${artifact.targetPath}`);
      }
      return {
        sourcePath: containedPath(packageRecord.packageDir, artifact.path),
        targetPath: containedPath(workDir, artifact.targetPath),
      };
    });

  const policyArtifact = packageRecord.manifest.artifacts.find(
    (artifact) => artifact.kind === "validation-policy",
  );
  if (!policyArtifact) throw new Error("Artifact package is missing validation policy");
  const policy = JSON.parse(await readFile(containedPath(packageRecord.packageDir, policyArtifact.path), "utf8")) as {
    networkAllowed?: unknown;
    packageInstallationAllowed?: unknown;
  };
  if (policy.networkAllowed !== false || policy.packageInstallationAllowed !== false) {
    throw new Error("Artifact validation policy must disable network and package installation");
  }

  return {
    package: packageRecord,
    workDir,
    scope: input.scope,
    runtimeExecutable,
    generatedOutputs,
    templates,
    protectedFiles: await snapshotProtectedFiles(workDir, generatedSet),
  };
}

export async function materializeArtifactTemplates(input: PreparedArtifactRun): Promise<void> {
  for (const template of input.templates) {
    await mkdir(dirname(template.targetPath), { recursive: true });
    await copyFile(template.sourcePath, template.targetPath);
  }
}

export async function verifyProtectedWorkdir(input: PreparedArtifactRun): Promise<ProtectedWorkdirResult> {
  const mutatedPaths: string[] = [];
  for (const protectedFile of input.protectedFiles) {
    const path = containedPath(input.workDir, protectedFile.relativePath);
    const fileStat = await lstat(path).catch(() => undefined);
    if (!fileStat?.isFile() || fileStat.isSymbolicLink()) {
      mutatedPaths.push(protectedFile.relativePath);
      continue;
    }
    const actual = sha256Bytes(await readFile(path));
    if (actual !== protectedFile.sha256) {
      mutatedPaths.push(protectedFile.relativePath);
    }
  }
  return { ok: mutatedPaths.length === 0, mutatedPaths };
}
