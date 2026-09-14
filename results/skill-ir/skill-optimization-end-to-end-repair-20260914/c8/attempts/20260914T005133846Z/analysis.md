# Optimization Analysis

## Best Round

**Round 1** — optimized draft has no concrete local program failure but remains partially or wholly unvalidated

## Round Summary

| Round | Train Score | Train Pass | Target Agent (tokens / $) | Eval Judge (tokens / $) | Optimizer (tokens / $) |
|------:|------------:|-----------:|--------------------------:|------------------------:|-----------------------:|
| 0 (baseline) | n/a | 0/0 | 0 / $0.0000 | 0 / $0.0000 | — |
| 1 | n/a | 0/0 | 0 / $0.0000 | 0 / $0.0000 | 129713 / $0.0000 |

## Optimization Rounds

### Round 1

- timestamp: 2026-09-14T00:54:29.960Z
- confidence: 0.88
- train score: n/a
- improved: n/a
- files changed: scripts/law_to_markdown.py, SKILL.md

**Root cause:** The skill documents its default conversion pipeline but does not tell the agent how to reconcile a task-supplied machine-readable contract with those defaults, so the agent must infer precedence, closed output/schema boundaries, and post-write checks; in the observed run this also led to avoidable full-source inspection before manually producing outputs. Separately, the documented common CLI path could not even display help in an environment lacking optional DOCX/PDF packages because those dependencies were imported eagerly.

**Reasoning:**

Evidence 0 is UNASSESSED, not a failure, so the change targets visible workflow inefficiency and a general contract gap rather than claiming bad output quality. The run successfully read a public contract and produced plausible declared artifacts, but it first attempted a literal non-existent filename, read all three bundled scripts, and then manually wrote outputs because the skill had no contract-handling rule. The contract itself exposes a reusable boundary: exact output set, protected inputs, conditional deliverable, closed evidence fields, and deterministic post-write checks. Pre-edit checklist: (a) Generality—another plausible task supplies a different law conversion contract with custom output paths or a non-law conditional deliverable; it benefits from the same contract-first precedence and verification rule. A normal TXT-only conversion on a machine without python-docx/pdfplumber also benefits from lazy optional imports. (b) Rewrite-in-place—the contract workflow was inserted at the start of the existing numbered processing rules, with subsequent numbering adjusted; no overlapping appendix was added. The import fix changes the existing executable in place. (c) Coherent scope—the documentation delegates only contract parsing, compatibility routing, and deterministic boundary checks while retaining classification/semantic judgment; the script change only defers format-specific imports until those fallbacks are actually used. (d) No-trade-off—PER_TASK_SUMMARY.md contains no PASSING tasks, and the existing TXT/PDF/DOCX behavior and default output rules remain intact. Expected impact is reduced tool I/O and fewer schema/output mistakes on contract-bound tasks, plus a usable documented CLI/help and TXT path when unrelated optional packages are absent; no score improvement is asserted from the unassessed run. Verification: `python scripts/law_to_markdown.py --help` now succeeds without python-docx installed, `py_compile` passed, and a TXT law conversion from the digest-bound pre-run input produced only the default review and deliverable under minimal artifacts. The historical contract-specific output is not used as a current reference-output assertion because no independent task checker is available.

**Changes:**

- `SKILL.md` (处理规则): Add a contract-first branch that makes task-contract precedence, closed schemas/output sets, compatibility routing, and post-write verification explicit before the existing default conversion workflow.
- `scripts/law_to_markdown.py` (optional converter imports): Load python-docx and pdfplumber only inside their fallback converters so help and TXT conversion do not require unrelated optional dependencies.

**Actions:**

- `route-contract-bound-work` (restructure-docs); depends on: none
- `make-common-cli-independent-of-unused-fallbacks` (reuse-script); depends on: none
