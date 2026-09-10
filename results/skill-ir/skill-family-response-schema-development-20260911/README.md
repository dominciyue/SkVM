# Response-direction schema basis — development

Explicit createResponseSchemaChecker API retains response-required readOnly fields and
rejects writeOnly leakage; request APIs retain their original semantics. Directional
properties under composition remain unsupported. No request/response generator changed.
This is schema checking only, not proof of live response behavior or full skill output.

Initial missing-export RED and21test/115assertion GREEN are preserved in tests.json.
Main typecheck exit0. Next: explicit operation/status/media-bound offline observations,
distinguishing source examples from actual traffic and preserving unsupported schemas.

## Actual source measurement

Observation/catalog execution717f3a2 analyzes12 already-exposed documents:303 operations,
567 response declarations,365 media declarations,329 schema-compilable JSON declarations.
142 whole-body source example occurrences:130 valid,3 invalid,9 unresolved. Repeated
references/values are occurrences, not independent response samples. Live observations0.

The3 invalid examples are1Password Partnership Account.ends_at=null while the referenced
Account schema declares type:string/date-time without nullable. Original source lines97,
195,355 and512–517 confirm the mismatch. This is a source-example/schema inconsistency,
not evidence of actual API failure; neither source nor checker was loosened to pass it.
Two unresolved occurrences are non-JSON, seven are unsupported Zapier schemas. Other
uncompiled schema declarations have explicit diagnostics; empty example lists stay empty.

first-run/ archives the entire catalog and per-example diagnostics. Non-JSON omission and
reference-locator RED failures before this run are in observation-catalog-tests.json.
Seven focused tests47assertions, prior response/request21tests115assertions and main/
strictscript typechecks pass. Existing native output/auth/status-trigger duties remain unmet.

```powershell
bun scripts/skill-ir/api-response-schema-development.ts --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/response-source-reproduction
bun test ./src/skill-ir/api-response-schema.test.ts ./src/skill-ir/api-response-observation.test.ts ./scripts/skill-ir/api-response-schema-development.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

This is not a clean-environment reproduction claim for the new response capability.

## Source-duty integration b003133

The pure analyzer moved unchanged into src/skill-ir/api-response-catalog.ts;11focused
tests50assertions and main/strictscript typecheck pass. Lambda emit-test-code, Jeremy
response-validation and Pactflow emit-drift each execute the1Password/Front pair. All6
catalogs equal the archived full-input catalogs exactly. Each member retains3 source
example mismatches and every source duty not-fully-verified; native output is not implemented.
integration-evidence.json records the comparison. These are not additional real samples.

```powershell
bun scripts/skill-ir/skill-family-baseline.ts --config=results/skill-ir/skill-family-response-schema-development-20260911/cross-member-config.json --out=results/skill-ir/response-member-reproduction
```
