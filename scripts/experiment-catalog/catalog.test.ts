import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import { join, resolve, sep } from "node:path";
import { checkCatalog, exportCatalog, readCatalog } from "./io";
import { renderExperimentEntry, selectEntries } from "./render";
import { runCli } from "./cli";
import { parseExperimentCatalog } from "./model";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "synthetic-alpha", stage: "S", status: "generation-complete-evaluation-pending",
    provider: { knownTokens: { input: 12, output: 0, cacheRead: null, cacheWrite: "unknown" }, actualUsd: "unknown" },
    authoring: { knownTokens: 99, actualUsd: null },
    rawOutcome: { sourceRefuted: 2, semanticReview: "pending" },
    artifacts: { root: "evidence/", report: "evidence/report.json" },
    ...overrides,
  };
}
function catalog(entries: unknown[] = [entry()]) {
  return { schemaVersion: "skill-ir-experiment-catalog/v1", entries, future: { preserved: true } };
}
function codes(value: unknown) {
  return parseExperimentCatalog(value).diagnostics.map((item) => item.code);
}

describe("AD1 catalog parser", () => {
  test("preserves heterogeneous entries, extension fields, unknown, null, zero and absence", () => {
    const original = catalog([entry({ future: { nested: [null, 0, "unknown"] } }), entry({ id: "other", stage: "F", provider: { actualUsd: 0 }, effect: "negative" })]);
    const bytes = JSON.stringify(original);
    const parsed = parseExperimentCatalog(original);
    expect(parsed.valid).toBe(true);
    expect(parsed.entries).toEqual(original.entries as Record<string, unknown>[]);
    expect(parsed.entries[0]?.provider).toEqual((original.entries[0] as Record<string, unknown>).provider);
    expect(JSON.stringify(original)).toBe(bytes);
    expect(parsed.diagnostics).toEqual([]);
  });
  test("empty entries is a valid empty catalog", () => {
    expect(parseExperimentCatalog(catalog([]))).toEqual({ valid: true, entries: [], diagnostics: [] });
  });
  test("rejects non-object, unknown version and missing entries", () => {
    expect(codes(null)).toContain("catalog-type");
    expect(codes({ schemaVersion: "v2", entries: [] })).toContain("schema-version");
    expect(codes({ schemaVersion: "skill-ir-experiment-catalog/v1" })).toContain("entries-type");
  });
  test("reports duplicate id and precise empty core fields", () => {
    expect(codes(catalog([entry(), entry()]))).toContain("duplicate-id");
    for (const field of ["id", "stage", "status"]) {
      const parsed = parseExperimentCatalog(catalog([entry({ [field]: "  " })]));
      expect(parsed.valid).toBe(false);
      expect(parsed.diagnostics.some((item) => item.path === `entries[0].${field}`)).toBe(true);
    }
    expect(codes(catalog([null]))).toContain("entry-type");
  });
  test("rejects artifact containers and non-string or empty path values", () => {
    for (const artifacts of [null, [], "file", { root: [] }, { root: "" }]) {
      expect(parseExperimentCatalog(catalog([entry({ artifacts })])).valid).toBe(false);
    }
  });
  test("reports malformed numeric telemetry without coercing or dropping raw values", () => {
    for (const provider of [{ knownTokens: "12" }, { knownTokens: { input: "12" } }, { knownTokens: { output: -1 } }, { actualUsd: false }]) {
      const parsed = parseExperimentCatalog(catalog([entry({ provider })]));
      expect(parsed.valid).toBe(false);
      expect(parsed.diagnostics.some((item) => item.code === "metric-type")).toBe(true);
      expect(parsed.entries[0]?.provider).toEqual(provider);
    }
  });
});

// Synthetic sandboxes live only below this tool's owned fixtures directory.
const fixtureBase = resolve(import.meta.dir, "fixtures");
fs.mkdirSync(fixtureBase, { recursive: true });
const sandboxes: string[] = [];
function sandbox() {
  const base = fs.mkdtempSync(join(fixtureBase, "synthetic-"));
  sandboxes.push(base);
  const root = join(base, "repo");
  fs.mkdirSync(join(root, "evidence"), { recursive: true });
  fs.writeFileSync(join(root, "evidence", "report.json"), "synthetic evidence only");
  const file = join(root, "catalog.json");
  fs.writeFileSync(file, JSON.stringify(catalog()));
  return { base, root, file };
}
afterAll(() => {
  for (const base of sandboxes) {
    if (!resolve(base).startsWith(fixtureBase + sep)) throw new Error("Unsafe fixture cleanup");
    fs.rmSync(base, { recursive: true, force: true });
  }
});

describe("AD2 bounded read and explicit artifact checks", () => {
  test("reads files and directories without changing bytes or creating output", () => {
    const { root, file } = sandbox();
    const before = fs.readFileSync(file);
    const listing = fs.readdirSync(root, { recursive: true });
    const result = checkCatalog(root, "catalog.json");
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.source?.bytes).toBe(before.length);
    expect(result.source?.sha256).toHaveLength(64);
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readdirSync(root, { recursive: true })).toEqual(listing);
  });
  test("reports missing artifacts but retains entry and ignores path-like prose", () => {
    const { root, file } = sandbox();
    fs.writeFileSync(file, JSON.stringify(catalog([entry({ limits: ["../../never-read"], artifacts: { missing: "missing.json" } })])));
    const result = checkCatalog(root, "catalog.json");
    expect(result.valid).toBe(false);
    expect(result.entries).toHaveLength(1);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "artifact-missing", path: "entries[0].artifacts.missing", entryId: "synthetic-alpha" })]);
  });
  test("rejects traversal, absolute paths, drive paths, URLs, NUL and alternate streams", () => {
    const { root, file } = sandbox();
    for (const path of ["../escape", "evidence/../../escape", "/absolute", "C:\\absolute", "C:relative", "\\\\host\\share", "https://invalid.test/file", "evidence/zero\0file", "evidence/report.json:stream"]) {
      fs.writeFileSync(file, JSON.stringify(catalog([entry({ artifacts: { bad: path } })])));
      expect(checkCatalog(root, "catalog.json").diagnostics.map((item) => item.code)).toContain("artifact-path");
    }
  });
  test("rejects a junction escaping root before inspecting descendants", () => {
    const { base, root, file } = sandbox();
    const outside = join(base, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, "private.txt"), "not catalog evidence");
    fs.symlinkSync(outside, join(root, "escape"), "junction");
    fs.writeFileSync(file, JSON.stringify(catalog([entry({ artifacts: { bad: "escape/private.txt" } })])));
    expect(checkCatalog(root, "catalog.json").diagnostics.map((item) => item.code)).toContain("artifact-escape");
  });
  test("accepts empty catalog and rejects unreadable, malformed or oversized input", () => {
    const { root, file } = sandbox();
    fs.writeFileSync(file, JSON.stringify(catalog([])));
    expect(checkCatalog(root, "catalog.json").valid).toBe(true);
    expect(readCatalog(root, "missing.json").valid).toBe(false);
    expect(readCatalog(root, "../outside.json").valid).toBe(false);
    fs.writeFileSync(file, "{");
    expect(readCatalog(root, "catalog.json").diagnostics.map((item) => item.code)).toContain("catalog-json");
    fs.writeFileSync(file, " ".repeat(100));
    expect(readCatalog(root, "catalog.json", { maxBytes: 99 }).diagnostics.map((item) => item.code)).toContain("catalog-too-large");
  });
  test("retries one changing read and records the stable version", () => {
    const { root, file } = sandbox();
    let reads = 0;
    const changed = JSON.stringify(catalog([entry({ status: "changed-once" })]));
    const fileSystem = { ...fs, readSync(...args: any[]) {
      const count = (fs.readSync as any)(...args);
      if (++reads === 1) fs.writeFileSync(file, changed);
      return count;
    } } as typeof fs;
    const result = readCatalog(root, "catalog.json", { fileSystem });
    expect(result.valid).toBe(true);
    expect(result.source?.attempts).toBe(2);
    expect(result.entries[0]?.status).toBe("changed-once");
  });
  test("repeated input changes produce a diagnostic after at most two attempts", () => {
    const { root, file } = sandbox();
    let reads = 0;
    const fileSystem = { ...fs, readSync(...args: any[]) {
      const count = (fs.readSync as any)(...args);
      fs.appendFileSync(file, " ".repeat(++reads));
      return count;
    } } as typeof fs;
    expect(readCatalog(root, "catalog.json", { fileSystem }).diagnostics.map((item) => item.code)).toContain("catalog-changed");
    expect(reads).toBe(2);
  });
});

describe("AD3 query and CLI", () => {
  test("filters exact id/stage with stable order and combined intersection", () => {
    const entries = [entry(), entry({ id: "beta", stage: "T" }), entry({ id: "gamma" })];
    expect(selectEntries(entries)).toEqual(entries);
    expect(selectEntries(entries, { stage: "S" }).map((value) => value.id)).toEqual(["synthetic-alpha", "gamma"]);
    expect(selectEntries(entries, { id: "beta" })).toEqual([entries[1]!]);
    expect(selectEntries(entries, { id: "beta", stage: "S" })).toEqual([]);
  });
  test("text keeps separate metrics, raw review state and complex extension values", () => {
    const text = renderExperimentEntry(entry({ actualUsd: 0, future: { complex: [false, { nested: 0 }] } }));
    expect(text).toContain("generation-complete-evaluation-pending");
    expect(text).toContain('rawOutcome.semanticReview: "pending"');
    expect(text).toContain('provider.actualUsd: "unknown"');
    expect(text).toContain("authoring.actualUsd: null");
    expect(text).toContain("actualUsd: 0");
    expect(text).toContain("provider.knownTokens.output: 0");
    expect(text).toContain("provider.knownTokens.cacheRead: null");
    expect(text).toContain('provider.knownTokens.cacheWrite: "unknown"');
    expect(text).toContain('future: {"complex":[false,{"nested":0}]}');
    expect(text).toContain("not evaluated");
    expect(text).not.toContain("totalTokens");
  });
  test("show text/JSON and check JSON use root-relative catalog and never create files", () => {
    const { base, root, file } = sandbox();
    const before = fs.readFileSync(file);
    const listing = fs.readdirSync(base, { recursive: true });
    const common = ["--root=repo", "--catalog=catalog.json"];
    const text = runCli(["show", ...common, "--id=synthetic-alpha"], base);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("synthetic-alpha");
    const result = runCli(["show", ...common, "--stage", "S", "--format=json"], base);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).entries).toEqual(catalog().entries);
    const checked = runCli(["check", ...common, "--format=json"], base);
    expect(JSON.parse(checked.stdout).valid).toBe(true);
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readdirSync(base, { recursive: true })).toEqual(listing);
    expect(fs.existsSync(join(root, "results"))).toBe(false);
  });
  test("unmatched selection exits 1 with empty entries and actionable diagnostic", () => {
    const { root } = sandbox();
    const result = runCli(["show", `--root=${root}`, "--catalog=catalog.json", "--id=missing", "--format=json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).entries).toEqual([]);
    expect(JSON.parse(result.stdout).diagnostics[0].code).toBe("no-match");
  });
  test("public process returns 1 for bad data, while show can navigate missing evidence", () => {
    const { root, file } = sandbox();
    fs.writeFileSync(file, "{");
    for (const command of ["check", "show"]) {
      const child = Bun.spawnSync([Bun.which("bun")!, join(import.meta.dir, "cli.ts"), command, `--root=${root}`, "--catalog=catalog.json", "--format=json"]);
      expect(child.exitCode).toBe(1);
      expect(JSON.parse(child.stdout.toString()).diagnostics[0].code).toBe("catalog-json");
    }
    fs.writeFileSync(file, JSON.stringify(catalog([entry({ artifacts: { report: "missing" } })])));
    expect(runCli(["check", `--root=${root}`, "--catalog=catalog.json"]).exitCode).toBe(1);
    expect(runCli(["show", `--root=${root}`, "--catalog=catalog.json"]).exitCode).toBe(0);
  });
  test("help and module import are side-effect free; bad options exit 2", () => {
    const { base } = sandbox();
    const listing = fs.readdirSync(base, { recursive: true });
    expect(runCli(["--help"], base).stdout).toContain("Usage:");
    expect(runCli(["show", "--help"], base).exitCode).toBe(0);
    for (const args of [[], ["wat"], ["show", "--wat=x"], ["show", "--format=yaml"], ["show", "--id="], ["show", "--root=.", "--root=."], ["check", "--stage=S"], ["show", "--out=file"], ["export"]]) {
      expect(runCli(args, base).exitCode).toBe(2);
    }
    const process = Bun.spawnSync([Bun.which("bun")!, "-e", `await import(${JSON.stringify(join(import.meta.dir, "cli.ts"))});`], { cwd: base });
    expect(process.exitCode).toBe(0);
    expect(process.stdout.toString()).toBe("");
    expect(fs.readdirSync(base, { recursive: true })).toEqual(listing);
  });
});

describe("AD4 explicit summary export", () => {
  test("exports new JSON under caller cwd with source, metadata, raw entries and authority notice", () => {
    const { base, root, file } = sandbox();
    const before = fs.readFileSync(file);
    const result = runCli(["export", "--root=repo", "--catalog=catalog.json", "--out=summary.json"], base);
    expect(result.exitCode).toBe(0);
    const value = JSON.parse(fs.readFileSync(join(base, "summary.json"), "utf8"));
    expect(value.schemaVersion).toBe("skill-ir-experiment-catalog-summary/v1");
    expect(value.summaryOnly).toBe(true);
    expect(value.authority).toContain("original artifacts");
    expect(value.source.catalog).toBe(fs.realpathSync(file));
    expect(value.source.sha256).toHaveLength(64);
    expect(value.output.requested).toBe("summary.json");
    expect(value.output.resolved).toBe(join(base, "summary.json"));
    expect(value.entries).toEqual(catalog().entries);
    expect(value.catalogMetadata.future).toEqual({ preserved: true });
    expect(fs.existsSync(join(root, "summary.json"))).toBe(false);
    expect(fs.readFileSync(file)).toEqual(before);
  });
  test("refuses existing output, catalog, artifacts and output aliases without changing them", () => {
    const { base, root, file } = sandbox();
    fs.writeFileSync(join(base, "existing.json"), "keep me");
    const before = fs.readFileSync(file);
    for (const output of ["existing.json", "repo/catalog.json", "repo/evidence/report.json", "repo/evidence", "repo/evidence/new.json"]) {
      const result = exportCatalog(root, "catalog.json", output, { cwd: base });
      expect(result.valid).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
    fs.symlinkSync(join(root, "evidence"), join(base, "alias"), "junction");
    expect(exportCatalog(root, "catalog.json", "alias/new.json", { cwd: base }).valid).toBe(false);
    fs.linkSync(file, join(base, "hardlink.json"));
    expect(exportCatalog(root, "catalog.json", "hardlink.json", { cwd: base }).valid).toBe(false);
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readFileSync(join(base, "existing.json"), "utf8")).toBe("keep me");
    expect(fs.existsSync(join(root, "evidence", "new.json"))).toBe(false);
  });
  test("validates all entries and paths before writing even when filter selects a valid entry", () => {
    const { base, root, file } = sandbox();
    fs.writeFileSync(file, JSON.stringify(catalog([entry(), entry({ id: "bad", artifacts: { missing: "no-file" } })])));
    const result = exportCatalog(root, "catalog.json", "summary.json", { cwd: base, id: "synthetic-alpha" });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("artifact-missing");
    expect(fs.existsSync(join(base, "summary.json"))).toBe(false);
  });
  test("missing parent and EACCES yield diagnostics without directory creation", () => {
    const { base, root } = sandbox();
    expect(exportCatalog(root, "catalog.json", "missing/summary.json", { cwd: base }).valid).toBe(false);
    expect(fs.existsSync(join(base, "missing"))).toBe(false);
    // Inject an OS denial because chmod cannot reliably simulate EACCES on Windows/admin.
    const fileSystem = { ...fs, openSync() { throw Object.assign(new Error("denied"), { code: "EACCES" }); } } as typeof fs;
    const result = exportCatalog(root, "catalog.json", "denied.json", { cwd: base, fileSystem });
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "export-write" })]);
    expect(result.diagnostics[0]?.message).toContain("EACCES");
    expect(fs.existsSync(join(base, "denied.json"))).toBe(false);
  });
  test("exclusive create catches a destination appearing at the final write boundary", () => {
    const { base, root } = sandbox();
    const destination = join(base, "race.json");
    const fileSystem = { ...fs, openSync(path: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) {
      fs.writeFileSync(destination, "concurrent writer");
      return fs.openSync(path, flags, mode);
    } } as typeof fs;
    const result = exportCatalog(root, "catalog.json", destination, { fileSystem });
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("export-exists");
    expect(fs.readFileSync(destination, "utf8")).toBe("concurrent writer");
  });
});
