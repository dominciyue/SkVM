# Env Manager Static V1 Run

## Frozen Configuration

The run consumed `env-manager-static-lock.json` without changing the base IR,
tasks, scorer, route, or matrix after execution began.

| Field | Value |
|---|---|
| Skill | `env-manager` |
| Model | `xty/gpt-4.1-mini` (`gpt`) |
| Adapter | `bare-agent`, `workspace-static-v1` |
| Systems | `no-skill`, `original`, `ir-static` |
| Tasks | two development tasks |
| Repetitions | 2 |
| Context / host label | `clean` / `windows` |
| Rows | 12 |

The route probe returned `status=ok` in 4,632 ms. The experiment completed all
12 rows in 402.5 seconds. Scoring produced 12 deterministic rows with zero
infrastructure failures and zero agent failures.

## Result

| System | Success | Mean score | Hard-gate failure rows | Mean tokens | Mean latency |
|---|---:|---:|---:|---:|---:|
| no-skill | 0/4 | 0.5875 | 1/4 | 6,994.50 | 55,509.25 ms |
| original | 0/4 | 0.4250 | 3/4 | 3,316.00 | 13,122.00 ms |
| ir-static | 0/4 | 0.7000 | 0/4 | 7,821.75 | 31,145.00 ms |

`ir-static` improved mean deterministic score by `+0.2750` versus original and
`+0.1125` versus no-skill. It passed protected-file preservation, secret
redaction, required-artifact generation, and safe `.env.example` checks in all
four rows. It did not improve binary success because classification and schema
rules failed in all four rows.

Token cost increased by 4,505.75 versus original and 827.25 versus no-skill.
This is a diagnostic cost result, not an amortized-efficiency result. Static IR
was faster than no-skill by 24,364.25 ms on average but slower than original by
18,023 ms.

## Failure Audit

Generated artifacts showed stable workflow execution but underspecified output
semantics:

- hardcoded-secret and exposure findings named the variable but omitted the
  required source-qualified location;
- schema output used `number` instead of `integer` and `url` instead of `uri`;
- evidence-supported fields such as `minLength`, `required`, and `sensitive`
  were inconsistently inferred.

These are semantic failures, not provider, adapter, workdir, fixture, or scorer
failures. The base IR remains frozen at its preregistered digest. The next stage
should compile typed development feedback into output-location and schema
constraints, rather than adding more generic workflow prose.

## Evidence Files

- `results/skill-ir/env-manager-static-v1-route-probe-2026-07-15/probe-results.jsonl`
- `results/skill-ir/env-manager-static-v1-2026-07-15/scored-results.jsonl`
- `results/skill-ir/env-manager-static-v1-2026-07-15/main-table.csv`
- `results/skill-ir/env-manager-static-v1-2026-07-15/analysis-summary.json`

Raw command logs, plans, and materialized workdirs stay local because they are
bulky execution evidence and may contain synthetic fixture secrets. Compact
scored rows and summaries are the committed research record.
