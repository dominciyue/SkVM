import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { BenchTaskFileSchema } from "../../bench/types.ts"
import { EvalCriterionSchema } from "../../core/types.ts"
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
  UnsafeWorkdirEntryError,
} from "../../core/workdir-manifest.ts"
import {
  loadRunSkill,
  prepareRunWorkspace,
  type LoadedRunTask,
} from "../../run/index.ts"
import {
  ApiTesterTaskSetSchema,
  type ApiTesterTaskSet,
} from "./api-tester-contract.ts"
import { sha256Bytes } from "./source-fixture.ts"

const DEVELOPMENT_PATH = "benchmarks/skill-ir/pilots/api-tester/development/tasks.json"
const SKILL_PATH = "benchmarks/skill-ir/pilots/api-tester/source/SKILL.md"
const REQUIRED_OUTPUTS = [
  "api-test-generator.mjs",
  "generated/api-test-plan.json",
  "api-test-report.json",
] as const
const CHECK_IDS = [
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

type Task = ApiTesterTaskSet["tasks"][number]
type System = "no-skill" | "original"
type CheckId = (typeof CHECK_IDS)[number]

const ChecksSchema = z.object({
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

export const ApiTesterMaterializationAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-materialization-audit-report/v1"),
  auditId: z.literal("api-tester-development-materialization-v1"),
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
    checks: ChecksSchema,
  }).strict()),
  issues: z.array(z.object({
    taskId: z.string().min(1),
    system: z.enum(["no-skill", "original"]),
    check: z.enum(CHECK_IDS),
  }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

export type ApiTesterMaterializationAuditReport = z.infer<
  typeof ApiTesterMaterializationAuditReportSchema
>

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown
}

function loadedTask(rootDir: string, task: Task): LoadedRunTask {
  const parsed = BenchTaskFileSchema.parse(task)
  const taskPath = path.join(rootDir, ...DEVELOPMENT_PATH.split("/"))
  return {
    ...parsed,
    eval: parsed.eval.map((criterion) => EvalCriterionSchema.parse(criterion)),
    taskDir: path.dirname(taskPath),
    taskPath,
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

async function auditArm(input: {
  rootDir: string
  task: Task
  system: System
}) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-api-tester-material-"))
  const workDir = path.join(temporaryRoot, "workdir")
  const manifestPath = path.join(temporaryRoot, "initial-workdir-manifest.json")
  const checks = Object.fromEntries(CHECK_IDS.map((id) => [id, false])) as Record<CheckId, boolean>
  try {
    const skill = input.system === "original"
      ? await loadRunSkill(path.join(input.rootDir, ...SKILL_PATH.split("/")))
      : undefined
    const reference = await prepareRunWorkspace({
      task: loadedTask(input.rootDir, input.task),
      ...(skill ? { skill } : {}),
      workDir,
      initialWorkdirManifestPath: manifestPath,
    })
    if (!reference) throw new Error("production preparer did not write initial provenance")
    const initial = await readInitialWorkdirManifest({ workDir, reference })
    const manifestRelative = path.relative(workDir, reference.path)
    checks["manifest-boundary"] = manifestRelative === ".." || manifestRelative.startsWith(`..${path.sep}`)

    const fixtureFiles = Object.keys(input.task.fixtures).sort()
    checks["protected-inputs"] = (await Promise.all(fixtureFiles.map(async (relativePath) =>
      sha256Bytes(await readFile(path.join(workDir, ...relativePath.split("/")))) ===
        sha256Bytes(Buffer.from(input.task.fixtures[relativePath]!, "utf8"))
    ))).every(Boolean)

    const expectedTaskEntries = new Set([...fixtureFiles, ...parentDirectories(fixtureFiles)])
    const initialPaths = new Set(initial.entries.map((entry) => entry.path))
    const sourceResourceFiles = initial.entries.filter(
      (entry) => entry.type === "file" && !expectedTaskEntries.has(entry.path),
    ).length
    checks["arm-initial-tree"] = input.system === "no-skill"
      ? initial.entries.length === expectedTaskEntries.size
        && initial.entries.every((entry) => expectedTaskEntries.has(entry.path))
      : sourceResourceFiles > 0 && [...expectedTaskEntries].every((entry) => initialPaths.has(entry))

    const initialOnly = await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["generated"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })
    checks["initial-only-missing-outputs"] = initialOnly.violations.length === REQUIRED_OUTPUTS.length
      && initialOnly.violations.every((entry) => entry.code === "REQUIRED_OUTPUT_MISSING")

    await mkdir(path.join(workDir, "generated"), { recursive: true })
    await Promise.all(REQUIRED_OUTPUTS.map((relativePath) =>
      writeFile(path.join(workDir, ...relativePath.split("/")), "{}\n", "utf8")
    ))
    checks["legal-output-delta"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["generated"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).status === "pass"

    const extraPath = path.join(workDir, "debug.log")
    await writeFile(extraPath, "extra\n", "utf8")
    checks["extra-output-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["generated"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "UNEXPECTED_ENTRY" && entry.path === "debug.log")
    await rm(extraPath)

    const mutablePath = fixtureFiles[0]!
    const mutableAbsolute = path.join(workDir, ...mutablePath.split("/"))
    const mutableBytes = Buffer.from(input.task.fixtures[mutablePath]!, "utf8")
    await writeFile(mutableAbsolute, "changed\n", "utf8")
    checks["initial-mutation-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["generated"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_FILE_MODIFIED" && entry.path === mutablePath)
    await writeFile(mutableAbsolute, mutableBytes)

    const deletedPath = fixtureFiles[1]!
    const deletedAbsolute = path.join(workDir, ...deletedPath.split("/"))
    const deletedBytes = Buffer.from(input.task.fixtures[deletedPath]!, "utf8")
    await rm(deletedAbsolute)
    checks["initial-deletion-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["generated"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_ENTRY_MISSING" && entry.path === deletedPath)
    await writeFile(deletedAbsolute, deletedBytes)

    const outside = path.join(temporaryRoot, "outside.txt")
    const link = path.join(workDir, "generated", "unsafe-link")
    await writeFile(outside, "outside\n", "utf8")
    try {
      await symlink(outside, link, "file")
      try {
        await assessWorkdirDelta({
          workDir,
          initialManifest: initial,
          allowedNewDirectories: ["generated"],
          requiredNewFiles: [...REQUIRED_OUTPUTS],
        })
      } catch (error) {
        checks["reparse-entry-rejected"] = error instanceof UnsafeWorkdirEntryError
      }
      await rm(link, { force: true })
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        checks["reparse-entry-rejected"] = true
      } else {
        throw error
      }
    }

    return {
      taskId: input.task.id,
      system: input.system,
      status: Object.values(checks).every(Boolean) ? "passed" as const : "failed" as const,
      initialEntries: initial.entries.length,
      sourceResourceFiles,
      checks,
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function buildApiTesterMaterializationAudit(input: {
  rootDir: string
}): Promise<ApiTesterMaterializationAuditReport> {
  const rootDir = path.resolve(input.rootDir)
  const taskSet = ApiTesterTaskSetSchema.parse(parseJson(await readFile(
    path.join(rootDir, ...DEVELOPMENT_PATH.split("/")),
  )))
  const arms = await Promise.all(taskSet.tasks.flatMap((task) =>
    (["no-skill", "original"] as const).map((system) => auditArm({ rootDir, task, system }))))
  const issues = arms.flatMap((arm) => CHECK_IDS
    .filter((check) => !arm.checks[check])
    .map((check) => ({ taskId: arm.taskId, system: arm.system, check })))
  const passed = arms.reduce((total, arm) => total + Object.values(arm.checks).filter(Boolean).length, 0)
  return ApiTesterMaterializationAuditReportSchema.parse({
    schemaVersion: "skill-ir-materialization-audit-report/v1",
    auditId: "api-tester-development-materialization-v1",
    status: issues.length === 0 ? "passed" : "failed",
    counts: {
      tasks: taskSet.tasks.length,
      arms: arms.length,
      checks: arms.length * CHECK_IDS.length,
      passed,
    },
    arms,
    issues,
    claimBoundary: "Production workspace materialization only; no model, semantic quality, held-out, or optimization claim.",
  })
}
