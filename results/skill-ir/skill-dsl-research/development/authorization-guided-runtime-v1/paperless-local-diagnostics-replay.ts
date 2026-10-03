import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { LocalExtractionItemSchemas, expandLocalExtractions } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local-extraction.ts"
import { inquiryStepSchemas, normalizeGuidedControlEnvelope } from "../../../../../src/benchmarks/authorization-dsl/inquiry-wire.ts"

// Schema-only replay of exact retained items. No provider, target execution, or inferred source answer.
const root = import.meta.dir, eventFile = "runs/probe-paperless-notes-Mg/attempt-3/sessions/2026-10-02T153146088Z-3cf9886f/events.jsonl"
const bytes = await readFile(path.join(root, eventFile)), events = bytes.toString("utf8").trim().split(/\r?\n/).map(s => JSON.parse(s))
const args = (sequence: number) => events.find(e => e.sequence === sequence).attempt.response.toolCalls[0].arguments
const bad = [4, 8].flatMap(sequence => args(sequence).controlDelta.localExtractions.flatMap((extraction: any) => extraction.dependencies.map((item: any, index: number) => ({ sequence, pointer: `/attempt/response/toolCalls/0/arguments/controlDelta/localExtractions/0/dependencies/${index}`, itemId: extraction.itemId, item }))))
assert.equal(bad.length, 3)
const diagnostics = bad.map(record => {
  assert.equal(LocalExtractionItemSchemas.dependencies.safeParse(record.item).success, false)
  const expanded = expandLocalExtractions([{ itemId: record.itemId, dependencies: [record.item] }], [{ itemId: record.itemId, question: { id: "q1" }, evidenceIds: [], callsiteEvidenceIds: [] } as any], [{ id: record.itemId, questionId: "q1" } as any])
  assert.equal(expanded.groups.dependencies.length, 0)
  assert(expanded.rejected.length > 0)
  const messages = expanded.rejected.flatMap(r => r.diagnostics.map(d => d.message))
  assert(messages.some(m => record.sequence === 4 ? m.includes("host binds") : m.includes("add for a new target")))
  return { ...record, diagnostics: expanded.rejected.flatMap(r => r.diagnostics) }
})
const corrected = args(10), dependencies = corrected.controlDelta.localExtractions[0].dependencies
assert(dependencies.every((d: unknown) => LocalExtractionItemSchemas.dependencies.safeParse(d).success))
assert(inquiryStepSchemas("guided-evidence-v2").schema.safeParse(corrected).success)
const result = {
  schemaVersion: "authorization-ar-local-diagnostics-replay/v1", eventFile, eventSha256: createHash("sha256").update(bytes).digest("hex"), diagnostics,
  correction: { responseSequence: 10, targetKeys: dependencies.map((d: any) => d.targetKey), schemaValid: true, envelopeNormalization: normalizeGuidedControlEnvelope(corrected).normalization, limitation: "Dependency parent names a rule, not a dependency; schema validity is not graph closure or semantic correctness." },
  reviewerCorrection: "Request-context diagnostics are persistent feedback. Exact response sequence 4 introduced forbidden evidenceIds; sequence 8 omitted op. Sequence 10 did attempt schema repairs, blocked historically by the pure tool/control envelope. Do not count the retained feedback as repeated identical submissions.",
  providerCallsDuringReplay: 0, targetExecutions: 0, originalStatus: "timeout-unknown", overallFailureOutcome: "unresolved",
  limitations: ["No source interpretation is accepted or changed by this schema-only replay", "Replacement reasons were supplied in subsequent response sequence 6", "No final response or completed task is inferred", "Paperless request and task remain sealed; only distinct-task mechanism verification may be separately adjudicated"],
}
if (process.argv[2] === "save") await writeFile(path.join(root, "paperless-local-diagnostics-replay.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
else if (process.argv[2] !== "replay") throw new Error("Use save|replay")
console.log(JSON.stringify({ invalidItems: diagnostics.length, subsequentSchemaCorrection: dependencies.length, providerCalls: 0, originalStatus: result.originalStatus }))
