# Authorization Assessment Authoring Instructions

## Source identity

- **Task ID:** `al-use-paperless-note`
- **Repository:** `https://github.com/paperless-ngx/paperless-ngx`
- **Source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Source root:** `../../../../authorization-evidence-editing-v1/public-source/paperless`
- **Allowed files:**
  - `src/documents/views.py`
  - `src/documents/permissions.py`
- **Request:** At notes POST handler entry assess both scenarios. The caller is not the document owner. The owner's presence is unspecified in the original task: distinguish absent from other-present where it changes authorization. Both callers have all stated global permissions and can view the document. Separate source-visible authorization from accepted-policy comparison.

## Analysis entry

Declare only this analysis entry:

- **Entry key:** `notes-post`
- **Path:** `src/documents/views.py`
- **Start line:** `1841`
- **End line:** `1913`

Helpers must be represented only as evidence-request dependencies, not as additional analysis entries. An empty dependency list with `discover=true` is supported.

## Domain dictionaries

Fill only the unknown domain dictionaries using these named keys:

### Policy: `rule`

> Creating a note requires the stated global permissions and either document ownership or an object change_document grant; an object view grant alone is insufficient.

The original and changed policies are identical. Preserve both policy identities without modifying the text.

- **Original policy location:** `author-briefs.json#/paperless-note-premise/originalPolicy`
- **Changed policy location:** `author-briefs.json#/paperless-note-premise/originalPolicy`

### Principal: `caller`

> authenticated user with the stated global permissions

### Resource: `target`

The document on which the caller attempts to create a note.

Do not add inferred attributes, permissions, ownership facts, or authorization obligations to these domain definitions.

## Scenarios

Retain exactly the two supplied scenario keys.

### `view-only`

- **Principal:** `caller`
- **Target:** `target`
- **Relation:** `not-owner-view-only`
- **Operation:** `create a note on the document`
- **Premise ID:** `object-relation`

**Original premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has no object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user.

**Changed/current premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has no object change_document grant. Owner is other-present: a different user owns the document.

- **Original expectation:** `deny`
- **Changed/current expectation:** `deny`

### `change-granted`

- **Principal:** `caller`
- **Target:** `target`
- **Relation:** `not-owner-change-granted`
- **Operation:** `create a note on the document`
- **Premise ID:** `object-relation`

**Original premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has an object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user.

**Changed/current premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has an object change_document grant. Owner is other-present: a different user owns the document.

- **Original expectation:** `allow`
- **Changed/current expectation:** `allow`

## Requested counterfactuals

Retain both requested owner-presence counterfactuals for each scenario:

- `absent`
- `other-present`

Assess the counterfactuals only where owner presence changes authorization.

## Analysis contract

For each supplied scenario:

1. Begin assessment at the `notes-post` handler entry.
2. Assess source-visible authorization separately from comparison with the accepted policy.
3. Preserve the stated global permissions, object grants, non-owner relation, operation, conditions, and expectations.
4. Distinguish an absent owner from an owner who is a different user where that distinction changes authorization.
5. Use only the allowed source files for evidence.
6. Represent helper inspection through evidence-request dependencies; do not declare helper functions as analysis entries.
7. Do not infer source outcomes in the authored task.
8. Do not add scenarios, obligations, permissions, relations, conditions, or policy requirements.
9. Do not change source bytes, source ref, task identity, entry identity, scenario identities, or expectations.
10. Record the premise change only: the original owner-presence statement is unspecified, while the changed/current statement fixes the owner as other-present.

## Output contract

Return only reusable Markdown task instructions. Copy current public policy, all premise statements, keys, relations and operations verbatim. Retain source identity/entry and current expectations, distinguish original from changed, and retain requested counterfactuals. No completed analysis.

## Allowed edit scope

Change only both object-relation premise statements to their changedPremise values. Preserve source bytes/ref, task ID, policy, expectations, identities, relations, conditions and requested counterfactuals. Do not infer another task change.