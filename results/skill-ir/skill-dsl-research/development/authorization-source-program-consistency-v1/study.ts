import { mkdir, readFile, writeFile, copyFile, open, unlink } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { executeLocalInquiryRun, checkAuthorizationInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { executeResourceWorkflow } from "../../../../../src/task-dsl/authorization/resource-relations.ts"
import { classifyTerminalReport, observedAccountCost, measureAuthorTimeline } from "../authorization-authoring-loop-v1/measurement.ts"
import { createCases, question } from "../authorization-reusable-program-v1/cases.ts"
import { createTraceCases } from "../authorization-purpose-scoped-program-v1/trace-cases.ts"
import { finiteExpectation } from "../authorization-quality-evidence-v1/offline.ts"
import { assessFiniteCase } from "../authorization-authoring-loop-v1/evaluation/finite-assessment.ts"
import { assessScopedTrace } from "../authorization-call-semantics-v1/scope-assessment.ts"
import { assessBehaviorTrace } from "../authorization-purpose-scoped-program-v1/behavior-assessment.ts"
export const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), identity = "authorization-source-program-consistency-v1", bp = path.resolve(base, "../authorization-quality-evidence-v1")
export const load = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
export const save = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8") }
export const relative = (file: string) => path.relative(repo, file).split(path.sep).join("/")
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
const ledgerFile = path.join(base, "attempts.json"), seedRaw = path.join(base, "authoring/initial-program.json")
const skillFile = path.resolve(base, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md"), accountBoundaryFile = path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json")
export function admitAttempt(ledger: any[], position: string, attempt: string, repairs: any[] = []) {
  const order = ["T-R", "T-E", "U-E"], index = order.indexOf(position)
  if (index < 0 || !/^[a-z0-9-]+$/.test(attempt) || ledger.some(e => e.position === position && e.attempt === attempt)) throw new Error("invalid-or-duplicate-attempt")
  if (ledger.some(e => ["running", "unknown"].includes(e.status) || e.quotaOrAuth || e.lifecycle?.localExecution !== "closed")) throw new Error("active-unknown-or-paused-channel")
  if (index > 0 && !ledger.some(e => e.position === order[index - 1])) throw new Error("registered-order-required")
  const repair = repairs.find(r => r.position === position && r.attempt === attempt)
  if (attempt !== "first" && (!repair?.cause || !repair?.evidence || !repair?.uniqueConfirmation || ledger.filter(e => e.repairCause).length >= 3 || ledger.filter(e => e.position === position && e.repairCause === repair.cause).length >= 1)) throw new Error("named-confirmation-not-admitted")
  return repair
}
export function normalizeFields(value: any, mapping: any): any {
  if (!value || !mapping) return undefined
  const result = Object.fromEntries(Object.entries(mapping.fields as Record<string, string>).filter(([, field]) => Object.hasOwn(value, field)).map(([semantic, field]) => [semantic, value[field]]))
  for (const [key, values] of Object.entries(mapping.enums ?? {}) as Array<[string, Record<string, unknown>]>) if (Object.hasOwn(values, result[key])) result[key] = values[result[key]]; else delete result[key]
  return result
}
async function checkRegistration() {
  const r = await load(path.join(base, "registration.json"))
  for (const [f, digest] of Object.entries(r.files)) if (hash(await readFile(path.join(base, f))) !== digest) throw new Error(`Registered bytes changed: ${f}`)
  return r
}
export async function prepare() {
  if (await Bun.file(path.join(base, "registration.json")).exists()) return checkRegistration()
  if ((await load(ledgerFile)).length) throw new Error("Cannot register after dispatch")
  const files: string[] = [], register = async (name: string, value: unknown) => { await save(path.join(base, name), value); files.push(name) }
  const seeds = await Promise.all(["root-default", "empty-version", "denied", "root-fallback"].map(async n => { const file = path.join(bp, `inputs/${n}.json`), i = await load(file); i.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(file), i.sourceRoot)).split(path.sep).join("/"); return i }))
  const historical = createCases(...seeds as [any, any, any, any]), traces = createTraceCases(seeds[0])
  const perturbations = (await load(path.join(bp, "evaluation/preregistered-perturbations.json"))).cases.map((c: any) => { const i = structuredClone(c.input); i.sourceRoot = seeds[0].sourceRoot; return { name: c.name, input: i } })
  const boundaries: any[] = []
  const add = (name: string, change: (i: any, f: any) => void) => { const input = structuredClone(seeds[0]); change(input, input.resourceInputs[question]); boundaries.push({ name, input }) }
  add("none-and-absent-version-original", (_i, f) => { f.actor = null; delete f.request.version; f.request.original = "true" })
  add("non-owner-no-external", (i, f) => { f.documents.find((d: any) => d.id === f.request.pk).owner_id = 9; i.externalAssumptions[question] = [] })
  const cases = [...historical.map(c => ({ ...c, group: "historical18" })), ...traces.map(c => ({ ...c, group: "trace8" })), ...perturbations.map((c: any) => ({ ...c, group: "perturbations" })), ...boundaries.map(c => ({ ...c, group: "boundaries" }))]
  const expectations = cases.map(c => ({ group: c.group, name: c.name, ...finiteExpectation(c.input.resourceInputs[question], c.input.externalAssumptions?.[question] ?? []) }))
  await register("evaluation/cases.json", cases); await register("evaluation/expectations.json", expectations)
  const visible = [historical.find(c => c.name === "root-default")!, traces.find(c => c.name === "anonymous-skip-checker")!, perturbations.find((c: any) => c.name === "version-key-absent")!, historical.find(c => c.name === "empty-version")!, historical.find(c => c.name === "denied")!, historical.find(c => c.name === "no-external")!].filter(Boolean).map(c => ({ id: c.name, operationId: "document-download", resourceInputs: c.input.resourceInputs[question], externalAssumptions: c.input.externalAssumptions?.[question] ?? [] }))
  const task = "Maintain the existing SkVM-generated Paperless Download helper program supplied as your persistent draft. Investigate its agreement with the allowed real source across the supplied finite inputs; repair the program itself where source supports a change. Deliver the current program, reproducible regression inputs (structured values or an unambiguous parameter table), and a sourced explanation answering all four original questions and any remaining limitations. This is a real project artifact maintenance task using finite fixtures, not a live Paperless service/database run. Inputs include normal, actor None, a complete request mapping with an absent version key, explicit null, empty string, explicit rejection facts, and missing external facts. Use the tools available to this support mode for diagnosis and validation; if execution trials are available, exercise multiple inputs and use their actual results in repair or acceptance. Source syntax and authored coverage are not semantic proof. Do not invent missing external facts."
  const author = structuredClone(seeds[0]); author.sourceNotes = { format: "markdown", text: task + "\nFinite input examples without expected results (normal includes explicit null):\n" + JSON.stringify(visible) }
  await register("inputs/task.json", author)
  for (const c of [...visible.map(c => ({ name: c.id, input: cases.find(i => i.name === c.id)!.input })), ...boundaries]) await register(`inputs/${c.name}.json`, c.input)
  const consume = structuredClone(boundaries[0].input)
  consume.sourceNotes = { format: "markdown", text: "Use the supplied fixed program without editing it. Explain how this registered development input differs from the normal input below, answer all four original questions, and retain local-source, upstream and finite-fixture limitations. This combined input has not been run in this consumer session. Normal finite input: " + JSON.stringify({ resourceInputs: seeds[0].resourceInputs[question], externalAssumptions: seeds[0].externalAssumptions[question] }) }
  await register("inputs/consume.json", consume)
  await mkdir(path.dirname(seedRaw), { recursive: true }); await copyFile(path.join(bp, "authoring/automatic-program.json"), seedRaw); files.push("authoring/initial-program.json")
  const oldMappings = await load(path.join(bp, "evaluation/reviewed-mappings.json")), sha = hash(await readFile(seedRaw))
  await save(path.join(base, "evaluation/reviewed-mappings.json"), { [sha]: oldMappings[sha] })
  await register("evaluation/rubric.json", { frozenBeforeFirstCall: true, scope: "one exposed development task; no stable or general benefit claim", program: ["actual returned fields", "ordered local calls and skipped events", "named unknown conditions", "None caller activation repaired in model raw", "missing-key semantics repaired in model raw", "no key regression on normal/deny/unknown"], source: ["requested/root/file identities and version managers", "caller activation and helper owner shortcut", "version absent/null/empty/invalid/cross-root distinctions", "constructor normal completion independent of return truthiness and permission grant", "upstream authentication/global permission/storage boundaries"], explanation: ["computed versus authored literal", "external assumptions versus source semantics", "raw revision and actual trial fidelity"], originalQuestions: "Four original questions individually full/partial/incorrect/unavailable; BP scores never changed. Split source decisions, critical omissions and execution abstraction. No fixed sentence grants credit.", activeUse: "Current revision multi-input trial events must participate in diagnosis, patch, or explicit acceptance. Automatic context alone does not count.", comparison: "T-R/T-E same initial raw, complete input/skill/source/model/budgets/static feedback and implementation epoch. One pair descriptive only; first and repairs separate.", sourceBasis: ["views.py:1368-1448,4941-4965", "permissions.py:624-635", "versioning.py:23-28,140-195"], failures: "All planned positions and first artifacts retained; unknown costs remain unknown." })
  const manifest = await load(path.join(base, "manifest.json"))
  await register("configuration.json", { identity, ...manifest.experiment, limits: manifest.limits, skill: relative(skillFile), accountBoundary: relative(accountBoundaryFile), originalProgram: relative(seedRaw), allowed: ["complete original skill", "all four original questions", "allowlisted source", "common task and finite facts", "own raw and static feedback", "own execution diagnostics only in execute"], excluded: ["evaluator/expected", "historical answers", "taskbook", "developer repair drafts", "held-out/Q1 reserve"] })
  const registration = { identity, beforeFirstCall: true, preparedAt: new Date().toISOString(), baseline: git("rev-parse", "HEAD"), files: Object.fromEntries(await Promise.all(files.map(async f => [f, hash(await readFile(path.join(base, f)))]))), skillSha256: hash(await readFile(skillFile)), initialRawSha256: sha, order: manifest.order }
  await save(path.join(base, "registration.json"), registration); return { identity, cases: cases.length, initialRawSha256: sha }
}
export async function reproduce() {
  await prepare(); const raw = await load(seedRaw), cases = await load(path.join(base, "evaluation/cases.json"))
  const names = ["root-default", "anonymous-skip-checker", "version-key-absent", "empty-version", "denied", "no-external", "non-owner-no-external"]
  const rows = names.map(name => { const c = cases.find((c: any) => c.name === name); if (!c) throw new Error(name); const actual = executeResourceWorkflow(raw.resourceWorkflow, c.input.resourceInputs[question], { progressive: true, externalAssumptions: c.input.externalAssumptions?.[question] ?? [] }); return { name, actual } })
  await save(path.join(base, "verification/initial-reproduction.json"), { providerCalls: 0, targetExecutions: 0, programSha256: hash(await readFile(seedRaw)), rows }); return rows.map((r: any) => ({ name: r.name, returned: r.actual.returned, gaps: r.actual.gaps, conditions: r.actual.conditions }))
}
export async function preflight() {
  await checkRegistration(); const config = await load(path.join(base, "configuration.json")), views: any = {}
  for (const support of ["rules", "execute"] as const) {
    const runtime = await createNativeInquiryRuntime({ inputFile: path.join(base, "inputs/task.json"), domainProgramFile: seedRaw, workDir: base, sourceStructure: true, domainTools: true, strategy: "question-checked-v1", programMode: "edit", programSupport: support, programContext: "directed", authoringTargetMode: "reusable", executionPolicy: "progressive", ...config.limits })
    try {
      const context: any = await runtime.accountContext(false)
      const details = JSON.parse((await runtime.execute({ id: "details", name: "authorization_program_details", arguments: { view: "draft" } })).output)
      views[support] = { ruleDocument: context.ruleDocument, relations: details.callRelations.map((r: any) => ({ stepId: r.stepId, sourceContext: r.sourceContext })), files: runtime.report().sourceFiles, tools: runtime.definitions.map(t => t.name) }
      if (support === "rules" && /"(?:resourceExecution|events|returned|propertyChecks)":/.test(JSON.stringify(context))) throw new Error("rules-execution-leak")
    } finally { await runtime.close() }
  }
  if (!isDeepStrictEqual(views.rules.relations, views.execute.relations) || !isDeepStrictEqual(views.rules.ruleDocument, views.execute.ruleDocument) || !isDeepStrictEqual(views.rules.files, views.execute.files)) throw new Error("common-static-context-mismatch")
  const result = { identity, providerCalls: 0, targetExecutions: 0, checkedAt: new Date().toISOString(), commonStaticEqual: true, views }
  await save(path.join(base, "verification/preflight.json"), result); return { commonStaticEqual: true, calls: views.rules.relations.map((r: any) => ({ stepId: r.stepId, status: r.sourceContext.status, callers: r.sourceContext.calls.flatMap((c: any) => c.callers.filter((x: any) => x.state === "current").map((x: any) => ({ source: x.source, branches: x.enclosingBranches }))) })), providerCalls: 0 }
}
export async function run(position: string, attempt: string) {
  await checkRegistration(); await load(path.join(base, "verification/preflight.json"))
  if (git("status", "--porcelain", "--", "src")) throw new Error("Commit tested production epoch before dispatch")
  const ledger = await load(ledgerFile), repairs = await load(path.join(base, "repairs.json")).catch(() => []), repair = admitAttempt(ledger, position, attempt, repairs), config = await load(path.join(base, "configuration.json"))
  const author = position !== "U-E", programSupport = position === "T-R" ? "rules" : "execute", inputFile = path.join(base, `inputs/${author ? "task" : "consume"}.json`), domainProgramFile = author ? seedRaw : path.join(base, "authoring/automatic-program.json")
  const entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), model: config.model, effort: config.effort, programSupport, programMode: author ? "edit" : "consume", input: relative(inputFile), inputSha256: hash(await readFile(inputFile)), program: relative(domainProgramFile), programSha256: hash(await readFile(domainProgramFile)), skillSha256: hash(await readFile(skillFile)), limits: config.limits, codeEpoch: { commit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD:src") }, repairCause: repair?.cause, actualUsd: null }
  const outDir = path.join(base, `runs/${position}-${attempt}`), leasePath = path.join(outDir, "local-owner.json")
  await mkdir(outDir, { recursive: true }); const lease = await open(leasePath, "wx"); await lease.writeFile(JSON.stringify({ pid: process.pid, position, attempt })); await lease.close(); ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ sourceStructure: true, purpose: position, attempt, inputFile, domainProgramFile, outDir, model: config.model, method: "D1", strategy: "question-checked-v1", harness: "codex-account", domainTools: true, programMode: entry.programMode, programSupport, authoringTargetMode: author ? "reusable" : undefined, executionPolicy: "progressive", programContext: "directed", accountBoundaryFile, skillFile, execution: { ...config.limits, maxAuthorContinuations: author ? 2 : 0 } })
    const account = report.telemetry?.account, draft = report.domain?.programDraft?.currentDraft ?? report.domain?.executableContract?.currentDraft
    Object.assign(entry, classifyTerminalReport(report), observedAccountCost(report), { endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, durationMs: report.durationMs, lifecycle: account?.lifecycle, turns: account?.turns?.map((t: any) => ({ status: t.status, lifecycle: t.lifecycle, usage: t.usage, reason: t.reason, inferenceDispatched: t.inferenceDispatched })), reason: account?.reason ?? report.diagnostics })
    if (report.sessionPath) {
      const archived = await load(path.join(report.sessionPath, "run.json")), history = archived.native?.history ?? []
      await save(path.join(base, `evaluation/timeline-${position}-${attempt}.json`), measureAuthorTimeline(archived))
      await mkdir(path.join(base, "evaluation/answers"), { recursive: true }); await writeFile(path.join(base, `evaluation/answers/${position}-${attempt}.txt`), account?.text ?? "", "utf8")
      await save(path.join(base, `authoring/${position}-${attempt}-proposals.json`), history.filter((h: any) => ["authorization_program", "authorization_program_patch", "authorization_program_trial"].includes(h.call.name)))
      const regression = history.filter((h: any) => h.call.name === "authorization_program_trial").map((h: any) => ({ request: h.call.arguments, output: h.output }))
      await save(path.join(base, `authoring/${position}-${attempt}-regressions.json`), { origin: "model-tool-arguments-verbatim", trials: regression })
      if (author) {
        const proposals = history.filter((h: any) => ["authorization_program", "authorization_program_patch"].includes(h.call.name))
        const first = proposals.find((h: any) => h.output.currentDraft?.raw || h.output.ruleDocument)?.output
        let initial = first?.currentDraft?.raw
        if (!initial && first?.ruleDocument?.markdown) { const text = first.ruleDocument.markdown, start = text.lastIndexOf("\n```json\n"), end = text.lastIndexOf("\n```"); if (start >= 0 && end > start) initial = JSON.parse(text.slice(start + 9, end)) }
        if (initial) await save(path.join(base, `authoring/first-program-${position}-${attempt}.json`), initial)
        if (draft?.raw) await save(path.join(base, `authoring/final-program-${position}-${attempt}.json`), draft.raw)
        entry.rawModified = draft?.raw && hash(JSON.stringify(draft.raw)) !== hash(JSON.stringify(await load(seedRaw)))
        await save(path.join(base, `authoring/${position}-${attempt}-process.json`), report.domain)
      }
    }
    return entry
  } catch (error) { Object.assign(entry, { status: "unknown", error: String(error), endedAt: new Date().toISOString(), noAutomaticResend: true }); throw error }
  finally { await save(ledgerFile, ledger); await unlink(leasePath) }
}
export async function freeze(attempt: string) {
  const entry = (await load(ledgerFile)).find((e: any) => e.position === "T-E" && e.attempt === attempt)
  if (!entry || entry.status === "unknown" || entry.status === "running" || entry.lifecycle?.localExecution !== "closed") throw new Error("No known closed T-E")
  const file = path.join(base, `authoring/final-program-T-E-${attempt}.json`), target = path.join(base, "authoring/automatic-program.json")
  if (await Bun.file(target).exists()) throw new Error("Already frozen")
  await copyFile(file, target); const result = { position: "T-E", attempt, source: relative(file), sha256: hash(await readFile(target)), semanticSupport: "unreviewed", chosenBy: "predeclared-final-current-raw; no score selection" }; await save(path.join(base, "authoring/frozen-selection.json"), result); return result
}
export async function evaluate(file: string, track: string) {
  await checkRegistration(); if (!/^[a-z0-9-]+$/.test(track)) throw new Error("invalid-track")
  const programFile = path.resolve(repo, file), bytes = await readFile(programFile), sha256 = hash(bytes), raw = JSON.parse(bytes.toString()), cases = await load(path.join(base, "evaluation/cases.json")), expectations = await load(path.join(base, "evaluation/expectations.json")), mapping = (await load(path.join(base, "evaluation/reviewed-mappings.json")))[sha256]
  const rows: any[] = []
  for (const c of cases) {
    const expected = expectations.find((e: any) => e.group === c.group && e.name === c.name), actual = executeResourceWorkflow(raw.resourceWorkflow, c.input.resourceInputs[question], { progressive: true, externalAssumptions: c.input.externalAssumptions?.[question] ?? [] })
    const normalized = normalizeFields(actual.returned, mapping)
    rows.push({ group: c.group, name: c.name, actual, expected: expected.expected, semanticFields: mapping ? assessFiniteCase(expected.expected, { ...actual, returned: normalized }) : null, normalizedReturned: normalized, strictTrace: assessBehaviorTrace(actual, expected.traceExpected), scopeAssessment: assessScopedTrace(actual, expected.traceExpected) })
  }
  const inputFile = path.join(base, "inputs/task.json"), checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive", programContext: "directed" })
  const session = await saveLocalInquiryCheck(inputFile, programFile, path.join(base, `verification/${track}-archive`), checked, { executionPolicy: "progressive" })
  const result = { track, program: relative(programFile), programSha256: sha256, providerCalls: 0, targetExecutions: 0, execution: "public finite executor for all cases; ordinary compiler/source check and archive for default", sourceCheck: checked.status, session: relative(session.sessionPath), sourceDiagnostics: checked.executableContract?.diagnostics, mapping: mapping ?? null, rows }
  await save(path.join(base, `evaluation/${track}/matrix.json`), result)
  const summary = { track, programSha256: sha256, sourceCheck: checked.status, counts: Object.fromEntries(["historical18", "trace8", "perturbations", "boundaries"].map(g => { const subset = rows.filter(r => r.group === g); return [g, { total: subset.length, fields: mapping ? subset.filter(r => r.semanticFields.finiteMachineMatch).length : null, localTrace: subset.filter(r => r.scopeAssessment.local.pass).length }] })), failures: rows.filter(r => !r.semanticFields?.finiteMachineMatch || !r.scopeAssessment.local.pass).map(r => ({ group: r.group, name: r.name, fields: r.semanticFields, local: r.scopeAssessment.local.failures })) }
  await save(path.join(base, `evaluation/${track}/summary.json`), summary); return summary
}
if (import.meta.main) {
  const [command, a, b] = process.argv.slice(2)
  const result = command === "prepare" ? await prepare() : command === "reproduce" ? await reproduce() : command === "preflight" ? await preflight() : command === "run" ? await run(a!, b!) : command === "freeze" ? await freeze(a!) : command === "evaluate" ? await evaluate(a!, b!) : (() => { throw new Error("prepare|reproduce|preflight|run POSITION ATTEMPT|freeze ATTEMPT|evaluate FILE TRACK") })()
  console.log(JSON.stringify(result, null, 2))
}
