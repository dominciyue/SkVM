import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { buildStructureIndex } from "../../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { operationCallSources, bindOperationCalls } from "../../../../../../src/benchmarks/authorization-dsl/operation-links.ts"
import type { BoundSemanticBlock } from "../../../../../../src/task-dsl/authorization/semantic-flow.ts"

// Read-only diagnosis of the closed AU run. No production patch or provider call.
// Assertions describe the reviewed implementation, not desired regression behavior.
const base = path.resolve(import.meta.dir, "..")
const retained = ["quality-owui-ingestion-D-O", "quality-paperless-download-D-O", "quality-paperless-download-N"]
const originals = new Map<string, string>()
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
async function report(id: string) {
  const file = path.join(base, "runs", id, "attempt-1/report.json"), bytes = await readFile(file, "utf8")
  originals.set(file, digest(bytes))
  return JSON.parse(bytes).report
}
async function sourceTools(task: string) {
  const file = path.join(base, "model/inputs", `${task}.json`), input = JSON.parse(await readFile(file, "utf8"))
  return createInquiryTools({ repository: input.repository, sourceRef: input.sourceRef,
    sourceRoot: path.resolve(path.dirname(file), input.sourceRoot), allowedPaths: input.allowedPaths,
    structure: true, maxReadBytes: 32 * 1024 * 1024, maxDisplayBytes: 768 * 1024, maxToolCalls: 64 })
}

const owui = await report(retained[0]!), owuiTools = await sourceTools("owui-ingestion")
const firstQuestion = owui.program.questions[0]
const hints = owuiTools.symbolHints(firstQuestion.entryHint)
const fallback = owuiTools.symbolHints([firstQuestion.operation, firstQuestion.request].filter(Boolean).join(" "))
const routes = owuiTools.structure!.routes.filter(r => r.path.includes("/process/file"))
const root = owui.domain.worklist.items.find((item: { kind: string }) => item.kind === "entry")
assert.equal(hints.length, 0)
assert.equal(fallback.length, 1)
assert.equal(fallback[0]!.name, "write")
assert.equal(fallback[0]!.path, "backend/open_webui/utils/audit.py")
assert.equal(root.selectedBy, "unique-index-candidate")
assert.equal(root.selected.path, fallback[0]!.path)
assert.equal(routes.length, 0)

const download = await report(retained[1]!), downloadTools = await sourceTools("paperless-download")
const index = downloadTools.structure!, units: BoundSemanticBlock[] = structuredClone(download.domain.semantic.units)
// Current source IDs depend on runtime options. Rebase IDs ONLY in this memory
// copy, requiring one exact file-SHA/range match. Meaning and raw files stay intact.
for (const unit of units) {
  const original = unit.source!
  const candidates = index.symbols.filter(s => s.path === original.path && s.sha256 === original.sha256 && s.startLine === original.startLine && s.endLine === original.endLine)
  assert.equal(candidates.length, 1)
  unit.source!.id = candidates[0]!.id
}
const entry = units.find(u => u.role === "entry")!
const call = entry.blocks[0]!.steps.find(s => s.kind === "call")!
assert.equal(call.kind, "call")
if (call.kind !== "call") throw new Error("Expected original call")
assert.equal(call.pathHint, "src/documents/views.py:1429-1448")
const asIs = operationCallSources(index, entry, call)
const pathOnly = { ...call, pathHint: call.pathHint.replace(/:\d+(?:-\d+)?$/, "") }
const pathOnlySources = operationCallSources(index, entry, pathOnly)
assert.equal(asIs.length, 0)
assert.equal(pathOnlySources.length, 1)
const changed = structuredClone(units)
const changedCall = changed.find(u => u.role === "entry")!.blocks[0]!.steps.find(s => s.kind === "call")!
if (changedCall.kind !== "call") throw new Error("Expected copied call")
changedCall.pathHint = pathOnly.pathHint
const beforeLinks = bindOperationCalls(index, units).records.filter(r => r.caller === entry.handle)
const afterLinks = bindOperationCalls(index, changed).records.filter(r => r.caller === entry.handle)
assert.equal(beforeLinks.length, 0)
assert.equal(afterLinks.filter(r => r.action === "bind").length, 1)

const fixture = [{ path: "sample.py", content: "def outer(x):\n    return inner(x)\ndef inner(x):\n    return x\n" }]
// createInquiryTools passes its whole options object to buildStructureIndex.
// These three anonymous calls vary only options unrelated to source identity.
const identities = [
  { repository: "fixture", sourceRef: "fixed", sourceRoot: "D:/a", maxToolCalls: 24 },
  { repository: "fixture", sourceRef: "fixed", sourceRoot: "D:/a", maxToolCalls: 64 },
  { repository: "fixture", sourceRef: "fixed", sourceRoot: "D:/b", maxToolCalls: 24 },
]
const indexes = []
for (const identity of identities) indexes.push(await buildStructureIndex(fixture, identity))
assert.notEqual(indexes[0]!.symbols[0]!.id, indexes[1]!.symbols[0]!.id)
assert.notEqual(indexes[0]!.symbols[0]!.id, indexes[2]!.symbols[0]!.id)
assert.notEqual(indexes[0]!.revision, indexes[1]!.revision)
assert.notEqual(indexes[0]!.revision, indexes[2]!.revision)
await report(retained[2]!)
for (const [file, before] of originals) assert.equal(digest(await readFile(file, "utf8")), before)

const result = {
  schemaVersion: "au-post-review/v1", reviewedImplementation: "7f5bab6c66dcff0a13f2ec5189887f33570e7ba6",
  providerCalls: 0, targetExecutions: 0, productionChanges: false,
  sourceReportsUnchanged: retained,
  entrySelection: { entryHint: firstQuestion.entryHint, hintCandidates: hints.length,
    fallbackCandidates: fallback.map(s => ({ name: s.name, path: s.path, startLine: s.startLine })),
    archivedSelectedBy: root.selectedBy, matchingRouteModels: routes.length,
    finding: "A generic word in the task becomes the unique automatic entry; the Python route adapter has no decorator route model." },
  helperLink: { originalPathHint: call.pathHint, pathOnly: pathOnly.pathHint,
    exactSourceRangesChecked: units.length, asIsSourceMatches: asIs.length, pathOnlySourceMatches: pathOnlySources.length,
    asIsEntryBindings: beforeLinks.length, pathOnlyEntryBindings: afterLinks.length,
    note: "Source IDs rebased in memory by exact path/SHA/range only. Path normalization repairs this identity link; arguments, branches, source quality and final answer are not repaired or re-evaluated." },
  identityStability: { sourceBytesRepositoryAndRefUnchanged: true, budgetChangesSymbolId: true,
    rootChangesSymbolId: true, budgetChangesIndexRevision: true, rootChangesIndexRevision: true,
    finding: "The entire runtime options object is hashed as source identity. Portability/reuse impact needs a production regression before changes." },
  targetedVerification: { tests: 77, failures: 0, assertions: 509, files: 9,
    note: "Run separately during this review; historical 844-test suite was not repeated." },
  followup: "Repair generic entry selection, typed source selectors and stable source identity before further paired quality runs; preserve closed AU evidence."
}
if (process.argv[2]) await writeFile(path.resolve(process.argv[2]), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
console.log(JSON.stringify(result, null, 2))
