import path from "node:path"
import { stat } from "node:fs/promises"
import type { OptimizationAction, OptimizationActionKind } from "./types.ts"

export type ImplementationSelectionStatus = "selected" | "not-applicable" | "failed"

export interface ImplementationSelection {
  actionId: string
  kind: OptimizationActionKind
  status: ImplementationSelectionStatus
  entry?: string
  runtime?: "python" | "node" | "shell" | "powershell" | "unknown"
  backendId?: string
  reason?: string
  inputs: string[]
  outputs: string[]
  preconditions: string[]
  residualDuties: string[]
  verification: string[]
}

export interface DomainImplementationBackendSelection {
  entry?: string
  runtime?: ImplementationSelection["runtime"]
  reason?: string
}

export interface DomainImplementationBackend {
  id: string
  supports(context: { skillDir: string; action: OptimizationAction }): boolean | Promise<boolean>
  select(context: { skillDir: string; action: OptimizationAction }):
    DomainImplementationBackendSelection | Promise<DomainImplementationBackendSelection>
}

export interface SelectOptimizationImplementationOptions {
  skillDir: string
  /** Original source snapshot; when supplied, generate-script must actually add or change its entry. */
  baselineSkillDir?: string
  action: OptimizationAction
  domainBackends?: readonly DomainImplementationBackend[]
}

export interface SelectOptimizationImplementationsOptions {
  skillDir: string
  baselineSkillDir?: string
  actions: readonly OptimizationAction[]
  domainBackends?: readonly DomainImplementationBackend[]
}

function baseResult(action: OptimizationAction): Omit<ImplementationSelection, "status"> {
  return {
    actionId: action.id,
    kind: action.kind,
    inputs: [...action.inputs],
    outputs: [...action.outputs],
    preconditions: [...action.preconditions],
    residualDuties: [...action.residualDuties],
    verification: [...action.verification],
  }
}

function runtimeFor(entry: string): ImplementationSelection["runtime"] {
  switch (path.extname(entry).toLowerCase()) {
    case ".py": return "python"
    case ".js":
    case ".mjs":
    case ".cjs":
    case ".ts": return "node"
    case ".sh": return "shell"
    case ".ps1": return "powershell"
    default: return "unknown"
  }
}

function executableRef(refs: readonly string[]): string | undefined {
  for (const ref of refs) {
    const entry = ref.split("#", 1)[0]
    if (entry && [".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".ps1"]
      .includes(path.extname(entry).toLowerCase())) return entry
  }
  return undefined
}

function containedPath(skillDir: string, entry: string): { relative: string; absolute: string } | undefined {
  const root = path.resolve(skillDir)
  const absolute = path.resolve(root, entry)
  const relative = path.relative(root, absolute)
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    return undefined
  }
  return { relative: relative.split(path.sep).join("/"), absolute }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function sameFile(left: string, right: string): Promise<boolean> {
  if (!await isFile(left) || !await isFile(right)) return false
  const [leftBytes, rightBytes] = await Promise.all([
    Bun.file(left).arrayBuffer(),
    Bun.file(right).arrayBuffer(),
  ])
  if (leftBytes.byteLength !== rightBytes.byteLength) return false
  return new Uint8Array(leftBytes).every((value, index) => value === new Uint8Array(rightBytes)[index])
}

async function selectFileAction(
  skillDir: string,
  action: OptimizationAction,
  candidates: readonly string[],
  baselineSkillDir?: string,
): Promise<ImplementationSelection> {
  const common = baseResult(action)
  const entry = executableRef(candidates)
  if (!entry) {
    return {
      ...common,
      status: action.kind === "reuse-script" ? "not-applicable" : "failed",
      reason: action.kind === "reuse-script"
        ? "No executable source reference was declared for reuse."
        : "The generated-program action declares no executable changed path.",
    }
  }
  const resolved = containedPath(skillDir, entry)
  if (!resolved) {
    return { ...common, status: "failed", reason: `Entry escapes the skill root: ${entry}` }
  }
  if (!await isFile(resolved.absolute)) {
    return { ...common, status: "failed", entry: resolved.relative, reason: `Declared entry does not exist: ${resolved.relative}` }
  }
  if (action.kind === "generate-script" && baselineSkillDir) {
    const baseline = containedPath(baselineSkillDir, resolved.relative)
    if (baseline && await sameFile(resolved.absolute, baseline.absolute)) {
      return {
        ...common,
        status: "failed",
        entry: resolved.relative,
        reason: `Generated-program entry is unchanged from the source skill: ${resolved.relative}`,
      }
    }
  }
  return {
    ...common,
    status: "selected",
    entry: resolved.relative,
    runtime: runtimeFor(resolved.relative),
  }
}

/** Select an implementation by action semantics and visible files, never by skill/repository name. */
export async function selectOptimizationImplementation(
  options: SelectOptimizationImplementationOptions,
): Promise<ImplementationSelection> {
  const { action, skillDir } = options
  const common = baseResult(action)
  if (action.kind === "restructure-docs") return { ...common, status: "selected" }
  if (action.kind === "reuse-script") {
    return selectFileAction(skillDir, action, action.sourceRefs, options.baselineSkillDir)
  }
  if (action.kind === "generate-script") {
    return selectFileAction(skillDir, action, action.changedPaths, options.baselineSkillDir)
  }

  for (const backend of options.domainBackends ?? []) {
    let supports: boolean
    try {
      supports = await backend.supports({ skillDir, action })
    } catch (error) {
      return {
        ...common,
        status: "failed",
        backendId: backend.id,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
    if (!supports) continue
    try {
      const selected = await backend.select({ skillDir, action })
      return {
        ...common,
        status: "selected",
        backendId: backend.id,
        ...(selected.entry ? { entry: selected.entry } : {}),
        ...(selected.runtime ? { runtime: selected.runtime } : {}),
        ...(selected.reason ? { reason: selected.reason } : {}),
      }
    } catch (error) {
      return {
        ...common,
        status: "failed",
        backendId: backend.id,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }
  return {
    ...common,
    status: "not-applicable",
    reason: "No registered domain backend accepted the action's declared contract.",
  }
}

/** Select every independent action; one failure never suppresses later actions. */
export async function selectOptimizationImplementations(
  options: SelectOptimizationImplementationsOptions,
): Promise<ImplementationSelection[]> {
  const results: ImplementationSelection[] = []
  for (const action of options.actions) {
    results.push(await selectOptimizationImplementation({
      skillDir: options.skillDir,
      baselineSkillDir: options.baselineSkillDir,
      action,
      domainBackends: options.domainBackends,
    }))
  }
  return results
}
