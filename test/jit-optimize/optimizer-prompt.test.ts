import { describe, expect, test } from "bun:test"
import { buildOptimizerPrompt } from "../../src/jit-optimize/optimizer.ts"

/**
 * Prompt contract tests. These assert that specific load-bearing phrases the
 * rest of the system depends on stay in the prompt. They intentionally do
 * NOT try to validate full wording — the point is to catch accidental
 * regressions when the prompt is edited.
 */
describe("buildOptimizerPrompt", () => {
  test("references the task-first workspace layout", () => {
    const p = buildOptimizerPrompt(4, 0)
    expect(p).toContain("PER_TASK_SUMMARY.md")
    expect(p).toContain("tasks/<safeTaskId>")
    expect(p).toContain("run-N.md")
  })

  test("requires reading PER_TASK_SUMMARY before the per-task directories", () => {
    const p = buildOptimizerPrompt(4, 0)
    const summaryIdx = p.indexOf("PER_TASK_SUMMARY.md")
    const taskDirIdx = p.indexOf("tasks/<safeTaskId>")
    expect(summaryIdx).toBeGreaterThan(-1)
    expect(taskDirIdx).toBeGreaterThan(-1)
    expect(summaryIdx).toBeLessThan(taskDirIdx)
  })

  test("contains the Pre-Edit Checklist 5(d) No-trade-off test", () => {
    const p = buildOptimizerPrompt(4, 0)
    expect(p).toContain("No-trade-off test")
    // Language that should survive edits — it is what the rule is about.
    expect(p).toContain("PASSING")
    expect(p).toContain("per-task regression gate")
  })

  test("contains the Hard Rule 'No task trade-off' invoking Pareto-non-inferiority", () => {
    const p = buildOptimizerPrompt(4, 0)
    expect(p).toContain("No task trade-off")
    expect(p).toContain("Pareto-non-inferior")
  })

  test("keeps the existing generality + task-content-agnostic guards", () => {
    // These are the prior defences against content overfitting. The new
    // No-trade-off rule is orthogonal — if the prior rules get deleted
    // by accident, this test catches it.
    const p = buildOptimizerPrompt(4, 0)
    expect(p).toContain("Generality test")
    expect(p).toContain("Task-content-agnostic")
  })

  test("history section appears only when historyCount > 0", () => {
    const none = buildOptimizerPrompt(2, 0)
    expect(none).not.toContain("history.md")
    const some = buildOptimizerPrompt(2, 3)
    expect(some).toContain("history.md")
    expect(some).toContain("3 previous optimization round(s)")
  })

  test("Evidence Indices contract for blockedEvidenceIds is still present", () => {
    // Downstream validation reads `blockedEvidenceIds` as indices matching
    // the global flat numbering shown in PER_TASK_SUMMARY.md. The prompt
    // must tell the optimizer to use that numbering, not the per-task
    // local numbering.
    const p = buildOptimizerPrompt(4, 0)
    expect(p).toContain("Evidence Indices")
    expect(p).toContain("blockedEvidenceIds")
  })

  test("requires analysis of passing and unassessed evidence, not only failures", () => {
    const p = buildOptimizerPrompt(4, 0)
    expect(p).toContain("UNASSESSED")
    expect(p).toContain("Passing evidence can still support an optimization")
    expect(p).toContain("A missing score is not an infrastructure failure")
  })

  test("enumerates every structured opportunity and residual-duty category", () => {
    const p = buildOptimizerPrompt(4, 0)
    for (const category of [
      "instruction-clarity",
      "input-parameterization",
      "repeated-transformation",
      "verification",
      "environment-dependency",
      "residual-duty",
    ]) {
      expect(p).toContain(category)
    }
    expect(p).toContain("opportunities")
    expect(p).toContain("evidenceIds")
  })

  test("requires portable command output and an exact declared file set", () => {
    const p = buildOptimizerPrompt(4, 0)
    expect(p).toContain("/dev/null")
    expect(p).toContain("Do not create `NUL`")
    expect(p).toContain("changedFiles")
    expect(p).toContain("every file you create or edit")
    expect(p).toContain("Do not include `.optimize/submission.json` in `changedFiles` or `changes`")
  })

  test("admits an evidence-backed transformation observed in one successful run", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("one successful run")
    expect(p).toContain("mechanical transformation")
    expect(p).toContain("does not by itself prove quality")
    expect(p).not.toContain("same criterion across multiple runs, that is a skill defect")
  })

  test("does not let one selected edit hide other independently supported opportunities", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("implement every independent evidence-backed opportunity")
    expect(p).toContain("does not need to cover every input format supported by the skill")
    expect(p).toContain("bounded executable")
  })

  test("treats a bounded deterministic checker as a generated program opportunity", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("deterministic checker or normalizer")
    expect(p).toContain("does not have to perform the whole transformation")
    expect(p).toContain("source-established invariant")
  })

  test("does not require repeated traces or a pre-existing script for a source-established checker", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("does not require a repeated cross-task occurrence")
    expect(p).toContain("does not require a pre-existing checker")
    expect(p).toContain("source-established invariant")
    expect(p).toContain("original pre-run inputs")
    expect(p).toContain("observed post-run files")
    expect(p).toContain("independent passing criterion")
    expect(p).toContain("arbitrary declared input paths")
  })

  test("requires current semantic assertions instead of a historical pass label", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("historical passed criterion is not itself a current assertion")
    expect(p).toContain(".skvm-validation.json")
    expect(p).toContain("original source skill")
  })

  test("keeps professional judgment as a residual duty instead of pretending to solidify it", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("professional judgment")
    expect(p).toContain("residualDuties")
    expect(p).toContain("must remain with the agent")
  })

  test("does not turn an unknown score into failure or success", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("unknown quality")
    expect(p).toContain("neither failure nor success")
  })

  test("has no universal repetition or approximate line-count admission gate", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).not.toContain("under ~50 added lines")
    expect(p).not.toContain("If your diagnosis needs more than that")
    expect(p).toContain("small multi-file program")
    expect(p).toContain("move long tutorials or references")
  })

  test("asks for dependency-aware actions in the structured submission", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("actions")
    expect(p).toContain("dependsOn")
    expect(p).toContain("preconditions")
    expect(p).toContain("verification")
  })

  test("distinguishes local script reuse from registered domain backends", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("existing executable is modified in place")
    expect(p).toContain("Reserve `domain-backend` for a registered backend")
    expect(p).toContain("local-script kind mismatch")
  })

  test("repair prompt carries bounded action snapshots and actual diff context", () => {
    const p = buildOptimizerPrompt(1, 0, true)
    expect(p).toContain("baselineAction")
    expect(p).toContain("candidateAction")
    expect(p).toContain("candidateDiff")
    expect(p).toContain("originalIntent")
    expect(p).toContain("do not broaden the change")
  })

  test("asks for executable handoff metadata that avoids routine full-source inspection", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("separate `reuse-script` action")
    expect(p).toContain("`--help`")
    expect(p).toContain("structured completion summary")
    expect(p).toContain("must remain allowed")
  })

  test("requires a copy-ready common path before routine entrypoint discovery", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("copy-ready common-path command")
    expect(p).toContain("enumerate package files")
    expect(p).toContain("routine consumers")
    expect(p).toContain("large results in files")
    expect(p).toContain("residual next step")
  })

  test("asks the optimizer for evidence-bound executable validation suggestions", () => {
    const p = buildOptimizerPrompt(2, 0)
    expect(p).toContain("`validation`")
    expect(p).toContain("`task-fixtures`")
    expect(p).toContain("`workdir-snapshot`")
    expect(p).toContain("`reference-output`")
    expect(p).toContain("`self-check`")
    expect(p).toContain("does not establish task correctness")
    expect(p).toContain("run-N-task-fixtures")
    expect(p).toContain("original pre-run inputs")
  })

  test("routes executable work through the engine-built implementation context and bounded applicability cases", () => {
    const p = buildOptimizerPrompt(2, 0)
    expect(p).toContain(".optimize/IMPLEMENTATION_CONTEXT.json")
    expect(p).toContain("source interfaces")
    expect(p).toContain("normalized input locators")
    expect(p).toContain("observed format shapes")
    expect(p).toContain("available checks")
    expect(p).toContain("`applicability`")
    expect(p).toContain("`expectedAbsentFiles`")
    expect(p).toContain("before writing outputs")
  })

  test("preserves closed-world artifact fields and inapplicable semantics", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("closed set")
    expect(p).toContain("do not add plausible fields")
    expect(p).toContain("not applicable")
  })

  test("separates evidence confidence from score-improvement confidence", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("confidence is not a probability of score improvement")
    expect(p).toContain("quality score is not the only optimization objective")
    expect(p).toContain("efficiency")
  })

  test("keeps a bounded I18n key and placeholder opportunity visible on a passing run", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("locale key")
    expect(p).toContain("placeholder")
    expect(p).toContain("local boundary")
    expect(p).toContain("no defect")
    expect(p).toContain("cannot cover the whole skill")
    expect(p).toContain("does not by itself make the opportunity not-applicable")
  })

  test("requires compact opportunity records to state takeover and residual scope", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("delegated steps")
    expect(p).toContain("variable parameters")
    expect(p).toContain("required resources")
    expect(p).toContain("check source")
    expect(p).toContain("specific reason")
    expect(p).toContain("residual duty")
  })

  test("distinguishes a candidate attempt from a recommendation", () => {
    const p = buildOptimizerPrompt(1, 0)
    expect(p).toContain("candidate attempt")
    expect(p).toContain("recommendation")
    expect(p).toContain("implemented")
    expect(p).toContain("retained")
    expect(p).toContain("not-applicable")
  })
})
