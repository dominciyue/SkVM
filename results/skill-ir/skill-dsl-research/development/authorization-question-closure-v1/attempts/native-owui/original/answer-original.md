## Findings summary

| Severity | Count |
|---|---:|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 0 |
| 🔵 Low | 0 |
| ⚪ Info | 0 |

**Scope:** `process_file`, file lookup helpers, file updates, and `save_docs_to_vector_db` in the specified revision.  
**Dependency audit / secrets scan:** Not assessed; outside this targeted behavior investigation.

---

## 🟠 HIGH — Input-file authorization does not authorize the destination collection

**Confidence:** Medium  
**Category:** Broken object-level authorization / cross-collection write

### Behavior trace

1. `POST /api/v1/retrieval/process/file` binds the caller using `Depends(get_verified_user)`  
   (`backend/open_webui/routers/retrieval.py:1546-1551`).

2. Authorization applies to the **input file** identified by `form_data.file_id`:

```python
if user.role == 'admin':
    file = await Files.get_file_by_id(form_data.file_id, db=db)
else:
    file = await Files.get_file_by_id_and_user_id(
        form_data.file_id, user.id, db=db
    )
```

`backend/open_webui/routers/retrieval.py:1559-1562`

The non-admin helper filters by both `id` and `user_id`; the admin helper fetches by ID alone  
(`backend/open_webui/models/files.py:161-184`).

3. The **output resource** is selected separately:

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
```

`backend/open_webui/routers/retrieval.py:1566-1569`

4. Unless retrieval is bypassed, that name reaches the vector write:

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

`backend/open_webui/routers/retrieval.py:1694-1706`

When a destination is supplied, `add=True`. The reviewed `save_docs_to_vector_db` path checks collection existence and duplicate hashes, but does not visibly verify that the caller owns or may modify that collection before insertion  
(`backend/open_webui/routers/retrieval.py:1368-1387, 1458-1467, 1527-1531`).

### Are the authorized and affected objects the same?

**Not necessarily.**

- Authorized object: the database `File` selected by `file_id`.
- Affected vector object: the collection selected by `collection_name`.
- Selected file record: also updated with content, status, hash, and collection metadata.

If `collection_name` is omitted, the derived name `file-{file.id}` ties the collection name to the authorized input file. It is still a separate vector-store object, but the identifier is derived rather than caller-selected.

If `collection_name` is supplied, no same-object or ownership relationship is established in the reviewed code.

### Caller-owned versus another user’s file

| Caller/input | Result |
|---|---|
| Non-admin, caller-owned file | File lookup succeeds. A supplied destination collection proceeds without a visible destination authorization check. |
| Non-admin, another user’s file | Owner-filtered lookup yields no file; the handler returns HTTP 404 before processing or vector writes (`retrieval.py:1761-1762`). |
| Admin, any existing file | Lookup is not owner-filtered. Processing may target any supplied destination collection; destination ownership is still not checked here. |
| Missing/nonexistent file | Also returns HTTP 404, indistinguishable from the non-admin foreign-file case. |

### Other visible conditions

- If `content` is supplied, the canonical `file-{file.id}` collection is deleted before rebuilding; deletion errors are ignored (`retrieval.py:1571-1580`). This is the input file’s canonical collection, not necessarily the supplied destination.
- If a destination is supplied without content, source documents are first read from canonical `file-{file.id}` or from stored file data (`retrieval.py:1596-1626`).
- If `BYPASS_EMBEDDING_AND_RETRIEVAL` is true, no vector write occurs, but the selected file’s content/status/hash are updated (`retrieval.py:1666-1681`).
- Processing or vector failures mark the selected file failed and clear its hash (`retrieval.py:1738-1748`).

### Risk

A verified non-admin who owns any usable input file can provide a destination collection name that is not shown to belong to them. If collection names are discoverable or predictable and no vector-backend isolation exists, this permits cross-collection insertion/data poisoning.

The exact tenant impact depends on deployment-specific collection namespaces and backend ACLs, which were not established here.

---

## Recommended fix

Authorize the **destination collection separately** before any query, deletion, or write. The authorization must use the authoritative object associated with the collection—not merely possession of the input file.

### Patch proposal

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f"file-{file.id}"
else:
    # Security: the input-file ownership check does not authorize writes
    # to an independently supplied destination collection.
    if not await user_can_write_collection(
        user=user,
        collection_name=collection_name,
        db=db,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
        )
```

`user_can_write_collection` should resolve the collection to its owning knowledge/workspace object and apply that object’s write policy. It must fail closed when no ownership mapping exists.

**Review each patch before applying. Nothing has been changed yet.**

---

## Remaining limits

- This was a bounded static review, not runtime testing.
- Vector-backend ACLs, tenant namespaces, middleware outside the shown route, and actual collection identifiers were not established.
- The authorization-domain final check was rejected and semantic support remains **partial/unreviewed**: the source interpretation exceeded the host’s 32-block unit limit. The source-level behavior and line references above remain the basis of the conclusion.