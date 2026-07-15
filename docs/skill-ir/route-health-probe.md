# Skill IR Route Health Probe

## Purpose

The route-health probe is a small Task 11 utility for checking whether a model route is usable before launching a larger real-agent matrix. It exists because a previous `xty/qwen2.5-7b-instruct` run stalled on the first case and produced no raw rows.

The probe does not score skill quality. It answers a narrower question:

```text
Can this model route complete one representative SkVM real-agent case within a bounded timeout?
```

## Files

Implementation:

```text
src/benchmarks/skill-ir/route-probe.ts
src/benchmarks/skill-ir/route-probe-run.ts
```

Tests:

```text
src/benchmarks/skill-ir/route-probe.test.ts
```

## Runtime Behavior

For each requested model, the CLI:

1. Builds a one-case real-agent plan through the existing `buildPlan` path.
2. Materializes task and skill artifacts under the probe output directory.
3. Runs the generated `bun run skvm run ...` command.
4. Kills the process if it exceeds `--timeout-ms`. On Windows this uses
   `taskkill /t` so `bun run -> cmd -> bun` descendants cannot keep inherited
   stdout/stderr pipes open after the parent is gone.
5. Writes one compact JSONL row with route status and stdout/stderr tails.

The default probe case is:

```text
system: original
context: compressed
agent: skvm
environment: linux
task: report-overclaim-hard-001
```

This case is intentionally structure-sensitive and was useful in the first positive second-model run.

## Command Line

Probe candidate models:

```powershell
bun ./src/benchmarks/skill-ir/route-probe-run.ts '--corpus=calibration' '--models=xty/gpt-4.1-nano,xty/gemini-2.5-flash' '--require-env=SKVM_XTY_API_KEY' '--timeout-ms=30000' '--out-dir=results/skill-ir/route-probe'
```

Override the representative task:

```powershell
bun ./src/benchmarks/skill-ir/route-probe-run.ts '--corpus=calibration' '--models=xty/gpt-4.1-nano' '--system=original' '--context=compressed' '--task=report-overclaim-hard-001' '--timeout-ms=30000' '--require-env=SKVM_XTY_API_KEY'
```

PowerShell users should quote comma-separated `--models`.

## Output

The CLI writes:

```text
<out-dir>/probe-results.jsonl
```

Each row has this shape:

```json
{
  "model": "xty/gpt-4.1-nano",
  "caseId": "skill-report-synthesis:skvm:linux:compressed:report-overclaim-hard-001",
  "system": "original",
  "status": "ok",
  "exitCode": 0,
  "timedOut": false,
  "durationMs": 1200,
  "command": ["bun", "run", "skvm", "run"],
  "stdoutTail": "...",
  "stderrTail": ""
}
```

`status` values:

| Status | Meaning |
|---|---|
| `ok` | The command exited with code 0 before timeout. |
| `timeout` | The command exceeded `--timeout-ms` and was killed. |
| `infrastructure` | The command failed with provider/auth/network/rate-limit style evidence. |
| `agent` | The command failed without provider-infrastructure evidence. |

## How To Use In Task 11

Use the probe before full second-model or multi-model runs:

1. Query or choose candidate model ids.
2. Run `route-probe-run.ts` with a short timeout.
3. Select only `status=ok` routes for the larger matrix.
4. Keep the probe JSONL as a diagnostic artifact when it explains why a route was skipped.

Probe artifacts are not scored benchmark results. Archive them only when they affect model selection.

## Verification

Run focused tests:

```powershell
bun test ./src/benchmarks/skill-ir/route-probe.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Assumptions And Failure Modes

- A route that passes one probe case can still fail later; the probe is a cheap filter, not a guarantee.
- A timed-out route may be temporarily overloaded rather than permanently unusable.
- Timeout kills the spawned command tree on Windows and the direct subprocess
  on other platforms. The regression test includes a nested process that
  inherits both output pipes. A new non-Windows descendant leak requires a
  platform-specific process-group contract rather than silently extending the
  timeout.
- The probe intentionally stores only stdout/stderr tails to avoid committing large raw execution logs or secrets.
- The probe uses existing provider configuration. It does not write API keys to disk.

## Modification Notes

- Add tests before changing status classification.
- Keep timeout termination tests process-tree aware; a killed parent is not
  sufficient if descendants retain the captured pipes.
- Keep probe results separate from scored benchmark JSONL.
- If a new model family needs a different representative task, document the reason in the run archive.
