/**
 * `skvm run` — run one task with an optional user-specified skill (execution
 * only, no evaluation or scoring).
 *
 * Flags are declared once via `defineFlags` (#49); help is generated from the
 * declarations and `runRun` takes the typed config, so the parse path and
 * cross-flag rules are unit-testable without spawning the CLI.
 */

import { defineFlags, UsageError, type ConfigOf } from "./flags.ts"
import { ALL_ADAPTERS, createAdapter } from "../adapters/registry.ts"
import { resolveAdapterConfigMode } from "../core/config.ts"
import { AdapterConfigModeSchema, type AdapterConfig, type SkillMode } from "../core/types.ts"
import { CLI_DEFAULTS } from "../core/ui-defaults.ts"
import { TIMEOUT_DEFAULTS } from "../core/timeouts.ts"
import { hasUsageTelemetry } from "../core/run-record.ts"
import { createSpinner } from "../core/spinner.ts"
import { c } from "../core/logger.ts"

/** Tied to `SkillMode` at compile time so the flag spec cannot drift. */
const SKILL_MODES = ["inject", "discover"] as const satisfies readonly SkillMode[]

export const RUN_FLAGS = defineFlags(
  "run",
  "Run one task with an optional user-specified skill",
  {
    task: {
      kind: "string",
      placeholder: "<path>",
      help: "Path to a task JSON file (bench task schema)",
    },
    prompt: {
      kind: "string",
      placeholder: "<text>",
      help: "Natural-language task; mutually exclusive with --task",
    },
    model: {
      kind: "string",
      required: true,
      placeholder: "<id>",
      help: "Model identifier, <provider>/<model-id>",
    },
    skill: {
      kind: "string",
      placeholder: "<path>",
      help: "Optional path to a SKILL.md file",
    },
    "skill-mode": {
      kind: "enum",
      values: SKILL_MODES,
      placeholder: "<mode>",
      help: "inject | discover (default: inject).\nRequires --skill. inject: skill text is concatenated\ninto the system prompt. discover: skill is written\nto .claude/skills/<name>/ and discovered via its\nSKILL.md description.",
    },
    adapter: {
      kind: "enum",
      values: ALL_ADAPTERS,
      default: CLI_DEFAULTS.adapter,
      placeholder: "<name>",
      help: `Agent adapter: ${ALL_ADAPTERS.join(" | ")}`,
    },
    workdir: {
      kind: "string",
      placeholder: "<path>",
      help: "Use this directory instead of a temp work directory",
    },
    "initial-workdir-manifest": {
      kind: "string",
      placeholder: "<path>",
      help: "Write a pre-agent workdir manifest outside the work directory",
    },
    "execution-observation": {
      kind: "string",
      placeholder: "<path>",
      help: "Write a value-free execution observation JSON sidecar",
    },
    "timeout-ms": {
      kind: "int",
      min: 1,
      help: `Override the per-task agent execution timeout (ms).\nThis caps how long the target adapter spends solving\none task. Falls back to task.json's \`timeoutMs\`,\nthen to the built-in default (${TIMEOUT_DEFAULTS.taskExec}).`,
    },
    "idle-timeout-ms": {
      kind: "int",
      min: 1,
      help: "Optional inactivity deadline for progress-aware adapters (ms).",
    },
    "max-steps": {
      kind: "int",
      min: 1,
      help: "Override max steps for the adapter",
    },
    "adapter-config": {
      kind: "enum",
      values: AdapterConfigModeSchema.options,
      placeholder: "<m>",
      help: "native | managed (default: from skvm.config.json, else managed)",
    },
    optimize: {
      kind: "bool",
      help: "After this source run, optimize the selected skill from its captured trace",
    },
    "optimizer-model": {
      kind: "string",
      placeholder: "<id>",
      help: "Optimizer model; defaults to --model when --optimize is set",
    },
    "package-out": {
      kind: "string",
      placeholder: "<path>",
      help: "Optimized skill package directory; default is inside the run session",
    },
  },
  {
    usage: [
      "skvm run --task=<path/to/task.json> --model=<id> [options]",
      "skvm run --prompt=<natural-language-task> --model=<id> [options]",
      "skvm run --task=<path/to/task.json> --skill=<path/to/SKILL.md> --model=<id> [options]",
      "skvm run --prompt=<task> --skill=<path> --model=<id> --optimize [options]",
    ],
    epilogue: `Notes:
  - Without --optimize this command only executes; it does not score.
  - --optimize currently uses bare-agent run-scoped capture and the existing JIT optimizer.
  - Task files use the bench task.json shape, but eval is optional here.
  - Any files under the task's fixtures/ directory are copied into the workDir before execution.`,
  },
)

export type RunConfig = ConfigOf<typeof RUN_FLAGS>

export type ValidatedRunConfig = {
  taskSource: { kind: "task"; path: string } | { kind: "prompt"; prompt: string }
  optimizerModel?: string
}

export function validateRunConfig(config: RunConfig): ValidatedRunConfig {
  const hasTask = config.task !== undefined
  const hasPrompt = config.prompt !== undefined
  if (hasTask && hasPrompt) {
    throw new UsageError("run: --task and --prompt are mutually exclusive", RUN_FLAGS.help)
  }
  if (!hasTask && !hasPrompt) {
    throw new UsageError("run: exactly one of --task or --prompt is required", RUN_FLAGS.help)
  }
  if (config.prompt !== undefined && !config.prompt.trim()) {
    throw new UsageError("run: --prompt must contain non-whitespace text", RUN_FLAGS.help)
  }
  if (config["skill-mode"] && !config.skill) {
    throw new UsageError("run: --skill-mode requires --skill to also be specified", RUN_FLAGS.help)
  }
  if (config.optimize && !config.skill) {
    throw new UsageError("run: --optimize requires --skill", RUN_FLAGS.help)
  }
  if (config.optimize && config.adapter !== "bare-agent") {
    throw new UsageError(`run: --optimize currently supports adapter bare-agent; got ${config.adapter}`, RUN_FLAGS.help)
  }
  if (!config.optimize && config["optimizer-model"] !== undefined) {
    throw new UsageError("run: --optimizer-model requires --optimize", RUN_FLAGS.help)
  }
  if (!config.optimize && config["package-out"] !== undefined) {
    throw new UsageError("run: --package-out requires --optimize", RUN_FLAGS.help)
  }
  return {
    taskSource: config.task !== undefined
      ? { kind: "task", path: config.task }
      : { kind: "prompt", prompt: config.prompt!.trim() },
    ...(config.optimize ? { optimizerModel: config["optimizer-model"] ?? config.model } : {}),
  }
}

export async function runRun(config: RunConfig): Promise<void> {
  const validated = validateRunConfig(config)
  const skillMode = config["skill-mode"]

  const { skill: skillPath, model, adapter: harness } = config

  {
    const { printBanner, describeModelRoute, describeAdapter, shortenPath } = await import("../core/banner.ts")
    const { SKVM_CACHE } = await import("../core/config.ts")
    const bannerLines: [string, string][] = [
      ["Adapter", describeAdapter(harness)],
      ["Model", describeModelRoute(model)],
      ["Task", validated.taskSource.kind === "task" ? validated.taskSource.path : "natural prompt"],
    ]
    if (skillPath) bannerLines.push(["Skill", skillPath])
    if (config.workdir) bannerLines.push(["WorkDir", shortenPath(config.workdir)])
    bannerLines.push(["Cache", shortenPath(SKVM_CACHE)])
    printBanner("run", bannerLines)
  }

  // Provider-specific API key is checked lazily by createProviderForModel().

  const { executeRun, loadRunSkill, loadRunTask, materializeNaturalRunTask, naturalRunTaskId } = await import("../run/index.ts")

  let task
  let skill
  try {
    skill = skillPath ? await loadRunSkill(skillPath) : undefined
    task = validated.taskSource.kind === "task"
      ? await loadRunTask(validated.taskSource.path)
      : undefined
  } catch (err) {
    console.error(String(err))
    process.exit(1)
  }

  const taskId = task?.id ?? naturalRunTaskId(validated.taskSource.kind === "prompt" ? validated.taskSource.prompt : "")

  const { RunSession, shortModel: shortModelName } = await import("../core/run-session.ts")
  const { getRuntimeLogDir, getTmpDir } = await import("../core/config.ts")
  const runtimeLogDir = getRuntimeLogDir(harness, model, taskId)
  const runSession = await RunSession.start({
    type: "run",
    tag: `${harness}-${shortModelName(model)}-${taskId}`,
    logDir: runtimeLogDir,
    models: config.optimize ? [model, validated.optimizerModel!] : [model],
    harness,
    ...(skillPath ? { skill: skillPath } : {}),
  })
  if (!task) {
    try {
      const pathModule = await import("node:path")
      task = await materializeNaturalRunTask({
        prompt: validated.taskSource.kind === "prompt" ? validated.taskSource.prompt : "",
        taskPath: pathModule.join(runtimeLogDir, runSession.id, "source-task", "task.json"),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await runSession.fail(message)
      console.error(message)
      process.exit(1)
    }
  }

  const adapterModeRun = resolveAdapterConfigMode(config["adapter-config"])

  const { resolveTaskRuntime } = await import("../core/task-runtime.ts")
  const runRuntime = resolveTaskRuntime(task, {
    timeoutMs: config["timeout-ms"],
    maxSteps: config["max-steps"],
  })
  const adapterConfig: AdapterConfig = {
    model,
    maxSteps: runRuntime.maxSteps,
    timeoutMs: runRuntime.timeoutMs,
    idleTimeoutMs: config["idle-timeout-ms"],
    mode: adapterModeRun,
  }

  const adapter = createAdapter(harness)

  const runSp = createSpinner(`Running task ${task.id}...`)

  try {
    let result
    let optimization:
      | Awaited<ReturnType<typeof import("../run/optimization-handoff.ts")["executeRunAndOptimize"]>>["optimization"]
      | undefined
    let optimizationManifestPath: string | undefined
    if (config.optimize) {
      const pathModule = await import("node:path")
      const { mkdir, mkdtemp } = await import("node:fs/promises")
      const workDir = config.workdir
        ? pathModule.resolve(config.workdir)
        : await mkdtemp(pathModule.join(getTmpDir(), `skvm-run-${task.id}-`))
      await mkdir(workDir, { recursive: true })
      const { OptimizationSession } = await import("../run/optimization-session.ts")
      const capture = await OptimizationSession.start({
        runId: runSession.id,
        rootDir: runtimeLogDir,
        skill: skill!,
        task,
        workDir,
        adapter: harness,
        model,
        optimizationRequested: true,
      })
      optimizationManifestPath = capture.manifestPath
      const { executeRunAndOptimize } = await import("../run/optimization-handoff.ts")
      const combined = await executeRunAndOptimize({
        session: capture,
        task,
        skill: skill!,
        adapter,
        adapterConfig,
        workDir,
        skillMode,
        optimizerModel: validated.optimizerModel!,
        packageDir: config["package-out"],
      })
      result = combined.source
      optimization = combined.optimization
      if (config["initial-workdir-manifest"]) {
        const { copyFile, mkdir: makeDir } = await import("node:fs/promises")
        await makeDir(pathModule.dirname(pathModule.resolve(config["initial-workdir-manifest"])), { recursive: true })
        await copyFile(capture.initialWorkdirManifestPath, pathModule.resolve(config["initial-workdir-manifest"]))
      }
    } else {
      result = await executeRun({
        task,
        skill,
        adapter,
        adapterConfig,
        skillMode,
        workDir: config.workdir,
        keepWorkDir: true,
        initialWorkdirManifestPath: config["initial-workdir-manifest"],
      })
    }
    if (config["execution-observation"]) {
      if (!result.runResult.executionObservation) {
        throw new Error(`Adapter ${harness} did not provide execution observation`)
      }
      const { dirname } = await import("node:path")
      const { mkdir, writeFile } = await import("node:fs/promises")
      await mkdir(dirname(config["execution-observation"]), { recursive: true })
      await writeFile(
        config["execution-observation"],
        `${JSON.stringify(result.runResult.executionObservation, null, 2)}\n`,
        "utf8",
      )
    }
    runSp.succeed(`Task ${task.id} complete`)

    console.log(`\n=== Run Complete ===`)
    console.log(`Task: ${result.task.id}`)
    console.log(`Skill: ${result.skill?.skillPath ?? "<none>"}`)
    console.log(`Model: ${model}`)
    console.log(`Adapter: ${harness}`)
    console.log(`WorkDir: ${result.workDir}`)
    console.log(`Duration: ${(result.runResult.durationMs / 1000).toFixed(1)}s`)
    console.log(hasUsageTelemetry(result.runResult)
      ? `Tokens: in=${result.runResult.tokens.input} out=${result.runResult.tokens.output}`
      : `Tokens: n/a (harness reported no usage telemetry)`)
    // Surface non-ok runStatus prominently — otherwise a timed-out single-task
    // run would silently print whatever text the agent emitted before the kill
    // and no warning that the budget was violated. (`skvm run` doesn't go
    // through the bench runner gate, so this is the only place to flag it.)
    if (result.runResult.runStatus !== "ok") {
      console.log(c.yellow(`⚠ runStatus: ${result.runResult.runStatus}`))
      if (result.runResult.statusDetail) {
        console.log(`  ${result.runResult.statusDetail}`)
      }
    }
    if (result.runResult.adapterError) {
      const ae = result.runResult.adapterError
      if (ae.diagnosis) {
        console.log(`Adapter error: ${ae.diagnosis.summary}`)
        if (ae.diagnosis.hint) console.log(`  ${ae.diagnosis.hint}`)
      } else {
        console.log(`Adapter error: ${ae.stderr || `exit code ${ae.exitCode}`}`)
      }
    }
    if (result.runResult.text) {
      console.log(`\nFinal output:\n${result.runResult.text}`)
    }
    if (optimization) {
      console.log(`\n=== Optimization Handoff ===`)
      console.log(`Session: ${optimizationManifestPath}`)
      if (optimization.status === "completed" || optimization.status === "no-change") {
        console.log(`Status: ${optimization.status}`)
        console.log(`Proposal: ${optimization.proposalDir}`)
        console.log(`Package: ${optimization.packageDir ?? "not exported (no change)"}`)
      } else {
        console.log(c.yellow(`Status: ${optimization.status}`))
        console.log(`  ${"error" in optimization ? optimization.error : "unexpected optimization state"}`)
      }
    }
    if (optimization && "error" in optimization) {
      await runSession.fail(`source completed; optimization ${optimization.status}: ${optimization.error}`)
      process.exitCode = 1
    } else {
      await runSession.complete(`${task.id}, ${(result.runResult.durationMs / 1000).toFixed(1)}s`)
    }
  } catch (err) {
    runSp.fail(`Task ${task.id} failed`)
    await runSession.fail(err instanceof Error ? err.message : String(err))
    console.error(c.red(`Run failed: ${err}`))
    process.exit(1)
  }
}
