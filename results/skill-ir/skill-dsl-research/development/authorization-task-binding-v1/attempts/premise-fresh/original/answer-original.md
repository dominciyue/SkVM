## Status

**Partial, source-grounded trace; final protocol validation failed.** The result check was rejected because each `paths[]` entry lacked its required `explanation`, after which tool delivery closed. One internal authorization-link diagnostic also remained unresolved. The conclusions below therefore remain **unreviewed**, not a vulnerability verdict.

## 1. Requested document and returned file

1. `download` is a detail-only GET action. It receives the route `pk` and calls `file_response(pk, request, "attachment")`; missing documents or files become HTTP 404.  
   `src/documents/views.py:1834-1839`

2. `file_response` loads the document identified by `pk` with deleted documents included, derives its root document, and performs the root authorization check.  
   `src/documents/views.py:1401-1427,1429-1436`

3. Effective version selection then follows:

   - If the `pk` document is itself a version (`root_document_id` is non-null) and there is **no** version query parameter, that exact `pk` document is used.
   - Otherwise, selection is delegated to `resolve_requested_version_for_root(root_doc, request, ...)`.
   - An invalid version parameter raises REST `NotFound`; no resolved document raises HTTP 404.
   - Deleted versions are included by the resolver only when a version parameter was supplied.  
     `src/documents/views.py:1375-1399`

4. Representation selection is performed on the effective document:

   - `original=true`, exactly lowercase, selects the source/original file.
   - Otherwise, the archive is selected when `file_doc.has_archive_version` is true.
   - Otherwise, it falls back to the source/original file.  
     `src/documents/views.py:1368-1373,1442-1448`

5. `serve_file` returns:

   - Archive branch: `doc.archive_file`, PDF MIME type.
   - Original branch: `doc.source_file`, `doc.mime_type`.
   - An attachment response with normalized ASCII and RFC 5987 encoded filenames.  
     `src/documents/views.py:4941-4995`

`follow_formatting` affects only the download filename: a truthy value uses the stored filename; otherwise the public filename is generated. The parameter is passed directly from the query string rather than explicitly converted to a boolean.  
`src/documents/views.py:1447,4953-4965`

## 2. Authorization and selection order

The explicit application check is:

```text
has_perms_owner_aware(request.user, "view_document", root_doc)
```

For a non-null user, failure returns HTTP 403. It occurs in this order:

1. Load the `pk`-selected request document.
2. Derive its root document.
3. Check `view_document` on that **root document**.
4. Select the effective document version.
5. Select original versus archive.
6. Construct the file response.

Evidence: `src/documents/views.py:1408-1448`.

Therefore, version and representation selection happen **after** the shown owner-aware authorization check.

The premise that the caller owns the `pk` document is not sufficient for an unconditional allow conclusion when that document is a version: the checked object is its root document, whose ownership and grants are unspecified. The exact rule by which `has_perms_owner_aware` translates ownership or grants into `view_document` permission was not completed in this trace.

## 3. Alternate version versus authorized resource

Selecting another version does **not** change the resource used by the explicit check:

- Authorized resource: `root_doc` derived from the URL-selected document.
- Returned resource: the effective document selected afterward.
- Returned representation: that effective document’s `source_file` or `archive_file`.

No second owner-aware check on the effective version, `source_file`, or `archive_file appears in the traced chain.

Consequently:

- `original=true` versus archive availability changes only the file representation.
- A version parameter may change the document whose file is returned.
- Neither branch changes the object checked by the shown authorization call.

This establishes control ordering, but not whether root authorization is intended to confer access to every related version; that policy was not supplied.

## 4. Missing facts and conditional conclusions

The following facts remain unresolved:

- The precise owner/object-grant semantics of `has_perms_owner_aware`.
- Whether the `pk` identifies a root document or one of its versions.
- Ownership and object grants on the related root document and other versions.
- The exact accepted version-parameter syntax and complete resolver policy.
- Whether the selected version is deleted.
- Whether it has an archive representation.
- Whether the selected storage file exists.
- The complete upstream REST Framework authentication, router, and viewset permission path.

These gaps block:

- An unconditional conclusion that ownership of the `pk` document authorizes the download.
- A concrete prediction of which version or file a particular request returns.
- A conclusion that returning another version without a separate version-level check is either permitted or a policy violation.

They do **not** block the source-established conclusion that the explicit root-document check precedes effective-version and original/archive selection.