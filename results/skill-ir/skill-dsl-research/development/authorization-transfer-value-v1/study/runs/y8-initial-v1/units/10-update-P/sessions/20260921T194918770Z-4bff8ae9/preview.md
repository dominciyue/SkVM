<!-- analysis-profile: task-supplied; origin: input; study-arm: P; condition-analysis: disabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task fastapi-items-foreign-update, expressed with source-authorization-assessment/v0. Determine whether an authenticated non-superuser can update an item owned by another user through PUT /items/{id}.
Assess repository https://github.com/fastapi/full-stack-fastapi-template at source ref cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- item-owner-or-superuser-policy is a study-task-author-policy-from-public-route-contract at task.json#/normativePolicy, revision authorization-public-task-material/v1@cb740b6.
  Policy text: An authenticated non-superuser may read or modify only items they own. An authenticated active superuser may read or modify an item regardless of owner.
  Acceptance is accepted; accepting actor role: study-task-author; reason: The task author accepts this bounded policy for the source assessment.

The principals are:
- authenticated-non-superuser has role authenticated non-superuser. A current user whose id differs from the selected item's owner_id.
  Starting capabilities: authenticated.

The resources are:
- foreign-item is a persisted-item. An existing item whose owner_id belongs to another user.

The declared source entries are:
- put-item-by-id names PUT /items/{id}.
  Source location: items.py, startLine 75, endLine 96.

The authorization obligations are:
- deny-non-superuser-foreign-update: principal authenticated-non-superuser, resource foreign-item, relation non-owner-without-superuser-role, operation update-item, expected policy disposition deny.
  Policy source: item-owner-or-superuser-policy. Declared entries: put-item-by-id.
  Condition item-exists: The bounded task fixes an existing foreign item.

Scope assurance: The fixed item route exposes the caller, item lookup, ownership/role branch, and protected update effect for the declared entry.
Required analysis:
- bind the current principal, item owner, role branch, and requested operation
- trace the entry through the strongest visible ownership or role control to the protected effect
- distinguish the ordinary-owner rule from the superuser override
- state any source-external fact that would be needed rather than inferring it
Constraints:
- Use only task.json and items.py as model-visible inputs.
- Do not execute the target project or contact a deployment.
Allowed conclusions: source_supported_failure, source_refuted, unknown.

## Public analysis questions
- Which visible route or dependency condition gates the declared item entry before its authorization branch?
- How is the declared principal bound to current_user and its role state?
- How does the path id select the item and expose the owner relation used by the policy?
- What is the strongest source-visible ownership or role decision for the non-superuser foreign-item update?
- After the relevant decision branch, can this obligation reach item mutation and persistence?
- Does a source-external fact remain decisive for this bounded obligation, or is this requirement not applicable in the supplied path?

## Result contract
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- deny-non-superuser-foreign-update::put-item-by-id
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

===== BEGIN ALLOWED INPUT: task.json =====
Source ID: src-e3f1b2adef5a09ba
Location note: crop lines 1-49; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | {
2 |   "schemaVersion": "authorization-public-task-material/v1",
3 |   "repository": "https://github.com/fastapi/full-stack-fastapi-template",
4 |   "sourceRef": "cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7",
5 |   "normativePolicy": "An authenticated non-superuser may read or modify only items they own. An authenticated active superuser may read or modify an item regardless of owner.",
6 |   "policyAuthority": {
7 |     "kind": "study-task-author-policy-derived-from-public-route-contract",
8 |     "location": "second-project/model-input/task.json#/normativePolicy",
9 |     "acceptance": "accepted by the study task author for this bounded assessment"
10 |   },
11 |   "sourceFiles": [
12 |     {
13 |       "path": "items.py",
14 |       "originalPath": "backend/app/api/routes/items.py",
15 |       "originalLines": "1-113"
16 |     }
17 |   ],
18 |   "tasks": [
19 |     {
20 |       "caseId": "fastapi-items-foreign-update",
21 |       "request": "Determine whether an authenticated non-superuser can update an item owned by another user through PUT /items/{id}.",
22 |       "principal": "authenticated non-superuser whose id differs from item.owner_id",
23 |       "resource": "existing item owned by another user",
24 |       "operation": "update item fields",
25 |       "expectation": "deny",
26 |       "entry": "items.py:75-96"
27 |     },
28 |     {
29 |       "caseId": "fastapi-items-superuser-read",
30 |       "request": "Determine whether an authenticated active superuser can read an item owned by another user through GET /items/{id}.",
31 |       "principal": "authenticated active superuser whose id differs from item.owner_id",
32 |       "resource": "existing item owned by another user",
33 |       "operation": "read item",
34 |       "expectation": "allow",
35 |       "entry": "items.py:48-58"
36 |     }
37 |   ],
38 |   "requiredAnalysis": [
39 |     "bind the current principal, item owner, role branch, and requested operation",
40 |     "trace the entry through the strongest visible ownership or role control to the protected effect",
41 |     "distinguish the ordinary-owner rule from the superuser override",
42 |     "state any source-external fact that would be needed rather than inferring it"
43 |   ],
44 |   "constraints": [
45 |     "Use only task.json and items.py as model-visible inputs.",
46 |     "Do not execute the target project or contact a deployment.",
47 |     "Do not inspect evaluator/ during a tested generation unit."
48 |   ]
49 | }
===== END ALLOWED INPUT: task.json =====
