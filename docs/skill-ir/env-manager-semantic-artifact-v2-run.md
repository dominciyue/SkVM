# Env Manager Semantic Artifact V2 Development Run

## Status

The `executable-semantic-artifact/v2` local mechanism baseline is complete.
This document preregisters the first paid development attribution run. It does
not authorize held-out execution or describe the package as optimized.

## Frozen Inputs

The authority is
`benchmarks/skill-ir/pilots/env-manager/env-manager-executable-semantic-artifact-v2-lock.json`.
It binds the committed package and provenance digests, `semantic-error-codes/v1`,
`xty/gpt-4.1-mini`, `bare-agent@workspace-semantic-artifact-v2`, Windows,
`clean`, two development tasks, two repetitions, and both repair modes.

The scorer gate applies to the four final one-repair workdirs:

```text
successes >= 3/4
mean deterministic score >= 0.85
hard-gate regressions = 0
infrastructure failures = 0
```

Repair attribution is separate. Arm differences may be attributed to repair
only if at least one real repair attempt occurs. Runtime validation is not the
scorer, and satisfying the attribution gate cannot override a failed scorer
gate.

## Execution Order

1. Commit and push the reviewed lock.
2. Generate and inspect check-only and one-repair dry-run plans.
3. Probe the exact model route.
4. Execute each frozen development arm once.
5. Score with the unchanged deterministic scorer and report runtime and scorer
   outcomes separately.
6. Keep held-out blocked if the scorer gate fails.

The first route-probe attempt exposed a Windows process-tree timeout defect:
the parent was terminated while descendant `bun` processes retained the output
pipes. This is experiment infrastructure, not a model outcome. The route probe
must be rerun only after the process-tree regression test and fix are committed.

The paid run must not change the task set, package, code catalog, scorer, gate,
model, adapter, or repetitions. A scorer defect discovered later requires a
new lock and experiment identity rather than editing this run in place.

## Dry-Run Commands

Use `--limit=2`; the runner then expands the two selected tasks across two
repetitions to four rows per arm.

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--allow-artifact-development-replay' '--artifact-package-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2' '--artifact-lock=benchmarks/skill-ir/pilots/env-manager/env-manager-executable-semantic-artifact-v2-lock.json' '--artifact-repair-mode=check-only' '--skills=env-manager' '--systems=ir-artifact-dev' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--model-family=gpt' '--adapter=bare-agent' '--adapter-version=workspace-semantic-artifact-v2' '--panel-config-id=env-manager-semantic-artifact-v2-check-only' '--limit=2' '--out-dir=results/skill-ir/env-manager-semantic-artifact-v2-check-only-dry-run'

bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--allow-artifact-development-replay' '--artifact-package-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2' '--artifact-lock=benchmarks/skill-ir/pilots/env-manager/env-manager-executable-semantic-artifact-v2-lock.json' '--artifact-repair-mode=one-repair' '--skills=env-manager' '--systems=ir-artifact-dev' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--model-family=gpt' '--adapter=bare-agent' '--adapter-version=workspace-semantic-artifact-v2' '--panel-config-id=env-manager-semantic-artifact-v2-one-repair' '--limit=2' '--out-dir=results/skill-ir/env-manager-semantic-artifact-v2-one-repair-dry-run'
```

Paid commands add `--execute`, `--retries=1`,
`--retry-delay-ms=1000`, and `--require-env=SKVM_XTY_API_KEY`, and use new
dated output directories. The API key remains environment-only and must not
appear in the lock, plans, results, or committed documentation.

## Result Interpretation

Report initial A-layer validation failures, repair attempts, second-validation
outcomes, provider/infrastructure failures, final deterministic scores,
hard-gate results, token usage, latency, and repair-only cost separately. If
no real repair is attempted, the two-arm difference is generation noise and
not repair evidence. No held-out run is made automatically after this stage.

## Known Package Cost

The package includes an approximately 8.5 MiB self-contained evidence program
to preserve offline temporary-directory reproducibility. Replacing it with a
version-bound lightweight ABI is future work and requires a new package digest,
catalog/lock identity, and regression run; the frozen v2 package is not edited
in place.

## Frozen Development Result

The second route probe returned `ok` for the exact frozen route in 18,729 ms.
The first probe produced an empty result because of the now-fixed Windows
process-tree timeout defect and is not counted as a model outcome.

| Arm | Success | Mean score | Hard-gate failed rows | Initial runtime pass | Repairs | Repaired to pass | Infrastructure |
|---|---:|---:|---:|---:|---:|---:|---:|
| check-only | 0/4 | 0.4375 | 3 | 0/4 | 0 | 0 | 0 |
| one-repair | 0/4 | 0.6250 | 0 | 2/4 | 2 | 0 | 0 |

The scorer gate failed because one-repair did not meet either 3/4 successes or
mean 0.85. Held-out was not executed. Both real repairs occurred on the Node
task and both failed revalidation: one introduced a structural type mismatch,
and one still missed a required source-qualified finding. The two Vite rows
passed runtime validation without repair but still failed classification,
schema, and example-safety scoring.

Repair activation passed its minimum-one-attempt condition, proving that the
real-model state transition is no longer dormant. It does not establish causal
score gain: neither repair reached runtime pass, the arms used independent
initial generations, and no pre-repair scorer snapshot exists. The arm-level
mean difference must therefore remain descriptive.

Persisted evidence:

```text
results/skill-ir/env-manager-semantic-artifact-v2-route-probe-2026-07-16-r2/probe-results.jsonl
results/skill-ir/env-manager-semantic-artifact-v2-check-only-run-2026-07-16/{scored-results.jsonl,main-table.csv,analysis-summary.json}
results/skill-ir/env-manager-semantic-artifact-v2-one-repair-run-2026-07-16/{scored-results.jsonl,main-table.csv,analysis-summary.json,comparison-summary.json}
```

Raw rows, plans, and materialized workdirs remain local reproducibility
artifacts. They are not committed because they contain verbose model output and
duplicated fixtures; the scored rows and summaries are the repository evidence.

Committed evidence SHA-256:

```text
route probe             e029e5cea21c28e285ea152a45285451824e76990901f372b50843ac0138cc6b
check scored            be2b45e60dc02791952f2f3617b5b907838274bdf0dcbf1f0c1e7cbad0f43512
check table             232340c51d0b8760062f9ce67a0a5b32a3238d1978d9a97f745255dd3b68998a
check summary           c5378eb5599edcf4f7a253d2552da1a7f4d3b03ee0ffe2f9eae975bb3d3a0721
one-repair scored       30829fe2e750866a9ff151fd39495f703794ba5062816cb99fd2ae5a693af9e8
one-repair table        b8b625acc0a91d0949883adbdb7fc27ed3ad9817857a6d4038691d812cacc441
one-repair summary      08088e97df1d4f0f62fc90b029204e6c3a117bcdfd5c6177715c6cdce4c3163f
comparison summary      a36c0fe4677910312aff0046642dc4d45f945ba95ac861f158046099bc192daf
```
