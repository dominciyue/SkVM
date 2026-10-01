import path from "node:path"
import { root, json, save } from "./study.ts"
import { ReviewSchema } from "./evaluate.ts"

// Source-grounded main-agent decisions. The first round preceded aggregate
// unblinding; final targeted corrections followed concrete source discrepancies.
// Original independent receipts remain immutable; this script performs no model call.
const evaluator = path.join(root, "evaluator")
const original = await json(path.join(evaluator, "reviews.json"))
const firstReceipts = await json(path.join(evaluator, "raw-receipts.json"))
const secondReceipts = await json(path.join(evaluator, "second-receipts.json"))
const finalReceipts = await json(path.join(evaluator, "final-targeted-receipts.json"))
const graphAudits = await json(path.join(evaluator, "graph-audits.json"))
const parseReceipt = (receipt: any) => JSON.parse(receipt.rawFinalText.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""))
const initialReviews = firstReceipts.receipts.flatMap((r: any) => parseReceipt(r).reviews)
const secondReviews = secondReceipts.receipts.flatMap((r: any) => parseReceipt(r).reviews)
const finalReviews = finalReceipts.receipts.flatMap((r: any) => { const v = parseReceipt(r); return Array.isArray(v) ? v.map(x => ({ id: x.packetId, ...x })) : Object.entries(v).map(([id, value]) => ({ id, ...(value as object) })) })
const full = new Set([
  "df35983b306b", "c447297835e5", "adbc5b07ff27",
  "a77069a4e25d", "88121a21070a", "1f6b3e10f8fb",
  "dd4ec72c24df", "9a9eff221360", "c663bf34a01b",
])
const incorrect = new Set(["b1092582bce8", "878a6454ee73"])
const sourceDecisions: Record<string, string[]> = {
  "888560434172": ["initial/final.questions[0].missing expressly leave PassUserMixin unread while behavior assumes serializer self.user is the request principal. The current task asks for relevant inherited/serializer controls; this readable actor-binding path remains unsupported. q1-deny-object-view also omits non-null ownership in its condition, while its explanation correctly narrows rejection to owned documents: partial ambiguity, not a proven decisive error.", "paperless/src/documents/views.py:406-428 binds request.user to serializer user; serialisers.py:2851-2885 validates self.user; permissions.py:624-635 includes null-owner bypass. Main adjudication retains partial despite the targeted advisory full grade; no current policy ownership ban is invented."],
  "93192256285a": ["initial/final.questions[1].missing and policyAssessment explicitly leave has_perms_owner_aware unread and policy undetermined. That helper is within the allowed source, so the exact-document authorization gap is avoidable.", "paperless/src/documents/permissions.py:624-635; serialisers.py:2873-2885. Targeted independent source review confirms partial; concrete request facts alone are not the reason."],
  "9c8d199c729c": ["initial/final.questions[0].missing leave PassUserMixin, PaperlessObjectPermissions, OwnedObjectSerializer and has_perms_owner_aware unread; no permissions.py evidence range was read. Actor binding and object-helper branches remain avoidable source gaps.", "paperless/src/documents/views.py:406-428; permissions.py:30-55,624-635; serialisers.py:2851-2885. Targeted independent source review confirms partial; not a semantic error merely because caller/grants are unknown."],
  "b1092582bce8": ["initial/final.questions branches get-no-object-grant-nonowner and post-no-object-grants-nonowner treat grants not supplied by the brief as absent; unspecified ownership also does not establish another non-null owner.", "paperless/src/documents/permissions.py:624-635 and views.py:1857-1892: null owner passes each object check. The supplied brief explicitly requires retaining the unknown owner/grant branches."],
  "878a6454ee73": ["initial/final.questions POST post-without-change-grant and post-no-view deny for a non-owner without the relevant grant, without requiring a non-null other owner. A null owner also differs from the caller and bypasses the check.", "paperless/src/documents/permissions.py:624-635; views.py:1879-1892. This is a wrong branch, independent of the correctly stated policy violation."],
  "a77069a4e25d": ["initial/final.questions preserve unowned, caller-owned, other-owned grant-present/grant-absent, global gate and not-found branches; the view and change checks and effect use the same document.", "paperless/src/documents/permissions.py:624-635,673-699; views.py:1841-1892. Conditional current facts do not make this bounded answer partial."],
  "88121a21070a": ["initial/final.questions use the changed owner=null premise; final prose labels non-null-owner branches outside the current premise. Authentication/global permissions remain legitimately conditional.", "paperless/src/documents/permissions.py:624-635,673-699; views.py:1841-1892. Invalid proposal bindings/evidence IDs prevent checked delivery but do not erase the source-correct raw answer and prose."],
  "1f6b3e10f8fb": ["initial/final.questions and final prose retain unowned, caller-owned and other-owner grant/denial branches, and compare ownership substitution against the independently supplied policy.", "paperless/src/documents/permissions.py:624-635,673-699; views.py:1841-1892. Missing concrete request facts are legitimate conditional premises; the two graph conflicts are a separate extraction issue."],
  "54b9e793caa5": ["initial/final.questions and prose establish the downstream non-self ADMIN/self distinction and last-active-admin restriction using all three backend bodies. However, requireCurrentSpaceUser and resolveSpaceMemberResource bodies were not shown in this packet: upstream caller/member-resource binding remains a readable source gap rather than a deployment-only fact.", "memos/server/api/v1/space_service.go:19-59,632-663,740-760; store/db/sqlite/space.go:424-465, postgres/space.go:457-490, mysql/space.go:419-452. Policy v1 does not guarantee unconditional self-removal; its last-admin policy uncertainty is defensible and is not the reason for partial. The counterpart changed native packet did read space_service.go:1-75 and632-665."],
  "53d45e8efb6a": ["initial.questions process-file-input-output-identity/bypass explicitly says no vector write occurs while the file is still updated. Its deny label concerns that effect; the separate bypass-enabled branch correctly reports successful file update/response.", "owui/backend/open_webui/routers/retrieval.py:1673-1681. No decisive bypass error is established; actual missing auth and file query bodies keep first/final partial."],
  "df35983b306b": ["initial/final.questions distinguish owner-constrained file lookup from independently supplied collection_name, preserve admin/other-user and processing branches, and bound external backend claims.", "owui/backend/open_webui/models/files.py:161-185; routers/retrieval.py:1546-1764,1340-1539. Full bounded raw answer exists despite later budget exhaustion."],
  "c447297835e5": ["initial/final.questions correctly deny an ordinary member removing another member, preserve admin/self/last-admin branches and compare policy v1.", "memos/server/api/v1/space_service.go:19-59,632-663,740-760 and the cited backend deletion bodies. Policy-behavior-conflict on an incomplete formal policy/path graph is not a semantic false rejection of this raw answer."],
  "adbc5b07ff27": ["initial/final.questions compare current policy v2, allowing any active member to remove another, with actual ADMIN-only different-target enforcement; violation and self-removal restrictions are correctly described.", "memos/server/api/v1/space_service.go:740-760 and cited backend bodies. Adapter interruption and missing final prose do not erase the two captured structured answers."],
  "3d3ee2ac568b": ["initial/final.questions bound the answer to PostgreSQL while leaving ordinary current-user/admin helper and other allowed backend bodies unresolved.", "memos/server/api/v1/space_service.go:19-59,632-663,740-760; other shipped backends are inside this task's allowed source. Deployment selection is external, but these source bodies are readable."],
}
const groupAnchors: Record<string, string> = {
  "memos-remove": "memos/server/api/v1/space_service.go:19-59,632-663,740-760; store/db/{sqlite,postgres,mysql}/space.go deletion bodies",
  "paperless-notes": "paperless/src/documents/permissions.py:624-635,673-699; src/documents/views.py:1841-1892",
  "owui-ingestion": "owui/backend/open_webui/models/files.py:161-185; utils/auth.py:458-464; routers/retrieval.py:1340-1539,1546-1764",
  "gitea-self-query": "gitea/routers/api/v1/repo/collaborators.go:GetRepoPermissions; services/context/api.go:328-331; models/perm/access/repo_permission.go:426-557",
  "gitea-create-issue": "gitea/routers/api/v1/repo/issue.go:CreateIssue; models/unit; services/issue issue creation path",
  "paperless-share-create": "paperless/src/documents/views.py:406-428,4660-4735; serialisers.py:2851-2885; permissions.py:30-55,624-635",
  "paperless-download": "paperless/src/documents/views.py:1375-1448,1834-1839; versioning.py:169-195; permissions.py:30-53,624-635",
  "memos-share": "memos/server/api/v1/memo_share_service.go:170-213; memo_access.go:15-39; core/access/memo.go:87-153",
}
const groups = await json(path.join(evaluator, "groups.json"))
const reviews: any[] = [], records: any[] = []
for (const first of initialReviews) {
  const p = await json(path.join(evaluator, "packets", `${first.id}.json`))
  const suffix = first.id.slice("packet-".length)
  const second = secondReviews.find((r: any) => r.id === first.id)
  const graph = graphAudits.audits.find((r: any) => r.id === first.id)
  const finalReview = finalReviews.find((r: any) => r.id === first.id)
  const group = groups.find((g: any) => g.packets.some((x: any) => x.id === first.id)).case
  const anchor = groupAnchors[group] ?? group
  const evidence = sourceDecisions[suffix] ?? [
    ...(second?.initial?.evidence ?? first.initial.evidence),
    ...(second?.final?.evidence ?? first.final.evidence), anchor,
  ]
  const delivered = !!(p.initial || p.final || p.prose)
  const rating = !delivered ? "not-delivered" : incorrect.has(suffix) ? "incorrect" : full.has(suffix) ? "full" : "partial"
  const grade = { rating, decisiveError: incorrect.has(suffix), overUnknown: rating === "partial", falseComplete: false, evidence }
  const r = { ...structuredClone(first), initial: structuredClone(grade), final: structuredClone(grade) }
  r.causes = !delivered ? [p.status === "timeout-unknown" ? "infrastructure" : "protocol"] : incorrect.has(suffix) ? ["premise-branch"] : rating === "partial" ? ["not-read"] : []
  const initialRules = p.extractionInitial?.rules ?? [], finalRules = p.extractionFinal?.rules ?? []
  r.extraction = {
    initial: initialRules.length ? "partial" : "none", final: finalRules.length ? "partial" : "none",
    incorrectRules: [], wrongPremiseMappings: [], amplifiedError: false,
    evidence: [initialRules.length || finalRules.length ? `${p.id}.json extractionInitial/extractionFinal and preserved proposals; ${anchor}. Source-correct prose is separate from incomplete typed control/premise/path representation.` : `${p.id}.json: no actual control rules in first or final graph; legacy observations are not this extraction.`, ...(initialRules.length || finalRules.length ? [graph?.extraction?.evidence?.[0] ?? "Retained source anchors and proposal bodies are authoritative; graph auditor metadata is advisory."] : [])],
  }
  if (initialRules.length || finalRules.length) {
    if (p.hostChecks.some((c: any) => c.diagnostics.some((d: any) => d.code === "premise-not-supplied"))) r.extraction.wrongPremiseMappings.push("Retained predicate proposal references values not established by exact current-user premise spans; see premise-not-supplied diagnostics and those proposal conditions.")
    if (["c447297835e5", "cad3dcf49056", "e253a7ea408c", "f1e6017fdc27"].includes(suffix)) r.extraction.incorrectRules.push("Preserved proposals contain unsupported/empty predicate forms or unresolved explicit revisions; see proposal diagnostics and rule conditions, rather than inferring semantic support from citations.")
    if (suffix === "88121a21070a") r.extraction.wrongPremiseMappings = ["First null-owner source claims are correct, but the bindings proposal does not satisfy the current binding contract; the final accepted graph is empty."]
    r.causes = [...new Set([...r.causes, "extraction-error"])]
  }
  if (initialRules.length || finalRules.length) r.extraction.evidence.push("Extraction partial means the complete requested typed branch/control/effect graph is not established; it does not assert that every cited prose claim is wrong. User premise bindings and source binding nodes are distinct contracts.")
  const auto = p.schedulerActions.filter((a: any) => a.output.status === "ok")
  const helperHits = auto.map((a: any) => {
    const symbol = p.dependencies.find((d: any) => d.id === a.dependencyId)?.symbol ?? "retained dependency"
    return `${a.dependencyId}: ${symbol}; ${a.output.evidence.map((e: any) => `${e.path}:${e.startLine}-${e.endLine}`).join(", ")}`
  })
  r.mechanism = {
    decisiveHelperHits: helperHits, irrelevantOrInvalidReads: [], correctExcludedBranches: [], wrongExcludedBranches: [],
    justifiedResiduals: delivered ? (second?.mechanism?.justifiedResiduals ?? first.mechanism.justifiedResiduals).filter((s: string) => !/uninspected|unread|not read|helper/i.test(s)) : [],
    avoidableResiduals: rating === "partial" ? [...(second?.mechanism?.avoidableResiduals ?? first.mechanism.avoidableResiduals), `Requested source-visible control/effect remains unresolved; ${anchor}`] : [],
    checkerDetections: [], checkerFalseRejections: [], checkerMisses: [],
    evidence: [`${p.id}.json schedulerActions, dependencies and hostChecks; ${anchor}. Only actual scheduler reads count as automatic hits; semantic raw branches are not host exclusions.`],
  }
  for (const [index, check] of p.hostChecks.entries()) {
    const d = check.diagnostics.find((x: any) => x.code === "object-binding-missing")
    const rules = index === 0 ? initialRules : finalRules
    const rule = d && rules.find((x: any) => x.key === d.path)
    const missing = rule && ["principal", "resource"].filter(field => rule[field] && !rules.some((x: any) => x.questionId === rule.questionId && x.kind === "binding" && x.bindingKey === rule[field] && x.bindingKind === field))
    if (missing?.length) r.mechanism.checkerDetections.push(`check[${index}] ${d.code} at ${d.path}: rule names ${missing.join("/")} without a matching source binding node. src/task-dsl/authorization/control-conclusion.ts:64. Detection of an incomplete typed graph, not independent proof of source meaning.`)
    const invalid = check.diagnostics.find((x: any) => x.code === "predicate-invalid")
    if (invalid) r.mechanism.checkerDetections.push(`check[${index}] predicate-invalid at ${invalid.path}: the retained proposed condition is outside the finite predicate grammar. This is an expression-contract detection.`)
  }
  r.notes = !delivered ? `No raw answer or native prose. ${p.status}; extraction proposals, if any, remain separately graded. ${p.error}` : `${evidence[0]} First and final are graded on actual captured answers. Semantic checker false rejection, false acceptance, error amplification and automatic branch-exclusion benefit are not established by this packet.`
  ReviewSchema.parse(r)
  records.push({ id: r.id, group, basis: evidence, initialReview: first, secondReview: second ?? null, graphAudit: graph ?? null, finalTargetedReview: finalReview ?? null, adjudicatedReview: r })
  reviews.push(r)
}
if (reviews.length !== 56 || new Set(reviews.map(r => r.id)).size !== 56) throw new Error("Expected 56 unique registered review packets")
const reviewers = [
  ...original.reviewers.filter((r: any) => !r.adjudicator),
  ...secondReceipts.receipts.map((r: any) => ({ id: r.agentPath.split("/").at(-1), agentPath: r.agentPath, role: "default", forkTurns: "none", independent: true, scope: "targeted second semantic review; advisory" })),
  ...[...new Set(graphAudits.audits.map((r: any) => r.reviewer))].map(id => ({ id, role: "default", forkTurns: "none", independent: true, scope: "typed graph and scheduler audit; advisory" })),
  ...finalReceipts.receipts.map((r: any) => ({ id: r.agentPath.split("/").at(-1), agentPath: r.agentPath, role: "default", forkTurns: "none", independent: true, scope: "final targeted source verification after a concrete helper-gap discrepancy; advisory" })),
  { id: "main-source-adjudicator", independent: false, adjudicator: true, developerAlreadyExposed: true },
]
const uniqueReviewers = [...new Map(reviewers.map(r => [r.id, r])).values()]
const adjudication = {
  artifact: "evaluator/adjudications.json", script: "adjudicate.ts", performedBeforeUnblinding: false,
  firstRoundBeforeAggregateUnblinding: true, finalTargetedCorrectionsAfterAggregateUnblinding: true,
  originalReceiptsPreserved: true, independentFirstReviewers: 6, targetedSecondReviewers: 3, graphAuditors: 2, finalTargetedSourceVerifiers: 2,
  mainAdjudicatorIndependent: false, semanticSupportOfAllIndividualRulesEstablished: false,
  rules: ["Judge actual raw first/final and final prose separately from host acceptance/status", "Unspecified current facts can support a complete conditional answer", "No actual graph means extraction none", "Only schedulerActions establish automatic reads; no host-inapplicable paths were observed", "Protocol/schema failures are not semantic checker detections", "No proven amplification/false acceptance/false rejection is not a claim of checker completeness"],
}
await save(path.join(evaluator, "adjudications.json"), { ...adjudication, records }, false)
await save(path.join(evaluator, "reviews.json"), { reviewers: uniqueReviewers, adjudication, reviews }, false)
console.log(`Adjudicated ${reviews.length} packets against retained source and actions; provider calls=0`)
