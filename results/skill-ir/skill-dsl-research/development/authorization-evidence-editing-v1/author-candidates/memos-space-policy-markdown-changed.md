# Authorization Assessment Instructions

Assess the two scenarios below at entry to `DeleteSpaceMember`. Treat all stated scenario facts as premises. Do not execute the target, infer runtime configuration, or assume deployment facts.

## Scope and method

For each scenario:

1. **Source-visible authorization**
   - Trace only the supplied fixed-ref source.
   - Begin at `DeleteSpaceMember`.
   - Assume `resolveSpaceMemberResource` succeeds, as stated in the premise.
   - Determine whether the handler’s visible authorization checks permit or reject the requested removal.
   - Keep authorization distinct from whether the later store mutation succeeds.
   - Explain how the caller/target identity comparison and any role requirement affect the result.

2. **Accepted-policy assessment**
   - Independently apply the accepted changed policy below.
   - State whether the operation is permitted or denied by that policy.
   - Do not reinterpret or rewrite the policy to match the implementation.
   - Review both policy-linked expectations explicitly, including the unchanged expectation that a member may leave by deleting their own membership.

3. **Comparison**
   - Compare the source-visible result with the accepted-policy result.
   - Classify them as aligned or divergent.
   - If divergent, state precisely which operation is over-permitted or over-restricted.

## Accepted changed policy

> An active space member may delete their own membership and may remove a different active member of the same space without space administrator authority.

This policy is task-author-supplied and must be analyzed separately from observed source behavior. The self-leave expectation remains unchanged: an active member may delete their own membership to leave. The changed expectation is that removing a different active member does not require space administrator authority.

## Scenarios

### `self-leave`

- **Principal:** authenticated active ordinary non-administrator member
- **Relation:** caller-is-target-member
- **Operation:** delete own membership
- **Premise ID:** `target-relation`
- **Premise:** At handler entry, the active ordinary non-administrator caller targets their own active membership in the selected space, and resolveSpaceMemberResource succeeds.

### `other-member`

- **Principal:** authenticated active ordinary non-administrator member
- **Relation:** caller-is-not-target-member-and-not-admin
- **Operation:** delete another active membership
- **Premise ID:** `target-relation`
- **Premise:** At handler entry, the active ordinary non-administrator caller targets a different active member in the same space, and resolveSpaceMemberResource succeeds.

## Required source citations

Use exact file-and-line citations from the supplied source, in the form `` `server/api/v1/space_service.go:740-763` ``. Cite the specific lines supporting each material source claim, including as applicable:

- Administrator-role requirement: `server/api/v1/space_service.go:54-58`
- Resource resolution and active target-membership validation: `server/api/v1/space_service.go:632-662`
- Current-user requirement and resource-resolution call: `server/api/v1/space_service.go:742-749`
- Caller/target identity comparison: `server/api/v1/space_service.go:750`
- Conditional authorization branch: `server/api/v1/space_service.go:751-755`
- Subsequent membership deletion and completion: `server/api/v1/space_service.go:756-763`

Do not cite repository files, line ranges, or behavior outside the supplied excerpts. Do not present scenario premises as if they were established by source citations.

## Required output structure

For each scenario key, provide:

- **Premise**
- **Source-visible authorization**
- **Source analysis**, with exact citations
- **Accepted-policy authorization**
- **Policy rationale**
- **Comparison:** aligned or divergent

Conclude with a concise two-row comparison table containing:

| Scenario key | Source-visible result | Accepted-policy result | Alignment |
|---|---|---|---|

Keep observed implementation behavior and accepted-policy judgment explicitly separated throughout.
