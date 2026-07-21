import { z } from "zod"

const EnvironmentNameSchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/)
const ProbeArgumentSchema = z.string().max(4096).refine((value) => !/[\u0000\r\n]/u.test(value))

export const ResourceContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-resource-contract/v1"),
  inputFormats: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
  network: z.literal("forbidden"),
  packageInstall: z.literal("forbidden"),
  interpreter: z.object({
    env: EnvironmentNameSchema,
    fallbackCommand: z.string().regex(/^[A-Za-z0-9._-]+$/),
    minimumVersion: z.string().regex(/^\d+(?:\.\d+)*$/),
  }).strict(),
  probe: z.object({
    args: z.array(ProbeArgumentSchema).min(1),
    requiredModules: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/)),
    successMarker: z.string().regex(/^[A-Za-z0-9._-]+$/),
  }).strict(),
  missingDependencyDisposition: z.literal("preflight-infrastructure"),
}).strict()

export type ResourceContract = z.infer<typeof ResourceContractSchema>

export interface ResourceProbeResult {
  schemaVersion: "skill-ir-resource-probe-result/v1"
  methodEvidence: false
  status: "ok" | "failed" | "unavailable"
  executableSource: "env" | "fallback"
  requiredModules: string[]
  exitCode: number | null
  stderrClass: "none" | "probe-nonzero" | "marker-missing" | "spawn-failed"
  durationMs: number
}

export async function runResourceProbe(
  contract: ResourceContract,
  options: { env?: Record<string, string | undefined> } = {},
): Promise<ResourceProbeResult> {
  const env = options.env ?? process.env
  const selected = env[contract.interpreter.env]?.trim()
  const executable = selected || contract.interpreter.fallbackCommand
  const executableSource = selected ? "env" : "fallback"
  const startedAt = performance.now()

  try {
    const child = Bun.spawn([executable, ...contract.probe.args], {
      env: { ...process.env, ...env },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ])
    const markerObserved = stdout.includes(contract.probe.successMarker)
    const status = exitCode === 0 && markerObserved ? "ok" : "failed"
    return {
      schemaVersion: "skill-ir-resource-probe-result/v1",
      methodEvidence: false,
      status,
      executableSource,
      requiredModules: [...contract.probe.requiredModules],
      exitCode,
      stderrClass: exitCode !== 0 ? "probe-nonzero" : markerObserved ? "none" : "marker-missing",
      durationMs: Math.round(performance.now() - startedAt),
    }
  } catch {
    return {
      schemaVersion: "skill-ir-resource-probe-result/v1",
      methodEvidence: false,
      status: "unavailable",
      executableSource,
      requiredModules: [...contract.probe.requiredModules],
      exitCode: null,
      stderrClass: "spawn-failed",
      durationMs: Math.round(performance.now() - startedAt),
    }
  }
}
