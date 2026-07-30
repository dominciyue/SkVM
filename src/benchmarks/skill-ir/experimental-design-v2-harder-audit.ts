import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
  UnsafeWorkdirEntryError,
  writeInitialWorkdirManifest,
} from "../../core/workdir-manifest.ts"
import { experimentalDesignGradeV2 } from "../../bench/evaluators/experimental-design-grade-v2.ts"
import { BenchTaskFileSchema } from "../../bench/types.ts"
import {
  loadRunSkill,
  prepareRunWorkspace,
  type LoadedRunTask,
} from "../../run/index.ts"
import {
  assessExperimentalDesignV2Allocation,
  deriveExperimentalDesignV2LimitationFlags,
  parseExperimentalDesignV2Study,
  type ExperimentalDesignV2AllocationRow,
  type ExperimentalDesignV2Study,
} from "./experimental-design-v2-contract.ts"
import {
  ExperimentalDesignV2HarderDevelopmentTaskSetSchema,
  type ExperimentalDesignV2HarderDevelopmentTaskSet,
  type ExperimentalDesignV2HarderTask,
} from "./experimental-design-v2-harder-development.ts"

const TASKS_PATH = "benchmarks/skill-ir/pilots/experimental-design/v2/harder-development/tasks.json"
const SKILL_PATH = "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md"
const REQUIRED_OUTPUTS = [
  "design/design-plan.json",
  "design/allocation.csv",
  "design/design-report.md",
] as const
const CASE_IDS = [
  "canonical-valid",
  "alternative-valid",
  "sequential-invalid",
  "stratum-invalid",
  "report-contradiction",
  "extra-output",
] as const
const MATERIALIZATION_CHECK_IDS = [
  "manifest-boundary",
  "protected-inputs",
  "arm-initial-tree",
  "initial-only-missing-outputs",
  "legal-output-delta",
  "extra-output-rejected",
  "initial-mutation-rejected",
  "initial-deletion-rejected",
  "reparse-entry-rejected",
] as const

type DifferentialCaseId = (typeof CASE_IDS)[number]
type System = "no-skill" | "original"
type MaterializationCheckId = (typeof MATERIALIZATION_CHECK_IDS)[number]
type FixtureFiles = Record<string, string>

const DifferentialCriterionSchema = z.object({
  criterionId: z.string().min(1),
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  infrastructure: z.boolean(),
}).strict()

export const ExperimentalDesignV2HarderDifferentialAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-v2-harder-differential-audit/v1"),
  auditId: z.literal("experimental-design-v2-harder-development-contract-v1"),
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    cases: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
  }).strict(),
  cases: z.array(z.object({
    taskId: z.string().min(1),
    caseId: z.enum(CASE_IDS),
    expectedPass: z.boolean(),
    observedPass: z.boolean(),
    status: z.enum(["matched", "mismatched"]),
    criteria: z.array(DifferentialCriterionSchema).length(5),
  }).strict()),
  issues: z.array(z.object({
    taskId: z.string().min(1),
    caseId: z.enum(CASE_IDS),
  }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

const MaterializationChecksSchema = z.object({
  "manifest-boundary": z.boolean(),
  "protected-inputs": z.boolean(),
  "arm-initial-tree": z.boolean(),
  "initial-only-missing-outputs": z.boolean(),
  "legal-output-delta": z.boolean(),
  "extra-output-rejected": z.boolean(),
  "initial-mutation-rejected": z.boolean(),
  "initial-deletion-rejected": z.boolean(),
  "reparse-entry-rejected": z.boolean(),
}).strict()

export const ExperimentalDesignV2HarderMaterializationAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-materialization-audit-report/v1"),
  auditId: z.literal("experimental-design-v2-harder-materialized-delta-v1"),
  contractRevision: z.literal("materialized-delta/v1"),
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    arms: z.number().int().nonnegative(),
    checks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
  }).strict(),
  arms: z.array(z.object({
    taskId: z.string().min(1),
    system: z.enum(["no-skill", "original"]),
    status: z.enum(["passed", "failed"]),
    initialEntries: z.number().int().nonnegative(),
    sourceResourceFiles: z.number().int().nonnegative(),
    checks: MaterializationChecksSchema,
  }).strict()),
  issues: z.array(z.object({
    taskId: z.string().min(1),
    system: z.enum(["no-skill", "original"]),
    check: z.enum(MATERIALIZATION_CHECK_IDS),
  }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

export type ExperimentalDesignV2HarderDifferentialAuditReport = z.infer<
  typeof ExperimentalDesignV2HarderDifferentialAuditReportSchema
>
export type ExperimentalDesignV2HarderMaterializationAuditReport = z.infer<
  typeof ExperimentalDesignV2HarderMaterializationAuditReportSchema
>

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function allocationCsv(rows: readonly ExperimentalDesignV2AllocationRow[]): string {
  return [
    "order,unit_id,stratum,arm",
    ...rows.map((row) => [row.order, row.unitId, row.stratum, row.arm].join(",")),
    "",
  ].join("\n")
}

function legalAllocation(
  study: ExperimentalDesignV2Study,
  variant: 0 | 1,
): ExperimentalDesignV2AllocationRow[] {
  const offsets = new Map<string, number>()
  const rows = study.units.map((unit, index) => {
    const stratum = unit.stratum ?? ""
    const partitionIndex = offsets.get(stratum) ?? 0
    offsets.set(stratum, partitionIndex + 1)
    return {
      order: index + 1,
      unitId: unit.id,
      stratum,
      arm: study.arms[(partitionIndex + variant) % study.arms.length]!,
    }
  })
  return variant === 0 ? rows : [...rows].reverse()
}

function armCounts(
  study: ExperimentalDesignV2Study,
  rows: readonly ExperimentalDesignV2AllocationRow[],
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(study.arms.map((arm) => [arm, 0]))
  for (const row of rows) counts[row.arm] = (counts[row.arm] ?? 0) + 1
  return counts
}

function buildFixture(
  task: ExperimentalDesignV2HarderTask,
  caseId: DifferentialCaseId,
): FixtureFiles {
  const study = parseExperimentalDesignV2Study(JSON.parse(task.fixtures["study.json"]))
  let rows = legalAllocation(study, caseId === "alternative-valid" ? 1 : 0)
  if (caseId === "sequential-invalid") {
    const firstStratum = study.units[0]!.stratum ?? ""
    const positions = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.stratum === firstStratum)
    const first = positions[0]!
    const second = positions[1]!
    rows = rows.map((row, index) => index === second.index ? { ...row, arm: first.row.arm } : row)
  }
  if (caseId === "stratum-invalid") {
    rows = rows.map((row, index) => index === 0 ? { ...row, stratum: "public-mismatch" } : row)
  }
  const assessment = assessExperimentalDesignV2Allocation(study, rows)
  const designProperties = assessment.properties
  const plan = {
    studyId: study.studyId,
    method: caseId === "alternative-valid"
      ? "Public rotated allocation with reversed CSV row order"
      : "Public stable-order balanced allocation",
    assignmentLevel: study.assignmentLevel,
    assignmentUnit: study.assignmentUnit,
    analysisUnit: study.analysisUnit,
    response: study.response,
    arms: study.arms,
    seed: study.seed,
    allocationPath: "design/allocation.csv",
    designProperties,
  }
  const evidence: Record<string, unknown> = {
    studyId: study.studyId,
    assignmentUnit: study.assignmentUnit,
    analysisUnit: study.analysisUnit,
    response: study.response,
    seed: caseId === "report-contradiction" ? study.seed + 1 : study.seed,
    allocationPath: "design/allocation.csv",
    allocationRows: rows.length,
    armCounts: armCounts(study, rows),
    designProperties,
    limitationFlags: deriveExperimentalDesignV2LimitationFlags(study),
  }
  return {
    ...task.fixtures,
    "design/design-plan.json": json(plan),
    "design/allocation.csv": allocationCsv(rows),
    "design/design-report.md": [
      "# Public design report",
      "The prose is intentionally unconstrained; the public evidence block is audited.",
      "```json design-evidence",
      JSON.stringify(evidence, null, 2),
      "```",
      "",
    ].join("\n"),
    ...(caseId === "extra-output" ? { "debug.log": "unexpected public output\n" } : {}),
  }
}

async function writeFiles(root: string, files: FixtureFiles): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, "utf8")
  }
}

function syntheticRunResult(
  workDir: string,
  initialWorkdirManifest: Awaited<ReturnType<typeof writeInitialWorkdirManifest>>,
): RunResult {
  return {
    text: "Local differential audit",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest,
    runStatus: "ok",
  }
}

async function auditDifferentialCase(input: {
  task: ExperimentalDesignV2HarderTask
  caseId: DifferentialCaseId
}): Promise<ExperimentalDesignV2HarderDifferentialAuditReport["cases"][number]> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-v2-harder-differential-"))
  const workDir = path.join(temporaryRoot, "workdir")
  await mkdir(workDir)
  try {
    await writeFiles(workDir, input.task.fixtures)
    const initialWorkdirManifest = await writeInitialWorkdirManifest({
      workDir,
      manifestPath: path.join(temporaryRoot, "initial-workdir-manifest.json"),
    })
    const fixture = buildFixture(input.task, input.caseId)
    const outputs = Object.fromEntries(Object.entries(fixture).filter(
      ([relativePath]) => !Object.hasOwn(input.task.fixtures, relativePath),
    ))
    await writeFiles(workDir, outputs)
    const runResult = syntheticRunResult(workDir, initialWorkdirManifest)
    const criteria = []
    for (const rawCriterion of input.task.eval) {
      const result = await experimentalDesignGradeV2.run({ criterion: rawCriterion, runResult })
      criteria.push({
        criterionId: rawCriterion.id,
        pass: result.pass,
        score: result.score,
        infrastructure: result.infraError !== undefined,
      })
    }
    const weightedScore = criteria.reduce((total, result, index) =>
      total + result.score * input.task.eval[index]!.weight, 0)
    const observedPass =
      criteria.every((result) => result.pass && !result.infrastructure)
      && weightedScore >= input.task.passThreshold
    const expectedPass = input.caseId === "canonical-valid" || input.caseId === "alternative-valid"
    return {
      taskId: input.task.id,
      caseId: input.caseId,
      expectedPass,
      observedPass,
      status: observedPass === expectedPass ? "matched" : "mismatched",
      criteria,
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function runExperimentalDesignV2HarderDifferentialAudit(input: {
  rootDir: string
  taskSet: ExperimentalDesignV2HarderDevelopmentTaskSet
  publicContractBytes: Uint8Array
}): Promise<ExperimentalDesignV2HarderDifferentialAuditReport> {
  void input.rootDir
  const taskSet = ExperimentalDesignV2HarderDevelopmentTaskSetSchema.parse(input.taskSet)
  const publicContractText = Buffer.from(input.publicContractBytes).toString("utf8")
  if (taskSet.tasks.some((task) => task.fixtures["design-contract.json"] !== publicContractText)) {
    throw new Error("Harder differential audit public contract bytes mismatch")
  }
  const cases = []
  for (const task of taskSet.tasks) {
    for (const caseId of CASE_IDS) cases.push(await auditDifferentialCase({ task, caseId }))
  }
  const issues = cases.flatMap((entry) => entry.status === "matched"
    ? []
    : [{ taskId: entry.taskId, caseId: entry.caseId }])
  return ExperimentalDesignV2HarderDifferentialAuditReportSchema.parse({
    schemaVersion: "skill-ir-experimental-design-v2-harder-differential-audit/v1",
    auditId: "experimental-design-v2-harder-development-contract-v1",
    status: issues.length === 0 ? "passed" : "failed",
    counts: { tasks: taskSet.tasks.length, cases: cases.length, matched: cases.length - issues.length },
    cases,
    issues,
    claimBoundary:
      "This local differential audit validates public semantic equivalence and invalid controls; it is not model, optimization, or evaluation-split evidence.",
  })
}

function loadedTask(task: ExperimentalDesignV2HarderTask, rootDir: string): LoadedRunTask {
  const parsed = BenchTaskFileSchema.parse(task)
  return {
    ...parsed,
    eval: parsed.eval.map((criterion) => EvalCriterionSchema.parse(criterion)),
    taskDir: path.join(rootDir, path.dirname(TASKS_PATH)),
    taskPath: path.join(rootDir, TASKS_PATH),
  }
}

function parentDirectories(relativePaths: readonly string[]): string[] {
  const result = new Set<string>()
  for (const relativePath of relativePaths) {
    let parent = path.posix.dirname(relativePath)
    while (parent !== ".") {
      result.add(parent)
      parent = path.posix.dirname(parent)
    }
  }
  return [...result]
}

async function auditMaterializationArm(input: {
  rootDir: string
  task: LoadedRunTask
  system: System
}): Promise<ExperimentalDesignV2HarderMaterializationAuditReport["arms"][number]> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-v2-harder-materialization-"))
  const workDir = path.join(temporaryRoot, "workdir")
  const manifestPath = path.join(temporaryRoot, "initial-workdir-manifest.json")
  const checks = Object.fromEntries(
    MATERIALIZATION_CHECK_IDS.map((id) => [id, false]),
  ) as Record<MaterializationCheckId, boolean>
  try {
    const skill = input.system === "original"
      ? await loadRunSkill(path.join(input.rootDir, ...SKILL_PATH.split("/")))
      : undefined
    const reference = await prepareRunWorkspace({
      task: input.task,
      ...(skill ? { skill } : {}),
      workDir,
      initialWorkdirManifestPath: manifestPath,
    })
    if (!reference) throw new Error("Production preparer did not write initial provenance")
    const initial = await readInitialWorkdirManifest({ workDir, reference })
    const relativeManifest = path.relative(workDir, reference.path)
    checks["manifest-boundary"] = relativeManifest === ".." || relativeManifest.startsWith(`..${path.sep}`)

    const fixtureFiles = Object.keys(input.task.fixtures ?? {}).sort()
    checks["protected-inputs"] = (await Promise.all(fixtureFiles.map(async (relativePath) =>
      (await readFile(path.join(workDir, ...relativePath.split("/")))).equals(
        Buffer.from(input.task.fixtures![relativePath]!, "utf8"),
      )
    ))).every(Boolean)

    const expectedTaskEntries = new Set([...fixtureFiles, ...parentDirectories(fixtureFiles)])
    const initialPaths = new Set(initial.entries.map((entry) => entry.path))
    const sourceResourceFiles = initial.entries.filter(
      (entry) => entry.type === "file" && !expectedTaskEntries.has(entry.path),
    ).length
    checks["arm-initial-tree"] = input.system === "no-skill"
      ? initial.entries.every((entry) => expectedTaskEntries.has(entry.path))
        && expectedTaskEntries.size === initial.entries.length
      : sourceResourceFiles > 0 && [...expectedTaskEntries].every((entry) => initialPaths.has(entry))

    const initialOnly = await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })
    checks["initial-only-missing-outputs"] =
      initialOnly.violations.length === REQUIRED_OUTPUTS.length
      && initialOnly.violations.every((entry) => entry.code === "REQUIRED_OUTPUT_MISSING")

    await mkdir(path.join(workDir, "design"))
    await Promise.all(REQUIRED_OUTPUTS.map((relativePath) =>
      writeFile(path.join(workDir, ...relativePath.split("/")), "audit output\n", "utf8")
    ))
    checks["legal-output-delta"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).status === "pass"

    const debugPath = path.join(workDir, "debug.log")
    await writeFile(debugPath, "unexpected\n", "utf8")
    checks["extra-output-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "UNEXPECTED_ENTRY" && entry.path === "debug.log")
    await rm(debugPath)

    const mutablePath = fixtureFiles[0]!
    const mutableAbsolute = path.join(workDir, ...mutablePath.split("/"))
    const originalBytes = Buffer.from(input.task.fixtures![mutablePath]!, "utf8")
    await writeFile(mutableAbsolute, "changed\n", "utf8")
    checks["initial-mutation-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_FILE_MODIFIED" && entry.path === mutablePath)
    await writeFile(mutableAbsolute, originalBytes)

    const deletedPath = fixtureFiles[1]!
    const deletedAbsolute = path.join(workDir, ...deletedPath.split("/"))
    const deletedBytes = Buffer.from(input.task.fixtures![deletedPath]!, "utf8")
    await rm(deletedAbsolute)
    checks["initial-deletion-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_ENTRY_MISSING" && entry.path === deletedPath)
    await writeFile(deletedAbsolute, deletedBytes)

    const linkTarget = path.join(temporaryRoot, "link-target")
    const linkPath = path.join(workDir, "linked")
    await mkdir(linkTarget)
    await symlink(linkTarget, linkPath, process.platform === "win32" ? "junction" : "dir")
    try {
      await assessWorkdirDelta({
        workDir,
        initialManifest: initial,
        allowedNewDirectories: ["design"],
        requiredNewFiles: [...REQUIRED_OUTPUTS],
      })
    } catch (error) {
      checks["reparse-entry-rejected"] = error instanceof UnsafeWorkdirEntryError
    }

    return {
      taskId: input.task.id,
      system: input.system,
      status: MATERIALIZATION_CHECK_IDS.every((id) => checks[id]) ? "passed" : "failed",
      initialEntries: initial.entries.length,
      sourceResourceFiles,
      checks,
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function runExperimentalDesignV2HarderMaterializationAudit(input: {
  rootDir: string
  taskSet: ExperimentalDesignV2HarderDevelopmentTaskSet
}): Promise<ExperimentalDesignV2HarderMaterializationAuditReport> {
  const taskSet = ExperimentalDesignV2HarderDevelopmentTaskSetSchema.parse(input.taskSet)
  const arms = []
  for (const rawTask of taskSet.tasks) {
    const task = loadedTask(rawTask, input.rootDir)
    for (const system of ["no-skill", "original"] as const) {
      arms.push(await auditMaterializationArm({ rootDir: input.rootDir, task, system }))
    }
  }
  const issues = arms.flatMap((arm) => MATERIALIZATION_CHECK_IDS.flatMap((check) =>
    arm.checks[check] ? [] : [{ taskId: arm.taskId, system: arm.system, check }]
  ))
  const checks = arms.length * MATERIALIZATION_CHECK_IDS.length
  return ExperimentalDesignV2HarderMaterializationAuditReportSchema.parse({
    schemaVersion: "skill-ir-materialization-audit-report/v1",
    auditId: "experimental-design-v2-harder-materialized-delta-v1",
    contractRevision: "materialized-delta/v1",
    status: issues.length === 0 ? "passed" : "failed",
    counts: {
      tasks: taskSet.tasks.length,
      arms: arms.length,
      checks,
      passed: checks - issues.length,
    },
    arms,
    issues,
    claimBoundary:
      "This no-model audit validates production workspace materialization and delta enforcement for the supplemental tasks; it is not task-success or model evidence.",
  })
}
