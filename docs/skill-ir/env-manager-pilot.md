# Env Manager Real-Skill Pilot

## Purpose And Current State

`env-manager` is the first vertical real-skill pilot. Its upstream `SKILL.md`
comes from the pinned, MIT-licensed `env-manager` source in
`laolaoshiren/claude-code-skills-zh`. The pilot provides source-backed
development/held-out tasks, deterministic scoring, and a source-audited,
profile-empty base IR.

The corpus status is:

```text
runnable
```

Its `irPath` points to `base-ir.json`, so ordinary pilot scheduling selects this
skill with the cold-start systems. The historical restricted
`--allow-tasks-authored` path remains available for future pre-IR pilots but no
longer selects `env-manager`. The baseline and static runs are recorded in
`env-manager-calibration-v1-run.md` and `env-manager-static-v1-run.md`.

The static run improved deterministic partial correctness and eliminated hard
gate failures, but all static rows still failed exact classification-location
and schema-rule checks. Two provenance-bound dual-source Final IR candidates
now exist as development artifacts. Repair v1 matched static at 0/4 and 0.70;
repair v2 reached 1/4 but regressed to 0.6375. Neither passed the frozen
development gate, so the pilot still has no held-out optimization evidence.

## Files

```text
benchmarks/skill-ir/pilots/env-manager/source/SKILL.md
benchmarks/skill-ir/pilots/env-manager/tasks.json
benchmarks/skill-ir/pilots/env-manager/base-ir.json
benchmarks/skill-ir/pilots/env-manager/env-manager-vertical-lock.json
benchmarks/skill-ir/pilots/env-manager/env-manager-static-lock.json
benchmarks/skill-ir/pilots/env-manager/env-manager-dual-overlay-lock.json
benchmarks/skill-ir/pilots/env-manager/env-manager-dual-overlay-v2-lock.json
benchmarks/skill-ir/corpus/corpora/pilot.json
src/bench/evaluators/env-manager-grade.ts
src/bench/evaluators/env-manager-grade.test.ts
src/benchmarks/skill-ir/env-manager-pilot.test.ts
src/skill-ir/corpus-fixtures.test.ts
src/benchmarks/skill-ir/repair-evidence.ts
src/benchmarks/skill-ir/dual-source-feedback-run.ts
src/skill-ir/passes/typed-output-repair.ts
```

The evaluator is registered through `src/bench/evaluators/index.ts` as:

```text
skill-ir-env-manager
```

Its payload schema is `skill-ir-env-manager-eval/v1`.

## Task Family

| Task | Split | Main discriminative shape |
|---|---|---|
| `env-manager-node-audit-dev-001` | development | Used, unconfirmed-unused, undefined, and hardcoded-secret cases. |
| `env-manager-vite-audit-dev-002` | development | Client-prefix exposure plus server-only and undefined variables. |
| `env-manager-python-audit-heldout-001` | held-out | Two unconfirmed-unused and two undefined variables, with no hardcoded-secret case. |
| `env-manager-nextjs-audit-heldout-002` | held-out | Client exposure and hardcoded secret in the same task, plus two undefined variables. |

The held-out tasks use different names, paths, language/framework syntax, and
classification combinations. Evaluator expectations are not copied into task
prompts. Held-out rows must never be used to construct a profile overlay.

All fixtures are inline, repository-relative files. Every secret-looking value
uses a `TEST_ONLY_` prefix and is synthetic. Existing fixture files are input
evidence and must remain byte-identical.

## Agent Output Contract

Each task requires three generated files:

```text
.env.example
.env.schema.json
env-report.json
```

`env-report.json` must be a strict JSON object with exactly five arrays:

```json
{
  "definedAndUsed": [],
  "definedUnconfirmedUnused": [],
  "usedUndefined": [],
  "hardcodedSecrets": [],
  "exposureRisks": []
}
```

The arrays are compared as sorted sets. `.env.schema.json` has a top-level
`variables` object. The scorer deep-matches only preregistered rule subsets, so
safe descriptions and other metadata may be added.

## Deterministic Evaluation

Every task uses the same six criteria:

| Criterion | Weight | Check | Hard gate |
|---|---:|---|---|
| `env-protected-files` | 0.20 | Exact UTF-8 fixture equality. | Yes |
| `env-no-secret-leak` | 0.20 | Secret scan over final output, artifact paths, regular-file contents, and Windows NTFS streams. | Yes |
| `env-required-artifacts` | 0.15 | Required files exist; JSON artifacts parse. | Yes |
| `env-classification` | 0.20 | Exact five-field report sets. | No |
| `env-example-safety` | 0.15 | Required names exist and fake values are absent. | No |
| `env-schema-rules` | 0.10 | Required variable-rule subsets match. | No |

The weighted pass threshold is `0.85`. All three hard gates must pass even when
the weighted score reaches the threshold. No `llm-judge` or wording matcher is
used.

Invalid evaluator payloads, unavailable workdirs, unsafe declared paths,
filesystem faults, or Windows stream-enumeration failures are infrastructure
failures. Missing, malformed, changed, leaked, or incorrectly classified agent
artifacts are semantic failures. Scored summaries retain criterion ids and
scores but omit payloads, expected values, raw diagnostics, and fake secrets.

## Filesystem And Secret Safety

Declared paths must be non-empty relative paths without absolute roots, drive
prefixes, `.` segments, or `..` segments. Existing targets and ancestors are
resolved through real paths and must remain inside the real workdir.

Recursive scanning follows contained symlink targets, prevents directory
cycles, and skips targets outside the workdir. A declared path that resolves
outside the workdir is an infrastructure error. Secret matching includes file
and directory names, so moving a value from file content into artifact metadata
does not bypass the hard gate.

On Windows, a bounded hidden PowerShell process uses Win32
`FindFirstStreamW`/`FindNextStreamW` to enumerate streams on the workdir root,
directories, and files. Paths and fake-secret values are sent as UTF-8 JSON on
stdin, not command arguments. Benign streams such as `Zone.Identifier` pass;
only a stream name or content containing a configured fake secret fails.
Regular files and stream contents are matched as raw UTF-8, UTF-16LE, and
UTF-16BE byte sequences. The child is terminated after ten seconds and any
enumeration fault is reported without raw path or secret text.

On Linux and macOS, regular files, paths, and contained symlink aliases are
scanned. Extended attributes are not currently inspected; cross-OS execution
remains a planned experiment axis rather than a current claim.

## Runtime Path

The current static development vertical uses normal runnable scheduling:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--skills=env-manager' '--systems=no-skill,original,ir-static' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--model-family=gpt' '--adapter=bare-agent' '--adapter-version=workspace-static-v1' '--panel-config-id=env-manager-static-v1' '--limit=6' '--out-dir=results/skill-ir/env-manager-static-v1-2026-07-15'
```

The dry run produces 12 rows. Add `--execute` and
`--require-env=SKVM_XTY_API_KEY` only after the route probe passes. Score the
result through normal pilot scoring:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--corpus=pilot' '--raw=results/skill-ir/env-manager-static-v1-2026-07-15/raw-runs.jsonl' '--out=results/skill-ir/env-manager-static-v1-2026-07-15/scored-results.jsonl'
```

The static lock freezes the exact development task selection. Do not add held-out
tasks, profile systems, or an IR override to this command.

`env-manager-vertical-lock.json` preserves the completed pre-IR baseline
calibration. `env-manager-static-lock.json` separately binds the source and
base-IR digests, model route, adapter/version, task ids, repetitions, host label,
and panel/config id. Locks store only the API-key environment-variable name,
never a credential. The intended vertical continues as:

```text
no-skill | original development calibration
  -> audited base IR
  -> ir-static
  -> paired original/ir-static development residual feedback
  -> provenance-bound Final IR
  -> frozen ir-pgo-dev gate
  -> held-out ir-pgo only after the gate passes
```

The first single-model vertical is engineering calibration. It does not enter
the pooled main claim. A later panel-conditioned Final IR may use only balanced,
preregistered development evidence and must be evaluated unchanged on held-out
tasks.

The static and dual-source results show that workflow/safety extraction plus
additional prompt-visible rules are still insufficient for stable execution.
The next version should solidify an executable output validator or template,
enforce preflight/post-generation checks, and preserve the task-visible output
contract without consuming scorer gold. Detailed results and commands are in
`env-manager-dual-source-overlay.md`.

## Verification

Run the evaluator and integration tests:

```powershell
bun test ./src/bench/evaluators/env-manager-grade.test.ts ./src/benchmarks/skill-ir/env-manager-pilot.test.ts
```

Verify base-IR integrity and runnable corpus registration:

```powershell
bun test ./src/skill-ir/corpus-fixtures.test.ts ./src/benchmarks/skill-ir/matrix.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Modification Notes

- Keep evaluator expectations outside prompts and workdirs.
- Update fixture content, protected-file payloads, secret values/allowlists,
  expected reports, examples, and schema subsets together.
- Preserve the development/held-out boundary when changing task difficulty.
- Add a regression test before changing any hard-gate behavior.
- Do not edit the frozen base IR after a lock-bound execution; make dynamic
  repairs through a provenance-bound overlay and Final IR.
- Do not broaden `--allow-tasks-authored`; it is a pre-IR baseline calibration
  gate, not a generic corpus-status override.
