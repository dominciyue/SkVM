import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { parseDocument } from "yaml"
import { z } from "zod"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"
import {
  PublicOutputAbiV2Schema,
  validatePublicOutputRecordV2,
} from "../public-output-abi-v2.ts"

export type I18nContributionCandidate = {
  sourceFile: string
  originalText: string
  placeholders: string[]
  occurrences: number
}

export type I18nContributionTranslationCall = {
  key: string
  placeholders: string[]
}

export type I18nContributionSourceFacts = {
  candidates: I18nContributionCandidate[]
  existingTranslationCalls: I18nContributionTranslationCall[]
  preservedLiterals: string[]
  valid: boolean
}

const USER_VISIBLE_ATTRIBUTES = new Set(["aria-label", "placeholder", "title"])
const TECHNICAL_LITERAL = /^(?:API|HTTP|HTTPS|SDK)$/u
const KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/u
const CONTRACT_PATH = "i18n-contract.json"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})

const ContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-contribution-public-contract/v1"),
  contractId: z.literal("i18n-helper-contribution-identifiable-v1"),
  framework: z.literal("react-i18next"),
  sourceFiles: z.array(SafeRelativePathSchema).min(1),
  baselineFiles: z.record(SafeRelativePathSchema, SafeRelativePathSchema),
  allowedModifiedFiles: z.array(SafeRelativePathSchema).min(1),
  requiredOutputFiles: z.array(SafeRelativePathSchema).min(1),
  protectedFiles: z.array(SafeRelativePathSchema).min(1),
  keyPolicy: z.string().min(1),
  report: z.object({ path: SafeRelativePathSchema }).strict(),
  outputAbi: PublicOutputAbiV2Schema,
}).strict().superRefine((contract, context) => {
  const unique = (values: readonly string[]) => new Set(values).size === values.length
  if (!unique(contract.sourceFiles) || !unique(contract.allowedModifiedFiles) || !unique(contract.requiredOutputFiles)) {
    context.addIssue({ code: "custom", message: "contract file lists must be unique" })
  }
  if (contract.sourceFiles.some((source) => !contract.baselineFiles[source])) {
    context.addIssue({ code: "custom", message: "every source file requires a public baseline" })
  }
})

export const I18nHelperContributionPayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-contribution-eval/v1"),
  check: z.enum([
    "delta-policy",
    "artifact-contract",
    "extraction-coverage",
    "literal-preservation",
    "locale-semantics",
  ]),
}).strict()

type Contract = z.infer<typeof ContractSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>
type RunResult = Parameters<CustomEvaluator["run"]>[0]["runResult"]

type ReportEntry = I18nContributionCandidate & { key: string }
type Report = {
  framework: string
  scannedFiles: string[]
  entries: ReportEntry[]
  missingKeys: { "zh-CN": string[]; "en-US": string[] }
}

class UnsafeFilesystemPathError extends Error {}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"))
}

function literalText(node: ts.Node | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined
}

function callPlaceholders(argument: ts.Expression | undefined): string[] | undefined {
  if (!argument) return []
  if (!ts.isObjectLiteralExpression(argument)) return undefined
  const names: string[] = []
  for (const property of argument.properties) {
    if (ts.isShorthandPropertyAssignment(property)) names.push(property.name.text)
    else if (ts.isPropertyAssignment(property)) {
      const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : undefined
      if (!name) return undefined
      names.push(name)
    } else return undefined
  }
  return sortedUnique(names)
}

function translationCall(node: ts.Node): I18nContributionTranslationCall | undefined {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "t") return undefined
  const key = literalText(node.arguments[0])
  const placeholders = callPlaceholders(node.arguments[1])
  return key && placeholders ? { key, placeholders } : undefined
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim()
}

function candidateFromChildren(children: ts.NodeArray<ts.JsxChild>): Omit<I18nContributionCandidate, "sourceFile" | "occurrences"> | undefined {
  const significant = children.filter((child) => !(ts.isJsxText(child) && normalizedText(child.text).length === 0))
  if (significant.length === 0 || significant.some((child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))) {
    return undefined
  }
  const placeholders: string[] = []
  let text = ""
  for (const child of significant) {
    if (ts.isJsxText(child)) {
      text += child.text.replace(/\s+/gu, " ")
      continue
    }
    if (!ts.isJsxExpression(child) || !child.expression || !ts.isIdentifier(child.expression)) return undefined
    placeholders.push(child.expression.text)
    text += `{{${child.expression.text}}}`
  }
  const originalText = normalizedText(text)
  if (!originalText || TECHNICAL_LITERAL.test(originalText)) return undefined
  return { originalText, placeholders: sortedUnique(placeholders) }
}

function attributeText(attribute: ts.JsxAttribute): string | undefined {
  return attribute.initializer && ts.isStringLiteral(attribute.initializer)
    ? normalizedText(attribute.initializer.text)
    : undefined
}

export function deriveI18nContributionSourceFacts(
  sources: Record<string, string>,
): I18nContributionSourceFacts {
  const candidateBySignature = new Map<string, I18nContributionCandidate>()
  const existingTranslationCalls: I18nContributionTranslationCall[] = []
  const preservedLiterals: string[] = []
  let valid = true

  const addCandidate = (
    sourceFile: string,
    candidate: Omit<I18nContributionCandidate, "sourceFile" | "occurrences">,
  ) => {
    const signature = `${candidate.originalText}\u0000${candidate.placeholders.join("\u0000")}`
    const current = candidateBySignature.get(signature)
    if (current) current.occurrences += 1
    else candidateBySignature.set(signature, { sourceFile, ...candidate, occurrences: 1 })
  }

  for (const [sourceFile, source] of Object.entries(sources)) {
    const file = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const diagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
    if (diagnostics.length > 0) valid = false

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        const moduleName = literalText(node.moduleSpecifier)
        if (moduleName) preservedLiterals.push(moduleName)
      }
      const call = translationCall(node)
      if (call) existingTranslationCalls.push(call)
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "console"
      ) {
        for (const argument of node.arguments) {
          const value = literalText(argument)
          if (value) preservedLiterals.push(value)
        }
      }
      if (ts.isJsxElement(node)) {
        const childCandidate = candidateFromChildren(node.children)
        if (childCandidate) {
          if (TECHNICAL_LITERAL.test(childCandidate.originalText)) preservedLiterals.push(childCandidate.originalText)
          else addCandidate(sourceFile, childCandidate)
        } else {
          for (const child of node.children) {
            if (ts.isJsxText(child)) {
              const value = normalizedText(child.text)
              if (TECHNICAL_LITERAL.test(value)) preservedLiterals.push(value)
            }
          }
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        for (const property of node.attributes.properties) {
          if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue
          const value = attributeText(property)
          if (!value) continue
          if (USER_VISIBLE_ATTRIBUTES.has(property.name.text) && !TECHNICAL_LITERAL.test(value)) {
            addCandidate(sourceFile, { originalText: value, placeholders: [] })
          } else {
            preservedLiterals.push(value)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }

  return {
    candidates: [...candidateBySignature.values()],
    existingTranslationCalls,
    preservedLiterals: sortedUnique(preservedLiterals),
    valid,
  }
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

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function readSafeFile(root: string, relativePath: string): Promise<Buffer | undefined> {
  const safePath = SafeRelativePathSchema.parse(relativePath)
  let current = root
  for (const segment of safePath.split("/")) {
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
  return (await lstat(resolved)).isFile() ? readFile(resolved) : undefined
}

function decodeUtf8(bytes: Uint8Array | undefined): string | undefined {
  if (!bytes) return undefined
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function parseStrictJson(text: string | undefined): unknown | undefined {
  if (text === undefined) return undefined
  try {
    const value = JSON.parse(text) as unknown
    const document = parseDocument(text, { schema: "json", uniqueKeys: true })
    if (document.errors.length > 0) return undefined
    document.toJS({ maxAliasCount: 0 })
    return value
  } catch {
    return undefined
  }
}

async function loadContract(root: string): Promise<Contract | undefined> {
  const parsed = ContractSchema.safeParse(parseStrictJson(decodeUtf8(await readSafeFile(root, CONTRACT_PATH))))
  return parsed.success ? parsed.data : undefined
}

async function loadSources(root: string, paths: readonly string[]): Promise<Record<string, string> | undefined> {
  const entries = await Promise.all(paths.map(async (relativePath) => {
    const text = decodeUtf8(await readSafeFile(root, relativePath))
    return text === undefined ? undefined : [relativePath, text] as const
  }))
  return entries.some((entry) => entry === undefined)
    ? undefined
    : Object.fromEntries(entries as Array<readonly [string, string]>)
}

function inspectSetup(source: string): boolean {
  const file = ts.createSourceFile("src/i18n.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
  if (diagnostics.length > 0) return false
  let i18nName: string | undefined
  let pluginName: string | undefined
  let hasZh = false
  let hasEn = false
  let initialized = false
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const moduleName = literalText(statement.moduleSpecifier)
    if (moduleName === "i18next" && statement.importClause?.name) i18nName = statement.importClause.name.text
    if (
      moduleName === "react-i18next"
      && statement.importClause?.namedBindings
      && ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const imported = statement.importClause.namedBindings.elements.find((element) =>
        (element.propertyName?.text ?? element.name.text) === "initReactI18next"
      )
      pluginName = imported?.name.text
    }
    if (moduleName === "./locales/zh-CN.json") hasZh = true
    if (moduleName === "./locales/en-US.json") hasEn = true
  }
  const visit = (node: ts.Node): void => {
    if (
      i18nName && pluginName
      && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "init"
      && ts.isCallExpression(node.expression.expression)
    ) {
      const useCall = node.expression.expression
      initialized = Boolean(
        ts.isPropertyAccessExpression(useCall.expression)
        && useCall.expression.name.text === "use"
        && ts.isIdentifier(useCall.expression.expression)
        && useCall.expression.expression.text === i18nName
        && useCall.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === pluginName)
        && node.arguments.length > 0
      ) || initialized
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return Boolean(i18nName && pluginName && hasZh && hasEn && initialized)
}

function flattenLocale(value: unknown, prefix = "", result = new Map<string, string>()): Map<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  for (const [name, child] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (typeof child === "string") {
      if (!KEY_PATTERN.test(key) || child.length === 0 || result.has(key)) return undefined
      result.set(key, child)
    } else if (!flattenLocale(child, key, result)) return undefined
  }
  return result
}

function placeholders(value: string): string[] {
  return sortedUnique([...value.matchAll(/\{\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}\}/gu)].map((match) => match[1]!))
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right))
}

function countOccurrences(text: string, literal: string): number {
  return literal.length === 0 ? 0 : text.split(literal).length - 1
}

async function loadEvidence(root: string) {
  const contract = await loadContract(root)
  if (!contract) return undefined
  const baselinePaths = contract.sourceFiles.map((source) => contract.baselineFiles[source]!)
  const [baselineRaw, finalSources] = await Promise.all([
    loadSources(root, baselinePaths),
    loadSources(root, contract.sourceFiles),
  ])
  if (!baselineRaw || !finalSources) return undefined
  const baselineSources = Object.fromEntries(contract.sourceFiles.map((source, index) => [source, baselineRaw[baselinePaths[index]!]!]))
  const setup = decodeUtf8(await readSafeFile(root, "src/i18n.ts"))
  const zhText = decodeUtf8(await readSafeFile(root, "src/locales/zh-CN.json"))
  const enText = decodeUtf8(await readSafeFile(root, "src/locales/en-US.json"))
  const reportValue = parseStrictJson(decodeUtf8(await readSafeFile(root, contract.report.path)))
  const zh = flattenLocale(parseStrictJson(zhText))
  const en = flattenLocale(parseStrictJson(enText))
  return {
    contract,
    baselineSources,
    finalSources,
    baselineFacts: deriveI18nContributionSourceFacts(baselineSources),
    finalFacts: deriveI18nContributionSourceFacts(finalSources),
    setup,
    zh,
    en,
    reportValue,
  }
}

function reportEntries(value: unknown): ReportEntry[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const entries = (value as Record<string, unknown>).entries
  return Array.isArray(entries) ? entries as ReportEntry[] : undefined
}

function matchEntries(candidates: readonly I18nContributionCandidate[], entries: readonly ReportEntry[]): boolean {
  if (entries.length !== candidates.length) return false
  const keys = entries.map((entry) => entry.key)
  if (new Set(keys).size !== keys.length || keys.some((key) => !KEY_PATTERN.test(key))) return false
  const remaining = [...entries]
  return candidates.every((candidate) => {
    const index = remaining.findIndex((entry) =>
      entry.sourceFile === candidate.sourceFile
      && entry.originalText === candidate.originalText
      && sameSet(entry.placeholders, candidate.placeholders)
      && entry.occurrences === candidate.occurrences
    )
    if (index < 0) return false
    remaining.splice(index, 1)
    return true
  }) && remaining.length === 0
}

async function checkDelta(root: string, runResult: RunResult): Promise<GradeResult> {
  const contract = await loadContract(root)
  if (!contract || !runResult.initialWorkdirManifest) return infrastructure("Public contract or initial manifest is unavailable.")
  const initialManifest = await readInitialWorkdirManifest({ workDir: root, reference: runResult.initialWorkdirManifest })
  const initialPaths = new Set(initialManifest.entries.map((entry) => entry.path))
  const requiredNewFiles = contract.requiredOutputFiles.filter((entry) => !initialPaths.has(entry))
  const allowedNewDirectories = sortedUnique(requiredNewFiles.flatMap((entry) => {
    const segments = entry.split("/").slice(0, -1)
    return segments.map((_, index) => segments.slice(0, index + 1).join("/")).filter((dir) => !initialPaths.has(dir))
  }))
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest,
    allowedNewDirectories,
    requiredNewFiles,
    allowedModifiedFiles: contract.allowedModifiedFiles,
  })
  return delta.status === "pass" ? passing("Workdir changes match the public contract.") : failing("Workdir delta violates the public contract.")
}

async function checkArtifact(root: string): Promise<GradeResult> {
  const evidence = await loadEvidence(root)
  if (!evidence || !evidence.setup || !evidence.zh || !evidence.en || !evidence.reportValue) {
    return failing("Required i18n artifacts are missing or invalid.")
  }
  const valid = inspectSetup(evidence.setup)
    && validatePublicOutputRecordV2(evidence.contract.outputAbi, evidence.reportValue).status === "pass"
  return valid ? passing("Artifacts satisfy the public ABI and i18next setup contract.") : failing("Artifact ABI or setup is invalid.")
}

async function checkExtraction(root: string): Promise<GradeResult> {
  const evidence = await loadEvidence(root)
  const entries = evidence && reportEntries(evidence.reportValue)
  if (!evidence || !entries || !evidence.baselineFacts.valid || !evidence.finalFacts.valid) return failing("Source evidence is unavailable.")
  const baselineKeys = new Set(evidence.baselineFacts.existingTranslationCalls.map((call) => call.key))
  const callsByKey = new Map<string, I18nContributionTranslationCall[]>()
  for (const call of evidence.finalFacts.existingTranslationCalls) {
    callsByKey.set(call.key, [...(callsByKey.get(call.key) ?? []), call])
  }
  const mapped = matchEntries(evidence.baselineFacts.candidates, entries)
    && entries.every((entry) => !baselineKeys.has(entry.key))
    && entries.every((entry) => {
      const calls = callsByKey.get(entry.key) ?? []
      return calls.length === entry.occurrences && calls.every((call) => sameSet(call.placeholders, entry.placeholders))
    })
  return mapped && evidence.finalFacts.candidates.length === 0
    ? passing("All source-derived messages are extracted with reusable alternative-valid keys.")
    : failing("Source-derived messages are missing, residual, duplicated, or mapped inconsistently.")
}

async function checkPreservation(root: string): Promise<GradeResult> {
  const evidence = await loadEvidence(root)
  if (!evidence) return failing("Source evidence is unavailable.")
  const allFinal = Object.values(evidence.finalSources).join("\n")
  const allBaseline = Object.values(evidence.baselineSources).join("\n")
  const literalsPreserved = evidence.baselineFacts.preservedLiterals.every((literal) =>
    countOccurrences(allFinal, literal) >= countOccurrences(allBaseline, literal)
  )
  const finalCalls = evidence.finalFacts.existingTranslationCalls
  const existingCallsPreserved = evidence.baselineFacts.existingTranslationCalls.every((expected) =>
    finalCalls.some((actual) => actual.key === expected.key && sameSet(actual.placeholders, expected.placeholders))
  )
  return literalsPreserved && existingCallsPreserved
    ? passing("Protected technical literals, routes, and existing translations remain observable.")
    : failing("A protected literal or existing translation call was removed or changed.")
}

async function checkLocales(root: string): Promise<GradeResult> {
  const evidence = await loadEvidence(root)
  const entries = evidence && reportEntries(evidence.reportValue)
  if (!evidence || !entries || !evidence.zh || !evidence.en) return failing("Locale evidence is unavailable.")
  const candidateByText = new Map(evidence.baselineFacts.candidates.map((candidate) => [candidate.originalText, candidate]))
  const localeEntriesValid = matchEntries(evidence.baselineFacts.candidates, entries) && entries.every((entry) => {
    const candidate = candidateByText.get(entry.originalText)
    const zh = evidence.zh!.get(entry.key)
    const en = evidence.en!.get(entry.key)
    return candidate !== undefined && zh === candidate.originalText && en !== undefined && en.trim().length > 0
      && (!/[\u3400-\u9fff]/u.test(zh) || en !== zh)
      && sameSet(placeholders(zh), candidate.placeholders)
      && sameSet(placeholders(en), candidate.placeholders)
  })
  const baselineLocales = await Promise.all((["zh-CN", "en-US"] as const).map(async (locale) => {
    const baselinePath = evidence.contract.baselineFiles[`src/locales/${locale}.json`]!
    return flattenLocale(parseStrictJson(decodeUtf8(await readSafeFile(root, baselinePath))))
  }))
  const preserved = baselineLocales.every((baseline, index) => baseline && [...baseline].every(([key, value]) =>
    (index === 0 ? evidence.zh : evidence.en)!.get(key) === value
  ))
  const report = evidence.reportValue as Report
  const reportConsistent = report.framework === evidence.contract.framework
    && JSON.stringify(report.scannedFiles) === JSON.stringify(evidence.contract.sourceFiles)
    && report.missingKeys["zh-CN"].length === 0
    && report.missingKeys["en-US"].length === 0
  return localeEntriesValid && preserved && reportConsistent
    ? passing("Locales preserve public source semantics, placeholders, and existing translations.")
    : failing("Locale values, placeholders, existing translations, or report evidence are inconsistent.")
}

export const i18nHelperContributionGrade: CustomEvaluator = {
  validatePayload(payload) {
    I18nHelperContributionPayloadSchema.parse(payload)
  },
  async run({ criterion, runResult }) {
    const payload = I18nHelperContributionPayloadSchema.safeParse(criterion.payload)
    if (!payload.success) return infrastructure("Invalid i18n contribution evaluator payload.")
    try {
      const root = await realpath(runResult.workDir)
      if (!(await lstat(root)).isDirectory()) return infrastructure("I18n contribution workdir is unavailable.")
      switch (payload.data.check) {
        case "delta-policy": return await checkDelta(root, runResult)
        case "artifact-contract": return await checkArtifact(root)
        case "extraction-coverage": return await checkExtraction(root)
        case "literal-preservation": return await checkPreservation(root)
        case "locale-semantics": return await checkLocales(root)
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe i18n contribution filesystem path.")
      return infrastructure("I18n contribution evaluator filesystem or contract failure.")
    }
  },
}

registerCustomEvaluator("skill-ir-i18n-helper-contribution-v1", i18nHelperContributionGrade)
