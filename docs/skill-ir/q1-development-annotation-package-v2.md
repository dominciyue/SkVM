# Q1 development annotation package v2

Date: 2026-09-06. Status: ready for distribution; no annotator submission has started. Package identity: `q1-development-annotation-package-002`. Method identity: `skill-ir-task-automation-classification/v2`.

## Purpose

This package is the checkpoint between the Q1/Q2 design freeze and real independent annotation. It gives annotators a complete, version-bound denominator and gives reviewers a machine-verifiable way to reject common omissions, fabricated units, stale capabilities, invalid evidence, and inconsistent semantic-impact graphs before any agreement statistic is calculated.

It does not contain labels, adjudications, agreement results, prospective sources, execution outcomes, or Q3/Q4 authorization.

## Frozen artifacts

| Artifact | Role |
|---|---|
| `classification-handbook-v2.md` | Standalone annotation rules, four evidence dimensions, four states, semantic-impact graph rule, and frozen statistics |
| `q1-development-sources-v1.json` | Historical 12-source development selection and 12 still-unselected prospective slots |
| `q2-current-capabilities-v1.json` | Exact 21-capability/3-profile snapshot used when deriving predictions |
| `q1-development-remote-source-verification-v2.json` | Git-object verification of the four remote development packages at their fixed commits |
| `q1-development-annotation-package-v2.json` | 12 source views, 24 complete units, source locators, slice boundaries, dependencies, and all digest bindings |
| `q1-development-annotation-form-a-v2.json` | Blank slot A form; no identities, evidence, choices, predictions, or result data are prefilled |
| `q1-development-annotation-form-b-v2.json` | Blank slot B form with the same 24 unit keys and a distinct slot |

The annotation package SHA-256 is `197fb89fca2567e3367c9443b6a077ed45d826c24aa69b0d0e395515a8469ee1`. Both blank forms bind this exact digest. If any package byte changes, both forms fail closed and a new package revision is required.

The handbook is explicitly marked `text eol=lf` in `.gitattributes`. This keeps its bound byte digest stable in clean Windows checkouts even when the operator has `core.autocrlf=true`; the focused package test checks the Git attribute before verifying the package.

## Denominator

The unitization rule is one annotation unit per selected responsibility. Every included responsibility from the v1 source list appears exactly once; every excluded responsibility appears zero times.

| Source | Units | Selected slice |
|---|---:|---|
| Env Manager | 2 | public static Env report |
| Law to Markdown | 3 | public TXT structure subset |
| Experimental Design | 2 | public allocation graph |
| API Tester | 2 | OpenAPI offline plan |
| zh-code-reviewer | 2 | supported pattern evidence |
| zh-readme | 2 | source-bound repository facts |
| i18n-helper | 4 | React+i18next public subset |
| BIDS | 2 | public schema repair |
| changelog-automation | 2 | Conventional Commit snapshot |
| openapi-spec-generation | 1 | existing spec validation |
| Anthropic PDF | 1 | fillable form structure |
| Anthropic webapp-testing | 1 | local server lifecycle |
| **Total** | **24** | **12 development sources** |

Dependencies are source-local and acyclic. Unit descriptions, locators, and dependency edges are package data, not annotator-editable fields.

## Source access

Eight local packages expose 34 workspace-bound files. Every entry records source-relative path, repository-relative workspace path, bytes, and SHA-256; verification re-reads all files and also reuses the v1 source-authority check.

Four remote packages expose 23 commit-pinned read-only GitHub URLs. The freeze fetched exactly two already selected development repositories and resolved:

- 4/4 fixed commits;
- 23/23 package file Git blob IDs and byte counts;
- 4/4 license SHA-256 values.

The verification report records two repository fetches separately. Project audit fields remain `modelCalls=0`, `apiCalls=0`, `paidCalls=0`, and `heldOutAccesses=0`; they do not conceal the source-provenance network fetches.

Remote source bytes are not vendored. Annotators must use the exact commit-pinned URLs in the package. A floating branch, mirror, summary, or later version is not an equivalent source view. Anthropic PDF remains subject to its proprietary license and is classification material only.

## Annotation workflow

For a Chinese field-by-field walkthrough, including the required form-to-submission schema conversion, see [真人填表操作说明](q1-human-annotation-walkthrough-v2.md). It adds no labels or changes to the frozen handbook/package.

1. Give A and B the same repository commit, v2 handbook, annotation package, and their separate blank form. Do not expose peer labels or task execution results.
2. Before work starts, verify both blank forms against the package. They must each contain all 24 keys and only null classification fields.
3. Each annotator fills the four evidence dimensions and prediction for every unit, replaces the null metadata with their real identity, attestations, and timestamp, and saves a separate `annotation-submission/v2` file.
4. Run `verifyAnnotationSubmissionV2`. It reads the package file from the submission, computes the real package digest, validates every bound document and source view, checks exact denominator coverage and evidence locators, and re-derives all 24 predictions.
5. Preserve both original submission files. Only after both pass should they be combined into an `annotation-batch/v2` with status `independent-complete` and no adjudications.
6. Run `verifyAnnotationBatchV2` to produce overall agreement, per-source agreement, the directional 4×4 state confusion matrix, and four evidence-dimension disagreement counts.
7. Adjudicate only the prediction disagreements in a later `adjudicated` batch. Never rewrite the raw submissions or v2 handbook after seeing results.

## Machine interfaces

The implementation is `src/benchmarks/skill-ir/task-automation-classification.ts`:

- `DevelopmentAnnotationPackageV2Schema`
- `BlankAnnotationFormV2Schema`
- `AnnotationSubmissionV2Schema`
- `AnnotationBatchV2Schema`
- `validateDevelopmentAnnotationPackageV2`
- `verifyDevelopmentAnnotationPackageV2`
- `verifyBlankAnnotationFormV2`
- `verifyAnnotationSubmissionV2`
- `verifyAnnotationBatchV2`
- `summarizePreAdjudicationAgreementV2`

The v1 exports remain available only for historical records. New annotation data must use v2 identities.

## Verification

```powershell
cd D:\skill优化\SkVM
bun test ./src/benchmarks/skill-ir/task-automation-annotation-package.test.ts
bun test ./src/benchmarks/skill-ir/task-automation-classification.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

The focused package test proves the real 12/24 denominator, 34 local files, 23 remotely verified files, four bound document digests, identical A/B label keys, distinct A/B slots, and exact package digest. Synthetic negative tests cover common omission, fabricated source/unit, package drift, dangling semantic targets, missing semantic dependency paths, and incorrect prediction derivation.

## Fail-closed conditions

Reject the package, form, submission, or batch when any of these occur:

- package, handbook, source list, capability profile, or remote verification digest drift;
- a checkout no longer applies LF normalization to the bound v2 handbook;
- a development source, selected responsibility, unit, source locator, or local source file is missing or unknown;
- both annotators omit the same unit or add the same fabricated unit;
- an annotator cites another source or a locator outside the unit's frozen view;
- a capability reference or declared prediction does not match the frozen profile and machine derivation;
- a semantic impact target is missing or lacks a dependency path from the choice-bearing unit;
- A and B have the same identity/slot, see peer labels or results, or submit different package bindings;
- adjudication begins before the independent batch freeze or covers anything other than prediction disagreements.

## Claim boundary and next checkpoint

The package establishes annotation readiness, not annotation validity. There are still zero real labels, zero adjudications, and no agreement or predictive-utility result. Q2 remains 21 capabilities, 3 profiles, and `new-input-ready=0/3`.

The next checkpoint is two real annotators independently completing and freezing the 24-unit development denominator. Q3 prospective selection and new-input construction remain closed until the development method and the relevant constructor/checker are separately stable and frozen.
