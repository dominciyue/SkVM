import path from "node:path"
import { writeFile } from "node:fs/promises"
import { loadInquiryInput } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"

const root = path.resolve(import.meta.dir, ".."), rows = []
for (const task of ["paperless-download", "owui-ingestion"] as const) {
  const loaded = await loadInquiryInput(path.join(root, "model", "inputs", `${task}-original.json`))
  const tools = await createInquiryTools({ ...loaded.context, structure: true })
  const sources = tools.structure!.symbols.filter(s => s.kind === "function" && (task === "owui-ingestion" ? s.name === "process_file" && s.path.endsWith("routers/retrieval.py") : s.path === "src/documents/views.py" && s.startLine === 1835))
  if (sources.length !== 1) throw new Error(`Probe needs one exact registered original function for ${task}`)
  const source = sources[0]!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const required = skeleton.anchors.filter(a => a.interpretationRequired)
  const opaqueCalls = skeleton.anchors.filter(a => a.kind === "call" && !a.interpretationRequired)
  if (!skeleton.modelCovered || !skeleton.gaps.length || !opaqueCalls.length) throw new Error("Original opaque control and complete read coverage must remain")
  rows.push({ task, source: skeleton.source, sourceRevision: skeleton.revision, totalAnchors: skeleton.anchors.length, totalCalls: skeleton.anchors.filter(a => a.kind === "call").length, requiredAnchors: required.map(a => ({ id: a.id, kind: a.kind, selector: a.selector })), opaqueCalls: opaqueCalls.map(a => ({ id: a.id, expression: a.call!.expression, selector: a.selector })), gaps: skeleton.gaps, toolActions: tools.toolCalls })
}
const result = { schemaVersion: "authorization-av-flow-requirements-probe/v1", status: "passed", rows, providerCalls: 0, targetExecutions: 0, sourceSemantics: "not-evaluated", claim: "Executable annotation requirements are localized; original opaque control and child call facts remain" }
await writeFile(path.join(import.meta.dir, "av11-flow-requirements-probe.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ status: result.status, rows: rows.map(r => ({ task: r.task, totalAnchors: r.totalAnchors, totalCalls: r.totalCalls, requiredAnchors: r.requiredAnchors.length, opaqueCalls: r.opaqueCalls.length, gaps: r.gaps.length })), providerCalls: 0, targetExecutions: 0 }))
