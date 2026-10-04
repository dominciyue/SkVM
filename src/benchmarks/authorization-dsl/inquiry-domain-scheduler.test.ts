import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "../../task-dsl/authorization/control-slice.ts"
const api = await import("./inquiry-domain-scheduler.ts").catch(() => ({} as any))
async function fixture(prefix = "src", duplicate = false, maxToolCalls = 24) {
  const root = await mkdtemp(path.join(os.tmpdir(), "aq-schedule-")); await mkdir(path.join(root, prefix))
  await writeFile(path.join(root, prefix, "entry.ts"), "export function entry() { return guard(); }\n")
  await writeFile(path.join(root, prefix, "helper.ts"), "export function guard() { return false; }\n")
  if (duplicate) await writeFile(path.join(root, prefix, "other.ts"), "export function guard() { return true; }\n")
  const tools = await createInquiryTools({ sourceRoot: root, allowedPaths: [prefix], repository: `neutral-${prefix}`, sourceRef: "fixed", maxToolCalls })
  const read = await tools.execute("source_read", { path: `${prefix}/entry.ts`, startLine: 1, endLine: 1 })
  const ev = read.evidence[0]!.id
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Can entry proceed?", premises: [] }] })
  const rule = { key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], claim: "Calls guard", evidenceIds: [ev] }
  const dep = { key: "helper", questionId: "q", pathKey: "p", from: "entry", symbol: "guard", kind: "control", reason: "Decision depends on called helper", decisive: true, evidenceIds: [ev] }
  const merge = (previous: any, dependencies: any[] = [dep], rules: any[] = [rule]) => mergeControlSlice(previous, { schemaVersion: "authorization-control-slice/v1", rules, dependencies }, program, { questionIds: ["q"], shownEvidenceIds: tools.evidence.map(e => e.id) })
  return { root, prefix, tools, program, rule, dep, merge, slice: merge(createControlSlice()).state }
}
test("scheduler genuinely reads a callsite-proposed uniquely located helper, records origin, and shares tool budget", async () => {
  expect(typeof api.createInquiryDomainScheduler).toBe("function")
  const f = await fixture(), scheduler = api.createInquiryDomainScheduler({ tools: f.tools })
  await scheduler.run(f.slice)
  expect(f.tools.toolCalls).toBe(2)
  expect(f.tools.evidence.some(e => e.quote.includes("return false"))).toBe(true)
  expect(scheduler.snapshot()[0]).toMatchObject({ key: "helper", state: "read", semanticSupport: "unreviewed" })
  expect(scheduler.actions[0]).toMatchObject({ actionOrigin: "domain-scheduler", questionId: "q", dependencyId: f.slice.dependencies[0]!.id, name: "source_read", budgetConsumed: 1 })
  await scheduler.run(f.slice)
  expect(f.tools.toolCalls).toBe(2)
})
test("ambiguous symbols stay located until an explicit candidate selection, unrelated lexical name is blocked", async () => {
  const f = await fixture("lib", true), scheduler = api.createInquiryDomainScheduler({ tools: f.tools })
  await scheduler.run(f.slice)
  expect(scheduler.snapshot()[0].state).toBe("located")
  expect(scheduler.snapshot()[0].candidates).toHaveLength(2)
  expect(f.tools.toolCalls).toBe(1)
  const revised = f.merge(f.slice, [{ ...f.dep, pathHint: "lib/helper.ts", revisionOf: f.slice.dependencies[0]!.digest, revisionReason: "Selected one visible candidate" }]).state
  await scheduler.run(revised)
  expect(scheduler.snapshot()[0].state).toBe("read")
  const bad = f.merge(createControlSlice(), [{ ...f.dep, symbol: "notAtCallsite" }]).state
  const separate = api.createInquiryDomainScheduler({ tools: f.tools }); await separate.run(bad)
  expect(separate.snapshot()[0]).toMatchObject({ state: "blocked", code: "dependency-callsite-missing" })
})
test("no budget, outside scope, source changes and dependency cycles remain separate local gaps", async () => {
  const exhausted = await fixture("src", false, 1), scheduler = api.createInquiryDomainScheduler({ tools: exhausted.tools })
  await scheduler.run(exhausted.slice)
  expect(scheduler.snapshot()[0]).toMatchObject({ state: "blocked", code: "tool-budget" })
  expect(exhausted.tools.toolCalls).toBe(1)
  const f = await fixture()
  const outside = f.merge(createControlSlice(), [{ ...f.dep, pathHint: "private/helper.ts" }]).state
  const a = api.createInquiryDomainScheduler({ tools: f.tools }); await a.run(outside)
  expect(a.snapshot()[0]).toMatchObject({ state: "external-unknown", code: "dependency-out-of-scope" })
  const cyclic = f.merge(createControlSlice(), [{ ...f.dep, parent: "helper" }]).state
  const b = api.createInquiryDomainScheduler({ tools: f.tools }); await b.run(cyclic)
  expect(b.snapshot()[0]).toMatchObject({ state: "blocked", code: "dependency-cycle" })
  await writeFile(path.join(f.root, "src/helper.ts"), "export function guard() { return true; }\n")
  const changed = api.createInquiryDomainScheduler({ tools: f.tools }); await changed.run(f.slice)
  expect(changed.snapshot()[0]).toMatchObject({ state: "blocked", code: "source-changed" })
})
test("current false conditions and dependencies explicitly after early rejection are inapplicable", async () => {
  const f = await fixture()
  const stopped = f.merge(createControlSlice(), [{ ...f.dep, after: ["stop"] }], [f.rule, { ...f.rule, key: "stop", kind: "reject", after: ["entry"], complete: true }]).state
  const scheduler = api.createInquiryDomainScheduler({ tools: f.tools }); await scheduler.run(stopped)
  expect(scheduler.snapshot()[0].state).toBe("inapplicable")
  expect(f.tools.toolCalls).toBe(1)
})
test("renaming source and repository prefixes preserves mechanism and host performs at most two actions per round", async () => {
  for (const prefix of ["src", "renamed"]) {
    const f = await fixture(prefix), scheduler = api.createInquiryDomainScheduler({ tools: f.tools })
    await scheduler.run(f.slice)
    expect(scheduler.snapshot()[0].state).toBe("read")
    expect(scheduler.actions.length).toBeLessThanOrEqual(2)
    expect(scheduler.actions[0].arguments.path).toBe(`${prefix}/helper.ts`)
  }
})

test("an exact displayed path-and-range locator is normalized without inventing a candidate", async () => {
  const f = await fixture(), dependency = { ...f.dep, pathHint: "src/helper.ts:1-1" }
  const scheduler = api.createInquiryDomainScheduler({ tools: f.tools })
  await scheduler.run(f.merge(createControlSlice(), [dependency]).state)
  expect(scheduler.snapshot()[0]).toMatchObject({ state: "read", locatorNormalization: { from: "src/helper.ts:1-1", to: "src/helper.ts" } })
  expect(scheduler.actions[0].arguments.path).toBe("src/helper.ts")
  const invalid = api.createInquiryDomainScheduler({ tools: f.tools })
  await invalid.run(f.merge(createControlSlice(), [{ ...dependency, pathHint: "src/helper.ts:90-99" }]).state)
  expect(invalid.snapshot()[0]).toMatchObject({ state: "blocked", code: "dependency-locator-range-mismatch" })
})

test("an allowed-file range mismatch shows real candidates but never reads until explicitly corrected", async () => {
  const f = await fixture(), scheduler = api.createInquiryDomainScheduler({ tools: f.tools })
  const bad = f.merge(createControlSlice(), [{ ...f.dep, pathHint: "src/helper.ts:1-2" }]).state
  await scheduler.run(bad)
  expect(scheduler.snapshot()[0]).toMatchObject({ state: "blocked", code: "dependency-locator-range-mismatch", candidates: [{ path: "src/helper.ts", startLine: 1, endLine: 1 }] })
  expect(f.tools.toolCalls).toBe(1)
  expect(scheduler.actions).toHaveLength(0)
  const corrected = f.merge(bad, [{ ...f.dep, pathHint: "src/helper.ts", revisionOf: bad.dependencies[0]!.digest, revisionReason: "Use the actual indexed file rather than the incorrect range" }]).state
  await scheduler.run(corrected)
  expect(scheduler.snapshot()[0].state).toBe("read")
  expect(f.tools.toolCalls).toBe(2)
  const outside = api.createInquiryDomainScheduler({ tools: f.tools })
  await outside.run(f.merge(createControlSlice(), [{ ...f.dep, pathHint: "private/helper.ts:1-1" }]).state)
  expect(outside.snapshot()[0]).toMatchObject({ state: "external-unknown", code: "dependency-out-of-scope" })
})
