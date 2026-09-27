# Authorization Assessment Instructions

Assess the two declared authorization scenarios at the notes `POST` handler, using only:

- The accepted policy stated below.
- The declared handler-entry premises for each scenario.
- The supplied fixed-source excerpts at the cited locations.

Do not execute the target, infer deployment facts, or rewrite the policy to match observed implementation behavior.

## Accepted policy

Creating a note requires all stated global permissions and object-level `change_document` authorization. An object-level view grant alone is insufficient. Document ownership or an object-level change grant can satisfy the required object control.

## Source requirements

In the eventual analysis, cite the supplied source locations exactly:

- `src/documents/permissions.py:673-685` for the `POST` global permission requirements in `PaperlessNotePermissions.perms_map`.
- `src/documents/views.py:37-46` for the notes `POST` handler’s object-level `change_document` check and its forbidden branch.
- `src/documents/views.py:48-52` for the `Note.objects.create` call.
- `src/documents/permissions.py:624-635` for the owner-aware object authorization logic, including document ownership and object-permission checks.
- If discussing the handler’s earlier document-view check, cite `src/documents/views.py:17-22`.

Distinguish clearly between:

1. **Accepted policy** — the authorization rule that governs the assessment.
2. **Observed behavior** — what the supplied source implements at the cited locations.

Do not treat the scenario premises as source proof; use them as declared facts at handler entry.

## Scenario assessments

For each scenario below, assess the relation between the authenticated caller and the existing document and determine, under the accepted policy, whether execution reaches `Note.objects.create`.

For each assessment:

- Preserve the scenario key exactly.
- Use the supplied premise as the handler-entry fact.
- Account for the caller’s stated global permissions.
- Evaluate the object-level authorization relation.
- State the resulting authorization assessment and whether the create operation is reached.
- Support the analysis with exact citations to the supplied source locations.
- Explain any distinction between the accepted policy and the observed implementation behavior.
- Do not introduce unstated ownership, permission, deployment, or request facts.

### Scenario: `view-only`

- **Principal:** authenticated user with the stated global permissions
- **Relation:** `caller-owns-document`
- **Operation:** create a note on the document
- **Premise ID:** `object-relation`
- **Premise:** At handler entry, the caller has the stated global permissions and owns the existing document.

Assess this scenario without changing or weakening the premise. Apply the accepted policy’s rule that document ownership can satisfy the required object-level control, and update this scenario’s policy expectation to allow.

### Scenario: `change-granted`

- **Principal:** authenticated user with the stated global permissions
- **Relation:** `object-change-granted-not-owner`
- **Operation:** create a note on the document
- **Premise ID:** `object-relation`
- **Premise:** At handler entry, the caller has the stated global permissions and object view and `change_document` grants, but is not the document owner.

Assess this scenario without treating non-ownership as conclusive by itself. Consider the stated object change grant under the accepted policy and compare it with the owner-aware authorization behavior shown in the supplied source.
