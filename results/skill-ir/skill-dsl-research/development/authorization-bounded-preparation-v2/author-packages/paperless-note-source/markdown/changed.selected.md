# Paperless-ngx Notes POST Authorization Task

## Repository and source

- **Repository:** `https://github.com/paperless-ngx/paperless-ngx`
- **Original source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Changed source ref:** `synthetic-ak-change-grants-disabled-v1-6c01553267afcf78`
- **Use for this task:** the supplied synthetic source copy at the changed source ref
- **Allowed files:**
  - `src/documents/views.py`
  - `src/documents/permissions.py`
- **Requested analysis entry:** the `notes` handler’s POST path
- **File and original range:** `src/documents/views.py`, lines `1841–1913`
- **Handler:** `notes(self, request, pk=None)`

Analyze only the requested handler as the primary analysis entry. Permission helpers and other supporting definitions belong in evidence-request dependencies. Do not author helper positions as additional analysis entries. An empty dependency list with discovery enabled is acceptable when appropriate.

## Accepted policy

> Creating a note requires the stated global permissions and object-level change_document authorization; a view grant alone is insufficient, while document ownership or an object change grant can satisfy the object control.

## Task

At the notes POST handler, assess whether `Note.objects.create` is reached for each scenario below. Both callers are authenticated and hold the stated global `add_note`, `view_document`, and `change_document` permissions. Both callers can view the document. Use the declared object relation in each scenario.

For each scenario:

1. Trace the relevant authorization checks in the requested handler.
2. Request or cite helper evidence as needed, without treating helper positions as additional authored analysis entries.
3. Determine whether execution reaches `Note.objects.create`.
4. Cite the relevant source locations.
5. Compare the accepted policy with the observed authorization control and resulting effect.
6. Separate the policy expectation from the observed source control and effect.
7. Do not infer facts beyond the stated scenario premise.

## Scenarios

### `view-only`

**Principal:** authenticated user with the stated global permissions

**Relation:** `object-view-granted-not-owner-no-change-grant`

**Operation:** create a note on the document

**Premise:**

> At handler entry, the caller has the stated global permissions and object view grant, but is not the document owner and has no object change_document grant.

**Policy expectation:** `deny`

### `change-granted`

**Principal:** authenticated user with the stated global permissions

**Relation:** `object-change-granted-not-owner`

**Operation:** create a note on the document

**Premise:**

> At handler entry, the caller has the stated global permissions and object view and change_document grants, but is not the document owner.

**Policy expectation:** `allow`

## Required source evidence

Cite source locations for:

- the document view authorization check;
- the POST-specific change authorization check;
- the `Note.objects.create` call;
- any owner-aware permission helper behavior relied upon.

Keep helper evidence in evidence-request dependencies rather than authoring helper positions as separate analysis entries.

## Required reporting

For each scenario, report separately:

- the stated policy expectation;
- the relevant authorization checks in the requested handler;
- the observed source control;
- whether `Note.objects.create` is reached;
- the resulting effect;
- the comparison between the accepted policy and the observed control/effect;
- precise source citations.

Do not provide either scenario’s observed answer in these task instructions. Do not alter, reinterpret, or weaken the premises. Keep the analysis scoped to the requested notes POST handler and the evidence required to evaluate it.

## Changed-source preparation

Use the supplied synthetic source copy and its new source ref:

- **Source ref:** `synthetic-ak-change-grants-disabled-v1-6c01553267afcf78`
- **Source root:** `../../../author-source/paperless-synthetic`

Make the requested local source change by using the supplied changed source. Preserve all unaffected content. The changed source modifies only the owner-aware permission helper so that non-owner `change_document` object grants are no longer honored. Do not modify the accepted policy, scenario premises or relations, policy expectations, identities, or task ID. A complete edited file is allowed if needed.

Re-prepare the changed source, compare it with the original session, and run the changed source fresh. Preparation must not be treated as execution of target code. Do not answer the scenarios in the authored instructions.