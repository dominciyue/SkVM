import { createHash } from "node:crypto"
import { readFile, realpath, lstat } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

export const ArtifactSchema = z.object({
  path: z.string().min(1), format: z.enum(["text", "json"]),
  minimumBytes: z.number().int().nonnegative().optional(), requiredKeys: z.array(z.string()).optional(),
}).strict()
const text = z.string().min(1)
export const ContentCheckSchema = z.discriminatedUnion("kind", [
  z.object({ id: text, kind: z.literal("json-number"), path: text, pointer: z.string(),
    source: text, sourcePointer: z.string(), operation: z.enum(["sum", "count", "equal"]),
    tolerance: z.number().finite().nonnegative().default(0),
  }).strict(),
  z.object({ id: text, kind: z.literal("preserve"), path: text, source: text, pattern: text.optional() }).strict(),
  z.object({ id: text, kind: z.literal("command"), scope: z.enum(["numeric", "preservation", "semantic"]),
    argv: z.array(z.string()).min(1), timeoutMs: z.number().int().positive().optional(),
  }).strict(),
])
export const ArtifactValidationSchema = z.object({
  outputs: z.array(ArtifactSchema).min(1), checks: z.array(ContentCheckSchema).default([]),
}).strict().refine(v => new Set(v.checks.map(c => c.id)).size === v.checks.length, "check IDs must be unique")
export type ArtifactValidation = z.infer<typeof ArtifactValidationSchema>
export type CheckStatus = "passed" | "failed" | "unknown"
const statusSchema = z.enum(["passed", "failed", "unknown"])
export const ValidationReportSchema = z.object({
  status: statusSchema,
  artifacts: z.array(z.object({ path: z.string(), status: statusSchema, bytes: z.number().optional(), sha256: z.string().optional(), observedChange: z.boolean().optional(), details: z.string().optional() })),
  checks: z.array(z.object({ id: z.string(), scope: z.enum(["numeric", "preservation", "semantic"]), status: statusSchema,
    details: z.string(), durationMs: z.number(), usage: z.record(z.unknown()).optional() })),
  diagnostics: z.array(z.string()),
})
export type ValidationReport = z.infer<typeof ValidationReportSchema>

/** Workspace-bound data access. Validator commands are trusted local programs, not sandboxed. */
export async function workspacePathResolver(workDir: string, fill = (s: string) => s) {
  const root = await realpath(workDir)
  return async (relative: string): Promise<string> => {
    const resolved = path.resolve(root, fill(relative))
    if (!resolved.startsWith(root + path.sep)) throw new Error(`output/dependency outside workspace: ${relative}`)
    let current = resolved
    while (current !== root) {
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`linked output/dependency: ${relative}`) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
      current = path.dirname(current)
    }
    return resolved
  }
}

export interface PreparedValidation {
  spec: ArtifactValidation
  workDir: string
  resolve: (relative: string) => Promise<string>
  fill: (value: string) => string
  sources: Map<string, Buffer>
  priorArtifacts: Map<string, string | undefined>
}

async function artifactStamp(file: string): Promise<string | undefined> {
  try { const stat = await lstat(file, { bigint: true }); return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}` }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error }
}

/** Capture evaluation inputs before the tool runs, including in-place transformations. */
export async function prepareArtifactValidation(
  definition: z.input<typeof ArtifactValidationSchema>, workDir: string,
  fill = (s: string) => s, resolve?: (relative: string) => Promise<string>,
): Promise<PreparedValidation> {
  const spec = ArtifactValidationSchema.parse(definition)
  const local = resolve ?? await workspacePathResolver(workDir, fill)
  const sources = new Map<string, Buffer>()
  const priorArtifacts = new Map<string, string | undefined>()
  for (const output of spec.outputs) priorArtifacts.set(output.path, await artifactStamp(await local(output.path)))
  for (const check of spec.checks) {
    if (check.kind === "command") { check.argv.forEach(fill); continue }
    await local(check.path)
    sources.set(check.id, await readFile(await local(check.source)))
    if (check.kind === "preserve" && check.pattern) new RegExp(check.pattern, "gu")
  }
  return { spec, workDir, resolve: local, fill, sources, priorArtifacts }
}

function pointer(value: unknown, location: string): unknown {
  if (!location) return value
  if (!location.startsWith("/")) throw new Error(`invalid JSON pointer: ${location}`)
  for (const token of location.slice(1).split("/")) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~")
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error(`missing JSON pointer: ${location}`)
    value = (value as Record<string, unknown>)[key]
  }
  return value
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
function tokens(bytes: Buffer, pattern: string): string[] {
  return [...bytes.toString("utf8").matchAll(new RegExp(pattern, "gu"))].map(m => m[0]).sort()
}

export async function checkArtifacts(prepared: PreparedValidation, remainingMs = 30000): Promise<ValidationReport> {
  const { spec, resolve, sources, workDir, fill } = prepared
  const report: ValidationReport = { status: "passed", artifacts: [], checks: [], diagnostics: [] }
  const deadline = performance.now() + remainingMs
  for (const artifact of spec.outputs) {
    try {
      const bytes = await readFile(await resolve(artifact.path))
      if (bytes.length < (artifact.minimumBytes ?? 1)) throw new Error(`artifact too small: ${artifact.path}`)
      if (artifact.format === "json") {
        const value: unknown = JSON.parse(bytes.toString("utf8"))
        for (const key of artifact.requiredKeys ?? []) {
          if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error(`missing required key: ${key} in ${artifact.path}`)
        }
      }
      report.artifacts.push({ path: fill(artifact.path), status: "passed", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), observedChange: prepared.priorArtifacts.get(artifact.path) !== await artifactStamp(await resolve(artifact.path)) })
    } catch (error) {
      report.artifacts.push({ path: fill(artifact.path), status: "failed", details: String(error) })
      report.diagnostics.push(String(error))
    }
  }
  for (const check of spec.checks) {
    const started = performance.now()
    let status: CheckStatus = "passed", details = "", usage: Record<string, unknown> | undefined
    const scope = check.kind === "command" ? check.scope : check.kind === "preserve" ? "preservation" : "numeric"
    try {
      if (check.kind === "json-number") {
        const actual = pointer(JSON.parse((await readFile(await resolve(check.path))).toString("utf8")), check.pointer)
        const source = pointer(JSON.parse(sources.get(check.id)!.toString("utf8")), check.sourcePointer)
        let expected: unknown = source
        if (check.operation === "count") {
          if (!Array.isArray(source)) throw new Error("count source must be an array")
          expected = source.length
        } else if (check.operation === "sum") {
          if (!Array.isArray(source) || !source.every(finite)) throw new Error("sum source must contain only finite numbers")
          expected = source.reduce((a: number, b: number) => a + b, 0)
        }
        if (!finite(actual) || !finite(expected)) throw new Error("expected and actual values must be finite numbers")
        status = Math.abs(actual - expected) <= check.tolerance ? "passed" : "failed"
        details = `actual=${actual}, expected=${expected}, tolerance=${check.tolerance}`
      } else if (check.kind === "preserve") {
        const before = sources.get(check.id)!, after = await readFile(await resolve(check.path))
        const same = check.pattern ? JSON.stringify(tokens(before, check.pattern)) === JSON.stringify(tokens(after, check.pattern)) : before.equals(after)
        status = same ? "passed" : "failed"
        details = check.pattern ? "Protected text occurrences compared, including duplicates; meaning is not evaluated." : "Output compared with pre-execution source bytes."
      } else {
        // An exit code alone cannot certify semantic quality. The reviewer must return a verdict.
        const timeout = Math.min(check.timeoutMs ?? 30000, deadline - performance.now())
        if (timeout <= 0) throw new Error("validation deadline expired")
        const proc = Bun.spawn(check.argv.map(fill), { cwd: workDir, stdout: "pipe", stderr: "pipe" })
        let expired = false
        const timer = setTimeout(() => { expired = true; proc.kill() }, timeout)
        try {
          const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
          if (expired || code !== 0) throw new Error(expired ? "reviewer timed out" : `reviewer exited ${code}: ${stderr.slice(0, 1000)}`)
          const verdict = z.object({ status: z.enum(["passed", "failed", "unknown"]), details: z.string().min(1), usage: z.record(z.unknown()).optional() }).parse(JSON.parse(stdout))
          status = verdict.status; details = verdict.details; usage = verdict.usage
        } finally { clearTimeout(timer) }
      }
    } catch (error) { status = check.kind === "command" ? "unknown" : "failed"; details = String(error) }
    report.checks.push({ id: check.id, scope, status, details, durationMs: performance.now() - started, ...(usage ? { usage } : {}) })
    if (status !== "passed") report.diagnostics.push(`${check.id}: ${status}: ${details}`)
  }
  const statuses = [...report.artifacts, ...report.checks].map(c => c.status)
  report.status = statuses.includes("failed") ? "failed" : statuses.includes("unknown") ? "unknown" : "passed"
  return report
}
