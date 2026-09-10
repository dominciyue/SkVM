# Body-negative request assembly — development

Core execution commit a7cf0ce. first-run/ contains all12 exposed source inputs and full
embedded field/baseline evidence, not just counts. 303 operations,1414 body-negative
obligations,951 constructed,463 unresolved.128 operations contain obligations;94 have
at least one constructed request. Two body schema inventories remain incomplete.
12 report-integrity passes are not12 complete-document passes.

Unresolved:136 unsupported-url witness,180 validation-bearing reference siblings,
39 discriminator witness,40 bounded targeted-mutation failure,68 absent full baseline.
Do not replace these with guessed values, status codes or deletion of source obligations.

cross-member/ applies the explicit new profile through original three source-duty
mappings on Adatree consent and Brex budgets. Each has155 obligations/150constructed/
5unresolved;6 mapping tasks pass. This is development integration, not new-member first
run or6 independent API samples. The complete12-input denominator above remains primary.
Mapping code was added after a7cf0ce; integration-evidence.json binds exact source hashes
and the subsequent stage commit contains the adapter. Native output/full duties stay unmet.

## Reproduce

Use the fixed runtime/dependencies documented in docs/skill-ir/skill-family-clean-reproduction.md.
From repository root, choose new output paths:

```powershell
bun scripts/skill-ir/api-request-specimens-development.ts --profile=body-negatives --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/body-negatives-reproduction
bun scripts/skill-ir/skill-family-baseline.ts --config=results/skill-ir/skill-family-body-negatives-development-20260911/cross-member-config.json --out=results/skill-ir/body-negatives-member-reproduction
bun test ./src/skill-ir/api-request-body-negatives.test.ts ./src/skill-ir/api-skill-mapping.test.ts ./scripts/skill-ir/api-request-specimens-development.test.ts ./scripts/skill-ir/skill-family-baseline.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

RED missingmodule and unsupportedmapping evidence retained. Core25tests151assertions;
batch5tests46assertions; mapping12tests73assertions; main and explicitscript typecheck pass.
No project model/API/paid calls; development-agent cost separately unmeasured.
Previous d088f4e clean evidence is not a clean-run claim for this newer capability.
