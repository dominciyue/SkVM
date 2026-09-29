# Reusable Markdown Assessment Instructions

## Task identity

- **Task:** `paperless-note-premise`
- **Variant:** `original`
- **Task ID:** `al-use-paperless-note`
- **Repository:** `https://github.com/paperless-ngx/paperless-ngx`
- **Source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Allowed files:**
  - `src/documents/views.py`
  - `src/documents/permissions.py`
- **Analysis entry:** `src/documents/views.py`, lines `1841–1913`
- **Requested handler:** notes POST handler
- **Support role:** Declare only the requested handler as an analysis entry. Put helper functions or permission logic in evidence-request dependencies. An empty dependency list with `discover=true` is supported.

## Public policy

> Creating a note requires the stated global permissions and either document ownership or an object change_document grant; an object view grant alone is insufficient.

Use this policy only as the accepted-policy comparison. Do not treat it as proof of what the source implements.

## Assessment scope

At the notes POST handler entry, inspect the source-visible authorization path for both scenarios below.

For each scenario:

1. Identify the authorization checks visible from the requested handler and any explicitly requested evidence dependencies.
2. Record the relevant source evidence, including file, function or expression, and line range where available.
3. Separate:
   - **Source-visible authorization:** what the inspected source appears to require or permit.
   - **Accepted-policy comparison:** whether that source-visible behavior can be compared with the public policy.
4. Preserve the stated premises exactly. Do not infer unstated ownership, permission, authentication, object-relation, or request-state facts.
5. Treat owner absence and owner presence as the requested counterfactuals, not as interchangeable facts.
6. Do not infer any additional task change from the unchanged source ref or from the policy text.

## Scenario premises

### `view-only`

- **Principal:** authenticated user with the stated global permissions
- **Relation:** `not-owner-view-only`
- **Operation:** create a note on the document
- **Premise ID:** `object-relation`
- **Original premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has no object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user.

- **Changed premise for the requested counterfactual:**

> At handler entry, the caller has global `add_note`, `view_document` and `change_document` permissions and an object view grant, is not the document owner, and has no object `change_document` grant. Owner is other-present: a different user owns the document.

- **Requested counterfactuals:** `absent`, `other-present`

### `change-granted`

- **Principal:** authenticated user with the stated global permissions
- **Relation:** `not-owner-change-granted`
- **Operation:** create a note on the document
- **Premise ID:** `object-relation`
- **Original premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has an object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user.

- **Changed premise for the requested counterfactual:**

> At handler entry, the caller has global `add_note`, `view_document` and `change_document` permissions and an object view grant, is not the document owner, and has an object `change_document` grant. Owner is other-present: a different user owns the document.

- **Requested counterfactuals:** `absent`, `other-present`

## Required evidence discipline

- Inspect only the permitted source files and declared evidence dependencies.
- Do not execute source code or claim runtime observations.
- Do not invent framework behavior, model fields, helper semantics, decorator effects, permission classes, or permission results that are not supported by inspected source evidence.
- Distinguish a check’s existence from the value it would produce under a premise.
- Distinguish handler-local checks from checks delegated to helpers, decorators, permission classes, or model methods.
- If a dependency is needed to establish an authorization fact, declare it as an evidence request rather than authoring an additional analysis entry.
- If the source does not expose enough evidence, state the limitation instead of filling the gap by assumption.
- Preserve the public scenario keys, identities, relations, conditions, policy, expectations, and requested counterfactuals.

## Suggested assessment record

Use one record for each scenario and each requested counterfactual:

```markdown
### Scenario: `<scenario-key>`
- Counterfactual: `<absent|other-present>`
- Premise applied: `<quote the applicable premise without alteration>`
- Source-visible authorization evidence:
  - File:
  - Symbol or handler segment:
  - Lines:
  - Relevant check or control-flow observation:
- Evidence dependencies:
  - `<dependency or none>`
- Source-visible authorization assessment:
  - `<describe only what the inspected source establishes>`
- Accepted-policy comparison:
  - `<compare the source-visible result with the public policy, without changing the premise>`
- Uncertainty or missing evidence:
  - `<none or explicitly stated limitation>`
```

## Preservation requirements

The assessment must preserve the following public values without modification:

- **Original policy:** Creating a note requires the stated global permissions and either document ownership or an object change_document grant; an object view grant alone is insufficient.
- **Changed policy:** Creating a note requires the stated global permissions and either document ownership or an object change_document grant; an object view grant alone is insufficient.
- **Original expectations:**
  - `view-only`: `deny`
  - `change-granted`: `allow`
- **Changed expectations:**
  - `view-only`: `deny`
  - `change-granted`: `allow`
- **Requested change:** Change only both object-relation premise statements to their `changedPremise` values. Preserve source bytes/ref, task ID, policy, expectations, identities, relations, conditions, and requested counterfactuals. Do not infer another task change.