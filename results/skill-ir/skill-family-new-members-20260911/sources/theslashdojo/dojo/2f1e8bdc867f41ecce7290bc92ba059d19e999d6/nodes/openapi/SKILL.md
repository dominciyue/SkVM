---
name: openapi
description: Design, validate, mock, test, diff, and generate clients or servers from OpenAPI descriptions; use when working with Swagger/OpenAPI specs, API contracts, schema-first HTTP APIs, or generated SDKs.
---

# OpenAPI

Use this skill when a task involves an OpenAPI or Swagger document, an HTTP API contract, generated clients, mock servers, API fuzzing, or breaking-change review.

## Core Workflow

1. Locate the source of truth: `openapi.yaml`, `openapi.yml`, `openapi.json`, a framework-generated URL, or a remote schema endpoint.
2. Validate before acting. Run `nodes/openapi/scripts/validate-openapi.sh <spec>` and fix structural, `$ref`, operation, schema, and security warnings.
3. Bundle multi-file specs before handing them to downstream tools: `OPENAPI_BUNDLE_OUT=dist/openapi.bundle.yaml nodes/openapi/scripts/validate-openapi.sh openapi.yaml`.
4. Generate only from a clean spec. Use `nodes/openapi/scripts/generate-openapi.sh <spec> <generator> <out>`.
5. Mock or contract-test before integrating clients. Use Prism for a local fake API and Schemathesis against a real running service.
6. For pull requests, compare the previous and new spec with `nodes/openapi/scripts/diff-openapi.sh base.yaml revision.yaml`.

## Node Map

- `openapi/spec`: the OpenAPI object model, paths, operations, schemas, refs, security, and version differences.
- `openapi/author`: create or maintain a contract with stable operation IDs, reusable components, examples, and error shapes.
- `openapi/validate`: lint, validate, and bundle API descriptions with Redocly CLI.
- `openapi/generate`: generate SDKs, clients, server stubs, and documentation assets with OpenAPI Generator.
- `openapi/mock`: run mock servers from the contract with Prism.
- `openapi/contract-test`: test a live API against the contract with Schemathesis.
- `openapi/diff`: detect breaking API changes with oasdiff.

## Scripts

All scripts are executable from the repository root:

```bash
# Create a minimal starting spec
nodes/openapi/scripts/scaffold-openapi.mjs --out openapi.yaml --title "Payments API" --server http://localhost:3000

# Validate and optionally bundle
nodes/openapi/scripts/validate-openapi.sh openapi.yaml
OPENAPI_BUNDLE_OUT=dist/openapi.yaml nodes/openapi/scripts/validate-openapi.sh openapi.yaml

# Generate a TypeScript fetch client
nodes/openapi/scripts/generate-openapi.sh openapi.yaml typescript-fetch generated/client

# Mock a contract on port 4010
nodes/openapi/scripts/mock-openapi.sh openapi.yaml 4010

# Test a live API from a local spec
nodes/openapi/scripts/contract-test-openapi.sh openapi.yaml http://localhost:3000

# Fail on breaking changes between two versions
nodes/openapi/scripts/diff-openapi.sh main-openapi.yaml pr-openapi.yaml
```

## Authoring Rules

- Prefer OpenAPI 3.1 for broad tool support unless the project explicitly targets 3.2 features.
- Keep `operationId` stable and unique; generated SDK method names depend on it.
- Reuse `components.schemas`, `components.parameters`, `components.responses`, and `components.securitySchemes` instead of repeating inline definitions.
- Define every non-2xx error response with a reusable error schema.
- Add examples for request bodies, important responses, and tricky parameter serialization.
- Use semantic versioning for API compatibility, but let `openapi/diff` decide whether a spec change is breaking.
- Treat generated code as an artifact unless the project already commits generated clients.

## Common Environment Variables

```bash
export OPENAPI_SPEC=openapi.yaml
export OPENAPI_BUNDLE_OUT=dist/openapi.bundle.yaml
export OPENAPI_GENERATOR_ADDITIONAL_PROPERTIES=npmName=@acme/api-client,supportsES6=true
export OPENAPI_MOCK_HOST=0.0.0.0
export OPENAPI_MOCK_PORT=4010
export OPENAPI_TEST_URL=http://localhost:3000
export OPENAPI_DIFF_FORMAT=text
export API_TOKEN=...
```

## Edge Cases

- Multi-file specs: validate with Redocly and bundle before generation or mocking.
- Circular refs: supported in schemas by some tools, but can break generators. Prefer explicit IDs and test target generators early.
- OpenAPI 3.2: use for new spec semantics when tooling supports it; fall back to 3.1 if generators, validators, or gateways reject it.
- Authentication: keep examples non-secret. Pass real auth to contract tests with headers, environment variables, or Schemathesis config.
- Generated SDK drift: regenerate in CI and compare the output, or publish clients from the same commit that changed the spec.
- Framework-generated specs: fetch the running app's JSON, save it, validate it, then diff it against the committed contract.

For deeper reusable patterns, read `references/openapi-patterns.md`.
