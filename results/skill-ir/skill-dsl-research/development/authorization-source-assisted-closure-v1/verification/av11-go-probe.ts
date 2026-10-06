import path from "node:path"
import { writeFile } from "node:fs/promises"
import { loadInquiryInput } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { root } from "../study.ts"

const loaded = await loadInquiryInput(path.join(root, "model/inputs/gitea-create-issue-original.json"))
const tools = await createInquiryTools({ ...loaded.context, structure: true, maxToolCalls: 64, maxReadBytes: 33554432, maxDisplayBytes: 786432, maxFiles: 512 })
const symbol = tools.structure!.symbols.find(s => s.qualifiedName === "routers/api/v1/repo.CreateIssue")!
const routes = tools.structure!.routes.filter(r => r.candidateIds.includes(symbol.id))
if (routes.length !== 1 || routes[0]!.method !== "POST" || routes[0]!.path !== "/repos/{username}/{reponame}/issues") throw new Error("Actual registered chained CreateIssue route remains unbound")
const read = await tools.execute("source_read", { path: symbol.path, startLine: symbol.startLine, endLine: symbol.endLine })
const skeleton = await tools.sourceSkeleton(symbol.id)
console.log(JSON.stringify({ readStatus: read.status, readCode: read.code, modelCovered: skeleton?.modelCovered, anchors: skeleton?.anchors.length, gaps: skeleton?.gaps, source: skeleton?.source, matchedCalls: skeleton?.anchors.filter(a => a.call?.expression.includes("NewIssue")).map(a => a.call?.expression), indexedCalls: tools.structure!.relatedCalls(symbol.id).filter(c => c.expression.includes("NewIssue")).map(c => c.expression) }))
if (!skeleton?.modelCovered || !skeleton.anchors.some(a => a.call?.expression === "issue_service.NewIssue")) throw new Error("Actual CreateIssue body or call syntax was not preserved")
const result = { schemaVersion: "authorization-av-go-source-probe/v1", repository: loaded.value.repository, sourceRef: loaded.value.sourceRef, inputSha256: loaded.inputSha256, symbol, routes, skeleton, sourceVerification: await tools.verifySnapshot(), beforeRepairIndependentFinding: "Multiline chained .Post verb retained leading whitespace and was absent from StructureRoute", repair: "Trim only final AST verb token; preserve raw source expression, spans, middleware and nested paths", verification: "Anonymous multiline fixture failed with empty POST routes, then 16 tests / 42 assertions passed", providerCalls: 0, targetExecutions: 0, semanticMeaning: "not interpreted" }
await writeFile(path.join(root, "verification/av11-go-probe.json"), JSON.stringify(result, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
console.log(JSON.stringify({ routes: routes.map(r => ({ method: r.method, path: r.path, sourcePath: r.sourcePath, startLine: r.startLine, endLine: r.endLine, middleware: r.middlewareExpressions })), symbol: symbol.qualifiedName, modelCovered: skeleton.modelCovered, anchors: skeleton.anchors.length, gaps: skeleton.gaps.map(g => ({ code: g.code, line: g.selector.startLine })), providerCalls: 0, targetExecutions: 0 }))
