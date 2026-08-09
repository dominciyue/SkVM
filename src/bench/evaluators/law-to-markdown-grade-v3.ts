import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { parseDocument } from "yaml"
import { z } from "zod"
import { assessWorkdirDelta, readInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"
import { PublicOutputAbiSchema, validatePublicOutputRecord } from "../public-output-abi.ts"

const SCHEMA_VERSION = "skill-ir-law-to-markdown-eval/v3"
const DOCUMENT_PATH = "document.txt"
const CONTRACT_PATH = "law-contract.json"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})

const LawContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-law-to-markdown-public-contract/v3"),
  contractId: z.literal("law-to-markdown-public-contract-v3"),
  protectedInputs: z.tuple([z.literal(DOCUMENT_PATH), z.literal(CONTRACT_PATH)]),
  outputs: z.object({
    review: SafeRelativePathSchema,
    deliverable: SafeRelativePathSchema,
  }).strict(),
  exactOutputSet: z.literal(true),
  reviewEvidence: z.object({
    openingMarker: z.literal("```json law-review-evidence"),
    closingMarker: z.literal("```"),
    blockCount: z.literal(1),
    fields: z.tuple([z.literal("inputPath"), z.literal("documentClass"), z.literal("deliverablePath")]),
    documentClasses: z.tuple([z.literal("law"), z.literal("non-law")]),
  }).strict(),
  outputAbi: PublicOutputAbiSchema,
}).passthrough()

export const LawToMarkdownGradeV3PayloadSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  check: z.enum([
    "input-and-delta",
    "classification",
    "content-fidelity",
    "structure",
    "review-evidence",
  ]),
}).strict()

type Payload = z.infer<typeof LawToMarkdownGradeV3PayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>
type DocumentClass = "law" | "non-law"

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

async function loadPublicInputs(root: string) {
  const [documentBytes, contractBytes] = await Promise.all([
    readSafeFile(root, DOCUMENT_PATH),
    readSafeFile(root, CONTRACT_PATH),
  ])
  const document = documentBytes && decodeUtf8(documentBytes)
  const contractText = contractBytes && decodeUtf8(contractBytes)
  if (document === undefined || contractText === undefined) return undefined
  const parsed = LawContractSchema.safeParse(parseStrictJson(contractText))
  if (!parsed.success) return undefined
  return { document, contract: parsed.data }
}

function deriveDocumentClass(document: string): DocumentClass | undefined {
  const lines = document.split(/\r\n?|\n/u).map((line) => line.trim()).filter(Boolean)
  const title = lines[0] ?? ""
  if (/^(?:GB[\/／]|ISO\b|IEC\b)/iu.test(title)) return "non-law"
  const hasArticle = lines.slice(1).some((line) => /^第[〇零一二三四五六七八九十百千万两0-9]+条/u.test(line))
  if (/(?:法|条例|规定)$/u.test(title) && hasArticle) return "law"
  return undefined
}

function normalizedCharacterStream(value: string): string {
  return value
    .split(/\r\n?|\n/u)
    .map((line) => line.replace(/^\s*#{1,6}\s+/u, ""))
    .join("")
    .replace(/[\s\u3000]+/gu, "")
}

function expectedHeadings(document: string): Array<{ level: number; text: string }> {
  const lines = document.split(/\r\n?|\n/u).map((line) => line.trim()).filter(Boolean)
  return lines.flatMap((line, index) => {
    if (index === 0) return [{ level: 1, text: line }]
    if (/^第[〇零一二三四五六七八九十百千万两0-9]+(?:编|分编)/u.test(line)) return [{ level: 2, text: line }]
    if (/^第[〇零一二三四五六七八九十百千万两0-9]+章/u.test(line)) return [{ level: 3, text: line }]
    if (/^第[〇零一二三四五六七八九十百千万两0-9]+节/u.test(line)) return [{ level: 4, text: line }]
    if (/^第[〇零一二三四五六七八九十百千万两0-9]+条/u.test(line)) return [{ level: 5, text: line }]
    return []
  })
}

function actualHeadings(markdown: string): Array<{ level: number; text: string }> {
  return markdown.split(/\r\n?|\n/u).flatMap((line) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/u.exec(line)
    return match ? [{ level: match[1]!.length, text: match[2]! }] : []
  })
}

function expectedEnumeratedItems(document: string): string[] {
  return document.split(/\r\n?|\n/u).flatMap((line) =>
    [...line.matchAll(/（[一二三四五六七八九十]+）[^（\r\n]+?(?=（[一二三四五六七八九十]+）|$)/gu)]
      .map((match) => match[0].trim())
  )
}

function extractReviewEvidence(
  report: string,
  openingMarker: string,
  closingMarker: string,
): Record<string, unknown> | undefined {
  const lines = report.split(/\r\n?|\n/u)
  const openings = lines.flatMap((line, index) => line.trimEnd() === openingMarker ? [index] : [])
  if (openings.length !== 1) return undefined
  const opening = openings[0]!
  const closingOffset = lines.slice(opening + 1).findIndex((line) => line.trimEnd() === closingMarker)
  if (closingOffset < 0) return undefined
  const parsed = parseStrictJson(lines.slice(opening + 1, opening + 1 + closingOffset).join("\n"))
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
  return parsed as Record<string, unknown>
}

async function checkInputAndDelta(root: string, runResult: Parameters<CustomEvaluator["run"]>[0]["runResult"]): Promise<GradeResult> {
  const inputs = await loadPublicInputs(root)
  if (!inputs || !runResult.initialWorkdirManifest) return infrastructure("Law v3 public inputs or initial workdir provenance are unavailable.")
  const documentClass = deriveDocumentClass(inputs.document)
  if (!documentClass) return failing("The document is outside the conservative public classification subset.")
  const initialManifest = await readInitialWorkdirManifest({
    workDir: root,
    reference: runResult.initialWorkdirManifest,
  })
  const requiredNewFiles = [inputs.contract.outputs.review]
  if (documentClass === "law") requiredNewFiles.push(inputs.contract.outputs.deliverable)
  const delta = await assessWorkdirDelta({
    workDir: root,
    initialManifest,
    allowedNewDirectories: ["markdown", "markdown/document"],
    requiredNewFiles,
  })
  return delta.status === "pass"
    ? passing("Protected inputs and exact public output delta are valid.")
    : failing("A protected input or exact public output delta is invalid.")
}

async function checkClassification(root: string): Promise<GradeResult> {
  const inputs = await loadPublicInputs(root)
  if (!inputs) return infrastructure("Law v3 public inputs are unavailable.")
  const documentClass = deriveDocumentClass(inputs.document)
  if (!documentClass) return failing("The document is outside the conservative public classification subset.")
  const deliverable = await readSafeFile(root, inputs.contract.outputs.deliverable)
  const valid = documentClass === "law" ? deliverable !== undefined : deliverable === undefined
  return valid
    ? passing("Deliverable presence matches the public document classification.")
    : failing("Deliverable presence contradicts the public document classification.")
}

async function checkContentFidelity(root: string): Promise<GradeResult> {
  const inputs = await loadPublicInputs(root)
  if (!inputs) return infrastructure("Law v3 public inputs are unavailable.")
  const documentClass = deriveDocumentClass(inputs.document)
  if (!documentClass) return failing("The document is outside the conservative public classification subset.")
  const deliverableBytes = await readSafeFile(root, inputs.contract.outputs.deliverable)
  if (documentClass === "non-law") {
    return deliverableBytes === undefined
      ? passing("No fidelity comparison is required for the public non-law branch.")
      : failing("A non-law input unexpectedly has a final deliverable.")
  }
  const deliverable = deliverableBytes && decodeUtf8(deliverableBytes)
  return deliverable !== undefined
    && normalizedCharacterStream(deliverable) === normalizedCharacterStream(inputs.document)
    ? passing("The legal deliverable preserves the public source character stream.")
    : failing("The legal deliverable changes or loses source characters.")
}

async function checkStructure(root: string): Promise<GradeResult> {
  const inputs = await loadPublicInputs(root)
  if (!inputs) return infrastructure("Law v3 public inputs are unavailable.")
  const documentClass = deriveDocumentClass(inputs.document)
  if (!documentClass) return failing("The document is outside the conservative public classification subset.")
  const deliverableBytes = await readSafeFile(root, inputs.contract.outputs.deliverable)
  if (documentClass === "non-law") {
    return deliverableBytes === undefined
      ? passing("No legal hierarchy is required for the public non-law branch.")
      : failing("A non-law input unexpectedly has a final deliverable.")
  }
  const deliverable = deliverableBytes && decodeUtf8(deliverableBytes)
  if (deliverable === undefined) return failing("The legal deliverable is missing or not UTF-8.")
  const lines = new Set(deliverable.split(/\r\n?|\n/u).map((line) => line.trim()).filter(Boolean))
  const valid = isDeepStrictEqual(actualHeadings(deliverable), expectedHeadings(inputs.document))
    && expectedEnumeratedItems(inputs.document).every((item) => lines.has(item))
  return valid
    ? passing("Legal hierarchy and enumerated-item layout match the public rules.")
    : failing("Legal hierarchy or enumerated-item layout violates the public rules.")
}

async function checkReviewEvidence(root: string): Promise<GradeResult> {
  const inputs = await loadPublicInputs(root)
  if (!inputs) return infrastructure("Law v3 public inputs are unavailable.")
  const documentClass = deriveDocumentClass(inputs.document)
  if (!documentClass) return failing("The document is outside the conservative public classification subset.")
  const reportBytes = await readSafeFile(root, inputs.contract.outputs.review)
  const report = reportBytes && decodeUtf8(reportBytes)
  if (report === undefined) return failing("The review report is missing or not UTF-8.")
  const evidence = extractReviewEvidence(
    report,
    inputs.contract.reviewEvidence.openingMarker,
    inputs.contract.reviewEvidence.closingMarker,
  )
  const expected = {
    inputPath: DOCUMENT_PATH,
    documentClass,
    deliverablePath: documentClass === "law" ? inputs.contract.outputs.deliverable : null,
  }
  const valid = evidence !== undefined
    && validatePublicOutputRecord(inputs.contract.outputAbi, evidence).status === "pass"
    && Object.entries(expected).every(([key, value]) => isDeepStrictEqual(evidence[key], value))
  return valid
    ? passing("Structured review evidence matches observable public facts.")
    : failing("Structured review evidence is missing or contradicts observable public facts.")
}

export const lawToMarkdownGradeV3: CustomEvaluator = {
  validatePayload(payload) {
    LawToMarkdownGradeV3PayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }) {
    const parsed = LawToMarkdownGradeV3PayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid law-to-markdown v3 evaluator payload.")
    try {
      const root = await realpath(runResult.workDir)
      if (!(await lstat(root)).isDirectory()) return infrastructure("Law-to-markdown v3 workdir is unavailable.")
      const check: Payload["check"] = parsed.data.check
      switch (check) {
        case "input-and-delta": return await checkInputAndDelta(root, runResult)
        case "classification": return await checkClassification(root)
        case "content-fidelity": return await checkContentFidelity(root)
        case "structure": return await checkStructure(root)
        case "review-evidence": return await checkReviewEvidence(root)
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe law-to-markdown v3 filesystem path.")
      return infrastructure("Law-to-markdown v3 evaluator filesystem or contract failure.")
    }
  },
}

registerCustomEvaluator("skill-ir-law-to-markdown-v3", lawToMarkdownGradeV3)
