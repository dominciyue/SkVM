# Authoring v2 editor support

This synthetic example assesses whether authenticated member `alice` may archive
record `r-1`, owned by `bob`. The author explicitly supplies the policy: only an
authenticated owner or supervisor may archive. The original expectation is
`deny`; the two named conditions request explanations of alternative owner and
supervisor branches. `project/src/records.ts` contains the complete supplied source.

The JSON Schema provides field descriptions, enum suggestions and structural
errors. The existing runtime parser, lowering and `authorization check` remain
authoritative. Neither schema validation nor `check` proves that the policy is
correct or that the code enforces it. Source reasoning remains separate.

## Prerequisites and commands

Use a checkout of SkVM with its existing dependencies installed and Bun available.
This asset was verified with Bun 1.3.14, Zod 3.25.76 and Ajv 8.20.0. No additional
package or provider configuration is needed for these checks. Run from the SkVM
checkout root:

```powershell
bun test ./src/benchmarks/authorization-dsl/editor-support
bun ./src/benchmarks/authorization-dsl/editor-support/verify.ts
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/editor-support/authoring.json
bun ./src/index.ts authorization locate --root=./examples/authorization-assessment/editor-support/project --file=src/records.ts --match="export function archiveRecord"
```

`verify.ts` validates the local draft-07 asset, compares a finite set of structural
cases with the real v2 parser, compares nested public fields and bounds, and reports
expected runtime-only failures. Exit 0 means this asset contract passed; exit 1
means a mismatch or verification error. It does not edit inputs, fetch schemas,
invoke a provider or execute the source. Filesystem checks are exercised by the
tests and the ordinary `authorization check` command, not by the finite verifier.

`check` should return `status: "valid"` and no diagnostics for this example.
`locate` should return the unique function declaration on supplied-file line 6.
Line ranges are inclusive and refer to the actual provided file, not to upstream
line numbers before an excerpt was copied. `locate` finds literal text and shows
multiple matches when present; the author chooses the intended entry.

## Associate the schema in an editor

Do **not** add `$schema` to `authoring.json`: the strict runtime rejects that
unknown field. Use an external association. The schema has no published online
address. VS Code supports local `json.schemas` associations and draft-07; its
[JSON documentation](https://code.visualstudio.com/docs/languages/json#_mapping-to-a-schema-in-the-workspace)
explains that relative schema URLs are resolved from the workspace folder.

### Use the current checkout

Open **this `editor-support` folder itself** as the VS Code workspace. Its private
`.vscode/settings.json` associates only `/authoring.json` with
`../../../schemas/authorization/authoring-v2.schema.json`. The path is relative to
this folder, not to `.vscode`. The test checks both the exact file match and that
the path resolves to the shipped schema.

If you instead open the whole SkVM checkout, this nested settings file is not
the workspace settings. Add the following association to your chosen workspace
settings (merge with existing `json.schemas`; do not replace other settings):

```json
{
  "json.schemas": [
    {
      "fileMatch": ["/examples/authorization-assessment/editor-support/authoring.json"],
      "url": "./schemas/authorization/authoring-v2.schema.json"
    }
  ]
}
```

This example does not change the repository-root editor configuration. Editor
rendering itself was not UI-tested; the asset, association paths and validation
behavior were tested deterministically.

### Use a separate directory

Copy this entire folder and the static schema. Preserve the `project` directory
next to `authoring.json`, so `sourceRoot: "project"` keeps its meaning. For example,
from the SkVM checkout, these PowerShell commands create a new temporary folder:

```powershell
$checkout = (Get-Location).Path
$sample = Join-Path ([System.IO.Path]::GetTempPath()) ("authorization-editor-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $sample | Out-Null
Copy-Item -LiteralPath ./examples/authorization-assessment/editor-support/authoring.json -Destination $sample
Copy-Item -LiteralPath ./examples/authorization-assessment/editor-support/project -Destination $sample -Recurse
New-Item -ItemType Directory -Path (Join-Path $sample "schemas"), (Join-Path $sample ".vscode") | Out-Null
Copy-Item -LiteralPath ./schemas/authorization/authoring-v2.schema.json -Destination (Join-Path $sample "schemas")
$settings = @{ "json.schemas" = @(@{ fileMatch = @("/authoring.json"); url = "./schemas/authoring-v2.schema.json" }) }
[System.IO.File]::WriteAllText((Join-Path $sample ".vscode/settings.json"), ($settings | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
bun (Join-Path $checkout "src/index.ts") authorization check "--input=$sample/authoring.json"
```

Open `$sample` as the editor workspace. The association now resolves entirely
inside that directory. Keep using this checkout's CLI, or a separately available
compatible CLI; this example does not claim that these assets are npm-published.

## Change the scenario in the same declaration

For an **owner** variation, set the resource fact to `owned by alice`, update
`request`, set `scenarios.archive.relation` to `same-owner`, and set its authored
`expectation` to `allow` under the same policy. Update the `is-owner` condition
basis to match. The entry locations and source bytes stay the same.

For a **supervisor** variation, set `principals.member.role` to `supervisor`, update
its facts and capabilities to explicitly declare that role, update `request` and
`relation`, and set `expectation` to `allow`. Keep the dictionary name `member` if
you want to preserve references, or rename it and update `scenario.principal`
together. Update the `is-supervisor` basis too. Re-run `check` after either edit.
The tool does not infer these coordinated changes from a role string or source.

Optional `facts`, `capabilities`, `conditions`, `additionalQuestions` and
`additionalConstraints` may be omitted; omission means not declared. An empty
conditions dictionary is allowed. If condition analysis is requested, `names`
must reference declared conditions; omitting `maxBranches` uses runtime's bound
of 8. Supplied bounds must be integers from 1 to 12.

## Structure and remaining runtime checks

The schema covers all public v2 fields, required fields, types, enum choices,
non-empty trimmed text, strict objects, non-empty required dictionaries/arrays,
positive integer lines and branch bounds. Dictionary names reject surrounding
whitespace, ASCII controls and reserved prototype names; non-ASCII names are
permitted. The runtime additionally owns the following `runtimeOnlyChecks`,
also exported and exercised in the verifier/tests:

| Check | Example and authoritative feedback |
| --- | --- |
| `line-order` | Set `endLine` to 1 with `startLine` 6: parser reports that the end precedes the start. |
| `reference-existence` | Set `scenarios.archive.principal` to `missing`: normalization reports the unknown principal and available names. The same applies to resource/policy/entry/condition references. |
| `repeated-references` | Repeat `archive` in the scenario's entries or a name in `analyzeConditions.names`: normalization rejects the repetition. |
| `policy-readiness` | Set the referenced policy's acceptance to `unresolved` or `conflicted`: its enum is structurally valid, but the scenario cannot run. |
| `unicode-well-formedness` | A lone surrogate such as `\ud800` in a name is rejected before runtime ID encoding. |
| `source-paths-and-files` | `sourceRoot: "../outside"`, absent files, or paths/symlinks escaping the root fail ordinary `check`. |
| `source-locations` | Set `endLine` to 999 or cite a file not supplied: `check` reports the unavailable source range. |

The structure checker never strips or repairs fields. For example, adding
`guessedField` or `$schema` produces an unknown-field diagnostic; using `startLine:
0` or `maxBranches: 13` produces a bound diagnostic. Removing `taskId` produces a
required-field diagnostic. The programmatic `checkEditorStructure(value)` API
returns `{ valid, diagnostics: [{ path, message }] }`, using escaped JSON Pointer
paths (and `$` for the root). `loadAuthoringEditorSchema()` returns a fresh copy of
the local asset. Asset load/compile failures throw rather than report valid input.

Finite differences and field coverage monitor drift; they do not prove complete
semantic equivalence, arbitrary-refinement equivalence, authorization correctness
or human time savings. When the runtime contract changes, update the asset,
finite fixtures and runtime-only list together. Unknown Zod node types fail the
coverage check rather than being silently ignored. No core v2 behavior is changed.
