import { isDeepStrictEqual } from "node:util"
import { normalizeAuthorizationAuthoringInput } from "../../../../../src/benchmarks/authorization-dsl/authoring.ts"
import { AuthorizationTaskChangeV1Schema, applyTaskChange, compileAuthorizationTaskAuthoring, projectCurrentTask } from "../../../../../src/benchmarks/authorization-dsl/authoring-task.ts"
import { applyAuthorizationLocalEdit } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"
import type { AuthorizationAuthoringTask } from "../../../../../src/benchmarks/authorization-dsl/authoring-assist.ts"
import { authorizationAuthoringFieldGuide } from "../../../../../src/benchmarks/authorization-dsl/authoring-assist.ts"

export const parseObject = (text: string): any => JSON.parse(text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, ""))
const issue = (path: string, message: string) => ({ path, message })

export function authorPromptTask(row: any, current: any, context: any, knownDraft: any, change?: any, previous?: any): AuthorizationAuthoringTask {
  const base = { currentTask: current, context, ...(change ? { namedChange: change, previousAuthoredInput: previous } : {}) }
  const outputContract = row.route === "markdown"
    ? "Return only reusable Markdown task instructions for this current task. State current policy, both scenario facts/expectations and premises; retain requested counterfactuals. No completed source analysis."
    : row.route === "dsl"
      ? row.version === "original"
        ? "Return only a complete authorization-assessment-authoring/v2 JSON declaration. Keep the known context fields and exactly the two stated cases. No assessment envelope or completed analysis."
        : "Return only authorization-local-edit/v1 JSON with reason and operations for the named current change. Do not replace the full declaration or alter unrelated fields."
      : row.version === "original"
        ? "Return only authorization-task-authoring/v1 JSON for the supplied current task. Each case declares its own entry, premise statements, condition dictionary and requested branch assumptions. Do not output scenarios/analysisContract or completed analysis."
        : "Return only authorization-task-change/v1 JSON for the named change. Explicitly review each linked expectation if policy changes; preserve all unmentioned current facts."
  const editScope = row.version === "original"
    ? "Copy public policy, expectations, premises, entries and requested branches from currentTask. Write only this current version; no future fields or source outcomes."
    : "Apply only namedChange to previousAuthoredInput. Keep original case identity, source and all unmentioned public facts. No source-outcome inference."
  return { publicBrief: JSON.stringify(base), outputContract, editScope,
    knownFields: row.route === "dsl" ? { context, draft: knownDraft } : { context, currentTask: current },
    fieldGuide: row.route === "dsl" ? authorizationAuthoringFieldGuide
      : row.route === "task-authoring" ? "Current task schema: {schemaVersion:'authorization-task-authoring/v1',request,policy:{text,location,revision,acceptance,reason},cases:[{name,entry,principal:{role},resource:{type},relation,operation,expectation,boundary,premises:[{name,statement}],conditions?:{name:{basis}},branches:[{name,assumptions:{conditionName:boolean|'unknown'}}],responseDetails:[string]}],publicInstruction?}. Named changes use authorization-task-change/v1 with reason, optional policy/request and cases:[{name,expectation?,premises?:[{name,statement}]}]."
        : "Write reusable Markdown for the exact current task and explicit source identity/entry. Helpers are evidence, not additional analysis entries. Unspecified actual owner presence requires both requested branches." }
}

export function checkTaskFacts(actual: any, expected: any) {
  const diagnostics: ReturnType<typeof issue>[] = []
  if (actual.request !== expected.request) diagnostics.push(issue("request", "Retain the current public question."))
  if (!isDeepStrictEqual(actual.policy, expected.policy)) diagnostics.push(issue("policy", "Retain every field of the accepted current public policy."))
  for (const field of ["publicInstruction", "additionalQuestions", "additionalConstraints"]) if (!isDeepStrictEqual(actual[field], expected[field])) diagnostics.push(issue(field, "Retain the current public response duty."))
  if (actual.cases?.length !== expected.cases.length) diagnostics.push(issue("cases", "Retain exactly the two public cases."))
  for (const wanted of expected.cases) {
    const found = actual.cases?.find((item: any) => item.name === wanted.name)
    if (!found) { diagnostics.push(issue(`cases.${wanted.name}`, "Public case is missing.")); continue }
    for (const field of ["entry", "relation", "operation", "expectation", "boundary"]) if (found[field] !== wanted[field]) diagnostics.push(issue(`cases.${wanted.name}.${field}`, "Retain the current public case fact."))
    if (!isDeepStrictEqual(found.principal, wanted.principal) || !isDeepStrictEqual(found.resource, wanted.resource)) diagnostics.push(issue(`cases.${wanted.name}.actor-resource`, "Retain the public principal and resource."))
    if (!isDeepStrictEqual(found.premises?.map((item: any) => [item.name, item.statement]), wanted.premises.map((item: any) => [item.name, item.statement]))) diagnostics.push(issue(`cases.${wanted.name}.premises`, "Retain the current public premise statements."))
    if (!isDeepStrictEqual(Object.values(found.conditions ?? {}).map((item: any) => item.basis).sort(), Object.values(wanted.conditions ?? {}).map((item: any) => item.basis).sort())) diagnostics.push(issue(`cases.${wanted.name}.conditions`, "Retain the public condition bases; names may vary."))
    if (!isDeepStrictEqual(found.responseDetails, wanted.responseDetails)) diagnostics.push(issue(`cases.${wanted.name}.responseDetails`, "Retain the requested response details."))
    if (!isDeepStrictEqual(found.analyzeConditions, wanted.analyzeConditions)) diagnostics.push(issue(`cases.${wanted.name}.analyzeConditions`, "Retain the current condition-analysis request."))
    if (found.branches?.length !== wanted.branches.length) diagnostics.push(issue(`cases.${wanted.name}.branches`, "Retain exactly the requested branches."))
    for (const branch of wanted.branches) {
      const actualBranch = found.branches?.find((item: any) => item.name === branch.name)
      const expectedValue = Object.values(branch.assumptions)[0]
      if (!actualBranch || Object.keys(actualBranch.assumptions ?? {}).length !== 1 || Object.values(actualBranch.assumptions)[0] !== expectedValue)
        diagnostics.push(issue(`cases.${wanted.name}.branches.${branch.name}`, "Retain the requested branch meaning; condition names may vary."))
    }
  }
  return diagnostics
}

export function checkV2Facts(actual: any, expected: any, context: any) {
  const diagnostics: ReturnType<typeof issue>[] = []
  for (const field of ["taskId", "repository", "sourceRef", "sourceRoot"]) if (actual[field] !== context[field]) diagnostics.push(issue(field, "Retain the supplied source identity and context."))
  for (const entry of context.entries) {
    const authored = actual.entries?.[entry.entryKey]
    if (!authored || !isDeepStrictEqual(authored.locations, [{ path: entry.path, startLine: entry.startLine, endLine: entry.endLine }])) diagnostics.push(issue("entries", "Retain the supplied entry path and exact source range."))
  }
  if (!Array.isArray(actual.sources) || !context.entries.every((entry: any) => actual.sources.includes(entry.path))) diagnostics.push(issue("sources", "Retain the supplied entry source file."))
  const policyKeys = Object.keys(actual.policies ?? {})
  if (actual.request !== expected.request || policyKeys.length !== 1 || !isDeepStrictEqual(actual.policies?.[policyKeys[0]!], expected.policy)) diagnostics.push(issue("policy/request", "Retain the current public question and every accepted policy field."))
  if (!isDeepStrictEqual(actual.analysisContract?.publicInstruction, expected.publicInstruction)
    || !isDeepStrictEqual(actual.additionalQuestions, expected.additionalQuestions)
    || !isDeepStrictEqual(actual.additionalConstraints, expected.additionalConstraints)) diagnostics.push(issue("publicResponse", "Retain the current public instruction, questions and constraints."))
  if (!isDeepStrictEqual(Object.keys(actual.scenarios ?? {}).sort(), expected.cases.map((item: any) => item.name).sort())) diagnostics.push(issue("scenarios", "Retain exactly the two public cases."))
  for (const wanted of expected.cases) {
    const found = actual.scenarios?.[wanted.name], contract = actual.analysisContract?.scenarios?.[wanted.name]
    if (!found || !contract) { diagnostics.push(issue(`scenarios.${wanted.name}`, "Missing scenario or analysis contract.")); continue }
    for (const field of ["relation", "operation", "expectation"]) if (found[field] !== wanted[field]) diagnostics.push(issue(`scenarios.${wanted.name}.${field}`, "Retain the public scenario fact."))
    if (found.policy !== policyKeys[0]) diagnostics.push(issue(`scenarios.${wanted.name}.policy`, "Use the single current policy."))
    if (!isDeepStrictEqual(found.entries, [wanted.entry]) || !actual.entries?.[wanted.entry]) diagnostics.push(issue(`scenarios.${wanted.name}.entries`, "Retain the declared analysis entry."))
    if (actual.principals?.[found.principal]?.role !== wanted.principal.role || actual.resources?.[found.resource]?.type !== wanted.resource.type) diagnostics.push(issue(`scenarios.${wanted.name}.actor-resource`, "Retain the public principal and resource."))
    if (contract.boundary !== wanted.boundary || !isDeepStrictEqual(contract.premises?.map((item: any) => [item.id, item.statement, item.atEntry]), wanted.premises.map((item: any) => [item.name, item.statement, wanted.entry]))) diagnostics.push(issue(`analysisContract.scenarios.${wanted.name}.premises`, "Retain the current premise and entry."))
    if (!isDeepStrictEqual(Object.values(found.conditions ?? {}).map((item: any) => item.basis).sort(), Object.values(wanted.conditions ?? {}).map((item: any) => item.basis).sort())) diagnostics.push(issue(`scenarios.${wanted.name}.conditions`, "Retain public condition bases; names may vary."))
    if (!isDeepStrictEqual(contract.requiredResponseDetails, wanted.responseDetails)) diagnostics.push(issue(`analysisContract.scenarios.${wanted.name}.requiredResponseDetails`, "Retain the requested response details."))
    if (contract.requestedBranches?.length !== wanted.branches.length) diagnostics.push(issue(`analysisContract.scenarios.${wanted.name}.requestedBranches`, "Retain exactly the requested branches."))
    for (const branch of wanted.branches) {
      const actualBranch = contract.requestedBranches?.find((item: any) => item.id === branch.name)
      if (!actualBranch || actualBranch.assumptions?.length !== 1 || actualBranch.assumptions[0]?.value !== Object.values(branch.assumptions)[0]) diagnostics.push(issue(`analysisContract.scenarios.${wanted.name}.requestedBranches.${branch.name}`, "Retain branch meaning; declared condition key may vary."))
    }
  }
  return diagnostics
}

export function checkDelivery(row: any, responseText: string, current: any, context: any, previous?: any): any {
  let candidate: any = responseText
  if (row.route === "markdown") {
    const clean = (value: string) => value.replace(/[`*_#]/g, "").replace(/\s+/g, " ").trim()
    const required = [context.taskId, context.sourceRef, context.entries[0].entryKey, context.entries[0].path,
      String(context.entries[0].startLine), String(context.entries[0].endLine), current.policy.text,
      ...current.cases.flatMap((item: any) => [item.name, item.relation, item.operation, item.expectation, ...item.premises.map((premise: any) => premise.statement), ...item.branches.map((branch: any) => branch.name)])]
    const diagnostics = required.filter(value => !clean(candidate).includes(clean(value))).map(value => issue("markdown", `Retain this public current fact: ${value}`))
    if (/observedBehavior|canonical result|source_supported_failure|source_refuted/.test(candidate)) diagnostics.push(issue("markdown", "Deliver reusable instructions, not a completed analysis."))
    return { valid: diagnostics.length === 0, diagnostics, value: candidate }
  }
  try { candidate = parseObject(responseText) } catch (error) { return { valid: false, diagnostics: [issue("$", String(error))] } }
  if (row.route === "task-authoring") {
    if (row.version === "changed") {
      const parsed = AuthorizationTaskChangeV1Schema.safeParse(candidate)
      if (!parsed.success) return { valid: false, diagnostics: parsed.error.issues.map(item => issue(item.path.join("."), item.message)), candidate }
      const changed = applyTaskChange(previous, parsed.data)
      if (changed.status !== "ready") return { valid: false, diagnostics: changed.diagnostics, candidate }
      const compiled = compileAuthorizationTaskAuthoring(context, changed.current, { fieldOrigin: "model-authored" })
      const diagnostics = [...checkTaskFacts(changed.current, current), ...(compiled.status === "needs-input" ? compiled.diagnostics : [])]
      return { valid: diagnostics.length === 0, diagnostics, value: changed.current, delivered: candidate, compiled }
    }
    const parsed = projectCurrentTask(candidate)
    if (parsed.status !== "ready") return { valid: false, diagnostics: parsed.diagnostics, candidate }
    const compiled = compileAuthorizationTaskAuthoring(context, parsed.current, { fieldOrigin: "model-authored" })
    const diagnostics = [...checkTaskFacts(parsed.current, current), ...(compiled.status === "needs-input" ? compiled.diagnostics : [])]
    return { valid: diagnostics.length === 0, diagnostics, value: parsed.current, compiled }
  }
  let value = candidate
  if (row.version === "changed") {
    const edited = applyAuthorizationLocalEdit(previous, candidate)
    if (edited.status !== "ready") return { valid: false, diagnostics: edited.diagnostics, candidate }
    value = edited.value
  }
  const normalized = normalizeAuthorizationAuthoringInput(value)
  const diagnostics = [...(normalized.status === "ready" ? [] : normalized.diagnostics), ...checkV2Facts(value, current, context)]
  return { valid: diagnostics.length === 0, diagnostics, value, delivered: candidate, normalizedStatus: normalized.status }
}
