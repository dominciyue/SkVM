# Existing-body relatedness review

Development only. The fixed lexical rule compared 54 archived primary bodies / 1431
pairs, with 0 source hash/read failures and 2 review flags. No new acquisition or model
calls. Full pair table, source indices, byte hashes and code hash are in report.json.

1. Pactflow / fxellence: exact body copy, already excluded from independent-member
   counting in r2 membership-review.json line21. No change to membership or runtime data.
2. LambdaTest / FrancoStino OpenAPI spec generator: 1135 shared / 1343 union five-token
   shingles, Jaccard0.8451228592702904. Main agent read both complete archived bodies.
   FrancoStino lines5–6 explicitly attribute LambdaTest; the shared workflow skeleton,
   specification examples and separate test-generator handoff match. Differences include
   frontmatter/attribution, a When to Use section and final limitations. This is a known
   attributed derivative, not an independent new constructor. The old r2 review line18
   already classified it out-of-class-known-origin with runtimeTasks0. No prior result
   or denominator needs correction, and the original review remains unchanged.

This check supports the prior exclusion decisions; it does not establish independent
genealogy of the other bodies. Repository-distinct/nonidentical and source-declared
responsibility remain the strength of D7 evidence. Low overlap is not an authorship test.

Reproduce from repository root with Bun1.3.14:

```powershell
bun test scripts/skill-ir/skill-family-source-relatedness.test.ts
bun scripts/skill-ir/skill-family-source-relatedness.ts --out=results/skill-ir/source-relatedness-rerun
```

The output directory must be new. Existing six source indices are explicit inputs;
nested resource SKILL files are not counted as new members. No downloaded code runs.
