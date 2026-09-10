# Request assembly development, first evidence

Initial run:12 inputs,303 operations,628 planned cases,608 constructed,20 unresolved,
26 constructed required-presence negatives,2 incomplete case inventories (Zapier body
reference siblings).283 operations had all planned cases constructed. This is not the
same metric as field-level schema/wire completion, nor full skill or live API validity.

KNOWN CORRECTNESS ISSUE before promotion: initial assembly treated declared DELETE request
bodies like POST bodies. OpenAPI3.0.3 Operation Object requestBody semantics do not establish
such method-wide support. First reports/source bindings are retained as pre-correction
evidence, not a final trustworthy assembly conclusion. Next revision must explicitly leave
operations with body declarations outside POST/PUT/PATCH unresolved and reject fabricated
constructed specimens for them. Do not remove declared bodies to manufacture success.

Initial synthetic assembly/mutation and batch tests7/7,47 assertions; main and explicit
script strict typecheck passed. Boundary RED detected malformed URI paths and duplicate
declaration handling, both corrected before first real run. Module/runner missing-module
RED observed before implementation. No network/model calls in runtime.

## Method correction

Initial implementation/report committed88b5c79 before repair. method-red.json records
both constructor and independent checker failures; method-green.json records18 tests,
286 assertions passing after repair, plus main typecheck exit0. Only Front-core and
Visier-analytics needed regeneration; method-inputs.json binds byte-identical copies of
the already exposed input files. method-revision-run/ contains their new evidence.
method-recheck.json freshly checks all12 original inputs against applicable reports:
the two old affected reports fail the corrected checker, all12 applicable results pass.

Current applicable totals:303 operations,628 planned cases,576 constructed,52 unresolved,
24 constructed required-presence negatives,2 incomplete inventories,268 operations with
all planned cases constructed. Use method-revision-run for those2 inputs and first-run
for the other10. These are report checks with explicit limits, not full document/API passes.

Offline reproduction into a fresh directory:

    bun scripts/skill-ir/api-request-specimens-development.ts --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/local-request-specimens

The current method reproduces corrected results, not the known-bad first-run totals.
Recover88b5c79 to reproduce the initial implementation. Source/lock/runtime bindings are
inside each run/report.json. No model/API runtime calls or native output claim.

The explicit declaration profile is integrated and measured in cross-member/: LambdaTest,
Jeremy and Pactflow each12 tasks,303 operations,576/628 assembled specimens,52 unresolved,
24 presence negatives. Different native output duties remain not implemented. This is a
new development capability on old members, not a fresh D7 test or48/36 independent inputs.
Mapping/profile regression7/7 with29 assertions; main and script typechecks pass.
