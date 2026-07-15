# Env Manager Pre-IR Calibration V1

Date: 2026-07-15

## Scope

This is the first paid real-skill engineering calibration. It uses the locked
`env-manager` development matrix: `xty/gpt-4.1-mini`, `bare-agent`, Windows,
`clean`, two development tasks, `no-skill | original`, and two repetitions.
The eight rows exclude held-out tasks, base IR, Final IR, and PGO and do not
enter the pooled main claim.

## Route Probe

The preregistered route completed one real `original` calibration-corpus case
with status `ok`, 4.338 seconds latency, 406 input tokens, and 150 output
tokens. No authentication, provider, timeout, adapter, or parse failure was
observed.

## Results

All eight rows had `runStatus=ok`, exit code zero, and one execution attempt.
The deterministic scorer processed all rows without infrastructure exclusions.

| System | Success | Mean evaluator score | Hard-gate failures | Mean token cost | Mean latency |
|---|---:|---:|---:|---:|---:|
| `no-skill` | 0/4 | 0.5500 | 2/4 | 6,279.25 | 40,415.25 ms |
| `original` | 0/4 | 0.5125 | 2/4 | 11,423.75 | 60,104.50 ms |

The original baseline used 81.93% more tokens and had 48.72% higher mean
latency in this small calibration. These are diagnostics at `n=4` per system,
not efficiency claims.

### Node Development Task

`no-skill` scored `0.70` in both repetitions. `original` scored `0.70` and
`0.55`. Every row preserved protected files, avoided fake-secret leakage, and
created the required files. Recurring failures were exact classification and
schema rules. One original repetition consumed 36,150 tokens, lasted 200.172
seconds, and produced an abnormally expanded `.env.example`.

### Vite Development Task

Every row scored `0.40` and failed the required-artifacts hard gate. Both
`no-skill` repetitions created `env.schema.json` instead of the required
`.env.schema.json`. Both original repetitions created none of the three output
artifacts and requested an absent `fixtures/vite` directory even though `.env`,
`.gitignore`, `src/client.ts`, and `src/server.ts` were present in the workdir.

## Interpretation

The runner, fixtures, exact-source verification, persistent workdir, and
deterministic scorer are operational. The result has criterion-level
discrimination, but the original public skill is not a stronger baseline for
this model/configuration. It slightly underperforms no-skill and is more
expensive in this batch.

This is not a reason to change scorer expectations. The failure audit found no
secret/protected-file regression and no infrastructure error. The problems are
semantic agent behavior: wrong artifact naming, incorrect classification and
schema decisions, failure to inspect the available Vite workspace, and one
extreme generation/tool-use outlier.

The result strengthens two project decisions:

1. `no-skill` remains a first-class baseline because a real skill can be
   neutral or harmful for a model/task combination.
2. Base IR construction treats the original as a repair target, not a presumed
   upper bound.

The next stage may construct an audited static base IR from upstream semantics
and the general task contract. It must not encode development answers or use
held-out expectations. Static lowering should make project-root discovery,
exact output names, safe redaction, classification categories, schema value
types, and framework exposure reporting explicit. PGO remains out of scope
until `ir-static` is evaluated separately.

## Persisted Evidence

```text
results/skill-ir/env-manager-route-probe-2026-07-15/probe-results.jsonl
results/skill-ir/env-manager-calibration-v1-2026-07-15/raw-runs.jsonl
results/skill-ir/env-manager-calibration-v1-2026-07-15/scored-results.jsonl
results/skill-ir/env-manager-calibration-v1-2026-07-15/main-table.csv
```

SHA-256:

```text
probe-results.jsonl  dd658db31e44ce054e58593e5e3f235cfc14dea26514053234c23f656fd2024f
raw-runs.jsonl       d275af87ffc67b3e5d4700291efedad54c1c1d42bc8a98c2efaf7c0e4d22edd2
scored-results.jsonl 073362d6ed3919bc4464c96f1efa55740081b57139202ef47ffeb8a6eb11d739
main-table.csv       c351af7bfb95301bc5f14ea8453e8d4619b70e0863574feeed083a54ea85e3dd
```

Raw artifact workdirs remain local for audit and rescoring. The compact route,
scored, and aggregate files are the repository evidence surface.

## Verification

```text
Skill IR Bun tests: 226 passed, 0 failed
Python analyzer tests: 17 passed, 0 failed
TypeScript typecheck: passed
```

The repository-wide Bun suite also ran: 1,172 passed, 2 skipped, and 82 failed.
The failures reproduce outside this change and are concentrated in upstream
Windows tests that invoke unavailable Unix `sh`, `sleep`, or `python3`
executables. They are not counted as passing verification for this stage.
