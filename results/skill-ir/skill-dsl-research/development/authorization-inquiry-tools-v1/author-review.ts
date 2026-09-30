import { z } from "zod"
import { createHash } from "node:crypto"
import { AuthorizationInquirySchema } from "../../../../../src/task-dsl/authorization/inquiry.ts"
export const authorDigest = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")
export const AuthorSemanticReviewSchema = z.object({ artifactSha256: z.string(), reviewer: z.literal("development-agent"), status: z.enum(["equivalent", "incorrect", "unreviewed"]), rationale: z.string().min(1), obligations: z.array(z.object({ requirement: z.string().min(1), candidateExcerpt: z.string(), status: z.enum(["preserved", "changed", "missing", "added"]) }).strict()), errors: z.array(z.object({ kind: z.enum(["actor", "negation", "policy-version", "omission", "addition"]), detail: z.string().min(1) }).strict()) }).strict()
export type AuthorSemanticReview = z.infer<typeof AuthorSemanticReviewSchema>
/** Structure and independent semantic review are separate. Never scores text matches. */
export function authorArtifactReview(candidate: unknown, format: "MD" | "DSL", semantic?: AuthorSemanticReview) {
  const structuralValid = format === "MD" ? typeof candidate === "string" && candidate.trim().length > 0 : AuthorizationInquirySchema.safeParse(candidate).success
  const parsed = semantic ? AuthorSemanticReviewSchema.parse(semantic) : undefined
  if (parsed && parsed.artifactSha256 !== authorDigest(candidate)) throw new Error("Author review artifact identity mismatch")
  const equivalent = parsed?.status === "equivalent" && parsed.errors.length === 0 && parsed.obligations.length > 0 && parsed.obligations.every(o => o.status === "preserved")
  return { structuralValid, semanticStatus: parsed?.status ?? "unreviewed", valid: structuralValid && equivalent, structurallyConsumable: structuralValid, semantic: parsed }
}
