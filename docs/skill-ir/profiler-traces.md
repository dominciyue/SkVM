# Profiler Traces And Profile Annotations

## Purpose

Profiler traces capture how a skill execution behaved under a specific agent, environment, context, and task. Profile annotations summarize repeated failures from those traces and feed later AOT optimization passes.

The implementation lives in:

```text
src/profiler/trace-schema.ts
src/profiler/profile-annotation.ts
```

Focused tests live in:

```text
src/profiler/trace-schema.test.ts
src/profiler/profile-annotation.test.ts
```

## Execution Trace Schema

An execution trace is validated by `ExecutionTraceSchema`.

Required fields:

- `schemaVersion`: fixed as `skill-ir-trace/v1`.
- `traceId`: stable trace identifier.
- `skillId`: skill being executed.
- `agent`: agent or harness used.
- `environment`: operating system, container, or runtime setting.
- `context`: context perturbation such as `clean`, `noisy`, `long`, or `compressed`.
- `taskId`: benchmark task identifier.
- `success`: whether the task succeeded.
- `tokenCost`: integer token cost, non-negative.
- `latencyMs`: integer wall-clock latency, non-negative.
- `events`: execution events that matter for later profiling.

Trace event kinds:

```text
tool-call
tool-error
step-complete
step-skip
rule-violation
output-check
```

Each event has:

- `kind`
- `targetRef`
- `message`

## Profile Annotation Builder

The public API is:

```ts
buildProfileAnnotations(traces: ExecutionTrace[]): ProfileAnnotation[]
```

It currently profiles repeated events with these kinds:

- `rule-violation`
- `step-skip`
- `tool-error`

Events must occur at least twice for the same `targetRef` before an annotation is emitted. This avoids overfitting to one-off noise in a single run.

Current mapping:

| Event | Annotation |
|---|---|
| `rule-violation` | `frequent-failure` |
| `step-skip` | `frequent-skip` |
| `tool-error` | `environment-sensitive` |

All emitted annotations currently suggest:

```text
profile-guided-repair
```

Later passes can use this signal to add runtime checks, environment guards, fallback policies, or required-step enforcement.

## Example

```json
{
  "schemaVersion": "skill-ir-trace/v1",
  "traceId": "trace-001",
  "skillId": "skill-review",
  "agent": "codex",
  "environment": "windows",
  "context": "noisy",
  "taskId": "review-finding-order-001",
  "success": false,
  "tokenCost": 1200,
  "latencyMs": 8000,
  "events": [
    {
      "kind": "rule-violation",
      "targetRef": "rule-findings-first",
      "message": "Summary appeared before findings."
    }
  ]
}
```

## Command Line

Run profiler tests:

```powershell
bun test ./src/profiler/trace-schema.test.ts ./src/profiler/profile-annotation.test.ts
```

Run current Skill IR and profiler tests:

```powershell
bun test ./src/skill-ir/schema.test.ts ./src/skill-ir/validate.test.ts ./src/skill-ir/parser.test.ts ./src/skill-ir/corpus-fixtures.test.ts ./src/profiler/trace-schema.test.ts ./src/profiler/profile-annotation.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Failure Modes

- A trace with negative `tokenCost` or `latencyMs` is rejected.
- A single failure event does not produce a profile annotation.
- Current annotation building groups only by `targetRef`, not by agent/environment/context. Add setting-aware grouping if later experiments need more precise diagnosis.
- `tool-error` currently maps to `environment-sensitive`, even if a failure may be caused by missing credentials or configuration. Future versions can refine this with structured error categories.

## Modification Notes

- Add tests before adding new event kinds or annotation mappings.
- Keep trace schema stable once benchmark results depend on it.
- Prefer adding optional fields over changing existing required field names.
- Keep profile annotation generation deterministic so repeated analysis of the same traces yields the same IR annotations.
