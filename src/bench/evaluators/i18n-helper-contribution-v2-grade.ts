import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { parseDocument } from "yaml"
import { z } from "zod"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"
import {
  deriveI18nContributionSourceFacts,
  i18nHelperContributionGrade,
  type I18nContributionCandidate,
  type I18nContributionTranslationCall,
} from "./i18n-helper-contribution-grade.ts"

const SEMANTICS_PATH = "i18n-report-semantics.json"
const KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/u

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})

const ContractSchema = z.object({
  framework: z.literal("react-i18next"),
  sourceFiles: z.array(SafeRelativePathSchema).min(1),
  baselineFiles: z.record(SafeRelativePathSchema, SafeRelativePathSchema),
  report: z.object({ path: SafeRelativePathSchema }).passthrough(),
}).passthrough()

const SemanticsSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-report-semantics/v1"),
  originalTextPlaceholderSyntax: z.literal("single-brace"),
  localeInterpolationSyntax: z.literal("double-brace"),
  pluralKeyPolicy: z.literal("i18next-v4"),
}).strict()

const ReportEntrySchema = z.object({
  sourceFile: SafeRelativePathSchema,
  originalText: z.string(),
  key: z.string().regex(KEY_PATTERN),
  placeholders: z.array(z.string()).superRefine((values, context) => {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", message: "duplicate placeholders" })
  }),
  occurrences: z.number().int().positive(),
}).strict()

const ReportSchema = z.object({
  framework: z.literal("react-i18next"),
  scannedFiles: z.array(SafeRelativePathSchema),
  entries: z.array(ReportEntrySchema),
  missingKeys: z.object({
    "zh-CN": z.array(z.string()),
    "en-US": z.array(z.string()),
  }).strict(),
}).strict()

export const I18nHelperContributionV2PayloadSchema = z.object({
  schemaVersion: z.literal("skill-ir-i18n-contribution-eval/v2"),
  check: z.enum([
    "delta-policy",
    "artifact-contract",
    "extraction-coverage",
    "literal-preservation",
    "locale-semantics",
  ]),
}).strict()

type ReportEntry = z.infer<typeof ReportEntrySchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>
type RunResult = Parameters<CustomEvaluator["run"]>[0]["runResult"]

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
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right))
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

async function loadTextFiles(root: string, paths: readonly string[]): Promise<Record<string, string> | undefined> {
  const entries = await Promise.all(paths.map(async (relativePath) => {
    const text = decodeUtf8(await readSafeFile(root, relativePath))
    return text === undefined ? undefined : [relativePath, text] as const
  }))
  return entries.some((entry) => entry === undefined)
    ? undefined
    : Object.fromEntries(entries as Array<readonly [string, string]>)
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

function localePlaceholders(value: string): string[] {
  return sortedUnique([...value.matchAll(/\{\{\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\}\}/gu)].map((match) => match[1]!))
}

function reportText(candidate: I18nContributionCandidate): string {
  return candidate.placeholders.reduce(
    (text, placeholder) => text.replaceAll(`{{${placeholder}}}`, `{${placeholder}}`),
    candidate.originalText,
  )
}

function matchEntries(candidates: readonly I18nContributionCandidate[], entries: readonly ReportEntry[]): boolean {
  if (entries.length !== candidates.length) return false
  const keys = entries.map((entry) => entry.key)
  if (new Set(keys).size !== keys.length) return false
  const remaining = [...entries]
  return candidates.every((candidate) => {
    const index = remaining.findIndex((entry) =>
      entry.sourceFile === candidate.sourceFile
      && entry.originalText === reportText(candidate)
      && sameSet(entry.placeholders, candidate.placeholders)
      && entry.occurrences === candidate.occurrences
    )
    if (index < 0) return false
    remaining.splice(index, 1)
    return true
  }) && remaining.length === 0
}

function translationCallsByKey(calls: readonly I18nContributionTranslationCall[]): Map<string, I18nContributionTranslationCall[]> {
  const result = new Map<string, I18nContributionTranslationCall[]>()
  for (const call of calls) result.set(call.key, [...(result.get(call.key) ?? []), call])
  return result
}

async function loadEvidence(root: string) {
  const contract = ContractSchema.safeParse(parseStrictJson(decodeUtf8(await readSafeFile(root, "i18n-contract.json"))))
  const semantics = SemanticsSchema.safeParse(parseStrictJson(decodeUtf8(await readSafeFile(root, SEMANTICS_PATH))))
  if (!contract.success || !semantics.success) return undefined
  const baselinePaths = contract.data.sourceFiles.map((source) => contract.data.baselineFiles[source])
  if (baselinePaths.some((entry) => !entry)) return undefined
  const [baselineRaw, finalSources] = await Promise.all([
    loadTextFiles(root, baselinePaths as string[]),
    loadTextFiles(root, contract.data.sourceFiles),
  ])
  if (!baselineRaw || !finalSources) return undefined
  const baselineSources = Object.fromEntries(contract.data.sourceFiles.map((source, index) => [source, baselineRaw[baselinePaths[index]!]!]))
  const report = ReportSchema.safeParse(parseStrictJson(decodeUtf8(await readSafeFile(root, contract.data.report.path))))
  const zh = flattenLocale(parseStrictJson(decodeUtf8(await readSafeFile(root, "src/locales/zh-CN.json"))))
  const en = flattenLocale(parseStrictJson(decodeUtf8(await readSafeFile(root, "src/locales/en-US.json"))))
  return {
    contract: contract.data,
    baselineSources,
    baselineFacts: deriveI18nContributionSourceFacts(baselineSources),
    finalFacts: deriveI18nContributionSourceFacts(finalSources),
    report: report.success ? report.data : undefined,
    zh,
    en,
  }
}

function exactLocaleValues(locale: Map<string, string>, key: string): string[] | undefined {
  const value = locale.get(key)
  return value === undefined ? undefined : [value]
}

function localeValues(
  locale: Map<string, string>,
  key: string,
  candidate: I18nContributionCandidate,
  language: "zh" | "en",
): string[] | undefined {
  if (!candidate.placeholders.includes("count")) return exactLocaleValues(locale, key)
  const exact = exactLocaleValues(locale, key)
  if (exact) return exact
  const one = locale.get(`${key}_one`)
  const other = locale.get(`${key}_other`)
  if (language === "en") return one !== undefined && other !== undefined ? [one, other] : undefined
  return other !== undefined ? [...(one === undefined ? [] : [one]), other] : undefined
}

async function checkExtraction(root: string): Promise<GradeResult> {
  const evidence = await loadEvidence(root)
  if (!evidence?.report || !evidence.baselineFacts.valid || !evidence.finalFacts.valid) {
    return failing("Public source, report, or semantics evidence is unavailable.")
  }
  const baselineKeys = new Set(evidence.baselineFacts.existingTranslationCalls.map((call) => call.key))
  const callsByKey = translationCallsByKey(evidence.finalFacts.existingTranslationCalls)
  const mapped = matchEntries(evidence.baselineFacts.candidates, evidence.report.entries)
    && evidence.report.entries.every((entry) => !baselineKeys.has(entry.key))
    && evidence.report.entries.every((entry) => {
      const calls = callsByKey.get(entry.key) ?? []
      return calls.length === entry.occurrences && calls.every((call) => sameSet(call.placeholders, entry.placeholders))
    })
  return mapped && evidence.finalFacts.candidates.length === 0
    ? passing("All public source messages use report-normalized placeholders and reusable alternative-valid keys.")
    : failing("Public source messages are missing, residual, duplicated, or mapped inconsistently.")
}

async function checkLocales(root: string): Promise<GradeResult> {
  const evidence = await loadEvidence(root)
  if (!evidence?.report || !evidence.zh || !evidence.en) return failing("Public locale evidence is unavailable.")
  if (!matchEntries(evidence.baselineFacts.candidates, evidence.report.entries)) {
    return failing("Report entries do not match public source semantics.")
  }
  const localeEntriesValid = evidence.report.entries.every((entry) => {
    const candidate = evidence.baselineFacts.candidates.find((item) =>
      item.sourceFile === entry.sourceFile && reportText(item) === entry.originalText
    )
    if (!candidate) return false
    const zhValues = localeValues(evidence.zh!, entry.key, candidate, "zh")
    const enValues = localeValues(evidence.en!, entry.key, candidate, "en")
    if (!zhValues || !enValues) return false
    const zhExpected = candidate.originalText
    return zhValues.every((value) => value === zhExpected && sameSet(localePlaceholders(value), candidate.placeholders))
      && enValues.every((value) => value.trim().length > 0
        && (!/[\u3400-\u9fff]/u.test(value) || value !== zhExpected)
        && sameSet(localePlaceholders(value), candidate.placeholders))
  })
  const baselineLocales = await Promise.all((["zh-CN", "en-US"] as const).map(async (locale) => {
    const baselinePath = evidence.contract.baselineFiles[`src/locales/${locale}.json`]
    return baselinePath
      ? flattenLocale(parseStrictJson(decodeUtf8(await readSafeFile(root, baselinePath))))
      : undefined
  }))
  const preserved = baselineLocales.every((baseline, index) => baseline && [...baseline].every(([key, value]) =>
    (index === 0 ? evidence.zh : evidence.en)!.get(key) === value
  ))
  const reportConsistent = evidence.report.framework === evidence.contract.framework
    && JSON.stringify(evidence.report.scannedFiles) === JSON.stringify(evidence.contract.sourceFiles)
    && evidence.report.missingKeys["zh-CN"].length === 0
    && evidence.report.missingKeys["en-US"].length === 0
  return localeEntriesValid && preserved && reportConsistent
    ? passing("Locales satisfy public interpolation, plural-family, preservation, and report semantics.")
    : failing("Locale values, plural families, placeholders, existing translations, or report evidence are inconsistent.")
}

async function delegateFrozenV1(check: "delta-policy" | "artifact-contract" | "literal-preservation", runResult: RunResult) {
  return i18nHelperContributionGrade.run({
    criterion: {
      method: "custom",
      evaluatorId: "skill-ir-i18n-helper-contribution-v1",
      payload: { schemaVersion: "skill-ir-i18n-contribution-eval/v1", check },
    },
    runResult,
  })
}

export const i18nHelperContributionV2Grade: CustomEvaluator = {
  validatePayload(payload) {
    I18nHelperContributionV2PayloadSchema.parse(payload)
  },
  async run({ criterion, runResult }) {
    const payload = I18nHelperContributionV2PayloadSchema.safeParse(criterion.payload)
    if (!payload.success) return infrastructure("Invalid i18n contribution v2 evaluator payload.")
    try {
      const root = await realpath(runResult.workDir)
      if (!(await lstat(root)).isDirectory()) return infrastructure("I18n contribution workdir is unavailable.")
      switch (payload.data.check) {
        case "delta-policy":
        case "artifact-contract":
        case "literal-preservation":
          return await delegateFrozenV1(payload.data.check, runResult)
        case "extraction-coverage": return await checkExtraction(root)
        case "locale-semantics": return await checkLocales(root)
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe i18n contribution filesystem path.")
      return infrastructure("I18n contribution evaluator filesystem or contract failure.")
    }
  },
}

registerCustomEvaluator("skill-ir-i18n-helper-contribution-v2", i18nHelperContributionV2Grade)
