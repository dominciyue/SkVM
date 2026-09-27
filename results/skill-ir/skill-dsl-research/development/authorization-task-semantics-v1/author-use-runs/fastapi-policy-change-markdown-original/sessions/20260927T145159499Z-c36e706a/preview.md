<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
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


## Public analysis questions
Assess each current question at its stated handler-entry boundary using the fixed supplied source and accepted policy. Treat the entry premise as given, not as proof about upstream binding. Distinguish observed control flow from the accepted policy and cite decisive source lines. Do not execute the target or infer unsupplied deployment facts.

## Explicit assessment program
- Current question scenario%3Aforeign-update::entry%3Aupdate at entry:update; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): entry-premise: At entry, current_user is the stated active non-superuser and the existing item's owner differs from current_user.id..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Separate the accepted policy from observed source behavior and do not assert upstream principal binding from this handler crop..
- Current question scenario%3Asuperuser-read::entry%3Aread at entry:read; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): entry-premise: At entry, current_user is the stated authenticated active superuser and the existing item's owner differs from current_user.id..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Separate the accepted policy from observed source behavior and do not assert upstream principal binding from this handler crop..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aforeign-update::entry%3Aupdate
- scenario%3Asuperuser-read::entry%3Aread
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: items.py =====
Source ID: src-dcbab1685696c702
Location note: crop lines 1-113; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | import uuid
2 | from typing import Any
3 | 
4 | from fastapi import APIRouter, HTTPException
5 | from sqlmodel import col, func, select
6 | 
7 | from app.api.deps import CurrentUser, SessionDep
8 | from app.models import Item, ItemCreate, ItemPublic, ItemsPublic, ItemUpdate, Message
9 | 
10 | router = APIRouter(prefix="/items", tags=["items"])
11 | 
12 | 
13 | @router.get("/", response_model=ItemsPublic)
14 | def read_items(
15 |     session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
16 | ) -> Any:
17 |     """
18 |     Retrieve items.
19 |     """
20 | 
21 |     if current_user.is_superuser:
22 |         count_statement = select(func.count()).select_from(Item)
23 |         count = session.exec(count_statement).one()
24 |         statement = (
25 |             select(Item).order_by(col(Item.created_at).desc()).offset(skip).limit(limit)
26 |         )
27 |         items = session.exec(statement).all()
28 |     else:
29 |         count_statement = (
30 |             select(func.count())
31 |             .select_from(Item)
32 |             .where(Item.owner_id == current_user.id)
33 |         )
34 |         count = session.exec(count_statement).one()
35 |         statement = (
36 |             select(Item)
37 |             .where(Item.owner_id == current_user.id)
38 |             .order_by(col(Item.created_at).desc())
39 |             .offset(skip)
40 |             .limit(limit)
41 |         )
42 |         items = session.exec(statement).all()
43 | 
44 |     items_public = [ItemPublic.model_validate(item) for item in items]
45 |     return ItemsPublic(data=items_public, count=count)
46 | 
47 | 
48 | @router.get("/{id}", response_model=ItemPublic)
49 | def read_item(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
50 |     """
51 |     Get item by ID.
52 |     """
53 |     item = session.get(Item, id)
54 |     if not item:
55 |         raise HTTPException(status_code=404, detail="Item not found")
56 |     if not current_user.is_superuser and (item.owner_id != current_user.id):
57 |         raise HTTPException(status_code=403, detail="Not enough permissions")
58 |     return item
59 | 
60 | 
61 | @router.post("/", response_model=ItemPublic)
62 | def create_item(
63 |     *, session: SessionDep, current_user: CurrentUser, item_in: ItemCreate
64 | ) -> Any:
65 |     """
66 |     Create new item.
67 |     """
68 |     item = Item.model_validate(item_in, update={"owner_id": current_user.id})
69 |     session.add(item)
70 |     session.commit()
71 |     session.refresh(item)
72 |     return item
73 | 
74 | 
75 | @router.put("/{id}", response_model=ItemPublic)
76 | def update_item(
77 |     *,
78 |     session: SessionDep,
79 |     current_user: CurrentUser,
80 |     id: uuid.UUID,
81 |     item_in: ItemUpdate,
82 | ) -> Any:
83 |     """
84 |     Update an item.
85 |     """
86 |     item = session.get(Item, id)
87 |     if not item:
88 |         raise HTTPException(status_code=404, detail="Item not found")
89 |     if not current_user.is_superuser and (item.owner_id != current_user.id):
90 |         raise HTTPException(status_code=403, detail="Not enough permissions")
91 |     update_dict = item_in.model_dump(exclude_unset=True)
92 |     item.sqlmodel_update(update_dict)
93 |     session.add(item)
94 |     session.commit()
95 |     session.refresh(item)
96 |     return item
97 | 
98 | 
99 | @router.delete("/{id}")
100 | def delete_item(
101 |     session: SessionDep, current_user: CurrentUser, id: uuid.UUID
102 | ) -> Message:
103 |     """
104 |     Delete an item.
105 |     """
106 |     item = session.get(Item, id)
107 |     if not item:
108 |         raise HTTPException(status_code=404, detail="Item not found")
109 |     if not current_user.is_superuser and (item.owner_id != current_user.id):
110 |         raise HTTPException(status_code=403, detail="Not enough permissions")
111 |     session.delete(item)
112 |     session.commit()
113 |     return Message(message="Item deleted successfully")
===== END ALLOWED INPUT: items.py =====
