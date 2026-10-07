## Result — partial / unreviewed

No authorization bypass is evident in the inspected branches. The automated semantic check failed because the `download → file_response` return/exception relation was not fully linked; the source-supported conclusions below remain valid but are not a fully checked machine result.

### Authorization and resource selection

1. `DocumentViewSet` declares `IsAuthenticated` and `PaperlessObjectPermissions` as upstream permission classes (`src/documents/views.py:1008-1027`).
2. `download(pk)` delegates to `file_response(pk, request, "attachment")` (`src/documents/views.py:1835-1839`).
3. `pk` first selects `request_doc`. The code then derives its `root_doc` and checks:
   - root is unowned, or
   - `request.user` owns it, or
   - the user has `view_document` on it.
   
   Failure returns HTTP 403 (`src/documents/views.py:1401-1427`; `src/documents/permissions.py:624-635`).

**Therefore, the authorized resource is `root_doc`, not whichever historical version is ultimately served.**

### Which version is returned

After the root authorization succeeds:

- If `pk` directly names a version and there is no `version` query parameter, that requested version becomes the effective file document.
- Otherwise, no `version` parameter selects the latest version for the root, falling back to the root itself.
- An explicit `version=<id>` is accepted only if it identifies the root itself or a document whose `root_document_id` equals that root’s ID.
- An invalid, missing, or unrelated version produces not-found behavior rather than returning its file.

See `src/documents/views.py:1375-1399` and `src/documents/versioning.py:140-195`.

Consequently, selecting another version **changes the file-bearing document but does not change the object being authorized**. Cross-root version substitution is rejected.

### Original versus archive

For the selected effective file document:

- Exact `original=true` selects `source_file`.
- Otherwise, `archive_file` is returned when that document has an archive version.
- If it has no archive, `source_file` is returned.
- `follow_formatting` changes filename formatting, not authorization or document selection.

See `src/documents/views.py:1368-1373`, `1429-1448`, and `4941-4995`.

### Relevant outcomes

- Root is unowned, caller-owned, or grants `view_document`: file selection proceeds.
- Root is owned by someone else and the caller lacks the object grant: HTTP 403 before file bytes are served.
- Missing document/file or invalid/out-of-family version: HTTP 404/not-found.
- The action loads the initial `pk` through `global_objects`; explicit and direct-version branches can therefore involve deleted records, subject to the same root authorization logic.

### Unspecified runtime facts

A concrete allow/deny answer requires facts not supplied:

- the authenticated user’s identity;
- the root document’s owner;
- object grants held by that user;
- `pk`, `version`, and `original` values;
- deletion state and archive availability.

The failed semantic check specifically left the delegated call’s normal return and unmatched-exception paths unresolved; it does not contradict the directly inspected authorization, version-family, and representation branches above.