---
name: api-openapi
description: Convert an approved API Contract document into a production-grade OpenAPI 3.0 YAML specification, split across multiple files following the standard directory layout. Use this skill when you need to generate or update an OpenAPI spec from a structured contract. Trigger this skill whenever the user mentions "OpenAPI", "Swagger", "YAML spec", "generate spec", "openapi.yaml", or wants to produce machine-readable API documentation from a contract.
---

# `api-openapi` Skill

## Overview

Convert a fully-approved **API Contract** (`CONTRACT.md`) into a **multi-file OpenAPI 3.0.3 specification** following the standard directory structure. The output is a set of YAML files that can be served by Swagger UI, used for code generation, or consumed by API testing tools.

The skill handles two scenarios:

- **First run:** `openapi.yaml` index does not yet exist → create it with full metadata, then add the new path file and components.
- **Subsequent runs:** `openapi.yaml` already exists → update it to include the new path, reuse existing components where possible, and create new component files only when needed.

**Primary outputs:**

- `{output_dir}/paths/{category}/{api-name}.yaml` — path item for this endpoint
- `{output_dir}/components/**/*.yaml` — new or updated component files
- `{output_dir}/openapi.yaml` — index file (created or updated)

See [`references/directory-structure.md`](references/directory-structure.md) for the full directory layout and file format conventions.

## When to Use

- After an API Contract has been reviewed and approved by a human
- When Swagger UI needs to be updated to include a new endpoint
- When adding a new API to an existing OpenAPI spec set
- When component schemas need to be extracted and standardized for reuse

## When NOT to Use

- When the contract has not yet been approved — do not generate specs from a draft contract
- When the task is to test the API or design test cases — that is a separate concern
- When the existing OpenAPI spec for this endpoint is already up to date and verified

## Inputs

| Name            | Type     | Required | Description                                                                             |
| --------------- | -------- | -------- | --------------------------------------------------------------------------------------- |
| `contract_file` | `string` | ✅       | Path to the approved `CONTRACT.md`                                                      |
| `output_dir`    | `string` | ✅       | Root directory of the OpenAPI spec set (e.g., `docs/openapi/`)                          |
| `api_tag`       | `string` | ✅       | Tag used to group this endpoint in Swagger UI (e.g., `Authentication`, `Cart`, `Admin`) |

**Validation rules — reject and ask the user to correct before proceeding:**

- `contract_file` must exist on disk and contain a valid API Contract (must have at minimum: endpoint method+path, request section, response definitions)
- `output_dir` must be a valid writable path
- `api_tag` must be a non-empty string

## Outputs

| File              | Location                          | Description                                                        |
| ----------------- | --------------------------------- | ------------------------------------------------------------------ |
| `{api-name}.yaml` | `{output_dir}/paths/{category}/`  | Path item object for this endpoint                                 |
| Component files   | `{output_dir}/components/{type}/` | New schemas, responses, parameters — only when not already present |
| `openapi.yaml`    | `{output_dir}/`                   | Index file — created if absent, updated if present                 |

Naming conventions and exact file formats are specified in [`references/directory-structure.md`](references/directory-structure.md).

## Core Principles

1. **One endpoint, one path file.** Each endpoint gets exactly one YAML file under `paths/{category}/`. Never combine multiple endpoints in a single path file.
2. **Reuse before creating.** Before writing a new component, scan `{output_dir}/components/` for an existing schema that matches. Duplicate components cause inconsistency and maintenance burden.
3. **Index file never contains inline definitions.** `openapi.yaml` only holds metadata (`info`, `servers`, `tags`, `security`) and `$ref` pointers. No inline path items or schemas.
4. **Standard HTTP response components are always shared.** Responses for 400, 401, 403, 404, 422, 429, and 500 belong in `components/responses/` and are referenced — never duplicated per endpoint.
5. **Contract is authoritative.** The contract defines the behavior. If the contract is ambiguous, stop and ask — do not invent schema details.

## Generation Process

> Follow every step in order. Read [`references/directory-structure.md`](references/directory-structure.md) and [`references/mapping-guide.md`](references/mapping-guide.md) before starting Step 3.

### Step 1 — Input Validation

Validate all inputs per the rules above. If validation fails, stop and ask the user to fix the input before proceeding.

### Step 2 — Contract Parsing

Read `contract_file` in full. Extract and structure the following for use in subsequent steps:

- Endpoint method and path
- Auth requirement and type
- All request components: headers, path params, query params, body fields with types and constraints
- All response scenarios: status code, trigger condition, body structure
- Security scheme references
- State transitions (used to enrich operation descriptions)
- Business rules (used as `description` text in operation and field definitions)

### Step 3 — Directory and Index Resolution

1. Derive `{category}` from the endpoint path:
   - `/api/admin/...` → `admin`
   - `/api/auth/...` or `/api/login`, `/api/register` → `auth`
   - `/api/cart`, `/api/checkout` → `cart`
   - `/api/orders/...` → `orders`
   - `/api/products/...`, `/api/categories/...` → `catalog`
   - Any other path segment → use the first meaningful segment after `/api/`
2. Derive `{api-name}` from the endpoint path — use the last meaningful path segment in kebab-case:
   - `POST /api/register` → `register.yaml`
   - `POST /api/admin/coupons` → `admin-coupons-create.yaml`
   - `PUT /api/orders/:id/cancel` → `orders-cancel.yaml`
3. Check whether `{output_dir}/openapi.yaml` exists:
   - **Does not exist:** Create it using the index template in [`assets/openapi-index-template.yaml`](assets/openapi-index-template.yaml). Populate `info.title`, `info.version`, and `servers` from the contract's overview if available.
   - **Exists:** Read it. Do not overwrite existing content — only add the new path `$ref` entry.

### Step 4 — Component Reuse Check

Before creating any component file:

1. List all files currently in `{output_dir}/components/schemas/`, `components/responses/`, `components/parameters/`, `components/requestBodies/`, `components/securitySchemes/`.
2. For each schema or response needed by this endpoint, check whether a compatible one already exists.
3. If a match exists: reference it via `$ref` — do not create a duplicate.
4. If no match exists: create the new component file.

Standard response components to always check for first (`401`, `403`, `404`, `422`, `429`, `500`) — create them only once, then reuse across all endpoints.

### Step 5 — Path File Generation

Create `{output_dir}/paths/{category}/{api-name}.yaml` following the format in [`references/mapping-guide.md`](references/mapping-guide.md).

Key mapping rules:

- Contract `Request` → `requestBody`, `parameters`
- Contract `Business Rules` → operation `description` (summarize as human-readable text)
- Contract `Response Definitions` → `responses` object
- Contract `Security Rules` → operation `security` array
- Field constraints → `schema` properties (`minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `enum`, `format`)
- Required fields → `required` array at object level

### Step 6 — Index Update

Add a `$ref` entry for the new path into `{output_dir}/openapi.yaml` under the `paths` key. If the path already exists in the index (re-running the skill for an existing endpoint), overwrite only that entry.

Ensure the `api_tag` is present in the `tags` array of `openapi.yaml`. Add it if missing.

### Step 7 — Output Quality Review

Before presenting results to the user, verify every item in the **Schema Completeness Checklist** below. Fix any gaps.

### Step 8 — Human Gate

Present to the user:

1. A list of all files created or modified, with their paths
2. Any components that were reused (not created) — so the user knows what was shared
3. Any decisions made during Step 3 (category derivation, api-name derivation) that the user should confirm

State clearly: **"Please verify the generated YAML files before using them. Confirm path, schema types, and response definitions are correct."**

Do not proceed to further work until the user explicitly approves.

## Schema Completeness Checklist

Run before delivering output. Every item must pass:

- [ ] Path file exists at the correct location: `paths/{category}/{api-name}.yaml`
- [ ] Operation has `summary`, `description`, `operationId`, and `tags`
- [ ] All request headers from contract appear as `parameters` with `in: header`
- [ ] All path parameters appear as `parameters` with `in: path` and `required: true`
- [ ] All query parameters appear as `parameters` with `in: query`
- [ ] Request body schema covers every field from contract with correct `type` and constraints
- [ ] Required fields are listed in the `required` array — not just marked in description
- [ ] Every response scenario from contract has a corresponding entry in `responses`
- [ ] Standard error responses (401, 403, 404, etc.) use `$ref` to `components/responses/`
- [ ] Security scheme is applied at operation level if auth is required
- [ ] No inline schema is duplicated — shared schemas use `$ref` to `components/schemas/`
- [ ] `openapi.yaml` index contains a `$ref` entry for this path
- [ ] `api_tag` is present in the `tags` array of `openapi.yaml`
- [ ] No fabricated fields or constraints not present in the contract

## Anti-Patterns

- **Inline everything in one file.** Putting all paths and schemas in `openapi.yaml` makes the spec unmaintainable and prevents component reuse.
- **Creating duplicate component schemas.** If `ErrorResponse` already exists in `components/schemas/`, do not create `ErrorResponse2` — use a `$ref`.
- **Omitting constraints.** A field listed as `string` with no `minLength`, `maxLength`, or `pattern` when the contract specifies constraints is an incomplete spec.
- **Using `additionalProperties: true` by default.** This allows arbitrary fields and undermines schema validation. Use `additionalProperties: false` for strict request bodies unless the contract explicitly allows extra fields.
- **Skipping the reuse check.** Always scan existing components before creating new ones.
- **Putting business logic in the YAML.** OpenAPI describes structure and protocol. Business rules belong in the `description` field as human-readable text — not encoded as schema constraints that OpenAPI cannot express.

## Best Practices

- Use `operationId` values in `{verb}{Resource}` format: `registerUser`, `addCartItem`, `createCoupon`. These become method names in generated clients.
- Write `description` fields for operations in present tense, third person: "Creates a new user account. Returns the created user's ID."
- Use `format` keywords where applicable: `format: email` for email fields, `format: date` for date strings, `format: int32` or `format: int64` for integers, `format: uri` for URLs.
- Use `enum` for fields with a fixed set of allowed values (e.g., `type: ["percent", "fixed"]`).
- Add `example` values to schema properties — they appear in Swagger UI and make the spec more usable.
- Follow [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3) strictly. Do not use OpenAPI 3.1 syntax (e.g., `type: [string, null]`) unless the project explicitly targets 3.1.
- For nullable fields, use `nullable: true` (OpenAPI 3.0 style), not the JSON Schema `type: ["string", "null"]` form.

## Process Quality Checklist

Verify before closing the task:

- [ ] All inputs were validated before any file was created
- [ ] Contract was fully parsed — no section skipped
- [ ] Category and api-name were derived correctly from the endpoint path
- [ ] Existing components were scanned for reuse before creating new ones
- [ ] Schema Completeness Checklist passed with zero unchecked items
- [ ] `openapi.yaml` was updated (not replaced) — pre-existing paths are intact
- [ ] Human gate was presented and user approval explicitly requested
- [ ] No content from the contract was fabricated or extrapolated beyond what is stated

## Common Rationalizations to Reject

- _"The contract doesn't list all the error codes, so I'll just put a generic 4xx."_ → Every response scenario in the contract must have its own entry. If a scenario is missing from the contract, note it and ask — do not invent responses.
- _"This schema is similar to an existing one, so I'll create a new one with a slightly different name."_ → If schemas are compatible, reuse the existing one. Create a new component only when there is a genuine structural difference.
- _"I'll put everything in openapi.yaml to keep it simple."_ → The index file must never contain inline definitions. Use the multi-file structure.
- _"The field is a string, I don't need to add constraints."_ → If the contract specifies constraints, they must appear in the schema. A schema without constraints does not validate input correctly.
- _"I'll skip the human gate since the output looks correct to me."_ → The human gate is mandatory. The user must review and approve YAML files before they are used.
