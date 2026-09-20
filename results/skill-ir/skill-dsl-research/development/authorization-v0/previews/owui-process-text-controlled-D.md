# Authorization domain plan (D)

Use the canonical authorization facts and deterministic obligation expansion below. The declaration organizes the work; you still must understand the source control path and justify the conclusion.

## Canonical facts
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

## Compiled obligation plan
{
  "status": "ready",
  "expanded": [
    {
      "id": "non-admin-without-kb-write-grant::post-process-text",
      "status": "runnable",
      "authorObligationId": "non-admin-without-kb-write-grant",
      "entryId": "post-process-text"
    }
  ],
  "dependencies": {
    "repository": "https://github.com/open-webui/open-webui",
    "sourceRef": "841c9045d789005145274955e7ef60b1b11a9be9",
    "sourceMode": "fixed-context",
    "policies": [
      {
        "id": "knowledge-write-policy",
        "revision": "authorization-case-input/v1@841c9045",
        "acceptanceStatus": "accepted"
      }
    ]
  },
  "diagnostics": []
}

## Result contract
For every declared entry obligation, return exactly one of: source_supported_failure, source_refuted, unknown.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite an allowed input path, line range, and retained quotation. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.

## Fixed source context
===== BEGIN ALLOWED INPUT: inputs/owui-process-text-controlled/task.json =====
Location note: crop lines 1-20; original locations: not separately supplied
{
  "schemaVersion": "authorization-case-input/v1",
  "caseId": "owui-process-text-controlled",
  "repository": "https://github.com/open-webui/open-webui",
  "sourceRef": "841c9045d789005145274955e7ef60b1b11a9be9",
  "task": "At this fixed source ref, determine whether a verified non-admin user can write attacker-selected text to an existing knowledge-base collection for which the user has no write permission by supplying that collection name to POST /process/text.",
  "normativeRequirement": "A verified non-admin may write to an existing knowledge-base collection only when the user owns it or has an explicit write grant.",
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
  ]
}

===== END ALLOWED INPUT: inputs/owui-process-text-controlled/task.json =====

===== BEGIN ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_process_text.py =====
Location note: crop lines 1-44; original locations: backend/open_webui/routers/retrieval.py:1768-1792,2339-2352
# Cropped from backend/open_webui/routers/retrieval.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 1768-1792.
collection_name: Optional[str] = None


@router.post('/process/text')
async def process_text(
    request: Request,
    form_data: ProcessTextForm,
    user=Depends(get_verified_user),
):
    collection_name = form_data.collection_name
    if collection_name is None:
        collection_name = calculate_sha256_string(form_data.content)
    else:
        await _validate_collection_access([collection_name], user, access_type='write')

    docs = [
        Document(
            page_content=form_data.content,
            metadata={'name': form_data.name, 'created_by': user.id},
        )
    ]
    text_content = form_data.content
    log.debug(f'text_content: {text_content}')

    result = await run_in_threadpool(save_docs_to_vector_db, request, docs, collection_name, user=user)

# Original lines 2339-2352.
async def _validate_collection_access(collection_names: list[str], user, access_type: str = 'read') -> None:
    """
    Raise 403 if the user lacks access to any of the requested collections.
    Delegates to the shared filter_accessible_collections utility so the
    access rules stay in one place.
    """
    requested = set(collection_names)
    allowed = await filter_accessible_collections(requested, user, access_type=access_type)
    denied = requested - allowed
    if denied:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
        )

===== END ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_process_text.py =====

===== BEGIN ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_access_policy.py =====
Location note: crop lines 1-52; original locations: backend/open_webui/retrieval/utils.py:1061-1109
# Cropped from backend/open_webui/retrieval/utils.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 1061-1109.
async def filter_accessible_collections(
    collection_names: set[str],
    user: UserModel,
    access_type: str = 'read',
) -> set[str]:
    """
    Return only the collection names the user is allowed to access.
    Admins bypass all checks.  For non-admins the policy is:

      - file-*          → validated via has_access_to_file
      - user-memory-*   → must match user's own memory collection
      - web-search-*    → ephemeral per-query collections, always allowed
      - knowledge-bases → always denied (system meta-collection)
      - everything else → if the name matches a knowledge base, validated
                          via Knowledges.check_access_by_user_id; if no
                          such KB exists, the name is treated as an
                          ephemeral/legacy collection and allowed
    """
    if user.role == 'admin':
        return collection_names

    validated = set()
    for name in collection_names:
        if name == 'knowledge-bases':
            # System meta-collection — never exposed to non-admins.
            continue
        elif name.startswith('file-'):
            file_id = name[len('file-') :]
            if await has_access_to_file(file_id=file_id, access_type=access_type, user=user):
                validated.add(name)
        elif name.startswith('user-memory-'):
            if name == f'user-memory-{user.id}':
                validated.add(name)
        elif name.startswith('web-search-'):
            # Ephemeral collections created by process_web_search — safe
            # to allow because they contain only transient web-search
            # results scoped to the requesting user's session.
            validated.add(name)
        else:
            # May be a knowledge-base ID or a legacy/ephemeral collection.
            # If it IS a KB, enforce access control.  If no such KB
            # exists, treat it as a non-sensitive collection (e.g. legacy
            # model knowledge, process_text SHA256 collections) and allow.
            if await Knowledges.check_access_by_user_id(name, user.id, permission=access_type):
                validated.add(name)
            elif not await Knowledges.get_knowledge_by_id(name):
                # Not a KB at all — legacy/ephemeral collection, allow
                validated.add(name)
    return validated

===== END ALLOWED INPUT: inputs/owui-process-text-controlled/retrieval_access_policy.py =====
