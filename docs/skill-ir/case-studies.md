# Skill IR Case Studies

## Purpose

This document collects compact case studies from real or intentionally archived Skill IR benchmark runs. Case studies should explain why a paired result changed, not merely repeat the aggregate table.

## 2026-07-09 Discriminative Task 11 Run

Source artifacts:

```text
results/skill-ir/discriminative-task11-results-2026-07-09.jsonl
results/skill-ir/discriminative-task11-table-2026-07-09.csv
docs/skill-ir/discriminative-task11-run.md
```

### Case 1: TDD Step Ordering

Case id:

```text
skill-tdd-bugfix:skvm:linux:clean:tdd-empty-input-001
```

Result:

```text
original: fail
ir-profile: pass
```

Failure criterion:

```text
Failing test is mentioned before implementation.
```

Why it matters:

The task asks for a test-first workflow. The original output eventually mentioned a failing test, but the output framed the answer as a completed implementation summary and put implementation before the failing-test step. The `ir-profile` materialization made the workflow order explicit: failing test first, concrete fix second, verification third.

Project interpretation:

This supports the idea that Skill IR can preserve procedural constraints that are easy for a natural-language skill to blur during generation.

### Case 2: Report Section Stability Under Noisy Context

Context note:

This case predates the context perturbation audit. The case id used `noisy`, but the task prompt did not yet include full noisy distractor text. Treat it as a structural-output case study from the first discriminative run, not as final evidence of robustness under true noisy context.

Case id:

```text
skill-report-synthesis:skvm:linux:noisy:report-lab-update-001
```

Result:

```text
original: fail
ir-profile: pass
```

Failure criterion:

```text
Required sections are present.
```

Why it matters:

The noisy context stresses whether the agent keeps the requested report structure. The original output produced a reasonable lab update, but did not preserve the expected Summary/Evidence/Next Steps section structure. The `ir-profile` output kept Summary, Evidence, Evidence Limitations, and Next Steps, which made the evidence boundary explicit.

Project interpretation:

This supports the claim that IR/profile-guided skill materialization can improve structural stability for generative skills, especially when irrelevant context is present.

## Notes For Future Case Studies

- Record the case id and artifact path.
- State the exact failed criterion.
- Explain whether the failure is a real behavior issue, a scorer limitation, or infrastructure noise.
- Keep excerpts short and avoid treating one case as full benchmark evidence.
