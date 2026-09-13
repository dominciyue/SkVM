# Trace-guided skill optimization

## Purpose and boundary

This development component turns already-recorded agent execution evidence into a new, reviewable skill package. It reuses JIT-optimize proposals, JIT-boost and the existing Skill IR/API/Env construction and checking backends. It does not read held-out inputs, start a historical prospective runner, rewrite frozen results, or infer human savings.

The active implementation authority is `docs/superpowers/plans/2026-09-13-api-task-usable-delivery.md` revision 2. The machine recovery point is `results/skill-ir/trace-guided-skill-optimization-20260913/status.json`.

## Runtime design

1. A trace adapter identifies a supported format by structural evidence rather than file name.
2. Each source record is converted to unified JIT evidence while retaining its source locator, representation level, diagnostics and unknown fields.
3. JIT-optimize projects the original skill plus all usable evidence into its existing proposal workspace. Passing evidence is still analyzed for supported efficiency, clarity and reusable construction opportunities; a failure is not required.
4. A partial-solidification layer adds the already-existing API Tester v2 generator/checker only where the trace and unchanged public contract justify it. Residual agent duties stay explicit.
5. The resulting package is consumed by a real agent in a normal task workspace and compared with the original skill under a matched route.
6. For execution-log optimization, the ordinary loop runs implementation selection and action-local program checks before choosing the candidate snapshot. It persists `round-N-validation/report.json`; imported source tasks are not replayed, and the new local executions are counted separately.
7. A rejected local program gets at most one targeted repair through the existing optimizer. Repair feedback names only affected actions and files and preserves the original validation expectations. The loop reruns only affected checks, reuses independent observations, and restores the entire dependency/shared-file group from baseline if repair still fails or escapes scope. Initial and repair reports remain separately reviewable.
8. Proposal diffing and package export treat interpreter caches (`__pycache__`, `.pyc`, `.pyo`, test/type caches and `node_modules`) as runtime transients, and diff paths are portable `/` paths. Exported-package verification remains stricter: injecting any such undeclared file after export breaks the exact closure.

Optimizer actions may carry evidence-bound constraints with `skill`, `task`, `environment`, or `unknown` scope. The workspace writes these sources to `.optimize/CONSTRAINT_SOURCES.json`; task paths, network conditions, example values, and observed output shapes are not promoted to permanent skill rules unless the skill sources independently establish them. Actions produced before this field existed remain valid.

Action validation is three-valued at the local level. A concrete failure rejects its dependency closure and any inseparable shared-file group. A missing/not-run observation propagates as unvalidated through the same relationships without becoming a failure. Independent passed actions survive. Program help without any task-behavior case remains `not-applicable`, never behavior-passed.

## Trace formats

The first implementation targets formats that are already present in this repository:

- SkVM/Skill IR `raw-runs.jsonl` rows produced by the Pi-backed development runner. These are run summaries with final stdout, task/skill/workdir locators, status and duration; they are not silently promoted to full conversations.
- `skill-ir-durable-runtime-trace-event/v1` JSONL emitted by the SkVM bare-agent loop. These are ordered runtime events; missing task text, result content and usage remain unknown.
- Existing native JIT conversation JSONL and the narrow `{task,outcome,issues,skill_feedback}` report remain compatible.
- `skill-ir-trace-guided-agent-consumption/v1` reports bind developer-generated Pi event arrays, checker quality and cache usage. The adapter follows the bound raw-trace digest and treats it as a conversation trace; an archived trace must first be extracted beside its report.

Malformed rows, unknown event kinds, absent usage, absent result content and missing referenced files produce located diagnostics. A single bad row must not discard independent valid records.

## Public entry points

- `src/jit-optimize/trace-adapters.ts`: format identification and conversion into adapted trace records.
- `loadEvidencesFromLogs` in `src/jit-optimize/task-source.ts`: expands adapted records into JIT `Evidence` values.
- `skvm jit-optimize --task-source=log`: unchanged user-facing optimization entry.
- `buildTraceGuidedApiTesterPackage` and `verifyTraceGuidedSkillPackage` in `src/jit-optimize/solidification.ts`: proposal-to-package construction and exact-closure verification.
- `bun scripts/skill-ir/trace-guided-api-tester-package.ts build|verify`: reproducible package construction and verification.
- `<package>/scripts/api-task-solidify.js --binding ... --workdir ... --out-dir ... --node ...`: portable ordinary-input execution entry. The binding and OpenAPI document are supplied at runtime; it does not depend on the six historical migration identities or their result counts.
- `bun scripts/skill-ir/trace-guided-api-tester-agent-run.ts ...`: real Pi-agent consumption harness. It copies the selected skill into a fresh ordinary work directory, prepares an independent v2 checker, and requires actual read/exec tool evidence when configured.
- `analyzeSkillConsumption` in `src/jit-optimize/consumption.ts`: distinguishes actual skill/helper tool calls from assistant claims.
- `deriveProgramValidationPlan` in `src/jit-optimize/validation-lifecycle.ts`: resolves optimizer-authored cases against declared evidence indices, task fixtures or workdir snapshots and derives reference-output digests before execution.
- `bun scripts/skill-ir/trace-guided-effect-analysis.ts --pairs ... --out ...`: rejects unmatched input, binding, model or runtime pairs and reports quality, duration and token fields separately.

## Evidence and accounting

Source bytes are bound by SHA-256. Optimizer, target-agent, evaluator and development-agent costs are separate. Missing usage is represented as unknown and never coerced to zero. Summary evidence and event traces are labeled by representation so downstream claims cannot treat a summary as a full trace. Developer-generated event traces are committed as `tar+gzip` archives indexed by `trace-archives.json`; extracting the single `raw-trace.json` member beside its report restores the digest-bound input without committing about 58 MiB of expanded event data.

## Verification

Focused tests cover format recognition, malformed rows, missing usage/result, unknown events, stable locators, summary-versus-trace labeling, consumption-report restoration and existing log compatibility. Solidification tests cover an original synthetic input, a parameterized integer/boolean/array variation, unsupported fallback, undeclared optimizer artifacts and exact package closure. Consumption tests reject text-only claims; effect tests reject unmatched pairs and quality regressions. A repository-real exposed development OpenAPI input also passes the bundled generator and independent checker.

The completed development panel used three matching skills from three repositories. The primary and candidate-226 packages contain the same helper digest and each passed real-agent runs on the original and variation input. Candidate-060 had one passing trace and correctly remained no-change. Across the four matched original/new pairs, deterministic quality remained 4/4 versus 4/4, duration fell 56.79% and output tokens fell 75.66%, while input tokens rose 62.86%, cache-read rose 73.75% and total observed tokens rose 60.59%. The effect is therefore `mixed`; provider pricing is unavailable and USD cost remains unknown.

The H9 existing-program case used the exposed Law To Markdown development row rather than a hand-authored action map. Its exact scorer row was 0.7/failed and conflicts with one permanent source heading rule, so the production chain retained the source semantics and did not claim the task was repaired. One optimizer run selected `scripts/law_to_markdown.py`, action-local execution passed, a renamed/changed/cross-directory synthetic input passed 12 independent checks, and a normal Pi agent discovered, invoked and reviewed the program without an entrypoint hint. The first package containing validation-created bytecode is retained as failure evidence; only the cache-free revision is selectable. This is reuse-path evidence, not paired optimization-effect evidence.

H10 exercised five predeclared changes without editing either package: empty locale objects with no task contract, an omitted optional Law decision in a new caller directory, a missing required input, a missing optional DOCX fallback dependency, and an inapplicable network-condition change. The revised independent harness passed all five while retaining the initial harness failure, exact nonzero program errors, zero broken-branch artifacts, residual agent duties, and unchanged package closures. The same stage fixed an acquisition parser defect at its actual caller: command spans now contribute only external references and Git-tree-backed file tokens; method-plus-route examples are not files, JSON pointers bind before `#`, and a single explicit missing file remains fail-closed. Historical acquisition reports were read-only and were not regenerated.

## Failure modes

- A structurally unsupported file is rejected with diagnostics rather than interpreted as a generic report.
- A missing task or skill locator prevents claims that require it but does not erase visible execution facts.
- A runtime trace without content can support ordering/tool-count diagnostics only.
- A run summary without turn events can support final-output and artifact analysis only.
- No local helper is allowed to guess remote business state, hidden reasoning, credentials or unobserved responses.
- Proposal files that were not declared by the optimizer are never silently shipped. They are recorded as excluded or restored-to-baseline differences; portable package paths reject Windows device names.
- Exit code 2 is an explicit unsupported/not-applicable result that returns control to the original skill workflow. Exit code 1 is a binding or implementation error and is not relabeled as unsupported.
- The helper output directory may not be inside (or contain) the task work directory. Use a new empty sibling directory; the binding-declared plan/report still land in the task work directory.
- One trace is insufficient evidence for a repeated transformation. A no-change result is valid and must not be converted into a package merely to meet a breadth target.
- A generated program's self-check is useful execution evidence but is not independent task correctness. Reference-output cases bind engine-derived digests; missing task files, reference bytes, credentials or runtimes remain action-local unresolved facts.
- A log-only candidate with concrete program failure cannot win merely because files changed. A candidate without sufficient local validation may remain an explicit draft; it is not described as behavior-passed.
- A repair cannot change an independent expected digest or smuggle unrelated files into the selected snapshot. Failed inseparable edits are rolled back together; a complete rollback is a no-change result and does not export an empty success package.
- Lower duration or output tokens do not establish savings when input/cache tokens rise and pricing is unknown.
