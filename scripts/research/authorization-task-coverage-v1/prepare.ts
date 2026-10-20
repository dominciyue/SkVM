// Source-first registration; this file and evaluation outputs are never model input.
import { readFile, copyFile, mkdir, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { AuthorizationInquiryInputSchema } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, root, repo, load, save, hash, relative } from "./evidence.ts"
const prior = path.join(root, "authorization-answer-transfer-v1"), domain = path.join(root, "authorization-domain-execution-v1/model")
const mKey = "shared-memo-access", gKey = "create-issue"
const mBasis = ["server/api/v1/memo_share_service.go:172-229", "server/api/v1/memo_access.go:10-42", "core/access/memo_resolve.go:21-92", "core/access/memo.go:92-158", "server/api/v1/memo_service_converter.go:26-137", "server/api/v1/acl_config.go:45-86", "server/api/v1/authz.go:93-118"]
const gBasis = ["routers/api/v1/api.go:327-369,414-423,472-479,782-805,877-882,1642-1766", "routers/api/v1/repo/issue.go:570-652", "models/perm/access/repo_permission.go:95-154", "services/issue/issue.go:24-83", "models/issues/issue_update.go:360-476", "services/issue/status.go:17-45", "services/convert/issue.go:32-117"]
async function allFiles(dir: string): Promise<string[]> {
  const s = await stat(dir)
  if (s.isFile()) return [dir]
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.filter(e => e.name !== ".git").map(e => allFiles(path.join(dir, e.name))))).flat()
}
export async function prepare(correctPreflight = false) {
  const ledger = await load(path.join(base, "attempts.json"))
  if (ledger.length) throw new Error("Cannot register after inference")
  if (await Bun.file(path.join(base, "registration.json")).exists()) {
    if (!correctPreflight) throw new Error("Registration already frozen")
    await copyFile(path.join(base, "registration.json"), path.join(base, "registration-preflight-invalid.json"))
    await save(path.join(base, "verification/registration-correction.json"), { providerCalls: 0, cause: "G input used conformance as question intent and nested arrays unsupported by finite input schema", correction: "policy-comparison intent and top-level finite collections, unchanged scenario semantics and oracle", previousRegistration: "registration-preflight-invalid.json" })
  }
  const m = await load(path.join(prior, "inputs/memos-original.json"))
  m.sourceNotes.text = m.sourceNotes.text.replace("starting from an empty draft", "repairing the supplied existing draft")
  m.sourceNotes.text += " conversionUsers is the finite population returned by the later ListUsers call during conversion, separately from users used for access context; conversionCreator in storeErrors describes that operation's error. These are synthetic database observations, not an expected answer."
  const mf = m.resourceInputs[mKey]
  mf.conversionUsers = structuredClone(mf.users); mf.storeErrors.conversionCreator = null
  const m1 = structuredClone(m); m1.resourceInputs[mKey].conversionUsers = []
  const originalG = await load(path.join(domain, "inputs/gitea-create-issue.json"))
  const { brief, mode, policy, ...metadata } = originalG
  const g: any = { ...metadata, sourceRoot: "../../authorization-domain-execution-v1/model/public-source/gitea",
    inquiry: { schemaVersion: "authorization-inquiry/v2", mode, policy, operations: [{ id: "create-issue-operation", request: brief, entryHint: "routers/api/v1/repo/issue.go::CreateIssue" }],
      questions: [{ id: gKey, request: brief + " Explain how supplied fields are handled, what happens before and after creation, and what the response or later errors establish.", principal: "authenticated repository reader or issues-unit writer", resource: "repository issue and related creation fields", operation: "create issue", operationId: "create-issue-operation", intent: "policy-comparison", premises: [], entryHint: "CreateIssue API route, handler and necessary allowed helpers" }] },
    resourceInputs: { [gKey]: {
      request: { Method: "POST" }, principal: { ID: 31, IsSigned: true, IsSiteAdmin: false, IsRepoAdmin: false },
      repository: { ID: 83, OwnerID: 7, IsArchived: false, IsPrivate: false, CanEnablePulls: true },
      permission: { AccessMode: 1, IssuesUnitPresent: true, IssuesUnitMode: 1, PullRequestsUnitPresent: true, PullRequestsUnitMode: 1 },
      token: { ApiTokenScopePresent: false, PublicOnly: false }, tokenScopes: [],
      form: { Title: " finite issue ", Body: "Synthetic issue body", Ref: "main", Deadline: 2000, Milestone: 12, Assignee: "", Closed: false },
      formLabels: [5], formAssignees: [], formProjects: [],
      assignees: [], blockedUserIDs: [], createdIssue: { ID: 141, Index: 9 },
      errors: { repositoryAssignment: null, binding: null, assigneeNames: null, assigneeLookup: null, assignability: null, loadPoster: null, createTransaction: null, mentions: null, close: null, refetch: null, responseLoad: null }
    } },
    sourceNotes: { format: "markdown", text: "This is a researcher-authored source review, not a live service run. The policy is an experimental user policy, not an assertion of Gitea's intended security policy. Preserve the complete natural task and relevant alternate branches. In edit mode create a reusable source program from an empty draft; in consume mode keep the supplied raw unchanged. Facts are synthetic middleware context fields, form values, finite database rows and operation errors. AccessMode and unit modes use the source enum; unit presence/modes describe stored permission context rather than an allow verdict. ApiTokenScopePresent says whether ApiTokenScope exists in context. Error null means normal completion, not permission; missing fields remain unknown. createTransaction is the observed error returned by the visible transaction call, not evidence of commit/rollback. responseLoad refers to a response-converter load operation. assignees and blockedUserIDs are complete finite populations. Read source-visible authorization and field handling; retain unavailable middleware, transaction internals and deployment facts as explicit limits. Do not call the target service." } }
  g.sourceNotes.text += " For the finite input format, tokenScopes and formLabels/formAssignees/formProjects carry the corresponding source collections separately from the scalar token/form maps."
  const g1 = structuredClone(g)
  g1.resourceInputs[gKey].permission.AccessMode = 2; g1.resourceInputs[gKey].permission.IssuesUnitMode = 2
  g1.resourceInputs[gKey].errors.refetch = "database-read-error"
  for (const [name, input] of Object.entries({ "memos-original": m, "memos-changed": m1, "gitea-original": g, "gitea-changed": g1 })) { AuthorizationInquiryInputSchema.parse(input); await save(path.join(base, `inputs/${name}.json`), input) }
  await mkdir(path.join(base, "authoring"), { recursive: true })
  await copyFile(path.join(prior, "authoring/automatic-program.json"), path.join(base, "authoring/memos-inherited-program.json"))
  const cases: any[] = (await load(path.join(prior, "evaluation/cases.json"))).map((c: any) => {
    const originalInputSha256 = hash(JSON.stringify(c.input)), input = structuredClone(c.input), facts = input.resourceInputs[mKey]
    // Preserve all historical case facts and expectations; expose the later
    // observation explicitly with the same population when one was supplied.
    if (facts.users) facts.conversionUsers = structuredClone(facts.users)
    facts.storeErrors.conversionCreator = null
    input.sourceNotes = structuredClone(m.sourceNotes)
    return { ...c, input, task: "M", inheritedBR: true, addedFacts: "conversionUsers copies supplied users; conversionCreator error null; original facts unchanged", checks: ["scalar-outcome", "selected-response-fields"], originalInputSha256 }
  })
  const addM = (name: string, change: (f: any) => void, expected: any, checks = ["scalar-outcome", "call-order", "first-error"]) => {
    const input = structuredClone(m); change(input.resourceInputs[mKey]); cases.push({ task: "M", name, group: "source-order-and-conversion", input, expected, checks, sourceBasis: mBasis })
  }
  addM("unrecognized-audience-after-context-error", f => { f.memos[0].Visibility = "OTHER"; f.storeErrors.viewer = "lookup-error" }, { disposition: "NotFound", order: ["memo lookup", "viewer lookup error"], notReached: ["creator lookup", "audience guard"], note: "Same final error as old raw is not order fidelity" })
  addM("invalid-creator-still-resolves-space", f => { f.users[0].RowStatus = "INVALID"; f.memos[0].SpaceID = 99; f.storeErrors.space = "space-error" }, { disposition: "NotFound", order: ["creator lookup", "space lookup error"], notReached: ["creator-valid guard"] })
  addM("invalid-creator-still-resolves-member", f => { f.users[0].RowStatus = "INVALID"; f.contextUserID = 22; f.memos[0].SpaceID = 99; f.spaces = [{ ID: 99, UID: "space-a", RowStatus: "NORMAL" }]; f.storeErrors.membership = "membership-error" }, { disposition: "NotFound", order: ["creator lookup", "space lookup", "membership lookup error"], notReached: ["creator-valid guard"] })
  addM("conversion-creator-disappeared", f => { f.conversionUsers = [] }, { disposition: "NotFound", order: ["reactions", "attachments", "conversion creator lookup"], notReached: ["response return"] })
  addM("conversion-creator-database-error", f => { f.storeErrors.conversionCreator = "database-error" }, { disposition: "wrapped-conversion-error", notEquivalentTo: "NotFound", order: ["reactions", "attachments", "conversion creator lookup"] })
  addM("reactions-error-precedes-attachments", f => { f.storeErrors.reactions = "reaction-error"; f.storeErrors.attachments = "attachment-error" }, { disposition: "Internal", firstError: "reactions", notReached: ["attachments", "conversion"] })
  addM("missing-conversion-population", f => { delete f.conversionUsers }, { disposition: "unknown", blocked: "conversion creator lookup" }, ["missing-fact"])
  const addG = (name: string, change: (f: any) => void, expected: any, checks = ["scalar-outcome", "call-order", "local-effect"]) => {
    const input = structuredClone(g); change(input.resourceInputs[gKey]); cases.push({ task: "G", name, group: "source-first", input, expected: { ...expected, targetExecution: false, databaseCommitOrRollback: "unknown" }, checks, sourceBasis: gBasis })
  }
  const writer = (f: any) => { f.permission.AccessMode = 2; f.permission.IssuesUnitMode = 2 }
  addG("reader-create", () => {}, { status: 201, reachesCreation: true, fields: { DeadlineUnix: 0, MilestoneID: 0, Labels: [], Assignees: [] }, policy: "nonconforming-to-supplied-policy", response: "issue representation" })
  addG("writer-create", writer, { status: 201, reachesCreation: true, fields: { DeadlineUnix: 2000, MilestoneID: 12, Labels: [5] }, policy: "satisfies-write-requirement" })
  addG("anonymous-readable-repository", f => { f.principal.IsSigned = false }, { status: 401, reachesCreation: false })
  addG("archived-repository", f => { f.repository.IsArchived = true }, { status: 423, reachesCreation: false })
  addG("repository-reader-without-issue-read", f => { f.permission.IssuesUnitMode = 0 }, { status: 403, reachesCreation: false, note: "Readable pull unit reaches route-specific issues reader guard" })
  addG("no-readable-issue-or-pull-unit", f => { f.permission.IssuesUnitMode = 0; f.permission.PullRequestsUnitMode = 0 }, { status: 404, reachesCreation: false })
  addG("read-only-issue-token", f => { f.token.ApiTokenScopePresent = true; f.tokenScopes = ["read:issue"] }, { status: 403, reachesCreation: false, note: "Token write scope differs from repository unit write access" })
  addG("writer-assignee-name-missing", f => { writer(f); f.form.Assignee = "missing"; f.errors.assigneeNames = "user-not-exist" }, { status: 422, reachesCreation: false })
  addG("blocked-poster", f => { f.blockedUserIDs = [7] }, { status: 403, reachesCreation: false, note: "LoadPoster then blocker before transaction callback" })
  addG("creation-transaction-error", f => { f.errors.createTransaction = "database-error" }, { status: 500, reachesCreation: true, firstError: "transaction", notReached: ["mentions", "close", "refetch"], databaseOutcome: "not established by available implementation" })
  addG("creation-policy-error", f => { f.errors.createTransaction = "permission-denied" }, { status: 400, reachesCreation: true })
  addG("mentions-error-after-transaction-call", f => { f.errors.mentions = "database-error" }, { status: 500, reachesCreation: true, order: ["transaction call normal completion", "mentions error"], notReached: ["refetch"] })
  addG("close-dependency-after-create", f => { f.form.Closed = true; f.errors.close = "dependencies-left" }, { status: 412, reachesCreation: true, order: ["NewIssue normal completion", "CloseIssue error"], notReached: ["refetch"] })
  addG("writer-refetch-error", f => { writer(f); f.errors.refetch = "database-read-error" }, { status: 500, reachesCreation: true, order: ["NewIssue normal completion", "refetch error"], notReached: ["ToAPIIssue"], policy: "write requirement satisfied, response failure distinct" })
  addG("converter-load-error-is-empty-created-response", f => { f.errors.responseLoad = "database-error" }, { status: 201, reachesCreation: true, response: "empty issue object; converter has no error return" })
  addG("missing-permission-context", f => { delete f.permission }, { status: "unknown", reachesCreation: "unknown", blocked: "issues-unit access" }, ["missing-fact"])
  for (const c of cases) AuthorizationInquiryInputSchema.parse(c.input)
  await save(path.join(base, "evaluation/cases.json"), cases)
  await save(path.join(base, "evaluation/rubric.json"), {
    sourceFirst: true, automaticKeywordScoring: false, targetExecutions: 0, wholeTask: "full only when every applicable original duty is correct and sufficient; partial/incorrect/not-delivered remain in denominator",
    M: { question: m.inquiry.questions[0].request, sourceBasis: mBasis, domains: {
      binding: "UID lookup binds share.MemoID to memo.ID; no arbitrary adjacent object access",
      expiryAndFailures: "strict now > expiry; nil expiry, missing/revoked share, store errors and order",
      accessAndOrder: "initial normal/nonSPACE gate; context before creator/recognized audience checks; exact-share exception before ordinary membership; SPACE disallowed",
      anonymousEntry: "GetSharedMemo public AND bootstrap registration permits private-instance anonymous entry; context error and actual deployment limits distinct",
      responseAndErrors: "reactions/attachments scoped to memo; second creator lookup missing=>NotFound, other conversion errors wrapped; Parent cleared, Relations empty, placement not a neighboring access grant; do not promise full payload without source",
      limits: "synthetic scenario, finite source scope, no live service/deployment/security certification; unread dependencies named"
    } },
    G: { originalBrief: brief, question: g.inquiry.questions[0].request, policy, sourceBasis: gBasis, domains: {
      route: "issue token write scope when token context present, repository assignment/public-only scope, mustEnableIssuesOrPulls, signed identity, archived check, input binding and issues reader guard including repo/site admin exceptions",
      permissionAndPolicy: "source creation accepts issues readers; general repository read alone may lack issues read; writer gates selected fields rather than creation; compare to experimental user write policy without alleging upstream vulnerability",
      fields: "nonwriter deadline/milestone/assignee omitted and labels cleared; basic title/body/ref/poster/repo retained, Projects forwarded; writer assignee errors/assignability inspected",
      effectAndOrder: "LoadPoster/blocking before transaction callback, model issue creation/assignees/projects inside visible callback, mentions after; unknown db.WithTx implementation and actual target effect",
      responseAndErrors: "NewIssue error mapping403/400/500, optional close412/500 after creation call, refetch500 after creation, successful201; converter load failure returns empty issue object not a new handler error",
      limits: "source-policy distinction, synthetic context/error observations, unavailable transaction internals/deployment, no real issue or proven committed write"
    } },
    comparison: "Same block same raw/model/source/budget; N-to-R includes author preparation; R-to-E is execution increment only if actual adoption and comparable epoch. No-raw/invalid raw consumers retain source access; execution increment unavailable."
  })
  const files: Record<string, string> = {}
  const register = async (p: string) => { files[relative(p)] = hash(await readFile(p)) }
  for (const input of [m, g]) for (const allow of input.allowedPaths) {
    const location = path.join(domain, "public-source", input === m ? "memos" : "gitea", allow)
    for (const file of await allFiles(location)) await register(file)
  }
  for (const p of await allFiles(path.join(domain, "source-skills/github-security-review"))) await register(p)
  for (const name of ["inputs/memos-original.json", "inputs/memos-changed.json", "inputs/gitea-original.json", "inputs/gitea-changed.json", "evaluation/cases.json", "evaluation/rubric.json", "authoring/memos-inherited-program.json"]) await register(path.join(base, name))
  await save(path.join(base, "registration.json"), { identity: "authorization-task-coverage-v1", registeredAt: new Date().toISOString(), beforeFirstProvider: true, providerCalls: 0, files,
    provenance: { originalMInput: relative(path.join(prior, "inputs/memos-original.json")), originalGInput: relative(path.join(domain, "inputs/gitea-create-issue.json")), skill: relative(path.join(domain, "source-skills/github-security-review/SKILL.md")), gPolicy: "experimental user policy, not upstream intended policy", facts: "researcher synthetic; not deployment", source: "previously-exposed development; exact archived refs", oracle: "main-agent source review, outside model roots", gTransactionImplementation: "models/db absent from archived allowed paths; commit/rollback unknown" },
    states: { M0: "private-instance anonymous, expiry equal, original creator and conversion users present", M1: "only later conversion population empty; initial users still present", G0: "signed issues reader, ordinary success observations", G1: "issues writer plus later refetch error; two named source-first changes" },
    counts: { M: cases.filter(c => c.task === "M").length, G: cases.filter(c => c.task === "G").length }, protectedInputsChanged: false })
  return { registered: Object.keys(files).length, cases: cases.length, providerCalls: 0 }
}
if (import.meta.main) console.log(JSON.stringify(await prepare(process.argv.includes("--correct-preflight")), null, 2))
