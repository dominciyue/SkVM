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
