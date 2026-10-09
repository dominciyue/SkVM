| Severity | Count |
|---|---:|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 0 |
| 🔵 Low | 0 |
| ⚪ Info | 0 |

**Scope:** Static review of `POST /api/v1/retrieval/process/file` in revision `841c9045…`. Overall runtime disposition remains **unknown** because some route/middleware and backend-isolation behavior was not resolved. The handler-local authorization mismatch is nevertheless visible.

## Access control finding

### 🟠 HIGH — Authorized file and destination collection can be different objects

**Confidence:** High for the code behavior; Medium for cross-user exploitability.

**Locations:**

- `backend/open_webui/routers/retrieval.py:1546-1569`
- `backend/open_webui/routers/retrieval.py:1596-1602`
- `backend/open_webui/routers/retrieval.py:1694-1706`
- `backend/open_webui/routers/retrieval.py:1711-1725`
- `backend/open_webui/routers/retrieval.py:1340-1545`
- `backend/open_webui/models/files.py:161-184`

The handler authorizes the **input file**, but does not visibly authorize a caller-supplied **destination collection**:

```python
if user.role == "admin":
    file = await Files.get_file_by_id(form_data.file_id, db=db)
else:
    file = await Files.get_file_by_id_and_user_id(
        form_data.file_id, user.id, db=db
    )

collection_name = form_data.collection_name
if collection_name is None:
    collection_name = f"file-{file.id}"
```

Later, that destination is passed through to the vector write:

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

`save_docs_to_vector_db` eventually calls:

```python
VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)
```

No reviewed predicate binds a supplied `collection_name` to `user.id`, `file.id`, or an authorized knowledge object. Its duplicate-hash checks are not authorization checks.

### Caller behavior

| Caller/file relationship | Result |
|---|---|
| Non-admin, caller-owned file | The `id + user_id` lookup can succeed and processing continues. |
| Non-admin, another user’s file | The ownership-constrained lookup returns no file; the handler returns HTTP 404 before processing or vector insertion. |
| Admin, caller-owned or another user’s file | Lookup is by file ID alone, so either can be processed. |
| Any selected file with retrieval bypass enabled | File content/status/hash may be updated, but vector insertion is skipped. |

### Input and output object relationship

- **Authorized input:** the `File` selected using `form_data.file_id`.
- **File-record effects:** content, status, hash, and collection metadata updates use the same selected `file.id`.
- **Vector effect:** the collection identified by local `collection_name`.

They match only conditionally:

1. **No `collection_name` supplied:** destination becomes `file-{file.id}`, so its name is derived from the selected file.
2. **`collection_name` supplied:** destination is an independent caller-controlled string. No ownership relation is checked in the reviewed path.
3. **Supplied destination without supplied content:** documents are read from `file-{file.id}` or stored file data, then written to the supplied destination.
4. **Supplied content and destination:** deletion is attempted against `file-{file.id}`, while insertion can target the supplied destination. Those may be two different collections.
5. Because `add=True` whenever a destination was supplied, an existing destination can be appended to.

Consequently, a non-admin who owns an input file can still select an unrelated destination collection. If collection names share a global namespace and are discoverable or guessable, this may permit cross-user collection poisoning or modification.

## Patch proposal

A conservative immediate mitigation is to reject arbitrary destination names at this endpoint and derive the collection exclusively from the authorized file:

```python
file_collection_name = f"file-{file.id}"

if (
    form_data.collection_name is not None
    and form_data.collection_name != file_collection_name
):
    # Security: this endpoint only writes to the collection bound to
    # the file whose ownership was checked above.
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized to write to the requested collection",
    )

collection_name = file_collection_name
```

This is intentionally restrictive and would affect the current knowledge-file add/update flows. The preferable long-term design is to accept a destination knowledge-object ID, authorize that object for the caller, and resolve its collection name server-side rather than accepting a raw collection identifier.

**Review each patch before applying. Nothing has been changed yet.**

## Remaining limits

- The full `get_verified_user`/`get_current_user` chain and all route/middleware execution semantics were not completed.
- `CommitSessionMiddleware.__call__` and `WebsocketUpgradeGuardMiddleware.__call__` remain open dependencies.
- The configured vector backend’s namespace and tenant isolation were not inspected. Cross-user exploitation is therefore conditional, not proven.
- Callers that may perform a knowledge-object ACL check before invoking this endpoint were not exhaustively traced; such a check would not protect direct calls unless enforced by this endpoint.
- The concrete vector-driver insertion implementation, deployment configuration, collection-name discoverability, and runtime state were not tested.
- Dependency and secrets audits were outside this behavior-focused review.