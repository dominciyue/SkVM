// Zero-model observations, not an automatic semantic score. Source review
// adjudicates inherited expectations and identifies the implemented scope.
import path from "node:path"
import { readFile } from "node:fs/promises"
import { checkAuthorizationInquiry } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { executeResourceWorkflow, ResourceWorkflowSchema } from "../../../src/task-dsl/authorization/resource-relations.ts"
import { resolveProgramInputBinding } from "../../../src/task-dsl/authorization/program-input-binding.ts"
import { projectProgramOutcome } from "../../../src/task-dsl/authorization/program-outcome.ts"
import { base, load, save, hash } from "./evidence.ts"

export async function cases(task: string) {
  if (!["M", "G"].includes(task)) throw new Error("unknown-task")
  const scenarios = (await load(path.join(base, "evaluation/inherited-cases.json"))).filter((r: any) => r.task === task)
  const inputFile = path.join(base, `inputs/${task === "M" ? "memos" : "gitea"}-original.json`)
  const variants: any[] = []
  for (const [variant, file] of [["initial", `automatic/${task}-initial.json`], ["final", `automatic/${task}-final.json`], ["reference", `reference/${task}-program.json`]]) {
    const programFile = path.join(base, file!), raw = await load(programFile)
    const check: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive" })
    const diagnostics = check.executableContract?.diagnostics ?? check.diagnostics
    const strictWorkflow = ResourceWorkflowSchema.safeParse(raw.resourceWorkflow)
    const executable = !!check.executableContract?.resourceExecution && strictWorkflow.success
    const rows = executable ? scenarios.map((scenario: any) => {
      const input = scenario.input
      const binding = resolveProgramInputBinding(raw, { questions: input.inquiry.questions, operationQuestions: input.inquiry.questions.map((q: any) => ({ questionId: q.id, operationId: q.operationId })) }, input)
      const execution = executeResourceWorkflow(raw.resourceWorkflow, binding.resourceInputs, { externalAssumptions: binding.externalAssumptions })
      return { id: scenario.name, inheritedExpected: scenario.expected, sourceBasis: scenario.sourceBasis,
        bindingDiagnostics: binding.diagnostics, execution,
        outcome: projectProgramOutcome({ program: raw, resourceExecution: execution, diagnostics }),
        semanticScore: "requires-independent-source-review" }
    }) : []
    variants.push({ variant, file, sha256: hash(await readFile(programFile)), status: check.status, executable, diagnostics,
      strictWorkflowIssues: strictWorkflow.success ? [] : strictWorkflow.error.issues,
      progressiveObservation: check.executableContract?.resourceExecution, rows })
  }
  await save(path.join(base, `evaluation/cases-${task}.json`), { task, providerCalls: 0, businessWrites: 0, scope: "Finite program observations; inherited expected values are not a new source oracle. Missing implemented scope is not a semantic pass.", variants })
  return variants.map(v => ({ variant: v.variant, status: v.status, executable: v.executable, cases: v.rows.length }))
}
if (import.meta.main) console.log(JSON.stringify(await cases(process.argv[2]!), null, 2))
