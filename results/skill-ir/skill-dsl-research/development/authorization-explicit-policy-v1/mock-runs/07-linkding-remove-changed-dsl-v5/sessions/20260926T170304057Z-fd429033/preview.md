<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task ab-linkding-remove-changed, expressed with source-authorization-assessment/v0. Determine whether an authenticated ordinary user who is the bookmark owner may delete the same shared bookmark through POST bookmarks/shared/action with only remove=<existing bookmark id>.
Assess repository https://github.com/sissbruecker/linkding at source ref 27b7303baf41bb28babc610ac8eaa486e1ddfab5 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:remove is a explicit-task-requirement at remove-changed.json#/policies/remove, revision authorization-external-reuse-v1.
  Policy text: Only the bookmark owner may delete a bookmark. Sharing grants reading, not deletion.
  Acceptance is accepted; accepting actor role: task-author; reason: Bounded research task requirement accepted by task author; upstream action tests independently retained for evaluation.

The principals are:
- principal:target has role authenticated ordinary user. Author facts: ["Caller is the bookmark owner","No superuser or special role","POST contains only remove=<bookmark id>"]
  Starting capabilities: authenticated.

The resources are:
- resource:target is a bookmark. Author facts: ["Existing bookmark, shared=True","Owner has enable_sharing=True and enable_public_sharing=False"]

The declared source entries are:
- entry:target names shared_action.
  Source location: bookmarks/views/bookmarks.py, startLine 346, endLine 358.

The authorization obligations are:
- scenario:assessment: principal principal:target, resource resource:target, relation owner of the same shared bookmark, operation delete a selected bookmark through POST bookmarks/shared/action with only remove=<existing bookmark id>, expected policy disposition allow.
  Policy source: policy:remove. Declared entries: entry:target.
  Conditions: none declared.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
- Determine whether the provided source enforces the supplied policy expectation for this state, separately state the actual allow/deny/unknown decision.
- Trace route/entry, identity and resource binding, strongest visible control, and protected effect. Explain why the stated role and relation change matters.
- Distinguish task assumptions from facts observed in source. Name any decisive missing external facts; do not invent deployment facts. Exact HTTP status is optional unless needed to explain the decision.
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
- Single fixed repository/ref and explicit source files only. No target execution, dependency installation, deployment access, patching or repository-wide discovery. Standard Django decorator/ORM behavior is assumed; requests reach the supplied view with the stated identity/settings, pass CSRF and unrelated infrastructure checks. Assess authorization reachability of the protected operation, not successful storage or deployment execution.
- Django framework/authentication backend and application deployment middleware are not supplied; identity, stated settings and ordinary ORM behavior are task assumptions.
- Unrelated imported view/services and rendering behavior are not analyzed. All selected project-owned authorization gates and protected operation calls are supplied.
Allowed policyStatus values: satisfied, violated, undetermined.

## Public analysis questions
- Which source-visible condition or control gates the declared entry before the assessed path proceeds?
- How is the declared principal bound to the runtime caller or identity used by the assessed operation?
- How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?
- What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?
- After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?
- Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?

## Result contract
Use compact wire/v5: top-level results only. Each item has obligationId, policyStatus, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation, with policyStatus: satisfied, violated, or undetermined. Do not output conclusion.
Interpret policyStatus relative to the declared policy expectation, not as direct synonyms for allow or deny:
- satisfied: the fixed source enforces the declared normative expectation under the stated conditions; that expectation may require either allow or deny.
- violated: the fixed source violates the declared normative expectation under the stated conditions.
- undetermined: the fixed source and declared context are insufficient to decide whether the expectation is enforced or violated. Name decisive missing facts and minimum suggested observations.
For conditional expectations, analyze the declared conditions; the expectation field alone does not establish a policyStatus. If authored task text requests legacy conclusion labels, this result contract supersedes that output-format request; use policyStatus only.
Exact runnable obligation IDs (closed list):
- scenario%3Aassessment::entry%3Atarget
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: bookmarks/services/assets.py =====
Source ID: src-85308154499c58ee
Location note: crop lines 1-307; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | import gzip
2 | import logging
3 | import os
4 | import shutil
5 | from typing import BinaryIO
6 | from wsgiref.util import FileWrapper
7 | 
8 | from django.conf import settings
9 | from django.core.files.uploadedfile import UploadedFile
10 | from django.http import StreamingHttpResponse
11 | from django.utils import formats, timezone
12 | 
13 | from bookmarks.models import Bookmark, BookmarkAsset
14 | from bookmarks.services import http_client, singlefile
15 | from bookmarks.services.website_loader import (
16 |     detect_content_type,
17 |     fake_request_headers,
18 |     is_pdf_content_type,
19 | )
20 | 
21 | MAX_ASSET_FILENAME_LENGTH = 192
22 | 
23 | logger = logging.getLogger(__name__)
24 | 
25 | 
26 | class PdfTooLargeError(Exception):
27 |     pass
28 | 
29 | 
30 | def create_snapshot_asset(bookmark: Bookmark) -> BookmarkAsset:
31 |     asset = BookmarkAsset(
32 |         bookmark=bookmark,
33 |         asset_type=BookmarkAsset.TYPE_SNAPSHOT,
34 |         date_created=timezone.now(),
35 |         content_type="",
36 |         display_name="New snapshot",
37 |         status=BookmarkAsset.STATUS_PENDING,
38 |     )
39 |     return asset
40 | 
41 | 
42 | def create_snapshot(asset: BookmarkAsset):
43 |     try:
44 |         url = asset.bookmark.url
45 |         # Raises BlockedAddressError if the URL points to a non-public address,
46 |         # which prevents creating a snapshot with single-file as well
47 |         content_type = detect_content_type(url)
48 | 
49 |         if is_pdf_content_type(content_type):
50 |             _create_pdf_snapshot(asset)
51 |         else:
52 |             _create_html_snapshot(asset)
53 |     except Exception as error:
54 |         asset.status = BookmarkAsset.STATUS_FAILURE
55 |         asset.save()
56 |         raise error
57 | 
58 | 
59 | def _create_html_snapshot(asset: BookmarkAsset):
60 |     # Create snapshot into temporary file
61 |     temp_filename = _generate_asset_filename(asset, asset.bookmark.url, "tmp")
62 |     temp_filepath = os.path.join(settings.LD_ASSET_FOLDER, temp_filename)
63 |     singlefile.create_snapshot(asset.bookmark.url, temp_filepath)
64 | 
65 |     # Store as gzip in asset folder
66 |     filename = _generate_asset_filename(asset, asset.bookmark.url, "html.gz")
67 |     filepath = os.path.join(settings.LD_ASSET_FOLDER, filename)
68 |     with (
69 |         open(temp_filepath, "rb") as temp_file,
70 |         gzip.open(filepath, "wb") as gz_file,
71 |     ):
72 |         shutil.copyfileobj(temp_file, gz_file)
73 | 
74 |     # Remove temporary file
75 |     os.remove(temp_filepath)
76 | 
77 |     # Update display name for HTML
78 |     timestamp = formats.date_format(asset.date_created, "SHORT_DATE_FORMAT")
79 | 
80 |     asset.status = BookmarkAsset.STATUS_COMPLETE
81 |     asset.content_type = BookmarkAsset.CONTENT_TYPE_HTML
82 |     asset.display_name = f"HTML snapshot from {timestamp}"
83 |     asset.file = filename
84 |     asset.gzip = True
85 |     asset.save()
86 | 
87 |     asset.bookmark.latest_snapshot = asset
88 |     asset.bookmark.date_modified = timezone.now()
89 |     asset.bookmark.save()
90 | 
91 | 
92 | def _create_pdf_snapshot(asset: BookmarkAsset):
93 |     url = asset.bookmark.url
94 |     max_size = settings.LD_SNAPSHOT_PDF_MAX_SIZE
95 | 
96 |     # Download PDF to temporary file
97 |     temp_filename = _generate_asset_filename(asset, url, "tmp")
98 |     temp_filepath = os.path.join(settings.LD_ASSET_FOLDER, temp_filename)
99 | 
100 |     headers = fake_request_headers()
101 |     timeout = 60
102 | 
103 |     with http_client.get(
104 |         url, headers=headers, stream=True, timeout=timeout
105 |     ) as response:
106 |         response.raise_for_status()
107 | 
108 |         # Check Content-Length header if available
109 |         content_length = response.headers.get("Content-Length")
110 |         if content_length and int(content_length) > max_size:
111 |             raise PdfTooLargeError(
112 |                 f"PDF size ({content_length} bytes) exceeds limit ({max_size} bytes)"
113 |             )
114 | 
115 |         # Download in chunks, tracking size
116 |         downloaded_size = 0
117 |         with open(temp_filepath, "wb") as f:
118 |             for chunk in response.iter_content(chunk_size=8192):
119 |                 downloaded_size += len(chunk)
120 |                 if downloaded_size > max_size:
121 |                     raise PdfTooLargeError(f"PDF size exceeds limit ({max_size} bytes)")
122 |                 f.write(chunk)
123 | 
124 |     # Store as gzip in asset folder
125 |     filename = _generate_asset_filename(asset, url, "pdf.gz")
126 |     filepath = os.path.join(settings.LD_ASSET_FOLDER, filename)
127 |     with (
128 |         open(temp_filepath, "rb") as temp_file,
129 |         gzip.open(filepath, "wb") as gz_file,
130 |     ):
131 |         shutil.copyfileobj(temp_file, gz_file)
132 | 
133 |     # Remove temporary file
134 |     os.remove(temp_filepath)
135 | 
136 |     # Update display name for PDF
137 |     timestamp = formats.date_format(asset.date_created, "SHORT_DATE_FORMAT")
138 | 
139 |     asset.status = BookmarkAsset.STATUS_COMPLETE
140 |     asset.content_type = BookmarkAsset.CONTENT_TYPE_PDF
141 |     asset.display_name = f"PDF download from {timestamp}"
142 |     asset.file = filename
143 |     asset.gzip = True
144 |     asset.save()
145 | 
146 |     asset.bookmark.latest_snapshot = asset
147 |     asset.bookmark.date_modified = timezone.now()
148 |     asset.bookmark.save()
149 | 
150 | 
151 | def upload_snapshot(bookmark: Bookmark, html: bytes):
152 |     asset = create_snapshot_asset(bookmark)
153 |     filename = _generate_asset_filename(asset, asset.bookmark.url, "html.gz")
154 |     filepath = os.path.join(settings.LD_ASSET_FOLDER, filename)
155 | 
156 |     with gzip.open(filepath, "wb") as gz_file:
157 |         gz_file.write(html)
158 | 
159 |     # Only save the asset if the file was written successfully
160 |     timestamp = formats.date_format(asset.date_created, "SHORT_DATE_FORMAT")
161 | 
162 |     asset.status = BookmarkAsset.STATUS_COMPLETE
163 |     asset.content_type = BookmarkAsset.CONTENT_TYPE_HTML
164 |     asset.display_name = f"HTML snapshot from {timestamp}"
165 |     asset.file = filename
166 |     asset.gzip = True
167 |     asset.save()
168 | 
169 |     asset.bookmark.latest_snapshot = asset
170 |     asset.bookmark.date_modified = timezone.now()
171 |     asset.bookmark.save()
172 | 
173 |     return asset
174 | 
175 | 
176 | def upload_asset(bookmark: Bookmark, upload_file: UploadedFile):
177 |     try:
178 |         asset = BookmarkAsset(
179 |             bookmark=bookmark,
180 |             asset_type=BookmarkAsset.TYPE_UPLOAD,
181 |             date_created=timezone.now(),
182 |             content_type=upload_file.content_type,
183 |             display_name=upload_file.name,
184 |             status=BookmarkAsset.STATUS_COMPLETE,
185 |             gzip=False,
186 |         )
187 |         name, extension = os.path.splitext(upload_file.name)
188 | 
189 |         # automatically gzip the file if it is not already gzipped
190 |         if upload_file.content_type != "application/gzip":
191 |             filename = _generate_asset_filename(
192 |                 asset, name, extension.lstrip(".") + ".gz"
193 |             )
194 |             filepath = os.path.join(settings.LD_ASSET_FOLDER, filename)
195 |             with gzip.open(filepath, "wb", compresslevel=9) as f:
196 |                 for chunk in upload_file.chunks():
197 |                     f.write(chunk)
198 |             asset.gzip = True
199 |             asset.file = filename
200 |             asset.file_size = os.path.getsize(filepath)
201 |         else:
202 |             filename = _generate_asset_filename(asset, name, extension.lstrip("."))
203 |             filepath = os.path.join(settings.LD_ASSET_FOLDER, filename)
204 |             with open(filepath, "wb") as f:
205 |                 for chunk in upload_file.chunks():
206 |                     f.write(chunk)
207 |             asset.file = filename
208 |             asset.file_size = upload_file.size
209 | 
210 |         asset.save()
211 | 
212 |         asset.bookmark.date_modified = timezone.now()
213 |         asset.bookmark.save()
214 | 
215 |         logger.info(
216 |             f"Successfully uploaded asset file. bookmark={bookmark} file={upload_file.name}"
217 |         )
218 |         return asset
219 |     except Exception as e:
220 |         logger.error(
221 |             f"Failed to upload asset file. bookmark={bookmark} file={upload_file.name}",
222 |             exc_info=e,
223 |         )
224 |         raise e
225 | 
226 | 
227 | # Chunk size used when streaming asset files to clients
228 | STREAM_CHUNK_SIZE = 64 * 1024
229 | 
230 | 
231 | def open_asset_file(asset: BookmarkAsset) -> BinaryIO:
232 |     """
233 |     Opens the asset file for reading, transparently decompressing gzipped
234 |     files. Raises FileNotFoundError if the file does not exist.
235 |     """
236 |     filepath = os.path.join(settings.LD_ASSET_FOLDER, asset.file)
237 | 
238 |     if not os.path.isfile(filepath):
239 |         raise FileNotFoundError(filepath)
240 | 
241 |     if asset.gzip:
242 |         return gzip.open(filepath, "rb")
243 |     return open(filepath, "rb")  # noqa: SIM115
244 | 
245 | 
246 | def stream_asset_file(asset: BookmarkAsset) -> StreamingHttpResponse:
247 |     """
248 |     Creates a response that streams the (decompressed) asset file content in
249 |     fixed-size chunks. Callers can add headers to the response as needed.
250 |     Raises FileNotFoundError if the file does not exist.
251 | 
252 |     Notes on why this is implemented this way:
253 |     - Do not use Django's FileResponse for asset files. Under uWSGI it hands the
254 |       file descriptor to sendfile(), which sends the raw compressed bytes for
255 |       gzipped assets while announcing the uncompressed content length.
256 |     - Do not pass the file object to StreamingHttpResponse directly. Iterating
257 |       a file yields lines, which loads files without newlines (e.g. binary
258 |       uploads) into memory as a whole.
259 |     FileWrapper closes the underlying file when the response is closed.
260 |     """
261 |     file = open_asset_file(asset)
262 |     content = FileWrapper(file, STREAM_CHUNK_SIZE)
263 |     return StreamingHttpResponse(content, content_type=asset.content_type)
264 | 
265 | 
266 | def remove_asset(asset: BookmarkAsset):
267 |     # If this asset is the latest_snapshot for a bookmark, try to find the next most recent snapshot
268 |     bookmark = asset.bookmark
269 |     if bookmark and bookmark.latest_snapshot == asset:
270 |         latest = (
271 |             BookmarkAsset.objects.filter(
272 |                 bookmark=bookmark,
273 |                 asset_type=BookmarkAsset.TYPE_SNAPSHOT,
274 |                 status=BookmarkAsset.STATUS_COMPLETE,
275 |             )
276 |             .exclude(pk=asset.pk)
277 |             .order_by("-date_created")
278 |             .first()
279 |         )
280 | 
281 |         bookmark.latest_snapshot = latest
282 | 
283 |     asset.delete()
284 |     bookmark.date_modified = timezone.now()
285 |     bookmark.save()
286 | 
287 | 
288 | def _generate_asset_filename(
289 |     asset: BookmarkAsset, filename: str, extension: str
290 | ) -> str:
291 |     def sanitize_char(char):
292 |         if (char.isascii() and char.isalnum()) or char in ("-", "_", "."):
293 |             return char
294 |         else:
295 |             return "_"
296 | 
297 |     formatted_datetime = asset.date_created.strftime("%Y-%m-%d_%H%M%S")
298 |     sanitized_filename = "".join(sanitize_char(char) for char in filename)
299 | 
300 |     # Calculate the length of fixed parts of the final filename
301 |     non_filename_length = len(f"{asset.asset_type}_{formatted_datetime}_.{extension}")
302 |     # Calculate the maximum length for the dynamic part of the filename
303 |     max_filename_length = MAX_ASSET_FILENAME_LENGTH - non_filename_length
304 |     # Truncate the filename if necessary
305 |     sanitized_filename = sanitized_filename[:max_filename_length]
306 | 
307 |     return f"{asset.asset_type}_{formatted_datetime}_{sanitized_filename}.{extension}"
===== END ALLOWED INPUT: bookmarks/services/assets.py =====

===== BEGIN ALLOWED INPUT: bookmarks/urls.py =====
Source ID: src-a51fad5856e205e8
Location note: crop lines 1-163; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from django.conf import settings
2 | from django.contrib.auth import views as django_auth_views
3 | from django.urls import include, path, re_path
4 | 
5 | from bookmarks import feeds
6 | from bookmarks.admin import linkding_admin_site
7 | from bookmarks.api import routes as api_routes
8 | from bookmarks.views import assets as assets_views
9 | from bookmarks.views import auth as linkding_auth_views
10 | from bookmarks.views import bookmarks as bookmarks_views
11 | from bookmarks.views import bundles as bundles_views
12 | from bookmarks.views import settings as settings_views
13 | from bookmarks.views import tags as tags_views
14 | from bookmarks.views import toasts as toasts_views
15 | from bookmarks.views.custom_css import custom_css as custom_css_view
16 | from bookmarks.views.health import health as health_view
17 | from bookmarks.views.manifest import manifest as manifest_view
18 | from bookmarks.views.opensearch import opensearch as opensearch_view
19 | from bookmarks.views.root import root as root_view
20 | 
21 | urlpatterns = [
22 |     # Root view handling redirection based on user authentication
23 |     re_path(r"^$", root_view, name="root"),
24 |     # Bookmarks
25 |     path("bookmarks", bookmarks_views.index, name="bookmarks.index"),
26 |     path(
27 |         "bookmarks/action", bookmarks_views.index_action, name="bookmarks.index.action"
28 |     ),
29 |     path("bookmarks/archived", bookmarks_views.archived, name="bookmarks.archived"),
30 |     path(
31 |         "bookmarks/archived/action",
32 |         bookmarks_views.archived_action,
33 |         name="bookmarks.archived.action",
34 |     ),
35 |     path("bookmarks/shared", bookmarks_views.shared, name="bookmarks.shared"),
36 |     path(
37 |         "bookmarks/shared/action",
38 |         bookmarks_views.shared_action,
39 |         name="bookmarks.shared.action",
40 |     ),
41 |     path("bookmarks/new", bookmarks_views.new, name="bookmarks.new"),
42 |     path("bookmarks/close", bookmarks_views.close, name="bookmarks.close"),
43 |     path(
44 |         "bookmarks/<int:bookmark_id>/edit", bookmarks_views.edit, name="bookmarks.edit"
45 |     ),
46 |     # Assets
47 |     path(
48 |         "assets/<int:asset_id>",
49 |         assets_views.view,
50 |         name="assets.view",
51 |     ),
52 |     path(
53 |         "assets/<int:asset_id>/read",
54 |         assets_views.read,
55 |         name="assets.read",
56 |     ),
57 |     # Bundles
58 |     path("bundles", bundles_views.index, name="bundles.index"),
59 |     path("bundles/action", bundles_views.action, name="bundles.action"),
60 |     path("bundles/new", bundles_views.new, name="bundles.new"),
61 |     path("bundles/<int:bundle_id>/edit", bundles_views.edit, name="bundles.edit"),
62 |     path("bundles/preview", bundles_views.preview, name="bundles.preview"),
63 |     # Tags
64 |     path("tags", tags_views.tags_index, name="tags.index"),
65 |     path("tags/new", tags_views.tag_new, name="tags.new"),
66 |     path("tags/<int:tag_id>/edit", tags_views.tag_edit, name="tags.edit"),
67 |     path("tags/merge", tags_views.tag_merge, name="tags.merge"),
68 |     # Settings
69 |     path("settings", settings_views.general, name="settings.index"),
70 |     path("settings/general", settings_views.general, name="settings.general"),
71 |     path("settings/update", settings_views.update, name="settings.update"),
72 |     path(
73 |         "settings/integrations",
74 |         settings_views.integrations,
75 |         name="settings.integrations",
76 |     ),
77 |     path(
78 |         "settings/integrations/create-api-token",
79 |         settings_views.create_api_token,
80 |         name="settings.integrations.create_api_token",
81 |     ),
82 |     path(
83 |         "settings/integrations/delete-api-token",
84 |         settings_views.delete_api_token,
85 |         name="settings.integrations.delete_api_token",
86 |     ),
87 |     path("settings/import", settings_views.bookmark_import, name="settings.import"),
88 |     path("settings/export", settings_views.bookmark_export, name="settings.export"),
89 |     # Toasts
90 |     path("toasts/acknowledge", toasts_views.acknowledge, name="toasts.acknowledge"),
91 |     # API
92 |     path("api/", include(api_routes.default_router.urls)),
93 |     path("api/bookmarks/", include(api_routes.bookmark_router.urls)),
94 |     path(
95 |         "api/bookmarks/<int:bookmark_id>/assets/",
96 |         include(api_routes.bookmark_asset_router.urls),
97 |     ),
98 |     path("api/tags/", include(api_routes.tag_router.urls)),
99 |     path("api/bundles/", include(api_routes.bundle_router.urls)),
100 |     path("api/user/", include(api_routes.user_router.urls)),
101 |     # Feeds
102 |     path("feeds/<str:feed_key>/all", feeds.AllBookmarksFeed(), name="feeds.all"),
103 |     path(
104 |         "feeds/<str:feed_key>/unread", feeds.UnreadBookmarksFeed(), name="feeds.unread"
105 |     ),
106 |     path(
107 |         "feeds/<str:feed_key>/shared", feeds.SharedBookmarksFeed(), name="feeds.shared"
108 |     ),
109 |     path("feeds/shared", feeds.PublicSharedBookmarksFeed(), name="feeds.public_shared"),
110 |     # Health check
111 |     path("health", health_view, name="health"),
112 |     # Manifest
113 |     path("manifest.json", manifest_view, name="manifest"),
114 |     # Custom CSS
115 |     path("custom_css", custom_css_view, name="custom_css"),
116 |     # OpenSearch
117 |     path("opensearch.xml", opensearch_view, name="opensearch"),
118 | ]
119 | 
120 | # Live reload (debug only)
121 | if settings.DEBUG:
122 |     from bookmarks.views import reload
123 | 
124 |     urlpatterns.append(path("live_reload", reload.live_reload, name="live_reload"))
125 | 
126 | # Put all linkding URLs into a linkding namespace
127 | urlpatterns = [path("", include((urlpatterns, "linkding")))]
128 | 
129 | # Auth
130 | urlpatterns += [
131 |     path(
132 |         "login/",
133 |         linkding_auth_views.LinkdingLoginView.as_view(redirect_authenticated_user=True),
134 |         name="login",
135 |     ),
136 |     path("logout/", django_auth_views.LogoutView.as_view(), name="logout"),
137 |     path(
138 |         "change-password/",
139 |         linkding_auth_views.LinkdingPasswordChangeView.as_view(),
140 |         name="change_password",
141 |     ),
142 |     path(
143 |         "password-change-done/",
144 |         django_auth_views.PasswordChangeDoneView.as_view(),
145 |         name="password_change_done",
146 |     ),
147 | ]
148 | 
149 | # Admin
150 | urlpatterns.append(path("admin/", linkding_admin_site.urls))
151 | 
152 | # OIDC
153 | if settings.LD_ENABLE_OIDC:
154 |     urlpatterns.append(path("oidc/", include("mozilla_django_oidc.urls")))
155 | 
156 | # Debug toolbar
157 | # if settings.DEBUG:
158 | #    import debug_toolbar
159 | #    urlpatterns.append(path("__debug__/", include(debug_toolbar.urls)))
160 | 
161 | # Context path
162 | if settings.LD_CONTEXT_PATH:
163 |     urlpatterns = [path(settings.LD_CONTEXT_PATH, include(urlpatterns))]
===== END ALLOWED INPUT: bookmarks/urls.py =====

===== BEGIN ALLOWED INPUT: bookmarks/views/access.py =====
Source ID: src-8eccbcbd2d3dd02b
Location note: crop lines 1-74; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from django.http import Http404
2 | 
3 | from bookmarks.models import ApiToken, Bookmark, BookmarkAsset, BookmarkBundle, Toast
4 | from bookmarks.type_defs import HttpRequest
5 | 
6 | 
7 | def bookmark_read(request: HttpRequest, bookmark_id: int | str):
8 |     try:
9 |         bookmark = Bookmark.objects.get(pk=int(bookmark_id))
10 |     except Bookmark.DoesNotExist:
11 |         raise Http404("Bookmark does not exist") from None
12 | 
13 |     is_owner = bookmark.owner == request.user
14 |     is_shared = (
15 |         request.user.is_authenticated
16 |         and bookmark.shared
17 |         and bookmark.owner.profile.enable_sharing
18 |     )
19 |     is_public_shared = bookmark.shared and bookmark.owner.profile.enable_public_sharing
20 |     if not is_owner and not is_shared and not is_public_shared:
21 |         raise Http404("Bookmark does not exist")
22 |     if request.method == "POST" and not is_owner:
23 |         raise Http404("Bookmark does not exist")
24 | 
25 |     return bookmark
26 | 
27 | 
28 | def bookmark_write(request: HttpRequest, bookmark_id: int | str):
29 |     try:
30 |         return Bookmark.objects.get(pk=bookmark_id, owner=request.user)
31 |     except Bookmark.DoesNotExist:
32 |         raise Http404("Bookmark does not exist") from None
33 | 
34 | 
35 | def bundle_read(request: HttpRequest, bundle_id: int | str):
36 |     return bundle_write(request, bundle_id)
37 | 
38 | 
39 | def bundle_write(request: HttpRequest, bundle_id: int | str):
40 |     try:
41 |         return BookmarkBundle.objects.get(pk=bundle_id, owner=request.user)
42 |     except (BookmarkBundle.DoesNotExist, ValueError):
43 |         raise Http404("Bundle does not exist") from None
44 | 
45 | 
46 | def asset_read(request: HttpRequest, asset_id: int | str):
47 |     try:
48 |         asset = BookmarkAsset.objects.get(pk=asset_id)
49 |     except BookmarkAsset.DoesNotExist:
50 |         raise Http404("Asset does not exist") from None
51 | 
52 |     bookmark_read(request, asset.bookmark_id)
53 |     return asset
54 | 
55 | 
56 | def asset_write(request: HttpRequest, asset_id: int | str):
57 |     try:
58 |         return BookmarkAsset.objects.get(pk=asset_id, bookmark__owner=request.user)
59 |     except BookmarkAsset.DoesNotExist:
60 |         raise Http404("Asset does not exist") from None
61 | 
62 | 
63 | def toast_write(request: HttpRequest, toast_id: int | str):
64 |     try:
65 |         return Toast.objects.get(pk=toast_id, owner=request.user)
66 |     except Toast.DoesNotExist:
67 |         raise Http404("Toast does not exist") from None
68 | 
69 | 
70 | def api_token_write(request: HttpRequest, token_id: int | str):
71 |     try:
72 |         return ApiToken.objects.get(id=token_id, user=request.user)
73 |     except (ApiToken.DoesNotExist, ValueError):
74 |         raise Http404("API token does not exist") from None
===== END ALLOWED INPUT: bookmarks/views/access.py =====

===== BEGIN ALLOWED INPUT: bookmarks/views/assets.py =====
Source ID: src-abd44599b075de1c
Location note: crop lines 1-41; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | from django.http import Http404
2 | from django.shortcuts import render
3 | 
4 | from bookmarks.services import assets
5 | from bookmarks.views import access
6 | 
7 | 
8 | def view(request, asset_id: int):
9 |     asset = access.asset_read(request, asset_id)
10 |     try:
11 |         response = assets.stream_asset_file(asset)
12 |     except FileNotFoundError:
13 |         raise Http404("Asset file does not exist") from None
14 | 
15 |     response["Content-Disposition"] = f'inline; filename="{asset.download_name}"'
16 |     if asset.content_type and asset.content_type.startswith("video/"):
17 |         response["Content-Security-Policy"] = "default-src 'none'; media-src 'self';"
18 |     elif asset.content_type == "application/pdf":
19 |         response["Content-Security-Policy"] = "default-src 'none'; object-src 'self';"
20 |     else:
21 |         response["Content-Security-Policy"] = "sandbox allow-scripts"
22 |     return response
23 | 
24 | 
25 | def read(request, asset_id: int):
26 |     asset = access.asset_read(request, asset_id)
27 |     try:
28 |         with assets.open_asset_file(asset) as file:
29 |             content = file.read().decode("utf-8")
30 |     except FileNotFoundError:
31 |         raise Http404("Asset file does not exist") from None
32 | 
33 |     response = render(
34 |         request,
35 |         "bookmarks/read.html",
36 |         {
37 |             "content": content,
38 |         },
39 |     )
40 |     response["Content-Security-Policy"] = "sandbox allow-scripts"
41 |     return response
===== END ALLOWED INPUT: bookmarks/views/assets.py =====

===== BEGIN ALLOWED INPUT: bookmarks/views/bookmarks.py =====
Source ID: src-b082ceda16e389bc
Location note: crop lines 1-427; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | import urllib.parse
2 | 
3 | from django.conf import settings
4 | from django.contrib.auth.decorators import login_required
5 | from django.db.models import QuerySet
6 | from django.http import (
7 |     HttpResponseBadRequest,
8 |     HttpResponseForbidden,
9 |     HttpResponseRedirect,
10 | )
11 | from django.shortcuts import render
12 | from django.urls import reverse
13 | 
14 | from bookmarks import queries, utils
15 | from bookmarks.forms import BookmarkForm
16 | from bookmarks.models import (
17 |     Bookmark,
18 |     BookmarkSearch,
19 | )
20 | from bookmarks.services import assets as asset_actions
21 | from bookmarks.services import tasks
22 | from bookmarks.services.bookmarks import (
23 |     archive_bookmark,
24 |     archive_bookmarks,
25 |     create_html_snapshots,
26 |     delete_bookmarks,
27 |     mark_bookmarks_as_read,
28 |     mark_bookmarks_as_unread,
29 |     refresh_bookmarks_metadata,
30 |     share_bookmarks,
31 |     tag_bookmarks,
32 |     unarchive_bookmark,
33 |     unarchive_bookmarks,
34 |     unshare_bookmarks,
35 |     untag_bookmarks,
36 | )
37 | from bookmarks.type_defs import HttpRequest
38 | from bookmarks.utils import get_safe_return_url
39 | from bookmarks.views import access, contexts, turbo
40 | 
41 | 
42 | @login_required
43 | def index(request: HttpRequest):
44 |     if request.method == "POST":
45 |         return search_action(request)
46 | 
47 |     search = BookmarkSearch.from_request(
48 |         request, request.GET, request.user_profile.search_preferences
49 |     )
50 |     bookmark_list = contexts.ActiveBookmarkListContext(request, search)
51 |     bundles = contexts.BundlesContext(request)
52 |     tag_cloud = contexts.ActiveTagCloudContext(request, search)
53 |     bookmark_details = contexts.get_details_context(
54 |         request, contexts.ActiveBookmarkDetailsContext
55 |     )
56 | 
57 |     return render_bookmarks_view(
58 |         request,
59 |         {
60 |             "page_title": "Bookmarks - Linkding",
61 |             "bookmark_list": bookmark_list,
62 |             "bundles": bundles,
63 |             "tag_cloud": tag_cloud,
64 |             "details": bookmark_details,
65 |         },
66 |     )
67 | 
68 | 
69 | def index_update(request: HttpRequest):
70 |     search = BookmarkSearch.from_request(
71 |         request, request.GET, request.user_profile.search_preferences
72 |     )
73 |     bookmark_list = contexts.ActiveBookmarkListContext(request, search)
74 |     tag_cloud = contexts.ActiveTagCloudContext(request, search)
75 |     details = contexts.get_details_context(
76 |         request, contexts.ActiveBookmarkDetailsContext
77 |     )
78 |     return render_bookmarks_update(request, bookmark_list, tag_cloud, details)
79 | 
80 | 
81 | @login_required
82 | def archived(request: HttpRequest):
83 |     if request.method == "POST":
84 |         return search_action(request)
85 | 
86 |     search = BookmarkSearch.from_request(
87 |         request, request.GET, request.user_profile.search_preferences
88 |     )
89 |     bookmark_list = contexts.ArchivedBookmarkListContext(request, search)
90 |     bundles = contexts.BundlesContext(request)
91 |     tag_cloud = contexts.ArchivedTagCloudContext(request, search)
92 |     bookmark_details = contexts.get_details_context(
93 |         request, contexts.ArchivedBookmarkDetailsContext
94 |     )
95 | 
96 |     return render_bookmarks_view(
97 |         request,
98 |         {
99 |             "page_title": "Archived bookmarks - Linkding",
100 |             "bookmark_list": bookmark_list,
101 |             "bundles": bundles,
102 |             "tag_cloud": tag_cloud,
103 |             "details": bookmark_details,
104 |         },
105 |     )
106 | 
107 | 
108 | def archived_update(request: HttpRequest):
109 |     search = BookmarkSearch.from_request(
110 |         request, request.GET, request.user_profile.search_preferences
111 |     )
112 |     bookmark_list = contexts.ArchivedBookmarkListContext(request, search)
113 |     tag_cloud = contexts.ArchivedTagCloudContext(request, search)
114 |     details = contexts.get_details_context(
115 |         request, contexts.ArchivedBookmarkDetailsContext
116 |     )
117 |     return render_bookmarks_update(request, bookmark_list, tag_cloud, details)
118 | 
119 | 
120 | def shared(request: HttpRequest):
121 |     if request.method == "POST":
122 |         return search_action(request)
123 | 
124 |     search = BookmarkSearch.from_request(
125 |         request, request.GET, request.user_profile.search_preferences
126 |     )
127 |     bookmark_list = contexts.SharedBookmarkListContext(request, search)
128 |     tag_cloud = contexts.SharedTagCloudContext(request, search)
129 |     bookmark_details = contexts.get_details_context(
130 |         request, contexts.SharedBookmarkDetailsContext
131 |     )
132 |     user_list = contexts.UserListContext(request, search)
133 |     return render_bookmarks_view(
134 |         request,
135 |         {
136 |             "page_title": "Shared bookmarks - Linkding",
137 |             "bookmark_list": bookmark_list,
138 |             "tag_cloud": tag_cloud,
139 |             "details": bookmark_details,
140 |             "user_list": user_list,
141 |             "rss_feed_url": reverse("linkding:feeds.public_shared"),
142 |         },
143 |     )
144 | 
145 | 
146 | def shared_update(request: HttpRequest):
147 |     search = BookmarkSearch.from_request(
148 |         request, request.GET, request.user_profile.search_preferences
149 |     )
150 |     bookmark_list = contexts.SharedBookmarkListContext(request, search)
151 |     tag_cloud = contexts.SharedTagCloudContext(request, search)
152 |     details = contexts.get_details_context(
153 |         request, contexts.SharedBookmarkDetailsContext
154 |     )
155 |     return render_bookmarks_update(request, bookmark_list, tag_cloud, details)
156 | 
157 | 
158 | def render_bookmarks_view(request: HttpRequest, context):
159 |     if context["details"]:
160 |         context["page_title"] = "Bookmark details - Linkding"
161 | 
162 |     if turbo.is_frame(request, "details-modal"):
163 |         return turbo.frame(request, "bookmarks/details/modal.html", context)
164 | 
165 |     return render(
166 |         request,
167 |         "bookmarks/bookmark_page.html",
168 |         context,
169 |     )
170 | 
171 | 
172 | def render_bookmarks_update(request, bookmark_list, tag_cloud, details):
173 |     return turbo.stream(
174 |         turbo.update(
175 |             request,
176 |             "bookmark-list-container",
177 |             "bookmarks/bookmark_list.html",
178 |             {"bookmark_list": bookmark_list},
179 |         ),
180 |         turbo.update(
181 |             request,
182 |             "tag-cloud-container",
183 |             "bookmarks/tag_cloud.html",
184 |             {"tag_cloud": tag_cloud},
185 |         ),
186 |         turbo.replace(
187 |             request,
188 |             "details-modal",
189 |             "bookmarks/details/modal.html",
190 |             {"details": details},
191 |             method="morph",
192 |         ),
193 |     )
194 | 
195 | 
196 | def search_action(request: HttpRequest):
197 |     if "save" in request.POST:
198 |         if not request.user.is_authenticated:
199 |             return HttpResponseForbidden()
200 |         search = BookmarkSearch.from_request(request, request.POST)
201 |         request.user_profile.search_preferences = search.preferences_dict
202 |         request.user_profile.save()
203 | 
204 |     # redirect to base url including new query params
205 |     search = BookmarkSearch.from_request(
206 |         request, request.POST, request.user_profile.search_preferences
207 |     )
208 |     base_url = request.path
209 |     query_params = search.query_params
210 |     query_string = urllib.parse.urlencode(query_params)
211 |     url = base_url if not query_string else base_url + "?" + query_string
212 |     return HttpResponseRedirect(url)
213 | 
214 | 
215 | def convert_tag_string(tag_string: str):
216 |     # Tag strings coming from inputs are space-separated, however services.bookmarks functions expect comma-separated
217 |     # strings
218 |     return tag_string.replace(" ", ",")
219 | 
220 | 
221 | @login_required
222 | def new(request: HttpRequest):
223 |     form = BookmarkForm(request)
224 |     if request.method == "POST" and form.is_valid():
225 |         form.save()
226 |         if form.is_auto_close:
227 |             return HttpResponseRedirect(reverse("linkding:bookmarks.close"))
228 |         else:
229 |             return HttpResponseRedirect(reverse("linkding:bookmarks.index"))
230 | 
231 |     status = 422 if request.method == "POST" and not form.is_valid() else 200
232 |     context = {"form": form, "return_url": reverse("linkding:bookmarks.index")}
233 | 
234 |     return render(request, "bookmarks/new.html", context, status=status)
235 | 
236 | 
237 | @login_required
238 | def edit(request: HttpRequest, bookmark_id: int):
239 |     bookmark = access.bookmark_write(request, bookmark_id)
240 |     form = BookmarkForm(request, instance=bookmark)
241 |     return_url = get_safe_return_url(
242 |         request.GET.get("return_url"), reverse("linkding:bookmarks.index")
243 |     )
244 | 
245 |     if request.method == "POST" and form.is_valid():
246 |         form.save()
247 |         return HttpResponseRedirect(return_url)
248 | 
249 |     status = 422 if request.method == "POST" and not form.is_valid() else 200
250 |     context = {"form": form, "bookmark_id": bookmark_id, "return_url": return_url}
251 | 
252 |     return render(request, "bookmarks/edit.html", context, status=status)
253 | 
254 | 
255 | def remove(request: HttpRequest, bookmark_id: int | str):
256 |     bookmark = access.bookmark_write(request, bookmark_id)
257 |     bookmark.delete()
258 | 
259 | 
260 | def archive(request: HttpRequest, bookmark_id: int | str):
261 |     bookmark = access.bookmark_write(request, bookmark_id)
262 |     archive_bookmark(bookmark)
263 | 
264 | 
265 | def unarchive(request: HttpRequest, bookmark_id: int | str):
266 |     bookmark = access.bookmark_write(request, bookmark_id)
267 |     unarchive_bookmark(bookmark)
268 | 
269 | 
270 | def unshare(request: HttpRequest, bookmark_id: int | str):
271 |     bookmark = access.bookmark_write(request, bookmark_id)
272 |     bookmark.shared = False
273 |     bookmark.save()
274 | 
275 | 
276 | def mark_as_read(request: HttpRequest, bookmark_id: int | str):
277 |     bookmark = access.bookmark_write(request, bookmark_id)
278 |     bookmark.unread = False
279 |     bookmark.save()
280 | 
281 | 
282 | def create_html_snapshot(request: HttpRequest, bookmark_id: int | str):
283 |     bookmark = access.bookmark_write(request, bookmark_id)
284 |     tasks.create_html_snapshot(bookmark)
285 | 
286 | 
287 | def upload_asset(request: HttpRequest, bookmark_id: int | str):
288 |     if settings.LD_DISABLE_ASSET_UPLOAD:
289 |         return HttpResponseForbidden("Asset upload is disabled")
290 | 
291 |     bookmark = access.bookmark_write(request, bookmark_id)
292 |     file = request.FILES.get("upload_asset_file")
293 |     if not file:
294 |         return HttpResponseBadRequest("No file provided")
295 | 
296 |     asset_actions.upload_asset(bookmark, file)
297 | 
298 | 
299 | def remove_asset(request: HttpRequest, asset_id: int | str):
300 |     asset = access.asset_write(request, asset_id)
301 |     asset_actions.remove_asset(asset)
302 | 
303 | 
304 | def update_state(request: HttpRequest, bookmark_id: int | str):
305 |     bookmark = access.bookmark_write(request, bookmark_id)
306 |     bookmark.is_archived = request.POST.get("is_archived") == "on"
307 |     bookmark.unread = request.POST.get("unread") == "on"
308 |     bookmark.shared = request.POST.get("shared") == "on"
309 |     bookmark.save()
310 | 
311 | 
312 | @login_required
313 | def index_action(request: HttpRequest):
314 |     search = BookmarkSearch.from_request(
315 |         request, request.GET, request.user_profile.search_preferences
316 |     )
317 |     query = queries.query_bookmarks(request.user, request.user_profile, search)
318 | 
319 |     response = handle_action(request, query)
320 |     if response:
321 |         return response
322 | 
323 |     if turbo.accept(request):
324 |         return index_update(request)
325 | 
326 |     return utils.redirect_with_query(request, reverse("linkding:bookmarks.index"))
327 | 
328 | 
329 | @login_required
330 | def archived_action(request: HttpRequest):
331 |     search = BookmarkSearch.from_request(
332 |         request, request.GET, request.user_profile.search_preferences
333 |     )
334 |     query = queries.query_archived_bookmarks(request.user, request.user_profile, search)
335 | 
336 |     response = handle_action(request, query)
337 |     if response:
338 |         return response
339 | 
340 |     if turbo.accept(request):
341 |         return archived_update(request)
342 | 
343 |     return utils.redirect_with_query(request, reverse("linkding:bookmarks.archived"))
344 | 
345 | 
346 | @login_required
347 | def shared_action(request: HttpRequest):
348 |     if "bulk_execute" in request.POST:
349 |         return HttpResponseBadRequest("View does not support bulk actions")
350 | 
351 |     response = handle_action(request)
352 |     if response:
353 |         return response
354 | 
355 |     if turbo.accept(request):
356 |         return shared_update(request)
357 | 
358 |     return utils.redirect_with_query(request, reverse("linkding:bookmarks.shared"))
359 | 
360 | 
361 | def handle_action(request: HttpRequest, query: QuerySet[Bookmark] = None):
362 |     # Single bookmark actions
363 |     if "archive" in request.POST:
364 |         return archive(request, request.POST["archive"])
365 |     if "unarchive" in request.POST:
366 |         return unarchive(request, request.POST["unarchive"])
367 |     if "remove" in request.POST:
368 |         return remove(request, request.POST["remove"])
369 |     if "mark_as_read" in request.POST:
370 |         return mark_as_read(request, request.POST["mark_as_read"])
371 |     if "unshare" in request.POST:
372 |         return unshare(request, request.POST["unshare"])
373 |     if "create_html_snapshot" in request.POST:
374 |         return create_html_snapshot(request, request.POST["create_html_snapshot"])
375 |     if "upload_asset" in request.POST:
376 |         return upload_asset(request, request.POST["upload_asset"])
377 |     if "remove_asset" in request.POST:
378 |         return remove_asset(request, request.POST["remove_asset"])
379 | 
380 |     # State updates
381 |     if "update_state" in request.POST:
382 |         return update_state(request, request.POST["update_state"])
383 | 
384 |     # Bulk actions
385 |     if "bulk_execute" in request.POST:
386 |         if query is None:
387 |             raise ValueError("Query must be provided for bulk actions")
388 | 
389 |         bulk_action = request.POST["bulk_action"]
390 | 
391 |         # Determine set of bookmarks
392 |         if request.POST.get("bulk_select_across") == "on":
393 |             # Query full list of bookmarks across all pages
394 |             bookmark_ids = query.only("id").values_list("id", flat=True)
395 |         else:
396 |             # Use only selected bookmarks
397 |             bookmark_ids = request.POST.getlist("bookmark_id")
398 | 
399 |         if bulk_action == "bulk_archive":
400 |             return archive_bookmarks(bookmark_ids, request.user)
401 |         if bulk_action == "bulk_unarchive":
402 |             return unarchive_bookmarks(bookmark_ids, request.user)
403 |         if bulk_action == "bulk_delete":
404 |             return delete_bookmarks(bookmark_ids, request.user)
405 |         if bulk_action == "bulk_tag":
406 |             tag_string = convert_tag_string(request.POST["bulk_tag_string"])
407 |             return tag_bookmarks(bookmark_ids, tag_string, request.user)
408 |         if bulk_action == "bulk_untag":
409 |             tag_string = convert_tag_string(request.POST["bulk_tag_string"])
410 |             return untag_bookmarks(bookmark_ids, tag_string, request.user)
411 |         if bulk_action == "bulk_read":
412 |             return mark_bookmarks_as_read(bookmark_ids, request.user)
413 |         if bulk_action == "bulk_unread":
414 |             return mark_bookmarks_as_unread(bookmark_ids, request.user)
415 |         if bulk_action == "bulk_share":
416 |             return share_bookmarks(bookmark_ids, request.user)
417 |         if bulk_action == "bulk_unshare":
418 |             return unshare_bookmarks(bookmark_ids, request.user)
419 |         if bulk_action == "bulk_refresh":
420 |             return refresh_bookmarks_metadata(bookmark_ids, request.user)
421 |         if bulk_action == "bulk_snapshot":
422 |             return create_html_snapshots(bookmark_ids, request.user)
423 | 
424 | 
425 | @login_required
426 | def close(request: HttpRequest):
427 |     return render(request, "bookmarks/close.html")
===== END ALLOWED INPUT: bookmarks/views/bookmarks.py =====
