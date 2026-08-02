import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import {
  deriveZhReadmeFactsV2,
  matchesZhReadmeCommand,
  matchesZhReadmeLicense,
} from "../../benchmarks/skill-ir/zh-readme-oracle-v2.ts"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"
import { ZhReadmeGradePayloadSchema } from "./zh-readme-grade.ts"

type Payload = ReturnType<typeof ZhReadmeGradePayloadSchema.parse>
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

function markdownUrls(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/https?:\/\/[^\s)\]>]+/giu)].map((match) => match[0]))]
}

function markdownSourcePaths(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/`((?:src|docs|test|tests)\/[^`\r\n]+)`/giu)].map((match) => match[1]!))]
}

function markdownLocalLinks(markdown: string): string[] {
  const links: string[] = []
  for (const match of markdown.matchAll(/\[[^\]\r\n]+\]\(([^)\r\n]+)\)/gu)) {
    const raw = match[1]!.trim().replace(/^<|>$/gu, "")
    const destination = raw.split(/\s+["']/u, 1)[0]!.split(/[?#]/u, 1)[0]!
    if (!destination || destination.startsWith("#") || /^(?:https?:|mailto:)/iu.test(destination)) continue
    const normalized = destination.replace(/^\.\//u, "").replaceAll("\\", "/")
    links.push(normalized)
  }
  return [...new Set(links)]
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
  const artifactIntegrity = delta.status === "pass" && protectedEntries.every((entry) => entry.valid)
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
  const facts = deriveZhReadmeFactsV2(repositoryFiles)
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
  const chineseStructure = chineseCount >= 20 && headings.length >= 4
    && /安装/u.test(readme) && /快速|使用|上手/u.test(readme)
    && /开发|测试|贡献/u.test(readme) && /license|许可证|许可/iu.test(readme)

  const observedCommands = shellCommands(readme)
  const requiredRoles = [...new Set(facts.commands.map((entry) => entry.role))]
  const commandFidelity = observedCommands.every((command) => matchesZhReadmeCommand(command, facts.commands))
    && requiredRoles.every((role) => observedCommands.some((command) =>
      matchesZhReadmeCommand(command, facts.commands.filter((entry) => entry.role === role))))

  const observedUrls = markdownUrls(readme)
  const observedPaths = markdownSourcePaths(readme)
  const localLinks = markdownLocalLinks(readme)
  const pathEvidence = [...new Set([
    ...observedPaths,
    ...localLinks.filter((entry) => /^(?:src|docs|test|tests)\//u.test(entry)),
  ])]
  const referenceFidelity = observedUrls.every((entry) => facts.links.includes(entry))
    && (facts.links.length === 0 || observedUrls.length > 0)
    && pathEvidence.every((entry) => facts.paths.includes(entry))
    && (facts.paths.length === 0 || pathEvidence.length > 0)
    && localLinks.every((entry) => Object.hasOwn(repositoryFiles, entry))

  const factCompleteness = readme.toLocaleLowerCase("en-US").includes(facts.project.name.toLocaleLowerCase("en-US"))
    && (facts.project.license === undefined || matchesZhReadmeLicense(readme, facts.project.license))
    && !/\b(?:powerful|elegant|modern)\b|强大|优雅|现代化/iu.test(readme)

  return { artifactIntegrity, chineseStructure, commandFidelity, referenceFidelity, factCompleteness }
}

export const zhReadmeGradeV2: CustomEvaluator = {
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
        return state.commandFidelity ? passing("README commands satisfy bounded source-derived equivalence") : failing(state.failure ?? "README contains missing or unsupported commands")
      }
      if (parsed.data.check === "reference-fidelity") {
        return state.referenceFidelity ? passing("README links and repository paths resolve to public evidence") : failing(state.failure ?? "README contains missing or unsupported links or paths")
      }
      return state.factCompleteness ? passing("README preserves source-derived project identity and license meaning") : failing(state.failure ?? "README identity, license, or factual wording failed")
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe filesystem path in zh-readme workdir")
      return infrastructure(`zh-readme evaluator infrastructure failure: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}

registerCustomEvaluator("skill-ir-zh-readme", zhReadmeGradeV2)
