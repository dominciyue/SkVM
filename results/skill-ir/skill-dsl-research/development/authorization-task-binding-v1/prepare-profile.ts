import { appendFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { root, bbRoot } from "./study.ts"
const task = process.argv[2] ?? "owui", label = process.argv[3] ?? "baseline"
const directory = path.join(root, "verification"), eventsFile = path.join(directory, `preparation-${task}-${label}.jsonl`)
writeFileSync(eventsFile, "", { flag: "wx" })
const loaded = await loadInquiryInput(path.join(bbRoot, "model/packages", task, "inquiry.json"))
try {
  const tools = await createInquiryTools({ ...loaded.context, structure: true, maxReadBytes: 33554432, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true, preparation: { timeoutMs: 180000, onProgress: event => appendFileSync(eventsFile, JSON.stringify(event) + "\n") } })
  writeFileSync(path.join(directory, `preparation-${task}-${label}.json`), JSON.stringify({ status: "completed", inputSha256: loaded.inputSha256, sourceRoot: loaded.context.sourceRoot, sourceRef: loaded.context.sourceRef, allowedPaths: loaded.context.allowedPaths, files: tools.files, indexBytes: tools.indexBytes, structureRevision: tools.structure?.revision, symbols: tools.structure?.symbols.length, calls: tools.structure?.calls.length, events: tools.preparation, modelCalls: 0, targetExecutions: 0 }, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ task, status: "completed", files: tools.files.length, elapsedMs: tools.preparation.at(-1)?.elapsedMs }))
} catch (error) { console.error(error); process.exitCode = 1 }
