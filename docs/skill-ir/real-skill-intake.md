# Real Skill Intake

## Purpose

This document defines the real-skill intake track for Task 11I. It records which public repositories should supply the next corpus, how candidates should be sampled, and what metadata must be preserved before any skill is converted into Skill IR.

The goal is to replace synthetic-seed-heavy evidence with externally sourced skills while keeping provenance, source descriptions, license notes, and sampling decisions visible.

## Source Priority

| Priority | Repository | Role | Notes From README |
|---:|---|---|---|
| 1 | [anbeime/skill](https://github.com/anbeime/skill) | Main source pool | Skill store with official skills, local Chinese skills, category metadata, JSON/CSV export, backups, and daily sync from public skill sources. README reports document processing, content creation, programming, machine learning, and automation workflow coverage. |
| 2 | [laolaoshiren/claude-code-skills-zh](https://github.com/laolaoshiren/claude-code-skills-zh) | Chinese/developer supplement | Chinese Claude Code skills collection with directly installable original skills such as `zh-code-reviewer`, `zh-readme`, `api-tester`, `refactor-advisor`, and `perf-profiler`. Useful for Chinese workflow and development-task coverage. |
| 3 | [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | Backup index and conceptual reference | Curated Claude Skills index. Useful when the first two sources do not provide enough category coverage, and useful for progressive-disclosure, security, and skill-structure framing. |

## Source License Notes

Initial README/license inspection on 2026-07-13:

| Repository | Initial License Note | Action Before Copying Skill Text |
|---|---|---|
| `anbeime/skill` | README includes license signals, but direct raw `LICENSE` fetch did not resolve during intake. | Clone and inspect repository files before copying any skill text into benchmark fixtures. |
| `laolaoshiren/claude-code-skills-zh` | Raw `LICENSE` fetch returned MIT License. | Record exact commit and skill path when selecting candidates. |
| `travisvn/awesome-claude-skills` | Direct raw `LICENSE` fetch did not resolve during intake. | Treat as an index; verify the linked real source repository license instead of relying on this index. |

## Intake Principles

1. Preserve source identity. Every candidate must keep its original repository URL, path, README description, and license note when available.
2. Do not rewrite a public skill into an anonymous local fixture. If adaptation is necessary, record it as `adapted-public` and keep the original text available for comparison.
3. Prefer real `SKILL.md` directories over list-only entries. Index-only entries can help discovery, but should not become benchmark skills until their actual skill artifact is fetched.
4. Balance the corpus across categories instead of only selecting coding-agent skills.
5. Include no-skill suitability. A candidate is stronger when tasks can compare `no-skill`, `original`, `ir-profile`, and `ir-pgo`.
6. Treat executable scripts, external APIs, browser automation, credentials, and platform-specific dependencies as risk signals.
7. Record whether the skill can support artifact solidification: reusable schemas, scripts, templates, checks, adapters, or fixed tool plans.

## Provenance Labels

Use these labels in the future manifest:

| Label | Meaning |
|---|---|
| `real-public` | Public skill used close to its original form. |
| `adapted-public` | Public skill translated, narrowed, or modified before evaluation. |
| `upstream-skvm` | Skill already present in the SkVM repository. |
| `user-provided` | Skill provided by the project user or lab. |
| `synthetic-seed` | Locally created fixture for calibration and controlled failure cases. |

## Evidence Weight

Recommended values:

| Evidence Weight | Intended Use |
|---|---|
| `main-real` | Public or upstream skills that can support main evaluation claims. |
| `support-real` | Public skills that are useful but too broad, risky, or hard to execute for full benchmarks. |
| `index-only` | Directory or README entry used for discovery, not direct benchmark evidence yet. |
| `calibration-low` | Synthetic seed fixtures used for pipeline/debugging/case-study calibration. |

## Sampling Targets

For the next real-skill expansion, start with a small but balanced intake table before converting skills to IR:

| Category | Initial Target | Why |
|---|---:|---|
| Document/file processing | 2-3 | Strong artifact-solidification potential through schemas, scripts, and templates. |
| Chinese developer workflow | 3-4 | Tests non-English skill instructions and Chinese output requirements. |
| Code quality/security/testing | 3-4 | Comparable with current seed tasks but externally sourced. |
| Content/report generation | 2-3 | Tests output schema, evidence grounding, and style constraints. |
| Environment/tool automation | 2-3 | Tests adapters, dependency checks, and platform assumptions. |
| Non-coding domain workflow | 2-3 | Reduces coding-agent and GPT-style bias. |

The first implementation pass should not try to convert all candidates. It should create a scored intake table and select a small pilot set.

## Candidate Intake Table

Status values:

```text
candidate | inspect-skill-md | selected-pilot | deferred | rejected
```

| Candidate | Source | Source Type | Category | README Description | Proposed Provenance | Evidence Weight | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| `docx` | `anbeime/skill`, also official skill indexes | likely skill artifact | document/file processing | Word document processing skill; README lists it as a system/document processing skill. | `real-public` | `main-real` | candidate | Good artifact target: schemas, templates, scripts, checks. Need fetch actual `SKILL.md` and license. |
| `pdf` | `anbeime/skill`, also official skill indexes | likely skill artifact | document/file processing | PDF processing skill listed as a high-priority document skill. | `real-public` | `main-real` | candidate | Good for deterministic checks and script/tool reuse. |
| `pptx` | `anbeime/skill`, also official skill indexes | likely skill artifact | document/file processing | Presentation processing/generation skill. | `real-public` | `main-real` | candidate | Useful for artifact solidification and structured output. |
| `paper-analysis-assistant` | `anbeime/skill` | local/public skill | document and analysis | arXiv paper analysis assistant. | `real-public` | `main-real` | candidate | Non-trivial reading/report task; check whether external API or web access is required. |
| `contract-review` | `anbeime/skill` | local/public skill | document and analysis | Contract review skill. | `real-public` | `support-real` | candidate | High-stakes legal-adjacent; use toy contracts and avoid legal-advice claims. |
| `content-creation-publisher` | `anbeime/skill` | local/public skill | content workflow | Full content creation and publishing workflow. | `real-public` | `support-real` | candidate | Broad workflow; may need narrowing before evaluation. |
| `frontend-design` | `anbeime/skill`, `travisvn/awesome-claude-skills` | public skill | design/development | Frontend design skill listed in both sources. | `real-public` | `support-real` | candidate | Visual quality hard to score automatically; use only if deterministic constraints can be designed. |
| `stock-analysis` | `anbeime/skill` | local/public skill | finance/business | Stock analysis skill. | `real-public` | `support-real` | candidate | Financial high-stakes; use historical/toy data and avoid investment advice. |
| `zh-code-reviewer` | `laolaoshiren/claude-code-skills-zh` | original repo skill | Chinese developer workflow | Chinese code review report skill. | `real-public` | `main-real` | candidate | Strong no-skill/original/IR comparison; close to seed review but real Chinese skill. |
| `zh-readme` | `laolaoshiren/claude-code-skills-zh` | original repo skill | Chinese documentation | Analyze a project before writing Chinese README. | `real-public` | `main-real` | candidate | Good for output-structure and evidence-grounding checks. |
| `api-tester` | `laolaoshiren/claude-code-skills-zh` | original repo skill | testing/tool-use | Parse OpenAPI and generate API testing ideas. | `real-public` | `main-real` | candidate | Good schema/task benchmark; can use toy OpenAPI specs. |
| `refactor-advisor` | `laolaoshiren/claude-code-skills-zh` | original repo skill | code quality | Detect code smells and give actionable refactoring advice. | `real-public` | `main-real` | candidate | Strong comparison target; can design deterministic smell fixtures. |
| `perf-profiler` | `laolaoshiren/claude-code-skills-zh` | original repo skill | performance/debugging | Locate bottlenecks and prioritize optimizations. | `real-public` | `main-real` | candidate | Good for ordered diagnosis and evidence checks. |
| `security-audit` | `laolaoshiren/claude-code-skills-zh` | original repo skill | security | Code security audit and remediation suggestions. | `real-public` | `support-real` | candidate | Useful, but security claims need careful toy fixtures and scope control. |
| `playwright-skill` | `travisvn/awesome-claude-skills` | index entry | browser automation | General-purpose browser automation using Playwright. | `real-public` after fetching source | `index-only` | inspect-skill-md | Use only after fetching actual repository and verifying skill artifact. |
| `Trail of Bits Security Skills` | `travisvn/awesome-claude-skills` | index entry | security/static analysis | Security skills for CodeQL/Semgrep, variant analysis, and code auditing. | `real-public` after fetching source | `index-only` | inspect-skill-md | Strong external source but may require tools and dependencies. |
| `claude-scientific-skills` | `travisvn/awesome-claude-skills` | index entry | scientific workflow | Collection of scientific skills and specialized libraries/databases. | `real-public` after fetching source | `index-only` | inspect-skill-md | Useful non-coding/domain sample if executable dependencies are manageable. |

## Intake Workflow

1. Fetch README and license metadata for the source repository.
2. Locate actual skill artifact directories and confirm each has `SKILL.md`.
3. Record candidate metadata in this document or a future machine-readable intake file.
4. Inspect `SKILL.md` and bundled scripts/resources.
5. Classify risks: external API, credentials, local tools, OS dependency, arbitrary code execution, high-stakes domain.
6. Select a small pilot set across categories.
7. Convert selected skills to Skill IR without overwriting the original text.
8. Design no-skill/original/IR tasks with deterministic or semi-deterministic success criteria.
9. Run small real-agent audits before adding candidates to main benchmark claims.

## Command Notes

README inspection examples:

```powershell
Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/anbeime/skill/main/README.md
Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/laolaoshiren/claude-code-skills-zh/main/README.md
Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/travisvn/awesome-claude-skills/main/README.md
```

Future cloning should go into a local ignored cache or a documented external-source area, not directly into the benchmark corpus:

```powershell
New-Item -ItemType Directory -Force -Path .skvm/external-skills | Out-Null
git clone https://github.com/anbeime/skill.git .skvm/external-skills/anbeime-skill
git clone https://github.com/laolaoshiren/claude-code-skills-zh.git .skvm/external-skills/claude-code-skills-zh
git clone https://github.com/travisvn/awesome-claude-skills.git .skvm/external-skills/awesome-claude-skills
```

## Assumptions And Failure Modes

- README counts and categories can change. Record fetch date when turning candidates into benchmark inputs.
- Some README entries are indexes rather than actual installable skill folders. Do not treat index entries as evaluated skills until their real artifact is fetched.
- License signals may conflict between badges and license sections. Verify the repository `LICENSE` file before committing copied skill text.
- Some skills execute arbitrary code or require credentials. These should be sandboxed, stubbed, or deferred.
- Broad workflow skills may need task narrowing; if narrowed, label them `adapted-public`.
- High-stakes domains such as legal, finance, security, and medicine need toy fixtures and cautious wording.

## Verification

After updating this document, verify source references and plan alignment:

```powershell
rg -n "anbeime/skill|claude-code-skills-zh|awesome-claude-skills|real-skill intake|evidence weight|SKILL.md" docs/skill-ir
git diff --check
```
