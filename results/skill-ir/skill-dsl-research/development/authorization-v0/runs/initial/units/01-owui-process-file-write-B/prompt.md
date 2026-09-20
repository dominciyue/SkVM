# Organized authorization assessment instruction (B)

Task ID: owui-process-file-write
Request: At this fixed source ref, determine whether a verified non-admin user who owns the supplied file can cause that file's content to be written to an existing knowledge-base collection for which the user has no write permission by supplying that collection name to POST /process/file.
Repository: https://github.com/open-webui/open-webui
Source ref: 841c9045d789005145274955e7ef60b1b11a9be9
Source mode: fixed-context

## Governing policy sources
- destination-knowledge-write-policy (explicit-task-requirement, accepted)
  Rule: Owning the source file does not authorize writing to an unrelated knowledge base. A verified non-admin may write to an existing knowledge-base collection only when the user owns it or has an explicit write grant.
  Source: inputs/owui-process-file-write/task.json#/normativeRequirement @ authorization-case-input/v1@841c9045
  Accepted/resolved by: study-task-author
  Reason: The study task author supplied this bounded normative requirement for the comparison.

## Principals
- verified-non-admin-file-owner: verified non-administrator who owns the supplied source file
  Description: A signed-in non-admin whose file ownership is distinct from authorization on the destination knowledge base.
  Starting capabilities: authenticated-as-verified-user, owns-supplied-source-file, can-submit-process-file-form

## Resources
- existing-destination-knowledge-base (knowledge-base-vector-collection): An existing knowledge-base collection selected by the caller and not owned by or write-granted to the principal.

## Declared entries and allowed locations
- post-process-file: POST /process/file -> process_file
  Allowed source locations: inputs/owui-process-file-write/retrieval_process_file.py:1-74

## Authorization questions
- file-owner-without-destination-write-grant
  Principal/resource: verified-non-admin-file-owner -> existing-destination-knowledge-base
  Relation/operation/expectation: owns-source-file-but-no-destination-write-grant / write-file-content-to-existing-knowledge-base / deny
  Conditions: caller-supplies-existing-collection-name: The natural task fixes a caller-selected existing knowledge-base collection.; principal-is-not-admin: The task asks about a verified non-admin and the source exposes a separate admin branch.
  Policy: destination-knowledge-write-policy
  Declared entries: post-process-file

## Scope assurance
The allowed source crops contain the complete authorization-relevant entry-to-write path for this bounded request. General authentication is visible, but a target-specific knowledge-base write check must be traced in these inputs rather than presumed from authentication.

## Required analysis
- identify the principal, operation, target resource relation, entry, and write sink
- trace the user-controlled collection name through any target-specific authorization control
- distinguish file ownership from destination knowledge-base write permission
- return source_supported_failure, source_refuted, or unknown with exact input locations

## Constraints
- Use only the allowed case inputs.
- Do not search for advisories, fixes, later versions, or deployment behavior.
- Do not execute the project or propose a patch.

## Result contract
For every declared entry obligation, return exactly one of: source_supported_failure, source_refuted, unknown.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite an allowed input path, line range, and retained quotation. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.

## Fixed source context
===== BEGIN ALLOWED INPUT: inputs/owui-process-file-write/task.json =====
Location note: crop lines 1-20; original locations: not separately supplied
{
  "schemaVersion": "authorization-case-input/v1",
  "caseId": "owui-process-file-write",
  "repository": "https://github.com/open-webui/open-webui",
  "sourceRef": "841c9045d789005145274955e7ef60b1b11a9be9",
  "task": "At this fixed source ref, determine whether a verified non-admin user who owns the supplied file can cause that file's content to be written to an existing knowledge-base collection for which the user has no write permission by supplying that collection name to POST /process/file.",
  "normativeRequirement": "Owning the source file does not authorize writing to an unrelated knowledge base. A verified non-admin may write to an existing knowledge-base collection only when the user owns it or has an explicit write grant.",
  "scopeAssurance": "The allowed source crops contain the complete authorization-relevant entry-to-write path for this bounded request. General authentication is visible, but a target-specific knowledge-base write check must be traced in these inputs rather than presumed from authentication.",
  "requiredAnalysis": [
    "identify the principal, operation, target resource relation, entry, and write sink",
    "trace the user-controlled collection name through any target-specific authorization control",
    "distinguish file ownership from destination knowledge-base write permission",
    "return source_supported_failure, source_refuted, or unknown with exact input locations"
  ],
  "constraints": [
    "Use only the allowed case inputs.",
    "Do not search for advisories, fixes, later versions, or deployment behavior.",
    "Do not execute the project or propose a patch."
  ]
}

===== END ALLOWED INPUT: inputs/owui-process-file-write/task.json =====

===== BEGIN ALLOWED INPUT: inputs/owui-process-file-write/retrieval_process_file.py =====
Location note: crop lines 1-74; original locations: backend/open_webui/routers/retrieval.py:1517-1531,1540-1570,1688-1706
# Cropped from backend/open_webui/routers/retrieval.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 1517-1531, inside save_docs_to_vector_db.
items = [
    {
        'id': str(uuid.uuid4()),
        'text': text,
        'vector': embeddings[idx],
        'metadata': metadatas[idx],
    }
    for idx, text in enumerate(texts)
]

log.info(f'adding to collection {collection_name}')
VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)

# Original lines 1540-1570.
class ProcessFileForm(BaseModel):
    file_id: str
    content: Optional[str] = None
    collection_name: Optional[str] = None


@router.post('/process/file')
async def process_file(
    request: Request,
    form_data: ProcessFileForm,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    Process a file and save its content to the vector database.
    Process a file and save its content to the vector database.
    Note: granular session management is used to prevent connection pool exhaustion.
    The session is committed before external API calls, and updates use a fresh session.
    """
    if user.role == 'admin':
        file = await Files.get_file_by_id(form_data.file_id, db=db)
    else:
        file = await Files.get_file_by_id_and_user_id(form_data.file_id, user.id, db=db)

    if file:
        try:
            collection_name = form_data.collection_name

            if collection_name is None:
                collection_name = f'file-{file.id}'

# Original lines 1571-1687 load content, build metadata, and commit file updates;
# they contain no call that authorizes collection_name and are omitted from this crop.

# Original lines 1688-1706.
            # External embedding API takes time (5-60s+).
            # Subsequent updates use fresh async sessions.
            # NOTE: save_docs_to_vector_db is a sync function that
            # calls asyncio.run_coroutine_threadsafe(..., main_loop).result()
            # which blocks the calling thread.  We MUST run it in a
            # worker thread to avoid deadlocking the event loop.
            result = await run_in_threadpool(
                save_docs_to_vector_db,
                request,
                docs=docs,
                collection_name=collection_name,
                metadata={
                    'file_id': file.id,
                    'name': file.filename,
                    'hash': hash,
                },
                add=(True if form_data.collection_name else False),
                user=user,
            )

===== END ALLOWED INPUT: inputs/owui-process-file-write/retrieval_process_file.py =====
