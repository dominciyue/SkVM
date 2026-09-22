# Authorization assessment task

Repository: https://github.com/shacker/django-todo
Source ref: 95e3a022d239ebaa8771376c838a4d36590ab9b1
Task ID: ab-todo-list-original
Host output label: scenario%3Aassessment::entry%3Atarget

Assess authorization reachability for deleting an existing list through POST `<list_id>/<list_slug>/delete/` at `del_list` in `todo/views/del_list.py` (entry lines 11-41). The resource is an existing list in a group the caller belongs to, with a valid matching list ID and slug. `TODO_STAFF_ONLY` is explicitly False in project settings.

Caller state: authenticated non-staff group member; not superuser; member of the list group; `is_staff=False`; POST request. Relation: group member without staff role.

Policy authority: task-author requirement grounded in the upstream README permission description (lines 34-40 and 137-139). Normative expectation: list deletion requires both membership in the list group and staff status. `TODO_STAFF_ONLY` explicitly False disables only the global staff-only restriction; it does not remove the stated list-deletion requirement. For this state, the policy expectation is deny. Treat this as the policy input and assess separately whether the supplied source permits the operation.

Assess the supplied source and report the result using the host's compact plain/v4 result protocol, including the required obligation ID, source IDs, and numbered files. Answer:

1. Whether the supplied source enforces the supplied policy expectation for this state, and the actual allow, deny, or unknown decision.
2. The route/entry, identity and resource binding, strongest visible control, and protected effect; explain why the stated role and relation matter.
3. Which items are task assumptions versus facts observed in source; identify decisive missing external facts without inventing deployment facts. Exact HTTP status is optional unless needed.

Scope: assess only this fixed repository/ref and these supplied project-owned files: `todo/views/delete_task.py`, `todo/views/del_list.py`, `todo/views/__init__.py`, `todo/utils.py`, `todo/defaults.py`, `todo/models.py`, and `todo/urls.py`. Standard Django decorator/ORM behavior is assumed; requests reach the supplied view with the stated identity and settings and pass CSRF and unrelated infrastructure checks. Assess authorization reachability of the protected operation, not successful storage or deployment execution. Do not inspect other files, execute the target, install dependencies, access deployment systems, patch the repository, or perform repository-wide discovery. Missing framework, authentication-backend, middleware, and deployment facts remain assumptions or gaps unless supplied.
