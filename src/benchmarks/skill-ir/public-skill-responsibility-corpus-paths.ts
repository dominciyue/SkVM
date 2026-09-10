import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

type NodeError = Error & { code?: string };

function isMissing(error: unknown): boolean {
  return (error as NodeError | undefined)?.code === "ENOENT";
}

function assertContained(root: string, target: string, label: string): void {
  const back = relative(root, target);
  if (back === ".." || back.startsWith(`..\\`) || back.startsWith("../") || isAbsolute(back)) {
    throw new Error(`${label} escapes repository root`);
  }
}

export function normalizeRepositoryRelativePath(value: string, label: string): string {
  const portable = value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
  const parts = portable.split("/");
  if (
    !portable
    || portable === "."
    || isAbsolute(value)
    || portable.startsWith("/")
    || parts.some((part) => part === "" || part === "." || part === ".." || part.includes("\0"))
  ) {
    throw new Error(`${label} must be a repository-relative contained path`);
  }
  return portable;
}

async function rootContext(rootDir: string): Promise<{ root: string; realRoot: string }> {
  const root = resolve(rootDir);
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink()) throw new Error("repository root must not be a symbolic link or junction");
  if (!rootInfo.isDirectory()) throw new Error("repository root must be a directory");
  const realRoot = await realpath(root);
  return { root, realRoot };
}

async function ensureDirectories(
  rootDir: string,
  parts: readonly string[],
  label: string,
  createMissing: boolean,
): Promise<{ root: string; realRoot: string; directory: string }> {
  const { root, realRoot } = await rootContext(rootDir);
  let directory = root;
  for (const part of parts) {
    directory = resolve(directory, part);
    assertContained(root, directory, label);
    let info;
    try {
      info = await lstat(directory);
    } catch (error) {
      if (!createMissing || !isMissing(error)) throw error;
      try {
        await mkdir(directory);
      } catch (mkdirError) {
        if ((mkdirError as NodeError | undefined)?.code !== "EEXIST") throw mkdirError;
      }
      info = await lstat(directory);
    }
    if (info.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link or junction: ${part}`);
    if (!info.isDirectory()) throw new Error(`${label} traverses a non-directory path component: ${part}`);
    assertContained(realRoot, await realpath(directory), label);
  }
  return { root, realRoot, directory };
}

export async function resolveContainedExistingFile(
  rootDir: string,
  value: string,
  label: string,
): Promise<string> {
  const portable = normalizeRepositoryRelativePath(value, label);
  const parts = portable.split("/");
  const fileName = parts.pop()!;
  const { root, realRoot, directory } = await ensureDirectories(rootDir, parts, label, false);
  const target = resolve(directory, fileName);
  assertContained(root, target, label);
  const info = await lstat(target);
  if (info.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link or junction`);
  if (!info.isFile()) throw new Error(`${label} must be a regular file`);
  const realTarget = await realpath(target);
  assertContained(realRoot, realTarget, label);
  return realTarget;
}

export async function resolveContainedNewFile(
  rootDir: string,
  value: string,
  label: string,
): Promise<string> {
  const portable = normalizeRepositoryRelativePath(value, label);
  const parts = portable.split("/");
  const fileName = parts.pop()!;
  const { root, directory } = await ensureDirectories(rootDir, parts, label, true);
  const target = resolve(directory, fileName);
  assertContained(root, target, label);
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`${label} already exists as a symbolic link or junction`);
    throw new Error(`${label} already exists`);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return target;
}

export async function createContainedDirectory(
  rootDir: string,
  value: string,
  label: string,
): Promise<string> {
  const portable = normalizeRepositoryRelativePath(value, label);
  const parts = portable.split("/");
  const finalName = parts.pop()!;
  const { root, realRoot, directory } = await ensureDirectories(rootDir, parts, label, true);
  const target = resolve(directory, finalName);
  assertContained(root, target, label);
  await mkdir(target);
  const info = await lstat(target);
  if (info.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link or junction`);
  if (!info.isDirectory()) throw new Error(`${label} must be a directory`);
  const realTarget = await realpath(target);
  assertContained(realRoot, realTarget, label);
  return realTarget;
}
