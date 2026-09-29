# Task semantics and changed policy example

This self-contained synthetic project asks two different questions about the same
`archiveRecord` source. `supervisor-foreign` assumes an authenticated supervisor
has reached the handler with another owner's record. The fixed code permits the
archive; the original accepted owner-only policy denies it. The requested
`counterfactual-no-supervisor` branch changes that stated role condition and
should be answered separately. `external-deployment` asks whether an external
client can cause an archive in a real deployment. The supplied function does
not show route reachability or upstream principal binding, so a source-only
assessment must preserve those unknowns. No target code is executed by check or
compose.

The workspace keeps `base.json` and the original `owner-only` variant, then
changes the accepted policy and the supervisor scenario's policy expectation in
`owner-or-supervisor-replacements.json`. The source stays byte identical. This
is an author-controlled policy change, not an answer inferred from the code.

From the SkVM checkout root, create ordinary inputs and inspect the preview:

```powershell
bun ./src/cli/authorization-compose.ts --workspace=./examples/authorization-assessment/task-semantics/workspace.json --out=./examples/authorization-assessment/task-semantics/generated --check-only
bun ./src/cli/authorization-compose.ts --workspace=./examples/authorization-assessment/task-semantics/workspace.json --out=./examples/authorization-assessment/task-semantics/generated
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/task-semantics/generated/owner-only.json --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/task-semantics/generated/owner-or-supervisor.json --method=plain --assessment=explicit-v1 --wire=v6
```

The publication command refuses to overwrite `generated`; choose a fresh output
directory for another composition. `check` reports structural/source diagnostics
and the exact model preview without a provider call. To request a fresh model
assessment and inspect it, supply your configured model:

```powershell
bun ./src/index.ts authorization run --input=./examples/authorization-assessment/task-semantics/generated/owner-only.json --model=<provider/model> --out=./assessment-sessions --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization inspect --out=./assessment-sessions
```

The run prints a session path. After changing the policy, compare that saved
session with the changed input before running it; comparison never accepts an
old model answer as the changed answer:

```powershell
bun ./src/index.ts authorization compare --previous=<printed-session-path> --input=./examples/authorization-assessment/task-semantics/generated/owner-or-supervisor.json
bun ./src/index.ts authorization run --input=./examples/authorization-assessment/task-semantics/generated/owner-or-supervisor.json --model=<provider/model> --out=./changed-assessment-sessions --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization inspect --out=./changed-assessment-sessions
```

`explicit-v1` makes the boundary, premise and requested branch visible as a
bounded analysis program; v6 asks the model for observed source behavior, then
the host derives the policy comparison. Its citations and conclusions still
require human review. Omit the sidecar from a different ordinary v2 input to
retain legacy behavior, or select `--assessment=legacy --wire=v4` explicitly.
No evaluator, oracle, study manifest or stored answer is required for this
example. `sourceRef` names the synthetic snapshot; it is not a remote
verification claim.

`owner-premises.json` uses the same ordinary interface for a nullable owner.
`unspecified` means the task does not supply a value. `absent` means source null;
`other-present` means a different owner exists; `self-present` means the caller
owns the record. No owner field is added to the DSL. Explicit conditions and
requested branches make these different questions visible to the model.

```powershell
bun ./src/index.ts authorization check --input=./examples/authorization-assessment/task-semantics/owner-premises.json --method=plain --assessment=explicit-v1 --wire=v6
bun ./src/index.ts authorization edit --input=./examples/authorization-assessment/task-semantics/owner-premises.json --edit=./examples/authorization-assessment/task-semantics/owner-other-present-edit.json --out=./owner-other-present
bun ./src/index.ts authorization check --input=./owner-other-present/assessment.json --method=plain --assessment=explicit-v1 --wire=v6
```

This edit changes only the current premise; policy, source and counterfactuals
stay the same. The original expectation is a conditional policy, so it remains
conditional in the declaration even when the current premise is known. Use
ordinary `run`, `inspect` and `compare` as shown above with these input paths.
Compare requires a fresh review because premise bytes affect the analysis
program and prompt. Structure checking cannot certify the truth of prose
premises. Copy the whole example directory to preserve relative source paths;
choose an unused output directory for each publication.

For a premise-only change, prepare once with bounded callable context, then
reuse the same material and pending gaps. Run these from a portable copy whose
path is stored in `$demo`:

```powershell
bun ./src/index.ts authorization prepare --input="$demo/owner-premises.json" --request="$demo/entry-seed-owner-v2.json" --context=callable-v1 --out="$demo/owner-material"
bun ./src/index.ts authorization edit --input="$demo/owner-premises.json" --edit="$demo/owner-other-present-edit.json" --out="$demo/owner-edit"
bun ./src/index.ts authorization prepare --input="$demo/owner-edit/assessment.json" --reuse="$demo/owner-material/assessment.json" --out="$demo/owner-reused"
bun ./src/index.ts authorization check --input="$demo/owner-reused/assessment.json" --method=plain --assessment=explicit-v1 --wire=v6
```

All four commands are provider-free. `external-route-binding` remains pending
in both reports; it concerns unavailable upstream middleware, while this task
asks about the stated handler-entry premise. Its presence does not itself
make that requested entry outcome unknowable. Reuse keeps the exact source,
conditional policy and three counterfactuals, and only the explicitly edited
premise changes. For paid assessment, run `owner-material/assessment.json`,
compare its saved session with `owner-reused/assessment.json`, then run the
changed input fresh using the ordinary commands above. Source/ref changes
invalidate this reuse instead of silently clearing old gaps.
