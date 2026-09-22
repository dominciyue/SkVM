# Authorization task: remove bookmark (original state)

Repository: https://github.com/sissbruecker/linkding  
Ref: `27b7303baf41bb28babc610ac8eaa486e1ddfab5`  
Task ID: `ab-linkding-remove-original`

Assess the supplied source for this bounded authorization task and answer using the host result contract, including the required result label/obligation ID when applicable. The policy authority is the task-author requirement: **Only the bookmark owner may delete a bookmark. Sharing grants reading, not deletion.** The expected policy result in this state is **deny**; independently determine the actual source decision as allow, deny, or unknown.

Caller and resource facts:

- Caller is an authenticated ordinary user.
- Caller is not the bookmark owner.
- Caller has no superuser or special role.
- The existing bookmark is `shared=True`.
- The owner has `enable_sharing=True` and `enable_public_sharing=False`.
- The POST contains only `remove=<existing bookmark id>`.
- The caller is a non-owner of a shared bookmark.

Operation and entry scope: delete the selected bookmark through `POST bookmarks/shared/action` with only `remove=<existing bookmark id>`. Trace the route/entry, identity and resource binding, strongest visible control, and protected effect. Explain why the stated role and relation change matters. Use the supplied explicit source files only; the relevant entry location is `bookmarks/views/bookmarks.py` lines 346-358, with the action dispatch in lines 361-378 and any supplied access, asset, service, or URL code needed to trace this operation.

Answer these public questions in the host result protocol:

1. Determine whether the provided source enforces the supplied policy expectation for this state, separately state the actual allow/deny/unknown decision.
2. Trace route/entry, identity and resource binding, strongest visible control, and protected effect. Explain why the stated role and relation change matters.
3. Distinguish task assumptions from facts observed in source. Name any decisive missing external facts; do not invent deployment facts. Exact HTTP status is optional unless needed to explain the decision.

Scope and constraints: use one fixed repository/ref and the explicit supplied source files only. Do not execute the target, install dependencies, deploy, patch the repository, or perform repository-wide discovery. Standard Django decorator/ORM behavior is assumed; requests reach the supplied view with the stated identity/settings, pass CSRF and unrelated infrastructure checks. Assess authorization reachability of the protected operation, not successful storage or deployment execution. Django framework/authentication backend and application deployment middleware are not supplied; identity, stated settings, and ordinary ORM behavior are task assumptions. Unrelated imported view/services and rendering behavior are not analyzed; selected project-owned authorization gates and protected operation calls are supplied.

The host appends the numbered source catalog and compact plain/v4 result contract. Use result label/obligation ID `scenario%3Aassessment::entry%3Atarget` if needed.
