<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task fastapi-policy-change, expressed with source-authorization-assessment/v0. Assess the supplied item handlers against the accepted original policy and request a change that preserves owner-only access for authenticated non-superusers while allowing authenticated active superusers to read or modify any item.
Assess repository https://github.com/fastapi/full-stack-fastapi-template at source ref cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:original-policy is a explicit-task-requirement at author-neutral-briefs.json#/packages/0/originalPolicy, revision original.
  Policy text: An authenticated non-superuser may read or modify only items they own. An authenticated active superuser may read or modify an item regardless of owner.
  Acceptance is accepted; accepting actor role: task-author; reason: This is the task author's fixed policy and must be assessed independently of implementation behavior.

The principals are:
- principal:active-non-superuser has role authenticated active non-superuser. Author facts: ["current_user is authenticated and active","current_user.is_superuser is false"]
  Starting capabilities: May read or modify only owned items under the accepted policy.
- principal:active-superuser has role authenticated active superuser. Author facts: ["current_user is authenticated and active","current_user.is_superuser is true"]
  Starting capabilities: May read or modify items regardless of owner under the accepted policy.

The resources are:
- resource:existing-item is a item. Author facts: ["The item exists at handler entry","The item's owner_id may differ from current_user.id"]

The declared source entries are:
- entry:read-item-handler names read_item handler entry.
  Source location: items.py, startLine 49, endLine 58.
- entry:update-item-handler names update_item handler entry.
  Source location: items.py, startLine 76, endLine 96.

The authorization obligations are:
- scenario:foreign-update: principal principal:active-non-superuser, resource resource:existing-item, relation item is owned by another user, operation modify existing item, expected policy disposition deny.
  Policy source: policy:original-policy. Declared entries: entry:update-item-handler.
  Conditions: none declared.
- scenario:superuser-read: principal principal:active-superuser, resource resource:existing-item, relation item is owned by another user, operation read existing item, expected policy disposition allow.
  Policy source: policy:original-policy. Declared entries: entry:read-item-handler.
  Conditions: none declared.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
Allowed decision kinds: observed for allow/deny expectations; conditional-policy for conditional expectations.

## Public analysis questions
Use only the supplied items.py source crop. Evaluate the accepted policy at the declared handler entry under the stated task assumptions; do not treat scenario premises as proof of upstream injection or infer unavailable deployment behavior. Keep the assessment to the two supplied scenarios and identify the requested policy-preserving change without consulting an evaluator.

## Explicit assessment program
- Current question scenario%3Aforeign-update::entry%3Aupdate-item-handler at entry:update-item-handler; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): foreign-owner: At entry, current_user is the stated active non-superuser and the existing item's owner differs from current_user.id..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: State the policy judgment for changing the foreign-owned existing item.; Request the change needed to preserve the accepted owner restriction..
- Current question scenario%3Asuperuser-read::entry%3Aread-item-handler at entry:read-item-handler; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): active-superuser-foreign-item: At entry, current_user is the stated authenticated active superuser and the existing item's owner differs from current_user.id..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: State the policy judgment for reading the foreign-owned existing item.; Request that active superusers retain policy-authorized access regardless of owner..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aforeign-update::entry%3Aupdate-item-handler
- scenario%3Asuperuser-read::entry%3Aread-item-handler
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
