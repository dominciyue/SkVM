## Authorization assessment

Repository: `https://github.com/fastapi/full-stack-fastapi-template`

Reference: `cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7`

Assess this request against the stated policy: an authenticated non-superuser may read or modify only items they own; an authenticated active superuser may read or modify any item.

Principal: authenticated active non-superuser.

Resource relation: the existing item is owned by the caller.

Operation: update item fields through `PUT /items/{id}`.

Entry/source scope: `inputs/fastapi-foreign-update/source/items.py:75-96`, function `update_item`, covering `PUT /{id}`. Use adjacent code only to understand the declared route context.

Citation: the handler loads the item at lines 86-88 and checks `not current_user.is_superuser and (item.owner_id != current_user.id)` at lines 89-90 before applying the update at lines 91-96.

Do not run, contact, invoke, or modify the target project. Do not infer deployment facts. Base the assessment only on the supplied policy, principal/resource state, operation, and cited source crop.
