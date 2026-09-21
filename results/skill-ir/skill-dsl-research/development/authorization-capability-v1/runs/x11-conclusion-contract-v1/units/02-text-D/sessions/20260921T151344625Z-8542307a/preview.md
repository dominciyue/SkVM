<!-- analysis-profile: authorization-core-v1; origin: default -->

# Authorization domain method (D)

For every runnable obligation, trace this causal chain before deciding: declared entry -> principal and resource bindings -> stated relation and conditions -> strongest source-visible authorization control -> protected effect. Compare the observed chain with the accepted policy expectation. Use unknown only when a named missing fact is decisive, and bound scope to the declared fixed context. Work through the supplied analysis ledger in prerequisite order for each expanded obligation, then record coverage against facts from that same obligation.

Method execution state:
{
  "status": "ready",
  "runnableObligationIds": [
    "non-admin-without-kb-write-grant::post-process-text"
  ],
  "blocked": []
}

## Canonical declaration
{
  "schemaVersion": "source-authorization-assessment/v0",
  "taskId": "owui-process-text-controlled",
  "request": "At this fixed source ref, determine whether a verified non-admin user can write attacker-selected text to an existing knowledge-base collection for which the user has no write permission by supplying that collection name to POST /process/text.",
  "repository": "https://github.com/open-webui/open-webui",
  "sourceRef": "841c9045d789005145274955e7ef60b1b11a9be9",
  "sourceMode": "fixed-context",
  "policySources": [
    {
      "id": "knowledge-write-policy",
      "kind": "explicit-task-requirement",
      "text": "A verified non-admin may write to an existing knowledge-base collection only when the user owns it or has an explicit write grant.",
      "location": "inputs/owui-process-text-controlled/task.json#/normativeRequirement",
      "revision": "authorization-case-input/v1@841c9045",
      "acceptance": {
        "status": "accepted",
        "actorRole": "study-task-author",
        "reason": "The study task author supplied this bounded normative requirement for the comparison."
      }
    }
  ],
  "principals": [
    {
      "id": "verified-non-admin",
      "role": "verified non-administrator",
      "description": "A signed-in non-admin without ownership or an explicit write grant on the selected knowledge base.",
      "startingCapabilities": [
        "authenticated-as-verified-user",
        "can-submit-process-text-form"
      ]
    }
  ],
  "resources": [
    {
      "id": "existing-target-knowledge-base",
      "type": "knowledge-base-vector-collection",
      "description": "An existing knowledge-base collection selected by the caller and not owned by or write-granted to the principal."
    }
  ],
  "entries": [
    {
      "id": "post-process-text",
      "name": "POST /process/text -> process_text",
      "locations": [
        {
          "path": "inputs/owui-process-text-controlled/retrieval_process_text.py",
          "startLine": 1,
          "endLine": 44
        },
        {
          "path": "inputs/owui-process-text-controlled/retrieval_access_policy.py",
          "startLine": 1,
          "endLine": 52
        }
      ]
    }
  ],
  "obligations": [
    {
      "id": "non-admin-without-kb-write-grant",
      "principalId": "verified-non-admin",
      "resourceId": "existing-target-knowledge-base",
      "relation": "no-ownership-or-explicit-write-grant",
      "operation": "write-attacker-selected-text-to-existing-knowledge-base",
      "expectation": "deny",
      "conditions": [
        {
          "name": "caller-supplies-existing-collection-name",
          "basis": "The natural task fixes a caller-selected existing knowledge-base collection."
        },
        {
          "name": "principal-is-not-admin",
          "basis": "The task asks about a verified non-admin and the shared policy exposes a separate admin branch."
        }
      ],
      "policySourceId": "knowledge-write-policy",
      "entryIds": [
        "post-process-text"
      ]
    }
  ],
  "scopeAssurance": "The allowed source crops contain the complete authorization-relevant caller, validator, and shared policy path for this bounded request. Trace controls outside the immediate vector-database sink before deciding that a local check is missing.",
  "requiredAnalysis": [
    "identify the principal, operation, target resource relation, entry, and write sink",
    "trace the supplied collection name through caller-side and shared controls",
    "state what happens for a non-admin targeting an existing knowledge-base ID without write access",
    "return source_supported_failure, source_refuted, or unknown with exact input locations"
  ],
  "constraints": [
    "Use only the allowed case inputs.",
    "Do not search for advisories, fixes, later versions, or deployment behavior.",
    "Do not execute the project or propose a patch."
  ],
  "allowedConclusions": [
    "source_supported_failure",
    "source_refuted",
    "unknown"
  ],
  "discoveryStatus": "not-tested"
}

## Analysis requirement ledger
{
  "status": "ready",
  "requirements": [
    {
      "id": "authorization-core-v1.authorization-decision",
      "kind": "authorization-decision",
      "obligationIds": [
        "non-admin-without-kb-write-grant"
      ],
      "question": "What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.identity-binding",
        "authorization-core-v1.resource-binding"
      ]
    },
    {
      "id": "authorization-core-v1.effect-reachability",
      "kind": "effect-reachability",
      "obligationIds": [
        "non-admin-without-kb-write-grant"
      ],
      "question": "After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.authorization-decision",
        "authorization-core-v1.entry-control"
      ]
    },
    {
      "id": "authorization-core-v1.entry-control",
      "kind": "entry-control",
      "obligationIds": [
        "non-admin-without-kb-write-grant"
      ],
      "question": "Which source-visible condition or control gates the declared entry before the assessed path proceeds?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "authorization-core-v1.external-assumption",
      "kind": "external-assumption",
      "obligationIds": [
        "non-admin-without-kb-write-grant"
      ],
      "question": "Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?",
      "applicability": "when-present",
      "prerequisiteIds": [
        "authorization-core-v1.effect-reachability"
      ]
    },
    {
      "id": "authorization-core-v1.identity-binding",
      "kind": "identity-binding",
      "obligationIds": [
        "non-admin-without-kb-write-grant"
      ],
      "question": "How is the declared principal bound to the runtime caller or identity used by the assessed operation?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "authorization-core-v1.resource-binding",
      "kind": "resource-binding",
      "obligationIds": [
        "non-admin-without-kb-write-grant"
      ],
      "question": "How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?",
      "applicability": "required",
      "prerequisiteIds": []
    }
  ],
  "entries": [
    {
      "requirementId": "authorization-core-v1.authorization-decision",
      "obligationId": "non-admin-without-kb-write-grant::post-process-text",
      "kind": "authorization-decision",
      "question": "What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.identity-binding",
        "authorization-core-v1.resource-binding"
      ],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.effect-reachability",
      "obligationId": "non-admin-without-kb-write-grant::post-process-text",
      "kind": "effect-reachability",
      "question": "After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.authorization-decision",
        "authorization-core-v1.entry-control"
      ],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.entry-control",
      "obligationId": "non-admin-without-kb-write-grant::post-process-text",
      "kind": "entry-control",
      "question": "Which source-visible condition or control gates the declared entry before the assessed path proceeds?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.external-assumption",
      "obligationId": "non-admin-without-kb-write-grant::post-process-text",
      "kind": "external-assumption",
      "question": "Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?",
      "applicability": "when-present",
      "prerequisiteIds": [
        "authorization-core-v1.effect-reachability"
      ],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.identity-binding",
      "obligationId": "non-admin-without-kb-write-grant::post-process-text",
      "kind": "identity-binding",
      "question": "How is the declared principal bound to the runtime caller or identity used by the assessed operation?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.resource-binding",
      "obligationId": "non-admin-without-kb-write-grant::post-process-text",
      "kind": "resource-binding",
      "question": "How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    }
  ]
}

## Result contract
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- non-admin-without-kb-write-grant::post-process-text
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Return exactly one coverage item for every analysis-ledger pair below. Use the exact requirementId and expanded obligationId. Status must be addressed, unknown, or not-applicable. Every item needs a substantive explanation. addressed and not-applicable require one or more factPointers to fact objects in this same answer, using /results/<index>/facts/<group>/<index>. unknown must explain what prevents an answer. not-applicable is allowed only for when-present questions and must explain from source-backed facts why the branch is absent.
Exact analysis coverage pairs (closed list):
- authorization-core-v1.authorization-decision @ non-admin-without-kb-write-grant::post-process-text (required)
- authorization-core-v1.effect-reachability @ non-admin-without-kb-write-grant::post-process-text (required)
- authorization-core-v1.entry-control @ non-admin-without-kb-write-grant::post-process-text (required)
- authorization-core-v1.external-assumption @ non-admin-without-kb-write-grant::post-process-text (when-present)
- authorization-core-v1.identity-binding @ non-admin-without-kb-write-grant::post-process-text (required)
- authorization-core-v1.resource-binding @ non-admin-without-kb-write-grant::post-process-text (required)

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
