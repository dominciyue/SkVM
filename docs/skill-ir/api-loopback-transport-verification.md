# Synthetic loopback transport verification

## Risk and applicability

Source-bound fragment/layout checks may still agree on a representation that the HTTP
transport interprets differently. Verify one controlled synthetic fixture through a real
local socket. This is not another real API sample and does not establish production behavior.

Fixture: POST /items/{id}, required path enum a/b, query enum a&b, repeated query array
of two distinct comma/space-containing strings, required ordinary header and constrained
JSON object. The server independently checks actual URL/header/body values using simple
handwritten predicates; it imports no schema adapter, constructor or checker. Valid body
returns200, invalid body422, wire mismatch409. These status triggers are explicit fixture
rules, never inferred from a real document's list of statuses.

Use one full positive specimen and every constructed body-negative specimen. Compare
actual status with the fixture rule and validate returned JSON against the explicit
response contract. Add one deliberately corrupted query delimiter; server must return409.
Record all request/response observations and failures; do not stop collecting at first failure.

Bind server strictly to127.0.0.1 on an ephemeral port. Client uses node:http with fixed
hostname and agent:false (no remote URL or proxy input), no redirect following, bounded
timeout/body. Always close server in finally. No external API, credentials, model or paid
calls. The runtime accounting separately reports loopback HTTP calls and remote calls0.

## Acceptance

TDD missing-module then one full-path test; every constructed negative must reach the
fixture's invalid-body branch, never a wire mismatch. Positive and intentional wire
corruption take their respective branches. Independent response schema checking passes.
Source text, code/lock hashes and observation data are archived. Native output/full skill,
business state, source independence, readiness and old0/6 remain unchanged.

## Actual execution

Unit test7assertions and strictscript typecheck pass. Archived evidence run has11calls:
1positive200,9body-negatives422,1intentionalquerycorruption409, all response contracts
checked. Unit execution and evidence capture together made22loopback calls,0remote/model/
paid calls. Both servers closed in finally. No claim about real API status triggers.

```powershell
bun test ./scripts/skill-ir/api-loopback-transport.test.ts
bun scripts/skill-ir/api-loopback-transport.ts --out=results/skill-ir/loopback-transport-reproduction.json
```

Full observations/source/code bindings: results/skill-ir/skill-family-response-schema-development-20260911/loopback-transport.json.
