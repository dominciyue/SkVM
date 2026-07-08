# Skill IR Real-Agent Scoring

## Purpose

The real-agent scoring layer converts execution-only SkVM logs into benchmark rows that the result analyzer can summarize. It sits between `real-agent-run.ts --execute` and `scripts/analyze_skill_ir_results.py`.

The current implementation is intentionally deterministic and offline. It does not call an LLM judge. For the seed review tasks, it checks the task `successCriteria` with small heuristics so the end-to-end pipeline can be tested before spending model budget.

## Files

Implementation:

```text
src/benchmarks/skill-ir/scoring.ts
src/benchmarks/skill-ir/score-real-agent-runs.ts
```

Tests:

```text
src/benchmarks/skill-ir/scoring.test.ts
```

## Input

The CLI reads raw execution logs:

```text
results/skill-ir/real-agent-dry-run/raw-runs.jsonl
```

Each row should include:

```json
{
  "caseId": "skill-review:skvm:linux:clean:review-finding-order-001",
  "system": "original",
  "taskPath": "...",
  "exitCode": 0,
  "durationMs": 1250,
  "stdout": "Final output:\nFindings\n- Behavioral bug creates a regression risk.",
  "stderr": "",
  "successSource": "execution-only"
}
```

For the seed review path, task definitions can be read from one task file:

```text
benchmarks/skill-ir/tasks/review-skill-tasks.json
```

For multi-skill evaluation, the scorer should read task definitions from the corpus manifest. Each manifest skill must provide `tasksPath`, and each task file must declare a matching `skillId`.

## Output

The CLI writes scored JSONL, by default:

```text
results/skill-ir/main-results.jsonl
```

Each scored row is compatible with `scripts/analyze_skill_ir_results.py`:

```json
{
  "caseId": "skill-review:skvm:linux:clean:review-finding-order-001",
  "system": "original",
  "skill": "skill-review",
  "agent": "skvm",
  "environment": "linux",
  "context": "clean",
  "task": "review-finding-order-001",
  "success": true,
  "ruleViolations": 0,
  "stepCoverage": 1,
  "latencyMs": 1250,
  "successSource": "heuristic-success-criteria",
  "failedCriteria": []
}
```

An infrastructure failure row can include `failureType`:

```json
{
  "caseId": "skill-review:skvm:linux:clean:review-finding-order-001",
  "system": "original",
  "skill": "skill-review",
  "agent": "skvm",
  "environment": "linux",
  "context": "clean",
  "task": "review-finding-order-001",
  "success": false,
  "ruleViolations": 0,
  "stepCoverage": 1,
  "latencyMs": 300000,
  "successSource": "heuristic-success-criteria",
  "failedCriteria": ["process exited with code 1"],
  "failureType": "infrastructure"
}
```

`failureType` is optional and appears only on unsuccessful rows. Current values are:

- `infrastructure`: provider/network/auth/rate-limit style failure.
- `agent`: non-zero execution that does not look like provider infrastructure.

## Command Line

Score a real execution log:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/real-agent-dry-run/raw-runs.jsonl' '--tasks=benchmarks/skill-ir/tasks/review-skill-tasks.json' '--out=results/skill-ir/main-results.jsonl'
```

Score a multi-skill execution log through the corpus manifest:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/real-agent-dry-run/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/main-results.jsonl'
```

Use `--root-dir=<path>` when the manifest's `tasksPath` entries should be resolved against a temporary or alternate benchmark root:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=tmp/raw-runs.jsonl' '--manifest=tmp/benchmarks/skill-ir/corpus/manifest.json' '--root-dir=tmp' '--out=tmp/main-results.jsonl'
```

Then summarize:

```powershell
python scripts/analyze_skill_ir_results.py results/skill-ir/main-results.jsonl results/skill-ir/main-table.csv
```

## Runtime Behavior

Public helpers:

```ts
parseCaseId(caseId)
extractFinalOutput(stdout)
scoreRunOutput(opts)
scoreRawRunRows(rows, taskById)
scoreRawRunRowsBySkill(rows, taskBySkillAndId)
taskIndexKey(skillId, taskId)
```

Scoring behavior:

- `caseId` is parsed into skill, agent, environment, context, and task.
- With `--tasks`, task ids are looked up by task id only. This mode is intended for a single skill task file and is kept for backward compatibility.
- With `--manifest`, task ids are looked up by `skillId:taskId`, so two skills can safely reuse the same task id.
- `stdout` is reduced to the text after the last `Final output:` marker when present.
- `successCriteria` are checked against the final output.
- `success` is true only when the process exit code is zero and every supported criterion passes.
- `ruleViolations` is the count of failed criteria.
- `stepCoverage` is `1` when the final output is non-empty and `0` otherwise.
- `latencyMs` is copied from raw execution `durationMs`.
- Non-zero exits are classified with `failureType` so infrastructure failures can be separated from skill behavior.
- Infrastructure failures do not contribute to `ruleViolations`; they should be counted through `infrastructure_failures` in the summary table.

## Supported Seed Criteria

The current heuristic scorer supports the review seed tasks:

- `Findings appear before summary.`
- `Behavioral bug is mentioned.`
- `Style-only issue is lower priority than behavioral bug.`
- `Missing or insufficient tests are mentioned.`
- `The finding explains the user-visible or regression risk.`

Unsupported criteria fail closed. This prevents the scorer from silently overstating success when new task types are added.

## Verification

Run focused tests:

```powershell
bun test ./src/benchmarks/skill-ir/scoring.test.ts
```

Run the relevant TypeScript benchmark tests:

```powershell
bun test ./src/benchmarks/skill-ir/matrix.test.ts ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Assumptions And Failure Modes

- This is not a final LLM-judge evaluator. It is a deterministic bridge for the current seed tasks.
- Unsupported success criteria fail closed and should trigger a scorer extension or task-specific verifier.
- Use `--manifest` for expanded Task 11B runs. `--tasks` should only be used when all raw rows belong to one skill task file.
- A manifest skill without `tasksPath`, or a task file with a mismatched `skillId`, fails before writing scored output.
- A non-zero process exit code always makes the row unsuccessful.
- `ruleViolations` currently means failed success criteria in the scorer, not full runtime checker violations.
- `tokenCost` is not available yet because raw SkVM execution rows do not expose it.
- The CSV analyzer summarizes `failureType` as `infrastructure_failures` and `agent_failures`, but case-level diagnosis still requires inspecting JSONL rows.

## Modification Notes

- Add a failing test before adding a new criterion matcher.
- Keep raw logs and scored rows separate.
- Do not commit `results/skill-ir/main-results.jsonl` unless the run is intentionally archived as an experiment artifact.
- When replacing the heuristic scorer with an LLM judge or deterministic task verifier, keep the output JSONL field names stable for the analyzer.
