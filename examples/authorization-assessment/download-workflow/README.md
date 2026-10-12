# Download: input → source program → execution → result

## BI model-authored original

The current automatic artifact is
`results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/authoring/automatic-program.json`.
It is A2's adopted raw proposal, frozen before C1/C2 without developer semantic
edits. Run that exact file from the repository root:

```powershell
./examples/authorization-assessment/download-workflow/run.ps1 -ProgramFile ./results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/authoring/automatic-program.json
./examples/authorization-assessment/download-workflow/run.ps1 -Variant empty-version -ProgramFile ./results/skill-ir/skill-dsl-research/development/authorization-authoring-closure-v1/authoring/automatic-program.json
```

Both zero-model runs are conditional and return no file descriptor. The program
binds to `authorization-and-selection-order`; the supplied finite inputs belong
to `requested-document-and-returned-file`, so its actual input map is empty and
all twelve events remain unresolved. Its source expressions also leave explicit
and empty-version selection, owner-aware permission behavior and missing-root
fallback incomplete. These are visible in the printed `execution.md` and
`execution.json`; all four original duties remain in the archive. Natural
explanations of these branches do not establish automatic computation.

Add `-Mode account` to consume this same file with the original skill and four
questions. `-Previous <saved-session-directory>` restores eligible evidence and
recomputes current inputs; it does not reuse the prior natural answer. Use
`-Mode author -Previous <saved-author-session-directory>` to continue that
session's own raw draft without supplying a reference program.

## Developer reference

The supplied development scenario asks for document 10 as actor 7. Document 10 is
the root; document 11 is its newest visible version with an archive. Document 12
has a higher version index but is deleted. The source program computes:

`request 10 → root 10 → owner check on 10 → version 11 → v1-archive.pdf`

Change only `version: null` to `version: ""`: the source now supplies
`include_deleted=true` to version selection, so the result becomes document 12's
original file. Request lookup and version lookup use their own arguments.

These are conditional descriptors from a read-only finite source summary. They
do not execute Paperless, query a database, contact Guardian, or prove real request
authentication, global permission, storage access, filename formatting or HTTP
delivery. The fixture supplies a complete finite document population and explicitly
assumes normal permission-checker construction. Source meanings remain reviewable;
the host's execution does not certify them.

From the repository root, run the zero-model example (Bun dependencies installed):

```powershell
./examples/authorization-assessment/download-workflow/run.ps1
./examples/authorization-assessment/download-workflow/run.ps1 -Variant empty-version
```

The command prints the new session path and its `execution.md`. That file is
rendered from actual events, including skipped steps, current inputs, source lines,
conditions and gaps. `execution.json` retains the machine-readable form. Inspect
the printed output directory through the same ordinary CLI:

```powershell
bun src/index.ts authorization inquiry inspect --out=<printed-session-directory>
```

To run the original complete skill and four questions using the official account:

```powershell
./examples/authorization-assessment/download-workflow/run.ps1 -Mode account
./examples/authorization-assessment/download-workflow/run.ps1 -Mode account -ProgramContext compact
```

This uses `gpt-5.6-sol/high`, the reviewed account boundary, `consume` mode and
`progressive` policy and full context by default, matching the ordinary CLI.
Compact is an explicit option. It keeps the current result, guards,
sources and gaps; `authorization_program_details` retrieves exact steps or the
full program/trace on request. Complete raw objects remain in the session.
On another machine, pass `-AccountBoundary` with that
machine's reviewed generic-instruction boundary; do not copy an unverified pin.
The account CLI must be a reviewed supported version. The original answer and
usage are in `report.json`; proposed model edits stay separate from the active
program. A failure must be inspected before any resend.

`program.json` is the developer-authored program. Its 25 source-bound steps cover
request/root fallback, root authorization, independent version selection and
original/archive choice. `inputs/` also contains denial, unknown actor and root
fallback examples. The four natural questions are unchanged.

The source is the existing allowed Paperless snapshot at ref
`126ec414a8b65158368653a2604ae58415e43103`, under
`results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/packages/download/source`.
Inputs use repository-relative paths, so moving the whole checkout works without
rewriting them. To move this example alone, copy that snapshot directory and use
the ordinary `authorization inquiry init --from=<input> --out=<new-input>
--source-root=<copied-source>` command to rebase the path. Never substitute a
different revision silently.

Actual BG results and independent review are in
`results/skill-ir/skill-dsl-research/development/authorization-practical-execution-v1/summary.json`.
Automatic authoring is a separate partial result; this hand-authored example must
not be counted as its success or as evidence of general cost savings.

To author from the same complete skill, original four questions and scenario,
without sending the developer program, use `./examples/authorization-assessment/download-workflow/run.ps1 -Mode author`.
The model can submit `authorization_program`, then patch named steps with
`authorization_program_patch` and the exact current `baseRevision`. Missing workflow
fields preserve a same-identity draft. Invalid updates retain a distinct candidate
preview; they do not replace an existing active result. Inspect both before reuse.
To insert a guard or computed value before an existing return, supply `stepOrder`
containing every merged step ID exactly once. Without it, replacements keep their
position and new steps append; unreachable steps are diagnosed, never moved by the
host. `authorization_program_details` can bind `expectedRevision` to the selected
active/draft view. Edit mode retains all original authoring duties even when a
partial program computes values. New `execution.json` archives retain raw draft,
candidate preview, adopted original and remaining duties separately; old sessions
remain inspectable.
BH's actual author/consumer results are recorded under
`results/skill-ir/skill-dsl-research/development/authorization-incremental-program-v1/`.
