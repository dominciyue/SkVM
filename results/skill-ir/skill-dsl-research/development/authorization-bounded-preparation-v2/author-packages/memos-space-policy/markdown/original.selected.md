# Authorization Assessment Task: Delete Space Member

## Repository and source

- **Repository:** `https://github.com/usememos/memos`
- **Source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Source root:** `../../../../authorization-evidence-editing-v1/public-source/memos`
- **Allowed files:**
  - `server/api/v1/space_service.go`
  - `store/space.go`
- **Source implementation:** unchanged for this task.

## Requested analysis entry

Analyze only the following requested handler:

- **Handler:** `DeleteSpaceMember`
- **File:** `server/api/v1/space_service.go`
- **Range:** lines `740–763`
- **Entry key:** `delete-member`

Do not author helper positions as analysis entries. Helpers called by the handler belong in evidence-request dependencies. An empty dependency list with discovery enabled is acceptable.

## Accepted policy

> An active space member may delete their own membership to leave. Removing a different active member requires space administrator authority.

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

- **Policy expectation:** `deny`

## Required assessment

At the `DeleteSpaceMember` handler entry, compare the two scenarios separately:

1. **Source-visible authorization**
   - Trace the visible control flow from handler entry through the returned outcome.
   - Identify the relevant authorization checks and the conditions under which they execute.
   - Describe the resulting source-visible decision for each scenario.
   - Cite the source file and exact relevant line ranges.

2. **Accepted-policy comparison**
   - Compare the source-visible decision for each scenario with the corresponding accepted-policy expectation.
   - Report the policy comparison separately from the source observation.
   - Do not infer or report helper behavior beyond what is necessary to state that resource resolution succeeds under the supplied premises.
   - Distinguish authorization control from the later mutation/effect path.

For each scenario, report:

- the scenario key;
- the source citation(s);
- the source-visible authorization result;
- the accepted-policy expectation;
- whether the observed result matches the accepted policy;
- the relevant control/effect distinction.

Do not change the source files or propose a policy change. Do not supply conclusions in the task definition itself; conclusions must be produced by the assessment.