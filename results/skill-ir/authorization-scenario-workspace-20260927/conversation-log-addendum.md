# AF entries for the root conversation log (AE appends)

## 2026-09-27 — AF0 baseline and coordination

- Read both AGENTS files, current-status, AF0-AF8 taskbook, research 7.25-7.26,
  composer/tests, v2 lowering, loader/check and AC example. HEAD 803dc754 on
  skill-ir-aot; seven pre-existing dirty source files and historical untracked
  artifacts were left untouched.
- Created AF status/owned paths and explicit execution sequence. Existing composer
  owns whole-field replacement semantics; no duplicate replacement language.
- Found current loader's parent-relative root ban conflicts with relocation into
  a new output directory. AE implemented the shared pure-value loader and relative
  root support; AF wrote no shared file or Git state.

## 2026-09-27 — AF1-AF4 contract, planning, publication and CLI

- Added three workspace modules, their tests and standalone CLI/handler test.
  Contract suite first failed 36 cases with a permissive stub then passed 37;
  planning stub failed eight tests then passed eight; publication stub failed two
  success/race cases then passed; CLI stub failed ten tests then passed. Later
  focused cases expanded malformed-value and provider-import coverage.
- File coordinates are explicit, sources are not copied, policy location text is
  preserved, omissions are not synthesized. Replacements carry author origins and
  non-semantic sidecars record hashes/relocation.
- Added Windows full-directory non-overwriting publication with exact staging
  identity cleanup. Other platforms explicitly fail before writing; no misleading
  POSIX rename fallback. Competing complete and empty output directories are
  preserved. This limitation and existing-parent/same-volume requirements are
  synchronized into the AF taskbook/README/integration draft.
- Initial typecheck identified two local test/schema inference mismatches; fixed
  literal acceptance typing and explicitly required composer value mapping.

## 2026-09-27 — AF5-AF7 synthetic reuse, portability and handoff

- Added one complete synthetic project, base, config, three explicit replacement
  files and README. Independently authored expected declarations prove equal v2
  lowering. No real research oracle or protected sample was read.
- Main task found relocation could widen a junction boundary. A dedicated failing
  test reproduced valid-when-invalid; checking at original authored coordinates
  fixed it, with final-coordinate staged-byte checks retained.
- `bun run ./results/skill-ir/authorization-scenario-workspace-20260927/verify-ordinary.ts`
  passed: copied workspace outside checkout, standalone preview/generate, three
  real ordinary CLI checks, a one-field policy edit/new generation and three more
  checks; old output/source bytes preserved and exact temporary workspace cleaned.
- Final focused tests, typecheck and file ownership/hashes are in ready/verification.
  No business provider call, target execution, dependency install, index write,
  commit or push. Human time and token savings remain unmeasured. AE integrates
  shared help/routing/docs and publishes; AF stops writes after atomic ready.
