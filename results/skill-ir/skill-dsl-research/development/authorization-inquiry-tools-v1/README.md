# AO authorization inquiry and evidence tools

Development evidence for AO0–AO16, started from clean `aea87139`, generation bound to `218f5bbf`. All 56 planned rows are terminal, with 319 actual provider dispatches and no target execution or shared-revision sampling. Four initial route failures had zero dispatch and were preserved. Two MD consumer protocol failures remain in the denominator.

Use [evaluation-summary.json](evaluation-summary.json) for first/final semantic quality and full accounting, [author-use-obligations.json](author-use-obligations.json) for the supplemental main-agent obligation review, and [skill-use-detail.json](skill-use-detail.json) for actual native tool use versus checked-result delivery. [review/receipt.json](review/receipt.json) binds the six independent agents' raw messages and final code audit; [review/adjudications.json](review/adjudications.json) records main-agent corrections without changing candidate/source bytes. These are agent judgments on exposed development tasks, not human or held-out evaluation.

The current opt-in capability supports behavior questions without invented policy, conformance with independent policy, natural authoring, bounded same-session source reads, request/premise/policy edits, and ordinary skill loading. The [movable example](../../../../../examples/authorization-assessment/reusable-skill/SKILL.md) contains user-facing commands. Remaining whole-skill duties are retained in [source-skill-duty-map.json](source-skill-duty-map.json).

From the repository root, restore the retained results with zero provider calls:

```sh
bun results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/study.ts replay
bun results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/normalize-reviews.ts replay
bun results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/evaluate.ts replay
bun results/skill-ir/skill-dsl-research/development/authorization-inquiry-tools-v1/portable-check.ts replay
```

Do not regenerate or run preflight writers into this sealed result root. `SKVM_CACHE` selected the existing repository route for actual generation; credentials and config bytes are not included. All dispatch usage is known, all actual USD amounts are unknown. Complete prompt tokens include cache-read exactly once. Developer-agent effort and human time remain unknown.

Engineering delivery is separate from method benefit: main quality M/D0/D1 ended at 2/1/1 full answers of 8 each, changed M/D1 at 3/2 of 4 each; no stable DSL advantage is established. Source-skill domain support produced four semantically full answers, but only three checked domain results; one session exhausted the tool budget. AO13 fixes scope-only policy transmission without new paid sessions. Current verification/publication state is in [status.json](status.json), and the sole research narrative is [§7.34](../../../../../docs/skill-ir/skill-dsl-research.md#734-ao-真实授权任务与领域取证工具).
