# Experiment catalog maintenance

This offline tool reads the manually maintained [experiment catalog](../../results/skill-ir/experiment-catalog.json). It helps find recorded experiment entrances and missing paths. It does not evaluate model answers, rank experiments, estimate bills, or change the catalog. Original evidence remains authoritative under the [evidence navigation contract](../../docs/skill-ir/evidence-index.md).

## Commands

Run from the repository root with the already installed Bun runtime:

```powershell
bun ./scripts/experiment-catalog/cli.ts check --root=. --catalog=results/skill-ir/experiment-catalog.json
bun ./scripts/experiment-catalog/cli.ts show --root=. --catalog=results/skill-ir/experiment-catalog.json --id=authorization-external-reuse-v1
bun ./scripts/experiment-catalog/cli.ts show --root=. --catalog=results/skill-ir/experiment-catalog.json --stage=U --format=json
bun ./scripts/experiment-catalog/cli.ts export --root=. --catalog=results/skill-ir/experiment-catalog.json --out=./catalog-summary.json
bun ./scripts/experiment-catalog/cli.ts --help
```

`--root` defaults to the caller's working directory; `--catalog` defaults to `results/skill-ir/experiment-catalog.json`. Catalog and artifact paths must be relative to root. Both slash styles work. The explicit export `--out` is resolved from the caller's working directory, independently of root; an absolute output path is also accepted. Its parent directory must already exist. Arguments accept `--name=value` or `--name value`.

| Command | Behavior |
| --- | --- |
| `check` | Validate v1 core fields, duplicate IDs, known telemetry and all explicitly registered artifact paths. `--format=json` gives source metadata and structured diagnostics. |
| `show` | Read and validate catalog structure, then show its recorded facts. It intentionally does not check artifact existence; navigation remains available when evidence is missing. `--id` and `--stage` use exact matches and intersect when combined. Original order is retained. |
| `export` | Fully check the catalog and all registered paths, then create a new JSON navigation summary. Optional `--id`/`--stage` select entries only after full validation. `--out` is mandatory. |

`show` and `check` default to text; their JSON envelope is `skill-ir-experiment-catalog-query/v1`. `export` writes `skill-ir-experiment-catalog-summary/v1`, including `summaryOnly`, original artifact entrances, the complete selected entries, all top-level catalog metadata, source SHA-256/read time/byte count, and requested/resolved destination. It refuses existing files, catalog/artifact aliases, and locations inside registered artifact directories. There is no `--force` or automatic directory creation. A write failure is reported; if it occurred after exclusive creation, the new partial file is left for inspection rather than silently removed or overwritten on retry.

Exit codes: **0** success (including an empty unfiltered catalog); **1** invalid catalog/path, no matching selection, or export I/O failure; **2** invalid arguments. JSON diagnostics are in stdout; text diagnostics and argument errors are in stderr. Example codes include `schema-version`, `duplicate-id`, `metric-type`, `artifact-missing`, `artifact-escape`, `catalog-too-large`, `catalog-json`, `catalog-changed`, `no-match`, `export-protected`, and `export-exists`. Diagnostics retain entry ID and field location when available. Missing evidence never deletes entries.

## Data preservation and maintenance

Only `skill-ir-experiment-catalog/v1` is accepted. Each entry needs a non-empty string `id`, `stage`, `status`, and an object of artifact path strings; IDs must be unique. Empty `entries` and empty artifact maps are valid. Scope, effect, review fields, limits and future extensions keep their original values. The parser checks `knownTokens` and `actualUsd`/`actualUSD` in the entry, provider, authoring and scope containers. Other extension structures are opaque. Known token dimensions are checked independently; numeric strings, booleans, negative and non-finite numbers are invalid metrics, never coerced to zero.

For example, these values stay different:

```json
{
  "provider": {
    "knownTokens": { "input": 12, "output": 0, "cacheRead": null, "cacheWrite": "unknown" },
    "actualUsd": "unknown"
  },
  "authoring": { "knownTokens": 99, "actualUsd": null },
  "actualUsd": 0
}
```

`0` is a known zero. `null` and `"unknown"` remain separate unknown representations; absent fields stay absent. This also applies to telemetry. No token total, cross-experiment average, model-price bill or human-time savings is inferred. Provider and authoring telemetry are separate in text output. Raw outcomes, schema/transport facts and semantic-review fields are displayed as recorded; `pending` means not evaluated, and an absent review field means not recorded. Complex text values are literal JSON; `--format=json` preserves the full nested structure.

Catalog owners update the source file and evidence links. This tool never performs that update. Generated summaries are disposable navigation snapshots, not new research results or final AB conclusions. The catalog may change after a successful stable read: `source.readAt`, `modifiedAt`, `sha256` and `bytes` identify exactly the observed version. Export does not lock or promise the latest catalog at write completion. Registered path existence is observed separately, not an atomic snapshot of the entire result tree.

## Implementation and boundaries

- `model.ts`: `parseExperimentCatalog(value)` returns validity, unchanged object entries and structured diagnostics. Invalid entries are never silently promoted to valid experiments.
- `io.ts`: `readCatalog(root, catalogPath)` limits the catalog to 4 MiB (plus one read byte to detect growth) and retries once if descriptor/path stats change. Invalid UTF-8 or JSON and persistent changes produce diagnostics. `checkCatalog` adds only explicit artifact existence checks; `exportCatalog` validates before an exclusive `wx` write. Optional filesystem injection supports deterministic I/O-failure tests.
- `render.ts`: `selectEntries` applies stable exact filters; `renderExperimentEntry` renders recorded fields without evaluation.
- `cli.ts`: `runCli(args, cwd)` returns `{ exitCode, stdout, stderr }`. Importing it does not execute a command or create directories.

Path resolution checks each real path prefix under root, rejecting parent traversal, absolute/drive/UNC paths, URL/stream/NUL syntax and escaping symlinks/junctions. Root itself may be an explicitly chosen real directory. Files and directories (including `root` and `changeReports`) are supported. No artifact content is read, no run tree is recursively scanned, and path-like text in limits or other fields is ignored. No network, provider or production CLI modules are imported. These checks handle ordinary local maintenance and concurrent catalog edits; they are not an operating-system sandbox against hostile simultaneous filesystem mutation.

## Verification

```powershell
bun test ./scripts/experiment-catalog/catalog.test.ts
bun ./node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --skipLibCheck --module Preserve --moduleResolution bundler --target ESNext --types bun scripts/experiment-catalog/model.ts scripts/experiment-catalog/io.ts scripts/experiment-catalog/render.ts scripts/experiment-catalog/cli.ts scripts/experiment-catalog/catalog.test.ts
```

Tests create only synthetic fixtures in this tool directory and remove their own temporary sandboxes. They exercise actual filesystem reads/writes and junctions, CLI processes, unchanged input bytes, and output races. Read-change and permission-denial cases inject filesystem operations for deterministic behavior; Windows permissions cannot reliably be simulated with `chmod`. The repository-wide typecheck excludes `scripts`, hence the explicit local command above. No dependencies need installation.
