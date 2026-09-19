# DSL Semantics Readiness: Review and Decisions

Status: `completed-design-and-probes`. Implementation recommendation: `proceed-narrow`. This file records D0-D11 decisions, their authority, alternatives, and limits. A source obligation, a code behavior, a proposed runtime default, and an active scope narrowing are different claims and are labeled separately.

## D0. Decision frame

The completed S study recommended a typed preservation-transform declaration as a promising bounded method, not a proven effect or a production design. D0 therefore treats five issues as blocking design decisions: the first domain boundary, unit/protection semantics, host runtime responsibility, the helper-matched comparison, and the I1-I5 implementation handoff. Representation, deterministic constraints, lifecycle behavior, and direct-authoring consumption must be decided by executable probes rather than prose walkthroughs.

Explicitly outside D0-D11 are a full compiler/CLI, production-runner changes, cross-framework application-source rewriting, first-version Law/OCR support, live external actions, proof that migration found every obligation, and positive-effect or ecosystem claims.

## D1. Source obligations and omission audit

### 1. Claim labels

| Label | Meaning | May define first-version behavior? |
| --- | --- | --- |
| `source` | Stated by the originating skill or its named package material. | Yes, when the corresponding responsibility is in scope. |
| `implementation-observed` | Behavior present in a source package's executable dependency but not necessarily promised by its instructions. | Only after deciding it is intentional and portable. |
| `runtime-default` | A default chosen by this project for an otherwise open state. | Yes, but it must be named as a project decision rather than attributed to the source. |
| `inference` | A conclusion drawn from source material, standards, or experiments. | Only after recording the evidence and competing interpretation. |
| `active-narrowing` | A sourced responsibility deliberately left outside the first supported slice. | It must remain visible in the obligation ledger; it is not “migrated.” |

An obligation ledger checks the disposition of obligations that have already been found. It cannot prove that extraction was complete. D1 therefore used two passes: a main source reconstruction followed by an independent, source-only omission audit. Future migration must preserve this separation instead of treating a complete-looking declaration as extraction evidence.

### 2. Public `skill-i18n`: complete responsibility surface

Authority: pinned [`guo-yu/skills` `skill-i18n/SKILL.md`](https://github.com/guo-yu/skills/blob/7970aafaa35dcd7d0db8450da49b378a75b3e25f/skill-i18n/SKILL.md). At this commit the package contains only `SKILL.md` and a non-semantic `.gitignore`; no executable translation implementation is supplied.

| Area | Sourced obligation | First-slice disposition |
| --- | --- | --- |
| Invocation and discovery | Support current directory, named skill, `config`, and integration flags; current-directory mode requires `SKILL.md`; named mode searches `~/.claude/skills/<name>` and then `~/Codes/skills/<name>`. | Skill discovery and the config command are `active-narrowing`; a prototype receives an explicit source binding. |
| Configuration | Read `~/.claude/skill-i18n-config.json`; precedence is CLI flags, per-skill config, global defaults, then interactive selection. | Preserve as a source obligation, but first-slice declarations receive resolved values plus provenance; implementing this external config lifecycle is deferred. |
| First use | If no applicable configuration exists, ask for target languages and files and persist the per-skill choice. | `active-narrowing`; unattended missing choices become `needs-input`, never invented defaults. |
| Selection | Translate selected `SKILL.md`/`README.md` files for every selected locale; support named built-in and custom locale codes. | In scope for explicit Markdown inputs/locales. |
| Translation | Translate prose naturally, adapt sentence structure and formality, localize examples where appropriate, and follow existing project patterns. | Agent semantic responsibility; deterministic checks cannot prove it. |
| Protection | Do not translate code blocks, paths, command names, technical identifiers/JSON keys, URLs or links. | In scope, occurrence-aware and unit-bound. Link labels may be editable while destinations remain protected; the source phrase “URLs and links” is otherwise ambiguous and must not silently prohibit link-label translation. |
| Frontmatter | Preserve `name`; translate `description`. | In scope with distinct unit/protection rules. |
| Existing targets | Detect existing translations and allow overwrite-all, skip-existing, or individual selection; `--overwrite` bypasses confirmation. | In scope as target policy; unattended ambiguity returns `needs-input`. |
| Source safety | Never overwrite the source `SKILL.md`. | In scope as a host-enforced preflight invariant. |
| Incremental behavior | Translate only when the source file is newer than its translations. | Preserve as an obligation but defer its mtime policy; the prototype uses explicit inputs and snapshot identity. It must not claim complete skill migration. |
| Integration and reporting | `share-skill --i18n` checks availability, loads configuration, invokes translation, and includes outputs in the site; standalone output reports generated files and saved configuration. | `active-narrowing`; result records still expose generated targets and diagnostics. |

Not specified by this source: a translation engine/API, retry or partial-success semantics, placeholder/ICU handling, hash-based freshness, translation completeness validators, or what to do when config fields conflict. Those behaviors require explicit project rules rather than source attribution.

### 3. Local `i18n-helper`: separate application-localization lineage

Authority: [`benchmarks/skill-ir/pilots/i18n-helper/source/SKILL.md`](../../../benchmarks/skill-ir/pilots/i18n-helper/source/SKILL.md).

The local pilot is not an implementation of public `skill-i18n`. Its sourced responsibilities are:

- detect project type and existing i18n framework;
- scan supported application-source files, select user-visible UI/error/notification literals, and exclude variables, URLs, regular expressions, imports, and debug logs;
- generate framework-appropriate JSON, YAML, PO/POT, or Properties locale resources;
- replace selected source literals with framework calls while preserving formatting and interpolation;
- compare source and target key sets, list missing keys, and report completion percentages;
- preserve technical terms and placeholders, with plural/gender and locale-aware date/number/currency behavior requiring special semantic treatment.

It does **not** specify source/target paths, languages, configuration precedence, authorization, overwrite or incremental policy, source-tree protection, exact target naming, existing-translation conflicts, or terminal/partial failure states. Any such behavior in the previous method proposal was a project default, not inherited from this skill.

First-version application-source scanning, key synthesis, AST rewriting, framework adapters, and locale-file lifecycle are `active-narrowing`. The lineage remains a counterexample and future reuse test: it shares some placeholder/coverage concepts with document localization, but not the same unit selector or output writer.

### 4. Local Law conversion: applicability and structure are not localization selection

Authorities:

- [`source/SKILL.md`](../../../benchmarks/skill-ir/pilots/law-to-markdown/source/SKILL.md)
- [`scripts/law_to_markdown.py`](../../../benchmarks/skill-ir/pilots/law-to-markdown/source/scripts/law_to_markdown.py)
- [`scripts/cn_law_normalizer.py`](../../../benchmarks/skill-ir/pilots/law-to-markdown/source/scripts/cn_law_normalizer.py)
- [`scripts/stage3_checker.py`](../../../benchmarks/skill-ir/pilots/law-to-markdown/source/scripts/stage3_checker.py)

The skill source requires TXT copy or DOCX/PDF extraction; MinerU preference and user-authorized fallback; a law/non-law applicability decision; legal hierarchy and spacing normalization without character-content change; explicit non-law rejection; no-op on absent structure or failed fidelity; Stage3 character-stream and structure checks; bounded retries; and report/final-artifact policies.

The executable dependencies add narrower observed behavior: UTF-8/nonempty prechecks, an 80-line standards heuristic, exact law-structure predicates, retry profiles, only whitespace/item-line auto-fixes, strict versus report-only exit behavior, and minimal-artifact cleanup. They also reveal source/implementation mismatches: the program accepts a supplied applicability value but does not perform model judgment; installation is only suggested; fallback authorization is represented by flags rather than enforced user evidence; URL input is effectively unsupported; MinerU invocation is platform-specific; and no incremental/non-overwrite guard protects prior outputs.

These are not small variants of document-localization unit selection. Law applicability decides whether the whole task may proceed; hierarchy recognition identifies structural anchors; character-stream fidelity permits formatting changes while requiring a global normalized relation. D1 therefore keeps Law as `active-narrowing` and a boundary case. Its check concepts may inform the general distinction between deterministic fidelity and semantic applicability, but its selector, transform, and correctness profile do not define the first localization DSL.

### 5. Corrected obligation map

| Responsibility | Public skill docs | Application locale pilot | Law pilot | D1 conclusion |
| --- | --- | --- | --- | --- |
| Task applicability | explicit source and skill discovery | infer project/framework; unsupported cases unspecified | law/non-law decision | Different domain predicates; do not model all as one generic `select`. |
| Unit selection | explicit files/locales, then translatable document regions | agent selects user-visible source literals | structural recognition follows whole-document applicability | First slice needs document-region selection only. |
| Protected identity | code/path/command/identifier/URL/frontmatter name | placeholders and technical terms | normalized whole character stream | The word `protect` is insufficient without content, count, occurrence, unit, and allowed-normalization relations. |
| Transform | natural document translation | extraction/key naming/source rewrite/translation | hierarchy/spacing normalization | Only document translation belongs in the first profile. |
| Output policy | locale suffixes, source safety, existing-target choice, mtime incrementality | locale files, rewritten source, completeness report; policy mostly unspecified | reports, conditional final artifact, artifact levels | Host-controlled staging/promotion is project-owned; source-specific output duties stay explicit. |
| Semantic judgment | translation adequacy, formality, example localization | visibility, keys, plural/gender/context | applicability and OCR adequacy | Typed return shapes can organize judgment but cannot make these judgments interchangeable. |
| Deterministic checks | none fully specified beyond identity/safety rules | key/placeholder completeness suggested | implemented character and structure checks | First slice needs its own document-localization checks and must label semantic quality separately. |

### 6. D1 decision

The first version may take responsibility only for **explicitly bound Markdown technical-document localization**: extract editable document units, preserve occurrence-bound technical content and selected frontmatter fields, request bounded translations, refill a source snapshot, run deterministic protection/coverage checks, and leave semantic quality as a separate status. Configuration discovery, first-run choices, incremental update policy, `share-skill` integration, application-source migration, and Law conversion remain visible but out of scope.

This is a provisional narrowing to be challenged against mature localization standards and near counterexamples in D2-D3. It is not yet the final range contract and must not be described as migrating either source skill in full.

## D2. Mature localization and representation systems

### 1. Versioned source set and layer boundaries

| Source | Version used | Actual layer | Applicability here |
| --- | --- | --- | --- |
| [XLIFF 2.1 Core](https://docs.oasis-open.org/xliff/xliff-core/v2.1/os/xliff-core-v2.1-os.html) | OASIS Standard, 2018-02-13 | Lossless localization **exchange format** between extraction, translation, and merge tools | Strong source for unit/segment/source/target, inline-code/original-data, state, order, whitespace, and validation concepts. It is not the task declaration or host lifecycle. |
| [ITS 2.0](https://www.w3.org/TR/its20/) | W3C Recommendation, 2013-10-29 | XML/HTML internationalization/localization **metadata categories** | Strong source for translate intent, localization notes, terminology, locale applicability, IDs, whitespace, character, size, and source-target pointers. ITS explicitly leaves application-specific filtering outside conformance. |
| [Okapi Framework glossary](https://okapiframework.org/devguide/glossary.html) and [TextUnit API](https://okapiframework.org/javadoc/net/sf/okapi/common/resource/TextUnit.html) | Developer guide is unversioned; API reference is SDK 1.47.0; retrieved 2026-09-20 | Filter/event/skeleton **roundtrip architecture** and implementation vocabulary | Strong architectural precedent for separating text units, properties, inline codes, and skeleton, then rebuilding through a filter writer. It is not a portable DSL contract. |
| [unist](https://github.com/syntax-tree/unist) | Released specification 3.0.0 | General syntax-tree **data model** | Supplies Node/Data/Position/Point and parsed/generated distinctions. It does not supply stable identity, localization semantics, or roundtrip behavior. |
| [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) | Classic/long-standing MessageFormat; released C++ API observed at ICU 78.3 | User-visible **message pattern format** | Supplies named/numbered arguments, plural/select/selectordinal, and escaping. MessageFormat 2 remains a draft/technical preview and is excluded from the first profile. |

This layer distinction prevents four category errors: XLIFF validity is not task completion; an Okapi filter is not an agent protocol; an AST position is not a unit identity; and placeholder parity is not translation quality.

### 2. Semantics worth reusing

XLIFF 2.1 §4.7 represents extracted text alongside non-linguistic inline codes such as formatting and variable placeholders. `originalData` and `dataRef*` preserve the original construct when the merger needs it; if the data is not stored, the original extractor remains responsible for reconstruction. Inline codes also carry capabilities such as copy, delete, reorder, and overlap rather than treating every protected token as an unordered string. Section 4.8 distinguishes a `unit` from segments produced by a segmentation mechanism and explicitly does not define the segmentation algorithm. Each segment has one source and an optional/possibly empty target; `ignorable` represents material between segments. XLIFF also defines normalized content equality, whitespace handling, a small translation state progression, and optional target validation.

ITS 2.0 contributes data-category meaning rather than a container. `Translate` expresses intended translatability with inheritance/default rules; Localization Note carries required alerts or optional context; Terminology identifies a term and may point to definitions; Locale Filter scopes content through BCP 47 ranges; ID Value supports document-local uniqueness and cross-version alignment; Preserve Space, Allowed Characters, Storage Size, and Target Pointer describe further constraints. Its conformance section is decisive: computing annotations does not implement automated selection or transformation.

Okapi's filter sends text into text units, non-text modifiable data into properties, and the remaining document into a skeleton. Inline markup becomes typed codes; a filter writer normally reconstructs the native format. This directly supports the architectural hypothesis that the model should edit extracted payload, not regenerate an entire Markdown document.

unist supplies source coordinates with half-open ranges and optional UTF-16 offsets. Generated nodes must not carry source positions. Those rules make positions useful provenance for a snapshot, but they also prove why positions alone cannot be stable IDs across changed source versions.

Classic ICU MessageFormat supplies a narrow opt-in grammar for application messages. Named or numbered arguments may move under translation; plural/select branches preserve full-message context; apostrophe/brace syntax must be parsed rather than approximated with one broad regular expression. The first prototype may validate classic MessageFormat only when a unit declares that profile. It must not apply ICU grammar to arbitrary prose or claim MF2 support.

### 3. Reuse, thin extension, and project ownership

| Concept | Reuse directly | Thin project extension | Project-owned semantics |
| --- | --- | --- | --- |
| `unit` | XLIFF unit/segment and Okapi text-unit/segment distinction; unist source position as provenance | `documentId`, node kind/path, source slice and snapshot-scoped unit ID | Which Markdown nodes are editable; repeated-node disambiguation; no promise of cross-version ID stability |
| `protection` | XLIFF inline codes/original data/copy-delete-reorder constraints; Okapi inline-code/skeleton split; ITS `translate=no` | Occurrence ID, containing unit, exact bytes/text, count, allowed movement relation | Snapshot refill, overlap resolution, code-to-unit binding, diagnostic and promotion effect |
| `term` | ITS Terminology/localization notes and optional XLIFF glossary concepts | Required/preferred/forbidden strength plus resource provenance | Conflict precedence, missing-resource behavior, and semantic review result |
| `context` | ITS required/optional notes; XLIFF/Okapi properties and annotations | Structured heading/list/link/frontmatter ancestry and neighboring-unit window | What the agent sees, batching limits, redaction, and whether absent context blocks work |
| `missing` | XLIFF target may be absent/empty and state may remain initial | Separate absent, explicit null, empty, untranslated, uncertain, and invalid-result representations | Fail/needs-input/partial policy, diagnostics, retries, and final status |
| `target` | XLIFF source/target language payload; ITS target pointer | Output binding, locale, staged path, replacement set, per-target state | Non-overwrite, independence, postcheck, semantic-review status, atomic promotion/publish |

No new syntax should duplicate these mature meanings. The project-owned portion is the missing connection between a user task and the data plane: input binding, profile selection, agent result contract, deterministic checks, failure policy, and controlled publication.

### 4. Same task under an existing format versus a candidate declaration

Task: translate `guide.md` to `guide.zh-CN.md`; preserve code, commands, URL destinations, environment variables and placeholders; translate link labels and prose; never modify the source; ask on ambiguous product terms.

**XLIFF/filter route.** A Markdown-aware extractor creates a source snapshot, skeleton, XLIFF units/segments, inline codes with original data, context notes, and empty targets. A translator or model fills target content; a merger reconstitutes Markdown. This is a credible data plane and interchange route. It still needs external configuration for input/output/locale, selection profile, ambiguity behavior, agent result completeness, stale-input handling, checks, staging, and promotion.

**Task-declaration route.** A small declaration binds input and output, chooses the Markdown localization profile, names protection/check profiles, supplies term resources and ambiguity policy, and declares the bounded agent result. The runtime generates XLIFF-inspired in-memory units or an optional XLIFF artifact, applies replacements to the snapshot, and controls publication. This route adds task/lifecycle semantics; it should not invent a competing unit or inline-code standard.

### 5. D2 decision

Do not make full XLIFF serialization the mandatory authoring surface for the first prototype, and do not invent an all-purpose localization exchange format. Reuse XLIFF/ITS/Okapi semantics in a narrow task declaration plus a source-snapshot/filter data plane. Keep the internal model serializable and close enough to map to XLIFF later, but let the first executable probe use explicit TypeScript/JSON objects so it can isolate unit identity, refill, and lifecycle questions.

The remaining D3 choice is therefore between (a) a narrow technical-document localization task declaration over this data plane and (b) stopping at a Markdown/filter configuration plus organized instructions. The broader preservation-transform shell is no longer a first-version candidate unless the boundary cases reveal a genuinely shared semantic beyond lifecycle vocabulary.

## D3. Range challenge and first-version scope contract

### 1. Challenge set

`cases.jsonl` records ten development cases: a pinned Apache-2.0 public skill document, a different local skill document, a direct-authored guide, code-only zero-unit input, plain-prose low-structure input, unsupported DOCX localization, Law hierarchy conversion, application-literal migration, source-free README synthesis, and an existing-target decision. These are purposive boundary cases, not a prevalence or effect sample.

The challenge exposes four distinct questions that the earlier `select` vocabulary conflated:

1. **Task applicability:** Is the requested operation translation/localization of an existing technical document? Law restructuring and source-free synthesis are out of task.
2. **Format support:** Can the current filter parse and refill the input kind? DOCX localization is applicable but unsupported in version 0.
3. **Unit selection:** Given an applicable, supported input, which document regions are editable? A code-only Markdown file validly yields zero editable units.
4. **Check applicability:** Given extracted units and protections, does a particular invariant have operands? Plain prose can have one editable unit and zero protected occurrences; `protected-equality` is then `not-applicable`, not a pass proving preservation value.

The same separation prevents refuse-all success: an implementation that marks every task out of range, every format unsupported, or every unit unselected fails the frozen case expectations.

### 2. Candidate comparison after the challenge

| Candidate | Evidence after D1-D3 | Decision |
| --- | --- | --- |
| Broad preservation-constrained transformation | Law, document translation, and application-source migration share snapshot/check/promotion vocabulary, but their applicability, unit identity, allowed edits, and semantic correctness are different. Shared lifecycle alone would create a generic wrapper. | Reject as first-version domain. Retain as a possible future umbrella only after two concrete profiles exist. |
| Mature format plus full executor | XLIFF/ITS/Okapi supply strong localization data semantics and filter architecture. A complete XLIFF authoring/execution toolchain would add XML, module, and merger surface before the snapshot/refill and agent-control questions are proven. | Reuse concepts and permit future interchange, but do not require full XLIFF serialization or an Okapi runtime in the minimum. |
| Narrow technical-document localization declaration | The public skill source, two real Markdown documents, and authored boundary cases share file/locale binding, translatable document units, inline-code/skeleton preservation, frontmatter rules, terminology/context, non-overwrite, coverage, and semantic review. | **Selected for D4-D10 and recommended first implementation scope.** |

Organized Markdown plus the same filter/check helper remains the strongest alternative, not a fourth domain. D9 must determine whether the declaration contributes any value beyond an explicit configuration and well-edited instructions.

### 3. One-page scope contract: `technical-document-localization/v0`

**Purpose.** Translate existing UTF-8 technical Markdown into one or more declared locales while preserving the source document, native skeleton, protected occurrences, and deterministic coverage. The profile coordinates a bounded agent translation result; it does not claim to judge translation quality deterministically.

**Included input profile.** Explicit file bindings only. Initial syntax is CommonMark-compatible Markdown plus the exercised GFM/frontmatter constructs needed by technical `SKILL.md` files: headings, paragraphs, block quotes, lists, tables, emphasis/strong/strikethrough, links, inline code, fenced/indented code, and leading YAML frontmatter. The exact parser support matrix is frozen by D5 tests. Raw HTML/MDX directives or parser nodes without safe source positions produce `unsupported-structure`, not silent text extraction.

**Editable units.** Frontmatter `description`; textual payload of headings, paragraphs, list-item paragraphs, block quotes, table cells, and link labels. A unit belongs to one document snapshot and has a document ID, structural path/node kind, exact half-open source range, source slice, context, and snapshot-scoped ID. Repeated text must remain distinct. No cross-version ID stability is promised.

**Protected/non-editable content.** Frontmatter `name`; code blocks and inline code; link/image destinations; autolink URLs; command/path/environment-variable/placeholder occurrences selected by a declared narrow profile; Markdown delimiters and all unselected source bytes. Each occurrence is bound to a unit or skeleton range with identity, count, and allowed movement relation. Identical strings in different units are not interchangeable.

**Task declaration.** Required: profile/version, input binding, source locale or explicit unknown, target locale(s), output binding(s), unit-selection profile, agent result contract, checks, and overwrite/ambiguity/failure policies. Optional: glossary, terminology rules, localization notes/context, and classic ICU MessageFormat profile. No arbitrary commands or open-ended steps.

**Runtime contract.** The host snapshots inputs, validates paths/policy, extracts units and protection manifests, renders bounded agent input, accepts exactly one result per selected unit, applies replacements to the unchanged snapshot, runs deterministic checks, records semantic-review status separately, and publishes only eligible staged targets. The source is never a writable target. An unattended `ask` becomes `needs-input` before model execution or promotion.

**Status distinctions.** `out-of-task`, `unsupported-format`/`unsupported-structure`, `zero-units`, `needs-input`, `failed`, `partial`, and `completed` are not synonyms. A completed target also carries independent `execution`, `checks`, `semanticReview`, and `published` states.

**Quality and claim boundary.** Byte preservation of untouched regions, source identity, unit coverage, placeholder/URL/frontmatter invariants, and output policy are deterministic. Meaning, fluency, terminology fit, and appropriateness of localized examples remain semantic review. Parse success, zero edits, or source refusal is not task success.

**Explicitly excluded from v0.** Configuration discovery/persistence and mtime incremental updates; application-source literal selection/key generation/AST rewriting; Law applicability/hierarchy; DOCX/PDF/OCR; raw HTML/MDX mutation; live/external actions; automatic migration-completeness proof; full XLIFF interchange conformance; production runner/package integration.

### 4. D3 decision

Proceed with the narrow document profile. D4 may use mature localization names and relations internally, but its public types must stay limited to the scope contract. If D5-D8 cannot preserve exact untouched bytes, bind occurrences to the correct unit, and enforce host-controlled output, the implementation recommendation must fall back to an organized Markdown/filter helper rather than broadening the language.

## D5. Unit extraction, protection identity, and refill probe

### 1. Strategy comparison

The executable probe uses one deliberately awkward fixture containing CRLF line endings, trailing spaces, Chinese and emoji text, repeated inline code, a URL, GFM table content, and YAML frontmatter. Three no-change routes were compared against its original bytes:

| Route | Result | Consequence |
| --- | --- | --- |
| Whole-document regeneration | Not byte exact | Reconstructing prose from selected content cannot preserve the original Markdown shell. |
| remark AST parse/stringify | Not byte exact | A syntax tree preserves structure, not the author's exact whitespace, line endings, delimiter choices, or source bytes. |
| Source-coordinate local refill | Byte exact | Keep the source snapshot as the authority and splice only selected half-open ranges, from the end of each document toward the start. |

The chosen representation is therefore a source snapshot plus smallest safely replaceable block payloads, opaque occurrence tokens inside each payload, and descending source-coordinate refill. The AST is a selector and provenance source, not the output serialization authority.

### 2. Probe-confirmed semantics

The probe demonstrates the following for the exercised parser profile:

- unit IDs include document identity, snapshot digest, node path/ordinal, source range, and slice digest, so repeated text, nested content, and identical text in different files stay distinct; changing the source intentionally changes the identity;
- each protected occurrence has its own token and owner unit, so two identical inline-code strings cannot be substituted across units;
- link labels remain editable while the destination and Markdown ownership stay protected;
- frontmatter `description` is editable and `name` is protected;
- overlapping protection candidates fail before agent input is built rather than relying on regex precedence;
- unknown, duplicate, and missing unit results have distinct diagnostics, and a changed input snapshot blocks refill before any target is produced;
- supported code-only Markdown yields `zero-units`, while raw HTML is reported as unsupported structure rather than silently flattened;
- a no-change replacement roundtrip is byte exact over the exercised multi-byte/CRLF fixture.

All twelve D5 tests pass, and the probe TypeScript passes strict type checking. The initial tests were first observed failing against a not-implemented extractor/refill stub, so the green result is not a post-hoc assertion over pre-existing behavior.

### 3. Boundaries and decision

This is feasibility evidence for one pinned JavaScript Markdown parser stack, not a compatibility claim for every CommonMark/GFM implementation. The frontmatter probe handles leading YAML and simple scalar `name`/`description` fields; complex YAML scalars, aliases, duplicate keys, embedded HTML/MDX, malformed encodings, image semantics, and cross-version translation memory alignment remain unsupported or undecided. Structural paths provide context but do not by themselves prove that the selected unit boundary gives enough translation context; D8 must exercise that question.

D5 selects **source-coordinate local refill** and rejects AST serialization as the fidelity mechanism. The same occurrence manifest must remain the only input to template rendering, refill, and D6 constraints; a validator must not rediscover protections with a second pattern set.

## D6. Protection, completeness, and semantic boundary probe

### 1. Validator result model

The D6 validator returns named checks with `pass | fail | not-applicable | unknown`, structured diagnostics, one aggregate deterministic status, and an unconditional `semanticReview: required`. It consumes D5 unit IDs, occurrence tokens, ownership, source text, and movement rules. The only lexical scan used on target text is the exported D5 scanner, whose purpose is to catch newly introduced untracked technical content; D6 does not define a second protection tokenizer.

| Check | What it proves | Important non-proof / risk |
| --- | --- | --- |
| target locale | A nonempty target is one of the requested locales. | It does not validate BCP 47 canonicalization or linguistic fit. |
| selected-unit coverage | Every already-selected unit has exactly one result and no result names an unknown unit. | It does not prove the selector found every translatable source region. |
| selection completeness | Reports a separate independent selector assessment as verified, failed, or unknown. | The validator cannot derive this from returned-unit coverage. |
| protected occurrences | Declared token identity, unit ownership, exact count, permitted order, and no newly typed protected-looking value. | Conservative scanning of newly introduced paths/URLs/placeholders may reject a legitimate new localized example; such content needs an explicit reviewed manifest update. |
| nonempty targets | Returned selected units contain non-whitespace text. | Nonempty text may still be irrelevant or wrong. |
| unchanged targets | Detects exact source-template copies under allow/review/fail policy. | Exact equality is only a useful warning/floor; unchanged proper names can be correct, while subtly untranslated text can evade it. |
| message profile | For explicitly selected classic ICU units, both sides parse and retain argument, plural/select option, nesting, and pound structure. | It does not prove wording, plural-category adequacy for the locale, formatting-style suitability, or MessageFormat 2 compatibility. |

Zero protection operands produce `not-applicable`, not an extra pass. An unknown selector assessment remains `unknown` even if returned-unit coverage passes.

### 2. Movement and grammar decisions

Named brace placeholders such as `{name}` and `{{name}}` may reorder within their owner unit. Positional printf-like arguments, link syntax/destinations, inline code, and other protected occurrences retain their relative order. Identity and count remain exact for both groups. A token from another unit is foreign even when its source text is identical.

Classic ICU MessageFormat is opt-in per unit and is parsed with pinned `@formatjs/icu-messageformat-parser` 3.5.19. The comparison ignores literal wording and top-level element order but preserves argument type/name, nested plural/select controls and option keys, offsets/types, and `#` occurrences. Invalid grammar and unimplemented profiles, including MessageFormat 2, fail explicitly. No broad brace regular expression is used as an ICU parser.

### 3. Executable boundary result

Twelve D6 tests cover missing, duplicate, foreign, reordered and newly introduced protected content; swapped link destinations; missing/undeclared locale; empty and exact-copy targets; selected coverage versus selector completeness; zero-protection applicability; classic ICU success/failure; and an intentionally meaning-reversing translation that keeps every deterministic protection. That last case passes all applicable deterministic checks and still returns `semanticReview: required`, directly demonstrating that protection correctness is not translation correctness.

D6 therefore supports implementing these checks as promotion preconditions and structured evidence, but not using them as an automatic semantic-quality oracle. Selection completeness requires independent evidence, and exact-copy/new-technical-content policies must remain configurable because their false-positive boundary is task-specific.

## D7. Runtime responsibility and publication-state probe

### 1. Current runtime boundary observed at HEAD

The current `src/run/index.ts` resolves already-loaded task/skill values, prepares a workspace, calls an adapter, and returns its `RunResult` plus workspace/snapshot references. Workspace preparation copies task fixtures, optionally writes initial/pre-run manifests, and deploys the skill bundle before `adapter.run`; adapter teardown is in `finally`. `prepareRunWorkspaceArtifacts` is private. The exported `prepareRunWorkspace` exposes only the initial-manifest reference, so the private helper is not an integration API.

`src/cli/run.ts` performs CLI/config validation and task/skill loading, calls `executeRun`, surfaces adapter `runStatus`, text and telemetry, and assigns a failing exit status when the adapter reports a non-OK run. The ordinary run path does not define the localization replacement envelope, reconstruct a candidate from source coordinates, run D6 checks, stage a declared target, or publish it. Those are new profile-runtime responsibilities; pretending that ordinary `executeRun` already owns them would create a nonexistent hook.

### 2. Probe responsibility map

| Stage | Probe owner | Result |
| --- | --- | --- |
| declaration/path resolution | host | Resolve relative paths inside the workspace; reject duplicate IDs/paths and source-target collision. |
| source preparation/preflight | host | Read-only source snapshot, format/structure check, existing-target policy, unattended `ask`, timeout and independence validation. |
| unit/protection rendering | D5 filter under host control | Build units and opaque occurrence manifest; agent receives data, not a command or publication authority. |
| translation | adapter/agent | Return `completed` replacement sets or bounded `needs-input`; it does not write the declared final target. |
| result parsing/refill/postcheck | host with D5/D6 | Validate the envelope, one target/unit result, constraints, current source digest, and produce a staged candidate. |
| semantic review | explicit reviewer or policy | Return acceptable/unacceptable/unknown; deterministic pass never manufactures acceptance. |
| publication | host | Recheck source and target state immediately before a per-target copy; publish only eligible targets. |

The probe adapter is data-only. This demonstrates an interface that does not require filesystem writes, but it does **not** prove isolation for existing unrestricted-shell adapters. A production integration must either keep final paths unavailable to the agent or treat the working directory as untrusted and verify every relevant byte after execution.

### 3. State and failure decisions

Fourteen lifecycle tests confirm the intended branches:

- a normal result is staged, checked, optionally reviewed, and published without changing source bytes;
- optional semantic review may leave `semanticReview: unknown` on a completed artifact, while mandatory missing review returns `needs-input` with no publication;
- an early textual/completed claim with no target result still fails coverage; malformed shape and timeout fail before checks; explicit agent uncertainty returns `needs-input` rather than waiting;
- one failed target may produce `partial` only under `publish-independent` with every target declared independent; a coupled task publishes none;
- source-target collision and an unattended existing-target `ask` stop before agent execution;
- a target created after preflight is detected again and is not overwritten, while explicit `replace` authorizes replacement;
- a source changed during execution makes the snapshot stale and blocks every final target.

Final status dimensions remain independent: task status (`invalid-input | unsupported | needs-input | failed | partial | completed`), execution, checks, semantic review, and publication. A model completion string is not a state transition, and checks passing is not semantic acceptance.

### 4. Transaction and recovery limit

The probe writes candidates under a run-specific staging directory and copies each eligible target only after the last checks. This is controlled staging, **not** a cross-file transaction and not crash-atomic replacement. A multi-target process can still fail after publishing one independent file; the result must preserve per-target publication evidence. For coupled targets, v0 forbids partial publication but a production implementation needs a stronger publish strategy or recovery journal before claiming all-or-nothing filesystem atomicity. General persisted restart/resume is deferred; any retry must re-read the declaration, source digest, target state, and review evidence.

## D8. Direct authoring and small usability probe

### 1. One closed authoring shape, three origins

Three declarations use the identical `technical-document-localization/v0` object:

| Declaration | Origin | What differs |
| --- | --- | --- |
| `migrated-public-skill.json` | pinned public technical skill task | source/target bindings, zh-CN, full required lexical protections, overwrite ask, mandatory review, migration provenance |
| `different-local-skill.json` | different local skill document treated as content | ja target, non-overwrite, ambiguity recording, optional review, separate source provenance |
| `direct-guide.json` | natural task with no predecessor program | local guide binding, zh-CN, explicit protection and target policy, direct-author provenance |

The declaration contains values only: natural request, source/target bindings, locales, protection kinds, ambiguity/overwrite/partial/review policies, and provenance. Closed-object validation rejects an arbitrary `command` field, unknown protection kinds, unsafe/duplicate paths and IDs, source-target collision, unsupported format/version, and partial publication without declared independence. It does not execute user-composed shell strings.

The migrated declarations are responsibility slices, not claims that every source-skill behavior was migrated. In particular, the public task's discovery, configuration persistence, first-use selection, incrementality and `share-skill` integration remain outside v0. Their provenance field preserves that distinction.

### 2. Field behavior rather than decorative schema

- changing a target locale changes the target's requested locale; changing its path changes only its output binding;
- `ask` on an existing unattended target returns `needs-input`, whereas `replace` authorizes the host to replace that exact target after publish-time revalidation;
- changing lexical protection kinds changes D5 extraction and the manifest passed to the agent and D6. Structural Markdown protections remain profile-owned and cannot be disabled by this field;
- changing a migrated declaration to omit a source-required protection is a real responsibility change, not a harmless formatting edit, and must be reviewed against the source obligation ledger;
- a source-target collision is type-shaped JSON but semantically invalid and is rejected before execution.

### 3. Context and end-to-end result

The direct-authored fixture completed one stub end-to-end path: closed declaration → source snapshot → all selected units and protected items in one `document-batch` request → bounded replacement set → deterministic constraints → source-coordinate refill → acceptable test-review result → staged target publication. The source bytes remained unchanged, frontmatter `name` and the link destination survived, and translated content appeared in the target. The adapter was invoked once for the document rather than once per sentence, so headings, neighboring units, structural paths and occurrence metadata were available together.

This is a deterministic recorded stub, not model evidence. It does not show that the current context is sufficient for long documents, that excluded skeleton content is always unnecessary, or that a model returns good localization. A future real adapter should avoid sending both the original skill and an equivalent rendered instruction body when the latter is complete; such double loading would confound token cost. Large-document windows, glossary/term resources and explicit nonselected-context summaries remain design questions.

### 4. Real-model decision

The execution process had no recognized configured provider API-key environment variable. Under the taskbook's conditional rule, no paid usability call was attempted and no credential value was read or recorded. `probe-results.json` marks real-model consumption `not-run`, with zero calls and zero known/unknown cost. The end-to-end feasibility result is therefore limited to deterministic code and stub consumption; model instruction following, quality, cost and repair behavior remain open for the next paired development run once a legitimate route is supplied.

## D9. Fair comparison and benefit decision

### 1. Four conditions and parity contract

The first effect comparison must freeze four distinct conditions. Its primary representation comparison is **MH versus DH**, because both receive the same executable capabilities and invocation timing. O and M are attribution arms, not substitutes for that pair.

| Dimension | O — original skill | M — organized Markdown | MH — Markdown + helper | DH — declaration + helper |
| --- | --- | --- | --- | --- |
| authored method | pinned original skill instructions | manually organized in-scope obligations in Markdown | the exact M instructions | closed v0 declaration compiled to bounded context |
| task/source facts | identical user task, source bytes, locale, target policy, glossary/notes | same | same | same; compiler may not add answer-bearing facts |
| examples/gold text | no condition-only translation or answer | same | same | same |
| model/config | same route, parameters, timeout and context budget | same | same | same |
| model call budget | one generation; at most one repair only from actionable deterministic evidence | same | same | same |
| extraction/unit manifest | not exposed as a helper interface | not exposed as a helper interface | D5 helper, automatically before generation | identical D5 helper, same timing |
| result contract/refill | staged whole candidate under common harness | same | bounded replacement set + D5 refill | identical bounded replacement set + refill |
| deterministic feedback | scored after the attempt; no condition-only hidden answer | same | identical D6 diagnostics; at most one repair | identical D6 diagnostics; at most one repair |
| semantic reviewer | same blind rubric and source/target pair | same | same | same |
| publication control | common read-only-source/staging gate; failed candidates do not become final artifacts | same | same | same |
| original skill loaded in addition to method | yes, by definition | no | no | no; compiled context replaces it rather than double-loading it |

The common publication gate may score and withhold unsafe artifacts in every arm, but O/M do not receive helper-derived unit feedback during generation. MH/DH receive exactly the same helper and automatic call points. Therefore:

- DH versus MH estimates the effect of closed declaration + compiler-rendered context, not the helper;
- MH versus M estimates the effect of helper-mediated extraction/result/refill/diagnostics under the same Markdown instructions;
- M versus O estimates the effect of manually organizing the same bounded responsibility slice;
- DH versus O is an end-to-end package comparison and cannot be attributed to syntax alone.

### 2. Frozen initial development experiment

Start with two real tasks, one run per MH/DH cell, not a nine-task repeated matrix:

1. the pinned public `webapp-testing/SKILL.md` to zh-CN under the recorded source digest/provenance;
2. the local `i18n-helper/source/SKILL.md` to ja as document content, without executing its described application rewrite workflow.

Freeze source bytes, declaration/Markdown responsibility parity, model route and sampling, prompt render, helper version, timeout, call/repair budgets, reviewer rubric, and publication policy before calls. Preserve compiled DH context and MH context for comparison. Randomize or alternate condition order, and prevent a reviewer from seeing the condition label. Do not give DH a hand-curated unit list, polished target, or terminology answer that MH does not receive.

If the first pair is a ceiling/tie, add one predeclared changed-task variant that alters locale or target/protection policy and tests whether the change propagates correctly; do not merely repeat the same calls. Add O/M only when needed to distinguish helper-only from representation effects. Any expansion requires a named unresolved question.

### 3. Primary benefit, floors, and observations

The predeclared primary benefit is **publish eligibility without human repair** at the fixed one-generation/one-deterministic-repair budget. A task is eligible only when the applicable deterministic checks pass, the source remains unchanged, the declared output policy is respected, and blind semantic review is acceptable. Record a binary per task/condition plus the exact reason for ineligibility; do not average refusals with successful tasks or award success to an unsupported/refuse-all result.

Quality and cost floors:

- DH may not have a worse semantic-acceptability result or more blocking deterministic violations than MH on either initial task;
- DH may use no extra model call and at most 20% more total model tokens than MH for the paired task; wall time is reported but not used alone to overturn quality;
- any hidden human edit, policy choice, unit selection, terminology answer, or review intervention is counted as an intervention and disclosed before eligibility;
- authoring/modification effort is measured by observed elapsed time and intervention log in a later authoring exercise, never inferred from line count or schema size.

Secondary measurements are input/output/cached tokens, wall time, failure phase/code, repair invocation and outcome, selected-unit count, rendered-context bytes, published bytes, semantic reviewer decision/reason, and observed author actions. Stub calls and D8 feasibility are excluded from effect totals.

### 4. Outcome taxonomy fixed before results

| Outcome | Interpretation |
| --- | --- |
| `method-supportive` | DH improves the primary result or reduces observed intervention while all quality/cost floors hold; still development evidence, not generalization. |
| `helper-only` | MH and DH improve similarly over M/O and DH has no material advantage over MH. |
| `ceiling` | Both MH and DH are eligible with zero repair/intervention, leaving no room on the primary outcome; run the changed-task variant before judging value. |
| `tie` | Observable results and costs are materially equal without a clear ceiling. |
| `tradeoff` | DH improves control/intervention but breaches a predeclared quality or token floor, or conversely costs less with worse quality. |
| `negative` | DH is worse on primary eligibility or semantic quality without a compensating predeclared benefit. |
| `inconclusive` | Execution/config failure, reviewer disagreement, unsupported input, missing telemetry, or sample insufficiency prevents the planned comparison. |

No post-result metric substitution may turn a quality regression into success. Two tasks can justify the next development decision, not a population or human-productivity claim. D9 performs no model calls or effect run; it freezes the next comparison so D8's stub result cannot be misreported as benefit evidence.

## D10. Consolidated design and implementation handoff

### 1. Narrowing after executable evidence

`semantic-design.md` now distinguishes the broad semantic model from the minimum I1-I3 authoring projection. The next production increment deliberately supports one explicit Markdown input and one target per run. This removes cross-file transaction claims from the first integration while retaining tested internal multi-document identity and the broader future `partial` definition. Selection, structural protection, required checks, agent result completeness and no-publish-on-failure are fixed profile semantics rather than user-authored check lists.

The author may set the natural request, source locale, one input/target binding, lexical protection kinds, notes/inline terminology, ambiguity/overwrite/review/unchanged policies and provenance. Migrated declarations additionally carry an obligation ledger whose residual duties are rendered; it never claims extraction completeness. Classic ICU remains tested but not exposed because an author-time Markdown unit selector has not been designed.

### 2. Actual integration audit

At review time all five requested production files were clean relative to HEAD `0d96309`; none contains another thread's uncommitted edit.

- `src/run/index.ts` prepares the ordinary workspace and calls an adapter; its full artifact preparer is private and it has no postcheck/publisher hook. Keep the legacy path unchanged.
- `src/cli/run.ts` is the only planned small integration edit: after explicit skill/task resolution it detects the reserved declaration, routes that package to the new profile runner, and otherwise follows the current ordinary branch.
- `src/adapters/bare-agent.ts` and `src/core/agent-tools.ts` are not the bounded localization agent. They expose file/shell/network tools, and path resolution is not a workspace isolation boundary. The new runner uses a structured provider result without those tools.
- `src/jit-optimize/package.ts` atomically publishes a verified empty/missing directory by rename. It is not reused for a target file, existing-file replacement, or multi-target transaction.

This is an insertion that exists: CLI package detection plus a new runner/provider channel. It does not refer to `prepareRunWorkspaceArtifacts`, add a generic hook, or modify the optimizer package flow.

### 3. I1-I5 handoff result

`implementation-handoff.md` provides owned files, exact signatures, first failing tests, commands, boundaries and completion evidence for:

1. strict schema/semantic resolution, migrated-obligation ledger and renderer;
2. pinned Markdown extraction, occurrence protection, constraints and byte-preserving refill;
3. opt-in ordinary-run detection, structured provider result, host staging/publication and legacy compatibility;
4. the frozen two-task MH/DH comparison and conditional O/M attribution;
5. a clean-copy example package and original/changed task documentation.

The canonical direct-guide trace keeps `guide` input, `zh` target, snapshot-scoped unit IDs and `guide.zh-CN.md` path consistent from declaration through result and outcome. It explicitly corrects the earlier illustrative heading replacement: the editable payload is `Reset the demo`, not Markdown text including `#`.

Relative dependency size is I1 medium, I2/I3 large, I4/I5 medium. The critical implementation path is I1 → I2 → I3 → I5; I4 branches after I3 and gates effect claims. The next round begins with I1 failing tests, not generic-run edits or a new CLI/compiler surface.

### 4. Remaining blockers and revision triggers

Real-model structured consumption, long-document context/windowing, semantic-review availability and platform-safe existing-target replacement remain open. They do not block I1-I2 deterministic implementation. They do block claims of practical model usability, atomic publication, quality, cost or effect. If representative model calls cannot return complete replacement sets within one generation and one actionable repair, revise the renderer/result contract before broad CLI delivery. If MH and DH tie while the declaration adds burden, retain the helper/runtime and drop the language layer as D9 predeclared.

## D11. Delivery decision

The broad preservation-constrained transform is not retained as the first domain. Proceed only with the explicit technical-document localization slice, and keep the broader Law/application/OCR responsibilities outside rather than hiding them behind generic `select` or `protect` fields.

The design reuses XLIFF unit/inline-code/target meaning, ITS translate/note/term metadata concepts, and the Okapi filter/skeleton split. It does not require XLIFF serialization or an Okapi runtime. The representation shown to work in the probes is immutable source bytes plus snapshot-scoped source-coordinate units, occurrence-bound opaque tokens, and descending local refill; AST serialization is rejected as the output authority.

The blocking questions for production claims are real-model structured consumption, long-document context/windowing, semantic review availability, and platform-safe replacement of an existing target. They do not block the deterministic I1-I2 start. The next implementation is I1 only: strict schema and semantic resolution, migrated-obligation ledger, and bounded renderer with the listed red-first tests. Production runner integration remains I3 and effect measurement remains I4.

D11 freshly reran all four probe files (45 passed, 0 failed, 126 assertions), strict TypeScript checking, and parsing for seven JSON files plus ten rows in one JSONL file. Independent read-only review found no critical issue and caught one missing `plain-prose.md` fixture, which was added before final verification. Its separate strict-JSONL concern identified the file's one terminal LF; that is a record delimiter rather than an internal blank record, so the final validator accepts it while rejecting empty records inside the stream. No production code changed, no real model or effect experiment ran, and no result is upgraded beyond bounded design/probe feasibility.
