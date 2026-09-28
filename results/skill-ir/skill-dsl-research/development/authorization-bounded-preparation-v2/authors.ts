import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"
import { createTelemetryProvider } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { loadLocalAuthorizationInputValue } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { normalizeAuthorizationAuthoringInput } from "../../../../../src/benchmarks/authorization-dsl/authoring.ts"
import { AuthorizationEvidenceRequestSchema } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/schema.ts"
import { applyAuthorizationLocalEdit } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"
import { checkEditorStructure, loadAuthoringEditorSchema } from "../../../../../src/benchmarks/authorization-dsl/editor-support/schema.ts"
import { root, repo, json, save, hash, verify, exists, journal, aggregateUsage } from "./common.ts"

const mode = process.argv[2]
if (!["original", "changed", "inspect", "repair", "repair-diagnostics", "replay"].includes(mode ?? "")) throw new Error("Usage: bun authors.ts original|changed|inspect|repair|repair-diagnostics|replay [--count=1..4]")
const plan = await json(path.join(root, "study-plan.json")), briefs = await json(path.join(root, "author-briefs.json"))
await verify([plan.authorBriefs, ...plan.authorSources])
process.env.SKVM_AUTO_PROBE = "0"; process.env.SKVM_CACHE = path.join(repo, ".skvm")
const location = (u: any) => path.join(root, "author-packages", u.packageId, u.representation)
const expectedRoot = (u: any, b: any) => path.relative(location(u), path.resolve(root, u.phase === "changed" ? b.changedSourceRoot : b.originalSourceRoot)).replaceAll("\\", "/")
const parse = (text: string) => JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))
const normalizeText = (text: string) => text.replace(/[\s*_`#>]+/g, " ").trim()

async function evaluateDelivery(unit: any, response: string): Promise<{ valid: boolean; diagnostics: string[]; value?: any; changedPaths?: string[]; sourceUpdate?: any }> {
  const b = briefs.packages.find((p: any) => p.id === unit.packageId), diagnostics: string[] = []
  const ref = unit.phase === "changed" ? b.changedSourceRef : b.originalSourceRef
  const policy = unit.phase === "changed" ? b.changedPolicy : b.originalPolicy
  if (unit.representation === "markdown") {
    const text = normalizeText(response)
    for (const s of b.scenarios) {
      if (!text.includes(s.key) || !text.includes(normalizeText(s.premise))) diagnostics.push(`Preserve ${s.key} and its exact task premise.`)
    }
    if (!text.includes(normalizeText(policy))) diagnostics.push("Retain the supplied accepted policy verbatim; it is a task requirement, independent of source behavior.")
    if (!response.includes(ref)) diagnostics.push(`State the supplied sourceRef ${ref}.`)
    if (!response.includes(b.entry.path)) diagnostics.push(`State the requested analysis entry file ${b.entry.path}.`)
    if (/observed (?:decision|outcome)\s*[:=]\s*(?:allow|deny)|source_refuted\s*[:=]|source_supported_failure\s*[:=]/i.test(response)) diagnostics.push("Author instructions, without source conclusions or filled analysis answers.")
    return { valid: !diagnostics.length, diagnostics, value: response }
  }
  let delivered: any
  try { delivered = parse(response) } catch (error) { return { valid: false, diagnostics: [`Invalid JSON: ${String(error)}`] } }
  let assessment: any, request: any, changedPaths: string[] = [], sourceUpdate: any
  if (unit.phase === "original") {
    if (Object.keys(delivered).sort().join(",") !== "assessment,evidenceRequest") diagnostics.push("Return only assessment and evidenceRequest.")
    assessment = delivered.assessment; request = delivered.evidenceRequest
  } else {
    const original = await json(path.join(location(unit), "original.selected.json"))
    if (b.kind === "policy-change") {
      const applied = applyAuthorizationLocalEdit(original.assessment, delivered)
      if (applied.status !== "ready") diagnostics.push(...applied.diagnostics.map(d => `${d.path}: ${d.message}`))
      assessment = applied.value ?? applied.draft; request = original.evidenceRequest; changedPaths = applied.changedPaths
    } else {
      if (Object.keys(delivered).sort().join(",") !== "reason,sourceUpdate" || !delivered.sourceUpdate || Object.keys(delivered.sourceUpdate).sort().join(",") !== "sourceRef,sourceRoot") diagnostics.push("For this source-only change, return only reason and sourceUpdate {sourceRoot,sourceRef}; source identity is outside local-edit/v1.")
      sourceUpdate = delivered.sourceUpdate
      assessment = { ...original.assessment, ...sourceUpdate }
      request = { ...original.evidenceRequest, sourceRoot: sourceUpdate?.sourceRoot }
      changedPaths = ["sourceRoot", "sourceRef"]
    }
  }
  if (!assessment) return { valid: false, diagnostics: [...diagnostics, "No complete assessment after applying the author delivery."] }
  const structure = checkEditorStructure(assessment)
  if (!structure.valid) diagnostics.push(...structure.diagnostics.map(d => `${d.path}: ${d.message}`))
  const lowered = normalizeAuthorizationAuthoringInput(assessment)
  if (lowered.status !== "ready") diagnostics.push(...lowered.diagnostics.map(d => `${d.path}: ${d.message}`))
  if (assessment.taskId !== b.taskId || assessment.repository !== b.repository || assessment.sourceRef !== ref || assessment.sourceRoot !== expectedRoot(unit, b)) diagnostics.push("Use the supplied task/repository/ref and exact relative sourceRoot.")
  if (JSON.stringify(Object.keys(assessment.entries ?? {}).sort()) !== JSON.stringify([b.entry.entryKey])) diagnostics.push("Only the requested handler belongs in analysis entries; helpers are support.")
  if (JSON.stringify(assessment.entries?.[b.entry.entryKey]?.locations) !== JSON.stringify([{ path: b.entry.path, startLine: b.entry.startLine, endLine: b.entry.endLine }])) diagnostics.push("Preserve the declared original entry coordinates.")
  if (JSON.stringify(Object.keys(assessment.scenarios ?? {}).sort()) !== JSON.stringify(b.scenarios.map((s: any) => s.key).sort())) diagnostics.push("Preserve the two scenario keys.")
  const expected = unit.phase === "changed" ? b.changedExpectations : b.originalExpectations
  for (const s of b.scenarios) {
    const actual = assessment.scenarios?.[s.key]
    if (actual?.relation !== s.relation || actual?.operation !== s.operation || actual?.expectation !== expected[s.key] || JSON.stringify(actual?.entries) !== JSON.stringify([b.entry.entryKey])) diagnostics.push(`${s.key}: retain relation/operation/entry and review the accepted-policy expectation.`)
    const premise = assessment.analysisContract?.scenarios?.[s.key]?.premises?.find((p: any) => p.id === s.premiseId)
    if (premise?.statement !== s.premise || premise?.atEntry !== b.entry.entryKey) diagnostics.push(`${s.key}: retain its exact premise at the declared entry.`)
  }
  const accepted = assessment.policies?.["accepted-policy"], expectedPolicyLocation = unit.phase === "changed" ? b.policyLocationChanged : b.policyLocationOriginal
  if (accepted?.text !== policy || accepted?.location !== expectedPolicyLocation || accepted?.revision !== (unit.phase === "changed" && b.kind === "policy-change" ? "changed-v1" : "original-v1")) diagnostics.push("Update the author-brief policy text/location/revision consistently; unchanged policy keeps its actual original source.")
  const parsedRequest = AuthorizationEvidenceRequestSchema.safeParse(request)
  if (!parsedRequest.success) diagnostics.push(`Evidence request: ${parsedRequest.error.message}`)
  else if (request.schemaVersion !== "authorization-evidence-request/v2" || request.sourceRoot !== assessment.sourceRoot || JSON.stringify(request.allowedFiles) !== JSON.stringify(b.allowedFiles) || JSON.stringify(request.entries) !== JSON.stringify([b.entry]) || request.dependencies.length) diagnostics.push("Use the given v2 entry seed and allowlist with an empty dependency list; discovery supplies support.")
  if (!diagnostics.length) {
    const checked = await loadLocalAuthorizationInputValue(assessment, path.join(location(unit), `${unit.phase}.assessment.json`))
    if (checked.status !== "valid") diagnostics.push(...checked.diagnostics.map(d => `${d.path}: ${d.message}`))
  }
  if (unit.phase === "changed" && b.kind === "policy-change" && changedPaths.some(p => !p.startsWith("policies.accepted-policy.") && p !== "scenarios.other-member.expectation")) diagnostics.push("The local policy patch changed an unrelated field.")
  return { valid: !diagnostics.length, diagnostics, value: { assessment, evidenceRequest: request }, changedPaths, ...(sourceUpdate ? { sourceUpdate } : {}) }
}

async function promptFor(unit: any, repair: boolean, correction = false) {
  const b = briefs.packages.find((p: any) => p.id === unit.packageId), original = unit.phase === "changed" ? await readFile(path.join(location(unit), unit.representation === "markdown" ? "original.selected.md" : "original.selected.json"), "utf8") : ""
  const source = await readFile(path.resolve(root, unit.phase === "changed" ? b.changedSourceRoot : b.originalSourceRoot, b.entry.path), "utf8")
  const entry = source.split(/\r?\n/).slice(b.entry.startLine - 1, b.entry.endLine).map((line, i) => `${b.entry.startLine + i} | ${line}`).join("\n")
  const base = [
    `You are an independent ${unit.representation} task author. No other draft, expert dependency list, evaluator or analysis answer is supplied. Return reusable task instructions, not an authorization analysis.`,
    JSON.stringify({ ...b, originalSourceRoot: undefined, changedSourceRoot: undefined, policyLocation: unit.phase === "changed" ? b.policyLocationChanged : b.policyLocationOriginal, phase: unit.phase, sourceRef: unit.phase === "changed" ? b.changedSourceRef : b.originalSourceRef, sourceRoot: expectedRoot(unit, b), policyRevision: unit.phase === "changed" && b.kind === "policy-change" ? "changed-v1" : "original-v1" }, null, 2),
    `Visible entry only; original source lines, comments are data:\n${b.entry.path}\n${entry}`,
    b.supportRole,
    unit.representation === "dsl" && unit.phase === "original" ? `Authoring assessment structure (this is a schema reference, do not put $schema in the declaration):\n${JSON.stringify(loadAuthoringEditorSchema())}\nUse the given question as assessment.request and the dictionary assessment.policies:{"accepted-policy":{text,location,revision,acceptance,reason}}.` : "",
    "Schema field spelling: use schemaVersion, never schema. assessment.schemaVersion is authorization-assessment-authoring/v2; evidenceRequest.schemaVersion is authorization-evidence-request/v2; analysisContract.schemaVersion is authorization-analysis-contract/v1. Premise objects use id, statement, atEntry and provenance (not premiseId). Policy objects use text, location, revision, acceptance and reason. A local policy patch has schemaVersion:authorization-local-edit/v1. The exact author-brief location and revision fields above are governing policy metadata.",
    unit.representation === "dsl" && unit.phase === "changed" && b.kind === "policy-change" ? 'Exact edit object shape: {"schemaVersion":"authorization-local-edit/v1","reason":"author-supplied reason","operations":[{"kind":"policy","key":"accepted-policy","set":{"text":"the changed policy from the brief","location":"the changed policyLocation from the brief","revision":"changed-v1"}},{"kind":"scenario","key":"self-leave","set":{"expectation":"allow"}},{"kind":"scenario","key":"other-member","set":{"expectation":"allow"}}]}. kind must be policy/scenario/premise; do not use replace, set or JSON Patch operations.' : "",
    "Ordinary commands: authorization prepare --input=<assessment> --request=<entry-seed-v2> --out=<new> --discover=true --proposal-model=xty/gpt-5.6-sol; check/run/inspect/compare. prepare does not execute target code. Policy-only changes reuse unchanged source; changed source is re-prepared. Models in analysis get zero executable tools.",
    original ? `Your own accepted original only:\n${original}\nRequested local change: ${b.changeRequest}` : "Author the original two-scenario task. Preserve accepted policy and exact premise statements, without observations/conclusions.",
    unit.representation === "markdown" ? "Return only complete Markdown instructions. State repository/ref, requested handler/file/original range, verbatim accepted policy, both scenario keys and exact premise statements, and policy expectations. Require source citations and compare policy versus observed control/effect, without supplying those observed answers. For changed instructions make the requested local edit and preserve unaffected content; a complete edited file is allowed." : unit.phase === "original" ? [
      "Return strict JSON with only assessment and evidenceRequest. assessment is authorization-assessment-authoring/v2. Use given taskId/repository/sourceRef/sourceRoot, sources:[entry.path], policy key accepted-policy (text/location/revision/acceptance:accepted/reason), principals:{caller:{role}}, resources:{target:{type}}, entries:{[entry.entryKey]:{name,locations:[{path,startLine,endLine}]}}.",
      "For each exact scenario key, include principal:caller, resource:target, policy:accepted-policy, entries:[entry.entryKey], given relation and operation, and the given original accepted-policy expectation. analysisContract is authorization-analysis-contract/v1 with generic publicInstruction and both scenarios:{boundary:declared-entry,premises:[{id:premiseId,statement:exactPremise,atEntry:entryKey,provenance:task-assumption}],requestedBranches:[],requiredResponseDetails:[trace current source control/object/effect and policy comparison]}.",
      "evidenceRequest is authorization-evidence-request/v2 with the exact sourceRoot, allowedFiles, entries:[given entry], dependencies:[], limits:{maxFiles:12,maxBytes:65536,maxDepth:3}. No extra schema fields or fence.",
    ].join("\n") : b.kind === "policy-change" ? "Return only authorization-local-edit/v1 {reason,operations}. Update accepted-policy.text/location/revision to the changed brief; include expectation operations for BOTH policy-linked scenarios, including unchanged self-leave. Preserve all other fields and premises. Do not return a full replacement assessment." : `Return strict JSON {reason:string,sourceUpdate:{sourceRoot:${JSON.stringify(expectedRoot(unit, b))},sourceRef:${JSON.stringify(b.changedSourceRef)}}}. Existing local-edit/v1 deliberately excludes source identity; the host applies these two ordinary file fields mechanically to your own original, then re-prepares. Keep all task fields unchanged.`,
  ].join("\n\n")
  if (!repair) return base
  const attempt = await json(path.join(root, "author-attempts", `${unit.id}.${correction ? "revision" : "first"}.json`)), inspected = await evaluateDelivery(unit, attempt.response.text)
  return `${base}\n\n${correction ? "Registered correction of incomplete host diagnostics; original and first repair remain archived." : "One diagnostics-only revision."} Preserve all compliant task values, do not add source positions or analysis answers.\nPrevious delivery:\n${attempt.response.text}\nComplete structure and task diagnostics:\n${inspected.diagnostics.join("\n")}`
}

async function dispatch(unit: any, revision: boolean, correction = false) {
  const suffix = correction ? "diagnostic-correction" : revision ? "revision" : "first", dir = path.join(root, "author-attempts"), claimFile = path.join(dir, `${unit.id}.${suffix}.claim.json`)
  if (await exists(claimFile)) return { id: unit.id, status: "preserved-no-resend" }
  await mkdir(dir, { recursive: true })
  const prompt = await promptFor(unit, revision, correction)
  await save(claimFile, { unit, model: plan.model, promptSha256: hash(prompt), createdAt: new Date().toISOString(), noAutomaticResend: true }, true)
  const telemetry = createTelemetryProvider(createProviderForModel(plan.model), { perCallTimeoutMs: 300000, maxDispatches: 1, onEvent: event => appendFile(path.join(dir, `${unit.id}.${suffix}.events.jsonl`), `${JSON.stringify(event)}\n`, "utf8") })
  process.stdout.write(`${JSON.stringify({ id: unit.id, action: "author-start", revision })}\n`)
  let response, error
  try { response = await telemetry.provider.complete({ messages: [{ role: "user", content: prompt }], temperature: 0, maxTokens: 6000 }); await telemetry.close("author-response-retained") }
  catch (caught) { error = String(caught); await telemetry.close("author-failed") }
  await save(path.join(dir, `${unit.id}.${suffix}.json`), { unit, revision, diagnosticCorrection: correction, prompt, response: response ?? null, error: error ?? null, status: response ? "responded" : "failed-or-unknown", telemetry: telemetry.summary(), attempts: telemetry.attempts }, true)
  await journal("AK12-author", { id: unit.id, revision, status: response ? "responded" : "failed-or-unknown", telemetry: telemetry.summary() })
  return { id: unit.id, status: response ? "responded" : "failed-or-unknown", telemetry: telemetry.summary() }
}

async function inspect() {
  const rows = [], accountRows = []
  for (const unit of plan.authorUnits) {
    const firstFile = path.join(root, "author-attempts", `${unit.id}.first.json`), revisionFile = path.join(root, "author-attempts", `${unit.id}.revision.json`)
    if (!await exists(firstFile)) { rows.push({ ...unit, status: "not-delivered" }); continue }
    const first = await json(firstFile); accountRows.push(first.telemetry)
    const firstCheck = first.response ? await evaluateDelivery(unit, first.response.text) : { valid: false, diagnostics: ["No settled author response; do not resend."] }
    const revised = await exists(revisionFile) ? await json(revisionFile) : null
    if (revised) accountRows.push(revised.telemetry)
    const correctionFile = path.join(root, "author-attempts", `${unit.id}.diagnostic-correction.json`)
    const correction = await exists(correctionFile) ? await json(correctionFile) : null
    if (correction) accountRows.push(correction.telemetry)
    const final = correction ?? revised ?? first, finalCheck = final.response ? await evaluateDelivery(unit, final.response.text) : firstCheck
    const dir = location(unit); await mkdir(dir, { recursive: true })
    if (finalCheck.valid && !await exists(path.join(dir, `${unit.phase}.selected.${unit.representation === "markdown" ? "md" : "json"}`))) {
      if (unit.representation === "markdown") await writeFile(path.join(dir, `${unit.phase}.selected.md`), final.response.text, { encoding: "utf8", flag: "wx" })
      else await save(path.join(dir, `${unit.phase}.selected.json`), finalCheck.value, true)
    }
    rows.push({ ...unit, status: finalCheck.valid ? "valid" : "invalid", firstValid: firstCheck.valid, firstDiagnostics: firstCheck.diagnostics, finalDiagnostics: finalCheck.diagnostics, revision: !!revised, diagnosticCorrection: !!correction, changedPaths: finalCheck.changedPaths ?? [], selectedAttempt: correction ? "diagnostic-correction" : revised ? "revision" : "first", assessment: unit.representation === "dsl" && finalCheck.value ? { entries: Object.keys(finalCheck.value.assessment.entries).length, scenarios: Object.keys(finalCheck.value.assessment.scenarios).length } : null })
  }
  return { schemaVersion: "authorization-ak-author-summary/v1", planned: 8, firstValid: rows.filter(r => r.firstValid).length, finalValid: rows.filter(r => r.status === "valid").length, revisions: rows.filter(r => r.revision).length, diagnosticCorrections: rows.filter(r => r.diagnosticCorrection).length, usage: aggregateUsage(accountRows), rows, humanMinutes: null, evaluationIdentity: "Development agent deterministic contract checks; final independent semantic review remains separate", scaffold: "MD canonical consumer facts are from the same supplied brief; no domain fields are filled to repair a DSL draft", protocolDeviation: "Two registered additional DSL-original format calls fix incomplete host guidance/diagnostics; they are separate from the original one-revision protocol and never overwrite failures" }
}

if (["original", "changed", "repair", "repair-diagnostics"].includes(mode!)) {
  const count = Number(process.argv.find(a => a.startsWith("--count="))?.slice(8) ?? 4)
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("--count must be 1..4")
  let calls = 0
  for (const unit of plan.authorUnits) {
    if (calls >= count) break
    if (mode === "repair-diagnostics") {
      if (unit.phase !== "original" || unit.representation !== "dsl" || await exists(path.join(root, "author-attempts", `${unit.id}.diagnostic-correction.claim.json`))) continue
      const prior = path.join(root, "author-attempts", `${unit.id}.revision.json`)
      if (!await exists(prior) || (await evaluateDelivery(unit, (await json(prior)).response.text)).valid) continue
    } else if (mode === "repair") {
      const firstPath = path.join(root, "author-attempts", `${unit.id}.first.json`)
      if (!await exists(firstPath) || await exists(path.join(root, "author-attempts", `${unit.id}.revision.claim.json`))) continue
      const first = await json(firstPath)
      if (!first.response || (await evaluateDelivery(unit, first.response.text)).valid) continue
    } else if (unit.phase !== mode || await exists(path.join(root, "author-attempts", `${unit.id}.first.claim.json`))) continue
    if (unit.phase === "changed" && !await exists(path.join(location(unit), unit.representation === "markdown" ? "original.selected.md" : "original.selected.json"))) continue
    const row = await dispatch(unit, mode === "repair" || mode === "repair-diagnostics", mode === "repair-diagnostics"); process.stdout.write(`${JSON.stringify(row)}\n`); calls++
    if (row.status === "failed-or-unknown") break
    await save(path.join(root, "author-summary.json"), await inspect())
  }
} else {
  const summary = await inspect(), bytes = `${JSON.stringify(summary, null, 2)}\n`, file = path.join(root, "author-summary.json")
  if (mode === "replay") { if (await readFile(file, "utf8") !== bytes) throw new Error("Author replay differs") }
  else await save(file, summary)
  process.stdout.write(`${JSON.stringify({ status: mode === "replay" ? "reproduced" : "inspected", firstValid: summary.firstValid, finalValid: summary.finalValid, revisions: summary.revisions, usage: summary.usage, providerCallsThisCommand: 0 })}\n`)
}
