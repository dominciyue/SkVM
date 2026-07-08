# Skill IR Result Analysis

## Purpose

The result analyzer summarizes benchmark JSONL output into CSV tables for the research report. It is designed around Task 7.5's paired evaluation requirement: optimized systems should be compared against a baseline on the same `caseId`, not only averaged globally.

The implementation lives in:

```text
scripts/analyze_skill_ir_results.py
```

Focused tests live in:

```text
scripts/analyze_skill_ir_results_test.py
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
paired_cases
paired_delta_success
regression_count
negative_delta_count
```

Metric meanings:

- `mean_success`: mean task success for a system.
- `worst_case_success`: minimum success rate across agent, environment, and context settings.
- `variance`: population variance of setting-level success rates.
- `rule_violations`: total rule violations for a system.
- `paired_cases`: count of rows compared against the baseline with the same `caseId`.
- `paired_delta_success`: mean success delta against the baseline on paired cases.
- `regression_count`: baseline succeeds but this system fails.
- `negative_delta_count`: single-case success delta is below zero.

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

## Assumptions And Failure Modes

- `success` is interpreted as boolean success.
- `ruleViolations` defaults to zero if missing.
- Paired metrics require both baseline and compared rows to share the same `caseId`.
- If no paired baseline exists for a system, paired metrics are zero.
- The analyzer does not validate full result schema yet. Add result-schema validation when Task 11 produces full evaluation rows.
- `main-results.jsonl` should contain scored rows, not execution-only `raw-runs.jsonl`.
- The analyzer currently ignores optional `failureType` fields. Inspect JSONL directly when separating infrastructure failures from skill behavior.

## Modification Notes

- Keep output field names stable once real experiment CSVs exist.
- Add tests before changing metric formulas.
- If Task 8 changes `caseId`, update this document and tests in the same commit.
- If Task 10 changes reported metrics, update `SUMMARY_FIELDS` and sample CSV together.
