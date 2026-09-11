# Native pytest request development

## Source duty and design (2026-09-11)

LambdaTest api-to-testcase-generator SKILL.md lines47–55,109–127 explicitly requests
runnable pytest with requests or httpx, parameterization, setup and coverage gaps.
Its framework template has environment fixtures and HTTP assertions. Jeremy API
automation lines27,31,43–53,71–77 explicitly includes httpx/pytest, request execution,
response checks and native test files. Both archived full bodies and Lambda's
451-line template have been read as data, not followed as agent instructions.
Their illustrative fixed200/400/422 expectations are NOT per-operation authority.
Pactflow drift-YAML is not a pytest member; do not count it as native-format success.

The remaining gap is physical native execution, not HTML or command packaging.
Implement a separate source-bound pytest+httpx development suite. Share verified
form-enabled request specimens and their independent source/dependency checker.
Keep every case, unresolved reason, security and remaining duty; preserve a skipped
entry for an incomplete operation inventory, rather than removing that operation.
Old profiles, body-negative contracts and frozen v2 are unchanged.

## Narrow execution contract

- Emit fixed reviewed Python runtime plus data, never interpolate source prose,
  operation names or wire text into executable Python. Bind source bytes, suite
  bytes and runtime; independent verifier checks source-backed case universe,
  exact request values and runtime bytes without calling the suite constructor.
- Native collection is distinct from HTTP execution. With no explicit oracle,
  collected cases SKIP, not PASS. Existing failed construction also SKIPs with
  its original reasons. Security-bearing operations remain unexecutable here.
- Initial execution is synthetic loopback only: an external explicit oracle binds
  suite SHA, each case/request SHA, exact expected status, media and response bytes,
  and hand-written fixture identity. Never infer these from schema validity or
  documentation examples. Validate expected observations using the existing source
  response checker before running the fixture integration.
- HTTPX receives exact body bytes, target and source headers. Confirm prepared URL
  raw target and body are unchanged. Separate client per case; no inherited auth,
  cookies, environment proxy, redirects or retries. Loopback127.0.0.1 and an explicit
  port only; no source server is automatically selected. Five-second timeout and
  1MiB streamed response bound. This is not a transport for real credentials.
- Use Python3.12.13, pytest8.3.3 and httpx0.27.0 (installed versions verified locally).
  Record transitive dependencies and hashes for reproduction, not just version claims.

Basis: [HTTPX client API](https://www.python-httpx.org/api/),
[environment isolation](https://www.python-httpx.org/environment_variables/),
[pytest parameterization](https://docs.pytest.org/en/stable/how-to/parametrize.html).

## Acceptance and ordered work

1. TDD suite construction/independent binding verification: operation/case deletion,
   duplicates, request replacement, source/runtime drift; all unresolved rows kept.
2. TDD real Python collection/execution using hand-written synthetic fixture. Status,
   response body, field and wire corruptions must fail the intended assertion; no
   oracle means skip/no HTTP; redirects and ambient credentials must not escape.
3. Emit/collect the same12exposed sources; count constructed data, collected tests,
   skipped tests, executed HTTP and assertions separately. Real HTTP successes stay0
   without an authority. Integrate only the two actual pytest-compatible source duties,
   and retain full native/business obligations as partial where unsupported.
4. Archive first failures and full outputs, relevant regressions, Python/runtime
   dependencies, main/script typecheck and resume state. Then evaluate new clean
   reproduction of the accumulated development revisions, not the old frozen runner.

This stage is development; no new real skill or API source is acquired. Project
model/paid calls remain0; local fixture calls and developer-agent usage are separate.

## Implemented core checkpoint

`buildApiPytestSuite` emits suite JSON and fixed pytest runtime; `verifyApiPytestSuite`
independently validates the source-backed rows and runtime. Runtime bytes are normalized
LF before emitting/checking; only a suite SHA literal precedes the fixed code, never
source strings. Empty operation universes are explicitly unsupported (avoids pytest's
implicit empty-parameter sentinel masquerading as one source test).

`verifyApiPytestOracle` binds explicit fixture rules and reuses source response checking.
Unbound rows remain counted, not dropped. Fixture hash is provenance, not an assertion
that the fixture models a real API. Python uses raw UTF-8 body bytes and pytest-parametrized
requests; independent hand-written loopback predicates confirm physical reception.

First runtime attempt failed because HTTPX Response is not a context manager; replaced
that usage with try/finally close. Actual failed generated files and diagnostics retained
in skill-family-pytest-development-20260911/runtime-first-failure/ (old port no longer live).
Duplicate suite keys and empty universes also have preserved REDs before correction.
22tests/172assertions plus main typecheck pass;48local HTTP calls through core regression,
0remote/model/paid. Panel/native source-duty integration has not yet run at this checkpoint.

Native batch: `bun scripts/skill-ir/api-pytest-development.ts --inputs=<bound-index>
--out=<new-directory> --python=<explicit-python>`. It clears any oracle environment
variable, disables pytest plugin auto-loading and parent conftest discovery, and uses
isolated Python. JUnit counts must equal independently bound case counts; all tests
must be skipped with no oracle. Subprocess errors and per-input binding failures remain
rows, not a successful partial batch. Exact suites, Python, JUnit and stdout are retained.

Source-duty mapping profile `api-pytest-request-suite/v1` requires requestedOutputFormat
`pytest`, writes actual files and source verification, but explicitly reports runtime
not evaluated. Runtime collection is measured by the separate batch, never inferred
from successful file emission. Other profiles do not acquire new report fields.

`scripts/skill-ir/api-pytest-loopback.ts` is the reproducible fixture harness used by
the runtime unit test. It retains source, suite, Python, explicit oracle, each injected
oracle, JUnit/stdout per run and actual received request bytes. Three positive tests,
three no-oracle skips and15intentional faults (status/media/body/request binding/
redirect, three cases each) have separate results. Error detection requires all three
assertions at the named layer, not merely any process failure. Wrong rules are injected
after valid-oracle verification deliberately; this is not a way to bypass authority
in ordinary execution. Redirects are observed but not followed. Run with explicit
`--out=<new-directory> --python=<python>`; all listening sockets close in finally.

Archive correction: use `-I -B` explicitly; `-I` ignores the Python environment bytecode
flag. TDD no-cache check now passes. JUnit XML in this development archive uses `-text`
to preserve original failure-log CRLF bytes. Generated pyc files are not tracked or
dependencies; original output/first failure data and earlier commits remain preserved.
