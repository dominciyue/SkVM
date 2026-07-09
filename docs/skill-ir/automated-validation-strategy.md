# Skill IR Automated Validation Strategy

## Purpose

The project goal is not to make users manually run the full research matrix every time a new skill is imported. The intended direction is an automated, sampled, and layered validation pipeline that decides how much evidence is still needed before making stronger claims about a final IR artifact.

This document records the target design for that pipeline. It is not fully implemented yet; current Task 11C work provides the core inputs: static IR validation, real-agent execution, scoring, profile feedback, and final IR artifacts.

## Current Answer

The current final IR is already a static-dynamic combination:

```text
Static Base IR
  + Profile Overlay from observed execution rows
  + Deterministic optimization passes
= Final Optimized IR
```

Static information supplies steps, rules, tools, environment assumptions, checks, and recovery policies. Dynamic information supplies profile annotations from scored execution failures. The final IR compiler merges both and runs rule normalization, environment guard insertion, profile-guided repair, and validation.

There is still optimization room. The current feedback loop handles rule failures well enough to generate checks and recovery policies, but it does not yet learn richer task-specific output schemas, model-family-specific behavior, confidence scores, or automatic validation tiers.

The post-Task 11D roadmap expands this into five concrete optimization tracks:

```text
output schema learning
model-family behavior profiles
confidence and risk scoring
validation planner
final IR promotion policy
```

These tracks should be implemented only after the current final IR artifact is evaluated across more than one skill and model route.

## Validation Layers

### Layer 0: Import-Time Static Validation

Runs without model calls.

Checks:

- Skill IR schema validation.
- Step, rule, tool, check, and recovery references.
- Required-step check coverage.
- High-severity rule checkability.
- Environment assumptions for environment-sensitive skills.
- Basic final IR compilation from base IR without profile overlay.

Outcome:

- Reject invalid IR.
- Warn on weak static coverage.
- Decide whether the skill needs a smoke run.

### Layer 1: Sampled Smoke Validation

Runs a small, bounded real-agent sample.

Recommended sample:

```text
1-2 tasks
x 1-2 contexts
x 1 stable model route
x original / ir-profile
```

Outcome:

- Catch obvious lowering or scorer failures.
- Produce initial scored rows.
- Generate profile overlay only from semantic failures, never infrastructure failures.

### Layer 2: Promotion Validation

Runs before claiming that a final IR artifact is better than the static baseline.

Recommended comparison:

```text
original
ir-profile
ir-pgo
```

Use held-out tasks when possible. Calibration replay is allowed for debugging the PGO mechanism, but it should be labeled clearly and not used as broad evidence.

Outcome:

- Promote final IR when paired deltas improve or stay neutral without regressions.
- Keep final IR as an experiment artifact when evidence is too small.
- Send failures back into profile feedback or task/scorer debugging.

### Layer 3: Periodic Regression Validation

Runs as the corpus and passes change.

Sampling dimensions:

- Skill category.
- Context perturbation.
- Model family or route.
- Environment label.
- High-risk tasks with prior failures.

Outcome:

- Detect regressions caused by optimization pass changes.
- Track whether improvements generalize beyond one GPT-family route or one task shape.

## Risk-Based Sampling

The validation controller should increase sampling when any of these signals appear:

- New skill category or unseen task shape.
- Environment-sensitive tools or shell/path assumptions.
- High-severity output rules.
- Low check coverage after static IR construction.
- New profile annotation type.
- Changed optimization pass.
- Previous paired regression.
- Model route or adapter family not recently probed.

The controller can reduce sampling for mature skills that have stable static validation, no recent profile changes, and recent passing regression samples.

## Commands Available Today

Static and focused tests:

```powershell
bun test ./src/benchmarks/skill-ir/profile-feedback.test.ts ./src/profiler/profile-annotation.test.ts ./src/skill-ir/passes/profile-guided-repair.test.ts ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
```

Generate profile overlay and final IR:

```powershell
bun ./src/benchmarks/skill-ir/profile-feedback-run.ts '--results=results/skill-ir/harder-heldout-compressed-gpt41nano-results-2026-07-09.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--source-system=original' '--min-evidence=1' '--out-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09'
```

Run a small `ir-pgo` validation:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile,ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=report-overclaim-hard-001,report-conflicting-notes-hard-002' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/final-ir' '--execute' '--retries=1' '--retry-delay-ms=1000' '--require-env=SKVM_XTY_API_KEY'
```

Score and analyze:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=<run-dir>/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=<results>.jsonl'
python scripts/analyze_skill_ir_results.py <results>.jsonl <table>.csv
python scripts/analyze_skill_ir_slices.py --input <results>.jsonl --slices-out <slices>.csv --paired-out <paired>.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

## Failure Modes

- A passing calibration replay does not prove generalization.
- A small sampled smoke can miss task-specific failures.
- Infrastructure failures must stay out of profile feedback.
- Heuristic scorer false negatives must be fixed with regression tests before interpreting results.
- Model-route compatibility problems should be recorded as infrastructure, not as skill behavior.

## Future Implementation

The next implementation step is a validation planner CLI that produces a validation plan from promotion-policy evidence, skill risk signals, and available budget. This first planner should be dry-run only: it should not call models, modify base corpus IR, or automatically adopt `ir-pgo`. A later version can execute that plan, route outputs into scoring and profile feedback, and update evidence reports.

Before building the planner, run a multi-skill multi-model final IR experiment. The recommended scope is the six current deep-benchmark skills, their hard-002 held-out tasks, `original / ir-profile / ir-pgo`, compressed context, and two or more route-probed models. This experiment should classify observed differences as static/final-pass effects, dynamic-profile effects, regressions, cost effects, or infrastructure effects.

The first Task 11E run showed why promotion needs policy rather than a single final-IR artifact switch. `ir-pgo` was best on `gpt-4.1-nano`, tied on Gemini non-infrastructure rows, and weaker than static `ir-profile` on `qwen3-8b`. Therefore, a future validation planner should be able to recommend:

- keep static `ir-profile` for a model family when it beats `ir-pgo`;
- use `ir-pgo` for a model family when held-out paired deltas improve without regressions;
- withhold promotion when infrastructure failures dominate or cost/latency grows too much;
- request more evidence when the profile overlay was generated from a narrow calibration source.

Task 11F implements the first version of that recommendation as `promotion-policy.ts` and `promotion-policy-run.ts`. It consumes scored JSONL files and emits `skill-ir-promotion/v1` reports. These reports are evidence signals, not automatic adoption decisions. The first report over Task 11E data produced:

```text
gpt    -> promote-ir-pgo
gemini -> hold-for-more-validation
qwen   -> keep-ir-profile
```

The validation planner should consume this report format rather than re-deriving the same signal from CSV tables. Planner behavior should be:

- `promote-ir-pgo`: treat `ir-pgo` as a candidate and schedule periodic regression samples for that model family.
- `keep-ir-profile`: prefer static IR in current experiments and send final-IR regressions back into profile/output-schema/model-family repair.
- `hold-for-more-validation`: add paired held-out samples or route-health probes before making stronger claims.

Task 11G starts this dry-run planner. It should also preserve the five open optimization tracks:

- richer output schema learning;
- model-family behavior profiles inside profile annotations and repair passes;
- confidence/risk scoring as a planning signal rather than a final verdict;
- validation planning before expensive real-agent execution;
- corpus expansion toward non-GPT-friendly, bilingual, schema-heavy, non-coding, and environment-sensitive skills.
