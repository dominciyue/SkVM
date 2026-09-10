# API contract driven offline test construction: development contract

The candidate class is defined by declared work: an API contract is input; a test/request
artifact is output; coverage and validity can be checked against that contract. Membership
does not depend on SkVM admission. The seven necessary public-structure family criteria
remain those in `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`.

The full bodies of seven selected skills were read. LambdaTest test generation, Jeremy API
test automation and Pactflow OpenAPI parser explicitly share spec parsing, construction of
constraint-respecting requests, negative cases and coverage accounting. Their author/project
identities and prose differ; this is evidence of three distinct repository origins, not a
complete genealogy audit. No exact body duplicates were found in the acquisition.

These are composite skills. Offline construction can be bounded by an explicit task contract,
while live status/response assertions, state setup, authorization, business workflows and CI
remain separately required duties. SkVM v2 emits a test plan/report and checks a restricted
case set. It does not currently emit the full pytest/Newman/Drift deliverables required by these
skills. A v2 operation pass cannot establish original-output or whole-responsibility completion.

The evidence table is `skill-responsibilities.json`. It separates body review, dependency
review, membership, output obligations and current support. It is an agent-authored source
analysis, not automatic natural-language compilation or human agreement. Review of a body
does not assert complete transitive resource closure. Unreviewed acquisition entries remain
unclassified; they cannot be included in the reviewed/member denominator.

Source caveats affect construction: LambdaTest and Jeremy give default error statuses without
proving every trigger; Jeremy's TypeScript examples contain Python-style comments; Pactflow's
stateful variants require known existing/non-existing data and its anyOf guidance is heuristic.
Task input contracts must supply actual status/trigger evidence; these examples are never an oracle
for arbitrary live APIs. Missing evidence is unresolved, not filled from endpoint names.

Initial shared mapping targets the complete declared request-case construction responsibility
as a candidate for partial implementation. Its obligation list is preserved even when v2 only
checks a subset. Explicit parameters are source input path/format, task identity, required
obligations and output format; no repository-specific algorithm or hand-written answer is allowed.
Runtime source/admission/projection/coverage/dependency/generator/checker remain common.

D4 will select at least two applicable actual API inputs per independent development member,
before candidate execution. D5 capability choice is deferred to observed cross-member failures.
D7 must fix method and mapping rules before obtaining any new-member bodies. All current 31
bodies and search-visible excerpts are development exposed.
