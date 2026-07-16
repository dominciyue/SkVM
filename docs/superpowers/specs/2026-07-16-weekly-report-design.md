# Weekly Skill IR Report Design

**Status:** Approved and implemented

**Reporting window:** 2026-07-13 through 2026-07-16

## 1. Goal

Produce a complete Chinese weekly-report script that can be delivered directly
to the advisor and senior lab member. The report must show what changed this
week, why each change was necessary, how it was implemented, what the real
experiments found, and which claims remain blocked.

The main talk targets 35-45 minutes. A technical appendix supports at least 15
minutes of follow-up discussion.

## 2. Narrative Structure

Use a hybrid structure:

1. Start from the research correction made on Monday.
2. Organize the work into three technical threads:
   - real-skill evidence and corpus provenance;
   - the `env-manager` vertical from calibration through Final IR;
   - executable artifact v1 and semantic artifact v2.
3. Within each thread, preserve chronology:
   `problem -> design -> implementation -> experiment -> conclusion`.
4. End with an explicit daily timeline, current limitations, next work, and
   discussion questions.

This avoids both a commit-log recital and an architecture description with no
visible weekly progress.

## 3. Deliverable Layout

The final Markdown report contains:

1. Pre-meeting setup checklist.
2. Minute-by-minute live presentation script.
3. Exact screen action for each step: folder, file, section, and result table.
4. Suggested spoken wording in natural Chinese.
5. A statement of what each opened artifact proves.
6. Selected commands with:
   - working directory;
   - prerequisites and environment variables;
   - exact PowerShell command;
   - expected output;
   - interpretation;
   - fallback when live execution is unsuitable.
7. Complete technical implementation summary.
8. Experiment table and claim boundary.
9. Advisor-question preparation.
10. Next-week plan and decisions requiring discussion.
11. Appendix with commit chronology, directory map, and command index.

## 4. Required Evidence

Every substantive claim must be traceable to one of:

- Git commits from 2026-07-13 through 2026-07-16;
- `D:\skill优化\conversation_log.md`;
- canonical spec and plan;
- component documentation under `docs/skill-ir/`;
- committed benchmark corpus/package files;
- committed scored results and analysis summaries.

The report distinguishes:

- implemented engineering mechanism;
- deterministic local activation;
- real-model development evidence;
- held-out evidence;
- future research target.

No failed development candidate may be called an optimized Final IR. Synthetic
seed evidence remains low-weight calibration evidence. V2 repair activation is
real, but its development gate failed and held-out was not executed.

## 5. Command Policy

Commands are included only when they materially support the report. The core
set is:

- repository status and recent commits;
- package verify-only;
- focused Skill IR tests and typecheck;
- dry-run planning command;
- result analyzer command;
- optional route probe command, marked as an API-cost/network operation;
- no paid experiment rerun during the report.

The report must never print or persist the API key. It refers only to
`SKVM_XTY_API_KEY` and explains how to set it securely when a real run is
deliberately required.

## 6. Presentation Flow

The live flow starts with GitHub Desktop and the `skill-ir-aot` branch, then
uses the editor and terminal:

```text
canonical spec/plan
  -> real-skill intake and pilot corpus
  -> env-manager source/tasks/scorer
  -> base IR and static result
  -> dual-source Final IR failure evidence
  -> executable artifact v1 package/runtime/result
  -> semantic artifact v2 package/runtime/result
  -> comparison summary and held-out block
  -> next-step plan
```

Large generated bundles are shown by directory/manifest, not opened in full.
Raw rows and workdirs stay local; committed scored rows and summaries are the
primary report evidence.

## 7. Quality Checks

Before delivery:

- verify date range and commit count;
- verify every numerical result against committed JSON/CSV;
- verify every file path and command exists;
- scan for API-key-like strings;
- ensure command instructions are PowerShell-compatible;
- remove unsupported cross-model, cross-agent, cross-OS, held-out, and token
  savings claims;
- ensure the script works even when no live command is run;
- append the completed reporting stage to the conversation log.

## 8. Non-Goals

- No slide deck or `.pptx` in this stage.
- No new model calls or benchmark reruns.
- No change to package, scorer, lock, or experiment result.
- No attempt to hide failed gates or upstream Windows test failures.
