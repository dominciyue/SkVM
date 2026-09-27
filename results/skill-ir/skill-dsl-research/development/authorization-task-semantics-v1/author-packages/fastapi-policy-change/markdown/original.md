# Assessment instructions: `fastapi-policy-change`

## Scope and evidence boundary

Assess only the supplied source crop from `items.py` at fixed ref `cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7`. The crop is the only code evidence available.

Use these source locations:

- `read_item` handler: `items.py:48–58`
- `read_item` item lookup and missing-item branch: `items.py:53–55`
- `read_item` authorization condition: `items.py:56–57`
- `update_item` handler: `items.py:75–96`
- `update_item` item lookup and missing-item branch: `items.py:86–88`
- `update_item` authorization condition: `items.py:89–90`
- `update_item` mutation and persistence: `items.py:91–96`

Do not infer behavior from files, dependencies, routes, models, authentication implementation, database configuration, or tests that are not included in the crop.

For both scenarios, the analysis boundary is `declared-entry`: begin with the stated conditions at handler entry and follow only the shown handler path. Treat the stated entry premise as given. Do not replace it with assumptions about how the request reached the handler.

## Accepted policy

Evaluate the implementation against this policy without changing or weakening it:

> An authenticated non-superuser may read or modify only items they own. An authenticated active superuser may read or modify an item regardless of owner.

Clearly distinguish:

1. **Policy requirement** — what the accepted policy permits or forbids.
2. **Observed handler behavior** — what the supplied lines do under the scenario’s entry premise.
3. **Assessment** — whether the observed behavior conforms to the policy.
4. **Requested change** — any implementation change required to make the handler conform, with relevant source locations.

Do not present either scenario’s conclusion as part of these instructions, and do not consult or reproduce an answer key.

## Scenario 1: foreign update

- **ID:** `foreign-update`
- **Question:** At `update_item` handler entry, can an authenticated active non-superuser change an existing item owned by another user?
- **Entry premise:** At entry, `current_user` is the stated active non-superuser and the existing item’s owner differs from `current_user.id`.
- **Boundary:** `declared-entry`

Assess the path beginning at `update_item` in `items.py:75–96`. Account for the item lookup, the missing-item branch, the authorization check, and the subsequent update and commit operations. Cite the exact lines used for the assessment. State the requested change, if any, in terms of the relevant handler behavior and source location, without altering the accepted policy.

## Scenario 2: superuser read

- **ID:** `superuser-read`
- **Question:** At `read_item` handler entry, can an authenticated active superuser read an existing item owned by another user?
- **Entry premise:** At entry, `current_user` is the stated authenticated active superuser and the existing item’s owner differs from `current_user.id`.
- **Boundary:** `declared-entry`

Assess the path beginning at `read_item` in `items.py:48–58`. Account for the item lookup, the missing-item branch, the authorization check, and the returned item. Cite the exact lines used for the assessment. State the requested change, if any, in terms of the relevant handler behavior and source location, without altering the accepted policy.

## Required response format

Provide exactly two independently reasoned scenario sections, one for each scenario. In each section include:

- Scenario ID and question
- Entry premise and analysis boundary
- Applicable accepted-policy rule
- Observed handler behavior, with source line references
- Assessment of conformity with the policy
- Requested change, if any, with source location

Do not merge the scenarios, add unshown code behavior, rewrite the accepted policy, or provide analysis outside the supplied crop.
