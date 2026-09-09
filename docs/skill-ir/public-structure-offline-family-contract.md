# Public-Structure Offline Responsibility Family Contract

## Purpose

This development component defines a falsifiable responsibility family for public-structure-driven offline conversion and reporting. It keeps four questions separate:

1. whether a complete responsibility belongs to the family;
2. whether public evidence is sufficient to verify it;
3. whether public evidence is sufficient to construct it;
4. whether the current SkVM implementation supports every required capability on new inputs.

It does not classify a whole skill from one easy operation, infer family membership from a candidate result, or establish ecosystem prevalence. The current matrix is retrospective and uses only already exposed project evidence. Prospective evidence is `pending-not-observed`.

## Contract and runtime

The implementation is in [`public-structure-offline-family-contract.ts`](../../src/benchmarks/skill-ir/public-structure-offline-family-contract.ts). It provides strict Zod schemas and deterministic functions for:

- responsibility assessment;
- dependency-graph validation and propagation;
- lossless responsibility-to-skill aggregation;
- evidence-file digest and marker verification;
- machine report construction.

The bound inputs are:

- [`public-structure-offline-family-contract-v1.json`](../../benchmarks/skill-ir/classification/public-structure-offline-family-contract-v1.json), containing the nine criteria and nine evidence-file bindings;
- [`public-structure-offline-family-counterexamples-v1.json`](../../benchmarks/skill-ir/classification/public-structure-offline-family-counterexamples-v1.json), containing seven already exposed examples and their expected derived assessments.

`verifyPublicStructureOfflineFamilyFiles` reads both files, verifies their mutual digest binding, re-reads all evidence sources, checks every marker and evidence reference, derives every dependency-propagated assessment, and rejects any expected/derived drift. `buildPublicStructureOfflineFamilyReport` repeats that verification. The current source-bound report is [`revision-development-002/report.json`](../../results/skill-ir/public-structure-offline-family-contract-revision-development-002/report.json).

## Public interface

Key exports are:

- `deriveFamilyResponsibilityAssessment(input)`;
- `deriveFamilyDataset(input)`;
- `aggregateFamilySkill(scope, assessments)`;
- `verifyPublicStructureOfflineFamilyArtifacts(options)`;
- `verifyPublicStructureOfflineFamilyFiles(options)`;
- `buildPublicStructureOfflineFamilyReport(options)`;
- the strict schemas and fixed identity/path constants used by those functions.

The thin CLI accepts only a repository root, an exclusive output path, and an ISO completion time. It intentionally has no source-selection option:

```powershell
bun ./src/benchmarks/skill-ir/public-structure-offline-family-contract-run.ts --root=. --out=results/skill-ir/public-structure-offline-family-contract-revision-development-002/report.json --completed-at=2026-09-09T22:47:48.004Z
```

Output creation uses `wx`; an existing report is not overwritten.

## Family criteria

Seven criteria are necessary family conditions:

- `public-input-structure`;
- `explicit-output-responsibility`;
- `offline-deterministic-transformation`;
- `public-verification-contract`;
- `declared-dependency-closure`;
- `bounded-side-effects`;
- `no-unbound-semantic-decision`.

`current-capability-readiness` is a current engineering limit, not part of family membership. `cross-repository-generalization` is an unverified hypothesis, not a satisfied family condition. The verifier rejects role drift or omission of any of the nine criterion IDs. A necessary family condition may cite only `public-contract`, `source-contract`, or `validation-report` evidence; implementation and capability-profile evidence cannot define family membership.

`declared-dependency-closure` asks whether the dependency universe is public, named, and bounded. A particular source may still have an open or invalid dependency instance. This is why the Meilisearch example can remain in-family while construction is blocked by a missing local parameter target.

## Derived states and aggregation

Family membership is `in-family`, `out-of-family`, or `family-membership-unknown`. Verifiability and constructibility are derived independently. Source validity and dependency closure remain separate, and current support is considered only after family membership and construction evidence are assessable.

Failure attribution is multi-valued: rule insufficiency, missing verification or construction evidence, missing capability, source defect, open dependency, external semantic choice, environment limit, and implementation failure may coexist.

Every responsibility must appear exactly once in a skill scope. Dependencies must remain within the same skill and form an acyclic graph. Aggregates are `all`, `mixed`, `none`, or `incomplete` and preserve responsibility, evidence, support, and failure counts. A partially supported skill is never relabelled as completely automated.

## Actual development result

The report verifies nine criteria, nine evidence files, seven examples, and six skill aggregates. Of the seven examples, five are in-family, one is out-of-family, and one has unknown membership. Four are constructible and two are currently supported. These counts describe the selected retrospective examples only.

The Meilisearch missing local reference remains a construction blocker. Bangumi external response references remain a source-validity advisory, and its capability evidence remains not new-input-ready. No held-out or Q1-reserved input was accessed; prospective results, model calls, business API calls, and paid calls are all zero. Development-agent usage is accounted separately as host-external and is not measured by the runner.

## Verification

Run:

```powershell
bun test ./src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

Tests cover orthogonal states, evidence requirements, candidate-result exclusion, complete denominators, cycles, dependency propagation, real source bindings, five tamper classes, report construction, and CLI argument closure.

## Failure modes and modification notes

- Any evidence byte or locator marker drift fails verification; update a binding only after reviewing the changed source claim.
- Unknown facts require a named evidence gap. Determinate facts require at least one evidence ID.
- Candidate outcomes are not an allowed evidence kind.
- CLI output must be repository-relative and contained; absolute paths and parent traversal are rejected before any directory is created.
- A responsibility cannot be split after classification to manufacture an easier denominator.
- Adding or removing criteria requires a new schema/identity; do not silently repurpose an existing role.
- New examples must preserve complete skill scope and dependency closure and must not import prospective, held-out, or Q1-reserved results without a separately authorized stage.

This component supports Task 8's future preregistered corpus work. It does not by itself prove cross-repository generalization, new-skill onboarding, real API behavior, readiness, or human savings.

## Preserved review evidence

Independent review after the first checkpoint found three missing gates: necessary-criterion evidence kinds were not restricted, CLI output could escape the repository root, and expected example assessments were checked before dependency propagation. Each issue was reproduced by a failing test before repair. The machine failure record is [`failure.json`](../../results/skill-ir/public-structure-offline-family-contract-review-001/failure.json).

The original report and `revision-development-001` remain archived and are marked superseded in that failure record. The current `revision-development-002` report has file SHA-256 `d2860261a1bbe0dae45c531d8c1b733ba177dbf23a97e5684473cda0562cc8ee` and portable semantic SHA-256 `db5c27e2441a427b1a6ac3d53b809b45ad29ede81bc9747ddd696686fccc90c9`.
