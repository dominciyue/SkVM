# Public Skill Responsibility Corpus

## Status and purpose

`skill-ir-public-skill-responsibility-corpus-development-001` is a development-only convenience corpus for studying complete responsibilities in public agent skills. The current checkpoint contains the pre-metadata protocol, strict schemas, deterministic metadata discoverer/selector, independent raw-response verifier, and local CLIs. Final preflight review found no remaining Critical/Important/Minor issue and marked the first public metadata-only run ready. No real public metadata run or public skill body read has occurred under this identity at this checkpoint.

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

`src/benchmarks/skill-ir/public-skill-responsibility-corpus-discovery.ts` performs the fixed public metadata request sequence. It archives every raw JSON search, branch, and tree response with path and SHA-256, plus a digest-bound response-metadata sidecar containing the HTTP status, content type, and exact rate-limit header strings. It records request URL, retrieval time, independently derived rate-limit fields, repository search locator, commit, the complete recursive-tree entry inventory with Git modes, the regular-file blob subset, and license state; writes `discovery.json` only after the bounded sequence is complete; and writes `failure.json` if a prepared run stops. Symlink blobs (`120000`) and submodule commits (`160000`) remain visible in the complete inventory but cannot enter the selectable blob subset. Its independent verifier rereads body and response-metadata bytes and reconstructs both inventories, the search universe, inspected prefix, repository facts, commits, license authority, rate fields, full nonterminal rate-limit sequence, and accounting instead of trusting the discoverer's summary.

Every repository API URL supplied by a search response must exactly equal `https://api.github.com/repos/{full_name}`. This check runs both before branch/tree dispatch and during independent replay. The default HTTP transport also uses `redirect: error`, so a server redirect cannot move a request outside the fixed endpoint. Response bodies are read as a stream and aborted above the implementation safety limit of 64 MiB; the limit is a fail-closed transport guard, not an eligibility or selection parameter.

Every CLI file argument must be repository-relative and contained. Existing path components are checked with `lstat` and `realpath`; symbolic links and Windows junctions are rejected for protocol, exclusion, discovery, raw-response, and selection reads/writes. Output directories and files use exclusive creation and will not overwrite prior evidence. `failure.json` is reserved with an exclusive open before the first request, synchronized on failure, and any archive or cleanup error is surfaced rather than swallowed. Neither mode accepts a skill body, family label, current-support result, candidate result, or replacement decision.

## Commands

From the repository root:

```powershell
bun ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-run.ts --mode=verify-protocol --root=. --protocol=benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json
```

After a discovery file exists, metadata selection is generated with:

```powershell
bun ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-run.ts --mode=select-metadata --root=. --protocol=benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json --discovery=results/skill-ir/public-skill-responsibility-corpus-selection-development-001/discovery.json --out=results/skill-ir/public-skill-responsibility-corpus-selection-development-001/selection.json --selected-at=<ISO-8601 timestamp>
```

Run the fixed metadata-only discoverer with:

```powershell
bun ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-discovery-run.ts --root=. --protocol=benchmarks/skill-ir/classification/public-skill-responsibility-corpus-protocol-v1.json --out-dir=results/skill-ir/public-skill-responsibility-corpus-selection-development-001
```

The CLI accepts no arbitrary URL, authentication option, or skill-body path. The licensed source archiver is intentionally not part of this checkpoint and must be implemented and tested before its first use. Selected `SKILL.md` bytes remain forbidden until the exact metadata selection has been committed.

## Verification

Run the focused suite and type checker:

```powershell
bun test ./src/benchmarks/skill-ir/public-skill-responsibility-corpus.test.ts
bun run typecheck
```

The focused tests cover query/order drift, premature body exposure, outcome leakage, repository and path duplication, fork/license/Q1 exclusions, exact-blob lineage, complete Git mode retention with symlink/submodule exclusion from selectable blobs, raw discovery binding, fixed inspected-prefix behavior, zero-row shortfall, license absence/ambiguity, exact 58-request synthetic discovery, coordinated `incomplete_results` and rate-limit report/archive tampering, body and response-metadata tampering, redirect refusal, HTTP failure preservation under a competing failure-file creation, CLI surfaces, and junction/path escape before network access.

## Failure and modification rules

- Search incompleteness, metadata request budget drift, a non-exact inspected prefix, digest drift, protected-source overlap, or schema drift fails closed.
- Filesystem checks close ordinary symlink/junction traversal but do not claim protection against a hostile concurrent process replacing a checked directory between `lstat` and a later ordinary path open. The intended execution environment is a controlled, single-process clean checkout; a stronger adversarial-local contract would require directory-handle-relative open primitives not exposed by the current Node/Bun filesystem API.
- License, tree, eligibility, and Q1 problems exclude the affected source and stay visible; they are not replaced after selection.
- Exact duplicate blobs stay in the frozen row denominator but share a provisional lineage and cannot inflate independent-content counts.
- Runtime model, business API, paid, held-out, Q1-reserved, and pending-prospective access counters remain zero. Public GitHub reads are recorded separately.
- Future changes must use a new identity after any public content has been observed. The active recovery record is `docs/skill-ir/api-tester-operation-prospective-research-status.md`.
