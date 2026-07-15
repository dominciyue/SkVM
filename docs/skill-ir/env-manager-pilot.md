# Env Manager Real-Skill Pilot

## Purpose And Current State

`env-manager` is the first vertical real-skill pilot. Its upstream `SKILL.md`
comes from the pinned, MIT-licensed `env-manager` source in
`laolaoshiren/claude-code-skills-zh`. The pilot currently provides source-backed
development/held-out tasks and deterministic scoring, but no base IR.

The corpus status remains deliberately:

```text
tasks-authored
```

There is no `irPath`, so ordinary `--corpus=pilot` scheduling still has zero
runnable skills. A restricted `--allow-tasks-authored` mode now supports only
the preregistered pre-IR `no-skill | original` development calibration. It
synthesizes an in-memory exact-source envelope and does not change corpus
status, write an IR, or permit static/PGO systems. The first paid baseline
calibration is recorded in `docs/skill-ir/env-manager-calibration-v1-run.md`.
It found no successful rows for either baseline and a lower mean deterministic
score for `original`; this is calibration evidence, not IR optimization effect.

## Files

```text
benchmarks/skill-ir/pilots/env-manager/source/SKILL.md
benchmarks/skill-ir/pilots/env-manager/tasks.json
benchmarks/skill-ir/pilots/env-manager/env-manager-vertical-lock.json
benchmarks/skill-ir/corpus/corpora/pilot.json
src/bench/evaluators/env-manager-grade.ts
src/bench/evaluators/env-manager-grade.test.ts
src/benchmarks/skill-ir/env-manager-pilot.test.ts
src/skill-ir/corpus-fixtures.test.ts
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

The task fixture is schedulable before base-IR construction only through this
fail-closed command shape:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--allow-tasks-authored' '--skills=env-manager' '--systems=no-skill,original' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--adapter-version=workspace-calibration-v1' '--panel-config-id=env-manager-calibration-v1' '--limit=4' '--out-dir=results/skill-ir/env-manager-calibration-v1'
```

The dry run produces eight rows. Add `--execute` and
`--require-env=SKVM_XTY_API_KEY` only after the route probe passes. Score the
result with the same opt-in:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--corpus=pilot' '--allow-tasks-authored' '--raw=results/skill-ir/env-manager-calibration-v1/raw-runs.jsonl' '--out=results/skill-ir/env-manager-calibration-v1/scored-results.jsonl'
```

The runner rejects held-out tasks, non-clean context, any system other than the
complete baseline pair, multiple/missing skills, IR overrides, and limits that
cut a pair in half. The scorer loads only development tasks from
`tasks-authored` entries.

`env-manager-vertical-lock.json` preregisters the model route, adapter/version,
task ids, repetitions, host label, and panel/config id. It stores only the API
key environment-variable name, never a credential. After an audited base IR is
committed, the intended vertical continues as:

```text
no-skill | original development calibration
  -> audited base IR
  -> ir-static
  -> original x development feedback
  -> provenance-bound Final IR
  -> held-out ir-pgo
```

The first single-model vertical is engineering calibration. It does not enter
the pooled main claim. A later panel-conditioned Final IR may use only balanced,
preregistered development evidence and must be evaluated unchanged on held-out
tasks.

The V1 baseline calibration passed runner/scorer integrity checks but showed
that the original public skill is not an upper baseline on the locked GPT
route. Base IR construction must target correctness and regression against
`no-skill` without rewriting scorer expectations from observed outputs.

## Verification

Run the evaluator and integration tests:

```powershell
bun test ./src/bench/evaluators/env-manager-grade.test.ts ./src/benchmarks/skill-ir/env-manager-pilot.test.ts
```

Verify corpus registration remains non-runnable:

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
- Do not mark the pilot `runnable` until source, task, base IR, scorer, and
  no-skill suitability audits all pass.
- Do not broaden `--allow-tasks-authored`; it is a pre-IR baseline calibration
  gate, not a generic corpus-status override.
