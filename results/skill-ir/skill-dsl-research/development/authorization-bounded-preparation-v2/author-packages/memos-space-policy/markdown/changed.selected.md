# Authorization Assessment Task: Delete Space Member

## Repository and source

- **Repository:** `https://github.com/usememos/memos`
- **Source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Source root:** `../../../../authorization-evidence-editing-v1/public-source/memos`
- **Allowed files:**
  - `server/api/v1/space_service.go`
  - `store/space.go`
- **Source implementation:** unchanged for this task.
- **Task ID:** `ak-use-memos-members`

This is a policy-only change. Change only the accepted space-member removal policy and its policy-linked expectations. Preserve the source bytes, identities, relations, operations, premise text, task ID, and all unaffected content.

## Requested analysis entry

Analyze only the following requested handler:

- **Handler:** `DeleteSpaceMember`
- **File:** `server/api/v1/space_service.go`
- **Original range:** lines `740–763`
- **Entry key:** `delete-member`

Do not author helper positions as analysis entries. Helpers called by the handler belong in evidence-request dependencies. An empty dependency list with discovery enabled is acceptable.

## Accepted policy

> An active space member may delete their own membership and may remove a different active member of the same space without space administrator authority.

## Scenarios

Assess both scenarios explicitly. Preserve the identities, relations, operations, and premise text exactly.

### `self-leave`

- **Principal:** authenticated active ordinary non-administrator member
- **Relation:** caller-is-target-member
- **Operation:** delete own membership
- **Premise ID:** `target-relation`
- **Premise:**

> At handler entry, the active ordinary non-administrator caller targets their own active membership in the selected space, and resolveSpaceMemberResource succeeds.

- **Policy expectation:** `allow`

### `other-member`

- **Principal:** authenticated active ordinary non-administrator member
- **Relation:** caller-is-not-target-member-and-not-admin
- **Operation:** delete another active membership
- **Premise ID:** `target-relation`
- **Premise:**

> At handler entry, the active ordinary non-administrator caller targets a different active member in the same space, and resolveSpaceMemberResource succeeds.

- **Policy expectation:** `allow`

## Required assessment

At the `DeleteSpaceMember` handler entry, compare the two scenarios separately.

### 1. Source-visible authorization

For each scenario:

- Trace the visible control flow from handler entry through the returned outcome.
- Identify the relevant authorization checks and the conditions under which they execute.
- Describe the resulting source-visible authorization decision.
- Cite the source file and exact relevant line ranges.
- Treat the supplied premise that `resolveSpaceMemberResource` succeeds as given.
- Do not infer or report helper behavior beyond what is necessary to use that supplied premise.

### 2. Accepted-policy comparison

For each scenario:

- State the policy expectation listed above.
- Compare it separately with the source-visible authorization result.
- Report whether the observed result matches the accepted policy.
- Keep the policy comparison distinct from the source observation.
- Distinguish authorization control from the later mutation/effect path, including the call that deletes the membership and the subsequent event publication.
- Do not supply conclusions in the task definition itself; conclusions must be produced by the assessment.

For each scenario, report:

- the scenario key;
- the source citation(s);
- the source-visible authorization result;
- the accepted-policy expectation;
- whether the observed result matches the accepted policy;
- the relevant authorization-control/effect-path distinction.

## Scope and preservation requirements

- Make only the requested local policy edit from the original policy to the accepted policy above.
- Explicitly review both policy-linked expectations, including the unchanged `self-leave` expectation.
- Keep the source implementation unchanged.
- Do not change source files.
- Do not propose an additional policy change.
- Do not author helper positions as analysis entries.
- Preserve the exact scenario identities, relations, operations, premise IDs, and premise statements.
- Preserve the requested handler, file, original line range, entry key, repository, source ref, source root, allowed files, and task ID.
- Return the completed Markdown task instructions, not an authorization-analysis answer.