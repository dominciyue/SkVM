import assert from "node:assert/strict"
import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-domain-runtime.ts"

// A development replay of known input bytes and source locations, not a new answer or semantic grade.
const root = import.meta.dir, stage = "consume-authorization-cloudflare-download-repair-sdk-final-wire-v1"
const archive = path.join(root, "ordinary", stage)
const claim = JSON.parse(await readFile(path.join(archive, "claim.json"), "utf8"))
const original = await readFile(path.join(archive, "consumed-inquiry.json"))
assert.equal(createHash("sha256").update(original).digest("hex"), claim.inputSha256)
const input = JSON.parse(original.toString()), sourceRoot = path.resolve(claim.workDir, input.sourceRoot)
const tools = await createInquiryTools({ sourceRoot, repository: input.repository, sourceRef: input.sourceRef, allowedPaths: input.allowedPaths })
const program = compileAuthorizationInquiry(input.inquiry)
const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
await runtime.sync()
const entries = runtime.report().worklist!.items.filter(i => i.origin === "question-duty" && i.kind === "entry")
assert.deepEqual(entries.map(i => i.candidates.length), [2, 2, 3, 1, 1])
assert.deepEqual(entries.slice(0, 3).map(i => i.code), ["location-ambiguous", "location-ambiguous", "location-ambiguous"])
assert.equal(entries[4]!.selected?.name, "download")
assert.equal(entries[4]!.state, "awaiting-interpretation")
assert.equal(tools.toolCalls, 1)
const rounds: unknown[] = []
for (let n = 0; n < 3; n++) {
  const context = runtime.modelContext()
  rounds.push({ locationTasks: context.locationTasks, explanationItemIds: context.tasks.map(t => t.itemId) })
  if (!context.locationTasks.length) break
  // Explicit reviewer read intent for this fixture; never supplied to a generating model.
  const selections = context.locationTasks.map(t => {
    const candidate = t.candidates.find(c => c.name === "download" && c.kind === "function")
    assert.ok(candidate)
    return { questionId: t.question.id, itemId: t.itemId, candidateId: candidate.id }
  })
  const update = await runtime.propose({ schemaVersion: "authorization-control-update/v1", workSelections: selections })
  assert.equal(update.diagnostics.length, 0)
}
assert.equal(runtime.modelContext().locationTasks.length, 0)
assert.equal(runtime.report().slice.rules.length, 0)
assert.equal(runtime.report().slice.bindings.length, 0)
assert.equal(runtime.report().check, undefined)
assert.equal(tools.toolCalls, 1)
assert.ok(runtime.report().worklist!.items.filter(i => i.kind === "entry").every(i => i.state === "awaiting-interpretation" && i.semanticSupport === "unreviewed"))
assert.ok(isDeepStrictEqual(JSON.parse(await readFile(path.join(archive, "consumed-inquiry.json"), "utf8")), input))
const result = { schemaVersion: "authorization-ar-location-worklist-replay/v1", at: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), uncommittedImplementation: true, stage, inputSha256: claim.inputSha256, providerCalls: 0, targetExecutions: 0, initialEntries: entries, rounds, sourceReadCalls: tools.toolCalls, finalEntryStates: runtime.report().worklist!.items.filter(i => i.kind === "entry"), inferredRules: 0, inferredPremises: 0, checkedDelivery: false, semanticSupport: "unreviewed", originalArchiveRewritten: false }
await writeFile(path.join(root, "location-worklist-replay.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ providerCalls: 0, candidates: entries.map(i => i.candidates.length), sourceReadCalls: tools.toolCalls, inferredRules: 0, checkedDelivery: false }))
