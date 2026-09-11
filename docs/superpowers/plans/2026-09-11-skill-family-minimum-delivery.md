# Skill Family Minimum Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans) to execute this plan.

**Goal:** Close the smallest defensible class-level engineering result for the family `api-contract-driven-offline-test-construction`: a source-grounded, independently checked construction slice shared by at least three independent development skills and evaluated once on at least three new same-family skills selected after the method is frozen.

**Architecture:** Keep the existing `skill-loader`, family contract, declarative API mapping, operation-input runners, production bindings, and independent checkers. Add one stage manifest/orchestrator only where the existing pieces cannot be composed. Treat a skill as a member with a class-scoped responsibility slice; keep whole-skill execution, live API correctness, business/status authority, and human-savings claims outside this minimum result.

**Tech Stack:** Bun/TypeScript, the existing JSON contracts and checkers, authenticated GitHub CLI for source acquisition, the existing model client for one-purpose duty drafts, and the current offline clean-checkout workflow. No HTML, web UI, presentation layer, or generic platform work belongs in this stage.

---

## 1. Why This Stage Exists

The D1-D9 evidence is a useful bounded development result, but it does not yet establish a class-level effect. The current record still has four material gaps:

1. the class-scoped responsibility denominator is not closed for a selected member panel;
2. the independence of every development member is not fully established;
3. the previous new-member round mixed first-run failures with later metadata repair;
4. no method-frozen, source-unseen evaluation has been completed.

This plan closes those gaps with one small, auditable panel. It does not expand the class to every API workflow or silently promote the existing operation count into a skill count.

The current D1-D9 results remain immutable evidence. New results use a new directory and a new stage identity. The old `0/6`, Q1, readiness, 001/002, and historical prospective records are not rewritten.

## 2. Minimum Delivery Contract

The claim unit is a **class-scoped responsibility slice**, not the complete behavior of every member skill. The candidate family remains:

> A skill that takes a public API contract and explicit coverage requirements and constructs offline request/test artifacts that can be checked independently against that contract.

An individual skill may also contain native runner, authentication, live-service, business-state, triage, or documentation duties. Those duties are recorded as `outside-class`, `source-blocked`, or `unresolved`; they are never silently counted as automated success.

The minimum delivery is marked `bounded-positive` only when all of these conditions hold:

- at least three development members pass a provenance review: distinct repositories/owners, no known exact copy or fork relationship, and source bodies/resources fixed to a readable commit;
- the class-scoped responsibility denominator is enumerated for every selected development and held-out member, with every duty classified as `constructed`, `rejected-with-reason`, `unresolved`, `outside-class`, or `source-blocked`;
- at least three held-out members are selected after the method lock, from repository-distinct sources, and are run without changing the class contract or the first-run method;
- every held-out member has two or more applicable task inputs, or the missing-input reason is recorded in the denominator and the member is excluded from a positive claim;
- every accepted artifact passes the independent checker, and every checker failure or construction refusal is preserved with its layer and reason;
- at least two of the three held-out members produce a non-empty accepted artifact set without a repository-specific code path;
- the report separates deterministic construction calls, model calls, source/API calls, paid calls, known token usage, unknown billing, and development-agent cost;
- a clean checkout can reproduce the stage report from the locked manifest without reading an unseen source after the run.

If all obligations are classified and all accepted artifacts pass but fewer than two held-out members produce accepted artifacts, the result is `bounded-negative` or `insufficient-evidence`, not a failure of the project. If the source or method lock cannot be maintained, the stage is `blocked-before-evaluation` and the partial evidence is still delivered.

The following claims remain prohibited in this stage: whole-skill automation, all-future-member generalization, live API correctness, business/status correctness, human-minute savings, cross-model stability, or production readiness outside the documented support contract.

## 3. Execution Identity and Protected Boundaries

Start from the actual current HEAD, which must be recorded rather than assumed. Create a dedicated feature branch named `skill-family-minimum-delivery-001` (or continue it if it already exists). Do not merge into `skill-ir-aot` as part of the run. Push only the user `origin` work branch after the stage is complete.

Create one new evidence directory:

```text
results/skill-ir/skill-family-minimum-delivery-20260911/
```

The directory contains the stage manifest, acquisition records, source and duty ledgers, first-run reports, any revised implementation report, and a final machine report. Each file is written once under a revisioned name; a repair never overwrites a first run.

Do not use `git add -A`. Add only the plan, code, tests, manifests, reports, and documentation named by this plan. Historical untracked material remains untouched.

## 4. Work Queue

### M0. Record the baseline and freeze the stage identity

**Purpose:** Make the stage resumable without repeating a full historical audit.

**Files:**

- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- `scripts/skill-ir/skill-family-minimum-delivery.test.ts`
- `results/skill-ir/skill-family-minimum-delivery-20260911/stage-manifest.json`
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Read the current branch, HEAD, remote tracking state, and tracked worktree status. Record the actual values in `stage-manifest.json`.
2. Bind the stage to the existing family contract version and the exact implementation commit. Do not copy the D1-D9 totals into code as constants.
3. Reuse existing loaders and checkers. Add a focused composition runner only for the new stage; it must fail closed on a missing member, input, source locator, or report binding.
4. Write the failing tests for duplicate member IDs, duplicate input IDs, an unclassified duty, and a report that contains an accepted row without a checker result. Implement the smallest validator that rejects those cases.

**Exit evidence:** the stage manifest can be parsed and the focused validator tests pass. No source-unseen body has been read yet.

### M1. Freeze the class contract and the evaluation method

**Purpose:** Prevent the held-out result from becoming a moving target.

**Files:**

- `benchmarks/skill-ir/classification/skill-family-minimum-delivery-contract-v1.json`
- `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`
- `src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts`
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Reuse the existing family contract implementation. Extend its schema only if the current contract cannot represent `class-scoped`, `outside-class`, and `source-blocked` dispositions.
2. Define the positive criteria, at least two concrete negative examples, and one in-family-but-currently-unsupported example before reading held-out bodies.
3. Freeze the construction profile, checker version, input admissibility rules, and the first-run report schema. The lock records the source commit of the method, not a newly invented cryptographic ceremony.
4. Add schema tests proving that a member cannot become eligible merely by deleting unresolved duties or by counting multiple documents from one repository as independent members.

**Exit evidence:** a locked contract and method manifest with a timestamp, actual base commit, and deterministic test output. From this point onward, held-out bodies may be read only through the acquisition procedure in M4.

### M2. Close the development denominator and independence panel

**Purpose:** Turn the existing development slice into a complete, class-scoped baseline.

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/development-members.json`
- `results/skill-ir/skill-family-minimum-delivery-20260911/development-responsibilities.json`
- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Start with the already archived source bodies and resources. Select at least five candidates so that a known derivative or incomplete source can be excluded without weakening the denominator.
2. Verify repository owner, repository identity, commit, path, and fork/derivative evidence using the existing relatedness records. Three eligible members must remain; if the former LambdaTest/Jeremy/Pactflow set is not independent enough, replace the suspect member before freezing the development panel.
3. For each selected member, read the complete source material relevant to this class. Enumerate every class-scoped duty, its source locator, input obligation, expected artifact, and current disposition. Record non-class duties separately instead of dropping them.
4. Require `completeForClassScope=true` only when every class-scoped statement is classified. It must not mean that the whole skill has been understood or compiled.
5. Run the same baseline construction/checker for each member with at least two applicable inputs. Preserve the existing D1-D9 reports and write a new baseline report under this stage identity.

**Exit evidence:** three independent development members, a closed class-scoped duty denominator, and a baseline table that distinguishes member count, document count, operation/input count, duty count, accepted artifacts, checker passes, refusals, and unresolved items.

### M3. Implement the shared stage runner and accounting

**Purpose:** Make the class experiment executable by configuration rather than repository-specific code.

**Files:**

- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- `scripts/skill-ir/skill-family-minimum-delivery.test.ts`
- `src/skill-ir/api-skill-mapping.ts` only if a missing shared contract is demonstrated
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Compose `loadSkill`, `prepareApiSkillMapping`, `runApiSkillMapping`, the applicable operation/input runner, and the independent checker through one manifest-driven dispatch.
2. Keep source analysis, mapping, construction, and checking as separate stages in the report. A mapping that is agent-reviewed remains marked as such; it is not called automatic natural-language compilation.
3. Count obligations before construction. The runner must not use accepted rows as the denominator and must not hide an unsupported branch by removing it from the input.
4. Add tests for one shared profile used by three member IDs, one member with a source blocker, and one malformed report. The tests must assert that a repository name cannot select a special success branch.
5. Record elapsed construction time, model/API/paid calls, known tokens, unknown billing, and source acquisition requests without guessing missing values.

**Exit evidence:** the runner can execute the development manifest and produce one normalized report with no hard-coded D1-D9 totals.

### M4. Acquire and lock the held-out panel

**Purpose:** Obtain the first genuinely method-frozen test of the class.

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/heldout-selection.json`
- `results/skill-ir/skill-family-minimum-delivery-20260911/heldout-sources/`
- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Use authenticated GitHub CLI/Git acquisition with the existing resumable source cache. Metadata-only discovery is allowed before selection; do not read `SKILL.md` bodies or class duties before the method lock.
2. Select at least five metadata candidates from distinct repositories and owners, then lock three eligible members plus one reserve. Exclude forks, exact copies, and sources without a readable commit. Keep every exclusion and HTTP failure.
3. After the selection lock, fetch the three selected bodies and only the direct resources needed to interpret the class-scoped duties. Record commit/path/owner and the minimum provenance fields needed for reproduction.
4. Do not replace a selected member after its body has been read. A source that turns out to be out-of-class is a recorded negative member, not a silent substitution.

**Exit evidence:** a held-out lock written after M1, three selected repository-distinct source bundles, and an acquisition ledger whose failures and omissions are explicit.

### M5. Run the held-out first pass without repair

**Purpose:** Measure transfer of the frozen method rather than the ability to repair it after seeing the answer.

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/heldout-first-run/`
- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Extract or author one source-grounded duty draft per selected member using the locked prompt/validator. Make at most one physical model request per member unless transport failure is clearly established; preserve raw responses and unknown billing.
2. Run at least two applicable inputs per member through the shared mapping, constructor, and checker. Do not repair metadata, add a member-specific adapter, or alter the class contract during this first pass.
3. Preserve the exact first-run status for every member: accepted, rejected, unresolved, source-blocked, or infrastructure failure. A metadata omission is a first-run failure even when a later repair is easy.
4. Produce an obligation-level table for every member, including duties that never reached construction.

**Exit evidence:** a first-run report for all three selected members with no post-hoc repair mixed into the primary result.

### M6. Make at most one shared, gap-driven improvement

**Purpose:** Improve the common implementation only when the held-out evidence identifies a common defect.

**Files:**

- the one existing shared module identified by the failure cluster;
- its focused `.test.ts` file;
- `results/skill-ir/skill-family-minimum-delivery-20260911/revision-1/`;
- `docs/skill-ir/skill-family-minimum-delivery.md`.

**Rules:**

1. A code change is allowed only when the same missing or wrongly rejected obligation appears in at least two held-out members and the source evidence supports a common rule.
2. Write a failing deterministic test from the two source-backed cases, implement the smallest shared fix, and run the affected regression. Do not add a repository-name branch or a speculative schema feature.
3. If no common gap exists, record `sharedRevision=none-required` and proceed. Existing D5 shared capability evidence already satisfies the engineering requirement; no feature is added for appearance.
4. Re-run the held-out set once under a new revision directory. Never overwrite the first-run report.

**Exit evidence:** either one tested shared revision with before/after reports, or an explicit no-common-gap decision with evidence.

### M7. Compute the class-level decision

**Purpose:** Produce a result that can be used in the thesis/report without overstating it.

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/report.json`
- `docs/skill-ir/skill-family-minimum-delivery.md`
- `docs/skill-ir/skill-family-current-results.md`

**Required fields:**

- member eligibility and independence evidence;
- class-scoped duty denominator and disposition counts;
- applicable input denominator per member;
- accepted/rejected/unresolved counts;
- checker status for every accepted artifact;
- first-run versus revised-run separation;
- construction time, source requests, model/API/paid calls, known tokens, unknown billing, and unmeasured agent cost;
- code changes required per member and whether any path is repository-specific;
- reproduction commit and clean-checkout result;
- one of `bounded-positive`, `bounded-negative`, `insufficient-evidence`, or `blocked-before-evaluation`.

**Decision rules:**

- `bounded-positive` requires the minimum delivery contract in section 2;
- `bounded-negative` is the honest result when the frozen method reaches the panel but fewer than two held-out members yield accepted artifacts or a shared checker defect remains;
- `insufficient-evidence` applies when the source or applicable-input denominator is too small to evaluate the member;
- `blocked-before-evaluation` applies only to acquisition or infrastructure failure before a fair first run.

No label implies whole-skill automation or future-member certainty.

### M8. Reproduce, document, and deliver

**Files:**

- `docs/skill-ir/skill-family-minimum-delivery.md`
- `docs/skill-ir/deadline-execution-status.md` (append a new checkpoint; do not rewrite history)
- `D:\skill优化\project_handoff.md` (append the recovery entry)
- `D:\skill优化\project_communication.md` (append the decision)
- `D:\skill优化\conversation_log.md` (append the stage record)

**Verification:**

1. Run the focused tests for every changed module and the stage runner.
2. Run `bun run typecheck` plus any explicit script typecheck required by the changed runner.
3. Run the existing documentation link test and link scan for the changed documentation.
4. Recreate the stage report in a clean checkout at the delivery commit using the locked source bundles. Do not rerun unrelated historical audits.
5. Run `git diff --check`, inspect the staged file list, commit by purpose, and push the feature branch to `origin`.

The final handoff must state the actual branch/HEAD/remote state, the result label, the exact command to reproduce the report, remaining blockers, and which claims are deliberately not made.

## 5. Failure, Retry, and Cost Policy

- Network acquisition may retry transient failures a small bounded number of times and may resume from cached successful responses. A permission or rate-limit failure is archived and does not invalidate earlier sources.
- A model request is made only for a named duty-extraction need. One request per member is the default; one repair is allowed only when deterministic validation supplies a concrete repair target. Repeated no-response calls are not useful evidence and are not required.
- Paid or remote calls are permitted, but every call must have a declared role in the manifest. Report actual returned usage and cost; write `unknown` when the provider does not return billing data.
- Do not wait for a nominal duration, repeat a full audit, or add samples merely to consume time. When a stage is complete, continue to the next stage; when a material blocker repeats, preserve it and move to offline analysis or documentation.
- Never read Q1 reserve, historical held-out material, or a selected held-out body before the M1 lock. Do not execute downloaded source commands.

## 6. Stop Conditions and Resume Points

Stop the experimental queue only when M8 has produced either a reproducible class-level result or a complete bounded-negative/blocked result. Stop earlier if the remaining work would require changing the frozen class contract, inventing source semantics, or rewriting historical evidence. In all cases, commit the evidence and append a recovery point.

Resume in this order:

1. read this plan and the latest `deadline-execution-status.md` checkpoint;
2. inspect `stage-manifest.json` and the last complete result directory;
3. run the stage runner's focused resume/status command;
4. continue from the first incomplete M-step without re-reading completed held-out bodies or regenerating immutable reports.

## 7. Definition of Done

This taskbook is complete when the repository contains:

- one locked class contract and method manifest;
- three provenance-reviewed development members with a closed class-scoped denominator;
- three post-lock held-out members or an explicit, fully evidenced acquisition failure;
- first-run and (if needed) one shared-revision reports kept separate;
- accepted artifacts independently checked and every obligation classified;
- a machine-readable decision with actual cost/call accounting and a clean-checkout reproduction;
- synchronized status, handoff, communication, and conversation-log entries;
- a focused test/typecheck/link verification record and a pushed feature branch.

The result may be negative. A negative result with a complete denominator and a fair held-out first run is a minimum research delivery; it is more valuable than an unbounded collection of positive development examples.
