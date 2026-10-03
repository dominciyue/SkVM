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

  - `run-N-pre-run-inputs/` — digest-bound bytes captured from the real
    workdir before the source run. The adjacent
    `run-N-pre-run-inputs-manifest.json` records captured and omitted entries;
    this namespace is distinct from task fixtures and observed outputs.

  Directories for this session:
  - `tasks/natural-ca095aca27e7/` — task `natural-ca095aca27e7` (UNASSESSED, 1 run)
- `.optimize/SKILL_RESOURCE_INDEX.md` — complete configured skill-file navigation plus explicit trace-to-skill bindings. Read relevant resources before deciding an unobserved rule is removable.
- `.optimize/CONSTRAINT_SOURCES.json` — structured provenance buckets for permanent skill rules, current task conditions, observed environment facts, and unknown scope. Do not promote a task or environment value to a skill-wide rule.
- `.optimize/IMPLEMENTATION_CONTEXT.json` — engine-built source interfaces, normalized input/output locators, observed format shapes, actual operation records, and available checks for executable work. Operation records come only from real tool calls; prose mentions and ambiguous commands remain non-authoritative.
  Its `workflowScaffolds` are optional ordinary-script plumbing, including explicitly missing model processor slots. Use their evidenceIndex and operationIds to inspect the source-supported boundary; implement and validate the processor before treating a scaffold as usable. The optimizer prompt describes adoption and contribution accounting.
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

## Candidate attempt versus recommendation

The workspace diff and action list describe a **candidate attempt**. A
**recommendation** is only justified after the engine can run the declared
checks and preserve the residual duties; a high quality score or an agent's
self-check is not enough by itself. A missing score is evidence-thin, not a
failure and not a reason to skip the optimizer.

An opportunity may be useful even when the source task passed. Consider
bounded reductions in repeated file I/O, tool discovery, or transformations,
existing-script reuse, parameterized processing, and deterministic checks.
For a localizable example, a source rule plus locale files can establish a
local key-set/placeholder boundary without claiming to automate translation
quality. Do not dismiss that opportunity solely because there was no defect,
the whole skill is broader, or a regression is conceivable.

Each opportunity summary should compactly state the delegated steps, variable
parameters, required resources, check source, and the specific reason for its
`implemented`, `retained`, or `not-applicable` disposition. Put duties that
remain with the agent in `residualDuty`. If an opportunity is marked
`implemented`, the submission must also name a corresponding changed file,
change summary, or valid action; otherwise the engine records an explicit
diagnostic and does not treat the round as no-change.

## Rules

- **Task-content-agnostic**: the skill is used for MANY different tasks. Do
  NOT hard-code specific values, file names, or examples from the evidence
  into the skill. Fixes must generalize.
- **No task trade-off**: a fix that improves a FAILING task by regressing a
  PASSING task is NOT an improvement. The selection engine's per-task gate
  will reject the round. Before each edit, check the concrete affected contract
  in `PER_TASK_SUMMARY.md`. Narrow and validate uncertain local changes;
  stop only when no supported scope avoids the actual trade-off.
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
