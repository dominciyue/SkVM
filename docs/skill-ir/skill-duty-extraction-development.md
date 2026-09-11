# Source-grounded duty extraction measurement (development)

## Decision and scope

D6 currently measures execution after an agent-authored mapping. Historical extraction
tokens/time/cost were not instrumented; they remain unmeasured. Add a new, prospective
measurement on the three already exposed original members: Lambda, Jeremy and Pactflow,
using every archived skill/resource file, excluding license prose from extraction.
This is development, not unseen-member validation and not retroactive cost recovery.

Chosen approach: one model draft per member with explicit source-file/line/quote evidence,
followed by deterministic structural/locator validation and a separate agent semantic
review against the full original duties. Reject automatic approval: matching quotations
do not prove completeness or correct interpretation. Reject keyword-only extraction:
it cannot faithfully separate composite responsibilities. No model response is executed,
used as a command, or automatically fed into the construction mapping.

## Contract

Input files are individually bound by SHA256 and decoded strictly as UTF-8. Prompt includes
complete numbered text, not existing responsibility annotations or current support tables.
One primary body is required; file IDs unique; total text limited to200000UTF-8bytes,
with explicit pre-call failure instead of silent truncation. Sources remain untrusted data.

Draft JSON: schemaVersion `skill-duty-draft/v1`; responsibilities (1–40) with unique ID,
description, evidence (fileId/startLine/endLine/quote) and obligations (1–40), each with its
own text and evidence; unresolved string list. Evidence spans are inclusive1-based lines,
nonempty exact quotes must occur within those lines. Unknown files, duplicate IDs, invalid
spans and invented quotes fail. A missing resource cannot be called read or complete.
Structural status is `grounded-draft` or `invalid-draft`, always semanticReviewRequired=true
and automaticMappingApproved=false. These labels do not prove semantic grounding.

## File-level plan

- [ ] `src/skill-ir/skill-duty-extraction.test.ts`: failing tests for valid draft, changed
  quote, wrong source digest, duplicate responsibility, line bounds, missing resource,
  strict UTF-8 and prompt exclusion of any existing responsibility answer.
- [ ] `src/skill-ir/skill-duty-extraction.ts`: implement `buildDutyExtractionPrompt(files)`
  and `validateDutyDraft(files, answer)`, using strict Zod structure plus original text
  locator checks. Files have `{id, bytes:Buffer, sha256, kind:"skill"|"resource"}`.
- [ ] `scripts/skill-ir/skill-duty-extraction.ts`: reuse configured provider/transport;
  select lambda/jeremy/pactflow from original source bindings, one call each, no semantic
  repair retry. Archive prompt/raw response/start and completion records before advancing.
  Record preparation/model/validation durations, tokens, attempts and available actual
  billing. Unknown charges remain null; developer agent costs separate. Per-member failure
  does not drop later members. `--out=<new-dir> --model=xty/gpt-5.6-sol`.
- [ ] Run focused tests and main/explicit script typechecks, commit implementation before
  paid calls. Run three drafts once; preserve failures, do not replace bad output with a
  preferred retry. Read actual drafts and compare omissions/overclaims with source duties.
- [ ] Archive semantic review, update D6/current state and commit/push. Report extraction
  quality separately from later deterministic execution; no human agreement/savings claim.

## Verification and recovery

`bun test ./src/skill-ir/skill-duty-extraction.test.ts` then
`node node_modules/typescript/bin/tsc --noEmit`. Remote runner is explicit; offline validator
tests make no model calls. Inspect persisted attempts before resuming interrupted runs;
an incomplete request is unknown, never silently repeated. Original D6 and D7 reports are
unchanged. New draft omission is a measured extraction limitation, not automatic evidence
that the reference classification or source itself is wrong.
