# Final IR Promotion Policy

## Purpose

The promotion policy turns multi-model scored result rows into model-family-specific decisions about whether a final `ir-pgo` artifact should be used, whether the static `ir-profile` artifact should remain the default, or whether more validation is required.

This component exists because Task 11E showed that final IR is not globally better across all model families. `ir-pgo` was best on the GPT-family route, tied on Gemini semantic rows, and weaker than static `ir-profile` on Qwen. A single global switch from static IR to final IR would therefore hide regressions.

## Implementation

Implementation files:

```text
src/benchmarks/skill-ir/promotion-policy.ts
src/benchmarks/skill-ir/promotion-policy-run.ts
```

Tests:

```text
src/benchmarks/skill-ir/promotion-policy.test.ts
src/benchmarks/skill-ir/promotion-policy-run.test.ts
```

The pure module exposes:

```ts
inferModelFamily(model)
summarizeModelFamily(input)
buildPromotionReport(inputs, options)
```

The CLI module exposes:

```ts
parseRunSpec(value)
parsePromotionPolicyArgs(argv)
buildPromotionReportFromArgs(args)
```

## Runtime Behavior

The policy groups scored rows by model family, then compares a baseline system and candidate system. The default comparison is:

```text
baseline:  ir-profile
candidate: ir-pgo
```

Rows marked `failureType: "infrastructure"` are excluded from semantic paired comparisons but still counted in infrastructure risk. Paired cases are matched by:

```text
skill + agent + environment + context + task
```

For each model family, the report includes:

- semantic success rate per system;
- infrastructure row count and rate;
- paired delta of `ir-pgo` versus `ir-profile`;
- `ir-pgo` gains and regressions;
- mean token and latency changes;
- confidence and risk scores;
- a decision and short reasons.

## Decisions

The current decision set is:

| Decision | Meaning |
|---|---|
| `promote-ir-pgo` | Use final IR for this model family because held-out paired evidence improves without regressions and cost/latency stay within policy limits. |
| `keep-ir-profile` | Keep static IR for this model family because final IR underperforms or regresses against static IR. |
| `hold-for-more-validation` | Do not promote yet because infrastructure failures dominate, evidence is too small, or quality is tied without a clear benefit. |

Default policy thresholds:

```text
minPairedCases: 4
maxInfrastructureRate: 0.25
maxTokenCostIncreaseRatio: 0.5
maxLatencyIncreaseRatio: 0.5
```

These values are deliberately conservative. They should be tuned after more models and task categories are available.

## Command Line

Generate a promotion report from existing scored JSONL files:

```powershell
bun ./src/benchmarks/skill-ir/promotion-policy-run.ts '--run=gpt41nano,xty/gpt-4.1-nano,results/skill-ir/final-ir-multiskill-gpt41nano-results-2026-07-09.jsonl' '--run=gemini25flash,xty/gemini-2.5-flash,results/skill-ir/final-ir-multiskill-gemini25flash-results-2026-07-09.jsonl' '--run=qwen38b,xty/qwen3-8b,results/skill-ir/final-ir-multiskill-qwen38b-results-2026-07-09.jsonl' '--out=results/skill-ir/final-ir-promotion-policy-report-2026-07-09.json'
```

Each `--run` uses:

```text
modelLabel,model,path[,modelFamily]
```

`modelFamily` is optional. If omitted, it is inferred from the model id.

The first real report produced:

```text
gemini -> hold-for-more-validation
gpt    -> promote-ir-pgo
qwen   -> keep-ir-profile
```

## Assumptions And Failure Modes

- The policy assumes scored rows from different systems are paired on the same task/context/model setting.
- It does not inspect raw model output. Scorer false negatives must be fixed before interpreting promotion decisions.
- A `promote-ir-pgo` decision is model-family-specific, not global.
- A tied result does not automatically promote final IR because final IR can carry extra prompt complexity and token cost.
- Infrastructure-heavy routes are held out from promotion even when semantic rows look good.
- The confidence score is a heuristic summary, not a statistical confidence interval.

## Verification

Focused tests:

```powershell
bun test ./src/benchmarks/skill-ir/promotion-policy.test.ts ./src/benchmarks/skill-ir/promotion-policy-run.test.ts
```

Broader related verification:

```powershell
bun test ./src/benchmarks/skill-ir/promotion-policy.test.ts ./src/benchmarks/skill-ir/promotion-policy-run.test.ts ./src/benchmarks/skill-ir/scoring.test.ts ./src/benchmarks/skill-ir/profile-feedback.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts
bun run typecheck
```

## Future Modification Notes

- Add skill-category-level promotion once enough rows exist per category.
- Add route health input from `route-probe-run.ts` instead of inferring infrastructure risk only from scored rows.
- Connect the promotion report to the future validation planner so risk determines how many held-out tasks to sample.
- Add richer model-family behavior profiles when profile annotations carry model-family support metadata.
