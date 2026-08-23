import path from "node:path"
import { writeBidsContractArtifacts } from "./bids-contract.ts"

const outputDirectory = path.resolve(
  process.cwd(),
  "benchmarks/skill-ir/pilots/bids",
)
const result = await writeBidsContractArtifacts({ outputDirectory })
process.stdout.write(`${JSON.stringify({
  outputDirectory: path.relative(process.cwd(), outputDirectory),
  tasks: result.taskSet.tasks.length,
  publicFieldPaths: result.publicInterface.publicFieldPaths.length,
}, null, 2)}\n`)
