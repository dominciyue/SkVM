import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { BenchTaskFileSchema } from "../../bench/types.ts";
import { EvalCriterionSchema } from "../../core/types.ts";
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
  UnsafeWorkdirEntryError,
} from "../../core/workdir-manifest.ts";
import {
  loadRunSkill,
  prepareRunWorkspace,
  type LoadedRunTask,
} from "../../run/index.ts";

const TASKS_PATH = "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json";
const SKILL_PATH = "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md";
const REQUIRED_OUTPUTS = [
  "design/design-plan.json",
  "design/allocation.csv",
  "design/design-report.md",
] as const;
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
] as const;

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  skillId: z.literal("experimental-design-v2"),
  tasks: z.array(z.unknown()).length(2),
}).strict();

type System = "no-skill" | "original";
type CheckId = (typeof CHECK_IDS)[number];

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
}).strict();

export const ExperimentalDesignV2MaterializationAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-materialization-audit-report/v1"),
  auditId: z.literal("experimental-design-v2-materialized-delta-v1"),
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
    check: z.enum(CHECK_IDS),
  }).strict()),
  claimBoundary: z.string().min(1),
}).strict();

export type ExperimentalDesignV2MaterializationAuditReport = z.infer<
  typeof ExperimentalDesignV2MaterializationAuditReportSchema
>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function loadedTask(value: unknown, tasksPath: string): LoadedRunTask {
  const parsed = BenchTaskFileSchema.parse(value);
  return {
    ...parsed,
    eval: parsed.eval.map((criterion) => EvalCriterionSchema.parse(criterion)),
    taskDir: path.dirname(tasksPath),
    taskPath: tasksPath,
  };
}

function parentDirectories(relativePaths: readonly string[]): string[] {
  const result = new Set<string>();
  for (const relativePath of relativePaths) {
    let parent = path.posix.dirname(relativePath);
    while (parent !== ".") {
      result.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  return [...result];
}

async function auditArm(input: {
  rootDir: string;
  task: LoadedRunTask;
  system: System;
}): Promise<ExperimentalDesignV2MaterializationAuditReport["arms"][number]> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-v2-materialization-"));
  const workDir = path.join(temporaryRoot, "workdir");
  const manifestPath = path.join(temporaryRoot, "initial-workdir-manifest.json");
  const checks = Object.fromEntries(CHECK_IDS.map((id) => [id, false])) as Record<CheckId, boolean>;
  try {
    const skill = input.system === "original"
      ? await loadRunSkill(path.join(input.rootDir, ...SKILL_PATH.split("/")))
      : undefined;
    const reference = await prepareRunWorkspace({
      task: input.task,
      ...(skill ? { skill } : {}),
      workDir,
      initialWorkdirManifestPath: manifestPath,
    });
    if (!reference) throw new Error("production preparer did not write initial provenance");
    const initial = await readInitialWorkdirManifest({ workDir, reference });
    const relativeManifest = path.relative(workDir, reference.path);
    checks["manifest-boundary"] =
      relativeManifest === ".." || relativeManifest.startsWith(`..${path.sep}`);

    const fixtureFiles = Object.keys(input.task.fixtures ?? {}).sort();
    checks["protected-inputs"] = (
      await Promise.all(fixtureFiles.map(async (relativePath) =>
        sha256(await readFile(path.join(workDir, ...relativePath.split("/")))) ===
        sha256(Buffer.from(input.task.fixtures![relativePath]!, "utf8"))
      ))
    ).every(Boolean);

    const expectedTaskEntries = new Set([
      ...fixtureFiles,
      ...parentDirectories(fixtureFiles),
    ]);
    const initialPaths = new Set(initial.entries.map((entry) => entry.path));
    const sourceResourceFiles = initial.entries.filter((entry) =>
      entry.type === "file" && !expectedTaskEntries.has(entry.path)
    ).length;
    checks["arm-initial-tree"] = input.system === "no-skill"
      ? initial.entries.every((entry) => expectedTaskEntries.has(entry.path)) &&
        expectedTaskEntries.size === initial.entries.length
      : sourceResourceFiles > 0 && [...expectedTaskEntries].every((entry) => initialPaths.has(entry));

    const initialOnly = await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    });
    checks["initial-only-missing-outputs"] =
      initialOnly.violations.length === REQUIRED_OUTPUTS.length &&
      initialOnly.violations.every((entry) => entry.code === "REQUIRED_OUTPUT_MISSING");

    await mkdir(path.join(workDir, "design"));
    await Promise.all(REQUIRED_OUTPUTS.map((relativePath) =>
      writeFile(path.join(workDir, ...relativePath.split("/")), "audit output\n", "utf8")
    ));
    checks["legal-output-delta"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).status === "pass";

    const debugPath = path.join(workDir, "debug.log");
    await writeFile(debugPath, "unexpected\n", "utf8");
    checks["extra-output-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "UNEXPECTED_ENTRY" && entry.path === "debug.log");
    await rm(debugPath);

    const mutablePath = fixtureFiles[0]!;
    const mutableAbsolute = path.join(workDir, ...mutablePath.split("/"));
    const originalBytes = Buffer.from(input.task.fixtures![mutablePath]!, "utf8");
    await writeFile(mutableAbsolute, "changed\n", "utf8");
    checks["initial-mutation-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_FILE_MODIFIED" && entry.path === mutablePath);
    await writeFile(mutableAbsolute, originalBytes);

    const deletedPath = fixtureFiles[1]!;
    const deletedAbsolute = path.join(workDir, ...deletedPath.split("/"));
    const deletedBytes = Buffer.from(input.task.fixtures![deletedPath]!, "utf8");
    await rm(deletedAbsolute);
    checks["initial-deletion-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_ENTRY_MISSING" && entry.path === deletedPath);
    await writeFile(deletedAbsolute, deletedBytes);

    const linkTarget = path.join(temporaryRoot, "link-target");
    const linkPath = path.join(workDir, "linked");
    await mkdir(linkTarget);
    await symlink(linkTarget, linkPath, process.platform === "win32" ? "junction" : "dir");
    try {
      await assessWorkdirDelta({
        workDir,
        initialManifest: initial,
        allowedNewDirectories: ["design"],
        requiredNewFiles: [...REQUIRED_OUTPUTS],
      });
    } catch (error) {
      checks["reparse-entry-rejected"] = error instanceof UnsafeWorkdirEntryError;
    }

    return {
      taskId: input.task.id,
      system: input.system,
      status: CHECK_IDS.every((id) => checks[id]) ? "passed" : "failed",
      initialEntries: initial.entries.length,
      sourceResourceFiles,
      checks,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function runExperimentalDesignV2MaterializationAudit(
  rootDir = process.cwd(),
): Promise<ExperimentalDesignV2MaterializationAuditReport> {
  const tasksPath = path.join(rootDir, ...TASKS_PATH.split("/"));
  const taskSet = TaskSetSchema.parse(JSON.parse(await readFile(tasksPath, "utf8")));
  const tasks = taskSet.tasks.map((task) => loadedTask(task, tasksPath));
  const arms = [];
  for (const task of tasks) {
    for (const system of ["no-skill", "original"] as const) {
      arms.push(await auditArm({ rootDir, task, system }));
    }
  }
  const issues = arms.flatMap((arm) => CHECK_IDS.flatMap((check) =>
    arm.checks[check] ? [] : [{ taskId: arm.taskId, system: arm.system, check }]
  ));
  const checks = arms.length * CHECK_IDS.length;
  return ExperimentalDesignV2MaterializationAuditReportSchema.parse({
    schemaVersion: "skill-ir-materialization-audit-report/v1",
    auditId: "experimental-design-v2-materialized-delta-v1",
    contractRevision: "materialized-delta/v1",
    status: issues.length === 0 ? "passed" : "failed",
    counts: { tasks: tasks.length, arms: arms.length, checks, passed: checks - issues.length },
    arms,
    issues,
    claimBoundary:
      "This no-model audit validates production workspace materialization and delta enforcement; it is not task-success or model evidence.",
  });
}

if (import.meta.main) {
  const outArg = process.argv.slice(2).find((argument) => argument.startsWith("--out="));
  if (!outArg) throw new Error("--out is required");
  const outPath = path.resolve(outArg.slice("--out=".length));
  const report = await runExperimentalDesignV2MaterializationAudit();
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    auditId: report.auditId,
    status: report.status,
    checks: report.counts.checks,
    out: path.relative(process.cwd(), outPath).split(path.sep).join("/"),
  }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
}
