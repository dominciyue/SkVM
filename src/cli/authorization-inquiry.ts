import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry, compareLocalInquiry, editAuthorizationInquiry, initializeLocalInquiry, AuthorizationInquiryInputSchema } from "../benchmarks/authorization-dsl/inquiry-local.ts"
import type { LocalAuthorizationCliDependencies } from "../benchmarks/authorization-dsl/local-run.ts"
import type { InquiryMethod } from "../benchmarks/authorization-dsl/inquiry-run.ts"
import { parseInquiryStrategy, InquiryStrategySchema } from "../task-dsl/authorization/control-slice.ts"
const budgetFields = { "max-provider-calls": "maxDispatches", "max-tool-calls": "maxToolCalls", "max-display-bytes": "maxDisplayBytes", "max-read-bytes": "maxReadBytes", "max-output-tokens": "maxTokens", "request-timeout-ms": "perCallTimeoutMs", "session-timeout-ms": "sessionTimeoutMs" } as const

export async function runAuthorizationInquiryCli(argv: string[], dependencies: LocalAuthorizationCliDependencies): Promise<number> {
  const command = argv[0], options: Record<string, string> = {}
  const allowed: Record<string, string[]> = { init: ["from", "out", "source-root"], check: ["input", "method", "strategy"], run: ["input", "out", "model", "method", "strategy", "previous", ...Object.keys(budgetFields)], inspect: ["out"], compare: ["input", "previous", "strategy"], edit: ["input", "edit", "out"] }
  if (!command || command === "--help") { dependencies.stdout(`skvm authorization inquiry init/check/run/inspect/edit/compare. init --from=<input-file|session-directory|archive-root> --out=<new-file> copies a public declaration without answers or graphs; --source-root=<directory> recovers a missing original source location. Input: authorization-inquiry-input/v1; complete inquiry compiles without a model, natural brief is authored during D0/D1 run. --method=M|D0|D1, default D1; --strategy=${InquiryStrategySchema.options.join("|")}, default legacy. Guided run --previous=<session> reuses eligible source extraction and checks a new answer; compare previews eligibility without provider calls. Changed source or incompatible/missing footprints require fresh analysis. Unknown completion requires inspection, never automatic resend. Domain strategy schedules reads and checks finite proposed rules; semantic-flow-v1 lowers local source blocks and assembles current-version branches. Semantic support stays unreviewed. Read-only bounded source actions. Run budgets accept positive integers: --${Object.keys(budgetFields).join(" --")}; timeout limits use milliseconds.`); return 0 }
  if (!allowed[command]) throw new Error("Unknown inquiry command")
  for (const arg of argv.slice(1)) {
    const match = /^--([^=]+)=(.+)$/.exec(arg)
    if (!match || !allowed[command]!.includes(match[1]!) || options[match[1]!] !== undefined) throw new Error(`Invalid inquiry option: ${arg}`)
    options[match[1]!] = match[2]!
  }
  const need = (name: string) => { if (!options[name]) throw new Error(`${command} requires --${name}`); return options[name]! }
  if (options.method && !["M", "D0", "D1"].includes(options.method)) throw new Error("Inquiry method must be M, D0 or D1")
  const strategy = options.strategy ? parseInquiryStrategy(options.strategy) : undefined
  const execution: Record<string, number> = {}
  for (const [flag, field] of Object.entries(budgetFields)) if (options[flag] !== undefined) {
    const value = Number(options[flag])
    if (!/^[1-9]\d*$/.test(options[flag]!) || !Number.isSafeInteger(value)) throw new Error(`--${flag} requires a positive safe integer`)
    execution[field] = value
  }
  let result: any
  if (command === "check") result = await checkAuthorizationInquiry(need("input"), options.method as InquiryMethod | undefined, strategy)
  else if (command === "init") result = await initializeLocalInquiry(need("from"), need("out"), options["source-root"])
  else if (command === "run") result = await executeLocalInquiryRun({ inputFile: need("input"), outDir: need("out"), model: need("model"), method: options.method as InquiryMethod | undefined, strategy, previous: options.previous, providerFactory: dependencies.providerFactory, ...(Object.keys(execution).length ? { execution } : {}) })
  else if (command === "inspect") result = await inspectLocalInquiry(need("out"))
  else if (command === "compare") result = await compareLocalInquiry(need("input"), need("previous"), strategy)
  else {
    const output = path.resolve(need("out")), source = path.resolve(need("input"))
    const original = JSON.parse(await readFile(source, "utf8"))
    const value = editAuthorizationInquiry(original, JSON.parse(await readFile(need("edit"), "utf8")))
    value.sourceRoot = path.relative(path.dirname(output), path.resolve(path.dirname(source), value.sourceRoot)).split(path.sep).join("/") || "."
    AuthorizationInquiryInputSchema.parse(value)
    await writeFile(output, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
    result = { status: "created", outputPath: output, sourceRefVerification: "authored", providerCalls: 0 }
  }
  dependencies.stdout(JSON.stringify(result, null, 2))
  return ["valid", "completed", "current", "needs-review", "created"].includes(result.status) ? 0 : 1
}
