# AI-assisted development routing and prospective construction

Status: development protocol, 2026-09-07

## Purpose

This protocol separates two questions that were previously coupled:

1. Can existing AI-produced classification material support engineering migration and constructor development?
2. Do two independent humans agree on the original Q1 classification task?

Only the first question is pursued here. The original Q1 human experiment remains incomplete, and its A/B submission paths, denominator, and claims are unchanged.

## Identities and artifacts

| Identity | Artifact | Role |
| --- | --- | --- |
| `skill-ir-ai-assisted-development-routing-001` | `benchmarks/skill-ir/classification/ai-assisted-development-routing-v1.json` | one 24-unit development routing table derived from preserved AI revision-2 drafts |
| `skill-ir-api-tester-constructor-candidate-001` | `benchmarks/skill-ir/classification/api-tester-constructor-candidate-v1.json` | frozen capability and source snapshot of the existing API Tester constructor |
| `skill-ir-api-tester-constructor-prospective-001` | `benchmarks/skill-ir/pilots/api-tester/prospective-construction-001/experiment-lock.json` | eight-row prospective selection and prediction lock |

The first prospective result is written to:

```text
results/skill-ir/api-tester-constructor-prospective-001/first-run-report.json
```

## Development routing table

The table consolidates 24 unique units from:

```text
D:/skill优化/q1-ai-annotation-2026-09-07/a/revision-2/
D:/skill优化/q1-ai-annotation-2026-09-07/b/revision-2/
```

The source drafts and change records remain untouched. The table binds their bytes, records both row sources and revisions, and exposes named unknowns. Matching labels do not constitute inter-annotator agreement: both revision-2 drafts were repaired by the same AI process with cross-draft and project-result visibility.

This artifact may support development routing and gap discovery. It may not support claims of human agreement, classification accuracy, or completion of Q1.

## Candidate freeze

The candidate snapshot binds the current API Tester production-binding development implementation and the historical Q2 profile. It lists the current admitted surface, stable rejection codes, generator, runtime, and checker. It does not alter Q2 and does not claim broader OpenAPI support.

The checker validates the candidate's normalized public contract. It is not a complete OpenAPI validator and does not prove semantics outside the public contract. A stable rejection code means only that this candidate does not admit that input.

## Prospective first round

The denominator is fixed before execution:

```text
real public inputs:     4
synthetic boundaries:  4
total:                 8
retries:               0
replacements:          0
```

Selection, byte digests, license digests, and predictions are frozen in the lock and pushed before any candidate run. The runner verifies the external cache and the pushed freeze commit. It then processes every row once and retains every outcome in the denominator.

The report separates the two strata. Boundary behavior is implementation conformance; it cannot be used to inflate real-input admission.

## Cost accounting

Costs are kept in separate fields:

- AI analysis: platform-side activity, `not-measured` by this project runner;
- construction: local deterministic candidate work, with duration plus `modelCalls=0`, `apiCalls=0`, `paidCalls=0`;
- run/check: local deterministic execution duration;
- actual human modification: prospective observed minutes and a note; zero means no human modification was observed, not that human work has been eliminated.

No human-savings claim is allowed without an actual human measurement protocol.

## Immutability and follow-up

The first-run report is immutable evidence. A failure is frozen as a negative result. The current round does not permit candidate changes, route switching, replacement inputs, or follow-up retries.

Later expansion must respond to the observed gap with a new candidate identity, a new capability snapshot, and new unseen inputs. Reusing the same first-round inputs as a fresh prospective test is forbidden.

## Verification

The implementation must provide focused tests for:

- routing-table schema, provenance, digest binding, and 24-row uniqueness;
- capability snapshot closure and historical-Q2 non-mutation;
- exact 4+4 lock denominator and prediction completeness;
- lock-to-freeze-commit verification;
- offline source-cache digest verification;
- fail-closed, once-only result accounting and separate strata/cost summaries.

Before the freeze commit, regenerate into disposable paths or remove only the exact intended output first; the checked-in generators use exclusive creation and will not overwrite evidence. The committed artifacts are verified with:

```powershell
bun test ./src/benchmarks/skill-ir/ai-assisted-development-routing.test.ts ./src/benchmarks/skill-ir/api-tester-constructor-prospective.test.ts
bun run typecheck
```

After the freeze commit has been pushed, run the prospective panel exactly once. Use the full pushed commit SHA and the previously digest-verified external cache:

```powershell
bun ./src/benchmarks/skill-ir/api-tester-constructor-prospective-first-run.ts `
  --root=D:/skill优化/SkVM `
  --cache-root=D:/skill优化/.tmp-api-prospective-20260907 `
  --freeze-commit=<full-pushed-sha> `
  --node=<absolute-node-executable> `
  --out=D:/skill优化/SkVM/results/skill-ir/api-tester-constructor-prospective-001/first-run-report.json
```

The two printed lines are part of the execution preflight: one fixes the eight-row zero-call budget, the other confirms one attempt per row with no retries, replacements, or candidate fixes. If freeze verification fails, stop without creating a result and do not weaken the lock.
