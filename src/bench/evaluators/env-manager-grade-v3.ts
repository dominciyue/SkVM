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

const PublicInterfaceV3Schema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-interface/v3"),
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
  schemaRepresentations: z.object({
    variablesWrapper: z.string().min(1),
    jsonSchemaObject: z.string().min(1),
    sensitiveRule: z.string().min(1),
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
    protectedInputs: z.string().min(1),
  }).strict(),
}).strict()

export type EnvManagerPublicInterfaceV3 = z.infer<typeof PublicInterfaceV3Schema>

export const EnvManagerGradeV3PayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-eval/v3"),
  check: z.enum(["artifact-integrity", "environment-analysis", "artifact-consistency"]),
  interfacePath: SafeRelativePathSchema,
}).strict()

type Payload = z.infer<typeof EnvManagerGradeV3PayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>
type FindingField = EnvManagerPublicInterfaceV3["reportFields"][number]
type EnvironmentOracle = Record<FindingField, string[]> & {
  inventory: string[]
  schemaRules: Record<string, Record<string, unknown>>
}

const passing = (details: string): GradeResult => ({ pass: true, score: 1, details })
const failing = (details: string): GradeResult => ({ pass: false, score: 0, details })
const infrastructure = (details: string): GradeResult => ({ pass: false, score: 0, details, infraError: details })
const portable = (value: string): string => value.split(/[\\/]/).join("/")
const sortedUnique = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"))

function isEnvironmentFile(relativePath: string): boolean {
  return /(^|\/)\.env(?:\.[^/]+)?$/.test(relativePath) && !relativePath.endsWith(".example")
}

function deriveEnvironmentOracle(
  files: Readonly<Record<string, string>>,
  publicInterface: EnvManagerPublicInterfaceV3,
): EnvironmentOracle {
  const sensitive = new RegExp(publicInterface.policy.sensitiveNamePattern, "i")
  const integer = new RegExp(publicInterface.policy.integerNamePattern, "i")
  const uri = new RegExp(publicInterface.policy.uriNamePattern, "i")
  const definitions = new Set<string>()
  const references = new Set<string>()
  const hardcodedSecrets: string[] = []
  const exposureRisks: string[] = []

  for (const [inputPath, content] of Object.entries(files)) {
    const relativePath = portable(inputPath)
    if (isEnvironmentFile(relativePath)) {
      for (const line of content.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
        if (match) definitions.add(match[1]!)
      }
      continue
    }
    if (Object.values(publicInterface.outputs).includes(relativePath) || relativePath === "env-audit-interface.json") continue
    for (const pattern of [
      /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
      /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
      /os\.environ\s*\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g,
      /os\.getenv\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g,
    ]) {
      for (const match of content.matchAll(pattern)) {
        const name = match[1]!
        references.add(name)
        if (publicInterface.policy.clientPrefixes.some((prefix) => name.startsWith(prefix)) && sensitive.test(name)) {
          exposureRisks.push(`${relativePath}:${name}`)
        }
      }
    }
    for (const line of content.split(/\r?\n/)) {
      const match = /(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']+)["']/.exec(line)
      if (match && sensitive.test(match[1]!)) hardcodedSecrets.push(`${relativePath}:${match[1]}`)
    }
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
  return values.some((value) => [Buffer.from(value), Buffer.from(value, "utf16le"), utf16BigEndian(value)]
    .some((encoded) => content.includes(encoded)))
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

function reportMatches(raw: unknown, oracle: EnvironmentOracle, publicInterface: EnvManagerPublicInterfaceV3): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false
  const record = raw as Record<string, unknown>
  return publicInterface.reportFields.every((field) => Array.isArray(record[field])
    && JSON.stringify(sortedUnique(record[field].flatMap((entry) => parseFinding(entry, field) ?? [])))
      === JSON.stringify(oracle[field]))
}

function ruleMatches(actual: unknown, expected: Readonly<Record<string, unknown>>, required: boolean): boolean {
  if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false
  const rule = actual as Record<string, unknown>
  return Object.entries(expected).every(([key, value]) => {
    if (key === "required") return required === value
    if (key === "sensitive" && value === true) return rule.sensitive === true || rule.writeOnly === true
    return Object.is(rule[key], value)
  })
}

function schemaMatches(raw: unknown, oracle: EnvironmentOracle): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false
  const record = raw as Record<string, unknown>
  const wrapper = record.variables
  if (typeof wrapper === "object" && wrapper !== null && !Array.isArray(wrapper)) {
    return oracle.inventory.every((name) => {
      const rule = (wrapper as Record<string, unknown>)[name]
      return ruleMatches(rule, oracle.schemaRules[name]!, oracle.schemaRules[name]!.required === true)
    })
  }
  const properties = record.properties
  const required = new Set(Array.isArray(record.required)
    ? record.required.filter((name): name is string => typeof name === "string")
    : [])
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) return false
  return oracle.inventory.every((name) =>
    ruleMatches((properties as Record<string, unknown>)[name], oracle.schemaRules[name]!, required.has(name)))
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
    && [...variables.entries()].every(([name, value]) => !name.startsWith("TEST_ONLY_") && !value.includes("TEST_ONLY_"))
}

async function evaluate(root: string, payload: Payload, runResult: RunResult) {
  const interfaceBytes = await readDeclaredBytes(root, payload.interfacePath)
  if (!interfaceBytes) throw new Error("public interface is missing")
  const publicInterface = PublicInterfaceV3Schema.parse(JSON.parse(interfaceBytes.toString("utf8")))
  if (!runResult.initialWorkdirManifest) throw new Error("initial workdir provenance is missing")
  const initialManifest = await readInitialWorkdirManifest({ workDir: root, reference: runResult.initialWorkdirManifest })
  const workspaceFiles = await readWorkspaceFiles(root)
  const oracle = deriveEnvironmentOracle(workspaceFiles, publicInterface)
  const outputs = Object.values(publicInterface.outputs)
  const [reportBytes, schemaBytes, exampleBytes] = await Promise.all([
    readDeclaredBytes(root, publicInterface.outputs.report),
    readDeclaredBytes(root, publicInterface.outputs.schema),
    readDeclaredBytes(root, publicInterface.outputs.example),
  ])
  let report: unknown
  let schema: unknown
  try {
    report = reportBytes ? JSON.parse(reportBytes.toString("utf8")) : undefined
    schema = schemaBytes ? JSON.parse(schemaBytes.toString("utf8")) : undefined
  } catch {
    report = undefined
    schema = undefined
  }
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest,
    allowedNewDirectories: [],
    requiredNewFiles: outputs,
  })
  const initialFilePaths = new Set(initialManifest.entries
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.path))
  const secretSources = Object.entries(workspaceFiles)
    .filter(([relativePath]) => initialFilePaths.has(relativePath))
    .flatMap(([, content]) => content.match(/TEST_ONLY_[A-Za-z0-9_]+/g) ?? [])
  const generatedBytes = [reportBytes, schemaBytes, exampleBytes, Buffer.from(runResult.text)]
    .filter((content): content is Buffer => content !== undefined)
  return {
    integrity: delta.status === "pass" && !generatedBytes.some((content) => containsSecretBytes(content, secretSources)),
    analysis: reportMatches(report, oracle, publicInterface),
    consistency: schemaMatches(schema, oracle) && !!exampleBytes && exampleMatches(exampleBytes.toString("utf8"), oracle),
  }
}

export const envManagerGradeV3: CustomEvaluator = {
  validatePayload(payload) {
    EnvManagerGradeV3PayloadSchema.parse(payload)
  },
  async run({ criterion, runResult }) {
    const payload = EnvManagerGradeV3PayloadSchema.safeParse(criterion.payload)
    if (!payload.success) return infrastructure("Invalid env-manager v3 evaluator payload.")
    try {
      const root = await realpath(path.resolve(runResult.workDir))
      if (!(await lstat(root)).isDirectory()) return infrastructure("Env-manager v3 workdir is unavailable.")
      const result = await evaluate(root, payload.data, runResult)
      if (payload.data.check === "artifact-integrity") {
        return result.integrity ? passing("Frozen initial inputs and output delta are safe.") : failing("Artifact integrity failed.")
      }
      if (payload.data.check === "environment-analysis") {
        return result.analysis ? passing("Environment analysis matches public workspace evidence.") : failing("Environment analysis is inconsistent with public workspace evidence.")
      }
      return result.consistency ? passing("Generated example and schema match public workspace evidence.") : failing("Generated example or schema is inconsistent with public workspace evidence.")
    } catch {
      return infrastructure("Env-manager v3 evaluator could not derive the public workspace contract.")
    }
  },
}

registerCustomEvaluator("skill-ir-env-manager-v3", envManagerGradeV3)
