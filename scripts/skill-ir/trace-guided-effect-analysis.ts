import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { z } from "zod"
import { analyzeMatchedConsumptionPairs } from "../../src/jit-optimize/effect.ts"

function flags(args: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") || result.has(key)) {
      throw new Error(`Expected unique --name value pairs; received ${JSON.stringify(args)}`)
    }
    result.set(key, value)
  }
  return result
}

const PairManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-trace-guided-pair-manifest/v1"),
  pairs: z.array(z.object({
    pairId: z.string().min(1),
    originalReport: z.string().min(1),
    optimizedReport: z.string().min(1),
  }).strict()).min(1),
}).strict()

const values = flags(process.argv.slice(2))
const pairsPath = values.get("--pairs")
const outPath = values.get("--out")
if (!pairsPath || !outPath || values.size !== 2) {
  throw new Error("Usage: bun scripts/skill-ir/trace-guided-effect-analysis.ts --pairs <manifest.json> --out <new-report.json>")
}
const manifestPath = resolve(pairsPath)
const manifest = PairManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")))
const pairs = await Promise.all(manifest.pairs.map(async (pair) => ({
  pairId: pair.pairId,
  original: JSON.parse(await readFile(resolve(dirname(manifestPath), pair.originalReport), "utf8")),
  optimized: JSON.parse(await readFile(resolve(dirname(manifestPath), pair.optimizedReport), "utf8")),
})))
const analysis = analyzeMatchedConsumptionPairs(pairs)
await writeFile(resolve(outPath), `${JSON.stringify(analysis, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`)
