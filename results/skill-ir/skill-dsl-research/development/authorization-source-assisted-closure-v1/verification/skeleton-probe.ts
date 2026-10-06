import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
const root = "D:/skill优化/project-maintenance/runs/authorization-source-assisted-closure-v1/syntax-fixtures"
await mkdir(root, { recursive: true })
const examples = { "entry.py": "def entry(actor, resource):\n    if actor is None:\n        raise Denied()\n    resource.write(actor=actor)\n    return True\n", "entry.go": 'package example\nfunc entry(a *Item, b *Item, flag bool) {\n    if flag { return } else { b.Write(a) }\n}\n' }
for (const [file, content] of Object.entries(examples)) await writeFile(path.join(root, file), content)
const tools = await createInquiryTools({ sourceRoot: root, repository: "anonymous", sourceRef: "fixture-v1", allowedPaths: ["."], structure: true })
const skeletons = []
for (const symbol of tools.structure!.symbols.filter(s => s.name === "entry")) {
  await tools.execute("source_read", { path: symbol.path, startLine: symbol.startLine, endLine: symbol.endLine })
  skeletons.push(await tools.sourceSkeleton(symbol.id))
}
await writeFile(path.join(import.meta.dir, "av4-anonymous-skeletons.json"), JSON.stringify({ providerDispatches: 0, targetExecutions: 0, skeletons }, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify(skeletons.map(s => ({ source: s!.source.path, anchors: s!.anchors.length, edges: s!.edges.length, gaps: s!.gaps.length }))))
