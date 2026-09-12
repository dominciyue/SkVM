import { resolve } from "node:path"
import {
  buildTraceGuidedApiTesterPackage,
  verifyTraceGuidedSkillPackage,
} from "../../src/jit-optimize/solidification.ts"

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

async function main(args: string[]): Promise<void> {
  const mode = args.shift()
  const values = flags(args)
  if (mode === "build") {
    const proposalDir = values.get("--proposal")
    const packageDir = values.get("--out-dir")
    if (!proposalDir || !packageDir || values.size !== 2) {
      throw new Error("Usage: ... build --proposal <jit-proposal-dir> --out-dir <new-empty-dir>")
    }
    const result = await buildTraceGuidedApiTesterPackage({
      proposalDir: resolve(proposalDir),
      packageDir: resolve(packageDir),
    })
    process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`)
    return
  }
  if (mode === "verify") {
    const packageDir = values.get("--package")
    if (!packageDir || values.size !== 1) {
      throw new Error("Usage: ... verify --package <package-dir>")
    }
    const result = await verifyTraceGuidedSkillPackage(resolve(packageDir))
    process.stdout.write(`${JSON.stringify({ status: "pass", manifest: result.manifest }, null, 2)}\n`)
    return
  }
  throw new Error("Usage: bun scripts/skill-ir/trace-guided-api-tester-package.ts <build|verify> ...")
}

await main(process.argv.slice(2))
