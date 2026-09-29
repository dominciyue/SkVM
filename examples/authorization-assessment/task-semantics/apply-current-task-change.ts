import { readFile, writeFile } from "node:fs/promises"
import { applyTaskChange } from "../../../src/benchmarks/authorization-dsl/authoring-task.ts"

const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--(task|change|out)=(.+)$/.exec(arg)
  if (!match) throw new Error(`Unknown option: ${arg}`)
  return [match[1], match[2]]
}))
if (!options.task || !options.change || !options.out) throw new Error("Usage: bun apply-current-task-change.ts --task=<current-task.json> --change=<change.json> --out=<new-task.json>")
const current = JSON.parse(await readFile(options.task, "utf8"))
const change = JSON.parse(await readFile(options.change, "utf8"))
const result = applyTaskChange(current, change)
if (result.status !== "ready") throw new Error(JSON.stringify(result.diagnostics))
await writeFile(options.out, `${JSON.stringify(result.current, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
console.log(JSON.stringify({ status: "changed", outputPath: options.out, changedPaths: result.changedPaths, providerCalls: 0 }))
