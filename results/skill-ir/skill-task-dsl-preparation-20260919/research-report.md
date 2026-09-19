# Skill Task Structure, Classification, and DSL Preparation

Status: S0-S11 method preparation completed in development. All classification rules, examples, and DSL proposals in this report are agent-authored and provisional unless a source is cited explicitly.

## Executive conclusion

Proceed with a **bounded minimum implementation for offline preservation-constrained transformations**, not a production DSL system. The range is supported by legal conversion and two i18n task lineages: they share source/target identity, eligible-unit selection, protected spans or relations, non-destructive output, observable checks, ambiguity policy, and bounded agent judgment. The conditional alternative is constraint-backed artifact creation/repair, but only after narrowing to one artifact family.

The most promising method is a typed domain declaration interpreted into bounded agent context, with deterministic preflight/post-transform validators and optional operation adapters. It can express three sourced tasks plus a direct-authored skill without hiding missing inputs or professional judgment. Its feasibility judgment is **promising for a small prototype, unproven for effect**: all semantic probes here are manual; no model run, executed probe, production-code change, or effect experiment occurred.

The strongest counterargument remains live. Legal hierarchy reconstruction, document translation, locale migration, and OCR may share only a generic transformation shell; a carefully organized Markdown skill using the same helpers may perform just as well for less authoring cost. The next round should therefore implement only five bounded tasks and run helper-matched O/M/MH/DH comparisons. If shared rules do not produce observable cross-lineage effects or do not beat organized Markdown at the semantic quality floor, narrow or stop rather than expand the language.

## 1. Research purpose and scope

The classification purpose is to identify a task range whose members share domain concepts and usage semantics, and whose real effects are worth testing with a domain DSL.

The study must answer six connected questions:

1. Which parts of a skill package are loading and packaging conventions, and which parts actually determine task behavior?
2. Which tasks share reusable domain concepts and semantics, and which near-neighbors should remain outside the same range?
3. How does the working classification change a DSL scope or implementation decision rather than merely attaching labels?
4. What checkable or executable meaning would a DSL add beyond the original skill, a carefully reorganized Markdown baseline, and existing configuration or workflow languages?
5. How can the language expose judgment delegated to an agent, support direct authoring of a new skill, and map existing skills without silently dropping obligations?
6. What is the smallest next implementation, what existing SkVM infrastructure can it reuse, how should its effect be compared fairly, and what remains unresolved?

### 1.1 Hypotheses to challenge

- **H1 — semantic boundary:** task semantics will predict a reusable DSL boundary better than package shape, directory layout, or topic labels alone.
- **H2 — explicitness trade-off:** making domain rules explicit may improve completeness and constraint observance, but can increase authoring, runtime, or token cost.
- **H3 — bounded judgment:** a DSL can organize some professional judgment without pretending that every judgment is deterministically executable.

These are research hypotheses, not current findings. Classification revisions and counterexamples must be retained even when they weaken them.

### 1.2 Included work

- Reuse and correct existing development corpus records; add public sources specifically to reduce the API/testing bias.
- Read complete skill packages at the depth needed for task semantics, including directly relevant scripts, references, and templates.
- Build task-level structure cards; iterate a purpose-oriented working classification against counterexamples and mixed tasks.
- Compare at least three DSL usage routes plus a well-edited Markdown baseline using the same real task requirements.
- Walk through real examples, missing and conflicting inputs, judgment branches, and out-of-range tasks.
- Recommend a primary and alternative range, define a fair future comparison, and locate a three-to-five-task minimum implementation in the current codebase.

### 1.3 Excluded work

- No production compiler, new CLI, general orchestration platform, or broad architecture migration.
- No new held-out, prospective, readiness, or Q1 claim; no rewrite of frozen historical results.
- No full historical re-audit, sample-count gate, or repeated collection solely to fill time.
- No assumption that the old Skill IR or action schema is a mandatory intermediate representation.
- No claim that method preparation, syntactic validity, or manual execution proves a positive quality, cost, latency, or stability effect.

### 1.4 Completion evidence

Completion requires traceable sources and task structure cards, at least one recorded classification revision caused by challenge cases, three candidate-range comparisons, real-task DSL mappings and semantic walkthroughs, a primary/alternative recommendation (or an evidence-backed deferral), a fair effect design, and a bounded next implementation plan. JSON/JSONL parse checks, document-link checks, source spot checks, and an attributable commit/push close the work.

## 2. Starting state and preservation boundary

The study started on branch `skill-ir-aot` at `d8ff5b752fcf782b11f37e4505169e92595cebf6`. The checkout already contained 18 modified tracked paths reported by porcelain status (17 paths with content diffs) and 8,109 untracked files grouped into 231 porcelain entries. Those bytes are pre-existing work and are not evidence or deliverables of this study unless explicitly cited as already-existing context.

The user and taskbook require work in this checkout. No new branch or worktree will be created. New research artifacts are confined to this result directory until the final, attributable updates to existing shared documents. Shared files will be staged by this study's hunks only; unrelated modifications will remain unstaged.

Full baseline tests are not a meaningful S0 gate because this stage does not alter production code and the checkout already contains unrelated source changes. Verification is instead scoped to the research artifacts and documentation required by S11.

## 3. Method and related systems

The study separates four responsibilities that are often conflated: skill packaging, a domain DSL, an LLM programming interface, and behavior specification. The Agent Skills specification and Anthropic guidance describe packaging, progressive disclosure, resources, and evaluation practice, but do not define task semantics. Fowler/Joshi motivate separating a semantic model from surface syntax and execution; DSPy and LMQL organize or constrain model computation rather than supply this task domain; Gherkin shows the value of precondition/action/observable-result examples but still requires bindings. Nickerson's purpose-derived, empirical↔conceptual iteration informs the working classification without importing a claim of exhaustive or mutually exclusive taxonomy.

SkillsBench 1.1 and SWE-Skills-Bench provide useful warnings rather than transferred effect estimates: use paired task-level conditions, distinguish invocation from resolution, preserve negative cases, and report overhead. Their tasks, skill construction, and protocols differ from this study, so neither aggregate result selects a DSL range. Full source/version notes, source claims, project inferences, and limitations are in `research-notes.md`.

Four method decisions follow: task cards are task-level and distinguish loaded/read/run resources; classification is purpose-relative and separates membership, support, and evaluability; every DSL construct needs domain meaning, an executor/judge, missing-input behavior, and an observable consequence; and future effect work compares original skill, information-equivalent organized Markdown, and DSL, with a helper-matched ablation when new programs are introduced.

## 4. Corpus and task structures

The source registry contains 52 development packages: 31 previously acquired remote packages, six local pilots, and 15 newly pinned public packages. The prior acquisition is strongly concentrated in API generation/testing, QA, and contract checking. The additions deliberately cover document and spreadsheet transformation, iterative document work, visual design, interactive PDF use, configuration, security analysis, web research, external services, and meta-authoring. The additions improve structural contrast; they do not estimate ecosystem prevalence. Same-repository packages remain one lineage for independence arguments.

S3 deep-read 24 packages and produced 30 task cards. The panel includes at least these distinct structures:

- deterministic artifact transformation with domain validation (`law-to-markdown`, XLSX, PPTX, data validation);
- content synthesis or transformation whose quality remains semantic (`zh-readme`, skill document translation, co-authoring);
- interactive or live-state tool use (`view-pdf`, webapp testing, Vectara agents);
- policy- or authorization-gated external actions (purchasing, refunds, credential configuration);
- open-ended evidence and judgment loops (exploratory testing, web research, security/contract review, frontend design);
- task selection followed by a deterministic generator (experimental design and randomization);
- configuration synthesis with precedence, exposure, and write-scope rules (environment and VS Code configuration).

### 4.1 Card-field pilot and revision

The initial field pilot used three deliberately different tasks: legal document conversion, interactive document co-authoring, and collaborative PDF annotation. It exposed three weak fields in the earlier summaries:

1. Instruction length and raw step count did not change a range or runtime decision, so they were removed.
2. A single “mechanical versus judgment” pair hid user authorization and treated unimplemented conceptual guidance as agent execution. It was replaced by separate deterministic, agent-judgment, and user-judgment responsibilities plus explicit unread dependencies.
3. “Suspicious overhead” was an optimization hypothesis rather than task structure, so it was removed from the card. Cards instead separate structural checks from semantic checks and record a specific directory/keyword misclassification trap.

The retained schema records intent and completion, required/optional environment, domain objects and rules, flow/branches/feedback/user interaction, responsibility, outputs/checks, failure/partial completion, package roles and actual read depth, comparative notes, source positions, behavior evidence, and labeled inference/unspecified fields.

### 4.2 Findings from package-to-task decomposition

- One package is not one task. `i18n-helper` contains source scanning and locale migration; `experimental-design` contains design choice/generation, allocation, and conceptual sequential design; `skill-creator` contains package authoring and evaluation; the PDF package spans extraction/OCR and transformation/forms.
- One surface format is not one runtime semantic. Offline PDF extraction/transformation and interactive PDF markup share a file type but differ in state, authorization, completion, and checks. README synthesis, legal conversion, and co-authored specifications all emit Markdown but cannot share one correctness model.
- Identical package shapes can hide different domain predicates. The purchasing and refund examples both have a small policy, one tool, and one confirmation template; one requires manager approval and quantity, while the other requires date-window eligibility and order identity.
- Presence is not use. Except for the one summary-level Law-to-Markdown record, the deep-read cards are source-only. Unread scripts/references are named as unread; none is treated as executed behavior.
- Deterministic checks cover only encoded meaning. Workbook recalculation, presentation package validation, character fidelity, schema ranges, and JSON validity are valuable, but each leaves a separate business, visual, legal, scientific, or security-quality judgment.

The full provenance and bias account is in `sources.json`; task evidence and exact source positions are in `structure-cards.jsonl`.

## 5. Working classification and challenge results

The working classification is purpose-relative: it asks which tasks can share a domain semantic model, runtime obligations, and a fair effect comparison. It is not an ecosystem taxonomy. Application topic remains useful for discovery, and automation/verifiability remain useful for implementation and evaluation, but neither is the membership rule. The primary dimension is task purpose plus operation semantics; support status, evaluation mode, interaction mode, and topic are recorded separately so that an implemented task is not mistaken for a member and an easily scored task is not mistaken for a coherent domain.

The v0 seed used six deliberately varied tasks: law conversion, workbook creation/editing, exploratory testing, purchasing, experimental-design generation, and document co-authoring. Its ranges—artifact transform, artifact construct, review/investigate, stateful action, domain design, and co-create—failed on a different six-task batch. Skill translation exposed preservation semantics hidden by “transform”; environment templates exposed contract-backed construction; contract review exposed evidence and professional-oracle distinctions; interactive PDF work showed that state and feedback are auxiliary rather than a shared purpose; Vectara authentication separated configuration lifecycle from one-shot policy actions; and sequential design separated a judgment-guided plan from a bundled generator.

The resulting v1 has ten provisional ranges. Every range records an inclusion boundary, exclusion boundary, positive examples, near counterexamples, and the design consequence for a possible DSL. All 30 task cards have one provisional primary range, optional secondary semantics, an independent support status, and an independent evaluation mode. The assignment is complete and internally referentially valid.

S5 then challenged nine tasks chosen for topical traps, mixed packages, live state, incomplete dependencies, and near-boundary semantics. Eight primary assignments survived; one changed. Skill-package authoring moved from iterative-content-design to constraint-backed-artifact as its primary range, because its immediate deliverable is a package governed by explicit disclosure, description, reference, and script constraints; elicitation remains a secondary iterative-design semantic, and behavior evaluation is a separate task. Interactive PDF retained iterative content as primary but changed its secondary semantic from configuration lifecycle to policy-gated external action: reuse of a view identifier is state identity, while user approval directly gates each mutation.

The challenge deliberately did not force three boundary cases into false certainty. The PDF task card mixing source-backed operations with source-free creation must be split; OCR remains a provisional transform subtype whose recognition uncertainty is unresolved; and interactive PDF remains a cross-range case excluded from the proposed offline DSL. Ambiguity counts are non-exclusive: six tasks had semantic-boundary ambiguity, five had unread dependencies relevant to support detail, two packages contributed four distinct task cards, and five tasks exposed rule-granularity mismatch. These are diagnoses of a development challenge, not model errors, human agreement, accuracy, or held-out generalization.

## 6. Candidate ranges and recommendation

Three candidates were compared on the same seven criteria. The recommendation is **preservation-constrained offline transformation**; the alternative is **constraint-backed artifact creation/repair, only after narrowing to one artifact family**. Evidence-backed assessment is not selected now.

| Candidate | Member-derived common semantics | Existing-language pressure | Evaluation and minimum size | Decision |
|---|---|---|---|---|
| Preservation-constrained transform | Legal conversion and skill translation share source/target identity, eligible units, protected content, non-overwrite, and post-transform checks; the two i18n tasks additionally share placeholders and completeness. | gettext, AST/PDF tools, and Pandoc cover individual mechanics; Markdown can state obligations but does not type them or bind observable validators. | Strong partial oracles for identity, protected spans, completeness, output policy, and diagnostics; one schema/loader, plan renderer, validators, and three cross-lineage examples. | **Primary** |
| Constraint-backed artifact | XLSX, PPTX, environment contracts, and skill packages share artifact constraints, a machine-checkable floor, and separate semantic review. | Existing schemas, formulas, APIs, renderers, and package specs already carry most useful semantics. | Structural checks are strong, but each artifact needs a different adapter and semantic/visual oracle. | **Alternative after narrowing** |
| Evidence-backed assessment | Contract, security, exploratory, web-research, and environment tasks share evidence, location/source, claim, uncertainty/status, and stop/handoff. | SARIF, test reports, citations, and review templates cover parts; shared fields may be an evidence IR rather than a domain DSL. | Traceability is easy; professional correctness is costly and heterogeneous. A tiny schema would not establish effect. | Not selected |

The primary is not the smallest intersection of all skills. Its required semantics include eligible-unit selection, named protected spans or relations, transform intent, non-destructive output, completeness/fidelity checks, ambiguity policy, and an explicit agent-judgment contract. Variants retain legal hierarchy reconstruction, prose translation, and locale generation rather than erasing them into `steps` or `run_anything`.

The current independent core is legal conversion plus public skill-document translation plus local locale generation/checking. PDF OCR is a plausible member that the proposed implementation does not support: it would require OCR binding, confidence/page-geometry handling, and recognition-quality treatment. It therefore demonstrates that range membership is not the current pass set. Source-free synthesis, live interactive editing, assessment-only work, policy-gated transactions, and artifacts dominated by rendering/business semantics stay outside.

The strongest objection is substantive: legal reconstruction, translation, locale-key migration, and OCR may share only a generic transformation shell. The next implementation is justified only as a bounded method test. It must show that shared constructs have observable consequences across at least two independent lineages; otherwise the recommendation should retreat to narrower per-domain specifications or well-organized Markdown.

## 7. DSL method comparison and semantic probes

Four routes were compared on the same preservation requirements: an interpreted domain declaration, a deterministic executor with explicit agent delegation, extension of existing config/test/workflow languages, and an information-equivalent organized-Markdown baseline. The recommendation is a hybrid whose semantic source is a typed domain declaration interpreted into bounded agent context, with deterministic preflight and post-transform validators plus optional operation adapters.

A general deterministic executor is rejected as the first/sole method: building DOCX/PDF extraction, translation, AST rewriting, locale formats, and professional judgment now would prematurely implement a production system and select only what existing scripts support. Existing schemas, gettext/AST/Pandoc/PDF tools, Gherkin, and workflow engines remain useful implementations, but none owns the combined semantics of eligible-unit selection, protected identity, judgment context/result, non-overwrite, obligation-preserving migration, and promotion. Organized Markdown remains the mandatory baseline; if the typed method cannot improve completeness or constraint observance at acceptable cost, the result should remain Markdown.

The proposed constructs are `source`, `select`, `protect`, `transform`, `targets`, `checks`, bounded `judge` contracts, `resources`, and explicit `on` policies. For each, `method-probes.md` records domain meaning, responsible executor/judge, missing/invalid behavior, and an observable consequence of mutation. An agent judgment must declare its trigger, available context, bounded result, completion condition, and uncertainty action; an opaque copy of the original instructions is not sufficient.

Three sourced tasks were mapped without dropping obligations: legal conversion, public skill-document translation, and application locale generation/checking. A fourth authored design example shows direct user authoring without an original skill run. Each mapping separates explicit constructs, referenced resources/bindings, agent/user judgment, out-of-range work, and unresolved items. Manual walkthroughs cover normal, optional-missing, required-missing, constraint conflict, professional judgment, partial, unsupported, and out-of-range states. Five rule mutations predict distinct changes in diagnostics, control flow, allowed writes, validation, or evidence. No probe was executed and no effect is claimed.

## 8. Effect evaluation design

No effect experiment was run in this preparation stage. The next round should pre-register the following comparison before examining outputs.

### 8.1 Primary outcome, quality floor, and costs

The primary outcome is **critical-obligation-complete success on normal, changed, and boundary inputs**. Before execution, each case gets a binary vector of required obligations derived from the source requirement/skill and its expected failure behavior. A run succeeds only when every critical applicable obligation is satisfied: source identity, required selection, protected content, target coverage, non-overwrite, expected diagnostics/branch, and promotion policy. Obligation-level results are also reported so that a single average cannot hide which contract was lost.

The necessary quality floor is separate from the primary outcome:

- no critical meaning, applicability, authorization, or source-fidelity error;
- every applicable semantic-rubric dimension reaches “acceptable” (predefined anchors, not relative preference after seeing results);
- no condition gets semantic credit from parse/schema/file success alone;
- unresolved or unjudgeable quality is reported as unknown, not pass.

For a “promising” method judgment, the DSL must improve critical-obligation-complete success over both the original and organized-Markdown conditions in at least two independent task lineages, meet the semantic floor, and retain the difference against Markdown using the same new helpers. With this small panel, the result is descriptive evidence, not statistical generalization. A tie or failure against the helper-matched Markdown condition means keep/refine Markdown or narrow the DSL.

Report separately: declaration/Markdown authoring or migration time, human questions/interventions, repair passes, input/output/cache-read tokens, tool calls, wall time, dependency setup, paid cost and unknown cost. Runtime tokens are not total development cost; one-time schema/adapter/validator work is recorded separately.

### 8.2 Conditions and helper attribution

| ID | Condition | Controlled information and capability |
|---|---|---|
| O | Original skill | Original package/instructions and its existing resources/tools. |
| M | Information-equivalent organized Markdown | Same obligations and available resources, reorganized into explicit sections/tables but without DSL syntax, interpreter, or new helper. |
| MH | Organized Markdown plus the same new helper/validators | Same prose as M plus the exact validators or domain operations available to the DSL, invoked through documented commands/config. This isolates program benefit. |
| DH | DSL-driven hybrid plus helper/validators | Typed declaration, interpreter/plan rendering, and exactly the helper/validator versions used by MH. |

An obligation ledger is frozen before generating M or DH. Both must mark every original obligation as explicit, referenced, delegated, out of range, or unresolved. If a DSL helper cannot be exposed equivalently to MH, the language and program effects are inseparable and the result must be labeled that way; it cannot support a DSL-causality claim.

### 8.3 Task panel and expected outcomes

Exact bytes and expected-result records are frozen only when implementation begins; all actively added inputs remain development.

| Family | Case | Source and reality basis | Expected outcome source |
|---|---|---|---|
| Legal conversion | normal | An eligible local TXT law fixture already used by the pilot; existing byte source, not newly invented text. | Pilot applicability, character-fidelity, hierarchy, and promotion rules. |
| Legal conversion | changed | Authored modification that adds valid hierarchy/whitespace/list variation while retaining the original character stream; it represents formatting variation the normalizer claims to handle. | Predeclared character stream plus hierarchy/check profiles; authored provenance retained. |
| Legal conversion | boundary | A non-law standard or guidance document from the existing development materials, expected to be rejected with no final artifact. | Pilot non-law rejection rule; not hindsight from run output. |
| Skill-document translation | normal | A pinned public `SKILL.md` selected from the registered `skill-i18n` use case. | Public source rules for code/path/command/identifier/URL/frontmatter protection, naming, and source non-overwrite. |
| Skill-document translation | changed | Authored copy adding nested Markdown, links, commands, environment variables, and placeholders; these are normal technical-document conditions named by the source rules. | Frozen protected-span manifest and file/locale coverage; semantic rubric written before runs. |
| Skill-document translation | boundary | Target path collision with the source or an existing target under non-overwrite policy. | Declared output policy; expected fail/ask before transformation. |
| Locale generation/checking | normal | Existing local application-source fixture from the i18n pilot. | Pilot framework, key, placeholder, and completeness requirements. |
| Locale generation/checking | changed | Authored literals with interpolation, plural/gender/currency context, and API/HTTP technical spans, representing cases explicitly called out by the task card. | Frozen candidate/protected-span manifest plus key/placeholder checks and semantic anchors. |
| Locale generation/checking | boundary | Authored source containing only logs, URLs, regexes, imports, and identifiers, expected to yield no UI candidates rather than invented translations. | Pilot exclusion rules and an independently reviewed candidate manifest. |

The direct-authored guide example from `method-probes.md` is a separate usability probe. It measures whether a user/agent can author a complete declaration and repair diagnostics without an original skill. It is not mixed into the migrated-skill primary outcome.

### 8.4 Evaluation layers

1. **Static only:** parse/schema, construct compatibility, required fields, resource resolution, and source/target conflict. These establish declaration validity, never task success.
2. **Structural/constraint:** source digest unchanged, protected-span equality, file/locale/key coverage, legal character stream, output naming, blocking-check status, expected rejection/ask, and no premature promotion.
3. **Task semantic:** legal applicability and hierarchy appropriateness; translation meaning, fluency, terminology, and context; user-facing-literal selection, key quality, plural/gender meaning, and false positives. Prefer deterministic/source-derived rules where possible, then a small condition-blinded domain-aware review. A bounded model review may supplement but must expose prompt/model and cannot turn unknown into ground truth.

Outputs are blinded to condition when the artifact permits it. Reviewers receive the source, expected obligation/rubric, and output, not the method label or runtime transcript. Operational diagnostics are evaluated separately because they cannot always be blinded.

### 8.5 Pairing, repeats, order, cache, and records

- Hold model/version, inference configuration, system/task wording, workdir, allowed tools, timeouts, input bytes, source snapshot, network policy, dependency versions, and helper version constant within a case block.
- Plan three independent repeats per condition/case when budget permits, retaining failures and timeouts rather than replacing them. Three is a variance probe, not a promotion sample-size gate; fewer runs remain reportable with the limitation explicit.
- Counterbalance condition order within each case using a recorded fixed seed. Do not always run DH last.
- Prevent cross-condition artifact/cache reuse. Pre-install or pre-warm tool dependencies equally; start each run from a fresh workdir. Record cache-read tokens and any cache that cannot be disabled as an unknown confound.
- Record exact input/output identities, final and partial artifacts, diagnostics, tool calls, timestamps/wall time, model usage, cache reads, repair turns, user questions, dependency/setup work, USD charges, and unknown charges. Keep authoring/migration effort outside runtime metrics.

This design can distinguish declaration structure from new deterministic capability and can reject a parse-only success story. It still will not estimate ecosystem-wide effect, professional-review reliability, or long-term maintenance cost.

## 9. Existing-code reuse and next minimum implementation

The eight taskbook entry files were inspected in the current checkout and compared with HEAD. None has an unstaged or staged difference, so the interfaces below are committed at starting HEAD `d8ff5b7`; unrelated working-tree changes elsewhere remain protected. Reuse labels describe responsibility, not proof that the interface can be used without change.

| Existing entry and symbols | Classification | Bounded reuse and limit |
|---|---|---|
| `src/run/index.ts:67` `loadRunTask`; `:108` `materializeNaturalRunTask`; `:137` `prepareRunWorkspaceArtifacts`; `:169` `executeRun`; `:243` `buildRunSkillBundle`; `:259` `deploySkillBundle` | Reuse + small adaptation | Preserve the ordinary natural-task path, fixture copy, pre-run input snapshot/initial manifest, canonical `.skvm/skills/...` resource deployment, and adapter call. A declaration can remain a skill resource and be rendered into bounded skill content before `adapter.run`; the runner should not become a new DSL engine. Snapshot-before-skill-deploy correctly separates user/task bytes from framework resources. |
| `src/jit-optimize/operation-context.ts:19` `OperationParameterRule`; `:58` `OperationRecord`; `:935` `buildOperationContext` | Reuse for evidence only | Records actually observed tool operations, parameter provenance, read/write files, and unknowns without host reads. It can evaluate whether a later runtime used a bound adapter, but cannot supply task semantics, planned operations, or membership. |
| `src/jit-optimize/workflow-scaffold.ts:20` `WorkflowScaffoldProcessor`; `:28` `WorkflowScaffoldSpec`; `:524` `materializeWorkflowScaffold`; `:600` `deriveWorkflowScaffoldCandidates` | Optional mechanical reuse; adapt | Safely supplies single/multi-input plumbing for a known one-input/one-output processor. Its own header and residual duties explicitly exclude domain logic and a DSL; it cannot represent protected spans, multiple semantic targets, judgment contracts, or promotion policy. Use only behind a declared operation binding. |
| `src/jit-optimize/implementations.ts:40` `DomainImplementationBackend`; `:309` `selectOptimizationImplementation`; `:364` `selectOptimizationImplementations` | Pattern reusable; direct type needs adaptation | The `supports`/`select` registry and contained-path/visible-file checks are useful patterns. The direct interface accepts `OptimizationAction` and existing action kinds, so forcing the new language through it would make the old action schema mandatory. Start with a narrow transform-binding registry; bridge later only if the mapping is lossless. |
| `src/jit-optimize/package.ts:312` `publishOptimizedSkillPackageAtomically`; `:570` `buildOptimizedSkillPackage`; `:685` `verifyOptimizedSkillPackage` | Atomic/closure utilities reusable later; package builder mostly unrelated | Atomic sibling staging and exact file/digest closure are useful for a portable result. The builder is tied to proposal rounds, optimization actions, and action-local validation. Package validity explicitly does not establish whole-task behavior; do not use export success as DSL effect. |
| `src/skill-ir/schema.ts:128` `SkillIRSchema` and component Zod schemas | Validation pattern reusable; domain schema new | Zod object/union/enumeration patterns are useful. Generic category/inputs/outputs/steps/rules/checks do not encode eligible units, protected identity, transform intent, bounded judgment, or promotion. Define a separate narrow schema rather than extending the old IR by generic fields. |
| `src/skill-ir/parser.ts:49` `parseSkillIRFromJsonCandidate`; `:61` `buildSkillIRExtractionPrompt` | Parsing/normalization lessons only | Strict candidate parsing and stable IDs are useful techniques. An LLM extraction prompt is not obligation-preserving migration, and a JSON candidate is not enough without a ledger and semantic validation. |
| `src/skill-ir/validate.ts:8` `validateSkillIR` | Reference-check pattern reusable; validator new | Missing reference and required-output checks demonstrate deterministic cross-reference validation. The new validator must additionally check source/target collision, construct compatibility, protected/check bindings, complete judgment contracts, and explicit disposition of migrated obligations. |

### 9.1 Next-round minimum implementation (five tasks)

The next round should implement only the shortest author-to-consumption path for this range. It should not add a general compiler, CLI, optimizer rewrite, or production backend portfolio.

| Task | Input | Output and modification location | Positive example | Failure example |
|---|---|---|---|---|
| 1. Narrow semantic schema and validator | An in-memory/JSON projection of `source`, `select`, `protect`, `transform`, `targets`, `checks`, `judge`, `resources`, and `on`; syntax choice remains replaceable. | New bounded module such as `src/skill-ir/preservation-transform/{schema,validate}.ts`; typed declaration and attributed diagnostics. Do not alter `SkillIRSchema`. | Direct-authored guide translation validates with protected code/placeholders and non-overwrite. | Source/target collision, unknown protection/check, or incomplete judgment result contract fails before execution. |
| 2. Obligation ledger plus agent-plan renderer | Valid declaration, source snapshot/resource identities, and for migration a ledger mapping every original obligation. | `.../preservation-transform/{obligations,render}.ts`; bounded agent context containing selected inputs, protected manifest, judgment contract, checks, and explicit unresolved/out-of-range entries. | Public skill translation renders one result slot per selected unit and exposes optional glossary absence. | A required original obligation with no disposition rejects migration; opaque `instructions` cannot stand in for a judgment contract. |
| 3. Reusable preflight and post-transform checks | Source/target paths, staged artifacts, selected/protected manifests, and check profiles. | `.../preservation-transform/validators.ts`; deterministic diagnostics and promote/no-promote decision. Initially implement source collision/non-overwrite, protected equality, selected-unit coverage, and placeholder/key parity; bind the existing legal checker only through a named adapter. | Translation preserves code/URL/placeholders and covers every selected unit; staged output can promote. | Deleted placeholder or changed legal character blocks promotion with a construct-attributed diagnostic. |
| 4. Ordinary-run consumption slice | Natural task, normal skill package containing one declaration, workdir input bytes, model configuration, and optional named operation binding. | Small adapter at the skill-loading/run boundary using existing `materializeNaturalRunTask`/`executeRun` path; declaration stays under the deployed skill resource root, rendered context reaches the agent, and input snapshot remains pre-deploy. | The same direct-authored package runs on original and changed Markdown inputs without a special skill-name branch. | Missing required resource or unsupported operation fails before `adapter.run`/write; it never falls back to arbitrary execution. |
| 5. Focused tests and paired development harness | Three declarations/examples, normal/changed/boundary fixtures, O/M/MH/DH condition specs, fixed run metadata. | Unit/integration tests beside the new module plus a development-only result writer under `results/skill-ir/`; JSON report separates static, structural, semantic, runtime, and authoring costs. | Rule-mutation fixtures change the exact predicted diagnostic/promotion result; helper-matched conditions use identical helper bytes. | Cache/workdir leakage, condition capability mismatch, missing expected failure, or output without semantic-review status invalidates the comparison. |

Tasks 1–3 can be test-driven without model calls. Task 4 supplies the first genuine direct-authored consumption path. Task 5 should start with deterministic rule-mutation and failure fixtures; only after they pass should the small paired model panel in section 8 run. PDF OCR, interactive PDF, general workflow compilation, and cross-artifact backends remain outside this minimum.

## 10. Open questions and handoff

### 10.1 Open questions

1. **Shared semantic value:** do `select`/`protect`/`checks`/`judge` improve obligation completeness across both legal and i18n lineages, or merely rename task-specific logic?
2. **Stable span identity:** which Markdown/source representation supplies identities that survive translation and rewriting without requiring a large compiler front end?
3. **Judgment contract adequacy:** can an agent reliably return bounded selection/applicability/translation decisions with evidence and uncertainty, and what reviewer is sufficient for semantic quality?
4. **Migration completeness:** can an obligation ledger detect silent loss from real skills without making migration more expensive than editing organized Markdown?
5. **Direct authoring burden:** can a user or authoring agent produce and repair a declaration from a natural task without already understanding the runtime implementation?
6. **Attribution:** after giving Markdown the same validators/helpers, does any remaining benefit come from typed structure and diagnostics rather than new program capability?
7. **Range boundary:** should OCR remain a transform variant, and should contract/evidence constructs become cross-cutting capabilities rather than primary ranges?

### 10.2 Method judgment and next handoff

The method is ready for a narrow prototype because it has a purpose-derived range, cross-lineage examples, explicit counterexamples, construct-level behavior predictions, an effect design, and concrete reuse points. It is not ready for a stable syntax, public CLI, general compiler, automatic migration claim, or production-support promise.

The next round starts with the five tasks in section 9.1, in order: schema/semantic validator; obligation ledger and plan renderer; preservation/completeness validators; ordinary natural-run consumption; focused rule-mutation tests and only then the paired development panel. Tasks 1–3 require no model calls and should be test-driven. A first milestone is one directly authored package consumed through the normal run path on original and changed Markdown inputs, plus a missing-required and protected-placeholder failure. No skill-name branch, old-IR requirement, OCR backend, interactive-PDF path, or cross-artifact framework belongs in that milestone.

### 10.3 Claim and evidence boundary

- The registry contains 52 development packages; 24 deep-read packages produced 30 task cards. The challenge contains nine tasks and four retained disputes. These are purposive materials, not prevalence or accuracy samples.
- Public source reading, local source inspection, and manual walkthroughs establish method preparation only. The one inherited summary-level legal run remains quality-unknown and is not DSL evidence.
- Purposeful project model/API calls, executed probes, effect experiments, and production-code edits in this stage are all zero. No USD charge was incurred by a project runtime call; the surrounding assistant session is not measured as a project experiment.
- The current recommendation may be revised by the first deterministic prototype or helper-matched comparison. Frozen historical results, Q1, held-out, readiness, and prospective status do not change.
