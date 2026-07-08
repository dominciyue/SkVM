# Harder Held-Out Tasks

## Purpose

This stage expands the six-skill seed corpus with one harder held-out task per deep benchmark skill. The motivation comes from the true noisy and true long Task 11 runs: both `original` and `ir-profile` passed all paired cases, so the current tasks no longer expose enough behavioral difference.

The goal is not to make the baseline fail artificially. The goal is to move evaluation closer to realistic failure boundaries where skill structure should matter: prioritization, distractor handling, portability details, repository hygiene, test-first ordering, and grounded reporting.

## Scope

Added on 2026-07-09:

| Skill | New task id | Added pressure |
|---|---|---|
| `skill-review` | `review-security-hard-001` | Security/access-control regression must be prioritized above style and missing tests must be noted. |
| `skill-ci-diagnostic` | `ci-cache-warning-hard-001` | Distracting cache/deprecation warnings should not be treated as root cause. |
| `skill-env-portability` | `portable-clean-hard-001` | Unix cleanup script must be replaced with a Node/Bun-based portable alternative. |
| `skill-git-hygiene` | `commit-secret-hard-001` | Secret-like and generated files must be excluded from the commit while preserving user changes. |
| `skill-tdd-bugfix` | `tdd-zero-page-hard-001` | Edge-case failing test must be mentioned before implementation. |
| `skill-report-synthesis` | `report-overclaim-hard-001` | Report must preserve evidence limits and avoid claiming broad validation. |

The seed corpus now has:

```text
6 deep benchmark skills
x 3 tasks per skill: one development task and two held-out tasks
= 18 seed tasks
```

## Scoring Criteria

The scorer now supports six additional deterministic criteria:

```text
Security or high-severity risk is prioritized.
Distracting warning is not treated as root cause.
Node-based portable alternative is provided.
Secret-like files are excluded from commit.
Edge-case failing test is mentioned.
Overclaiming is avoided.
```

These criteria remain heuristic. They are designed to catch obvious omissions and ordering failures in the current seed tasks, not to replace a final semantic judge.

## Runtime Behavior

The task files remain ordinary corpus fixtures under:

```text
benchmarks/skill-ir/tasks/
```

The real-agent runner does not need special handling for hard tasks. It loads them through the manifest and materializes each selected task into a SkVM `task.json`. The scorer reads success criteria from the manifest-backed task files, not from the materialized `task.json`.

## Dry-Run Audit

The hard-task dry run used:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=long' '--agents=skvm' '--environments=linux' '--tasks=review-security-hard-001,ci-cache-warning-hard-001,portable-clean-hard-001,commit-secret-hard-001,tdd-zero-page-hard-001,report-overclaim-hard-001' '--limit=12' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/harder-heldout-dry-run-2026-07-09'
```

Audit result:

```text
12 rows
6 paired case ids
6 original rows
6 ir-profile rows
2 rows per skill
2 rows per hard task
12 long-context rows
```

The materialized prompts contained the expected true long-context perturbation text.

## Verification

Focused tests:

```powershell
bun test ./src/skill-ir/corpus-fixtures.test.ts
bun test ./src/benchmarks/skill-ir/scoring.test.ts
```

Broader checks before committing should include:

```powershell
bun test ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/scoring.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/real-agent-retry.test.ts ./src/benchmarks/skill-ir/matrix.test.ts ./src/skill-ir/corpus-fixtures.test.ts
python -m unittest scripts.analyze_skill_ir_results_test scripts.analyze_skill_ir_slices_test
bun run typecheck
git diff --check
```

## Assumptions And Failure Modes

- The hard tasks are still seed tasks, not the final 8-12 tasks per skill target.
- New criteria are deterministic heuristics and may produce false negatives on creative but valid phrasing.
- If a real-agent run reveals a false negative, add a minimal scorer regression test before changing the matcher.
- These tasks are intended for the next discriminative run. They should be run with paired comparisons and raw output inspection before making optimization claims.

## Next Step

Run a bounded real-agent matrix over the six hard tasks, preferably `original` vs `ir-profile` under `long` or `compressed` context first. If both systems still pass all cases, add a second model route before further increasing task count.
