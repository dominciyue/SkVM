# Public Skill Responsibility Corpus

## Status and purpose

`skill-ir-public-skill-responsibility-corpus-development-001` is a development-only convenience corpus for studying complete responsibilities in public agent skills. The current checkpoint contains only the pre-metadata protocol, strict schemas, deterministic metadata selector, and local CLI. No public skill body has been requested or read under this identity.

The corpus targets exactly 40 `SKILL.md` paths from at least eight public upstream repositories. It is not representative of the skill ecosystem, and later static responsibility classification will not establish artifact success, live API behavior, human agreement, savings, or readiness.

## Frozen discovery and selection boundary

The authority is `benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json`. It fixes four GitHub repository queries, two pages per query, result ordering, an SPDX allowlist, path and size filters, Q1/prospective/held-out exclusions, and a five-skill repository cap.

The search universe records all identities returned by the eight pages. Only the first 25 unique repositories in query/page/rank order are inspected. Repository facts and license classification come from the search response; each inspected repository adds exactly two metadata requests for its default branch and recursive tree. The maximum is therefore 58 requests. Repositories after the fixed prefix cannot enter selection. If that prefix cannot produce 40 eligible paths from at least eight repositories, the run writes a shortfall and stops without changing the protocol.

License authority is the single root-level tree blob whose case-insensitive basename starts with `LICENSE` or `COPYING`. Missing classification, missing authority, ambiguous authority, a non-allowlisted SPDX ID, a truncated tree, or an ineligible repository is recorded as a located exclusion. The selector never invents a license path.

## Implementation

`src/benchmarks/skill-ir/public-skill-responsibility-corpus.ts` contains strict Zod schemas, protocol-file verification, frozen search-prefix checks, Q1 package-root exclusion, code-point path sorting, five-round repository-balanced selection, provisional Git-blob lineage grouping, and portable semantic hashing.

`src/benchmarks/skill-ir/public-skill-responsibility-corpus-run.ts` exposes only:

- `verify-protocol`, which checks the committed protocol and Q1 registry digest;
- `select-metadata`, which reads a recorded discovery file, binds both its raw and canonical digest, builds the deterministic selection, and writes it once.

Every CLI file argument must be repository-relative and contained. Output uses exclusive creation and will not overwrite prior evidence. Neither mode accepts a skill body, family label, current-support result, candidate result, or replacement decision.

## Commands

From the repository root:

```powershell
bun ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-run.ts --mode=verify-protocol --root=. --protocol=benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json
```

After a discovery file exists, metadata selection is generated with:

```powershell
bun ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-run.ts --mode=select-metadata --root=. --protocol=benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json --discovery=results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json --out=results/skill-ir/public-skill-responsibility-corpus-selection-development-001/selection.json --selected-at=<ISO-8601 timestamp>
```

The public metadata discoverer and licensed source archiver are intentionally not part of this checkpoint. They must be implemented and tested before their respective first use. Selected `SKILL.md` bytes remain forbidden until the exact metadata selection has been committed.

## Verification

Run the focused suite and type checker:

```powershell
bun test ./src/benchmarks/skill-ir/public-skill-responsibility-corpus.test.ts
bun run typecheck
```

The focused tests cover query/order drift, premature body exposure, outcome leakage, repository and path duplication, fork/license/Q1 exclusions, exact-blob lineage, raw discovery binding, fixed inspected-prefix behavior, license absence/ambiguity, CLI surface, and path escape.

## Failure and modification rules

- Search incompleteness, metadata request budget drift, a non-exact inspected prefix, digest drift, protected-source overlap, or schema drift fails closed.
- License, tree, eligibility, and Q1 problems exclude the affected source and stay visible; they are not replaced after selection.
- Exact duplicate blobs stay in the frozen row denominator but share a provisional lineage and cannot inflate independent-content counts.
- Runtime model, business API, paid, held-out, Q1-reserved, and pending-prospective access counters remain zero. Public GitHub reads are recorded separately.
- Future changes must use a new identity after any public content has been observed. The active recovery record is `docs/skill-ir/api-tester-operation-prospective-research-status.md`.
