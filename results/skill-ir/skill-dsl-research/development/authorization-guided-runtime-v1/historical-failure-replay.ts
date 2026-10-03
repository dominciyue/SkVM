import assert from "node:assert/strict"
import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"

const root = import.meta.dir
const corpus = JSON.parse(await readFile(path.join(root, "historical-failures.json"), "utf8"))
const base = path.resolve(root, corpus.historicalRoot)
const cache = new Map<string, any>()
const json = async (relative: string) => {
  if (!cache.has(relative)) cache.set(relative, JSON.parse(await readFile(path.resolve(base, relative), "utf8")))
  return cache.get(relative)
}
const pointer = (value: any, location: string) => location.split("/").slice(1).reduce((current, key) => current[key], value)
assert.equal(corpus.evidence.filter((r: any) => r.provenance === "actual-retained-response").length, 6)
assert.equal(corpus.evidence.filter((r: any) => r.provenance === "deterministic-regression-only").length, 1)
for (const record of corpus.evidence) {
  await readFile(path.resolve(base, record.artifact))
  if (record.rawArtifact) await json(record.rawArtifact)
}
const [wrong, delta, binding, owner, unread, budget, regression] = corpus.evidence
const wrongRun = await json(wrong.rawArtifact)
assert.equal(pointer(wrongRun, wrong.pointers[0]), "object")
assert.equal(typeof pointer(wrongRun, wrong.pointers[1]), "object")
assert.equal(typeof pointer(wrongRun, wrong.pointers[2]), "string")
const deltaRun = await json(delta.rawArtifact)
assert.deepEqual(Object.keys(pointer(deltaRun, delta.pointers[0])).sort(), ["delta", "kind"])
assert.equal(pointer(deltaRun, delta.pointers[1]).kind, "control")
assert.ok(pointer(deltaRun, delta.pointers[1]).controlDelta)
const bindingLine = (await readFile(path.resolve(base, binding.artifact), "utf8")).split(/\r?\n/)[binding.line - 1]!
const sourceBinding = pointer(JSON.parse(bindingLine), binding.pointers[0])
assert.equal(sourceBinding.bindingKey, "get-addressed-document-owner")
assert.equal(sourceBinding.origin, undefined)
const ownerRun = await json(owner.rawArtifact)
const ownerAware = pointer(ownerRun, owner.pointers[0]).find((r: any) => r.key === "q1.owneraware.semantics")
assert.ok(ownerAware.claim.includes("owner"))
assert.equal(ownerAware.condition, undefined)
const ownerBypass = pointer(ownerRun, owner.pointers[1]).filter((r: any) => r.key.includes("owner"))
assert.ok(ownerBypass.length > 0 && ownerBypass.every((r: any) => r.condition === undefined))
assert.ok(pointer(await json(unread.artifact), unread.pointers[0]).detail.includes("get_verified_user"))
assert.equal(pointer(await json(budget.artifact), budget.pointers[0]), "budget-exhausted")
assert.equal(pointer(await json(budget.artifact), budget.pointers[1]), "Cumulative model source display budget exhausted; existing evidence preserved")
assert.ok((await readFile(path.resolve(base, regression.artifact), "utf8")).includes(regression.symbol))
assert.equal(regression.historicalPaidOccurrence, "not-established")
const result = { schemaVersion: "authorization-ar-historical-failure-replay/v1", date: "2026-10-04", providerCalls: 0, targetExecutions: 0, actualHistoricalCases: 6, deterministicCases: 1, originalAQBytesEdited: false, verification: "Selected retained response, schema, typed-condition and status pointers match the corrected corpus. Prior bounded negative native audit is retained without rerunning all historical checks.", corpus: "historical-failures.json" }
await writeFile(path.join(root, "historical-failure-replay.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify(result))
