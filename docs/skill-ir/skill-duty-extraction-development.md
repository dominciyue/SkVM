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
  The provider's internal retries cannot issue a second physical request for a member:
  transport records a consumed member before sending and rejects subsequent attempts.
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

## Actual first measurement

Execution0900958:3physical attempts,1HTTP response and2no-response failures. Lambda and
Pactflow failed after approximately242seconds each; original transport diagnostics and
single-attempt stop remain in attempts.jsonl/report.json. Remote completion and charging
for those requests are unknown. Jeremy returned in178749ms:16duties/53obligations,
all quotes/locators valid,2790input/5297output tokens. Provider returned no actual billing.
No output was retried or repaired; the response and full prompt are archived unchanged.

Agent semantic review maps the seven earlier broad duties to the draft, but this is not
human agreement or a gold completeness score. It identifies missing authentication-status
conflict (source prose403 versus example401), omitted host/tool metadata and a boundary
around source guidance to change schemas. The draft is useful, not an automatically
approved task contract. Old source classifications and benchmark results remain unchanged.

Before execution, initial safety review denied the transfer. Eight public source files
were verified via unauthenticated GitHub reads with exact matching SHA; the same command
was re-reviewed and allowed. public-source-proof.json records those8reads, not new samples.
Developer agent charges remain separate/unmeasured. summary.json independently rechecks
source/prompt/response bindings and reports known usage, not a fabricated all-call total.

Offline revalidation (no model calls):

```powershell
bun results/skill-ir/skill-duty-extraction-development-20260911/summarize.ts --out=results/skill-ir/duty-extraction-recheck.json
```

The remote runner command in the plan is not an offline reproduction command. Do not
rerun it just to obtain a successful draft; use first-run evidence for this measurement.
