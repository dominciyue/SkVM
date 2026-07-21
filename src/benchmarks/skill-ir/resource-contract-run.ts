import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  ResourceContractSchema,
  runResourceProbe,
  type ResourceProbeResult,
} from "./resource-contract.ts"

export interface ResourceProbeArgs {
  rootDir: string
  contract: string
  out: string
}

function safeRelativePath(value: string, label: string): string {
  if (!value || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) {
    throw new Error(`${label} must be a safe relative path`)
  }
  const segments = value.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} must be a safe relative path`)
  }
  return value
}

export function parseResourceProbeArgs(argv: string[]): ResourceProbeArgs {
  let rootDir = process.cwd()
  let contract: string | undefined
  let out: string | undefined

  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = path.resolve(arg.slice("--root-dir=".length))
    else if (arg.startsWith("--contract=")) contract = safeRelativePath(arg.slice("--contract=".length), "--contract")
    else if (arg.startsWith("--out=")) out = safeRelativePath(arg.slice("--out=".length), "--out")
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!contract) throw new Error("--contract is required")
  if (!out) throw new Error("--out is required")
  return { rootDir, contract, out }
}

export async function runResourceProbeFile(
  args: ResourceProbeArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<ResourceProbeResult> {
  const contractPath = path.join(args.rootDir, ...args.contract.split("/"))
  const outPath = path.join(args.rootDir, ...args.out.split("/"))
  const contract = ResourceContractSchema.parse(JSON.parse(await readFile(contractPath, "utf8")))
  const result = await runResourceProbe(contract, { env })
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return result
}

if (import.meta.main) {
  const args = parseResourceProbeArgs(process.argv.slice(2))
  const result = await runResourceProbeFile(args)
  console.log(JSON.stringify(result, null, 2))
  if (result.status !== "ok") process.exitCode = 1
}
