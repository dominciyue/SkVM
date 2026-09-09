# API Tester operation delivery and candidate freeze design

Date: 2026-09-09

Status: approved by the user for local development, testing, evidence repair, documentation, candidate freeze, and local commits

## Decision and identities

Close the two delivery gaps without changing the frozen v1/v2 product contract or the historical six-source runner. Add one ordinary-input operation entry under identity `skill-ir-api-tester-operation-input-development-001`, then freeze its exact execution closure as candidate `skill-ir-api-tester-operation-candidate-001`. Record the implementation, six exposed-source validation, clean reproduction, and the historical missing archive under the additive evidence identity `skill-ir-api-tester-operation-delivery-freeze-development-001`.

The old `api-tester-operation-development-run.ts` and its fixed selection/lock/`0/6` predecessor binding remain byte-for-byte unchanged. The new entry does not read that selection, either old experiment lock, any old result, row identity, or an expected acceptance count.

## Ordinary-input manifest and outputs

The CLI accepts only `--root`, `--manifest`, and `--node`. A strict, repository-independent manifest below `root` supplies:

- a caller-chosen binding id;
- an input path, declared `json`/`yaml` format, byte length, and SHA-256;
- a previously absent output directory below the same root;
- the literal unchanged support contract `api-tester-openapi-subset-v2`.

Paths are safe relative paths. The input and every traversed parent must be regular/non-symlink entries, the extension must match the declared format, and the bytes must match both length and digest before analysis. The output directory is exclusive-create-once and cannot overlap the input or manifest.

One run writes `operation-inventory.json`, `report.json`, and `output-manifest.json`. If at least one operation is accepted and enumeration, admission consistency, and every accepted-operation construction dependency pass, it also writes the accepted-operation aggregate as `projected-input.json`, the unchanged v2 package and validation evidence under `artifact/`, and copies the generated plan/report into that evidence directory. The output manifest lists the exact digest-bound closure except itself; the strict verifier treats that manifest plus its entries as the only allowed files.

The report distinguishes raw-source enumeration, accepted/rejected/unresolved counts, independent coverage, projection/construction/source-validity dependency dimensions, checker-pass operation count, contract obligations, whole-document disposition, runtime accounting, and claim boundaries. A mixed document may have verified local artifacts while remaining `partial`; no outcome denotes live API behavior.

## Reuse and independence

The entry composes the existing source parser/projection, operation admission analyzer, independent raw-source coverage/dependency verifier, and v2 artifact/generator/checker. It contains no source-name, repository-name, operation-path, or row-count success branches.

The strict verifier re-reads the manifest and original input bytes, checks the exact output closure, rebuilds the independent source universe, rechecks analyzer metadata and accepted-set conservation, reruns the dependency verifier against the archived aggregate projection, validates the v2 artifact package, and compares normalized contract and generated operation keys. It does not accept the constructor's operation list as the source universe and does not share a mutable list with the constructor.

External response references remain source-validity advisories when they are not construction obligations. A missing/invalid construction reference remains unresolved and blocks only the affected operation; the entry never invents the missing target.

## Validation set

TDD first covers a synthetic accepted document, mixed accepted/rejected/unresolved behavior, digest/path/output fail-closed cases, source-list omission/duplication, dependency loss, advisory preservation, artifact omission, and strict-closure tampering. The same entry then processes copies of the six already exposed digest-bound sources. Expected values are derived from verified reports and source bytes, never compiled into the entry.

Meilisearch `GET /tasks` must retain the missing `#/components/parameters/total` construction blocker. Bangumi operations with external response references must retain source-validity advisories while projection/construction may pass. Local artifact success cannot become document success or live API evidence. The frozen whole-document `0/6`, readiness, and human-effect conclusions do not change.

## Missing clean archive and replacement evidence

The historical dependency-revision main report remains immutable, including its reference to missing `api-tester-operation-dependency-verification-revision-clean-002/report.json` and SHA-256 `c4399a8a1fa5249b9061728105f08c65cad5e97d20dd9f68c9d24631910573d6`. Workspace and filename/digest searches found no recoverable copy. The new evidence report records this as `missing-unarchived-original`; it must not label the absent bytes verified or overwrite the old digest.

After the candidate implementation is committed, create a short-path detached checkout at that exact commit, install `bun.lock` with `--frozen-lockfile --offline`, reconstruct an archive-ready package from the already exposed sources and licenses, run the ordinary-input entry for all six documents, and rerun the dependency-revision reproduction-only entry. Copy the complete input/output/revision closure into the new result identity and bind every file by digest. A new strict verifier must validate the archive against the candidate commit's Git blobs, lock/runtime metadata, source-selection digests, semantic comparisons, and the new candidate snapshot. Re-runnability is not substituted for archived bytes.

## Candidate freeze and stop point

The candidate snapshot binds the ordinary entry, source/admission/projection, independent coverage/dependency verifier, v2 contract/generator/checker/artifact, path/digest helpers, `package.json`, `bun.lock`, Bun version, Node version, and support/claim policies. The delivery evidence binds that snapshot and the archived clean closure.

The snapshot explicitly records `inputSelection=not-started`, `predictions=not-authored`, and `prospectiveRuns=0`. It contains no prospective rows or per-row predictions. Once the two gaps are closed, the method is frozen and development extension stops. Any unseen selection, prediction, lock, or execution is a later separately preregistered stage.

## Protected boundary

Use only the six already exposed real sources and deterministic synthetic inputs. Do not run the frozen 001/002 first-run runner, access held-out/Q1 reserved material, start a new prospective/second profile/Q4, call a model/network API/paid service, modify frozen or old evidence, expand v2 support, change readiness, or claim human savings/ecosystem admission.
