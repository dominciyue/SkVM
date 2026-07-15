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
