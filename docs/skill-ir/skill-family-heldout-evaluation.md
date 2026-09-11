# Skill Family Held-out Evaluation

Status: implemented for the minimum-delivery stage.

## Purpose

This module converts a source-grounded duty draft into the frozen class
obligation ledger, evaluates the four class-membership criteria, and computes
the stage decision label. It does not branch on repository or member identity.

## Runtime

1. Map each obligation from the quote-backed draft. A model paraphrase that
   names a constructible key is ignored unless the source quote contains the
   matched lexicon term.
2. Evaluate `public-api-contract-input`, `explicit-coverage-requirements`,
   `offline-request-or-test-artifacts`, and `independent-check-possible`.
3. A member is input-qualified only when the first criterion holds and two
   public OpenAPI 3.0.x inputs are bound. Out-of-class members stay in the
   panel as recorded negatives.
4. If a named model request fails or is not a grounded draft, the fallback
   inventory is agent-authored from headings and list items and is labeled
   `development-agent-after-failed-model-request`.

## Public functions

- `evaluateClassCriteria`
- `ledgerFromDutyDraft` / `keyFromSourceGroundedObligation`
- `inventoryFromSourceFiles`
- `semanticAdjudications`
- `decideClassResult`
- `memberSlug`

## Verification

```text
bun test ./src/skill-ir/skill-family-heldout-evaluation.test.ts
```

## Failure modes

- Unmapped obligations remain `unresolved`; they are not dropped.
- Live execution, client generation, and spec authoring fail criterion 1.
- Fewer than three input-qualified members yields `insufficient-evidence`.
- Native emission and conflicting 401/403 rows are never silently approved.
