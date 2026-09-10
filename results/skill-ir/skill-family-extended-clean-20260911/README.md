# Extended clean reproduction

Implementation be89a5004e11271e45b1a6b266e3fd14ee0deff3, independent detached LF checkout
`.worktrees/family-extended-clean-20260911`. No tracked changes. This is development,
not prospective and not new real samples. The old d088f4e clean evidence is unchanged.

Actual:24/24 complete per-document JSON comparisons equal (12 body-negative reports and
12 response catalogs), including errors/unresolved/coverage/independent checks. All26 clean
output files, including the two environment/source-binding summaries, are archived under
clean-archive/. archive.json binds every original path, copy hash, prior report hash,
input, dependency metadata and comparison. No report is represented only by a summary.

Body:303operations/1414obligations/951constructed/463unresolved/2incomplete body inventories.
Response:303operations/567declarations/365media/329compiled schemas;130valid/3invalid/
9unresolved source example occurrences. Source examples are not live responses, and report
integrity passes are not whole-document/whole-skill completion.

35actual tests/216assertions pass (32+3), main tsc and explicit-script strict tsc pass.
commands.json retains outputs and command corrections (longpaths, missing test-name,
standalone tsc import-extension flag). None required changing candidate implementation.

## Offline setup and run

External prerequisites: Bun1.3.14, Node23.8.0, Git and tar. Set `$bunExe` to the local
Bun executable. Use Git longpaths for subsequent status checks as well as checkout.

```powershell
git -c core.autocrlf=false -c core.longpaths=true worktree add --detach .worktrees/family-extended-clean-rerun be89a5004e11271e45b1a6b266e3fd14ee0deff3
cd .worktrees/family-extended-clean-rerun
tar -xzf D:/skill优化/SkVM-offline-packages/family-request-20260911/dependencies.tgz
& $bunExe scripts/skill-ir/skill-family-offline-dependencies.ts --root=node_modules --verify=results/skill-ir/skill-family-request-clean-20260911/dependencies.json
& $bunExe scripts/skill-ir/api-request-specimens-development.ts --profile=body-negatives --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/extended-clean-body
& $bunExe scripts/skill-ir/api-response-schema-development.ts --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/extended-clean-response
node node_modules/typescript/bin/tsc --noEmit
```

Before extraction verify archive SHA256
`9c8c5d6bd95a8bc768312c66911f45edfb97e4cecd2555cf657ffc57e604e4a6`.
The archive is an explicitly retained external input, not an implicit cache; configure its
location if moved. 18944 installed files /163588897 bytes were reverified. Dependency
manifest SHA256 is ab7226267d6ca8c9a10101c9b2a0987dcc731b440cd43eb014a7d11114b5a6c7.
This establishes installed-byte reproducibility, not independent registry provenance.
Input/source files are committed and their hashes are checked by both runners.

The collector archive-run.ts is a post-run evidence helper, not part of candidate runtime.
Run it from the current development repository with explicit --checkout and a new --out
directory to retain copies and compare against the committed first-run reports. It checks
expected checkout identity and no tracked changes before reading outputs. Runtime versions,
commit/source bindings and timings in summary reports are separate from semantic comparison.
Mixed-EOL development package.json versus LF checkout is already documented by the first
clean run; this report records the actual LF hash instead of claiming raw-byte equality.

No remote API, loopback, model or paid calls in this reproduction. Development-agent costs
remain separately unmeasured. All checkouts, original reports and dependency archive retained.
