# Contract-to-OpenAPI Mapping Guide

This guide defines how to translate each section of `CONTRACT.md` into the corresponding OpenAPI 3.0.3 construct.

> **Source:** [OpenAPI 3.0.3 Specification](https://spec.openapis.org/oas/v3.0.3)

## Section 1 — Overview → Operation Metadata

| Contract field                   | OpenAPI field                                                                 | Notes                                                      |
| -------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Endpoint` (method + path)       | Path key + HTTP method key                                                    | `POST /api/register` → path `/api/register`, method `post` |
| `Feature`                        | `tags` + operation `description`                                              | Include feature ID in description                          |
| `Auth required: No`              | `security: []` at operation level                                             | Empty array overrides global security                      |
| `Auth required: Yes, Bearer JWT` | Omit `security` field (inherits global) or set `security: [{BearerAuth: []}]` |                                                            |
| `Role required: admin`           | Document in operation `description`; enforce via 403 response                 | OpenAPI cannot express RBAC natively                       |
| `Idempotency`                    | Document in operation `description`                                           | No native OpenAPI field                                    |

## Section 2 — Request → Parameters and RequestBody

### Headers → `parameters` with `in: header`

```yaml
parameters:
  - name: Authorization
    in: header
    required: true
    schema:
      type: string
      pattern: "^Bearer .+"
    description: "JWT bearer token"
```

> **Note:** Do not add `Authorization` as a parameter when it is handled by the global `security` scheme — that would be redundant. Only add custom headers that are not part of the security scheme.

### Path Parameters → `parameters` with `in: path`

```yaml
parameters:
  - name: id
    in: path
    required: true # Always true for path parameters
    schema:
      type: integer
      minimum: 1
    description: "Resource identifier"
```

### Query Parameters → `parameters` with `in: query`

```yaml
parameters:
  - name: search
    in: query
    required: false
    schema:
      type: string
      maxLength: 100
    description: "Search keyword to filter results"
```

### Request Body Fields → `requestBody.content.application/json.schema`

Map each field constraint to the appropriate JSON Schema keyword:

| Contract constraint         | OpenAPI / JSON Schema keyword        |
| --------------------------- | ------------------------------------ |
| `type: string`              | `type: string`                       |
| `type: integer`             | `type: integer`                      |
| `type: number`              | `type: number`                       |
| `type: boolean`             | `type: boolean`                      |
| `type: array`               | `type: array` with `items`           |
| `type: object`              | `type: object` with `properties`     |
| `required: Yes`             | Add field name to `required` array   |
| `minLength: N`              | `minLength: N`                       |
| `maxLength: N`              | `maxLength: N`                       |
| `min value: N`              | `minimum: N`                         |
| `max value: N`              | `maximum: N`                         |
| `pattern: regex`            | `pattern: "regex"`                   |
| `allowed values: [a, b, c]` | `enum: [a, b, c]`                    |
| `format: email`             | `format: email`                      |
| `format: date (YYYY-MM-DD)` | `format: date`                       |
| `format: datetime`          | `format: date-time`                  |
| `format: URI`               | `format: uri`                        |
| `nullable`                  | `nullable: true` (OpenAPI 3.0 style) |
| No extra fields allowed     | `additionalProperties: false`        |

## Section 3 — Business Rules → Operation Description

Business rules cannot be enforced by OpenAPI schema alone. Include them as human-readable text in the operation `description`:

```yaml
description: |
  Creates a new user account.

  **Business Rules:**
  - BR-01: Email address must be unique across all accounts (case-insensitive comparison).
  - BR-02: The `role` field is set to `user` by default and cannot be specified by the caller.
  - BR-03: Rate limited to 5 requests per IP per hour.
```

## Section 4 — Response Definitions → `responses`

Each response scenario in the contract becomes one entry in the `responses` object.

### Mapping rules

| Contract scenario                         | OpenAPI response key | Reuse component?                                            |
| ----------------------------------------- | -------------------- | ----------------------------------------------------------- |
| Success with body                         | `"200"` or `"201"`   | No — unique per endpoint                                    |
| Created (resource URL in Location header) | `"201"`              | No                                                          |
| Validation failure                        | `"400"` or `"422"`   | Yes → `$ref: components/responses/BadRequest.yaml`          |
| Missing / invalid auth token              | `"401"`              | Yes → `$ref: components/responses/Unauthorized.yaml`        |
| Insufficient role                         | `"403"`              | Yes → `$ref: components/responses/Forbidden.yaml`           |
| Resource not found                        | `"404"`              | Yes → `$ref: components/responses/NotFound.yaml`            |
| Duplicate resource                        | `"409"`              | Yes → `$ref: components/responses/Conflict.yaml`            |
| Semantic error                            | `"422"`              | Yes → `$ref: components/responses/UnprocessableEntity.yaml` |
| Rate limit                                | `"429"`              | Yes → `$ref: components/responses/TooManyRequests.yaml`     |
| Server error                              | `"500"`              | Yes → `$ref: components/responses/InternalServerError.yaml` |

### Inline success response example

```yaml
"200":
  description: "User registered successfully"
  content:
    application/json:
      schema:
        type: object
        required:
          - message
          - id
        properties:
          message:
            type: string
            example: "User registered successfully"
          id:
            type: integer
            example: 1
```

### Endpoint-specific error (not a standard component)

When an error response has a unique body or message specific to this endpoint, define it inline:

```yaml
"409":
  description: "Email address already registered"
  content:
    application/json:
      schema:
        $ref: "../../components/schemas/ErrorResponse.yaml"
      example:
        error: "Email already exists"
```

## Section 5 — State Transitions → Description Only

OpenAPI does not have a native construct for state machines. Document transitions in the operation `description`:

```yaml
description: |
  Cancels an order.

  **State Transitions:**
  - Order status `pending` → `canceled` (allowed)
  - Order status `confirmed` → `canceled` (allowed)
  - Order status `shipping` → cancellation not allowed → 400
  - Order status `delivered` → cancellation not allowed → 400
  - Order status `canceled` → already canceled → 400
```

## Section 6 — Security Rules → Security Field + Description

```yaml
security:
  - BearerAuth: [] # If auth is required

description: |
  **Security:**
  - SEC-01: SQL injection — all string inputs are validated
  - SEC-05: Role enforcement — requires admin role; user-level token returns 403
  - SEC-06: Mass assignment — role field is ignored if present in request body
```

> OpenAPI `security` declares the authentication scheme. The specific security test vectors are documentation only — they cannot be expressed as schema constraints.

## `$ref` Path Rules

When writing `$ref` from a path file to a component file, use **relative paths**:

| From                       | To                                       | `$ref` value                                        |
| -------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `paths/auth/register.yaml` | `components/schemas/ErrorResponse.yaml`  | `"../../../components/schemas/ErrorResponse.yaml"`  |
| `paths/admin/coupons.yaml` | `components/responses/Unauthorized.yaml` | `"../../../components/responses/Unauthorized.yaml"` |
| `openapi.yaml`             | `paths/auth/register.yaml`               | `"./paths/auth/register.yaml"`                      |
| `openapi.yaml`             | `components/schemas/ErrorResponse.yaml`  | `"./components/schemas/ErrorResponse.yaml"`         |

**Always use relative paths.** Absolute paths and URLs break portability across environments.
