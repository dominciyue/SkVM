# Namespaced Resource Semantic Failure Audit

## Purpose

`namespaced-resource-semantic-failure-audit.ts` diagnoses a failed namespaced quality
development run without turning the scorer into compiler input. It separates three
questions that a single score cannot answer:

1. Did the optimized runner materialize the namespaced resource package?
2. Did the agent execute and produce the public task outputs?
3. Is the observed failure entangled with a benchmark contract that has already
   failed public-contract audit?

The audit is diagnostic evidence only. It cannot promote an IR/package, create a
held-out lock, or support a Token claim.

## Evidence Boundary

The implementation reads only:

- raw run metadata (`workDir`, `skillPath`, system, status);
- scored row status and failed criterion IDs;
- the committed corpus source path and compact benchmark-audit status/issues;
- a registered list of public task output paths.

It does not read evaluator payloads, model response text, secrets, held-out rows, or
write any evidence back into an IR/package. Absolute raw-run paths are normalized to
repository-relative paths in memory and are not serialized.

## Output

The report schema is
`skill-ir-namespaced-resource-semantic-failure-audit/v1`. For each optimized row it
records:

- namespace status (`active`/`missing`);
- whether all registered public outputs were produced;
- scorer success/failure;
- benchmark contract sensitivity;
- whether the skill view is source-rewrite-only or a compiled view.

The attribution summary is deliberately conservative:

- `namespaceMechanism=supported` requires every optimized row to have a valid
  manifest and all declared resource files;
- `modelExecution=supported` requires optimized rows to have public outputs;
- `benchmarkContract=supported` requires a failed benchmark audit with a declared
  non-public exact/literal constraint;
- `remainingWorkflowGap=supported` indicates that outputs exist while at least one
  optimized view remains source-rewrite-only.

## Command

From the repository root:

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' ./src/benchmarks/skill-ir/namespaced-resource-semantic-failure-audit.ts `
  --raw=results/skill-ir/namespaced-resource-quality-development-v1-r2/raw-runs.jsonl `
  --scored=results/skill-ir/namespaced-resource-quality-development-v1-r2/scored.jsonl `
  --out=results/skill-ir/namespaced-resource-quality-development-v1-r2/semantic-failure-audit.json
```

The current pilot-specific output path list is intentionally explicit in the CLI:
it covers the two Law tasks and the two Experimental Design tasks. A new skill must
register its public output contract before it can use this audit.

## Verification

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' test ./src/benchmarks/skill-ir/namespaced-resource-semantic-failure-audit.test.ts
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' x tsc --noEmit
```

The audit does not authorize another paid run. The next paid identity must replace
the source-rewrite-only optimized view with a deterministic artifact compiler and
must use a public-contract benchmark lock.
