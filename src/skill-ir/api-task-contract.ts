import { isAbsolute } from "node:path";
import { z } from "zod";
import { ApiSkillMappingSchema } from "./api-skill-mapping";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const NonEmptyTextSchema = z.string().min(1).max(4096);
const OperationKeySchema = z.string().regex(/^(?:GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE) \/\S*$/u);

const RelativePathSchema = z.string().min(1).max(4096).refine((value) => {
  return !isAbsolute(value)
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.startsWith("\\\\")
    && !value.split(/[\\/]+/u).includes("..");
}, "must be a safe relative path");

export const API_TASK_OBLIGATION_KINDS = [
  "valid-minimal",
  "valid-full",
  "required-omission",
  "constraint-negative",
  "response-conformance",
] as const;

export type ApiTaskObligationKind = typeof API_TASK_OBLIGATION_KINDS[number];

const RequirementSchema = z.object({
  id: IdentifierSchema,
  kind: z.enum(API_TASK_OBLIGATION_KINDS),
  required: z.boolean(),
  scope: z.literal("each-selected-operation"),
  sourceLocator: NonEmptyTextSchema,
}).strict();

const MappingSchema = z.object({
  origin: z.enum(["user-declared", "agent-reviewed", "human-reviewed"]),
  sourceSkill: z.string().min(1).max(4096).nullable(),
  unresolvedRequirementIds: z.array(IdentifierSchema).max(1024),
}).strict();

export const ApiTaskContractSchema = z.object({
  schemaVersion: z.literal("skvm-api-task/v1"),
  taskId: IdentifierSchema,
  profile: z.literal("oas30-offline-test/v1"),
  input: z.object({
    path: RelativePathSchema,
    format: z.enum(["json", "yaml"]),
    dialect: z.literal("oas3.0"),
  }).strict(),
  dependencyManifest: RelativePathSchema.nullable(),
  operationKeys: z.union([
    z.literal("all"),
    z.array(OperationKeySchema).min(1).max(10000),
  ]),
  requirements: z.array(RequirementSchema).min(1).max(1024),
  output: z.enum(["request-json", "pytest"]),
  observations: z.object({
    path: RelativePathSchema,
    provenance: z.enum(["supplied", "fixture"]),
  }).strict().nullable(),
  execution: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("offline-validation") }).strict(),
    z.object({ mode: z.literal("loopback"), oraclePath: RelativePathSchema }).strict(),
  ]),
  mapping: MappingSchema,
}).strict().superRefine((value, context) => {
  if (Array.isArray(value.operationKeys) && new Set(value.operationKeys).size !== value.operationKeys.length) {
    context.addIssue({ code: "custom", path: ["operationKeys"], message: "duplicate operation key" });
  }
  const requirementIds = value.requirements.map(({ id }) => id);
  if (new Set(requirementIds).size !== requirementIds.length) {
    context.addIssue({ code: "custom", path: ["requirements"], message: "duplicate requirement id" });
  }
  const unresolved = value.mapping.unresolvedRequirementIds;
  if (new Set(unresolved).size !== unresolved.length) {
    context.addIssue({ code: "custom", path: ["mapping", "unresolvedRequirementIds"], message: "duplicate unresolved requirement id" });
  }
  for (const id of unresolved) {
    if (!requirementIds.includes(id)) {
      context.addIssue({ code: "custom", path: ["mapping", "unresolvedRequirementIds"], message: `unresolved requirement is not declared: ${id}` });
    }
  }
  if (value.mapping.origin !== "user-declared" && value.mapping.sourceSkill === null) {
    context.addIssue({ code: "custom", path: ["mapping", "sourceSkill"], message: "reviewed mapping requires a source skill" });
  }
});

export type ApiTaskContract = z.infer<typeof ApiTaskContractSchema>;
export type ApiTaskRequirement = ApiTaskContract["requirements"][number];
export type ApiTaskOutput = ApiTaskContract["output"];

export function parseApiTaskContract(value: unknown): ApiTaskContract {
  return ApiTaskContractSchema.parse(value);
}

/** Public interoperability schema. It mirrors the strict runtime parser and intentionally has no extension bag. */
export const API_TASK_CONTRACT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://skvm.local/schemas/skvm-api-task-v1.json",
  title: "SkVM OpenAPI offline task contract",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "taskId", "profile", "input", "dependencyManifest", "operationKeys",
    "requirements", "output", "observations", "execution", "mapping",
  ],
  properties: {
    schemaVersion: { const: "skvm-api-task/v1" },
    taskId: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" },
    profile: { const: "oas30-offline-test/v1" },
    input: {
      type: "object",
      additionalProperties: false,
      required: ["path", "format", "dialect"],
      properties: {
        path: { type: "string", minLength: 1 },
        format: { enum: ["json", "yaml"] },
        dialect: { const: "oas3.0" },
      },
    },
    dependencyManifest: { type: ["string", "null"] },
    operationKeys: {
      oneOf: [
        { const: "all" },
        { type: "array", minItems: 1, maxItems: 10000, uniqueItems: true, items: { type: "string", pattern: "^(GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE) /" } },
      ],
    },
    requirements: {
      type: "array",
      minItems: 1,
      maxItems: 1024,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "required", "scope", "sourceLocator"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" },
          kind: { enum: [...API_TASK_OBLIGATION_KINDS] },
          required: { type: "boolean" },
          scope: { const: "each-selected-operation" },
          sourceLocator: { type: "string", minLength: 1 },
        },
      },
    },
    output: { enum: ["request-json", "pytest"] },
    observations: {
      oneOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false, required: ["path", "provenance"],
          properties: { path: { type: "string", minLength: 1 }, provenance: { enum: ["supplied", "fixture"] } },
        },
      ],
    },
    execution: {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["mode"], properties: { mode: { const: "offline-validation" } } },
        { type: "object", additionalProperties: false, required: ["mode", "oraclePath"], properties: { mode: { const: "loopback" }, oraclePath: { type: "string", minLength: 1 } } },
      ],
    },
    mapping: {
      type: "object",
      additionalProperties: false,
      required: ["origin", "sourceSkill", "unresolvedRequirementIds"],
      properties: {
        origin: { enum: ["user-declared", "agent-reviewed", "human-reviewed"] },
        sourceSkill: { type: ["string", "null"] },
        unresolvedRequirementIds: { type: "array", uniqueItems: true, items: { type: "string" } },
      },
    },
  },
} as const;

type MappingDeclaration = {
  requirementId: string;
  kind: ApiTaskObligationKind;
  sourceLocator: string;
  obligationIds: string[];
};

type ResidualDuty = { obligationId: string; sourceLocator: string; reason: string };

/**
 * Converts the already-versioned mapping into reviewable task requirements without modifying it or
 * inferring requirement semantics from repository/profile names. Callers must declare every mapping.
 */
export function adaptApiSkillMappingV1(input: {
  mapping: unknown;
  parentScope: string;
  declarations: MappingDeclaration[];
  residualDuties: ResidualDuty[];
}) {
  const mapping = ApiSkillMappingSchema.parse(input.mapping);
  if (!input.parentScope.trim()) throw new Error("parentScope is required");
  const declarationIds = input.declarations.map(({ requirementId }) => requirementId);
  if (new Set(declarationIds).size !== declarationIds.length) throw new Error("duplicate adapter requirement id");
  const declaredObligations = input.declarations.flatMap((row) => row.obligationIds);
  if (new Set(declaredObligations).size !== declaredObligations.length) throw new Error("adapter obligation may only be declared once");
  const expected = [...mapping.obligations].sort();
  const actual = [...declaredObligations].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("adapter must preserve every mapped obligation");
  for (const row of input.declarations) {
    if (!IdentifierSchema.safeParse(row.requirementId).success || !API_TASK_OBLIGATION_KINDS.includes(row.kind)
      || !row.sourceLocator.trim() || row.obligationIds.length === 0) throw new Error(`invalid adapter declaration: ${row.requirementId}`);
  }
  for (const row of input.residualDuties) {
    if (!row.obligationId.trim() || !row.sourceLocator.trim() || !row.reason.trim()) throw new Error("invalid residual duty");
  }
  return {
    schemaVersion: "skvm-api-task-mapping-adapter/v1" as const,
    source: {
      schemaVersion: mapping.schemaVersion,
      mappingId: mapping.mappingId,
      skillId: mapping.skillId,
      responsibilityId: mapping.responsibilityId,
      profile: mapping.profile,
      requestedOutputFormat: mapping.requestedOutputFormat,
      obligationIds: [...mapping.obligations],
      extraction: mapping.extraction,
    },
    parentScope: input.parentScope,
    requirements: input.declarations.map((row) => ({ ...row, obligationIds: [...row.obligationIds], reviewStatus: "agent-reviewed-declaration" as const })),
    residualDuties: input.residualDuties.map((row) => ({ ...row })),
    tasks: mapping.tasks.map((row) => ({ ...row })),
    wholeSkillComplete: false as const,
    automaticNaturalLanguageCompilation: false as const,
  };
}
