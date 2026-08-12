import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { RunResult } from "../../core/types.ts"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) =>
  !path.posix.isAbsolute(value)
  && !path.win32.isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
"path must be a safe POSIX relative path")

const PublicInterfaceSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-interface/v2"),
  outputs: z.object({
    example: SafeRelativePathSchema,
    schema: SafeRelativePathSchema,
    report: SafeRelativePathSchema,
  }).strict(),
  reportFields: z.tuple([
    z.literal("definedAndUsed"),
    z.literal("definedUnconfirmedUnused"),
    z.literal("usedUndefined"),
    z.literal("hardcodedSecrets"),
    z.literal("exposureRisks"),
  ]),
  findingForms: z.object({
    variable: z.string().min(1),
    located: z.string().min(1),
  }).strict(),
  policy: z.object({
    sensitiveNamePattern: z.string().min(1),
    integerNamePattern: z.string().min(1),
    uriNamePattern: z.string().min(1),
    clientPrefixes: z.array(z.string().min(1)).min(1),
    secretMinimumLength: z.number().int().positive(),
  }).strict(),
  semantics: z.object({
    definedAndUsed: z.string().min(1),
    definedUnconfirmedUnused: z.string().min(1),
    usedUndefined: z.string().min(1),
    hardcodedSecrets: z.string().min(1),
    exposureRisks: z.string().min(1),
    schemaRequired: z.string().min(1),
    schemaRules: z.string().min(1),
    additionalMetadata: z.string().min(1),
  }).strict(),
}).strict()

export type EnvManagerPublicInterface = z.infer<typeof PublicInterfaceSchema>

export const EnvManagerGradeV2PayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-eval/v2"),
  check: z.enum(["artifact-integrity", "environment-analysis", "artifact-consistency"]),
  interfacePath: SafeRelativePathSchema,
  protectedPaths: z.array(SafeRelativePathSchema).min(1),
}).strict()

type Payload = z.infer<typeof EnvManagerGradeV2PayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>
type FindingField = EnvManagerPublicInterface["reportFields"][number]

export type EnvironmentOracle = Record<FindingField, string[]> & {
  inventory: string[]
  schemaRules: Record<string, Record<string, unknown>>
}

function passing(details: string): GradeResult {
  return { pass: true, score: 1, details }
}

function failing(details: string): GradeResult {
  return { pass: false, score: 0, details }
}

function infrastructure(details: string): GradeResult {
  return { pass: false, score: 0, details, infraError: details }
}

function portable(value: string): string {
  return value.split(/[\\/]/).join("/")
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"))
}

function isEnvironmentFile(relativePath: string): boolean {
  return /(^|\/)\.env(?:\.[^/]+)?$/.test(relativePath) && !relativePath.endsWith(".example")
}

function parseDefinitions(content: string): string[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    return match ? [match[1]!] : []
  })
}

function collectReferences(content: string): string[] {
  const names: string[] = []
  for (const pattern of [
    /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
    /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
    /os\.environ\s*\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g,
    /os\.getenv\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g,
  ]) {
    for (const match of content.matchAll(pattern)) names.push(match[1]!)
  }
  return names
}

function collectHardcodedSecrets(relativePath: string, content: string, sensitive: RegExp): string[] {
  if (isEnvironmentFile(relativePath)) return []
  const findings: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const match = /(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']+)["']/.exec(line)
    if (match && sensitive.test(match[1]!)) findings.push(`${relativePath}:${match[1]}`)
  }
  return findings
}

export function deriveEnvironmentOracle(
  filesInput: Readonly<Record<string, string>>,
  publicInterfaceInput: EnvManagerPublicInterface,
): EnvironmentOracle {
  const publicInterface = PublicInterfaceSchema.parse(publicInterfaceInput)
  const files = new Map(Object.entries(filesInput).map(([name, content]) => [portable(name), content]))
  const sensitive = new RegExp(publicInterface.policy.sensitiveNamePattern, "i")
  const integer = new RegExp(publicInterface.policy.integerNamePattern, "i")
  const uri = new RegExp(publicInterface.policy.uriNamePattern, "i")
  const definitions = new Set<string>()
  const references = new Set<string>()
  const hardcodedSecrets: string[] = []
  const exposureRisks: string[] = []

  for (const [relativePath, content] of files) {
    if (isEnvironmentFile(relativePath)) {
      for (const name of parseDefinitions(content)) definitions.add(name)
      continue
    }
    if (Object.values(publicInterface.outputs).includes(relativePath) || relativePath === "env-audit-interface.json") continue
    for (const name of collectReferences(content)) {
      references.add(name)
      if (publicInterface.policy.clientPrefixes.some((prefix) => name.startsWith(prefix)) && sensitive.test(name)) {
        exposureRisks.push(`${relativePath}:${name}`)
      }
    }
    hardcodedSecrets.push(...collectHardcodedSecrets(relativePath, content, sensitive))
  }

  const inventory = sortedUnique([...definitions, ...references])
  const schemaRules = Object.fromEntries(inventory.map((name) => {
    const rule: Record<string, unknown> = {
      type: integer.test(name) ? "integer" : "string",
      required: references.has(name),
    }
    if (integer.test(name)) {
      rule.minimum = 1
      rule.maximum = name.endsWith("PORT") ? 65535 : 64
    }
    if (uri.test(name)) rule.format = "uri"
    if (sensitive.test(name)) {
      rule.sensitive = true
      rule.minLength = publicInterface.policy.secretMinimumLength
    }
    return [name, rule]
  }))

  return {
    definedAndUsed: sortedUnique([...definitions].filter((name) => references.has(name))),
    definedUnconfirmedUnused: sortedUnique([...definitions].filter((name) => !references.has(name))),
    usedUndefined: sortedUnique([...references].filter((name) => !definitions.has(name))),
    hardcodedSecrets: sortedUnique(hardcodedSecrets),
    exposureRisks: sortedUnique(exposureRisks),
    inventory,
    schemaRules,
  }
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function readDeclaredBytes(root: string, relativePath: string): Promise<Buffer | undefined> {
  const absolute = path.resolve(root, ...SafeRelativePathSchema.parse(relativePath).split("/"))
  if (!isContained(root, absolute)) throw new Error("declared path escapes root")
  try {
    const resolved = await realpath(absolute)
    if (!isContained(root, resolved) || !(await lstat(resolved)).isFile()) throw new Error("unsafe declared path")
    return await readFile(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

async function readDeclared(root: string, relativePath: string): Promise<string | undefined> {
  return (await readDeclaredBytes(root, relativePath))?.toString("utf8")
}

function utf16BigEndian(value: string): Buffer {
  const bytes = Buffer.from(value, "utf16le")
  for (let index = 0; index < bytes.length; index += 2) {
    const first = bytes[index]!
    bytes[index] = bytes[index + 1]!
    bytes[index + 1] = first
  }
  return bytes
}

function containsSecretBytes(content: Buffer, values: readonly string[]): boolean {
  return values.some((value) => [
    Buffer.from(value, "utf8"),
    Buffer.from(value, "utf16le"),
    utf16BigEndian(value),
  ].some((encoded) => content.includes(encoded)))
}

async function readWorkspaceFiles(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const visit = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const stat = await lstat(absolute)
      if (stat.isSymbolicLink()) throw new Error("workspace contains a filesystem link")
      if (stat.isDirectory()) await visit(absolute, relativePath)
      else if (stat.isFile()) files[relativePath] = await readFile(absolute, "utf8")
      else throw new Error("workspace contains a special file")
    }
  }
  await visit(root, "")
  return files
}

function parseFinding(entry: unknown, field: FindingField): string | undefined {
  if (typeof entry === "string") return entry
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined
  const record = entry as Record<string, unknown>
  if (field === "hardcodedSecrets" || field === "exposureRisks") {
    return typeof record.path === "string" && typeof record.name === "string"
      ? `${portable(record.path)}:${record.name}`
      : undefined
  }
  return typeof record.name === "string" ? record.name : undefined
}

function reportMatches(raw: unknown, oracle: EnvironmentOracle, publicInterface: EnvManagerPublicInterface): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false
  const record = raw as Record<string, unknown>
  return publicInterface.reportFields.every((field) =>
    Array.isArray(record[field])
    && JSON.stringify(sortedUnique(record[field].flatMap((entry) => parseFinding(entry, field) ?? [])))
      === JSON.stringify(oracle[field]))
}

function schemaMatches(raw: unknown, oracle: EnvironmentOracle): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false
  const variables = (raw as Record<string, unknown>).variables
  if (typeof variables !== "object" || variables === null || Array.isArray(variables)) return false
  const actual = variables as Record<string, unknown>
  return oracle.inventory.every((name) => {
    const rule = actual[name]
    return typeof rule === "object" && rule !== null && !Array.isArray(rule)
      && Object.entries(oracle.schemaRules[name]!).every(([key, value]) => Object.is((rule as Record<string, unknown>)[key], value))
  })
}

function exampleMatches(content: string, oracle: EnvironmentOracle): boolean {
  const variables = new Map<string, string>()
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!match) return false
    variables.set(match[1]!, match[2]!)
  }
  return oracle.inventory.every((name) => variables.has(name))
    && [...variables.entries()].every(([name, value]) =>
      !name.startsWith("TEST_ONLY_") && !value.includes("TEST_ONLY_"))
}

async function evaluate(root: string, payload: Payload, runResult: RunResult): Promise<{
  integrity: boolean
  analysis: boolean
  consistency: boolean
}> {
  const interfaceText = await readDeclared(root, payload.interfacePath)
  if (!interfaceText) throw new Error("public interface is missing")
  const publicInterface = PublicInterfaceSchema.parse(JSON.parse(interfaceText))
  const workspaceFiles = await readWorkspaceFiles(root)
  const oracle = deriveEnvironmentOracle(workspaceFiles, publicInterface)
  const reportText = await readDeclared(root, publicInterface.outputs.report)
  const schemaText = await readDeclared(root, publicInterface.outputs.schema)
  const exampleText = await readDeclared(root, publicInterface.outputs.example)
  const outputBytes = await Promise.all(Object.values(publicInterface.outputs)
    .map((relativePath) => readDeclaredBytes(root, relativePath)))
  let report: unknown
  let schema: unknown
  try {
    report = reportText ? JSON.parse(reportText) : undefined
    schema = schemaText ? JSON.parse(schemaText) : undefined
  } catch {
    report = undefined
    schema = undefined
  }
  if (!runResult.initialWorkdirManifest) throw new Error("initial workdir provenance is missing")
  const initialManifest = await readInitialWorkdirManifest({ workDir: root, reference: runResult.initialWorkdirManifest })
  const outputs = Object.values(publicInterface.outputs)
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest,
    allowedNewDirectories: [],
    requiredNewFiles: outputs,
  })
  const protectedComplete = JSON.stringify(sortedUnique(initialManifest.entries
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.path))) === JSON.stringify(sortedUnique(payload.protectedPaths))
  const secretSources = Object.entries(workspaceFiles)
    .filter(([relativePath]) => isEnvironmentFile(relativePath) || payload.protectedPaths.includes(relativePath))
    .flatMap(([, content]) => content.match(/TEST_ONLY_[A-Za-z0-9_]+/g) ?? [])
  const generatedBytes = [
    ...outputBytes.filter((content): content is Buffer => content !== undefined),
    Buffer.from(runResult.text, "utf8"),
  ]

  return {
    integrity: delta.status === "pass" && protectedComplete
      && !generatedBytes.some((content) => containsSecretBytes(content, secretSources)),
    analysis: reportMatches(report, oracle, publicInterface),
    consistency: schemaMatches(schema, oracle) && !!exampleText && exampleMatches(exampleText, oracle),
  }
}

export const envManagerGradeV2: CustomEvaluator = {
  validatePayload(payload) {
    EnvManagerGradeV2PayloadSchema.parse(payload)
  },
  async run({ criterion, runResult }) {
    const payload = EnvManagerGradeV2PayloadSchema.safeParse(criterion.payload)
    if (!payload.success) return infrastructure("Invalid env-manager v2 evaluator payload.")
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Env-manager v2 workdir is unavailable.")
      const result = await evaluate(root, payload.data, runResult)
      if (payload.data.check === "artifact-integrity") {
        return result.integrity ? passing("Protected inputs and output delta are safe.") : failing("Artifact integrity failed.")
      }
      if (payload.data.check === "environment-analysis") {
        return result.analysis ? passing("Environment analysis matches public workspace evidence.") : failing("Environment analysis is inconsistent with public workspace evidence.")
      }
      return result.consistency ? passing("Generated example and schema match public workspace evidence.") : failing("Generated example or schema is inconsistent with public workspace evidence.")
    } catch {
      return infrastructure("Env-manager v2 evaluator could not derive the public workspace contract.")
    }
  },
}

registerCustomEvaluator("skill-ir-env-manager-v2", envManagerGradeV2)
