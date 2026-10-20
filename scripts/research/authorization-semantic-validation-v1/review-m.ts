import path from "node:path"
import { readFile } from "node:fs/promises"
import { executeResourceWorkflow } from "../../../src/task-dsl/authorization/resource-relations.ts"
import { base, load, save, hash } from "./evidence.ts"

// These finite assertions are tied to the reviewed fixed source and raw, not
// natural-answer scores or a certification of all response/deployment behavior.
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
const matrix = await load(path.join(base, "evaluation/cases-M.json"))
const final = matrix.variants.find((v: any) => v.variant === "final")
const programFile = path.join(base, "automatic/M-final.json"), raw = await load(programFile)
const rows = final.rows.map((r: any) => {
  const e = r.execution, expected = r.inheritedExpected
  const disposition = e.conditions.length ? "unknown" : e.termination === "return" ? "return"
    : e.termination.startsWith("NOT_FOUND:") ? "NotFound" : e.termination.startsWith("INTERNAL:") ? "Internal"
    : e.termination.startsWith("CONVERSION ERROR:") ? "wrapped-conversion-error" : e.termination
  const values = expected.disposition === disposition && (!expected.memoID || e.returned?.memo_id === expected.memoID)
    && (!expected.content || e.returned?.content === expected.content)
    && (!Object.hasOwn(expected, "parent") || e.returned?.parent === expected.parent)
    && (!expected.relations || e.returned?.relation_count === 0)
  return { id: r.id, disposition, expectedDisposition: expected.disposition, selectedValuesMatch: values, remainingGaps: e.gaps }
})
assert(rows.every((r: any) => r.selectedValuesMatch), "review-selected-values")
const prefix = (id: string) => final.rows.find((r: any) => r.id === id).execution.events.filter((e: any) => e.outcome !== "skipped").map((e: any) => e.id)
const space = prefix("invalid-creator-still-resolves-space"), member = prefix("invalid-creator-still-resolves-member")
assert(space.includes("creator") && space.at(-1) === "space_store_ok" && !space.includes("read_policy_valid"), "space-before-creator-denial")
assert(member.includes("space") && member.at(-1) === "membership_store_ok" && !member.includes("read_policy_valid"), "member-before-creator-denial")
const inherited = (await load(path.join(base, "evaluation/inherited-cases.json"))).find((r: any) => r.name === "unrecognized-audience-after-context-error")
const facts = structuredClone(inherited.input.resourceInputs["shared-memo-access"])
assert(facts.contextUserID === 0, "document-inherited-case-as-observed")
facts.contextUserID = 22
const corrected = executeResourceWorkflow(raw.resourceWorkflow, facts)
assert(corrected.events.find(e => e.outcome === "rejected")?.id === "viewer_store_ok", "active-viewer-error-before-audience")
const sha256 = hash(await readFile(programFile))
const review = {
  task: "M", sha256, providerCalls: 0, businessWrites: 0, selectedFiniteComparisons: { matched: rows.length, total: rows.length, rows },
  sourceBasis: ["memo_share_service.go:172-229", "memo_access.go:17-40", "memo_resolve.go:31-90", "memo.go:92-122", "memo_service_converter.go:26-137"],
  ordering: { invalidCreatorSpaceError: space, invalidCreatorMemberError: member, correctedActiveViewerError: corrected.events.map(e => ({ id: e.id, outcome: e.outcome })) },
  inheritedCaseCorrection: { id: inherited.name, originalPreserved: true, reason: "contextUserID=0 skips fetchCurrentUser's lookup, so injected viewer error cannot be the first error. The original oracle order is wrong; main review checked a separate active-viewer case, without changing the frozen inherited file.", source: "auth_service_session.go:269-286; memo_access.go:17-29" },
  independentEvidence: { sourceExecution: "source/M-extraction.json: eight original access control-flow subcases with type shim, one isolated execution; no new Go execution here", sourceReview: "Main review directly checked exact raw and source anchors; scout reviewed identical checkpoint raw." },
  disputedReview: { reviewer: "bt_m_semantic_audit", initialVerdict: "no clear executable source-related local scope that is free of known misleading core behavior",
    basis: "Unmapped creator/audience/admin/membership obligations, semanticSupport unreviewed, incomplete conversion and placement. Reviewer also found exact token/expiry and coarse ordered steps.",
    adjudication: "The review did not produce a concrete behavior counterexample; unmapped obligations and unreviewed flags are not source truth and cannot by themselves reject an implemented local scope. Main reviewed the exact raw predicates/order against the cited source and original extraction evidence. Conversion/placement limitations are retained. Exact checkpoint currentDraft.raw equals frozen raw." },
  scope: "Unassigned GetSharedMemo token/object binding, strict expiry, normal/nonSPACE entry, context-first lookup/error order, creator/audience validity, admin or exact share decision, separate conversion creator and response summary.",
  limitations: ["No public/bootstrap transport-entry proof in this raw", "Assigned memo conversion reruns context and fetches Space again; those independent later observations are explicitly unwritten and the projected flag is only a summarized relation under successful stable context", "Does not materialize all reaction/attachment rows, snippets or protobuf fields", "Declared effectStepIds name guards/values rather than external calls: corrected shared projection marks effect evidence unknown; no actual source call or database effect is proved"],
  eligible: true, reason: "Frozen original input is unassigned. Source-related executable local scope and repaired context/error order are independently supported; partial response/transport duties remain visible. No known misleading core counterexample in that local scope. Eligibility is not full-task correctness."
}
await save(path.join(base, "evaluation/M-source-review.json"), review)
await save(path.join(base, "automatic/M-eligibility.json"), { task: "M", sha256, eligible: review.eligible, scope: review.scope, limitations: review.limitations, reason: review.reason, sourceReview: "evaluation/M-source-review.json" })
console.log(JSON.stringify({ sha256, eligible: review.eligible, selectedFiniteComparisons: rows.length, correctedOrderCases: 3 }, null, 2))
