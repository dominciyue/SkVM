## Findings summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| **High** | **1** |
| Medium | 0 |
| Low | 0 |
| Info | 0 |

**Finding:** authorization is performed on the input `file_id`, but not on the supplied output `collection_name`.  
**Confidence:** High

Scope was limited to the `/process/file` flow and its relevant callers. Dependencies and secrets were not assessed.

---

## HIGH — Cross-collection unauthorized vector write

### Entry point

The route is exposed as:

```text
POST /api/v1/retrieval/process/file
```

The router prefix is registered at `backend/open_webui/main.py:1427`, while the route and request model are defined at `backend/open_webui/routers/retrieval.py:1540-1551`:

```python
class ProcessFileForm(BaseModel):
    file_id: str
    content: Optional[str] = None
    collection_name: Optional[str] = None

@router.post('/process/file')
async def process_file(..., user=Depends(get_verified_user), ...):
```

`get_verified_user` admits authenticated users with role `user` or `admin` (`utils/auth.py:458-464`).

### Data and authorization flow

1. **`file_id` identifies the input object.**

   At `routers/retrieval.py:1559-1563`:

   ```python
   if user.role == 'admin':
       file = await Files.get_file_by_id(form_data.file_id, db=db)
   else:
       file = await Files.get_file_by_id_and_user_id(
           form_data.file_id, user.id, db=db
       )
   ```

   For a normal user, the database query explicitly requires both the supplied ID and `user_id` (`models/files.py:172-184`).

2. **`collection_name` independently identifies the output object.**

   At `routers/retrieval.py:1566-1569`:

   ```python
   collection_name = form_data.collection_name

   if collection_name is None:
       collection_name = f'file-{file.id}'
   ```

   When the caller supplies a name, it is accepted unchanged. There is no `_validate_collection_access(..., access_type='write')` call in `process_file`.

3. **The content is obtained from the authorized file—or directly from caller-supplied `content`.**

   - Supplied `content` becomes the document at lines 1571-1595.
   - Otherwise, when a destination was supplied, content is copied from the file’s own `file-{id}` collection or `file.data` at lines 1596-1626.
   - The resulting file content is persisted at lines 1665-1670.

4. **The unchecked destination reaches the vector write.**

   At `routers/retrieval.py:1694-1705`:

   ```python
   result = await run_in_threadpool(
       save_docs_to_vector_db,
       request,
       docs=docs,
       collection_name=collection_name,
       ...
       add=(True if form_data.collection_name else False),
       user=user,
   )
   ```

   `save_docs_to_vector_db` ultimately performs:

   ```python
   VECTOR_DB_CLIENT.insert(
       collection_name=collection_name,
       items=items,
   )
   ```

   at `routers/retrieval.py:1527-1531`. The vector API receives no user or authorization context.

5. **The source file record is then associated with that destination.**

   On success, its metadata is updated with the unchecked name at `routers/retrieval.py:1712-1725`.

### Are the authorized and affected objects the same?

**No.**

- The authorized object is the file selected by `file_id`.
- The affected object is the vector collection selected by `collection_name`.
- They coincide only when `collection_name` is omitted and the code derives `file-{file.id}`.
- If a caller supplies `collection_name`, no relationship between that collection and the authorized file or caller is required.

The code already has the intended collection authorization mechanism:

```python
await _validate_collection_access(
    [collection_name], user, access_type='write'
)
```

It is used by `/process/text` and `/process/web` (`routers/retrieval.py:1781,1824`), but not by `/process/file`. `_validate_collection_access` rejects inaccessible collections at `routers/retrieval.py:2339-2352`.

### Caller-owned versus another user’s file

| Input file | Normal user result | Destination behavior |
|---|---|---|
| Caller-owned file | Accepted | Any supplied collection name reaches the write without destination authorization |
| Another user’s file | Rejected as not found | No processing or vector write |
| Shared but not owned file | Also rejected by this function | Broader file access grants are not consulted |
| Any file, admin caller | Accepted | Admin may target any collection |

When a normal caller supplies another user’s file ID, `get_file_by_id_and_user_id` returns nothing and the endpoint returns 404 at `routers/retrieval.py:1761-1762`.

### Effect on another user’s destination

For an owned source file and a known foreign destination:

- An existing destination is **appended to**, because a supplied `collection_name` sets `add=True`.
- A nonexistent destination may be created by the vector backend.
- Existing foreign vectors are not deleted or overwritten through this path.
- The attacker can supply `content`, so poisoning does not require the uploaded file’s original content.
- The direct endpoint does **not** create a `KnowledgeFile` relational record. Therefore the foreign knowledge base’s file list need not show the injected file, even though retrieval queries search the vector collection directly (`routers/retrieval.py:2364-2412`).

This enables cross-tenant knowledge/vector poisoning, including inserting prompt-injection content into another user’s knowledge collection or `file-<victim-id>` collection.

### Internal callers

Some internal callers add their own protection:

- `/api/v1/knowledge/{id}/file/add` checks ownership, a write grant, or admin status for the destination knowledge base before calling `process_file` with `collection_name=id` (`routers/knowledge.py:616-666`).
- Knowledge update applies a similar destination check (`routers/knowledge.py:689-744`).
- File upload processing normally omits `collection_name`, producing the matching `file-{id}` destination (`routers/files.py:105-160`).

Those protected call paths do not protect a direct call to `/api/v1/retrieval/process/file`.

## Visible exploit conditions and limits

- The caller must be an authenticated, verified user.
- The caller needs an owned file ID; file IDs are UUIDs (`routers/files.py:247-250`).
- The caller must know the target collection name. Knowledge IDs are UUIDs (`models/knowledge.py:152-163`); this review does not establish how an attacker learns one.
- `BYPASS_EMBEDDING_AND_RETRIEVAL` must be disabled for an actual vector write. If enabled, only the source file state is updated and the response reports no collection (`routers/retrieval.py:1673-1681`).
- Content must produce at least one document, and embedding/vector operations must succeed.
- A matching content hash already stored under a different `file_id` causes duplicate-content rejection (`routers/retrieval.py:1368-1387`).
- API-key callers may additionally be constrained by configured endpoint restrictions (`utils/auth.py:428-440`); ordinary authenticated sessions are not shown as requiring that allowlist.
- This was static source analysis; runtime middleware, deployment-specific vector permissions, and exploitability against a live deployment were not tested.

## Recommended patch

Validate every explicitly supplied destination before querying or writing it:

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
else:
    # Ensure authorization covers the output object, not only the input file.
    await _validate_collection_access(
        [collection_name],
        user,
        access_type='write',
    )
```

Place this at `routers/retrieval.py:1566-1569`.

**Review this patch before applying. Nothing has been changed yet.**