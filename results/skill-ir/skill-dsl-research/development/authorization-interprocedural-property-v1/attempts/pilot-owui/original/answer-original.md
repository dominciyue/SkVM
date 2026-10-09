## Findings summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 0 |
| Info | 1 |

**Review status:** Partial/source-grounded. The final semantic check remained unaccepted because the analysis host retained an unresolved linkage for the admin `get_file_by_id` call. Its implementation was nevertheless read directly. Framework middleware and external vector-backend behavior remain limits.

## Conclusion

The authorized input and affected vector output are **not necessarily the same object**:

- Input authorization applies to the database **File** selected by `file_id`.
- A supplied `collection_name` independently selects the destination **vector collection**.
- No destination-collection ownership or ACL check is visible in `process_file` or `save_docs_to_vector_db`.

If `collection_name` is omitted, it defaults to `file-{file.id}`. That creates a naming relationship to the authorized file, but the File row and vector collection remain distinct resources.

## Access-control behavior

### Non-admin caller

The lookup requires both the supplied file ID and the authenticated user ID:

```python
file = await Files.get_file_by_id_and_user_id(
    form_data.file_id, user.id, db=db
)
```

`backend/open_webui/routers/retrieval.py:1561-1562`

The helper queries with:

```python
select(File).filter_by(id=id, user_id=user_id)
```

`backend/open_webui/models/files.py:172-184`

Therefore:

- **Caller-owned file:** processing can continue.
- **Another user’s file:** no File is returned, so the handler raises HTTP 404 before processing or vector insertion (`retrieval.py:1564,1761-1762`).

### Admin caller

Admins use a primary-key lookup without a `user_id` predicate:

```python
file = await Files.get_file_by_id(form_data.file_id, db=db)
```

`backend/open_webui/routers/retrieval.py:1559-1560`  
`backend/open_webui/models/files.py:161-170`

Thus an admin may process any existing File identified by `file_id`.

## 🟡 MEDIUM — Destination collection is not bound to file authorization

**Confidence:** High for the visible data flow; Medium for exploitability because vector-backend tenancy is outside scope.

The destination starts directly from caller input:

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f"file-{file.id}"
```

`backend/open_webui/routers/retrieval.py:1566-1569`

It later reaches:

```python
save_docs_to_vector_db(
    ...,
    collection_name=collection_name,
    ...,
    add=(True if form_data.collection_name else False),
)
```

`backend/open_webui/routers/retrieval.py:1694-1705`

The helper ultimately inserts into that same named collection:

```python
VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)
```

`backend/open_webui/routers/retrieval.py:1528-1531`

### Practical result

A non-admin who owns **any valid input file** can reach the vector-write path with a different, caller-supplied destination name. The reviewed code does not establish that the caller owns or may modify that destination.

If collection names are shared or guessable and the concrete vector backend adds no independent isolation, this could permit cross-collection data insertion or collection contamination.

A supplied truthy collection name also sets `add=True`; an existing destination therefore does not take the helper’s `add=False` early-return path.

## ⚪ INFO — Processing branches and secondary effects

**Confidence:** High.

After file selection:

1. **Truthy `content`** — constructs documents from caller content and best-effort deletes only the source file’s default collection, `file-{file.id}` (`retrieval.py:1571-1595`).
2. **No content, truthy `collection_name`** — reads prior documents from `file-{file.id}`, filtered by `file_id`, or falls back to stored File data (`retrieval.py:1596-1626`).
3. **Neither** — extracts from the File’s storage path or stored data (`retrieval.py:1627-1663`).
4. The selected File’s content and hash are updated by `file.id` (`retrieval.py:1666-1675`).
5. If `BYPASS_EMBEDDING_AND_RETRIEVAL` is enabled, processing returns successfully without a vector write (`retrieval.py:1673-1681`).
6. Following a successful vector save, the destination name, status, and hash are recorded on the same selected File (`retrieval.py:1709-1732`).
7. Caught failures mark that File failed, clear its hash, and return HTTP 400 (`retrieval.py:1738-1759`).

Notably, an empty-string `collection_name` is not `None`, so it is preserved as the effective destination, while its falsiness makes `add=False` and skips the collection-copy branch.

## Remaining limits

- Only `backend/open_webui` was available; no frontend caller was traced. The source-visible caller is therefore an HTTP client reaching `POST /api/v1/retrieval/process/file` with a verified-user dependency (`retrieval.py:1546-1551`).
- Concrete vector-database namespace isolation, tenancy, and external authorization were not visible.
- Several framework middleware relationships remain unread or semantically unresolved.
- No independent policy defining who should own a destination collection was supplied.
- Dependency and secrets audits were outside this behavior investigation.

No code was changed.