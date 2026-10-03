import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const CONFIG = {"kind":"single-input","runtime":"node","packageRootRelative":"../../..","processor":{"runtime":"node","entry":"scripts/process-input.mjs","args":["--input","{input}","--output","{output}"]},"inputFlag":"--input","outputFlag":"--output"}
const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, CONFIG.packageRootRelative)
const processorEntry = resolve(packageRoot, CONFIG.processor.entry)

function emit(payload, code) {
  process.stdout.write(JSON.stringify(payload) + "\n")
  process.exitCode = code
}
function usage() {
  const outputWord = CONFIG.kind === "multi-input" ? "<directory>" : "<path>"
  process.stdout.write(JSON.stringify({ status: "help", usage: CONFIG.inputFlag + " <path> " + CONFIG.outputFlag + " " + outputWord }) + "\n")
}
function parseArgs(argv) {
  const inputs = []
  let output
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--help" || token === "-h") return { help: true }
    if (token === CONFIG.inputFlag) {
      const value = argv[index + 1]
      if (!value || value.startsWith("-")) return { error: CONFIG.inputFlag + " requires a path" }
      inputs.push(value)
      index += 1
      continue
    }
    if (token === CONFIG.outputFlag) {
      const value = argv[index + 1]
      if (!value || value.startsWith("-")) return { error: CONFIG.outputFlag + " requires a path" }
      output = value
      index += 1
      continue
    }
    return { error: "unsupported workflow argument: " + token }
  }
  return { inputs, output }
}
function absolute(value) { return resolve(process.cwd(), value) }
function replaceToken(token, input, output) { return token.replaceAll("{input}", input).replaceAll("{output}", output) }
function runProcessor(input, output) {
  const args = CONFIG.processor.args.map((token) => replaceToken(token, input, output))
  const child = spawnSync(process.execPath, [processorEntry, ...args], { cwd: process.cwd(), encoding: "utf8" })
  if (child.error) return { code: 1, diagnostics: [String(child.error)] }
  const code = typeof child.status === "number" ? child.status : 1
  const diagnostics = []
  if (child.stderr && child.stderr.trim()) diagnostics.push(child.stderr.trim().slice(-2000))
  if (child.stdout && child.stdout.trim()) diagnostics.push("source stdout: " + child.stdout.trim().slice(-1000))
  return { code, diagnostics }
}
function checkOutput(output) {
  if (!existsSync(output)) return "output artifact is missing: " + output
  try { statSync(output) } catch (error) { return "output artifact is unreadable: " + String(error) }
  return undefined
}

const parsed = parseArgs(process.argv.slice(2))
if (parsed.help) { usage() }
else if (parsed.error) { emit({ status: "failed", diagnostics: [parsed.error] }, 2) }
else if (CONFIG.kind === "single-input") {
  const input = parsed.inputs && parsed.inputs.length === 1 ? absolute(parsed.inputs[0]) : undefined
  const output = parsed.output ? absolute(parsed.output) : undefined
  if (!input || !output) emit({ status: "failed", diagnostics: ["exactly one " + CONFIG.inputFlag + " and one " + CONFIG.outputFlag + " are required"] }, 2)
  else if (!existsSync(input)) emit({ status: "failed", diagnostics: ["input is missing: " + input] }, 1)
  else if (existsSync(output)) emit({ status: "failed", diagnostics: ["refusing to overwrite existing output: " + output] }, 1)
  else {
    mkdirSync(dirname(output), { recursive: true })
    const run = runProcessor(input, output)
    if (run.code === 2) emit({ status: "not-applicable", inputs: [input], outputs: [], diagnostics: run.diagnostics }, 2)
    else if (run.code !== 0) emit({ status: "failed", inputs: [input], outputs: [], diagnostics: run.diagnostics }, 1)
    else {
      const missing = checkOutput(output)
      if (missing) emit({ status: "failed", inputs: [input], outputs: [], diagnostics: [...run.diagnostics, missing] }, 1)
      else emit({ status: "passed", inputs: [input], outputs: [output], diagnostics: run.diagnostics, residualNextStep: "Interpret the produced artifact." }, 0)
    }
  }
} else {
  const inputs = parsed.inputs || []
  const outputDir = parsed.output ? absolute(parsed.output) : undefined
  if (inputs.length === 0 || !outputDir) emit({ status: "failed", diagnostics: ["one or more " + CONFIG.inputFlag + " values and " + CONFIG.outputFlag + " are required"] }, 2)
  else {
    mkdirSync(outputDir, { recursive: true })
    const items = []
    const outputs = []
    let failed = false
    let notApplicable = false
    const extension = CONFIG.outputExtension || ".out"
    for (let index = 0; index < inputs.length; index += 1) {
      const input = absolute(inputs[index])
      const output = join(outputDir, "item-" + String(index + 1).padStart(3, "0") + extension)
      if (!existsSync(input)) { failed = true; items.push({ input, output, status: "failed", diagnostics: ["input is missing: " + input] }); continue }
      if (existsSync(output)) { failed = true; items.push({ input, output, status: "failed", diagnostics: ["refusing to overwrite existing output: " + output] }); continue }
      const run = runProcessor(input, output)
      if (run.code === 2) { notApplicable = true; items.push({ input, output, status: "not-applicable", diagnostics: run.diagnostics }); continue }
      if (run.code !== 0) { failed = true; items.push({ input, output, status: "failed", diagnostics: run.diagnostics }); continue }
      const missing = checkOutput(output)
      if (missing) { failed = true; items.push({ input, output, status: "failed", diagnostics: [...run.diagnostics, missing] }); continue }
      outputs.push(output)
      items.push({ input, output, status: "passed", diagnostics: run.diagnostics })
    }
    const manifestPath = join(outputDir, "workflow-manifest.json")
    if (existsSync(manifestPath)) { failed = true; items.push({ status: "failed", diagnostics: ["refusing to overwrite existing workflow manifest: " + manifestPath] }) }
    else writeFileSync(manifestPath, JSON.stringify({ schemaVersion: "jit-optimize-workflow-scaffold/v1", items }, null, 2) + "\n")
    const status = failed ? (outputs.length > 0 ? "partial" : "failed") : notApplicable ? (outputs.length > 0 ? "partial" : "not-applicable") : "passed"
    emit({ status, inputs, outputs, diagnostics: [], residualNextStep: "Interpret each produced artifact and review skipped inputs." }, failed ? 1 : notApplicable ? 2 : 0)
  }
}
