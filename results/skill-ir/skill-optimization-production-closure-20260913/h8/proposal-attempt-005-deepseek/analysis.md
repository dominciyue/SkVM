# Optimization Analysis

## Best Round

**Round 1** — optimized draft has no concrete local program failure but remains partially or wholly unvalidated

## Round Summary

| Round | Train Score | Train Pass | Target Agent (tokens / $) | Eval Judge (tokens / $) | Optimizer (tokens / $) |
|------:|------------:|-----------:|--------------------------:|------------------------:|-----------------------:|
| 0 (baseline) | n/a | 0/0 | 0 / $0.0000 | 0 / $0.0000 | — |
| 1 | n/a | 0/0 | 0 / $0.0000 | 0 / $0.0000 | 75263 / $0.0000 |

## Optimization Rounds

### Round 1

- timestamp: 2026-09-13T13:10:03.743Z
- confidence: 0.85
- train score: n/a
- improved: n/a
- files changed: SKILL.md

**Root cause:** The skill describes a fully discretionary i18n workflow (scan all hardcoded strings, decide heuristically what to extract, output a Markdown report), but the task ecosystem uses a contract-driven paradigm where an i18n-contract.json declares exact boundaries (which files to modify/protect/create, which text is confirmed for extraction via data-i18n-key, and the exact JSON output ABI). The skill provides no guidance on recognizing or following a contract, so an agent might follow the skill's general-purpose heuristics instead of the contract's precise rules — producing wrong modifications, wrong output format, or both. The observed agent succeeded only because it ignored the skill's scanning flow and read the contract from the task prompt directly.

**Reasoning:**

Evidence: the single UNASSESSED task (Evidence Index 0) shows an agent working with a contract-driven i18next task. The i18n-contract.json in the workdir specifies allowedModifiedFiles, requiredNewFiles, protectedFiles, confirmedTextRule (based on data-i18n-key), keyRule, interpolationRule, excludedTextClasses, and an exact outputAbi JSON schema. The agent succeeded — producing the correct files, correct report schema, and leaving protected files untouched — but did so by reading the contract from the task prompt, not from the skill. The skill's current scanning rules (step 2: search all strings, exclude heuristics like '日志调试信息') and output format (Markdown table) directly conflict with the contract's precise rules and JSON ABI.

Pre-edit checklist:

a) Generality test: Any future task on this skill that supplies an i18n-contract.json (which the schema version 'skill-ir-i18n-helper-public-contract/v3' suggests is a mature, recurring protocol) benefits from the contract-first section. This includes React i18next tasks, Vue-i18n contract tasks, and Angular i18n contract tasks — all would follow the same contract structure.

b) Rewrite-in-place: The existing sections (steps 1-5) remain unchanged for non-contract use. The new step 0 is added before them as a gate — if a contract exists, skip the general flow. The output section is split into contract-mode and general-mode. No existing rule is contradicted.

c) Coherent scope: A single new 'step 0' section plus an output-format split is the smallest change that makes the contract-driven workflow explicit without touching any of the existing general-purpose instructions.

d) No-trade-off: There are 0 PASSING tasks and 0 MARGINAL/FAILING tasks. The single UNASSESSED task's agent already followed the contract pattern that the edit codifies, so this change only reinforces correct behavior. There is nothing to regress.

**Changes:**

- `SKILL.md` (workflow): Added step 0 (Contract-First) that gates on i18n-contract.json existence and enumerates the contract fields and rules, preventing the agent from applying the general-purpose scanning heuristics when a contract is present.
- `SKILL.md` (output format): Split the output section into contract-mode and general-mode, ensuring the agent uses the contract's outputAbi JSON schema instead of the Markdown template when a contract exists.
