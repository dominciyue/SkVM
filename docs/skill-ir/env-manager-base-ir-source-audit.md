# Env Manager Base IR Source Audit

## Provenance

- Repository: `laolaoshiren/claude-code-skills-zh`
- Commit: `1e221579b0504082d25d5548b194399a7785f10f`
- Upstream path: `skills/env-manager/SKILL.md`
- Local pinned source: `benchmarks/skill-ir/pilots/env-manager/source/SKILL.md`
- SHA-256: `1da53ec17fadccd3f72644cb4e0b8db1cc250ce01c414aa125ed6cd6e76dad6c`

The base IR was authored without development run outputs, scorer payloads,
fixture-only identifiers, held-out task content, or profile annotations.

## Field Audit

| IR area | Construction class | Upstream basis |
|---|---|---|
| intent and categories | source-explicit | Front matter, trigger conditions, workflow, and modification boundary |
| project workspace input | static-clarification | “scan project”; current workspace prevents inventing an absent project subdirectory |
| optional requested scope | static-clarification | Trigger conditions and multiple optional sync/framework targets |
| `.env.example`, `.env.schema.json`, report outputs | source-explicit | Generate/repair and output-format sections |
| readable workspace and exact output contract | schema-plumbing | Makes source operations and user-requested artifact contract checkable |
| discover project | static-clarification | Scan-project workflow plus CI/container/deployment/dynamic-access caveat |
| inventory definitions | source-explicit | Workflow 1 and secret-redaction requirement |
| scan references | source-explicit | JavaScript/TypeScript and Python reference forms; modification-boundary caveat |
| classify findings | source-explicit | Defined/used, unconfirmed unused, missing, hardcoded secret, and framework traps |
| infer validation | source-explicit | Required/default, URL, port, boolean, and secret checks |
| write artifacts | source-explicit | Generate/repair and output-format sections |
| verify artifacts | schema-plumbing | Safety checklist and modification boundary converted into an explicit final check |
| redaction and protected-file rules | source-explicit | Scan rule, safety checklist, and modification boundary |
| uncertainty rule | source-explicit | “unused” means only not found by static scanning |
| example safety | source-explicit | `.env.example` generation and no-production-secret boundary |
| framework exposure | source-explicit | Next.js, CRA, Vite, Nuxt, and Vue CLI prefix table |
| exact output contract | static-clarification | Preserve explicit user artifact requests while retaining documented defaults |
| filesystem and search tools | schema-plumbing | Minimal capabilities required by scan/generate workflow; no shell-specific command is encoded |
| host and framework environment assumptions | source-explicit + static-clarification | Docker/monorepo/framework traps plus cross-host file-operation portability |
| checks and recovery | schema-plumbing | Operational forms of the audited steps and rules; recovery is bounded to scope/search/output repair |

## Leakage Audit

Automated corpus tests reject:

- `TEST_ONLY_` fixture secrets;
- development or held-out task ids;
- deterministic evaluator criterion ids;
- a non-empty `profile` array;
- stale source content or digest;
- broken step, tool, or check references.

Generic report field concepts are allowed when they directly express the
upstream report categories. Concrete expected variable sets remain evaluator-only.
