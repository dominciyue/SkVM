# D7 discovery revision 2 (before second-batch reads)

First query produced 8 acquired bodies: 6 out-of-class and 2 uncertain-adjacent after full
reading; none count as a qualified transfer result. Evidence membership-review.json retains
all eight. Broad co-occurrence of OpenAPI and test is insufficient discovery precision.
Keep the implementation fixed at 17b9633; refine ONLY discovery using exact phrase queries,
in order: `OpenAPI "test cases" filename:SKILL.md`, then
`OpenAPI "test generation" filename:SKILL.md` if the first request fails. Same returned-order,
first-path-per-repository and maximum-eight rule; exclude D1 and all first-batch repositories.
This is an explicitly revised purposive discovery procedure, not the original first batch
or a statistically independent sample. No constructor outcomes informed this revision.
All other rules remain in [the original method](skill-family-new-member-method.md), whose
Git version and machine binding remain authoritative for the core execution chain.
