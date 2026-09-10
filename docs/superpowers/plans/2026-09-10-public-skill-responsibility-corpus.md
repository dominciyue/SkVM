# Public Skill Responsibility Corpus Implementation Plan

> **For agentic workers:** execute with test-driven development and exact staging. Do not open any new public skill body until Tasks 1 and 2 are committed.

**Goal:** Build an auditable convenience corpus of 40 real public skills from at least eight independent upstream repositories, then classify every complete responsibility with source-bound evidence under the Task 7 family contract.

**Architecture:** A strict protocol and metadata-only selector freeze source discovery before content exposure. After the selection commit, a bounded archiver records permissively licensed source closures, an independent enumerator creates the source denominator, and a responsibility dataset plus verifier derives structure/family/support aggregates without dropping difficult or unknown work.

**Tech stack:** TypeScript, Zod, Bun tests/CLI, GitHub public REST metadata, Node filesystem/crypto, JSON/JSONL, Markdown.

## Task 1: Design and planning checkpoint

**Files:**
- Create: `docs/superpowers/specs/2026-09-10-public-skill-responsibility-corpus-design.md`
- Create: `docs/superpowers/plans/2026-09-10-public-skill-responsibility-corpus.md`
- Modify: execution status and root recovery ledgers

- [x] Freeze the repository-first balanced sampling design, license allowlist, exclusion boundary, responsibility unit, resource closure, accounting, and claim limits.
- [x] Run doc verification and commit the design before implementing or reading new public skill content.

## Task 2: Protocol schema, selector, and metadata-only selection freeze

**Files:**
- Create: `src/benchmarks/skill-ir/public-skill-responsibility-corpus.ts`
- Create: `src/benchmarks/skill-ir/public-skill-responsibility-corpus.test.ts`
- Create: `src/benchmarks/skill-ir/public-skill-responsibility-corpus-run.ts`
- Create: `benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json`
- Create: discovery/selection reports under `results/skill-ir/public-skill-responsibility-corpus-selection-development-001/`

- [x] **Step 1: Write RED tests**

Tests must reject query/order drift, fork/archived/disabled repositories entering selection, unknown licenses entering selection, duplicate repository records/path tuples, repository cap breaches, fewer than eight repositories for an executable selection, body exposure before selection commit, and outcome-based replacement fields. Exact duplicate blob OIDs remain frozen rows but must share a provisional lineage ID and cannot increase independent-content counts.

- [x] **Step 2: Implement strict protocol/selection schemas and deterministic balanced selection**

The selector consumes recorded GitHub search/default-branch/tree metadata only. The discovery report retains the complete recursive-tree entry inventory and Git modes for later closure analysis, while selection can use only regular `100644`/`100755` blobs. It must enforce the frozen first-25 unique-repository inspection prefix and 58-request ceiling, and must not accept skill body bytes, family/current-support outcomes, or candidate results.

- [ ] **Step 3: Run fixed public metadata discovery and save all inclusion/exclusion facts**

No selected `SKILL.md` blob request is permitted. If 40 eligible tuples from eight repositories are unavailable, write a shortfall report and stop without changing the protocol.

Attempt 001 stopped after seven archived search responses because the GitHub search rate limit reached zero before the fixed sequence completed. Preserve that failure and do not retry or select from the partial prefix under this identity. Continue only local work that does not assume a selected real corpus.

- [ ] **Step 4: Commit the exact selection identity before content exposure**

The selection commit binds protocol, Q1 exclusion registry, discovery responses, repositories, commits, paths, blob OIDs/sizes, licenses, ranks, and zero body exposures.

## Task 3: Licensed source archive and direct resource closure

- [ ] Write archive/closure RED tests for missing bytes, digest drift, extra files, locator-only entries, path escape, symlink/submodule, budget overflow, and exposure-time ordering.
- [ ] Download only selected pinned blobs, license authority bytes, and direct resource closures; record every request/file/byte and first exposure time.
- [ ] Preserve incomplete closures as issues; do not replace selected rows or delete hard responsibilities.
- [ ] Commit the immutable source archive or locator-only records before classification.

## Task 4: Complete responsibility dataset

- [ ] Write source-denominator and responsibility-coverage RED tests before the unitizer/verifier.
- [ ] Independently enumerate normative sections and in-scope resource files; require every item to map to a responsibility or named non-responsibility category.
- [ ] Record every responsibility, structural labels, inputs/outputs/dependencies/side effects, Task 7 evidence fields, locators, missing evidence, and derived assessment.
- [ ] Use development-agent analysis and a separately logged read-only review; do not label either as human annotation.

## Task 5: Reports, documentation, and checkpoint

- [ ] Generate machine index, structural counts, responsibility/skill/source counts, mixed-responsibility graph, typical case index, consistency report, and Chinese analysis.
- [ ] Report exact skill, responsibility, repository, and lineage counts plus all shortfalls/unknowns; do not estimate ecosystem prevalence.
- [ ] Add component documentation and synchronize spec, plan, research status, handoff, communication, and conversation log.
- [ ] Run focused/broad relevant tests, typecheck, docs, path/secret/frozen/diff checks; obtain independent read-only review and fix Important findings.
- [ ] Exact-stage and commit Task 8. Do not use Task 8 evidence to unlock Task 2 or run Task 9 before Task 8 is complete.
