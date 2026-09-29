# Authorization Assessment Authoring Task

Complete only the unknown domain dictionaries and `analysisContract` in the supplied `authorization-assessment-authoring/v2` draft. Do not modify host-known fields, source bytes, identities, task ID, entry, or file scope.

## Source identity

- **Task ID:** `al-use-memos-members`
- **Repository:** `https://github.com/usememos/memos`
- **Source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Source root:** `../../../../authorization-evidence-editing-v1/public-source/memos`
- **Allowed files:**
  - `server/api/v1/space_service.go`
  - `store/space.go`

## Analysis entry

Declare only this entry:

- **Entry key:** `delete-member`
- **Path:** `server/api/v1/space_service.go`
- **Start line:** `740`
- **End line:** `763`

Helpers are evidence-request dependencies, not additional entries. An empty dependency list with `discover=true` is supported. Do not author all helper positions.

## Request

> At DeleteSpaceMember handler entry, compare removal of the caller's own active membership with removal of a different active member's membership in the same space. Assume resource resolution succeeds. Report source-visible authorization and the accepted-policy comparison separately.

## Domain dictionaries

Use exactly these named keys:

- Policy key: `rule`
- Principal key: `caller`
- Resource key: `target`
- Scenario keys:
  - `self-leave`
  - `other-member`

Populate only explicit public facts. Do not infer source outcomes, owner facts, or additional authorization obligations.

### Policy

The original accepted policy was:

> An active space member may delete their own membership to leave. Removing a different active member requires space administrator authority.

The current changed accepted policy is:

> An active space member may delete their own membership and may remove a different active member of the same space without space administrator authority.

Retain these policy locations:

- **Original:** `author-briefs.json#/memos-space-policy/originalPolicy`
- **Changed:** `author-briefs.json#/memos-space-policy/changedPolicy`

Treat the changed policy as the current accepted policy. Do not treat either policy text as evidence of source behavior.

### Principal

Define `caller` from the supplied scenarios as an authenticated active ordinary non-administrator member. Do not add roles, ownership, or administrator authority.

### Resource

Define `target` as the active space membership selected for deletion in the same space. The scenario relation determines whether it belongs to the caller or a different active member.

## Scenario obligations

Review both policy-linked scenarios explicitly, including the unchanged expectation for `self-leave`.

### `self-leave`

- **Principal:** `authenticated active ordinary non-administrator member`
- **Relation:** `caller-is-target-member`
- **Operation:** `delete own membership`
- **Premise ID:** `target-relation`
- **Premise:** `At handler entry, the active ordinary non-administrator caller targets their own active membership in the selected space, and resolveSpaceMemberResource succeeds.`
- **Original-policy expectation:** `allow`
- **Changed/current-policy expectation:** `allow`

### `other-member`

- **Principal:** `authenticated active ordinary non-administrator member`
- **Relation:** `caller-is-not-target-member-and-not-admin`
- **Operation:** `delete another active membership`
- **Premise ID:** `target-relation`
- **Premise:** `At handler entry, the active ordinary non-administrator caller targets a different active member in the same space, and resolveSpaceMemberResource succeeds.`
- **Original-policy expectation:** `deny`
- **Changed/current-policy expectation:** `allow`

## Analysis contract

Require the eventual assessment to evaluate both `self-leave` and `other-member` at the `delete-member` handler entry and report these dimensions separately:

1. **Source-visible authorization:** Determine each scenario’s result from evidence in the unchanged source implementation. Do not use the original or changed policy text as evidence of source behavior.
2. **Accepted-policy comparison:** Compare each scenario separately against:
   - the original accepted policy and its expectation; and
   - the changed/current accepted policy and its expectation.

Explicitly review both changed-policy expectations:

- `self-leave`: `allow`, unchanged from the original policy.
- `other-member`: `allow`, changed from the original policy’s `deny`.

The source implementation, source identity, identities, relations, operations, and premise text are unchanged between policy variants. Do not pre-author or infer any source-visible result.

Retain:

- **Variant:** `changed`
- **Requested counterfactuals:** `[]`

Do not add counterfactuals, owner assumptions, extra scenarios, extra entries, or obligations beyond the two supplied scenarios.