# Public Skill Responsibility Corpus Design

**Date:** 2026-09-10

**Identity:** `skill-ir-public-skill-responsibility-corpus-development-001`

**Branch:** `api-tester-operation-unseen-prospective-001`

**Status:** pre-source design; no new public skill body has been opened under this identity

## 1. Purpose and boundary

Task 8 builds a convenience corpus of up to 40 real public skills from at least eight independent upstream repositories. Its unit is the complete responsibility, not a syntax feature and not a selected easy step. The corpus is intended to test whether the Task 7 responsibility-family vocabulary remains usable across projects and to describe mixtures of deterministic work, tool use, dynamic state, and semantic choice.

This is development research, not an estimate of the skill ecosystem. It does not use Task 3 results, pending prospective OpenAPI sources, Q1 reserved material, held-out material, candidate outcomes, model calls, business APIs, or paid services. Public GitHub metadata and source files may be read only after the protocol and selector have been committed.

## 2. Considered selection approaches

### A. Hand-pick known repositories

This would make license and content quality easy to manage but would let content knowledge determine selection. It is rejected because it cannot distinguish a protocol result from curator preference.

### B. Global code search over `SKILL.md`

This has broad reach but GitHub code search availability and ranking depend on authentication and index state. It also over-represents copied registries and makes repository independence difficult to enforce.

### C. Repository-first search with balanced round-robin (selected)

Freeze repository-search queries and ranks, inspect only repository metadata and Git trees, then select `SKILL.md` paths without opening their blobs. Eligible paths are selected round-robin across repositories with a five-skill repository cap. Only after the selection file is committed are selected bodies and direct local resource closures downloaded and read. This gives an auditable convenience sample, bounds repository dominance, and preserves a real pre-content selection point.

## 3. Discovery universe and order

Use the public GitHub REST API without authentication or mutation. Repository search is performed in this exact priority order, `sort=stars`, `order=desc`, `per_page=100`, pages 1 then 2:

1. `topic:agent-skills fork:false archived:false`
2. `topic:claude-skills fork:false archived:false`
3. `"SKILL.md" in:readme fork:false archived:false`
4. `"agent skills" in:name,description,readme fork:false archived:false`

Record query, page, rank, retrieval time, response headers relevant to rate limits, and every returned repository identity. Deduplicate repositories by lower-case GitHub `full_name`; the first query/page/rank occurrence is authoritative. Repository order is `(queryPriority, page, rank, fullName)`.

The eight search responses are the repository-metadata authority. Deduplicate their returned identities in frozen order, then inspect only the first 25 unique repositories. For each inspected repository, request exactly its default-branch metadata and recursive Git tree; the fixed maximum is therefore 58 public metadata requests (eight search pages plus two requests for each of 25 repositories). The limit was frozen before any public metadata request because inspecting every possible returned repository would exceed the anonymous REST budget and would not be reproducible. Repositories beyond this fixed prefix remain recorded in the search universe but cannot enter selection under this identity.

This remains metadata-only discovery: do not request a selected `SKILL.md` blob body yet. Candidate paths have a case-sensitive basename `SKILL.md`, Git object type `blob`, size 100 through 524288 bytes, and no path segment in `.git`, `.cache`, `node_modules`, `vendor`, `third_party`, `dist`, or `build`. Paths are ordered by UTF-8 code-point order. License classification comes from the frozen search response; its authority is the single root-level tree blob whose case-insensitive basename starts with `LICENSE` or `COPYING`. Missing or ambiguous authority is an exclusion.

## 4. Repository and license eligibility

An eligible repository must be public, non-fork, non-archived, non-disabled, and have a resolvable default-branch commit and recursive tree. Its effective repository license must have an SPDX ID in:

`0BSD`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `CC-BY-4.0`, `CC0-1.0`, `ISC`, `MIT`, `MPL-2.0`, `Unlicense`.

Save the license API classification, authority path, Git blob identity, and later the license bytes/SHA-256. Unknown, missing, ambiguous, or non-allowlisted licenses are recorded as exclusions; their skill bodies are not opened. This permissive-license rule intentionally biases the corpus and must be reported.

Repositories or package roots present in `benchmarks/skill-ir/classification/q1-development-sources-v1.json` are excluded by canonical repository plus overlapping package-root path. The protocol binds that registry by SHA-256. Local held-out directories and any Task 2 prospective selection/lock are never enumerated or read. The current Task 2 real-source selection count is zero.

## 5. Balanced selection and shortfall

After eligibility and exclusions within the fixed 25-repository inspection prefix, iterate selection rounds 1 through 5. In each round, visit repositories in frozen repository order and take that repository's next eligible path, if any, until 40 paths are selected. A repository contributes at most five skills. No result may be replaced based on body content, family assessment, constructibility, or current support.

The selection is executable only when it contains exactly 40 distinct repository/commit/path tuples from at least eight repositories. If the fixed inspection prefix yields fewer, emit a write-once shortfall report with the actual counts, inspected/uninspected counts, and exclusion reasons. Do not add queries, pages, licenses, paths, or repositories after observing the shortfall under this identity.

Repository independence is counted by canonical upstream repository, not fork or owner. Exact Git blob duplicates and exact normalized body duplicates receive a shared `lineageGroupId` after body retrieval and count once for independent-content summaries, but remain in the frozen 40-row denominator. A repository disclosed as a mirror, template copy, or derivative shares a lineage group with its evidenced source. If lineage cannot be resolved, record `lineage-unknown` and do not claim independent content.

## 6. Selection lock, source archive, and exposure time

The metadata-only selection output binds protocol digest, discovery response digests, repository full name and URL, default-branch commit, `SKILL.md` path, Git blob OID/size, license classification/authority, selection round, and selection rank. Commit this selection identity before requesting any selected skill blob.

After that commit, download only the 40 selected `SKILL.md` files, their applicable license bytes, and their direct repository-local resource closure from the pinned commit. Record first body exposure time and raw SHA-256. Permissively licensed bytes may be archived under the corpus identity. Any source whose redistribution status becomes ambiguous after retrieval is kept only as digest, locator, and analysis; remove its copied implementation bytes before the corpus evidence commit and mark `locator-only`.

Direct resource closure is defined from repository-relative Markdown links, explicit backtick paths, and explicitly named sibling directories `scripts`, `references`, `templates`, `assets`, or `examples` in the selected `SKILL.md`. A referenced file is included once. A directly named directory is recursively enumerated at the same commit. Paths must remain under the selected skill package root unless the `SKILL.md` names a contained repository-relative path. Do not follow links discovered only inside a resource file.

Per-skill archive budgets are 100 files, 5 MiB total bytes, and 1 MiB per resource file. A missing path, external-only dependency, Git submodule, large file, unsupported symlink, or budget overflow produces an explicit `resource-closure-incomplete` issue. It never permits silently omitting the affected responsibility.

## 7. Responsibility unitization and classification

A responsibility is the smallest complete user-visible outcome or required workflow obligation that can be assessed without splitting away a necessary dependency. Every normative `SKILL.md` section and every in-scope direct resource file must map to at least one responsibility or to a named non-responsibility category (`metadata`, `explanation`, `example-only`, `license`, `asset-only`). This coverage map is independent of the classifier and prevents selecting only easy steps.

Each responsibility records:

- input and output responsibilities;
- local and cross-responsibility dependencies;
- tools, scripts, templates, references, dynamic services/state, and side effects;
- one or more structure labels: `pure-instruction`, `deterministic-tool-call`, `deterministic-transform-or-generation`, `dynamic-service-or-state`, `user-expert-or-model-semantic-choice`, `mixed`;
- all seven Task 7 criterion assessments, verification/construction basis, dependency/source validity, semantic choices, current capability requirements, derived assessment, evidence IDs, exact source locators, and missing evidence;
- `analysisAgent=development-agent` and a separately recorded read-only review agent when used. Neither is a human annotator.

Dependencies must stay within the selected skill unless an external dependency is represented as a named non-corpus node. Cycles are permitted only as explicitly marked workflow iteration; otherwise they are consistency errors. Skill aggregates use the Task 7 `all|mixed|none|incomplete` contract and never drop out-of-family or unknown responsibilities.

## 8. Machine artifacts and verification

Planned artifacts are additive:

- `benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json`;
- metadata-only discovery and selection reports;
- digest-bound source/license/resource archives where redistribution is permitted;
- one responsibility dataset, coverage map, structural statistics report, mixed-responsibility graph, and typical positive/negative case index;
- `src/benchmarks/skill-ir/public-skill-responsibility-corpus.ts`, tests, and a thin CLI;
- `docs/skill-ir/public-skill-responsibility-corpus.md` and a Chinese analysis.

The verifier independently checks protocol and exclusion-registry digests, exact 40-row selection or explicit shortfall, repository cap and minimum, tuple/blob/digest uniqueness, license authority, archived path/byte closure, all normative-source coverage, locator bounds, evidence resolution, exactly one responsibility assessment per responsibility, dependency closure/propagation, aggregate counts, and zero protected/runtime access. Constructor-provided responsibility lists cannot serve as the source coverage denominator.

## 9. Accounting and claims

Project runtime accounting remains `model=0`, `businessApi=0`, `paid=0`, `heldOut=0`, `q1Reserved=0`, and `pendingProspective=0`. Public GitHub metadata/source reads are counted separately by request, repository, file, and byte. Development-agent analysis and review usage is host-external and not measured by the corpus runner.

Allowed claims are limited to the frozen convenience corpus and observed responsibility counts. The study may describe mixed responsibilities and evidence gaps, and may report whether the family contract could be applied without contradiction. It may not estimate ecosystem prevalence, call the 40 skills representative, equate static constructibility with artifact success, claim human agreement/savings, or change readiness.

## 10. Stop and recovery conditions

Stop source retrieval on rate-limit exhaustion, protocol/selection drift, license ambiguity, digest mismatch, protected-source overlap, or incomplete metadata binding. Preserve the actual shortfall/failure and continue only work that does not consume additional source content. Never change queries, pages, license allowlist, quotas, or selection order after observing content or outcomes under this identity.

The live recovery file remains `docs/skill-ir/api-tester-operation-prospective-research-status.md`. Task 2's prospective OpenAPI source gate remains independently blocked; Task 8 work cannot be cited to unlock it.
