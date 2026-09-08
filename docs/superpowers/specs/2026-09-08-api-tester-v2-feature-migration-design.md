# API Tester v2 feature-stratified migration design

Date: 2026-09-08

Status: approved for one freeze and one immutable first run

## Decision

Freeze the current API Tester v2 constructor as a new candidate and evaluate it once on a feature-directed panel of six new real public OpenAPI inputs plus four synthetic boundary inputs. The panel tests fixed-profile input migration through the existing `skvm artifact --preset=api-tester --binding=...` product route. It does not add OpenAPI features, change the checker or package, or test a new skill/profile.

The identities are:

- candidate: `skill-ir-api-tester-constructor-candidate-v2-001`;
- panel: `skill-ir-api-tester-v2-feature-migration-001`;
- immutable result: `results/skill-ir/api-tester-v2-feature-migration-001/first-run-report.json`.

## Candidate freeze

The candidate binds the executed product surface, not only the parser algorithms. Its digest set includes:

- `bin/skvm.js` and `bin/skvm-route.js`;
- `src/cli/artifact.ts` and `src/skill-ir/verified-artifact-presets.ts`;
- the v2 contract, program generator/checker source, and artifact runner;
- the shared safe-path and SHA-256 helpers used by the v2 route;
- `package.json` and `bun.lock`, plus the observed Bun and Node versions used for the run.

The snapshot records `api-tester-openapi-subset-v2`, the supported and rejected surface, and the independent-checker boundary. The listed files and dependency lock are an explicit execution surface; they are not claimed to be a general JavaScript module-graph proof.

## Sample selection and strata

Selection happens by public structural review before any candidate or unified-CLI run. The frozen real denominator is six independent documents from six independent upstream repositories:

- two primarily selected for bounded same-document component `$ref`;
- two primarily selected for primitive-array request-body properties;
- two primarily selected for query `style=form, explode=true` primitive arrays.

An input may contain more than one feature, but it has exactly one primary stratum and counts once. The lock records secondary features without duplicating the row. Every real input binds repository, full commit, repository path, raw URL, content bytes/SHA-256, and repository license bytes/SHA-256. Selection cannot use a constructor trial as a filter. Inclusion and exclusion reasons are preserved.

The panel cannot reuse Open-Meteo, DPP, OpenWrt, SignalK, an existing API Tester fixture, held-out material, or a source selected for the original Q1 reserved prospective denominator. It is purposive feature coverage, not a random sample and not an estimate of ecosystem-wide OpenAPI admission.

Four repository-local synthetic boundaries separately test declared v2 rejection behavior. Boundary conformance is reported independently and cannot inflate real-input migration evidence.

## Prediction and freeze order

Before execution, every row has exactly one prediction:

- `accepted`, with the expected checker status `pass`; or
- `rejected`, with one stable rejection code.

The candidate, source/license cache manifest, ten bindings, four boundary fixtures, ten predictions, denominator, runner, and result schema must be committed and pushed first. The runner requires the full pushed commit SHA, verifies it is an ancestor of `origin/skill-ir-aot`, and checks working bytes against that commit before creating any result.

The freeze order is therefore:

1. inspect and cache public source bytes without invoking the constructor;
2. freeze candidate, selection, predictions, denominator, bindings, fixtures, and runner;
3. run deterministic tests on disposable non-panel fixtures;
4. commit and push the freeze;
5. execute the ten frozen rows exactly once through the unified CLI;
6. write the immutable report and stop.

## Execution and observation

Each row is attempted once. `retries=0`, `replacements=0`, `candidateFixes=0`, and every accepted, rejected, checker-failed, or infrastructure-failed outcome remains in the denominator. The CLI route is not replaced after seeing a result.

The runner invokes the top-level Node shim once per row and observes product milestones without modifying product code: package manifest creation, generated plan/report creation, validation report creation, and CLI completion. Per-row costs record input materialization, observed construction, generation, checking, and post-run evidence analysis. Timing resolution and any coalesced milestone are explicit; unavailable separation is never backfilled.

Every row records prediction parity, actual admission or rejection code, output/package/checker digests when present, checker execution/status, and whether any extra code, template, rule, or human modification was required. Model/API/paid calls are fixed at zero. The previously reported 467,220 development-agent tokens are a separate one-time historical development cost and are never offset by zero-token runtime.

## Claim boundary

A positive real row supports only this statement: the same frozen constructor, reached through the same unified CLI, accepted a new public input after changing only input data and ordinary binding parameters, generated an artifact, and passed its independent public-contract checker.

The panel does not establish arbitrary OpenAPI support, an ecosystem admission rate, human savings, an optimized LLM, new-skill onboarding, cross-profile transfer, held-out performance, portfolio promotion, or readiness. If real rows fail, the negative result is frozen. Any repair requires a new development record, a new candidate freeze, and new unseen evaluation inputs.

## Non-goals

This stage does not modify core, DSL, v1, v2 product behavior, checker, artifact package, scorer, old locks/results, Q1, Stage M/N, held-out, portfolio, or readiness. It does not add nested/composed schemas, external references, or another skill/profile.
