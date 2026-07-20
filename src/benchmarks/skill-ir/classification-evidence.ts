import { z } from "zod";
import { parseSafeRelativePath } from "./artifact-package";
import {
  PublicRuntimeContractSchema,
  type PublicRuntimeContract,
} from "./public-contract";

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

export type PublicContractClassification = {
  definedAndUsed: string[];
  definedUnconfirmedUnused: string[];
  usedUndefined: string[];
  hardcodedSecrets: string[];
  exposureRisks: string[];
};

export function derivePublicContractClassification(
  input: PublicRuntimeContract,
): PublicContractClassification {
  const contract = PublicRuntimeContractSchema.parse(input);
  const result: PublicContractClassification = {
    definedAndUsed: [],
    definedUnconfirmedUnused: [],
    usedUndefined: [],
    hardcodedSecrets: [],
    exposureRisks: [],
  };

  for (const variable of contract.variables) {
    const defined = variable.definitions.length > 0;
    const referenced = variable.references.length > 0;
    if (defined && referenced) result.definedAndUsed.push(variable.name);
    else if (defined) result.definedUnconfirmedUnused.push(variable.name);
    else if (referenced) result.usedUndefined.push(variable.name);

    const sensitive = variable.rules.some((rule) =>
      rule.field === "sensitive"
      && rule.value === true
      && rule.disposition === "confirmed");
    const publicName = contract.publicPrefixes.some((prefix) => variable.name.startsWith(prefix));
    if (sensitive && publicName) {
      for (const reference of variable.references) {
        if (reference.evidenceKind === "client-environment-reference") {
          result.exposureRisks.push(`${reference.relativePath}:${variable.name}`);
        }
      }
    }
  }

  for (const finding of contract.sourceQualifiedFindings) {
    result.hardcodedSecrets.push(`${finding.relativePath}:${finding.symbol}`);
  }

  for (const values of Object.values(result)) {
    values.sort((left, right) => left.localeCompare(right));
  }
  result.exposureRisks = [...new Set(result.exposureRisks)];
  result.hardcodedSecrets = [...new Set(result.hardcodedSecrets)];
  return result;
}
