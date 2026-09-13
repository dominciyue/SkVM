import path from "node:path"
import { stat } from "node:fs/promises"
import type { ImplementationSelection } from "./implementations.ts"
import type { OptimizationAction } from "./types.ts"

export type ProgramValidationFailureKind =
  | "script-execution-error"
  | "parameter-missing"
  | "entry-unclear"
  | "result-mismatch"
  | "environment-not-reconstructable"

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
  failureKind?: ProgramValidationFailureKind
}

export interface OptimizationProgramValidationResult {
  status: "passed" | "failed" | "not-applicable"
  actionId: string
  entry?: string
  help?: ProgramRunValidation
  cases: ProgramRunValidation[]
  diagnostics: Array<{ code: string; message: string }>
  failureKind?: ProgramValidationFailureKind
}

export interface ActionValidationObservation {
  actionId: string
  status: "passed" | "failed" | "not-applicable" | "not-run"
  failureKind?: ProgramValidationFailureKind
  diagnostics: string[]
}

export interface ActionValidationFeedback {
  actionId: string
  failureKind: ProgramValidationFailureKind | "not-applicable" | "dependency-rejected" | "shared-change-group-rejected"
  diagnostics: string[]
  relevantFiles: string[]
}

export interface ActionValidationResolution {
  status: "passed" | "partial" | "failed" | "not-run"
  retainedActionIds: string[]
  unvalidatedActionIds: string[]
  rejected: ActionValidationFeedback[]
  feedback: ActionValidationFeedback[]
  rollbackGroups: Array<{
    actionIds: string[]
    changedPaths: string[]
    reason: "shared-files-with-rejected-action"
  }>
}

export interface ResolveActionValidationOptions {
  actions: readonly OptimizationAction[]
  observations: readonly ActionValidationObservation[]
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
      failureKind: "environment-not-reconstructable",
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const timeout = new Promise<number>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true
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
      failureKind: "environment-not-reconstructable",
    }
  }
  const [stdout, stderr] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ])
  const diagnostics: string[] = []
  let failureKind: ProgramValidationFailureKind | undefined
  const expectedExitCode = expectation.expectedExitCode ?? 0
  if (timedOut) {
    diagnostics.push(`process timed out after ${timeoutMs}ms`)
    failureKind = "environment-not-reconstructable"
  } else if (exitCode !== expectedExitCode) {
    diagnostics.push(`expected exit ${expectedExitCode}, received ${exitCode}`)
    failureKind = /(?:usage:|required (?:argument|option)|argument .* required|missing (?:argument|parameter))/i.test(stderr)
      ? "parameter-missing"
      : "script-execution-error"
  }
  for (const fragment of expectation.stdoutIncludes ?? []) {
    if (!stdout.includes(fragment)) {
      diagnostics.push(`stdout is missing required fragment: ${fragment}`)
      failureKind ??= "result-mismatch"
    }
  }
  for (const fragment of expectation.stderrIncludes ?? []) {
    if (!stderr.includes(fragment)) {
      diagnostics.push(`stderr is missing required fragment: ${fragment}`)
      failureKind ??= "result-mismatch"
    }
  }
  const outputFiles: ProgramOutputFileEvidence[] = []
  for (const outputPath of expectation.expectedFiles ?? []) {
    const evidence = await digestFile(cwd, outputPath)
    if (evidence) outputFiles.push(evidence)
    else {
      diagnostics.push(`expected output file is missing or outside cwd: ${outputPath}`)
      failureKind ??= "result-mismatch"
    }
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
    ...(failureKind ? { failureKind } : {}),
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
      failureKind: "entry-unclear",
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
      failureKind: "entry-unclear",
    }
  }
  if (!await regularFile(entry)) {
    return {
      status: "failed",
      actionId: implementation.actionId,
      entry: implementation.entry,
      cases: [],
      diagnostics: [{ code: "entry-missing", message: `Entry does not exist: ${implementation.entry}` }],
      failureKind: "entry-unclear",
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
      failureKind: "environment-not-reconstructable",
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
  const failureKind = [help, ...cases].find((item) => item?.failureKind)?.failureKind
  return {
    status: passed ? "passed" : "failed",
    actionId: implementation.actionId,
    entry: implementation.entry,
    ...(help ? { help } : {}),
    cases,
    diagnostics: [],
    ...(failureKind ? { failureKind } : {}),
  }
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right)
  return left.some((item) => rightSet.has(item))
}

function sharedComponents(actions: readonly OptimizationAction[]): OptimizationAction[][] {
  const remaining = new Set(actions.map((action) => action.id))
  const byId = new Map(actions.map((action) => [action.id, action]))
  const components: OptimizationAction[][] = []
  for (const action of actions) {
    if (!remaining.has(action.id)) continue
    const component: OptimizationAction[] = []
    const queue = [action]
    remaining.delete(action.id)
    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)
      for (const candidateId of [...remaining]) {
        const candidate = byId.get(candidateId)!
        if (!intersects(current.changedPaths, candidate.changedPaths)) continue
        remaining.delete(candidateId)
        queue.push(candidate)
      }
    }
    components.push(component)
  }
  return components
}

/**
 * Resolve action-local validation without line-level reverse patching.
 * Only concrete failures, dependency closure and shared-file groups are rejected;
 * independent validated actions survive and unrun validation stays explicitly unrun.
 */
export function resolveActionValidation(options: ResolveActionValidationOptions): ActionValidationResolution {
  const actions = [...options.actions]
  const observations = new Map(options.observations.map((item) => [item.actionId, item]))
  const rejectedIds = new Set<string>()
  const rejection = new Map<string, ActionValidationFeedback>()
  const unvalidatedActionIds = actions
    .filter((action) => !observations.has(action.id) || observations.get(action.id)!.status === "not-run")
    .map((action) => action.id)

  for (const action of actions) {
    const observed = observations.get(action.id)
    if (!observed || observed.status === "passed" || observed.status === "not-run") continue
    rejectedIds.add(action.id)
    rejection.set(action.id, {
      actionId: action.id,
      failureKind: observed.status === "not-applicable" ? "not-applicable" : (observed.failureKind ?? "result-mismatch"),
      diagnostics: [...observed.diagnostics],
      relevantFiles: [...action.changedPaths].sort(),
    })
  }

  const components = sharedComponents(actions).filter((component) => component.length > 1)
  let changed = true
  while (changed) {
    changed = false
    for (const action of actions) {
      if (rejectedIds.has(action.id) || !action.dependsOn.some((id) => rejectedIds.has(id))) continue
      rejectedIds.add(action.id)
      rejection.set(action.id, {
        actionId: action.id,
        failureKind: "dependency-rejected",
        diagnostics: [`dependency rejected: ${action.dependsOn.filter((id) => rejectedIds.has(id)).join(", ")}`],
        relevantFiles: [...action.changedPaths].sort(),
      })
      changed = true
    }
    for (const component of components) {
      if (!component.some((action) => rejectedIds.has(action.id))) continue
      for (const action of component) {
        if (rejectedIds.has(action.id)) continue
        rejectedIds.add(action.id)
        rejection.set(action.id, {
          actionId: action.id,
          failureKind: "shared-change-group-rejected",
          diagnostics: ["another action changing the same file was rejected; the whole shared group must be revised or reverted"],
          relevantFiles: [...action.changedPaths].sort(),
        })
        changed = true
      }
    }
  }

  const rollbackGroups = components
    .filter((component) => component.some((action) => rejectedIds.has(action.id)))
    .map((component) => ({
      actionIds: component.map((action) => action.id).sort(),
      changedPaths: [...new Set(component.flatMap((action) => action.changedPaths))].sort(),
      reason: "shared-files-with-rejected-action" as const,
    }))
  const retainedActionIds = actions
    .filter((action) => observations.get(action.id)?.status === "passed" && !rejectedIds.has(action.id))
    .map((action) => action.id)
  const rejected = actions.flatMap((action) => {
    const item = rejection.get(action.id)
    return item ? [item] : []
  })
  const status: ActionValidationResolution["status"] = rejected.length > 0
    ? (retainedActionIds.length > 0 ? "partial" : "failed")
    : unvalidatedActionIds.length > 0 || actions.length === 0
      ? "not-run"
      : "passed"
  return {
    status,
    retainedActionIds,
    unvalidatedActionIds,
    rejected,
    feedback: rejected.map((item) => ({ ...item, diagnostics: [...item.diagnostics], relevantFiles: [...item.relevantFiles] })),
    rollbackGroups,
  }
}
