import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import ts from "typescript"
import { parseDocument } from "yaml"
import { z } from "zod"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SCHEMA_VERSION = "skill-ir-i18n-helper-eval/v1"
const CONTRACT_PATH = "i18n-contract.json"
const SOURCE_PATH = "src/App.tsx"
const KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/u

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})

const I18nContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-helper-public-contract/v1"),
  contractId: z.literal("i18n-helper-react-i18next-v1"),
  framework: z.literal("react-i18next"),
  allowedModifiedFiles: z.tuple([z.literal(SOURCE_PATH)]),
  requiredNewFiles: z.tuple([
    z.literal("src/i18n.ts"),
    z.literal("src/locales/zh-CN.json"),
    z.literal("src/locales/en-US.json"),
    z.literal("i18n-report.json"),
  ]),
  protectedFiles: z.tuple([
    z.literal("package.json"),
    z.literal("tsconfig.json"),
    z.literal(CONTRACT_PATH),
  ]),
  report: z.object({
    path: z.literal("i18n-report.json"),
    requiredFields: z.tuple([
      z.literal("framework"),
      z.literal("scannedFiles"),
      z.literal("extractedKeys"),
      z.literal("missingKeys"),
    ]),
  }).strict(),
}).passthrough()

export const I18nHelperGradePayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  check: z.enum([
    "delta-policy",
    "source-transform",
    "locale-integrity",
    "interpolation",
    "report",
  ]),
}).strict()

type Payload = z.infer<typeof I18nHelperGradePayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>
type RunResult = Parameters<CustomEvaluator["run"]>[0]["runResult"]

type TranslationCall = {
  key: string
  interpolationNames: string[]
}

type SourceFacts = {
  keys: string[]
  calls: TranslationCall[]
  valid: boolean
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

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"))
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return isDeepStrictEqual(sortedUnique(left), sortedUnique(right))
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (
    !path.isAbsolute(relative)
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
  )
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
  if (!(await lstat(resolved)).isFile()) return undefined
  return readFile(resolved)
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function parseStrictJson(text: string): unknown | undefined {
  try {
    const parsed = JSON.parse(text) as unknown
    const document = parseDocument(text, { schema: "json", uniqueKeys: true })
    if (document.errors.length > 0) return undefined
    document.toJS({ maxAliasCount: 0 })
    return parsed
  } catch {
    return undefined
  }
}

async function loadContract(root: string) {
  const bytes = await readSafeFile(root, CONTRACT_PATH)
  const text = bytes && decodeUtf8(bytes)
  if (text === undefined) return undefined
  const parsed = I18nContractSchema.safeParse(parseStrictJson(text))
  return parsed.success ? parsed.data : undefined
}

function stringLiteralValue(node: ts.Expression | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined
}

function interpolationNames(argument: ts.Expression | undefined): string[] | undefined {
  if (argument === undefined) return []
  if (!ts.isObjectLiteralExpression(argument)) return undefined
  const names: string[] = []
  for (const property of argument.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      names.push(property.name.text)
      continue
    }
    if (ts.isPropertyAssignment(property)) {
      const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : undefined
      if (!name || !ts.isIdentifier(property.initializer)) return undefined
      names.push(name)
      continue
    }
    return undefined
  }
  return sortedUnique(names)
}

function translationCall(node: ts.Node): TranslationCall | undefined {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "t") return undefined
  const key = stringLiteralValue(node.arguments[0])
  const names = interpolationNames(node.arguments[1])
  if (!key || names === undefined || node.arguments.length > 2) return undefined
  return { key, interpolationNames: names }
}

function markerKey(opening: ts.JsxOpeningLikeElement): string | undefined {
  const attribute = opening.attributes.properties.find((property) =>
    ts.isJsxAttribute(property)
    && ts.isIdentifier(property.name)
    && property.name.text === "data-i18n-key"
  )
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return undefined
  return ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined
}

function inspectSource(source: string): SourceFacts {
  const file = ts.createSourceFile(SOURCE_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const parseDiagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
  if (parseDiagnostics.length > 0) return { keys: [], calls: [], valid: false }
  const keys: string[] = []
  const calls: TranslationCall[] = []
  let valid = true
  let hasReactI18nextImport = false
  let hasUseTranslationCall = false

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node)
      && stringLiteralValue(node.moduleSpecifier) === "react-i18next"
      && node.importClause?.namedBindings
      && ts.isNamedImports(node.importClause.namedBindings)
      && node.importClause.namedBindings.elements.some((element) => element.name.text === "useTranslation")
    ) {
      hasReactI18nextImport = true
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useTranslation") {
      hasUseTranslationCall = true
    }
    if (ts.isJsxElement(node)) {
      const key = markerKey(node.openingElement)
      if (key !== undefined) {
        keys.push(key)
        if (!KEY_PATTERN.test(key)) valid = false
        const significantChildren = node.children.filter((child) =>
          !(ts.isJsxText(child) && child.text.trim().length === 0)
        )
        if (significantChildren.length !== 1 || !ts.isJsxExpression(significantChildren[0]!)) {
          valid = false
        } else {
          const call = significantChildren[0]!.expression && translationCall(significantChildren[0]!.expression)
          if (!call || call.key !== key) valid = false
          else calls.push(call)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)

  const callKeys = calls.map((call) => call.key)
  if (
    keys.length === 0
    || new Set(keys).size !== keys.length
    || !sameSet(keys, callKeys)
    || !hasReactI18nextImport
    || !hasUseTranslationCall
  ) {
    valid = false
  }
  return { keys: sortedUnique(keys), calls, valid }
}

function inspectSetup(source: string): boolean {
  const file = ts.createSourceFile("src/i18n.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const parseDiagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
  if (parseDiagnostics.length > 0) return false
  let i18nName: string | undefined
  let initPluginName: string | undefined
  let hasZhLocale = false
  let hasEnLocale = false
  let hasInitialization = false

  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const moduleName = stringLiteralValue(statement.moduleSpecifier)
    if (moduleName === "i18next" && statement.importClause?.name) {
      i18nName = statement.importClause.name.text
    }
    if (
      moduleName === "react-i18next"
      && statement.importClause?.namedBindings
      && ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const imported = statement.importClause.namedBindings.elements.find((element) =>
        (element.propertyName?.text ?? element.name.text) === "initReactI18next"
      )
      initPluginName = imported?.name.text
    }
    if (moduleName === "./locales/zh-CN.json" && statement.importClause?.name) hasZhLocale = true
    if (moduleName === "./locales/en-US.json" && statement.importClause?.name) hasEnLocale = true
  }

  const visit = (node: ts.Node): void => {
    if (
      i18nName
      && initPluginName
      && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "init"
      && ts.isCallExpression(node.expression.expression)
    ) {
      const useCall = node.expression.expression
      if (
        ts.isPropertyAccessExpression(useCall.expression)
        && useCall.expression.name.text === "use"
        && ts.isIdentifier(useCall.expression.expression)
        && useCall.expression.expression.text === i18nName
        && useCall.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === initPluginName)
        && node.arguments.length >= 1
      ) {
        hasInitialization = true
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return Boolean(i18nName && initPluginName && hasZhLocale && hasEnLocale && hasInitialization)
}

function flattenLocale(value: unknown, prefix = "", entries = new Map<string, string>()): Map<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  for (const [key, child] of Object.entries(value)) {
    const qualified = prefix ? `${prefix}.${key}` : key
    if (typeof child === "string") {
      if (!KEY_PATTERN.test(qualified) || child.length === 0 || entries.has(qualified)) return undefined
      entries.set(qualified, child)
    } else if (child && typeof child === "object" && !Array.isArray(child)) {
      if (!flattenLocale(child, qualified, entries)) return undefined
    } else {
      return undefined
    }
  }
  return entries
}

function placeholders(value: string): string[] {
  return sortedUnique([...value.matchAll(/\{\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}\}/gu)].map((match) => match[1]!))
}

async function loadOutputFacts(root: string) {
  const sourceBytes = await readSafeFile(root, SOURCE_PATH)
  const setupBytes = await readSafeFile(root, "src/i18n.ts")
  const zhBytes = await readSafeFile(root, "src/locales/zh-CN.json")
  const enBytes = await readSafeFile(root, "src/locales/en-US.json")
  const source = sourceBytes && decodeUtf8(sourceBytes)
  const setup = setupBytes && decodeUtf8(setupBytes)
  const zhText = zhBytes && decodeUtf8(zhBytes)
  const enText = enBytes && decodeUtf8(enBytes)
  if ([source, setup, zhText, enText].some((value) => value === undefined)) return undefined
  const zh = flattenLocale(parseStrictJson(zhText!))
  const en = flattenLocale(parseStrictJson(enText!))
  if (!zh || !en) return undefined
  return { source: inspectSource(source!), setup: setup!, zh, en }
}

async function checkDelta(root: string, runResult: RunResult): Promise<GradeResult> {
  const contract = await loadContract(root)
  if (!contract || !runResult.initialWorkdirManifest) {
    return infrastructure("I18n public contract or initial workdir provenance is unavailable.")
  }
  const initialManifest = await readInitialWorkdirManifest({
    workDir: root,
    reference: runResult.initialWorkdirManifest,
  })
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest,
    allowedNewDirectories: ["src/locales"],
    requiredNewFiles: [...contract.requiredNewFiles],
    allowedModifiedFiles: [...contract.allowedModifiedFiles],
  })
  return delta.status === "pass"
    ? passing("Only the public source modification and required outputs are present.")
    : failing("The workdir delta violates the public i18n contract.")
}

async function checkSource(root: string): Promise<GradeResult> {
  const facts = await loadOutputFacts(root)
  if (!facts) return failing("Required i18n source or locale output is missing or invalid.")
  const setupValid = inspectSetup(facts.setup)
  return facts.source.valid && setupValid
    ? passing("Marker-derived t() calls and the i18next setup are structurally valid.")
    : failing("The source retains confirmed text, changes a marker key, or lacks a public i18next setup.")
}

async function checkLocales(root: string): Promise<GradeResult> {
  const facts = await loadOutputFacts(root)
  if (!facts) return failing("Required i18n source or locale output is missing or invalid.")
  const valid = sameSet(facts.source.keys, [...facts.zh.keys()])
    && sameSet(facts.source.keys, [...facts.en.keys()])
  return valid
    ? passing("Both locales contain exactly the marker-derived key set.")
    : failing("Locale keys are missing, extra, malformed, or inconsistent with public markers.")
}

async function checkInterpolation(root: string): Promise<GradeResult> {
  const facts = await loadOutputFacts(root)
  if (!facts) return failing("Required i18n source or locale output is missing or invalid.")
  const calls = new Map(facts.source.calls.map((call) => [call.key, call.interpolationNames]))
  const valid = facts.source.keys.every((key) => {
    const zh = facts.zh.get(key)
    const en = facts.en.get(key)
    const names = calls.get(key)
    return zh !== undefined && en !== undefined && names !== undefined
      && sameSet(placeholders(zh), names)
      && sameSet(placeholders(en), names)
  })
  return valid
    ? passing("Locale placeholders and t() interpolation arguments agree.")
    : failing("A locale placeholder or t() interpolation argument is missing or inconsistent.")
}

async function checkReport(root: string): Promise<GradeResult> {
  const contract = await loadContract(root)
  const facts = await loadOutputFacts(root)
  if (!contract || !facts) return failing("Public i18n outputs are unavailable.")
  const reportBytes = await readSafeFile(root, contract.report.path)
  const reportText = reportBytes && decodeUtf8(reportBytes)
  const report = reportText && parseStrictJson(reportText)
  if (!report || typeof report !== "object" || Array.isArray(report)) return failing("The i18n report is not strict JSON.")
  const value = report as Record<string, unknown>
  const valid = value.framework === contract.framework
    && isDeepStrictEqual(value.scannedFiles, [SOURCE_PATH])
    && isDeepStrictEqual(value.extractedKeys, facts.source.keys)
    && isDeepStrictEqual(value.missingKeys, [])
  return valid
    ? passing("The public report matches observable source and locale facts.")
    : failing("The public report contradicts observable source or locale facts.")
}

export const i18nHelperGrade: CustomEvaluator = {
  validatePayload(payload) {
    I18nHelperGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }) {
    const parsed = I18nHelperGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid i18n-helper evaluator payload.")
    try {
      const root = await realpath(runResult.workDir)
      if (!(await lstat(root)).isDirectory()) return infrastructure("I18n-helper workdir is unavailable.")
      const check: Payload["check"] = parsed.data.check
      switch (check) {
        case "delta-policy": return await checkDelta(root, runResult)
        case "source-transform": return await checkSource(root)
        case "locale-integrity": return await checkLocales(root)
        case "interpolation": return await checkInterpolation(root)
        case "report": return await checkReport(root)
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe i18n-helper filesystem path.")
      return infrastructure("I18n-helper evaluator filesystem or contract failure.")
    }
  },
}

registerCustomEvaluator("skill-ir-i18n-helper", i18nHelperGrade)
