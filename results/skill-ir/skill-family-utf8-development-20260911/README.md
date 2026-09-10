# Strict UTF-8 development ingestion correction

TDD reproduced silent replacement in both new batch runners and all four new source-duty
profiles. A raw-SHA-matching source with0xff in its JSON title was previously accepted
as different decoded text. All original RED outputs remain in tests.json. Missing helper/
export RED is distinguished from actual erroneous acceptance; no source failure is called
success merely because the file digest matched.

Shared fatal decoder now preserves valid UTF-8/BOM/literal U+FFFD without normalization and
rejects malformed encodings. Source failures stay in their input/task rows; valid siblings
continue. Batch indices also decode strictly before parsing. Historical v2 raw-file dispatch
and frozen parsers/contracts are not modified. Mapping metadata and the general SKILL loader
are outside this correction; this is not a repository-wide byte-hardening claim.

Final19tests/94assertions and strict affected-module/script typecheck pass. Exposed-inputs.json
records12/12 unchanged decoded texts, byte round trips and original body/response artifact
source hashes. The input-only change does not justify regenerating all unchanged artifacts;
none were regenerated. Existing clean evidence continues to bind be89a50, not this revision.
Source-file hashes of the correction are retained in the report.

Reproduce with pinned Bun1.3.14 and existing dependencies, from repository root:

```powershell
bun test ./src/skill-ir/development-utf8.test.ts ./src/skill-ir/api-skill-mapping.test.ts ./scripts/skill-ir/api-request-specimens-development.test.ts ./scripts/skill-ir/api-response-schema-development.test.ts
bun results/skill-ir/skill-family-utf8-development-20260911/check-exposed-inputs.ts --out=results/skill-ir/utf8-input-recheck.json
```

Use a new output report path. API/model/paid runtime calls0; development-agent costs separately
unmeasured. Official TextDecoder semantics and scope are in docs/skill-ir/development-input-decoding.md.
