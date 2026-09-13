import path from "node:path"
import type { AdapterConfig, AgentAdapter, SkillMode } from "../core/types.ts"
import type {
  BuildOptimizedSkillPackageOptions,
  BuildOptimizedSkillPackageResult,
  JitOptimizeConfig,
  JitOptimizeResult,
  VerifiedOptimizedSkillPackage,
} from "../jit-optimize/index.ts"
import {
  buildOptimizedSkillPackage,
  jitOptimize,
  verifyOptimizedSkillPackage,
} from "../jit-optimize/index.ts"
import { acquireOptimizeLock, releaseOptimizeLock } from "../proposals/storage.ts"
import {
  executeRun,
  type ExecuteRunOptions,
  type ExecuteRunResult,
  type LoadedRunTask,
  type LoadedSkill,
} from "./index.ts"
import {
  OptimizationSession,
  freezeOptimizationEvidenceManifest,
  readOptimizationSession,
  transitionOptimizationSession,
  type OptimizationSessionManifest,
} from "./optimization-session.ts"

export interface OptimizationHandoffDependencies {
  jitOptimize(config: JitOptimizeConfig): Promise<JitOptimizeResult>
  buildPackage(options: BuildOptimizedSkillPackageOptions): Promise<BuildOptimizedSkillPackageResult>
  verifyPackage(packageDir: string): Promise<VerifiedOptimizedSkillPackage>
  acquireLock(harness: string, targetModel: string, skillName: string): Promise<boolean>
  releaseLock(harness: string, targetModel: string, skillName: string): Promise<void>
}

const DEFAULT_HANDOFF_DEPENDENCIES: OptimizationHandoffDependencies = {
  jitOptimize,
  buildPackage: buildOptimizedSkillPackage,
  verifyPackage: verifyOptimizedSkillPackage,
  acquireLock: acquireOptimizeLock,
  releaseLock: releaseOptimizeLock,
}

export interface RunCapturedOptimizationOptions {
  manifestPath: string
  optimizerModel: string
  packageDir?: string
  dependencies?: OptimizationHandoffDependencies
}

export interface CapturedOptimizationResult {
  status: "completed" | "no-change"
  manifestPath: string
  proposalId: string
  proposalDir: string
  packageDir?: string
  resumed: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function terminalResult(
  manifestPath: string,
  manifest: OptimizationSessionManifest,
): CapturedOptimizationResult | undefined {
  const state = manifest.optimization
  if (!state || (state.status !== "completed" && state.status !== "no-change")) return undefined
  return {
    status: state.status,
    manifestPath,
    proposalId: state.proposalId,
    proposalDir: state.proposalDir,
    ...(state.status === "completed" ? { packageDir: state.packageDir } : {}),
    resumed: true,
  }
}

/**
 * Continue the optimization half of an already-captured run.
 *
 * The persisted state is written before every external/side-effecting phase.
 * If a process disappears while that phase is running, a later invocation
 * refuses to replay it because completion is unknown. A completed proposal can
 * resume package export without another optimizer call.
 */
export async function runCapturedOptimization(
  options: RunCapturedOptimizationOptions,
): Promise<CapturedOptimizationResult> {
  const manifestPath = path.resolve(options.manifestPath)
  const deps = options.dependencies ?? DEFAULT_HANDOFF_DEPENDENCIES
  let manifest = await readOptimizationSession(manifestPath)
  if (manifest.binding.adapter !== "bare-agent") {
    throw new Error(
      `automatic optimization only supports captured bare-agent runs; got ${manifest.binding.adapter}`,
    )
  }
  const terminal = terminalResult(manifestPath, manifest)
  if (terminal) return terminal
  if (manifest.handoff.status !== "ready") {
    throw new Error(`Optimization handoff is ${manifest.handoff.status}: ${manifest.handoff.reason ?? "capture is incomplete"}`)
  }
  const initialOptimization = manifest.optimization
  const initialState = initialOptimization?.status ?? "not-requested"
  if (initialState === "not-requested") throw new Error("Optimization was not requested for this run")
  if (initialState === "optimizer-running" || initialState === "package-exporting") {
    throw new Error(`Cannot resume ${initialState}: previous phase completion is unknown; inspect this session before retrying`)
  }
  let resumed = initialState === "proposal-ready"
  if (initialOptimization?.status === "failed") {
    if (initialOptimization.phase !== "package"
      || !initialOptimization.optimizerModel
      || !initialOptimization.proposalId
      || !initialOptimization.proposalDir) {
      throw new Error(`Cannot automatically resume failed ${initialOptimization.phase} phase: ${initialOptimization.error}`)
    }
    manifest = await transitionOptimizationSession(manifestPath, ["failed"], {
      status: "proposal-ready",
      optimizerModel: initialOptimization.optimizerModel,
      proposalId: initialOptimization.proposalId,
      proposalDir: initialOptimization.proposalDir,
      ...(initialOptimization.evidenceManifestPath ? { evidenceManifestPath: initialOptimization.evidenceManifestPath } : {}),
      ...(initialOptimization.evidenceSha256 ? { evidenceSha256: initialOptimization.evidenceSha256 } : {}),
    })
    resumed = true
  }
  if (initialState === "pending") {
    const skillName = manifest.binding.skillId ?? path.basename(path.dirname(manifest.artifacts.skillSnapshot.path))
    const locked = await deps.acquireLock(manifest.binding.adapter, manifest.binding.model, skillName)
    if (!locked) throw new Error(`Optimization lock is held for ${manifest.binding.adapter}/${manifest.binding.model}/${skillName}`)
    try {
      const evidenceManifest = await freezeOptimizationEvidenceManifest(manifestPath)
      await transitionOptimizationSession(manifestPath, ["pending"], {
        status: "optimizer-running",
        optimizerModel: options.optimizerModel,
        startedAt: new Date().toISOString(),
        evidenceManifestPath: evidenceManifest.path,
        evidenceSha256: evidenceManifest.sha256,
      })
      let result: JitOptimizeResult
      try {
        result = await deps.jitOptimize({
          skillDir: path.dirname(manifest.artifacts.skillSnapshot.path),
          optimizer: { model: options.optimizerModel },
          taskSource: { kind: "execution-log", logs: [{ path: evidenceManifest.path }] },
          targetAdapter: {
            model: manifest.binding.model,
            harness: manifest.binding.adapter as JitOptimizeConfig["targetAdapter"]["harness"],
          },
          loop: { rounds: 1, runsPerTask: 1 },
          delivery: { keepAllRounds: true, autoApply: false },
        })
      } catch (error) {
        await transitionOptimizationSession(manifestPath, ["optimizer-running"], {
          status: "failed",
          phase: "optimizer",
          error: errorMessage(error),
          optimizerModel: options.optimizerModel,
          evidenceManifestPath: evidenceManifest.path,
          evidenceSha256: evidenceManifest.sha256,
          failedAt: new Date().toISOString(),
        })
        throw error
      }
      manifest = await transitionOptimizationSession(manifestPath, ["optimizer-running"], {
        status: "proposal-ready",
        optimizerModel: options.optimizerModel,
        proposalId: result.proposalId,
        proposalDir: result.proposalDir,
        evidenceManifestPath: evidenceManifest.path,
        evidenceSha256: evidenceManifest.sha256,
      })
    } finally {
      await deps.releaseLock(manifest.binding.adapter, manifest.binding.model, skillName)
    }
  }

  const proposal = manifest.optimization
  if (!proposal || proposal.status !== "proposal-ready") {
    throw new Error(`Expected proposal-ready optimization state, got ${proposal?.status ?? "missing"}`)
  }
  const packageDir = path.resolve(options.packageDir ?? path.join(path.dirname(manifestPath), "optimized-skill"))
  await transitionOptimizationSession(manifestPath, ["proposal-ready"], {
    status: "package-exporting",
    optimizerModel: proposal.optimizerModel,
    proposalId: proposal.proposalId,
    proposalDir: proposal.proposalDir,
    packageDir,
    ...(proposal.evidenceManifestPath ? { evidenceManifestPath: proposal.evidenceManifestPath } : {}),
    ...(proposal.evidenceSha256 ? { evidenceSha256: proposal.evidenceSha256 } : {}),
  })
  try {
    const exported = await deps.buildPackage({ proposalDir: proposal.proposalDir, packageDir })
    if (exported.status === "no-change") {
      await transitionOptimizationSession(manifestPath, ["package-exporting"], {
        status: "no-change",
        optimizerModel: proposal.optimizerModel,
        proposalId: proposal.proposalId,
        proposalDir: proposal.proposalDir,
        completedAt: new Date().toISOString(),
        ...(proposal.evidenceManifestPath ? { evidenceManifestPath: proposal.evidenceManifestPath } : {}),
        ...(proposal.evidenceSha256 ? { evidenceSha256: proposal.evidenceSha256 } : {}),
      })
      return {
        status: "no-change",
        manifestPath,
        proposalId: proposal.proposalId,
        proposalDir: proposal.proposalDir,
        resumed,
      }
    }
    await deps.verifyPackage(exported.packageDir!)
    await transitionOptimizationSession(manifestPath, ["package-exporting"], {
      status: "completed",
      optimizerModel: proposal.optimizerModel,
      proposalId: proposal.proposalId,
      proposalDir: proposal.proposalDir,
      packageDir: exported.packageDir!,
      completedAt: new Date().toISOString(),
      ...(proposal.evidenceManifestPath ? { evidenceManifestPath: proposal.evidenceManifestPath } : {}),
      ...(proposal.evidenceSha256 ? { evidenceSha256: proposal.evidenceSha256 } : {}),
    })
    return {
      status: "completed",
      manifestPath,
      proposalId: proposal.proposalId,
      proposalDir: proposal.proposalDir,
      packageDir: exported.packageDir!,
      resumed,
    }
  } catch (error) {
    await transitionOptimizationSession(manifestPath, ["package-exporting"], {
      status: "failed",
      phase: "package",
      error: errorMessage(error),
      optimizerModel: proposal.optimizerModel,
      proposalId: proposal.proposalId,
      proposalDir: proposal.proposalDir,
      packageDir,
      failedAt: new Date().toISOString(),
      ...(proposal.evidenceManifestPath ? { evidenceManifestPath: proposal.evidenceManifestPath } : {}),
      ...(proposal.evidenceSha256 ? { evidenceSha256: proposal.evidenceSha256 } : {}),
    })
    throw error
  }
}

export interface ExecuteRunAndOptimizeDependencies {
  executeRun(options: ExecuteRunOptions): Promise<ExecuteRunResult>
  runCapturedOptimization(options: RunCapturedOptimizationOptions): Promise<CapturedOptimizationResult>
}

const DEFAULT_EXECUTE_DEPENDENCIES: ExecuteRunAndOptimizeDependencies = {
  executeRun,
  runCapturedOptimization,
}

export interface ExecuteRunAndOptimizeOptions {
  session: OptimizationSession
  task: LoadedRunTask
  skill: LoadedSkill
  adapter: AgentAdapter
  adapterConfig: AdapterConfig
  workDir: string
  skillMode?: SkillMode
  optimizerModel: string
  packageDir?: string
  dependencies?: ExecuteRunAndOptimizeDependencies
}

export interface ExecuteRunAndOptimizeResult {
  source: ExecuteRunResult
  session: OptimizationSessionManifest
  optimization:
    | CapturedOptimizationResult
    | { status: "blocked" | "failed"; error: string }
}

export async function executeRunAndOptimize(
  options: ExecuteRunAndOptimizeOptions,
): Promise<ExecuteRunAndOptimizeResult> {
  const deps = options.dependencies ?? DEFAULT_EXECUTE_DEPENDENCIES
  let source: ExecuteRunResult
  try {
    source = await deps.executeRun({
      task: options.task,
      skill: options.skill,
      adapter: options.adapter,
      adapterConfig: options.adapterConfig,
      workDir: options.workDir,
      keepWorkDir: true,
      skillMode: options.skillMode,
      initialWorkdirManifestPath: options.session.initialWorkdirManifestPath,
      convLog: options.session.conversationLog,
      runtimeTrace: options.session.runtimeTrace,
    })
  } catch (error) {
    await options.session.fail("provider-error", errorMessage(error))
    throw error
  }

  let manifest: OptimizationSessionManifest
  try {
    manifest = await options.session.complete(source.runResult)
  } catch (error) {
    manifest = await options.session.fail("capture-error", errorMessage(error))
    return { source, session: manifest, optimization: { status: "failed", error: errorMessage(error) } }
  }
  if (manifest.handoff.status !== "ready") {
    return {
      source,
      session: manifest,
      optimization: { status: "blocked", error: manifest.handoff.reason ?? "capture is incomplete" },
    }
  }
  try {
    const optimization = await deps.runCapturedOptimization({
      manifestPath: options.session.manifestPath,
      optimizerModel: options.optimizerModel,
      packageDir: options.packageDir,
    })
    return {
      source,
      session: await readOptimizationSession(options.session.manifestPath),
      optimization,
    }
  } catch (error) {
    return {
      source,
      session: await readOptimizationSession(options.session.manifestPath),
      optimization: { status: "failed", error: errorMessage(error) },
    }
  }
}
