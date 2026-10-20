import path from "node:path"
import { readFile, copyFile } from "node:fs/promises"
import { checkAuthorizationInquiry } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { executeResourceWorkflow } from "../../../src/task-dsl/authorization/resource-relations.ts"
import { projectProgramOutcome } from "../../../src/task-dsl/authorization/program-outcome.ts"
import { base, root, repo, save, hash, load, relative } from "./evidence.ts"
function assert(ok: unknown, message: string) { if (!ok) throw new Error(message) }
export async function verifyReferences() {
  const checks: any[] = [], sourceMatches: any[] = []
  for (const task of ["M", "G"]) {
    const name = task === "M" ? "memos" : "gitea", key = task === "M" ? "shared-memo-access" : "create-issue"
    const inputFile = path.join(base, `inputs/${name}-original.json`), programFile = path.join(base, `reference/${task}-program.json`)
    const check: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", programFile, { executionPolicy: "progressive" })
    await save(path.join(base, `verification/${task}-reference-check.json`), check)
    assert(check.status === "valid" && !check.executableContract?.diagnostics?.some((d: any) => d.severity === "error"), `${task}-reference-compile`)
    const raw = await load(programFile), original = (await load(inputFile)).resourceInputs[key]
    const cases: Array<{ id: string; change?: (facts: any) => void; stop?: string; prior?: string; fields?: any }> = task === "M" ? [
      { id: "expiry-equality-exact-object", fields: { memo_id: 43, share_memo_id: 43, creator_valid: true, context_user_id: 0 } },
      { id: "invalid-creator-space-error-first", change(f) { f.users[0].RowStatus = "INVALID"; f.memos[0].SpaceID = 99; f.storeErrors.space = "error" }, stop: "space_error", prior: "creator_valid" },
      { id: "invalid-creator-member-error-first", change(f) { f.users[0].RowStatus = "INVALID"; f.contextUserID = 22; f.memos[0].SpaceID = 99; f.spaces = [{ ID: 99 }]; f.storeErrors.membership = "error" }, stop: "membership_error", prior: "space" },
      { id: "unknown-audience-viewer-error-first", change(f) { f.memos[0].Visibility = "OTHER"; f.contextUserID = 22; f.storeErrors.viewer = "error" }, stop: "viewer_error", prior: "memo_entry_state" },
      { id: "expired-share", change(f) { f.now = 2001 }, stop: "share_time", prior: "share_found" },
    ] : [
      { id: "reader-fields", fields: { can_write: false, deadline: 0, milestone: 0, repository_id: 83, poster_id: 31, title_before_model: " finite issue ", body: "Synthetic issue body", ref: "main", converter_load_observation: null } },
      { id: "reader-refetch-error-after-transaction-return", change(f) { f.errors.refetch = "error" }, stop: "refetch_return", prior: "transaction_return" },
      { id: "reader-close-error-after-transaction-return", change(f) { f.form.Closed = true; f.errors.close = "error" }, stop: "close_return", prior: "transaction_return" },
      { id: "reader-mentions-error-after-transaction-return", change(f) { f.errors.mentions = "error" }, stop: "mentions_return", prior: "transaction_return" },
    ]
    const rows = cases.map(c => {
      const facts = structuredClone(original); c.change?.(facts)
      const execution = executeResourceWorkflow(raw.resourceWorkflow, facts)
      const stop = execution.events.find(e => e.outcome === "rejected")?.id
      if (c.stop) assert(stop === c.stop, `${task}/${c.id}: first-stop ${stop}`)
      if (c.prior) assert(execution.events.find(e => e.id === c.prior)?.outcome === "computed", `${task}/${c.id}: missing prior ${c.prior}`)
      if (c.fields) assert(JSON.stringify(execution.returned) === JSON.stringify(c.fields), `${task}/${c.id}: result`)
      return { id: c.id, status: "pass", expectedOrigin: task === "M" ? "fixed-source review plus independently extracted original control flow" : "independent fixed-source review; no G original execution", firstStop: stop, returned: execution.returned, order: execution.events.filter(e => e.outcome !== "skipped").map(e => e.id), conditions: execution.conditions }
    })
    for (const f of check.sourceFiles) {
      const complete = path.join(repo, `.tmp/bt-source/${name}-${task === "M" ? "cb42e326ba9cc266a6a9570c53e0fe04c62793f4" : "fc28937a8d772fe9e4025c9b5f24d5db4d86610b"}`, f.path)
      const actual = hash(await readFile(complete))
      assert(actual === f.sha256, `fixed-source-mismatch:${task}/${f.path}`)
      sourceMatches.push({ task, path: f.path, sha256: actual })
    }
    assert(check.executableContract.outcome.relations.every((r: any) => r.status === "consistent"), `${task} reference relation source/order`)
    checks.push({ task, sha256: hash(await readFile(programFile)), qualified: true, qualification: "declared local scope only; all original question duties remain", rows,
      relationChecks: check.executableContract.outcome.relations,
      independentReview: task === "M" ? { reviewer: "bt_reference_m_audit", disputedClaim: "Reviewer claimed now==expiry rejected. Rejected on direct verification: upstream memo_share_service.go:218 uses >, reference share_time uses <=, equality case passes. No edit made from incorrect review." } : { reviewer: "bt_reference_g_audit", finding: "Reader local scope faithful. Writer assignee lookup/assignability and assignee blocking remain unknown before transaction; do not call changed writer refetch its certified first error." } })
  }
  await save(path.join(base, "source/fixed-source-match.json"), { additionsToModelScope: [], files: sourceMatches, completeCheckoutPurpose: "independent verification only" })
  for (const name of ["memos-test-output.txt", "memos-test-retry-output.txt"]) await copyFile(path.join(repo, ".tmp/bt-source", name), path.join(base, "source", name))
  await save(path.join(base, "reference/admission.json"), { checkedAt: new Date().toISOString(), providerCalls: 0, checks,
    evidenceScope: { M: "8 extracted original Go subcases + source review + finite reference comparison", G: "independent source review + finite reference comparison; no upstream function execution" },
    isolatedSourceTestExecutions: 1, fullUpstreamModuleExecutions: 0, businessWrites: 0, unknownCost: ["developer tokens/USD", "reference preparation effort"] })
  return { tasks: checks.map(c => ({ task: c.task, qualified: c.qualified, cases: c.rows.length })), providerCalls: 0 }
}
if (import.meta.main) console.log(JSON.stringify(await verifyReferences(), null, 2))
