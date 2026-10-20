// Independent developer-prepared finite reference; NEVER imported by automatic author preparation.
// Source-derived rules, not oracle answers. Original complete tasks remain in inputs.
import path from "node:path"
import { base, root, save, load } from "./evidence.ts"
const at = (path: string, startLine: number, endLine = startLine) => ({ path, startLine, endLine })
const ref = (name: string): any => {
  const [root, ...fields] = name.split(".")
  return fields.reduce((of: any, key) => ({ field: { of, key } }), { ref: root })
}
const lit = (value: any) => ({ literal: value })
const binding = (name: string) => ({ binding: name })
const eq = (a: any, b: any) => ({ op: "eq", left: a, right: b })
const nil = (name: string) => ({ op: "is-null", value: binding(name) })
const not = (arg: any) => ({ op: "not", arg })
const all = (...args: any[]) => ({ op: "all", args })
const any = (...args: any[]) => ({ op: "any", args })
const truth = (name: string) => eq(binding(name), lit(true))
const choose = (test: any, then: any, otherwise: any) => ({ choose: { test, then, else: otherwise } })
const value = (id: string, expression: any, source: any, when?: any) => ({ id, op: "value", value: expression, source, ...(when ? { when } : {}) })
const guard = (id: string, test: any, source: any, failure: string, when?: any) => ({ id, op: "guard", test, source, failure, ...(when ? { when } : {}) })
const select = (id: string, from: string, where: any, source: any, when?: any) => ({ id, op: "select", from, where, source, ...(when ? { when } : {}) })
function contract(task: "M" | "G", rootSource: any, inputs: string[], steps: any[], gaps: string[], coverage: any[]) {
  return { schemaVersion: "authorization-executable-contract/v1", id: `independent-reference-${task}`,
    description: "Developer-prepared source-derived finite reference. Not an automatically authored program, final answer or safety certificate.",
    scope: { kind: "function-contract", questionId: task === "M" ? "shared-memo-access" : "create-issue", root: rootSource, upstream: gaps },
    sourceDeclarations: [{ source: rootSource, statements: [] }], queries: [], assumptions: [],
    resourceWorkflow: { inputs, steps, gaps }, authoringTarget: { mode: "reusable", coverage } }
}
const order = (id: string, source: any, ids: string[]) => ({ id, source, stepIds: ids, disposition: "implemented", relation: { kind: "ordered-prefix" }, reason: "Source-derived order of finite observations and exits; effects/commit are not executed or inferred." })
export async function prepareReferences() {
  const prior = path.join(root, "authorization-task-coverage-v1")
  const mInput = await load(path.join(prior, "inputs/memos-original.json")), gInput = await load(path.join(prior, "inputs/gitea-original.json"))
  const ms = "server/api/v1/memo_share_service.go", mr = "core/access/memo_resolve.go", ma = "core/access/memo.go", mv = "server/api/v1/memo_access.go", mu = "server/api/v1/auth_service_session.go"
  const m: any[] = [
    guard("share_error", nil("storeErrors.share"), at(ms, 221, 225), "share-store-error"),
    select("share", "shares", eq(binding("row.UID"), binding("request.ShareToken")), at(ms, 221, 229)),
    guard("share_found", not(nil("share")), at(ms, 226, 229), "share-not-found"),
    guard("share_time", any(nil("share.ExpiresTs"), { op: "lte", left: binding("now"), right: binding("share.ExpiresTs") }), at(ms, 216, 229), "share-expired"),
    guard("memo_error", nil("storeErrors.memo"), at(ms, 178, 181), "memo-store-error"),
    select("memo", "memos", eq(binding("row.ID"), binding("share.MemoID")), at(ms, 178, 185)),
    guard("memo_entry_state", all(not(nil("memo")), eq(binding("memo.RowStatus"), lit("NORMAL")), not(eq(binding("memo.Visibility"), lit("SPACE")))), at(ms, 182, 184), "memo-entry-denied"),
    guard("viewer_error", nil("storeErrors.viewer"), at(mu, 269, 286), "context-error", not(eq(binding("contextUserID"), lit(0)))),
    select("viewer_row", "users", eq(binding("row.ID"), binding("contextUserID")), at(mu, 269, 286), not(eq(binding("contextUserID"), lit(0)))),
    guard("viewer_found", not(nil("viewer_row")), at(mu, 279, 286), "context-error", not(eq(binding("contextUserID"), lit(0)))),
    value("viewer", choose(all(not(nil("viewer_row")), eq(binding("viewer_row.RowStatus"), lit("NORMAL"))), ref("viewer_row"), lit(null)), at(mu, 269, 290)),
    guard("setting_error", nil("storeErrors.instanceSetting"), at(mv, 17, 29), "context-error", nil("viewer")),
    guard("creator_error", nil("storeErrors.creator"), at(mr, 36, 42), "context-error"),
    select("creator", "users", eq(binding("row.ID"), binding("memo.CreatorID")), at(mr, 36, 42)),
    value("creator_valid", { test: all(not(nil("creator")), eq(binding("creator.ID"), binding("memo.CreatorID")), { op: "member", value: binding("creator.RowStatus"), set: lit(["NORMAL", "ARCHIVED"]) }) }, at(mr, 41, 42)),
    guard("space_error", nil("storeErrors.space"), at(mr, 44, 51), "context-error", not(nil("memo.SpaceID"))),
    select("space", "spaces", eq(binding("row.ID"), binding("memo.SpaceID")), at(mr, 44, 51), not(nil("memo.SpaceID"))),
    guard("membership_error", nil("storeErrors.membership"), at(mr, 67, 79), "context-error", all(not(nil("space")), not(nil("viewer")), not(eq(binding("viewer.Role"), lit("ADMIN"))))),
    select("membership", "memberships", all(eq(binding("row.SpaceID"), binding("memo.SpaceID")), eq(binding("row.UserID"), binding("viewer.ID"))), at(mr, 75, 79), all(not(nil("space")), not(nil("viewer")), not(eq(binding("viewer.Role"), lit("ADMIN"))))),
    guard("creator_decision", truth("creator_valid"), at(ma, 92, 96), "memo-not-found"),
    guard("audience_decision", { op: "member", value: binding("memo.Visibility"), set: lit(["PUBLIC", "PROTECTED", "PRIVATE", "SPACE"]) }, at(ma, 97, 99), "memo-not-found"),
    guard("share_object", eq(binding("share.MemoID"), binding("memo.ID")), at(ma, 119, 122), "share-object-not-bound"),
    { id: "local_read_context", op: "return", value: { record: { memo_id: ref("memo.ID"), share_memo_id: ref("share.MemoID"), creator_valid: ref("creator_valid"), context_user_id: ref("contextUserID") } }, source: at(ma, 119, 122) },
  ]
  const mGaps = ["Evaluation begins at GetSharedMemo function entry. Public/bootstrap registration and private-instance transport activation require original source review; this finite function does not establish deployment reachability.", "This reference stops after shared local read access. Reaction/attachment reads, second creator lookup, conversion failures, payload and placement projection remain original task duties.", "Inputs are synthetic complete populations and observed error fields. No storage call or live service is executed."]
  const mRaw = contract("M", { path: ms, symbol: "GetSharedMemo" }, Object.keys(mInput.resourceInputs["shared-memo-access"]), m, mGaps, [
    order("context-before-decision", at(mr, 85, 90), ["creator_error", "creator", "creator_valid", "space_error", "space", "membership_error", "membership", "creator_decision", "audience_decision", "share_object"]),
    { id: "remaining-handler", source: at(ms, 191, 213), stepIds: [], disposition: "unwritten", reason: mGaps[1] },
  ])
  mRaw.sourceDeclarations.push({ source: { path: mr, symbol: "ResolveMemoReadContext" }, statements: [] })
  await save(path.join(base, "reference/M-program.json"), mRaw)
  const gh = "routers/api/v1/repo/issue.go", gp = "models/perm/access/repo_permission.go", gs = "services/issue/issue.go"
  const g: any[] = [
    // This reference deliberately starts at the handler after entry middleware.
    value("issues_mode", choose({ op: "gte", left: binding("permission.AccessMode"), right: lit(3) }, ref("permission.AccessMode"), ref("permission.IssuesUnitMode")), at(gp, 95, 108)),
    value("can_write", { test: { op: "gte", left: binding("issues_mode"), right: lit(2) } }, at(gp, 152, 155)),
    value("deadline", choose(all(not(nil("form.Deadline")), truth("can_write")), ref("form.Deadline"), lit(0)), at(gh, 570, 585)),
    value("milestone", choose(truth("can_write"), ref("form.Milestone"), lit(0)), at(gh, 587, 622)),
    value("labels", choose(truth("can_write"), ref("formLabels"), lit([])), at(gh, 619, 624)),
    guard("assignee_names_error", nil("errors.assigneeNames"), at(gh, 589, 599), "assignee-name-error", truth("can_write")),
    // Writer-assignee transformation is an unresolved boundary, never a synthetic upstream denial.
    { id: "writer_assignees", op: "external", name: "source_writer_assignee_validation", arguments: { single: ref("form.Assignee"), names: ref("formAssignees"), repository: ref("repository.ID") }, when: truth("can_write"), source: at(gh, 591, 618) },
    guard("writer_assignees_complete", truth("writer_assignees"), at(gh, 591, 618), "writer-assignee-validation-failed", truth("can_write")),
    guard("load_poster", nil("errors.loadPoster"), at(gs, 25, 28), "load-poster-error"),
    guard("blocked_owner", not({ op: "member", value: binding("repository.OwnerID"), set: binding("blockedUserIDs") }), at(gs, 30, 32), "blocked-user"),
    value("transaction_observation", ref("errors.createTransaction"), at(gs, 36, 62)),
    guard("transaction_return", nil("transaction_observation"), at(gs, 60, 62), "create-transaction-error"),
    value("mentions_observation", ref("errors.mentions"), at(gs, 64, 67)),
    guard("mentions_return", nil("mentions_observation"), at(gs, 64, 67), "mentions-error"),
    value("close_observation", ref("errors.close"), at(gh, 635, 644), truth("form.Closed")),
    guard("close_return", nil("close_observation"), at(gh, 635, 644), "close-error", truth("form.Closed")),
    value("refetch_observation", ref("errors.refetch"), at(gh, 646, 651)),
    guard("refetch_return", nil("refetch_observation"), at(gh, 648, 651), "refetch-error"),
    { id: "handler_fields", op: "return", value: { record: { can_write: ref("can_write"), deadline: ref("deadline"), milestone: ref("milestone"), repository_id: ref("repository.ID"), poster_id: ref("principal.ID"), title_before_model: ref("form.Title"), body: ref("form.Body"), ref: ref("form.Ref"), converter_load_observation: ref("errors.responseLoad") } }, source: at(gh, 570, 652) },
  ]
  const gGaps = ["Conditional handler-local reference: original parent route mustEnableIssuesOrPulls, token scope/public-only/repository assignment, reqToken, archive, binding and issues reader checks remain mandatory upstream source investigation. This reference does not prove handler reachability.",
    "Finite permission assumes supplied IssuesUnitMode is a present unitsMode entry; absent entry/everyone/anonymous fallback needs original source. AccessMode >= ADMIN overrides the entry.",
    "Writer-assignee name resolution/lookup/assignability is an unresolved external boundary, including empty-name handling and blocking by any assignee before the transaction. Supplied assignee populations are retained for original source review; no artificial success fact is injected. Reader path has no assignee IDs and skips it. Later writer events remain conditional, not a certified first error.",
    "Observed error fields model call-return order only. They do not execute creation, prove a committed write, reproduce notifications, model title truncation/trim or convert the complete response. Transaction internals and converter behavior require source review."]
  await save(path.join(base, "reference/G-program.json"), contract("G", { path: gh, symbol: "CreateIssue" }, Object.keys(gInput.resourceInputs["create-issue"]), g, gGaps, [
    order("create-followed-by-refetch", at(gh, 624, 652), ["load_poster", "blocked_owner", "transaction_observation", "transaction_return", "mentions_observation", "mentions_return", "close_observation", "close_return", "refetch_observation", "refetch_return", "handler_fields"]),
    { id: "parent-route-required", source: at("routers/api/v1/api.go", 1647, 1766), stepIds: [], disposition: "unwritten", reason: gGaps[0] },
  ]))
  return { providerCalls: 0, independentReferences: ["M", "G"], creation: "Developer-authored source reading and extracted original M tests; no automatic raw was read by this generator." }
}
if (import.meta.main) console.log(JSON.stringify(await prepareReferences()))
