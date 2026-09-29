import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { authorUnits, buildCurrentAuthorTasks, qualityUnits, ratingRules } from "./protocol.ts"
import { checkDelivery, checkTaskFacts, checkV2Facts } from "./author-protocol.ts"
import { compileAuthorizationTaskAuthoring } from "../../../../../src/benchmarks/authorization-dsl/authoring-task.ts"
import { unresolvedClaim } from "./common.ts"
import { consumerClaimState, sameSharedMaterial } from "./consumer-gate.ts"

const root = import.meta.dir
const am = path.resolve(root, "../authorization-control-context-v1")
const al = path.resolve(root, "../authorization-location-recovery-v3")

test("AN registration has four interleaved contract/representation quality arms and three author routes", () => {
  const quality = qualityUnits(["owui-file", "paperless-download", "memos-get-shared", "paperless-share-create"])
  const authors = authorUnits(["memos-space-policy", "paperless-note-premise"])
  expect(quality).toHaveLength(16)
  expect(quality.slice(0, 4).map(row => [row.caseId, row.route, row.taskContract])).toEqual([
    ["owui-file", "markdown", "compatibility"], ["owui-file", "dsl", "compatibility"],
    ["owui-file", "markdown", "current-v1"], ["owui-file", "dsl", "current-v1"],
  ])
  expect(authors).toHaveLength(12)
  expect(new Set(authors.map(row => row.id)).size).toBe(12)
  expect(authors.filter(row => row.version === "original")).toHaveLength(6)
  expect(ratingRules.supported).toContain("source")
})

test("real AM briefs project current tasks without exposing future fields to the original author", async () => {
  const briefs = JSON.parse(await readFile(path.join(al, "author-briefs.json"), "utf8"))
  for (const brief of briefs.packages) {
    const { original, changed, change } = buildCurrentAuthorTasks(brief)
    expect(original.schemaVersion).toBe("authorization-task-authoring/v1")
    expect(original.policy.text).toBe(brief.originalPolicy)
    expect(JSON.stringify(original)).not.toContain("changedPolicy")
    if (brief.changedPolicy !== brief.originalPolicy) expect(JSON.stringify(original)).not.toContain(brief.changedPolicy)
    expect(changed.policy.text).toBe(brief.changedPolicy)
    expect(changed.cases.map((item: any) => item.name)).toEqual(original.cases.map((item: any) => item.name))
    expect(change.schemaVersion).toBe("authorization-task-change/v1")
  }
  const manifest = JSON.parse(await readFile(path.join(am, "input-manifest.json"), "utf8"))
  expect(manifest.cases.filter((item: any) => ["owui-file", "paperless-download", "memos-get-shared", "paperless-share-create"].includes(item.id))).toHaveLength(4)
})

test("author checks allow a renamed condition but reject changed source entry bytes or policy", async () => {
  const briefs = JSON.parse(await readFile(path.join(al, "author-briefs.json"), "utf8"))
  const brief = briefs.packages.find((item: any) => item.id === "paperless-note-premise")
  const expected = buildCurrentAuthorTasks(brief).original
  const renamed = structuredClone(expected) as any
  for (const item of renamed.cases) {
    item.conditions = { "another-owner-exists": item.conditions["owner-present"] }
    for (const branch of item.branches) branch.assumptions = { "another-owner-exists": Object.values(branch.assumptions)[0] }
  }
  expect(checkTaskFacts(renamed, expected)).toEqual([])
  renamed.policy.text = "Anyone may create a note."
  expect(checkTaskFacts(renamed, expected).some(item => item.path === "policy")).toBe(true)
  const widened = structuredClone(expected) as any
  widened.policy.reason = "New, unreviewed authority."
  widened.cases[0].responseDetails.push("Skip the absent-owner branch.")
  widened.cases[0].conditions["owner-present"].basis = "Whether the user is an administrator."
  expect(checkTaskFacts(widened, expected).map(item => item.path)).toContain("cases.view-only.responseDetails")
  expect(checkTaskFacts(widened, expected).map(item => item.path)).toContain("cases.view-only.conditions")
  expect(checkTaskFacts(widened, expected).map(item => item.path)).toContain("policy")
  const context = JSON.parse(await readFile(path.join(root, "author-context", brief.id, "dsl", "context.json"), "utf8"))
  const compiled = compileAuthorizationTaskAuthoring(context, expected)
  expect(compiled.status).toBe("ready")
  if (compiled.status !== "ready") return
  const forged = structuredClone(compiled.authoring) as any
  forged.entries[brief.entry.entryKey].locations[0].startLine += 1
  expect(checkV2Facts(forged, expected, context).some(item => item.path === "entries")).toBe(true)
  const polluted = structuredClone(compiled.authoring) as any
  polluted.policies.current.reason = "Use an unreviewed policy."
  polluted.analysisContract.scenarios["view-only"].requiredResponseDetails.push("Omit source control.")
  expect(checkV2Facts(polluted, expected, context).map(item => item.path)).toContain("policy/request")
  expect(checkV2Facts(polluted, expected, context).map(item => item.path)).toContain("analysisContract.scenarios.view-only.requiredResponseDetails")
  const missingLocation = checkDelivery({ route: "markdown", version: "original" }, `${context.taskId} ${context.sourceRef} ${expected.policy.text} ${expected.cases.flatMap((item: any) => [item.name, item.relation, item.operation, item.expectation, ...item.premises.map((premise: any) => premise.statement), ...item.branches.map((branch: any) => branch.name)]).join(" ")}`, expected, context)
  expect(missingLocation.valid).toBe(false)
})

test("a claimed but unterminated paid row is visible for archival without redispatch", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "authorization-an-recovery-"))
  try {
    await writeFile(path.join(directory, "claim.json"), "{}")
    expect((await unresolvedClaim(directory, "report.json"))?.archivedFiles).toEqual(["claim.json"])
    await writeFile(path.join(directory, "report.json"), "{}")
    expect(await unresolvedClaim(directory, "report.json")).toBeNull()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("consumer reuse accepts the same material despite JSON object key order", async () => {
  const shared = JSON.parse(await readFile(path.join(am, "author-material", "memos-space-policy", "prepared", "report.json"), "utf8"))
  const reordered = structuredClone(shared)
  reordered.included[0] = Object.fromEntries(Object.entries(reordered.included[0]).reverse())
  expect(JSON.stringify(reordered.included)).not.toBe(JSON.stringify(shared.included))
  expect(sameSharedMaterial(reordered, shared)).toBe(true)
  reordered.gaps[0].reason = "different-gap"
  expect(sameSharedMaterial(reordered, shared)).toBe(false)
})

test("consumer claim before provider dispatch resumes preparation but dispatch claim stays unknown", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "authorization-an-consumer-claim-"))
  try {
    expect(await consumerClaimState(directory)).toBe("new")
    await writeFile(path.join(directory, "claim.json"), "{}")
    expect(await consumerClaimState(directory)).toBe("pre-dispatch")
    await writeFile(path.join(directory, "dispatch-claim.json"), "{}")
    expect(await consumerClaimState(directory)).toBe("completion-unknown")
    await writeFile(path.join(directory, "report.json"), "{}")
    expect(await consumerClaimState(directory)).toBe("terminal")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
