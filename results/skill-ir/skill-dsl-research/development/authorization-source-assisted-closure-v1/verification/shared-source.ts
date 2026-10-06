import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { bindOperationCalls } from "../../../../../../src/benchmarks/authorization-dsl/operation-links.ts"
import { lowerSemanticFlow, type BoundSemanticBlock } from "../../../../../../src/task-dsl/authorization/semantic-flow.ts"
const root = path.resolve(import.meta.dir, ".."), old = path.resolve(root, "../authorization-operation-evidence-v1")
const originalPath = path.join(old, "runs/quality-paperless-download-D-O/attempt-1/report.json"), original = await readFile(originalPath), digest = (v: Uint8Array) => createHash("sha256").update(v).digest("hex")
const inputPath = path.join(root, "model/inputs/paperless-download.json"), input = JSON.parse(await readFile(inputPath, "utf8"))
const tools = await createInquiryTools({ ...input, sourceRoot: path.resolve(path.dirname(inputPath), input.sourceRoot), structure: true, maxReadBytes: 33554432, maxDisplayBytes: 786432, maxToolCalls: 64 })
const units: BoundSemanticBlock[] = structuredClone(JSON.parse(original.toString()).report.domain.semantic.units)
const rebindings = []
for (const unit of units) {
  const source = unit.source!, candidates = tools.structure!.symbols.filter(s => s.path === source.path && s.sha256 === source.sha256 && s.startLine === source.startLine && s.endLine === source.endLine)
  assert.equal(candidates.length, 1)
  rebindings.push({ originalId: source.id, currentId: candidates[0]!.id, path: source.path, startLine: source.startLine, endLine: source.endLine })
  source.id = candidates[0]!.id
}
const linked = bindOperationCalls(tools.structure!, units), entry = units.find(u => u.role === "entry")!
assert.equal(linked.records.filter(r => r.caller === entry.handle && r.action === "bind").length, 1)
assert.equal(digest(await readFile(originalPath)), digest(original))
const record = { schemaVersion: "authorization-av-source-links/v1", providerCalls: 0, targetExecutions: 0, original: { path: path.relative(root, originalPath), sha256: digest(original) }, exactMemoryRebindings: rebindings, sourceLinks: linked.records, locationDiagnostics: linked.diagnostics, remainingSemanticDiagnostics: lowerSemanticFlow(linked.units, { compositional: true }).diagnostics, scope: "Only identity and helper linking were rechecked; no original meaning/arguments/answer was changed and no full task quality is claimed." }
await writeFile(path.join(import.meta.dir, "av2-download-replay.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ links: linked.records.length, locationDiagnostics: linked.diagnostics.length, remainingSemanticDiagnostics: record.remainingSemanticDiagnostics.length, providerCalls: 0 }))
