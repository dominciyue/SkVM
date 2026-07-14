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

Initial README inspection was followed by a repository checkout audit on 2026-07-15:

| Repository | Initial License Note | Action Before Copying Skill Text |
|---|---|---|
| `anbeime/skill` | Commit `ddad6073e07addfe3690dc3de978b2e73ca8cf02` has no repository-wide license. Some nested artifacts, including `law-to-markdown`, have their own licenses. | Decide reuse per artifact. Do not copy an unlicensed nested skill into the committed benchmark corpus. |
| `laolaoshiren/claude-code-skills-zh` | Commit `1e221579b0504082d25d5548b194399a7785f10f` has a repository-level MIT License. | Record the commit and exact `SKILL.md` path for each selected candidate. |
| `travisvn/awesome-claude-skills` | Commit `1da55aa810f206d3fe2005e7e3989b15a275d942` contains no `SKILL.md`; it is an index. | Fetch and license-check the linked source repository before promotion. |
| `K-Dense-AI/claude-scientific-skills` | Discovered through the awesome index. Commit `fc0b9f692459ea7d9e5a5c64948a5878e1bce274` has a repository-level MIT License. | Use as the first linked real source for non-coding scientific workflow coverage. |

## Repository Inspection Snapshot

The committed machine-readable snapshot is:

```text
benchmarks/skill-ir/corpus/real-skill-intake.json
```

It records source commits, artifact counts, license status, candidate paths, dependencies, risks, and artifact-solidification potential. Raw checkouts remain under ignored `.skvm/external-skills/` and are not committed.

| Source | Real `SKILL.md` Count | Inspection Result |
|---|---:|---|
| `anbeime/skill` | 70 | Real aggregate artifacts exist, but license and completeness must be checked per nested skill. |
| `laolaoshiren/claude-code-skills-zh` | 20 | Direct skill artifacts under a repository-level MIT license. |
| `travisvn/awesome-claude-skills` | 0 | Discovery index only. |
| `K-Dense-AI/claude-scientific-skills` | 149 | Linked real source with MIT license and strong non-coding/scientific coverage. |

The checkout also corrected several README-stage assumptions. `anbeime/skill` lists `docx`, `pdf`, and `pptx` as system-built-in skills, but the inspected commit does not contain matching artifact directories for those names. They must not be counted as fetched real skills. `pdf-processing-pro` does exist, but its `SKILL.md` advertises several bundled scripts while only `scripts/analyze_form.py` is present, so it is deferred.

## Selected Pilot

The first licensed pilot contains six skills:

| Skill | Source | Coverage | Why Selected | Main Risk |
|---|---|---|---|---|
| `law-to-markdown` | `anbeime/skill` | document processing, environment, tool use | Apache-2.0 artifact with converter, stage checker, dependencies, and explicit fallback policy. | Use toy legal text; PDF/DOCX fallback requires consent. |
| `zh-code-reviewer` | `claude-code-skills-zh` | Chinese developer, code quality | External replacement for the synthetic review shape with a stable output contract. | Similar to the seed review skill, so it cannot carry generalization claims alone. |
| `api-tester` | `claude-code-skills-zh` | testing, schema, tool use | Supports deterministic OpenAPI fixtures and reusable test templates. | Framework-specific generated code needs controlled fixtures. |
| `env-manager` | `claude-code-skills-zh` | environment, security, tool use | Strong redaction, safety, schema, and cross-environment opportunities. | Fixtures must contain fake secrets only. |
| `zh-readme` | `claude-code-skills-zh` | Chinese content workflow | Adds evidence-grounded document generation and command/link validation. | Some presentation quality remains subjective. |
| `experimental-design` | `claude-scientific-skills` | scientific, non-coding, tool use | Adds a non-coding domain with deterministic seeded scripts and explicit dependencies. | Domain-aware quality checks are needed beyond syntax. |

Deferred candidates remain useful for later breadth:

- `pdf-processing-pro`: artifact/document mismatch and unresolved covering license.
- `paper-analysis-assistant`: broad dependency and network surface plus unresolved covering license.
- `data-storytelling`: useful non-coding generation, but license and semantic scoring remain unresolved.
- `scientific-writing`: licensed and rich in reusable assets, but mandatory research/image tooling makes it too expensive for the first pilot.

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

## Initial README Candidate Table

This table records the pre-checkout hypotheses from README inspection. The repository snapshot and selected-pilot sections above are authoritative when a row conflicts with this table.

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
git clone --depth 1 https://github.com/K-Dense-AI/claude-scientific-skills.git .skvm/external-skills/linked/claude-scientific-skills
```

Count real artifacts without relying on path-separator-sensitive regular expressions:

```powershell
Get-ChildItem -Path .skvm/external-skills -Recurse -File |
  Where-Object { $_.Name -ieq 'SKILL.md' }
```

## Assumptions And Failure Modes

- README counts and categories can change. Record fetch date when turning candidates into benchmark inputs.
- Some README entries are indexes or system-built-in names rather than artifact directories. Do not treat them as evaluated skills until a real artifact is fetched.
- An aggregate repository may have no root license even when a nested skill has one. Record the narrowest verified license scope.
- A `SKILL.md` can claim bundled scripts that are absent from the checkout. Inspect files, not only prose.
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
