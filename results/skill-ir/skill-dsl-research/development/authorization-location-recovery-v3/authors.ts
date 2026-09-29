import { appendFile, readFile } from "node:fs/promises"
import path from "node:path"
import { createTelemetryProvider } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { normalizeAuthorizationAuthoringInput } from "../../../../../src/benchmarks/authorization-dsl/authoring.ts"
import { loadLocalAuthorizationInputValue } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { loadAuthoringEditorSchema } from "../../../../../src/benchmarks/authorization-dsl/editor-support/schema.ts"
import { AuthorizationEvidenceRequestSchema } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/schema.ts"
import { applyAuthorizationLocalEdit } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"
import { root, repo, json, save, hash, verifyStudy, exists, configureProvider, claim, journal, aggregateUsage } from "./common.ts"
const mode = process.argv[2]
if (!["run", "replay"].includes(mode ?? "")) throw new Error("Usage: authors.ts run|replay")
const plan = await verifyStudy(), briefs = await json(path.join(root, "author-briefs.json"))
const location = (u: any) => path.join(root, "author-packages", u.packageId, u.arm)
const normalizeText = (s: string) => s.replace(/[\s*_#>]/g, " ").trim().replace(/\s+/g, " ")
const parse = (s: string) => JSON.parse(s.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, ""))
async function checkDelivery(u: any, text: string): Promise<any> {
  const b = briefs.packages.find((p: any) => p.id === u.packageId), d: any[] = []
  const policy = u.variant === "changed" ? b.changedPolicy : b.originalPolicy
  if (u.arm === "markdown") {
    const normalized = normalizeText(text)
    for (const s of b.scenarios) {
      const premise = u.variant === "changed" && b.kind === "premise-change" ? s.changedPremise : s.premise
      if (!normalized.includes(normalizeText(premise))) d.push({ path: s.key + ".premise", message: "Preserve the exact public premise.", expected: premise })
      if (!text.includes(s.key)) d.push({ path: s.key, message: "Preserve this declared scenario key." })
    }
    if (!normalized.includes(normalizeText(policy))) d.push({ path: "policy", message: "Preserve the accepted public policy verbatim.", expected: policy })
    if (!text.includes(b.originalSourceRef) || !text.includes(b.entry.path)) d.push({ path: "source", message: "State the provided ref and entry path." })
    if (/observed (decision|outcome)\s*[:=]|source_refuted\s*[:=]|source_supported_failure\s*[:=]/i.test(text)) d.push({ path: "$", message: "Write assessment instructions without filled source answers." })
    return { valid: !d.length, diagnostics: d, value: text }
  }
  let delivered: any; try { delivered = parse(text) } catch (error) { return { valid: false, diagnostics: [{ path: "$", message: "Invalid JSON: " + String(error) }] } }
  let assessment: any, evidenceRequest: any, changedPaths: string[] = []
  if (u.variant === "original") {
    assessment = delivered.assessment; evidenceRequest = delivered.evidenceRequest
    if (Object.keys(delivered).sort().join(",") !== "assessment,evidenceRequest") d.push({ path: "$", message: "Return the requested assessment and evidenceRequest envelope only." })
  } else {
    const original = await json(path.join(location(u), "original.selected.json")), applied = applyAuthorizationLocalEdit(original.assessment, delivered)
    if (applied.status !== "ready") d.push(...applied.diagnostics)
    assessment = applied.value ?? applied.draft; evidenceRequest = original.evidenceRequest; changedPaths = applied.changedPaths
    if (b.kind === "premise-change" && changedPaths.some(p => !/^analysisContract\.scenarios\.[^.]+\.premises\.[^.]+\.statement$/.test(p))) d.push({ path: "$", message: "The task changes only the two declared premise statements." })
    if (b.kind === "policy-change" && changedPaths.some(p => !/^policies\.[^.]+\.(text|location|revision|reason)$/.test(p) && !/^scenarios\.[^.]+\.expectation$/.test(p))) d.push({ path: "$", message: "The task changes only policy metadata and linked expectations." })
  }
  if (!assessment) return { valid: false, diagnostics: [...d, { path: "assessment", message: "No complete declaration." }] }
  const n = normalizeAuthorizationAuthoringInput(assessment)
  if (n.status !== "ready") d.push(...n.diagnostics)
  const expectedRoot = path.relative(location(u), path.resolve(root, b.originalSourceRoot)).split(path.sep).join("/")
  if (assessment.taskId !== b.taskId || assessment.repository !== b.repository || assessment.sourceRef !== b.originalSourceRef || assessment.sourceRoot !== expectedRoot) d.push({ path: "sourceIdentity", message: "Use the supplied task/repository/ref and relative sourceRoot.", expectedRoot })
  if (JSON.stringify(Object.keys(assessment.entries ?? {}).sort()) !== JSON.stringify([b.entry.entryKey])) d.push({ path: "entries", message: "Only the declared handler is an analysis entry; support belongs in preparation." })
  if (JSON.stringify(assessment.entries?.[b.entry.entryKey]?.locations) !== JSON.stringify([{ path: b.entry.path, startLine: b.entry.startLine, endLine: b.entry.endLine }])) d.push({ path: "entries", message: "Keep the public entry coordinates." })
  if (JSON.stringify(Object.keys(assessment.scenarios ?? {}).sort()) !== JSON.stringify(b.scenarios.map((s: any) => s.key).sort())) d.push({ path: "scenarios", message: "Preserve both declared scenario keys." })
  for (const s of b.scenarios) {
    const actual = assessment.scenarios?.[s.key], expected = (u.variant === "changed" ? b.changedExpectations : b.originalExpectations)[s.key]
    if (actual?.relation !== s.relation || actual?.operation !== s.operation || actual?.expectation !== expected) d.push({ path: "scenarios." + s.key, message: "Preserve the public relation, operation and accepted-policy expectation.", expected })
    if (assessment.policies?.[actual?.policy]?.text !== policy) d.push({ path: "policies", message: "Use the exact public policy.", expected: policy })
    const premise = assessment.analysisContract?.scenarios?.[s.key]?.premises?.find((p: any) => p.id === s.premiseId)
    const expectedPremise = u.variant === "changed" && b.kind === "premise-change" ? s.changedPremise : s.premise
    if (premise?.statement !== expectedPremise || premise?.atEntry !== b.entry.entryKey) d.push({ path: "analysisContract.scenarios." + s.key + ".premises", message: "Preserve the public premise and boundary.", expected: expectedPremise })
    if (b.kind === "premise-change" && !["absent", "other-present"].every(id => assessment.analysisContract?.scenarios?.[s.key]?.requestedBranches?.some((v: any) => v.id === id))) d.push({ path: "analysisContract.scenarios." + s.key + ".requestedBranches", message: "Include both public requested counterfactuals: absent and other-present." })
  }
  const request = AuthorizationEvidenceRequestSchema.safeParse(evidenceRequest)
  if (!request.success) d.push({ path: "evidenceRequest", message: request.error.message })
  else if (evidenceRequest.schemaVersion !== "authorization-evidence-request/v2" || evidenceRequest.sourceRoot !== expectedRoot || JSON.stringify([...evidenceRequest.allowedFiles].sort()) !== JSON.stringify([...b.allowedFiles].sort()) || JSON.stringify(evidenceRequest.entries) !== JSON.stringify([b.entry]) || evidenceRequest.dependencies.length) d.push({ path: "evidenceRequest", message: "Use the public v2 entry seed, exact allowlist and empty authored dependencies." })
  if (!d.length) { const checked = await loadLocalAuthorizationInputValue(assessment, path.join(location(u), "original.assessment.json")); if (checked.status !== "valid") d.push(...checked.diagnostics) }
  return { valid: !d.length, diagnostics: d, value: { assessment, evidenceRequest }, delivered, changedPaths }
}
if (mode === "run") {
  let failures = 0
  for (const unit of plan.authors) {
    const dir = location(unit), job = path.join(dir, unit.variant)
    if (await exists(path.join(job, "claim.json"))) continue
    const b = briefs.packages.find((p: any) => p.id === unit.packageId), original = path.join(dir, "original.selected.json")
    if (unit.variant === "changed" && !await exists(original)) {
      await claim(job, unit); await save(path.join(job, "delivery.json"), { unit, status: "author-dependency-blocked", firstValid: false, finalValid: false, calls: 0 }, true); continue
    }
    const provider = configureProvider(plan.model)
    if (!await claim(job, unit)) continue
    const sourceRoot = path.relative(dir, path.resolve(root, b.originalSourceRoot)).split(path.sep).join("/")
    const publicBrief = { ...b, sourceRoot, requestedCounterfactuals: b.kind === "premise-change" ? ["absent", "other-present"] : [] }
    const ordinary = unit.arm === "dsl" ? "\nOrdinary authoring-v2 init template:\n" + await readFile(path.join(root, "ordinary-author-template.json"), "utf8") + "\nOrdinary local schema:\n" + JSON.stringify(loadAuthoringEditorSchema()) + "\nOrdinary entry-seed example:\n" + await readFile(path.join(repo, "examples/authorization-assessment/evidence-editing/entry-seed-v2.json"), "utf8") + "\nOrdinary edit example:\n" + await readFile(path.join(repo, "examples/authorization-assessment/evidence-editing/policy-change.json"), "utf8") : ""
    const base = unit.variant === "changed" ? "\nPrevious authored instructions:\n" + (unit.arm === "dsl" ? JSON.stringify((await json(original)).assessment) : await readFile(path.join(dir, "original.selected.md"), "utf8")) : ""
    const outputRule = unit.arm === "markdown" ? "Return only reusable Markdown assessment instructions, retaining public policy, premises, scenario keys and requested counterfactuals." : unit.variant === "original" ? "Return only JSON {assessment,evidenceRequest}. Author assessment with the ordinary named v2 interface and evidenceRequest with the public entry, allowedFiles and empty dependencies. Include analysisContract for the public premises and requested counterfactuals." : "Return only an ordinary authorization-local-edit/v1 JSON request implementing the public changeRequest."
    const prompt = "Act as an independent ordinary task author. Write inputs for a later source-visible assessment. Do not answer the authorization scenarios or invent domain facts. Only ordinary init/schema/check/edit guidance is available.\nPublic task brief:\n" + JSON.stringify(publicBrief) + "\nVariant: " + unit.variant + "\n" + outputRule + ordinary + base
    await save(path.join(job, "prompt.json"), { model: plan.model, prompt, sha256: hash(prompt) }, true)
    console.log(JSON.stringify({ id: unit.id, action: "author-start" }))
    async function attempt(kind: string, content: string) {
      const telemetry = createTelemetryProvider(provider, { perCallTimeoutMs: 300000, unitTimeoutMs: 900000, maxDispatches: 1, onEvent: event => appendFile(path.join(job, kind + ".events.jsonl"), JSON.stringify(event) + "\n") })
      let checked: any
      try {
        const response = await telemetry.provider.complete({ messages: [{ role: "user", content }], system: "Author ordinary instructions only; no source execution or completed analysis.", temperature: 0, maxTokens: 6000 })
        checked = await checkDelivery(unit, response.text)
        await save(path.join(job, kind + ".json"), { response, checked, promptSha256: hash(content), promptCharacters: content.length }, true)
      } catch (error) { checked = { valid: false, diagnostics: [{ path: "$", message: String(error) }], infrastructureFailure: true }; await save(path.join(job, kind + ".failure.json"), checked, true) }
      await telemetry.close("author-delivery-retained")
      await save(path.join(job, kind + ".account.json"), { ...telemetry.summary(), knownDurationMs: telemetry.attempts.reduce((n, a) => n + (a.response?.durationMs ?? 0), 0), attempts: telemetry.attempts }, true)
      return checked
    }
    const first = await attempt("first", prompt); let final = first
    if (!first.valid && !first.infrastructureFailure) {
      const previous = await json(path.join(job, "first.json"))
      const repairPrompt = "Diagnostics-only revision. Correct this same authored input; preserve its domain task and do not add an answer.\nPrevious response:\n" + previous.response.text + "\nOrdinary/public-input diagnostics:\n" + JSON.stringify(first.diagnostics) + "\nOrdinary shared schema guidance:\n" + ordinary
      await save(path.join(job, "revision-prompt.json"), { prompt: repairPrompt, sha256: hash(repairPrompt) }, true)
      final = await attempt("revision", repairPrompt)
    }
    if (final.valid) {
      if (unit.arm === "dsl") { await save(path.join(dir, unit.variant + ".selected.json"), final.value, true); if (unit.variant === "changed") await save(path.join(dir, "changed.edit.json"), final.delivered, true) }
      else { await save(path.join(dir, unit.variant + ".selected.json"), { valid: true }, true); await Bun.write(path.join(dir, unit.variant + ".selected.md"), final.value) }
    }
    await save(path.join(job, "delivery.json"), { unit, status: final.valid ? "valid" : "invalid", firstValid: first.valid, finalValid: final.valid, diagnostics: final.diagnostics, changedPaths: final.changedPaths ?? [] }, true)
    await journal("AL11-author", { id: unit.id, firstValid: first.valid, finalValid: final.valid })
    console.log(JSON.stringify({ id: unit.id, firstValid: first.valid, finalValid: final.valid }))
    failures = final.infrastructureFailure ? failures + 1 : 0; if (failures >= 2) break
  }
} else {
  const rows = [], accounts = []
  for (const unit of plan.authors) {
    const dir = path.join(location(unit), unit.variant), record = path.join(dir, "delivery.json")
    const delivery = await exists(record) ? await json(record) : { status: await exists(path.join(dir, "claim.json")) ? "completion-unknown" : "not-dispatched" }
    for (const kind of ["first", "revision"]) if (await exists(path.join(dir, kind + ".account.json"))) accounts.push({ id: unit.id, kind, ...await json(path.join(dir, kind + ".account.json")) })
    rows.push({ ...unit, ...delivery })
  }
  const summary = { schemaVersion: "authorization-al-authors/v1", planned: 8, firstValid: rows.filter(r => r.firstValid).length, finalValid: rows.filter(r => r.finalValid).length, revisionCalls: accounts.filter(a => a.kind === "revision").length, rows, usage: aggregateUsage(accounts), accounts, providerCallsThisCommand: 0 }
  await save(path.join(root, "author-summary.json"), summary); console.log(JSON.stringify({ planned: 8, firstValid: summary.firstValid, finalValid: summary.finalValid, revisionCalls: summary.revisionCalls, usage: summary.usage }))
}
