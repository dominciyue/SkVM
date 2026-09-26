import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { isRecord, parseExperimentCatalog } from "./model";
import { selectEntries } from "./render";
import type { CatalogDiagnostic } from "./model";

export const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
export interface CatalogSource {
  requestedRoot: string;
  root: string;
  requestedCatalog: string;
  catalog: string;
  readAt: string;
  sha256: string;
  bytes: number;
  attempts: number;
  modifiedAt: string;
}
export interface CatalogReadResult {
  valid: boolean;
  entries: ReadonlyArray<Record<string, unknown>>;
  diagnostics: CatalogDiagnostic[];
  catalog?: Record<string, unknown>;
  source?: CatalogSource;
}

class CatalogIOError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "IO_ERROR";
}

export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function relativeParts(path: string): string[] {
  if (!path.trim() || path.includes("\0") || path.includes(":") || isAbsolute(path) || win32.isAbsolute(path)) throw new CatalogIOError("path", "Expected a repository-relative path without NUL, drive, URL or stream syntax.");
  const parts = path.replaceAll("\\", "/").split("/").filter((part) => part !== "" && part !== ".");
  if (parts.some((part) => part === ".." || /[. ]$/.test(part))) throw new CatalogIOError("path", "Parent traversal and ambiguous trailing dot/space segments are not accepted.");
  return parts;
}

// Resolve each prefix before proceeding so an escaping junction is never traversed
// to inspect its children. This checks explicit paths, not directory contents.
function containedPath(root: string, path: string, fileSystem = fs): string {
  let current = root;
  for (const part of relativeParts(path)) {
    current = fileSystem.realpathSync(join(current, part));
    if (!isWithin(root, current)) throw new CatalogIOError("escape", "Path resolves outside the repository root.");
  }
  return current;
}

function sameStat(a: fs.Stats, b: fs.Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

export function readCatalog(root: string, catalogPath: string, options: { maxBytes?: number; fileSystem?: typeof fs } = {}): CatalogReadResult {
  const fileSystem = options.fileSystem ?? fs;
  const maxBytes = options.maxBytes ?? MAX_CATALOG_BYTES;
  const failed = (code: string, message: string): CatalogReadResult => ({ valid: false, entries: [], diagnostics: [{ code, path: catalogPath, message }] });
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_CATALOG_BYTES) return failed("catalog-limit", `Byte limit must be between 1 and ${MAX_CATALOG_BYTES}.`);
  try {
    const realRoot = fileSystem.realpathSync(resolve(root));
    if (!fileSystem.statSync(realRoot).isDirectory()) return failed("root-type", "Root must be a directory.");
    for (let attempt = 1; attempt <= 2; attempt++) {
      const physical = containedPath(realRoot, catalogPath, fileSystem);
      const descriptor = fileSystem.openSync(physical, "r");
      let bytes: Buffer;
      let before: fs.Stats;
      let stable: boolean;
      try {
        before = fileSystem.fstatSync(descriptor);
        if (!before.isFile()) return failed("catalog-type", "Catalog must be a regular file.");
        if (before.size > maxBytes) return failed("catalog-too-large", `Catalog exceeds ${maxBytes} bytes.`);
        const buffer = Buffer.alloc(before.size + 1);
        let offset = 0;
        do {
          const count = fileSystem.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
          offset += count;
          if (count === 0) break;
        } while (offset < before.size);
        bytes = buffer.subarray(0, offset);
        const after = fileSystem.fstatSync(descriptor);
        const currentPath = containedPath(realRoot, catalogPath, fileSystem);
        stable = physical === currentPath && sameStat(before, after) && sameStat(before, fileSystem.statSync(currentPath)) && bytes.length === before.size;
      } finally {
        fileSystem.closeSync(descriptor);
      }
      if (!stable) {
        if (attempt === 2) return failed("catalog-changed", "Catalog changed during both read attempts; retry after the writer finishes.");
        continue;
      }
      let value: unknown;
      try {
        const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        value = JSON.parse(json);
      } catch {
        return failed("catalog-json", "Catalog must contain valid UTF-8 JSON.");
      }
      const parsed = parseExperimentCatalog(value);
      return {
        ...parsed,
        ...(isRecord(value) ? { catalog: value } : {}),
        source: {
          requestedRoot: root, root: realRoot, requestedCatalog: catalogPath, catalog: physical,
          readAt: new Date().toISOString(), sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.length, attempts: attempt, modifiedAt: before.mtime.toISOString(),
        },
      };
    }
    return failed("catalog-changed", "No stable catalog read.");
  } catch (error) {
    return failed(error instanceof CatalogIOError ? `catalog-${error.code}` : "catalog-read", error instanceof CatalogIOError ? error.message : `Cannot read catalog (${errorCode(error)}).`);
  }
}
export function checkCatalog(root: string, catalogPath: string): CatalogReadResult {
  const result = readCatalog(root, catalogPath);
  if (!result.valid || !result.source) return result;
  const diagnostics = [...result.diagnostics];
  result.entries.forEach((entry, index) => {
    for (const [key, path] of Object.entries(entry.artifacts as Record<string, string>)) {
      try {
        const physical = containedPath(result.source!.root, path);
        const stat = fs.statSync(physical);
        if (!stat.isFile() && !stat.isDirectory()) throw new CatalogIOError("type", "Artifact must be a regular file or directory.");
      } catch (error) {
        diagnostics.push({
          code: error instanceof CatalogIOError ? `artifact-${error.code}` : errorCode(error) === "ENOENT" ? "artifact-missing" : "artifact-read",
          entryId: entry.id as string, path: `entries[${index}].artifacts.${key}`,
          message: error instanceof CatalogIOError ? `${path}: ${error.message}` : `${path}: Cannot inspect artifact (${errorCode(error)}).`,
        });
      }
    }
  });
  return { ...result, valid: diagnostics.length === 0, diagnostics };
}

export interface ExportResult {
  valid: boolean;
  diagnostics: CatalogDiagnostic[];
  output?: { requested: string; resolved: string };
}
export function exportCatalog(root: string, catalogPath: string, output: string, options: { cwd?: string; id?: string; stage?: string; fileSystem?: typeof fs } = {}): ExportResult {
  const checked = checkCatalog(root, catalogPath);
  if (!checked.valid || !checked.source || !checked.catalog) return { valid: false, diagnostics: checked.diagnostics };
  const entries = selectEntries(checked.entries, options);
  if ((options.id !== undefined || options.stage !== undefined) && entries.length === 0) return { valid: false, diagnostics: [{ code: "no-match", path: "entries", message: "No entry matches the requested id/stage." }] };
  const fileSystem = options.fileSystem ?? fs;
  const fail = (code: string, message: string): ExportResult => ({ valid: false, diagnostics: [{ code, path: output, message }] });
  try {
    if (!output.trim() || output.includes("\0")) return fail("export-path", "Expected an explicit output file path.");
    const requestedPath = resolve(options.cwd ?? process.cwd(), output);
    const name = basename(requestedPath);
    if (name.includes(":") || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return fail("export-path", "Output filename has ambiguous or device/stream syntax.");
    const parent = fileSystem.realpathSync(dirname(requestedPath));
    if (!fileSystem.statSync(parent).isDirectory()) return fail("export-parent", "Output parent must be an existing directory.");
    const resolved = join(parent, name);
    if (relative(checked.source.catalog, resolved) === "") return fail("export-protected", "Cannot overwrite the input catalog.");
    for (const entry of checked.entries) {
      for (const path of Object.values(entry.artifacts as Record<string, string>)) {
        const artifact = containedPath(checked.source.root, path);
        if (relative(artifact, resolved) === "" || (fs.statSync(artifact).isDirectory() && isWithin(artifact, resolved))) return fail("export-protected", "Cannot write to a registered artifact or inside its directory.");
      }
    }
    const { entries: _entries, ...catalogMetadata } = checked.catalog;
    const destination = { requested: output, resolved };
    const summary = {
      schemaVersion: "skill-ir-experiment-catalog-summary/v1", summaryOnly: true,
      authority: "Regenerable navigation only; original artifacts remain authoritative. No evaluation or cost inference is performed.",
      exportedAt: new Date().toISOString(), source: checked.source, output: destination,
      selection: { ...(options.id === undefined ? {} : { id: options.id }), ...(options.stage === undefined ? {} : { stage: options.stage }) },
      catalogMetadata, entries,
    };
    // wx is the overwrite boundary, including existing symlinks/hardlinks and races.
    const descriptor = fileSystem.openSync(resolved, "wx");
    try {
      fileSystem.writeFileSync(descriptor, JSON.stringify(summary, null, 2) + "\n", "utf8");
      fileSystem.fsyncSync(descriptor);
    } finally {
      fileSystem.closeSync(descriptor);
    }
    return { valid: true, diagnostics: [], output: destination };
  } catch (error) {
    return fail(errorCode(error) === "EEXIST" ? "export-exists" : "export-write", `Cannot export summary (${errorCode(error)}). Existing files are never overwritten; after an I/O failure a newly created partial file may require manual inspection.`);
  }
}
