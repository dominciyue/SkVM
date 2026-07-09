# Skill IR Validation Planner

## Purpose

The validation planner consumes `skill-ir-promotion/v1` evidence reports and emits a dry-run `skill-ir-validation-plan/v1` plan. Its job is to say what should be validated or optimized next. It does not call models, modify corpus IR, or automatically choose a permanent IR artifact.

This component was added because the current final IR, `ir-profile`, and `ir-pgo` artifacts are still research-stage artifacts. Task 11F made model-family evidence visible, but the evidence is not yet mature enough to support automatic adoption.

## Implementation

Implementation files:

```text
src/benchmarks/skill-ir/validation-plan.ts
src/benchmarks/skill-ir/validation-plan-run.ts
```

Tests:

```text
src/benchmarks/skill-ir/validation-plan.test.ts
src/benchmarks/skill-ir/validation-plan-run.test.ts
```

The pure module exposes:

```ts
planForModelFamily(profile, options)
buildValidationPlan(promotionReport, options)
```

The CLI module exposes:

```ts
parseValidationPlanArgs(argv)
buildValidationPlanFromArgs(args)
```

## Runtime Behavior

The planner reads a promotion report and produces one plan per model family. Each family plan includes:

- source promotion signal;
- planning state;
- recommended artifact for current experiments;
- adoption readiness;
- confidence, risk, paired-case count, and infrastructure rate;
- concrete next actions;
- caveats that prevent overinterpreting the plan as automatic adoption.

Planning states:

| State | Meaning |
|---|---|
| `candidate-regression-validation` | `ir-pgo` is promising, but still needs paired held-out and regression validation. |
| `static-baseline-preferred` | Static `ir-profile` is currently safer; final IR should be audited and repaired. |
| `needs-route-health-and-heldout-validation` | Evidence is blocked by infrastructure or insufficient paired held-out coverage. |

Action kinds:

```text
route-probe
paired-heldout-validation
periodic-regression-validation
final-ir-regression-audit
output-schema-learning
model-family-profile-learning
expand-evidence
corpus-expansion
```

## Command Line

Generate a dry-run validation plan from the current promotion report:

```powershell
bun ./src/benchmarks/skill-ir/validation-plan-run.ts '--promotion-report=results/skill-ir/final-ir-promotion-policy-report-2026-07-09.json' '--out=results/skill-ir/final-ir-validation-plan-2026-07-09.json'
```

Optional thresholds:

```text
--min-paired-cases=<number>
--min-confidence=<number>
--max-infrastructure-rate=<number>
```

The first dry-run output over Task 11F evidence produced:

```text
gemini -> needs-route-health-and-heldout-validation
gpt    -> candidate-regression-validation
qwen   -> static-baseline-preferred
```

This is intentionally less decisive than "adopt PGO for GPT." It means GPT is the best current candidate for follow-up regression validation, while Qwen should drive final-IR repair and Gemini should drive route-health work.

## Assumptions And Failure Modes

- The planner assumes the input promotion report was generated from correctly scored paired rows.
- It does not inspect raw model outputs or rerun scoring.
- It should not be used to rewrite base corpus IR.
- The current model-family grouping is coarse; it does not yet encode per-annotation model-family support.
- `experimental-candidate` readiness means "worth validating further," not "production-ready."
- Corpus expansion is always conservative because the current corpus is still coding-agent-heavy.

## Verification

Focused tests:

```powershell
bun test ./src/benchmarks/skill-ir/validation-plan.test.ts ./src/benchmarks/skill-ir/validation-plan-run.test.ts
```

Related tests:

```powershell
bun test ./src/benchmarks/skill-ir/validation-plan.test.ts ./src/benchmarks/skill-ir/validation-plan-run.test.ts ./src/benchmarks/skill-ir/promotion-policy.test.ts ./src/benchmarks/skill-ir/promotion-policy-run.test.ts
```

Typecheck:

```powershell
bun run typecheck
```

## Future Modification Notes

- Feed route-probe results into planner input so route health is not inferred only from scored rows.
- Add skill-category-level planning once the corpus has enough non-coding and schema-heavy tasks.
- Add output-schema-learning artifacts as first-class planner inputs.
- Add model-family support metadata to profile annotations so the planner can distinguish global repairs from family-specific repairs.
