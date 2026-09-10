# Clean offline reproduction of current request capability

Purpose: verify current source-duty mapping and request specimens without undeclared
files or implicit development-directory caches. This is development, not a new prospective.

Prepare an explicit offline dependency archive from the installed node_modules paired
with current package.json/bun.lock. Record every regular file's relative path, byte length
and SHA256; reject external/symbolic entries. Record package versions and archive digest.
This proves byte-identical installed dependencies, not independent registry provenance.
Keep archive under D:/skill优化/SkVM-offline-packages/family-request-20260911/ and retain it;
do not commit bulky dependency payloads. The manifest and clean result are repo evidence.

Use an independent detached Git worktree at exact implementation commit d088f4e.
No native worktree creation tool is exposed, so git worktree fallback is appropriate.
The ignored .worktrees/family-request-clean-20260911 directory avoids committing checkout
contents. Extract the explicit archive there; verify its file manifest before execution.
Runtime Bun1.3.14 and Node23.8.0 are explicit external prerequisites, not implicit cache.

Run source mapping regression and the three-member specimen baseline using committed
cross-member-config.json. Inputs/source bodies are already committed with byte hashes.
Use a fresh local output; compare per-task specimen semantics and independent verification
against committed cross-member/ evidence, excluding duration/workdir/runtime timestamps.
Also run focused typecheck. Do not run old001/002, download new sources or make model calls.

Archive clean command results, exact checkout/lock/dependency/input hashes and semantic
comparison under results/skill-ir/skill-family-request-clean-20260911/. Keep the checkout
for inspection; do not infer report reliability merely because a rerun exits0.

Actual: Windows default autocrlf changed hashes; keep that setup attempt, then create
.worktrees/family-request-clean-lf-20260911 using `-c core.autocrlf=false -c core.longpaths=true`.
The latter passed15tests/88assertions, main tsc, and36/36 full semantic comparisons. Installed
dependency pack18944files/163588897bytes verified after extraction; archive36008491bytes.
package.json mixed-EOL raw difference remains explicitly recorded with normalized/parsed
equality; no other raw mismatch is silently excused. Full clean report copies and hashes are
retained under results/skill-ir/skill-family-request-clean-20260911/, alongside comparison,
tests, dependency inventory and initial-EOL diagnostic. Both checkouts retained, no cleanup.

## Follow-up: body negatives and response catalog

The old clean report proves d088f4e only. Create a new LF detached checkout at be89a50
for the added body-negative and response-source-example capabilities. Reuse the explicit
dependency archive above after archive SHA and extracted-file manifest verification; do
not install/download packages or use development node_modules/cache. Inputs are the same
12 committed documents. Run the new body-negative and response-catalog batch entry points
from that checkout with fresh local output directories, then compare complete per-document
artifacts to the archived development reports, separating metadata/timing/code bindings.
Run relevant deterministic tests and main plus script strict typechecks. No live API calls
or loopback rerun is needed for this byte/semantic reproduction. Retain the clean reports,
input/dependency/source hashes, command results and comparison, not just a success summary.
Use a separate evidence identity skill-family-extended-clean-20260911; old evidence stays.
