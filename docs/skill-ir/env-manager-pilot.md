# Env Manager Real-Skill Pilot

## Purpose And Current State

`env-manager` is the first vertical real-skill pilot. Its upstream `SKILL.md`
comes from the pinned, MIT-licensed `env-manager` source in
`laolaoshiren/claude-code-skills-zh`. The pilot currently provides source-backed
development/held-out tasks and deterministic scoring, but no base IR.

The corpus status is deliberately:

```text
tasks-authored
```

There is no `irPath`, so `--corpus=pilot` still has zero runnable skills. This
prevents task authoring from being mistaken for an optimized-skill result. No
paid model execution or optimization-effect evidence was produced in this
stage.

## Files

```text
benchmarks/skill-ir/pilots/env-manager/source/SKILL.md
benchmarks/skill-ir/pilots/env-manager/tasks.json
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

The task fixture is not yet schedulable through the pilot corpus. After an
audited base IR is committed, the intended vertical is:

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
