<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task ab-todo-list-original, expressed with source-authorization-assessment/v0. May an authenticated non-staff group member who is not a superuser and has is_staff=False delete an existing list via POST <list_id>/<list_slug>/delete/?
Assess repository https://github.com/shacker/django-todo at source ref 95e3a022d239ebaa8771376c838a4d36590ab9b1 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:delete_list is a explicit-task-requirement at brief.json#/operations/1/policy, revision authorization-external-reuse-v1.
  Policy text: List deletion requires both membership in the list group and staff status. TODO_STAFF_ONLY is explicitly False; this disables only the global staff-only restriction.
  Acceptance is accepted; accepting actor role: task-author; reason: Task-author accepted list requirement, grounded in upstream README permission description (lines 34-40 and 137-139).

The principals are:
- principal:caller has role authenticated non-staff group member. Author facts: ["Not superuser","Member of the list group","is_staff=False","POST request"]
  Starting capabilities: authenticated.

The resources are:
- resource:list is a list. Author facts: ["Existing list in a group the caller belongs to","Valid matching list id and slug","TODO_STAFF_ONLY is explicitly False"]

The declared source entries are:
- entry:target names del_list.
  Source location: todo/views/del_list.py, startLine 11, endLine 41.

The authorization obligations are:
- scenario:assessment: principal principal:caller, resource resource:list, relation group-member-without-staff-role, operation delete an existing list via POST <list_id>/<list_slug>/delete/, expected policy disposition deny.
  Policy source: policy:delete_list. Declared entries: entry:target.
  Conditions: none declared.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
- Determine whether the provided source enforces the supplied policy expectation for this state, separately state the actual allow/deny/unknown decision.
- Trace route/entry, identity and resource binding, strongest visible control, and protected effect. Explain why the stated role and relation change matters.
- Distinguish task assumptions from facts observed in source. Name any decisive missing external facts; do not invent deployment facts. Exact HTTP status is optional unless needed to explain the decision.
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
- Exposure is external-development.
- Single fixed repository/ref and explicit source files only. No target execution, dependency installation, deployment access, patching or repository-wide discovery. Standard Django decorator/ORM behavior is assumed; requests reach the supplied view with the stated identity/settings, pass CSRF and unrelated infrastructure checks. Assess authorization reachability of the protected operation, not successful storage or deployment execution.
- Django framework/authentication backend and application deployment middleware are not supplied; identity, stated settings and ordinary ORM behavior are task assumptions.
- Unrelated imported view/services and rendering behavior are not analyzed. All selected project-owned authorization gates and protected operation calls are supplied.
Allowed conclusions: source_supported_failure, source_refuted, unknown.

## Public analysis questions
- Which source-visible condition or control gates the declared entry before the assessed path proceeds?
- How is the declared principal bound to the runtime caller or identity used by the assessed operation?
- How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?
- What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?
- After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?
- Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?

## Result contract
Use compact wire/v4: top-level results only. Each item has obligationId, conclusion, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- scenario%3Aassessment::entry%3Atarget
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: todo/defaults.py =====
Source ID: src-173a5e8edd671717
Location note: crop lines 1-28; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | # If a documented django-todo option is NOT configured in settings, use these values.
2 | from django.conf import settings
3 | 
4 | hash = {
5 |     "TODO_ALLOW_FILE_ATTACHMENTS": True,
6 |     "TODO_COMMENT_CLASSES": [],
7 |     "TODO_DEFAULT_ASSIGNEE": None,
8 |     "TODO_LIMIT_FILE_ATTACHMENTS": [".jpg", ".gif", ".png", ".csv", ".pdf", ".zip"],
9 |     "TODO_MAXIMUM_ATTACHMENT_SIZE": 5000000,
10 |     "TODO_PUBLIC_SUBMIT_REDIRECT": "/",
11 |     "TODO_STAFF_ONLY": True,
12 | }
13 | 
14 | # These intentionally have no defaults (user MUST set a value if their features are used):
15 | # TODO_DEFAULT_LIST_SLUG
16 | # TODO_MAIL_BACKENDS
17 | # TODO_MAIL_TRACKERS
18 | 
19 | 
20 | def defaults(key: str):
21 |     """Try to get a setting from project settings.
22 |     If empty or doesn't exist, fall back to a value from defaults hash."""
23 | 
24 |     if hasattr(settings, key):
25 |         val = getattr(settings, key)
26 |     else:
27 |         val = hash.get(key)
28 |     return val
===== END ALLOWED INPUT: todo/defaults.py =====

===== BEGIN ALLOWED INPUT: todo/models.py =====
Source ID: src-f2f99f656232b261
Location note: crop lines 1-184; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from __future__ import unicode_literals
2 | 
3 | import datetime
4 | import os
5 | import textwrap
6 | 
7 | from django.conf import settings
8 | from django.contrib.auth.models import Group
9 | from django.db import DEFAULT_DB_ALIAS, models
10 | from django.db.transaction import Atomic, get_connection
11 | from django.urls import reverse
12 | from django.utils import timezone
13 | 
14 | 
15 | def get_attachment_upload_dir(instance, filename):
16 |     """Determine upload dir for task attachment files.
17 |     """
18 | 
19 |     return "/".join(["tasks", "attachments", str(instance.task.id), filename])
20 | 
21 | 
22 | class LockedAtomicTransaction(Atomic):
23 |     """
24 |     modified from https://stackoverflow.com/a/41831049
25 |     this is needed for safely merging
26 | 
27 |     Does a atomic transaction, but also locks the entire table for any transactions, for the duration of this
28 |     transaction. Although this is the only way to avoid concurrency issues in certain situations, it should be used with
29 |     caution, since it has impacts on performance, for obvious reasons...
30 |     """
31 | 
32 |     def __init__(self, *models, using=None, savepoint=None, durable=False):
33 |         if using is None:
34 |             using = DEFAULT_DB_ALIAS
35 |         super().__init__(using, savepoint, durable)
36 |         self.models = models
37 | 
38 |     def __enter__(self):
39 |         super(LockedAtomicTransaction, self).__enter__()
40 | 
41 |         # Make sure not to lock, when sqlite is used, or you'll run into problems while running tests!!!
42 |         if settings.DATABASES[self.using]["ENGINE"] != "django.db.backends.sqlite3":
43 |             cursor = None
44 |             try:
45 |                 cursor = get_connection(self.using).cursor()
46 |                 for model in self.models:
47 |                     cursor.execute(
48 |                         "LOCK TABLE {table_name}".format(table_name=model._meta.db_table)
49 |                     )
50 |             finally:
51 |                 if cursor and not cursor.closed:
52 |                     cursor.close()
53 | 
54 | 
55 | class TaskList(models.Model):
56 |     name = models.CharField(max_length=60)
57 |     slug = models.SlugField(default="")
58 |     group = models.ForeignKey(Group, on_delete=models.CASCADE)
59 | 
60 |     def __str__(self):
61 |         return self.name
62 | 
63 |     class Meta:
64 |         ordering = ["name"]
65 |         verbose_name_plural = "Task Lists"
66 | 
67 |         # Prevents (at the database level) creation of two lists with the same slug in the same group
68 |         unique_together = ("group", "slug")
69 | 
70 | 
71 | class Task(models.Model):
72 |     title = models.CharField(max_length=140)
73 |     task_list = models.ForeignKey(TaskList, on_delete=models.CASCADE, null=True)
74 |     created_date = models.DateField(default=timezone.now, blank=True, null=True)
75 |     due_date = models.DateField(blank=True, null=True)
76 |     completed = models.BooleanField(default=False)
77 |     completed_date = models.DateField(blank=True, null=True)
78 |     created_by = models.ForeignKey(
79 |         settings.AUTH_USER_MODEL,
80 |         null=True,
81 |         blank=True,
82 |         related_name="todo_created_by",
83 |         on_delete=models.CASCADE,
84 |     )
85 |     assigned_to = models.ManyToManyField(
86 |         settings.AUTH_USER_MODEL,
87 |         blank=True,
88 |         related_name="todo_assigned_to",
89 |     )
90 |     note = models.TextField(blank=True, null=True)
91 |     priority = models.PositiveIntegerField(blank=True, null=True)
92 | 
93 |     # Has due date for an instance of this object passed?
94 |     def overdue_status(self):
95 |         "Returns whether the Tasks's due date has passed or not."
96 |         if self.due_date and datetime.date.today() > self.due_date:
97 |             return True
98 | 
99 |     def __str__(self):
100 |         return self.title
101 | 
102 |     def get_absolute_url(self):
103 |         return reverse("todo:task_detail", kwargs={"task_id": self.id})
104 | 
105 |     # Auto-set the Task creation / completed date
106 |     def save(self, **kwargs):
107 |         # If Task is being marked complete, set the completed_date
108 |         if self.completed:
109 |             self.completed_date = datetime.datetime.now()
110 |         super(Task, self).save()
111 | 
112 |     def merge_into(self, merge_target):
113 |         if merge_target.pk == self.pk:
114 |             raise ValueError("can't merge a task with self")
115 | 
116 |         # lock the comments to avoid concurrent additions of comments after the
117 |         # update request. these comments would be irremediably lost because of
118 |         # the cascade clause
119 |         with LockedAtomicTransaction(Comment):
120 |             Comment.objects.filter(task=self).update(task=merge_target)
121 |             self.delete()
122 | 
123 |     class Meta:
124 |         ordering = ["priority", "created_date"]
125 | 
126 | 
127 | class Comment(models.Model):
128 |     """
129 |     Not using Django's built-in comments because we want to be able to save
130 |     a comment and change task details at the same time. Rolling our own since it's easy.
131 |     """
132 | 
133 |     author = models.ForeignKey(
134 |         settings.AUTH_USER_MODEL, on_delete=models.CASCADE, blank=True, null=True,
135 |         related_name="todo_comments"
136 |     )
137 |     task = models.ForeignKey(Task, on_delete=models.CASCADE)
138 |     date = models.DateTimeField(default=datetime.datetime.now)
139 |     email_from = models.CharField(max_length=320, blank=True, null=True)
140 |     email_message_id = models.CharField(max_length=255, blank=True, null=True)
141 | 
142 |     body = models.TextField(blank=True)
143 | 
144 |     class Meta:
145 |         # an email should only appear once per task
146 |         unique_together = ("task", "email_message_id")
147 | 
148 |     @property
149 |     def author_text(self):
150 |         if self.author is not None:
151 |             return str(self.author)
152 | 
153 |         assert self.email_message_id is not None
154 |         return str(self.email_from)
155 | 
156 |     @property
157 |     def snippet(self):
158 |         body_snippet = textwrap.shorten(self.body, width=35, placeholder="...")
159 |         # Define here rather than in __str__ so we can use it in the admin list_display
160 |         return "{author} - {snippet}...".format(author=self.author_text, snippet=body_snippet)
161 | 
162 |     def __str__(self):
163 |         return self.snippet
164 | 
165 | 
166 | class Attachment(models.Model):
167 |     """
168 |     Defines a generic file attachment for use in M2M relation with Task.
169 |     """
170 | 
171 |     task = models.ForeignKey(Task, on_delete=models.CASCADE)
172 |     added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
173 |     timestamp = models.DateTimeField(default=datetime.datetime.now)
174 |     file = models.FileField(upload_to=get_attachment_upload_dir, max_length=255)
175 | 
176 |     def filename(self):
177 |         return os.path.basename(self.file.name)
178 | 
179 |     def extension(self):
180 |         name, extension = os.path.splitext(self.file.name)
181 |         return extension
182 | 
183 |     def __str__(self):
184 |         return f"{self.task.id} - {self.file.name}"
===== END ALLOWED INPUT: todo/models.py =====

===== BEGIN ALLOWED INPUT: todo/urls.py =====
Source ID: src-2aa84d8e91e9c931
Location note: crop lines 1-49; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from django.conf import settings
2 | from django.urls import path
3 | 
4 | from todo import views
5 | from todo.features import HAS_TASK_MERGE
6 | 
7 | app_name = "todo"
8 | 
9 | urlpatterns = [
10 |     path("", views.list_lists, name="lists"),
11 |     # View reorder_tasks is only called by JQuery for drag/drop task ordering.
12 |     path("reorder_tasks/", views.reorder_tasks, name="reorder_tasks"),
13 |     # Allow users to post tasks from outside django-todo (e.g. for filing tickets - see docs)
14 |     path("ticket/add/", views.external_add, name="external_add"),
15 |     # Three paths into `list_detail` view
16 |     path("mine/", views.list_detail, {"list_slug": "mine"}, name="mine"),
17 |     path(
18 |         "<int:list_id>/<str:list_slug>/completed/",
19 |         views.list_detail,
20 |         {"view_completed": True},
21 |         name="list_detail_completed",
22 |     ),
23 |     path("<int:list_id>/<str:list_slug>/", views.list_detail, name="list_detail"),
24 |     path("<int:list_id>/<str:list_slug>/delete/", views.del_list, name="del_list"),
25 |     path("add_list/", views.add_list, name="add_list"),
26 |     path("task/<int:task_id>/", views.task_detail, name="task_detail"),
27 |     path(
28 |         "attachment/remove/<int:attachment_id>/", views.remove_attachment, name="remove_attachment"
29 |     ),
30 | ]
31 | 
32 | if HAS_TASK_MERGE:
33 |     # ensure mail tracker autocomplete is optional
34 |     from todo.views.task_autocomplete import TaskAutocomplete
35 | 
36 |     urlpatterns.append(
37 |         path(
38 |             "task/<int:task_id>/autocomplete/", TaskAutocomplete.as_view(), name="task_autocomplete"
39 |         )
40 |     )
41 | 
42 | urlpatterns.extend(
43 |     [
44 |         path("toggle_done/<int:task_id>/", views.toggle_done, name="task_toggle_done"),
45 |         path("delete/<int:task_id>/", views.delete_task, name="delete_task"),
46 |         path("search/", views.search, name="search"),
47 |         path("import_csv/", views.import_csv, name="import_csv"),
48 |     ]
49 | )
===== END ALLOWED INPUT: todo/urls.py =====

===== BEGIN ALLOWED INPUT: todo/utils.py =====
Source ID: src-cf660372383c8172
Location note: crop lines 1-176; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | import email.utils
2 | import logging
3 | import os
4 | import time
5 | 
6 | from django.conf import settings
7 | from django.contrib.sites.models import Site
8 | from django.core import mail
9 | from django.template.loader import render_to_string
10 | 
11 | from todo.defaults import defaults
12 | from todo.models import Attachment, Comment, Task
13 | 
14 | log = logging.getLogger(__name__)
15 | 
16 | 
17 | def staff_check(user):
18 |     """If TODO_STAFF_ONLY is set to True, limit view access to staff users only.
19 |         # FIXME: More granular access control needed - see
20 |         https://github.com/shacker/django-todo/issues/50
21 |     """
22 | 
23 |     if defaults("TODO_STAFF_ONLY"):
24 |         return user.is_staff
25 |     else:
26 |         # If unset or False, allow all logged in users
27 |         return True
28 | 
29 | 
30 | def user_can_read_task(task, user):
31 |     return task.task_list.group in user.groups.all() or user.is_superuser
32 | 
33 | 
34 | def todo_get_backend(task):
35 |     """Returns a mail backend for some task"""
36 |     mail_backends = getattr(settings, "TODO_MAIL_BACKENDS", None)
37 |     if mail_backends is None:
38 |         return None
39 | 
40 |     task_backend = None
41 | 
42 |     if task.task_list.slug in mail_backends:
43 |         task_backend = mail_backends[task.task_list.slug]
44 | 
45 |     return task_backend
46 | 
47 | 
48 | def todo_get_mailer(user, task):
49 |     """A mailer is a (from_address, backend) pair"""
50 |     task_backend = todo_get_backend(task)
51 |     if task_backend is None:
52 |         return (None, mail.get_connection)
53 | 
54 |     from_address = getattr(task_backend, "from_address")
55 |     from_address = email.utils.formataddr((user.username, from_address))
56 |     return (from_address, task_backend)
57 | 
58 | 
59 | def todo_send_mail(user, task, subject, body, recip_list):
60 |     """Send an email attached to task, triggered by user"""
61 |     references = Comment.objects.filter(task=task).only("email_message_id")
62 |     references = (ref.email_message_id for ref in references)
63 |     references = " ".join(filter(bool, references))
64 | 
65 |     from_address, backend = todo_get_mailer(user, task)
66 |     message_hash = hash((subject, body, from_address, frozenset(recip_list), references))
67 | 
68 |     message_id = (
69 |         # the task_id enables attaching back notification answers
70 |         "<notif-{task_id}."
71 |         # the message hash / epoch pair enables deduplication
72 |         "{message_hash:x}."
73 |         "{epoch}@django-todo>"
74 |     ).format(
75 |         task_id=task.pk,
76 |         # avoid the -hexstring case (hashes can be negative)
77 |         message_hash=abs(message_hash),
78 |         epoch=int(time.time()),
79 |     )
80 | 
81 |     # the thread message id is used as a common denominator between all
82 |     # notifications for some task. This message doesn't actually exist,
83 |     # it's just there to make threading possible
84 |     thread_message_id = "<thread-{}@django-todo>".format(task.pk)
85 |     references = "{} {}".format(references, thread_message_id)
86 | 
87 |     with backend() as connection:
88 |         message = mail.EmailMessage(
89 |             subject,
90 |             body,
91 |             from_address,
92 |             recip_list,
93 |             [],  # Bcc
94 |             headers={
95 |                 **getattr(backend, "headers", {}),
96 |                 "Message-ID": message_id,
97 |                 "References": references,
98 |                 "In-reply-to": thread_message_id,
99 |             },
100 |             connection=connection,
101 |         )
102 |         message.send()
103 | 
104 | 
105 | def send_notify_mail(new_task):
106 |     """
107 |     Send email to assignee if task is assigned to someone other than submittor.
108 |     Unassigned tasks should not try to notify.
109 |     """
110 | 
111 |     assignees = new_task.assigned_to.exclude(pk=new_task.created_by.pk)
112 |     if not assignees.exists():
113 |         return
114 | 
115 |     current_site = Site.objects.get_current()
116 |     subject = render_to_string("todo/email/assigned_subject.txt", {"task": new_task})
117 |     body = render_to_string(
118 |         "todo/email/assigned_body.txt", {"task": new_task, "site": current_site}
119 |     )
120 | 
121 |     recip_list = list(assignees.values_list("email", flat=True))
122 |     todo_send_mail(new_task.created_by, new_task, subject, body, recip_list)
123 | 
124 | 
125 | def send_email_to_thread_participants(task, msg_body, user, subject=None):
126 |     """Notify all previous commentors on a Task about a new comment."""
127 | 
128 |     current_site = Site.objects.get_current()
129 |     email_subject = subject
130 |     if not subject:
131 |         subject = render_to_string("todo/email/assigned_subject.txt", {"task": task})
132 | 
133 |     email_body = render_to_string(
134 |         "todo/email/newcomment_body.txt",
135 |         {"task": task, "body": msg_body, "site": current_site, "user": user},
136 |     )
137 | 
138 |     # Get all thread participants
139 |     commenters = Comment.objects.filter(task=task)
140 |     recip_list = set(ca.author.email for ca in commenters if ca.author is not None)
141 |     if task.created_by:
142 |         recip_list.add(task.created_by.email)
143 |     for assignee in task.assigned_to.all():
144 |         recip_list.add(assignee.email)
145 |     recip_list = list(m for m in recip_list if m)
146 | 
147 |     todo_send_mail(user, task, email_subject, email_body, recip_list)
148 | 
149 | 
150 | def toggle_task_completed(task_id: int) -> bool:
151 |     """Toggle the `completed` bool on Task from True to False or vice versa."""
152 |     try:
153 |         task = Task.objects.get(id=task_id)
154 |         task.completed = not task.completed
155 |         task.save()
156 |         return True
157 | 
158 |     except Task.DoesNotExist:
159 |         log.info(f"Task {task_id} not found.")
160 |         return False
161 | 
162 | 
163 | def remove_attachment_file(attachment_id: int) -> bool:
164 |     """Delete an Attachment object and its corresponding file from the filesystem."""
165 |     try:
166 |         attachment = Attachment.objects.get(id=attachment_id)
167 |         if attachment.file:
168 |             if os.path.isfile(attachment.file.path):
169 |                 os.remove(attachment.file.path)
170 | 
171 |         attachment.delete()
172 |         return True
173 | 
174 |     except Attachment.DoesNotExist:
175 |         log.info(f"Attachment {attachment_id} not found.")
176 |         return False
===== END ALLOWED INPUT: todo/utils.py =====

===== BEGIN ALLOWED INPUT: todo/views/__init__.py =====
Source ID: src-543995004a0ed0e1
Location note: crop lines 1-12; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from todo.views.add_list import add_list  # noqa: F401
2 | from todo.views.del_list import del_list  # noqa: F401
3 | from todo.views.delete_task import delete_task  # noqa: F401
4 | from todo.views.external_add import external_add  # noqa: F401
5 | from todo.views.import_csv import import_csv  # noqa: F401
6 | from todo.views.list_detail import list_detail  # noqa: F401
7 | from todo.views.list_lists import list_lists  # noqa: F401
8 | from todo.views.remove_attachment import remove_attachment  # noqa: F401
9 | from todo.views.reorder_tasks import reorder_tasks  # noqa: F401
10 | from todo.views.search import search  # noqa: F401
11 | from todo.views.task_detail import task_detail  # noqa: F401
12 | from todo.views.toggle_done import toggle_done  # noqa: F401
===== END ALLOWED INPUT: todo/views/__init__.py =====

===== BEGIN ALLOWED INPUT: todo/views/del_list.py =====
Source ID: src-cb30d8a73eff11db
Location note: crop lines 1-41; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from django.contrib import messages
2 | from django.contrib.auth.decorators import login_required, user_passes_test
3 | from django.core.exceptions import PermissionDenied
4 | from django.http import HttpResponse
5 | from django.shortcuts import get_object_or_404, redirect, render
6 | 
7 | from todo.models import Task, TaskList
8 | from todo.utils import staff_check
9 | 
10 | 
11 | @login_required
12 | @user_passes_test(staff_check)
13 | def del_list(request, list_id: int, list_slug: str) -> HttpResponse:
14 |     """Delete an entire list. Only staff members should be allowed to access this view.
15 |     """
16 |     task_list = get_object_or_404(TaskList, id=list_id)
17 | 
18 |     # Ensure user has permission to delete list. Get the group this list belongs to,
19 |     # and check whether current user is a member of that group AND a staffer.
20 |     if task_list.group not in request.user.groups.all():
21 |         raise PermissionDenied    
22 |     if not request.user.is_staff:
23 |         raise PermissionDenied
24 | 
25 |     if request.method == "POST":
26 |         TaskList.objects.get(id=task_list.id).delete()
27 |         messages.success(request, "{list_name} is gone.".format(list_name=task_list.name))
28 |         return redirect("todo:lists")
29 |     else:
30 |         task_count_done = Task.objects.filter(task_list=task_list.id, completed=True).count()
31 |         task_count_undone = Task.objects.filter(task_list=task_list.id, completed=False).count()
32 |         task_count_total = Task.objects.filter(task_list=task_list.id).count()
33 | 
34 |     context = {
35 |         "task_list": task_list,
36 |         "task_count_done": task_count_done,
37 |         "task_count_undone": task_count_undone,
38 |         "task_count_total": task_count_total,
39 |     }
40 | 
41 |     return render(request, "todo/del_list.html", context)
===== END ALLOWED INPUT: todo/views/del_list.py =====

===== BEGIN ALLOWED INPUT: todo/views/delete_task.py =====
Source ID: src-3d25f8db47b1c03f
Location note: crop lines 1-42; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from django.contrib import messages
2 | from django.contrib.auth.decorators import login_required, user_passes_test
3 | from django.core.exceptions import PermissionDenied
4 | from django.http import HttpResponse
5 | from django.shortcuts import get_object_or_404, redirect
6 | from django.urls import reverse
7 | 
8 | from todo.models import Task
9 | from todo.utils import staff_check
10 | 
11 | 
12 | @login_required
13 | @user_passes_test(staff_check)
14 | def delete_task(request, task_id: int) -> HttpResponse:
15 |     """Delete specified task.
16 |     Redirect to the list from which the task came.
17 |     """
18 | 
19 |     if request.method == "POST":
20 |         task = get_object_or_404(Task, pk=task_id)
21 | 
22 |         redir_url = reverse(
23 |             "todo:list_detail",
24 |             kwargs={"list_id": task.task_list.id, "list_slug": task.task_list.slug},
25 |         )
26 | 
27 |         # Permissions
28 |         if not (
29 |             (task.created_by == request.user)
30 |             or (request.user.is_superuser)
31 |             or task.assigned_to.filter(pk=request.user.pk).exists()
32 |             or (task.task_list.group in request.user.groups.all())
33 |         ):
34 |             raise PermissionDenied
35 | 
36 |         task.delete()
37 | 
38 |         messages.success(request, "Task '{}' has been deleted".format(task.title))
39 |         return redirect(redir_url)
40 | 
41 |     else:
42 |         raise PermissionDenied
===== END ALLOWED INPUT: todo/views/delete_task.py =====
