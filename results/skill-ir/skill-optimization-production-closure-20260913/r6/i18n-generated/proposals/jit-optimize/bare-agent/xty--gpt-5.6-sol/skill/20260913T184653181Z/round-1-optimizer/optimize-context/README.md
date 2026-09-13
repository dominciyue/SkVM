# JIT-Optimize Workspace

Your current directory is a **complete copy of a skill folder**. You may freely
edit any file — SKILL.md, scripts, references, etc. — using your normal tools
(read, edit, write, glob, grep, bash). Your edits become the "optimized" version
of this skill.

## Where to find context

- `.optimize/PER_TASK_SUMMARY.md` — **READ THIS FIRST.** One row per task
  with status (FAILING / MARGINAL / PASSING / TAINTED), mean score, and
  where to find its evidence. This is the landscape you're working against.
  Counts right now: 0 FAILING, 0 MARGINAL, 0 PASSING, 1 UNASSESSED, 0 TAINTED across 1 task(s) / 1 run(s).
- `.optimize/tasks/<safeTaskId>/` — per-task directories. Each contains:
  - `summary.md` — the task's aggregate status and a per-run breakdown.
  - `run-N.md` — the full evidence for run N (conversation, criteria,
    run metadata). Files for multiple runs of the same task live in the
    same directory, so you can tell "task A failed twice the same way"
    apart from "two different tasks failed once each".
  - `run-N.json` — the same evidence in structured form.
  - `run-N-task-fixtures/` — original pre-run inputs from the trace-bound
    task file (when present and safely materialized). The adjacent
    `run-N-task-fixtures-manifest.json` binds their hashes and completeness;
    these files are not evaluator expectations or observed outputs.
  - `run-N-workdir/` — files the agent left in its work directory (if recorded).

  Directories for this session:
  - `tasks/i18n-helper-v3-react-basic-dev-001-clean/` — task `i18n-helper-v3-react-basic-dev-001-clean` (UNASSESSED, 1 run)
- `.optimize/SKILL_RESOURCE_INDEX.md` — complete configured skill-file navigation plus explicit trace-to-skill bindings. Read relevant resources before deciding an unobserved rule is removable.
- `.optimize/CONSTRAINT_SOURCES.json` — structured provenance buckets for permanent skill rules, current task conditions, observed environment facts, and unknown scope. Do not promote a task or environment value to a skill-wide rule.
- `.optimize/IMPLEMENTATION_CONTEXT.json` — engine-built source interfaces, normalized input/output locators, observed format shapes, and available checks for executable work. It is an index, not a claim that untested parameters are supported.
- `.optimize/submission.template.json` — the output format you must follow.

## What to do

1. Read `PER_TASK_SUMMARY.md`. Identify FAILING/MARGINAL defects, UNASSESSED
   trace facts, and PASSING evidence. Passing work must not regress, but it may
   still reveal repeated transformations or avoidable verification work.
2. Read the relevant `tasks/<safeTaskId>/summary.md` and `run-N.md` files
   in that order: failing first, marginal next, unassessed next, passing last.
   Read each External Trace Binding before deciding what the record can prove.
3. Read the relevant parts of this skill folder (SKILL.md is the entry point).
4. Edit files in this workspace to fix the root cause.
5. When done, write `.optimize/submission.json` with your structured summary
   (see `submission.template.json`).

## Rules

- **Task-content-agnostic**: the skill is used for MANY different tasks. Do
  NOT hard-code specific values, file names, or examples from the evidence
  into the skill. Fixes must generalize.
- **No task trade-off**: a fix that improves a FAILING task by regressing a
  PASSING task is NOT an improvement. The selection engine's per-task gate
  will reject the round. Before each edit, check `PER_TASK_SUMMARY.md` and
  ask "could this plausibly lower any PASSING task's score?" If yes, stop.
- **Preserve scope**: do not narrow the skill's capabilities to "just pass
  these tasks". You are fixing a tool, not overfitting to a test set.
- **Keep it concise**: every instruction the agent reads costs tokens and
  attention. Prefer trimming to adding.
- **Diagnose before prescribing**: the `rootCause` field in your submission
  is the *underlying problem you identified*, not a list of what you changed.
  Example of a bad rootCause: "Added a guardrail for empty input."
  Example of a good rootCause: "The skill tells the agent to call validate()
  but doesn't say what to do when validate() returns null, so the agent
  guessed wrong 5/5 times."

## If the skill is fine

If the evidence shows the skill is already working and no changes would help,
write `{"noChanges": true}` to submission.json and don't edit anything.

## If the evidence is infra-broken

Each `run-N.md` has a **Run Metadata** block whose first line is
`runStatus: <value>`. When that value is anything other than `ok` (e.g.
`timeout`, `adapter-crashed`, `parse-failed`, `tainted`), the run did not
execute normally: the agent subprocess was killed, crashed, or produced
unparseable output. The evaluator was NOT run against those runs — any
criteria you see on them are stubs carrying `infraError`, not real
evaluations.

If at least one run has `runStatus !== 'ok'` AND the remaining clean
evidence (if any) is insufficient to support a skill-level root cause, write:

```json
{
  "infraBlocked": true,
  "blockedEvidenceIds": ["0", "2"],
  "blockedReason": "Runs with Evidence Index 0 and 2 both show runStatus=timeout with tokens=0; no LLM output was produced. The remaining clean runs are insufficient for a skill-level diagnosis."
}
```

`blockedEvidenceIds` uses the **Evidence Indices** column in
`PER_TASK_SUMMARY.md` — the flat 0..N-1 numbering, independent of the
per-task directory layout.

`infraBlocked` and `noChanges` are mutually exclusive. `noChanges` says
"the skill is fine"; `infraBlocked` says "I cannot judge the skill from this
evidence." Pick the one that matches what you actually observed. Do not edit
any files when submitting `infraBlocked`.
