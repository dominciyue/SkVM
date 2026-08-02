import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { deriveZhReadmeFacts } from "../../benchmarks/skill-ir/zh-readme-oracle.ts"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}, "path must be a safe POSIX relative path")

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const ZhReadmeGradePayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-readme-eval/v1"),
  check: z.enum(["artifact-integrity", "chinese-structure", "command-fidelity", "reference-fidelity", "fact-completeness"]),
  paths: z.object({ interface: z.literal("readme-interface.json"), readme: z.literal("README.zh-CN.md") }).strict(),
  protectedSha256: z.record(SafeRelativePathSchema, Sha256Schema)
    .refine((value) => Object.keys(value).length >= 2, "at least two protected files are required"),
}).strict()

type Payload = z.infer<typeof ZhReadmeGradePayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

interface EvaluationState {
  artifactIntegrity: boolean
  chineseStructure: boolean
  commandFidelity: boolean
  referenceFidelity: boolean
  factCompleteness: boolean
  failure?: string
}

class UnsafeFilesystemPathError extends Error {}

function passing(details: string): GradeResult {
  return { pass: true, score: 1, details }
}

function failing(details: string): GradeResult {
  return { pass: false, score: 0, details }
}

function infrastructure(details: string): GradeResult {
  return { pass: false, score: 0, details, infraError: details }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function readSafeFile(root: string, relativePath: string): Promise<Buffer | undefined> {
  let current = root
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment)
    if (!isContained(root, current)) throw new UnsafeFilesystemPathError()
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink()) throw new UnsafeFilesystemPathError()
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) throw error
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }
  const resolved = await realpath(current)
  if (!isContained(root, resolved)) throw new UnsafeFilesystemPathError()
  if (!(await lstat(resolved)).isFile()) return undefined
  return readFile(resolved)
}

function decodeUtf8(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes) return undefined
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function shellCommands(markdown: string): string[] {
  const commands: string[] = []
  for (const match of markdown.matchAll(/```(?:bash|sh|shell|console)\s*\n([\s\S]*?)```/giu)) {
    for (const rawLine of match[1]!.split(/\r?\n/u)) {
      const command = rawLine.trim().replace(/^\$\s*/u, "")
      if (command && !command.startsWith("#")) commands.push(command)
    }
  }
  return [...new Set(commands)]
}

function markdownLinks(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/https?:\/\/[^\s)\]>]+/giu)].map((match) => match[0]))]
}

function markdownPaths(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/`((?:src|docs|test|tests)\/[^`\r\n]+)`/giu)].map((match) => match[1]!))]
}

function containsIgnoreCase(text: string, value: string): boolean {
  return text.toLocaleLowerCase("en-US").includes(value.toLocaleLowerCase("en-US"))
}

async function evaluateState(
  root: string,
  payload: Payload,
  manifestReference: NonNullable<Parameters<typeof readInitialWorkdirManifest>[0]["reference"]>,
): Promise<EvaluationState> {
  const initial = await readInitialWorkdirManifest({ workDir: root, reference: manifestReference })
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest: initial,
    allowedNewDirectories: [],
    requiredNewFiles: [payload.paths.readme],
  })

  const protectedEntries = await Promise.all(Object.entries(payload.protectedSha256).map(async ([relativePath, digest]) => {
    const bytes = await readSafeFile(root, relativePath)
    return { relativePath, bytes, valid: bytes !== undefined && sha256(bytes) === digest }
  }))
  const readme = decodeUtf8(await readSafeFile(root, payload.paths.readme))
  const artifactIntegrity = delta.status === "pass"
    && protectedEntries.every((entry) => entry.valid)
    && readme !== undefined
  if (!artifactIntegrity || readme === undefined) {
    return {
      artifactIntegrity,
      chineseStructure: false,
      commandFidelity: false,
      referenceFidelity: false,
      factCompleteness: false,
      failure: "protected inputs, exact output set, or README UTF-8 decoding failed",
    }
  }

  const repositoryFiles = Object.fromEntries(protectedEntries
    .filter((entry) => entry.relativePath !== payload.paths.interface && entry.bytes !== undefined)
    .map((entry) => [entry.relativePath, decodeUtf8(entry.bytes)!]))
  const facts = deriveZhReadmeFacts(repositoryFiles)
  if (facts.status !== "confirmed") {
    return {
      artifactIntegrity,
      chineseStructure: false,
      commandFidelity: false,
      referenceFidelity: false,
      factCompleteness: false,
      failure: `repository facts are unconfirmed: ${facts.reason}`,
    }
  }

  const headings = [...readme.matchAll(/^#{1,6}\s+.+$/gmu)]
  const chineseCount = (readme.match(/[\u3400-\u9fff]/gu) ?? []).length
  const chineseStructure = chineseCount >= 20
    && headings.length >= 4
    && /安装/u.test(readme)
    && /快速|使用|上手/u.test(readme)
    && /开发|测试|贡献/u.test(readme)
    && /license|许可证|许可/iu.test(readme)

  const observedCommands = shellCommands(readme)
  const expectedCommands = new Set(facts.commands.map((entry) => entry.command))
  const requiredRoles = ["installation", "quickstart", "development"] as const
  const commandFidelity = observedCommands.length > 0
    && observedCommands.every((entry) => expectedCommands.has(entry))
    && requiredRoles.every((role) => facts.commands
      .filter((entry) => entry.role === role)
      .some((entry) => observedCommands.includes(entry.command)))

  const observedLinks = markdownLinks(readme)
  const observedPaths = markdownPaths(readme)
  const referenceFidelity = observedLinks.every((entry) => facts.links.includes(entry))
    && (facts.links.length === 0 || observedLinks.length > 0)
    && observedPaths.every((entry) => facts.paths.includes(entry))
    && (facts.paths.length === 0 || observedPaths.length > 0)

  const factCompleteness = containsIgnoreCase(readme, facts.project.name)
    && (facts.project.license === undefined || containsIgnoreCase(readme, facts.project.license))
    && !/\b(?:powerful|elegant|modern)\b|强大|优雅|现代化/iu.test(readme)

  return { artifactIntegrity, chineseStructure, commandFidelity, referenceFidelity, factCompleteness }
}

export const zhReadmeGrade: CustomEvaluator = {
  validatePayload(payload: unknown): void {
    ZhReadmeGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }): Promise<GradeResult> {
    const parsed = ZhReadmeGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid zh-readme evaluator payload")
    if (!runResult.workDir) return infrastructure("Run result does not include a workdir")
    if (!runResult.initialWorkdirManifest) return infrastructure("Run result does not include initial workdir provenance")
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Run workdir is not a directory")
      const state = await evaluateState(root, parsed.data, runResult.initialWorkdirManifest)
      if (parsed.data.check === "artifact-integrity") {
        return state.artifactIntegrity ? passing("Protected repository and exact README output pass") : failing(state.failure ?? "Artifact integrity failed")
      }
      if (parsed.data.check === "chinese-structure") {
        return state.chineseStructure ? passing("Chinese README covers every public semantic role") : failing(state.failure ?? "Chinese README semantic structure failed")
      }
      if (parsed.data.check === "command-fidelity") {
        return state.commandFidelity ? passing("README commands are source-derived and cover each required role") : failing(state.failure ?? "README contains missing or unsupported commands")
      }
      if (parsed.data.check === "reference-fidelity") {
        return state.referenceFidelity ? passing("README links and repository paths are source-derived") : failing(state.failure ?? "README contains missing or unsupported links or paths")
      }
      return state.factCompleteness ? passing("README preserves source-derived project identity and license") : failing(state.failure ?? "README identity, license, or factual wording failed")
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe filesystem path in zh-readme workdir")
      return infrastructure(`zh-readme evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}

registerCustomEvaluator("skill-ir-zh-readme", zhReadmeGrade)
