# Skill IR Documentation Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the competing Skill IR status/history documents with a small current-reading set, preserve byte-bound versioned materials, and make `current-status.md` the sole navigation authority for the U0–U7 trace-guided optimization route.

**Architecture:** A machine-readable governance manifest separates current-reading documents, versioned materials, and retired explanatory documents. The current docs are rebuilt by responsibility, historical results remain in Git/`results`, and the link checker enforces only real integrity constraints while reporting size/count guidance as warnings.

**Tech Stack:** Markdown, Python `unittest`, the existing Skill IR link checker, Git, PowerShell, Bun/TypeScript checks only for affected documentation bindings.

---

### Task 1: Freeze the governance categories before deleting anything

**Files:**
- Create: `scripts/skill_ir_doc_governance.json`
- Modify: `scripts/check_skill_ir_doc_links.py`
- Modify: `scripts/check_skill_ir_doc_links_test.py`
- Read: `docs/superpowers/specs/2026-09-13-skill-ir-document-governance-design.md`

- [ ] **Step 1: Write failing tests for current documents, versioned materials, and advisory limits**

Add tests that exercise a pure `check_governance` function. Required assertions:

```python
def test_governance_rejects_missing_or_overlapping_materials(self):
    manifest = {
        "currentDocuments": [{"path": "docs/skill-ir/current-status.md", "softMaxLines": 200}],
        "versionedMaterials": ["docs/skill-ir/classification-handbook-v2.md"],
    }
    result = check_governance(self.root, manifest, {"docs/skill-ir/classification-handbook-v2.md"})
    self.assertIn("missing current document: docs/skill-ir/current-status.md", result["errors"])
    self.assertIn("versioned material is marked legacy: docs/skill-ir/classification-handbook-v2.md", result["errors"])

def test_governance_reports_count_and_line_limits_as_warnings(self):
    self.write("docs/skill-ir/current-status.md", "line\n" * 3)
    manifest = {
        "recommendedCurrentDocumentRange": {"min": 2, "max": 2},
        "currentDocuments": [{"path": "docs/skill-ir/current-status.md", "softMaxLines": 2}],
        "versionedMaterials": [],
    }
    result = check_governance(self.root, manifest, set())
    self.assertEqual(result["errors"], [])
    self.assertEqual(len(result["warnings"]), 2)
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
```

Expected: import/name failure for `check_governance` or failing governance assertions, while the existing nine link tests remain meaningful.

- [ ] **Step 3: Implement the minimal governance checker**

Add a pure function with this contract:

```python
def check_governance(root: Path, manifest: dict, legacy_paths: set[str]) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    current = [row["path"] for row in manifest.get("currentDocuments", [])]
    versioned = list(manifest.get("versionedMaterials", []))
    for path in current:
        if not (root / path).is_file():
            errors.append(f"missing current document: {path}")
    for path in versioned:
        if not (root / path).is_file():
            errors.append(f"missing versioned material: {path}")
        if path in legacy_paths:
            errors.append(f"versioned material is marked legacy: {path}")
    if set(current) & set(versioned):
        errors.append("current documents and versioned materials overlap")
    bounds = manifest.get("recommendedCurrentDocumentRange", {})
    if not bounds.get("min", 0) <= len(current) <= bounds.get("max", 10**9):
        warnings.append(f"current document count outside recommendation: {len(current)}")
    for row in manifest.get("currentDocuments", []):
        path = root / row["path"]
        if path.is_file() and len(path.read_text(encoding="utf-8").splitlines()) > row["softMaxLines"]:
            warnings.append(f"soft line limit exceeded: {row['path']}")
    return {"errors": errors, "warnings": warnings}
```

Load `scripts/skill_ir_doc_governance.json` in the existing CLI and include `governanceErrors`/`governanceWarnings` in its JSON output. Exit nonzero only for link errors, legacy references, or governance errors—not warnings.

- [ ] **Step 4: Define the exact categories**

The manifest must list the 14 current-reading paths from the design. Its versioned-material list must be generated from the current tracked TS/Python/JSON references and include at least:

```json
[
  "docs/skill-ir/api-request-body-negatives-development.md",
  "docs/skill-ir/api-request-form-specimens-development.md",
  "docs/skill-ir/api-request-specimens-development.md",
  "docs/skill-ir/classification-and-automation-next-stage-proposal.md",
  "docs/skill-ir/classification-handbook-v1.md",
  "docs/skill-ir/classification-handbook-v2.md",
  "docs/skill-ir/deadline-execution-status.md",
  "docs/skill-ir/skill-family-class-proof-002.md",
  "docs/skill-ir/skill-family-class-proof-recovery.md",
  "docs/skill-ir/skill-family-current-results.md",
  "docs/skill-ir/skill-family-current-v2-archive-recovery.md",
  "docs/skill-ir/skill-family-current-v2-clean-replay.md",
  "docs/skill-ir/skill-family-current-v2-final-delivery.md",
  "docs/skill-ir/skill-family-plan-review-20260912.md"
]
```

Do not modify those files. If the source scan finds another runtime-read document, add it to the list rather than changing a frozen verifier.

- [ ] **Step 5: Run GREEN verification**

Run the link-checker unit suite and the checker against the pre-governance tree. Expected: tests pass; governance has no hard errors; count/line warnings are allowed.

### Task 2: Change the startup rules before rebuilding the docs

**Files:**
- Modify: `D:\skill优化\AGENTS.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Replace the startup checklist**

Both files must require this order:

```text
1. Read AGENTS.
2. Read docs/skill-ir/current-status.md.
3. Run live Git status/log checks.
4. Read only the active plan/taskbook linked by current-status.
5. Read the relevant spec anchors and component sections only when the task affects them.
6. Read root handoff/communication only for cross-thread recovery or durable decisions.
```

- [ ] **Step 2: Replace the automatic “create a component doc” rule**

State that contributors update the matching current document by default. A new document requires a genuinely new long-lived responsibility and must record its effect on the 12–18 current-reading recommendation. One-run plans, status, failures, replays, and results go to taskbooks, Git, `results`, or history—not new `docs/skill-ir` Markdown.

- [ ] **Step 3: Record collaboration ownership**

State that the governance thread owns navigation and consolidation; the development thread owns U0–U7 method decisions. Shared docs are merged from the latest bytes, never overwritten wholesale from an older copy.

- [ ] **Step 4: Verify the rules text**

Use focused searches to confirm both AGENTS files name `current-status.md`, the current-document default, the 12–18 recommendation, and the no-one-off-doc rule. Confirm the latest U0–U7 route paragraph remains intact.

### Task 3: Rebuild the project entry, status, plan, and onboarding path

**Files:**
- Modify: `docs/skill-ir/README.md`
- Modify: `docs/skill-ir/current-status.md`
- Modify: `docs/skill-ir/developer-guide.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/superpowers/plans/2026-09-13-api-task-usable-delivery.md`

- [ ] **Step 1: Re-read the latest shared files immediately before editing**

Verify HEAD and diff. Preserve commit `9a16dfa`'s U0–U7 method decisions and the unrelated working-tree change in `src/skill-ir/skill-family-minimum-delivery-run.ts`.

- [ ] **Step 2: Rewrite README as navigation only**

Put `current-status.md` first. Link the repository-wide `../architecture.md`, `../usage.md`, and `../jit-boost.md`; then link the Skill IR spec, plan, guide, components, evidence, and history. Explain current-reading docs versus versioned materials.

- [ ] **Step 3: Rewrite current status as the sole live status page**

Use the seven-section structure from the design. Reflect the development thread's latest machine status: revision 2 U0–U7 is active, U0 is completed and U1 is in progress. Summarize the trace→model optimization→new package→agent use chain, list existing JIT/Skill IR backends, and state what has not yet been demonstrated. Do not make the date or status a checker constant.

- [ ] **Step 4: Rewrite the current plan**

Keep only the U0–U7 sequence, acceptance/stop conditions, active taskbook link, collaboration boundary, and a short previous-baseline pointer. Remove N0–N15 execution prose; history/evidence receive those pointers.

- [ ] **Step 5: Rewrite the developer guide around the real user flow**

Lead with repository installation/CLI docs, real trace/log collection, `jit-optimize`, proposal inspection, new skill package consumption, and matched agent verification. API request/pytest appears only as an optional deterministic U3 backend. Keep stable testing/Git/failure guidance; remove Stage M/N and dated relay logs.

- [ ] **Step 6: Mark the active taskbook as a taskbook, not a status authority**

Add a short top note linking `current-status.md` and the current plan. Do not alter its U0–U7 method, order, or acceptance content.

- [ ] **Step 7: Verify navigation and route preservation**

Run focused searches proving the three repository-level docs are linked, current status and plan link the same active taskbook, and the old API-only U0–U5 wording is absent from current-reading docs.

### Task 4: Rebuild the method and component documents

**Files:**
- Create: `docs/skill-ir/api-task-engine.md`
- Create: `docs/skill-ir/classification-and-routing.md`
- Modify: `docs/skill-ir/ir-core.md`
- Modify: `docs/skill-ir/optimization-and-artifacts.md`
- Modify: `docs/skill-ir/evaluation-system.md`
- Modify: `docs/skill-ir/real-skill-pilots.md`
- Modify: `docs/skill-ir/external-skill-import.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`

- [ ] **Step 1: Re-read each source document named in the disposition table**

Read the current bytes before synthesis. For shared spec/plan content, merge from HEAD; never restore the API-only U0–U5 text.

- [ ] **Step 2: Write `api-task-engine.md` to its fixed seven-part skeleton**

Include only CLI/TaskContract, source closure, request-json/pytest, checker, support matrix, known gaps, and tests. Preserve the empty-form/body-negative limitations as current facts. Link product-level JIT/artifact behavior instead of copying it.

- [ ] **Step 3: Write `classification-and-routing.md` with active contracts**

Include the four exported states, responsibility/workflow-step unit, dependency propagation, source/body exposure, family membership, constructibility/current support, duty extraction, Q1 distribution boundary, and new-member method. State that handbook v1/v2 and the proposal remain byte-bound materials outside the current reading path.

- [ ] **Step 4: Rewrite evaluation and product boundaries**

`evaluation-system.md` must retain runner/scorer/gate, held-out isolation, minimum-delivery/class-proof methods, B successor, trace/public-answer protocol, model comparison, and prospective/ablation method boundaries. `optimization-and-artifacts.md` must retain Final IR/artifact/runtime and explain its backend relationship to repository-level JIT-optimize/JIT-boost without duplicating `docs/usage.md` or `docs/jit-boost.md`.

- [ ] **Step 5: Condense the remaining stable component docs**

Keep public types/commands, runtime flow, test commands, assumptions, and failure modes in IR, pilot, and external-import docs. Remove copied stage status and result tables.

- [ ] **Step 6: Condense spec without inventing claim IDs**

Preserve cited section numbers/anchors, including 14.29, and current U0–U7 method decisions. Keep research questions, evidence/held-out boundaries, success criteria, cost rules, and prohibited claims. Remove per-commit/per-attempt logs. Do not renumber existing citations into a new claim taxonomy.

- [ ] **Step 7: Run the governance checker before any deletion**

Expected: all current-reading docs and versioned materials exist; hard errors are empty. Soft line/count warnings may remain and must be reviewed, not treated as failure.

### Task 5: Build the evidence/history indexes and retire explanatory duplicates

**Files:**
- Create: `docs/skill-ir/evidence-index.md`
- Modify: `docs/skill-ir/history.md`
- Modify: `scripts/skill_ir_legacy_doc_paths.txt`
- Modify when immutable references require it: `scripts/skill_ir_retired_doc_references.json`
- Delete: only disposition-table rows marked `合并后退出` or `历史退出`

- [ ] **Step 1: Generate the recovery table before deletion**

For every retiring path record:

```text
old path | last commit containing the file | one-line topic | merged target | authoritative results path or “none; recover via Git”
```

Use `git log -1 -- <path>` before deletion. Group rows visually by topic, but retain one row per old path.

- [ ] **Step 2: Write the evidence index**

Each row records claim text, narrow scope, authoritative `results/skill-ir/...` path, status, prohibited extrapolation, and an optional existing spec anchor. Do not copy raw tables or create new claim IDs.

- [ ] **Step 3: Update the legacy list**

Add only deleted explanatory paths. Do not mark current-reading docs or versioned materials as legacy.

- [ ] **Step 4: Run the tracked source-path audit**

Search tracked TS/Python/JSON. Every runtime-read path must resolve to a current document or versioned material. Ordinary navigation can target current docs. Do not change frozen/verifier constants merely to reduce file count.

- [ ] **Step 5: Delete retired explanatory docs using the disposition table**

Use `apply_patch` deletions only after Tasks 1–4 and Steps 1–4 are green. Leave all versioned materials byte-identical. Do not touch `docs/skill-ir/1.md`.

- [ ] **Step 6: Repair active links once**

Update surviving docs, active taskbooks, and ordinary source navigation. Historical taskbooks may be listed as `historicalSources` rather than
rewritten or marked as deleted legacy paths. References embedded under `results/skill-ir/` are reported as retired evidence automatically;
use exact retired-reference pairs for other immutable tracked evidence.

### Task 6: Verify, log, commit, and publish the governance stage

**Files:**
- Modify: `D:\skill优化\project_handoff.md`
- Modify: `D:\skill优化\project_communication.md`
- Modify: `D:\skill优化\conversation_log.md`
- Commit: the explicit SkVM governance paths only

- [ ] **Step 1: Run focused tests**

```powershell
python -m unittest discover -s scripts -p check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
```

Expected: all unit tests pass; `brokenReferences`, `legacyReferences`, and `governanceErrors` are empty. Warnings are reported separately.

- [ ] **Step 2: Verify runtime-bound documentation contracts**

Run the focused Q1 annotation-package tests and only the affected historical/current verifier checks that read preserved docs. Then run:

```powershell
bun run typecheck
git diff --check
```

Expected: pass/exit 0. No historical experiment, model call, paid call, held-out read, or product behavior run is required.

- [ ] **Step 3: Verify scope and isolation**

Confirm versioned material hashes are unchanged from HEAD, `docs/skill-ir/1.md` is untracked and unstaged, and `src/skill-ir/skill-family-minimum-delivery-run.ts` remains outside the governance diff/stage.

- [ ] **Step 4: Update root records concisely**

Handoff: current-status path, current HEAD, latest U0–U7 machine state, and recovery command. Communication: durable authority/ownership decision only. Conversation log: date, files, decisions, verification, risks. Do not copy the implementation narrative.

- [ ] **Step 5: Stage explicit paths and inspect the staged diff**

Do not use `git add .`. Stage only governance docs, checker/tests/manifest, AGENTS, legacy/retired lists, and intended deletions. Inspect staged names and diff.

- [ ] **Step 6: Commit and push**

```powershell
git commit -m "docs(skill-ir): consolidate current documentation authority"
git push origin skill-ir-aot
```

Expected: push succeeds without rewriting or dropping commit `9a16dfa`; unrelated working files remain local.
