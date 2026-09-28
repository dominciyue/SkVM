import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { discoverAuthorizationEvidence } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/discovery.ts"
import { authorizationScopePreview } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/scope.ts"
import { root, repo, aj, caseIds, hash, json, save, bind, cli, journal, updateState } from "./common.ts"

if (process.argv[2] !== "build") throw new Error("Usage: bun materialize.ts build (zero provider; refuses to replace registration)")
const packing = [], cases = [], sourceBindings = []
for (const id of caseIds) {
  const dir = path.join(root, "inputs", id)
  await mkdir(dir, { recursive: true })
  const oldInputFile = path.join(aj, "inputs", id, "full", "authoring.json")
  const original = await json(oldInputFile), request = await json(path.join(aj, "inputs", id, "request.json"))
  const sourceRoot = path.resolve(path.dirname(oldInputFile), original.sourceRoot)
  const input = { ...original, sourceRoot: path.relative(dir, sourceRoot).replaceAll("\\", "/") }
  const inputFile = path.join(dir, "source-input.json")
  await save(inputFile, input, true)
  const explicit = { ...request, sourceRoot: input.sourceRoot }
  const seed = { ...explicit, schemaVersion: "authorization-evidence-request/v2", dependencies: [] }
  await save(path.join(dir, "explicit-request.json"), explicit, true)
  await save(path.join(dir, "seed-request.json"), seed, true)
  await save(path.join(dir, "packing-v2-request.json"), { ...explicit, schemaVersion: "authorization-evidence-request/v2" }, true)
  await copyFile(path.join(aj, "inputs", id, "independent.md"), path.join(dir, "independent.md"))
  const versions = []
  for (const version of ["explicit-v1", "packing-v2"]) {
    const result = await cli(["prepare", `--input=${inputFile}`, `--request=${path.join(dir, version === "explicit-v1" ? "explicit-request.json" : "packing-v2-request.json")}`, `--out=${path.join(dir, version)}`])
    if (result.code) throw new Error(JSON.stringify(result))
    const loaded = await loadLocalAuthorizationInput(path.join(dir, version, "assessment.json"))
    if (loaded.status !== "valid") throw new Error(`Invalid packed input ${id}/${version}`)
    const report = loaded.normalizedInput.evidencePreparation!
    const contains = (d: any) => report.schemaVersion === "authorization-evidence-report/v2" ? report.included.some(f => f.path === d.path && f.segments.some(s => s.originalStartLine <= d.startLine && s.originalEndLine >= d.endLine)) : report.included.some(f => f.path === d.path && f.startLine <= d.startLine && f.endLine >= d.endLine)
    versions.push({ version, status: result.report.status, bytes: loaded.sourceBundle.files.reduce((n, f) => n + Buffer.byteLength(f.content), 0),
      scope: authorizationScopePreview(loaded.task, loaded.normalizedInput.evidencePreparation), gaps: result.report.gaps,
      declaredReferenceCoverage: explicit.dependencies.map((d: any) => ({ id: d.id, path: d.path, startLine: d.startLine, endLine: d.endLine, included: contains(d) })) })
  }
  const locator = await discoverAuthorizationEvidence({ inputFile, request: seed })
  await save(path.join(dir, "offline-locator-preview.json"), locator, true)
  packing.push({ id, versions, locatorPreview: { files: locator.files.length, readBytes: locator.readBytes, displayBytes: locator.displayBytes, supports: locator.request.dependencies.length, diagnostics: locator.diagnostics } })
  const sources = []
  for (const file of seed.allowedFiles) sources.push(await bind(path.join(sourceRoot, ...file.split("/"))))
  sourceBindings.push(...sources)
  cases.push({ id, input: await bind(inputFile), explicitRequest: await bind(path.join(dir, "explicit-request.json")), seedRequest: await bind(path.join(dir, "seed-request.json")), markdown: await bind(path.join(dir, "independent.md")), sourceFiles: sources })
}
await copyFile(path.join(aj, "public-briefs.json"), path.join(root, "public-briefs.json"))
const oldOracle = await json(path.join(aj, "oracle.json"))
await save(path.join(root, "evaluator", "oracle.json"), { ...oldOracle, schemaVersion: "authorization-ak-oracle/v2", materialRule: "Apply original policy/behavior semantics to actual supplied material. A newly retained genuine helper may resolve an old crop gap. Unknown external conditions remain unknown; evidence existence is not semantic proof.", scope: "public-development; never read by generation/preparation/author runner", changes: ["Paperless share-create user binding is assessable when views.py:406-425 is actually supplied", "Memos GetShared still has deliberately unspecified token existence/expiry"] }, true)
await save(path.join(root, "packing-summary.json"), { schemaVersion: "authorization-ak-packing/v1", referenceBasis: "AJ declared dependencies; independent fixed reference list, not an exhaustive semantic gold", maxBytes: 65536, modelCalls: 0, unrelatedBytes: "not independently annotated; unmeasured", cases: packing }, true)

// Author facts are common task requirements, separate from the evaluator. No helper coordinates or analysis answers.
const oldBriefs = await json(path.join(aj, "author-use-briefs.json"))
const packages = []
const authorSources = []
for (const old of oldBriefs.packages) {
  const paperless = old.repository.includes("paperless")
  const caseId = paperless ? "paperless-note-post" : "memos-member-leave"
  const seed = await json(path.join(root, "inputs", caseId, "seed-request.json"))
  const sourceInput = await json(path.join(root, "inputs", caseId, "source-input.json"))
  const originalSourceRoot = path.resolve(root, "inputs", caseId, sourceInput.sourceRoot)
  let changedSourceRoot = originalSourceRoot, changedSourceRef = old.sourceRef
  if (paperless) {
    changedSourceRoot = path.join(root, "author-source", "paperless-synthetic")
    for (const file of seed.allowedFiles) { await mkdir(path.dirname(path.join(changedSourceRoot, file)), { recursive: true }); await copyFile(path.join(originalSourceRoot, file), path.join(changedSourceRoot, file)) }
    const permissions = path.join(changedSourceRoot, "src/documents/permissions.py")
    const original = await readFile(permissions, "utf8")
    const before = "return obj.owner is None or obj.owner == user or checker.has_perm(perms, obj)"
    if (original.split(before).length !== 2) throw new Error("Synthetic mutation is not unique")
    const changed = original.replace(before, 'return obj.owner is None or obj.owner == user or (perms != "change_document" and checker.has_perm(perms, obj))')
    await writeFile(permissions, changed, "utf8")
    await copyFile(path.join(originalSourceRoot, "LICENSE"), path.join(changedSourceRoot, "LICENSE"))
    changedSourceRef = `synthetic-ak-change-grants-disabled-v1-${hash(changed).slice(0, 16)}`
    await save(path.join(root, "author-source", "mutation.json"), { synthetic: true, repository: old.repository, originalRef: old.sourceRef, sourceRef: changedSourceRef, file: "src/documents/permissions.py", originalLine: 635, before, after: changed.split(/\r?\n/)[634]!.trim(), originalSha256: hash(original), changedSha256: hash(changed), targetExecuted: false }, true)
  }
  packages.push({ id: paperless ? "paperless-note-source" : "memos-space-policy", kind: paperless ? "synthetic-source-change" : "policy-change", taskId: paperless ? "ak-use-paperless-note" : "ak-use-memos-members", repository: old.repository, originalSourceRef: old.sourceRef, changedSourceRef,
    originalSourceRoot: path.relative(root, originalSourceRoot).replaceAll("\\", "/"), changedSourceRoot: path.relative(root, changedSourceRoot).replaceAll("\\", "/"), allowedFiles: seed.allowedFiles, entry: seed.entries[0],
    question: old.question, originalPolicy: old.originalPolicy, changedPolicy: paperless ? old.originalPolicy : old.changedPolicy,
    scenarios: old.scenarios, originalExpectations: paperless ? { "view-only": "deny", "change-granted": "allow" } : { "self-leave": "allow", "other-member": "deny" },
    changedExpectations: paperless ? { "view-only": "deny", "change-granted": "allow" } : { "self-leave": "allow", "other-member": "allow" },
    changeRequest: paperless ? "Use the supplied synthetic source copy and its new sourceRef. It changes only the owner-aware permission helper so non-owner change_document object grants are no longer honored. The accepted policy, scenario premises/relations/expectations, identities and task ID stay unchanged. Re-prepare the changed source, compare to the original session, and run fresh. Do not answer the scenarios in the authored instructions." : old.changeRequest,
    supportRole: "Declare only the requested handler as an analysis entry. Helpers belong in evidence-request dependencies; an empty dependency list with discover=true is supported. Do not author all helper positions.", policyLocationOriginal: `author-briefs.json#/${paperless ? "paperless-note-source" : "memos-space-policy"}/originalPolicy`, policyLocationChanged: `author-briefs.json#/${paperless ? "paperless-note-source" : "memos-space-policy"}/${paperless ? "originalPolicy" : "changedPolicy"}` })
  for (const source of new Set([originalSourceRoot, changedSourceRoot])) for (const file of seed.allowedFiles) authorSources.push(await bind(path.join(source, file)))
}
await save(path.join(root, "author-briefs.json"), { schemaVersion: "authorization-ak-author-briefs/v1", model: "xty/gpt-5.6-sol", frozenBeforeAnyPaidCall: true, packages }, true)
const arms = ["M0", "D0", "M1", "D1"]
const units = []
for (const [i, caseId] of caseIds.entries()) for (const arm of [...arms.slice(i % 4), ...arms.slice(0, i % 4)]) units.push({ id: `initial-${caseId}-${arm}`, phase: "initial", caseId, arm, material: arm.endsWith("0") ? "explicit-v1" : "automatic-v2" })
for (const [i, caseId] of ["paperless-share-create", "memos-get-shared"].entries()) for (const arm of [...arms.slice((i + 2) % 4), ...arms.slice(0, (i + 2) % 4)]) units.push({ id: `repeat-${caseId}-${arm}`, phase: "repeat", caseId, arm, material: arm.endsWith("0") ? "explicit-v1" : "automatic-v2" })
const implementation = await Promise.all([
  "src/benchmarks/authorization-dsl/evidence-preparation/schema.ts", "src/benchmarks/authorization-dsl/evidence-preparation/prepare.ts", "src/benchmarks/authorization-dsl/evidence-preparation/proposal.ts", "src/benchmarks/authorization-dsl/evidence-preparation/discovery.ts", "src/benchmarks/authorization-dsl/evidence-preparation/segments.ts", "src/benchmarks/authorization-dsl/evidence-preparation/scope.ts",
  "src/benchmarks/authorization-dsl/inputs.ts", "src/benchmarks/authorization-dsl/local-input.ts", "src/benchmarks/authorization-dsl/local-run.ts", "src/benchmarks/authorization-dsl/markdown-study.ts", "src/benchmarks/authorization-dsl/telemetry.ts", "src/benchmarks/authorization-dsl/host.ts", "src/task-dsl/authorization/result.ts", "src/task-dsl/authorization/render.ts", "src/task-dsl/authorization/outcome-result.ts", "src/cli/authorization-prepare.ts",
].map(file => bind(path.join(repo, file))))
const plan = { schemaVersion: "authorization-ak-study-plan/v1", registeredBeforeAnyPaidCall: true, model: "xty/gpt-5.6-sol", exposure: "Previously exposed AJ public-development tasks and fixed source refs", cases, units, implementation,
  publicBriefs: await bind(path.join(root, "public-briefs.json")), oracle: await bind(path.join(root, "evaluator", "oracle.json")), authorBriefs: await bind(path.join(root, "author-briefs.json")), authorSources,
  preparation: { jobs: 8, maxAdditionalAuthorJobs: 4, candidateFiles: 12, readBytes: 1048576, cumulativeDisplayBytes: 65536, finalSourceBytes: 65536, maxDepth: 3, maxPositionRounds: 2, maxFormatRepairs: 1, maxDispatches: 3, timeoutMs: 300000 },
  executionOptions: { timeoutMs: 300000, unitTimeoutMs: 900000, maxTokens: 6000, maxProviderDispatches: 4, maxDomainRepairs: 1 }, method: "plain", wireVersion: "v6", assessmentMode: "explicit-v1", reasoningStrategy: "standard", temperature: 0,
  authorUnits: packages.flatMap(p => ["original", "changed"].flatMap(phase => ["markdown", "dsl"].map(representation => ({ id: `${p.id}-${representation}-${phase}`, packageId: p.id, phase, representation })))), authorMaxDiagnosticRevisions: 1,
  rules: ["No AJ expert dependency list, old answer or evaluator is passed to automatic discovery", "One automatic preparation per task shared by M/D and repeats", "No post-answer material repair or score-driven resampling", "Original failures and dispatched unknowns remain; no automatic resend", "First task group serial; thereafter at most two concurrent units", "Two consecutive infrastructure failures stop new dispatch", "Pure policy changes reuse unchanged actual source; synthetic source changes get new ref and preparation", "MD consumer canonical facts come from the common task brief, not another author's draft; independently authored instructions are preserved"] }
await save(path.join(root, "study-plan.json"), plan, true)
await journal("AK8", { status: "registered", cases: 8, units: 40, preparationCalls: 0, packingSummary: "packing-summary.json" })
await updateState("AK9", { completedStages: ["AK0", "AK1", "AK2", "AK3", "AK4", "AK5", "AK6", "AK7", "AK8"], nextCommand: "bun prepare-study.ts run", pendingCommits: ["AK frozen inputs, scripts and actual evidence"] })
process.stdout.write(`${JSON.stringify({ status: "registered", cases: 8, units: 40, packing: packing.map(c => ({ id: c.id, versions: c.versions.map(v => ({ version: v.version, status: v.status, bytes: v.bytes, coverage: v.declaredReferenceCoverage.filter((d: any) => d.included).length })) })), providerCalls: 0 })}\n`)
