# Final IR Promotion Policy

> **Status (2026-07-15): frozen advisory utility.** The implementation is retained for reproducing seed-stage analysis. It must not automatically select, publish, or rewrite an IR artifact, and no further policy automation is planned before the real-skill deep pilots produce task-local development/held-out evidence.

## Purpose

The promotion policy turns multi-model scored result rows into model-family-specific evidence signals about whether a final `ir-pgo` artifact is promising, whether the static `ir-profile` artifact is currently safer, or whether more validation is required.

Task 11E's small synthetic-seed-heavy run suggested different outcomes on GPT, Gemini, and Qwen routes. Those observations motivate caution, but they are hypotheses and method demonstrations rather than mature model-family profiles.

The current policy is not an automatic deployment decision. It is a decision-support artifact for research analysis and the validation planner. Its output should be read as "what should we validate or optimize next?" rather than "which IR should permanently replace the other IR?"

Current `final IR` artifacts are still close to structured workflow JSON with generated checks and recovery policies. A promotion signal does not mean the project has reached the final artifact goal. The engineering target is a Validated Skill Artifact Package with authoritative IR, a generated skill view, reusable artifacts, provenance, and validation notes.

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

The archived policy groups scored rows by model family, then compares a baseline system and candidate system. Its compatibility defaults are:

```text
baseline:  ir-profile
candidate: ir-pgo
```

The current paper main table uses `ir-static` and task-local `ir-pgo`; callers must pass the intended baseline explicitly if reusing this utility for new pilot evidence.

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

## Evidence Signals

The current signal set is:

| Signal | Meaning |
|---|---|
| `promote-ir-pgo` | `ir-pgo` is a promising candidate for this model family in the current evidence set; schedule regression and broader validation before treating it as mature. |
| `keep-ir-profile` | Static `ir-profile` is currently safer for this model family; send `ir-pgo` failures back into repair, output-schema learning, or model-family analysis. |
| `hold-for-more-validation` | Evidence is too weak, infrastructure-heavy, or tied; gather route-health and paired held-out evidence before choosing an artifact. |

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
- A `promote-ir-pgo` signal is model-family-specific, not global, and is not enough by itself to rewrite base corpus IR or claim mature deployment readiness.
- A tied result does not automatically promote final IR because final IR can carry extra prompt complexity and token cost.
- Infrastructure-heavy routes are held out from promotion even when semantic rows look good.
- The confidence score is a heuristic summary, not a statistical confidence interval.
- The current model-family grouping is coarse. It does not yet mean profile annotations, output schemas, or repair hints are learned separately per model family.
- Current final IR maturity is mostly L1 to early L2. It should not be described as a stable L3/L4 reusable artifact package.

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
- Connect the promotion report to the validation planner so risk determines how many held-out tasks to sample.
- Add richer model-family behavior profiles when profile annotations carry model-family support metadata.

## Validation Planner Follow-Up

Task 11G adds a dry-run validation planner that consumes this promotion report and emits `skill-ir-validation-plan/v1`. The planner keeps the promotion report advisory:

```text
promote-ir-pgo           -> candidate regression validation
keep-ir-profile          -> static baseline preferred plus final-IR repair
hold-for-more-validation -> route health plus held-out validation
```

Use:

```powershell
bun ./src/benchmarks/skill-ir/validation-plan-run.ts '--promotion-report=results/skill-ir/final-ir-promotion-policy-report-2026-07-09.json' '--out=results/skill-ir/final-ir-validation-plan-2026-07-09.json'
```

The planner output, not this promotion report alone, should guide the next real-agent experiment.
