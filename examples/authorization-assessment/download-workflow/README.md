# Download: input → source program → execution → result

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
```

This uses `gpt-5.6-sol/high`, the reviewed account boundary, `consume` mode and
`progressive` policy. On another machine, pass `-AccountBoundary` with that
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
