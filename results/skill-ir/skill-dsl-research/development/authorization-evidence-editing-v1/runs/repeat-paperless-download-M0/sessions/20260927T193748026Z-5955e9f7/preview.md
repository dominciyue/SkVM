<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Fixed-Source Authorization Assessment

Assess the authorization behavior of the specified handler using only the fixed source entry and the neutral brief below. Do not rely on other repository revisions, inferred implementation details, external documentation, or unstated assumptions. A common public requirements paragraph is supplied separately to all methods; do not quote it verbatim.

## Source

- **Repository:** https://github.com/paperless-ngx/paperless-ngx
- **Fixed source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Entry:** `src/documents/views.py:1834-1839`
- **Inspection boundary:** `declared-entry`

Use the source at the fixed ref and entry as the controlling evidence. Do not invent source facts or decide the result from policy alone.

## Accepted policy

A download must pass the owner-aware `view_document` check on the root document before serving any selected file version.

## Question

At `DocumentViewSet.download` handler entry, can an authenticated user download a requested version document they own when its root document is owned by someone else and they lack an object view grant on that root?

## Premises

Assume all of the following at handler entry:

- The authenticated caller has the required global document view permission.
- The caller owns the requested version.
- A different user owns the existing root document.
- The caller has no object view grant on that root.
- The documents exist.

## Required response

Give a source-grounded authorization assessment at the declared-entry boundary. Explicitly:

1. Identify which object is checked by the relevant authorization logic.
2. Identify which file object would be served if the request proceeds.
3. Keep version ownership distinct from authorization on the root document.
4. Explain how the fixed source relates to the accepted policy and the stated premises.
5. State the conclusion only from the evidence available at the specified source entry; do not add facts from elsewhere in the repository.


## Public analysis questions
Decide the current scenario at the stated declared-entry boundary from the supplied fixed source and accepted policy. Treat premises as question assumptions, not source or deployment proof. Trace the decisive authorization control, protected object and effect with exact supplied-source locations. State any decisive missing runtime fact rather than assuming it. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: At DocumentViewSet.download handler entry, can an authenticated user download a requested version document they own when its root document is owned by someone else and they lack an object view grant on that root? Assume the user has the required global view permission and the documents exist.
Analysis boundary: declared-entry.
Task premise: At download entry, the authenticated caller has global document view permission and owns the requested version, but a different user owns the existing root document and the caller has no object view grant on that root.
Required response detail: Identify which object is checked and which file object would be served; do not collapse version ownership into root authorization.

## Explicit assessment program
- Current question scenario%3Aversion-owner-no-root-view::entry%3Adownload at entry:download; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At download entry, the authenticated caller has global document view permission and owns the requested version, but a different user owns the existing root document and the caller has no object view grant on that root..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Identify which object is checked and which file object would be served; do not collapse version ownership into root authorization..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aversion-owner-no-root-view::entry%3Adownload
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-eace79a5fd9a7662
Location note: crop lines 1-6; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 |     @action(methods=["get"], detail=True)
2 |     def download(self, request, pk=None):
3 |         try:
4 |             return self.file_response(pk, request, "attachment")
5 |         except (FileNotFoundError, Document.DoesNotExist):
6 |             raise Http404
===== END ALLOWED INPUT: src/documents/views.py =====
