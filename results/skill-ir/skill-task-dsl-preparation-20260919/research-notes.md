# Method and Related-System Notes

Access date for web sources: 2026-09-19. These notes distinguish source claims, source guidance, and this study's inferences. A web page being current at access time does not imply a stable version unless a release, date, or immutable identifier is named.

## 1. Primary-source register

| Source | Object and version clue | Method or evidence actually supplied | Usable idea | Boundary that must remain explicit |
|---|---|---|---|---|
| [Agent Skills Specification](https://agentskills.io/specification) | Current online format specification; no numbered release shown | Requires a directory with `SKILL.md`; defines frontmatter and optional `scripts/`, `references/`, `assets/`; describes metadata → full instructions → on-demand resources as progressive disclosure; `skills-ref validate` checks frontmatter and naming | Record loading layer, resource role, dependency, and run-vs-read intent separately | This is a packaging and format contract. It does not define task semantics, task success, user-confirmation policy, runtime permissions, script correctness, or effect evaluation |
| Zhang, Lazuka, and Murag, [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), published 2025-10-16, open-standard update 2025-12-18 | Anthropic engineering explanation and examples | Describes selective resource navigation, discretionary script execution, representative-task evaluation, trace observation, incremental authoring, and source auditing | Inspect how instructions, references, scripts, and assets actually cooperate in a task; watch the task trajectory rather than infer use from presence | Product engineering guidance, not an independent benchmark. “Deterministic code” does not make the surrounding task semantically correct or cross-runtime reproducible |
| Nickerson, Varshney, and Muntermann, [A method for taxonomy development and its application in information systems](https://d-nb.info/1256597325/34), 2013 | Peer-reviewed method plus a mobile-application demonstration; literature survey includes 73 papers | Starts from a purpose-derived meta-characteristic; alternates empirical→conceptual and conceptual→empirical iterations; predefines objective and subjective ending conditions | Use a purpose-relative working classification, keep actual revisions, and challenge conceptual rules against objects | The method does not produce a unique optimum. Its mutually-exclusive/collectively-exhaustive target belongs to a full taxonomy; this study intentionally permits multi-task, mixed, and unknown labels |
| Fowler, [Domain-Specific Languages Guide](https://martinfowler.com/dsl.html) | Current guide; links Fowler's 2010 book and older essays | Distinguishes internal DSLs, external DSLs, data-structure encodings, graphical forms, interpretation, and code generation; explicitly notes a gray boundary around “DSL” | Compare syntax ownership and runtime route only after a domain semantic model is identified | A YAML/JSON representation, fluent API, or custom parser is not by itself evidence of a useful domain language |
| Joshi, [DSLs Enable Reliable Use of LLMs](https://martinfowler.com/articles/llm-and-dsls.html), published 2026-05-12 | Experience-based article using Tickloom and other concrete examples | Separates semantic model from a thin DSL surface and execution; shows compiler/type-checker diagnostics; recommends iterating the model against real cases before using an LLM as its natural-language interface | A core construct must have domain meaning, a responsible executor/judge, diagnostics, and an observable consequence when changed | This is a reasoned design account, not controlled evidence that a skill DSL improves accuracy or cost. Small valid-output spaces and maintained validators are preconditions, not free benefits |
| Khattab et al., [DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines](https://arxiv.org/abs/2310.03714), arXiv v1, 2023-10-05 | Declarative LM modules and metric-driven compilation; abstract reports two case studies | Treats LM calls as parameterized modules in a text-transformation graph and optimizes a pipeline for a supplied metric | Keep task declarations, execution/optimization, and evaluation metric distinct | DSPy optimizes an executable LM pipeline; it is not a skill packaging standard or a task-family DSL. Abstract-level performance numbers do not transfer to this project |
| [LMQL language overview](https://lmql.ai/docs/language/overview.html) | Current official documentation, no release number on page | Shows prompt statements, constrained variables, finite choices, distributions, control flow, and surrounding-program outputs | A runtime language may constrain generation shape and expose typed/finite outputs | Well-formed constrained output is not end-to-end task correctness; the overview supplies examples rather than comparative benchmark evidence |
| Cucumber, [Gherkin Reference](https://cucumber.io/docs/gherkin/reference/) | Current official reference; mentions Gherkin v6 terminology | Separates readable feature/rule/scenario syntax from step definitions; executes steps sequentially; gives `Given`/`When`/`Then` precondition/action/observable-result semantics | Use behavior examples to expose preconditions, actions, and observable results; keep implementation bindings out of the readable task statement | A readable scenario is executable only when bindings and assertions exist. Gherkin is not a general agent workflow or professional-judgment language |
| SkillsBench Team, [SkillsBench 1.1 release](https://www.skillsbench.ai/blogs/skillsbench-1-1), 2026-06-16 | Release `v1.1`: 87 tasks, 8 domains, 18 paper configurations, 3 trials, 9,396 paired-condition trajectories | Same task/container under no-Skills and curated-Skills conditions; deterministic tests and withheld oracle; reports resolution, invocation, time, domain/task heterogeneity | Use paired conditions and report task-level negative cases; keep invocation distinct from resolution | It compares no skill with an expert-curated bundle, not original prose with information-equivalent Markdown and a DSL. The release also shows 13/87 negative-lift tasks and self-generated skill conditions below baseline, so aggregate lift cannot select our range |
| Han et al., [SWE-Skills-Bench](https://arxiv.org/abs/2603.15401), arXiv v1, 2026-03-16 | 49 public SWE skills, about 565 fixed-repository task instances across six SWE subdomains | Requirement documents with acceptance criteria, deterministic execution tests, and paired with/without-skill evaluation; abstract reports 39/49 skills with no pass-rate gain and heterogeneous token overhead | Context compatibility, version fit, and narrow specialization must be treated as causal candidates; report unchanged quality plus added cost | SWE-only, abstract-level evidence cannot be generalized to non-SWE skills or used to conclude that a DSL helps or hurts |

## 2. Four responsibilities that must not be collapsed

| Responsibility | Primary object | What it can establish | What it cannot establish alone |
|---|---|---|---|
| Skill packaging | `SKILL.md`, metadata, scripts, references, assets, loading conventions | Discoverability, file roles, declared dependencies, basic structural validity | A coherent task domain, complete obligations, correct behavior, or positive effect |
| Domain DSL | Shared domain concepts, rules, constraints, variants, and judgment points | A narrower semantic vocabulary and consequences that can be checked, interpreted, or delegated | Correct implementations of all domain operations or better outcomes merely because syntax exists |
| LLM programming interface | Model calls, prompt variables, constraints, modules, control flow, optimization | How model computation is composed or outputs constrained/optimized | The domain requirements of an arbitrary skill or the adequacy of a skill/task classification |
| Behavior specification | Preconditions, events, observable outcomes, examples, execution bindings | Concrete expected behavior and executable checks when bindings exist | General task authoring, implementation generation, or treatment of open-ended professional judgment |

The comparison therefore uses four layers for every candidate DSL route:

1. **Surface:** Markdown, data encoding, internal API, or custom syntax.
2. **Semantic model:** domain objects, obligations, states, rules, variants, and unresolved judgment.
3. **Runtime binding:** what the agent, deterministic program, external tool, or person does.
4. **Evidence:** parse/type/schema diagnostics, structural checks, observable task results, and quality evaluation.

A route that only changes layer 1 is an editorial or serialization change, not yet a demonstrated DSL contribution.

## 3. Decisions that affect this study

### 3.1 Skill structure decision

Structure cards will describe tasks rather than equate one package with one task. They will separately record:

- startup-visible metadata, activation-time instructions, and on-demand resources;
- executable scripts, read-only references, static assets/templates, and external services;
- whether a resource was merely present, actually read, actually run, or observed only through a summary trace;
- task obligations and success criteria that are not guaranteed by the package format.

This prevents directory layout and instruction length from standing in for task behavior.

### 3.2 Classification decision

The working classification's meta-characteristic is:

> Differences in task purpose, domain operations, rules, judgment, and observable completion that change whether tasks can share a DSL semantic model, runtime support, or fair evaluation.

Topic and automation/verifiability remain auxiliary dimensions because they affect source coverage, implementation route, and evaluation, but they do not define the primary range. Iteration will alternate:

1. empirical→conceptual extraction from three contrasting task cards, then roughly six seed tasks; and
2. conceptual→empirical challenge against different tasks, mixed tasks, and near-neighbors.

Because the output is a scope-selection aid rather than a claimed complete taxonomy, termination does not require forcing every skill into one mutually exclusive class. It requires: each proposed range has inclusion/exclusion rules, positive members and near-counterexamples; every retained dimension changes a design decision; at least one concrete v0→v1 revision is recorded; unresolved and mixed tasks remain visible; further examples stop changing the primary recommendation or expose a named open question.

### 3.3 DSL-method decision

Each route will be tested on the same requirements and must state, for every proposed core construct:

- the domain meaning it adds;
- who executes or judges it;
- required context and dependencies;
- behavior when required or optional information is missing;
- the diagnostic, execution, or result expected to change when the construct changes or disappears.

The study will retain a carefully organized Markdown baseline. It will reject “custom YAML plus generic steps” or “the whole skill under an `instructions` key” as sufficient semantics.

### 3.4 Evaluation decision

The next-round comparison will pair the same task, inputs, model/harness, resource content, execution order, and cache policy across:

1. original skill;
2. information-content-equivalent, organized Markdown;
3. DSL-driven use.

If a DSL condition adds a new helper, an additional ablation must separate language/structure from program capability, or the report must state that attribution is unresolved. Invocation/loading, parse success, helper exit status, structural constraints, semantic task quality, duration, input/output/cache tokens, tool calls, and known/unknown monetary cost remain separate outcomes. Benchmark versions and denominators will not be mixed.

## 4. Current limitations and open method questions

- The official skill format permits nearly unconstrained Markdown bodies, so task semantics must be reconstructed from body, direct dependencies, task examples, and behavior evidence.
- Professional judgment may need natural-language clauses with explicit inputs, outputs, triggers, and completion conditions; no reviewed source provides a universal way to type or validate that judgment.
- Deterministic validators improve error localization only for semantics they actually encode. They can create false confidence if used as a substitute for task-quality evaluation.
- DSL authoring and maintenance cost may dominate for small or heterogeneous ranges. A well-edited Markdown baseline is therefore a real competitor, not a straw baseline.
- Published skill benchmarks disagree in aggregate direction under materially different tasks, skills, harnesses, and protocols. Their useful common lesson is paired, task-specific measurement and explicit negative cases, not a prior that skills or DSLs usually help.
