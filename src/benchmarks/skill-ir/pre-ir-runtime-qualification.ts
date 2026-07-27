import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { hasBunRuntimeCrash } from "./pre-ir-runtime-evidence.ts"
import type { ProbeExecution } from "./route-probe.ts"
import { sha256Bytes } from "./source-fixture.ts"

export const PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS = 20

const FrozenRuntimeFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const CompiledPreIrExecutionRuntimeGuardSchema = z.object({
  kind: z.literal("compiled-skvm"),
  commandMode: z.literal("direct"),
  sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
  cacheRoot: SafeRelativePathSchema.optional(),
  executable: FrozenRuntimeFileSchema,
  qualification: FrozenRuntimeFileSchema,
  orchestration: z.array(FrozenRuntimeFileSchema).min(1).optional(),
}).strict()

export const SourcePreIrExecutionRuntimeGuardSchema = z.object({
  kind: z.literal("bun-source-skvm"),
  commandMode: z.literal("bun-source"),
  sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
  cacheRoot: SafeRelativePathSchema.optional(),
  executable: FrozenRuntimeFileSchema,
  entrypoint: FrozenRuntimeFileSchema,
  qualification: FrozenRuntimeFileSchema,
  orchestration: z.array(FrozenRuntimeFileSchema).min(1).optional(),
}).strict()

export const PreIrExecutionRuntimeGuardSchema = z.discriminatedUnion("kind", [
  CompiledPreIrExecutionRuntimeGuardSchema,
  SourcePreIrExecutionRuntimeGuardSchema,
])

export type PreIrExecutionRuntimeGuard = z.infer<typeof PreIrExecutionRuntimeGuardSchema>

export const PreIrRuntimeQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-execution-runtime-qualification/v1"),
  qualificationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  runtime: z.object({
    kind: z.literal("compiled-skvm"),
    commandMode: z.literal("direct"),
    executable: FrozenRuntimeFileSchema,
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    bunVersion: z.string().min(1),
    platform: z.string().min(1),
    arch: z.string().min(1),
  }).strict(),
  probe: z.object({
    args: z.tuple([z.literal("--help")]),
    attempts: z.literal(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    successes: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    failures: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    timeouts: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    bunCrashes: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
  }).strict(),
  issues: z.array(z.enum(["bun-runtime-crash", "nonzero-exit", "timeout"])),
}).strict()

export const PreIrSourceRuntimeQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-source-execution-runtime-qualification/v1"),
  qualificationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  runtime: z.object({
    kind: z.literal("bun-source-skvm"),
    commandMode: z.literal("bun-source"),
    executable: FrozenRuntimeFileSchema,
    entrypoint: FrozenRuntimeFileSchema,
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    bunVersion: z.string().min(1),
    platform: z.string().min(1),
    arch: z.string().min(1),
  }).strict(),
  probe: z.object({
    args: z.tuple([z.literal("run"), z.literal("<entrypoint>"), z.literal("--help")]),
    attempts: z.literal(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    successes: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    failures: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    timeouts: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
    bunCrashes: z.number().int().min(0).max(PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS),
  }).strict(),
  issues: z.array(z.enum(["bun-runtime-crash", "nonzero-exit", "timeout"])),
}).strict()

export type PreIrRuntimeQualificationReport =
  | z.infer<typeof PreIrRuntimeQualificationReportSchema>
  | z.infer<typeof PreIrSourceRuntimeQualificationReportSchema>

function summarizeProbeExecutions(executions: ProbeExecution[]): {
  status: "passed" | "failed"
  successes: number
  failures: number
  timeouts: number
  bunCrashes: number
  issues: Array<"bun-runtime-crash" | "nonzero-exit" | "timeout">
} {
  if (executions.length !== PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS) {
    throw new Error(`Runtime qualification requires exactly ${PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS} probes`)
  }
  const timeouts = executions.filter((execution) => execution.timedOut).length
  const bunCrashes = executions.filter((execution) => hasBunRuntimeCrash(execution.stderr)).length
  const successes = executions.filter((execution) =>
    execution.exitCode === 0 && !execution.timedOut && !hasBunRuntimeCrash(execution.stderr)
  ).length
  const failures = executions.length - successes
  const issues: Array<"bun-runtime-crash" | "nonzero-exit" | "timeout"> = []
  if (bunCrashes > 0) issues.push("bun-runtime-crash")
  if (executions.some((execution) => execution.exitCode !== 0)) issues.push("nonzero-exit")
  if (timeouts > 0) issues.push("timeout")
  return { status: failures === 0 ? "passed" : "failed", successes, failures, timeouts, bunCrashes, issues }
}

export function summarizePreIrRuntimeQualification(input: {
  qualificationId: string
  executable: { path: string; sha256: string }
  sourceCommit: string
  bunVersion: string
  platform: string
  arch: string
  executions: ProbeExecution[]
}): PreIrRuntimeQualificationReport {
  const summary = summarizeProbeExecutions(input.executions)
  return PreIrRuntimeQualificationReportSchema.parse({
    schemaVersion: "skill-ir-execution-runtime-qualification/v1",
    qualificationId: input.qualificationId,
    methodEvidence: false,
    status: summary.status,
    runtime: {
      kind: "compiled-skvm",
      commandMode: "direct",
      executable: input.executable,
      sourceCommit: input.sourceCommit,
      bunVersion: input.bunVersion,
      platform: input.platform,
      arch: input.arch,
    },
    probe: {
      args: ["--help"],
      attempts: PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS,
      successes: summary.successes,
      failures: summary.failures,
      timeouts: summary.timeouts,
      bunCrashes: summary.bunCrashes,
    },
    issues: summary.issues,
  })
}

export function summarizePreIrSourceRuntimeQualification(input: {
  qualificationId: string
  executable: { path: string; sha256: string }
  entrypoint: { path: string; sha256: string }
  sourceCommit: string
  bunVersion: string
  platform: string
  arch: string
  executions: ProbeExecution[]
}): PreIrRuntimeQualificationReport {
  const summary = summarizeProbeExecutions(input.executions)
  return PreIrSourceRuntimeQualificationReportSchema.parse({
    schemaVersion: "skill-ir-source-execution-runtime-qualification/v1",
    qualificationId: input.qualificationId,
    methodEvidence: false,
    status: summary.status,
    runtime: {
      kind: "bun-source-skvm",
      commandMode: "bun-source",
      executable: input.executable,
      entrypoint: input.entrypoint,
      sourceCommit: input.sourceCommit,
      bunVersion: input.bunVersion,
      platform: input.platform,
      arch: input.arch,
    },
    probe: {
      args: ["run", "<entrypoint>", "--help"],
      attempts: PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS,
      successes: summary.successes,
      failures: summary.failures,
      timeouts: summary.timeouts,
      bunCrashes: summary.bunCrashes,
    },
    issues: summary.issues,
  })
}

async function verifyRuntimeFile(
  rootDir: string,
  file: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const bytes = await readFile(path.resolve(rootDir, file.path))
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new Error(`Pre-IR execution runtime ${label} digest mismatch`)
  }
  return bytes
}

export async function verifyPreIrExecutionRuntimeGuard(
  input: unknown,
  rootDir: string,
): Promise<PreIrRuntimeQualificationReport> {
  const guard = PreIrExecutionRuntimeGuardSchema.parse(input)
  if (guard.cacheRoot !== undefined) {
    const cacheRoot = path.resolve(rootDir, guard.cacheRoot)
    try {
      const [cacheStat, configStat] = await Promise.all([
        lstat(cacheRoot),
        lstat(path.join(cacheRoot, "skvm.config.json")),
      ])
      if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink() || !configStat.isFile() || configStat.isSymbolicLink()) {
        throw new Error("unsafe cache config")
      }
    } catch {
      throw new Error("Pre-IR execution runtime cache config is missing or unsafe")
    }
  }
  await verifyRuntimeFile(rootDir, guard.executable, "executable")
  if (guard.kind === "bun-source-skvm") {
    await verifyRuntimeFile(rootDir, guard.entrypoint, "entrypoint")
  }
  const reportBytes = await verifyRuntimeFile(rootDir, guard.qualification, "qualification report")
  if (guard.orchestration) {
    const paths = new Set<string>()
    for (const file of guard.orchestration) {
      if (paths.has(file.path)) throw new Error("Pre-IR execution runtime duplicate orchestration path")
      paths.add(file.path)
      await verifyRuntimeFile(rootDir, file, `orchestration ${file.path}`)
    }
  }
  const report = guard.kind === "compiled-skvm"
    ? PreIrRuntimeQualificationReportSchema.parse(JSON.parse(reportBytes.toString("utf8")))
    : PreIrSourceRuntimeQualificationReportSchema.parse(JSON.parse(reportBytes.toString("utf8")))
  if (report.status !== "passed" || report.probe.failures !== 0 || report.issues.length !== 0) {
    throw new Error("Pre-IR execution runtime qualification did not pass")
  }
  if (
    report.runtime.executable.path !== guard.executable.path
    || report.runtime.executable.sha256 !== guard.executable.sha256
    || report.runtime.sourceCommit !== guard.sourceCommit
    || report.runtime.commandMode !== guard.commandMode
  ) {
    throw new Error("Pre-IR execution runtime qualification identity mismatch")
  }
  if (
    guard.kind === "bun-source-skvm"
    && (
      report.runtime.kind !== "bun-source-skvm"
      || report.runtime.entrypoint.path !== guard.entrypoint.path
      || report.runtime.entrypoint.sha256 !== guard.entrypoint.sha256
    )
  ) {
    throw new Error("Pre-IR source execution runtime qualification identity mismatch")
  }
  if (report.runtime.platform !== process.platform) {
    throw new Error("Pre-IR execution runtime platform mismatch")
  }
  if (report.runtime.arch !== process.arch) {
    throw new Error("Pre-IR execution runtime architecture mismatch")
  }
  return report
}

export function projectQualifiedPreIrCommand(
  command: string[],
  executablePath: string,
  entrypointPath?: string,
): string[] {
  if (
    command.length < 4
    || command[0] !== "bun"
    || command[1] !== "run"
    || command[2] !== "skvm"
    || command[3] !== "run"
  ) {
    throw new Error("Pre-IR qualified runtime expected the workspace command prefix")
  }
  return entrypointPath === undefined
    ? [path.resolve(executablePath), ...command.slice(3)]
    : [path.resolve(executablePath), "run", path.resolve(entrypointPath), ...command.slice(3)]
}
