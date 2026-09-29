# Evidence preparation and local policy edit

This portable synthetic task assesses `archiveRecord` at its declared handler
entry. The entry calls `mayArchive` in a second source file. The task author
initially accepts an owner-only policy. The source permits an authenticated
owner and an authenticated supervisor acting on another owner's record. The
example never executes that target code or asserts deployment behavior.

The recoverable v2 request deliberately places a bad literal between two valid
dependencies. Both valid ranges survive; `explanation-is-not-source` remains a
named gap. A description is never a fuzzy source match. To correct it, supply an
exact literal/range or keep the gap explicit; `request-ready-v2.json` is the
separate authored request with verified positions.

```powershell
bun ./src/index.ts authorization prepare --input="$demo/base.json" --request="$demo/request-recovery-v2.json" --out="$demo/recovered-partial"
bun ./src/index.ts authorization check --input="$demo/recovered-partial/assessment.json" --method=plain --assessment=explicit-v1 --wire=v6
```

Run these after the copy step below. Partial remains runnable and retains its
gap. Unsafe paths or changed source identity still refuse publication. Automatic
proposals select host windows/symbols or exact literals; safe read misses return
individual diagnostics, while old source resent in the second call consumes the
same 64KiB display budget. These positions do not certify semantic correctness.

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

Start a draft from the machine-known context after making the portable copy:

```powershell
bun ./src/index.ts authorization init --context="$demo/context.json" --out="$demo/draft.json"
bun ./src/index.ts authorization check --input="$demo/draft.json"
```

The draft intentionally reports `needs-input`; it has no accepted policy,
principal, resource or scenario. Fill those fields yourself. For this synthetic
walkthrough, the explicit public task facts are already in `base.json`. Copy
only those authored sections into the generated draft:

```powershell
$draft = Get-Content -LiteralPath "$demo/draft.json" -Raw | ConvertFrom-Json
$facts = Get-Content -LiteralPath "$demo/base.json" -Raw | ConvertFrom-Json
foreach ($field in @('policies','principals','resources','scenarios','analysisContract')) {
  $draft.$field = $facts.$field
}
[System.IO.File]::WriteAllText("$demo/filled.json", ($draft | ConvertTo-Json -Depth 30), [System.Text.UTF8Encoding]::new($false))
bun ./src/index.ts authorization check --input="$demo/filled.json" --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization prepare --input="$demo/filled.json" --request="$demo/request-recovery-v2.json" --context=callable-v1 --out="$demo/callable"
bun ./src/index.ts authorization edit --input="$demo/filled.json" --edit="$demo/policy-change.json" --out="$demo/callable-edit"
bun ./src/index.ts authorization prepare --input="$demo/callable-edit/assessment.json" --reuse="$demo/callable/assessment.json" --out="$demo/callable-reused"
bun ./src/index.ts authorization check --input="$demo/callable-reused/assessment.json" --method=plain --assessment=explicit-v1 --wire=v6
```

These steps make zero provider calls. `callable/report.json` separates selected
spans from verified `host-context` additions and still retains the deliberately
bad `explanation-is-not-source` gap. Reuse preserves that gap, successful
dependencies and exact original source ranges. It validates complete bytes of
every bound raw file, including lines absent from the snapshot, by reading the
new input's selected source root. Byte-identical copies can be relocated; a
bound-file byte/ref change requires new preparation. This is a recorded-file
binding, not whole-repository equality. The edit supplies policy reason and targeted
instruction/response detail text; other prose remains unchanged.

For real answers, use the paid `run` command shown above with
`callable/assessment.json`, save its printed session path, compare it with
`callable-reused/assessment.json`, then run the reused input fresh. `compare`
uses `--previous=<session-path>` and makes zero calls. Reuse carries evidence,
while changed policy still needs a new analysis. No logs, hashes, grading
protocol or research driver are required. The example remains synthetic.
