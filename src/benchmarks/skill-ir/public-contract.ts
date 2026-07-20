import { z } from "zod";
import {
  RuntimeExpectedTypeSchema,
  parseSafeRelativePath,
} from "./artifact-package";

export const PUBLIC_CONTRACT_ERROR_CODE_CATALOG = "public-contract-error-codes/v2" as const;

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
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const PublicEvidenceKindSchema = z.enum([
  "dotenv-definition",
  "environment-reference",
  "integer-conversion",
  "boolean-literal-shape",
  "uri-literal-shape",
  "sensitive-name-pattern",
  "sensitive-literal-shape",
  "public-skill-rule",
  "framework-public-prefix",
]);

export const PublicEvidenceRefSchema = z.object({
  relativePath: RelativePathSchema,
  symbol: IdentifierSchema,
  evidenceKind: PublicEvidenceKindSchema,
}).strict();

const RuleEvidenceBaseSchema = z.object({
  disposition: z.enum(["confirmed", "advisory"]),
  evidenceRefs: z.array(PublicEvidenceRefSchema).min(1),
});

export const PublicRuleSchema = z.discriminatedUnion("field", [
  RuleEvidenceBaseSchema.extend({
    field: z.literal("type"),
    value: RuntimeExpectedTypeSchema,
  }).strict(),
  RuleEvidenceBaseSchema.extend({
    field: z.literal("required"),
    value: z.boolean(),
  }).strict(),
  RuleEvidenceBaseSchema.extend({
    field: z.literal("minimum"),
    value: z.number(),
  }).strict(),
  RuleEvidenceBaseSchema.extend({
    field: z.literal("maximum"),
    value: z.number(),
  }).strict(),
  RuleEvidenceBaseSchema.extend({
    field: z.literal("format"),
    value: z.enum(["uri"]),
  }).strict(),
  RuleEvidenceBaseSchema.extend({
    field: z.literal("minLength"),
    value: z.number().int().min(0),
  }).strict(),
  RuleEvidenceBaseSchema.extend({
    field: z.literal("sensitive"),
    value: z.boolean(),
  }).strict(),
]);

const PublicVariableSchema = z.object({
  name: IdentifierSchema,
  definitions: z.array(PublicEvidenceRefSchema),
  references: z.array(PublicEvidenceRefSchema),
  rules: z.array(PublicRuleSchema),
}).strict().superRefine((variable, ctx) => {
  if (variable.definitions.length === 0 && variable.references.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Variable ${variable.name} requires at least one public evidence reference`,
    });
  }
});

const PublicSourceQualifiedFindingSchema = z.object({
  relativePath: RelativePathSchema,
  symbol: IdentifierSchema,
  findingKind: z.literal("hardcoded-sensitive-literal"),
  evidenceRefs: z.array(PublicEvidenceRefSchema).min(1),
}).strict();

const PublicContractLimitationSchema = z.object({
  code: z.enum([
    "unsupported-extension",
    "unsupported-encoding",
    "unsupported-syntax",
    "unreadable-file",
    "scan-file-limit",
    "scan-byte-limit",
    "ambiguous-evidence",
    "conflicting-evidence",
  ]),
  relativePath: RelativePathSchema.optional(),
  evidenceRefs: z.array(PublicEvidenceRefSchema).min(1),
}).strict();

export const PublicRuntimeContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-runtime-contract/v3"),
  codeCatalog: z.literal(PUBLIC_CONTRACT_ERROR_CODE_CATALOG),
  skillId: z.literal("env-manager"),
  taskContractDigest: Sha256Schema,
  generatedOutputs: z.array(RelativePathSchema).min(1),
  publicPrefixes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*_$/)),
  variables: z.array(PublicVariableSchema),
  sourceQualifiedFindings: z.array(PublicSourceQualifiedFindingSchema),
  limitations: z.array(PublicContractLimitationSchema),
}).strict();

export const PublicValidationCodeSchema = z.enum([
  "MISSING_FILE",
  "INVALID_JSON",
  "MISSING_REPORT_FIELD",
  "EXTRA_REPORT_FIELD",
  "INVALID_REPORT_FIELD_TYPE",
  "MISSING_CLASSIFICATION_ENTRY",
  "UNSUPPORTED_CLASSIFICATION_ENTRY",
  "MISSING_SCHEMA_RULE",
  "UNSUPPORTED_SCHEMA_RULE",
  "INVALID_SCHEMA_RULE_TYPE",
  "MISSING_SOURCE_QUALIFIED_FINDING",
  "INVALID_SOURCE_QUALIFIED_FINDING",
  "MISSING_EXAMPLE_ENTRY",
  "UNSAFE_EXAMPLE_ENTRY",
  "SECRET_PATTERN_PRESENT",
  "PROTECTED_FILE_MUTATED",
]);

export const PublicRepairOperationSchema = z.enum([
  "create-output",
  "set-report-entry",
  "remove-report-entry",
  "set-schema-rule",
  "remove-schema-rule",
  "set-redacted-example",
  "set-source-qualified-finding",
  "remove-source-qualified-finding",
]);

export const PublicContractRefSchema = z.string().superRefine((value, ctx) => {
  if (value.includes("..")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Contract refs cannot traverse" });
    return;
  }
  const valid = /^(?:variables\/[A-Za-z_][A-Za-z0-9_.:-]*\/(?:classification|rules\/(?:type|required|minimum|maximum|format|minLength|sensitive))|findings\/[0-9]+|outputs\/[A-Za-z0-9_.\/-]+)$/.test(value);
  if (!valid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid public contract ref: ${value}` });
  }
});

const RuntimePublicValidationErrorSchema = z.object({
  code: PublicValidationCodeSchema,
  relativePath: RelativePathSchema.optional(),
  jsonPointer: JsonPointerSchema.optional(),
  missingField: MissingFieldSchema.optional(),
  expectedType: RuntimeExpectedTypeSchema.optional(),
  contractRef: PublicContractRefSchema.optional(),
  operation: PublicRepairOperationSchema.optional(),
}).strict();

export const RuntimePublicValidationReportSchema = z.object({
  schemaVersion: z.literal("runtime-validation-report/v3"),
  codeCatalog: z.literal(PUBLIC_CONTRACT_ERROR_CODE_CATALOG),
  status: z.enum(["pass", "fail"]),
  repairEligible: z.boolean(),
  errors: z.array(RuntimePublicValidationErrorSchema),
}).strict().superRefine((report, ctx) => {
  if (report.status === "pass" && (report.repairEligible || report.errors.length > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passing validation cannot include repair errors",
    });
  }
  if (report.status === "fail" && report.errors.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Failing validation requires at least one error",
    });
  }
  if (report.repairEligible) {
    for (const [index, error] of report.errors.entries()) {
      if (!error.contractRef || !error.operation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["errors", index],
          message: "Repair-eligible errors require contractRef and operation",
        });
      }
    }
  }
});

export type PublicEvidenceKind = z.infer<typeof PublicEvidenceKindSchema>;
export type PublicEvidenceRef = z.infer<typeof PublicEvidenceRefSchema>;
export type PublicRule = z.infer<typeof PublicRuleSchema>;
export type PublicRuntimeContract = z.infer<typeof PublicRuntimeContractSchema>;
export type PublicValidationCode = z.infer<typeof PublicValidationCodeSchema>;
export type PublicRepairOperation = z.infer<typeof PublicRepairOperationSchema>;
export type RuntimePublicValidationReport = z.infer<typeof RuntimePublicValidationReportSchema>;
