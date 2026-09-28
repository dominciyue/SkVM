# Fixed-Source Authorization Assessment

Assess the authorization behavior of the specified source entry using only the fixed repository revision and the neutral brief below. Do not use other revisions, external documentation, inferred framework behavior, or unstated source facts. Do not decide the outcome in advance.

## Source

- Repository: https://github.com/paperless-ngx/paperless-ngx
- Fixed source ref: `126ec414a8b65158368653a2604ae58415e43103`
- Entry: `src/documents/views.py:1841-1913`
- Scope boundary: `declared-entry`

## Accepted policy

Creating a note requires both:

1. The POST global note/document permissions; and
2. An owner-aware `change_document` check on the target document.

Viewing the document alone is insufficient.

## Current question

At the `DocumentViewSet.notes` POST handler entry, can an authenticated user who has all listed global POST permissions and an object view grant on a document create a note when a different user owns the document and the caller has no object `change_document` grant?

## Premises

At the `notes` POST entry:

- The authenticated caller has the global POST permissions.
- The caller has an object view grant on the target document.
- The caller is not the document owner.
- The caller lacks the target document’s object `change_document` grant.

## Required analysis

Inspect only the declared source entry at the fixed ref and explain the authorization path without adding facts not established by that source. Keep the following points separate:

1. The `PaperlessNotePermissions` global POST-permission check.
2. The object view check.
3. The owner-aware object `change_document` check.
4. The effect of `Note.objects.create`.

State whether the premises satisfy each relevant check, distinguish permission checks from the note-creation side effect, and answer the current question only to the extent supported by the fixed source. Identify any limitation caused by the declared-entry boundary rather than filling it with assumptions.

Do not quote the separately supplied common public requirements paragraph verbatim. Do not provide a DSL draft, answer key, evaluator, or invented source facts.
