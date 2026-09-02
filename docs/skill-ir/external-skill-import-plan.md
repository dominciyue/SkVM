# External Skill Import Implementation Plan

> **Execution requirement:** Use the `superpowers:executing-plans` workflow in this session. The user has explicitly requested main-agent execution without subagents.

**Goal:** Deliver a generic, executable local-source import CLI that produces a portable, exact-closure staging bundle and machine-readable manifest, then prove that the bundle works with the existing verified-artifact product CLI for one frozen Magpie public case and for a non-Magpie fixture.

**Architecture:** A strict recipe schema names every source, review, checker, and compact-evidence file by input root, relative source path, bundle target, and role. The importer preflights paths and static imports, copies exact bytes into a temporary directory, derives the existing verified-artifact workflow config using only bundle-relative paths, writes a digest-bound manifest, verifies the exact closure, and atomically publishes the bundle. Product execution remains a separate action through the existing SkVM CLI/library.

**Tech stack:** TypeScript, Bun, Zod, `node:fs/promises`, `node:path`, `node:crypto`, Bun test runner.

## Task 1: Lock the public recipe and manifest contracts

**Files:**

- Create: `src/skill-ir/external-skill-import.ts`
- Create: `src/skill-ir/external-skill-import.test.ts`

1. Add failing schema tests for a minimal non-Magpie recipe. Assert strict rejection of unknown fields, invalid commit digests, duplicate file ids/targets, invalid roles, and workflow references to the wrong role.
2. Run `bun test src/skill-ir/external-skill-import.test.ts` and confirm RED because the module/API does not exist.
3. Implement `ExternalSkillImportRecipeSchema`, `ExternalSkillImportManifestSchema`, public types, role-specific workflow references, and duplicate/cross-reference refinement.
4. Re-run the focused test and confirm GREEN.
5. Commit only these files with `feat(skill-ir): define external skill import contracts`.

## Task 2: Implement fail-closed paths and exact bundle verification

**Files:**

- Modify: `src/skill-ir/external-skill-import.ts`
- Modify: `src/skill-ir/external-skill-import.test.ts`

1. Add failing tests for absolute paths, backslashes, empty/`.`/`..` segments, NUL, symlinked files or ancestors, missing declared files, non-empty output directories, extra bundle files, deleted files, and digest drift.
2. Run the focused test and confirm each new group fails for the named reason.
3. Implement reusable relative-path validation, lstat-based non-symlink ancestry checks, exact directory enumeration, digest computation, closure digest computation, and `verifyExternalSkillImportBundle`.
4. Implement temporary sibling staging plus cleanup-on-failure and atomic rename without overwriting an existing output.
5. Re-run the focused test and confirm GREEN.
6. Commit with `feat(skill-ir): verify exact import bundle closures`.

## Task 3: Derive workflow config and enforce declared dependency closures

**Files:**

- Modify: `src/skill-ir/external-skill-import.ts`
- Modify: `src/skill-ir/external-skill-import.test.ts`

1. Add failing tests proving every workflow file reference is bundle-relative and points to a declared record of the correct role.
2. Add failing static-import tests for undeclared relative dependencies, relative imports escaping the bundle, unsupported external packages, and dynamic imports. Add passing cases for declared patch/checker dependencies and the narrow `node:*`/`zod` allowlist already accepted by the product audit.
3. Add failing compact-evidence tests for non-JSON evidence, forbidden `raw`/`model-run`/`workdir` path or content markers, absent measured evidence, and importer-side cost recomputation.
4. Run the focused test and confirm RED.
5. Implement `importExternalSkill`, workflow-config derivation through `VerifiedArtifactWorkflowConfigSchema`, static import resolution against declared target paths, evidence screening, exact-byte copy, manifest generation, zero-accounting fields, and no-cost-recomputation behavior.
6. Re-run the focused test and confirm GREEN.
7. Commit with `feat(skill-ir): build portable external skill bundles`.

## Task 4: Add the executable generic CLI

**Files:**

- Create: `src/skill-ir/external-skill-import-cli.ts`
- Create: `src/skill-ir/external-skill-import-cli.test.ts`

1. Add failing CLI tests for required flags, unknown flags, successful import, machine-readable stdout, and nonzero exit on invalid input.
2. Run `bun test src/skill-ir/external-skill-import-cli.test.ts` and confirm RED.
3. Implement `--recipe`, `--source-root`, `--asset-root`, and `--out`; parse the recipe strictly; call the public importer; print only a stable JSON result on success and a concise diagnostic on failure.
4. Re-run the CLI tests and confirm GREEN.
5. Commit with `feat(skill-ir): add external skill import cli`.

## Task 5: Make packaged review code executable under an external bundle root

**Files:**

- Modify: `src/skill-ir/verified-artifact-product.test.ts`
- Modify: `src/skill-ir/verified-artifact-product.ts`

1. Add a failing product test whose review patch and declared dependency live in a temporary root outside the SkVM checkout and whose explicit dependency imports an allowed SkVM runtime package. Execute the existing product workflow with that root and assert the package stage succeeds.
2. Run the focused external-root test and confirm RED at allowed runtime-package resolution for the project-external entrypoint.
3. Apply the smallest general fix: keep relative patch imports rooted in the staging bundle while resolving the existing narrow runtime dependency allowlist from the SkVM checkout. Leave plan runners, review audit semantics, and the bundle-not-runtime boundary unchanged.
4. Re-run the product test and the external-import tests; confirm GREEN.
5. Commit with `fix(skill-ir): bundle review patches from workflow root`.

## Task 6: Prove the same importer with a non-Magpie fixture

**Files:**

- Create: `src/skill-ir/fixtures/external-import-basic/source/SKILL.md`
- Create: `src/skill-ir/fixtures/external-import-basic/source/LICENSE`
- Create: `src/skill-ir/fixtures/external-import-basic/assets/task-description.json`
- Create: `src/skill-ir/fixtures/external-import-basic/assets/automatic-plan.json`
- Create: `src/skill-ir/fixtures/external-import-basic/assets/review-patch.ts`
- Create: `src/skill-ir/fixtures/external-import-basic/recipe.json`
- Modify: `src/skill-ir/external-skill-import.test.ts`

1. Add a failing fixture integration test that invokes the public importer, verifies its manifest and exact closure, moves the bundle away from both input roots, and verifies it again.
2. Add a source assertion that production importer/CLI code contains no `magpie` or known-skill-id branch.
3. Run the focused test and confirm RED because the fixture is absent.
4. Add the minimal fixture and explicit recipe; no automatic discovery and no project-specific branch.
5. Re-run the focused test and confirm GREEN.
6. Commit with `test(skill-ir): add generic external import fixture`.

## Task 7: Add the frozen Magpie one-case shadow

**Files:**

- Create: `benchmarks/skill-ir/pilots/magpie-release-audit/external-import-recipe.json`
- Create: `src/benchmarks/skill-ir/external-skill-import-magpie-checker.ts`
- Create: `src/benchmarks/skill-ir/external-skill-import-magpie-shadow.ts`
- Create: `src/benchmarks/skill-ir/external-skill-import-magpie-shadow.test.ts`
- Create after the run: `results/skill-ir/external-skill-import-magpie-shadow-v1/report.json`

1. Add a failing shadow test that builds a bundle from the explicit recipe and fixed local P1 assets, materializes only `step-0-preflight/case-1-clean-pass`, invokes the existing product CLI/library with `rootDir=<bundle>`, runs the existing product validator, and compares the output SHA-256 with frozen P1 digest `3a83e0530c3a04a81dcbb25d8488ec2f19a8da3417f109e6980481d5a3ce4a4e`.
2. Assert the P2 bundle contains neither raw/model-run/workdir/model text/observations nor original-checkout absolute paths or secrets. Assert all accounting counters and original rerun count are zero.
3. Run `bun test src/benchmarks/skill-ir/external-skill-import-magpie-shadow.test.ts` and confirm RED because the recipe/runner/checker adapter are absent.
4. Add a one-case digest checker adapter and hand-authored explicit Magpie recipe. List the primary public skill/license, review patch and every relative patch dependency, the self-contained checker entry, and only the compact P1 003 report needed by measured runtime metadata. Do not edit any P1 source, runner, config, closure, or report.
5. Implement the shadow runner, generate the compact P2 report from the successful one-case result, and validate it through its schema in the test.
6. Re-run the shadow test and confirm GREEN. Run it again with an isolated temporary output to prove deterministic digests.
7. Commit with `feat(skill-ir): validate magpie external import shadow`.

## Task 8: Synchronize authoritative documentation and stage log

**Files:**

- Modify: `docs/skill-ir/external-skill-import.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/skill-ir/README.md`
- Modify: `D:/skill优化/conversation_log.md`

1. Update the component document to the exact shipped schemas, public API, CLI stdout/error contract, bundle layout, runtime sequence, verification commands, assumptions, and failure modes.
2. Add the confirmed P2 staging contract and one-case/non-Magpie results to the repository spec and implementation plan without changing research claims beyond the evidence.
3. Add links from the skill-IR docs index. Append a dated stage record to the external conversation log with files, decisions, commands/results, docs changes, and residual risks.
4. Run the documentation-link checker used by the repository and `git diff --check`.
5. Commit with `docs(skill-ir): document external skill import p2`.

## Task 9: Fresh completion verification and final commit audit

**Files:** No intended source changes; only repair proven failures.

1. Read and apply `superpowers:verification-before-completion` before making any completion claim.
2. Run focused importer, CLI, external-root product, non-Magpie, and Magpie-shadow tests from a clean process.
3. Run the broader verified-artifact product tests and `bun run typecheck`.
4. Re-run bundle verification, scan `workflow-config.json` and `import-manifest.json` for drive-letter/UNC paths and secret-like fields, and enumerate the bundle to prove the exact closure.
5. Use a staged-index archive or equivalent isolated checkout verification so tracked tests cannot depend on unrelated untracked workspace files.
6. Run `git diff --check`, inspect `git status --short --branch`, and review every commit/file against the P2 boundary. Do not stage or remove pre-existing untracked files.
7. If verification exposes a defect, add a reproducing test first, make the minimal repair, update documentation/log evidence, and commit the repair by purpose.
