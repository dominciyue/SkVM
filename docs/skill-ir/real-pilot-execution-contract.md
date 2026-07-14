# Real Pilot Execution Contract

## Status

Approved design for the real-skill restart, 2026-07-15. This contract is authoritative for corpus selection, original baselines, cold-start scheduling, PGO artifact promotion, and Wave B evidence.

## Goals

- Make `original` a byte-faithful, source-backed baseline.
- Prevent evaluator criteria from leaking into agent-visible prompts.
- Require explicit corpus selection for every matrix or real-agent run.
- Keep cold-start scheduling free of fake PGO rows.
- Treat Final IR as a provenance-bearing compiled artifact.
- Allow `ir-pgo` only to consume a validated Final IR on held-out tasks.
- Build pooled Final IR only from a fixed preregistered model panel and development evidence.
- Preserve skill resource parity across `original`, `ir-static`, and `ir-pgo`.
- Require Wave B replication before making the complete main claim.

## Corpus Registry

`benchmarks/skill-ir/corpus/manifest.json` becomes a registry rather than a skill list:

```text
calibration -> corpora/calibration.json
pilot       -> corpora/pilot.json
```

Every matrix and real-agent command must select `--corpus=calibration|pilot`. There is no implicit corpus. `calibration` contains the six synthetic fixtures at `depth: calibration`; `pilot` registers three Wave A deep pilots and three Wave B replication pilots.

A corpus skill becomes runnable only after it has source, IR, tasks, and `status: runnable`. Source-only pilot entries remain committed and visible but are excluded from scheduling with a clear readiness error when no runnable entries exist.

## Source Snapshot Contract

Each real skill is imported under:

```text
benchmarks/skill-ir/pilots/<skill-id>/source/
```

The directory preserves the exact upstream `SKILL.md` and the licensed resource closure needed by benchmark tasks. The corpus entry records:

- upstream repository and commit;
- upstream source path;
- local source path;
- SHA-256 for `SKILL.md` and imported resource files;
- license and license scope;
- Wave, status, provenance, and evidence weight.

`SkillIR.source.kind=file` records a repository-relative path and required SHA-256. Source loading rejects absolute paths, workspace escape, missing files, and digest mismatch.

## Exact Original Baseline

`original` must receive the exact imported `SKILL.md` body. It must not add a title, `Original Skill` heading, source-path placeholder, or generated guidance. When the source has relative scripts, references, templates, or license files, materialization copies the verified source closure while preserving relative paths.

Inline synthetic fixtures remain exact inline text and are calibration-only.

## Task And Scorer Separation

Agent-visible task input contains only the user request and intended context perturbation. `successCriteria` belongs to the evaluator rubric and scoring layer; it is not appended to the agent prompt.

If a format or constraint is genuinely part of the user's request, it must appear in `prompt`. Hidden evaluator criteria may test correctness, evidence, rule compliance, or expected artifacts without tutoring the agent.

Real pilots use SkVM's existing `file-check`, `script`, and `custom/python-grade` evaluator surface as the primary scoring path. LLM judgment is optional and auxiliary. Every case/system row receives a unique persistent workdir; raw and scored records store that path so deterministic evaluators can inspect produced artifacts. Missing declared dependencies are detected before model calls. Provider/adapter/evaluator process failures are infrastructure failures; an available tool that the agent omits or misuses is a semantic failure.

## System Scheduling

Cold-start systems are:

```text
no-skill | original | ir-static
```

`ir-pgo` is never a default system. It appears only in an explicit held-out command with a validated Final IR artifact. `ir-only`, `ir-profile`, and `skvm-aot` remain explicit compatibility or ablation systems.

## Final IR Provenance

Profile feedback must be generated with:

```text
source system: original
task split: development
explicit corpus: pilot
```

The compiler emits `provenance.json` beside `final-ir/`. At minimum it records:

- schema version and corpus id;
- source system and task split;
- scored development result path and SHA-256;
- corpus manifest path and SHA-256;
- per-skill source, base IR, overlay, and final IR SHA-256;
- annotation evidence count and output paths.

The real-agent runner validates this file before scheduling `ir-pgo`. It rejects missing provenance, non-development evidence, corpus mismatch, digest mismatch, missing skill records, a selected skill with zero profile annotations, or a Final IR that does not match the recorded artifact. A zero-annotation Final IR may be archived as a compilation result, but it cannot be labeled PGO in held-out execution.

Validation establishes artifact lineage, not quality. Held-out results decide whether the candidate helped or regressed.

## Skill Resource Parity

`no-skill` receives no skill-specific source closure. `original` receives the verified upstream closure. `ir-static` and `ir-pgo` receive the same immutable non-`SKILL.md` resources unless a compiled replacement records its source digest, pass version, validation status, and artifact digest in provenance. Generated IR materialization replaces only the agent-facing `SKILL.md` view by default.

## Panel-Conditioned Overlay

The first `env-manager` vertical uses one preregistered model to stabilize fixtures, scoring, execution, and provenance. It is labeled engineering calibration and excluded from pooled main evidence.

After that path is stable, a fixed model panel may build one shared Final IR from `original × development` evidence. Before execution, `wave-a-method-freeze.json` records model routes and families, adapter/version, contexts, task ids, equal repetition counts, aggregation thresholds, conflict policy, scorer/evaluator versions, and regression gates. Held-out rows never enter overlay construction.

Raw rows, scored rows, traces, overlays, and Final IR provenance must preserve model route, model family, adapter/version, run index, and panel/config id. Pooling must balance model support rather than sum unbalanced raw failures. The initial three-model policy requires three development repetitions per model/cell, at least two failures within each supporting model, and at least two supporting models. Conflicting passes for the same target are recorded and excluded from the shared artifact.

Reports include aggregate and per-model paired results, worst-model success, negative deltas, hard-gate regressions, infrastructure exclusions, and effective sample counts. A mean gain cannot hide a model regression beyond the preregistered margin. This design tests a panel-conditioned shared artifact, not transfer to a model absent from construction; per-model and leave-one-model-out artifacts are diagnostic ablations only.

## Evaluation Waves

### Wave A: Deep Pilot

Wave A contains:

```text
law-to-markdown
env-manager
experimental-design
```

Wave A develops source import, static IR, task schemas, scorers, task-local PGO, and one package-solidification case study. Development and held-out tasks remain disjoint.

### Wave B: Required Replication

Wave B contains the pre-registered replication pilots:

```text
zh-code-reviewer
api-tester
zh-readme
```

Wave B is mandatory for the complete main claim. It reuses the compiler, passes, scheduling contract, and evaluation protocol established in Wave A. Wave B results may reveal limitations, but they must not be used to tune the same reported pass/scorer configuration and then be presented as untouched replication evidence.

Without Wave B, the report may claim a Wave A method demonstration and bounded case evidence only.

## Failure Behavior

- Missing `--corpus`: fail before matrix construction.
- Selected corpus has no runnable skills: fail with readiness counts.
- File source is missing, escapes the repository, or fails digest verification: fail before task materialization.
- `ir-pgo` lacks validated provenance: fail before plan creation.
- PGO provenance is development-incompatible or does not match current source/base/final IR: fail.
- A task exposes evaluator-only success criteria in the prompt: test failure.
- Pooled rows lack model/run/panel metadata or use unequal unregistered repetitions: fail before overlay construction.
- A pooled overlay consumes held-out evidence or silently resolves conflicting repairs: fail validation.

## Verification

The implementation requires red-green tests for source loading, exact original output, resource copying and parity, hidden criteria, persistent workdirs, deterministic evaluator dispatch, infrastructure classification, explicit corpus selection, cold-start systems, pilot registration, development-only provenance, held-out PGO consumption, model/run/panel metadata, balanced aggregation, and conflict exclusion.
