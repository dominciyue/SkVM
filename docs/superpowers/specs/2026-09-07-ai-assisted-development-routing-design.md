# AI-assisted development routing and prospective construction design

Date: 2026-09-07

## Decision

Engineering migration may use the two existing revision-2 AI annotation drafts as development input, but it must not treat them as independent human annotations or as completion of the original Q1 experiment.

The new development path therefore has its own identities and evidence chain:

1. `skill-ir-ai-assisted-development-routing-001` consolidates the two preserved AI drafts into one 24-unit routing table with row-level provenance, repair history, and unresolved information needs.
2. `skill-ir-api-tester-constructor-candidate-001` freezes the current API Tester constructor, generator, checker, support surface, and rejection surface without modifying the historical Q2 profile.
3. `skill-ir-api-tester-constructor-prospective-001` freezes exactly eight first-round inputs: four public specifications selected at immutable upstream commits and four synthetic boundary cases.

The prospective input lock and every prediction must be committed and pushed before the candidate is run. The first run is immutable. Any implementation change requires a new candidate identity and new unseen inputs.

## Evidence boundaries

The consolidated routing table is development evidence only. Although the two repaired drafts currently contain identical labels, the same AI repairer saw both drafts and project result summaries. Consequently the table provides neither inter-annotator agreement nor classification accuracy evidence.

The constructor checker covers only the normalized public contract implemented by the current candidate. A checker pass does not establish full OpenAPI validity or semantic equivalence beyond that contract. A rejection means only that the current candidate does not admit the input; it is not a judgment about whether the task is automatable in principle.

Without a real human reviewer, the prospective report records actual human modification as zero observed minutes and makes no human-savings claim. AI analysis effort is reported separately as platform-side `not-measured`; construction and run telemetry remain separate.

## Consolidated routing table

The builder reads, but never rewrites, the external A/B revision-2 drafts and their change records. It fails closed unless:

- both drafts bind the frozen Q1 package;
- both contain exactly the same 24 unique unit IDs;
- every row passes the classification schema;
- the two revision-2 labels and routing predictions match exactly;
- common-repair and non-independence provenance is present.

Each consolidated row stores the final label, evidence, uncertainty, routing prediction, both source records, both revision changes, and named unresolved requirements. The artifact records source paths relative to the shared workspace plus byte SHA-256 digests; it does not turn either draft into an official Q1 submission.

## Candidate capability snapshot

The candidate snapshot binds:

- the historical API Tester Q2 development profile by digest;
- the consolidated routing table by digest;
- the production contract, program generator, deterministic runtime, artifact wrapper, and checker source files by digest;
- all admitted features and stable rejection codes;
- the checker claim boundary;
- the fact that the historical Q2 JSON remains unchanged.

The snapshot describes the implementation that will be tested. It is not an admission result and does not upgrade readiness.

## Prospective sample lock

The first round has a frozen denominator of eight and no replacement:

- four real public OpenAPI documents, selected by a reproducible rule and pinned to upstream commit, repository path, byte count, SHA-256, and license-file digest;
- four synthetic boundary documents, each targeting one named rejection boundary and pinned by repository path and SHA-256.

The four real documents are cached outside the repository. The runner accepts an explicit cache root, verifies every byte digest, and performs no network access. The boundary fixtures live beside the lock.

Every row records one predicted outcome before execution. Predictions are based only on public source inspection and the frozen capability description. The candidate parser must not be run on the real samples before the freeze commit.

## First-run semantics

The runner verifies that the lock bytes match the copy stored at the declared freeze commit and that the freeze commit is an ancestor of `origin/skill-ir-aot`. It then runs all eight rows once, with no retries, replacements, or fixes.

For every row it records:

- source and binding digests;
- prediction and actual outcome;
- exact rejection code or accepted artifact digests;
- checker status for accepted artifacts;
- prediction parity;
- construction duration and run/check duration;
- model, API, and paid call counts, all fixed at zero;
- actual human modification minutes and notes.

Accepted, rejected, checker-failed, and infrastructure-failed rows all remain in the denominator. The report summarizes real-input and boundary strata separately so boundary conformance cannot mask poor real-input admission.

## Non-goals

This work does not:

- complete or rename Q1;
- claim human agreement, classification accuracy, reliability, or human savings;
- modify held-out data, Stage M/N, portfolio, readiness, core, DSL, old locks, or the current constructor implementation;
- rewrite the historical Q2 profile;
- expand the constructor to make the first prospective round positive.
