## Partial authorization trace — unreviewed

**Disposition: unknown.** The available trace does not establish the complete authentication and object-authorization behavior.

### Confirmed source flow

1. The API schema exposes a document download operation with `original` and `follow_formatting` query parameters and a binary response (`src/documents/views.py:757-772`).
2. `DocumentViewSet.download` is a detail-level GET action. It passes `pk`, `request`, and attachment disposition to `self.file_response(...)` (`src/documents/views.py:1834-1837`).
3. `file_response` performs document and original/archive representation selection and constructs the returned file response (`src/documents/views.py:1429-1448`).
4. `FileNotFoundError` or `Document.DoesNotExist` propagating from that work is converted to HTTP 404 (`src/documents/views.py:1838-1839`).

Thus, representation selection and file opening occur inside `file_response`, after any upstream DRF request-level checks and immediately before constructing the response.

### Authorization gap

The retained trace did **not** resolve:

- `DocumentViewSet`’s applicable authentication and permission classes;
- whether DRF invokes object permissions for this custom action;
- whether `file_response`’s `self.get_queryset()` restricts documents according to `request.user`;
- whether any authorization check occurs after representation selection.

Consequently, it cannot establish whether an authenticated user lacking ownership or an object grant can download the requested document. Those grants are also explicitly unspecified.

### Branch outcomes

- If upstream controls admit the caller and the effective queryset contains `pk`, the helper selects a representation and returns it as an attachment.
- If lookup or file access raises `Document.DoesNotExist` or `FileNotFoundError`, no file is returned and the action raises HTTP 404.
- All other authorization outcomes remain unresolved.

The final structured check failed with `semantic-path-missing` because the submitted branch numbers were not current host-provided path IDs. Therefore these conclusions remain **partial/unreviewed**, not a confirmed security finding.