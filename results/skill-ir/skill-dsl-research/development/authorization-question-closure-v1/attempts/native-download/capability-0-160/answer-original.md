## Result

**Conditional:** the source determines the control flow, but the document’s owner and the authenticated user’s object grants were not supplied.

### Authorization and resource selection

1. `DocumentViewSet.download()` delegates to `file_response(pk, request, "attachment")`. Missing documents or files become HTTP 404.  
   `src/documents/views.py:1835-1839`

2. `file_response()` first resolves the URL-selected document and its root document. A forbidden result is returned immediately. Only afterward does it select the effective version/file document.  
   `src/documents/views.py:1429-1448`

3. The traced object-permission policy:
   - allows an object with no owner;
   - allows its owner;
   - otherwise delegates to object-level permission checking.  
   `src/documents/permissions.py:46-53`

4. The inherited object check evaluates permissions against the specific authorization object. For a safe `GET`, failure is concealed as HTTP 404; success returns `True`.  
   `framework/rest_framework-3.18.1/rest_framework/permissions.py:289-314`

Therefore:

- **Unowned authorization object:** allowed, assuming request-level controls pass.
- **Caller owns it:** allowed.
- **Owned by someone else with the required object grant:** allowed.
- **Owned by someone else without that grant:** denied, normally surfaced as 404 for this GET.
- Because ownership and grants are unspecified, the concrete request cannot be classified unconditionally.

### Version selection

The optional `version` query value is read and resolved within the supplied root-document lineage. Invalid or missing versions produce not-found responses.  
`src/documents/versioning.py:140-143`  
`src/documents/views.py:1375-1386`

Crucially, the effective version is selected **after** the earlier request/root resolution and authorization branch. Consequently, selecting another version through the version selector changes the `file_doc` whose bytes are returned, but does **not** replace the object used by that earlier authorization decision.

Changing the URL `pk` is different: it changes the initially requested document and therefore participates in request/root resolution.

### Original versus archive

For the effective `file_doc`:

- `original=true` selects its source/original file.
- Otherwise, its archive file is used when an archive exists.
- If no archive exists, its source file is used.

`src/documents/views.py:1369-1373`  
`src/documents/views.py:1442-1448`  
`src/documents/views.py:4941-4995`

Thus the representation flag changes **which representation of the already selected effective document** is returned; it does not trigger a new object-authorization decision.

### Remaining facts

The following are not established by the request:

- document/root ownership;
- the authenticated user’s object grants;
- the deployed authentication backend that produced `request.user`;
- runtime existence of the selected source/archive file.

The source review supports the relationships above, but the final machine authorization check remained incomplete because of unresolved wrapper-return modeling and result-schema validation diagnostics.