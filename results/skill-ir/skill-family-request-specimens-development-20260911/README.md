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
