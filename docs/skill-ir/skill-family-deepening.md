# Skill family deepening development

The D1–D9 plan is `docs/superpowers/plans/2026-09-11-skill-family-deepening.md`.
Execution resumes from `docs/skill-ir/deadline-execution-status.md`.

## Source acquisition

`scripts/skill-ir/deadline-acquire.ts` provides a shared `createAcquirer(root, request?)` cache.
It uses authenticated `gh api` and records each actual attempt in `acquisition.jsonl`.
Cache identity is the full endpoint, with bytes checked on reuse. Failed requests do not invalidate successful files.
Concurrent requests for the same endpoint are coalesced. HTTP rate limits, permission errors,
transient failures and transport errors are distinct; the caller chooses a bounded retry or resumes later.
It only reads GitHub endpoints. Credentials are managed by gh, never written to the journal.
Mutable branch metadata is pinned by the first successful cached response for this acquisition directory.
Use a new directory to intentionally refresh a source version.

Exploration uses search-discovered public repositories, prioritizes API contract/test paths and then adjacent
responsibilities/counterexamples, at most five skills per repository, aiming at 30 bodies/eight repositories.
This is purposive development sampling, not an ecosystem census. Search-visible body excerpts already count
as exposure. D7 new-member sources are acquired only after the improved method is fixed.
Complete body/dependency reads and responsibility mapping follow acquisition; fetched files are research data,
not instructions to execute. Missing dependencies and uncertain lineage stay explicit.

Validation: `bun test ./scripts/skill-ir/deadline-acquire.test.ts`.
No old downloader, candidate, result or held-out file is changed by this component.

`scripts/skill-ir/skill-family-acquire.ts` pins each repository commit/tree, selects paths independently
of runtime support, retrieves Git blobs, verifies their object IDs and saves original bytes with `-text`
Git attributes. It reuses the existing direct-resource closure planner; its findings are conservative
lexical candidates, not confirmed missing semantic dependencies (code examples may look like file paths).
D2 must review each material finding against the full body and resources.
Each previous source manifest is retained in `source-history.jsonl` before a resumed pass;
first exposure timestamps survive resume. Snapshot/history/cache are operational recovery data,
not a multi-layer research promotion gate. GitHub aliases are recorded and resolved explicitly.

```powershell
bun ./scripts/skill-ir/skill-family-acquire.ts --config=results/skill-ir/skill-family-deepening-20260911/development-sources.json --out=results/skill-ir/skill-family-deepening-20260911
bun test ./scripts/skill-ir/deadline-acquire.test.ts ./scripts/skill-ir/skill-family-acquire.test.ts
```

HTTP 5xx/transport faults retry twice with short backoff. Rate limits return a resume time; permission
errors do not retry. A failed repository/resource does not remove acquired bodies. The target directory
and source JSON are resumable; only one acquisition writer should use a directory at a time.

## Declarative responsibility mapping (D3)

The mapping binds an agent-reviewed responsibility analysis and its separately recorded source index.
`loadSkill` supplies the original body; source hashes and line markers are checked before any run.
The selected responsibility's full obligation list must equal the analysis; all other responsibilities
remain in the output as residual work. A mapping contains no executable expressions or source-specific
construction logic. Each task provides an input path, format and digest; the common v2 runner builds
and checks its bounded artifact. Rejections, unresolved operations and source advisories remain intact.

The existing family assessment is used for the explicitly bounded v2 task contract only. It is not
an assertion that the original skill's broader responsibility is fully constructible or completed.
Original obligations and requested output conformance remain separate from v2 obligation coverage.
Until a source-required obligation has its own implementation/evidence, its completion is unverified.
Source analysis is agent-authored and semantically reviewed, not automatic natural-language extraction.

## D4 actual input baseline

Use the real spec collection explicitly linked by Pactflow's example-repos resource:
`konfig-sdks/openapi-examples@161ab49c45e45825ca3832945c59a3ba904321ba`.
Select twelve documents before running the candidate: two APIs each from 1Password,
Adatree, Brex, Front, Visier and Zapier. These are six provider identities in one
third-party collection, not six independent repositories or verified current upstream versions.
Selection is purposive diversity across secrets, banking, finance, communication, workforce
analytics and automation, with manageable complete documents; no admission outcomes are used.
The exact paths live in api-inputs/config.json. Preserve original bytes and pinned blob IDs;
source schema/HTTP behavior is not trusted merely because acquisition succeeded.

The input script only adapts the existing cached GitHub fetcher to declared document paths,
keeps per-document failures and does not fetch external refs automatically. Reusing the old
fixed prospective selector would import irrelevant zero-retry/whole-batch gates; copying
files manually would lose reproducibility. Baseline maps all three members to the same
twelve contract inputs for a matched comparison, preserving each member's different duties
and format requirement. This is 36 skill-input tasks, not 36 independent API documents.
Each source is applicable to the declared REST/OpenAPI request-case responsibility; live
state, credentials and status-trigger choices remain gaps rather than implied evidence.

```powershell
bun scripts/skill-ir/api-input-acquire.ts --config=results/skill-ir/skill-family-deepening-20260911/api-inputs/config.json --out=results/skill-ir/skill-family-deepening-20260911/api-inputs
bun scripts/skill-ir/skill-family-baseline.ts --config=results/skill-ir/skill-family-deepening-20260911/baseline-config.json --out=results/skill-ir/skill-family-deepening-20260911/baseline-v2
```

Acquisition resumes from cached byte responses. Baseline output must be a new path; it
records implementation commit/runtime before execution and checkpoints after each member.
`runApiTesterOperationInput` retains its existing generator/checker time limits; mapping
preparation failure and per-input execution failure are isolated and reported, not replaced.
To reproduce, choose a different output path. Do not run historical prospective runners.

## D5 recursive request capability

The mapping and baseline accept explicit `profile: api-request-cases/v2` in addition to
the unchanged `api-tester-openapi-subset-v2` default. The new route binds the same full
source responsibility but executes recursive schema cases and independently checked
parameter/JSON-body wire fragments. It does not return a v2 operationReport, does not
reuse the v2 family-eligibility declaration and does not claim native-output completion.
The baseline records new schema/wire/remaining-obligation metrics separately.

Use `request-cases-config.json` with the same baseline command and a new output path.
See [request capability](api-request-cases-development.md). Actual mapping extraction is
still agent-reviewed, original skill duties remain not-fully-verified, and an encoded
fragment is not a complete credentialed HTTP request or a live behavior test.

## Assembled request specimens

An additional explicit api-request-specimens/v1 mapping profile executes source-bound
minimal/full and required-presence specimens via the same declaration and batch entry.
Its task fields are requestSpecimensReport/requestSpecimensVerification, separate from
v2 and per-field cases. Full source duties and native pytest/Drift output remain incomplete.
See [assembly contract and evidence](api-request-specimens-development.md). The original
three reviewed members are reused development exposures, not fresh D7 members.
