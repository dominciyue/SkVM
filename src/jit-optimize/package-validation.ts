import path from "node:path"
import { stat } from "node:fs/promises"
import { emptyTokenUsage, type EvalCriterion } from "../core/types.ts"
import { evaluate } from "../framework/evaluator.ts"
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
  applicability?: "supported" | "not-applicable"
  expectedFiles?: string[]
  expectedAbsentFiles?: string[]
  /** Engine-derived reference digests; optimizer suggestions cannot supply these directly. */
  expectedFileSha256?: Record<string, string>
  /** Engine-resolved assertions from an authority outside the candidate program. */
  assertions?: ProgramValidationAssertion[]
}

export interface ProgramValidationAssertion {
  id: string
  authority: "task-requirement" | "source-derived" | "self-check"
  sourceRef: string
  criterion: Extract<EvalCriterion, { method: "file-check" }>
}

export interface ProgramAssertionValidation {
  id: string
  authority: ProgramValidationAssertion["authority"]
  sourceRef: string
  status: "passed" | "failed"
  score: number
  details: string
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
  assertions: ProgramAssertionValidation[]
  diagnostics: string[]
  failureKind?: ProgramValidationFailureKind
  nextAction?: string
}

export interface OptimizationProgramValidationResult {
  status: "passed" | "failed" | "not-applicable"
  actionId: string
  entry?: string
  help?: ProgramRunValidation
  cases: ProgramRunValidation[]
  diagnostics: Array<{ code: string; message: string }>
  failureKind?: ProgramValidationFailureKind
  nextAction?: string
}

export interface ActionValidationObservation {
  actionId: string
  status: "passed" | "failed" | "not-applicable" | "not-run"
  failureKind?: ProgramValidationFailureKind
  diagnostics: string[]
  nextAction?: string
}

export interface ActionValidationFeedback {
  actionId: string
  failureKind: ProgramValidationFailureKind | "not-applicable" | "dependency-rejected" | "shared-change-group-rejected" | "validation-metadata-missing"
  diagnostics: string[]
  relevantFiles: string[]
  nextAction?: string
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function runtimeCommand(implementation: ImplementationSelection, entry: string): string[] | undefined {
  switch (implementation.runtime) {
    case "node": return [Bun.which("node") ?? process.execPath, entry]
    case "python": return [process.env.PYTHON_EXECUTABLE ?? (process.platform === "win32" ? "python" : "python3"), entry]
    case "shell": return ["sh", entry]
    case "powershell": return ["pwsh", "-NoProfile", "-File", entry]
    default: return undefined
  }
}

function nextActionForFailure(kind: ProgramValidationFailureKind): string {
  switch (kind) {
    case "parameter-missing":
      return "Provide the required input or parameter named by the diagnostic, then rerun only this isolated validation case."
    case "environment-not-reconstructable":
      return "Prepare the declared runtime or dependency in a package-local or other isolated environment, then rerun this validation case."
    case "entry-unclear":
      return "Fix the declared executable entry so it resolves to a regular file inside the package, then revalidate the package."
    case "result-mismatch":
      return "Inspect the produced files and semantic assertion details, fix the expected result mismatch, and rerun this validation case."
    case "script-execution-error":
      return "Inspect the captured command, exit code and stderr, fix the candidate program, and rerun this validation case."
  }
}

function looksLikeMissingDependency(stderr: string): boolean {
  return /(?:ERR_MODULE_NOT_FOUND|Cannot find (?:package|module)|ModuleNotFoundError|ImportError|No module named|command not found)/iu.test(stderr)
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
  expectation: ProgramValidationExpectation & { expectedFiles?: string[]; expectedAbsentFiles?: string[] },
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
      assertions: [],
      diagnostics: [`process start failed: ${error instanceof Error ? error.message : String(error)}`],
      failureKind: "environment-not-reconstructable",
      nextAction: nextActionForFailure("environment-not-reconstructable"),
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
      assertions: [],
      diagnostics: ["process output was not exposed as readable streams"],
      failureKind: "environment-not-reconstructable",
      nextAction: nextActionForFailure("environment-not-reconstructable"),
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
      : looksLikeMissingDependency(stderr)
        ? "environment-not-reconstructable"
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
    if (evidence) {
      outputFiles.push(evidence)
      const expectedSha256 = "expectedFileSha256" in expectation
        ? (expectation as ProgramValidationCase).expectedFileSha256?.[evidence.path]
        : undefined
      if (expectedSha256 && evidence.sha256 !== expectedSha256) {
        diagnostics.push(`output file digest mismatch for ${evidence.path}: expected ${expectedSha256}, received ${evidence.sha256}`)
        failureKind ??= "result-mismatch"
      }
    }
    else {
      diagnostics.push(`expected output file is missing or outside cwd: ${outputPath}`)
      failureKind ??= "result-mismatch"
    }
  }
  for (const absentPath of expectation.expectedAbsentFiles ?? []) {
    const absolute = resolveContained(cwd, absentPath)
    if (!absolute || await pathExists(absolute)) {
      diagnostics.push(`file must remain absent for not-applicable handling: ${absentPath}`)
      failureKind ??= "result-mismatch"
    }
  }
  const assertions: ProgramAssertionValidation[] = []
  for (const assertion of "assertions" in expectation
    ? ((expectation as ProgramValidationCase).assertions ?? [])
    : []) {
    const assertionPath = assertion.criterion.glob ? undefined : resolveContained(cwd, assertion.criterion.path)
    if (!assertionPath) {
      const details = assertion.criterion.glob
        ? "glob-based task assertions are not supported by bounded program validation"
        : `assertion path is outside the validation case: ${assertion.criterion.path}`
      assertions.push({
        id: assertion.id,
        authority: assertion.authority,
        sourceRef: assertion.sourceRef,
        status: "failed",
        score: 0,
        details,
      })
      diagnostics.push(`assertion ${assertion.id} failed: ${details}`)
      failureKind ??= "result-mismatch"
      continue
    }
    const evaluated = await evaluate(assertion.criterion, {
      text: stdout,
      steps: [],
      tokens: emptyTokenUsage(),
      cost: 0,
      durationMs: 0,
      llmDurationMs: 0,
      workDir: cwd,
      runStatus: "ok",
      usageAvailable: false,
    })
    assertions.push({
      id: assertion.id,
      authority: assertion.authority,
      sourceRef: assertion.sourceRef,
      status: evaluated.pass ? "passed" : "failed",
      score: evaluated.score,
      details: evaluated.details,
    })
    if (!evaluated.pass) {
      diagnostics.push(`assertion ${assertion.id} failed: ${evaluated.details}`)
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
    assertions,
    diagnostics,
    ...(failureKind ? { failureKind } : {}),
    ...(failureKind ? { nextAction: nextActionForFailure(failureKind) } : {}),
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
      nextAction: nextActionForFailure("entry-unclear"),
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
      nextAction: nextActionForFailure("entry-unclear"),
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
      nextAction: nextActionForFailure("entry-unclear"),
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
      nextAction: nextActionForFailure("environment-not-reconstructable"),
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
  if (cases.length === 0) {
    if (help?.status === "failed") {
      return {
        status: "failed",
        actionId: implementation.actionId,
        entry: implementation.entry,
        help,
        cases,
        diagnostics: [],
        ...(help.failureKind ? { failureKind: help.failureKind } : {}),
        ...(help.nextAction ? { nextAction: help.nextAction } : {}),
      }
    }
    return {
      status: "not-applicable",
      actionId: implementation.actionId,
      entry: implementation.entry,
      ...(help ? { help } : {}),
      cases,
      diagnostics: [{
        code: "validation-cases-missing",
        message: "No task-behavior validation case was available; help alone does not establish behavior.",
      }],
    }
  }
  const passed = (help?.status ?? "passed") === "passed" && cases.every((item) => item.status === "passed")
  const failureKind = [help, ...cases].find((item) => item?.failureKind)?.failureKind
  const nextAction = [help, ...cases].find((item) => item?.nextAction)?.nextAction
  return {
    status: passed ? "passed" : "failed",
    actionId: implementation.actionId,
    entry: implementation.entry,
    ...(help ? { help } : {}),
    cases,
    diagnostics: [],
    ...(failureKind ? { failureKind } : {}),
    ...(nextAction ? { nextAction } : {}),
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
  const unvalidatedIds = new Set(actions
    .filter((action) => !observations.has(action.id) || observations.get(action.id)!.status === "not-run")
    .map((action) => action.id))

  for (const action of actions) {
    const observed = observations.get(action.id)
    if (!observed || observed.status === "passed" || observed.status === "not-run") continue
    rejectedIds.add(action.id)
    rejection.set(action.id, {
      actionId: action.id,
      failureKind: observed.status === "not-applicable" ? "not-applicable" : (observed.failureKind ?? "result-mismatch"),
      diagnostics: [...observed.diagnostics],
      relevantFiles: [...action.changedPaths].sort(),
      ...(observed.nextAction ? { nextAction: observed.nextAction } : {}),
    })
  }

  const components = sharedComponents(actions).filter((component) => component.length > 1)
  let pendingChanged = true
  while (pendingChanged) {
    pendingChanged = false
    for (const action of actions) {
      if (unvalidatedIds.has(action.id) || !action.dependsOn.some((id) => unvalidatedIds.has(id))) continue
      unvalidatedIds.add(action.id)
      pendingChanged = true
    }
    for (const component of components) {
      if (!component.some((action) => unvalidatedIds.has(action.id))) continue
      for (const action of component) {
        if (unvalidatedIds.has(action.id)) continue
        unvalidatedIds.add(action.id)
        pendingChanged = true
      }
    }
  }
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
    .filter((action) => observations.get(action.id)?.status === "passed"
      && !rejectedIds.has(action.id)
      && !unvalidatedIds.has(action.id))
    .map((action) => action.id)
  const unvalidatedActionIds = actions
    .filter((action) => unvalidatedIds.has(action.id) && !rejectedIds.has(action.id))
    .map((action) => action.id)
  const rejected = actions.flatMap((action) => {
    const item = rejection.get(action.id)
    return item ? [item] : []
  })
  const status: ActionValidationResolution["status"] = rejected.length > 0
    ? (retainedActionIds.length > 0 || unvalidatedActionIds.length > 0 ? "partial" : "failed")
    : unvalidatedActionIds.length > 0
      ? (retainedActionIds.length > 0 ? "partial" : "not-run")
      : actions.length === 0
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
