## Findings summary

| Critical | High | Medium | Low | Info |
|---:|---:|---:|---:|---:|
| 0 | 1 | 0 | 0 | 0 |

## Conclusion

**The object authorized for input and the object affected by the vector output are not necessarily the same.**

- Input authorization applies to the file selected by `file_id`.
- If supplied, `collection_name` independently selects the output collection.
- Neither `process_file` nor `save_docs_to_vector_db` visibly verifies that the caller owns or may modify that destination collection.

Consequently, a normal user who owns an input file can direct its contents into another named collection, subject to runtime configuration and vector-backend behavior.

---

## 🟠 HIGH — Destination collection is not authorized

**Confidence:** High  
**Category:** Broken object-level authorization / confused deputy

### Caller and input-file authorization

`POST /process/file` requires `get_verified_user`, which accepts `user` and `admin` roles and rejects other roles with 401:

- `backend/open_webui/routers/retrieval.py:1546-1551`
- `backend/open_webui/utils/auth.py:458-464`

The supplied `file_id` is then checked differently by role:

```python
if user.role == 'admin':
    file = await Files.get_file_by_id(form_data.file_id, db=db)
else:
    file = await Files.get_file_by_id_and_user_id(
        form_data.file_id, user.id, db=db
    )
```

`backend/open_webui/routers/retrieval.py:1559-1562`

The model methods confirm that:

- `get_file_by_id` performs an ID-only primary-key lookup.
- `get_file_by_id_and_user_id` filters on both `id` and `user_id`.

`backend/open_webui/models/files.py:161-184`

### Destination binding

The output collection is independently caller-controlled when supplied:

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
```

`backend/open_webui/routers/retrieval.py:1566-1569`

It is subsequently passed to the vector helper:

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

Inside `save_docs_to_vector_db`, the named collection is queried, checked for existence, and eventually written:

```python
VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)
```

`backend/open_webui/routers/retrieval.py:1368-1387, 1458-1531`

No caller-to-collection ownership or write-permission lookup is visible. The `user` argument is passed to the embedding function, not used as a collection authorization guard.

### Behavior by caller/file relationship

| Situation | Result |
|---|---|
| Normal user supplies their own `file_id` | File lookup succeeds. They can supply an independent `collection_name`, including one not shown to belong to them. |
| Normal user supplies another user’s `file_id` | Owner-filtered lookup returns no file; route returns 404 before processing or vector writing. |
| Admin supplies another user’s `file_id` | ID-only lookup can select it; processing and file/vector effects may proceed. |
| `collection_name` omitted | Destination is derived as `file-{file.id}`, binding it to the selected file by naming convention. |
| Retrieval bypass enabled | Selected file content/status/hash may be updated, but no vector write occurs and the response reports `collection_name: None`. |

### Additional visible conditions

- With supplied `content`, the route first attempts to delete the selected file’s default `file-{file.id}` collection—even if another destination was supplied. Deletion failures are swallowed (`retrieval.py:1571-1580`).
- With a destination but no content, source documents are read from `file-{file.id}` and copied to the requested destination, falling back to stored file data (`retrieval.py:1596-1626`).
- A truthy supplied collection sets `add=True`; an existing destination therefore does not trigger the helper’s `add is False` early return.
- Duplicate-content detection may reject a write, but it compares hashes and `file_id`; it is not an ownership check (`retrieval.py:1368-1387`).
- On success, the selected file row records the supplied destination in its metadata (`retrieval.py:1709-1732`).
- An empty-string destination differs from `None`: it is not replaced with `file-{id}`, although backend acceptance of an empty collection name is unknown.

## Proposed containment patch

A minimal fail-closed fix is to prevent non-admin callers from naming a collection other than the selected file’s default collection. If legitimate knowledge-base workflows require cross-collection writes, this should instead be replaced with an explicit destination ACL lookup.

**Before:**

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
```

**After:**

```python
default_collection_name = f'file-{file.id}'
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = default_collection_name
elif user.role != 'admin' and collection_name != default_collection_name:
    # Security: do not let a user write an owned file into an
    # independently named collection without destination authorization.
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
    )
```

**Review each patch before applying. Nothing has been changed yet.**

## Remaining limits

- This was static source inspection of revision `841c9045d789005145274955e7ef60b1b11a9be9`; runtime middleware, reverse proxies, configuration, and vector-backend tenant isolation were not observed.
- Collection-name discoverability, backend namespace isolation, and backend acceptance rules remain unknown.
- The authorization result checker exhausted its checks on a result-schema error (`protectedEffect` enum), so the machine-checked result remains **partial/unreviewed**. The conclusions above come from the cited original source.
- Internal semantic linking retained diagnostics around the `Files` table receiver and `user.id` binding; the directly read method bodies nevertheless show the ID-only and ID-plus-owner predicates described above.