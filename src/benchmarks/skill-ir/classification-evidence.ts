import { z } from "zod";
import { parseSafeRelativePath } from "./artifact-package";

const RelativePathSchema = z.string().transform((value, ctx) => {
  try {
    return parseSafeRelativePath(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : String(error),
    });
    return z.NEVER;
  }
});

const IdentifierSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/);

const EvidenceRefSchema = z.object({
  relativePath: RelativePathSchema,
  symbol: IdentifierSchema,
}).strict();

export const ObservedDefinitionSchema = z.object({
  name: IdentifierSchema,
  relativePath: RelativePathSchema,
}).strict();

export const ObservedReferenceSchema = z.object({
  name: IdentifierSchema,
  relativePath: RelativePathSchema,
  symbol: IdentifierSchema,
}).strict();

export const ObservedHardcodedSecretSchema = z.object({
  relativePath: RelativePathSchema,
  symbol: IdentifierSchema,
}).strict();

export const ClassificationCandidateSchema = z.object({
  value: IdentifierSchema,
  evidenceRefs: z.array(EvidenceRefSchema).min(1),
  confidence: z.number().min(0).max(1),
  disposition: z.enum(["confirmed", "unconfirmed", "conflicting"]),
}).strict();

export type ObservedDefinition = z.infer<typeof ObservedDefinitionSchema>;
export type ObservedReference = z.infer<typeof ObservedReferenceSchema>;
export type ObservedHardcodedSecret = z.infer<typeof ObservedHardcodedSecretSchema>;
export type ClassificationCandidate = z.infer<typeof ClassificationCandidateSchema>;
