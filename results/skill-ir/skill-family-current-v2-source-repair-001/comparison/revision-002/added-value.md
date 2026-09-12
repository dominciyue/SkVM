# N13 external comparison and bounded added value

This is development evidence on two deterministic synthetic loopback fixtures. It does not establish live API behavior or research transfer.

## Controlled comparison

- Schemathesis 4.27.0; positive fuzzing; at most 2 examples per operation; one worker; 5-second request timeout; 30-second run timeout; zero retries; deterministic seed 20260912.
- The SkVM baseline and Schemathesis use the exact N5 source bytes and hand-written predicates. SkVM executed 4 requests; Schemathesis baseline executed 3 requests (3 unique wire requests).
- External baseline runs passed 0/2. Actual results: json-reference=fail, form-wire=fail.
- Named response faults were detected by their assigned Schemathesis checks in 3/3 cases; missed=-3, not-applicable=3. undocumented-status:detected, missing-response-header:detected, invalid-response-body:detected.

Timing is reported per run in the machine report, but it is not used for a throughput ranking: Schemathesis performs randomized/property-based execution while SkVM emits deterministic task-selected witnesses.

## Measured integration value

- Traceability: 18/18 required obligations retain requirement, operation, artifact and checker-local status; 8 are checked-exported and 10 remain explicitly unresolved.
- Task conditioning: the same zapier-embed source produced different semantic plans and required outcomes for n10-zapier-embed-lambda-rich versus n10-zapier-embed-pactflow; constructed counts are 12 versus 1.
- Offline replay: bundle binding replay=true, documented CLI executed=true, repository-agnostic dispatch=true, project model calls=0.
- Explainable partial output: 5 incomplete tasks retain 10 located obligation reasons rather than disappearing from the denominator.

## Boundaries

Schemathesis already provides OpenAPI-derived property-based testing and response checks; this project does not claim that invention. External-tool success does not replace the SkVM package checker, and SkVM traceability does not increase the external-tool pass count. The comparison does not prove superiority over Schemathesis or other API testing tools.
