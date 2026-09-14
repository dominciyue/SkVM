/**
 * Small execution-oriented workflow skeletons for ordinary local programs.
 *
 * The scaffold owns plumbing only: argument parsing, input iteration, calling
 * a source or model-provided processor, output existence checks, and a concise
 * machine-readable summary. It deliberately does not contain domain
 * transformation logic, a scheduler, a DSL, or a second runtime.
 */

import path from "node:path"
import { mkdir } from "node:fs/promises"
import type { OperationRecord } from "./operation-context.ts"

export const WORKFLOW_SCAFFOLD_SCHEMA_VERSION = "jit-optimize-workflow-scaffold/v1" as const

export type WorkflowScaffoldKind = "single-input" | "multi-input"
export type WorkflowScaffoldRuntime = "node" | "python"
export type WorkflowScaffoldContributor = "framework" | "source" | "model"

export interface WorkflowScaffoldProcessor {
  runtime: WorkflowScaffoldRuntime
  /** Path relative to the package root, never a shell command. */
  entry: string
  /** Literal argv tokens; exactly one {input} and one {output} are required. */
  args: string[]
}

export interface WorkflowScaffoldSpec {
  id: string
  kind: WorkflowScaffoldKind
  runtime: WorkflowScaffoldRuntime
  processor: WorkflowScaffoldProcessor
  /** A model processor is a missing implementation slot, not source reuse. */
  processorContributor?: "source" | "model"
  inputFlag?: string
  outputFlag?: string
  outputExtension?: string
  sourceRefs?: string[]
  modelFiles?: string[]
  residualDuties?: string[]
}

export interface WorkflowScaffoldStep {
  id: string
  reads: string[]
  writes: string[]
  dependsOn: string[]
  contributor: WorkflowScaffoldContributor
}

export interface WorkflowScaffoldManifest {
  schemaVersion: typeof WORKFLOW_SCAFFOLD_SCHEMA_VERSION
  id: string
  kind: WorkflowScaffoldKind
  runtime: WorkflowScaffoldRuntime
  entry: string
  packageRootRelative: string
  processor: WorkflowScaffoldProcessor
  cli: {
    inputFlag: string
    outputFlag: string
    outputExtension?: string
  }
  steps: WorkflowScaffoldStep[]
  contributions: {
    frameworkFiles: string[]
    sourceFiles: string[]
    modelFiles: string[]
  }
  sourceRefs: string[]
  residualDuties: string[]
}

export interface MaterializeWorkflowScaffoldOptions {
  /** Package/workspace root. The processor entry is resolved from this root. */
  rootDir: string
  /** Contained path for the generated ordinary .mjs or .py entry. */
  entryRelative: string
  spec: WorkflowScaffoldSpec
  /** Optional explicit path for the static scaffold manifest. */
  manifestRelative?: string
  /** Override when the generated entry is stored below an engine directory. */
  packageRootRelative?: string
}

export interface MaterializedWorkflowScaffold {
  entryPath: string
  manifestPath: string
  manifest: WorkflowScaffoldManifest
}

export interface WorkflowScaffoldSourceInterface {
  path: string
  runtime: WorkflowScaffoldRuntime | "shell" | "powershell"
}

export interface DerivedWorkflowScaffoldCandidate {
  spec: WorkflowScaffoldSpec
  operationIds: string[]
  sourceRefs: string[]
  diagnostic?: string
  observedFileWork?: {
    readFiles: string[]
    writeFiles: string[]
    mapping: "unresolved-model-selection-required"
  }
}

export interface DeriveWorkflowScaffoldCandidatesOptions {
  operations: readonly OperationRecord[]
  sourceInterfaces: readonly WorkflowScaffoldSourceInterface[]
}

function portable(value: string): string {
  return value.replaceAll("\\", "/")
}

function normalizeRelative(value: string): string {
  return portable(value).replace(/^\.\//u, "")
}

function containedRelative(value: string): string | undefined {
  const normalized = normalizeRelative(value)
  if (!normalized || normalized === "." || normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) return undefined
  const segments = normalized.split("/")
  if (segments.some((segment) => segment === "..")) return undefined
  return normalized
}

function safeId(value: string): string {
  const reduced = value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/-+/gu, "-").replace(/^-+|-+$/gu, "")
  return reduced && !/^\.+$/u.test(reduced) ? reduced : "workflow"
}

function shellSafeFlag(value: string | undefined, fallback: string): string {
  const flag = value ?? fallback
  if (!/^--?[A-Za-z][A-Za-z0-9-]*$/u.test(flag)) throw new Error(`Workflow flag must be a simple option: ${flag}`)
  return flag
}

function outputExtension(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (!/^\.[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) throw new Error(`Workflow output extension is invalid: ${value}`)
  return value
}

function packageRootRelativeFor(entryRelative: string): string {
  const directory = path.posix.dirname(normalizeRelative(entryRelative))
  const relative = path.posix.relative(directory === "." ? "." : directory, ".")
  return relative || "."
}

interface DerivedScaffoldOptions extends MaterializeWorkflowScaffoldOptions {
  entryRelative: string
  manifestRelative: string
  packageRootRelative: string
  inputFlag: string
  outputFlag: string
  outputExtension?: string
}

function validateSpec(options: MaterializeWorkflowScaffoldOptions): Omit<DerivedScaffoldOptions, "spec" | "rootDir"> & { spec: WorkflowScaffoldSpec; rootDir: string } {
  const entryRelative = containedRelative(options.entryRelative)
  if (!entryRelative) throw new Error(`Workflow entry must be a contained relative path: ${options.entryRelative}`)
  const processorEntry = containedRelative(options.spec.processor.entry)
  if (!processorEntry) throw new Error(`Workflow processor entry must be contained: ${options.spec.processor.entry}`)
  if (options.spec.runtime !== options.spec.processor.runtime) throw new Error("Workflow scaffold and source processor must use the same runtime")
  const args = options.spec.processor.args
  if (args.length === 0 || args.some((item) => item.includes("\u0000"))) throw new Error("Workflow processor args must be non-empty and NUL-free")
  const inputTokens = args.filter((item) => item.includes("{input}"))
  const outputTokens = args.filter((item) => item.includes("{output}"))
  if (inputTokens.length !== 1 || outputTokens.length !== 1) throw new Error("Workflow processor args must contain exactly one {input} token and one {output} token")
  const manifestRelative = containedRelative(options.manifestRelative
    ?? `${path.posix.dirname(entryRelative)}/${path.posix.basename(entryRelative, path.posix.extname(entryRelative))}.manifest.json`)
  if (!manifestRelative) throw new Error("Workflow manifest path must be contained")
  const packageRootRelative = options.packageRootRelative === undefined
    ? packageRootRelativeFor(entryRelative)
    : portable(options.packageRootRelative)
  if (!packageRootRelative || path.posix.isAbsolute(packageRootRelative)) throw new Error("Workflow package root relative path is invalid")
  for (const file of options.spec.modelFiles ?? []) {
    if (!containedRelative(file)) throw new Error(`Workflow model contribution path is invalid: ${file}`)
  }
  const normalizedSpec: WorkflowScaffoldSpec = {
    ...options.spec,
    processor: { ...options.spec.processor, entry: processorEntry, args: [...args] },
    ...(options.spec.sourceRefs ? { sourceRefs: [...options.spec.sourceRefs] } : {}),
    ...(options.spec.modelFiles ? { modelFiles: [...options.spec.modelFiles] } : {}),
    ...(options.spec.residualDuties ? { residualDuties: [...options.spec.residualDuties] } : {}),
  }
  const outputExt = outputExtension(options.spec.outputExtension)
  return {
    ...options,
    spec: normalizedSpec,
    entryRelative,
    manifestRelative,
    packageRootRelative,
    inputFlag: shellSafeFlag(options.spec.inputFlag, "--input"),
    outputFlag: shellSafeFlag(options.spec.outputFlag, options.spec.kind === "multi-input" ? "--output-dir" : "--output"),
    ...(outputExt ? { outputExtension: outputExt } : {}),
  }
}

function manifestFor(options: DerivedScaffoldOptions): WorkflowScaffoldManifest {
  const { spec, entryRelative, manifestRelative, packageRootRelative, inputFlag, outputFlag, outputExtension: outputExt } = options
  const processorContributor = spec.processorContributor ?? "source"
  const steps: WorkflowScaffoldStep[] = spec.kind === "single-input"
    ? [
        { id: "read-input", reads: [inputFlag], writes: [], dependsOn: [], contributor: "framework" },
        { id: "invoke-source", reads: ["input"], writes: ["output"], dependsOn: ["read-input"], contributor: processorContributor },
        { id: "verify-output", reads: ["output"], writes: [], dependsOn: ["invoke-source"], contributor: "framework" },
      ]
    : [
        { id: "read-inputs", reads: [inputFlag], writes: [], dependsOn: [], contributor: "framework" },
        { id: "invoke-source", reads: ["each input"], writes: ["each item output"], dependsOn: ["read-inputs"], contributor: processorContributor },
        { id: "aggregate", reads: ["each item output"], writes: [outputFlag, "workflow-manifest.json"], dependsOn: ["invoke-source"], contributor: "framework" },
        { id: "verify-output", reads: [outputFlag], writes: [], dependsOn: ["aggregate"], contributor: "framework" },
      ]
  return {
    schemaVersion: WORKFLOW_SCAFFOLD_SCHEMA_VERSION,
    id: spec.id,
    kind: spec.kind,
    runtime: spec.runtime,
    entry: entryRelative,
    packageRootRelative,
    processor: { ...spec.processor, entry: normalizeRelative(spec.processor.entry), args: [...spec.processor.args] },
    cli: { inputFlag, outputFlag, ...(outputExt ? { outputExtension: outputExt } : {}) },
    steps,
    contributions: {
      frameworkFiles: [entryRelative, manifestRelative],
      sourceFiles: processorContributor === "source" ? [normalizeRelative(spec.processor.entry)] : [],
      modelFiles: [...new Set((spec.modelFiles ?? []).map(normalizeRelative))].sort((left, right) => left.localeCompare(right, "en")),
    },
    sourceRefs: [...new Set((spec.sourceRefs ?? []).map(String))].sort((left, right) => left.localeCompare(right, "en")),
    residualDuties: [...new Set(spec.residualDuties ?? ["Interpret the produced artifact and decide whether the workflow applies."])],
  }
}

function jsonLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/<\/script/giu, "<\\/script")
}

function nodeSource(options: DerivedScaffoldOptions): string {
  const config = {
    kind: options.spec.kind,
    runtime: options.spec.runtime,
    packageRootRelative: options.packageRootRelative,
    processor: options.spec.processor,
    inputFlag: options.inputFlag,
    outputFlag: options.outputFlag,
    ...(options.outputExtension ? { outputExtension: options.outputExtension } : {}),
  }
  const lines = [
    'import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs"',
    'import { dirname, resolve, join } from "node:path"',
    'import { fileURLToPath } from "node:url"',
    'import { spawnSync } from "node:child_process"',
    "",
    `const CONFIG = ${jsonLiteral(config)}`,
    'const scriptDir = dirname(fileURLToPath(import.meta.url))',
    'const packageRoot = resolve(scriptDir, CONFIG.packageRootRelative)',
    'const processorEntry = resolve(packageRoot, CONFIG.processor.entry)',
    "",
    'function emit(payload, code) {',
    '  process.stdout.write(JSON.stringify(payload) + "\\n")',
    '  process.exitCode = code',
    '}',
    'function usage() {',
    '  const outputWord = CONFIG.kind === "multi-input" ? "<directory>" : "<path>"',
    '  process.stdout.write(JSON.stringify({ status: "help", usage: CONFIG.inputFlag + " <path> " + CONFIG.outputFlag + " " + outputWord }) + "\\n")',
    '}',
    'function parseArgs(argv) {',
    '  const inputs = []',
    '  let output',
    '  for (let index = 0; index < argv.length; index += 1) {',
    '    const token = argv[index]',
    '    if (token === "--help" || token === "-h") return { help: true }',
    '    if (token === CONFIG.inputFlag) {',
    '      const value = argv[index + 1]',
    '      if (!value || value.startsWith("-")) return { error: CONFIG.inputFlag + " requires a path" }',
    '      inputs.push(value)',
    '      index += 1',
    '      continue',
    '    }',
    '    if (token === CONFIG.outputFlag) {',
    '      const value = argv[index + 1]',
    '      if (!value || value.startsWith("-")) return { error: CONFIG.outputFlag + " requires a path" }',
    '      output = value',
    '      index += 1',
    '      continue',
    '    }',
    '    return { error: "unsupported workflow argument: " + token }',
    '  }',
    '  return { inputs, output }',
    '}',
    'function absolute(value) { return resolve(process.cwd(), value) }',
    'function replaceToken(token, input, output) { return token.replaceAll("{input}", input).replaceAll("{output}", output) }',
    'function runProcessor(input, output) {',
    '  const args = CONFIG.processor.args.map((token) => replaceToken(token, input, output))',
    '  const child = spawnSync(process.execPath, [processorEntry, ...args], { cwd: process.cwd(), encoding: "utf8" })',
    '  if (child.error) return { code: 1, diagnostics: [String(child.error)] }',
    '  const code = typeof child.status === "number" ? child.status : 1',
    '  const diagnostics = []',
    '  if (child.stderr && child.stderr.trim()) diagnostics.push(child.stderr.trim().slice(-2000))',
    '  if (child.stdout && child.stdout.trim()) diagnostics.push("source stdout: " + child.stdout.trim().slice(-1000))',
    '  return { code, diagnostics }',
    '}',
    'function checkOutput(output) {',
    '  if (!existsSync(output)) return "output artifact is missing: " + output',
    '  try { statSync(output) } catch (error) { return "output artifact is unreadable: " + String(error) }',
    '  return undefined',
    '}',
    "",
    'const parsed = parseArgs(process.argv.slice(2))',
    'if (parsed.help) { usage() }',
    'else if (parsed.error) { emit({ status: "failed", diagnostics: [parsed.error] }, 2) }',
    'else if (CONFIG.kind === "single-input") {',
    '  const input = parsed.inputs && parsed.inputs.length === 1 ? absolute(parsed.inputs[0]) : undefined',
    '  const output = parsed.output ? absolute(parsed.output) : undefined',
    '  if (!input || !output) emit({ status: "failed", diagnostics: ["exactly one " + CONFIG.inputFlag + " and one " + CONFIG.outputFlag + " are required"] }, 2)',
    '  else if (!existsSync(input)) emit({ status: "failed", diagnostics: ["input is missing: " + input] }, 1)',
    '  else if (existsSync(output)) emit({ status: "failed", diagnostics: ["refusing to overwrite existing output: " + output] }, 1)',
    '  else {',
    '    mkdirSync(dirname(output), { recursive: true })',
    '    const run = runProcessor(input, output)',
    '    if (run.code === 2) emit({ status: "not-applicable", inputs: [input], outputs: [], diagnostics: run.diagnostics }, 2)',
    '    else if (run.code !== 0) emit({ status: "failed", inputs: [input], outputs: [], diagnostics: run.diagnostics }, 1)',
    '    else {',
    '      const missing = checkOutput(output)',
    '      if (missing) emit({ status: "failed", inputs: [input], outputs: [], diagnostics: [...run.diagnostics, missing] }, 1)',
    '      else emit({ status: "passed", inputs: [input], outputs: [output], diagnostics: run.diagnostics, residualNextStep: "Interpret the produced artifact." }, 0)',
    '    }',
    '  }',
    '} else {',
    '  const inputs = parsed.inputs || []',
    '  const outputDir = parsed.output ? absolute(parsed.output) : undefined',
    '  if (inputs.length === 0 || !outputDir) emit({ status: "failed", diagnostics: ["one or more " + CONFIG.inputFlag + " values and " + CONFIG.outputFlag + " are required"] }, 2)',
    '  else {',
    '    mkdirSync(outputDir, { recursive: true })',
    '    const items = []',
    '    const outputs = []',
    '    let failed = false',
    '    let notApplicable = false',
    '    const extension = CONFIG.outputExtension || ".out"',
    '    for (let index = 0; index < inputs.length; index += 1) {',
    '      const input = absolute(inputs[index])',
    '      const output = join(outputDir, "item-" + String(index + 1).padStart(3, "0") + extension)',
    '      if (!existsSync(input)) { failed = true; items.push({ input, output, status: "failed", diagnostics: ["input is missing: " + input] }); continue }',
    '      if (existsSync(output)) { failed = true; items.push({ input, output, status: "failed", diagnostics: ["refusing to overwrite existing output: " + output] }); continue }',
    '      const run = runProcessor(input, output)',
    '      if (run.code === 2) { notApplicable = true; items.push({ input, output, status: "not-applicable", diagnostics: run.diagnostics }); continue }',
    '      if (run.code !== 0) { failed = true; items.push({ input, output, status: "failed", diagnostics: run.diagnostics }); continue }',
    '      const missing = checkOutput(output)',
    '      if (missing) { failed = true; items.push({ input, output, status: "failed", diagnostics: [...run.diagnostics, missing] }); continue }',
    '      outputs.push(output)',
    '      items.push({ input, output, status: "passed", diagnostics: run.diagnostics })',
    '    }',
    '    const manifestPath = join(outputDir, "workflow-manifest.json")',
    '    if (existsSync(manifestPath)) { failed = true; items.push({ status: "failed", diagnostics: ["refusing to overwrite existing workflow manifest: " + manifestPath] }) }',
    `    else writeFileSync(manifestPath, JSON.stringify({ schemaVersion: "${WORKFLOW_SCAFFOLD_SCHEMA_VERSION}", items }, null, 2) + "\\n")`,
    '    const status = failed ? (outputs.length > 0 ? "partial" : "failed") : notApplicable ? (outputs.length > 0 ? "partial" : "not-applicable") : "passed"',
    '    emit({ status, inputs, outputs, diagnostics: [], residualNextStep: "Interpret each produced artifact and review skipped inputs." }, failed ? 1 : notApplicable ? 2 : 0)',
    '  }',
    '}',
  ]
  return `${lines.join("\n")}\n`
}

function pythonSource(options: DerivedScaffoldOptions): string {
  const config = {
    kind: options.spec.kind,
    runtime: options.spec.runtime,
    packageRootRelative: options.packageRootRelative,
    processor: options.spec.processor,
    inputFlag: options.inputFlag,
    outputFlag: options.outputFlag,
    ...(options.outputExtension ? { outputExtension: options.outputExtension } : {}),
  }
  const configLiteral = JSON.stringify(JSON.stringify(config))
  const lines = [
    "import json",
    "import os",
    "import subprocess",
    "import sys",
    "from pathlib import Path",
    "",
    `CONFIG = json.loads(${configLiteral})`,
    "SCRIPT_DIR = Path(__file__).resolve().parent",
    "PACKAGE_ROOT = (SCRIPT_DIR / CONFIG['packageRootRelative']).resolve()",
    "PROCESSOR_ENTRY = (PACKAGE_ROOT / CONFIG['processor']['entry']).resolve()",
    "",
    "def emit(payload, code):",
    "    print(json.dumps(payload, ensure_ascii=False))",
    "    raise SystemExit(code)",
    "",
    "def parse_args(argv):",
    "    inputs = []",
    "    output = None",
    "    index = 0",
    "    while index < len(argv):",
    "        token = argv[index]",
    "        if token in ('--help', '-h'):",
    "            return {'help': True}",
    "        if token == CONFIG['inputFlag']:",
    "            if index + 1 >= len(argv) or argv[index + 1].startswith('-'):",
    "                return {'error': CONFIG['inputFlag'] + ' requires a path'}",
    "            inputs.append(argv[index + 1])",
    "            index += 2",
    "            continue",
    "        if token == CONFIG['outputFlag']:",
    "            if index + 1 >= len(argv) or argv[index + 1].startswith('-'):",
    "                return {'error': CONFIG['outputFlag'] + ' requires a path'}",
    "            output = argv[index + 1]",
    "            index += 2",
    "            continue",
    "        return {'error': 'unsupported workflow argument: ' + token}",
    "    return {'inputs': inputs, 'output': output}",
    "",
    "def absolute(value):",
    "    return str((Path.cwd() / value).resolve())",
    "",
    "def run_processor(input_path, output_path):",
    "    args = [token.replace('{input}', input_path).replace('{output}', output_path) for token in CONFIG['processor']['args']]",
    "    try:",
    "        completed = subprocess.run([sys.executable, str(PROCESSOR_ENTRY), *args], cwd=os.getcwd(), capture_output=True, text=True)",
    "    except OSError as error:",
    "        return 1, [str(error)]",
    "    diagnostics = []",
    "    if completed.stderr.strip():",
    "        diagnostics.append(completed.stderr.strip()[-2000:])",
    "    if completed.stdout.strip():",
    "        diagnostics.append('source stdout: ' + completed.stdout.strip()[-1000:])",
    "    return completed.returncode, diagnostics",
    "",
    "def check_output(output_path):",
    "    if not Path(output_path).exists():",
    "        return 'output artifact is missing: ' + output_path",
    "    return None",
    "",
    "parsed = parse_args(sys.argv[1:])",
    "if parsed.get('help'):",
    "    print(json.dumps({'status': 'help', 'usage': CONFIG['inputFlag'] + ' <path> ' + CONFIG['outputFlag'] + ' <path>'}))",
    "    raise SystemExit(0)",
    "if parsed.get('error'):",
    "    emit({'status': 'failed', 'diagnostics': [parsed['error']]}, 2)",
    "inputs = parsed.get('inputs', [])",
    "output_value = parsed.get('output')",
    "if CONFIG['kind'] == 'single-input':",
    "    input_path = absolute(inputs[0]) if len(inputs) == 1 else None",
    "    output_path = absolute(output_value) if output_value else None",
    "    if not input_path or not output_path:",
    "        emit({'status': 'failed', 'diagnostics': ['exactly one ' + CONFIG['inputFlag'] + ' and one ' + CONFIG['outputFlag'] + ' are required']}, 2)",
    "    if not Path(input_path).exists():",
    "        emit({'status': 'failed', 'diagnostics': ['input is missing: ' + input_path]}, 1)",
    "    if Path(output_path).exists():",
    "        emit({'status': 'failed', 'diagnostics': ['refusing to overwrite existing output: ' + output_path]}, 1)",
    "    Path(output_path).parent.mkdir(parents=True, exist_ok=True)",
    "    code, diagnostics = run_processor(input_path, output_path)",
    "    if code == 2:",
    "        emit({'status': 'not-applicable', 'inputs': [input_path], 'outputs': [], 'diagnostics': diagnostics}, 2)",
    "    if code != 0:",
    "        emit({'status': 'failed', 'inputs': [input_path], 'outputs': [], 'diagnostics': diagnostics}, 1)",
    "    missing = check_output(output_path)",
    "    if missing:",
    "        emit({'status': 'failed', 'inputs': [input_path], 'outputs': [], 'diagnostics': diagnostics + [missing]}, 1)",
    "    emit({'status': 'passed', 'inputs': [input_path], 'outputs': [output_path], 'diagnostics': diagnostics, 'residualNextStep': 'Interpret the produced artifact.'}, 0)",
    "",
    "if not inputs or not output_value:",
    "    emit({'status': 'failed', 'diagnostics': ['one or more ' + CONFIG['inputFlag'] + ' values and ' + CONFIG['outputFlag'] + ' are required']}, 2)",
    "output_dir = Path(absolute(output_value))",
    "output_dir.mkdir(parents=True, exist_ok=True)",
    "items = []",
    "outputs = []",
    "failed = False",
    "not_applicable = False",
    "extension = CONFIG.get('outputExtension', '.out')",
    "for index, raw_input in enumerate(inputs, start=1):",
    "    input_path = absolute(raw_input)",
    "    output_path = output_dir / f'item-{index:03d}{extension}'",
    "    if not Path(input_path).exists():",
    "        failed = True",
    "        items.append({'input': input_path, 'output': str(output_path), 'status': 'failed', 'diagnostics': ['input is missing: ' + input_path]})",
    "        continue",
    "    if output_path.exists():",
    "        failed = True",
    "        items.append({'input': input_path, 'output': str(output_path), 'status': 'failed', 'diagnostics': ['refusing to overwrite existing output: ' + str(output_path)]})",
    "        continue",
    "    code, diagnostics = run_processor(input_path, str(output_path))",
    "    if code == 2:",
    "        not_applicable = True",
    "        items.append({'input': input_path, 'output': str(output_path), 'status': 'not-applicable', 'diagnostics': diagnostics})",
    "        continue",
    "    if code != 0:",
    "        failed = True",
    "        items.append({'input': input_path, 'output': str(output_path), 'status': 'failed', 'diagnostics': diagnostics})",
    "        continue",
    "    missing = check_output(output_path)",
    "    if missing:",
    "        failed = True",
    "        items.append({'input': input_path, 'output': str(output_path), 'status': 'failed', 'diagnostics': diagnostics + [missing]})",
    "        continue",
    "    outputs.append(str(output_path))",
    "    items.append({'input': input_path, 'output': str(output_path), 'status': 'passed', 'diagnostics': diagnostics})",
    "manifest_path = output_dir / 'workflow-manifest.json'",
    "if manifest_path.exists():",
    "    failed = True",
    "    items.append({'status': 'failed', 'diagnostics': ['refusing to overwrite existing workflow manifest: ' + str(manifest_path)]})",
    "else:",
    `    manifest_path.write_text(json.dumps({'schemaVersion': '${WORKFLOW_SCAFFOLD_SCHEMA_VERSION}', 'items': items}, indent=2) + '\\n', encoding='utf-8')`,
    "status = 'partial' if failed and outputs else 'failed' if failed else 'partial' if not_applicable and outputs else 'not-applicable' if not_applicable else 'passed'",
    "emit({'status': status, 'inputs': inputs, 'outputs': outputs, 'diagnostics': [], 'residualNextStep': 'Interpret each produced artifact and review skipped inputs.'}, 1 if failed else 2 if not_applicable else 0)",
  ]
  return `${lines.join("\n")}\n`
}

export function buildWorkflowScaffoldSource(options: MaterializeWorkflowScaffoldOptions): string {
  const derived = validateSpec(options)
  return derived.spec.runtime === "node" ? nodeSource(derived) : pythonSource(derived)
}

export function buildWorkflowScaffoldManifest(options: MaterializeWorkflowScaffoldOptions): WorkflowScaffoldManifest {
  return manifestFor(validateSpec(options))
}

export async function materializeWorkflowScaffold(
  options: MaterializeWorkflowScaffoldOptions,
): Promise<MaterializedWorkflowScaffold> {
  const derived = validateSpec(options)
  const root = path.resolve(options.rootDir)
  const entryPath = path.resolve(root, derived.entryRelative)
  const manifestPath = path.resolve(root, derived.manifestRelative)
  const contained = (candidate: string): boolean => {
    const relative = path.relative(root, candidate)
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  }
  if (!contained(entryPath) || !contained(manifestPath)) throw new Error("Workflow scaffold output escaped root")
  const manifest = manifestFor(derived)
  await mkdir(path.dirname(entryPath), { recursive: true })
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await Bun.write(entryPath, derived.spec.runtime === "node" ? nodeSource(derived) : pythonSource(derived))
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { entryPath, manifestPath, manifest }
}

function runtimeForOperation(
  operation: OperationRecord,
  sourceInterfaces: readonly WorkflowScaffoldSourceInterface[],
): WorkflowScaffoldRuntime | undefined {
  const source = sourceInterfaces.find((item) => normalizeRelative(item.path) === normalizeRelative(operation.entry ?? ""))
  if (source?.runtime === "node" || source?.runtime === "python") return source.runtime
  const entry = operation.entry ?? ""
  if (/\.(?:mjs|cjs|js|ts)$/iu.test(entry)) return "node"
  if (/\.py$/iu.test(entry)) return "python"
  return undefined
}

function operationEntryIndex(operation: OperationRecord): number | undefined {
  if (!operation.argv || !operation.entry) return undefined
  const expected = normalizeRelative(operation.entry)
  const index = operation.argv.findIndex((token) => normalizeRelative(token) === expected)
  return index >= 0 ? index : undefined
}

function operationTemplate(
  operation: OperationRecord,
  runtime: WorkflowScaffoldRuntime,
): { args: string[]; input: string; output: string } | undefined {
  const index = operationEntryIndex(operation)
  if (index === undefined || !operation.argv) return undefined
  const inputs = [...new Set(operation.readFiles.map(normalizeRelative))]
  const outputs = [...new Set(operation.writeFiles.map(normalizeRelative))]
  if (inputs.length !== 1 || outputs.length !== 1) return undefined
  const input = inputs[0]!
  const output = outputs[0]!
  let inputCount = 0
  let outputCount = 0
  const args = operation.argv.slice(index + 1).map((token) => {
    let next = token
    if (next === input || next.endsWith(`=${input}`)) {
      next = next.replaceAll(input, "{input}")
      inputCount += 1
    }
    if (next === output || next.endsWith(`=${output}`)) {
      next = next.replaceAll(output, "{output}")
      outputCount += 1
    }
    return next
  })
  if (inputCount !== 1 || outputCount !== 1) return undefined
  // Keep runtime as an explicit argument in the helper signature so a future
  // adapter cannot accidentally construct a mixed-runtime candidate.
  void runtime
  return { args, input, output }
}

/**
 * Derive source-backed scaffolds from actual observed operations. This is an
 * indexer only: it does not read source files, execute commands, or claim that
 * the processor's domain semantics are complete.
 */
export function deriveWorkflowScaffoldCandidates(
  options: DeriveWorkflowScaffoldCandidatesOptions,
): DerivedWorkflowScaffoldCandidate[] {
  const usable = options.operations.filter((operation) => (
    operation.kind === "execute"
    && operation.status === "observed"
    && Boolean(operation.entry)
    && Boolean(operation.argv)
    && operation.readFiles.length === 1
    && operation.writeFiles.length === 1
  ))
  const candidates: DerivedWorkflowScaffoldCandidate[] = []
  const seen = new Set<string>()
  const groups = new Map<string, OperationRecord[]>()
  for (const operation of usable) {
    const entry = normalizeRelative(operation.entry!)
    if (!containedRelative(entry)) continue
    const runtime = runtimeForOperation(operation, options.sourceInterfaces)
    const template = runtime ? operationTemplate(operation, runtime) : undefined
    if (!runtime || !template) continue
    const key = entry
    groups.set(key, [...(groups.get(key) ?? []), operation])
    const id = `observed-${safeId(entry)}-single`
    if (seen.has(id)) continue
    seen.add(id)
    candidates.push({
      spec: {
        id,
        kind: "single-input",
        runtime,
        processor: { runtime, entry, args: template.args },
        sourceRefs: [operation.sourceLocator],
        residualDuties: ["Decide whether the source processor applies and interpret its artifact."],
      },
      operationIds: [operation.id],
      sourceRefs: [operation.sourceLocator],
    })
  }
  for (const [entry, operations] of groups) {
    const distinctInputs = new Set(operations.map((operation) => normalizeRelative(operation.readFiles[0]!)))
    if (distinctInputs.size < 2) continue
    const first = operations[0]!
    const runtime = runtimeForOperation(first, options.sourceInterfaces)
    const template = runtime ? operationTemplate(first, runtime) : undefined
    if (!runtime || !template) continue
    const id = `observed-${safeId(entry)}-multi`
    if (seen.has(id)) continue
    seen.add(id)
    candidates.push({
      spec: {
        id,
        kind: "multi-input",
        runtime,
        processor: { runtime, entry, args: template.args },
        sourceRefs: operations.map((operation) => operation.sourceLocator),
        residualDuties: ["Review skipped or failed items and interpret each produced artifact."],
      },
      operationIds: operations.map((operation) => operation.id),
      sourceRefs: operations.map((operation) => operation.sourceLocator),
    })
  }
  {
    const coveredOutputs = new Set([...groups.values()].flatMap((items) => items.flatMap((item) => item.writeFiles.map(normalizeRelative))))
    const reads = options.operations.filter((item) => item.kind === "read" && item.status === "observed" && item.readFiles.length > 0)
    const writes = options.operations.filter((item) => item.kind === "write" && item.status === "observed"
      && item.writeFiles.some((file) => !coveredOutputs.has(normalizeRelative(file))))
    if (reads.length > 0 && writes.length > 0) {
      const sourceRefs = [...new Set([...reads, ...writes].map((item) => item.sourceLocator))]
      const kinds: WorkflowScaffoldKind[] = ["single-input"]
      if (new Set(reads.flatMap((item) => item.readFiles)).size > 1) kinds.push("multi-input")
      for (const kind of kinds) {
        candidates.push({
          spec: {
            id: `model-processor-${kind}`,
            kind,
            runtime: "node",
            processor: { runtime: "node", entry: "scripts/process-input.mjs", args: ["--input", "{input}", "--output", "{output}"] },
            processorContributor: "model",
            sourceRefs,
            residualDuties: [
              "Select a source-supported mechanical boundary and implement the missing processor before use.",
              "Keep classification, translation and other unresolved semantic decisions with the agent.",
              "This is optional framework plumbing, not an observed source interface or a working program.",
            ],
          },
          operationIds: [...reads, ...writes].map((item) => item.id),
          sourceRefs,
          observedFileWork: {
            readFiles: [...new Set(reads.flatMap((item) => item.readFiles))],
            writeFiles: [...new Set(writes.flatMap((item) => item.writeFiles))],
            mapping: "unresolved-model-selection-required",
          },
          diagnostic: "requires-model-processor: scripts/process-input.mjs is not implemented; adapt the scaffold and its package-root binding when adopting it outside .optimize, declare actual model files, and validate the resulting artifact-producing command.",
        })
      }
    }
  }
  return candidates
}
