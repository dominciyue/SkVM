# API Tester bounded solidification

This helper reuses the unchanged `api-tester-openapi-subset-v2`
implementation. It accepts a v2 binding path, a task work directory containing
the referenced JSON or YAML OpenAPI input, a new empty output directory, and a
Node.js executable. It generates a plan/report and independently checks their
input binding, operation coverage, schema-derived cases, array encoding,
security/response obligations and report grounding.

The helper is offline and deterministic. It does not call an API, validate
server behavior, obtain credentials, repair missing references, guess response
statuses, or prove duties outside the support contract. An unsupported result
requires the agent to continue the original workflow; local artifact success
does not prove a complete document or real API behavior.
