# Authored Download source summary

These are unreviewed authored source meanings, not a verdict or instructions. They are the same meanings supplied to the executable-program consumer, rendered as Markdown without host computation.

Local scope: src/documents/views.py:1429-1448; receiver DocumentViewSet; original question requested-document-and-returned-file.

Download router/action, APIView initial authentication and permission classes remain source-review duties outside this local resource summary.

## Input contract

request, actor, documents, related_root
development-premise: Finite documents input represents the complete relevant population including deleted records; absent inputs remain unknown. owner_id equality represents ORM user identity by primary key. related_root is the actual loaded relation or null, not an inferred grant.

## Source declarations

src/documents/views.py:1429-1448: self is a context formal. Actual local formal; this declaration alone does not establish call effects.
src/documents/views.py:1429-1448: pk is a context formal. Actual local formal; this declaration alone does not establish call effects.
src/documents/views.py:1429-1448: request is a context formal. Actual local formal; this declaration alone does not establish call effects.
src/documents/views.py:1429-1448: disposition is a context formal. Actual local formal; this declaration alone does not establish call effects.

## Ordered resource steps

### 1. request_include_deleted

Bind request_include_deleted = true.

file_response passes its own include_deleted=True to requested/root lookup.

Source: src/documents/views.py:1430-1434; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 2. request_doc

Select request_doc from documents where row.id = request.pk. Require at most one matching record; no match is null, unknown membership remains unknown.

Select the requested pk from the supplied complete finite global-object population, including deleted records.

Source: src/documents/views.py:1408-1415; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 3. request_found

Require NOT (request_doc IS null); otherwise terminate with Http404-request.  Unknown preserves this condition.

Missing requested document stops before root authorization.

Source: src/documents/views.py:1410-1415; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 4. root_lookup

Execute only when (NOT (request_doc.root_document_id IS null) AND related_root IS null); otherwise this branch is skipped.

Select root_lookup from documents where row.id = request_doc.root_document_id. Require at most one matching record; no match is null, unknown membership remains unknown.

Fallback root lookup has the requested/root helper's own include_deleted=True.

Source: src/documents/versioning.py:154-156; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 5. root_doc

Bind root_doc = IF request_doc.root_document_id IS null THEN request_doc ELSE first non-null of (related_root, root_lookup, request_doc); unknown remains unknown.

Root records return themselves; a loaded relation wins; otherwise root lookup or requested record fallback.

Source: src/documents/versioning.py:146-156; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 6. checker_constructed

Execute only when NOT (actor IS null); otherwise this branch is skipped.

External ObjectPermissionChecker.construct(user=actor.id) -> checker_constructed; only exact named external assumptions can supply its result.

The external checker constructor executes even on the unowned/owner shortcut; normal completion is an explicit external assumption.

Source: src/documents/permissions.py:634-634; SHA256 bb2af1efd059d69f489dea57fb579cf78967e607455820cedc2ea21226475065.

### 7. checker_completion

Execute only when NOT (actor IS null); otherwise this branch is skipped.

Require Python truthiness of checker_constructed; otherwise terminate with external-checker-failure.  Unknown preserves this condition.

Continue only conditionally when external constructor completion is unknown.

Source: src/documents/permissions.py:634-634; SHA256 bb2af1efd059d69f489dea57fb579cf78967e607455820cedc2ea21226475065.

### 8. object_grant

Execute only when (NOT (actor IS null) AND NOT (root_doc.owner_id IS null) AND NOT (root_doc.owner_id = actor.id)); otherwise this branch is skipped.

External ObjectPermissionChecker.has_perm(user=actor.id, resource=root_doc.id, permission="view_document") -> object_grant; only exact named external assumptions can supply its result.

External object grant is consulted only after unowned and same-owner shortcuts; it stays unknown without an exact argument assumption.

Source: src/documents/permissions.py:635-635; SHA256 bb2af1efd059d69f489dea57fb579cf78967e607455820cedc2ea21226475065.

### 9. root_authorized

Require (actor IS null OR root_doc.owner_id IS null OR root_doc.owner_id = actor.id OR Python truthiness of object_grant); otherwise terminate with HttpResponseForbidden. Principal: actor. Resource: root_doc. Permission: view_document. Unknown preserves this condition.

For non-null user, owner-aware permission is checked on root_doc before effective-file selection. Null user skips this local check only; this says nothing about request authentication.

Source: src/documents/views.py:1421-1427; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 10. direct_requested_version

Bind direct_requested_version = (NOT (request_doc.root_document_id IS null) AND request.version IS null).

A requested version with no version parameter returns itself after root authorization.

Source: src/documents/views.py:1394-1399; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 11. version_include_deleted

Bind version_include_deleted = NOT (request.version IS null).

Version selection independently uses presence, not truthiness, to choose its manager; empty string is present.

Source: src/documents/views.py:1375-1381; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 12. explicit_version

Bind explicit_version = Python truthiness of request.version.

The inner selector separately uses truthiness: null and empty string choose latest.

Source: src/documents/versioning.py:175-182; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 13. version_id

Execute only when (NOT (Python truthiness of direct_requested_version) AND Python truthiness of explicit_version); otherwise this branch is skipped.

Bind version_id = bounded decimal integer(request.version).

Parse explicit version as bounded decimal; invalid ASCII maps to null and unsupported Python integer forms remain gaps.

Source: src/documents/versioning.py:184-187; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 14. version_valid

Execute only when (NOT (Python truthiness of direct_requested_version) AND Python truthiness of explicit_version); otherwise this branch is skipped.

Require NOT (version_id IS null); otherwise terminate with NotFound-invalid-version.  Unknown preserves this condition.

Invalid explicit version returns before candidate/file selection.

Source: src/documents/views.py:1382-1383; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 15. candidate

Execute only when (NOT (Python truthiness of direct_requested_version) AND Python truthiness of explicit_version); otherwise this branch is skipped.

Select candidate from documents where (row.id = version_id AND (Python truthiness of version_include_deleted OR row.deleted = false)). Require at most one matching record; no match is null, unknown membership remains unknown.

Explicit candidate selection uses only its own include_deleted argument.

Source: src/documents/versioning.py:189-192; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 16. candidate_found

Execute only when (NOT (Python truthiness of direct_requested_version) AND Python truthiness of explicit_version); otherwise this branch is skipped.

Require NOT (candidate IS null); otherwise terminate with Http404-version.  Unknown preserves this condition.

No selected candidate stops the response.

Source: src/documents/views.py:1384-1385; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 17. candidate_belongs

Execute only when (NOT (Python truthiness of direct_requested_version) AND Python truthiness of explicit_version); otherwise this branch is skipped.

Require (candidate.id = root_doc.id OR candidate.root_document_id = root_doc.id); otherwise terminate with Http404-unrelated-version.  Unknown preserves this condition.

Candidate must equal the authorized root or refer to that root.

Source: src/documents/versioning.py:193-195; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 18. latest_candidate

Execute only when (NOT (Python truthiness of direct_requested_version) AND NOT (Python truthiness of explicit_version)); otherwise this branch is skipped.

Select latest_candidate from documents where (row.root_document_id = root_doc.id AND (Python truthiness of version_include_deleted OR row.deleted = false)). Take first by order [{"field":"version_index","direction":"desc","nulls":"last"},{"field":"id","direction":"desc"}]; no match is null, unknown membership remains unknown.

Latest selection uses its own manager and source ordering, with root fallback when empty.

Source: src/documents/versioning.py:159-166; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 19. latest_file

Execute only when (NOT (Python truthiness of direct_requested_version) AND NOT (Python truthiness of explicit_version)); otherwise this branch is skipped.

Bind latest_file = first non-null of (latest_candidate, root_doc); unknown remains unknown.

An empty latest-version selection returns the authorized root.

Source: src/documents/versioning.py:165-166; SHA256 de017348cbb361787d68433537bdbd39f8b56a95185a53c3cef3aa10df365766.

### 20. file_doc

Bind file_doc = IF Python truthiness of direct_requested_version THEN request_doc ELSE IF Python truthiness of explicit_version THEN candidate ELSE latest_file.

The selected file object is computed after root permission; explicit selection is not a second permission check.

Source: src/documents/views.py:1388-1399; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 21. original_requested

Bind original_requested = request.original = "true".

Only exact string true requests original; absent original must be supplied as null in complete query facts.

Source: src/documents/views.py:1369-1373; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 22. use_archive

Bind use_archive = (NOT (Python truthiness of original_requested) AND Python truthiness of file_doc.has_archive_version).

Representation follows selected file archive availability and exact original request; root authorization remains unchanged.

Source: src/documents/views.py:1442-1448; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 23. representation

Bind representation = IF Python truthiness of use_archive THEN "archive" ELSE "original".

serve_file chooses archive or source representation.

Source: src/documents/views.py:4941-4970; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 24. selected_path

Bind selected_path = IF Python truthiness of use_archive THEN file_doc.archive_file ELSE file_doc.source_file.

File location is a supplied source-object field; no disk or business code is executed.

Source: src/documents/views.py:4941-4970; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

### 25. returned_file

Return returned_file = {requested_id: request_doc.id, authorized_root_id: root_doc.id, file_document_id: file_doc.id, representation: representation, path: selected_path, disposition: "attachment"}.

Conditional file-response descriptor after computed selection. Actual storage open, formatting, headers and external exceptions remain separate gaps, not a claimed successful network response.

Source: src/documents/views.py:1442-1448; SHA256 4875a5d3c0c82923d7cf8f8fb3a2b2d7fc7768a952eaa857390136b923d5b1eb.

## Gaps

- Request-level routing/authentication/permission checks require independent original-source review.
- Storage existence/opening, filename formatting, FileResponse and header behavior are outside the finite selection descriptor.
- ORM/database failure and external checker behavior are not executed; source summaries are authored and unreviewed.
