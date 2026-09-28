<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Fixed-Source Authorization Assessment

Assess the authorization behavior in the following repository at the exact fixed source revision:

- **Repository:** https://github.com/fastapi/full-stack-fastapi-template
- **Fixed source ref:** `cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7`
- **Declared entry:** `read_item`
- **Accepted policy:**
  - An authenticated non-superuser may read or modify only items they own.
  - An authenticated active superuser may read or modify an item regardless of owner.

## Question

Determine whether an authenticated active superuser can read an item owned by another user through `GET /items/{id}`.

## Assessment Boundary

Use the **declared-entry** boundary. Begin the authorization analysis at entry to `read_item`; do not require the supplied source crop to establish how execution reached that handler.

Apply these premises:

- At entry to `read_item`, `current_user` is the authenticated active superuser described by this task.
- The existing item’s owner differs from that caller.

## Instructions

1. Base the assessment only on relevant source code at the fixed source ref.
2. Trace the behavior of `read_item` and any directly relevant authorization logic it invokes or relies upon within the available fixed source.
3. Do not invent source facts, assumptions, framework behavior, or missing evidence.
4. Compare the handler-entry behavior under the stated premises with the accepted policy.
5. Clearly state whether the handler permits or denies the cross-owner read and whether that behavior conforms to the accepted policy.
6. Cite the decisive source locations and explain the relevant conditions or control flow.
7. Keep the handler-entry conclusion separate from any statement about upstream dependency injection or authentication wiring.
8. Explicitly clarify that the conclusion assumes the stated `current_user` premise and that the supplied crop does not, by itself, need to prove the upstream `CurrentUser` binding. Do not claim that such binding is proven unless the fixed-source evidence actually establishes it.
9. If the available fixed-source evidence is insufficient for any narrower claim, identify that limitation without changing the stated premises or deciding unsupported facts.


## Public analysis questions
Decide the current scenario at the stated boundary from the supplied fixed source and accepted policy. Treat listed premises as question assumptions at the named entry, not as source or deployment proof. Trace the decisive authorization control and protected effect with exact supplied-source locations. Answer every explicitly requested counterfactual branch separately, identifying its changed assumptions and any decisive unknown. Include only the response details requested below. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: Can the stated authenticated active superuser read an existing item owned by another user through GET /items/{id}, assessed at the read_item handler entry?
Analysis boundary: declared-entry.
Task premise: At entry to read_item, current_user is the authenticated active superuser described by this task, and the existing item's owner differs from that caller.
Required response detail: Separate this handler-entry conclusion from any claim that the supplied crop proves the upstream CurrentUser binding.

## Explicit assessment program
- Current question scenario%3Aread-item::entry%3Aread-item at entry:read-item; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At entry to read_item, current_user is the authenticated active superuser described by this task, and the existing item's owner differs from that caller..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Separate this handler-entry conclusion from any claim that the supplied crop proves the upstream CurrentUser binding..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aread-item::entry%3Aread-item
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/fastapi/full-stack-fastapi-template@cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7; root ../../../authorization-evidence-editing-v1/public-source/fastapi

Included original ranges: backend/app/api/routes/items.py:48-58 [entry:read-item]

Unresolved gaps: dep:read-item:current-user: ambiguous-location (backend/app/api/routes/items.py); dep:read-item:item-lookup: ambiguous-location (backend/app/api/routes/items.py); dep:read-item:missing-item-control: ambiguous-location (backend/app/api/routes/items.py); dep:read-item:ownership-control: ambiguous-location (backend/app/api/routes/items.py); dep:read-item:return-item: ambiguous-location (backend/app/api/routes/items.py)

===== BEGIN ALLOWED INPUT: backend/app/api/routes/items.py =====
Source ID: src-153f719b7cb901c9
Location note: crop lines 48-58; original locations: backend/app/api/routes/items.py:48-58
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
48 | @router.get("/{id}", response_model=ItemPublic)
49 | def read_item(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
50 |     """
51 |     Get item by ID.
52 |     """
53 |     item = session.get(Item, id)
54 |     if not item:
55 |         raise HTTPException(status_code=404, detail="Item not found")
56 |     if not current_user.is_superuser and (item.owner_id != current_user.id):
57 |         raise HTTPException(status_code=403, detail="Not enough permissions")
58 |     return item
===== END ALLOWED INPUT: backend/app/api/routes/items.py =====
