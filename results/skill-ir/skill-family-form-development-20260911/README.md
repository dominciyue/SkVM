# Bounded form development, 2026-09-11

Implementation c78fd85. Same exposed 12 documents /303 operations; no new real
samples, project remote/model/paid calls, credentials or status guesses.

- New explicit profile: 578/628 specimens,50unresolved,24presence negatives,
  2incomplete inventories. Two new full form bodies in Visier authentication.
  Its two minimal empty-object bodies remain unresolved; no complete-document gain.
- `comparison.json`: all12 old JSON-only reports exactly unchanged; all non-form
  content unchanged in the new profile; independent checker passes each report.
- `cross-member/`: original Lambda/Jeremy/Pactflow mappings each run Visier
  authentication and1Password partnership. Six tasks,13/15 specimens per member;
  `integration-comparison.json` checks each full artifact against the panel. This
  is source-duty reuse, not six independent inputs or native-output completion.
- `tests.json`: preserved missing-module/export and profile-rejection REDs, then
  36tests/262assertions GREEN. Main and explicit script typecheck exit0 in
  `run-evidence.json`. Codec rejects malformed/lossy/duplicate decoded fields;
  equivalent ordering/hex-case/space encodings pass. Source and residual checks persist.
- Latest previous clean proof binds be89a50, not c78fd85. No clean claim for this
  revision yet. Developer-agent charges remain separate and unmeasured.

From repository root with pinned dependencies and Bun1.3.14/Node23.8.0, choose NEW
output paths (never overwrite archived evidence):

```powershell
bun scripts/skill-ir/api-request-specimens-development.ts --profile=form-specimens --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/local-form-repro
bun scripts/skill-ir/skill-family-baseline.ts --config=results/skill-ir/skill-family-form-development-20260911/cross-member-config.json --out=results/skill-ir/local-form-integration
bun test ./src/skill-ir/api-form-wire.test.ts ./src/skill-ir/api-request-form-specimens.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

`compare.ts <new-comparison.json>` and `verify-integration.ts <new-comparison.json>`
recheck this archive's fixed artifact locations, not the arbitrary output paths above.
The source-bound batch, reports and scripts retain failed/unresolved/advisory rows;
oldv2/0of6/readiness and source histories are untouched.
