# Env Manager Executable Artifact V1 Development Run

Date: 2026-07-16

## Scope

This is the frozen development-only attribution experiment for the first
provenance-bound `executable-artifact/v1` package. It uses the preregistered
`xty/gpt-4.1-mini` route, `bare-agent`, Windows, `clean`, two development tasks,
two repetitions, and the same package in both arms:

```text
check-only | one-repair
```

No held-out task was executed. The package, lock, tasks, scorer, model, adapter,
and matrix were not changed after observing results.

## Route Probe

The exact model route completed one real `original` development case with
`status=ok`, exit code zero, no timeout, and 3,490 ms duration. The probe checks
route and adapter health only; its task answer is not semantic evidence.

## Execution Integrity

Both arms completed four raw rows and four scored rows. All eight agent runs
had `runStatus=ok`; there were no authentication, provider, timeout, protected
workdir, checker-process, or scorer infrastructure failures.

The check-only arm passed runtime validation initially in 3/4 rows. Its failed
row remained a semantic validation failure because repair was disabled. The
one-repair arm passed initial runtime validation in 4/4 rows, so the state
machine correctly made zero repair calls. The one-call ceiling was preserved,
but this sample provides no observed repair transition.

## Deterministic Results

| Arm | Success | Mean score | Hard-gate failed rows | Validator final pass | Repair attempts | Mean tokens | Mean latency |
|---|---:|---:|---:|---:|---:|---:|---:|
| `check-only` | 0/4 | 0.5500 | 1/4 | 3/4 | 0 | 7,164.75 | 37,843.75 ms |
| `one-repair` | 0/4 | 0.7000 | 0/4 | 4/4 | 0 | 7,605.25 | 26,539.75 ms |

The one-repair arm used 30,421 aggregate tokens: 26,187 input and 4,234 output.
Because repair never ran, all of that cost belongs to initial generation. The
check-only arm used 28,659 tokens: 25,734 input and 2,925 output.

Every row in both arms failed exact environment-variable classification and
required schema rules. Three check-only rows also failed example safety, and
one failed the required-artifacts hard gate. All one-repair rows passed the
three hard gates but remained below the weighted success threshold.

## Frozen Gate

The preregistered gate requires at least 3/4 successes, mean score at least
0.85, no hard-gate regression, and no infrastructure failure. The one-repair
arm reached 0/4 successes and mean 0.70, so the gate failed. Held-out remains
blocked.

## Interpretation

The executable package and Runner lifecycle are operational, and the package
can enforce artifact existence, parseability, template completion, basic field
types, protected inputs, and generic synthetic-secret safety. This is useful
engineering evidence, not evidence that the skill has been optimized.

The main residual is now sharper: runtime validation accepted all four
one-repair outputs while the offline scorer rejected their classification and
schema semantics. The current validator has no gold-isolated executable rule
that can infer source-qualified variable classifications or validate the
required schema constraints from workspace evidence. Since validation passed,
the repair state was never reached.

The one-repair arm's score was 0.15 higher than check-only, but the arms are
independent stochastic generations and no repair call occurred. That difference
must not be attributed to repair. Historically, the result matches the frozen
`ir-static` mean of 0.70 at 0/4 success; cross-batch comparisons are diagnostic
only.

## Persisted Evidence

Committed evidence consists of the probe result, scored rows, aggregate CSVs,
and JSON summaries. Raw rows, plans, generated workdirs, and model transcripts
remain local for audit and rescoring because they contain bulky machine-local
paths and generated artifacts.

```text
results/skill-ir/env-manager-executable-artifact-v1-route-probe-2026-07-16/probe-results.jsonl
results/skill-ir/env-manager-executable-artifact-v1-check-only-2026-07-16/scored-results.jsonl
results/skill-ir/env-manager-executable-artifact-v1-check-only-2026-07-16/main-table.csv
results/skill-ir/env-manager-executable-artifact-v1-check-only-2026-07-16/analysis-summary.json
results/skill-ir/env-manager-executable-artifact-v1-one-repair-2026-07-16/scored-results.jsonl
results/skill-ir/env-manager-executable-artifact-v1-one-repair-2026-07-16/main-table.csv
results/skill-ir/env-manager-executable-artifact-v1-one-repair-2026-07-16/analysis-summary.json
results/skill-ir/env-manager-executable-artifact-v1-one-repair-2026-07-16/comparison-summary.json
```

SHA-256:

```text
probe-results.jsonl             a8689649129a113d36d1992f0d8ff75ae4180562a550d7bfaa90a7ec708c6dd2
check/scored-results.jsonl      2b813ef7eb1412a4fe50a2910270c29067147fcc0d40434e87b86c7f68646c33
check/main-table.csv            79a52b0c7aef2c4b98bfbf6d6cadfc09fac872b1e621055e6f34266d61e33855
check/analysis-summary.json     25f8ed96cc6fd09ca18a6b0179ed02564608e5cfb2e1cde729a49d6b5e52c8ab
repair/scored-results.jsonl     23b415e7c0a58ad394976d0badfcc68c9212f812119b66b9c953e6eb07979c1c
repair/main-table.csv           b1d96cc1e0958162d5d68e1abdf1098b130d7f64608b60a0ab01c08aa824e396
repair/analysis-summary.json    d1a7c61e71beb48ebd218e59d2bbb948bb8ecdf77447c43bd230d307d22401d4
repair/comparison-summary.json  481241f26064808deb81d8470868cf76e5f1b7574833d324ad6a03107a7fa37a
```

## Verification

```text
Artifact summary-to-scored consistency audit: passed
Package --verify-only: verified=true, catalog=executable-artifact/v1
Bun Skill IR/benchmark/evaluator tests: 280 passed, 0 failed
Python result analyzer tests: 9 passed, 0 failed
Python slice analyzer tests: 8 passed, 0 failed
TypeScript typecheck: passed
git diff --check: no whitespace errors; Windows line-ending warnings only
Compact evidence secret-pattern scan: 0 hits
```

## Next Work

Do not add more repetitions to force a repair event and do not tune the frozen
scorer or package against these outputs. The next design stage should derive a
gold-isolated, provenance-bound semantic validator from workspace evidence and
the public skill/task contract, then issue a new package catalog and a new
preregistered development lock. Classification and schema checks must be
executable without serializing scorer expected sets. The present v1 package and
lock remain immutable failed development evidence.
