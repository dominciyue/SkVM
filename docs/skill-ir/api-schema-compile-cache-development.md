# D8 bounded schema compilation reuse

Development revision after D7 first run at 17b9633, archived in 2fff7ac.
Observed nntan/front-core: 211 operations, 6184 ms; checker construction currently
instantiates Ajv and compiles for each witness/case/independent verification call.
Minimal/full construction and verification repeatedly compile equal constraints.

Design: adapt the original source on every call, then use exact JSON serialization
of the independently adapted schema as a process-local LRU key. Cache at most 128
compiled validators, each key at most 128 KiB; larger schemas compile uncached.
No input/object-identity caching, generated values, source inventories, outcomes or
annotation notes are shared. Reference edits therefore change adapted content.
Each check copies Ajv errors before returning. Cache failures are not retained.
No keyword, witness, coverage, status or old-v2 contract changes.

Alternatives: sharing source-object identity risks stale mutations; threading a
request-scoped compiler through every generator/checker adds broader churn. Exact
normalized content reuse keeps callers unchanged and makes source drift explicit.
Memory remains bounded by key count/size (compiled function overhead not quantified).
Export read-only cumulative hit/compile/entry diagnostics for measurement, not claims
about validator reliability. No persistent cache or remote dependency.

Implementation plan (inline executing-plans/TDD; autonomous routine decisions authorized):

- [ ] Add api-schema-compile-cache.test.ts: equal content reuses compilation;
  mutate a local reference target and expect different validation; annotation notes
  remain per source; returned errors remain isolated; 129 distinct schemas evict LRU.
- [ ] Run `bun test src/skill-ir/api-schema-compile-cache.test.ts` and preserve RED.
- [ ] Change only api-schema-checker.ts: bounded Map keyed by normalized JSON,
  lookup refreshes insertion order, compile misses as before, expose metrics snapshot.
- [ ] Run focused schema/wire/mapping tests and main `tsc --noEmit`.
- [ ] Run the same twelve-input nntan configuration into a new D8 output; compare
  complete requestCasesReport and requestCasesVerification with archived first run,
  excluding only elapsedMillis outside those semantic payloads. Record cache metrics
  and timing; first-run remains unchanged. Speed ratio is one-machine observational.
- [ ] Commit implementation, tests, evidence and recovery status; continue unresolved
  D7 applicability/native-output gaps rather than claim entire class complete.

Results: tests 25/25, 134 assertions; main and explicit script strict typecheck pass.
First CLI test filter lacked `./` and matched no files; corrected. Missing export RED,
then metric stub produced two expected assertion failures; implementation passed.
Twelve complete semantic payload comparisons pass in
`results/skill-ir/skill-family-cache-development-20260911/comparison.json`.
Cache: 2405 hits, 109 compilations, 109 entries. Front-core 6184→2144 ms;
all recorded per-input timings remain observational, without repeated-best selection.
Execution ran from 2fff7ac plus bound uncommitted cache implementation/script; their
SHA256 values are archived, not represented as a clean committed first run.
