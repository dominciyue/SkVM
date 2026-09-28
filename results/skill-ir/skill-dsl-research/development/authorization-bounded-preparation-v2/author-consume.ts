import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInput, loadLocalAuthorizationInputValue } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { executeLocalAuthorizationRun, inspectLocalAuthorizationOutput } from "../../../../../src/benchmarks/authorization-dsl/local-run.ts"
import { executeMarkdownStudyRun } from "../../../../../src/benchmarks/authorization-dsl/markdown-study.ts"
import { root, repo, json, save, bind, hash, absolute, verify, exists, cli, journal, aggregateUsage } from "./common.ts"

const mode = process.argv[2]
if (!["build", "run", "replay"].includes(mode ?? "")) throw new Error("Usage: bun author-consume.ts build|run|replay [--count=1..8] (build/replay zero provider)")
const plan = await json(path.join(root, "study-plan.json")), briefs = await json(path.join(root, "author-briefs.json"))
await verify([...plan.implementation, plan.authorBriefs, ...plan.authorSources])
process.env.SKVM_AUTO_PROBE = "0"; process.env.SKVM_CACHE = path.join(repo, ".skvm")
const pkgDir = (id: string, representation: string) => path.join(root, "author-packages", id, representation)

function neutralTask(b: any, phase: string, inputFile: string) {
  const changed = phase === "changed", expectations = changed ? b.changedExpectations : b.originalExpectations
  return { schemaVersion: "authorization-assessment-authoring/v2", taskId: b.taskId, request: b.question, repository: b.repository, sourceRef: changed ? b.changedSourceRef : b.originalSourceRef,
    sourceRoot: path.relative(path.dirname(inputFile), path.resolve(root, changed ? b.changedSourceRoot : b.originalSourceRoot)).replaceAll("\\", "/"), sources: [b.entry.path],
    policies: { "accepted-policy": { text: changed ? b.changedPolicy : b.originalPolicy, location: changed ? b.policyLocationChanged : b.policyLocationOriginal, revision: changed && b.kind === "policy-change" ? "changed-v1" : "original-v1", acceptance: "accepted", reason: "The public task author supplies this accepted policy." } },
    principals: { caller: { role: "Authenticated caller described separately by the two exact scenario premises." } }, resources: { target: { type: "Protected target fixed in each scenario premise." } },
    entries: { [b.entry.entryKey]: { name: b.entry.entryKey, locations: [{ path: b.entry.path, startLine: b.entry.startLine, endLine: b.entry.endLine }] } },
    scenarios: Object.fromEntries(b.scenarios.map((s: any) => [s.key, { principal: "caller", resource: "target", policy: "accepted-policy", entries: [b.entry.entryKey], relation: s.relation, operation: s.operation, expectation: expectations[s.key] }])),
    analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Assess both declared scenarios at handler entry using the supplied fixed source and accepted task policy. Treat premises as task assumptions, trace identity/object/control/effect with exact supplied-source citations, and separate policy expectation from observed authorization. Do not execute target code or infer deployment facts.",
      scenarios: Object.fromEntries(b.scenarios.map((s: any) => [s.key, { boundary: "declared-entry", premises: [{ id: s.premiseId, statement: s.premise, atEntry: b.entry.entryKey, provenance: "task-assumption" }], requestedBranches: [], requiredResponseDetails: ["Trace the decisive source-visible control and protected effect, and compare with the accepted policy."] }])) } }
}

if (mode === "build") {
  const authors = await json(path.join(root, "author-summary.json"))
  if (authors.finalValid !== 8) throw new Error("All eight independent deliveries must be inspected; no host domain-field repair")
  const units = [], sourceReuse = []
  for (const b of briefs.packages) {
    const paperless = b.kind === "synthetic-source-change", caseId = paperless ? "paperless-note-post" : "memos-member-leave"
    const actual = path.join(root, "inputs", caseId, "automatic-v2")
    const originalMaterial = await loadLocalAuthorizationInput(path.join(actual, "assessment.json"))
    if (originalMaterial.status !== "valid") throw new Error("Cannot reuse a failed automatic preparation")
    const originalSeed = await json(path.join(root, "inputs", caseId, "seed-request.json"))
    if (JSON.stringify(originalSeed.allowedFiles) !== JSON.stringify(b.allowedFiles) || JSON.stringify(originalSeed.entries) !== JSON.stringify([b.entry]) || originalMaterial.task.sourceRef !== b.originalSourceRef) throw new Error("Original source reuse boundary changed")
    let changedMaterial = originalMaterial, changedMaterialRoot = actual
    if (paperless) {
      const commonFile = path.join(root, "author-common", b.id, "changed-source-input.json")
      await save(commonFile, neutralTask(b, "changed", commonFile), true)
      const discovery = await json(path.join(actual, "discovery.json")), proposal = await json(path.join(actual, "proposal.json"))
      const request = { ...discovery.request, sourceRoot: (await json(commonFile)).sourceRoot, dependencies: [...discovery.request.dependencies, ...proposal.dependencies] }
      const requestFile = path.join(path.dirname(commonFile), "changed-request-from-actual-preparation.json")
      await save(requestFile, request, true)
      changedMaterialRoot = path.join(path.dirname(commonFile), "changed-prepared")
      const prepared = await cli(["prepare", `--input=${commonFile}`, `--request=${requestFile}`, `--out=${changedMaterialRoot}`])
      if (prepared.code) throw new Error(`Changed source preparation failed: ${JSON.stringify(prepared)}`)
      const changed = await loadLocalAuthorizationInput(path.join(changedMaterialRoot, "assessment.json"))
      if (changed.status !== "valid") throw new Error("Changed material invalid")
      changedMaterial = changed
      sourceReuse.push({ packageId: b.id, phase: "changed", reusedSnapshot: false, reusedActualLocatorRequest: true, newSourceRef: b.changedSourceRef, preparationJob: true, modelCalls: 0, request: await bind(requestFile), report: await bind(path.join(changedMaterialRoot, "report.json")) })
    }
    sourceReuse.push({ packageId: b.id, phase: "original", reusedSnapshot: true, source: `inputs/${caseId}/automatic-v2/source`, preparationJob: false, modelCalls: 0, reason: "Same entry, allowlist, fixed ref and source bytes; task identity is rebuilt" })
    if (!paperless) sourceReuse.push({ packageId: b.id, phase: "changed", reusedSnapshot: true, preparationJob: false, modelCalls: 0, reason: "Pure policy edit; actual source and original line mappings unchanged" })
    for (const phase of ["original", "changed"]) for (const representation of ["markdown", "dsl"]) {
      const dir = pkgDir(b.id, representation), rawFile = path.join(dir, `${phase}.assessment.json`), unitId = `${b.id}-${representation}-${phase}`
      let input: any
      if (representation === "markdown") input = neutralTask(b, phase, rawFile)
      else {
        input = (await json(path.join(dir, `${phase}.selected.json`))).assessment
        if (phase === "changed" && !paperless) {
          const selected = authors.rows.find((r: any) => r.id === unitId).selectedAttempt
          const draft = await json(path.join(root, "author-attempts", `${unitId}.${selected}.json`))
          const patchFile = path.join(dir, "changed.patch.json")
          await save(patchFile, JSON.parse(draft.response.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")), true)
          const edited = await cli(["edit", `--input=${path.join(dir, "original.assessment.json")}`, `--edit=${patchFile}`, `--out=${path.join(dir, "ordinary-edited")}`])
          if (edited.code) throw new Error(`Ordinary local edit failed ${JSON.stringify(edited)}`)
          const ordinary = await json(path.join(dir, "ordinary-edited", "assessment.json"))
          // Relocation is mechanical; all domain fields remain the independent author's patch result.
          input = { ...ordinary, sourceRoot: path.relative(dir, path.resolve(path.join(dir, "ordinary-edited"), ordinary.sourceRoot)).replaceAll("\\", "/") }
        }
      }
      await save(rawFile, input, true)
      const loaded = await loadLocalAuthorizationInput(rawFile)
      if (loaded.status !== "valid") throw new Error(`Author input invalid ${unitId}`)
      const material = phase === "changed" ? changedMaterial : originalMaterial, materialRoot = phase === "changed" ? changedMaterialRoot : actual
      const preparedFile = path.join(dir, `prepared-${phase}.json`)
      const prepared = { ...loaded.normalizedInput, sourceRoot: path.relative(dir, path.join(materialRoot, "source")).replaceAll("\\", "/"), sources: material.normalizedInput.sources, evidencePreparation: material.normalizedInput.evidencePreparation }
      const checked = await loadLocalAuthorizationInputValue(prepared, preparedFile)
      if (checked.status !== "valid") throw new Error(`Rebuilt prepared identity invalid ${unitId}: ${JSON.stringify(checked.diagnostics)}`)
      await save(preparedFile, prepared, true)
      const check = await cli(["check", `--input=${preparedFile}`, "--method=plain", "--wire=v6", "--assessment=explicit-v1"])
      if (check.code || check.report.scopePreview.analysisEntries !== 1 || check.report.scopePreview.declaredScenarios !== 2 || check.report.scopePreview.expandedObligations !== 2) throw new Error(`Scope expansion ${unitId}`)
      const sources = []
      for (const file of checked.normalizedInput.sources) sources.push(await bind(path.resolve(dir, prepared.sourceRoot, file)))
      const markdown = representation === "markdown" ? await bind(path.join(dir, `${phase}.selected.md`)) : null
      units.push({ id: unitId, packageId: b.id, phase, representation, input: await bind(preparedFile), rawInput: await bind(rawFile), sources, markdown, scope: check.report.scopePreview, declaredScenarios: b.scenarios.map((s: any) => s.key) })
    }
  }
  await save(path.join(root, "author-use-config.json"), { schemaVersion: "authorization-ak-author-use/v1", frozenBeforeConsumption: true, studyPlanSha256: hash(await readFile(path.join(root, "study-plan.json"))), model: plan.model, executionOptions: plan.executionOptions, units, sourceReuse, plannedScenarios: 16 }, true)
  await save(path.join(root, "author-host-scaffold.json"), { basis: "Task facts and expectations from the pre-dispatch author-briefs; never inferred from source or a DSL draft", units: units.filter(u => u.representation === "markdown").map(u => ({ id: u.id, input: u.rawInput })), timing: "Brief facts frozen before first AK paid call; deterministic consumer materialization after author delivery", sourceReuse }, true)
  process.stdout.write(`${JSON.stringify({ status: "built", units: 8, scenarios: 16, expanded: units.reduce((n, u) => n + u.scope.expandedObligations, 0), additionalPreparationJobs: sourceReuse.filter(r => r.preparationJob).length, preparationModelCalls: 0 })}\n`)
} else {
  const bytes = await readFile(path.join(root, "author-use-config.json")), config = JSON.parse(bytes.toString("utf8")), configSha256 = hash(bytes)
  await verify(config.units.flatMap((u: any) => [u.input, u.rawInput, ...u.sources, ...(u.markdown ? [u.markdown] : [])]))
  if (config.units.length !== 8 || config.plannedScenarios !== 16) throw new Error("Author-use denominator changed")
  if (mode === "run") {
    const count = Number(process.argv.find(a => a.startsWith("--count="))?.slice(8) ?? 8)
    if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error("--count must be 1..8")
    let dispatched = 0, failures = 0
    for (const unit of config.units) {
      if (dispatched >= count) break
      const outRoot = path.join(root, "author-runs", unit.id), claim = path.join(outRoot, "claim.json")
      if (await exists(claim)) continue
      let compared = null
      if (unit.phase === "changed") {
        const originalId = unit.id.replace(/changed$/, "original"), original = await json(path.join(root, "author-runs", originalId, "unit.json"))
        const previous = path.join(root, "author-runs", originalId, "sessions", original.report.sessionId)
        const comparison = await cli(["compare", `--previous=${previous}`, `--input=${absolute(unit.input)}`])
        if (comparison.code || comparison.report.status !== "needs-review") throw new Error(`Expected changed-input review ${unit.id}`)
        compared = comparison.report
        await save(path.join(root, "author-compare", `${unit.id}.json`), { providerCalls: 0, report: compared }, true)
      }
      await save(claim, { unit, configSha256, noAutomaticResend: true, createdAt: new Date().toISOString() }, true)
      process.stdout.write(`${JSON.stringify({ id: unit.id, action: "consume-start" })}\n`)
      const common = { inputFile: absolute(unit.input), model: config.model, outRoot, wireVersion: "v6" as const, assessmentMode: "explicit-v1" as const, reasoningStrategy: "standard" as const, executionOptions: config.executionOptions }
      const report = unit.representation === "markdown" ? await executeMarkdownStudyRun({ ...common, markdown: { instructions: await readFile(absolute(unit.markdown), "utf8"), instructionOrigin: "independent-author", instructionPath: unit.markdown.path } }) : await executeLocalAuthorizationRun({ ...common, method: "plain" })
      await save(path.join(outRoot, "unit.json"), { unit, configSha256, report, compared }, true)
      await journal("AK12-consume", { id: unit.id, status: report.status, compare: compared?.status })
      process.stdout.write(`${JSON.stringify({ id: unit.id, status: report.status, providerCalls: "telemetry" in report ? report.telemetry?.providerCalls : null })}\n`)
      dispatched++; failures = ["timeout-unknown", "transport-failed"].includes(report.status) ? failures + 1 : 0
      if (failures >= 2) { process.stderr.write("Two infrastructure failures; preserve unknowns and stop new dispatch.\n"); break }
    }
  } else {
    const rows = []
    for (const unit of config.units) {
      const outRoot = path.join(root, "author-runs", unit.id), record = path.join(outRoot, "unit.json")
      if (!await exists(record)) { rows.push({ ...unit, status: await exists(path.join(outRoot, "claim.json")) ? "completion-unknown" : "not-dispatched", providerCalls: 0 }); continue }
      const stored = await json(record), inspected = await inspectLocalAuthorizationOutput(outRoot)
      if (stored.configSha256 !== configSha256 || stored.report.status !== inspected.status) throw new Error(`Author-use inspect identity changed ${unit.id}`)
      const run = await json(path.join(outRoot, "sessions", stored.report.sessionId, "run.json"))
      rows.push({ ...unit, status: inspected.status, compare: stored.compared?.status ?? null, ...inspected.telemetry, firstResponse: run.firstResponse, finalKind: run.finalKind, canonicalConclusions: inspected.canonicalResult?.results.map((r: any) => r.conclusion), observedDecisions: inspected.observedDecisions, sessionId: stored.report.sessionId })
    }
    const summary = { schemaVersion: "authorization-ak-author-use-replay/v1", configSha256, planned: 8, plannedScenarios: 16, terminal: rows.filter(r => !["not-dispatched", "completion-unknown"].includes(r.status)).length, completed: rows.filter(r => r.status === "completed").length, expandedObligations: rows.reduce((n, r) => n + r.scope.expandedObligations, 0), usage: aggregateUsage(rows), sourceReuse: config.sourceReuse, rows, providerCallsThisCommand: 0, targetExecutions: 0 }
    await save(path.join(root, "author-use-replay.json"), summary)
    process.stdout.write(`${JSON.stringify({ terminal: summary.terminal, completed: summary.completed, scenarios: 16, expanded: summary.expandedObligations, usage: summary.usage, providerCallsThisCommand: 0 })}\n`)
  }
}
