# Security Review: `/process/file`

| Severity | Count |
|---|---:|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 0 |
| 🔵 Low | 2 |
| ⚪ Info | 0 |
| **Unresolved authorization candidates** | **1** |

**Overall:** Input-file authentication and object authorization are present. A caller-supplied destination collection is not authorized at the route, but the downstream `save_docs_to_vector_db` implementation could not be inspected within the bounded review. Cross-tenant collection modification is therefore **not confirmed**.

## 1. Caller resolution and entry guards

The handler is registered as:

```python
@router.post('/process/file')
async def process_file(
    request: Request,
    form_data: ProcessFileForm,
    user=Depends(get_verified_user),
    db: AsyncSession = Depends(get_async_session),
):
```

`backend/open_webui/routers/retrieval.py:1546-1551`

The source-discovered full route is `POST /api/v1/retrieval/process/file`.

### Authentication

`AuthTokenMiddleware` selects credentials from:

1. `Authorization`
2. the `token` cookie
3. the configured custom API-key header

It places the selected credential and API-key configuration on request state. It does **not** validate or authorize the caller itself; validation occurs downstream through `get_current_user`.

`backend/open_webui/utils/asgi_middleware.py:150-169`

The endpoint then requires `get_verified_user`:

```python
async def get_verified_user(user=Depends(get_current_user)):
    if user.role not in {'user', 'admin'}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ERROR_MESSAGES.ACCESS_PROHIBITED,
        )
    return user
```

`backend/open_webui/utils/auth.py:458-464`

Thus the visible endpoint-level identity is the user model returned by `get_current_user`, and only roles `user` and `admin` pass. Other resolved roles receive HTTP 401.

### Other middleware

- `RedirectMiddleware` applies redirect logic only to GET requests; this POST passes downstream.  
  `backend/open_webui/utils/asgi_middleware.py:228-265`
- `CommitSessionMiddleware` provides commit/rollback/session cleanup, not authorization.  
  `backend/open_webui/utils/asgi_middleware.py:86-126`
- Audit middleware may capture request and response bodies depending on deployment configuration, but it is not an authorization gate.  
  `backend/open_webui/utils/audit.py:148-184,257-289`

Application middleware not fully resolved by the source model remains a deployment/source-analysis limitation.

---

## 2. `file_id` authorization flow

The role-dependent lookup is:

```python
if user.role == 'admin':
    file = await Files.get_file_by_id(form_data.file_id, db=db)
else:
    file = await Files.get_file_by_id_and_user_id(
        form_data.file_id, user.id, db=db
    )
```

`backend/open_webui/routers/retrieval.py:1559-1562`

### Admin

`get_file_by_id` performs a primary-key lookup only:

```python
file = await db.get(File, id)
return FileModel.model_validate(file)
```

`backend/open_webui/models/files.py:161-170`

There is no ownership condition in this helper. This is a source-visible, explicit administrator bypass.

### Non-admin user

The non-admin helper enforces both identifiers:

```python
result = await db.execute(
    select(File).filter_by(id=id, user_id=user_id)
)
file = result.scalars().first()
```

`backend/open_webui/models/files.py:172-184`

The exact visible authorization predicate is:

```text
File.id == form_data.file_id
AND
File.user_id == user.id
```

No sharing, group, workspace, or other exception is visible in this path.

### Lookup failure

Both no-match and lookup exceptions resolve to no file. The endpoint then returns:

```python
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=ERROR_MESSAGES.NOT_FOUND,
)
```

`backend/open_webui/routers/retrieval.py:1761-1762`

Consequently, a non-admin request for another user’s file is indistinguishable here from a nonexistent file and reaches none of the subsequent processing code.

---

## 3. Caller-owned versus another user’s file

### Caller-owned file

Once lookup succeeds, the source can obtain document content through three branches:

1. **Truthy request `content`:** uses supplied content and attempts to delete internal collection `file-<file.id>`.  
   `backend/open_webui/routers/retrieval.py:1571-1595`
2. **No content but supplied `collection_name`:** queries internal collection `file-<file.id>` using filter `file_id == file.id`; falls back to `file.data["content"]`.  
   `backend/open_webui/routers/retrieval.py:1596-1626`
3. **Neither supplied:** loads `file.path` through storage and the configured loader, or falls back to `file.data["content"]`.  
   `backend/open_webui/routers/retrieval.py:1627-1663`

Document metadata includes the file’s metadata, filename, owner ID, and file ID.

The handler then:

- updates stored file content;
- calculates its SHA-256;
- either completes without retrieval when bypass is enabled;
- or commits and calls the vector-saving pipeline.

`backend/open_webui/routers/retrieval.py:1665-1706`

### Another user’s file

| Caller | Visible result |
|---|---|
| Non-admin `user` | Ownership query returns no row; HTTP 404; no shown processing |
| `admin` | ID-only lookup may return the file; processing is allowed |
| Unverified/other role | Rejected by `get_verified_user` with HTTP 401 |

No non-admin sharing or membership bypass was found.

---

## 4. Destination `collection_name`

The destination is handled as follows:

```python
collection_name = form_data.collection_name

if collection_name is None:
    collection_name = f'file-{file.id}'
```

`backend/open_webui/routers/retrieval.py:1566-1569`

A caller-supplied non-null value is not visibly:

- namespaced by user or tenant;
- checked for ownership;
- checked for group/workspace membership;
- checked for existence;
- checked for destination write permission;
- linked to the authorized input file.

It is forwarded unchanged:

```python
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
```

`backend/open_webui/routers/retrieval.py:1694-1706`

### Authorized object versus affected object

- **Input authorization object:** the file row selected by `file_id`; for non-admins, ownership is enforced with `user.id`.
- **Default output object:** `file-<file.id>`, visibly derived from the authorized file.
- **Supplied output object:** arbitrary `collection_name`, distinct from the authorized file and not route-visibly linked to it.

The body of `save_docs_to_vector_db` was located at `backend/open_webui/routers/retrieval.py:1340-1537`, but could not be read before the bounded source budget expired. Because that function receives `user`, a compensating authorization check may exist there. Therefore, cross-tenant write or poisoning is an **unresolved candidate**, not a confirmed finding.

---

## 5. Ordering, failures, and partial effects

Visible order:

1. Credential and caller resolution.
2. `user`/`admin` verified-role check.
3. Role-dependent file lookup.
4. HTTP 404 if no authorized file.
5. Destination selection.
6. Content loading or reuse.
7. File content update and hash calculation.
8. Optional bypass return.
9. Database commit.
10. Vector-save invocation.
11. Fresh-session metadata, status, and hash updates.

Important partial-effect behavior:

- Deletion of `file-<file.id>` occurs before later processing, and every deletion exception is swallowed.  
  `backend/open_webui/routers/retrieval.py:1575-1580`
- File content is updated before vector saving.  
  `backend/open_webui/routers/retrieval.py:1666-1686`
- A vector operation could complete before a later final-status update fails.
- The error handler marks the file failed and clears its hash, but does not visibly restore a deleted collection or undo an already-completed vector operation.  
  `backend/open_webui/routers/retrieval.py:1738-1748`

No cross-database/vector-store transaction, retry guarantee, concurrency guarantee, or rollback of external effects is visible.

---

## Findings

### 🔵 LOW — Full processed document content written to debug logs

**Confidence:** High  
**Category:** Sensitive Data Exposure  
**Location:** `backend/open_webui/routers/retrieval.py:1665`

```python
log.debug(f'text_content: {text_content}')
```

Processed files can contain credentials, personal information, proprietary documents, or other sensitive data. If debug logs are enabled or exported, operators and log consumers may receive the full file contents.

**Recommended fix:** Log only non-sensitive identifiers and sizes, for example:

```python
# Security: do not emit document contents into application logs.
log.debug(
    'processed file_id=%s, content_length=%s',
    file.id,
    len(text_content),
)
```

---

### 🔵 LOW — Internal exception details returned to clients

**Confidence:** High  
**Category:** Information Disclosure  
**Location:** `backend/open_webui/routers/retrieval.py:1755-1758`

```python
raise HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail=str(e),
)
```

Storage paths, provider errors, vector-backend details, parsing internals, or other implementation information may be exposed to authenticated callers.

**Recommended fix:** Log the original exception server-side and return a stable public message:

```python
log.exception('Failed to process file %s', file.id)
raise HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail='Failed to process file',
)
```

---

## Unresolved authorization candidate

### Caller-selected vector destination without a route-level permission check

**Potential category:** Broken object-level authorization / cross-tenant data poisoning  
**Potential severity:** High if the downstream function lacks a compensating check  
**Confidence of route-level mismatch:** High  
**Confidence of exploitability:** Low

**Prerequisites if exploitable:**

- authenticated `user` or `admin`;
- access to a processable input file;
- knowledge or prediction of another destination’s collection name;
- no effective destination authorization inside `save_docs_to_vector_db` or the vector backend.

**Potential impact:** Appending attacker-controlled documents to another knowledge collection, corrupting retrieval results, causing prompt-context poisoning, or consuming another tenant’s vector resources.

This was not promoted to a confirmed HIGH finding because the decisive callee body and external backend semantics remain unverified.

---

## Scope limitations

- `save_docs_to_vector_db` body and its exact append/replace/delete semantics were not read.
- External vector-store tenancy and access control are unknown.
- Dynamic storage and loader implementations were not fully traced.
- Some application/framework middleware relations remain unresolved.
- Actual token, cookie, API-key, and proxy configuration is deployment-dependent.
- Runtime concurrency and atomicity were not tested.
- No network access or target execution was performed.
- Dependency and repository-wide secrets audits were outside this narrowly bounded endpoint investigation.

**Review each patch before applying. Nothing has been changed yet.**