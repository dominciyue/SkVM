import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { SkillIR } from "../../skill-ir/schema";

export type VerifiedSkillSource = {
  bytes: Uint8Array;
  text: string;
  sourcePath?: string;
  sourceDir?: string;
  sha256: string;
};

export type VerifiedSourceFileRecord = {
  path: string;
  sha256: string;
};

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveRepositoryPath(rootDir: string, path: string): string {
  if (isAbsolute(path)) {
    throw new Error(`Skill source path must be repository-relative: ${path}`);
  }

  const root = resolve(rootDir);
  const candidate = resolve(root, path);
  const relativePath = relative(root, candidate);
  if (relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(relativePath)) {
    throw new Error(`Skill source path escapes repository root: ${path}`);
  }
  return candidate;
}

export async function loadVerifiedSkillSource(ir: SkillIR, rootDir: string): Promise<VerifiedSkillSource> {
  if (ir.source.kind === "inline") {
    const bytes = Buffer.from(ir.source.text, "utf8");
    return {
      bytes,
      text: ir.source.text,
      sha256: sha256Bytes(bytes),
    };
  }

  const sourcePath = resolveRepositoryPath(rootDir, ir.source.path);
  const bytes = await readFile(sourcePath);
  const actual = sha256Bytes(bytes);
  if (actual !== ir.source.sha256.toLowerCase()) {
    throw new Error(`Skill source digest mismatch for ${ir.source.path}: expected ${ir.source.sha256}, got ${actual}`);
  }

  return {
    bytes,
    text: bytes.toString("utf8"),
    sourcePath,
    sourceDir: dirname(sourcePath),
    sha256: actual,
  };
}

export async function materializeVerifiedOriginalSource(
  ir: SkillIR,
  rootDir: string,
  destinationDir: string,
  sourceFiles?: VerifiedSourceFileRecord[],
): Promise<string> {
  const source = await materializeVerifiedSourceClosure(ir, rootDir, destinationDir, sourceFiles);
  const skillPath = resolve(destinationDir, "SKILL.md");
  await writeFile(skillPath, source.bytes);
  return skillPath;
}

export async function materializeVerifiedSourceClosure(
  ir: SkillIR,
  rootDir: string,
  destinationDir: string,
  sourceFiles?: VerifiedSourceFileRecord[],
): Promise<VerifiedSkillSource> {
  const source = await loadVerifiedSkillSource(ir, rootDir);
  await mkdir(destinationDir, { recursive: true });
  if (source.sourceDir) {
    if (sourceFiles !== undefined) {
      if (sourceFiles.length === 0) {
        throw new Error("Digest-pinned source closure must declare at least one file");
      }
      const destinations = new Set<string>();
      for (const record of sourceFiles) {
        const repositoryPath = resolveRepositoryPath(rootDir, record.path);
        const relativePath = relative(source.sourceDir, repositoryPath);
        if (
          relativePath === ".." ||
          relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
          isAbsolute(relativePath)
        ) {
          throw new Error(`Declared source file is outside the source closure: ${record.path}`);
        }
        const destination = resolve(destinationDir, relativePath);
        if (destinations.has(destination)) {
          throw new Error(`Duplicate declared source destination: ${record.path}`);
        }
        destinations.add(destination);
        const bytes = await readFile(repositoryPath);
        const actual = sha256Bytes(bytes);
        if (actual !== record.sha256.toLowerCase()) {
          throw new Error(`Source closure digest mismatch for ${record.path}: expected ${record.sha256}, got ${actual}`);
        }
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      }
      if (ir.source.kind === "file") {
        const primarySourcePath = ir.source.path;
        if (!sourceFiles.some((record) => record.path === primarySourcePath)) {
          throw new Error(`Source closure does not declare primary source: ${primarySourcePath}`);
        }
      }
    } else {
      await cp(source.sourceDir, destinationDir, { recursive: true });
    }
  }
  return source;
}
