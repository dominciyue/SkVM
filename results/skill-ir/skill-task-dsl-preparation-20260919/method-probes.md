# Preservation-Constrained Transformation DSL Method Probes

Status: agent-authored provisional method study. All walkthroughs in this file are `manual-walkthrough`; none was executed and none is an effect experiment. The YAML-like fragments are readable projections of a semantic model, not a selected file extension or final grammar.

## 1. Common requirements used for every route

The comparison uses one requirement set derived before choosing a method:

- identify a source and one or more target artifacts;
- select eligible source units while retaining evidence for exclusions;
- preserve named spans or relations exactly or under a declared normalization;
- apply a named transformation whose intent is narrower than arbitrary instructions;
- separate deterministic operations from agent judgment and user authorization;
- forbid source overwrite unless the policy explicitly permits it;
- run structural/preservation/completeness checks before promoting output;
- handle missing, ambiguous, conflicting, unsupported, and partial states explicitly;
- make a rule change capable of changing a diagnostic, execution decision, or result;
- support both direct authoring and obligation-preserving migration from an existing skill.

The same three sourced tasks ground the comparison: Chinese legal document conversion (`pilot-law-convert-validate`), skill-document translation (`skill-i18n-translate-docs`), and application locale generation/checking (`pilot-i18n-generate-and-check-locales`). They span a local legal pilot, an independently published skill, and a separate local i18n pilot. PDF OCR is boundary evidence, not needed to make the route look more general.

## 2. Method comparison

| Route | What it can express on the common requirements | Meaning lost or deferred | Executor and error location | Dependencies and cost | Verification | Decision |
|---|---|---|---|---|---|---|
| A. Domain declaration interpreted into agent use | Typed source, selection, protection, transform intent, targets, checks, judgment contracts, and failure policy. The interpreter can render bounded context and call validators. | An agent-executed transform is not deterministic merely because its contract is typed; operation adapters remain optional. | Interpreter rejects missing/contradictory declarations; agent returns a structured judgment/result; validators attribute invariant failures to a construct. | New schema/loader and plan renderer; low initial adapter count; direct authoring is plausible but more formal than Markdown. | Static semantic checks, staged-output validators, obligation ledger, and bounded semantic review. | **Selected foundation**, combined with deterministic preflight/checks and optional adapters. |
| B. Deterministic domain executor with explicit agent delegation | Strong execution semantics for known selectors, legal normalizers, protected-span copying, key comparison, and output promotion. | Translation quality, applicability, candidate-literal selection, and unseen formats require agent contracts; a general executor would either reject many tasks or hide judgment in plug-ins. | Executor owns supported operations; explicit delegation points own semantic decisions; unsupported operations fail closed. | Highest implementation and maintenance cost; dependencies differ for DOCX/PDF, Markdown, ASTs, and locale formats. | Strong for encoded operations; still needs semantic review and per-adapter conformance. | Useful as a later adapter layer, **rejected as the sole first method** because it would pre-build a production system and bias scope toward existing scripts. |
| C. Reuse or extend existing config/test/workflow languages | JSON Schema can validate declarations; gettext/AST/Pandoc/PDF tools perform mechanics; Gherkin/test runners can express examples and assertions; workflows sequence stages. | No single reused language owns eligible-unit semantics, protected identity, judgment context/result, non-overwrite, and obligation-preserving migration. These meanings would be scattered across tool flags and arbitrary steps. | Existing tools diagnose their layer, while cross-layer responsibility and missing judgment remain unclear without a new semantic contract. | Low syntax cost but high glue/config coupling; direct users must understand several unrelated systems. | Each tool verifies its own contract; end-to-end semantic attribution is weak. | Reuse implementations and serialization where useful, **not the unifying language**. `steps` plus `run_anything` would be a workflow shell, not this task DSL. |
| D. Information-equivalent organized Markdown | Can state every requirement, include decision tables, examples, commands, and checklists; natural for agent judgment and cheapest to author. | No typed construct automatically binds a validator, detects an omitted obligation, or makes a changed rule addressable. A careful agent may still follow it well. | Agent interprets prose; tools diagnose only when the prose causes them to run; ambiguity is resolved conversationally. | Lowest new-system cost and strongest baseline; quality depends on editing discipline and model interpretation. | Same external validators and semantic rubric can be used; prose structure itself has no executable contract. | **Mandatory baseline**. If Route A does not beat this on completeness/constraint observance at acceptable cost, keep Markdown. |

### 2.1 Recommended method

Use a typed domain declaration as the semantic source, interpreted into a bounded agent context, with deterministic preflight and post-transform validators. A transformation may bind an existing operation adapter, but unknown or judgment-heavy work is delegated through an explicit contract. This is not a general step engine and does not require the old Skill IR/action schema.

The minimum runtime meaning is:

1. resolve declaration, resources, source, and targets without writing output;
2. reject missing required input, source/target identity conflicts, unsupported constructs, and contradictory policies;
3. collect eligible units and protected material, recording why material was excluded;
4. execute a bound operation or ask the agent for the declared result shape;
5. stage output, run declared checks, and attribute failures to the responsible construct;
6. promote only under the output/failure policy; otherwise retain diagnostics and permitted partial artifacts.

Existing formats may serialize the model, but serialization is not the semantics. Existing scripts and validators may implement operations, but their presence is not range membership.

## 3. Core constructs and observable meaning

| Construct | Domain meaning | Responsible party | Missing/invalid handling | Observable effect when changed |
|---|---|---|---|---|
| `source` | Identity, media/kind, required path, and optional extraction profile for the artifact being transformed. | Resolver; an adapter may extract bytes/text. | Missing or unreadable required source fails preflight; unsupported kind is rejected, not passed to arbitrary code. | Changing identity/kind changes resolved input or yields a source diagnostic; source digest/evidence changes. |
| `select` | Which source units are eligible and which evidence explains inclusion/exclusion. | Deterministic selector when bound; otherwise a named agent judgment. | No selector is allowed only when `all` is explicit; missing required selector context fails or asks according to policy. | Changing a predicate changes the selected-unit manifest and therefore coverage checks/output. |
| `protect` | Spans or relations whose identity must survive, including character stream, code, paths, URLs, identifiers, placeholders, keys, or frontmatter fields. | Collector before transform; validator after transform. | Unknown protection kind rejects the declaration; an unresolved protected span fails before promotion. | Adding/removing/changing a rule changes the protected manifest and equality diagnostics. |
| `transform` | Named domain intent and variant, with either an operation binding or agent result contract; not arbitrary steps. | Adapter for encoded mechanics; agent for declared judgment. | Unknown profile is unsupported; absent binding requires a complete agent contract; neither falls back to `run_anything`. | Changing profile changes requested outputs/agent context and can change adapter selection or result. |
| `targets` | Output identities, naming, multiplicity, and promotion/overwrite policy. | Resolver and staged writer. | Missing target fails; source collision conflicts with `overwrite: never`; partial targets follow explicit policy. | Changing naming or overwrite policy changes paths, promotion, and collision diagnostics. |
| `checks` | Named invariants or completeness obligations, their inputs, severity, and promotion effect. | Deterministic validator where available; bounded reviewer for semantic checks. | Unknown required check rejects the declaration. A failed blocking check prevents promotion. | Adding/removing/severity-changing a check changes pass/fail, diagnostics, or promotion. |
| `judge` | A bounded semantic decision with trigger, input context, required result fields, completion condition, and uncertainty policy. | Agent or named reviewer; user only where authorization/terminology is explicitly required. | Missing context follows `on.missingRequired`; malformed result is a judgment-contract failure; uncertainty asks or records rather than inventing certainty. | Changing trigger/context/result changes whether judgment runs and what evidence is required. |
| `resources` | Pinned reference, glossary, schema, or script used by one named construct. | Loader verifies identity; consuming construct records use. | Missing required resource fails; optional absence is recorded and invokes a declared default. | Changing a resource reference changes provenance and the construct's context/binding. |
| `on` | Policy for missing required/optional inputs, ambiguity, conflicts, unsupported features, partial output, and check failure. | Interpreter and promotion controller. | Every material state has an explicit default; silent continuation is forbidden for required input or blocking checks. | Changing `fail` to `ask`, `record`, or `allow_partial` changes control flow and final status. |

An agent judgment is valid only when it declares: its trigger; available source units, protected manifest, resources, and prior diagnostics; a bounded result schema; a completion condition; and an uncertainty action. Pasting the original skill into an `instructions` field is not a modeled judgment.

## 4. Illustrative semantic projection

This fragment shows shared shape only:

```yaml
kind: preservation-transform
source:
  path: $input
  kind: markdown
select:
  via: { judge: select-translatable-prose }
protect:
  - { kind: code-fence, match: all }
  - { kind: placeholder, syntax: "{name}" }
transform:
  profile: translate-prose
  args: { targetLocale: zh-CN }
  via:
    judge:
      context: [selectedUnits, protectedManifest, glossary]
      returns: [unitId, transformedText, uncertainty]
      completeWhen: every-selected-unit-has-one-result
targets:
  - { path: $output, overwrite: never }
checks:
  - { id: protected-equality, blocking: true }
  - { id: selected-unit-coverage, blocking: true }
on:
  missingRequired: fail
  missingOptional: record-default
  ambiguity: ask
  constraintConflict: fail
```

## 5. Real-task mappings

### 5.1 Chinese legal document to fidelity-checked Markdown

Source: `pilot-law-convert-validate`; local source positions are recorded in `structure-cards.jsonl`.

Illustrative specialization:

```yaml
kind: preservation-transform
source: { path: $input, kind: txt-docx-or-pdf, extraction: legal-text }
select:
  via:
    judge:
      id: legal-applicability
      context: [stage1Text, hierarchyCues, userOverride]
      returns: [applicable, evidence, uncertainty]
      completeWhen: applicable-is-supported-or-rejected
protect:
  - { kind: character-stream, normalization: strip-markdown-markers }
transform:
  profile: chinese-legal-hierarchy-to-markdown
  via: { operation: legal-hierarchy-normalizer }
targets: [{ path: $output, overwrite: never, promoteAfter: blocking-checks-pass }]
checks:
  - { id: character-stream-equality, blocking: true }
  - { id: legal-hierarchy-structure, blocking: true }
on: { ambiguity: ask, unsupported: reject, checkFailure: retain-audit-no-final }
```

| Obligation disposition | Mapped content |
|---|---|
| Explicit | source kinds; legal applicability; hierarchy profile; stripped-character-stream equality; non-law rejection; non-overwrite; promotion only after blocking checks; failure/audit state. |
| Referenced resource/binding | existing extraction router, legal normalizer, and stage-3 checker may be bound by identity; they are implementations, not the language definition. |
| Agent/user judgment | agent decides applicability when evidence is insufficient and judges OCR adequacy; user authorizes fallback extraction or overrides applicability. Each returns evidence/uncertainty. |
| Out of range | installation of OCR dependencies and full legal-semantic correctness. |
| Unresolved | a portable extraction contract for PDF/DOCX and the exact boundary between harmless normalization and content change. |

### 5.2 Translate skill documentation into locale variants

Source: [`guo-yu/skills` skill-i18n at pinned commit](https://github.com/guo-yu/skills/blob/7970aafaa35dcd7d0db8450da49b378a75b3e25f/skill-i18n/SKILL.md).

```yaml
kind: preservation-transform
source: { root: $skillDir, kind: skill-documents }
select: { files: [SKILL.md, README.md], locales: $targetLocales }
protect:
  - { kind: code-path-command-identifier-url, match: all }
  - { kind: frontmatter-field, field: name }
transform:
  profile: translate-prose
  via:
    judge:
      id: meaning-preserving-translation
      context: [selectedUnits, protectedManifest, targetLocale, glossary]
      returns: [unitId, transformedText, terminologyQuestions]
      completeWhen: every-selected-unit-has-one-result
targets: [{ naming: locale-suffix, overwrite: ask-existing-never-source }]
checks:
  - { id: protected-equality, blocking: true }
  - { id: frontmatter-name-equality, blocking: true }
  - { id: file-locale-coverage, blocking: true }
on: { missingRequired: fail, missingOptional: record-default, ambiguity: ask }
```

| Obligation disposition | Mapped content |
|---|---|
| Explicit | selected files/locales; config-resolved inputs; protected code/path/command/identifier/URL; fixed frontmatter name; localized description/prose; locale naming; source non-overwrite; coverage checks. |
| Referenced resource | optional glossary/config with explicit precedence may be a resource; absence is recorded rather than invented. |
| Agent/user judgment | agent translates meaning and returns terminology questions; user settles material terminology or overwrite of an existing target. |
| Out of range | discovering/installing an unspecified translation program and judging ecosystem-wide localization quality. |
| Unresolved | exact parser for mixed Markdown/frontmatter protection and how localized examples should be selected. |

### 5.3 Generate locale resources and replace application literals

Source: `pilot-i18n-generate-and-check-locales`; local source positions are recorded in `structure-cards.jsonl`.

```yaml
kind: preservation-transform
source: { root: $sourceTree, kind: application-source }
select:
  via:
    judge:
      id: user-facing-literal-selection
      context: [sourceUnits, framework, exclusionRules]
      returns: [unitId, literal, proposedKey, rationale, uncertainty]
      completeWhen: every-candidate-is-selected-or-excluded-with-reason
protect:
  - { kind: interpolation-placeholder, match: all }
  - { kind: technical-span, vocabulary: [API, SDK, HTTP] }
transform:
  profile: extract-key-rewrite-and-translate
  args: { framework: $framework, sourceLocale: $sourceLocale, targetLocales: $targetLocales }
  via: { judge: contextual-key-and-translation }
targets:
  - { kind: source-rewrite, root: $stagingSource, overwrite: never-original }
  - { kind: locale-resources, root: $localeRoot, format: framework-default }
checks:
  - { id: placeholder-parity, blocking: true }
  - { id: locale-key-set-parity, blocking: true }
  - { id: locale-completeness-report, blocking: false }
on: { ambiguity: ask, partialTarget: retain-and-report, checkFailure: no-promotion }
```

| Obligation disposition | Mapped content |
|---|---|
| Explicit | framework/languages; candidate selection with exclusions; keys; placeholders/technical spans; source rewrite plus locale resources; key parity; completion report; staging/no original overwrite. |
| Referenced resource | framework syntax/schema and optional existing locale files. |
| Agent/user judgment | agent decides user visibility, key names, plural/gender/contextual translation; user approves material terminology. |
| Out of range | installing a framework, executing the application, and claiming runtime UI completeness from key parity alone. |
| Unresolved | safe AST adapters for each framework and a default failure policy absent from the original pilot. The DSL proposal chooses fail/no-promotion rather than silently imputing original behavior. |

### 5.4 Direct authoring without an existing skill

This is an **authored design example**, not an external usage record. A user asks: “Translate `guide.md` to Chinese as `guide.zh-CN.md`; preserve code fences, commands, URLs, `$VARS`, and `{placeholders}` exactly; use `terms.csv` if present; never overwrite the source; stop and ask on ambiguous product terms.” The declaration in section 4 can be written directly from those requirements with `resources.glossary` optional, `targets.overwrite: never`, two protection kinds plus command/URL/environment-variable kinds, and `on.ambiguity: ask`. No original skill run or migration is required.

| Obligation disposition | Mapped content |
|---|---|
| Explicit | source/target, locale, protected kinds, optional glossary, non-overwrite, ambiguity policy, coverage/equality checks. |
| Referenced resource | `terms.csv`, only if present and schema-valid. |
| Agent/user judgment | agent translates selected prose and returns ambiguous terms; user resolves those terms. |
| Out of range | claiming published terminology approval or translation quality beyond the bounded review. |
| Unresolved | which Markdown parser should supply stable span identities in the first implementation. |

## 6. Manual semantic walkthroughs

| Case | Input/state | Required behavior | Observable result |
|---|---|---|---|
| Normal | skill docs, two target locales, all required paths present | resolve selection/protection; agent translates; validators compare protected manifest and coverage; stage then promote | two locale files, unchanged source, check evidence, success status |
| Missing optional | authored guide has no `terms.csv` | apply `missingOptional: record-default`; continue without glossary and expose that fact to the judgment | output may succeed; provenance/diagnostic says glossary absent and no terminology authority was used |
| Missing required | target locale or source path absent | fail preflight; do not invoke transform or write staging output | `missing-required` diagnostic names the construct and field; no output |
| Constraint conflict | target path equals source while `overwrite: never` | reject before transformation | `source-target-collision` diagnostic; source digest remains unchanged |
| Professional judgment | legal hierarchy cues are insufficient, or translation has an ambiguous product term | trigger the declared judgment; return evidence/question/uncertainty; `on.ambiguity: ask` blocks promotion | user-facing question plus retained staged/evidence state; no fabricated decision |
| Partial output | one of three locale targets fails a blocking placeholder check | apply declared partial policy; do not call the set complete | passing targets remain staged or promoted only if policy permits; failed locale and missing units are reported |
| Unsupported operation | PDF OCR requested but no OCR adapter/judgment contract is bound | reject as unsupported rather than execute an arbitrary command | `unsupported-transform-binding`; no claim that range membership equals current support |
| Out of range | user wants live collaborative PDF annotation with approval after each edit | kind/purpose check rejects migration to this offline transform model; route to iterative/live-state handling | `out-of-range: live-state-feedback-action`; no lossy transform declaration is synthesized |
| Out of range | user wants a new README synthesized from repository context | source identity/protection contract cannot represent open-ended content design honestly | `out-of-range: source-free-synthesis`; use organized Markdown or a content-design method |

## 7. Rule mutation and deletion probes

These are counterfactual manual probes. They specify what an implementation test must later observe.

| Mutation | Rule type | Expected changed diagnostic/execution/result | Why it is semantic |
|---|---|---|---|
| Delete legal `protect: character-stream` | preservation invariant | a fixture that drops or changes a source character no longer triggers `character-stream-equality`; the run may reach structural pass, which the experiment must count as obligation loss | changes which outputs are admissible, not merely wording |
| Change `targets.overwrite: never` to `allow` for skill translation | side-effect/output policy | a source/target collision changes from preflight failure to a permitted write path; source-integrity evidence and promotion behavior differ | changes destructive capability and authorization |
| Change `on.missingRequired: fail` to `ask` | failure/control policy | an absent target locale changes from terminal preflight failure to a user question with no transform yet | changes control flow and user work |
| Delete `check: placeholder-parity` from locale generation | completeness/constraint check | a transformed string with `{count}` removed is no longer blocked by that diagnostic; semantic evaluation should mark the missing obligation | changes validation and promotion, exposing why the construct matters |
| Change the legal-applicability judgment result from `[applicable,evidence,uncertainty]` to only `[applicable]` | judgment evidence contract | a bare Boolean becomes schema-valid only after the mutation; evidence/uncertainty can no longer gate `ask` or support audit | changes acceptable evidence and ambiguity handling |

If a later prototype changes these fragments without producing the stated behavioral differences, the constructs are documentation labels rather than runtime semantics.

## 8. Migration discipline and limits

Migration must build an obligation ledger before emitting a declaration. Each original obligation is marked explicit construct, referenced resource/binding, agent judgment, user authorization, out of range, or unresolved. A migration is rejected when a required obligation has no disposition. Parse success, file presence, and a polished generated declaration do not make the migration complete.

This preparation supports a bounded feasibility judgment: the selected hybrid can represent the three core task structures without per-repository `run_anything` operations, it exposes missing/ambiguous states, and its constructs have proposed observable consequences. It does **not** show that users author it correctly, that the agent follows it better than organized Markdown, that validators cover semantic quality, or that benefits exceed authoring/runtime cost. Those are S9 comparison questions.
