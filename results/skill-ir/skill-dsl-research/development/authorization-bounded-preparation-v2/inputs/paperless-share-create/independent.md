# Fixed-Source Authorization Assessment

Assess the authorization behavior using only the repository and fixed source revision below. Do not invent source facts, rely on later revisions, or assume an answer from the accepted policy. Base the conclusion on a trace of the cited implementation and directly relevant definitions at the same revision.

## Repository and Source

- **Repository:** https://github.com/paperless-ngx/paperless-ngx
- **Fixed source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Entry:** `src/documents/views.py:4696-4717`

## Accepted Policy

Share-link creation requires the share-link creation permission and view access to the referenced document; a global `view_document` grant alone does not substitute for the owner-aware object check.

## Question

At `ShareLinkViewSet.create` handler entry, can an authenticated caller with global `add_sharelink` and global `view_document` permission create a share link for a document owned by someone else when the caller lacks object `view_document` permission on that document?

## Boundary

`declared-entry`

## Premises

At `ShareLinkViewSet.create` entry:

- The caller is authenticated.
- The caller has global `add_sharelink`.
- The caller has global `view_document`.
- The referenced document exists.
- The referenced document belongs to another user.
- The caller has no object-level `view_document` grant for that document.

## Required Analysis

Trace:

1. The permissions applied by `ShareLinkViewSet`, including how they govern creation of the share-link object.
2. The `create` path from the declared handler entry through serializer validation.
3. How the serializer resolves and validates the referenced document.
4. Any owner-aware or object-level document permission check reached on this path.
5. Whether global `view_document` affects or substitutes for that object-level check.

Explicitly distinguish:

- Authorization to create the **share-link object**, and
- Authorization to view the **target document** referenced by that share link.

Answer the question directly and support the conclusion with precise citations to relevant files, symbols, and line ranges from the fixed revision. Do not decide the result from the policy text alone; derive it from the fixed source and then assess it against the accepted policy.
