# Fixed-Source Authorization Assessment

Assess the authorization behavior of the specified handler using only the repository source at the fixed reference below and the separately supplied common public requirements paragraph. Do not rely on later or earlier revisions, undocumented assumptions, an answer key, or any DSL draft.

- **Repository:** https://github.com/usememos/memos
- **Fixed source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Source entry:** `server/api/v1/space_service.go:740-763`
- **Boundary:** `declared-entry`

## Accepted policy

A space member may delete their own membership to leave. Removing a different member requires space administrator authority.

## Question

At `DeleteSpaceMember` handler entry, may an authenticated active ordinary member delete their own active membership, and may the same non-administrator delete a different active member's membership in that space? Assume resource resolution succeeds and compare the two requested targets.

## Premises

1. At `DeleteSpaceMember` entry, the active ordinary member targets their own active membership, and `resolveSpaceMemberResource` succeeds.
2. For the second scenario, the same active ordinary non-administrator targets a different active member in the same space, and resource resolution succeeds.

## Required analysis and response

- Inspect and cite only the relevant behavior available from the fixed source entry and its directly necessary surrounding source at the fixed ref.
- Apply the separately supplied common public requirements paragraph without quoting it verbatim.
- Analyze the two target cases separately and compare them.
- Explain the self-membership exception and the separate administrator check required when the target is a different member.
- Do not assume that the caller is an administrator.
- State the resulting authorization determination for each scenario, identifying the source condition or branch that supports it.
- Do not invent source facts, unstated premises, or behavior outside the declared-entry boundary.
