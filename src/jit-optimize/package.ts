import path from "node:path"
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir } from "node:fs/promises"
import { z } from "zod"
import { ProposalHistoryFileSchema, ProposalMetaSchema } from "../proposals/storage.ts"
import { selectOptimizationImplementations } from "./implementations.ts"
import type { ImplementationSelection } from "./implementations.ts"
import {
  OptimizationRoundValidationSummarySchema,
  OptimizeSubmissionSchema,
  type OptimizationAction,
  type OptimizationRoundValidationSummary,
} from "./types.ts"

export const LEGACY_OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION = "skvm-optimized-skill-package/v1" as const
export const OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION = "skvm-optimized-skill-package/v2" as const
export const OPTIMIZED_SKILL_PACKAGE_MANIFEST = "optimization-manifest.json" as const
export const OPTIMIZED_SKILL_PACKAGE_VALIDATION_REPORT = "optimization-validation-report.json" as const
export const OPTIMIZED_SKILL_PACKAGE_USER_GUIDE = "OPTIMIZATION-USAGE.md" as const

const OPTIMIZED_SKILL_PACKAGE_METADATA = new Set<string>([
  OPTIMIZED_SKILL_PACKAGE_MANIFEST,
  OPTIMIZED_SKILL_PACKAGE_VALIDATION_REPORT,
  OPTIMIZED_SKILL_PACKAGE_USER_GUIDE,
])

const FileRefSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

const ImplementationSelectionSchema = z.object({
  actionId: z.string(),
  kind: z.enum(["reuse-script", "domain-backend", "generate-script", "restructure-docs"]),
  status: z.enum(["selected", "not-applicable", "failed"]),
  entry: z.string().optional(),
  runtime: z.enum(["python", "node", "shell", "powershell", "unknown"]).optional(),
  backendId: z.string().optional(),
  reason: z.string().optional(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  preconditions: z.array(z.string()),
  residualDuties: z.array(z.string()),
  verification: z.array(z.string()),
})

const CommonManifestShape = {
  identity: z.string().min(1),
  exposure: z.literal("development"),
  proposal: z.object({
    dirName: z.string().min(1),
    bestRound: z.number().int().nonnegative(),
    meta: FileRefSchema,
    submission: FileRefSchema.optional(),
  }),
  snapshots: z.object({
    originalClosureSha256: z.string().regex(/^[a-f0-9]{64}$/),
    selectedClosureSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  actualDiff: z.object({
    added: z.array(z.string()),
    modified: z.array(z.string()),
    deleted: z.array(z.string()),
    moved: z.array(z.object({ from: z.string(), to: z.string() })),
  }),
  files: z.array(FileRefSchema),
  implementations: z.array(ImplementationSelectionSchema),
  runtime: z.object({
    runtimes: z.array(z.enum(["python", "node", "shell", "powershell", "unknown"])),
    dependencyFiles: z.array(z.string()),
  }),
  claimBoundary: z.string().min(1),
}

export const LegacyOptimizedSkillPackageManifestSchema = z.object({
  schemaVersion: z.literal(LEGACY_OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION),
  ...CommonManifestShape,
  validation: z.object({
    status: z.literal("passed"),
    scope: z.literal("package-file-closure"),
    behaviorStatus: z.literal("not-run"),
  }),
})

export const CurrentOptimizedSkillPackageManifestSchema = z.object({
  schemaVersion: z.literal(OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION),
  ...CommonManifestShape,
  validation: z.object({
    status: z.literal("passed"),
    scope: z.literal("package-file-closure"),
    behaviorStatus: z.enum(["passed", "partial", "failed", "not-run"]),
    behaviorScope: z.literal("action-local-program-cases"),
    deliveryStatus: z.enum(["validated-recommendation", "draft"]),
    report: FileRefSchema.optional(),
    retainedActionIds: z.array(z.string()),
    unvalidatedActionIds: z.array(z.string()),
    rejectedActionIds: z.array(z.string()),
    programRuns: z.number().int().nonnegative(),
    caseRuns: z.number().int().nonnegative(),
    independentCaseRuns: z.number().int().nonnegative(),
  }),
}).superRefine((manifest, context) => {
  const validation = manifest.validation
  if (validation.behaviorStatus !== "not-run" && !validation.report) {
    context.addIssue({ code: "custom", path: ["validation", "report"], message: "Behavior validation requires a bound report" })
  }
  if (validation.report && validation.report.path !== OPTIMIZED_SKILL_PACKAGE_VALIDATION_REPORT) {
    context.addIssue({ code: "custom", path: ["validation", "report", "path"], message: "Validation report must use the reserved package path" })
  }
  if (!validation.report && (
    validation.retainedActionIds.length > 0
    || validation.unvalidatedActionIds.length > 0
    || validation.rejectedActionIds.length > 0
    || validation.programRuns > 0
    || validation.caseRuns > 0
    || validation.independentCaseRuns > 0
  )) {
    context.addIssue({ code: "custom", path: ["validation"], message: "Unbound validation evidence cannot carry action or run claims" })
  }
  if (validation.deliveryStatus === "validated-recommendation") {
    if (validation.behaviorStatus !== "passed"
      || validation.independentCaseRuns === 0
      || validation.unvalidatedActionIds.length > 0
      || validation.rejectedActionIds.length > 0
      || !validation.report) {
      context.addIssue({
        code: "custom",
        path: ["validation", "deliveryStatus"],
        message: "A validated recommendation requires a passed report with an independent case and no gaps",
      })
    }
  }
})

export const OptimizedSkillPackageManifestSchema = z.union([
  CurrentOptimizedSkillPackageManifestSchema,
  LegacyOptimizedSkillPackageManifestSchema,
])

export type OptimizedSkillPackageManifest = z.infer<typeof OptimizedSkillPackageManifestSchema>
export type CurrentOptimizedSkillPackageManifest = z.infer<typeof CurrentOptimizedSkillPackageManifestSchema>

export interface BuildOptimizedSkillPackageOptions {
  proposalDir: string
  packageDir: string
}

export interface BuildOptimizedSkillPackageResult {
  status: "exported" | "no-change"
  packageDir?: string
  sourceProposalDir: string
  validation: "not-run" | "passed" | "failed"
}

export interface VerifiedOptimizedSkillPackage {
  packageDir: string
  manifest: OptimizedSkillPackageManifest
}

export interface OptimizedSkillPackageUserStep {
  actionId: string
  kind: ImplementationSelection["kind"]
  status: ImplementationSelection["status"]
  command?: string
  inputs: string[]
  outputs: string[]
  preconditions: string[]
  residualDuties: string[]
  reason?: string
}

export interface OptimizedSkillPackageUserSummary {
  deliveryStatus: "validated-recommendation" | "draft" | "legacy"
  behaviorStatus: "passed" | "partial" | "failed" | "not-run"
  useCommand: string
  guidePath?: string
  steps: OptimizedSkillPackageUserStep[]
  residualDuties: string[]
  fallback: string
}

interface SourceFile {
  path: string
  absolute: string
  bytes: number
  sha256: string
}

const PROPOSAL_TRANSIENT_DIRECTORIES = new Set([
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "node_modules",
])

interface ListSourceFilesOptions {
  excludeProposalTransients?: boolean
}

function sha256(bytes: Uint8Array | string): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

function portable(relativePath: string): string {
  return relativePath.split(path.sep).join("/")
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function resolveContained(root: string, relativePath: string): string {
  const absoluteRoot = path.resolve(root)
  const absolute = path.resolve(absoluteRoot, relativePath)
  if (!isWithin(absoluteRoot, absolute) || absolute === absoluteRoot) {
    throw new Error(`Package path escapes its root: ${relativePath}`)
  }
  return absolute
}

async function listSourceFiles(root: string, options: ListSourceFilesOptions = {}): Promise<SourceFile[]> {
  const absoluteRoot = path.resolve(root)
  const rootStat = await lstat(absoluteRoot)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Skill snapshot must be a non-symlink directory: ${absoluteRoot}`)
  }
  const files: SourceFile[] = []
  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (prefix === "" && entry.name === ".git") continue
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = resolveContained(absoluteRoot, relative)
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not portable package inputs: ${relative}`)
      if (options.excludeProposalTransients && entry.isDirectory() && PROPOSAL_TRANSIENT_DIRECTORIES.has(entry.name)) continue
      if (options.excludeProposalTransients && entry.isFile()
        && (entry.name === ".DS_Store" || entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo"))) continue
      if (entry.isDirectory()) {
        await walk(absolute, relative)
        continue
      }
      if (!entry.isFile()) throw new Error(`Unsupported package entry type: ${relative}`)
      const bytes = new Uint8Array(await Bun.file(absolute).arrayBuffer())
      files.push({ path: portable(relative), absolute, bytes: bytes.byteLength, sha256: sha256(bytes) })
    }
  }
  await walk(absoluteRoot, "")
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function closureSha256(files: readonly SourceFile[]): string {
  return sha256(JSON.stringify(files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))))
}

function computeDiff(original: readonly SourceFile[], selected: readonly SourceFile[]): OptimizedSkillPackageManifest["actualDiff"] {
  const before = new Map(original.map((file) => [file.path, file]))
  const after = new Map(selected.map((file) => [file.path, file]))
  const modified = [...before.keys()].filter((name) => after.has(name) && before.get(name)!.sha256 !== after.get(name)!.sha256)
  const removed = [...before.keys()].filter((name) => !after.has(name))
  const added = [...after.keys()].filter((name) => !before.has(name))
  const removedByDigest = new Map<string, string[]>()
  const addedByDigest = new Map<string, string[]>()
  for (const name of removed) removedByDigest.set(before.get(name)!.sha256, [...(removedByDigest.get(before.get(name)!.sha256) ?? []), name])
  for (const name of added) addedByDigest.set(after.get(name)!.sha256, [...(addedByDigest.get(after.get(name)!.sha256) ?? []), name])
  const moved: Array<{ from: string; to: string }> = []
  const movedFrom = new Set<string>()
  const movedTo = new Set<string>()
  for (const [digest, from] of removedByDigest) {
    const to = addedByDigest.get(digest) ?? []
    if (from.length !== 1 || to.length !== 1) continue
    moved.push({ from: from[0]!, to: to[0]! })
    movedFrom.add(from[0]!)
    movedTo.add(to[0]!)
  }
  return {
    added: added.filter((name) => !movedTo.has(name)).sort(),
    modified: modified.sort(),
    deleted: removed.filter((name) => !movedFrom.has(name)).sort(),
    moved: moved.sort((left, right) => left.from.localeCompare(right.from)),
  }
}

function hasChanges(diff: OptimizedSkillPackageManifest["actualDiff"]): boolean {
  return diff.added.length + diff.modified.length + diff.deleted.length + diff.moved.length > 0
}

async function inspectOutput(packageDir: string): Promise<"missing" | "empty"> {
  if (path.resolve(packageDir) === path.parse(path.resolve(packageDir)).root) {
    throw new Error("Package output cannot be a filesystem root")
  }
  try {
    const outputStat = await lstat(packageDir)
    if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) throw new Error("Package output must be a non-symlink directory")
    if ((await readdir(packageDir)).length > 0) throw new Error("Package output directory must be empty")
    return "empty"
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return "missing"
  }
}

/** Build and verify a package in a uniquely owned sibling, then publish it with one rename. */
export async function publishOptimizedSkillPackageAtomically(
  packageDir: string,
  populate: (stagingDir: string) => Promise<void>,
): Promise<void> {
  const destination = path.resolve(packageDir)
  const parent = path.dirname(destination)
  const initialState = await inspectOutput(destination)
  await mkdir(parent, { recursive: true })
  const safeName = path.basename(destination).replace(/[^A-Za-z0-9._-]+/gu, "-") || "package"
  const stagingDir = await mkdtemp(path.join(parent, `.${safeName}.skvm-export-`))
  if (!isWithin(parent, stagingDir) || stagingDir === parent) {
    throw new Error("Atomic package staging directory escaped its parent")
  }
  let published = false
  try {
    await populate(stagingDir)
    if (initialState === "empty") {
      const currentState = await inspectOutput(destination)
      if (currentState !== "empty") throw new Error("Package output changed while export was running")
      await rmdir(destination)
    }
    await rename(stagingDir, destination)
    published = true
  } finally {
    if (!published) await rm(stagingDir, { recursive: true, force: true })
  }
}

function shellPath(filePath: string): string {
  return /\s/u.test(filePath) ? JSON.stringify(filePath) : filePath
}

function implementationCommand(item: ImplementationSelection): string | undefined {
  if (item.status !== "selected" || !item.entry || !item.runtime) return undefined
  const entry = shellPath(item.entry)
  switch (item.runtime) {
    case "python": return `python -B ${entry}`
    case "node": return `node ${entry}`
    case "shell": return `sh ${entry}`
    case "powershell": return `pwsh -File ${entry}`
    case "unknown": return entry
  }
}

function userSummary(
  packageDir: string,
  options: {
    implementations: readonly ImplementationSelection[]
    deliveryStatus: OptimizedSkillPackageUserSummary["deliveryStatus"]
    behaviorStatus: OptimizedSkillPackageUserSummary["behaviorStatus"]
    hasGuide: boolean
  },
): OptimizedSkillPackageUserSummary {
  const steps = options.implementations.map((item) => ({
    actionId: item.actionId,
    kind: item.kind,
    status: item.status,
    ...(implementationCommand(item) ? { command: implementationCommand(item) } : {}),
    inputs: [...item.inputs],
    outputs: [...item.outputs],
    preconditions: [...item.preconditions],
    residualDuties: [...item.residualDuties],
    ...(item.reason ? { reason: item.reason } : {}),
  }))
  return {
    deliveryStatus: options.deliveryStatus,
    behaviorStatus: options.behaviorStatus,
    useCommand: `skvm run --prompt "<task>" --skill ${shellPath(packageDir)} --workdir "<project-dir>" --model "<provider/model>"`,
    ...(options.hasGuide ? { guidePath: path.join(packageDir, OPTIMIZED_SKILL_PACKAGE_USER_GUIDE) } : {}),
    steps,
    residualDuties: [...new Set(steps.flatMap((item) => item.residualDuties))],
    fallback: "If an optimized step is not applicable or fails, keep the original task result and continue with the package's SKILL.md agent workflow; do not count the fallback as automated success.",
  }
}

function renderUserGuide(summary: OptimizedSkillPackageUserSummary): string {
  const lines = [
    "# Optimized skill usage",
    "",
    `Delivery: \`${summary.deliveryStatus}\`; bounded behavior: \`${summary.behaviorStatus}\`.`,
    "",
    "## Use this package",
    "",
    "Use the package as an ordinary skill:",
    "",
    `\`${summary.useCommand}\``,
    "",
    "The original task result remains in its original work directory. This package is a separate development candidate.",
    "",
    "## Optimized steps",
    "",
  ]
  if (summary.steps.length === 0) lines.push("No executable step was selected; follow `SKILL.md`.")
  for (const step of summary.steps) {
    lines.push(`- \`${step.actionId}\` (${step.kind}, ${step.status})${step.command ? `: \`${step.command}\`` : ""}`)
    if (step.inputs.length > 0) lines.push(`  - inputs/parameter sources: ${step.inputs.join("; ")}`)
    if (step.outputs.length > 0) lines.push(`  - outputs: ${step.outputs.join("; ")}`)
    if (step.preconditions.length > 0) lines.push(`  - preconditions: ${step.preconditions.join("; ")}`)
    if (step.reason) lines.push(`  - status detail: ${step.reason}`)
  }
  lines.push("", "## Remaining agent work", "")
  if (summary.residualDuties.length === 0) lines.push("No residual duty was declared for the selected steps.")
  else for (const duty of summary.residualDuties) lines.push(`- ${duty}`)
  lines.push("", "## Failure and fallback", "", summary.fallback, "")
  lines.push("Exit code 2 means the helper is not applicable to that input. Exit code 1 means a required input, dependency, binding, or program condition failed and should be fixed before retrying the helper.", "")
  return `${lines.join("\n")}\n`
}

/** Verify a published package and return only the information needed for ordinary use. */
export async function readOptimizedSkillPackageUserSummary(
  packageDir: string,
): Promise<OptimizedSkillPackageUserSummary> {
  const verified = await verifyOptimizedSkillPackage(packageDir)
  if (verified.manifest.schemaVersion === OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION) {
    return userSummary(verified.packageDir, {
      implementations: verified.manifest.implementations,
      deliveryStatus: verified.manifest.validation.deliveryStatus,
      behaviorStatus: verified.manifest.validation.behaviorStatus,
      hasGuide: true,
    })
  }
  return userSummary(verified.packageDir, {
    implementations: verified.manifest.implementations,
    deliveryStatus: "legacy",
    behaviorStatus: verified.manifest.validation.behaviorStatus,
    hasGuide: false,
  })
}

interface SelectedRoundState {
  submission?: { path: string; bytes: number; sha256: string }
  implementations: ImplementationSelection[]
  validation?: {
    summary: OptimizationRoundValidationSummary
    reportBytes: Uint8Array
  }
}

const ValidationReportBindingSchema = z.object({
  schemaVersion: z.literal("jit-optimize-validation-lifecycle/v1"),
  round: z.number().int().nonnegative(),
  sourceMode: z.literal("execution-log-local-validation"),
  sourceTaskReplayed: z.literal(false),
  resolution: z.object({
    status: z.enum(["passed", "partial", "failed", "not-run"]),
    retainedActionIds: z.array(z.string()),
    unvalidatedActionIds: z.array(z.string()),
    rejected: z.array(z.object({ actionId: z.string() }).passthrough()),
  }).passthrough(),
  execution: z.object({
    programRuns: z.number().int().nonnegative(),
    caseRuns: z.number().int().nonnegative(),
    independentCaseRuns: z.number().int().nonnegative(),
  }).passthrough(),
}).passthrough()

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

function sameValidation(
  left: OptimizationRoundValidationSummary,
  right: OptimizationRoundValidationSummary,
): boolean {
  return left.status === right.status
    && portable(left.reportPath) === portable(right.reportPath)
    && sameStrings(left.retainedActionIds, right.retainedActionIds)
    && sameStrings(left.unvalidatedActionIds, right.unvalidatedActionIds)
    && sameStrings(left.rejectedActionIds, right.rejectedActionIds)
    && left.programRuns === right.programRuns
    && left.caseRuns === right.caseRuns
    && left.independentCaseRuns === right.independentCaseRuns
}

async function readSubmission(proposalDir: string, bestRound: number): Promise<{
  submission?: SelectedRoundState["submission"]
  actions: OptimizationAction[]
}> {
  if (bestRound === 0) return { actions: [] }
  const relative = `round-${bestRound}-optimizer/submission.json`
  const absolute = resolveContained(proposalDir, relative)
  try {
    const bytes = await readFile(absolute)
    const submission = OptimizeSubmissionSchema.parse(JSON.parse(bytes.toString("utf8")))
    return {
      submission: { path: portable(relative), bytes: bytes.byteLength, sha256: sha256(bytes) },
      actions: submission.actions ?? [],
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { actions: [] }
    throw error
  }
}

async function readSelectedRoundState(
  proposalDir: string,
  bestRound: number,
  selectedDir: string,
): Promise<SelectedRoundState> {
  if (bestRound === 0) return { implementations: [] }
  const persisted = await readSubmission(proposalDir, bestRound)
  let actions = persisted.actions
  let validation: OptimizationRoundValidationSummary | undefined
  try {
    const historyBytes = await readFile(path.join(proposalDir, "history.json"))
    const history = ProposalHistoryFileSchema.parse(JSON.parse(historyBytes.toString("utf8")))
    if (history.bestRound !== bestRound) {
      throw new Error(`Proposal history bestRound ${history.bestRound} does not match meta bestRound ${bestRound}`)
    }
    const entry = history.entries.find((item) => item.round === bestRound)
    const round = history.rounds?.find((item) => item.round === bestRound)
    if (entry?.actions) actions = entry.actions
    const entryValidation = entry?.validation
    const roundValidation = round?.validation
    if (entryValidation && roundValidation && !sameValidation(entryValidation, roundValidation)) {
      throw new Error(`Proposal validation summaries disagree for selected round ${bestRound}`)
    }
    validation = entryValidation ?? roundValidation
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  const implementations = await selectOptimizationImplementations({ skillDir: selectedDir, actions })
  if (!validation) return { submission: persisted.submission, implementations }
  const normalized = OptimizationRoundValidationSummarySchema.parse(validation)
  const reportBytes = await readFile(resolveContained(proposalDir, normalized.reportPath))
  const report = ValidationReportBindingSchema.parse(JSON.parse(reportBytes.toString("utf8")))
  const rejectedActionIds = report.resolution.rejected.map((item) => item.actionId)
  const reportMatches = report.round === bestRound
    && report.resolution.status === normalized.status
    && sameStrings(report.resolution.retainedActionIds, normalized.retainedActionIds)
    && sameStrings(report.resolution.unvalidatedActionIds, normalized.unvalidatedActionIds)
    && sameStrings(rejectedActionIds, normalized.rejectedActionIds)
    && report.execution.programRuns === normalized.programRuns
    && report.execution.caseRuns === normalized.caseRuns
    && report.execution.independentCaseRuns === normalized.independentCaseRuns
  if (!reportMatches) throw new Error(`Validation report does not match selected round ${bestRound} summary`)
  return { submission: persisted.submission, implementations, validation: { summary: normalized, reportBytes } }
}

const DEPENDENCY_FILES = new Set([
  "requirements.txt", "pyproject.toml", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb",
])

/** Export the selected proposal snapshot as an independent generic skill package. */
export async function buildOptimizedSkillPackage(options: BuildOptimizedSkillPackageOptions): Promise<BuildOptimizedSkillPackageResult> {
  const proposalDir = path.resolve(options.proposalDir)
  const packageDir = path.resolve(options.packageDir)
  if (isWithin(proposalDir, packageDir) || isWithin(packageDir, proposalDir)) {
    throw new Error("Proposal and package directories must not overlap")
  }
  const metaBytes = await readFile(path.join(proposalDir, "meta.json"))
  const meta = ProposalMetaSchema.parse(JSON.parse(metaBytes.toString("utf8")))
  if (meta.status === "infra-blocked") throw new Error("Infra-blocked proposals cannot be exported as optimized packages")
  const originalDir = path.join(proposalDir, "original")
  const selectedDir = path.join(proposalDir, `round-${meta.bestRound}`)
  let [original, selected] = await Promise.all([
    listSourceFiles(originalDir, { excludeProposalTransients: true }),
    listSourceFiles(selectedDir, { excludeProposalTransients: true }),
  ])
  const originalMetadata = original.filter((file) => OPTIMIZED_SKILL_PACKAGE_METADATA.has(file.path))
  const selectedMetadata = selected.filter((file) => OPTIMIZED_SKILL_PACKAGE_METADATA.has(file.path))
  if (originalMetadata.length > 0) {
    try {
      await verifyOptimizedSkillPackage(originalDir)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Original snapshot contains reserved package metadata but is not a valid optimized package: ${detail}`)
    }
    original = original.filter((file) => !OPTIMIZED_SKILL_PACKAGE_METADATA.has(file.path))
    selected = selected.filter((file) => !OPTIMIZED_SKILL_PACKAGE_METADATA.has(file.path))
  } else if (selectedMetadata.length > 0) {
    throw new Error(`Selected snapshot introduced reserved package metadata: ${selectedMetadata[0]!.path}`)
  }
  if (!selected.some((file) => file.path === "SKILL.md")) throw new Error("Selected proposal snapshot has no SKILL.md")
  const actualDiff = computeDiff(original, selected)
  if (!hasChanges(actualDiff)) return { status: "no-change", sourceProposalDir: proposalDir, validation: "not-run" }
  const selectedRound = await readSelectedRoundState(proposalDir, meta.bestRound, selectedDir)
  const runtimes = [...new Set(selectedRound.implementations
    .filter((item) => item.status === "selected" && item.runtime)
    .map((item) => item.runtime!))].sort()
  const summary = selectedRound.validation?.summary
  const deliveryStatus = summary?.status === "passed"
    && summary.independentCaseRuns > 0
    && summary.unvalidatedActionIds.length === 0
    && summary.rejectedActionIds.length === 0
      ? "validated-recommendation"
      : "draft"
  await publishOptimizedSkillPackageAtomically(packageDir, async (stagingDir) => {
    for (const file of selected) {
      const target = resolveContained(stagingDir, file.path)
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(file.absolute, target)
    }
    const files = selected.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
    let reportRef: z.infer<typeof FileRefSchema> | undefined
    if (selectedRound.validation) {
      const reportBytes = selectedRound.validation.reportBytes
      await Bun.write(path.join(stagingDir, OPTIMIZED_SKILL_PACKAGE_VALIDATION_REPORT), reportBytes)
      reportRef = {
        path: OPTIMIZED_SKILL_PACKAGE_VALIDATION_REPORT,
        bytes: reportBytes.byteLength,
        sha256: sha256(reportBytes),
      }
      files.push(reportRef)
    }
    const guideSummary = userSummary("<package-path>", {
      implementations: selectedRound.implementations,
      behaviorStatus: summary?.status ?? "not-run",
      deliveryStatus,
      hasGuide: true,
    })
    const guideBytes = new TextEncoder().encode(renderUserGuide(guideSummary))
    await Bun.write(path.join(stagingDir, OPTIMIZED_SKILL_PACKAGE_USER_GUIDE), guideBytes)
    files.push({
      path: OPTIMIZED_SKILL_PACKAGE_USER_GUIDE,
      bytes: guideBytes.byteLength,
      sha256: sha256(guideBytes),
    })
    files.sort((left, right) => left.path.localeCompare(right.path))
    const dependencyFiles = files.map((file) => file.path)
      .filter((name) => DEPENDENCY_FILES.has(path.posix.basename(name))).sort()
    const manifest = CurrentOptimizedSkillPackageManifestSchema.parse({
      schemaVersion: OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION,
      identity: `${meta.skillName}:${path.basename(proposalDir)}:round-${meta.bestRound}`,
      exposure: "development",
      proposal: {
        dirName: path.basename(proposalDir),
        bestRound: meta.bestRound,
        meta: { path: "meta.json", bytes: metaBytes.byteLength, sha256: sha256(metaBytes) },
        ...(selectedRound.submission ? { submission: selectedRound.submission } : {}),
      },
      snapshots: { originalClosureSha256: closureSha256(original), selectedClosureSha256: closureSha256(selected) },
      actualDiff,
      files,
      implementations: selectedRound.implementations,
      runtime: { runtimes, dependencyFiles },
      validation: {
        status: "passed",
        scope: "package-file-closure",
        behaviorStatus: summary?.status ?? "not-run",
        behaviorScope: "action-local-program-cases",
        deliveryStatus,
        ...(reportRef ? { report: reportRef } : {}),
        retainedActionIds: summary?.retainedActionIds ?? [],
        unvalidatedActionIds: summary?.unvalidatedActionIds ?? [],
        rejectedActionIds: summary?.rejectedActionIds ?? [],
        programRuns: summary?.programRuns ?? 0,
        caseRuns: summary?.caseRuns ?? 0,
        independentCaseRuns: summary?.independentCaseRuns ?? 0,
      },
      claimBoundary: "Development package export. Package file closure passed. Behavior status covers only the listed action-local program cases; whole-skill correctness, source-task replay, agent consumption and optimization effect require separate evidence.",
    })
    await Bun.write(path.join(stagingDir, OPTIMIZED_SKILL_PACKAGE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
    await verifyOptimizedSkillPackage(stagingDir)
  })
  return { status: "exported", packageDir, sourceProposalDir: proposalDir, validation: "passed" }
}

/** Recompute every packaged source-file digest and reject missing or extra files. */
export async function verifyOptimizedSkillPackage(packageDir: string): Promise<VerifiedOptimizedSkillPackage> {
  const root = path.resolve(packageDir)
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Optimized skill package must be a non-symlink directory")
  const manifest = OptimizedSkillPackageManifestSchema.parse(
    JSON.parse(await readFile(path.join(root, OPTIMIZED_SKILL_PACKAGE_MANIFEST), "utf8")),
  )
  const actual = await listSourceFiles(root)
  const sourceFiles = actual.filter((file) => file.path !== OPTIMIZED_SKILL_PACKAGE_MANIFEST)
  const expectedPaths = manifest.files.map((file) => file.path).sort()
  const actualPaths = sourceFiles.map((file) => file.path).sort()
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`Package file closure mismatch: expected ${JSON.stringify(expectedPaths)}, received ${JSON.stringify(actualPaths)}`)
  }
  const actualByPath = new Map(sourceFiles.map((file) => [file.path, file]))
  for (const expected of manifest.files) {
    const found = actualByPath.get(expected.path)
    if (!found || found.bytes !== expected.bytes || found.sha256 !== expected.sha256) {
      throw new Error(`Package file digest mismatch: ${expected.path}`)
    }
  }
  if (!actualByPath.has("SKILL.md")) throw new Error("Optimized skill package has no SKILL.md")
  if (manifest.schemaVersion === OPTIMIZED_SKILL_PACKAGE_SCHEMA_VERSION && manifest.validation.report) {
    const expected = manifest.validation.report
    const found = actualByPath.get(expected.path)
    if (!found || found.bytes !== expected.bytes || found.sha256 !== expected.sha256) {
      throw new Error("Package behavior-validation report binding mismatch")
    }
    const report = ValidationReportBindingSchema.parse(
      JSON.parse(await readFile(resolveContained(root, expected.path), "utf8")),
    )
    const validation = manifest.validation
    const reportMatches = report.round === manifest.proposal.bestRound
      && report.resolution.status === validation.behaviorStatus
      && sameStrings(report.resolution.retainedActionIds, validation.retainedActionIds)
      && sameStrings(report.resolution.unvalidatedActionIds, validation.unvalidatedActionIds)
      && sameStrings(report.resolution.rejected.map((item) => item.actionId), validation.rejectedActionIds)
      && report.execution.programRuns === validation.programRuns
      && report.execution.caseRuns === validation.caseRuns
      && report.execution.independentCaseRuns === validation.independentCaseRuns
    if (!reportMatches) throw new Error("Package behavior-validation report content does not match manifest")
  }
  return { packageDir: root, manifest }
}
