import { z } from "zod";
import {
  RuntimeExpectedTypeSchema,
  parseSafeRelativePath,
} from "./artifact-package";

export const SEMANTIC_ERROR_CODE_CATALOG = "semantic-error-codes/v1" as const;

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
const JsonPointerSchema = z.string().regex(/^\/(?:[^~\/]|~[01])*(?:\/(?:[^~\/]|~[01])*)*$/);
const MissingFieldSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/);

export const SemanticValidationCodeSchema = z.enum([
  "MISSING_FILE",
  "INVALID_JSON",
  "MISSING_FIELD",
  "EXTRA_FIELD",
  "TYPE_MISMATCH",
  "UNFILLED_TEMPLATE",
  "SECRET_PATTERN_PRESENT",
  "PROTECTED_FILE_MUTATED",
  "MISSING_OBSERVED_VARIABLE",
  "INVALID_RULE_TYPE",
  "MISSING_RULE_CONSTRAINT",
  "MISSING_SENSITIVE_MARKER",
  "UNSUPPORTED_RULE_FIELD",
  "INVALID_SOURCE_QUALIFIED_FINDING",
  "MISSING_SOURCE_QUALIFIED_FINDING",
]);

const EvidenceKindSchema = z.enum([
  "dotenv-definition",
  "environment-reference",
  "integer-conversion",
  "public-skill-rule",
  "sensitive-name-pattern",
  "literal-assignment",
]);

const SourceRefSchema = z.object({
  relativePath: RelativePathSchema,
  symbol: IdentifierSchema,
  evidenceKind: EvidenceKindSchema,
}).strict();

const ConstraintSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("minimum"), value: z.number() }).strict(),
  z.object({ field: z.literal("maximum"), value: z.number() }).strict(),
  z.object({ field: z.literal("minLength"), value: z.number().int().min(0) }).strict(),
  z.object({ field: z.literal("format"), value: z.enum(["uri"]) }).strict(),
]);

const ObservedVariableSchema = z.object({
  name: IdentifierSchema,
  evidenceKinds: z.array(EvidenceKindSchema).min(1),
  sourceRefs: z.array(SourceRefSchema),
  inferredType: RuntimeExpectedTypeSchema.optional(),
  constraints: z.array(ConstraintSchema),
  sensitiveMarkerRequired: z.boolean(),
}).strict();

const SourceQualifiedFindingSchema = z.object({
  relativePath: RelativePathSchema,
  symbol: IdentifierSchema,
  findingKind: z.literal("hardcoded-sensitive-literal"),
  evidenceRefs: z.array(SourceRefSchema).min(1),
}).strict();

const LimitationSchema = z.object({
  code: z.enum([
    "unsupported-extension",
    "unsupported-encoding",
    "unreadable-file",
    "scan-file-limit",
    "scan-byte-limit",
    "ambiguous-evidence",
  ]),
  relativePath: RelativePathSchema.optional(),
}).strict();

export const SemanticScanPolicySchema = z.object({
  allowedExtensions: z.array(z.enum([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"])).min(1),
  excludedDirectories: z.array(z.string().min(1)),
  maxFiles: z.number().int().min(1),
  maxBytes: z.number().int().min(1),
}).strict();

export const SemanticRuntimeContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-semantic-runtime-contract/v1"),
  codeCatalog: z.literal(SEMANTIC_ERROR_CODE_CATALOG),
  skillId: z.literal("env-manager"),
  observedVariables: z.array(ObservedVariableSchema),
  sourceQualifiedFindings: z.array(SourceQualifiedFindingSchema),
  limitations: z.array(LimitationSchema),
}).strict();

const SemanticValidationErrorSchema = z.object({
  code: SemanticValidationCodeSchema,
  relativePath: RelativePathSchema.optional(),
  jsonPointer: JsonPointerSchema.optional(),
  missingField: MissingFieldSchema.optional(),
  expectedType: RuntimeExpectedTypeSchema.optional(),
}).strict().superRefine((error, ctx) => {
  type RepairField = "relativePath" | "jsonPointer" | "missingField" | "expectedType";
  const repairFields: RepairField[] = ["relativePath", "jsonPointer", "missingField", "expectedType"];
  const present = (field: RepairField) => error[field] !== undefined;
  const requireFields = (...fields: RepairField[]) => {
    for (const field of fields) {
      if (!present(field)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${error.code} requires ${field}` });
      }
    }
  };
  let allowed: RepairField[] = [];

  switch (error.code) {
    case "MISSING_FILE":
    case "INVALID_JSON":
    case "PROTECTED_FILE_MUTATED":
      allowed = ["relativePath"];
      requireFields("relativePath");
      break;
    case "MISSING_FIELD":
      allowed = ["relativePath", "jsonPointer", "missingField", "expectedType"];
      requireFields("relativePath", "jsonPointer", "missingField", "expectedType");
      break;
    case "EXTRA_FIELD":
    case "UNSUPPORTED_RULE_FIELD":
    case "INVALID_SOURCE_QUALIFIED_FINDING":
    case "MISSING_SOURCE_QUALIFIED_FINDING":
      allowed = ["relativePath", "jsonPointer"];
      requireFields("relativePath", "jsonPointer");
      break;
    case "TYPE_MISMATCH":
    case "INVALID_RULE_TYPE":
    case "MISSING_OBSERVED_VARIABLE":
      allowed = ["relativePath", "jsonPointer", "expectedType"];
      requireFields("relativePath", "jsonPointer", "expectedType");
      break;
    case "MISSING_RULE_CONSTRAINT":
      allowed = ["relativePath", "jsonPointer", "missingField", "expectedType"];
      requireFields("relativePath", "jsonPointer", "missingField", "expectedType");
      break;
    case "MISSING_SENSITIVE_MARKER":
      allowed = ["relativePath", "jsonPointer", "missingField", "expectedType"];
      requireFields("relativePath", "jsonPointer", "missingField", "expectedType");
      if (error.missingField !== "sensitive" || error.expectedType !== "boolean") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MISSING_SENSITIVE_MARKER requires sensitive:boolean",
        });
      }
      break;
    case "UNFILLED_TEMPLATE":
    case "SECRET_PATTERN_PRESENT":
      break;
  }
  for (const field of repairFields) {
    if (present(field) && !allowed.includes(field)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${error.code} forbids ${field}` });
    }
  }
});

export const RuntimeSemanticValidationReportSchema = z.object({
  schemaVersion: z.literal("runtime-validation-report/v2"),
  codeCatalog: z.literal(SEMANTIC_ERROR_CODE_CATALOG),
  status: z.enum(["pass", "fail"]),
  repairEligible: z.boolean(),
  errors: z.array(SemanticValidationErrorSchema),
}).strict().superRefine((report, ctx) => {
  if (report.status === "pass" && (report.repairEligible || report.errors.length > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Passing validation cannot include repair errors" });
  }
  if (report.status === "fail" && report.errors.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Failing validation requires at least one error" });
  }
});

export type SemanticRuntimeContract = z.infer<typeof SemanticRuntimeContractSchema>;
export type SemanticScanPolicy = z.infer<typeof SemanticScanPolicySchema>;
export type RuntimeSemanticValidationReport = z.infer<typeof RuntimeSemanticValidationReportSchema>;
