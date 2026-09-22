# Authorization task: read bookmark asset (changed state)

Repository: https://github.com/sissbruecker/linkding  
Ref: `27b7303baf41bb28babc610ac8eaa486e1ddfab5`  
Task ID: `ab-linkding-asset-changed`

Assess the supplied source for this bounded authorization task. The policy authority is the task-author requirement: **The owner may read an asset; authenticated readers may read it when its bookmark is shared and owner sharing is enabled; anonymous readers require public sharing enabled.** The expected policy result in this state is **deny**; independently determine the actual source decision as allow, deny, or unknown.

Caller and resource facts:

- Caller is an anonymous reader.
- Caller is not authenticated and is not the bookmark owner.
- The existing asset belongs to another user's bookmark.
- The bookmark is `shared=True`.
- The bookmark owner has `enable_sharing=True` and `enable_public_sharing=False`.
- This is a GET request.
- The caller is an anonymous non-owner of the same shared bookmark asset.
- The asset file exists and is valid.

Operation and entry scope: read the existing bookmark asset through `GET assets/<asset_id>`. Trace the route/entry, identity and resource binding, strongest visible control, and protected effect. Explain why the stated role and relation change matters. Use the supplied explicit source files only; the relevant entry location is `bookmarks/views/assets.py` lines 8-22, with access logic in `bookmarks/views/access.py` lines 7-24 and 46-53, file handling in the supplied asset service, and URL binding in `bookmarks/urls.py` lines 46-55 as needed.

Answer these public questions in the host result protocol:

1. Determine whether the provided source enforces the supplied policy expectation for this state, separately state the actual allow/deny/unknown decision.
2. Trace route/entry, identity and resource binding, strongest visible control, and protected effect. Explain why the stated role and relation change matters.
3. Distinguish task assumptions from facts observed in source. Name any decisive missing external facts; do not invent deployment facts. Exact HTTP status is optional unless needed to explain the decision.

Scope and constraints: use one fixed repository/ref and the explicit supplied source files only. Do not execute the target, install dependencies, deploy, patch the repository, perform repository-wide discovery, or make paid model calls. Standard Django decorator/ORM behavior is assumed; requests reach the supplied view with the stated identity/settings, pass CSRF and unrelated infrastructure checks. Assess authorization reachability of the protected operation, not successful storage or deployment execution. Django framework/authentication backend and application deployment middleware are not supplied; identity, stated settings, and ordinary ORM behavior are task assumptions. Unrelated imported view/services and rendering behavior are not analyzed; selected project-owned authorization gates and protected operation calls are supplied.

Do not state a code answer in this instruction. Source analysis is the downstream model's job. The host appends the numbered source catalog and compact plain/v4 result contract. Use result label/obligation ID `scenario%3Aassessment::entry%3Atarget` if needed. Do not write files or an answer now; this is the standalone natural-language task instruction.
