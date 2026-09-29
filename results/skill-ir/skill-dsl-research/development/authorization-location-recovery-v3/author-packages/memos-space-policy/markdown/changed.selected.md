# Assessment Instructions

## Task metadata

- **Task ID:** `al-use-memos-members`
- **Task kind:** `policy-change`
- **Variant:** `changed`
- **Repository:** `https://github.com/usememos/memos`
- **Original source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Changed source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Original source root:** `../authorization-evidence-editing-v1/public-source/memos`
- **Changed source root:** `../authorization-evidence-editing-v1/public-source/memos`
- **Allowed files:**
  - `server/api/v1/space_service.go`
  - `store/space.go`
- **Analysis entry:**
  - **Entry key:** `delete-member`
  - **Path:** `server/api/v1/space_service.go`
  - **Lines:** `740–763`
- **Source implementation status:** unchanged between the original and changed refs.

## Public policy context

### Original policy

> An active space member may delete their own membership to leave. Removing a different active member requires space administrator authority.

### Changed policy

> An active space member may delete their own membership and may remove a different active member of the same space without space administrator authority.

Assess the source-visible behavior against the **changed variant**. The source implementation is unchanged, so inspect the same source and report what it visibly establishes. Do not assume that the source implements either policy. Keep source-visible authorization separate from comparison with the changed accepted policy.

The requested policy change affects only the accepted space-member removal policy. Preserve the source bytes, source refs, task ID, scenario identities, relation labels, premise text, and requested entry.

## Scenarios

Use the following scenario keys and premises exactly as written. Do not alter identities, relations, operations, or premise text.

### `self-leave`

- **Principal:** authenticated active ordinary non-administrator member
- **Relation:** caller-is-target-member
- **Operation:** delete own membership
- **Premise ID:** `target-relation`
- **Premise:**

  > At handler entry, the active ordinary non-administrator caller targets their own active membership in the selected space, and resolveSpaceMemberResource succeeds.

### `other-member`

- **Principal:** authenticated active ordinary non-administrator member
- **Relation:** caller-is-not-target-member-and-not-admin
- **Operation:** delete another active membership
- **Premise ID:** `target-relation`
- **Premise:**

  > At handler entry, the active ordinary non-administrator caller targets a different active member in the same space, and resolveSpaceMemberResource succeeds.

## Source inspection guidance

1. Initialize the assessment using the specified repository, source ref, source root, allowed files, task ID, and entry key.
2. Treat `server/api/v1/space_service.go:740–763` as the sole requested handler entry.
3. Trace only the authorization-relevant calls and conditions needed to evaluate the two scenarios.
4. Request helper evidence through dependencies rather than authoring helper positions directly.
5. An empty dependency list with `discover=true` is valid when helper locations should be discovered from the requested entry.
6. Use `store/space.go` only when it is needed to establish source-visible authorization behavior.
7. Record file paths and line ranges for each material source observation.
8. Do not infer permissions from names, comments, policy text, or expected outcomes when the source does not establish them.
9. Do not invent runtime state, identities, helper behavior, or domain facts beyond the stated premises.
10. Do not modify source bytes, scenario identities, relation labels, premise text, or task ID.
11. Do not treat the changed policy as evidence about what the source does.
12. Explicitly assess both policy-linked scenarios, including the unchanged `self-leave` expectation under the changed policy.

## Support-role constraint

Declare only the following requested handler as an analysis entry:

```text
server/api/v1/space_service.go:740–763
```

Do not author all helper positions. Helpers must be represented as evidence-request dependencies. Use:

```text
dependencies: []
discover: true
```

when no helper positions are being explicitly declared.

## Required reporting

Report the two dimensions separately for each scenario:

1. **Source-visible authorization**
   - State only what the inspected source establishes for the scenario.
   - Cite the relevant source locations.
   - If the source does not establish a conclusion, say so rather than filling the gap with an assumption.

2. **Accepted-policy comparison**
   - Compare the source-visible result with the applicable **changed-policy** requirement.
   - Keep this comparison separate from the source observation.
   - Do not replace source evidence with the policy expectation.
   - For `self-leave`, preserve the changed policy’s allow expectation.
   - For `other-member`, apply the changed policy’s allow expectation without adding administrator authority as a requirement.

Preserve the scenario keys exactly:

- `self-leave`
- `other-member`

## Reusable result structure

```markdown
# Authorization assessment

## Source and scope

- Task ID: `al-use-memos-members`
- Variant: `changed`
- Entry: `server/api/v1/space_service.go:740–763`
- Dependencies: `<list requested or discovered helper evidence>`
- Files inspected: `<paths and line ranges>`

## Scenario: `self-leave`

### Premise

> At handler entry, the active ordinary non-administrator caller targets their own active membership in the selected space, and resolveSpaceMemberResource succeeds.

### Source-visible authorization

- Result: `<derived from source; do not assume>`
- Evidence:
  - `<path>:<lines>` — `<source observation>`
- Gaps or limits:
  - `<state any unresolved source limitation, or “None”>`

### Accepted-policy comparison

- Applicable changed-policy rule:
  - An active space member may delete their own membership.
- Comparison: `<derived comparison>`
- Policy-linked conclusion: `<derived conclusion>`

## Scenario: `other-member`

### Premise

> At handler entry, the active ordinary non-administrator caller targets a different active member in the same space, and resolveSpaceMemberResource succeeds.

### Source-visible authorization

- Result: `<derived from source; do not assume>`
- Evidence:
  - `<path>:<lines>` — `<source observation>`
- Gaps or limits:
  - `<state any unresolved source limitation, or “None”>`

### Accepted-policy comparison

- Applicable changed-policy rule:
  - An active space member may remove a different active member of the same space without space administrator authority.
- Comparison: `<derived comparison>`
- Policy-linked conclusion: `<derived conclusion>`

## Counterfactuals

- Requested counterfactuals: none.
- Do not add counterfactual scenarios.
```

## Validation checklist

Before finalizing the assessment, verify that:

- The source refs and task ID are unchanged.
- The variant is identified as `changed`.
- Only the requested handler is declared as an analysis entry.
- Helper evidence is requested through dependencies or discovery.
- Both scenario keys are present exactly as specified.
- Both premise texts are reproduced exactly.
- The `self-leave` and `other-member` cases are assessed separately.
- Source-visible authorization and accepted-policy comparison are separate sections.
- The changed policy, rather than the original policy, is used for accepted-policy comparison.
- The unchanged self-leave expectation is explicitly reviewed.
- The changed other-member expectation is explicitly reviewed.
- Every source claim has a file-and-line citation where applicable.
- No authorization outcome was assumed without source evidence.
- No domain facts, helper behavior, or runtime state were invented.
- No counterfactuals were added.
- No source files or task inputs were edited.