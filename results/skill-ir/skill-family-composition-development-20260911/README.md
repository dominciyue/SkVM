# Finite composition truth-table and constructor correction

Implementatione12c587.3016finite-value comparisons against a handwritten Boolean-object
oracle found0checker disagreements. Four intersected anyOf/oneOf construction tests initially
returned unresolved despite known valid full witnesses; candidate allOf merging discarded
choice groups. RED preserved. The shared-property off-diagonal case is a regression control.

The constructor now retains each same-instance choice group using mixed-radix selections,
then validates the candidate against the unchanged original-source checker and full shape.
Single-choice behavior and64variant/depth/node budgets remain. This is bounded candidate
construction, not exhaustive satisfiability or proof of full skill automation.

31tests/3788assertions, main tsc and strict comparison-script tsc pass. Five synthetic
construction patterns pass after the change. Original12real documents were then recomputed
and independently checked once: all12full artifacts are byte-identical to the prior branch
revision. panel/report.json binds each recomputed hash to the already committed full payload,
so identical multi-megabyte files are not duplicated. No new real gains are claimed for this
particular revision: body count remains971/1414, field coverage2961/3371.

```powershell
bun test ./src/skill-ir/api-schema-composition-property.test.ts ./src/skill-ir/api-schema-cases.test.ts ./src/skill-ir/api-schema-witness.test.ts ./src/skill-ir/api-schema-numeric-property.test.ts ./src/skill-ir/api-request-body-negatives.test.ts
bun results/skill-ir/skill-family-composition-development-20260911/compare-panel.ts --out=results/skill-ir/composition-panel-rerun
```

Use the pinned dependencies/runtime and a new output directory. Every changed payload would
be retained; every unchanged payload has a committed content-hash reference. No remote/model/
paid runtime calls. Development-agent costs separately unmeasured. No new-member first-run,
new real sample, new clean-checkout, source-validity or native-output conclusion is implied.
