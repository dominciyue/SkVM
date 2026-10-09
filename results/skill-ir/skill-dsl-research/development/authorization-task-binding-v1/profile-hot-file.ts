import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { buildStructureIndex } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts"
import { root, bbRoot } from "./study.ts"
const file = "backend/open_webui/config.py", content = await readFile(path.join(bbRoot, "model/packages/owui/source", file), "utf8")
const started = performance.now(), events: unknown[] = []
const index = await buildStructureIndex([{ path: file, content }], { repository: "owui", sourceRef: "profile-original" }, { onFile: e => events.push(e), onPostprocess: () => events.push({ phase: "postprocess", elapsedMs: performance.now() - started }) })
await writeFile(path.join(root, "verification/hot-file-cpu-facts.json"), JSON.stringify({ file, elapsedMs: performance.now() - started, symbols: index.symbols.length, calls: index.calls.length, events, modelCalls: 0 }, null, 2), { flag: "wx" })
