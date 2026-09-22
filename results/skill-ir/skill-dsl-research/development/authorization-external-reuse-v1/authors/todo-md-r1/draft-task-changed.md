# Authorization assessment task

Repository: https://github.com/shacker/django-todo
Source ref: 95e3a022d239ebaa8771376c838a4d36590ab9b1
Task ID: ab-todo-task-changed
Host output label: scenario%3Aassessment::entry%3Atarget

Assess authorization reachability for deleting an existing task through POST `delete/<task_id>` at `delete_task` in `todo/views/delete_task.py` (entry lines 12-42). The resource is an existing task in an existing task list and group. `TODO_STAFF_ONLY` is explicitly False in project settings.

Caller state: authenticated non-staff ordinary user; not superuser; not task creator; assigned to the task; not a member of the task list group; POST request. Relation: task assignee outside the list group.

Policy authority: explicit bounded research requirement, not a claim that implementation establishes its own normative correctness. Normative expectation: with `TODO_STAFF_ONLY` explicitly False, authenticated creators, superusers, assignees, or members of the task list group may delete the task; unrelated ordinary users may not. For this changed state, the caller's assignment is the stated qualifying relation, so the policy expectation is allow. Treat this as the policy input and assess separately whether the supplied source permits the operation.

Assess the supplied source and report the result using the host's compact plain/v4 result protocol, including the required obligation ID, source IDs, and numbered files. Answer:

1. Whether the supplied source enforces the supplied policy expectation for this state, and the actual allow, deny, or unknown decision.
2. The route/entry, identity and resource binding, strongest visible control, and protected effect; explain why the stated role and relation matter.
3. Which items are task assumptions versus facts observed in source; identify decisive missing external facts without inventing deployment facts. Exact HTTP status is optional unless needed.

Scope: assess only this fixed repository/ref and these supplied project-owned files: `todo/views/delete_task.py`, `todo/views/del_list.py`, `todo/views/__init__.py`, `todo/utils.py`, `todo/defaults.py`, `todo/models.py`, and `todo/urls.py`. Standard Django decorator/ORM behavior is assumed; requests reach the supplied view with the stated identity and settings and pass CSRF and unrelated infrastructure checks. Assess authorization reachability of the protected operation, not successful storage or deployment execution. Do not inspect other files, execute the target, install dependencies, access deployment systems, patch the repository, or perform repository-wide discovery. Missing framework, authentication-backend, middleware, and deployment facts remain assumptions or gaps unless supplied.
