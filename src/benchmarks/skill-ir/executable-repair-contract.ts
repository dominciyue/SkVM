import { z } from "zod";
import { PublicEvidenceKindSchema } from "./public-contract";

export const ENV_MANAGER_REPORT_FIELDS = [
  "definedAndUsed",
  "definedUnconfirmedUnused",
  "usedUndefined",
  "hardcodedSecrets",
  "exposureRisks",
] as const;

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ReportFieldSchema = z.enum(ENV_MANAGER_REPORT_FIELDS);

const StringShapeSchema = z.object({
  kind: z.literal("string"),
  canonical: z.enum(["environment-variable-name", "source-qualified-symbol"]),
}).strict();

const ArrayShapeSchema = z.object({
  kind: z.literal("array"),
  items: StringShapeSchema,
  semantics: z.literal("set"),
  uniqueItems: z.literal(true),
  order: z.literal("lexicographic"),
  valueSource: z.string().regex(/^classification\/(?:definedAndUsed|definedUnconfirmedUnused|usedUndefined|hardcodedSecrets|exposureRisks)$/),
}).strict();

const ReportObjectShapeSchema = z.object({
  kind: z.literal("object"),
  required: z.array(ReportFieldSchema).length(ENV_MANAGER_REPORT_FIELDS.length),
  additionalProperties: z.literal(false),
  properties: z.record(ReportFieldSchema, ArrayShapeSchema),
}).strict().superRefine((shape, ctx) => {
  const required = [...new Set(shape.required)].sort();
  const registered = [...ENV_MANAGER_REPORT_FIELDS].sort();
  const properties = Object.keys(shape.properties).sort();
  if (JSON.stringify(required) !== JSON.stringify(registered)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "report required fields drift" });
  }
  if (JSON.stringify(properties) !== JSON.stringify(registered)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "report properties drift" });
  }
  for (const field of ENV_MANAGER_REPORT_FIELDS) {
    if (shape.properties[field]?.valueSource !== `classification/${field}`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["properties", field, "valueSource"],
        message: `report value source drift for ${field}`,
      });
    }
  }
});

const SchemaMapShapeSchema = z.object({
  kind: z.literal("schema-map"),
  rootProperty: z.literal("variables"),
  additionalRuleProperties: z.literal(false),
  allowedRuleFields: z.tuple([
    z.literal("type"),
    z.literal("required"),
    z.literal("minimum"),
    z.literal("maximum"),
    z.literal("format"),
    z.literal("minLength"),
    z.literal("sensitive"),
  ]),
  variableSource: z.literal("runtime-contract/variables"),
}).strict();

const DotenvShapeSchema = z.object({
  kind: z.literal("dotenv-inventory"),
  variableSource: z.literal("runtime-contract/variables"),
  valuePolicy: z.literal("redacted-empty"),
  order: z.literal("lexicographic"),
}).strict();

const OutputSchema = z.discriminatedUnion("relativePath", [
  z.object({
    relativePath: z.literal("env-report.json"),
    format: z.literal("json"),
    shape: ReportObjectShapeSchema,
  }).strict(),
  z.object({
    relativePath: z.literal(".env.schema.json"),
    format: z.literal("json"),
    shape: SchemaMapShapeSchema,
  }).strict(),
  z.object({
    relativePath: z.literal(".env.example"),
    format: z.literal("dotenv"),
    shape: DotenvShapeSchema,
  }).strict(),
]);

const SchemaRulePolicySchema = z.object({
  schemaVersion: z.literal("env-manager-development-repair-policy/v1"),
  policyClass: z.literal("development-learned-candidate"),
  developmentEvidenceSha256: Sha256Schema,
  defaultStringEvidenceKinds: z.tuple([
    z.literal("dotenv-definition"),
    z.literal("environment-reference"),
    z.literal("client-environment-reference"),
  ]),
  uriNameSuffixes: z.tuple([
    z.literal("_DSN"),
    z.literal("_URI"),
    z.literal("_URL"),
  ]),
  learnedRules: z.tuple([
    z.object({
      ruleId: z.literal("server-dsn-sensitive/v1"),
      kind: z.literal("server-sensitive-suffix"),
      nameSuffix: z.literal("_DSN"),
      sourceCriterion: z.literal("env-schema-rules"),
      evidenceSha256: Sha256Schema,
      status: z.literal("candidate"),
    }).strict(),
    z.object({
      ruleId: z.literal("signing-key-minimum-length/v1"),
      kind: z.literal("sensitive-minimum-length-suffix"),
      nameSuffix: z.literal("_SIGNING_KEY"),
      minimum: z.literal(32),
      sourceCriterion: z.literal("env-schema-rules"),
      evidenceSha256: Sha256Schema,
      status: z.literal("candidate"),
    }).strict(),
  ]),
  evidenceKinds: z.array(PublicEvidenceKindSchema).min(1),
}).strict().superRefine((policy, ctx) => {
  for (const [index, rule] of policy.learnedRules.entries()) {
    if (rule.evidenceSha256 !== policy.developmentEvidenceSha256) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["learnedRules", index, "evidenceSha256"],
        message: `learned rule evidence drift: ${rule.ruleId}`,
      });
    }
  }
});

const AllowedOperationSchema = z.enum([
  "rewrite-canonical-report",
  "rewrite-redacted-example",
  "upsert-confirmed-schema-rules",
]);

export const ExecutableRepairContractSchema = z.object({
  schemaVersion: z.literal("skill-ir-executable-repair-contract/v4"),
  catalog: z.literal("executable-contract-repair-artifact/v4"),
  skillId: z.literal("env-manager"),
  taskContractDigest: Sha256Schema,
  runtimeEvidenceSource: z.literal("skill-ir-public-runtime-contract/v3"),
  runtimeContractSha256: Sha256Schema,
  outputs: z.array(OutputSchema).length(3),
  schemaRulePolicy: SchemaRulePolicySchema,
  allowedOperations: z.tuple([
    z.literal("rewrite-canonical-report"),
    z.literal("rewrite-redacted-example"),
    z.literal("upsert-confirmed-schema-rules"),
  ]),
  provenance: z.object({
    sources: z.tuple([
      z.literal("public-skill-contract"),
      z.literal("public-task-contract"),
      z.literal("agent-visible-workdir"),
    ]),
    prohibitedSources: z.tuple([
      z.literal("scorer-payload"),
      z.literal("secret-values"),
      z.literal("evaluation-only-fixtures"),
    ]),
  }).strict(),
}).strict().superRefine((contract, ctx) => {
  const paths = contract.outputs.map((output) => output.relativePath).sort();
  const required = [".env.example", ".env.schema.json", "env-report.json"].sort();
  if (JSON.stringify(paths) !== JSON.stringify(required)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "output contract paths drift" });
  }
  for (const operation of contract.allowedOperations) AllowedOperationSchema.parse(operation);
});

export type ExecutableRepairContract = z.infer<typeof ExecutableRepairContractSchema>;

export function buildEnvManagerExecutableRepairContract(options: {
  taskContractDigest: string;
  runtimeContractSha256: string;
  developmentEvidenceSha256: string;
}): ExecutableRepairContract {
  const reportProperties = Object.fromEntries(
    ENV_MANAGER_REPORT_FIELDS.map((field) => [field, {
      kind: "array" as const,
      items: {
        kind: "string" as const,
        canonical: field === "hardcodedSecrets" || field === "exposureRisks"
          ? "source-qualified-symbol" as const
          : "environment-variable-name" as const,
      },
      semantics: "set" as const,
      uniqueItems: true as const,
      order: "lexicographic" as const,
      valueSource: `classification/${field}`,
    }]),
  );

  return ExecutableRepairContractSchema.parse({
    schemaVersion: "skill-ir-executable-repair-contract/v4",
    catalog: "executable-contract-repair-artifact/v4",
    skillId: "env-manager",
    taskContractDigest: options.taskContractDigest,
    runtimeEvidenceSource: "skill-ir-public-runtime-contract/v3",
    runtimeContractSha256: options.runtimeContractSha256,
    outputs: [
      {
        relativePath: "env-report.json",
        format: "json",
        shape: {
          kind: "object",
          required: [...ENV_MANAGER_REPORT_FIELDS],
          additionalProperties: false,
          properties: reportProperties,
        },
      },
      {
        relativePath: ".env.schema.json",
        format: "json",
        shape: {
          kind: "schema-map",
          rootProperty: "variables",
          additionalRuleProperties: false,
          allowedRuleFields: [
            "type",
            "required",
            "minimum",
            "maximum",
            "format",
            "minLength",
            "sensitive",
          ],
          variableSource: "runtime-contract/variables",
        },
      },
      {
        relativePath: ".env.example",
        format: "dotenv",
        shape: {
          kind: "dotenv-inventory",
          variableSource: "runtime-contract/variables",
          valuePolicy: "redacted-empty",
          order: "lexicographic",
        },
      },
    ],
    schemaRulePolicy: {
      schemaVersion: "env-manager-development-repair-policy/v1",
      policyClass: "development-learned-candidate",
      developmentEvidenceSha256: options.developmentEvidenceSha256,
      defaultStringEvidenceKinds: [
        "dotenv-definition",
        "environment-reference",
        "client-environment-reference",
      ],
      uriNameSuffixes: ["_DSN", "_URI", "_URL"],
      learnedRules: [
        {
          ruleId: "server-dsn-sensitive/v1",
          kind: "server-sensitive-suffix",
          nameSuffix: "_DSN",
          sourceCriterion: "env-schema-rules",
          evidenceSha256: options.developmentEvidenceSha256,
          status: "candidate",
        },
        {
          ruleId: "signing-key-minimum-length/v1",
          kind: "sensitive-minimum-length-suffix",
          nameSuffix: "_SIGNING_KEY",
          minimum: 32,
          sourceCriterion: "env-schema-rules",
          evidenceSha256: options.developmentEvidenceSha256,
          status: "candidate",
        },
      ],
      evidenceKinds: [
        "dotenv-definition",
        "environment-reference",
        "client-environment-reference",
        "public-skill-rule",
      ],
    },
    allowedOperations: [
      "rewrite-canonical-report",
      "rewrite-redacted-example",
      "upsert-confirmed-schema-rules",
    ],
    provenance: {
      sources: [
        "public-skill-contract",
        "public-task-contract",
        "agent-visible-workdir",
      ],
      prohibitedSources: [
        "scorer-payload",
        "secret-values",
        "evaluation-only-fixtures",
      ],
    },
  });
}
