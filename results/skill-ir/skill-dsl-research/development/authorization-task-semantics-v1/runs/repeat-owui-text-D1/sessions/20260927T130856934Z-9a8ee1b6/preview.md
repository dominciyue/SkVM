<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task owui-process-text-controlled, expressed with source-authorization-assessment/v0. At this fixed source ref, determine whether a verified non-admin user can write attacker-selected text to an existing knowledge-base collection for which the user has no write permission by supplying that collection name to POST /process/text.
Assess repository https://github.com/open-webui/open-webui at source ref 841c9045d789005145274955e7ef60b1b11a9be9 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:knowledge-write-policy is a explicit-task-requirement at inputs/owui-process-text-controlled/task.json#/normativeRequirement, revision authorization-case-input/v1@841c9045.
  Policy text: A verified non-admin may write to an existing knowledge-base collection only when the user owns it or has an explicit write grant.
  Acceptance is accepted; accepting actor role: task-author; reason: The study task author supplied this bounded normative requirement for the comparison.

The principals are:
- principal:verified-non-admin has role verified non-administrator. Author facts: ["A signed-in non-admin without ownership or an explicit write grant on the selected knowledge base."]
  Starting capabilities: authenticated-as-verified-user, can-submit-process-text-form.

The resources are:
- resource:existing-target-knowledge-base is a knowledge-base-vector-collection. Author facts: ["An existing knowledge-base collection selected by the caller and not owned by or write-granted to the principal."]

The declared source entries are:
- entry:post-process-text names POST /process/text -> process_text.
  Source location: inputs/owui-process-text-controlled/retrieval_process_text.py, startLine 1, endLine 44.
  Source location: inputs/owui-process-text-controlled/retrieval_access_policy.py, startLine 1, endLine 52.

The authorization obligations are:
- scenario:non-admin-without-kb-write-grant: principal principal:verified-non-admin, resource resource:existing-target-knowledge-base, relation no-ownership-or-explicit-write-grant, operation write-attacker-selected-text-to-existing-knowledge-base, expected policy disposition deny.
  Policy source: policy:knowledge-write-policy. Declared entries: entry:post-process-text.
  Condition caller-supplies-existing-collection-name: The natural task fixes a caller-selected existing knowledge-base collection.
  Condition principal-is-not-admin: The task asks about a verified non-admin and the shared policy exposes a separate admin branch.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
- identify the principal, operation, target resource relation, entry, and write sink
- trace the supplied collection name through caller-side and shared controls
- state what happens for a non-admin targeting an existing knowledge-base ID without write access
- return source_supported_failure, source_refuted, or unknown with exact input locations
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
- Use only the allowed case inputs.
- Do not search for advisories, fixes, later versions, or deployment behavior.
- Do not execute the project or propose a patch.
Allowed decision kinds: observed for allow/deny expectations; conditional-policy for conditional expectations.

## Public analysis questions
Decide the current scenario at the stated boundary from the supplied fixed source and accepted policy. Treat listed premises as question assumptions at the named entry, not as source or deployment proof. Trace the decisive authorization control and protected effect with exact supplied-source locations. Answer every explicitly requested counterfactual branch separately, identifying its changed assumptions and any decisive unknown. Include only the response details requested below. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: Can a verified non-admin write caller-selected text to an existing caller-selected knowledge-base collection without a write grant through POST /process/text?
Analysis boundary: declared-entry.
Task premise: At POST /process/text the verified non-admin selects an existing collection without ownership or a write grant and supplies the text.
Required response detail: Trace the caller-side and shared authorization controls before the text write sink.

## Explicit assessment program
- Current question scenario%3Anon-admin-without-kb-write-grant::entry%3Apost-process-text at entry:post-process-text; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At POST /process/text the verified non-admin selects an existing collection without ownership or a write grant and supplies the text..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Trace the caller-side and shared authorization controls before the text write sink..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Anon-admin-without-kb-write-grant::entry%3Apost-process-text
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_access_policy.py =====
Source ID: src-bc2fc3bd01b481d9
Location note: crop lines 1-52; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | # Cropped from backend/open_webui/retrieval/utils.py at
2 | # https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
3 | # Original lines 1061-1109.
4 | async def filter_accessible_collections(
5 |     collection_names: set[str],
6 |     user: UserModel,
7 |     access_type: str = 'read',
8 | ) -> set[str]:
9 |     """
10 |     Return only the collection names the user is allowed to access.
11 |     Admins bypass all checks.  For non-admins the policy is:
12 | 
13 |       - file-*          → validated via has_access_to_file
14 |       - user-memory-*   → must match user's own memory collection
15 |       - web-search-*    → ephemeral per-query collections, always allowed
16 |       - knowledge-bases → always denied (system meta-collection)
17 |       - everything else → if the name matches a knowledge base, validated
18 |                           via Knowledges.check_access_by_user_id; if no
19 |                           such KB exists, the name is treated as an
20 |                           ephemeral/legacy collection and allowed
21 |     """
22 |     if user.role == 'admin':
23 |         return collection_names
24 | 
25 |     validated = set()
26 |     for name in collection_names:
27 |         if name == 'knowledge-bases':
28 |             # System meta-collection — never exposed to non-admins.
29 |             continue
30 |         elif name.startswith('file-'):
31 |             file_id = name[len('file-') :]
32 |             if await has_access_to_file(file_id=file_id, access_type=access_type, user=user):
33 |                 validated.add(name)
34 |         elif name.startswith('user-memory-'):
35 |             if name == f'user-memory-{user.id}':
36 |                 validated.add(name)
37 |         elif name.startswith('web-search-'):
38 |             # Ephemeral collections created by process_web_search — safe
39 |             # to allow because they contain only transient web-search
40 |             # results scoped to the requesting user's session.
41 |             validated.add(name)
42 |         else:
43 |             # May be a knowledge-base ID or a legacy/ephemeral collection.
44 |             # If it IS a KB, enforce access control.  If no such KB
45 |             # exists, treat it as a non-sensitive collection (e.g. legacy
46 |             # model knowledge, process_text SHA256 collections) and allow.
47 |             if await Knowledges.check_access_by_user_id(name, user.id, permission=access_type):
48 |                 validated.add(name)
49 |             elif not await Knowledges.get_knowledge_by_id(name):
50 |                 # Not a KB at all — legacy/ephemeral collection, allow
51 |                 validated.add(name)
52 |     return validated
===== END ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_access_policy.py =====

===== BEGIN ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_process_text.py =====
Source ID: src-2d29ccb8dfb4019e
Location note: crop lines 1-44; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | # Cropped from backend/open_webui/routers/retrieval.py at
2 | # https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
3 | # Original lines 1768-1792.
4 | collection_name: Optional[str] = None
5 | 
6 | 
7 | @router.post('/process/text')
8 | async def process_text(
9 |     request: Request,
10 |     form_data: ProcessTextForm,
11 |     user=Depends(get_verified_user),
12 | ):
13 |     collection_name = form_data.collection_name
14 |     if collection_name is None:
15 |         collection_name = calculate_sha256_string(form_data.content)
16 |     else:
17 |         await _validate_collection_access([collection_name], user, access_type='write')
18 | 
19 |     docs = [
20 |         Document(
21 |             page_content=form_data.content,
22 |             metadata={'name': form_data.name, 'created_by': user.id},
23 |         )
24 |     ]
25 |     text_content = form_data.content
26 |     log.debug(f'text_content: {text_content}')
27 | 
28 |     result = await run_in_threadpool(save_docs_to_vector_db, request, docs, collection_name, user=user)
29 | 
30 | # Original lines 2339-2352.
31 | async def _validate_collection_access(collection_names: list[str], user, access_type: str = 'read') -> None:
32 |     """
33 |     Raise 403 if the user lacks access to any of the requested collections.
34 |     Delegates to the shared filter_accessible_collections utility so the
35 |     access rules stay in one place.
36 |     """
37 |     requested = set(collection_names)
38 |     allowed = await filter_accessible_collections(requested, user, access_type=access_type)
39 |     denied = requested - allowed
40 |     if denied:
41 |         raise HTTPException(
42 |             status_code=status.HTTP_403_FORBIDDEN,
43 |             detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
44 |         )
===== END ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_process_text.py =====
