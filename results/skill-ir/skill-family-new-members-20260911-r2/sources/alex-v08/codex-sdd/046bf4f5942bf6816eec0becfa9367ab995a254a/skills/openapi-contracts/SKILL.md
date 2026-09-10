---
name: openapi-contracts
description: OpenAPI 3.1 as opt-in alternative to JSON custom contracts + Pact for consumer-driven contract testing
version: 1.0.0
status: active
tags: [rest-api, contracts, openapi3.1, pact, codegen, mock-testing]
---

# OpenAPI Contracts Skill

## Frontmatter
- **name**: openapi-contracts
- **description**: OpenAPI 3.1 as opt-in alternative to JSON custom contracts + Pact for consumer-driven contract testing
- **version**: 1.0.0
- **status**: active
- **tags**: [rest-api, contracts, openapi3.1, pact, codegen, mock-testing]

---

## When to Use

Use OpenAPI contracts when:
- Building **REST APIs** across multiple services
- Implementing **consumer-driven contract testing** (Pact) between services
- Need **mature ecosystem** (Swagger UI, code generation, validation tooling)
- Designing **API-first** projects with external or internal consumers
- Requiring **standards-based** API documentation alongside contracts

**Alternative**: SDD JSON custom contracts (`contract.json`) for simpler single-service APIs with tight control over contract shape.

---

## OpenAPI 3.1 Key Features

### JSON Schema 2020-12 Compatibility
- Full JSON Schema draft 2020-12 support (not 2020-11)
- Enables complex validation: `prefixItems`, `unevaluatedProperties`, `dependentSchemas`
- Type coercion: numbers, strings, booleans without workarounds

### Webhooks
- Reverse callbacks: subscriber defines webhook URL, provider sends events
- Define in `webhooks:` top-level field
- Each webhook: name, request/response, triggers

### Discriminator & oneOf/anyOf
- **discriminator**: property-based routing for polymorphic types
- Solves N+1 validation problem in union types
- Example: `{ "type": "dog", "breed": "labrador" }` vs `{ "type": "cat", "breed": "maine-coon" }`

### Examples & Media Types
- Multiple examples per operation (success/error scenarios)
- Content negotiation: `application/json`, `application/xml`, `text/csv`
- Default response example strategy reduces docs friction

---

## OpenAPI Structure

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 1.0.0
  description: API description
  contact:
    name: Support
    url: https://example.com/support
    email: support@example.com
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html

servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://staging-api.example.com/v1
    description: Staging
  - url: http://localhost:3000/v1
    description: Development

security:
  - bearerAuth: []
  - apiKeyAuth: []

paths:
  /users:
    post:
      summary: Create user
      operationId: createUser
      tags: [users]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserInput'
            examples:
              simple:
                value:
                  email: user@example.com
                  name: John Doe
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          description: Validation error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
      security:
        - bearerAuth: []

components:
  schemas:
    User:
      type: object
      required: [id, email, name, createdAt]
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 1
          maxLength: 255
        role:
          type: string
          enum: [user, admin]
          default: user
        createdAt:
          type: string
          format: date-time
    Error:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: object

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
```

---

## vs SDD JSON Contracts

| Aspect | OpenAPI 3.1 | SDD `contract.json` |
|--------|-------------|-------------------|
| **Verbosity** | 300–500 lines typical | 100–200 lines |
| **Ecosystem** | Swagger UI, Prism, codegen, Dredd, Spectral | Custom tooling via SDD tools |
| **Standards** | IETF OpenAPI 3.1 (JSON Schema 2020-12) | Internal SDD contract format |
| **Consumer Testing** | Pact consumer-driven contracts native | Manual test_cases array |
| **Documentation** | Auto-generated interactive API docs | Markdown + contract file |
| **Multi-service** | Excellent (federation, external consumers) | Single-service focused |
| **Code Generation** | TypeScript, Python, Go, Java SDKs | Manual or ts-morph injection |

**Choose OpenAPI 3.1** if: REST API, many consumers, need standard tooling, external API.
**Choose SDD JSON** if: Internal microservice, minimal docs, tight SDD integration, fast iteration.

---

## Code Generation: openapi-generator-cli

### Install
```bash
npm install -D @openapitools/openapi-generator-cli
```

### Generate TypeScript Client
```bash
npx openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o src/generated/api \
  --package-name=generated-api
```

### Generate React Query Hooks (Community Generator)
```bash
npm install -D openapi-ts
npx openapi-ts --input ./openapi.yaml --output ./src/api/generated
```

Generated artifacts:
- **Schemas**: TypeScript interfaces (strict validation)
- **API Client**: Service methods, type-safe request/response
- **React Query hooks**: `useGetUsers()`, `useCreateUser()` auto-generated

---

## Mock Server: Prism & Mock Service Worker

### Prism (OpenAPI-driven)
```bash
npm install -D @stoplight/prism-cli

# Start mock server (auto-reads openapi.yaml)
npx prism mock openapi.yaml --port 3001
```

Returns realistic responses from examples in OpenAPI spec.

### Mock Service Worker (MSW)
```bash
npm install -D msw
```

Hand-craft handlers:
```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const handlers = [
  http.post('/api/v1/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 'uuid', ...body }, { status: 201 });
  }),
];

export const server = setupServer(...handlers);
```

---

## Contract Testing: Pact, Dredd, Schemathesis

### Pact (Consumer-Driven)
```bash
npm install -D @pact-foundation/pact
```

Consumer test:
```typescript
import { PactV3 } from '@pact-foundation/pact';

const pact = new PactV3({ consumer: 'Frontend', provider: 'UserAPI' });

describe('User API Contract', () => {
  it('returns user by ID', async () => {
    await pact
      .addInteraction({
        states: ['user 123 exists'],
        uponReceiving: 'a request for user 123',
        withRequest: { method: 'GET', path: '/users/123' },
        willRespondWith: {
          status: 200,
          body: { id: '123', name: 'Alice' },
        },
      })
      .executeTest(async (mockProvider) => {
        const response = await fetch(`${mockProvider.url}/users/123`);
        expect(response.status).toBe(200);
      });
  });
});

// Generates pact file; provider verifies against impl
```

### Dredd (Validation)
```bash
npm install -D dredd

# Validate OpenAPI spec against running API
npx dredd openapi.yaml http://localhost:3000
```

Reports mismatches between spec and implementation.

### Schemathesis (Fuzzing)
```bash
pip install schemathesis

# Auto-generate test cases, fuzz endpoints
schemathesis run openapi.yaml --base-url=http://localhost:3000
```

Finds edge cases, invalid input handling.

---

## Integration with SDD

### Directory Structure
```
.specify/
├── contracts/
│   ├── api.json                          # SDD JSON contract (existing)
│   └── openapi.yaml                      # OpenAPI 3.1 (opt-in alternative)
├── templates/
│   ├── contract-template.json            # SDD JSON template
│   └── openapi-contract-template.yaml    # OpenAPI 3.1 template ← NEW
└── specs/
    └── api-spec.json                     # Architecture decision
```

### Usage in SDD Workflow

1. **Architect decides**: Use OpenAPI if multi-consumer or external API
2. **Spec-writer**: Validation supports both `.json` and `.yaml` formats
3. **Builder**: Generate SDKs/types from OpenAPI via `openapi-generator-cli`
4. **QA**: Run Dredd validation + Pact consumer tests in CI

---

## CI Integration

### Spectral Lint (OpenAPI Style Guide)
```bash
npm install -D @stoplight/spectral-cli

npx spectral lint openapi.yaml --extends spectral:oas
```

Rules: required fields, naming conventions, security, pagination.

### Swagger CLI Validate
```bash
npm install -D swagger-cli

npx swagger-cli validate openapi.yaml
```

Syntax validation, $ref resolution.

### Diff Between Versions
```bash
npm install -D openapi-diff

npx openapi-diff openapi.v1.yaml openapi.v2.yaml
```

Breaking changes detection (removed endpoints, schema changes).

### GitHub Actions Example
```yaml
name: OpenAPI Validation

on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npx spectral lint .specify/contracts/openapi.yaml
      - run: npx swagger-cli validate .specify/contracts/openapi.yaml
      - run: npx openapi-diff main:.specify/contracts/openapi.yaml HEAD:.specify/contracts/openapi.yaml || true
```

---

## Best Practices

1. **Schema Reuse**: Use `$ref` and `components/schemas` to avoid duplication
2. **Error Schemas**: Define standard error shape (`Error`, `ValidationError`, `UnauthorizedError`)
3. **Pagination**: Include `limit`, `offset`, `total` in list responses
4. **Rate Limiting**: Document in security schemes or headers
5. **Versioning**: Include version in URL path (`/v1/`, `/v2/`) or header
6. **Examples**: Provide realistic examples for every status code
7. **Deprecation**: Mark deprecated endpoints with `deprecated: true`
8. **Servers**: Define dev/staging/prod environments
9. **Security**: Declare all auth schemes (Bearer, API Key, OAuth2)
10. **Consumer Contracts**: Bind Pact test results to CI gates

---

## Tools & Links

- **OpenAPI 3.1 Spec**: https://spec.openapis.org/oas/v3.1.0
- **@stoplight/spectral**: https://docs.stoplight.io/spectral
- **openapi-generator**: https://openapi-generator.tech
- **Pact**: https://docs.pact.foundation
- **Dredd**: https://dredd.org
- **Prism**: https://docs.stoplight.io/prism
- **Schemathesis**: https://schemathesis.readthedocs.io

---

**Last Updated**: 2026-04-16 | **SDD Framework v2**
