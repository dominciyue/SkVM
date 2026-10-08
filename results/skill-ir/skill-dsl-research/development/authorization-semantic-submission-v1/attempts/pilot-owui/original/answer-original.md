## Findings summary

| Severity | Count |
|---|---:|
| 🔴 Critical | 0 |
| 🟠 High | 1 potential |
| 🟡 Medium | 0 |
| 🔵 Low | 0 |
| ⚪ Info | 1 |

## Authorization & access control

### 🟠 Potential HIGH — Input file authorization does not cover the destination collection

**Confidence:** Medium overall; High for the shown handler  
**Location:** `backend/open_webui/routers/retrieval.py:1546-1762`

`POST /api/v1/retrieval/process/file` requires a verified `user` or `admin` account (`utils/auth.py:458-464`). It then authorizes the supplied `file_id`:

- **Admin:** lookup by file ID alone (`retrieval.py:1559-1560`; `models/files.py:161-170`).
- **Non-admin:** lookup by both file ID and `user.id` (`retrieval.py:1561-1562`; `models/files.py:172-184`).

However, the destination is selected separately:

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
```

The resulting name is passed to vector saving without a visible ownership check:

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

(`retrieval.py:1527-1531`)

Its collection-existence and duplicate-hash checks (`retrieval.py:1368-1387,1458-1467`) are not destination authorization checks.

### Object relationship

The authorized input and affected output are **not the same object**:

- Authorized object: the file selected by `file_id`.
- Updated file-record effects: content, status, hash, and metadata affect that selected file.
- Vector effect: a collection selected by `collection_name`.

When `collection_name` is omitted, `file-<file.id>` establishes a naming relationship, but the file and collection remain different objects. When supplied, the destination can be entirely unrelated to the authorized file or caller.

### Caller-owned versus another user’s file

| Situation | Observed result |
|---|---|
| Non-admin, caller-owned file | Processing continues. A supplied `collection_name` can reach the vector write without visible destination ownership authorization. |
| Non-admin, another user’s file | Ownership-constrained lookup returns no file; handler returns HTTP 404 and does not reach processing (`retrieval.py:1761-1762`). |
| Admin, another user’s file | Admin lookup is not owner-constrained, so processing may continue. |
| File does not exist | HTTP 404. |

## Additional visible conditions

- With truthy `content`, the handler first attempts to delete `file-<file.id>` and swallows deletion errors (`retrieval.py:1571-1580`). This happens even when a different destination collection was supplied.
- With no direct content but a supplied collection, source documents are read from `file-<file.id>` or the file’s stored data (`retrieval.py:1596-1626`).
- If `BYPASS_EMBEDDING_AND_RETRIEVAL` is enabled, no vector write occurs; only the selected file record is updated (`retrieval.py:1673-1681`).
- A supplied destination sets `add=True`; an existing collection can therefore receive inserts.
- An omitted destination sets `add=False`; if the derived collection already exists, saving can return success without inserting (`retrieval.py:1458-1467`).
- Duplicate content belonging to a different `file_id` raises an error, but this still does not establish collection ownership.

## Remaining limits

Overall disposition remains **unknown outside the reviewed path** because:

1. Router binding and portions of the application middleware chain remain unmodeled; an unseen upstream collection policy cannot be excluded.
2. The deployed vector backend’s tenant namespace or isolation configuration was not established.
3. Several peripheral loader/session/update helpers remain incompletely interpreted; they may affect completion, though the reviewed write path contains no destination-owner relation.
4. Actual behavior also depends on runtime role, file ownership, collection name, bypass configuration, existing collection state, duplicate hashes, and external processing success.

**Recommended control:** before accepting a supplied `collection_name`, authorize that exact collection for the caller—or derive the destination server-side from an already-authorized resource. Do not treat file ownership as authorization for an independently named collection.

**Review any patch before applying. Nothing has been changed yet.**