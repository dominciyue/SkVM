# Native wire preservation fixture (development)

This is a hand-written synthetic fixture for existing form/query/path/header behavior,
not an API oracle or a support expansion. `scripts/skill-ir/api-pytest-wire-loopback.ts`
emits a source-bound suite using the unchanged shared emitter, validates the explicit
response oracle, then executes actual isolated pytest/httpx against127.0.0.1 only.
The server compares literal raw path/query, header and form bytes; its predicates do not
use the generated request as expected truth. Full form returns200; absent required query
returns422. Status numbers are fixture rules, never inferred real source behavior.

## Actual findings and correction history

The first fixture incorrectly assumed field-level cookie support implied request
assembly support. All five cases were unresolved, so the empty oracle was rejected.
That original source/suite remains evidence. A second independent no-cookie operation
was added while retaining the entire cookie operation as an unresolved control; no core
code or original operation was altered to claim it supported. Of that second operation's
five cases, three minimal-shape cases remain unresolved: its array enum has length2 but
no minItems, so the contract's minimal length0 cannot be satisfied. Full and missing-query
cases construct. The initial expected5pass count failed and was corrected to the actual
2pass/8skip, not by weakening a checker or deleting rows.

One focused test/9assertions and explicit strict TypeScript check pass. Original failures
and revised output are retained separately. This fixture adds native evidence for
escaped path, exploded array query, inherited header and flat string form bytes; cookie
native execution and three minimal cases remain unvalidated. Previously archived15fault
injections remain the native assertion-layer evidence, not counted again here.

```powershell
bun scripts/skill-ir/api-pytest-wire-loopback.ts --out=<new-directory> --python=<explicit-venv-python>
bun test ./src/skill-ir/api-pytest-wire-runtime.test.ts
```

`source.json`, `suite.json`, Python code, oracle, JUnit and report include actual received
requests, stdout/stderr and fixture/script/source hashes. The service always closes in
finally. Native suite format, v2/readiness, all real panel results and original0/6 stay
unchanged. Unresolved is not pass; synthetic HTTP does not establish real API behavior.
