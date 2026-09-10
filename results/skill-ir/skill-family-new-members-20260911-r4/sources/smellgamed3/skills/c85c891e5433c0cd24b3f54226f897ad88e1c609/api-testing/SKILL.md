---
name: api-testing
description: Use when testing REST APIs, debugging HTTP requests, or validating API responses. Covers curl usage, Postman workflows, authentication methods, and common testing strategies for web services.
---

# API Testing

## Overview

API testing validates that web services function correctly by sending HTTP requests and verifying responses. This skill provides guidance for testing REST APIs using various tools and techniques.

**Core principle:** Test at the boundary - API tests catch integration issues that unit tests miss and are faster than UI tests.

## When to Use

```
Need to test or debug APIs?
│
├─ Quick API check?
│  └─ Use curl for one-off requests
│
├─ Exploratory testing?
│  └─ Use Postman or Insomnia for GUI
│
├─ Automated testing?
│  └─ Use REST testing frameworks
│
├─ Performance testing?
│  └─ Use Apache Bench or wrk
│
└─ Contract testing?
   └─ Use OpenAPI/Swagger specs
```

**Use this skill when:**
- Debugging API endpoints
- Writing automated API tests
- Validating response formats
- Testing authentication
- Checking error handling
- Performance testing APIs

**When NOT to use:**
- For unit testing (use unit test frameworks)
- For UI testing (use browser automation)

## Quick Reference

### HTTP Methods

| Method | Description | Idempotent |
|--------|-------------|------------|
| GET | Retrieve resource | Yes |
| POST | Create resource | No |
| PUT | Update/replace resource | Yes |
| PATCH | Partial update | No |
| DELETE | Remove resource | Yes |
| HEAD | Headers only | Yes |
| OPTIONS | Allowed methods | Yes |

### Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Valid auth, insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate or state conflict |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unhandled server error |

## curl Basics

### Simple GET Request

```bash
curl https://api.example.com/users
```

### POST with JSON Data

```bash
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

### POST with Authentication

```bash
curl -X POST https://api.example.com/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"John"}'
```

### Verbose Output (Debugging)

```bash
curl -v https://api.example.com/users
```

### Include Response Headers

```bash
curl -i https://api.example.com/users
```

### Save Response to File

```bash
curl -o response.json https://api.example.com/users
```

### Follow Redirects

```bash
curl -L https://api.example.com/redirect
```

## Authentication Methods

### Bearer Token

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  https://api.example.com/protected
```

### Basic Auth

```bash
curl -u username:password https://api.example.com/protected
# or
curl -H "Authorization: Basic $(echo -n 'username:password' | base64)" \
  https://api.example.com/protected
```

### API Key

```bash
curl -H "X-API-Key: your-api-key" https://api.example.com/users
```

### OAuth 2.0 Flow

```bash
# 1. Get authorization code (browser interaction)
curl https://api.example.com/oauth/authorize \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "redirect_uri=YOUR_REDIRECT_URI" \
  -d "response_type=code"

# 2. Exchange code for access token
curl -X POST https://api.example.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTH_CODE_FROM_STEP_1",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uri": "YOUR_REDIRECT_URI"
  }'

# 3. Use access token
curl -H "Authorization: Bearer ACCESS_TOKEN" \
  https://api.example.com/protected
```

## Common Testing Scenarios

### CRUD Operations

```bash
# CREATE - POST
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com"
  }'

# READ - GET
curl https://api.example.com/users/123 \
  -H "Authorization: Bearer $TOKEN"

# UPDATE - PUT
curl -X PUT https://api.example.com/users/123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "John Smith",
    "email": "john.smith@example.com"
  }'

# PATCH - Partial Update
curl -X PATCH https://api.example.com/users/123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Jane Doe"}'

# DELETE
curl -X DELETE https://api.example.com/users/123 \
  -H "Authorization: Bearer $TOKEN"
```

### Testing Pagination

```bash
# First page
curl "https://api.example.com/users?page=1&limit=10"

# Using Link header
curl -I https://api.example.com/users?page=1 | grep -i link

# Extract next page URL
curl -s https://api.example.com/users | jq -r '.next'
```

### Testing Filters and Search

```bash
# Query parameters
curl "https://api.example.com/users?status=active&role=admin"

# Multiple filters
curl "https://api.example.com/products?category=electronics&price_lt=100"

# Full-text search
curl "https://api.example.com/search?q=laptop&filters=brand:apple"
```

### Error Handling Tests

```bash
# Test missing required fields
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John"}' \
  # Missing email field

# Test invalid data
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"email": "invalid-email"}'

# Test unauthorized access
curl https://api.example.com/protected \
  # Missing auth header

# Test rate limiting
for i in {1..100}; do
  curl https://api.example.com/users
done
```

## Advanced curl Techniques

### Testing with Cookies

```bash
# Save cookies to file
curl -c cookies.txt https://api.example.com/login \
  -d "username=user&password=pass"

# Use saved cookies
curl -b cookies.txt https://api.example.com/protected
```

### Multipart File Upload

```bash
curl -X POST https://api.example.com/upload \
  -F "file=@document.pdf" \
  -F "description=Important document"
```

### Testing from Specific IP

```bash
curl --interface 192.168.1.100 https://api.example.com/users
```

### Measure Response Time

```bash
curl -w "@curl-format.txt" -o /dev/null -s https://api.example.com/users
```

**curl-format.txt:**
```
time_namelookup:  %{time_namelookup}s\n
time_connect:     %{time_connect}s\n
time_starttransfer: %{time_starttransfer}s\n
time_total:       %{time_total}s\n
http_code:        %{http_code}\n
```

## Postman Workflows

### Organizing Collections

```
My API Collection
├── Auth
│   ├── Login
│   └── Refresh Token
├── Users
│   ├── List Users
│   ├── Get User
│   ├── Create User
│   ├── Update User
│   └── Delete User
└── Products
    ├── List Products
    └── Get Product
```

### Using Variables

```javascript
// Pre-request Script (set token)
pm.test("Set token", function () {
    const response = pm.response.json();
    pm.environment.set("access_token", response.token);
});

// Use variable in request
{{access_token}}
{{base_url}}
{{user_id}}
```

### Writing Tests in Postman

```javascript
// Status code check
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Response time check
pm.test("Response time < 500ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(500);
});

// JSON structure check
pm.test("Response has correct structure", function () {
    const json = pm.response.json();
    pm.expect(json).to.have.property('id');
    pm.expect(json).to.have.property('name');
});

// Value validation
pm.test("User is active", function () {
    const json = pm.response.json();
    pm.expect(json.status).to.eql('active');
});
```

## Automated Testing

### Using REST Client (VS Code)

Install REST Client extension, create `http-tests.rest`:

```http
### Get all users
GET https://api.example.com/users
Authorization: Bearer {{TOKEN}}

###

### Create user
POST https://api.example.com/users
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}

###

### Get user by ID
GET https://api.example.com/users/123
Authorization: Bearer {{TOKEN}}
```

### Using Python with requests

```python
import requests
import pytest

BASE_URL = "https://api.example.com"
TOKEN = "your-token"

def test_get_users():
    response = requests.get(
        f"{BASE_URL}/users",
        headers={"Authorization": f"Bearer {TOKEN}"}
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_user():
    data = {
        "name": "John Doe",
        "email": "john@example.com"
    }
    response = requests.post(
        f"{BASE_URL}/users",
        json=data,
        headers={"Authorization": f"Bearer {TOKEN}"}
    )
    assert response.status_code == 201
    assert response.json()["name"] == "John Doe"

def test_update_user():
    data = {"name": "Jane Doe"}
    response = requests.patch(
        f"{BASE_URL}/users/123",
        json=data,
        headers={"Authorization": f"Bearer {TOKEN}"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Jane Doe"
```

## Performance Testing

### Apache Bench (ab)

```bash
# 100 requests, 10 concurrent
ab -n 100 -c 10 https://api.example.com/users

# With authentication
ab -n 1000 -c 20 \
  -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/users

# POST requests
ab -n 100 -c 10 \
  -p data.json \
  -T "application/json" \
  https://api.example.com/users
```

### wrk (Modern alternative)

```bash
# 10 threads, 100 connections, 30 seconds
wrk -t10 -c100 -d30s https://api.example.com/users

# With Lua script for POST
wrk -t4 -c10 -d30s \
  -s post.lua \
  https://api.example.com/users
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not testing error cases | Test 400, 401, 403, 404, 500 responses |
| Hardcoding URLs | Use environment variables |
| Ignoring response time | Monitor and set thresholds |
| Not testing pagination | Test multiple pages |
| Missing auth tests | Test expired/invalid tokens |
| Not validating JSON schema | Use schema validation tools |

## Debugging Tips

### Enable Verbose Logging

```bash
# curl verbose mode
curl -v https://api.example.com/users

# Show request and response headers
curl -i https://api.example.com/users

# Trace time for each operation
curl --trace-ascii trace.txt https://api.example.com/users
```

### Pretty Print JSON

```bash
# Using jq
curl https://api.example.com/users | jq .

# Using python
curl https://api.example.com/users | python -m json.tool
```

### Save and Inspect Responses

```bash
# Save response
curl -o response.json https://api.example.com/users

# Inspect with jq
cat response.json | jq '.data[0].name'
```

## Resources

- **REST API Tutorial**: https://restfulapi.net/
- **curl Manual**: https://curl.se/docs/manual.html
- **Postman Learning Center**: https://learning.postman.com/
- **OpenAPI Specification**: https://swagger.io/specification/

**Remember:** API tests should be fast, reliable, and independent. Mock external dependencies and use test databases to ensure consistency.
