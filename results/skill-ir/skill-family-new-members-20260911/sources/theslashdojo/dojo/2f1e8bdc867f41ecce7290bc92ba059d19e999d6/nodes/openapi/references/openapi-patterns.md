# OpenAPI Patterns

Use this file when authoring or reviewing a contract and the node body is not enough.

## Stable Operation IDs

`operationId` is the best long-term handle for generated SDK method names, tests, docs anchors, and telemetry labels. Use verb-noun names like `listInvoices`, `createPayment`, `getCustomer`, `cancelSubscription`. Do not include implementation details like controller class names.

## Reusable Error Shape

Every API should expose one predictable error envelope:

```yaml
components:
  schemas:
    Error:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
          examples: [validation_failed]
        message:
          type: string
        requestId:
          type: string
        details:
          type: array
          items:
            type: object
            additionalProperties: true
  responses:
    BadRequest:
      description: Request validation failed
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/Error"
```

## Pagination

Cursor pagination is usually safer than offset pagination for changing datasets:

```yaml
components:
  parameters:
    Cursor:
      name: cursor
      in: query
      required: false
      schema:
        type: string
    Limit:
      name: limit
      in: query
      required: false
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 25
  schemas:
    PageInfo:
      type: object
      required: [hasMore]
      properties:
        nextCursor:
          type: string
        hasMore:
          type: boolean
```

## Security Schemes

Define security schemes once and reference them globally or per operation:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key
security:
  - bearerAuth: []
```

Use per-operation `security: []` only when an endpoint is intentionally public.

## Schema Composition

Use `allOf` for additive composition, `oneOf` for tagged alternatives, and `anyOf` only when multiple alternatives can be valid at once. For generated clients, prefer discriminated `oneOf`:

```yaml
components:
  schemas:
    Event:
      oneOf:
        - $ref: "#/components/schemas/InvoicePaidEvent"
        - $ref: "#/components/schemas/PaymentFailedEvent"
      discriminator:
        propertyName: type
```

## Versioning and Compatibility

Non-breaking changes usually include adding optional request fields, adding response fields, adding endpoints, adding enum values if clients tolerate unknowns, and documentation-only edits. Breaking changes include removing paths or methods, adding required inputs, narrowing schemas, changing response types, removing success responses, or adding stricter authentication.
