# Skill Family Minimum Delivery Implementation Plan (Revision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans) to execute this plan.

**Goal:** Prepare and then evaluate the smallest defensible class-level engineering result for the family `api-contract-driven-offline-test-construction`. The method must first pass a calibration and development-shadow phase; only then may it be frozen and evaluated on at least three new same-family skills. A positive held-out result is an outcome to measure, never a precondition manufactured by changing the method after selection.

**Architecture:** Keep the existing `skill-loader`, family contract, declarative API mapping, operation-input runners, production bindings, and independent checkers. Add a normalized obligation ledger between source mapping and construction so that source-grounded extraction, semantic review, construction, and checking cannot be collapsed into one accepted count. Add one stage manifest/orchestrator only where the existing pieces cannot be composed. Treat a skill as a member with a class-scoped responsibility slice; keep whole-skill execution, live API correctness, business/status authority, and human-savings claims outside this minimum result.

**Tech Stack:** Bun/TypeScript, the existing JSON contracts and checkers, authenticated GitHub CLI for source acquisition, the existing model client for one-purpose duty drafts, and the current offline clean-checkout workflow. No HTML, web UI, presentation layer, or generic platform work belongs in this stage.

**Plan revision:** This revision inserts `P0 calibration`, `P1 development shadow`, and an explicit freeze gate before any held-out body is read. The prior plan was a candidate protocol, not an approved final method; its historical wording is superseded by this state machine.

---

## 1. Why This Stage Exists

The D1-D9 evidence is a useful bounded development result, but it does not yet establish a class-level effect. The current record still has four material gaps:

1. the class-scoped responsibility denominator is not closed for a selected member panel;
2. the independence of every development member is not fully established;
3. the previous new-member round mixed first-run failures with later metadata repair;
4. no method-frozen, source-unseen evaluation has been completed.

This plan closes those gaps with one small, auditable panel. It does not expand the class to every API workflow or silently promote the existing operation count into a skill count.

The current D1-D9 results remain immutable evidence. New results use a new directory and a new stage identity. The old `0/6`, Q1, readiness, 001/002, and historical prospective records are not rewritten.

The immediate objective is **method readiness**, not a forced positive result. If calibration or shadow exposes a shared defect, the queue stops before held-out evaluation, records the defect, and may revise the shared method once. This separates a bad measurement protocol from a genuinely unsupported class member.

## 2. Claim and Evidence Contract

The claim unit is a **class-scoped responsibility slice**, not the complete behavior of every member skill. The candidate family remains:

> A skill that takes a public API contract and explicit coverage requirements and constructs offline request/test artifacts that can be checked independently against that contract.

An individual skill may also contain native runner, authentication, live-service, business-state, triage, or documentation duties. Those duties are recorded as `outside-class`, `source-blocked`, or `unresolved`; they are never silently counted as automated success.

The minimum delivery is marked `bounded-positive` only when all of these conditions hold:

- at least three development members pass a provenance review: distinct repositories/owners, no known exact copy or fork relationship, and source bodies/resources fixed to a readable commit;
- the class-scoped responsibility denominator is enumerated for every selected development and held-out member, with every duty classified as `constructed`, `rejected-with-reason`, `unresolved`, `outside-class`, or `source-blocked`;
- at least three held-out members are selected after the method lock, from repository-distinct sources, and are run without changing the class contract or the first-run method;
- all three selected held-out members have two or more applicable task inputs. If any selected member lacks that denominator, the primary result is `insufficient-evidence`; it cannot be removed from the positive denominator after its body is read;
- every accepted artifact passes the independent checker, and every checker failure or construction refusal is preserved with its layer and reason;
- at least two of the three input-qualified held-out members produce a non-empty accepted artifact set without a repository-specific code path. A positive claim is forbidden when fewer than three selected members are input-qualified;
- the report separates deterministic construction calls, model calls, source/API calls, paid calls, known token usage, unknown billing, and development-agent cost;
- a clean checkout can reproduce the stage report from the locked manifest without reading an unseen source after the run.

If all three selected members are input-qualified, all obligations are classified, and all accepted artifacts pass but fewer than two members produce accepted artifacts after the permitted revision, the result is `bounded-negative`, not a failure of the project. If fewer than three selected members are input-qualified, the result is `insufficient-evidence`; if the source or method lock cannot be maintained, the stage is `blocked-before-evaluation` and the partial evidence is still delivered.

The following claims remain prohibited in this stage: whole-skill automation, all-future-member generalization, live API correctness, business/status correctness, human-minute savings, cross-model stability, or production readiness outside the documented support contract.

### 2.1 Evidence roles

Every row in the stage manifest has exactly one evidence role:

- `calibration-only`: an already exposed development source used to test schema, semantic review, accounting, and checker plumbing. It never enters the held-out numerator.
- `development-shadow`: an already exposed development member run through the candidate end-to-end method. Shadow repairs may change the method, but shadow outputs never enter the primary held-out denominator.
- `primary-heldout`: a member selected after the method lock. Its first run is the primary transfer result.
- `primary-revision`: one optional shared revision run after the primary first run. It is reported beside, never over, the first run.

The report must reject a row whose role changes after construction. A repaired development row cannot be relabeled `primary-heldout`.

### 2.2 Obligation disposition contract

Before construction, every class-scoped duty and obligation receives exactly one disposition:

`constructed`, `rejected-with-reason`, `unresolved`, `outside-class`, or `source-blocked`.

`accepted` is an artifact outcome, not an obligation disposition. `not-fully-verified`, `not-implemented-by-profile`, and missing semantic review are not accepted dispositions; they remain explicit unresolved or source-blocked states. The denominator is created before any artifact is generated.

### 2.3 Method-readiness criteria

The method may be frozen only after both preparatory phases pass:

- **Calibration:** three exposed development members, at least two applicable inputs each, 100% of obligations with source locator and disposition, 100% checker coverage for accepted artifacts, and every semantic disagreement or source ambiguity recorded rather than silently approved.
- **Development shadow:** the same candidate method completes a first run for the development panel; any repair is a separate revision; no unresolved shared defect remains; repository-specific dispatch is zero; and accounting fields are complete or explicitly `unknown`.

Failure of either phase yields `method-not-ready` and blocks held-out acquisition. It is valid to revise the shared validator, ledger, or checker once and repeat the affected phase; it is not valid to delete difficult obligations or narrow the class after seeing a failure.

## 3. Execution Identity and Protected Boundaries

Start from the actual current HEAD, which must be recorded rather than assumed. Create a dedicated feature branch named `skill-family-minimum-delivery-001` (or continue it if it already exists). Do not merge into `skill-ir-aot` as part of the run. Push only the user `origin` work branch after the stage is complete. Set `planRevision=2` in the stage manifest.

Create one new evidence directory:

```text
results/skill-ir/skill-family-minimum-delivery-20260911/
```

The directory contains the stage manifest, calibration fixtures and reports, shadow first-run and revision reports, freeze-gate decision, acquisition records, source and duty ledgers, held-out first-run reports, any revised implementation report, and a final machine report. Each file is written once under a revisioned name; a repair never overwrites a first run. Held-out sources and their bodies do not exist in this directory until the freeze gate is passed.

Do not use `git add -A`. Add only the plan, code, tests, manifests, reports, and documentation named by this plan. Historical untracked material remains untouched.

## 4. Work Queue

### M0. Record the baseline and stage identity

**Purpose:** Make the revised stage resumable without repeating a historical audit.

**Files:**

- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- `scripts/skill-ir/skill-family-minimum-delivery.test.ts`
- `results/skill-ir/skill-family-minimum-delivery-20260911/stage-manifest.json`
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Record the actual branch, HEAD, remote tracking state, and tracked worktree status.
2. Record `planRevision=2`, the family-contract version, and the exact implementation commit. Do not copy D1-D9 totals into code.
3. Reuse existing loaders and checkers. Add a focused composition runner only where existing pieces cannot be composed.
4. Write failing tests for duplicate member/input IDs, an unclassified obligation, an accepted row without checker evidence, and a role that changes after construction. Implement fail-closed validation.

**Exit evidence:** the stage manifest parses and focused validator tests pass. No held-out body has been read.

### M1. Build the development panel and candidate class contract

**Purpose:** Establish a complete development denominator before calibration.

**Files:**

- `benchmarks/skill-ir/classification/skill-family-minimum-delivery-contract-v1.json`
- `results/skill-ir/skill-family-minimum-delivery-20260911/development-members.json`
- `results/skill-ir/skill-family-minimum-delivery-20260911/development-responsibilities.json`
- `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`
- `src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts`

**Steps:**

1. Use archived exposed sources only. Keep at least five candidates so a derivative, incomplete source, or out-of-class member can be excluded without shrinking the denominator.
2. Verify repository owner, repository identity, commit, path, fork/derivative evidence, and source readability. Three eligible development members must remain.
3. Enumerate every class-scoped duty and obligation with source locator, expected artifact, and provisional disposition. Record non-class duties rather than dropping them.
4. Define at least two concrete negatives and one in-family-but-currently-unsupported case. Do not read any held-out body.
5. Treat `completeForClassScope=true` as complete only when every class-scoped statement is classified; it never means whole-skill complete.

**Exit evidence:** three provenance-reviewed development members and a candidate contract with a closed class-scoped denominator.

### P0. Calibration on exposed development sources

**Purpose:** Find extraction, semantic-review, obligation-ledger, checker, and accounting defects before method freeze.

**Files:**

- `src/skill-ir/skill-family-obligation-ledger.ts`
- `src/skill-ir/skill-family-obligation-ledger.test.ts`
- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- `results/skill-ir/skill-family-minimum-delivery-20260911/calibration/`
- `docs/skill-ir/skill-family-minimum-delivery.md`

**Steps:**

1. Run the source-grounded extraction and ledger normalization on the three development members, with at least two applicable inputs per member.
2. Add calibration fixtures for conflicting expected status, missing host/tool metadata, guidance that is not repair authority, a missing local reference, and an external-response advisory. Each fixture must land in an explicit disposition rather than being silently accepted.
3. Compare draft extraction with semantic adjudication obligation by obligation. Record disagreement, missing evidence, ambiguity, and model/API/paid usage; unknown billing remains `unknown`.
4. Remove or guard any profile-specific assessment that can be mistaken for family-wide support. In particular, bounded v2 evidence must remain labeled as a bounded subtask, and `originalOutputConformance=not-implemented` or `not-fully-verified` may not count as accepted.
5. Add deterministic tests that an accepted artifact always has checker evidence and that deleting an unresolved obligation fails validation.

**Calibration exit criteria:** 100% of obligations have source locator and disposition; 100% of accepted artifacts have checker evidence; every semantic disagreement is resolved or explicitly unresolved; no hard-coded member/repository success path remains. Failure produces `method-not-ready` and blocks shadow promotion until repaired.

### P1. Development shadow and candidate-method repair

**Purpose:** Exercise the whole candidate method on known members while keeping the primary estimate uncontaminated.

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/shadow-first-run/`
- `results/skill-ir/skill-family-minimum-delivery-20260911/shadow-revision-1/`
- `scripts/skill-ir/skill-family-minimum-delivery.ts`
- focused shared module and test only when a common defect is demonstrated

**Steps:**

1. Run the candidate method once for all three development members and their applicable inputs. Preserve first-run failures exactly.
2. Classify failures as `shared-defect`, `member-specific`, `source-blocked`, `infrastructure`, or `semantic-review-required`.
3. Allow at most one shared revision, and only when the same source-backed defect appears in at least two development members. Write a failing deterministic test first; do not add repository-name branches or delete obligations.
4. Re-run the affected development panel into a new revision directory. Keep first-run and repaired rows separate.
5. Check repository-specific dispatch, accounting completeness, obligation coverage, and checker coverage.

**Shadow exit criteria:** no unresolved shared defect; repository-specific dispatch is zero; every obligation is classified; accepted checker coverage is 100%; first-run/revision separation is machine-verifiable; accounting fields are complete or explicitly `unknown`. Otherwise remain `method-not-ready`.

### G. Freeze gate before held-out acquisition

**Purpose:** Make the decision to read held-out bodies explicit and irreversible for the primary run.

The gate report records four decisions:

- **Gate A, contract:** class criteria, negative/unsupported examples, disposition schema, profile scope, input admissibility, checker version, and report schema are locked.
- **Gate B, method:** P0 and P1 exit criteria pass; no unresolved shared defect remains; any residual limitation has an explicit disposition.
- **Gate C, provenance:** at least five metadata candidates are available, three repository-distinct selections plus one reserve can be locked, and no selected body has been read before this gate.
- **Gate D, accounting:** source/API/model/paid call roles, known tokens, unknown billing, and unmeasured agent cost fields exist in the manifest.

If any gate fails, write `method-not-ready`, `insufficient-evidence`, or `blocked-before-evaluation`, commit the evidence, and do not acquire or read held-out bodies. Changing the class contract, deleting obligations, or silently replacing a candidate cannot repair a failed gate.

### M2. Freeze the method and lock held-out selection

**Purpose:** Start the primary evaluation only after the candidate method is demonstrably ready.

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/freeze-gate.json`
- `results/skill-ir/skill-family-minimum-delivery-20260911/heldout-selection.json`
- `results/skill-ir/skill-family-minimum-delivery-20260911/heldout-sources/`

**Steps:**

1. Write the gate decision, method commit, profile/checker versions, input rules, and report schema.
2. Use authenticated GitHub CLI/Git acquisition. Metadata-only discovery is allowed before selection; selected bodies remain unread until the gate is recorded.
3. Select three repository-distinct members plus one reserve from at least five candidates. Keep every exclusion and HTTP failure.
4. Write `selectionCommit`, the candidate metadata snapshot, selected/reserve IDs, `bodyReadCount=0`, and the lock timestamp before fetching anything. These fields are checked by the runner.
5. After the lock, fetch selected bodies and only direct resources needed for class-scoped interpretation. A selected member that proves out-of-class remains a recorded negative; it is not silently replaced.

**Exit evidence:** a passing freeze gate and an immutable held-out selection lock.

### M3. Held-out primary first run

**Purpose:** Measure transfer of the frozen method without post-hoc repair.

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/heldout-first-run/`
- `scripts/skill-ir/skill-family-minimum-delivery.ts`

**Steps:**

1. Make at most one named duty-extraction request per selected member; preserve raw response, failed request, semantic adjudication, and unknown billing.
2. Run at least two applicable inputs per member through the frozen mapping, constructor, and checker.
3. Do not repair metadata, add a member-specific adapter, alter the class contract, or replace a selected member during this run.
4. Preserve accepted, rejected, unresolved, source-blocked, and infrastructure statuses and produce the obligation-level denominator before artifact counts.

**Exit evidence:** a first-run report for all selected members with no repair rows mixed into the primary result.

### M4. Optional single shared revision

**Purpose:** Test whether a common source-backed defect can be fixed without hiding the primary failure.

1. Allow a revision only when the same defect appears in at least two held-out members and the source evidence supports one shared rule.
2. Write a failing deterministic test, implement the smallest shared fix, and re-run once into `revision-1/`.
3. If no common defect exists, record `sharedRevision=none-required`.
4. Never overwrite `heldout-first-run/` and never add a repository-specific branch.

### M5. Compute the class-level decision

**Required fields:** member eligibility and independence, class-scoped duty denominator, input denominator, obligation dispositions, accepted/rejected/unresolved counts, checker status, first/revised separation, call/token/cost accounting, adaptation amount, reproduction commit, and clean-checkout result.

**Decision rules:**

- `bounded-positive` requires the section 2 minimum contract and a passed freeze gate;
- `bounded-negative` means the frozen method reached a fair three-member panel and, after the single permitted shared revision (if any), fewer than two of the three input-qualified members produced accepted artifacts, or a shared checker defect still remained;
- `insufficient-evidence` means the source or applicable-input denominator was too small;
- `method-not-ready` means calibration or shadow failed before held-out evaluation;
- `blocked-before-evaluation` means acquisition or infrastructure prevented a fair run.

No label implies whole-skill automation, future-member certainty, live API correctness, or human savings.

### M6. Reproduce, document, and deliver

**Files:**

- `results/skill-ir/skill-family-minimum-delivery-20260911/report.json`
- `docs/skill-ir/skill-family-minimum-delivery.md`
- `docs/skill-ir/deadline-execution-status.md` (append only)
- `D:\skill优化\project_handoff.md` (append only)
- `D:\skill优化\project_communication.md` (append only)
- `D:\skill优化\conversation_log.md` (append only)

**Verification:** run focused tests for changed modules, `bun run typecheck`, explicit script typechecks, the documentation link test, and a clean-checkout reproduction of the stage report. Run `git diff --check`, inspect the explicit staged file list, commit by purpose, and push the feature branch to `origin`. Do not rerun unrelated historical audits.

## 5. Failure, Retry, and Cost Policy

- Network acquisition may retry transient failures a small bounded number of times and may resume from cached successful responses. A permission or rate-limit failure is archived and does not invalidate earlier sources.
- A model request is made only for a named duty-extraction or semantic-review need. Calibration and shadow may use one repair after deterministic validation supplies a concrete repair target; the held-out primary run has no repair. Repeated no-response calls are not useful evidence and are not required.
- Paid or remote calls are permitted, but every call must have a declared role in the manifest. Report actual returned usage and cost; write `unknown` when the provider does not return billing data.
- Do not wait for a nominal duration, repeat a full audit, or add samples merely to consume time. When calibration or shadow is complete, evaluate its gate immediately; when a material shared blocker repeats, preserve it and stop before held-out.
- Never read Q1 reserve, historical held-out material, or a selected held-out body before the G freeze gate. Do not execute downloaded source commands.
- Never change class membership, input admissibility, or obligation disposition rules after reading a selected held-out body. A method revision is allowed only as the separately reported M4 shared revision.

## 6. Stop Conditions and Resume Points

The machine-readable state machine is:

`planned -> calibrating -> shadow -> gate-ready -> method-frozen -> heldout-running -> revised-once | no-revision -> reported`.

Failure transitions are explicit: `calibrating -> method-not-ready`, `shadow -> method-not-ready`, and `gate-ready -> method-not-ready | insufficient-evidence | blocked-before-evaluation`. `gate-ready` means P0/P1 passed and the G decision is pending; `method-frozen` means all G gates passed and the held-out lock may be read.

Stop before held-out if calibration or shadow leaves an unresolved shared defect, an unclassified obligation, missing checker evidence, or incomplete accounting. Stop the full queue only when M6 has produced a reproducible class-level result or a complete bounded-negative/blocked/method-not-ready result. In all cases, commit the evidence and append a recovery point.

Resume in this order:

1. read this plan and the latest `deadline-execution-status.md` checkpoint;
2. inspect `stage-manifest.json` and the last complete result directory;
3. run the stage runner's focused resume/status command;
4. continue from the first incomplete step without re-reading completed held-out bodies or regenerating immutable reports;
5. if the state is `method-not-ready`, resume at P0 or P1 rather than acquiring held-out sources.

## 7. Definition of Done

This taskbook is complete when the repository contains:

- one candidate class contract, calibration report, shadow first-run/revision pair, and explicit freeze-gate decision;
- three provenance-reviewed development members with a closed class-scoped denominator;
- three post-lock held-out members or an explicit, fully evidenced acquisition failure;
- first-run and (if needed) one shared-revision reports kept separate;
- accepted artifacts independently checked and every obligation classified;
- a machine-readable decision with actual cost/call accounting and a clean-checkout reproduction;
- synchronized status, handoff, communication, and conversation-log entries;
- a focused test/typecheck/link verification record and a pushed feature branch.

The result may be `method-not-ready`, negative, or positive. A method-readiness result with a complete calibration/shadow denominator is a valid intermediate delivery; it is more valuable than a positive-looking held-out number produced by changing the method after seeing the source.
