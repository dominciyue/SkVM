# JSON wire ambiguity correction — development

Parent2a8722d; originalcheckers accepted duplicate names with schema-valid last values.
red.json preserves two observed false acceptances. Tests additionally cover nested and
escaped names after repair. green.json contains26test/317assertion output and typecheck.
Only two new-development body checker predicates changed; generator/support unchanged.

recheck.json contains fresh checks of12 archived field reports and12 archived assembled
reports, all pass. Inputs and whole report files are digest-bound. No regeneration,
no new real sample, no API/model/paid runtime calls. Development-agent cost is not measured.

From repository root with the fixed dependencies/runtime documented in
docs/skill-ir/skill-family-clean-reproduction.md:

```powershell
bun test ./src/skill-ir/api-request-cases.test.ts ./src/skill-ir/api-request-specimens.test.ts ./src/skill-ir/api-parameter-wire.test.ts ./src/skill-ir/api-skill-mapping.test.ts ./scripts/skill-ir/skill-family-baseline.test.ts
bun results/skill-ir/skill-family-json-wire-development-20260911/recheck.ts
node node_modules/typescript/bin/tsc --noEmit
```

The recheck script is read-only and prints evidence. Prior reports remain unchanged.
Earlier clean-run evidence proves d088f4e, not this later correction. Local artifact
pass does not prove receiver behavior, full skill completion, readiness or human savings.
