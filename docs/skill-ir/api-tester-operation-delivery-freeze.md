# API Tester operation ordinary-input delivery and freeze

## Purpose and boundary

This development component closes two delivery gaps without changing the
`api-tester-openapi-subset-v2` support contract. It validates the standalone
ordinary-input entry on the six already exposed sources, archives exact input
and output bytes, and freezes a still-unselected candidate. The historical
fixed-six runner and its v1/v2, 001/002, Task 1, Task 2, and dependency-revision
evidence remain read-only.

The missing historical
`api-tester-operation-dependency-verification-revision-clean-002/report.json`
is recorded as `missing-unarchived-original`. Its old path and expected SHA-256
remain authoritative historical metadata; a new clean identity supplements but
does not overwrite or retroactively verify that missing file.

## Components

- `api-tester-operation-input.ts` implements manifest-bound source reading,
  full operation analysis, projection, independent coverage/dependency checks,
  bounded v2 construction/checking, exact output closure, and strict replay.
- `api-tester-operation-input-run.ts` is the ordinary-input CLI. It accepts only
  `--root`, `--manifest`, and `--node`.
- `api-tester-operation-delivery-freeze.ts` uniformly validates the six exposed
  sources, compares semantic operation/admission/dependency/checker evidence to
  the repaired dependency-revision report, builds exact archive manifests, and
  builds the candidate closure.
- `api-tester-operation-delivery-freeze-run.ts` creates a fresh validation
  archive; `api-tester-operation-delivery-verify-run.ts` strictly re-verifies an
  existing archive.

No component calls a model, remote API, or paid service. Development-agent
usage is reported separately from zero-cost artifact runtime accounting.

## Ordinary-input manifest and runtime

The `skill-ir-api-tester-operation-input-manifest/v1` JSON binds a caller
`bindingId`, the literal v2 support-contract id, a safe-relative input path,
declared `json` or `yaml` format, byte count, SHA-256, and a previously absent
safe-relative output directory with `exclusive-create-once` mode.

```powershell
bun ./src/skill-ir/api-tester-operation-input-run.ts `
  --root=<input-root> --manifest=<manifest.json> --node=<node.exe>
```

The output contains `operation-inventory.json`, `report.json`, and
`output-manifest.json`. Accepted operations additionally produce a projected
input and the complete v2 artifact/checker closure. Rejection, unresolved state,
and source-validity advisories are retained. The strict verifier re-reads the
source, independently reconstructs the operation universe and dependencies,
derives report facts instead of trusting a rehashed report, validates the v2
package, and rejects missing, changed, or extra files.

## Six-source validation and archive

Create a fresh archive using only the digest-bound exposed cache:

```powershell
bun ./src/skill-ir/api-tester-operation-delivery-freeze-run.ts `
  --root=. --cache-root=<exposed-cache> --node=<node.exe> `
  --out=results/skill-ir/api-tester-operation-delivery-freeze-development-001/main
```

Re-verify every archived byte and semantic comparison:

```powershell
bun ./src/skill-ir/api-tester-operation-delivery-verify-run.ts `
  --root=. `
  --archive-root=results/skill-ir/api-tester-operation-delivery-freeze-development-001/main `
  --node=<node.exe>
```

The validated main archive reports 6 documents, 562 operations, 112 accepted,
449 rejected, 1 unresolved, 112 checker-passed operation artifacts, and
575/575 contract obligations covered. Its portable semantic SHA-256 is
`137984f7aae7a1ff38a253afd98f965e463ef6686b4a79ff7a7ec6a86baf87ac`.
Meilisearch `GET /tasks` remains blocked by the missing local
`#/components/parameters/total`; 19 accepted Bangumi operations retain external
response-reference source-validity advisories. These facts do not establish
whole-document success or live API behavior.

## Preserved development failures

`attempt-001` records incorrect baseline inventory-root resolution before a
source run. `attempt-002` preserves the six complete outputs that exposed an
overbroad source-blocker classification. `attempt-003` preserves the six
strictly verified outputs that exposed obsolete aggregate field names. Each
attempt has a machine-readable `failure.json`; none is silently discarded or
counted as a passing archive.

## Verification and failure modes

Focused tests cover manifest/path/digest/format binding, output exclusivity,
fixed-six decoupling, operation omission and duplication, dependency loss,
artifact and exact-closure tampering, rehashed report-fact drift, external-ref
rejection versus missing-local-ref blocking, row semantic comparison, aggregate
report-field binding, and archive tampering. Typecheck and broader operation
regression are required before the candidate is finalized.

The candidate may be frozen only with `inputSelection=not-started`,
`predictions=not-authored`, `prospectiveRuns=0`, and empty row/prediction arrays.
It does not authorize selecting, reading, predicting, or running unseen inputs,
changing readiness, or claiming human savings.

Create the candidate only after the main archive passes strict replay:

```powershell
bun ./src/skill-ir/api-tester-operation-candidate-freeze-run.ts `
  --mode=create --root=. --node=<node.exe> --git=<git.exe> `
  --frozen-at=<ISO-timestamp>
```

Re-verify the committed candidate and its bound main validation archive with
`--mode=verify` and no `--frozen-at`. The snapshot is stored at
`benchmarks/skill-ir/classification/api-tester-operation-candidate-v1.json` and
binds both the main validation report and its exact archive manifest, the nine
runtime implementation files, package/lock digests, Bun 1.3.14, Node v23.8.0,
historical Task 1/Task 2/dependency-revision reports, and the immutable source
validity and claim policies.

Candidate verification also compares the main archive manifest's exact file
set with the Git `HEAD` tree. This prevents a locally present but ignored file
from making an unarchived candidate appear reproducible.
