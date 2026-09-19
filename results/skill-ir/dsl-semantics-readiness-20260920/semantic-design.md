# Technical Document Localization v0: Semantic Design

Status: D10 consolidated semantic design after executable probes. Sections 1-10 define the semantic model and exercised relations; section 11 freezes the narrower I1-I3 authoring projection. This is not yet a production API or XLIFF replacement.

## 1. Responsibility boundary

The profile binds an existing technical Markdown snapshot to declared locale targets. The host owns path resolution, immutable source snapshots, extraction, unit/protection manifests, result-shape validation, refill, deterministic checks, target staging, and publication. The agent owns only bounded translation/uncertainty results. A semantic reviewer owns meaning, fluency, terminology fit, and localized-example appropriateness. User input is required only when a declared `ask` policy is triggered.

No component may infer success from parse validity, zero writes, or refusal. No adapter may execute arbitrary commands. No production runner behavior is assumed by this design.

## 2. Core types

```ts
type Digest = `sha256:${string}`;
type Bcp47 = string;
type UnitId = string;
type ProtectedItemId = string;

interface TaskSpec {
  schemaVersion: "technical-document-localization/v0";
  id: string;
  inputs: InputBinding[];                 // required, non-empty
  sourceLocale: Bcp47 | null;             // required; null means deliberately unknown
  targets: TargetBinding[];               // required, non-empty
  selection: SelectionSpec;               // required
  protection: ProtectionRule[];           // required; may be empty
  terminology?: TerminologyBinding[];     // absent means not supplied
  agent: AgentContract;                   // required
  checks: CheckSpec[];                    // required, non-empty
  policies: PolicySet;                    // required
}

interface InputBinding {
  id: string;
  path: string;
  mediaType: "text/markdown";
  parserProfile: "commonmark-gfm-frontmatter/v0";
  expectedDigest?: Digest;
  readOnly: true;
}

interface TargetBinding {
  id: string;
  inputId: string;
  locale: Bcp47;
  path: string;
  overwrite: "never" | "ask" | "allow";
  independent: boolean;
}

interface SelectionSpec {
  profile: "technical-prose/v0";
  include: Array<
    | "frontmatter.description"
    | "heading"
    | "paragraph"
    | "blockquote.paragraph"
    | "list-item.paragraph"
    | "table-cell"
    | "link-label"
  >;
  exclude: Array<"code" | "inline-code" | "raw-html" | "image" | "link-destination">;
}

interface ProtectionRule {
  id: string;
  collector:
    | { kind: "syntax"; profile: "markdown-inline-and-frontmatter/v0" }
    | { kind: "lexical"; profile: "command-path-env-url-placeholder/v0" }
    | { kind: "message"; profile: "icu-messageformat-classic/v0" };
  relation: ProtectionRelation;
  required: boolean;
}

interface ProtectionRelation {
  content: "byte-exact" | "text-exact" | `normalized:${string}`;
  count: "occurrence-exact";
  placement: "same-unit" | "same-container" | "document-order";
  reorder: "forbid" | "named-within-unit";
  structure: "none" | "paired-inline" | "link-destination" | "icu-ast";
}

interface TerminologyBinding {
  id: string;
  resourcePath: string;
  required: boolean;
  strength: "preferred" | "required" | "forbidden";
}

interface AgentContract {
  operation: "translate-units";
  context: Array<"unit-source" | "unit-structure" | "localization-notes" | "protection-tokens" | "terminology">;
  returns: "replacement-set/v0";
  completeWhen: "exactly-one-result-per-selected-unit-per-target";
  uncertainty: "ask" | "record" | "fail";
}

interface CheckSpec {
  id: string;
  kind:
    | "source-snapshot-unchanged"
    | "selected-unit-coverage"
    | "protected-occurrence-integrity"
    | "frontmatter-field-policy"
    | "target-path-policy"
    | "target-locale-present"
    | "nonempty-translation";
  blocking: boolean;
  protectionRuleRefs?: string[];          // references rules; never repeats collectors
}

interface PolicySet {
  missingRequired: "fail";
  missingOptional: "record-default" | "record-absent";
  ambiguity: "ask" | "record" | "fail";
  unsupported: "fail";
  checkFailure: "no-publish";
  partialTargets: "forbid" | "publish-independent";
  unattendedAsk: "needs-input";
}
```

The runtime derives the following immutable manifests from a resolved `TaskSpec` and source bytes:

```ts
interface SourceSnapshot {
  documentId: string;
  inputId: string;
  digest: Digest;
  bytesLength: number;
  encoding: "utf-8";
  bom: "present" | "absent";
  newline: "lf" | "crlf" | "mixed" | "none";
}

interface SourceRange {
  byteStart: number;  // inclusive
  byteEnd: number;    // exclusive
  textStart: number;  // inclusive UTF-16 code-unit offset
  textEnd: number;    // exclusive UTF-16 code-unit offset
  line: number;       // 1-based provenance only
  column: number;     // 1-based provenance only
}

interface SourceUnit {
  id: UnitId;
  documentId: string;
  kind: "frontmatter-description" | "heading" | "paragraph" | "blockquote-paragraph" | "list-item-paragraph" | "table-cell";
  structuralPath: string;
  range: SourceRange;
  sourceSlice: string;
  template: string;                   // editable source with opaque protection tokens
  protectedItemIds: ProtectedItemId[];
  context: {
    headings: string[];
    containerKind: string;
    localizationNotes: string[];
  };
}

interface ProtectedItem {
  id: ProtectedItemId;                // occurrence identity, not a value identity
  documentId: string;
  ownerUnitId: UnitId | null;         // null only for document skeleton items
  ruleIds: string[];
  kind: "frontmatter-name" | "inline-code" | "code-block" | "command" | "path" | "environment-variable" | "url" | "link-destination" | "placeholder" | "icu-argument" | "markdown-inline";
  range: SourceRange;
  sourceText: string;
  sourceDigest: Digest;
  token: string;                       // unique opaque token generated by the host
  relation: ProtectionRelation;       // strictest merged relation from its ruleIds
  containerId: string;
}

interface Replacement {
  targetId: string;
  unitId: UnitId;
  status: "translated" | "unchanged" | "needs-input";
  text?: string;                       // required only for translated/unchanged
  reason?: string;                     // required for unchanged/needs-input
  uncertainty?: string[];
}

interface Diagnostic {
  code: string;
  phase: "resolve" | "preflight" | "extract" | "agent-result" | "refill" | "check" | "semantic-review" | "publish";
  severity: "error" | "warning" | "info";
  blocking: boolean;
  constructRef: string;
  inputId?: string;
  targetId?: string;
  unitId?: UnitId;
  protectedItemId?: ProtectedItemId;
  message: string;
  evidence?: Record<string, unknown>;
}

interface RunOutcome {
  status: "invalid-input" | "unsupported" | "needs-input" | "failed" | "partial" | "completed";
  execution: "not-started" | "running" | "succeeded" | "failed" | "timed-out";
  checks: "not-run" | "passed" | "failed" | "not-applicable";
  semanticReview: "not-run" | "pending" | "acceptable" | "unacceptable" | "unknown";
  published: "none" | "partial" | "all";
  targets: Array<{
    id: string;
    state: "not-started" | "staged" | "check-failed" | "review-pending" | "published" | "failed";
    outputDigest?: Digest;
  }>;
  diagnostics: Diagnostic[];
}
```

## 3. Author-time rules

1. Objects are closed: unknown fields are errors. Extensions require a new profile/version rather than being ignored.
2. Required fields must be present. An absent optional field means “not supplied.” It does not mean `null`, empty, or false.
3. Explicit `null` is allowed only where the type names it. In v0 this is `sourceLocale: null`, meaning deliberately unknown. `null` never asks the runtime to use a default.
4. An empty required collection is type-valid JSON but semantically invalid when the contract says non-empty (`inputs`, `targets`, `checks`, selection include set).
5. IDs are unique in their owning collection. References resolve exactly once.
6. Every target references an input, has a unique `(inputId, locale, path)` identity, and cannot resolve to any source path when source inputs are read-only.
7. BCP 47 syntax is validated, but locale appropriateness remains author responsibility.
8. `ProtectionRule.collector` is the only source of protection extraction semantics. Checks refer to rule IDs/manifests and may not restate regexes, node selectors, or normalization.
9. Every blocking semantic mechanism has one owner: declaration resolution, extraction, agent result validation, deterministic check, semantic review, or publish. The same invariant is not independently reimplemented at multiple layers.
10. v0 has no hidden configuration read. An integration may resolve values before constructing `TaskSpec`, but must attach provenance using this precedence: invocation override > explicit declaration > named per-skill config > global config > profile default. Interactive choice is not a value source; unresolved choice becomes `needs-input`. A logical conflict after resolution is fatal regardless of precedence.

## 4. Runtime unit and protection rules

### 4.1 Snapshot and ranges

- The host reads source bytes once, verifies optional expected digests, decodes strict UTF-8, and records BOM/newline facts.
- All ranges are half-open and contain both byte and UTF-16 offsets. Line/column are diagnostic provenance, never identity.
- A unit ID is snapshot-scoped and derived from `documentId`, structural path, occurrence ordinal, range, and source-slice digest. Identical text in the same or different files must have distinct IDs. No ID is promised to survive a source edit.
- Unit ranges never overlap. The selector chooses the smallest supported editable block payload; parent containers supply context rather than becoming overlapping units.
- Before refill the host rechecks the source digest. Changed input produces `stale-source-snapshot`; no replacement is applied.

### 4.2 Protection manifest

- Syntax collection runs before lexical/message collection. Excluded syntax nodes are never rescanned as editable prose.
- Two candidates with the exact same range and source bytes merge into one occurrence with all `ruleIds` and the strictest compatible relation.
- Any partial or proper containment overlap between different ranges is a blocking `protection-overlap` diagnostic in v0. A future profile may define nesting, but v0 does not guess precedence.
- Each occurrence gets a unique token. Duplicate source text therefore remains occurrence-distinct.
- A unit template substitutes occurrences but retains enough structural tokens to rebuild the original Markdown container. The model never receives permission to rewrite a protected byte range directly.
- A replacement may move a token only when its relation permits it. Named placeholders may reorder within their owning unit. Positional placeholders, paired inline codes, link destinations, and document-order items may not.
- Moving a token from unit A to unit B is always a foreign-token failure, even if both protected bytes are identical.

### 4.3 Refill

For each target, the host validates the complete replacement set, expands protection tokens from the manifest, and applies unit replacements to the original snapshot from highest source offset to lowest. Untouched byte ranges are copied directly. A target is staged separately; the source path is never opened for writing.

Zero selected units is a valid extraction outcome. It makes agent execution unnecessary and unit coverage vacuously complete, but it is reported as `zero-units`; an identical target is only staged when the task/output contract explicitly requests a locale artifact. A protection check with zero protected occurrences reports `not-applicable`, not `passed`.

## 5. Exact relation semantics

| Relation | Definition | Failure examples |
| --- | --- | --- |
| `byte-exact` | Output occurrence bytes equal the snapshotted bytes exactly. No implicit decoding or newline normalization. | CRLF becomes LF inside a protected span; UTF-8 bytes change. |
| `text-exact` | Strictly decoded Unicode strings are equal code point for code point. No implicit NFC/NFKC or whitespace change. | Full-width punctuation or emoji variation selector changes. |
| `normalized:<id>` | Compare only through a named, versioned normalizer whose implementation and evidence are recorded. No anonymous “ignore formatting.” | A declaration names an unavailable normalizer; normalized equality hides a change outside its documented equivalence. |
| `occurrence-exact` | The same set of occurrence IDs appears exactly once each; raw-value multisets are insufficient. | Two `{name}` occurrences collapse to one; one duplicate code item replaces another. |
| token identity | Every expected opaque token belongs to the target's input snapshot and owning unit. Extra, unknown, duplicate, or foreign tokens fail. | Unit B returns unit A's identical-looking code token. |
| order | Compare the occurrence-ID sequence within the declared scope. `named-within-unit` permits named argument reordering only; `forbid` requires exact order. | `{first}`/`{last}` reorder may be allowed; positional `{0}`/`{1}` swap fails. |
| structure | Validate a named relation, not visual presence: paired inline nesting, link label→destination ownership, or ICU parse-tree equivalence. | The same URL survives but attaches to another link; opening/closing markup crosses. |

Content, count, token, order, and structure are independent. A check reports each failed relation rather than collapsing them into “protected text changed.”

## 6. Agent result and semantic acceptance

The result envelope must contain exactly one `Replacement` for each `(targetId, selected unitId)`. Unknown, duplicate, or missing results are deterministic contract failures. `translated` and `unchanged` require text; `unchanged` also requires a reason. `needs-input` must supply the uncertainty/question and follows the task policy.

Template/token validity, coverage, path policy, and manifest relations are deterministic. A grammatical but meaning-changing translation can satisfy every deterministic check. Such a target remains `semanticReview: unacceptable` or `unknown`; it cannot be relabeled as complete quality because the schema and checks passed.

## 7. Outcome invariants

- `invalid-input` and `unsupported` imply `execution: not-started`, `published: none`.
- `needs-input` implies no target has been published. In unattended runs, every `ask` policy resolves to this status.
- `failed` means no eligible independent target was published. It may include failed or timed-out execution, malformed results, blocking checks, or unacceptable mandatory semantic review.
- `partial` is allowed only when targets are declared independent, policy is `publish-independent`, at least one eligible target is published, and at least one target is not.
- `completed` requires all required targets published and no blocking diagnostic. It does not erase semantic-review state; if review is optional, `unknown` remains explicit.
- `published: all` is impossible before successful deterministic checks. Publication never changes the source snapshot.

## 8. Type-valid versus semantically acceptable

| Example | Type-valid? | Semantically acceptable? | Diagnostic/result |
| --- | --- | --- | --- |
| Source and target resolve to the same path with `overwrite: never` | yes | no | `source-target-collision`, `invalid-input` |
| Two target IDs resolve to the same path | yes | no | `target-path-conflict`, `invalid-input` |
| Check references an unknown protection rule | yes | no | `unknown-protection-rule`, `invalid-input` |
| `protection: []` with a protection check referencing `[]` | yes | yes only if check reports not-applicable | no preservation claim |
| Replacement string parses and has all tokens, but translates “do not delete” as “delete” | yes | deterministically acceptable, semantically unacceptable | checks pass; review rejects |
| Named placeholders reorder within one unit under `named-within-unit` | yes | yes | pass if ICU structure remains valid |
| Positional placeholders reorder under `forbid` | yes | no | `protected-order-mismatch` |
| Agent returns a syntactically valid result for an unknown unit | yes | no | `extra-unit-result` |

## 9. Complete declaration/result examples

### 9.1 Successful migrated public skill document

```json
{
  "declaration": {
    "schemaVersion": "technical-document-localization/v0",
    "id": "webapp-testing-zh",
    "inputs": [{"id":"doc","path":"SKILL.md","mediaType":"text/markdown","parserProfile":"commonmark-gfm-frontmatter/v0","readOnly":true}],
    "sourceLocale": "en",
    "targets": [{"id":"zh","inputId":"doc","locale":"zh-CN","path":"SKILL.zh-CN.md","overwrite":"never","independent":true}],
    "selection": {"profile":"technical-prose/v0","include":["frontmatter.description","heading","paragraph","blockquote.paragraph","list-item.paragraph","table-cell","link-label"],"exclude":["code","inline-code","raw-html","image","link-destination"]},
    "protection": [
      {"id":"syntax","collector":{"kind":"syntax","profile":"markdown-inline-and-frontmatter/v0"},"relation":{"content":"byte-exact","count":"occurrence-exact","placement":"same-container","reorder":"forbid","structure":"paired-inline"},"required":true},
      {"id":"lexical","collector":{"kind":"lexical","profile":"command-path-env-url-placeholder/v0"},"relation":{"content":"text-exact","count":"occurrence-exact","placement":"same-unit","reorder":"named-within-unit","structure":"none"},"required":true}
    ],
    "agent": {"operation":"translate-units","context":["unit-source","unit-structure","localization-notes","protection-tokens","terminology"],"returns":"replacement-set/v0","completeWhen":"exactly-one-result-per-selected-unit-per-target","uncertainty":"ask"},
    "checks": [
      {"id":"source","kind":"source-snapshot-unchanged","blocking":true},
      {"id":"coverage","kind":"selected-unit-coverage","blocking":true},
      {"id":"protected","kind":"protected-occurrence-integrity","blocking":true,"protectionRuleRefs":["syntax","lexical"]},
      {"id":"frontmatter","kind":"frontmatter-field-policy","blocking":true},
      {"id":"path","kind":"target-path-policy","blocking":true},
      {"id":"locale","kind":"target-locale-present","blocking":true},
      {"id":"nonempty","kind":"nonempty-translation","blocking":true}
    ],
    "policies": {"missingRequired":"fail","missingOptional":"record-absent","ambiguity":"ask","unsupported":"fail","checkFailure":"no-publish","partialTargets":"forbid","unattendedAsk":"needs-input"}
  },
  "agentResult": [
    {"targetId":"zh","unitId":"doc:heading:1:4c2f","status":"translated","text":"Web 应用测试"},
    {"targetId":"zh","unitId":"doc:paragraph:2:7a91","status":"translated","text":"使用 ⟦p:doc:paragraph:2:0⟧ 编写原生 Python Playwright 脚本。"}
  ],
  "outcome": {"status":"completed","execution":"succeeded","checks":"passed","semanticReview":"acceptable","published":"all","targets":[{"id":"zh","state":"published","outputDigest":"sha256:example"}],"diagnostics":[]}
}
```

The abbreviated result shows two units only; a real result is complete only when it contains every selected unit.

### 9.2 Direct-authored task that requires user input

```json
{
  "declaration": {
    "schemaVersion":"technical-document-localization/v0",
    "id":"direct-guide-zh",
    "inputs":[{"id":"guide","path":"guide.md","mediaType":"text/markdown","parserProfile":"commonmark-gfm-frontmatter/v0","readOnly":true}],
    "sourceLocale":"en",
    "targets":[{"id":"zh","inputId":"guide","locale":"zh-CN","path":"guide.zh-CN.md","overwrite":"ask","independent":true}],
    "selection":{"profile":"technical-prose/v0","include":["frontmatter.description","heading","paragraph","blockquote.paragraph","list-item.paragraph","table-cell","link-label"],"exclude":["code","inline-code","raw-html","image","link-destination"]},
    "protection":[],
    "agent":{"operation":"translate-units","context":["unit-source","unit-structure","localization-notes","protection-tokens","terminology"],"returns":"replacement-set/v0","completeWhen":"exactly-one-result-per-selected-unit-per-target","uncertainty":"ask"},
    "checks":[{"id":"source","kind":"source-snapshot-unchanged","blocking":true},{"id":"coverage","kind":"selected-unit-coverage","blocking":true},{"id":"path","kind":"target-path-policy","blocking":true}],
    "policies":{"missingRequired":"fail","missingOptional":"record-absent","ambiguity":"ask","unsupported":"fail","checkFailure":"no-publish","partialTargets":"forbid","unattendedAsk":"needs-input"}
  },
  "preflight": {"targetExists":true,"interactive":false},
  "outcome": {
    "status":"needs-input","execution":"not-started","checks":"not-run","semanticReview":"not-run","published":"none",
    "targets":[{"id":"zh","state":"not-started"}],
    "diagnostics":[{"code":"target-overwrite-decision-required","phase":"preflight","severity":"error","blocking":true,"constructRef":"targets.zh.overwrite","targetId":"zh","message":"Target exists and overwrite policy is ask, but the run is unattended."}]
  }
}
```

### 9.3 Independent multi-target partial result

```json
{
  "declarationDelta": {
    "targets": [
      {"id":"zh","inputId":"guide","locale":"zh-CN","path":"guide.zh-CN.md","overwrite":"never","independent":true},
      {"id":"ja","inputId":"guide","locale":"ja","path":"guide.ja.md","overwrite":"never","independent":true}
    ],
    "policies": {"missingRequired":"fail","missingOptional":"record-absent","ambiguity":"record","unsupported":"fail","checkFailure":"no-publish","partialTargets":"publish-independent","unattendedAsk":"needs-input"}
  },
  "resultSummary": {
    "zh": "all units and occurrences valid; semantic review acceptable",
    "ja": "one positional placeholder is missing from unit guide:paragraph:4"
  },
  "outcome": {
    "status":"partial","execution":"succeeded","checks":"failed","semanticReview":"acceptable","published":"partial",
    "targets":[
      {"id":"zh","state":"published","outputDigest":"sha256:example-zh"},
      {"id":"ja","state":"check-failed"}
    ],
    "diagnostics":[{"code":"protected-occurrence-missing","phase":"check","severity":"error","blocking":true,"constructRef":"protection.message","targetId":"ja","unitId":"guide:paragraph:4","protectedItemId":"p:guide:paragraph:4:1","message":"Expected positional placeholder occurrence was not returned."}]
  }
}
```

The aggregate `checks: failed` records that at least one target failed. Per-target evidence determines which independent target may publish; aggregate status alone never authorizes publication.

## 10. Probe obligations

D5 must test snapshot-scoped IDs, repeated text, byte-preserving refill, link label/destination ownership, CRLF/Chinese/emoji, frontmatter policy, multi-file uniqueness, changed inputs, and overlap rejection. D6 must test contract completeness and the relation matrix, including classic ICU parsing. D7 must test the outcome cross-field invariants and host-controlled publication. D8 must show at least one declaration/result path end to end and report stub versus real model execution separately.

## 11. D10 consolidation and minimum implementation projection

### 11.1 Decisions changed by the probes

The broader D4 `TaskSpec` remains a semantic superset, not the first authoring surface. D5-D8 support a smaller closed projection:

- one `input` object and exactly one target in I1-I3; multi-document extraction remains tested internally, but multiple final targets wait for transaction/recovery work;
- fixed `technical-prose/v0` selection, fixed structural protection, fixed result coverage and host checks; authors cannot list checks the runtime does not own;
- author-selectable lexical protection kinds only; removing a source-required kind is a responsibility change recorded by migration review;
- inline notes/terminology only in the minimum; external terminology resource resolution is deferred;
- optional migration ledger with declared/residual/not-applicable dispositions and explicit non-proof of extraction completeness;
- classic ICU is a tested constraint module but is not exposed until an author-time unit selector exists;
- `remark` AST positions select units and supply provenance; original source bytes and descending coordinate refill are the only output authority.

The exact JSON projection, diagnostics and I1-I5 APIs are frozen in `implementation-handoff.md`. Unknown fields/versions fail. V0 may later be extended only through a new compatible revision rather than silently accepting unused fields.

### 11.2 Obligation-to-runtime mapping

| Source requirement / decision | Declaration | Rendered/program representation | Runtime event | Evidence/check |
| --- | --- | --- | --- | --- |
| explicit input and target locale | `input`, `targets[0]` | logical IDs and locale; absolute workdir omitted from model context | resolve → snapshot → target preflight | safe path, digest, locale and collision diagnostics |
| preserve source and frontmatter `name` | fixed profile; input is read-only | name/skeleton excluded or opaque; description is a value-only unit | extract → refill from unchanged snapshot | source digest, frontmatter policy, byte roundtrip |
| preserve code, command/path/env/URL/placeholder occurrences | structural profile + `lexicalKinds` | occurrence IDs/tokens with owner unit and movement relation | render → agent result → expand | identity/count/owner/order/structure diagnostics |
| translate prose, description and link labels naturally | `naturalRequest`, locale, notes, terms | all selected units in one document batch with structural context | one bounded translation result | selected-unit coverage; separate semantic review |
| ambiguity must not be guessed | `task.ambiguity` | result schema permits a top-level needs-input question | preflight or agent result | `needs-input`, no publication |
| existing target choice and source non-overwrite | target `overwrite` | not delegated to the agent | preflight → publish-time recheck | target conflict/authorization diagnostic and output digest |
| incremental config/discovery/share integration from public source | migrated obligation ledger as residual | rendered as remaining duty, not execution instruction | no runtime implementation in v0 | absence stays visible; no full-migration claim |
| application literal rewrite and Law hierarchy/OCR | provenance/residual or out-of-scope case | no profile/selector | task routing refuses before extraction | out-of-task/unsupported, never zero-edit success |
| semantic meaning and fluency | `semanticReview` policy, notes/terms | reviewer receives source, target and context | after deterministic checks, before required publication | acceptable/unacceptable/unknown remains independent |

### 11.3 Judgment inputs and outputs

The translation agent sees the natural request, source/target locales, selected units in source order, heading/container context, notes/terminology and the exact occurrence manifest. It returns only `replacement-set/v0`: either one top-level `needs-input` question or one target result containing exactly one `translated|unchanged` item per selected unit. `unchanged` requires a reason. It never returns paths, commands or publication decisions.

The semantic reviewer sees the complete snapshotted source, reconstructed target, locale, notes and terminology. It returns `acceptable | unacceptable | unknown` plus reasons; this judgment cannot edit bytes. A required missing/unknown review yields `needs-input`; optional unknown remains visible on a completed result.

The user supplies only values unresolved by an explicit `ask` policy. In unattended execution an unresolved ask becomes `needs-input` immediately and no wait loop is started.

### 11.4 Supported syntax and explicit unsupported states

The minimum parser versions are unified 11.0.5, remark-parse 11.0.0, remark-gfm 4.0.1 and remark-frontmatter 5.0.0. Supported constructs are headings, paragraphs, block quotes, lists, tables, emphasis/strong/strikethrough, links/references, inline/fenced/indented code, images as uneditable syntax, and one leading YAML frontmatter block with simple scalar `name`/`description`. UTF-8, BOM and LF/CRLF/mixed newlines must be recorded and preserved through untouched bytes.

Raw HTML/MDX and complex/duplicate/aliased/tagged/block-scalar frontmatter values are `unsupported-structure` or `unsupported-frontmatter-shape`; they are never flattened. Images, code blocks and inline code may remain protected but their alt/code content is not translated in v0. Cross-version unit IDs, full XLIFF interchange, MessageFormat 2 and automatic selector-completeness claims are unsupported.

### 11.5 State transitions

`resolve → preflight → extract → render → agent → validate-result → refill → deterministic-check → semantic-review → stage → publish` is the only success order. Resolve/preflight/unsupported errors have `execution:not-started`. Agent timeout/failure has no candidate. Result/refill/check failure has no publication. Required review pending yields needs-input. Completed requires the one target published; optional semantic review may remain unknown. The broader `partial` state stays defined for future independent multi-target work but is unreachable in I1-I3.
