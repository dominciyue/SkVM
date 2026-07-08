# Harder Held-Out Tasks

## Purpose

This stage expands the six-skill seed corpus with harder held-out tasks for each deep benchmark skill. The motivation comes from the true noisy and true long Task 11 runs: both `original` and `ir-profile` passed all paired cases, so the current tasks no longer expose enough behavioral difference.

The goal is not to make the baseline fail artificially. The goal is to move evaluation closer to realistic failure boundaries where skill structure should matter: prioritization, distractor handling, portability details, repository hygiene, test-first ordering, and grounded reporting.

## Scope

First hard-task wave added on 2026-07-09:

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
x 4 tasks per skill: one development task and three held-out tasks
= 24 seed tasks
```

Second hard-task wave added on 2026-07-09:

| Skill | New task id | Added pressure |
|---|---|---|
| `skill-review` | `review-data-loss-hard-002` | Data-loss regression should be prioritized over lower-priority filename changes. |
| `skill-ci-diagnostic` | `ci-engine-warning-hard-002` | Cache and optional-dependency warnings should not distract from the Node engine mismatch. |
| `skill-env-portability` | `portable-env-chain-hard-002` | Mixed Unix env assignment and cleanup command should be replaced with a Node/Bun-based portable alternative. |
| `skill-git-hygiene` | `commit-partial-index-hard-002` | Already-staged unrelated files and local config/raw outputs must remain out of the commit. |
| `skill-tdd-bugfix` | `tdd-whitespace-name-hard-002` | Whitespace-only display-name bug should be handled through a failing edge-case test before implementation. |
| `skill-report-synthesis` | `report-conflicting-notes-hard-002` | A tempting broad-superiority claim must be rejected while preserving the bounded positive result. |

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

The first hard-task dry run used:

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

The second hard-task wave used a compressed-context dry-run audit before multi-model execution:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=review-data-loss-hard-002,ci-engine-warning-hard-002,portable-env-chain-hard-002,commit-partial-index-hard-002,tdd-whitespace-name-hard-002,report-conflicting-notes-hard-002' '--limit=12' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--out-dir=results/skill-ir/multimodel-hard002-dry-run-2026-07-09'
```

Audit result:

```text
12 rows
6 paired case ids
6 original rows
6 ir-profile rows
2 rows per skill
2 rows per hard-002 task
12 compressed-context rows
```

The second wave did not create a new quality gain in the three-model run; see `docs/skill-ir/multimodel-hard002-run.md`.

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
- The second hard-task wave expands coverage but is not yet more discriminative than `report-overclaim-hard-001`.
- New criteria are deterministic heuristics and may produce false negatives on creative but valid phrasing.
- If a real-agent run reveals a false negative, add a minimal scorer regression test before changing the matcher.
- These tasks are intended for the next discriminative run. They should be run with paired comparisons and raw output inspection before making optimization claims.

## Next Step

Use route-health probing before additional model expansion, then add a third hard-task wave focused on stronger output schema enforcement, explicit instruction conflicts, and compressed-context recovery.
