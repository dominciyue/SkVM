# Technical Document Localization: I1-I5 Implementation Handoff

Status: ready for a narrow implementation review. This handoff converts D1-D9 into file-level work. It does not authorize a generic DSL compiler, production changes in this round, or a positive-effect claim.

## 1. Recommendation and minimum production range

Proceed narrowly with `technical-document-localization/v0` as an opt-in skill-package profile. The first production increment supports one explicit UTF-8 Markdown input and one locale target per run. It retains the array-shaped target field for forward compatibility but rejects lengths other than one until publication/recovery semantics for multiple targets are implemented. `partial` remains a defined future outcome but is unreachable in I1-I3.

The supported document profile is CommonMark parsed with pinned remark 11 plus GFM 4 and leading YAML frontmatter. Editable payloads are simple scalar frontmatter `description`, headings, paragraphs, list-item/blockquote paragraphs, table cells, and link labels. Frontmatter `name`, Markdown delimiters, inline/fenced code, images, link destinations, and unselected bytes remain host-owned. Raw HTML/MDX and complex YAML values fail explicitly. The source is always read-only.

Classic ICU parsing is proven feasible but is not in the minimum production declaration: no stable author-time selector binds a Markdown unit to the grammar. Do not add `@formatjs/icu-messageformat-parser` to root dependencies until that selector is designed. Full XLIFF serialization, application-source rewriting, Law/OCR, configuration discovery/persistence, mtime incrementality, and automatic migration-completeness proof remain outside I1-I5.

## 2. Production anchors audited at `0d96309`

All five requested anchors were clean relative to HEAD when reviewed; their working-tree bytes matched `0d9630931be17bfc548b724a82967efe4fde3f0d`. Other tracked/untracked changes belong to other work and must remain untouched.

| Existing file | Observed responsibility | I1-I5 disposition |
| --- | --- | --- |
| `src/run/index.ts` | Loads task/skill, copies fixtures, optionally writes pre-run manifests, deploys skill resources, calls `adapter.setup/run/teardown`, and returns `RunResult`. `prepareRunWorkspaceArtifacts` is private. No candidate parser, postcheck, staging, or target publisher exists. | Reuse unchanged for legacy runs. Do not invent a hook or put localization logic inside its private preparer. |
| `src/cli/run.ts` | Validates ordinary run flags, loads task/skill, creates an adapter, calls `executeRun`, prints result/telemetry, and fails non-OK adapter status. | I3 makes one small opt-in branch after task/skill resolution: only a package containing reserved `technical-document-localization.json` enters the new runner; absent file preserves the current branch byte-for-behavior. |
| `src/adapters/bare-agent.ts` | Builds a tool-enabled agent with read/write/command/list/network tools and returns free-form text plus run status. | Do not use for the bounded replacement channel in I3 and do not modify it. A tool-enabled adapter is not needed for translation-unit return. |
| `src/core/agent-tools.ts` | Resolves tool paths from `workDir` and exposes unrestricted shell execution; it does not enforce workspace containment. | No change and no security claim. The localization agent receives a structured data request through the provider, not these tools. |
| `src/jit-optimize/package.ts` | Validates and atomically renames a complete, initially missing/empty package directory after closure verification. | No change/import. Its directory-export contract does not solve existing single-file replacement or multi-target transactions; copy the staging/revalidation principle, not the package abstraction. |

Existing `src/providers/registry.ts#createProviderForModel` and `src/providers/structured.ts#extractStructured` may be reused unchanged. I3 must pass `maxRetries: 1`, record actual calls/tokens/cost, and treat a tool-to-prompt fallback that breaches a frozen effect-call budget as an experiment/configuration issue rather than hiding it.

## 3. Frozen authoring projection

The reserved UTF-8 JSON file is `technical-document-localization.json`. Objects are strict/closed. The I1 authoring projection is:

```ts
interface TechnicalDocumentLocalizationV0 {
  schemaVersion: "technical-document-localization/v0";
  id: string;
  task: {
    naturalRequest: string;
    sourceLocale: string | null;
    ambiguity: "ask" | "record" | "fail";
    localizationNotes?: string[];
    terminology?: Array<{
      source: string;
      target?: string;
      strength: "preserve" | "preferred" | "required" | "forbidden";
      note?: string;
    }>;
  };
  input: {
    id: string;
    path: string;
    format: "markdown";
    expectedSha256?: string;
  };
  targets: [{
    id: string;
    locale: string;
    path: string;
    overwrite: "never" | "ask" | "replace";
    independent: true;
  }];
  protection: {
    profile: "technical-markdown/v0";
    lexicalKinds: Array<"url" | "placeholder" | "environment-variable" | "path" | "command">;
  };
  policies: {
    partialTargets: "forbid";
    semanticReview: "optional" | "required";
    unchanged: "allow" | "review" | "fail";
  };
  provenance:
    | { kind: "direct-authored"; source: string }
    | {
        kind: "migrated-skill" | "different-source";
        source: string;
        migration: {
          completeness: "not-established" | "independently-audited";
          obligations: Array<{
            id: string;
            sourceRef: string;
            critical: boolean;
            disposition: "declared" | "residual" | "not-applicable";
            declarationRef?: string;
            rationale: string;
          }>;
        };
      };
}
```

Absence, `null`, empty and unknown remain distinct. Only `sourceLocale` permits null. An absent optional note/glossary means not supplied. No hidden config is read. The migration ledger inventories found obligations and renders residual duties; even `independently-audited` does not prove that the original extraction was complete.

Fixed profile behavior is not repeated in author JSON: parser/selection rules, structural protections, complete-result contract, source-snapshot check, path/locale/nonempty checks, no-publish-on-failure, and unattended-ask→needs-input are versioned implementation semantics. This removes the D4 draft's ability to declare checks that the runtime does not implement.

Initial blocking diagnostic codes are closed by phase:

- resolve/preflight: `invalid-json`, `unknown-field`, `missing-required-field`, `invalid-enum`, `invalid-locale`, `duplicate-id`, `unsafe-path`, `source-target-collision`, `unsupported-target-count`, `unsupported-partial-policy`, `migration-ledger-incomplete`, `source-missing`, `source-digest-mismatch`, `target-exists`, `target-overwrite-decision-required`;
- extract: `invalid-utf8`, `unsupported-structure`, `unsupported-frontmatter-shape`, `unit-overlap`, `protection-overlap`, `context-too-large`;
- agent/result: `agent-timeout`, `agent-failed`, `invalid-agent-result`, `agent-needs-input`, `unknown-target-result`, `duplicate-target-result`, `missing-target-result`, `unknown-unit-result`, `duplicate-unit-result`, `missing-unit-result`;
- check/refill: `stale-source-snapshot`, `unknown-protection-token`, `foreign-protection-token`, `missing-protection-token`, `duplicate-protection-token`, `protection-order-mismatch`, `untracked-protected-content`, `empty-target-unit`, `unchanged-target-unit`;
- review/publish: `semantic-review-required`, `semantic-review-unacceptable`, `target-appeared-before-publish`, `target-publish-failed`.

Warnings use the same structured shape but `blocking: false`. Unknown codes require a schema/profile revision; consumers must not silently ignore them.

## 4. One case through every interface

The canonical trace is the direct guide fixture:

1. package file `technical-document-localization.json` has declaration `direct-guide-zh`, input ID `guide`, path `guide.md`, target ID `zh`, locale `zh-CN`, path `guide.zh-CN.md`;
2. `loadTechnicalDocumentLocalization` resolves both paths inside the supplied workdir, rejects collision/conflict, snapshots bytes, and retains logical ID `guide` without rendering the absolute workdir path to the model;
3. `extractMarkdownDocument` returns `documentId = guide:<snapshot-prefix>` and snapshot-scoped unit IDs such as `guide:<snapshot-prefix>:heading:<ordinal>:<slice-prefix>`; the heading payload is `Reset the demo`, not `# Reset the demo`;
4. `renderTranslationRequest` sends one document batch containing every selected unit in source order, structural/heading context, terminology/notes, and the occurrence manifest; target ID remains `zh` throughout;
5. the agent returns `replacement-set/v0` with exactly one replacement for every `(zh, unitId)`, or one top-level `needs-input` envelope; no file path or command is returned;
6. constraints validate IDs/tokens/locale/nonempty/unchanged policy, refill applies descending source ranges to the original `guide` snapshot, and the host writes a staged `zh` candidate;
7. publish rechecks the source digest and final target state, then writes only `guide.zh-CN.md`; outcome target ID is still `zh`, with output digest and explicit semantic-review state.

Any interface that adds/removes `#`, renames `guide`/`zh`, uses a cross-version unit ID, or gives the agent the final output authority fails this trace test.

## 5. I1 — language, interpretation, ledger and renderer

**Owned files**

- add `src/skill-ir/technical-document-localization/schema.ts`
- add `src/skill-ir/technical-document-localization/declaration.ts`
- add `src/skill-ir/technical-document-localization/renderer.ts`
- add matching `.test.ts` files and `fixtures/declarations/`
- add `docs/skill-ir/technical-document-localization.md`

**Required signatures**

```ts
export const TechnicalDocumentLocalizationV0Schema: z.ZodType<TechnicalDocumentLocalizationV0>;
export const ReplacementSetV0Schema: z.ZodType<ReplacementSetV0>;

export async function loadTechnicalDocumentLocalization(options: {
  declarationPath: string;
  workDir: string;
}): Promise<ResolvedLocalizationDeclaration>;

export function validateLocalizationSemantics(
  declaration: TechnicalDocumentLocalizationV0,
  context: { declarationPath: string; workDir: string },
): LocalizationDiagnostic[];

export function renderTranslationRequest(options: {
  declaration: ResolvedLocalizationDeclaration;
  extraction: LocalizationExtraction;
}): { system: string; prompt: string; requestDigest: string };
```

**First failing tests**

Closed unknown fields; missing versus null/empty; unsafe/absolute/escaping paths; duplicate IDs; source-target collision; target array length 0/2; partial policy other than forbid; migration with a critical obligation neither declared nor residual; residual duty rendered; direct-authored declaration without migration; renderer contains every exact unit/target ID, does not contain an arbitrary command/absolute workdir, and creates one document batch.

**Commands**

```text
bun test src/skill-ir/technical-document-localization/schema.test.ts src/skill-ir/technical-document-localization/declaration.test.ts src/skill-ir/technical-document-localization/renderer.test.ts
bun run typecheck
```

**Completion**

One direct declaration and one migrated declaration resolve deterministically; all conflicts have field/source locations; residual source duties appear in the rendered/user result; no parsing, model call, or publication occurs in I1.

## 6. I2 — Markdown domain core

**Owned files**

- add `src/skill-ir/technical-document-localization/markdown-filter.ts`
- add `src/skill-ir/technical-document-localization/refill.ts`
- add `src/skill-ir/technical-document-localization/constraints.ts`
- add matching tests and `fixtures/markdown/`
- update root `package.json` and `bun.lock` with exact runtime versions `unified@11.0.5`, `remark-parse@11.0.0`, `remark-gfm@4.0.1`, and `remark-frontmatter@5.0.0`; do not add `remark-stringify`
- update the component document from I1

**Required signatures**

```ts
export function extractMarkdownDocument(options: {
  inputId: string;
  relativePath: string;
  bytes: Uint8Array;
  lexicalKinds: readonly LexicalProtectionKind[];
}): LocalizationExtraction;

export function validateReplacementSet(options: {
  declaration: ResolvedLocalizationDeclaration;
  extraction: LocalizationExtraction;
  result: ReplacementSetV0;
}): LocalizationCheckReport;

export function refillMarkdownSnapshot(options: {
  extraction: LocalizationExtraction;
  currentSourceBytes: Uint8Array;
  targetId: string;
  replacements: readonly UnitReplacement[];
}): Uint8Array;
```

**First failing tests**

Port D5/D6 cases without importing result-directory code: byte-exact no-change CRLF/UTF-8/BOM; repeated/nested/multi-document identity (the production declaration still binds one input); changed snapshot; GFM table; simple frontmatter; raw HTML and complex YAML refusal; link label/destination; duplicate code; overlap; wrong/duplicate/missing unit; foreign/missing/duplicate/reordered tokens; named reordering; URL mismatch; empty/unchanged policies; zero-unit and zero-protection distinctions; meaning-wrong deterministic pass. Add a regression proving AST stringify is not used by refill.

**Commands**

```text
bun test src/skill-ir/technical-document-localization/markdown-filter.test.ts src/skill-ir/technical-document-localization/refill.test.ts src/skill-ir/technical-document-localization/constraints.test.ts
bun run typecheck
```

**Completion**

The domain core reproduces the 45-probe deterministic invariants relevant to I1-I2, preserves untouched bytes, never writes a file, and returns structured diagnostics. Unsupported structures are local input failures, not task-success refusals.

## 7. I3 — opt-in ordinary-run integration

**Owned files**

- add `src/skill-ir/technical-document-localization/agent.ts`
- add `src/skill-ir/technical-document-localization/publisher.ts`
- add `src/skill-ir/technical-document-localization/run.ts`
- add matching tests
- make a small guarded edit to `src/cli/run.ts` plus a focused CLI routing test
- leave `src/run/index.ts`, `src/adapters/bare-agent.ts`, `src/core/agent-tools.ts`, and `src/jit-optimize/package.ts` unchanged

**Required signatures**

```ts
export interface TranslationAgent {
  translate(request: RenderedTranslationRequest): Promise<{
    result: ReplacementSetV0;
    modelCalls: number;
    tokens: TokenUsage;
    costUsd: number | null;
  }>;
}

export function createProviderTranslationAgent(options: {
  provider: LLMProvider;
  maxTokens: number;
}): TranslationAgent;

export async function executeTechnicalDocumentLocalization(options: {
  declarationPath: string;
  workDir: string;
  agent: TranslationAgent;
  interactive: boolean;
  semanticReviewer?: LocalizationSemanticReviewer;
  maxRepairAttempts: 0 | 1;
}): Promise<LocalizationRunOutcome>;

export async function publishLocalizationTarget(options: {
  targetPath: string;
  candidateBytes: Uint8Array;
  sourceSnapshot: SourceSnapshot;
  overwrite: "never" | "replace";
}): Promise<{ outputDigest: string }>;
```

The CLI detects `technical-document-localization.json` only after loading an explicit skill package. With no reserved file it follows the current `executeRun` path. With the file it requires a real workdir, creates a provider through the existing registry, runs the structured tool-container channel without read/write/shell tools, prints all five outcome dimensions, and sets nonzero exit status for `invalid-input`, `unsupported`, `needs-input`, `failed`, or unexpected partial. `ask` in an unattended CLI returns needs-input before a model call.

**First failing tests**

Legacy skill without the reserved file calls the existing route; valid opt-in package calls the new runner; invalid declaration causes zero provider calls; normal/invalid-shape/timeout/needs-input/stale-source/target-appeared/replace/review-required branches; model text cannot publish; no provider filesystem tools; one actionable deterministic repair maximum; actual calls/tokens/cost recorded; source bytes unchanged. Include a Windows-safe target race test and do not claim cross-file atomicity.

**Commands**

```text
bun test src/skill-ir/technical-document-localization/agent.test.ts src/skill-ir/technical-document-localization/publisher.test.ts src/skill-ir/technical-document-localization/run.test.ts src/cli/run-localization.test.ts
bun run typecheck
```

**Completion**

One package runs through `skvm run --prompt ... --skill ... --workdir ... --model ...`; success/failure/needs-input are machine-readable and user-visible; the final target is host-written only after checks; an ordinary package without the declaration behaves as before. No generic compiler or new public subcommand is added.

## 8. I4 — validity and attribution

**Owned files**

- add `src/benchmarks/skill-ir/technical-document-localization-comparison.ts` and tests
- add `src/benchmarks/skill-ir/technical-document-localization-comparison-run.ts`
- add `benchmarks/skill-ir/technical-document-localization-development-v1/manifest.json`
- create the result directory only when the first real paired run starts
- update the component document with the actual comparison identity

**Required signatures**

```ts
export function buildLocalizationComparisonPlan(
  manifest: LocalizationComparisonManifest,
): LocalizationComparisonPlan;

export function classifyLocalizationComparison(
  rows: readonly LocalizationComparisonRow[],
): "method-supportive" | "helper-only" | "ceiling" | "tie" | "tradeoff" | "negative" | "inconclusive";
```

Tests first freeze MH/DH information/helper/invocation/publish parity, forbid condition-only answer text, verify one generation plus at most one repair, and lock the primary/floor calculations. Dry-run plan must contain exactly two real tasks × MH/DH × one attempt before any call. O/M expansion is a new manifest revision tied to a named attribution question.

```text
bun test src/benchmarks/skill-ir/technical-document-localization-comparison.test.ts
bun run src/benchmarks/skill-ir/technical-document-localization-comparison-run.ts --manifest benchmarks/skill-ir/technical-document-localization-development-v1/manifest.json --dry-run
```

Real execution waits for a configured, qualified route. Completion is an honest taxonomy result with raw call/repair/token/reviewer evidence, not necessarily a positive result.

## 9. I5 — practical delivery

**Owned files**

- add `examples/technical-document-localization-skill/SKILL.md`
- add its `technical-document-localization.json`, source fixture and expected usage notes; do not ship a gold translation in the agent context
- add `src/skill-ir/technical-document-localization/example-package.test.ts`
- finish `docs/skill-ir/technical-document-localization.md` and link it from `docs/skill-ir/README.md`

The example explains how to write, change and run the declaration, supported/unsupported structures, overwrite/review meanings, diagnostics, residual migration duties, and effect limits. Its clean-copy test runs one original task and one changed locale/policy/input task without referencing `results/`, probe code, developer cache or absolute repository paths.

```text
bun test src/skill-ir/technical-document-localization/example-package.test.ts
bun run typecheck
bun run src/index.ts run --prompt="Execute the declared localization task" --skill=examples/technical-document-localization-skill --workdir=<clean-copy> --model=<configured-route>
```

Completion is a reproducible user path plus transparent outcome/evidence. It is not an ecosystem or human-time claim.

## 10. Dependency estimate and critical path

| Milestone | Relative size | Depends on | May proceed when |
| --- | --- | --- | --- |
| I1 | medium | D10 review | schema/ledger/render decisions accepted as one design |
| I2 | large | I1 IDs/profiles | I1 types are stable enough for TDD |
| I3 | large | I1 + I2 | deterministic core is green; publisher limitation accepted |
| I4 | medium, externally gated | I3 + configured model route | route and reviewer are available; dry-run manifest is frozen |
| I5 | medium | I3; I4 not required for feasibility docs | clean-copy normal and changed tasks run |

Critical implementation path: **I1 → I2 → I3 → I5**. I4 branches after I3 and gates any benefit recommendation, not the deterministic feasibility implementation. Do not merge milestones into a full compiler project.

## 11. Open questions and stop/revise conditions

- Real model consumption was not run. If two representative structured calls cannot return complete refillable sets with at most one actionable repair, revise the renderer/result contract before CLI expansion.
- Long-document batching, nonselected skeleton context, glossary size and prompt-byte limits are unmeasured. I3 must fail with `context-too-large` rather than silently truncate; the first two tasks determine the next windowing probe.
- Semantic review has no automatic oracle. Required review without a supplied reviewer remains `needs-input`; optional review may publish with `unknown`, which must stay visible.
- Per-file replace and crash recovery need platform tests. Do not describe the I3 publisher as cross-file transactional; keep one target in the minimum.
- The migration ledger cannot prove source extraction completeness. If a source-critical duty is neither declared nor residual, stop migration rather than claim completion.
- If MH matches DH and the declaration/compiler adds author or token burden, retain the D5-D7 helper/runtime and drop the language layer (`helper-only`), as predeclared in D9.

The next round starts with I1's failing schema/semantic/renderer tests. It does not start by editing the generic runner, adding a CLI subcommand, or copying probe code wholesale.
