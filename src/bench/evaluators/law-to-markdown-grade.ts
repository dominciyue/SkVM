import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { CustomEvaluator } from "../../framework/types.ts"
import { registerCustomEvaluator } from "../../framework/types.ts"

const SCHEMA_VERSION = "skill-ir-law-to-markdown-eval/v1"
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  if (value.includes("\\")) return false
  const segments = value.split("/")
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})

const HeadingSchema = z.object({
  level: z.number().int().min(1).max(6),
  text: z.string().min(1),
}).strict()

export const LawToMarkdownGradePayloadSchema = z.discriminatedUnion("check", [
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("protected-file"),
    path: SafeRelativePathSchema,
    content: z.string(),
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("artifact-policy"),
    required: z.array(SafeRelativePathSchema),
    forbidden: z.array(SafeRelativePathSchema),
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("content-fidelity"),
    inputPath: SafeRelativePathSchema,
    outputPath: SafeRelativePathSchema,
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("heading-structure"),
    path: SafeRelativePathSchema,
    headings: z.array(HeadingSchema).min(1),
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("line-layout"),
    path: SafeRelativePathSchema,
    requiredStandaloneLines: z.array(z.string().min(1)).min(1),
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("review-outcome"),
    path: SafeRelativePathSchema,
    outcome: z.enum(["approved", "rejected-non-law"]),
  }).strict(),
  z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    check: z.literal("report-source"),
    path: SafeRelativePathSchema,
    sourceName: z.string().min(1).refine((value) => !value.includes("/") && !value.includes("\\")),
  }).strict(),
])

type Payload = z.infer<typeof LawToMarkdownGradePayloadSchema>
type GradeResult = Awaited<ReturnType<CustomEvaluator["run"]>>

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
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

async function readSafeFile(root: string, relativePath: string): Promise<string | undefined> {
  const candidate = path.join(root, ...relativePath.split("/"))
  if (!isContained(root, candidate)) throw new UnsafeFilesystemPathError()
  try {
    await lstat(candidate)
    const resolved = await realpath(candidate)
    if (!isContained(root, resolved)) throw new UnsafeFilesystemPathError()
    const stat = await lstat(resolved)
    if (!stat.isFile()) return undefined
    return await readFile(resolved, "utf8")
  } catch (error) {
    if (error instanceof UnsafeFilesystemPathError) throw error
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

function normalizedCharacterStream(value: string): string {
  return value
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/^\s*#{1,6}\s+/, ""))
    .join("")
    .replace(/[\s\u3000]+/gu, "")
}

async function checkProtectedFile(payload: Extract<Payload, { check: "protected-file" }>, root: string): Promise<GradeResult> {
  const content = await readSafeFile(root, payload.path)
  return content === payload.content
    ? passing("Protected source content is unchanged.")
    : failing("Protected source content is missing or changed.")
}

async function checkArtifactPolicy(payload: Extract<Payload, { check: "artifact-policy" }>, root: string): Promise<GradeResult> {
  for (const required of payload.required) {
    if (await readSafeFile(root, required) === undefined) return failing("A required artifact is missing.")
  }
  for (const forbidden of payload.forbidden) {
    if (await readSafeFile(root, forbidden) !== undefined) return failing("A forbidden artifact is present.")
  }
  return passing("Artifact presence policy is satisfied.")
}

async function checkContentFidelity(payload: Extract<Payload, { check: "content-fidelity" }>, root: string): Promise<GradeResult> {
  const [input, output] = await Promise.all([
    readSafeFile(root, payload.inputPath),
    readSafeFile(root, payload.outputPath),
  ])
  if (input === undefined || output === undefined) return failing("Content fidelity artifacts are missing.")
  return normalizedCharacterStream(input) === normalizedCharacterStream(output)
    ? passing("Output preserves the source character stream.")
    : failing("Output changes or loses source characters.")
}

async function checkHeadingStructure(payload: Extract<Payload, { check: "heading-structure" }>, root: string): Promise<GradeResult> {
  const content = await readSafeFile(root, payload.path)
  if (content === undefined) return failing("The Markdown deliverable is missing.")
  const actual = content.split(/\r\n?|\n/).flatMap((line) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    return match ? [{ level: match[1]!.length, text: match[2]! }] : []
  })
  return JSON.stringify(actual) === JSON.stringify(payload.headings)
    ? passing("Markdown heading hierarchy matches the contract.")
    : failing("Markdown heading hierarchy does not match the contract.")
}

async function checkLineLayout(payload: Extract<Payload, { check: "line-layout" }>, root: string): Promise<GradeResult> {
  const content = await readSafeFile(root, payload.path)
  if (content === undefined) return failing("The Markdown deliverable is missing.")
  const lines = new Set(content.split(/\r\n?|\n/).map((line) => line.trim()))
  return payload.requiredStandaloneLines.every((line) => lines.has(line))
    ? passing("Required legal items are on standalone lines.")
    : failing("Required legal items are not on standalone lines.")
}

async function checkReviewOutcome(payload: Extract<Payload, { check: "review-outcome" }>, root: string): Promise<GradeResult> {
  const content = await readSafeFile(root, payload.path)
  if (content === undefined) return failing("The review report is missing.")
  const required = payload.outcome === "approved"
    ? ["最终审核结论：通过", "是否可交付：是"]
    : ["最终审核结论：拒绝（非法律文档）", "是否可交付：否"]
  return required.every((value) => content.includes(value))
    ? passing("Review outcome matches the document policy.")
    : failing("Review outcome does not match the document policy.")
}

async function checkReportSource(payload: Extract<Payload, { check: "report-source" }>, root: string): Promise<GradeResult> {
  const content = await readSafeFile(root, payload.path)
  if (content === undefined) return failing("The review report is missing.")
  return content.includes(payload.sourceName)
    ? passing("Review report identifies the source document.")
    : failing("Review report does not identify the source document.")
}

export const lawToMarkdownGrade: CustomEvaluator = {
  validatePayload(payload) {
    LawToMarkdownGradePayloadSchema.parse(payload)
  },

  async run({ criterion, runResult }) {
    const parsed = LawToMarkdownGradePayloadSchema.safeParse(criterion.payload)
    if (!parsed.success) return infrastructure("Invalid law-to-markdown evaluator payload.")

    try {
      const root = await realpath(runResult.workDir)
      if (!(await lstat(root)).isDirectory()) return infrastructure("Law-to-markdown evaluator workdir is unavailable.")
      switch (parsed.data.check) {
        case "protected-file": return await checkProtectedFile(parsed.data, root)
        case "artifact-policy": return await checkArtifactPolicy(parsed.data, root)
        case "content-fidelity": return await checkContentFidelity(parsed.data, root)
        case "heading-structure": return await checkHeadingStructure(parsed.data, root)
        case "line-layout": return await checkLineLayout(parsed.data, root)
        case "review-outcome": return await checkReviewOutcome(parsed.data, root)
        case "report-source": return await checkReportSource(parsed.data, root)
      }
    } catch (error) {
      if (error instanceof UnsafeFilesystemPathError) return infrastructure("Unsafe law-to-markdown evaluator filesystem path.")
      return infrastructure("Law-to-markdown evaluator filesystem failure.")
    }
  },
}

registerCustomEvaluator("skill-ir-law-to-markdown", lawToMarkdownGrade)
