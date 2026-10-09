import { parentPort, workerData } from "node:worker_threads"
import { extractStructureFacts } from "./structure-index.ts"
try {
  const value = await extractStructureFacts(workerData.files, workerData.identity, { onFile: event => parentPort!.postMessage({ event }) })
  parentPort!.postMessage({ value })
} catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) }) }
finally { parentPort!.close() }
