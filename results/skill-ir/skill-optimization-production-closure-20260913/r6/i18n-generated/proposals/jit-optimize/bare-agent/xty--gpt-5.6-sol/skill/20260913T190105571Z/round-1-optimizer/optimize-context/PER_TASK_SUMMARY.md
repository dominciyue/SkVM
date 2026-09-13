# Per-Task Summary

Each row is one task from round-0 (baseline) grouped across its runs. The `Status` column is what the selection engine's per-task regression gate uses to decide whether your edit is allowed to win. **You must not make any PASSING task worse than its current mean.**

Status buckets:
- **FAILING** (mean < 0.5) — you're here to fix these.
- **MARGINAL** (0.5 ≤ mean < 0.9) — fixable, but watch for regressions.
- **PASSING** (mean ≥ 0.9) — leave them alone. Your edit must NOT lower these.
- **UNASSESSED** — usable trace/artifact evidence without a score. Analyze it, but do not invent quality labels. A missing score is not an infrastructure failure.
- **TAINTED** — all runs were infra-broken; no usable score. See the Abstain section of your instructions.

| Status   | Task ID | Runs | Mean | Dir (relative to .optimize/) | Worst Criterion | Evidence Indices |
|----------|---------|------|------|------------------------------|-----------------|------------------|
| UNASSESSED | `i18n-helper-v3-react-basic-dev-001-clean` | 1 | n/a | tasks/i18n-helper-v3-react-basic-dev-001-clean/ | (none) | 0 |

The **Evidence Indices** column is what `blockedEvidenceIds` references if you emit an `infraBlocked` submission — it's the original flat 0..N-1 numbering, independent of the per-task directory layout.
