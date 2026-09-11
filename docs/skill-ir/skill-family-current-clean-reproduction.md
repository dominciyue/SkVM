# Current development clean reproduction plan

## Scope, 2026-09-11

Last complete clean proof is be89a50. Subsequent UTF-8, branch/composition, form and
native pytest revisions need a new independent checkout. Do not overwrite or reinterpret
either old clean report. New identity: `skill-family-current-clean-20260911`.

Use the existing explicit Node dependency archive and manifest, verifying archive and
all18944installed files. Create a narrow Python dependency archive for the already
observed pytest8.3.3/httpx0.27.0 roots, with active transitive requirements evaluated for
the actual Python/platform, installed version satisfaction, individual paths/bytes/SHA
and excluded cache/external entrypoint reasons. No registry calls or network installation.
This records installed distribution provenance, not independently attested upstream
supply-chain integrity. Python3.12.13 remains an explicit external prerequisite, recorded
by version/executable digest; do not copy the whole Anaconda tree.

## Dependency tool contract and TDD

- Resolve required distribution closure using installed metadata; unmet versions or
  missing distribution files fail. Unselected optional extras remain recorded.
- Archive only regular files below the declared site-packages root. Skip bytecode and
  external console-script launchers with explicit reasons (`python -m pytest` is used).
- Before extraction validate archive SHA, exact unique member set, canonical relative
  names, size/digest and no symbolic/hard links. Write into an empty explicit directory;
  do not overwrite or escape via path components. Verify extracted file set/digests.
- Synthetic TDD covers missing/damaged files, traversal/duplicate members and changed
  archive or dependency requirements. Preserve failures. Never execute skill bodies or
  package entrypoint scripts.

## Clean run order and acceptance

1. Commit dependency tool/plan; record exact candidate. New detached LF worktree with
   core.longpaths enabled. Verify no tracked modifications.
2. Verify/install explicit Node archive. Create isolated no-pip venv using the explicit
   interpreter, extract/verify Python package archive; `-I -B`, no global inheritance.
3. Run current development body-negative, response, form and native suite entrypoints
   on exactly the same12exposed inputs. Never run historical001/002runner.
4. Compare full semantic artifacts against latest committed reports; native suite/Python
   bytes and actual pytest counts must match. Real HTTP stays0. Environment/time/path
   fields are separate, not required to be byte-identical.
5. Run focused regression and main/script typecheck in the checkout. Run hand-written
   native loopback with its own oracle; port/timing/workdir are environmental differences.
6. Archive ALL declared outputs with original bytes, per-file hashes, candidate and
   dependency bindings and commands. Check Git byte preservation independently; exclude
   only regenerable pyc caches.

Failures remain evidence; fix only development code with new revisions when needed.
Skipped native tests are not real API passes. Developer-agent costs remain separate.

## Python dependency implementation checkpoint

`scripts/skill-ir/python_offline_dependencies.py` has `pack`, `extract`, `verify` modes.
Six unittest cases include marker/version/extras checks, unknown external resource
rejection, canonical/portable paths, traversal/duplicate/link/digest corruptions and
complete file-set verification. An initial inventory test exposed overly broad outside-root
exclusion; only metadata-declared console launchers are now omitted. REDs retained.

Actual archive:13distributions,356files/3513557bytes,242bytecode entries and3declared
console launchers excluded.904839-byte archive at
`D:/skill优化/SkVM-offline-packages/family-current-20260911/python-dependencies.tgz`,
SHA256 `4337563df85d7ae9a6669aaf757b87e594189f077883bd03f5ecbd0b8dcac1de`.
Full versions, active/deferred requirements and file digests are in
`results/skill-ir/skill-family-current-clean-20260911/python-dependencies.json`.
This is an installed-package snapshot, not wheel/registry attestation.

```powershell
python -X utf8 -I -B scripts/skill-ir/python_offline_dependencies_test.py
python -X utf8 -I -B scripts/skill-ir/python_offline_dependencies.py extract --manifest=<manifest.json> --archive=<archive.tgz> --target=<empty-venv-site-packages>
python -X utf8 -I -B scripts/skill-ir/python_offline_dependencies.py verify --manifest=<manifest.json> --target=<venv-site-packages>
```

Preparation uses the explicit base Python; clean execution uses the newly created venv
interpreter. No activation script or global package installation is needed. See
[dependency requirements](https://packaging.pypa.io/en/stable/requirements.html) and
[venv isolation](https://docs.python.org/3/library/venv.html). Extraction checks all payloads
before writing, creates only new files, and never calls tar.extractall or executes launchers.

## Actual clean result (10:10 +08)

Candidate `883c85eb7c95057692ba1958613f8f76e4fd2c09` ran in the independent LF
`.worktrees/family-current-clean-20260911` checkout. Both dependency file sets verified
before and after execution; Python used the new no-pip venv, with no base site-packages.
All36 body/response/form per-document artifacts and24 native suite/code files are byte
identical to their respective latest committed references. Native per-document counts
and synthetic fixture semantics also match. No real API requests were made.

The complete112-file archive is
`results/skill-ir/skill-family-current-clean-20260911/clean-archive-r1/`;
`archive.json` binds inputs, candidate, dependencies, copied bytes and60 comparisons.
The first collection directory is retained: collection initially used `results` instead
of the native report's `rows` key. This was an evidence collector error, not a candidate
execution error; correcting it did not rerun candidates or overwrite initial outputs.
Use `archive-run.ts --checkout=<candidate-checkout> --out=<new-directory>` to collect.

Clean regression:24tests/3697assertions, main and four affected script typechecks pass;
six Python dependency tests pass. Standalone fixture15/15 designed faults detected with
15 local HTTP calls; the regression fixture made another15. Native-stage cumulative local
calls now123, real panel calls0. Skipped630 native cases are NOT API passes. Body971/1414,
form578/628, source response examples130valid/3invalid/9unresolved remain unchanged.

Run commands (Bun1.3.14, Node23.8.0, Python3.12.13; explicit dependency archives above):

```powershell
# In independent LF checkout at the exact candidate; INPUT is the existing bound index.
bun scripts/skill-ir/api-request-specimens-development.ts --inputs=<INPUT> --out=<NEW_FORM_DIR> --profile=form-specimens
bun scripts/skill-ir/api-response-schema-development.ts --inputs=<INPUT> --out=<NEW_RESPONSE_DIR>
bun scripts/skill-ir/api-pytest-development.ts --inputs=<INPUT> --out=<NEW_NATIVE_DIR> --python=<VENV_PYTHON>
bun scripts/skill-ir/api-pytest-loopback.ts --out=<NEW_FIXTURE_DIR> --python=<VENV_PYTHON>
node node_modules/typescript/bin/tsc --noEmit
git -c core.longpaths=true status --porcelain --untracked-files=no
```

Exact process outputs and preparation commands are in `commands-and-validation.json`.
Windows status without core.longpaths can falsely report deep tracked paths as deleted;
the explicit longpaths check is clean. Do not change tracked files to fix that diagnostic.
Python's default Windows stdout encoding rendered Chinese directory names lossily in
captured progress text; structured JSON bindings, files and XML remain authoritative.
This diagnostic limitation is retained and warrants a narrow future UTF-8 process fix.
