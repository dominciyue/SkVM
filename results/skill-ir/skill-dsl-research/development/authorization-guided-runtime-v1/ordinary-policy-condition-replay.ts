import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkControlConclusions } from "../../../../../src/task-dsl/authorization/control-conclusion.ts"

const root = import.meta.dir, original = "ordinary/native-memos-worklist-repaired/native-trace.json"
const trace = JSON.parse(await readFile(path.join(root, original), "utf8"))
const last = trace.history.filter((h: any) => h.call.name === "authorization_check_result").at(-1)
if (!last?.call.arguments.result || !trace.program || !trace.domain?.check) throw new Error("Missing original check input")
const checked = checkControlConclusions(trace.program, trace.domain.slice, last.call.arguments.result, trace.domain.dependencies)
if (checked.diagnostics.some(d => d.code === "policy-behavior-conflict") || !checked.diagnostics.some(d => d.code === "decisive-dependency-open") || checked.ruleConsistency || checked.taskResolution !== "partial") throw new Error("Expected only the policy-equivalence diagnostic to clear; unresolved helper must remain")
const report = { at: new Date().toISOString(), original, originalDiagnostics: trace.domain.check.diagnostics, currentDiagnostics: checked.diagnostics, originalPolicyComparisons: trace.domain.check.policyComparisons, currentPolicyComparisons: checked.policyComparisons, currentTaskResolution: checked.taskResolution, originalArchiveChanged: false, originalRulesChanged: false, bindingValuesChanged: false, promotedCheckedResult: false, semanticSupport: "unreviewed", providerCalls: 0, targetExecutions: 0, meaning: "Pure current checker application to the same archived conditional proposal, not a new model delivery or semantic regrade" }
await writeFile(path.join(root, "policy-condition-replay.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report))
