import { resolve } from "node:path";
import { checkCatalog, exportCatalog, readCatalog } from "./io";
import { renderExperimentEntry, selectEntries } from "./render";

const HELP = `Usage:
  bun ./scripts/experiment-catalog/cli.ts check [--root=.] [--catalog=results/skill-ir/experiment-catalog.json] [--format=text|json]
  bun ./scripts/experiment-catalog/cli.ts show [--root=.] [--catalog=PATH] [--id=ID] [--stage=STAGE] [--format=text|json]
  bun ./scripts/experiment-catalog/cli.ts export --out=PATH [--root=.] [--catalog=PATH] [--id=ID] [--stage=STAGE]

Catalog and artifact paths are relative to root. Output is relative to the caller's working directory.
check/show/help are read-only. export writes a new summary file only; no overwrite or directory creation.
Exit codes: 0 success; 1 invalid data/path or output failure; 2 invalid arguments.
`;

export interface CliResult { exitCode: number; stdout: string; stderr: string }
export function runCli(args: string[], cwd = process.cwd()): CliResult {
  if ((args.length === 1 && ["--help", "-h", "help"].includes(args[0]!)) || (args.length === 2 && ["check", "show", "export"].includes(args[0]!) && ["--help", "-h"].includes(args[1]!))) return { exitCode: 0, stdout: HELP, stderr: "" };
  const bad = (message: string): CliResult => ({ exitCode: 2, stdout: "", stderr: `${message}\n${HELP}` });
  const command = args[0];
  if (!command || !["check", "show", "export"].includes(command)) return bad("Expected check, show or export.");
  const allowed = command === "check" ? ["root", "catalog", "format"] : command === "show" ? ["root", "catalog", "format", "id", "stage"] : ["root", "catalog", "out", "id", "stage"];
  const options = new Map<string, string>();
  for (let index = 1; index < args.length; index++) {
    const token = args[index]!;
    if (!token.startsWith("--")) return bad(`Unexpected argument: ${token}`);
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    if (!allowed.includes(name) || options.has(name)) return bad(`Unknown or repeated option: --${name}`);
    const value = equals === -1 ? args[++index] : token.slice(equals + 1);
    if (!value?.trim() || value.startsWith("--") || value.includes("\0")) return bad(`Expected a value for --${name}.`);
    options.set(name, value);
  }
  const format = options.get("format") ?? "text";
  if (!["text", "json"].includes(format)) return bad("Format must be text or json.");
  if (command === "export" && !options.has("out")) return bad("Export requires an explicit --out path.");
  const root = resolve(cwd, options.get("root") ?? ".");
  const catalogPath = options.get("catalog") ?? "results/skill-ir/experiment-catalog.json";
  const filter = { ...(options.has("id") ? { id: options.get("id")! } : {}), ...(options.has("stage") ? { stage: options.get("stage")! } : {}) };
  if (command === "export") {
    const exported = exportCatalog(root, catalogPath, options.get("out")!, { ...filter, cwd });
    return { exitCode: exported.valid ? 0 : 1, stdout: exported.valid ? `Exported navigation summary: ${exported.output!.resolved}\nOriginal artifacts remain authoritative.\n` : "", stderr: exported.diagnostics.map((item) => `${item.code} ${item.path}: ${item.message}\n`).join("") };
  }
  const result = command === "show" ? readCatalog(root, catalogPath) : checkCatalog(root, catalogPath);
  const entries = selectEntries(result.entries, filter);
  const diagnostics = [...result.diagnostics];
  if (result.valid && (filter.id !== undefined || filter.stage !== undefined) && entries.length === 0) diagnostics.push({ code: "no-match", path: "entries", message: "No entry matches the requested id/stage." });
  const valid = diagnostics.length === 0;
  const { entries: _entries, ...catalogMetadata } = result.catalog ?? {};
  const payload = { schemaVersion: "skill-ir-experiment-catalog-query/v1", command, valid, source: result.source, catalogMetadata, entries, diagnostics };
  if (format === "json") return { exitCode: valid ? 0 : 1, stdout: JSON.stringify(payload, null, 2) + "\n", stderr: "" };
  const source = result.source ? `Catalog: ${result.source.catalog}\nRead: ${result.source.readAt}; SHA-256: ${result.source.sha256}\n` : "";
  const body = command === "check" ? `Check: ${valid ? "valid" : "invalid"}; ${result.entries.length} entries; ${diagnostics.length} diagnostics.\n` : entries.length ? entries.map(renderExperimentEntry).join("\n\n") + "\n" : "No entries.\n";
  return { exitCode: valid ? 0 : 1, stdout: source + body, stderr: diagnostics.map((item) => `${item.code} ${item.path}: ${item.message}\n`).join("") };
}
if (import.meta.main) {
  const result = runCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
