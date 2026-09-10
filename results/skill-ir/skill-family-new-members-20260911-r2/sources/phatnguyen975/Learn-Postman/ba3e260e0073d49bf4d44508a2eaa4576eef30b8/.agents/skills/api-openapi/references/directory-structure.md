# OpenAPI Directory Structure Reference

This document defines the canonical directory layout for a multi-file OpenAPI 3.0 specification and the required format for each file type.

> **Source:** [OpenAPI 3.0.3 Specification](https://spec.openapis.org/oas/v3.0.3), [OpenAPI Best Practices — Redocly](https://redocly.com/learn/openapi/openapi-decisions)

## Full Directory Layout

```
{output_dir}/
├── openapi.yaml                        # Index — metadata + $ref pointers only
│
├── paths/
│   ├── {category-1}/
│   │   ├── {api-name}.yaml             # One file per endpoint
│   │   └── {api-name}.yaml
│   └── {category-2}/
│       └── {api-name}.yaml
│
└── components/
    ├── schemas/
    │   ├── {EntityName}.yaml           # Reusable object schema (used in ≥2 endpoints)
    │   └── ErrorResponse.yaml          # Standard error body schema
    ├── parameters/
    │   └── {ParamName}.yaml            # Reusable path/query/header parameter
    ├── responses/
    │   ├── BadRequest.yaml             # 400
    │   ├── Unauthorized.yaml           # 401
    │   ├── Forbidden.yaml              # 403
    │   ├── NotFound.yaml               # 404
    │   ├── Conflict.yaml               # 409
    │   ├── UnprocessableEntity.yaml    # 422
    │   ├── TooManyRequests.yaml        # 429
    │   └── InternalServerError.yaml    # 500
    ├── requestBodies/
    │   └── {BodyName}.yaml             # Reusable request body (used in ≥2 endpoints)
    └── securitySchemes/
        └── BearerAuth.yaml             # JWT Bearer scheme
```

## Naming Conventions

### Category (path subdirectory)

Derived from the first meaningful URL segment after `/api/`:

| URL pattern                                               | Category folder |
| --------------------------------------------------------- | --------------- |
| `/api/register`, `/api/login`, `/api/forgot-password`     | `auth/`         |
| `/api/users/...`                                          | `users/`        |
| `/api/products/...`, `/api/categories/...`                | `catalog/`      |
| `/api/cart`, `/api/checkout`                              | `cart/`         |
| `/api/orders/...`                                         | `orders/`       |
| `/api/coupons`, `/api/apply-coupon`                       | `coupons/`      |
| `/api/admin/users`, `/api/admin/orders`, `/api/admin/...` | `admin/`        |

### API name (file name, no extension)

Use the last meaningful path segment in kebab-case:

| Endpoint                        | File name                   |
| ------------------------------- | --------------------------- |
| `POST /api/register`            | `register.yaml`             |
| `POST /api/login`               | `login.yaml`                |
| `GET /api/products`             | `products-list.yaml`        |
| `GET /api/products/:id`         | `products-detail.yaml`      |
| `POST /api/cart`                | `cart-add.yaml`             |
| `PUT /api/orders/:id/cancel`    | `orders-cancel.yaml`        |
| `POST /api/admin/coupons`       | `admin-coupons-create.yaml` |
| `DELETE /api/admin/coupons/:id` | `admin-coupons-delete.yaml` |

When multiple endpoints share the same resource path but differ by method, use the pattern `{resource}-{verb}.yaml`.

## File Formats

### `openapi.yaml` — Index File

```yaml
openapi: "3.0.3"
info:
  title: "{Project Name} API Docs"
  version: "1.0.0"
  description: "{Short description of the API}"
  contact:
    name: "{Team or project name}"

servers:
  - url: "http://localhost:{port}"
    description: "Local development server"
    variables:
      port:
        default: "3000"

tags:
  - name: Authentication
    description: "User registration, login, and password management"
  - name: Cart
    description: "Shopping cart operations"
  - name: Admin
    description: "Admin-only operations"
  # Add one tag per api_tag value used

security:
  - BearerAuth: [] # Global default; override at operation level when needed

components:
  securitySchemes:
    BearerAuth:
      $ref: "./components/securitySchemes/BearerAuth.yaml"
  schemas:
    ErrorResponse:
      $ref: "./components/schemas/ErrorResponse.yaml"
    # Add $ref entries as new schemas are created
  responses:
    Unauthorized:
      $ref: "./components/responses/Unauthorized.yaml"
    Forbidden:
      $ref: "./components/responses/Forbidden.yaml"
    # Add $ref entries as new responses are created

paths:
  /api/register:
    $ref: "./paths/auth/register.yaml"
  /api/cart:
    $ref: "./paths/cart/cart-add.yaml"
  # Add one entry per endpoint as path files are created
```

> **Rule:** `paths` and `components` in this file contain only `$ref` pointers. No inline definitions.

### Path File — `paths/{category}/{api-name}.yaml`

Each path file contains a single **Path Item Object** keyed by the HTTP method.

```yaml
post: # or get, put, patch, delete
  summary: "Register a new user account"
  description: |
    Creates a new user account with the provided credentials.
    Business rules:
    - BR-01: Email must be unique (case-insensitive)
    - BR-02: Default role is 'user'; cannot be set by the caller
  operationId: "registerUser"
  tags:
    - Authentication

  parameters: # Omit section if no parameters
    - name: X-Custom-Header
      in: header
      required: true
      schema:
        type: string

  requestBody: # Omit section if no body (e.g., GET)
    required: true
    content:
      application/json:
        schema:
          type: object
          required:
            - name
            - email
            - password
          additionalProperties: false
          properties:
            name:
              type: string
              minLength: 2
              maxLength: 100
              description: "Full display name of the user"
              example: "Nguyen Van A"
            email:
              type: string
              format: email
              maxLength: 254
              description: "User's email address. Must be unique."
              example: "user@example.com"
            password:
              type: string
              minLength: 8
              maxLength: 64
              description: "Password. Must contain uppercase, lowercase, digit, and special character."
              example: "Password123!"

  security: [] # Empty array = no auth required for this operation
    # Omit this field to inherit global security

  responses:
    "200":
      description: "User registered successfully"
      content:
        application/json:
          schema:
            type: object
            properties:
              message:
                type: string
                example: "User registered successfully"
              id:
                type: integer
                example: 1
    "400":
      $ref: "../../components/responses/BadRequest.yaml"
    "409":
      description: "Email already registered"
      content:
        application/json:
          schema:
            $ref: "../../components/schemas/ErrorResponse.yaml"
          example:
            error: "Email already exists"
    "422":
      $ref: "../../components/responses/UnprocessableEntity.yaml"
    "429":
      $ref: "../../components/responses/TooManyRequests.yaml"
    "500":
      $ref: "../../components/responses/InternalServerError.yaml"
```

### Component Files

#### `components/schemas/ErrorResponse.yaml`

```yaml
type: object
required:
  - error
properties:
  error:
    type: string
    description: "Human-readable error message"
    example: "Invalid input"
```

#### `components/responses/Unauthorized.yaml`

```yaml
description: "Authentication required or token invalid/expired"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Unauthorized"
```

#### `components/responses/Forbidden.yaml`

```yaml
description: "Authenticated but insufficient permissions"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Forbidden"
```

#### `components/responses/BadRequest.yaml`

```yaml
description: "Request validation failed"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Invalid input"
```

#### `components/responses/NotFound.yaml`

```yaml
description: "Requested resource not found"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Resource not found"
```

#### `components/responses/Conflict.yaml`

```yaml
description: "Resource already exists or state conflict"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Resource already exists"
```

#### `components/responses/UnprocessableEntity.yaml`

```yaml
description: "Semantically invalid request"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Unprocessable entity"
```

#### `components/responses/TooManyRequests.yaml`

```yaml
description: "Rate limit exceeded"
headers:
  Retry-After:
    schema:
      type: integer
    description: "Seconds to wait before retrying"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Too many requests"
```

#### `components/responses/InternalServerError.yaml`

```yaml
description: "Unexpected server error"
content:
  application/json:
    schema:
      $ref: "../schemas/ErrorResponse.yaml"
    example:
      error: "Internal server error"
```

#### `components/securitySchemes/BearerAuth.yaml`

```yaml
type: http
scheme: bearer
bearerFormat: JWT
description: "JWT token obtained from the login endpoint. Pass as: Authorization: Bearer <token>"
```
