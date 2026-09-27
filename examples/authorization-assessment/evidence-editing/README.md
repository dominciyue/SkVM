# Evidence preparation and local policy edit

This portable synthetic task assesses `archiveRecord` at its declared handler
entry. The entry calls `mayArchive` in a second source file. The task author
initially accepts an owner-only policy. The source permits an authenticated
owner and an authenticated supervisor acting on another owner's record. The
example never executes that target code or asserts deployment behavior.

From the SkVM checkout root, copy the example into a fresh directory so each
publication has an unused output path. The commands below also work if the
example is moved elsewhere and `$demo` points to that copy.

```powershell
$source = (Resolve-Path -LiteralPath './examples/authorization-assessment/evidence-editing').Path
$demo = Join-Path ([System.IO.Path]::GetTempPath()) ('authorization-evidence-editing-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $demo | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $demo -Recurse

bun ./src/index.ts authorization prepare --input="$demo/base.json" --request="$demo/request-partial.json" --out="$demo/partial"
bun ./src/index.ts authorization check --input="$demo/partial/assessment.json" --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization prepare --input="$demo/base.json" --request="$demo/request-ready.json" --out="$demo/ready"
bun ./src/index.ts authorization check --input="$demo/ready/assessment.json" --method=plain --assessment=explicit-v1 --wire=v6
```

`partial/report.json` reports `range-required` for `authorization-guard`:
the request names `src/guard.ts` but supplies no line range. The entry remains
runnable, with a named evidence gap. `ready/report.json` includes the exact
guard range and has status `ready`. That status means this declared request was
prepared; it does not establish whole-program source coverage or a correct
authorization answer. Both checks are provider-free.

Change only the accepted policy and its linked expectations, then prepare the
same source bytes for the changed input. The `owner` expectation is submitted
again because editing a policy requires an explicit review of every linked
scenario, even where its value stays `allow`.

```powershell
bun ./src/index.ts authorization edit --input="$demo/base.json" --edit="$demo/policy-change.json" --out="$demo/edited"
bun ./src/index.ts authorization prepare --input="$demo/edited/assessment.json" --request="$demo/request-ready-edited.json" --out="$demo/edited-ready"
bun ./src/index.ts authorization check --input="$demo/edited-ready/assessment.json" --method=plain --assessment=explicit-v1 --wire=v6
```

`edited/edit-report.json` lists the policy text, location, revision, and
`supervisor-foreign` expectation as changed. It lists both scenario
expectations as supplied. The edited input uses `../project` because `edit`
relocates its source root relative to `edited/`; the changed prepare request
uses that same root. All three prepared inputs remain ordinary inputs.

To obtain model assessments, replace `<provider/model>` with a configured
model. These commands make paid provider calls; `check`, `inspect`, and
`compare` do not. Save the exact `sessionPath` printed by the first run.

```powershell
bun ./src/index.ts authorization run --input="$demo/ready/assessment.json" --model=<provider/model> --out="$demo/original-runs" --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization inspect --out=<printed-original-sessionPath>
bun ./src/index.ts authorization compare --previous=<printed-original-sessionPath> --input="$demo/edited-ready/assessment.json"
bun ./src/index.ts authorization run --input="$demo/edited-ready/assessment.json" --model=<provider/model> --out="$demo/changed-runs" --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization inspect --out=<printed-changed-sessionPath>
```

`compare` reports whether the old answer still applies to the changed input;
it does not re-evaluate source semantics. Here the policy change should prompt
`needs-review`, so use the fresh changed run for a new answer. Under the
declared entry premises, the source permits both scenarios. Against the
original policy that conflicts with `supervisor-foreign`; against the changed
owner-or-supervisor policy it agrees. Review model reasoning and citations
before relying on either conclusion. No oracle or research script is needed
to use this example.
