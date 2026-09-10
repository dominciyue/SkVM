# API Test Checklist — Per Endpoint

## Endpoint Details
- Method + Path: ___________
- Auth required: Yes / No
- Request body: Yes / No
- Response type: JSON / Stream / File

## Status Code Tests
- [ ] `200` or `201` — success with valid input
- [ ] `400` — missing required fields
- [ ] `422` — validation error (wrong format/type)
- [ ] `401` — missing auth token
- [ ] `401` — expired/invalid token
- [ ] `403` — valid token, insufficient permissions
- [ ] `404` — resource not found
- [ ] `405` — wrong HTTP method
- [ ] `409` — conflict (duplicate, concurrent update)
- [ ] `429` — rate limiting (if applicable)
- [ ] `500` — upstream dependency failure (mock it)

## Response Body Tests
- [ ] Response matches defined schema
- [ ] No sensitive data exposed (passwords, tokens, internal IDs)
- [ ] Pagination fields present (if list endpoint): `page`, `limit`, `total`, `items`
- [ ] Date fields are ISO 8601 format
- [ ] IDs are correct type (UUID, int, etc.)

## Request Validation Tests
- [ ] Missing required fields → 400/422
- [ ] Wrong field type (string instead of number) → 400/422
- [ ] Extra unknown fields handled (ignored or rejected)
- [ ] Max length exceeded → 400/422
- [ ] Special characters in string fields
- [ ] Null values in nullable vs non-nullable fields

## Security Tests
- [ ] SQL injection attempt in string fields
- [ ] XSS attempt (`<script>alert(1)</script>`) in string fields
- [ ] Insecure Direct Object Reference (IDOR) — can user A access user B's resource?
- [ ] Auth token from different environment doesn't work

## List / Pagination Tests (if applicable)
- [ ] Default pagination returns expected count
- [ ] `page=2` returns correct offset
- [ ] `limit=0` handled gracefully
- [ ] `limit=9999` capped at max
- [ ] `sort=field` applies correctly
- [ ] `filter=value` returns correct subset
- [ ] Empty results: returns `[]` not 404

## Performance Baseline
- [ ] Response time < 200ms (p95) under normal load
- [ ] No N+1 query (check DB query count)
