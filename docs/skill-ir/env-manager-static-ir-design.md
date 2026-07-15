# Env Manager Static IR Design

## Scope

This stage constructs the first source-audited base IR for the real-public
`env-manager` pilot and measures its cold static contribution. It does not use
development outcomes to change the IR, compile a profile overlay, execute
held-out tasks, or claim that a Final IR has been produced.

The experiment compares:

```text
no-skill | exact original | ir-static
```

on the two frozen development tasks, with the same model, context, repetitions,
fixtures, and deterministic scorer used by the pre-IR calibration.

## Static Construction Boundary

Every base-IR semantic item must be classified as one of:

- **source-explicit**: directly stated by the pinned upstream `SKILL.md`;
- **static-clarification**: a task-independent operational clarification needed
  to make an explicit source instruction executable;
- **schema-plumbing**: identifiers, references, or checks that encode the first
  two classes without adding task answers.

Development outputs, hidden evaluator payloads, expected variable names,
synthetic secret values, held-out fixture details, and calibration failures are
forbidden inputs. Dynamic evidence remains reserved for later Final-IR/PGO
construction.

## Lowering Requirement

The current schema carries inputs, outputs, preconditions, tool requirements,
and environment assumptions. Static lowering must render these fields into the
agent-facing `SKILL.md`; otherwise they are inert metadata and cannot contribute
to behavior. The renderer will expose concise sections for all five semantic
views while preserving exact source text for the `original` system.

## Base IR Contract

The base IR will:

- reference the exact pinned source path and SHA-256 digest;
- keep `profile` empty;
- encode discovery, inventory, code-reference analysis, classification, schema
  inference, artifact writing, and verification as an ordered workflow;
- preserve the source safety rules around secret values and real `.env` files;
- represent cross-platform and framework exposure assumptions without assuming
  a task-specific directory or variable set;
- define generic checks and bounded recovery policies;
- avoid executable commands that require Unix-only utilities.

A field-level source audit will map each substantive item to the upstream
section and construction class.

## Corpus State Transition

After schema validation, source-digest verification, leakage checks, and source
audit pass, `env-manager` moves from `tasks-authored` to `runnable` and gains an
`irPath`. The restricted `--allow-tasks-authored` path remains available only
for future pre-IR pilots; normal pilot scheduling then selects `env-manager`.

## Experiment Lock And Interpretation

A new immutable `env-manager-static-lock.json` preregisters the base-IR digest,
route, adapter version, systems, development task ids, clean context, Windows
host label, repetitions, and prohibitions before paid execution.

The run answers whether static extraction and lowering improve deterministic
task success, criterion score, hard gates, token use, or latency relative to
both baselines. A regression is retained and reported. Results cannot justify
PGO, cross-model, cross-context, cross-OS, or held-out claims.
