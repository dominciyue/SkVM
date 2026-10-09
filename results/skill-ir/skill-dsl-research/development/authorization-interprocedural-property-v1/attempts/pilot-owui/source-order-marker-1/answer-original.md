## Findings summary

| Severity | Count |
|---|---:|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 0 |
| 🔵 Low | 0 |
| ⚪ Info | 0 |

> **Review status:** Partial/unreviewed. The final semantic check remained blocked by incomplete router/middleware modeling. The handler, file lookups, and vector-write sink were read directly.

## Access control

### 🟠 Destination collection is not the object authorized

**Confidence:** Medium  
**Location:** `backend/open_webui/routers/retrieval.py:1559-1569, 1694-1705`; `:1458-1531`

The input authorization applies to a **File**:

- Admin: lookup by `file_id` alone (`retrieval.py:1559-1560`).
- Non-admin: lookup by `file_id` and `user.id` (`retrieval.py:1561-1562`).
- The latter database query filters both `id` and `user_id` (`models/files.py:172-180`).
- No matching file leads to HTTP 404 before processing (`retrieval.py:1761-1762`).

The eventual vector effect applies to a separate object—the collection named by `collection_name`:

```python
collection_name = form_data.collection_name
if collection_name is None:
    collection_name = f"file-{file.id}"
```

When supplied, that name flows unchanged to:

```python
save_docs_to_vector_db(
    ...,
    collection_name=collection_name,
    add=(True if form_data.collection_name else False),
)
```

`save_docs_to_vector_db` then checks collection existence and ultimately calls:

```python
VECTOR_DB_CLIENT.insert(
    collection_name=collection_name,
    items=items,
)
```

No caller-to-collection ownership or permission check is visible before this insert (`retrieval.py:1458-1531`).

**Conclusion:** The authorized input and affected output are **not generally the same object**. The input is a File; the output is a named vector collection. If no destination is supplied, its name is derived from the file (`file-<file.id>`), but it remains a separate resource. If a destination is supplied, there is not even that derivation relationship.

### Result by caller and input

| Case | Visible behavior |
|---|---|
| Non-admin, caller-owned file | File lookup can succeed; processing continues. |
| Non-admin, another user’s file | Ownership-scoped lookup returns no match; handler returns 404 before vector effects. |
| Admin, another user’s file | Admin’s ID-only lookup can select it; processing continues. |
| Owned file plus another user’s destination collection | No destination ownership check is visible; insertion may reach that named collection, subject to backend behavior. |

For a supplied truthy `collection_name`, `add=True`. Therefore an existing destination does not take the `add is False` early-return path and can receive inserted items (`retrieval.py:1459-1467, 1527-1531`).

## Other visible conditions

- `get_verified_user` accepts only roles `user` and `admin` (`utils/auth.py:458-464`).
- With truthy `form_data.content`, the handler first attempts to delete `file-<file.id>`, regardless of a separately supplied destination (`retrieval.py:1571-1580`).
- With a supplied destination but no direct content, source documents are read from `file-<file.id>` or stored file data, then written to the supplied destination (`retrieval.py:1596-1626`).
- If `BYPASS_EMBEDDING_AND_RETRIEVAL` is enabled, only the selected File record is updated; no vector write occurs (`retrieval.py:1673-1681`).
- File data, status, hash, and collection metadata updates remain keyed by `file.id`, so those database effects target the selected input File.

## Remaining limits

- Router and middleware closure was not completely modeled; the automated authorization check therefore failed with `framework-router-options-unmodeled`.
- `CommitSessionMiddleware.__call__` and `WebsocketUpgradeGuardMiddleware.__call__` remained open dependencies.
- The concrete deployed `VECTOR_DB_CLIENT` implementation was not reviewed. Backend ACLs or collection-name normalization could add restrictions not visible here.
- No destination collection ownership model was available in the reviewed path. Absence of a check here does not prove that an external service cannot reject the operation.

A proper fix should authorize `collection_name` against its owning knowledge/resource record before any query, deletion, or insertion. A concrete patch is withheld because the authoritative destination-ownership model was outside the reviewed source.

**Review each patch before applying. Nothing has been changed yet.**