# Q1 Classification Handbook and Q2 Capability Map Implementation Plan

> Status: approved direction from `classification-and-automation-next-stage-proposal.md`; zero-paid implementation only.

**Goal:** Freeze a machine-checkable v1 classification method and a deduplicated 12-source development list, while recording the current Q2 code capability boundary without constructing or running prospective tasks.

**Architecture:** Add one strict Zod module for requirement-level classification, dependency propagation, independent annotation records, source-list invariants, and capability-profile invariants. Keep research inputs as versioned JSON under `benchmarks/skill-ir/classification/` and explain the human workflow in one component document. Existing runtimes, compilers, scorers, locks, results, portfolio, and readiness remain read-only.

**Tech stack:** TypeScript, Zod, Bun tests, JSON and Markdown.

---

## Task 1: Freeze the classification contract with tests

**Files:**

- Create: `src/benchmarks/skill-ir/task-automation-classification.ts`
- Create: `src/benchmarks/skill-ir/task-automation-classification.test.ts`

1. Write failing tests for strict four-dimension records, all four derived states, dependency propagation, forbidden post-result fields, independent annotators, pre-adjudication agreement, and malformed capability references.
2. Run the focused test and confirm failure because the module does not exist.
3. Implement the minimum schemas and derivation/validation functions.
4. Re-run the focused test and require all cases to pass.

## Task 2: Freeze Q1 source sampling and Q2 current capabilities

**Files:**

- Create: `benchmarks/skill-ir/classification/q1-development-sources-v1.json`
- Create: `benchmarks/skill-ir/classification/q2-current-capabilities-v1.json`
- Extend: `src/benchmarks/skill-ir/task-automation-classification.test.ts`

1. Add failing fixture tests requiring exactly 12 development sources, 12 unselected prospective slots, at least four repositories, unique package/lineage identities, locked public provenance, explicit structure strata, complete-responsibility/slice boundaries, and zero result observations.
2. Add failing capability-map tests requiring unique operation/backend/composition ids, valid source refs, and profile paths that cannot claim new-input support without validated composition.
3. Populate the 12 development entries: the seven portfolio cases, BIDS, changelog automation, OpenAPI spec generation, PDF, and webapp testing. External discovery entries bind immutable commits and git-tree manifests; protected prospective entries remain unselected and unseen.
4. Populate Q2 with existing restricted-plan and collection operations, API/Env bounded backends, and changelog gaps. Do not add operations or change an existing runtime.

## Task 3: Document the method and synchronize authorities

**Files:**

- Create: `docs/skill-ir/classification-handbook-v1.md`
- Modify: `docs/skill-ir/README.md`
- Modify: `docs/skill-ir/current-status.md`
- Modify: `docs/skill-ir/developer-guide.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/skill-ir/classification-and-automation-next-stage-proposal.md`

Document definitions, priority rules, positive/negative examples, unknown handling, sampling/deduplication, annotation/adjudication, prediction immutability, the 12-source development structure table, and the Q2 capability boundary. State explicitly that independent annotations and Q3 prospective inputs have not started.

## Task 4: Verify, record, commit, and push

1. Run the focused Q1/Q2 test.
2. Run relevant classification/corpus and construction tests.
3. Run TypeScript typecheck, documentation-link checks, repository scan, and `git diff --check`.
4. Update `D:\skill优化\conversation_log.md`, `D:\skill优化\project_handoff.md`, and `D:\skill优化\project_communication.md` with the zero-paid result and open Q3 boundary.
5. Stage only the explicit Q1/Q2 file whitelist, inspect the staged diff, create a focused commit, and push `origin/skill-ir-aot`.

## Stop conditions

- Do not select or inspect the 12 prospective sources before the handbook/capability identity is frozen.
- Do not run model/API/paid work, participant sessions, held-out, Stage M/N, or Q3/Q4.
- Do not modify core, DSL/runtime operations, artifact packages, scorers, old locks/results, portfolio, or readiness.
- Do not represent a single annotator or model as two independent annotators; annotation status stays `not-started` until two real independent records exist.
