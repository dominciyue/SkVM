## Findings summary

| Severity | Count | Confidence |
|---|---:|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 1 | High |
| 🟡 Medium | 0 | — |
| 🔵 Low | 0 | — |

> **Review status:** Source conclusions are partial/unreviewed by the semantic checker. Its final check failed because it could not bind/link the two `Files` helper calls, although both helper bodies were read directly.

## 🟠 Authorization-object mismatch

**Finding:** The route authorizes the input `File`, but does not visibly authorize a caller-supplied destination `collection_name`.

### Caller and input authorization

The route uses `Depends(get_verified_user)`:

- `get_verified_user` permits only roles `user` and `admin`; other roles receive HTTP 401 (`backend/open_webui/utils/auth.py:458-464`).
- The underlying `get_current_user` credential/session mechanism was not traced.

Authorization then depends on role:

```python
if user.role == 'admin':
    file = await Files.get_file_by_id(form_data.file_id, db=db)
else:
    file = await Files.get_file_by_id_and_user_id(
        form_data.file_id, user.id, db=db
    )
```

`backend/open_webui/routers/retrieval.py:1559-1562`

The helper bodies establish:

- `get_file_by_id` is a primary-key lookup with no owner predicate (`backend/open_webui/models/files.py:161-170`).
- `get_file_by_id_and_user_id` requires both `File.id == file_id` and `File.user_id == user.id` (`backend/open_webui/models/files.py:172-184`).

If the lookup returns no file, processing terminates with HTTP 404 (`backend/open_webui/routers/retrieval.py:1761-1762`).

### Destination selection

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
```

`backend/open_webui/routers/retrieval.py:1566-1569`

Therefore:

- **Omitted destination:** the vector collection is derived from the authorized file ID. The File row and collection remain different storage objects, but they are logically tied by `file.id`.
- **Supplied destination:** it remains a caller-controlled collection identifier. There is no visible comparison to the file owner, caller, or another authorized collection object.

The eventual call includes:

```python
collection_name=collection_name,
add=(True if form_data.collection_name else False),
user=user,
```

`backend/open_webui/routers/retrieval.py:1694-1705`

For a non-empty supplied name, `add=True`. `save_docs_to_vector_db` can then reach:

```python
VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)
```

`backend/open_webui/routers/retrieval.py:1527-1531`

No collection-owner or collection-access check is visible in the examined route or save routine. Existing-file/hash checks in the save routine are not ownership authorization.

## Behavior by caller/file relationship

| Caller and file | Result |
|---|---|
| Ordinary verified user, caller-owned file | Processing proceeds. The caller may supply a distinct destination collection that is not shown to be caller-owned. |
| Ordinary verified user, another user’s file | Owner-scoped lookup returns no file; HTTP 404 occurs before processing or vector writes. |
| Admin, caller-owned or another user’s file | ID-only lookup permits processing of any existing file. The same unchecked destination behavior applies. |
| Missing file | HTTP 404 before processing. |
| Role other than `user`/`admin` | HTTP 401 in `get_verified_user`. |

## Other visible conditions

- If `BYPASS_EMBEDDING_AND_RETRIEVAL` is true, vector persistence is skipped. The selected File’s content/status/hash are still updated, and the response reports `collection_name: None` (`retrieval.py:1666-1681`).
- With truthy `form_data.content`, the handler first attempts to delete the canonical `file-{file.id}` collection—not the supplied destination—and suppresses deletion errors (`retrieval.py:1571-1580`). It may later insert into a different supplied destination.
- With a supplied collection name but no supplied content, it reads documents from canonical `file-{file.id}` before writing them to the requested destination (`retrieval.py:1596-1626`).
- An explicit empty-string collection name is not `None`, so it is not replaced with `file-{file.id}`; however, it is falsey for `add` and branch selection. Actual acceptance depends on the vector backend.
- Processing/vector failures mark the selected File failed, clear its hash, and generally return HTTP 400 (`retrieval.py:1738-1759`).

## Conclusion

**The authorized input and affected output are not necessarily the same object.**

Authorization protects the `File` selected by `file_id`. When `collection_name` is omitted, the output name is derived from that authorized file. When it is supplied, however, it selects a separate vector collection with no visible ownership check. Consequently, a normal user needs an owned input file but can potentially write its documents into another destination collection; an admin can also use another user’s file.

Potential cross-tenant impact depends on whether collection names are shared/guessable and whether the deployed vector backend applies unexamined namespace isolation.

## Remaining limits

- `get_current_user` was not inspected, so exact credential-to-user binding remains unverified.
- Deployment-specific vector database validation, tenancy, and namespace isolation were not established.
- No runtime execution was performed.
- The semantic check was rejected due to helper-linking diagnostics; the direct source evidence above remains precise but is labeled partial/unreviewed.

**Review each patch before applying. Nothing has been changed yet.**