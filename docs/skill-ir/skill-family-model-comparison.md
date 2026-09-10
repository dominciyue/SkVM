# D6 matched model comparison (development)

Question: can the shared deterministic constructor replace model calls for the bounded
minimal/full request-schema witness duty? This is not a full original-skill benchmark.
Use three already reviewed skill bodies and exactly two already exposed input documents:
onepassword-partnership and brex-budgets. For each, select the lexicographically first
operation containing an application/json request body, independent of model output.
The documents were chosen for date/format and nested/composition duties found in D4.
They are development examples, not random/unseen samples. Six matched member-input tasks.

Both arms receive the same source schema and referenced components, request semantics,
and minimal/full output requirements. The model additionally receives the source skill
body as task context. No existing constructed values are in the prompt. Both arms are
graded by api-schema-checker, including independent minimal/full shape checks. Preserve
raw first answers, failures, runtime, token usage and every HTTP attempt. No repair arm
or best-of selection. Transport failures may use the provider's existing bounded retry
policy; repeated results never replace first semantic answers.

Reuse configured xty/gpt-5.6-sol route, existing provider and Node HTTP transport; no
route mutation/probing. Fixed temperature 0 and maximum output 8192 tokens. These are
experiment parameters, not a user spending cap. Record provider-reported cost when
available, otherwise null/unmeasured (not zero or invented catalog price). Development
agent costs and human minutes are separately unmeasured. Credentials stay in process
environment/stdin and must not enter prompts, evidence or console output.

Full source-responsibility extraction remains agent-reviewed; first onboarding required
shared code development and declarative analysis. This matched test measures subsequent
bounded witness construction, not full native pytest/Drift output or live API behavior.

## First results

Six first answers, six HTTP attempts, no transport retry. Deterministic values: 12/12;
model values: 11/12. Lambda/Brex full value is schema-valid but omits declared writable
properties, caught by the same shape checker used for the deterministic arm. This is one
designed coverage obligation, not evidence of general model inferiority. Model usage:
24,999 input and 1,827 output tokens; billing amount absent in all six raw responses.
The gateway returned both gpt-5.6-sol and gpt-5.6-sol-2026-07-09 aliases, retained in raw
responses; no claim of directly verified vendor/model provenance.

Measured construction time totals: deterministic 122.9982 ms, model end-to-end 140965.4523 ms.
These six development microtasks do not measure review labor, onboarding cost or full skill
execution. No human-time savings claim. Source extraction/first integration used development
agent work, whose token/cost accounting is outside the produced task runtime and unmeasured.

Evidence: `results/skill-ir/skill-family-deepening-20260911/model-comparison-first/`.
The script was uncommitted at execution on base e75c8d7; execution-sources.json binds its
actual unchanged source files, and the following archive commit includes them. A new run
requires a new output directory; inspect existing attempt/response files before any retry.

```powershell
bun scripts/skill-ir/skill-family-model-comparison.ts --baseline=results/skill-ir/skill-family-deepening-20260911/request-cases-cross-member-first/report.json --out=results/skill-ir/skill-family-deepening-20260911/model-comparison-reproduction --model=xty/gpt-5.6-sol
```
