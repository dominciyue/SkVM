import { createHash } from "node:crypto"
import { readFile, writeFile, unlink, realpath, lstat } from "node:fs/promises"
import path from "node:path"
import type { ToolCall } from "../core/types.ts"
import { SubworkflowSchema, type Subworkflow } from "../jit-boost/types.ts"
import type { BeforeLLMContext, BeforeLLMResult, SubworkflowCheckpoint } from "./types.ts"

/** A checked, local-file prefix. Commands must declare all their mutable outputs. */
export async function executeSubworkflow(
  workflowId: string, definition: Subworkflow, ctx: BeforeLLMContext, inputs: Record<string, string>,
): Promise<Extract<BeforeLLMResult, { action: "continue" }>> {
  const toolResults: ToolCall[] = []
  const deadline = performance.now() + (ctx.remainingMs ?? Number.POSITIVE_INFINITY)
  const checkpoint: SubworkflowCheckpoint = {
    workflowId, status: "completed", inputs, completed: [], remainingSteps: definition.steps.map(step => step.id), remainingTask: definition.remainingTask,
  }
  const result = { action: "continue" as const, toolResults, checkpoint }
  const fill = (value: string) => value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => {
    if (!(name in inputs)) throw new Error(`missing parameter: ${name}`)
    return inputs[name]!
  })
  let root: string
  try { root = await realpath(ctx.workDir) }
  catch (error) {
    checkpoint.status = "stale"
    checkpoint.failed = { stepId: "preflight", diagnostic: `workspace unavailable: ${String(error)}`, invalidatedOutputs: [] }
    return result
  }
  const localPath = async (relative: string): Promise<string> => {
    const resolved = path.resolve(root, fill(relative))
    if (!resolved.startsWith(root + path.sep)) throw new Error(`output/dependency outside workspace: ${relative}`)
    // Do not roll back through a symlink, including a linked parent directory.
    let current = resolved
    while (current !== root) {
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`linked output/dependency: ${relative}`) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
      current = path.dirname(current)
    }
    return resolved
  }
  let flow: Subworkflow
  try {
    flow = SubworkflowSchema.parse(definition)
    for (const binding of flow.bindings) {
      const bytes = await readFile(await localPath(binding.path))
      if (createHash("sha256").update(bytes).digest("hex") !== binding.sha256) throw new Error(`dependency changed: ${binding.path}`)
    }
    // Validate locations and unresolved placeholders before the first side effect.
    for (const step of flow.steps) {
      step.argv.forEach(fill)
      for (const output of step.outputs) await localPath(output.path)
    }
  } catch (error) {
    checkpoint.status = "stale"
    checkpoint.failed = { stepId: "preflight", diagnostic: String(error), invalidatedOutputs: [] }
    return result
  }

  for (let index = 0; index < flow.steps.length; index++) {
    const step = flow.steps[index]!
    const snapshots = new Map<string, Buffer | undefined>()
    const started = performance.now()
    let output = "", exitCode: number | undefined, diagnostic: string | undefined
    try {
      if (performance.now() >= deadline) throw new Error("subworkflow deadline expired")
      for (const artifact of step.outputs) {
        const file = await localPath(artifact.path)
        try { snapshots.set(file, await readFile(file)) }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          snapshots.set(file, undefined)
        }
      }
      const proc = Bun.spawn(step.argv.map(fill), { cwd: root, stdout: "pipe", stderr: "pipe" })
      let expired = false
      const timer = setTimeout(() => { expired = true; proc.kill() }, Math.max(1, Math.min(step.timeoutMs ?? 30000, deadline - performance.now())))
      try {
        const [code, stdout, stderr] = await Promise.all([
          proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text(),
        ])
        exitCode = code
        output = stdout + (stderr ? `\nstderr: ${stderr}` : "")
      } finally { clearTimeout(timer) }
      if (expired) throw new Error("step timeout")
      if (exitCode !== 0) throw new Error(`step exited with code ${exitCode}`)
      for (const artifact of step.outputs) {
        const bytes = await readFile(await localPath(artifact.path))
        if (bytes.length < (artifact.minimumBytes ?? 1)) throw new Error(`artifact too small: ${artifact.path}`)
        if (artifact.format === "json") {
          const value: unknown = JSON.parse(bytes.toString("utf8"))
          for (const key of artifact.requiredKeys ?? []) {
            if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error(`missing required key: ${key} in ${artifact.path}`)
          }
        }
      }
    } catch (error) { diagnostic = String(error) }
    toolResults.push({ id: `subworkflow-${workflowId}-${step.id}-${ctx.iteration}`, name: "execute_command",
      input: { argv: step.argv.map(fill), subworkflowId: workflowId, stepId: step.id },
      output: output + (diagnostic ? `\n[validation failed] ${diagnostic}` : "\n[declared artifact checks passed]"),
      exitCode: exitCode ?? 1, durationMs: performance.now() - started,
    })
    if (diagnostic) {
      const restoreErrors: string[] = []
      const unrestored = new Set<string>()
      for (const [file, previous] of snapshots) {
        try {
          // Recheck the path after the command before touching it again.
          await localPath(path.relative(root, file))
          if (previous === undefined) { try { await unlink(file) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error } }
          else await writeFile(file, previous)
        } catch (error) { unrestored.add(file); restoreErrors.push(`${path.relative(root, file)}: ${String(error)}`) }
      }
      checkpoint.status = "recover"
      // A prefix artifact that could not be restored must not stay marked valid.
      checkpoint.completed = checkpoint.completed.filter(s => !s.outputs.some(p => unrestored.has(path.resolve(root, p))))
      const validPrefix = new Set(checkpoint.completed.flatMap(s => s.outputs.map(p => path.resolve(root, p))))
      checkpoint.failed = { stepId: step.id, diagnostic: diagnostic + (restoreErrors.length ? `; restore failed: ${restoreErrors.join("; ")}` : ""),
        invalidatedOutputs: flow.steps.slice(index).flatMap(s => s.outputs.map(o => fill(o.path))).filter(p => !validPrefix.has(path.resolve(root, p))),
      }
      checkpoint.remainingSteps = flow.steps.slice(index).map(s => s.id)
      return result
    }
    checkpoint.completed.push({ stepId: step.id, outputs: step.outputs.map(o => fill(o.path)) })
    checkpoint.remainingSteps = flow.steps.slice(index + 1).map(s => s.id)
  }
  return result
}
