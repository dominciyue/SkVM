import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { invalidateConfigCache } from "../../core/config";
import { resolveBackendModel, resolveRoute, resolveRouteApiKey } from "../../providers/registry";
import { ThinTaskDescriptionSchema } from "./automatic-domain-construction";
import {
  DomainPlanManualParityCaseReportSchema,
  runDomainPlanManualParityCase,
} from "./automatic-domain-plan-manual-parity";
import {
  auditRestrictedDomainPlanLeakage,
  buildRestrictedDomainPlanRequest,
  completeRestrictedDomainPlanOnce,
  deriveForbiddenTaskDataLiterals,
  RestrictedDomainPlanRequestSchema,
  RestrictedDomainPlanSynthesisError,
  RestrictedDomainPlanSynthesisFailureClassSchema,
  RestrictedDomainPlanSynthesisFailureStageSchema,
  SanitizedProviderResponseMetadataSchema,
  type RestrictedDomainPlanRequest,
} from "./automatic-domain-plan-synthesis";
import {
  RestrictedDomainPlanSchema,
  validateRestrictedDomainPlanBindings,
  type RestrictedDomainPlan,
  type RestrictedDomainPlanStep,
} from "./automatic-restricted-domain-plan";
import { auditRestrictedDomainPlanStaticTypes } from "./automatic-restricted-domain-plan-static-types";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

const TaskSetSchema = z.object({
  schemaVersion: z.literal("skill-ir-tasks/v1"),
  tasks: z.array(z.object({
    id: IdentifierSchema,
    split: z.literal("development"),
    prompt: z.string().min(1),
    fixtures: z.record(z.string()),
  }).passthrough()).min(2),
}).passthrough();

export const GenericDomainPlanRepairCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-generic-repair-catalog/v1"),
  catalogId: IdentifierSchema,
  attemptId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  caseId: IdentifierSchema,
  parentAttributionReport: DigestRefSchema,
  parentManualParityReport: DigestRefSchema,
  source: DigestRefSchema,
  taskDescription: DigestRefSchema,
  taskSet: DigestRefSchema,
  manualEvaluatorModule: DigestRefSchema,
  constructionTaskId: IdentifierSchema,
  transferTaskId: IdentifierSchema,
  publicContractFixturePaths: z.array(SafePathSchema).min(1),
  model: z.object({
    modelId: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9._-]+$/u),
    cacheRoot: SafePathSchema,
    timeoutMs: z.number().int().min(60_000).max(900_000),
    maximumPaidCalls: z.literal(1),
    retries: z.literal(0),
  }).strict(),
}).strict().superRefine((catalog, context) => {
  if (catalog.constructionTaskId === catalog.transferTaskId) {
    context.addIssue({ code: "custom", message: "generic repair requires two distinct development tasks" });
  }
});

export type GenericDomainPlanRepairCatalog = z.infer<typeof GenericDomainPlanRepairCatalogSchema>;

type RegisterType = "text" | "strings" | "records" | "bool" | "json" | "unknown";

const REGISTER_PATTERNS: Record<RegisterType, string> = {
  text: "^text-[a-z0-9][a-z0-9-]{0,58}$",
  strings: "^strings-[a-z0-9][a-z0-9-]{0,55}$",
  records: "^records-[a-z0-9][a-z0-9-]{0,55}$",
  bool: "^bool-[a-z0-9][a-z0-9-]{0,58}$",
  json: "^json-[a-z0-9][a-z0-9-]{0,58}$",
  unknown: "^unknown-[a-z0-9][a-z0-9-]{0,55}$",
};

function registerSchema(type: RegisterType) {
  return { type: "string", pattern: REGISTER_PATTERNS[type] } as const;
}

const TEXT_REGISTER_SCHEMA = registerSchema("text");
const STRINGS_REGISTER_SCHEMA = registerSchema("strings");
const RECORDS_REGISTER_SCHEMA = registerSchema("records");
const BOOL_REGISTER_SCHEMA = registerSchema("bool");
const JSON_REGISTER_SCHEMA = registerSchema("json");
const UNKNOWN_REGISTER_SCHEMA = registerSchema("unknown");
const ANY_REGISTER_SCHEMA = {
  anyOf: [
    TEXT_REGISTER_SCHEMA,
    STRINGS_REGISTER_SCHEMA,
    RECORDS_REGISTER_SCHEMA,
    BOOL_REGISTER_SCHEMA,
    JSON_REGISTER_SCHEMA,
    UNKNOWN_REGISTER_SCHEMA,
  ],
} as const;
const IDENTIFIER_JSON_SCHEMA = { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" } as const;
const SAFE_PATH_JSON_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 240,
  description: "Repository-relative path; local validation rejects absolute paths and parent traversal.",
} as const;
const REGEX_PATTERN_JSON_SCHEMA = { type: "string", minLength: 1, maxLength: 512 } as const;
const REGEX_FLAGS_JSON_SCHEMA = {
  type: "string",
  maxLength: 6,
  description: "Unique flags from g, i, m, s, and u; local validation is authoritative.",
} as const;
const NULLABLE_BOOL_REGISTER_SCHEMA = { anyOf: [BOOL_REGISTER_SCHEMA, { type: "null" }] } as const;
const SCALAR_LITERAL_JSON_SCHEMA = {
  anyOf: [
    { type: "string", maxLength: 4096 },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
} as const;

function strictObject(
  properties: Record<string, unknown>,
  required = Object.keys(properties),
): Record<string, unknown> {
  return { type: "object", additionalProperties: false, required, properties };
}

function referenceExpression(register: Record<string, unknown>) {
  return strictObject({ kind: { type: "string", enum: ["ref"] }, ref: register });
}

const ANY_VALUE_EXPRESSION_JSON_SCHEMA = {
  anyOf: [
    referenceExpression(ANY_REGISTER_SCHEMA),
    strictObject({ kind: { type: "string", enum: ["literal"] }, value: SCALAR_LITERAL_JSON_SCHEMA }),
  ],
} as const;
const TEXT_VALUE_EXPRESSION_JSON_SCHEMA = {
  anyOf: [
    referenceExpression(TEXT_REGISTER_SCHEMA),
    strictObject({ kind: { type: "string", enum: ["literal"] }, value: { type: "string", maxLength: 4096 } }),
  ],
} as const;

const TYPE_CONSTRAINED_STEP_SCHEMAS = [
  strictObject({ id: TEXT_REGISTER_SCHEMA, op: { type: "string", enum: ["read-text"] }, path: SAFE_PATH_JSON_SCHEMA }),
  strictObject({ id: JSON_REGISTER_SCHEMA, op: { type: "string", enum: ["read-json"] }, path: SAFE_PATH_JSON_SCHEMA }),
  strictObject({ id: JSON_REGISTER_SCHEMA, op: { type: "string", enum: ["json-pointer"] }, source: JSON_REGISTER_SCHEMA, pointer: { type: "string", maxLength: 512 } }),
  strictObject({ id: STRINGS_REGISTER_SCHEMA, op: { type: "string", enum: ["parse-key-value-lines"] }, path: SAFE_PATH_JSON_SCHEMA, keyPattern: REGEX_PATTERN_JSON_SCHEMA }),
  strictObject({ id: RECORDS_REGISTER_SCHEMA, op: { type: "string", enum: ["regex-find-files"] }, includePathPattern: REGEX_PATTERN_JSON_SCHEMA, contentPattern: REGEX_PATTERN_JSON_SCHEMA, flags: REGEX_FLAGS_JSON_SCHEMA, captures: { type: "array", minItems: 1, maxItems: 8, items: IDENTIFIER_JSON_SCHEMA } }),
  strictObject({ id: BOOL_REGISTER_SCHEMA, op: { type: "string", enum: ["regex-test"] }, source: TEXT_REGISTER_SCHEMA, pattern: REGEX_PATTERN_JSON_SCHEMA, flags: REGEX_FLAGS_JSON_SCHEMA }),
  strictObject({ id: STRINGS_REGISTER_SCHEMA, op: { type: "string", enum: ["pluck"] }, source: RECORDS_REGISTER_SCHEMA, field: IDENTIFIER_JSON_SCHEMA }),
  strictObject({ id: STRINGS_REGISTER_SCHEMA, op: { type: "string", enum: ["filter-regex"] }, source: STRINGS_REGISTER_SCHEMA, field: { type: "null" }, pattern: REGEX_PATTERN_JSON_SCHEMA, flags: REGEX_FLAGS_JSON_SCHEMA, keep: { type: "string", enum: ["matching", "non-matching"] } }),
  strictObject({ id: RECORDS_REGISTER_SCHEMA, op: { type: "string", enum: ["filter-regex"] }, source: RECORDS_REGISTER_SCHEMA, field: IDENTIFIER_JSON_SCHEMA, pattern: REGEX_PATTERN_JSON_SCHEMA, flags: REGEX_FLAGS_JSON_SCHEMA, keep: { type: "string", enum: ["matching", "non-matching"] } }),
  strictObject({ id: RECORDS_REGISTER_SCHEMA, op: { type: "string", enum: ["project-records"] }, source: RECORDS_REGISTER_SCHEMA, fields: { type: "array", minItems: 1, maxItems: 8, items: IDENTIFIER_JSON_SCHEMA } }),
  strictObject({ id: STRINGS_REGISTER_SCHEMA, op: { type: "string", enum: ["set-operation"] }, operator: { type: "string", enum: ["intersection", "difference", "union"] }, left: STRINGS_REGISTER_SCHEMA, right: STRINGS_REGISTER_SCHEMA }),
  strictObject({ id: BOOL_REGISTER_SCHEMA, op: { type: "string", enum: ["boolean"] }, operator: { type: "string", enum: ["and", "or", "not"] }, inputs: { type: "array", minItems: 1, maxItems: 8, items: BOOL_REGISTER_SCHEMA } }),
  strictObject({ id: UNKNOWN_REGISTER_SCHEMA, op: { type: "string", enum: ["choose"] }, condition: BOOL_REGISTER_SCHEMA, whenTrue: ANY_VALUE_EXPRESSION_JSON_SCHEMA, whenFalse: ANY_VALUE_EXPRESSION_JSON_SCHEMA }),
  strictObject({ id: JSON_REGISTER_SCHEMA, op: { type: "string", enum: ["write-json"] }, path: SAFE_PATH_JSON_SCHEMA, fields: { type: "array", minItems: 1, maxItems: 64, items: strictObject({ key: { type: "string", minLength: 1, maxLength: 128 }, value: ANY_VALUE_EXPRESSION_JSON_SCHEMA }) }, when: NULLABLE_BOOL_REGISTER_SCHEMA }),
  strictObject({
    id: TEXT_REGISTER_SCHEMA,
    op: { type: "string", enum: ["write-text-template"] },
    path: SAFE_PATH_JSON_SCHEMA,
    template: { type: "string", maxLength: 16_384 },
    bindings: {
      type: "array",
      maxItems: 32,
      items: {
        anyOf: [
          strictObject({ token: IDENTIFIER_JSON_SCHEMA, value: TEXT_VALUE_EXPRESSION_JSON_SCHEMA, encoding: { type: "string", enum: ["text"] } }),
          strictObject({ token: IDENTIFIER_JSON_SCHEMA, value: ANY_VALUE_EXPRESSION_JSON_SCHEMA, encoding: { type: "string", enum: ["json"] } }),
        ],
      },
    },
    when: NULLABLE_BOOL_REGISTER_SCHEMA,
  }),
  strictObject({ id: TEXT_REGISTER_SCHEMA, op: { type: "string", enum: ["copy-text"] }, source: TEXT_REGISTER_SCHEMA, path: SAFE_PATH_JSON_SCHEMA, when: NULLABLE_BOOL_REGISTER_SCHEMA }),
] as const;

const TYPE_CONSTRAINED_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "planId", "steps", "audit"],
  properties: {
    schemaVersion: { type: "string", enum: ["skill-ir-restricted-domain-plan/v1"] },
    planId: IDENTIFIER_JSON_SCHEMA,
    steps: { type: "array", minItems: 1, maxItems: 64, items: { anyOf: TYPE_CONSTRAINED_STEP_SCHEMAS } },
    audit: {
      type: "object",
      additionalProperties: false,
      required: ["paidCalls", "retries", "heldOutAccesses", "evaluatorPayloadAccesses", "skillSpecificBranches"],
      properties: {
        paidCalls: { type: "integer", enum: [1] },
        retries: { type: "integer", enum: [0] },
        heldOutAccesses: { type: "integer", enum: [0] },
        evaluatorPayloadAccesses: { type: "integer", enum: [0] },
        skillSpecificBranches: { type: "integer", enum: [0] },
      },
    },
  },
} as const;

export function buildTypeConstrainedRestrictedDomainPlanRequest(raw: {
  sourceText: string;
  taskDescription: unknown;
  constructionTask: unknown;
  publicContractFixturePaths: string[];
}): RestrictedDomainPlanRequest {
  const description = ThinTaskDescriptionSchema.parse(raw.taskDescription);
  const base = buildRestrictedDomainPlanRequest(raw);
  const requiredOutputs = description.outputs.filter((output) => output.required);
  return RestrictedDomainPlanRequestSchema.parse({
    ...base,
    system: [
      base.system,
      "Use the typed register-id namespaces in the tool schema as a mandatory dataflow type contract; do not relabel a value to bypass its type.",
      "Every declared required output must be written unconditionally by the returned plan.",
    ].join(" "),
    prompt: [
      base.prompt,
      "# Mandatory typed register namespaces",
      "Use text-* only for text, strings-* only for string arrays, records-* only for record arrays, bool-* only for booleans, json-* only for JSON values, and unknown-* only for choose results. Text template bindings with encoding=text may reference text-* only. JSON encoding may serialize any typed register.",
      "# Declared required outputs (all are mandatory and unconditional)",
      ...requiredOutputs.map((output) => `- ${output.path} (${output.format})`),
      "Every declared required output above must have its own unconditional write step. A schema-valid but partial plan is rejected. Do not copy protected values or task-only literals into those outputs.",
    ].join("\n\n"),
  });
}

export function buildTypeConstrainedRestrictedDomainPlanCompletionPayload(options: {
  backendModel: string;
  request: RestrictedDomainPlanRequest;
}) {
  const request = RestrictedDomainPlanRequestSchema.parse(options.request);
  return {
    model: options.backendModel,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
    temperature: 0,
    max_tokens: 16_384,
    tools: [{
      type: "function",
      function: {
        name: "submit_restricted_domain_plan",
        description: "Submit one complete type-constrained restricted Domain Plan and no prose.",
        parameters: TYPE_CONSTRAINED_TOOL_SCHEMA,
        strict: true as const,
      },
    }],
    tool_choice: { type: "function", function: { name: "submit_restricted_domain_plan" } },
  };
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function completeTypeConstrainedRestrictedDomainPlanOnce(options: {
  baseUrl: string;
  apiKey: string;
  backendModel: string;
  request: RestrictedDomainPlanRequest;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}) {
  const payload = buildTypeConstrainedRestrictedDomainPlanCompletionPayload({
    backendModel: options.backendModel,
    request: options.request,
  });
  const upstream = options.fetchImpl ?? fetch;
  return completeRestrictedDomainPlanOnce({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    backendModel: options.backendModel,
    request: options.request,
    timeoutMs: options.timeoutMs,
    toolSchemaMode: "domain-plan-strict",
    fetchImpl: (input, init) => upstream(input, { ...init, body: JSON.stringify(payload) }),
  });
}

export type RestrictedDomainPlanTypeNamespaceIssue = {
  code:
    | "step-output-namespace-mismatch"
    | "input-namespace-mismatch"
    | "conditional-namespace-mismatch"
    | "text-binding-namespace-mismatch";
  stepId: string;
  registerId: string;
  expectedType: RegisterType;
};

function registerMatches(id: string, type: RegisterType): boolean {
  return new RegExp(REGISTER_PATTERNS[type], "u").test(id);
}

function outputType(step: RestrictedDomainPlanStep): RegisterType {
  switch (step.op) {
    case "read-text":
    case "write-text-template":
    case "copy-text":
      return "text";
    case "parse-key-value-lines":
    case "pluck":
    case "set-operation":
      return "strings";
    case "regex-find-files":
    case "project-records":
      return "records";
    case "regex-test":
    case "boolean":
      return "bool";
    case "read-json":
    case "json-pointer":
    case "write-json":
      return "json";
    case "choose":
      return "unknown";
    case "filter-regex":
      return registerMatches(step.source, "strings") ? "strings" : "records";
  }
}

export function auditRestrictedDomainPlanTypeNamespaces(
  rawPlan: RestrictedDomainPlan,
): RestrictedDomainPlanTypeNamespaceIssue[] {
  const plan = RestrictedDomainPlanSchema.parse(rawPlan);
  const issues: RestrictedDomainPlanTypeNamespaceIssue[] = [];
  const check = (
    code: RestrictedDomainPlanTypeNamespaceIssue["code"],
    stepId: string,
    registerId: string,
    expectedType: RegisterType,
  ) => {
    if (!registerMatches(registerId, expectedType)) issues.push({ code, stepId, registerId, expectedType });
  };
  for (const step of plan.steps) {
    check("step-output-namespace-mismatch", step.id, step.id, outputType(step));
    if ("when" in step && step.when) check("conditional-namespace-mismatch", step.id, step.when, "bool");
    switch (step.op) {
      case "json-pointer":
        check("input-namespace-mismatch", step.id, step.source, "json");
        break;
      case "regex-test":
      case "copy-text":
        check("input-namespace-mismatch", step.id, step.source, "text");
        break;
      case "pluck":
      case "project-records":
        check("input-namespace-mismatch", step.id, step.source, "records");
        break;
      case "filter-regex": {
        const expected = outputType(step);
        check("input-namespace-mismatch", step.id, step.source, expected);
        break;
      }
      case "set-operation":
        check("input-namespace-mismatch", step.id, step.left, "strings");
        check("input-namespace-mismatch", step.id, step.right, "strings");
        break;
      case "boolean":
        for (const input of step.inputs) check("input-namespace-mismatch", step.id, input, "bool");
        break;
      case "choose":
        check("input-namespace-mismatch", step.id, step.condition, "bool");
        break;
      case "write-text-template":
        for (const binding of step.bindings) {
          if (binding.encoding === "text" && binding.value.kind === "ref") {
            check("text-binding-namespace-mismatch", step.id, binding.value.ref, "text");
          }
        }
        break;
      default:
        break;
    }
  }
  return issues;
}

export function assertDeclaredRequiredOutputWrites(
  rawPlan: RestrictedDomainPlan,
  requiredOutputPaths: string[],
): void {
  const plan = RestrictedDomainPlanSchema.parse(rawPlan);
  for (const outputPath of requiredOutputPaths.map((path) => SafePathSchema.parse(path))) {
    const write = plan.steps.find((step) =>
      "path" in step
      && step.path === outputPath
      && ["write-json", "write-text-template", "copy-text"].includes(step.op));
    if (!write) throw new Error(`missing required output write: ${outputPath}`);
    if ("when" in write && write.when) throw new Error(`required output write is conditional: ${outputPath}`);
  }
}

const RequestIdentitySchema = z.object({
  requestSha256: Sha256Schema,
  providerPayloadSha256: Sha256Schema,
  requestChars: z.number().int().positive(),
  providerPayloadChars: z.number().int().positive(),
  toolSchemaContract: z.literal("typed-register-namespaces/v1"),
  declaredOutputPromptCount: z.number().int().positive(),
  forbiddenTaskDataLiteralCount: z.number().int().positive(),
}).strict();

export const GenericDomainPlanRepairFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-generic-repair-freeze/v1"),
  catalogId: IdentifierSchema,
  attemptId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  parents: z.object({
    attributionReport: DigestRefSchema,
    manualParityReport: DigestRefSchema,
  }).strict(),
  case: z.object({
    caseId: IdentifierSchema,
    source: DigestRefSchema,
    taskDescription: DigestRefSchema,
    taskSet: DigestRefSchema,
    manualEvaluatorModule: DigestRefSchema,
    constructionTaskId: IdentifierSchema,
    transferTaskId: IdentifierSchema,
  }).strict(),
  implementation: z.array(DigestRefSchema).min(1),
  modelRoute: z.object({
    modelId: z.string(),
    backendModel: z.string(),
    routeKind: z.literal("openai-compatible"),
    baseUrlSha256: Sha256Schema,
  }).strict(),
  request: RequestIdentitySchema,
  requiredOutputPaths: z.array(SafePathSchema).min(1),
  authorization: z.object({
    executeAllowed: z.literal(true),
    maximumPaidCalls: z.literal(1),
    retries: z.literal(0),
  }).strict(),
  summary: z.object({
    paidCalls: z.literal(0),
    authorizedPaidCalls: z.literal(1),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict();

export type GenericDomainPlanRepairFreeze = z.infer<typeof GenericDomainPlanRepairFreezeSchema>;

const AuditStatusSchema = z.enum(["passed", "failed", "not-run"]);
const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.literal(0),
}).strict();

export const GenericDomainPlanRepairReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-plan-generic-repair-report/v1"),
  catalogId: IdentifierSchema,
  attemptId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  preModelFreezeSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  caseId: IdentifierSchema,
  status: z.enum(["clean-execution-observed", "provider-failure", "post-parse-rejected", "execution-incomplete"]),
  usageStatus: z.enum(["reported", "unavailable"]),
  tokens: TokenUsageSchema.nullable(),
  durationMs: z.number().nonnegative(),
  responseMetadata: SanitizedProviderResponseMetadataSchema,
  providerFailure: z.object({
    stage: RestrictedDomainPlanSynthesisFailureStageSchema,
    failureClass: RestrictedDomainPlanSynthesisFailureClassSchema,
    detailDigest: Sha256Schema,
    httpStatus: z.number().int().min(100).max(599).nullable(),
  }).strict().nullable(),
  audits: z.object({
    leakage: AuditStatusSchema,
    constructionBinding: AuditStatusSchema,
    transferBinding: AuditStatusSchema,
    typeNamespaces: AuditStatusSchema,
    staticTypes: AuditStatusSchema,
    declaredOutputs: AuditStatusSchema,
  }).strict(),
  auditFailureDigest: Sha256Schema.nullable(),
  typeNamespaceIssueCount: z.number().int().nonnegative().nullable(),
  staticTypeIssueCount: z.number().int().nonnegative().nullable(),
  generatedPlan: DigestRefSchema.nullable(),
  parity: DomainPlanManualParityCaseReportSchema.nullable(),
  cleanAttribution: z.object({
    engineeringContaminationRemoved: z.boolean(),
    runtimeCompleteTasks: z.number().int().min(0).max(2),
    completeRequiredOutputTasks: z.number().int().min(0).max(2),
    manualSemanticParity: z.enum(["passed", "failed", "not-run"]),
  }).strict(),
  priorFrozenEvidenceRewritten: z.literal(false),
  eligibilityChanged: z.literal(false),
  summary: z.object({
    paidCalls: z.literal(1),
    providerAttempts: z.literal(1),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    rawProviderBodiesPersisted: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (report.status === "provider-failure") {
    if (!report.providerFailure || report.tokens || report.usageStatus !== "unavailable" || report.generatedPlan || report.parity) {
      context.addIssue({ code: "custom", message: "provider failure accounting is inconsistent" });
    }
  }
  if (report.status === "clean-execution-observed") {
    if (!report.generatedPlan || !report.parity || report.providerFailure || !report.tokens
      || report.staticTypeIssueCount !== 0 || report.typeNamespaceIssueCount !== 0
      || Object.values(report.audits).some((status) => status !== "passed")
      || !report.cleanAttribution.engineeringContaminationRemoved) {
      context.addIssue({ code: "custom", message: "clean execution lacks complete generic repair evidence" });
    }
  }
});

export type GenericDomainPlanRepairReport = z.infer<typeof GenericDomainPlanRepairReportSchema>;

type PreparedRepair = {
  sourceText: string;
  descriptionText: string;
  description: z.infer<typeof ThinTaskDescriptionSchema>;
  taskSet: z.infer<typeof TaskSetSchema>;
  constructionTask: z.infer<typeof TaskSetSchema>["tasks"][number];
  transferTask: z.infer<typeof TaskSetSchema>["tasks"][number];
  request: RestrictedDomainPlanRequest;
  forbidden: string[];
  requiredOutputPaths: string[];
};

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/automatic-domain-plan-generic-repair.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-generic-repair-run.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-synthesis.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan-static-types.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-manual-parity.ts",
  "src/benchmarks/skill-ir/automatic-structural-manual-checker.ts",
  "src/benchmarks/skill-ir/automatic-domain-construction.ts",
] as const;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes root: ${path}`);
  return candidate;
}

async function readPinned(rootDir: string, ref: z.infer<typeof DigestRefSchema>): Promise<Buffer> {
  const bytes = await readFile(containedPath(rootDir, ref.path));
  if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`digest mismatch for ${ref.path}`);
  return bytes;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

async function prepareRepair(rootDir: string, catalog: GenericDomainPlanRepairCatalog): Promise<PreparedRepair> {
  const [, , sourceBytes, descriptionBytes, taskSetBytes] = await Promise.all([
    readPinned(rootDir, catalog.parentAttributionReport),
    readPinned(rootDir, catalog.parentManualParityReport),
    readPinned(rootDir, catalog.source),
    readPinned(rootDir, catalog.taskDescription),
    readPinned(rootDir, catalog.taskSet),
    readPinned(rootDir, catalog.manualEvaluatorModule),
  ]);
  const sourceText = sourceBytes.toString("utf8");
  const descriptionText = descriptionBytes.toString("utf8");
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionText));
  const taskSet = TaskSetSchema.parse(JSON.parse(taskSetBytes.toString("utf8")));
  const constructionTask = taskSet.tasks.find((task) => task.id === catalog.constructionTaskId);
  const transferTask = taskSet.tasks.find((task) => task.id === catalog.transferTaskId);
  if (!constructionTask || !transferTask) throw new Error("generic repair development task pair is incomplete");
  const request = buildTypeConstrainedRestrictedDomainPlanRequest({
    sourceText,
    taskDescription: description,
    constructionTask,
    publicContractFixturePaths: catalog.publicContractFixturePaths,
  });
  const forbidden = deriveForbiddenTaskDataLiterals({
    sourceText,
    taskDescriptionText: descriptionText,
    prompt: constructionTask.prompt,
    fixtures: constructionTask.fixtures,
    publicContractFixturePaths: catalog.publicContractFixturePaths,
  });
  if (forbidden.length === 0) throw new Error("generic repair has no task-data leakage canary");
  const requiredOutputPaths = description.outputs.filter((output) => output.required).map((output) => output.path);
  if (requiredOutputPaths.length === 0) throw new Error("generic repair requires at least one declared output");
  return {
    sourceText,
    descriptionText,
    description,
    taskSet,
    constructionTask,
    transferTask,
    request,
    forbidden,
    requiredOutputPaths,
  };
}

function resolveCatalogRoute(rootDir: string, catalog: GenericDomainPlanRepairCatalog) {
  const previous = process.env.SKVM_CACHE;
  process.env.SKVM_CACHE = containedPath(rootDir, catalog.model.cacheRoot);
  invalidateConfigCache();
  try {
    return resolveRoute(catalog.model.modelId);
  } finally {
    if (previous === undefined) delete process.env.SKVM_CACHE;
    else process.env.SKVM_CACHE = previous;
    invalidateConfigCache();
  }
}

function routeIdentity(rootDir: string, catalog: GenericDomainPlanRepairCatalog) {
  const route = resolveCatalogRoute(rootDir, catalog);
  if (route.kind !== "openai-compatible" || !route.baseUrl) {
    throw new Error("generic Domain Plan repair requires an openai-compatible route");
  }
  return {
    modelId: catalog.model.modelId,
    backendModel: resolveBackendModel(catalog.model.modelId),
    routeKind: "openai-compatible" as const,
    baseUrlSha256: sha256Bytes(Buffer.from(route.baseUrl, "utf8")),
  };
}

function provider(rootDir: string, catalog: GenericDomainPlanRepairCatalog) {
  const route = resolveCatalogRoute(rootDir, catalog);
  if (route.kind !== "openai-compatible" || !route.baseUrl) {
    throw new Error("generic Domain Plan repair requires an openai-compatible route");
  }
  const apiKey = resolveRouteApiKey(route);
  if (!apiKey) throw new Error("generic Domain Plan repair route has no API key");
  return { baseUrl: route.baseUrl, apiKey, backendModel: resolveBackendModel(catalog.model.modelId) };
}

function requestIdentity(prepared: PreparedRepair, backendModel: string) {
  const requestText = jsonText(prepared.request);
  const payloadText = jsonText(buildTypeConstrainedRestrictedDomainPlanCompletionPayload({
    backendModel,
    request: prepared.request,
  }));
  return RequestIdentitySchema.parse({
    requestSha256: sha256Bytes(Buffer.from(requestText, "utf8")),
    providerPayloadSha256: sha256Bytes(Buffer.from(payloadText, "utf8")),
    requestChars: requestText.length,
    providerPayloadChars: payloadText.length,
    toolSchemaContract: "typed-register-namespaces/v1",
    declaredOutputPromptCount: prepared.requiredOutputPaths.length,
    forbiddenTaskDataLiteralCount: prepared.forbidden.length,
  });
}

export async function buildGenericDomainPlanRepairFreeze(
  rootDir: string,
  rawCatalog: GenericDomainPlanRepairCatalog,
  outDir: string,
): Promise<GenericDomainPlanRepairFreeze> {
  const catalog = GenericDomainPlanRepairCatalogSchema.parse(rawCatalog);
  if (Date.parse(catalog.measurementStartedAt) > Date.now()) throw new Error("generic repair measurement start is in the future");
  const prepared = await prepareRepair(rootDir, catalog);
  const route = routeIdentity(rootDir, catalog);
  const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
  })));
  const implementationText = (await Promise.all(IMPLEMENTATION_PATHS.map((path) =>
    readFile(containedPath(rootDir, path), "utf8")))).join("\n");
  if (implementationText.includes(`\"${catalog.caseId}\"`)) {
    throw new Error(`generic repair implementation contains case-specific branch literal ${catalog.caseId}`);
  }
  const freeze = GenericDomainPlanRepairFreezeSchema.parse({
    schemaVersion: "skill-ir-domain-plan-generic-repair-freeze/v1",
    catalogId: catalog.catalogId,
    attemptId: catalog.attemptId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog), "utf8")),
    measurementStartedAt: catalog.measurementStartedAt,
    parents: {
      attributionReport: catalog.parentAttributionReport,
      manualParityReport: catalog.parentManualParityReport,
    },
    case: {
      caseId: catalog.caseId,
      source: catalog.source,
      taskDescription: catalog.taskDescription,
      taskSet: catalog.taskSet,
      manualEvaluatorModule: catalog.manualEvaluatorModule,
      constructionTaskId: catalog.constructionTaskId,
      transferTaskId: catalog.transferTaskId,
    },
    implementation,
    modelRoute: route,
    request: requestIdentity(prepared, route.backendModel),
    requiredOutputPaths: prepared.requiredOutputPaths,
    authorization: { executeAllowed: true, maximumPaidCalls: 1, retries: 0 },
    summary: {
      paidCalls: 0,
      authorizedPaidCalls: 1,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      coreBranchDelta: 0,
    },
  });
  await atomicWrite(resolve(outDir, "pre-model-freeze.json"), jsonText(freeze));
  return freeze;
}

function emptyResponseMetadata(): z.infer<typeof SanitizedProviderResponseMetadataSchema> {
  return {
    httpStatus: null,
    responseBodyTextLength: null,
    responseBodySha256: null,
    responseJsonParsed: false,
    choiceCount: null,
    finishReason: null,
    assistantContentPresent: null,
    assistantContentTextLength: null,
    toolCallCount: null,
    requestedToolCallPresent: null,
    requestedToolCallArgumentsLength: null,
    usagePresent: null,
  };
}

function auditDigest(error: unknown): string {
  return sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"));
}

function bindingAudit(prepared: PreparedRepair, plan: RestrictedDomainPlan, task: PreparedRepair["constructionTask"]): void {
  validateRestrictedDomainPlanBindings(plan, {
    readablePaths: Object.keys(task.fixtures),
    writablePaths: prepared.description.outputs.map((output) => output.path),
  });
}

export async function runGenericDomainPlanRepair(options: {
  rootDir: string;
  catalog: GenericDomainPlanRepairCatalog;
  freeze: GenericDomainPlanRepairFreeze;
  freezePath: string;
  outDir: string;
  measurementCompletedAt?: string;
  complete?: (input: { request: RestrictedDomainPlanRequest }) => Promise<Awaited<ReturnType<typeof completeTypeConstrainedRestrictedDomainPlanOnce>>>;
}): Promise<GenericDomainPlanRepairReport> {
  const catalog = GenericDomainPlanRepairCatalogSchema.parse(options.catalog);
  const freeze = GenericDomainPlanRepairFreezeSchema.parse(options.freeze);
  const freezeBytes = await readFile(options.freezePath);
  if (sha256Bytes(freezeBytes) !== sha256Bytes(Buffer.from(jsonText(freeze), "utf8"))) {
    throw new Error("generic repair freeze file identity drift");
  }
  if (freeze.catalogSha256 !== sha256Bytes(Buffer.from(jsonText(catalog), "utf8"))) {
    throw new Error("generic repair catalog identity drift");
  }
  await Promise.all(freeze.implementation.map((entry) => readPinned(options.rootDir, entry)));
  const route = routeIdentity(options.rootDir, catalog);
  if (jsonText(route) !== jsonText(freeze.modelRoute)) throw new Error("generic repair provider identity drift");
  const prepared = await prepareRepair(options.rootDir, catalog);
  if (jsonText(requestIdentity(prepared, route.backendModel)) !== jsonText(freeze.request)) {
    throw new Error("generic repair request identity drift");
  }
  if (jsonText(prepared.requiredOutputPaths) !== jsonText(freeze.requiredOutputPaths)) {
    throw new Error("generic repair declared output identity drift");
  }

  const resolvedProvider = options.complete ? null : provider(options.rootDir, catalog);
  let status: z.infer<typeof GenericDomainPlanRepairReportSchema>["status"] = "provider-failure";
  let usageStatus: "reported" | "unavailable" = "unavailable";
  let tokens: z.infer<typeof TokenUsageSchema> | null = null;
  let durationMs = 0;
  let responseMetadata = emptyResponseMetadata();
  let providerFailure: z.infer<typeof GenericDomainPlanRepairReportSchema>["providerFailure"] = null;
  const audits = {
    leakage: "not-run",
    constructionBinding: "not-run",
    transferBinding: "not-run",
    typeNamespaces: "not-run",
    staticTypes: "not-run",
    declaredOutputs: "not-run",
  } as Record<"leakage" | "constructionBinding" | "transferBinding" | "typeNamespaces" | "staticTypes" | "declaredOutputs", z.infer<typeof AuditStatusSchema>>;
  let auditFailureDigest: string | null = null;
  let typeNamespaceIssueCount: number | null = null;
  let staticTypeIssueCount: number | null = null;
  let generatedPlan: z.infer<typeof DigestRefSchema> | null = null;
  let parity: z.infer<typeof DomainPlanManualParityCaseReportSchema> | null = null;

  let completion: Awaited<ReturnType<typeof completeTypeConstrainedRestrictedDomainPlanOnce>> | undefined;
  try {
    completion = options.complete
      ? await options.complete({ request: prepared.request })
      : await completeTypeConstrainedRestrictedDomainPlanOnce({
          ...resolvedProvider!,
          request: prepared.request,
          timeoutMs: catalog.model.timeoutMs,
        });
    usageStatus = "reported";
    tokens = completion.tokens;
    durationMs = completion.durationMs;
    responseMetadata = completion.responseMetadata;
  } catch (error) {
    if (!(error instanceof RestrictedDomainPlanSynthesisError)) throw error;
    durationMs = error.durationMs;
    responseMetadata = error.responseMetadata;
    providerFailure = {
      stage: error.stage,
      failureClass: error.failureClass,
      detailDigest: error.detailDigest,
      httpStatus: error.httpStatus,
    };
  }

  if (completion) {
    try {
      auditRestrictedDomainPlanLeakage(completion.plan, prepared.forbidden);
      audits.leakage = "passed";
    } catch (error) {
      audits.leakage = "failed";
      auditFailureDigest = auditDigest(error);
    }
    if (audits.leakage === "passed") {
      try {
        bindingAudit(prepared, completion.plan, prepared.constructionTask);
        audits.constructionBinding = "passed";
      } catch (error) {
        audits.constructionBinding = "failed";
        auditFailureDigest ??= auditDigest(error);
      }
      try {
        bindingAudit(prepared, completion.plan, prepared.transferTask);
        audits.transferBinding = "passed";
      } catch (error) {
        audits.transferBinding = "failed";
        auditFailureDigest ??= auditDigest(error);
      }
    }
    if (audits.constructionBinding === "passed" && audits.transferBinding === "passed") {
      const namespaceIssues = auditRestrictedDomainPlanTypeNamespaces(completion.plan);
      typeNamespaceIssueCount = namespaceIssues.length;
      audits.typeNamespaces = namespaceIssues.length === 0 ? "passed" : "failed";
      if (namespaceIssues.length > 0) {
        auditFailureDigest ??= sha256Bytes(Buffer.from(jsonText(namespaceIssues.map((issue) => issue.code)), "utf8"));
      }
      const staticIssues = auditRestrictedDomainPlanStaticTypes(completion.plan);
      staticTypeIssueCount = staticIssues.length;
      audits.staticTypes = staticIssues.length === 0 ? "passed" : "failed";
      if (staticIssues.length > 0) {
        auditFailureDigest ??= sha256Bytes(Buffer.from(jsonText(staticIssues.map((issue) => issue.code)), "utf8"));
      }
      try {
        assertDeclaredRequiredOutputWrites(completion.plan, prepared.requiredOutputPaths);
        audits.declaredOutputs = "passed";
      } catch (error) {
        audits.declaredOutputs = "failed";
        auditFailureDigest ??= auditDigest(error);
      }
    }

    const allAuditsPassed = Object.values(audits).every((entry) => entry === "passed");
    if (allAuditsPassed) {
      const planPath = resolve(options.outDir, "generated-plan.json");
      const planText = jsonText(completion.plan);
      await atomicWrite(planPath, planText);
      generatedPlan = {
        path: relative(options.rootDir, planPath).replaceAll("\\", "/"),
        sha256: sha256Bytes(Buffer.from(planText, "utf8")),
      };
      const parityOutputPath = resolve(options.outDir, "manual-parity.json");
      parity = await runDomainPlanManualParityCase({
        rootDir: options.rootDir,
        outputPath: parityOutputPath,
        input: {
          schemaVersion: "skill-ir-domain-plan-manual-parity-case/v1",
          caseId: catalog.caseId,
          plan: generatedPlan,
          taskDescription: catalog.taskDescription,
          taskSet: catalog.taskSet,
          manualEvaluatorModule: catalog.manualEvaluatorModule,
          taskIds: [catalog.constructionTaskId, catalog.transferTaskId],
        },
        measurementCompletedAt: options.measurementCompletedAt,
      });
      const runtimeComplete = parity.tasks.filter((task) => task.runtime.status === "complete").length;
      const completeOutputs = parity.tasks.filter((task) =>
        task.declaredOutputs.requiredPresent.length === task.declaredOutputs.required).length;
      status = runtimeComplete === 2 && completeOutputs === 2
        ? "clean-execution-observed"
        : "execution-incomplete";
    } else {
      status = "post-parse-rejected";
    }
  }

  const runtimeCompleteTasks = parity?.tasks.filter((task) => task.runtime.status === "complete").length ?? 0;
  const completeRequiredOutputTasks = parity?.tasks.filter((task) =>
    task.declaredOutputs.requiredPresent.length === task.declaredOutputs.required).length ?? 0;
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt ?? new Date().toISOString());
  if (Date.parse(completedAt) < Date.parse(catalog.measurementStartedAt)) {
    throw new Error("generic repair completion precedes measurement start");
  }
  if (Date.parse(completedAt) > Date.now()) throw new Error("generic repair completion is in the future");
  const report = GenericDomainPlanRepairReportSchema.parse({
    schemaVersion: "skill-ir-domain-plan-generic-repair-report/v1",
    catalogId: catalog.catalogId,
    attemptId: catalog.attemptId,
    catalogSha256: freeze.catalogSha256,
    preModelFreezeSha256: sha256Bytes(freezeBytes),
    measurementStartedAt: catalog.measurementStartedAt,
    measurementCompletedAt: completedAt,
    caseId: catalog.caseId,
    status,
    usageStatus,
    tokens,
    durationMs,
    responseMetadata,
    providerFailure,
    audits,
    auditFailureDigest,
    typeNamespaceIssueCount,
    staticTypeIssueCount,
    generatedPlan,
    parity,
    cleanAttribution: {
      engineeringContaminationRemoved: runtimeCompleteTasks === 2 && completeRequiredOutputTasks === 2
        && staticTypeIssueCount === 0 && typeNamespaceIssueCount === 0,
      runtimeCompleteTasks,
      completeRequiredOutputTasks,
      manualSemanticParity: parity ? parity.caseParity.status : "not-run",
    },
    priorFrozenEvidenceRewritten: false,
    eligibilityChanged: false,
    summary: {
      paidCalls: 1,
      providerAttempts: 1,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      rawProviderBodiesPersisted: 0,
      coreBranchDelta: 0,
    },
  });
  await atomicWrite(resolve(options.outDir, "report.json"), jsonText(report));
  return report;
}
