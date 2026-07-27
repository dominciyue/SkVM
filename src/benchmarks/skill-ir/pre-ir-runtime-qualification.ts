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

export const PreIrExecutionRuntimeGuardSchema = z.object({
  kind: z.literal("compiled-skvm"),
  commandMode: z.literal("direct"),
  sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
  cacheRoot: SafeRelativePathSchema.optional(),
  executable: FrozenRuntimeFileSchema,
  qualification: FrozenRuntimeFileSchema,
}).strict()

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

export type PreIrRuntimeQualificationReport = z.infer<typeof PreIrRuntimeQualificationReportSchema>

export function summarizePreIrRuntimeQualification(input: {
  qualificationId: string
  executable: { path: string; sha256: string }
  sourceCommit: string
  bunVersion: string
  platform: string
  arch: string
  executions: ProbeExecution[]
}): PreIrRuntimeQualificationReport {
  if (input.executions.length !== PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS) {
    throw new Error(`Runtime qualification requires exactly ${PRE_IR_RUNTIME_QUALIFICATION_ATTEMPTS} probes`)
  }
  const timeouts = input.executions.filter((execution) => execution.timedOut).length
  const bunCrashes = input.executions.filter((execution) => hasBunRuntimeCrash(execution.stderr)).length
  const successes = input.executions.filter((execution) =>
    execution.exitCode === 0 && !execution.timedOut && !hasBunRuntimeCrash(execution.stderr)
  ).length
  const failures = input.executions.length - successes
  const issues: Array<"bun-runtime-crash" | "nonzero-exit" | "timeout"> = []
  if (bunCrashes > 0) issues.push("bun-runtime-crash")
  if (input.executions.some((execution) => execution.exitCode !== 0)) issues.push("nonzero-exit")
  if (timeouts > 0) issues.push("timeout")
  return PreIrRuntimeQualificationReportSchema.parse({
    schemaVersion: "skill-ir-execution-runtime-qualification/v1",
    qualificationId: input.qualificationId,
    methodEvidence: false,
    status: failures === 0 ? "passed" : "failed",
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
      successes,
      failures,
      timeouts,
      bunCrashes,
    },
    issues,
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
  const reportBytes = await verifyRuntimeFile(rootDir, guard.qualification, "qualification report")
  const report = PreIrRuntimeQualificationReportSchema.parse(JSON.parse(reportBytes.toString("utf8")))
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
  if (report.runtime.platform !== process.platform) {
    throw new Error("Pre-IR execution runtime platform mismatch")
  }
  if (report.runtime.arch !== process.arch) {
    throw new Error("Pre-IR execution runtime architecture mismatch")
  }
  return report
}

export function projectQualifiedPreIrCommand(command: string[], executablePath: string): string[] {
  if (
    command.length < 4
    || command[0] !== "bun"
    || command[1] !== "run"
    || command[2] !== "skvm"
    || command[3] !== "run"
  ) {
    throw new Error("Pre-IR qualified runtime expected the workspace command prefix")
  }
  return [path.resolve(executablePath), ...command.slice(3)]
}
