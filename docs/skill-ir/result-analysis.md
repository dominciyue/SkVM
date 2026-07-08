# Skill IR Result Analysis

## Purpose

The result analyzer summarizes benchmark JSONL output into CSV tables for the research report. It is designed around Task 7.5's paired evaluation requirement: optimized systems should be compared against a baseline on the same `caseId`, not only averaged globally.

The implementation lives in:

```text
scripts/analyze_skill_ir_results.py
scripts/analyze_skill_ir_slices.py
```

Focused tests live in:

```text
scripts/analyze_skill_ir_results_test.py
scripts/analyze_skill_ir_slices_test.py
```

Sample input and output live in:

```text
results/skill-ir/sample.jsonl
results/skill-ir/sample.csv
```

Real-agent raw logs should be scored before they reach this analyzer. The bridge from `raw-runs.jsonl` to `main-results.jsonl` is documented in:

```text
docs/skill-ir/real-agent-scoring.md
```

## Input Format

The analyzer reads JSONL. Each line is one experiment result:

```json
{
  "caseId": "skill-review:a1:linux:clean:task-1",
  "system": "ir-profile",
  "agent": "a1",
  "environment": "linux",
  "context": "clean",
  "success": false,
  "ruleViolations": 2
}
```

Required fields:

- `system`
- `agent`
- `environment`
- `context`
- `success`

Recommended fields:

- `caseId`
- `ruleViolations`

`caseId` enables paired deltas. Without `caseId`, a row still contributes to mean success, worst-case success, variance, and rule violations, but not to paired metrics.

## Output Fields

The CSV fields are:

```text
system
mean_success
worst_case_success
variance
rule_violations
mean_latency_ms
mean_token_cost
paired_cases
paired_delta_success
regression_count
negative_delta_count
infrastructure_failures
agent_failures
```

Metric meanings:

- `mean_success`: mean task success for a system.
- `worst_case_success`: minimum success rate across agent, environment, and context settings.
- `variance`: population variance of setting-level success rates.
- `rule_violations`: total rule violations for a system.
- `mean_latency_ms`: mean `latencyMs` for rows that expose wall-clock latency.
- `mean_token_cost`: mean `tokenCost` for rows that expose token accounting.
- `paired_cases`: count of rows compared against the baseline with the same `caseId`.
- `paired_delta_success`: mean success delta against the baseline on paired cases.
- `regression_count`: baseline succeeds but this system fails.
- `negative_delta_count`: single-case success delta is below zero.
- `infrastructure_failures`: rows marked with `failureType: "infrastructure"`.
- `agent_failures`: rows marked with `failureType: "agent"`.

Paired metrics skip cases where either side is marked as an infrastructure failure. This prevents provider or gateway instability from becoming a false positive gain or false regression.

## Command Line

Run unit tests:

```powershell
python -m unittest scripts.analyze_skill_ir_results_test
```

Analyze the sample:

```powershell
python scripts/analyze_skill_ir_results.py results/skill-ir/sample.jsonl results/skill-ir/sample.csv
```

Analyze scored real-agent results:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/real-agent-dry-run/raw-runs.jsonl' '--out=results/skill-ir/main-results.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/main-results.jsonl results/skill-ir/main-table.csv
```

Analyze slices and paired deltas:

```powershell
python scripts/analyze_skill_ir_slices.py --input results/skill-ir/main-results.jsonl --slices-out results/skill-ir/main-slices.csv --paired-out results/skill-ir/main-paired-deltas.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

The slice analyzer writes:

- `*-slices.csv`: per-system metrics by `context`, `skill`, and `taskSplit`.
- `*-paired-deltas.csv`: one row per non-baseline paired case, including gain/regression labels and token/latency deltas.

Use a custom baseline:

```powershell
python scripts/analyze_skill_ir_results.py results/skill-ir/sample.jsonl results/skill-ir/sample.csv no-skill
```

## Runtime Behavior

The public functions are:

```python
read_jsonl(path)
summarize(rows, baseline_system="original")
write_summary_csv(summary, path)
```

The CLI reads JSONL, calls `summarize`, and writes CSV. The default baseline is `original`.

`scripts/analyze_skill_ir_slices.py` exposes:

```python
summarize_slices(rows, baseline_system="original", task_split_by_key=None)
build_paired_delta_rows(rows, baseline_system="original", task_split_by_key=None)
build_task_split_index_from_manifest(manifest_path, root_dir)
```

When scored rows do not yet contain `taskSplit`, pass `--manifest` so the analyzer can recover task splits from corpus task files.

## Assumptions And Failure Modes

- `success` is interpreted as boolean success.
- `ruleViolations` defaults to zero if missing.
- Missing `latencyMs` or `tokenCost` values are ignored for their mean calculations. If no rows expose the field, the corresponding mean is `0.0`.
- Paired metrics require both baseline and compared rows to share the same `caseId`.
- If no paired baseline exists for a system, paired metrics are zero.
- The analyzer does not validate full result schema yet. Add result-schema validation when Task 11 produces full evaluation rows.
- `main-results.jsonl` should contain scored rows, not execution-only `raw-runs.jsonl`.
- Optional `failureType` fields are summarized as infrastructure and agent failure counts. Inspect JSONL directly for case-level diagnosis.
- Paired deltas ignore infrastructure-failure rows on either side of the comparison.
- Slice analysis treats missing `taskSplit` as `unknown` unless a corpus manifest is supplied.

## Modification Notes

- Keep output field names stable once real experiment CSVs exist.
- Add tests before changing metric formulas.
- If Task 8 changes `caseId`, update this document and tests in the same commit.
- If Task 10 changes reported metrics, update `SUMMARY_FIELDS` and sample CSV together.
- Keep the main summary and slice analyzer separate: the main table is for paper-level headline metrics, while slices and paired deltas are for diagnosis and case-study selection.
