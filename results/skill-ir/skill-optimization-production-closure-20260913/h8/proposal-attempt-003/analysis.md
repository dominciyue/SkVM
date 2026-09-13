# Optimization Analysis

## Best Round

**Round 1** — optimized draft has no concrete local program failure but remains partially or wholly unvalidated

## Round Summary

| Round | Train Score | Train Pass | Target Agent (tokens / $) | Eval Judge (tokens / $) | Optimizer (tokens / $) |
|------:|------------:|-----------:|--------------------------:|------------------------:|-----------------------:|
| 0 (baseline) | n/a | 0/0 | 0 / $0.0000 | 0 / $0.0000 | — |
| 1 | n/a | 0/0 | 0 / $0.0000 | 0 / $0.0000 | 26105 / $0.0000 |

## Optimization Rounds

### Round 1

- timestamp: 2026-09-13T13:00:20.410Z
- confidence: 0.84
- train score: n/a
- improved: n/a
- files changed: SKILL.md

**Root cause:** The skill provides broad framework defaults but does not tell the agent how project-local contracts constrain those defaults, so on contract-driven i18n tasks the agent must infer whether extraction markers, exact file scopes, closed output schemas, locale completeness, and interpolation invariants override the generic workflow; this creates avoidable risk of touching extra files or emitting plausible but invalid output.

**Reasoning:**

Evidence 0 is UNASSESSED rather than failing, so I do not claim its output quality from a score. It is nevertheless a clean run (runStatus=ok) with visible inputs and artifacts showing a recurring contract-driven workflow: read an in-repository contract, restrict extraction to confirmed text, preserve exact keys/interpolation, create matching locale trees, satisfy a closed ABI, and verify protected files. The baseline skill mentions scanning, replacement, interpolation, and key comparison, but omits the precedence and exactness rules that connect them to project-local contracts. The change therefore tightens the existing workflow in place rather than adding a competing appendix. Generality test: the same guidance benefits a Vue task with a repository schema and allowed-file manifest, a gettext task with a POT/output contract, or an Angular task whose extraction markers define confirmed text. Rewrite-in-place test: all edits are within the existing project analysis, scan, generation, replacement, and completeness steps; no existing capability or rule was deleted. Coherent-scope test: this is the smallest complete change because contract interpretation still requires framework and source-code judgment, while the deterministic invariants are explicitly listed for verification; a bundled transformer/checker is not justified from one contract shape and no reusable runtime resource exists. No-trade-off test: PER_TASK_SUMMARY.md contains no PASSING tasks, so there is no scored passing task that can regress; the edits also preserve the generic fallback whenever no project contract exists. Task-only restrictions such as no network/package installation and the concrete paths/locales were not promoted into permanent rules.

**Changes:**

- `SKILL.md` (工作流程（项目分析、扫描、生成、替换、完整性检查）): Clarify that repository contracts govern extraction, file scope, closed schemas, locale/interpolation invariants, and final side-effect verification while retaining the generic workflow as fallback.

**Actions:**

- `clarify-contract-driven-workflow` (restructure-docs); depends on: none
