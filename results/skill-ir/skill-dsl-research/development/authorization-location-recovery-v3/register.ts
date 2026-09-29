import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { normalizeAuthorizationAuthoringInput } from "../../../../../src/benchmarks/authorization-dsl/authoring.ts"
import { root, repo, ak, json, save, bind, hash, verify, absolute, cli } from "./common.ts"

const mode = process.argv[2]
if (!["register", "freeze"].includes(mode ?? "")) throw new Error("Usage: register.ts register|freeze")
if (mode === "freeze") {
  const proc = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: repo, stdout: "pipe" }), commit = (await new Response(proc.stdout).text()).trim()
  if (await proc.exited) throw new Error("Cannot read implementation commit")
  const paths = [
    "src/benchmarks/authorization-dsl/evidence-preparation/location-selection.ts", "src/benchmarks/authorization-dsl/evidence-preparation/discovery.ts",
    "src/benchmarks/authorization-dsl/evidence-preparation/prepare.ts", "src/benchmarks/authorization-dsl/evidence-preparation/proposal.ts", "src/benchmarks/authorization-dsl/evidence-preparation/schema.ts",
    "src/benchmarks/authorization-dsl/authoring.ts", "src/benchmarks/authorization-dsl/authoring-v2.ts", "src/benchmarks/authorization-dsl/editor-support/schema.ts",
    "src/benchmarks/authorization-dsl/authoring-workspace/local-edit.ts", "src/benchmarks/authorization-dsl/local-input.ts", "src/benchmarks/authorization-dsl/local-run.ts",
    "src/benchmarks/authorization-dsl/host.ts", "src/benchmarks/authorization-dsl/telemetry.ts", "src/benchmarks/authorization-dsl/markdown-study.ts",
    "src/cli/authorization.ts", "src/cli/authorization-prepare.ts", "src/cli/authorization-edit.ts", "schemas/authorization/authoring-v2.schema.json",
    ...["common.ts", "register.ts", "prepare-study.ts", "panel.ts", "authors.ts", "consumers.ts"].map(f => path.relative(repo, path.join(root, f))) ]
  const files = []; for (const f of paths) files.push(await bind(path.join(repo, f)))
  for (const folder of ["src/task-dsl/authorization", "src/benchmarks/authorization-dsl"]) for await (const f of new Bun.Glob("**/*.ts").scan({ cwd: path.join(repo, folder) })) {
    if (f.endsWith(".test.ts")) continue
    const b = await bind(path.join(repo, folder, f)); if (!files.some(v => v.path === b.path)) files.push(b)
  }
  await save(path.join(root, "implementation-freeze.json"), { schemaVersion: "authorization-al-implementation/v1", commit, planSha256: hash(await readFile(path.join(root, "study-plan.json"))), files }, true)
  console.log(JSON.stringify({ status: "frozen", commit, files: files.length, providerCalls: 0 }))
} else {
  const old = await json(path.join(ak, "study-plan.json")), panel = await json(path.join(ak, "panel-config.json"))
  const cases = []
  for (const c of old.cases) {
    await verify([c.input, c.seedRequest, c.markdown, ...c.sourceFiles])
    const dir = path.join(root, "inputs", c.id)
    for (const [field, name] of [["input", "source-input.json"], ["seedRequest", "seed-request.json"], ["markdown", "independent.md"]] as const) {
      const bytes = await readFile(absolute(c[field])); await save(path.join(dir, ".registration.json"), { copiedFrom: c.input.path })
      await writeFile(path.join(dir, name), bytes, { flag: "wx" })
    }
    cases.push({ id: c.id, input: await bind(path.join(dir, "source-input.json")), seedRequest: await bind(path.join(dir, "seed-request.json")), markdown: await bind(path.join(dir, "independent.md")), sourceFiles: c.sourceFiles,
      oldMaterial: panel.cases.find((v: any) => v.id === c.id).material["automatic-v2"] })
  }
  await save(path.join(root, "public-briefs.json"), await json(absolute(old.publicBriefs)), true)
  const prior = await json(path.join(ak, "author-briefs.json"))
  const memos = structuredClone(prior.packages[0])
  memos.taskId = "al-use-memos-members"; memos.originalSourceRoot = "../authorization-evidence-editing-v1/public-source/memos"; memos.changedSourceRoot = memos.originalSourceRoot
  memos.policyLocationOriginal = "author-briefs.json#/memos-space-policy/originalPolicy"; memos.policyLocationChanged = "author-briefs.json#/memos-space-policy/changedPolicy"
  const paperless = structuredClone(prior.packages[1])
  paperless.id = "paperless-note-premise"; paperless.kind = "premise-change"; paperless.taskId = "al-use-paperless-note"
  paperless.changedSourceRef = paperless.originalSourceRef; paperless.changedSourceRoot = paperless.originalSourceRoot
  paperless.originalPolicy = "Creating a note requires the stated global permissions and either document ownership or an object change_document grant; an object view grant alone is insufficient."
  paperless.changedPolicy = paperless.originalPolicy
  paperless.question = "At notes POST handler entry assess both scenarios. The caller is not the document owner. The owner's presence is unspecified in the original task: distinguish absent from other-present where it changes authorization. Both callers have all stated global permissions and can view the document. Separate source-visible authorization from accepted-policy comparison."
  paperless.scenarios[0].relation = "not-owner-view-only"
  paperless.scenarios[1].relation = "not-owner-change-granted"
  for (const s of paperless.scenarios) {
    s.premise = "At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and " + (s.key === "view-only" ? "has no object change_document grant." : "has an object change_document grant.") + " Owner presence is unspecified: it may be absent or owned by a different user."
    s.changedPremise = s.premise.replace("Owner presence is unspecified: it may be absent or owned by a different user.", "Owner is other-present: a different user owns the document.")
  }
  paperless.changeRequest = "Change only both object-relation premise statements to their changedPremise values. Preserve source bytes/ref, task ID, policy, expectations, identities, relations, conditions and requested counterfactuals. Do not infer another task change."
  paperless.policyLocationOriginal = "author-briefs.json#/paperless-note-premise/originalPolicy"; paperless.policyLocationChanged = paperless.policyLocationOriginal
  const packages = [memos, paperless]
  await save(path.join(root, "author-briefs.json"), { schemaVersion: "authorization-al-author-briefs/v1", model: old.model, frozenBeforeAnyPaidCall: true, packages }, true)
  const scaffoldBindings = []
  for (const p of packages) for (const variant of ["original", "changed"]) {
    const value: any = { schemaVersion: "authorization-assessment-authoring/v2", taskId: p.taskId, request: p.question, repository: p.repository,
      sourceRef: p.originalSourceRef, sourceRoot: p.originalSourceRoot, sources: [p.entry.path],
      policies: { rule: { text: variant === "changed" ? p.changedPolicy : p.originalPolicy, location: variant === "changed" ? p.policyLocationChanged : p.policyLocationOriginal, revision: p.id + (variant === "changed" && p.kind === "policy-change" ? "-v2" : "-v1"), acceptance: "accepted", reason: "Explicit public task requirement." } },
      principals: { caller: { role: p.scenarios[0].principal } }, resources: { target: { type: p.id.startsWith("memos") ? "space membership" : "document" } },
      entries: { [p.entry.entryKey]: { name: p.entry.entryKey, locations: [{ path: p.entry.path, startLine: p.entry.startLine, endLine: p.entry.endLine }] } },
      scenarios: Object.fromEntries(p.scenarios.map((s: any) => [s.key, { principal: "caller", resource: "target", policy: "rule", entries: [p.entry.entryKey], relation: s.relation, operation: s.operation, expectation: (variant === "changed" ? p.changedExpectations : p.originalExpectations)[s.key],
        ...(p.kind === "premise-change" ? { conditions: { "owner-present": { basis: "Whether a different owner is present; caller is not owner." } } } : {}) }])),
      analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Use exact declared premises and accepted policy. Trace decisive control and effect, distinguish unspecified from absent, and answer requested branches without inventing runtime facts.",
        scenarios: Object.fromEntries(p.scenarios.map((s: any) => [s.key, { boundary: "declared-entry", premises: [{ id: s.premiseId, statement: variant === "changed" && p.kind === "premise-change" ? s.changedPremise : s.premise, atEntry: p.entry.entryKey, provenance: "task-assumption" }],
          requestedBranches: p.kind === "premise-change" ? [{ id: "absent", kind: "counterfactual", assumptions: [{ condition: "owner-present", value: false }] }, { id: "other-present", kind: "counterfactual", assumptions: [{ condition: "owner-present", value: true }] }] : [], requiredResponseDetails: ["Report source behavior and policy comparison separately; source-external store failure is not authorization."] }])) } }
    const n = normalizeAuthorizationAuthoringInput(value); if (n.status !== "ready") throw new Error(JSON.stringify(n))
    const file = path.join(root, "author-scaffolds", p.id, variant + ".json")
    await save(file, value, true); scaffoldBindings.push(await bind(file))
  }
  const support = await cli(["init", "--format=authoring-v2", "--out=" + path.join(root, "ordinary-author-template.json")])
  if (support.exitCode) throw new Error("Ordinary init failed")
  await save(path.join(root, "ordinary-init-report.json"), support.report, true)
  const main = ["owui-file", "memos-get-shared", "paperless-download", "paperless-share-create"], sentinels = ["fastapi-superuser-read", "memos-create-share"], units: any[] = []
  for (const caseId of [...main, ...sentinels]) for (const material of main.includes(caseId) ? ["old-auto", "new-auto"] : ["new-auto"]) for (const arm of ["markdown", "dsl"]) {
    units.push({ id: String(units.length + 1).padStart(2, "0") + "-" + caseId + "-" + material + "-" + arm, caseId, material, arm,
      preregisteredStatus: caseId === "memos-get-shared" && material === "old-auto" ? "preparation-blocked" : "planned" })
  }
  const authors = packages.flatMap(p => ["markdown", "dsl"].flatMap(arm => ["original", "changed"].map(variant => ({ id: p.id + "-" + arm + "-" + variant, packageId: p.id, arm, variant }))))
  const oracle = await json(path.join(ak, "evaluator", "oracle.json"))
  oracle.schemaVersion = "authorization-al-oracle/v1"; oracle.materialRule += " Separately classify external unknown, missing authored premise, allowed-source gap, outside-allowlist gap and budget gap; allow multiple causes."
  await save(path.join(root, "evaluator", "oracle.json"), { ...oracle, authorCriteria: [
    { packageId: memos.id, source: ["server/api/v1/space_service.go:750-763", "server/api/v1/space_service.go:54-59"], original: { "self-leave": "allow/source_refuted", "other-member": "deny/source_refuted" }, changed: { "self-leave": "allow/source_refuted", "other-member": "deny/source_supported_failure" } },
    { packageId: paperless.id, source: ["src/documents/views.py:1877-1892", "src/documents/permissions.py:624-635"], original: { "view-only": "conditional: absent allow/failure; other-present deny/enforced; current unknown", "change-granted": "allow/source_refuted under both owner branches" }, changed: { "view-only": "deny/source_refuted", "change-granted": "allow/source_refuted" }, completeness: "Requested absent/other-present counterfactuals remain explicit; no post-hoc nonnull premise." } ] }, true)
  const plan = { schemaVersion: "authorization-al-study/v1", model: old.model, executionOptions: old.executionOptions, budgets: { maxFiles: 12, maxIndexReadBytes: 1048576, maxDisplayBytes: 65536, maxFinalBytes: 65536, maxDepth: 3, positionRounds: 2, formatRepairs: 1 },
    registeredBeforePaid: true, sourceReuse: "fixed public-development refs; target read-only; no synthetic consumer source change",
    cases, units, authors, consumers: authors.map(a => ({ ...a, declaredObligations: 2 })), publicBriefs: await bind(path.join(root, "public-briefs.json")), authorBriefs: await bind(path.join(root, "author-briefs.json")),
    scaffoldBindings, ordinaryGuide: [await bind(path.join(root, "ordinary-author-template.json")), await bind(path.join(root, "ordinary-init-report.json")), await bind(path.join(repo, "schemas/authorization/authoring-v2.schema.json")), await bind(path.join(repo, "examples/authorization-assessment/evidence-editing/entry-seed-v2.json")), await bind(path.join(repo, "examples/authorization-assessment/evidence-editing/policy-change.json"))],
    evaluatorBindings: [await bind(path.join(root, "evaluator", "oracle.json"))], analysis: { method: "plain", wire: "v6", assessmentMode: "explicit-v1", reasoning: "standard" },
    noUnknownResend: true, noLowScoreResampling: true, sharedBugRevision: { maxBlocks: 1, maxAffectedSessions: 8, requireDeterministicCounterexample: true }, paidConnectivityChecks: 0 }
  await save(path.join(root, "study-plan.json"), plan, true)
  console.log(JSON.stringify({ status: "registered", preparations: 8, qualityRows: units.length, authorDrafts: authors.length, consumers: authors.length, providerCalls: 0 }))
}
