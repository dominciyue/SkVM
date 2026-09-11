# Repository origin metadata observation

Seven already-exposed development/new-member repositories were queried once each through
authenticated GitHub CLI. All seven currently report fork=false, distinct owners and no
parent/source repository. Raw public JSON and SHA256 bindings are retained in report.json.
No new primary body, runtime task, model request or business API call was made.

This addresses only the GitHub fork-parent question. It does not prove independent
authorship, exclude imported skills, or retroactively establish historical metadata at
the pinned source commit. Combine it with the existing exact/lexical body review and
source-attribution findings; never substitute it for semantic membership review.

The original three members and r5 four mapped members remain repository-distinct,
nonidentical candidates with source-declared shared duties. Original r5 first-attempt
errors and metadata-only repairs remain unchanged. There is no new migration success.

`acquire.mjs` is an explicit network acquisition script with per-repository raw caching;
do not run it for offline verification. To verify locally, recompute SHA256 of each
report row's file and compare; inspect fork/parent/source directly in the bound raw JSON.
Actual seven requests succeeded. Developer-agent cost remains unmeasured.
