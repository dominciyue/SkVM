import path from "node:path"
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { root, sha } from "../study.ts"
import { loadInquiryInput, compareLocalInquiry } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"

const loaded = await loadInquiryInput(path.join(root, "model/inputs/owui-ingestion-original.json"))
const tools = await createInquiryTools({ ...loaded.context, structure: true, maxReadBytes: 33554432, maxFiles: 512 })
const index = tools.structure!
const owner = index.symbols.find(s => s.qualifiedName.endsWith("routers.retrieval.process_file"))!
assert.ok(owner)
const calls = index.relatedCalls(owner.id).filter(c => ["Files.get_file_by_id", "Files.get_file_by_id_and_user_id"].includes(c.expression))
assert.equal(calls.length, 2)
const selected = calls.map(c => ({ expression: c.expression, path: c.path, startLine: c.startLine, resolution: c.resolution, receiverClass: c.receiverClass, basis: c.basis, candidates: c.candidateIds.map(id => { const s = index.symbols.find(s => s.id === id)!; return { id: s.id, qualifiedName: s.qualifiedName, path: s.path, startLine: s.startLine, endLine: s.endLine, sha256: s.sha256 } }) }))
for (const c of selected) { assert.equal(c.resolution, "resolved"); assert.equal(c.candidates.length, 1); assert.equal(c.candidates[0]!.qualifiedName.split(".").slice(-2).join("."), `FilesTable.${c.expression.split(".").at(-1)}`) }
const variations = []
for (const variant of ["policy", "premise", "source"]) {
  const compared = await compareLocalInquiry(path.join(root, `model/inputs/paperless-download-${variant}.json`), path.join(root, "positions/debug-paperless-download-D1/revision-final-diagnostics/raw/inquiry"), "operation-evidence-v2")
  variations.push({ variant, compared })
}
const bytes = await readFile(path.join(loaded.context.sourceRoot, "backend/open_webui/models/files.py"))
const result = { schemaVersion: "authorization-av11-instance-binding-probe/v1", at: new Date().toISOString(), inputSha256: loaded.inputSha256, sourceFiles: tools.files.length, relationshipVersion: index.relationshipVersion, selected, sourceBinding: { path: "backend/open_webui/models/files.py", sha256: sha(bytes), line: 413, text: "Files = FilesTable()" }, variations, oldMaterialEffect: "New source relationship dependencies invalidate both older Download units; do not reuse or rewrite the original v3 footprints", semanticSupport: "unreviewed", providerCalls: 0, targetExecutions: 0 }
await writeFile(path.join(root, "verification/av11-instance-binding-probe.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
console.log(JSON.stringify({ sourceFiles: result.sourceFiles, relationshipVersion: result.relationshipVersion, selected, providerCalls: 0, targetExecutions: 0 }, null, 2))
