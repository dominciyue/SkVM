---
name: api-test
description: >
  Test REST and GraphQL APIs, database queries, and service contracts. Load when asked
  to test HTTP endpoints, validate response schemas, do contract testing, test authentication
  flows, test database interactions, or verify API error handling. Supports pytest+httpx,
  Jest+Supertest, RestAssured, Postman/Newman, Pact, and database testing (SQL, MongoDB).
  Includes field-level assertions, IDOR testing, rate limit testing, and mobile API patterns.
  Trigger phrases: "test the API", "API test", "HTTP test", "endpoint test", "contract test",
  "test the endpoint", "REST test", "GraphQL test", "Postman", "schema validation",
  "database test", "DB test", "RestAssured", "test service", "integration test API".
metadata:
  author: qa-skill-suite
  version: '4.0'
---

# API Test Skill
## REST · GraphQL · Database · Contract · Mobile API

## When to Use This Skill

- User has an API endpoint to test (REST or GraphQL)
- User wants schema/contract validation
- User wants to test auth flows, RBAC, IDOR
- User wants database-level testing
- User wants to test mobile backend APIs

---

## Agent Persona

**Act like a senior QA engineer with 20 years of experience.**

- Use plain, clear English. Short sentences. No robot language.
- Be direct. If something is wrong or missing, say it straight.
- Share real experience. Say things like: *"I've seen this miss bugs in production before"* or *"Most teams skip this, but it matters."*
- Always explain WHY a test matters, not just what to do.
- Point out risks even when the user didn't ask.

**Language standard:** Write all output in B1-level English. Simple words. Active voice. One idea per sentence.

---

## Output Review Loop

**After producing any output, the agent MUST run this self-check and include the result at the bottom.**

```
My Self-Check:
  [ ] Happy path — covered
  [ ] Error / failure cases — at least 2 covered
  [ ] Boundary values — covered (if numbers or ranges exist)
  [ ] Empty / null / zero inputs — covered
  [ ] Auth / permission — covered (if feature has login)
  [ ] Nothing obvious missing that a real user would try
  [ ] Output is complete — no "TODO" or "add more" placeholders

Verdict: COMPLETE / INCOMPLETE
If INCOMPLETE — what I still need to add: [list]
```

---
## Input Schema

**Collect ALL mandatory fields before generating tests. Ask if not provided.**

```yaml
INPUT REQUIRED:
  # --- Mandatory ---
  endpoint:               # HTTP method + path. e.g., "POST /api/users"
                          # Multiple endpoints: list all

  # --- Strongly Recommended ---
  request_spec:           # Describe the request:
                          # headers: [Authorization: Bearer, Content-Type: application/json]
                          # body fields: [{name, type, required, constraints}]
                          # path params: [{name, type}]
                          # query params: [{name, type, optional}]

  response_spec:          # Expected response(s):
                          # success: {status: 201, body_fields: [id, name, email, createdAt]}
                          # errors:  [{status: 422, when: "email missing"}, ...]

  auth_type:              # none | bearer_token | api_key | session_cookie | oauth2 | basic
                          # Default: bearer_token

  language:               # python | typescript | javascript | java | go | csharp
                          # Default: detect from context or python

  # --- Optional ---
  base_url:               # e.g., http://localhost:8000
                          # Default: http://localhost:8000

  user_roles:             # Roles to test RBAC with. e.g., [admin, user, guest]

  schema_definition:      # OpenAPI spec snippet OR JSON schema for response validation

  test_db:                # true | false — also verify DB state after mutations
                          # Default: false

  existing_tests:         # Paste existing test code to detect gaps

  special_scenarios:      # e.g., ["concurrent requests", "large payload", "unicode in name"]
```

---

## Output Contract

**ALL sections are mandatory. Never produce partial output.**

> *"A 200 OK test is the easy part. The real work is testing what happens when the token expires, the user doesn't own the resource, or the database is down. That's where production bugs live."*


### Section 1 — Endpoint Analysis
```
Endpoint:         [METHOD /path]
Auth:             [auth type]
Request body:     [fields with types + required flag]
Response (2xx):   [status + body shape]
Response (errors): [list of error codes + conditions]
Roles to test:    [list]
Schema provided:  yes | no (agent will infer if no)
```

### Section 2 — Test Matrix
One row per test case. Agent must cover ALL status codes.

| TC-ID | Method + Path | Scenario | Expected Status | Assertion Focus |
|---|---|---|---|---|
| API-[MOD]-[TYPE]-001 | POST /api/users | Valid payload | 201 | id present, schema valid |

**Mandatory status code coverage — generate test for EACH applicable code:**
| Code | Condition | Required? |
|---|---|---|
| 200/201 | Valid input, success | ✅ Always |
| 400 | Malformed request body | ✅ Always |
| 422 | Each required field missing | ✅ One per field |
| 422 | Wrong field type | ✅ One per typed field |
| 401 | No auth token | ✅ If auth required |
| 401 | Invalid/expired token | ✅ If auth required |
| 403 | Wrong role (RBAC) | ✅ If roles defined |
| 403 | IDOR (access other user's data) | ✅ If resource-scoped |
| 404 | Non-existent ID | ✅ If ID in path |
| 409 | Duplicate resource | ✅ If unique constraint |
| 429 | Rate limit exceeded | ⚠️ If rate limiting exists |
| 500 | Upstream failure (mocked) | ✅ Always |

### Section 3 — Test File (complete, runnable)
```[language]
# Full test file including:
# - imports + base config
# - auth fixture
# - ALL test cases from matrix above
# - schema definition for response validation
# - cleanup (delete test data in afterAll/teardown)
# - comments on IDOR + security cases
```

### Section 4 — Response Schema Definition
```json
// JSON Schema for each response type
// Validates: field presence, types, formats, enum values
// additionalProperties: false (no undocumented fields)
```

### Section 5 — Field-Level Assertion Checklist
For each response field:
```
[ ] id:        present, type string/uuid, not null
[ ] name:      present, type string, length >= 1
[ ] email:     present, matches email regex
[ ] createdAt: present, ISO 8601 datetime format
[ ] password:  ABSENT (must not be in response)
[ ] [field]:   [assertion]
```

### Section 6 — Test Coverage Summary
```
Endpoints covered:      [N]
Total tests:            [N]
Happy path:             [N]
Error/validation:       [N]
Security (IDOR/auth):   [N]
DB-level verified:      [N] (if test_db=true)
Gaps:                   [list any uncovered scenarios + reason]
```

---

## Workflow

1. **Map the API** — method, URL, auth, request body, expected responses
2. **Classify tests** — functional, security, performance, contract
3. **Choose framework** — from stack table
4. **Generate test code** — runnable, with all auth/headers
5. **Add schema validation** — every response must be validated structurally
6. **Add security checks** — IDOR, auth bypass, injection (basic)
7. **Run checklist** — per-endpoint completion gate

## Framework Selection

| Stack | Framework | Notes |
|---|---|---|
| Python | pytest + httpx | Async-native, clean |
| Node/TS (in-process) | Jest + Supertest | No real server needed |
| Node/TS (external) | axios + Jest | Real server |
| Java | RestAssured | Fluent DSL |
| Go | net/http/httptest | Zero deps, built-in |
| C# | RestSharp + xUnit | Clean .NET |
| Ruby | RSpec + Faraday | Idiomatic Ruby |
| Any (collections) | Postman + Newman | GUI + CLI |

## Test Pattern Library

### Pattern 1: Basic Status Code + Schema (Python/httpx)

```python
import pytest
import httpx
from jsonschema import validate

BASE_URL = "http://localhost:8000"
USER_SCHEMA = {
    "type": "object",
    "required": ["id", "name", "email", "createdAt"],
    "properties": {
        "id":        {"type": "string"},
        "name":      {"type": "string", "minLength": 1},
        "email":     {"type": "string", "format": "email"},
        "createdAt": {"type": "string", "format": "date-time"},
        "role":      {"type": "string", "enum": ["user", "admin"]}
    },
    "additionalProperties": False  # no extra fields allowed
}

@pytest.fixture
def client():
    return httpx.Client(base_url=BASE_URL)

class TestGetUser:
    def test_returns_200_for_existing_user(self, client, auth_header):
        r = client.get("/api/users/user-123", headers=auth_header)
        assert r.status_code == 200

    def test_response_matches_schema(self, client, auth_header):
        r = client.get("/api/users/user-123", headers=auth_header)
        validate(instance=r.json(), schema=USER_SCHEMA)  # raises if invalid

    def test_all_required_fields_present(self, client, auth_header):
        r = client.get("/api/users/user-123", headers=auth_header)
        body = r.json()
        assert all(k in body for k in ["id", "name", "email", "createdAt"])

    def test_no_sensitive_fields_in_response(self, client, auth_header):
        r = client.get("/api/users/user-123", headers=auth_header)
        body = r.json()
        assert "password" not in body
        assert "passwordHash" not in body
        assert "internalId" not in body
```

### Pattern 2: Full CRUD (TypeScript/Supertest)

```typescript
import request from 'supertest';
import { app }  from '../app';
import { db }   from '../db';

describe('Users CRUD', () => {
  let token: string;
  let createdUserId: string;

  beforeAll(async () => {
    // Get auth token
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'test-password' });
    token = res.body.access_token;
  });

  afterAll(async () => {
    // Clean up test data
    if (createdUserId) await db.users.delete(createdUserId);
  });

  describe('POST /api/users — Create', () => {
    it('creates user with valid data → 201', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test User', email: `test+${Date.now()}@example.com` });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Test User' });
      expect(res.body.id).toBeDefined();
      createdUserId = res.body.id;
    });

    it('returns 422 when email is missing', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'No Email' });
      expect(res.status).toBe(422);
      expect(res.body.errors).toContainEqual(
        expect.objectContaining({ field: 'email' })
      );
    });

    it('returns 409 for duplicate email', async () => {
      const email = `dup+${Date.now()}@example.com`;
      await request(app).post('/api/users').set('Authorization', `Bearer ${token}`)
        .send({ name: 'First', email });
      const res = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`)
        .send({ name: 'Second', email });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/users/:id — Read', () => {
    it('returns 404 for non-existent id', async () => {
      const res = await request(app)
        .get('/api/users/non-existent-999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });
});
```

### Pattern 3: Auth & RBAC Tests

```python
class TestAuthorization:
    """Test authentication and role-based access control"""

    def test_no_token_returns_401(self, client):
        assert client.get("/api/profile").status_code == 401

    def test_invalid_token_returns_401(self, client):
        r = client.get("/api/profile",
            headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code == 401

    def test_expired_token_returns_401(self, client, expired_token):
        r = client.get("/api/profile",
            headers={"Authorization": f"Bearer {expired_token}"})
        assert r.status_code == 401

    def test_regular_user_cannot_access_admin_endpoint(self, client, user_token):
        r = client.delete("/api/admin/users/any-id",
            headers={"Authorization": f"Bearer {user_token}"})
        assert r.status_code == 403

    def test_idor_user_cannot_access_other_users_data(self, client):
        """IDOR: User A cannot read User B's profile"""
        token_a = login("user_a@example.com", "password")
        token_b = login("user_b@example.com", "password")

        # Get User B's ID
        user_b_id = get_user_id("user_b@example.com")

        # Try to access User B's data as User A
        r = client.get(f"/api/users/{user_b_id}/private-data",
            headers={"Authorization": f"Bearer {token_a}"})
        assert r.status_code == 403, "IDOR: User A accessed User B's data!"
```

### Pattern 4: GraphQL Tests

```python
def test_graphql_user_query_returns_data(client, auth_header):
    query = """
    query GetUser($id: ID!) {
        user(id: $id) { id  name  email }
    }
    """
    r = client.post("/graphql",
        json={"query": query, "variables": {"id": "user-123"}},
        headers=auth_header)
    assert r.status_code == 200
    body = r.json()
    assert "errors" not in body, f"GraphQL errors: {body.get('errors')}"
    assert body["data"]["user"]["id"] == "user-123"

def test_graphql_returns_error_for_unknown_field(client, auth_header):
    r = client.post("/graphql",
        json={"query": "{ unknownField }"},
        headers=auth_header)
    assert r.status_code == 200
    assert "errors" in r.json()
```

### Pattern 5: Database Testing (SQL with pytest)

```python
from sqlalchemy import text

def test_user_created_in_database(db_session, client, auth_header):
    """Verify API write actually persists to DB correctly"""
    email = f"dbtest+{uuid4()}@example.com"

    # Act via API
    r = client.post("/api/users",
        json={"name": "DB Test User", "email": email},
        headers=auth_header)
    assert r.status_code == 201
    user_id = r.json()["id"]

    # Verify directly in DB
    result = db_session.execute(
        text("SELECT id, name, email FROM users WHERE id = :id"),
        {"id": user_id}
    ).fetchone()

    assert result is not None
    assert result.email == email
    assert result.name  == "DB Test User"

def test_password_stored_as_hash_not_plaintext(db_session, client):
    """Security: passwords must never be stored in plaintext"""
    email = f"sec+{uuid4()}@example.com"
    client.post("/api/users",
        json={"email": email, "password": "MySecret123!"})

    result = db_session.execute(
        text("SELECT password, password_hash FROM users WHERE email = :e"),
        {"e": email}
    ).fetchone()

    if hasattr(result, 'password'):
        assert result.password != "MySecret123!", "Password stored in plaintext!"
    assert result.password_hash.startswith("$2b$") or \
           result.password_hash.startswith("$argon2"), "Not using bcrypt/argon2"
```

### Pattern 6: Mobile API Patterns (thin client simulation)

```python
# Simulate mobile client behavior
MOBILE_HEADERS = {
    "User-Agent": "MyApp/2.3.1 (iPhone; iOS 17.2; Scale/3.00)",
    "X-App-Version": "2.3.1",
    "X-Platform": "ios",
    "Accept-Language": "en-US,en;q=0.9",
}

def test_api_works_with_mobile_client_headers(client):
    r = client.get("/api/feed", headers={**MOBILE_HEADERS,
        "Authorization": f"Bearer {get_token()}"})
    assert r.status_code == 200

def test_outdated_app_version_returns_426(client):
    """Server should tell old app versions to upgrade"""
    r = client.get("/api/feed", headers={
        **MOBILE_HEADERS,
        "X-App-Version": "1.0.0",  # very old
        "Authorization": f"Bearer {get_token()}"
    })
    assert r.status_code in [200, 426]  # 426 = Upgrade Required
```

### Pattern 7: Pagination & List Endpoints

```python
class TestPagination:
    def test_default_page_returns_first_20(self, client, auth_header):
        r = client.get("/api/users", headers=auth_header)
        body = r.json()
        assert len(body["items"]) <= 20
        assert "total" in body
        assert "page"  in body
        assert "limit" in body

    def test_page_2_returns_different_items(self, client, auth_header):
        page1 = client.get("/api/users?page=1&limit=5", headers=auth_header).json()
        page2 = client.get("/api/users?page=2&limit=5", headers=auth_header).json()
        ids_p1 = {u["id"] for u in page1["items"]}
        ids_p2 = {u["id"] for u in page2["items"]}
        assert ids_p1.isdisjoint(ids_p2), "Pages contain overlapping items"

    def test_empty_results_returns_empty_list_not_404(self, client, auth_header):
        r = client.get("/api/users?role=nonexistent_role", headers=auth_header)
        assert r.status_code == 200
        assert r.json()["items"] == []
```

### Pattern 8: RestAssured (Java)

```java
import io.restassured.RestAssured;
import static io.restassured.RestAssured.*;
import static org.hamcrest.Matchers.*;

public class UserApiTest {

    @BeforeAll
    static void setup() {
        RestAssured.baseURI = "http://localhost:8080";
    }

    @Test
    void getUser_withValidId_returns200WithCorrectSchema() {
        given()
            .header("Authorization", "Bearer " + getToken())
        .when()
            .get("/api/users/{id}", "user-123")
        .then()
            .statusCode(200)
            .body("id",    notNullValue())
            .body("name",  not(emptyString()))
            .body("email", matchesRegex(".*@.*\\..*"))
            .body("$",     not(hasKey("password")));   // no password in response
    }

    @Test
    void createUser_withMissingEmail_returns422() {
        given()
            .header("Authorization", "Bearer " + getToken())
            .contentType("application/json")
            .body("""{"name": "No Email User"}""")
        .when()
            .post("/api/users")
        .then()
            .statusCode(422)
            .body("errors.field", hasItem("email"));
    }
}
```

## API Test Checklist (Per Endpoint)

```
Status Codes:
[ ] 2xx success — valid input
[ ] 400/422 — missing required fields
[ ] 400/422 — wrong field format/type
[ ] 401 — missing token
[ ] 401 — invalid/expired token
[ ] 403 — valid token, wrong role
[ ] 404 — resource not found
[ ] 409 — duplicate resource
[ ] 429 — rate limiting hit
[ ] 500 — upstream failure (mock it)

Response Body:
[ ] Schema validated (all fields, types, formats)
[ ] No sensitive data exposed (password, token, SSN, etc.)
[ ] Pagination meta present (list endpoints)
[ ] Error body has useful message (not generic "error")

Security:
[ ] IDOR tested (cannot access other users' resources)
[ ] XSS payload in string fields does not execute
[ ] SQL injection attempt rejected
[ ] Rate limiting active on sensitive endpoints
```

---

## Advanced Testing Patterns

### Pattern 1: Consumer-Driven Contract Testing (CDCT)

Traditional API testing checks one side. Contract testing checks that the consumer AND provider BOTH agree on the API shape.

**The problem it solves:**
```
Without contract testing:
  - Frontend team tests their mock → passes
  - Backend team tests their code → passes
  - Both deploy → production breaks because the mock was wrong

With contract testing:
  - Consumer writes: "I expect POST /login to return {token: string}"
  - Provider proves: "I do return {token: string}"
  - Mismatch caught BEFORE deployment
```

**Pact — Python consumer test:**
```python
from pact import Consumer, Provider, Like, Term
import requests

pact = Consumer('Frontend').has_pact_with(Provider('AuthAPI'), pact_dir='./pacts')

def test_login_contract():
    expected_body = {
        "token": Like("eyJhbGciOiJIUzI1NiJ9..."),  # any string
        "expires_at": Term(r'\d{4}-\d{2}-\d{2}', "2026-12-31"),  # date format
        "user": {
            "id": Like(42),         # any integer
            "email": Like("user@example.com"),  # any string
            "role": Term(r'user|admin', "user")  # must be user or admin
        }
    }
    
    (pact
     .given("valid credentials exist for user@example.com")
     .upon_receiving("a login request with valid credentials")
     .with_request(
         method="POST",
         path="/api/auth/login",
         headers={"Content-Type": "application/json"},
         body={"email": "user@example.com", "password": "correct_password"}
     )
     .will_respond_with(
         status=200,
         headers={"Content-Type": "application/json"},
         body=expected_body
     ))
    
    with pact:
        response = requests.post(
            pact.uri + "/api/auth/login",
            json={"email": "user@example.com", "password": "correct_password"}
        )
        assert response.status_code == 200
        body = response.json()
        assert "token" in body
        assert body["user"]["role"] in ["user", "admin"]
```

**Key Pact matchers to know:**
```python
Like("value")           # Any value of the same type (string, int, etc.)
EachLike({"id": 1})     # Array where each element matches the template
Term(r'regex', "example")  # Value matching a regex pattern
```

---

### Pattern 2: OpenAPI / Schema Contract Validation

Every API endpoint should be validated against its OpenAPI (Swagger) spec. This catches when code drifts from documentation.

**Python — schemathesis for automatic OpenAPI testing:**
```python
import schemathesis

# Load your OpenAPI spec and auto-generate tests
schema = schemathesis.from_path("openapi.yaml")

@schema.parametrize()
def test_api_conforms_to_spec(case):
    """Auto-generates test cases for every endpoint in the spec."""
    response = case.call()
    case.validate_response(response)  # response must match schema definition

# Stateful testing — schemathesis chains related API calls
@schema.parametrize()
@settings(max_examples=100)
def test_api_stateful(case):
    """Tests multi-step flows: create user → get user → delete user."""
    response = case.call_and_validate()
    assert response.status_code not in [500]  # no server errors ever
```

**Manual JSON Schema validation (pytest + jsonschema):**
```python
import pytest
import jsonschema
import requests

# Define schema once, reuse across tests
USER_SCHEMA = {
    "type": "object",
    "required": ["id", "email", "created_at"],
    "properties": {
        "id":         {"type": "integer", "minimum": 1},
        "email":      {"type": "string", "format": "email"},
        "role":       {"type": "string", "enum": ["user", "admin", "guest"]},
        "created_at": {"type": "string", "format": "date-time"},
        "password":   {"not": {}}  # MUST NOT exist in response
    },
    "additionalProperties": False  # no extra fields allowed
}

def test_get_user_response_schema():
    response = requests.get("/api/users/1", headers=auth_headers())
    assert response.status_code == 200
    
    body = response.json()
    # Validate against schema — raises ValidationError if wrong
    jsonschema.validate(body, USER_SCHEMA)
    
    # Extra business rule checks
    assert "@" in body["email"]
    assert "password" not in body  # password must NEVER appear in API response

def test_list_users_pagination_schema():
    response = requests.get("/api/users?page=1&limit=10", headers=auth_headers())
    body = response.json()
    
    list_schema = {
        "type": "object",
        "required": ["data", "total", "page", "limit"],
        "properties": {
            "data":  {"type": "array", "items": USER_SCHEMA},
            "total": {"type": "integer", "minimum": 0},
            "page":  {"type": "integer", "minimum": 1},
            "limit": {"type": "integer", "minimum": 1, "maximum": 100}
        }
    }
    jsonschema.validate(body, list_schema)
    assert len(body["data"]) <= body["limit"]
```

---

### Pattern 3: API Chaos & Fault Injection Testing

Real systems fail. Chaos testing checks what happens when dependencies go down, responses are slow, or data is corrupted.

**What to inject and what to verify:**
```
Fault Type             | What to Inject              | Expected System Behavior
-----------------------|-----------------------------|----------------------------------
Latency injection      | Delay response by 5-30s     | Timeout after configured limit, return 503
Connection refused     | Kill the dependency service | Fallback to cache or default response
Error response         | Return 500 from dependency  | Retry 3x, then fail gracefully
Malformed response     | Return invalid JSON         | Handle parse error, return 500 with message
Auth failure           | Return 401 from dependency  | Re-auth or return meaningful error to client
Partial response       | Return incomplete payload   | Validate schema, handle missing fields
Rate limiting          | Return 429                  | Back-off + retry or queue request
```

**Python — requests-mock for fault injection:**
```python
import pytest
import requests
import requests_mock as req_mock

def test_api_handles_upstream_timeout():
    """When payment service is slow, our API must timeout and return 503."""
    with req_mock.Mocker() as m:
        m.post(
            "https://payment-service/charge",
            exc=requests.exceptions.Timeout
        )
        
        response = requests.post(
            "/api/checkout",
            json={"amount": 100, "card": "tok_visa"},
            headers=auth_headers()
        )
        
        assert response.status_code == 503
        body = response.json()
        assert body["error"] == "payment_service_unavailable"
        assert "retry_after" in body  # must tell client when to retry

def test_api_retries_on_500_then_succeeds():
    """Service should retry failed dependency call up to 3 times."""
    call_count = 0
    
    def response_generator(request, context):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            context.status_code = 500
            return {"error": "internal"}
        context.status_code = 200
        return {"status": "charged", "transaction_id": "txn_123"}
    
    with req_mock.Mocker() as m:
        m.post("https://payment-service/charge", json=response_generator)
        
        response = requests.post("/api/checkout", json={"amount": 50})
        
        assert response.status_code == 200  # eventually succeeded
        assert call_count == 3              # retried exactly 3 times

def test_api_handles_malformed_upstream_response():
    """When upstream returns invalid JSON, API must handle it gracefully."""
    with req_mock.Mocker() as m:
        m.get("https://user-service/users/1", text="NOT_VALID_JSON!!!")
        
        response = requests.get("/api/profile/1", headers=auth_headers())
        
        assert response.status_code == 502  # Bad Gateway
        assert response.json()["error"] == "invalid_upstream_response"
```

**k6 fault injection (performance + chaos combined):**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

// Simulate real-world failure: 5% of requests inject a bad auth token
export let options = {
  vus: 50,
  duration: '2m',
};

export default function() {
  const corruptToken = Math.random() < 0.05;  // 5% of users send bad token
  
  const headers = corruptToken
    ? { 'Authorization': 'Bearer INVALID_TOKEN' }
    : { 'Authorization': `Bearer ${__ENV.VALID_TOKEN}` };
  
  const res = http.get('https://api.example.com/orders', { headers });
  
  if (corruptToken) {
    check(res, { 'invalid token → 401': (r) => r.status === 401 });
  } else {
    check(res, { 'valid token → 200': (r) => r.status === 200 });
  }
  
  sleep(1);
}
```

---

### Pattern 4: GraphQL-Specific Testing

GraphQL APIs need different test patterns than REST. The single endpoint and flexible queries create unique risks.

**What to test in GraphQL:**
```
1. Schema Integrity       — Types, fields, nullability match expectations
2. Query Testing          — Basic queries return correct data
3. Mutation Testing       — Data mutations work and return correct shape
4. Nested Query           — Deep nesting resolves correctly
5. Error Format           — Errors appear in errors[] array (not HTTP 4xx)
6. Introspection Security — Schema not exposed in production
7. Query Complexity       — Deep/complex queries are rate-limited or rejected
8. Authorization          — Field-level auth works (user can't read admin fields)
```

**Python — pytest + gql client:**
```python
import pytest
from gql import gql, Client
from gql.transport.requests import RequestsHTTPTransport

@pytest.fixture
def gql_client():
    transport = RequestsHTTPTransport(
        url="https://api.example.com/graphql",
        headers={"Authorization": f"Bearer {TEST_TOKEN}"}
    )
    return Client(transport=transport, fetch_schema_from_transport=True)

def test_get_user_query(gql_client):
    query = gql("""
        query GetUser($id: ID!) {
            user(id: $id) {
                id
                name
                email
            }
        }
    """)
    result = gql_client.execute(query, variable_values={"id": "1"})
    assert result["user"]["id"] == "1"
    assert "password" not in result["user"]  # security: password must not appear

def test_graphql_error_format_on_invalid_query(gql_client):
    """GraphQL errors must be in errors[] array, HTTP status stays 200."""
    query = gql("""
        query { user(id: "999999") { id nonExistentField } }
    """)
    # GQL errors come back in result["errors"], not as HTTP 4xx
    import requests
    response = requests.post(
        "https://api.example.com/graphql",
        json={"query": "{ user(id: 999999) { nonExistentField } }"},
        headers={"Authorization": f"Bearer {TEST_TOKEN}"}
    )
    assert response.status_code == 200  # GraphQL always returns 200
    body = response.json()
    assert "errors" in body
    assert body["errors"][0]["message"]  # must have a message

def test_introspection_disabled_in_production():
    """Schema introspection must be OFF in production — security risk."""
    import requests
    response = requests.post(
        "https://api.example.com/graphql",
        json={"query": "{ __schema { types { name } } }"}
    )
    body = response.json()
    # In production, introspection should be blocked
    assert "errors" in body or body.get("data", {}).get("__schema") is None

def test_query_depth_limit(gql_client):
    """Deeply nested queries must be rejected to prevent DoS."""
    deep_query = """
        { user { friends { friends { friends { friends { id name } } } } } }
    """
    import requests
    response = requests.post(
        "https://api.example.com/graphql",
        json={"query": deep_query},
        headers={"Authorization": f"Bearer {TEST_TOKEN}"}
    )
    body = response.json()
    # Should be rejected with a query depth/complexity error
    assert "errors" in body
    assert any("depth" in str(e).lower() or "complex" in str(e).lower()
               for e in body["errors"])
```

---

### Pattern 5: IDOR & Authorization Testing (API Security)

IDOR (Insecure Direct Object Reference) is one of the most common and serious API vulnerabilities. User A should never be able to access User B's data.

**IDOR test pattern:**
```python
import pytest
import requests

class TestIDORPrevention:
    """Every resource endpoint must prevent cross-user access."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.user_a = login("alice@example.com", "password123")
        self.user_b = login("bob@example.com", "password456")
        # User A creates a resource
        self.order = create_order(self.user_a["token"], amount=100)
        self.order_id = self.order["id"]
    
    def test_user_can_read_own_order(self):
        """User A can read their own order."""
        response = requests.get(
            f"/api/orders/{self.order_id}",
            headers={"Authorization": f"Bearer {self.user_a['token']}"}
        )
        assert response.status_code == 200
    
    def test_user_cannot_read_another_users_order(self):
        """IDOR: User B must NOT be able to read User A's order."""
        response = requests.get(
            f"/api/orders/{self.order_id}",
            headers={"Authorization": f"Bearer {self.user_b['token']}"}
        )
        assert response.status_code in [403, 404]
        # 403 = access denied (preferred — honest)
        # 404 = hide that resource exists (also acceptable for security)
    
    def test_user_cannot_update_another_users_order(self):
        """IDOR: User B must NOT be able to modify User A's order."""
        response = requests.patch(
            f"/api/orders/{self.order_id}",
            json={"status": "cancelled"},
            headers={"Authorization": f"Bearer {self.user_b['token']}"}
        )
        assert response.status_code in [403, 404]
    
    def test_sequential_id_enumeration_is_blocked(self):
        """Sequential IDs make IDOR easy. Test that guessing adjacent IDs fails."""
        for delta in [-1, -2, +1, +2]:
            guessed_id = self.order_id + delta
            response = requests.get(
                f"/api/orders/{guessed_id}",
                headers={"Authorization": f"Bearer {self.user_b['token']}"}
            )
            # Should not be able to enumerate other users' orders
            if response.status_code == 200:
                body = response.json()
                assert body.get("user_id") == self.user_b["id"], \
                    f"IDOR vulnerability: user_b accessed order {guessed_id} belonging to another user"
    
    def test_unauthenticated_access_is_blocked(self):
        """No token = no access. Always."""
        response = requests.get(f"/api/orders/{self.order_id}")
        assert response.status_code == 401
```

---

## Output Review — How to Review Agent's Work

**You can paste the agent's output back and ask for a review.**

Use this prompt:
```
Review this output. Act like a senior QA manager with 20 years of experience.
Tell me:
  1. What test scenarios did you miss?
  2. What is the biggest risk we are NOT testing?
  3. Is this output complete enough to ship? Yes or No, and why.

[paste the output here]
```

The agent will then re-check its own work and give you an honest gap report.

---

## References

- `references/httpx-guide.md` — async client, session, auth
- `references/supertest-guide.md` — with Express/Fastify/NestJS
- `references/restassured-guide.md` — RestAssured with Spring Boot
- `references/pact-guide.md` — Consumer-Driven Contract Testing
- `assets/templates/api-test-checklist.md` — per-endpoint checklist
- `assets/templates/postman-collection-template.json` — base collection
