import path from "node:path"
import { stat } from "node:fs/promises"
import type { ImplementationSelection } from "./implementations.ts"

export interface ProgramValidationExpectation {
  args: string[]
  expectedExitCode?: number
  stdoutIncludes?: string[]
  stderrIncludes?: string[]
}

export interface ProgramValidationCase extends ProgramValidationExpectation {
  id: string
  cwd: string
  expectedFiles?: string[]
}

export interface ProgramOutputFileEvidence {
  path: string
  bytes: number
  sha256: string
}

export interface ProgramRunValidation {
  id: string
  status: "passed" | "failed"
  command: string[]
  cwd: string
  exitCode: number
  stdout: string
  stderr: string
  outputFiles: ProgramOutputFileEvidence[]
  diagnostics: string[]
}

export interface OptimizationProgramValidationResult {
  status: "passed" | "failed" | "not-applicable"
  actionId: string
  entry?: string
  help?: ProgramRunValidation
  cases: ProgramRunValidation[]
  diagnostics: Array<{ code: string; message: string }>
}

export interface ValidateOptimizationProgramOptions {
  packageDir: string
  implementation: ImplementationSelection
  help?: ProgramValidationExpectation
  cases: ProgramValidationCase[]
  timeoutMs?: number
}

function resolveContained(root: string, relativePath: string): string | undefined {
  const absoluteRoot = path.resolve(root)
  const absolute = path.resolve(absoluteRoot, relativePath)
  const relative = path.relative(absoluteRoot, absolute)
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return undefined
  }
  return absolute
}

async function regularFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

function runtimeCommand(implementation: ImplementationSelection, entry: string): string[] | undefined {
  switch (implementation.runtime) {
    case "node": return [process.execPath, entry]
    case "python": return [process.env.PYTHON_EXECUTABLE ?? (process.platform === "win32" ? "python" : "python3"), entry]
    case "shell": return ["sh", entry]
    case "powershell": return ["pwsh", "-NoProfile", "-File", entry]
    default: return undefined
  }
}

async function digestFile(root: string, relativePath: string): Promise<ProgramOutputFileEvidence | undefined> {
  const absolute = resolveContained(root, relativePath)
  if (!absolute || !await regularFile(absolute)) return undefined
  const bytes = new Uint8Array(await Bun.file(absolute).arrayBuffer())
  return {
    path: relativePath.split(path.sep).join("/"),
    bytes: bytes.byteLength,
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  }
}

async function runValidation(
  id: string,
  commandBase: string[],
  cwd: string,
  expectation: ProgramValidationExpectation & { expectedFiles?: string[] },
  timeoutMs: number,
): Promise<ProgramRunValidation> {
  const command = [...commandBase, ...expectation.args]
  let processHandle: ReturnType<typeof Bun.spawn>
  try {
    processHandle = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" })
  } catch (error) {
    return {
      id,
      status: "failed",
      command,
      cwd,
      exitCode: -1,
      stdout: "",
      stderr: "",
      outputFiles: [],
      diagnostics: [`process start failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<number>((resolve) => {
    timer = setTimeout(() => {
      processHandle.kill()
      resolve(-1)
    }, timeoutMs)
  })
  const exitCode = await Promise.race([processHandle.exited, timeout])
  if (timer) clearTimeout(timer)
  if (!(processHandle.stdout instanceof ReadableStream) || !(processHandle.stderr instanceof ReadableStream)) {
    return {
      id,
      status: "failed",
      command,
      cwd: path.resolve(cwd),
      exitCode,
      stdout: "",
      stderr: "",
      outputFiles: [],
      diagnostics: ["process output was not exposed as readable streams"],
    }
  }
  const [stdout, stderr] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ])
  const diagnostics: string[] = []
  const expectedExitCode = expectation.expectedExitCode ?? 0
  if (exitCode !== expectedExitCode) diagnostics.push(`expected exit ${expectedExitCode}, received ${exitCode}`)
  for (const fragment of expectation.stdoutIncludes ?? []) {
    if (!stdout.includes(fragment)) diagnostics.push(`stdout is missing required fragment: ${fragment}`)
  }
  for (const fragment of expectation.stderrIncludes ?? []) {
    if (!stderr.includes(fragment)) diagnostics.push(`stderr is missing required fragment: ${fragment}`)
  }
  const outputFiles: ProgramOutputFileEvidence[] = []
  for (const outputPath of expectation.expectedFiles ?? []) {
    const evidence = await digestFile(cwd, outputPath)
    if (evidence) outputFiles.push(evidence)
    else diagnostics.push(`expected output file is missing or outside cwd: ${outputPath}`)
  }
  return {
    id,
    status: diagnostics.length === 0 ? "passed" : "failed",
    command,
    cwd: path.resolve(cwd),
    exitCode,
    stdout,
    stderr,
    outputFiles,
    diagnostics,
  }
}

/** Execute a selected program's help and explicit cases without inventing domain assertions. */
export async function validateOptimizationProgram(
  options: ValidateOptimizationProgramOptions,
): Promise<OptimizationProgramValidationResult> {
  const { implementation } = options
  if (implementation.status !== "selected" || !implementation.entry) {
    return {
      status: "not-applicable",
      actionId: implementation.actionId,
      cases: [],
      diagnostics: [{ code: "implementation-not-executable", message: implementation.reason ?? "No selected executable entry." }],
    }
  }
  const entry = resolveContained(options.packageDir, implementation.entry)
  if (!entry) {
    return {
      status: "failed",
      actionId: implementation.actionId,
      entry: implementation.entry,
      cases: [],
      diagnostics: [{ code: "entry-outside-package", message: `Entry escapes package root: ${implementation.entry}` }],
    }
  }
  if (!await regularFile(entry)) {
    return {
      status: "failed",
      actionId: implementation.actionId,
      entry: implementation.entry,
      cases: [],
      diagnostics: [{ code: "entry-missing", message: `Entry does not exist: ${implementation.entry}` }],
    }
  }
  const commandBase = runtimeCommand(implementation, entry)
  if (!commandBase) {
    return {
      status: "failed",
      actionId: implementation.actionId,
      entry: implementation.entry,
      cases: [],
      diagnostics: [{ code: "runtime-unsupported", message: `Unsupported or unknown runtime: ${implementation.runtime ?? "unknown"}` }],
    }
  }
  const timeoutMs = options.timeoutMs ?? 120_000
  const help = options.help
    ? await runValidation("help", commandBase, options.packageDir, options.help, timeoutMs)
    : undefined
  const cases: ProgramRunValidation[] = []
  for (const item of options.cases) {
    cases.push(await runValidation(item.id, commandBase, item.cwd, item, timeoutMs))
  }
  const passed = (help?.status ?? "passed") === "passed" && cases.every((item) => item.status === "passed")
  return {
    status: passed ? "passed" : "failed",
    actionId: implementation.actionId,
    entry: implementation.entry,
    ...(help ? { help } : {}),
    cases,
    diagnostics: [],
  }
}
