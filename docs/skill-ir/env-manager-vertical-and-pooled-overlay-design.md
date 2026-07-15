# Env Manager Vertical Pilot And Panel-Conditioned Overlay Design

Date: 2026-07-15

## Status

Approved direction for the next real-skill implementation stage. This design governs the first `env-manager` vertical slice, deterministic artifact scoring, execution/resource boundaries, panel-conditioned overlay construction, and the Wave A to Wave B freeze transition.

## 1. Decisions

1. Start with one vertical `env-manager` pilot instead of writing tasks for all three Wave A skills in parallel.
2. Treat the first single-model run as engineering calibration, not main-claim evidence.
3. Make deterministic artifact evaluation the primary success signal. LLM judging is optional and auxiliary.
4. Generate PGO feedback only from `original x development` rows.
5. After the vertical path is stable, build one **panel-conditioned shared Final IR** from a preregistered model panel.
6. Evaluate the same Final IR on held-out tasks for every model in that panel.
7. Keep per-model Final IR and leave-one-model-out transfer outside the main table as diagnostic ablations.
8. Require method/configuration freeze plus Wave B preregistration before any Wave B target-model run.

## 2. Claim Boundary

The pooled experiment asks:

> Can development evidence from a fixed, preregistered model panel compile one shared skill artifact that improves or preserves held-out stability for the models in that panel?

It does not ask whether failures observed only on model A transfer to an unseen model B. That claim requires a separate leave-one-model-out or unseen-model transfer experiment.

The shared artifact must be described as **panel-conditioned**, not model-independent or universally cross-model.

## 3. Why `env-manager` Is First

`env-manager` has objective safety and file-contract requirements without mandatory third-party runtime dependencies. It can exercise fixture setup, persistent workdirs, deterministic scoring, exact original materialization, static IR, dynamic feedback, and held-out PGO without mixing those infrastructure questions with OCR, document parsing, or domain judgment.

The planned Wave A order is:

```text
env-manager -> law-to-markdown -> experimental-design
```

`law-to-markdown` remains second because its main Python entrypoint imports `pdfplumber` and `python-docx` at module load, including for `.txt` inputs. It also exposes the resource-parity problem: original materialization receives scripts, while generated IR materialization must explicitly preserve or replace those resources.

## 4. Vertical Stage

The first stage uses one preregistered, route-probed model and a small development/held-out task family:

```text
fixture workspace
  -> no-skill / exact original dry run
  -> deterministic scorer
  -> audited base IR
  -> ir-static
  -> original x development feedback
  -> provenance-bearing Final IR
  -> held-out ir-pgo
```

This stage validates contracts and reveals scorer or harness defects. Its results must be labeled `engineering-calibration` and excluded from the final pooled main table.

A temporary stub IR may be used only for plumbing tests. It must use a non-runnable/non-evidence status and must never be scored as `ir-static` research evidence.

### 4.1 Pre-IR Calibration Scheduling Contract

The approved calibration path is a purpose-specific `tasks-authored` opt-in,
not a change to the pilot's authoritative corpus status. The runner may accept
`--allow-tasks-authored` only when all of these conditions hold:

- corpus is `pilot`;
- exactly one skill is selected explicitly;
- task ids are selected explicitly and every selected task is `development`;
- context is exactly `clean`;
- systems are exactly the paired `no-skill | original` baseline;
- no IR override or PGO system is present.

The runner synthesizes an in-memory source envelope from the manifest's
`sourcePath` and matching `sourceFiles.sha256` record. The envelope exists only
to feed exact-source verification and original materialization. It is not
written as `irPath`, is not a base IR, cannot enter static passes or profile
compilation, and carries no optimization-effect claim. The scorer requires the
same explicit opt-in and loads only development tasks from `tasks-authored`
entries.

This contract closes the pre-IR calibration gap while preserving the normal
rule that a pilot becomes `runnable` only after an audited base IR exists.

## 5. Task And Workspace Contract

Each pilot task must define:

- a task id, task family, and `development` or `held-out` split;
- a self-contained fixture workspace with fake secrets only;
- the user-visible prompt;
- deterministic evaluator criteria and hard-gate ids;
- execution requirements and forbidden runtime actions;
- expected output files or allowed response-only behavior;
- scorer/version metadata.

The runner must allocate a unique persistent workdir for every case and system, pass it explicitly to `skvm run`, and record it in raw and scored rows. All paired systems receive byte-identical task fixtures.

Task fixtures may be visible to the agent. Evaluator code, hidden expected values, and judge-only criteria must remain outside the agent workdir.

## 6. Deterministic Scoring

Pilot scoring should reuse SkVM's existing evaluator surface:

```text
file-check
script
custom/python-grade
optional llm-judge
```

The Skill IR real-agent layer must not create a fifth evaluator type. It should persist the workdir and dispatch the task's existing eval criteria during the external scoring stage.

For `env-manager`, initial hard gates are:

- no secret value appears in final output or generated artifacts;
- real `.env` fixture files are not modified or deleted;
- generated JSON is parseable;
- the validator itself completed without infrastructure failure.

Functional checkpoints include:

- expected defined/used, defined/unconfirmed-unused, and used/undefined variable sets;
- `.env.example` contains required names without copied secrets;
- `.env.schema.json` contains required keys and value constraints;
- uncertain static-analysis findings are labeled for confirmation rather than deletion;
- `.gitignore` and framework-specific exposure rules are handled when relevant to the task.

Any hard-gate failure makes the row unsuccessful. Functional checkpoints may produce a score vector. LLM judge output, when present, is reported separately and cannot turn a hard-gate failure into success.

Seed heuristic scoring remains available only for calibration compatibility.

## 7. Execution And Infrastructure Boundary

Every task family declares an execution policy:

```text
network: denied unless explicitly required
runtime package installation: forbidden
required commands/dependencies: preflighted before model calls
workspace mutation: limited to declared paths
validator dependencies: version-pinned
```

Classification rules:

| Event | Classification |
|---|---|
| A declared dependency is missing during preflight | Infrastructure; block the batch before model calls. |
| Provider, adapter, timeout, or evaluator process failure | Infrastructure; exclude from semantic aggregates. |
| Dependency is available but the agent does not invoke it | Semantic failure. |
| Agent invokes a tool with wrong arguments or produces invalid artifacts | Semantic failure. |
| Validator cannot run because its own dependency/configuration is broken | Evaluator infrastructure failure. |
| Validator runs and rejects the produced artifact | Semantic failure. |

Runtime `pip install`, model-selected package upgrades, and silent network fallback are not allowed in the main experiment.

## 8. Skill Resource Parity

Paired task fixtures are identical across systems. Skill-provided resources follow this policy:

- `no-skill` receives no skill-specific source closure;
- `original` receives the verified upstream closure;
- `ir-static` and `ir-pgo` receive the same immutable non-`SKILL.md` resources unless a compiled replacement is recorded in provenance;
- generated IR materialization replaces only the agent-facing `SKILL.md` view by default;
- any solidified replacement script/schema/template must record source, digest, pass version, and validation status.

This prevents `original` from having executable scripts while IR systems accidentally lose them. The `env-manager` vertical slice validates the general workspace contract; resource parity becomes a hard gate before `law-to-markdown` is runnable.

## 9. Dual-Source Residual PGO

The main feedback path is intentionally:

```text
original x development -> failure lineage
ir-static x development -> typed residual
paired safe projection -> profile overlay -> base IR + passes -> Final IR
```

Original rows establish that a failure existed before static compilation.
Static rows determine what remains after the base IR passes. Original failures
resolved by static IR do not enter the overlay; failures introduced only by
static IR block compilation. Scorer expected values and fixture gold sets are
not compiler input.

Held-out data never enters an overlay. If development produces no valid annotation, the skill has no `ir-pgo` row for that configuration. Existing zero-annotation rejection remains mandatory.

The paired interpretation is:

```text
ir-static - original = static compilation contribution
ir-pgo - ir-static   = dynamic feedback contribution
```

The candidate must pass an explicit frozen `ir-pgo-dev` replay before held-out
`ir-pgo`. The 2026-07-16 v1 and v2 env-manager candidates did not clear this
gate, so no held-out optimization evidence exists yet. See
`env-manager-dual-source-overlay.md`.

## 10. Model And Repetition Metadata

Before pooled execution, raw rows, scored rows, traces, overlays, and Final IR provenance must record at least:

```text
model route id
model family
adapter id/version
run index
panel/config id
task/context/system
infrastructure/semantic status
```

The current runner and provenance path propagate this identity end to end for
single-model construction. Balanced per-model evidence vectors and conflict
resolution are still required before pooled construction.

## 11. Panel-Conditioned Aggregation

The pooled panel is preregistered with exact model routes, adapter, contexts, task ids, and equal repetition counts. Raw failure counts must not be summed across an unbalanced panel.

The first shared-overlay policy for a three-model panel is conservative:

```text
development repetitions per model/cell: 3
minimum failures per supporting model: 2
minimum supporting models: 2
```

Aggregation groups evidence by:

```text
skillId + targetRef + observation + suggestedPass
```

Each model contributes a support decision plus its evidence count; one model cannot dominate merely by producing more rows. The overlay preserves a per-model evidence vector and the aggregation policy version.

If the same `targetRef` produces conflicting `suggestedPass` values, the shared compiler does not choose one by raw majority. It records an unresolved conflict and excludes that repair from the shared Final IR. Per-model artifacts may retain the alternatives for diagnostic ablation.

Singleton model failures are reported as unresolved panel-specific weaknesses in the first pooled version. They do not enter the shared Final IR automatically. A later guarded-singleton policy would require development replay across the full panel and is outside this first implementation.

## 12. Evaluation And Regression Gates

Every result report includes:

- aggregate paired results;
- per-model paired results;
- worst-model success;
- hard-gate regressions;
- negative deltas against `original` and `ir-static`;
- infrastructure exclusions and effective sample counts;
- token and latency diagnostics.

An aggregate gain cannot support the full stability claim when one panel model crosses the preregistered regression margin. The numeric non-inferiority margin is selected from the Wave A development protocol and frozen before any pooled held-out execution; it cannot be selected after inspecting pooled held-out results. New secret leakage, destructive mutation, or another hard-gate regression has zero tolerance.

If the mean improves while one model regresses beyond the margin, the report states a mixed trade-off result rather than a cross-model stability improvement.

## 13. Freeze And Preregistration

Three artifacts separate engineering iteration from confirmatory evidence:

```text
env-manager-vertical-lock.json
wave-a-method-freeze.json
wave-b-preregistration.json
```

`env-manager-vertical-lock.json` records the single-model calibration configuration and makes that case reproducible. It does not freeze the final method.

`wave-a-method-freeze.json` is created after the Wave A method is stable and before Wave B execution. It records:

- repository commit, schema, parser/audit protocol, pass versions, and pass options;
- profile mapping and aggregation policy versions;
- `minEvidence`, model-support thresholds, and conflict policy;
- model routes, model families, adapter/version, repetitions, contexts, and task split policy;
- deterministic evaluator framework version and failure classification;
- environment/dependency lock and network/runtime-install policy;
- regression/non-inferiority gates;
- Wave A result and artifact digests.

`wave-b-preregistration.json` is written after Wave B tasks and validators are authored but before target-model execution. It pins source, task, fixture, evaluator, scorer, context, and model/config hashes. Any amendment creates a new version and invalidates results collected under the previous confirmatory label.

No secret or API key is stored in freeze files.

## 14. Diagnostic Ablations

The following are useful but do not enter the main table:

- per-model Final IR built and evaluated on the same model;
- leave-one-model-out overlay transfer;
- static-guided PGO;
- alternative pooled thresholds or conflict policies.

These ablations must use distinct system/artifact labels so they cannot be confused with the shared panel-conditioned Final IR.

## 15. Implementation Order

1. Extend task fixtures and persistent workdir/evaluator scoring contracts.
2. Propagate model, family, run index, and panel/config metadata through raw rows, scored rows, traces, and provenance.
3. Author `env-manager` development/held-out fixtures and deterministic validator before base IR.
4. Run single-model `no-skill | original` dry-run and scoring calibration.
5. Construct and audit `env-manager` base IR; add `ir-static`.
6. Generate original-guided Final IR and run single-model held-out `ir-pgo`.
7. Lock the vertical calibration case.
8. Implement balanced pooled aggregation and conflict reporting.
9. Preregister and run the model panel on `env-manager`.
10. Continue Wave A with `law-to-markdown`, then `experimental-design`.
11. Freeze the Wave A method, preregister Wave B, and only then execute Wave B target models.

## 16. Verification Requirements

Implementation requires red-green tests for fixture isolation, workdir persistence, hidden evaluator data, hard gates, infra/semantic classification, resource parity, model/run metadata propagation, balanced aggregation, conflict exclusion, provenance digests, held-out isolation, and freeze-manifest validation.
