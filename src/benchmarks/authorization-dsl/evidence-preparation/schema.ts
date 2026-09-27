import { z } from "zod"

const Text = z.string().trim().min(1)
const Line = z.number().int().positive()
const Range = z.object({ startLine: Line, endLine: Line }).refine(value => value.endLine >= value.startLine, "endLine must not precede startLine")

export const AuthorizationEvidenceRequestSchema = z.object({
  schemaVersion: z.literal("authorization-evidence-request/v1"),
  sourceRoot: Text,
  allowedFiles: z.array(Text).min(1),
  entries: z.array(z.object({ entryKey: Text, path: Text, startLine: Line, endLine: Line }).strict()).min(1),
  dependencies: z.array(z.object({
    id: Text, from: Text, path: Text, startLine: Line.optional(), endLine: Line.optional(), match: Text.optional(),
    reason: z.enum(["identity", "resource-binding", "control", "effect", "other"]),
    basis: z.enum(["author", "locator", "model-proposal"]),
    unresolvedReason: z.enum(["dynamic-dispatch", "external-middleware", "missing-symbol"]).optional(),
  }).strict().refine(value => !value.unresolvedReason || (value.startLine === undefined && value.endLine === undefined && value.match === undefined), "unresolved dependency must not carry a source range or literal match")),
  limits: z.object({ maxFiles: z.number().int().min(1).max(1_000), maxBytes: z.number().int().min(1).max(10_485_760), maxDepth: z.number().int().min(0).max(20) }).strict(),
}).strict()

export type AuthorizationEvidenceRequest = z.infer<typeof AuthorizationEvidenceRequestSchema>

export const AuthorizationEvidenceReportSchema = z.object({
  schemaVersion: z.literal("authorization-evidence-report/v1"),
  status: z.enum(["ready", "partial", "invalid"]),
  sourceIdentity: z.object({ repository: Text, sourceRef: Text }).strict(),
  sourceRoot: Text,
  included: z.array(z.object({ path: Text, originalPath: Text, startLine: Line, endLine: Line, origins: z.array(Text).min(1) }).strict()),
  gaps: z.array(z.object({ id: Text, entryKey: Text, reason: Text, attemptedPath: Text.optional() }).strict()),
  closureClaim: z.literal("declared-dependencies-only"),
}).strict()

export type AuthorizationEvidenceReport = z.infer<typeof AuthorizationEvidenceReportSchema>
