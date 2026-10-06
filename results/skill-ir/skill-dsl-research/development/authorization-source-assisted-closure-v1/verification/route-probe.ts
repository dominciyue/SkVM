import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { createInquiryTools } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryWorklist } from "../../../../../../src/benchmarks/authorization-dsl/inquiry-worklist.ts"
import { compileAuthorizationInquiry } from "../../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { createControlSlice } from "../../../../../../src/task-dsl/authorization/control-slice.ts"

const inputFile = path.resolve(import.meta.dir, "../model/inputs/owui-ingestion.json")
const input = JSON.parse(await readFile(inputFile, "utf8"))
const tools = await createInquiryTools({ ...input, sourceRoot: path.resolve(path.dirname(inputFile), input.sourceRoot), maxReadBytes: 33554432, maxDisplayBytes: 786432, maxToolCalls: 64, structure: true })
const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: input.mode, questions: [{ id: "q", request: input.brief, premises: [] }] })
const worklist = createInquiryWorklist({ program, tools, entryContext: input.brief, structural: true, requireEntryBasis: true })
await worklist.run(createControlSlice(), 1)
const entry = worklist.snapshot().find(w => w.kind === "entry" && w.origin === "question-duty")!
if (entry.selected?.name !== "process_file" || entry.selectedBy !== "source-confirmed-candidate") throw new Error("Original natural task did not select its actual source-bound route")
const record = { schemaVersion: "av-route-probe/v1", providerDispatches: 0, targetExecutions: 0, originalInput: path.relative(path.resolve(import.meta.dir, "../../../../../.."), inputFile).replaceAll("\\", "/"), entry, routes: tools.structure!.routes.filter(r => r.candidateIds.includes(entry.selected!.id)), sourceDiagnostics: tools.structure!.diagnostics, sourceBytes: tools.indexBytes, displayedBytes: tools.displayBytes, conclusion: "Location and original body only; no authorization conclusion." }
const outputName = process.argv[2] ?? "av3-owui-route.json"
if (!/^av3-owui-route(?:-[a-z]+)?\.json$/.test(outputName)) throw new Error("Use a named probe revision in verification")
await writeFile(path.resolve(import.meta.dir, outputName), JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ selected: entry.selected.name, basis: entry.selectedBy, routes: record.routes.length, state: entry.state, providerDispatches: 0 }))
