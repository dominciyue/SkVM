# Reusable authorization scenario workspace

Maintain one common authoring/v2 declaration and explicit whole-field changes for
each scenario. This synthetic records project includes `owner`, `outsider` and
`role-override`. Their authored expectations are respectively allow, deny and
allow. The tool never derives an expectation from a filename, role or source.
It assembles ordinary v2 inputs; it does not analyze or execute the target.

## Run the standalone tool

Use the existing SkVM checkout dependencies and Bun. From the checkout root:

```powershell
bun ./src/cli/authorization-compose.ts --workspace=./examples/authorization-assessment/scenario-workspace/workspace.json --out=./examples/authorization-assessment/scenario-workspace/generated --check-only
bun ./src/cli/authorization-compose.ts --workspace=./examples/authorization-assessment/scenario-workspace/workspace.json --out=./examples/authorization-assessment/scenario-workspace/generated
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/scenario-workspace/generated/owner.json
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/scenario-workspace/generated/outsider.json
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/scenario-workspace/generated/role-override.json
```

The preview returns inputs, changed top-level fields, per-field author origins,
source-root relocation, and diagnostics. It performs no writes and needs no
provider. Successful publication creates six files: one `<id>.json` and one
`<id>.provenance.json` per variant. Sidecars are provenance, not task inputs or
model answers. Keep the source project available; it is neither copied nor
modified by generation. This example does not claim a published npm command.

An actual model assessment is a separate, explicitly requested operation:

```powershell
bun ./src/index.ts authorization run --input=./examples/authorization-assessment/scenario-workspace/generated/owner.json --model=<provider/model> --out=./assessment-sessions --method=plain --wire=v4
```

The AF verification does not run this model command. Wire/method selection is
independent of workspace assembly.

## File coordinates and replacement rules

`workspace.json` contains only `schemaVersion`, `base` and `variants`. Base and
replacement filenames resolve relative to this workspace file. The example has
five maintained JSON files: one config, one base and three replacement lists.
Repository/ref, source files, policy and entry locations live in the shared base.
Each variation explicitly supplies task ID, question, principal facts, resource
facts and complete scenario relationships/expectation. Other fields remain the
base's declarations, not inferred facts.

Replacement records are exactly `{ "field": ..., "value": ..., "origin": ... }`.
Allowed fields are `taskId`, `request`, `repository`, `sourceRef`, `sourceRoot`,
`sources`, `policies`, `principals`, `resources`, `entries`, `scenarios`,
`additionalQuestions` and `additionalConstraints`. The existing composer replaces
the entire field. There is no nested merge, JSON patch, implicit scenario
expansion, policy inference or automatic repair. Each field may occur once and
must have a nonempty author-provided origin. An empty list explicitly uses the
base unchanged, apart from mechanical source-root relocation.

Without a replacement, `sourceRoot` is relative to the **base file**. A replacement
`sourceRoot` is relative to the **workspace file**, including when the replacement
list lives in another directory. Generated `sourceRoot` is rewritten relative to
the generated input file; the example becomes `../project`. These coordinates do
not depend on the invocation working directory. Use forward slashes in
`sourceRoot`; absolute roots and cross-volume relocation are rejected. File
arguments themselves may use native Windows paths. Policy `location` text is
preserved verbatim, so this example retains the authored `base.json#/policies/archive`
reference rather than rewriting policy provenance to a generated filename.

Variant IDs use 1-80 ASCII letters, digits, `_` and `-`, starting with a letter or
digit. IDs are unique ignoring case. Windows device names such as `CON`, `COM1`
and `LPT9` are forbidden. There must be 1-50 explicitly listed variants.

## Publication and errors

The output parent must already exist and the output path must not exist, even as
an empty directory or a dangling link. All variants are checked first. Publication
writes a unique temporary sibling, checks those bytes using their final file
coordinates, then renames the entire directory. A concurrent creator of the output
directory wins without having its directory removed or overwritten. On failure,
only the exact staging directory created by that invocation is eligible for
cleanup, after its identity is checked. An abrupt process termination can leave
that staging directory behind; it is never automatically treated as an output.

**Publication currently requires Windows.** Windows refuses directory rename onto
an existing directory, including an empty one. Other platforms return an explicit
unsupported diagnostic instead of using POSIX rename, which may overwrite an
empty destination created in a race. Read-only planning remains available.

Exit codes: `0` valid preview or successful publication; `1` input, semantic,
source, output-state or publication failure; `2` malformed/unknown CLI arguments.
Diagnostics include `variantId`, `field`, `file` and a concrete message when
applicable. Missing references, unaccepted policy, missing source, out-of-range
entry lines and paths/symlinks outside the declared source bounds fail checks.
Neither structural validation nor `check` proves policy correctness or source
enforcement. Source changes after publication require another ordinary check.

## Edit the shared policy and keep old output

After the first generation, edit just `policies.archive.text` in `base.json`, for
example to: `Only an authenticated owner or supervisor may archive a record; an
unauthenticated caller must be denied.` Then publish to a new directory:

```powershell
bun ./src/cli/authorization-compose.ts --workspace=./examples/authorization-assessment/scenario-workspace/workspace.json --out=./examples/authorization-assessment/scenario-workspace/generated-policy-update
```

Every new variant contains the common policy edit; `generated` remains unchanged.
If a variant explicitly replaces `policies`, its complete replacement wins.
Authors must update acceptance, revision, scenario facts and expectations whenever
the intended policy change requires it. Generating new inputs does not reuse old
model answers or establish that any expectation is correct.

## Use an ordinary directory

Copy the entire folder to any ordinary directory on the same volume as the desired
output. The tool does not rely on this checkout's location, experiment artifacts,
research oracles or a fixed drive letter. For example:

```powershell
$checkout = (Get-Location).Path
$sample = Join-Path ([System.IO.Path]::GetTempPath()) ("authorization-workspace-" + [guid]::NewGuid())
Copy-Item -LiteralPath ./examples/authorization-assessment/scenario-workspace -Destination $sample -Recurse
bun (Join-Path $checkout "src/cli/authorization-compose.ts") "--workspace=$sample/workspace.json" "--out=$sample/ordinary-generated" --check-only
bun (Join-Path $checkout "src/cli/authorization-compose.ts") "--workspace=$sample/workspace.json" "--out=$sample/ordinary-generated"
foreach ($scenario in @("owner", "outsider", "role-override")) {
  bun (Join-Path $checkout "src/index.ts") authorization check "--input=$sample/ordinary-generated/$scenario.json"
}
```

## Public API and verification

`planAuthorizationWorkspace(workspaceFile, outDir)` returns a read-only plan with
`status`, `variants`, and `diagnostics`. Each variant has the ordinary v2 `input`,
its output path and a separate `provenance` record. The record includes original
file hashes, composer origins, authored replacement fields and source coordinates;
the `changedFields` list means explicitly replaced fields, including replacements
equal to the base value. No timestamps or random IDs enter the plan.

`materializeAuthorizationWorkspace(workspaceFile, outDir)` returns the same data
with `created` or `invalid` status. It replans from source files, so an earlier
preview is not a writable authorization token. `runAuthorizationComposeCli(args)`
returns the exit code; an optional `{stdout, stderr}` argument supports embedding
and tests. The CLI module imports no provider initializer. Main CLI routing is an
integration responsibility.

```powershell
bun test ./src/benchmarks/authorization-dsl/authoring-workspace ./src/cli/authorization-compose.test.ts
```

Tests cover malformed configs/replacements, coordinate stability, semantic and
source errors, CRLF input, Windows names, successful and competing publication,
exact cleanup, independent expected v2 lowering, ordinary-directory checks and a
common policy update. Expected declarations are authored independently in
`example.test.ts`; no real research answers are used. These are engineering
checks, not new research samples. Fewer repeated common fields does not establish
human minutes saved, fewer model tokens, answer reuse or authorization accuracy.
