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

The explicit v2 request keeps `src/record.ts` original lines 1–2 and 5–9 in
one mapped snapshot, omitting lines 3–4. Its report records both original and
snapshot ranges. The source preview marks the omitted interval, and a quote
cannot cross it. This small example demonstrates the mapping contract; the
AK eight-task same-request comparison measures the distant-helper budget effect.

```powershell
bun ./src/index.ts authorization prepare --input="$demo/base.json" --request="$demo/request-ready-v2.json" --out="$demo/segments"
bun ./src/index.ts authorization check --input="$demo/segments/assessment.json" --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization prepare --input="$demo/edited/assessment.json" --request="$demo/request-ready-v2-edited.json" --out="$demo/edited-segments"
```

`entry-seed-v2.json` supplies the handler and file allowlist with no dependency
answers. The provider-free discovery option can locate `mayArchive` by its
visible reference. Add a configured model only when you want advisory location
proposals and bounded supplementary reads:

```powershell
bun ./src/index.ts authorization prepare --input="$demo/base.json" --request="$demo/entry-seed-v2.json" --out="$demo/discovered" --discover=true --check-only=true
bun ./src/index.ts authorization prepare --input="$demo/base.json" --request="$demo/entry-seed-v2.json" --out="$demo/discovered" --discover=true
bun ./src/index.ts authorization prepare --input="$demo/base.json" --request="$demo/entry-seed-v2.json" --out="$demo/advised" --discover=true --proposal-model=<provider/model>
bun ./src/index.ts authorization run --input="$demo/segments/assessment.json" --model=<provider/model> --out="$demo/segment-original-runs" --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization inspect --out=<printed-segment-original-sessionPath>
bun ./src/index.ts authorization compare --previous=<printed-segment-original-sessionPath> --input="$demo/edited-segments/assessment.json"
bun ./src/index.ts authorization run --input="$demo/edited-segments/assessment.json" --model=<provider/model> --out="$demo/segment-changed-runs" --method=plain --assessment=explicit-v1 --wire=v6
```

Check/prepare count one analysis entry and two scenarios/obligations; helper
support adds evidence only. Explicit extra analysis entries still add work.
The index is lexical and reports unresolved, ambiguous or dynamic references;
it does not establish full source coverage. Defaults are 12 candidate files,
1MiB cumulative candidate-index reads, 64KiB cumulative source display and final
source bytes, and dependency depth 3. Input validation and final snapshot reads
happen separately; the index counter is not total filesystem I/O. An advised
job has at most two position calls and one
format revision. Failed/unknown proposals retain their response, usage and
publication status under a separate `advised.attempts-*` directory. Actual cost
is unknown when the provider does not report it. Do not resend a dispatched
request merely because its completion is unknown. Runnable partial material
still carries its gaps into analysis.

For a policy-only edit, unchanged source snapshots may be reused while rebuilding
the task and dependency identity; compare the old session and run the changed
task fresh. Changed source or locator ranges need rechecking and preparation,
with a sourceRef identifying the actual new bytes. The example remains synthetic.
