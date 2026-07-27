import { createHash } from "node:crypto"
import { z } from "zod"
import { classifyProbeExecution, type ProbeExecution } from "./route-probe.ts"

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

export const PreIrRouteFailureCodeSchema = z.enum([
  "none",
  "timeout",
  "bun-internal-assertion",
  "bun-crash",
  "provider-auth",
  "provider-rate-limit",
  "provider-5xx",
  "provider-network",
  "adapter-error",
  "nonzero-unclassified",
])

export const PreIrRouteDiagnosticSchema = z.object({
  schemaVersion: z.literal("skill-ir-fetch-active-route-diagnostic/v1"),
  qualificationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  calibrationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(false),
  model: z.string().min(1),
  caseId: z.string().min(1),
  status: z.enum(["ok", "timeout", "infrastructure", "agent"]),
  failureCode: PreIrRouteFailureCodeSchema,
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
  runtime: z.object({
    name: z.literal("bun"),
    version: z.string().regex(/^\d+(?:\.\d+){1,3}$/),
    platform: z.enum(["windows", "linux", "darwin", "unknown"]),
    arch: z.enum(["x64", "arm64", "unknown"]),
  }).strict().nullable(),
  streams: z.object({
    stdoutBytes: z.number().int().nonnegative(),
    stderrBytes: z.number().int().nonnegative(),
    stdoutSha256: Sha256Schema,
    stderrSha256: Sha256Schema,
  }).strict(),
}).strict()

export type PreIrRouteDiagnostic = z.infer<typeof PreIrRouteDiagnosticSchema>

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function classifyFailureCode(execution: ProbeExecution): z.infer<typeof PreIrRouteFailureCodeSchema> {
  if (execution.timedOut) return "timeout"
  if (execution.exitCode === 0) return "none"
  const combined = `${execution.stderr}\n${execution.stdout}`.toLowerCase()
  if (combined.includes("panic(main thread): internal assertion failure")) return "bun-internal-assertion"
  if (combined.includes("bun has crashed")) return "bun-crash"
  if (combined.includes("providerautherror") || combined.includes("authentication failed")) return "provider-auth"
  if (combined.includes("api error 429") || combined.includes("rate limit")) return "provider-rate-limit"
  if (/api error 5\d\d/u.test(combined) || combined.includes("providerhttperror")) return "provider-5xx"
  if (
    combined.includes("providernetworkerror")
    || combined.includes("network error")
    || combined.includes("operation timed out")
  ) return "provider-network"
  if (
    combined.includes("adapter error")
    || combined.includes("headlessagenterror")
    || combined.includes("pi session threw")
  ) return "adapter-error"
  return "nonzero-unclassified"
}

function runtimeIdentity(stderr: string): PreIrRouteDiagnostic["runtime"] {
  const match = /Bun v(\d+(?:\.\d+){1,3})[^\r\n]*\s+(Windows|Linux|Darwin)\s+(x64|arm64)\b/iu.exec(stderr)
  if (!match) return null
  return {
    name: "bun",
    version: match[1]!,
    platform: match[2]!.toLowerCase() as "windows" | "linux" | "darwin",
    arch: match[3]!.toLowerCase() as "x64" | "arm64",
  }
}

export function compactPreIrRouteDiagnostic(input: {
  qualificationId: string
  calibrationId: string
  model: string
  caseId: string
  execution: ProbeExecution
}): PreIrRouteDiagnostic {
  return PreIrRouteDiagnosticSchema.parse({
    schemaVersion: "skill-ir-fetch-active-route-diagnostic/v1",
    qualificationId: input.qualificationId,
    calibrationId: input.calibrationId,
    methodEvidence: false,
    model: input.model,
    caseId: input.caseId,
    status: classifyProbeExecution(input.execution),
    failureCode: classifyFailureCode(input.execution),
    ...(input.execution.exitCode !== undefined ? { exitCode: input.execution.exitCode } : {}),
    timedOut: input.execution.timedOut,
    ...(input.execution.durationMs !== undefined ? { durationMs: input.execution.durationMs } : {}),
    runtime: runtimeIdentity(input.execution.stderr),
    streams: {
      stdoutBytes: Buffer.byteLength(input.execution.stdout, "utf8"),
      stderrBytes: Buffer.byteLength(input.execution.stderr, "utf8"),
      stdoutSha256: sha256(input.execution.stdout),
      stderrSha256: sha256(input.execution.stderr),
    },
  })
}
