# Clean reproduction result

Exact checkout d088f4e, independent detached worktree
.worktrees/family-request-clean-lf-20260911. Fifteen focused tests/88 assertions pass;
`node node_modules/typescript/bin/tsc --noEmit` exits0. Three members ×12 tasks reproduce
the full request specimen payload, independent verification and source obligations exactly:
36/36 equal, no task errors. Original API sources remain the same12 exposed documents.

The explicit dependency archive is retained at
D:/skill优化/SkVM-offline-packages/family-request-20260911/dependencies.tgz
(36008491 bytes, SHA2569c8c5d6bd95a8bc768312c66911f45edfb97e4cecd2555cf657ffc57e604e4a6).
dependencies.json binds18944 regular files/163588897 bytes and rejects symbolic entries.
Every extracted file was compared before runtime. This is an archive of installed dependencies
paired with fixed bun.lock, not an independent proof of registry/supply-chain provenance.

First checkout with Windows default conversion changed raw file hashes despite clean Git
status. It is retained at .worktrees/family-request-clean-20260911; no candidate tasks ran there.
The LF checkout uses `git -c core.longpaths=true -c core.autocrlf=false worktree add --detach`.
Original package.json contains mixed line endings: normalized-LF and parsed content match,
raw hashes differ and are explicitly recorded in comparison.json. bun.lock and the checked
core execution source bytes match. No tracked changes exist after the clean run; its output
is intentionally untracked in the checkout and fully copied here as clean-run/.

archive.json maps original checkout-relative report paths to archived copies with hashes.
Do not discard clean-run/report.json or rely only on regeneration. comparison.json holds
per-task semantic comparisons; clean-tests.json records test output. No model/API calls or
dependency downloads were used during reproduction. Bun1.3.14/Node23.8.0 are explicit runtimes.

Reproduction from a fresh checkout of d088f4e with Windows longpaths/autocrlf settings:

    tar -xzf <explicit-dependencies.tgz>
    bun <preparation-tool-root>/scripts/skill-ir/skill-family-offline-dependencies.ts --root=node_modules --verify=<dependencies.json>
    bun scripts/skill-ir/skill-family-baseline.ts --config=results/skill-ir/skill-family-request-specimens-development-20260911/cross-member-config.json --out=results/skill-ir/request-specimen-clean-reproduction
    node node_modules/typescript/bin/tsc --noEmit

The dependency preparation/verifier is archived in the parent development revision, not
part of the older execution checkout. Provide its location explicitly. Do not use either
historical001/002 runner. Original source duties/native formats/live behavior remain incomplete.
