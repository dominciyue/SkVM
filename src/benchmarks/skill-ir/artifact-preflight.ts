import { copyFile, lstat, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  parseSafeRelativePath,
  validateArtifactPackage,
  type ValidatedArtifactPackage,
  type ValidatedSemanticArtifactPackage,
} from "./artifact-package";
import { SemanticRuntimeContractSchema } from "./semantic-contract";
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

type PreparedArtifactRunBase = {
  workDir: string;
  scope: ArtifactRunScope;
  runtimeExecutable: string;
  generatedOutputs: string[];
  templates: Array<{ sourcePath: string; targetPath: string }>;
  protectedFiles: ProtectedFile[];
};

export type PreparedArtifactRun = PreparedArtifactRunBase & (
  | { catalog: "executable-artifact/v1"; package: ValidatedArtifactPackage }
  | {
    catalog: "executable-semantic-artifact/v2";
    package: ValidatedSemanticArtifactPackage;
  }
);

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

function assertCommonScope(
  input: ArtifactPreflightInput,
  packageRecord: ValidatedArtifactPackage | ValidatedSemanticArtifactPackage,
): void {
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
}

function assertV1Scope(input: ArtifactPreflightInput, packageRecord: ValidatedArtifactPackage): void {
  const { scope } = input;
  const provenance = packageRecord.provenance;
  for (const key of ["model", "modelFamily", "adapter", "adapterVersion", "environment", "context"] as const) {
    if (scope[key] !== provenance.scope[key]) {
      throw new Error(`Artifact ${key} scope mismatch: expected ${provenance.scope[key]}, got ${scope[key]}`);
    }
  }
}

function isSemanticPackage(
  packageRecord: ValidatedArtifactPackage | ValidatedSemanticArtifactPackage,
): packageRecord is ValidatedSemanticArtifactPackage {
  return packageRecord.manifest.catalog === "executable-semantic-artifact/v2";
}

async function prepareRuntimeContractDestination(workDir: string, relativePath: string): Promise<string> {
  const destination = containedPath(workDir, relativePath);
  const segments = parseSafeRelativePath(relativePath).split("/");
  let current = resolve(workDir);
  for (const segment of segments.slice(0, -1)) {
    current = resolve(current, segment);
    const entry = await lstat(current).catch(() => undefined);
    if (entry?.isSymbolicLink()) {
      throw new Error(`Runtime contract parent may not be a symbolic link: ${relativePath}`);
    }
    if (entry && !entry.isDirectory()) {
      throw new Error(`Runtime contract parent must be a directory: ${relativePath}`);
    }
    if (!entry) await mkdir(current);
  }
  if (await lstat(destination).catch(() => undefined)) {
    throw new Error(`Runtime contract path must not be pre-existing: ${relativePath}`);
  }
  return destination;
}

async function deriveRuntimeContract(
  packageRecord: ValidatedSemanticArtifactPackage,
  workDir: string,
  runtimeExecutable: string,
): Promise<void> {
  const destination = await prepareRuntimeContractDestination(
    workDir,
    packageRecord.manifest.runtimeContract.path,
  );
  const programPath = containedPath(
    packageRecord.packageDir,
    packageRecord.manifest.evidenceProgram.path,
  );
  const policyPath = containedPath(packageRecord.packageDir, "validation-policy.json");
  const proc = Bun.spawn([
    runtimeExecutable,
    programPath,
    `--workdir=${workDir}`,
    `--out=${destination}`,
    `--policy=${policyPath}`,
  ], { stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timeoutMs = packageRecord.manifest.evidenceProgram.timeoutMs;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const [exitCode] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error(`Semantic evidence program timed out after ${timeoutMs}ms`);
  if (exitCode !== 0) throw new Error(`Semantic evidence program failed with exit ${exitCode}`);

  const destinationStat = await lstat(destination).catch(() => undefined);
  if (!destinationStat?.isFile() || destinationStat.isSymbolicLink()) {
    throw new Error("Semantic evidence program did not produce a regular runtime contract");
  }
  try {
    SemanticRuntimeContractSchema.parse(JSON.parse(await readFile(destination, "utf8")));
  } catch {
    throw new Error("Semantic evidence program produced an invalid runtime contract JSON/schema");
  }
}

export async function preflightArtifactRun(input: ArtifactPreflightInput): Promise<PreparedArtifactRun> {
  const rawManifest = JSON.parse(await readFile(resolve(input.packageDir, "package-manifest.json"), "utf8")) as {
    catalog?: unknown;
  };
  const packageRecord = rawManifest.catalog === "executable-semantic-artifact/v2"
    ? await validateArtifactPackage({
      packageDir: input.packageDir,
      expectedCatalog: "executable-semantic-artifact/v2",
    })
    : await validateArtifactPackage({
      packageDir: input.packageDir,
      expectedCatalog: "executable-artifact/v1",
    });
  assertCommonScope(input, packageRecord);
  if (!isSemanticPackage(packageRecord)) {
    assertV1Scope(input, packageRecord);
  }

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
  const templates: Array<{ sourcePath: string; targetPath: string }> = [];
  for (const artifact of packageRecord.manifest.artifacts) {
    if (artifact.kind !== "template" || artifact.targetPath === undefined) continue;
    const targetPath = artifact.targetPath;
    if (!generatedSet.has(targetPath)) {
      throw new Error(`Template target is not a declared generated output: ${targetPath}`);
    }
    templates.push({
      sourcePath: containedPath(packageRecord.packageDir, artifact.path),
      targetPath: containedPath(workDir, targetPath),
    });
  }

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

  if (isSemanticPackage(packageRecord)) {
    if (generatedSet.has(packageRecord.manifest.runtimeContract.path)) {
      throw new Error("Runtime semantic contract cannot be a generated output");
    }
    await deriveRuntimeContract(packageRecord, workDir, runtimeExecutable);
  }

  const preparedBase: PreparedArtifactRunBase = {
    workDir,
    scope: input.scope,
    runtimeExecutable,
    generatedOutputs,
    templates,
    protectedFiles: await snapshotProtectedFiles(workDir, generatedSet),
  };
  return isSemanticPackage(packageRecord)
    ? { ...preparedBase, catalog: "executable-semantic-artifact/v2", package: packageRecord }
    : { ...preparedBase, catalog: "executable-artifact/v1", package: packageRecord };
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
