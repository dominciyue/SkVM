# Branch-sensitive negative construction — development

Implementation3011413. Original real reports remain unchanged. The first-full-witness-only
limitation was reproduced on synthetic nested referenced anyOf/oneOf schemas. A permissive
competitor additionally revealed a primitive-parent mutation crash; the RED is retained.
That crash is fixed by retaining unresolved when the mutation parent is not an object.

The constructor now lazily reuses alternative source-valid/full-shape witnesses from the
remaining original64variants, then tries the existing exact-target mutations. The original
independent checker is unchanged. Already-successful negative rows and positive baseline
specimens remain exact. No source identity-specific logic, guessed status or relaxed predicate.

## Actual effect

12documents/303operations, unchanged3371field and1414body obligations.20new verified negatives:
5Adatree Consent and15Front Core. Field coverage2941→2961; full body-negative requests951→971,
443stillunresolved. These are overlapping views of the same20values, not40independent successes.
All12independent report checks pass; original successful rows, source/runtime fields and full
baseline specimens are unchanged. Two incomplete body inventories remain. Binary format,
required-on-string and other unsupported/unavailable cases were not deleted or made successful.

Three existing source responsibilities each reuse the same change on the two affected inputs:
6tasks pass, each full artifact equals the corresponding new panel artifact. Each member has
742constructed/905body obligations and163unresolved. Native output/full source duties remain
not-fully-verified. This is development integration, not new-member first runs or new API samples.

25tests/245assertions plus main typecheck pass. Strict comparison-script tsc passes. All full
first-run/ and cross-member/ outputs are retained, alongside per-case before/after data in
comparison.json and integration-comparison.json. compare-initial.ts matches the first comparison's
original script digest; compare.ts is the later integration-aware revision. Neither prior report
nor digest is overwritten. Recorded run durations are individual observations, not speed claims.

## Reproduce

Use pinned dependencies/runtime in docs/skill-ir/skill-family-clean-reproduction.md, and new
output paths. Do not run frozen001/002 or acquire inputs:

```powershell
bun test ./src/skill-ir/api-schema-cases.test.ts ./src/skill-ir/api-schema-witness.test.ts ./src/skill-ir/api-schema-numeric-property.test.ts ./src/skill-ir/api-request-body-negatives.test.ts
bun scripts/skill-ir/api-request-specimens-development.ts --profile=body-negatives --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/branch-body-rerun
bun scripts/skill-ir/skill-family-baseline.ts --config=results/skill-ir/skill-family-branch-negatives-development-20260911/cross-member-config.json --out=results/skill-ir/branch-member-rerun
```

The comparison scripts are fixed evidence collectors for the archived output directories;
they do not perform construction. Current clean evidence bindsbe89a50, before this change;
do not claim a later clean run from those files. No runtime remote/model/paid calls; developer
agent costs separately unmeasured. Historic0/6/readiness and D7 first attempts remain unchanged.
