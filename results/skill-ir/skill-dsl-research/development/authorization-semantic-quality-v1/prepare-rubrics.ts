import { readFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { AuthorizationEvaluationRubricsV2Schema } from "../../../../../src/benchmarks/authorization-dsl/evaluate.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { compileAuthorizationTask } from "../../../../../src/task-dsl/authorization/semantics.ts"

const repo = path.resolve(import.meta.dir, "../../../../..")
const aa = JSON.parse(await readFile(path.join(repo, "results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1/evaluator/rubrics-v3.json"), "utf8"))
const z = JSON.parse(await readFile(path.join(repo, "results/skill-ir/skill-dsl-research/development/authorization-protocol-usability-v1/evaluator/rubrics-v3.json"), "utf8"))
const entries = [
  ["owui-file", "owui-process-file-write", aa],
  ["owui-text", "owui-process-text-controlled", aa],
  ["owui-header", "owui-trusted-header-deployment", aa],
  ["fastapi-foreign-update", "fastapi-items-foreign-update", aa],
  ["gitea-collaborator", "gitea-collaborator-cross-user-permission", z],
  ["gitea-assignee", "gitea-issue-assignee-nonwriter", z],
  ["gitea-lock", "gitea-issue-lock-writer-nonadmin", z],
] as const
const cases: unknown[] = []
const responseDetails: Record<string, unknown> = {}
for (const [id, oldId, source] of entries) {
  const loaded = await loadLocalAuthorizationInput(path.join(import.meta.dir, "inputs", id, "authoring.json"))
  if (loaded.status !== "valid") throw new Error(`Invalid input ${id}`)
  const original = source.cases.find((item: any) => item.caseId === oldId)
  if (!original) throw new Error(`Missing prior rubric ${oldId}`)
  const { responseDetails: oldResponseDetails, ...rubric } = original
  const obligationId = compileAuthorizationTask(loaded.task).runnableObligations[0]?.id
  if (!obligationId) throw new Error(`Missing obligation ${id}`)
  cases.push({ ...rubric, caseId: id, taskId: loaded.task.taskId, rubricVersion: `${rubric.rubricVersion}+AH`, obligationId })
  responseDetails[id] = oldResponseDetails ?? { criterionIds: [], requiredCriterionIds: [], basis: "No response-only detail criterion." }
}

const readLoaded = await loadLocalAuthorizationInput(path.join(import.meta.dir, "inputs", "fastapi-superuser-read", "authoring.json"))
if (readLoaded.status !== "valid") throw new Error("Invalid superuser read input")
const source = [{ path: "items.py", startLine: 48, endLine: 58 }]
cases.push({
  caseId: "fastapi-superuser-read", taskId: readLoaded.task.taskId, rubricVersion: "fastapi-superuser-read+AH/v1",
  obligationId: compileAuthorizationTask(readLoaded.task).runnableObligations[0]!.id,
  expectedDisposition: "source_refuted",
  dispositionRule: { oracleRule: "second-project/evaluator/rubric.json#/cases/1", sourceLocations: source },
  scopeRule: { oracleRule: "second-project/model-input/task.json#/tasks/1", sourceLocations: source },
  criteria: [
    { id: "caller-binding", layer: "necessary-semantics", requirement: "Identify current_user as the assessed authenticated caller.", decisionRelevance: "The role branch must apply to the actual caller.", oracleRule: "second-project/evaluator/rubric.json#/cases/1/necessaryFacts/0", sourceLocations: [{ path: "items.py", startLine: 48, endLine: 49 }] },
    { id: "foreign-item", layer: "necessary-semantics", requirement: "Identify the loaded existing item as owned by someone other than the caller under the bounded scenario.", decisionRelevance: "The exception matters only for a foreign item.", oracleRule: "second-project/evaluator/rubric.json#/cases/1/necessaryFacts/1", sourceLocations: [{ path: "items.py", startLine: 53, endLine: 56 }] },
    { id: "superuser-exception", layer: "necessary-semantics", requirement: "Explain that the ownership rejection requires not current_user.is_superuser, so the active superuser bypasses that rejection.", decisionRelevance: "This is the decisive role exception.", oracleRule: "second-project/evaluator/rubric.json#/cases/1/necessaryFacts/2", sourceLocations: [{ path: "items.py", startLine: 56, endLine: 57 }] },
    { id: "read-effect", layer: "necessary-semantics", requirement: "Trace the surviving branch to returning the item.", decisionRelevance: "The protected read effect must be reachable for the stated role.", oracleRule: "second-project/evaluator/rubric.json#/cases/1/necessaryFacts/3", sourceLocations: [{ path: "items.py", startLine: 56, endLine: 58 }] },
  ],
})
responseDetails["fastapi-superuser-read"] = { criterionIds: [], requiredCriterionIds: [], basis: "No separately requested response detail." }

const rubrics = AuthorizationEvaluationRubricsV2Schema.parse({
  schemaVersion: "authorization-evaluation-rubrics/v2", protocolVersion: "authorization-evaluation-protocol/v2",
  provenance: {
    preparedBy: "AH development agent before generation", preparedAt: new Date().toISOString(),
    publicInputs: entries.map(([id]) => `inputs/${id}/authoring.json`).concat("inputs/fastapi-superuser-read/authoring.json"),
    evaluatorOnlyInputs: ["earlier public development oracles/rubrics and fixed-source references; not loaded by run driver"],
    historicalArtifactsModified: false, exposureStatus: "Public development; previous panel exposure is recorded, not held-out.",
  },
  calibration: {
    publicRequirements: ["Bind the declared principal and target to the actual fixed source path, strongest applicable control, and effect."],
    rules: [
      "Actual allow/deny/unknown and policy-conformance label are separate judgments.",
      "A correct label with a missing decisive object, path, exception or external fact is partial.",
      "Accept logically equivalent source-backed wording; neither schema validity nor citation presence proves semantics.",
      "Response-only details are assessed separately from necessary semantics.",
    ],
    cases: [
      { id: "correct-bounded-causal-path", expectedQuality: "full-success", rationale: "Correct label, decisive controls and effect with a bounded explanation." },
      { id: "right-label-wrong-target-control", expectedQuality: "incorrect", rationale: "A source-file check or token scope is mistaken for permission on the effect target." },
      { id: "right-label-missing-exception", expectedQuality: "partial", rationale: "An applicable role or self exception is omitted despite a correct current-case label." },
      { id: "deployment-fact-invented", expectedQuality: "incorrect", rationale: "Unknown deployment topology is asserted as observed fact and changes the conclusion." },
    ],
  },
  cases,
})
await mkdir(path.join(import.meta.dir, "evaluator"), { recursive: true })
await writeFile(path.join(import.meta.dir, "evaluator", "rubrics.json"), `${JSON.stringify(rubrics, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
await writeFile(path.join(import.meta.dir, "evaluator", "response-details.json"), `${JSON.stringify(responseDetails, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
