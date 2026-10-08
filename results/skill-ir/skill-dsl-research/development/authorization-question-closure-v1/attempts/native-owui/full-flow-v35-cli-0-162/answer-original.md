## Findings summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 1 |
| Medium | 0 |
| Low | 0 |
| Info | 0 |

**Review status:** Partial/unreviewed. The final authorization check failed because several contextual calls and upstream middleware relations remain uninterpreted. The decisive handler and vector-write path below is directly evidenced.

## Access control

### HIGH — Input-file authorization does not authorize the destination collection

**Confidence:** Medium  
**Location:** `backend/open_webui/routers/retrieval.py:1559-1569, 1694-1705, 1459-1467, 1527-1531`

The route authenticates a verified `user`, then authorizes the **input File record**:

```python
if user.role == 'admin':
    file = await Files.get_file_by_id(form_data.file_id, db=db)
else:
    file = await Files.get_file_by_id_and_user_id(
        form_data.file_id, user.id, db=db
    )
```

`get_file_by_id_and_user_id` queries using both `id` and `user_id` (`models/files.py:172-184`). Therefore:

- A non-admin’s caller-owned file proceeds.
- Another user’s file returns no match, causing HTTP 404 at `retrieval.py:1761-1762`.
- An admin can select any existing file by ID.

The destination is independently selected:

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
```

When supplied, that value reaches the vector-save operation without a visible destination ownership check:

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

For a supplied name, `add=True`. In `save_docs_to_vector_db`, an existing collection only causes an early return when `add is False`:

```python
if VECTOR_DB_CLIENT.has_collection(collection_name=collection_name):
    ...
    elif add is False:
        return True

VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)
```

### Object comparison

| Stage | Object |
|---|---|
| Authorization | File selected by `file_id`, and by `user.id` for non-admins |
| File metadata/status updates | The authorized `file.id` |
| Vector effect | Supplied or derived `collection_name` |

These are **not the same protected object**. If no destination is supplied, the vector collection is predictably coupled to the file as `file-{file.id}`, but it remains a separate resource. If supplied, it is entirely caller-controlled in the examined path.

### Result by caller/file relationship

- **Non-admin + caller-owned file:** Processing is allowed. The caller can direct the resulting chunks into an arbitrary named collection, including potentially another user’s collection.
- **Non-admin + another user’s file:** Owner-filtered lookup fails; HTTP 404 occurs before file processing or vector insertion.
- **Admin + another user’s file:** Allowed by the explicit admin branch; the same arbitrary-destination behavior applies.
- **Retrieval bypass enabled:** The selected file’s content/status/hash are updated, but the handler returns before any vector write.
- **Unique-content condition:** The duplicate-hash check may reject content already associated with a different `file_id`, but it is not a destination ownership check.

The practical risk is cross-user vector-store pollution, subject to the attacker knowing or guessing a collection name and processing/embedding succeeding.

## Recommended remediation

Require write authorization for every supplied `collection_name`. A safe immediate hardening is to prohibit custom destinations on this public endpoint:

```python
collection_name = form_data.collection_name

# Security: public file processing may only affect this file's collection.
if collection_name is not None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Custom collection destinations are not allowed",
    )

collection_name = f"file-{file.id}"
```

Knowledge-collection workflows should instead call an internal processing function only after their owning knowledge object and the caller’s write permission have been checked. Do not rely on collection-name secrecy.

## Remaining limits

- The concrete vector backend was not traced for deployment-level tenant namespacing or ACL enforcement. Such controls could reduce the cross-user impact.
- Not every application middleware and nested authentication dependency was fully interpreted.
- Contextual document-loading and error-handling calls remain unreviewed, but they do not supply a visible collection authorization check in the traced write path.

**Review each patch before applying. Nothing has been changed yet.**