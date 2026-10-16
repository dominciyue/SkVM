import { cp, mkdir, readFile, writeFile, realpath } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { checkAuthorizationInquiry, compareLocalInquiry, saveLocalInquiryCheck, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, repo, load, save, hash, relative } from "./study.ts"
import { createCases, question } from "../authorization-reusable-program-v1/cases.ts"
import { createTraceCases } from "../authorization-purpose-scoped-program-v1/trace-cases.ts"
import { sourceDownloadOracle } from "../authorization-authoring-loop-v1/evaluation/source-oracle.ts"
import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
import { assessBehaviorTrace, downloadTraceExpectation } from "../authorization-purpose-scoped-program-v1/behavior-assessment.ts"
import { assessScopedTrace } from "../authorization-call-semantics-v1/scope-assessment.ts"
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
export function finiteExpectation(facts: any, assumptions: any[]) {
  const oracleFacts = structuredClone(facts), oracleAssumptions = structuredClone(assumptions)
  // Query get() treats absence as None; a supplied constructor result denotes
  // normal completion independently of its value. Neither supplies a grant.
  if (!Object.hasOwn(oracleFacts.request, "version")) oracleFacts.request.version = null
  for (const a of oracleAssumptions) if (a.name === "ObjectPermissionChecker.construct") a.value = true
  return { expected: sourceDownloadOracle(oracleFacts, oracleAssumptions), traceExpected: downloadTraceExpectation(oracleFacts, oracleAssumptions) }
}
export async function offline(requestedFile?: string, track = "selected") {
  assert(/^[a-z0-9-]+$/.test(track), "Invalid offline track")
  const programFile = requestedFile ? path.resolve(repo, requestedFile) : path.join(base, "authoring/automatic-program.json"), bytes = await readFile(programFile), programSha256 = hash(bytes)
  const seedNames = ["root-default", "empty-version", "denied", "root-fallback"], seeds = await Promise.all(seedNames.map(n => load(path.join(base, `inputs/${n}.json`))))
  const cases = createCases(...seeds as [any, any, any, any]), traces = createTraceCases(seeds[0]), perturbations = (await load(path.join(base, "evaluation/preregistered-perturbations.json"))).cases
  const mappings = await load(path.join(base, "evaluation/reviewed-mappings.json")).catch(() => ({})), mapping = mappings[programSha256]
  const rows: any[] = []
  for (const [group, variants] of [["historical18", cases], ["trace8", traces], ["perturbations", perturbations]] as const) for (const variant of variants) {
    const input = structuredClone(variant.input), inputFile = path.join(base, `evaluation/${track}/inputs/${group}-${variant.name}.json`)
    input.sourceRoot = path.relative(path.dirname(inputFile), path.resolve(base, "inputs", input.sourceRoot)).split(path.sep).join("/"); await save(inputFile, input)
    const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive", programContext: "directed" }), actual = checked.executableContract?.resourceExecution
    const facts = input.resourceInputs[question], assumptions = input.externalAssumptions?.[question] ?? [], { expected, traceExpected } = finiteExpectation(facts, assumptions)
    const normalized = actual?.returned && mapping ? Object.fromEntries(Object.entries(mapping.fields as Record<string, string>).filter(([, field]) => Object.hasOwn(actual.returned, field)).map(([semantic, field]) => [semantic, actual.returned[field]])) : undefined
    if (normalized) for (const [key, values] of Object.entries(mapping.enums ?? {}) as Array<[string, Record<string, unknown>]>) { if (Object.hasOwn(values, normalized[key])) normalized[key] = values[normalized[key]]; else delete normalized[key] }
    let session: string | undefined
    if (group === "historical18" && variant.name === "root-default" && checked.status === "valid") {
      const old = await load(path.join(base, `evaluation/${track}/matrix.json`)).catch(() => undefined)
      session = old?.programSha256 === programSha256 ? old.rows.find((r: any) => r.session)?.session : undefined
      if (!session) session = relative((await saveLocalInquiryCheck(inputFile, programFile, path.join(base, `verification/${track}-archive`), checked, { executionPolicy: "progressive" })).sessionPath)
    }
    rows.push({ group, variant: variant.name, input: relative(inputFile), providerCalls: checked.providerCalls, actual, expected, diagnostics: checked.executableContract?.diagnostics ?? checked.diagnostics, literalShape: assessFiniteCase(expected, actual), semanticFields: mapping ? assessFiniteCase(expected, { ...actual, returned: normalized }) : null, fieldMappingStatus: mapping ? "reviewed-exact-model-raw" : "pending-independent-review", normalizedReturned: normalized, strictTrace: assessBehaviorTrace(actual, traceExpected), scopeAssessment: assessScopedTrace(actual, traceExpected), session })
  }
  assert(hash(await readFile(programFile)) === programSha256, "Raw changed during offline evaluation")
  const result = { track, program: relative(programFile), programSha256, providerCalls: 0, prospectiveOrHeldOut: false, counts: { historical: 18, additional: 8, preregisteredPerturbations: perturbations.length }, mapping: mapping ?? null, rows }
  const previous = await load(path.join(base, `evaluation/${track}/matrix.json`)).catch(() => undefined)
  assert(!previous || previous.programSha256 === programSha256, "Track already bound to different raw")
  await save(path.join(base, `evaluation/${track}/matrix.json`), result)
  if (track === "selected") await portableAndSourceChange(result)
  return { track, programSha256, cases: rows.length, mappingStatus: mapping ? "reviewed" : "pending", providerCalls: 0 }
}
/** Reassess saved executions after independent field/source review; no rerun. */
export async function regrade(track: string) {
  assert(/^[a-z0-9-]+$/.test(track), "Invalid offline track")
  const file = path.join(base, `evaluation/${track}/matrix.json`), matrix = await load(file)
  const mapping = (await load(path.join(base, "evaluation/reviewed-mappings.json")))[matrix.programSha256]
  assert(mapping, "No reviewed exact raw mapping")
  const corrections = []
  for (const row of matrix.rows) {
    const input = await load(path.resolve(repo, row.input)), { expected, traceExpected } = finiteExpectation(input.resourceInputs[question], input.externalAssumptions?.[question] ?? [])
    const strictTrace = assessBehaviorTrace(row.actual, traceExpected), scopeAssessment = assessScopedTrace(row.actual, traceExpected)
    if (!isDeepStrictEqual(row.strictTrace, strictTrace)) corrections.push({ group: row.group, variant: row.variant, before: row.strictTrace, after: strictTrace, reason: "Apply source-reviewed constructor normal completion and absent query semantics consistently to trace and value expectations; actual execution unchanged" })
    const normalized = row.actual?.returned ? Object.fromEntries(Object.entries(mapping.fields as Record<string, string>).filter(([, field]) => Object.hasOwn(row.actual.returned, field)).map(([semantic, field]) => [semantic, row.actual.returned[field]])) : undefined
    if (normalized) for (const [key, values] of Object.entries(mapping.enums ?? {}) as Array<[string, Record<string, unknown>]>) { if (Object.hasOwn(values, normalized[key])) normalized[key] = values[normalized[key]]; else delete normalized[key] }
    Object.assign(row, { expected, strictTrace, scopeAssessment, normalizedReturned: normalized, semanticFields: assessFiniteCase(expected, { ...row.actual, returned: normalized }), fieldMappingStatus: "reviewed-exact-model-raw" })
  }
  matrix.mapping = mapping
  if (corrections.length) await save(path.join(base, `evaluation/${track}/trace-review.json`), { corrections, targetExecutions: 0, providerCalls: 0 })
  await save(file, matrix)
  const summary = { programSha256: matrix.programSha256, providerCalls: 0, counts: Object.fromEntries(["historical18", "trace8", "perturbations"].map(group => { const rows = matrix.rows.filter((r: any) => r.group === group); return [group, { total: rows.length, fields: rows.filter((r: any) => r.semanticFields.finiteMachineMatch).length, localTrace: rows.filter((r: any) => r.scopeAssessment.local.pass).length, strictTrace: rows.filter((r: any) => r.strictTrace.pass).length }] })), failures: matrix.rows.filter((r: any) => !r.semanticFields.finiteMachineMatch || !r.scopeAssessment.local.pass).map((r: any) => ({ group: r.group, variant: r.variant, fields: r.semanticFields, localFailures: r.scopeAssessment.local.failures })) }
  await save(path.join(base, `evaluation/${track}/summary.json`), summary); return summary
}
export async function portableAndSourceChange(matrix: any) {
  const resultFile = path.join(base, "verification/portable.json"), prior = await load(resultFile).catch(() => undefined)
  if (prior) { assert(prior.programSha256 === matrix.programSha256, "Portable record names other raw"); return prior }
  const originalRow = matrix.rows.find((r: any) => r.session); assert(originalRow, "No inspectable current program")
  const input = await load(path.join(base, "inputs/root-default.json")), originalRoot = path.resolve(base, "inputs", input.sourceRoot), moved = path.join(base, "verification/moved/package"), copiedSession = path.join(moved, "session"), programFile = path.join(moved, "program.json")
  await mkdir(moved, { recursive: true }); await cp(originalRoot, path.join(moved, "source"), { recursive: true, force: false }); await cp(path.resolve(repo, originalRow.session), copiedSession, { recursive: true, force: false }); await writeFile(programFile, await readFile(path.resolve(repo, matrix.program)))
  assert((await inspectLocalInquiry(copiedSession)).sessionPath === copiedSession, "Moved inspect escaped copy")
  const results = []
  for (const name of ["root-default", "empty-version", "denied", "anonymous-skip-checker", "no-external"]) {
    const row = matrix.rows.find((r: any) => r.variant === name), current = await load(path.resolve(repo, row.input)), file = path.join(moved, `${name}.json`)
    current.sourceRoot = "source"; await save(file, current)
    const fresh: any = await checkAuthorizationInquiry(file, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive" }), previous: any = await compareLocalInquiry(file, copiedSession, "question-checked-v1", programFile, { executionPolicy: "progressive" })
    assert(fresh.providerCalls === 0 && previous.providerCalls === 0 && isDeepStrictEqual(fresh.executableContract?.resourceExecution, previous.executableContract?.resourceExecution), "Moved fresh/previous mismatch")
    results.push({ name, freshPreviousEqual: true, actual: fresh.executableContract?.resourceExecution })
  }
  const changed = path.join(base, "verification/source-change/package"), changedSource = path.join(changed, "source")
  await mkdir(changed, { recursive: true }); await cp(originalRoot, changedSource, { recursive: true, force: false })
  const sourcePath = "src/documents/views.py", target = path.join(changedSource, sourcePath), originalFile = path.join(originalRoot, sourcePath)
  assert((await realpath(target)).toLowerCase().startsWith((await realpath(changedSource)).toLowerCase() + path.sep), "Mutation escaped copy")
  const before = await readFile(originalFile, "utf8"), needle = 'if request.user is not None and not has_perms_owner_aware(\n            request.user,\n            "view_document",\n            root_doc,\n        ):\n            return HttpResponseForbidden("Insufficient permissions")\n        return ResolvedRequestDocs(request_doc=request_doc, root_doc=root_doc)'
  assert(before.split(needle).length === 2, "Mutation target not unique")
  const after = before.replace(needle, needle.replace("and not has_perms_owner_aware", "and has_perms_owner_aware")); await writeFile(target, after, "utf8")
  assert(await readFile(originalFile, "utf8") === before, "Protected source changed")
  input.sourceRoot = "source"; await save(path.join(changed, "input.json"), input)
  const changedProgram = path.join(changed, "program.json"); await writeFile(changedProgram, await readFile(programFile))
  const compared: any = await compareLocalInquiry(path.join(changed, "input.json"), copiedSession, "question-checked-v1", changedProgram, { executionPolicy: "progressive" })
  assert(compared.sourceChanged && compared.executableContract?.resourceExecution?.returned === undefined, "Old return survived source change")
  const result = { programSha256: matrix.programSha256, providerCalls: 0, copiedSession: relative(copiedSession), results, mutation: { path: sourcePath, line: 1421, beforeSha256: hash(before), afterSha256: hash(after), originalUnchanged: true }, oldReturnWithdrawn: true, sourceChangeInput: relative(path.join(changed, "input.json")), diagnostics: compared.executableContract?.diagnostics }
  await save(resultFile, result); return result
}
