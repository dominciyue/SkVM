import { readFileSync, writeFileSync } from "node:fs"
import { buildTokenReport } from "./report.ts"

const help = "bun ./scripts/token-accounting/cli.ts --input=./observations.json [--out=./comparison.json]"

export function runTokenAccountingCli(args: string[]): void {
  if (args.length === 1 && args[0] === "--help") { console.log(help); return }
  const options = new Map<string, string>()
  for (const arg of args) {
    const match = /^--(input|out)=(.+)$/u.exec(arg)
    if (!match || options.has(match[1]!)) throw new Error(`Expected unique --input/--out paths. ${help}`)
    options.set(match[1]!, match[2]!)
  }
  const input = options.get("input")
  if (!input) throw new Error(help)
  const report = buildTokenReport(JSON.parse(readFileSync(input, "utf8")))
  const bytes = `${JSON.stringify(report, null, 2)}\n`
  const output = options.get("out")
  if (output) writeFileSync(output, bytes, { encoding: "utf8", flag: "wx" })
  else process.stdout.write(bytes)
}

if (import.meta.main) {
  try { runTokenAccountingCli(process.argv.slice(2)) }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Token accounting failed")
    process.exitCode = 1
  }
}
