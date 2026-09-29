import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { normalizeAuthorizationAuthoringInput } from "../../../../../src/benchmarks/authorization-dsl/authoring.ts"
import { renderAuthoringTask, authorizationAuthoringFieldGuide, type AuthorizationAuthoringTask } from "../../../../../src/benchmarks/authorization-dsl/authoring-assist.ts"
import { applyAuthorizationLocalEdit } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { createTelemetryProvider } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { executeLocalAuthorizationRun } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { root, repo, al, absolute, cli, claim, configureProvider, exists, hash, json, journal, save, sessionAccount, aggregateUsage, verifyStudy, proposalAccount, retainPaid, paidPaused, provider } from "./common.ts"

const mode = process.argv[2]
if (!['setup', 'prepare', 'run', 'consume', 'replay'].includes(mode ?? '')) throw new Error('Usage: authors.ts setup|prepare|run|consume|replay')
const plan = await verifyStudy(mode !== "setup"), briefs = await json(absolute(plan.authorBriefs))
const armDir = (u: any) => path.join(root, "authors", u.packageId, u.arm)
const jobDir = (u: any) => path.join(armDir(u), u.variant)
const publicInstruction = "Use the current declared policy and explicit premises. Trace decisive control and effect, distinguish unspecified from absent, and answer requested branches without inventing runtime facts."
const responseDetail = "Report source behavior and policy comparison separately; source-external store failure is not authorization."
function scaffold(b: any, sourceRoot: string, variant = "original") {
  const changed = variant === "changed", expectations = changed ? b.changedExpectations : b.originalExpectations
  return { schemaVersion: "authorization-assessment-authoring/v2", taskId: b.taskId, request: b.question,
    repository: b.repository, sourceRef: b.originalSourceRef, sourceRoot, sources: [b.entry.path],
    policies: { rule: { text: changed ? b.changedPolicy : b.originalPolicy, location: changed ? b.policyLocationChanged : b.policyLocationOriginal, revision: b.id + "-" + variant, acceptance: "accepted", reason: "Explicit public task requirement; assess the current declared policy." } },
    principals: { caller: { role: b.scenarios[0].principal } }, resources: { target: { type: b.kind === "policy-change" ? "space membership" : "document" } },
    entries: { [b.entry.entryKey]: { name: b.entry.entryKey, locations: [{ path: b.entry.path, startLine: b.entry.startLine, endLine: b.entry.endLine }] } },
    scenarios: Object.fromEntries(b.scenarios.map((s: any) => [s.key, { principal: "caller", resource: "target", policy: "rule", entries: [b.entry.entryKey], relation: s.relation, operation: s.operation, expectation: expectations[s.key],
      ...(b.kind === "premise-change" ? { conditions: { "owner-present": { basis: "Whether a different owner is present; caller is not owner." } } } : {}) }])),
    analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction,
      scenarios: Object.fromEntries(b.scenarios.map((s: any) => [s.key, { boundary: "declared-entry", premises: [{ id: s.premiseId, statement: changed && s.changedPremise ? s.changedPremise : s.premise, atEntry: b.entry.entryKey, provenance: "task-assumption" }],
        requestedBranches: b.kind === "premise-change" ? [{ id: "absent", kind: "counterfactual", assumptions: [{ condition: "owner-present", value: false }] }, { id: "other-present", kind: "counterfactual", assumptions: [{ condition: "owner-present", value: true }] }] : [], requiredResponseDetails: [responseDetail] }])) } }
}
function publicDiagnostics(unit: any, b: any, value: any, expected: any) {
  const diagnostics: any[] = [], add = (field: string, message: string) => diagnostics.push({ path: field, message })
  for (const field of ["taskId", "request", "repository", "sourceRef", "sourceRoot", "sources", "entries"]) if (JSON.stringify(value[field]) !== JSON.stringify(expected[field])) add(field, "Preserve the supplied known metadata and single requested entry exactly.")
  for (const field of ["policies", "principals", "resources", "scenarios"]) if (JSON.stringify(Object.keys(value[field] ?? {}).sort()) !== JSON.stringify(Object.keys(expected[field]).sort())) add(field, "Keep only the public named keys; no extra analysis obligation.")
  if (value.policies?.rule?.text !== expected.policies.rule.text || value.policies?.rule?.acceptance !== "accepted") add("policies.rule", "Copy the explicitly accepted current public policy.")
  for (const s of b.scenarios) {
    const actual = value.scenarios?.[s.key], e = expected.scenarios[s.key]
    for (const field of ["principal", "resource", "policy", "entries", "relation", "operation", "expectation"]) if (JSON.stringify(actual?.[field]) !== JSON.stringify(e[field])) add(`scenarios.${s.key}.${field}`, "Preserve the public scenario facts and current expectation.")
    const contract = value.analysisContract?.scenarios?.[s.key], ex = expected.analysisContract.scenarios[s.key]
    if (!contract || contract.boundary !== "declared-entry" || JSON.stringify(contract.premises) !== JSON.stringify(ex.premises)) add(`analysisContract.scenarios.${s.key}.premises`, "Copy the exact current public premise at the declared entry.")
    if (b.kind === "premise-change" && JSON.stringify(contract?.requestedBranches) !== JSON.stringify(ex.requestedBranches)) add(`analysisContract.scenarios.${s.key}.requestedBranches`, "Keep the two requested absent/other-present counterfactuals and their owner-present condition values.")
  }
  return diagnostics
}
async function checkDelivery(unit: any, b: any, text: string) {
  const dir = armDir(unit), changed = unit.variant === "changed", original = path.join(dir, "original.selected.json")
  if (unit.arm === "markdown") {
    const normalize = (s: string) => s.replace(/[`*_#]/g, "").replace(/\s+/g, " ").trim()
    const n = normalize(text), required = [b.taskId, b.originalSourceRef, b.entry.path, changed ? b.changedPolicy : b.originalPolicy,
      ...b.scenarios.flatMap((s: any) => [s.key, s.relation, s.operation, changed && s.changedPremise ? s.changedPremise : s.premise]), ...(b.kind === "premise-change" ? ["absent", "other-present"] : [])]
    const diagnostics = required.filter(s => !n.includes(normalize(s))).map(s => ({ path: "markdown", message: "Retain this exact public fact: " + s }))
    if (/observedBehavior|canonical result|source_supported_failure|source_refuted/.test(text)) diagnostics.push({ path: "markdown", message: "Deliver reusable task instructions, not a completed source analysis." })
    return { valid: !diagnostics.length, diagnostics, value: text }
  }
  let delivered: any
  try { delivered = JSON.parse(text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, "")) }
  catch (e) { return { valid: false, diagnostics: [{ path: "$", message: String(e) }] } }
  let value = delivered, changedPaths: string[] = [], suppliedPaths: string[] = []
  if (changed) {
    const base = await json(original), edited = applyAuthorizationLocalEdit(base, delivered)
    if (edited.status !== "ready") return { valid: false, diagnostics: edited.diagnostics, delivered }
    const allowed = b.kind === "policy-change" ? edited.suppliedPaths.every(p => p.startsWith("policies.rule.") || /^scenarios\.(self-leave|other-member)\.expectation$/.test(p) || p === "analysisContract.publicInstruction" || /^analysisContract\.scenarios\.(self-leave|other-member)\.requiredResponseDetails\.\d+$/.test(p)) : edited.suppliedPaths.every(p => /^analysisContract\.scenarios\.(view-only|change-granted)\.premises\.object-relation\.statement$/.test(p))
    if (!allowed) return { valid: false, diagnostics: [{ path: "operations", message: "Edit exceeds the public change scope." }], delivered }
    value = edited.value; changedPaths = edited.changedPaths; suppliedPaths = edited.suppliedPaths
  }
  const known = await json(path.join(dir, "known.draft.json")), expected = scaffold(b, known.sourceRoot, unit.variant)
  const normalized = normalizeAuthorizationAuthoringInput(value)
  const diagnostics = normalized.status === "ready" ? publicDiagnostics(unit, b, value, expected) : normalized.diagnostics
  return { valid: !diagnostics.length && normalized.status === "ready", diagnostics, value, delivered, changedPaths, suppliedPaths }
}

if (mode === "setup") {
  for (const b of briefs.packages) {
    const shared = path.join(root, "author-material", b.id); await mkdir(shared, { recursive: true })
    const source = path.resolve(al, b.originalSourceRoot), sourceRoot = path.relative(shared, source).split(path.sep).join("/")
    const seed = { schemaVersion: "authorization-evidence-request/v2", sourceRoot, allowedFiles: b.allowedFiles, entries: [b.entry], dependencies: [], limits: { maxFiles: 12, maxBytes: 65536, maxDepth: 3 } }
    await save(path.join(shared, "source-input.json"), scaffold(b, sourceRoot), true); await save(path.join(shared, "entry-seed.json"), seed, true)
    const loaded = await loadLocalAuthorizationInput(path.join(shared, "source-input.json")); if (loaded.status !== "valid") throw new Error("Public scaffold invalid " + b.id + JSON.stringify(loaded.diagnostics))
    for (const arm of ["markdown", "dsl"]) {
      const dir = armDir({ packageId: b.id, arm }); await mkdir(dir, { recursive: true })
      const context = { schemaVersion: "authorization-authoring-context/v1", taskId: b.taskId, request: b.question, repository: b.repository, sourceRef: b.originalSourceRef,
        sourceRoot: path.relative(dir, source).split(path.sep).join("/"), allowedFiles: b.allowedFiles, entries: [b.entry] }
      await save(path.join(dir, "context.json"), context, true)
      const init = await cli(["init", "--context=" + path.join(dir, "context.json"), "--out=" + path.join(dir, "known.draft.json")])
      if (init.exitCode || init.report?.draftStatus !== "needs-input") throw new Error("Ordinary init context failed " + JSON.stringify(init))
      await save(path.join(dir, "init-report.json"), init, true)
      const lines = (await readFile(path.join(source, b.entry.path), "utf8")).split(/\r?\n/)
      await save(path.join(dir, "known-fields.json"), { context, draft: await json(path.join(dir, "known.draft.json")), sourceEntry: lines.slice(b.entry.startLine - 1, b.entry.endLine).map((line, i) => `${b.entry.startLine + i}: ${line}`).join("\n"), domainFieldsAutomated: 0, hostOperations: ["init --context", "entry seed generated", "source bytes read"] }, true)
    }
  }
  console.log(JSON.stringify({ packages: 2, initDrafts: 4, providerCalls: 0, automatedDomainFacts: 0 }))
} else if (mode === "prepare") {
  for (const b of briefs.packages) {
    const dir = path.join(root, "author-material", b.id), job = path.join(dir, "preparation-job"), out = path.join(dir, "prepared")
    if (await exists(path.join(job, "claim.json"))) continue
    if (await paidPaused()) break
    configureProvider(); await claim(job, { packageId: b.id, sharedBy: 4 }); console.log(JSON.stringify({ packageId: b.id, action: "shared-author-prepare" }))
    const result = await cli(["prepare", "--input=" + path.join(dir, "source-input.json"), "--request=" + path.join(dir, "entry-seed.json"), "--out=" + out, "--context=callable-v1", "--discover=true", "--proposal-model=" + plan.model, "--proposal-timeout-ms=300000"], true)
    await save(path.join(job, "job.json"), result, true); const account = await proposalAccount(result.report)
    await retainPaid("author-prepare:" + b.id, result.report?.status ?? "failed", account, ["provider-error", "timeout-unknown"].includes(account.status))
    console.log(JSON.stringify({ packageId: b.id, status: result.report?.status, calls: account.providerCalls, bytes: result.report?.totalBytes, gaps: result.report?.gaps?.length }))
  }
} else if (mode === "run") {
  for (const unit of plan.authors) {
    const dir = armDir(unit), job = jobDir(unit), original = path.join(dir, "original.selected.json")
    if (await exists(path.join(job, "claim.json"))) continue
    if (await paidPaused()) break
    await claim(job, unit)
    if (unit.variant === "changed" && !await exists(original)) { await save(path.join(job, "delivery.json"), { unit, status: "author-dependency-blocked", firstValid: false, finalValid: false }, true); continue }
    const b = briefs.packages.find((p: any) => p.id === unit.packageId), known = await json(path.join(dir, "known-fields.json"))
    const editScope = unit.variant === "original" ? "Fill only unknown domain dictionaries and analysisContract with the explicit public facts. Keep named keys rule/caller/target, both supplied scenario keys and the single supplied entry. Copy policies and premises verbatim; do not infer source outcomes or add obligations." : b.kind === "policy-change" ? b.changeRequest + " You may additionally update policy reason/location/revision and existing publicInstruction/requiredResponseDetails to refer consistently to the current changed policy. Explicitly review both expectations." : b.changeRequest
    const task: AuthorizationAuthoringTask = { publicBrief: JSON.stringify({ ...b, sourceRoot: known.context.sourceRoot, variant: unit.variant, requestedCounterfactuals: b.kind === "premise-change" ? ["absent", "other-present"] : [] }),
      outputContract: unit.arm === "markdown" ? "Return only reusable Markdown task instructions. Copy current public policy, all premise statements, keys, relations and operations verbatim. Retain source identity/entry and current expectations, distinguish original from changed, and retain requested counterfactuals. No completed analysis." : unit.variant === "original" ? "Return only a complete authorization-assessment-authoring/v2 JSON declaration; no assessment/evidenceRequest envelope. Keep supplied known fields. Host owns the entry seed. Include analysisContract with exact public premises and requested branches; use rule/caller/target keys. No completed analysis." : "Return only an authorization-local-edit/v1 JSON request {schemaVersion,reason,operations} for the public change scope. No full replacement, evidenceRequest, or completed analysis.",
      editScope, knownFields: known,
      fieldGuide: unit.arm === "dsl" ? authorizationAuthoringFieldGuide : "Write reusable Markdown with the same public facts and two scenario obligations. If an owner fact is unspecified, retain both requested counterfactuals. Source helpers are support, not extra entries." }
    if (unit.variant === "changed") task.publicBrief += "\nPrevious authored input:\n" + (unit.arm === "dsl" ? JSON.stringify(await json(original)) : await readFile(path.join(dir, "original.selected.md"), "utf8"))
    const firstPrompt = renderAuthoringTask(task); await save(path.join(job, "task.json"), task, true); await save(path.join(job, "first.prompt.json"), { prompt: firstPrompt, sha256: hash(firstPrompt) }, true)
    const activeProvider = await provider(plan.model)
    console.log(JSON.stringify({ id: unit.id, action: "author-start" }))
    async function attempt(kind: string, content: string) {
      const telemetry = createTelemetryProvider(activeProvider, { perCallTimeoutMs: 300000, unitTimeoutMs: 900000, maxDispatches: 1, onEvent: e => appendFile(path.join(job, kind + ".events.jsonl"), JSON.stringify(e) + "\n") })
      let checked: any, responseText = ""
      try {
        const response = await telemetry.provider.complete({ messages: [{ role: "user", content }], system: "Author ordinary inputs only. No source execution or completed analysis.", temperature: 0, maxTokens: 6000 })
        responseText = response.text
        // Retain response and usage before parsing/diagnostics, including malformed JSON.
        await save(path.join(job, kind + ".response.json"), response, true)
        checked = await checkDelivery(unit, b, response.text)
        await save(path.join(job, kind + ".checked.json"), checked, true)
      } catch (error) { checked = { valid: false, infrastructureFailure: true, diagnostics: [{ path: "$", message: String(error) }] }; await save(path.join(job, kind + ".failure.json"), checked, true) }
      await telemetry.close("author-delivery-retained")
      const account = { ...telemetry.summary(), attempts: telemetry.attempts, knownDurationMs: telemetry.attempts.reduce((n, a) => n + (a.response?.durationMs ?? 0), 0) }
      await save(path.join(job, kind + ".account.json"), account, true)
      await retainPaid("author:" + unit.id + ":" + kind, checked.valid ? "valid" : checked.infrastructureFailure ? "infrastructure-failed" : "invalid", account, !!checked.infrastructureFailure)
      return { checked, responseText }
    }
    const first = await attempt("first", firstPrompt); let final = first
    if (!first.checked.valid && !first.checked.infrastructureFailure && !await paidPaused()) {
      const revisionPrompt = renderAuthoringTask(task, { candidate: first.responseText, diagnostics: first.checked.diagnostics })
      await save(path.join(job, "revision.prompt.json"), { prompt: revisionPrompt, sha256: hash(revisionPrompt) }, true); final = await attempt("revision", revisionPrompt)
    }
    if (final.checked.valid) {
      if (unit.arm === "dsl") { await save(path.join(dir, unit.variant + ".selected.json"), final.checked.value, true); if (unit.variant === "changed") await save(path.join(dir, "changed.edit.json"), final.checked.delivered, true) }
      else { await save(path.join(dir, unit.variant + ".selected.json"), { valid: true }, true); await Bun.write(path.join(dir, unit.variant + ".selected.md"), final.checked.value) }
    }
    await save(path.join(job, "delivery.json"), { unit, status: final.checked.valid ? "valid" : "invalid", firstValid: first.checked.valid, finalValid: final.checked.valid, diagnostics: final.checked.diagnostics, changedPaths: final.checked.changedPaths ?? [], suppliedPaths: final.checked.suppliedPaths ?? [], calls: first === final ? 1 : 2 }, true)
    await journal("AM11-author", { id: unit.id, firstValid: first.checked.valid, finalValid: final.checked.valid })
    console.log(JSON.stringify({ id: unit.id, firstValid: first.checked.valid, finalValid: final.checked.valid }))
  }
} else if (mode === "consume") {
  for (const unit of plan.consumers) {
    const dir = path.join(root, "consumers", unit.id), authored = armDir(unit), deliveryFile = path.join(jobDir(unit), "delivery.json"), sharedInput = path.join(root, "author-material", unit.packageId, "prepared", "assessment.json")
    if (await exists(path.join(dir, "claim.json"))) continue
    if (await paidPaused()) break
    await claim(dir, unit)
    if (!await exists(deliveryFile) || !(await json(deliveryFile)).finalValid || !await exists(sharedInput)) { await save(path.join(dir, "report.json"), { unit, status: "author-or-preparation-blocked" }, true); await save(path.join(dir, "account.json"), { providerCalls: 0 }, true); continue }
    const b = briefs.packages.find((p: any) => p.id === unit.packageId); let inputFile: string
    if (unit.arm === "dsl") {
      if (unit.variant === "changed") {
        const edit = await cli(["edit", "--input=" + path.join(authored, "original.selected.json"), "--edit=" + path.join(authored, "changed.edit.json"), "--out=" + path.join(dir, "edited")])
        await save(path.join(dir, "edit.json"), edit, true); if (edit.exitCode) throw new Error("Ordinary edit failed " + unit.id + JSON.stringify(edit)); inputFile = edit.report.inputPath
      } else inputFile = path.join(authored, "original.selected.json")
    } else {
      inputFile = path.join(dir, "source-input.json")
      await save(inputFile, scaffold(b, path.relative(dir, path.resolve(al, b.originalSourceRoot)).split(path.sep).join("/"), unit.variant), true)
      await save(path.join(dir, "host-scaffold.json"), { domainFactsFrom: plan.authorBriefs, publicFactsOnly: true, authoredMarkdown: path.join(authored, unit.variant + ".selected.md"), hostFields: ["all canonical structure", "public policy/premises/expectations from explicit brief"], independentAuthorFields: ["reusable Markdown task instructions"], notCountedAsAuthorAutomation: true }, true)
    }
    const reuse = await cli(["prepare", "--input=" + inputFile, "--reuse=" + sharedInput, "--out=" + path.join(dir, "material")])
    await save(path.join(dir, "reuse-command.json"), reuse, true)
    if (reuse.exitCode) throw new Error("Ordinary material reuse failed " + unit.id + JSON.stringify(reuse))
    const actualReport = await json(path.join(dir, "material", "report.json")), sharedReport = await json(path.join(path.dirname(sharedInput), "report.json"))
    if (JSON.stringify(actualReport.gaps) !== JSON.stringify(sharedReport.gaps) || JSON.stringify(actualReport.included) !== JSON.stringify(sharedReport.included)) throw new Error("Source/gap inheritance changed " + unit.id)
    configureProvider(); const execution = { inputFile: reuse.report.inputPath, model: plan.model, outRoot: dir, ...plan.analysis, executionOptions: plan.executionOptions }
    console.log(JSON.stringify({ id: unit.id, action: "consumer-start", gaps: actualReport.gaps.length }))
    const report = unit.arm === "markdown" ? await executeMarkdownStudyRun({ ...execution, markdown: { instructions: await readFile(path.join(authored, unit.variant + ".selected.md"), "utf8"), instructionOrigin: "independent-am-author", instructionPath: path.relative(repo, path.join(authored, unit.variant + ".selected.md")).split(path.sep).join("/") } }) : await executeLocalAuthorizationRun(execution)
    const account = await sessionAccount(dir, report)
    await save(path.join(dir, "report.json"), { unit, ...report }, true); await save(path.join(dir, "account.json"), account, true)
    await retainPaid("consumer:" + unit.id, report.status, account, ["provider-error", "transport-failed", "timeout-unknown"].includes(report.status))
    if (unit.variant === "changed") {
      const originalDir = path.join(root, "consumers", unit.id.replace(/changed$/, "original")), old = await json(path.join(originalDir, "report.json"))
      if (old.sessionId) { const compare = await cli(["compare", "--input=" + reuse.report.inputPath, "--out=" + path.join(originalDir, "sessions", old.sessionId)]); await save(path.join(dir, "compare.json"), compare, true) }
    }
    await journal("AM11-consumer", { id: unit.id, status: report.status, calls: account.providerCalls, preservedPendingGaps: actualReport.gaps.length })
    console.log(JSON.stringify({ id: unit.id, status: report.status, calls: account.providerCalls }))
  }
} else {
  const rows = [], accounts = [], consumers = []
  for (const unit of plan.authors) {
    const dir = jobDir(unit), file = path.join(dir, "delivery.json")
    rows.push({ ...unit, ...(await exists(file) ? await json(file) : { status: "blocked-or-not-dispatched", firstValid: false, finalValid: false }) })
    for (const kind of ["first", "revision"]) if (await exists(path.join(dir, kind + ".account.json"))) accounts.push({ id: unit.id, kind, ...await json(path.join(dir, kind + ".account.json")) })
    const use = path.join(root, "consumers", unit.id), report = path.join(use, "report.json")
    consumers.push({ ...unit, ...(await exists(report) ? { report: await json(report), account: await json(path.join(use, "account.json")) } : { report: { status: "blocked-or-not-dispatched" } }) })
  }
  const result = { schemaVersion: "authorization-am-author-use/v1", authorsPlanned: 8, firstValid: rows.filter(r => r.firstValid).length, finalValid: rows.filter(r => r.finalValid).length,
    consumersPlanned: 8, obligationsPlanned: 16, rows, consumers, authorUsage: aggregateUsage(accounts), consumerUsage: aggregateUsage(consumers.flatMap(c => c.account ? [c.account] : [])), authorAccounts: accounts, providerCallsThisCommand: 0, humanMinutes: null }
  await save(path.join(root, "author-use-summary.json"), result)
  console.log(JSON.stringify({ firstValid: result.firstValid, finalValid: result.finalValid, consumerCompleted: consumers.filter(c => c.report.status === "completed").length, authorUsage: result.authorUsage, consumerUsage: result.consumerUsage, providerCallsThisCommand: 0 }))
}
