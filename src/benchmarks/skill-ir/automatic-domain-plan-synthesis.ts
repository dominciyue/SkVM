import { z } from "zod";
import { ThinTaskDescriptionSchema } from "./automatic-domain-construction";
import {
  RestrictedDomainPlanSchema,
  type RestrictedDomainPlan,
} from "./automatic-restricted-domain-plan";
import { sha256Bytes } from "./source-fixture";

const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !/^(?:[A-Za-z]:[\\/]|[\\/])/u.test(value)
  && !/(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(value));

const ConstructionTaskSchema = z.object({
  id: z.string().min(1),
  split: z.literal("development"),
  prompt: z.string().min(1),
  fixtures: z.record(z.string()),
}).passthrough();

export const RestrictedDomainPlanRequestSchema = z.object({
  system: z.string().min(1),
  prompt: z.string().min(1),
  audit: z.object({
    evaluatorPayloadAccesses: z.literal(0),
    heldOutAccesses: z.literal(0),
    retries: z.literal(0),
    requestedCalls: z.literal(1),
    toolAccess: z.literal(false),
  }).strict(),
}).strict();

export type RestrictedDomainPlanRequest = z.infer<typeof RestrictedDomainPlanRequestSchema>;

const DSL_INSTRUCTIONS = `The output is skill-ir-restricted-domain-plan/v1. It has planId, 1-64 ordered steps, and audit exactly
{paidCalls:1,retries:0,heldOutAccesses:0,evaluatorPayloadAccesses:0,skillSpecificBranches:0}.
Every step has a unique lowercase-hyphen id and may only reference earlier step ids.
Allowed operations:
- read-text {path}; read-json {path}; json-pointer {source,pointer}.
- parse-key-value-lines {path,keyPattern}: returns unique sorted keys before '='.
- regex-find-files {includePathPattern,contentPattern,flags,captures}: scans only declared readable files and returns records with path plus named captures.
- regex-test {source,pattern,flags}: source must be text and result is boolean.
- pluck {source,field}; filter-regex {source,field?,pattern,flags,keep:'matching'|'non-matching'}; project-records {source,fields}.
- set-operation {operator:'intersection'|'difference'|'union',left,right}: operands are string arrays.
- boolean {operator:'and'|'or'|'not',inputs}; choose {condition,whenTrue,whenFalse}.
- write-json {path,fields:[{key,value}]}; write-text-template {path,template,bindings:[{token,value,encoding:'text'|'json'}]}; copy-text {source,path}. Write operations may have when.
Values are only {kind:'ref',ref} or scalar {kind:'literal',value}. Templates use {{token}}. No nested programs, shell, network, imports, code, loops, or undeclared paths exist.`;

export function buildRestrictedDomainPlanRequest(raw: {
  sourceText: string;
  taskDescription: unknown;
  constructionTask: unknown;
  publicContractFixturePaths: string[];
}): RestrictedDomainPlanRequest {
  const description = ThinTaskDescriptionSchema.parse(raw.taskDescription);
  const task = ConstructionTaskSchema.parse(raw.constructionTask);
  const publicContractFixturePaths = raw.publicContractFixturePaths.map((path) => SafePathSchema.parse(path));
  for (const path of publicContractFixturePaths) {
    if (!(path in task.fixtures)) throw new Error(`public contract fixture is missing: ${path}`);
  }
  const publicTask = {
    id: task.id,
    split: task.split,
    prompt: task.prompt,
    fixtures: task.fixtures,
    publicContractFixturePaths,
  };
  return RestrictedDomainPlanRequestSchema.parse({
    system: [
      "You are an ahead-of-time skill compiler. Compile public evidence into one safe declarative Domain Plan.",
      "Generalize from the construction instance: never copy task-specific secret values, variable names, document titles, long source lines, or expected answers into the plan.",
      "Use only public SKILL.md, the thin task description, the user-visible prompt, and public fixtures below. No evaluator, scorer, gold, held-out, tools, or file writes are available.",
      "Prefer an incomplete but executable plan over invented facts. Use only the closed DSL.",
    ].join(" "),
    prompt: [
      "# Closed Domain Plan DSL",
      DSL_INSTRUCTIONS,
      "# Public SKILL.md",
      raw.sourceText,
      "# Thin task description",
      JSON.stringify(description, null, 2),
      "# One public development construction instance (evaluation metadata removed)",
      JSON.stringify(publicTask, null, 2),
      "Generate one plan that reads only fixture/input paths, writes only declared output paths, derives values at runtime, and is intended to run unchanged on another development instance.",
    ].join("\n\n"),
    audit: {
      evaluatorPayloadAccesses: 0,
      heldOutAccesses: 0,
      retries: 0,
      requestedCalls: 1,
      toolAccess: false,
    },
  });
}

function tokens(text: string): string[] {
  return [
    ...text.matchAll(/TEST_ONLY_[A-Z0-9_]{4,}/gu),
    ...text.matchAll(/\b[A-Z][A-Z0-9_]{3,}\b/gu),
    ...text.matchAll(/[\p{Script=Han}][\p{Script=Han}A-Za-z0-9（）／—、，。]{7,}/gu),
  ].map((match) => match[0]);
}

export function deriveForbiddenTaskDataLiterals(options: {
  sourceText: string;
  taskDescriptionText: string;
  prompt: string;
  fixtures: Record<string, string>;
  publicContractFixturePaths: string[];
}): string[] {
  const publicPaths = new Set(options.publicContractFixturePaths.map((path) => SafePathSchema.parse(path)));
  const allowedText = [
    options.sourceText,
    options.taskDescriptionText,
    options.prompt,
    ...[...publicPaths].map((path) => options.fixtures[path] ?? ""),
  ].join("\n");
  const candidates = new Set<string>();
  for (const [path, content] of Object.entries(options.fixtures)) {
    if (publicPaths.has(path)) continue;
    for (const token of tokens(content)) candidates.add(token);
    for (const line of content.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean)) {
      if (line.length >= 8) candidates.add(line);
      const separator = line.indexOf("=");
      if (separator > 0) {
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key.length >= 4) candidates.add(key);
        if (value.length >= 4) candidates.add(value);
      }
    }
  }
  return [...candidates]
    .filter((value) => !allowedText.includes(value))
    .sort((left, right) => right.length - left.length || left.localeCompare(right, "en"));
}

export function auditRestrictedDomainPlanLeakage(
  rawPlan: RestrictedDomainPlan,
  forbiddenTaskDataLiterals: string[],
): void {
  const plan = RestrictedDomainPlanSchema.parse(rawPlan);
  const serialized = JSON.stringify(plan);
  const leaked = forbiddenTaskDataLiterals.filter((literal) => serialized.includes(literal));
  if (leaked.length > 0) {
    throw new Error(`restricted Domain Plan contains construction-task-only literal: ${leaked[0]}`);
  }
}

const MINIMAL_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "planId", "steps", "audit"],
  properties: {
    schemaVersion: { type: "string", enum: ["skill-ir-restricted-domain-plan/v1"] },
    planId: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 64,
      items: { type: "object", description: "One operation from the closed DSL described in the prompt." },
    },
    audit: {
      type: "object",
      additionalProperties: false,
      required: ["paidCalls", "retries", "heldOutAccesses", "evaluatorPayloadAccesses", "skillSpecificBranches"],
      properties: {
        paidCalls: { const: 1 },
        retries: { const: 0 },
        heldOutAccesses: { const: 0 },
        evaluatorPayloadAccesses: { const: 0 },
        skillSpecificBranches: { const: 0 },
      },
    },
  },
} as const;

const IDENTIFIER_JSON_SCHEMA = { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" } as const;
const SAFE_PATH_JSON_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 240,
  description: "Repository-relative path. Absolute paths and parent traversal are rejected by local validation.",
} as const;
const REGEX_PATTERN_JSON_SCHEMA = { type: "string", minLength: 1, maxLength: 512 } as const;
const REGEX_FLAGS_JSON_SCHEMA = {
  type: "string",
  maxLength: 6,
  description: "Unique flags drawn from g, i, m, s, and u. Local validation rejects duplicates and other flags.",
} as const;
const NULLABLE_IDENTIFIER_JSON_SCHEMA = { anyOf: [IDENTIFIER_JSON_SCHEMA, { type: "null" }] } as const;
const VALUE_EXPRESSION_JSON_SCHEMA = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "ref"],
      properties: { kind: { type: "string", enum: ["ref"] }, ref: IDENTIFIER_JSON_SCHEMA },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "value"],
      properties: {
        kind: { type: "string", enum: ["literal"] },
        value: {
          anyOf: [
            { type: "string", maxLength: 4096 },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
      },
    },
  ],
} as const;

function strictStep(
  properties: Record<string, unknown>,
  required = Object.keys(properties),
): Record<string, unknown> {
  return { type: "object", additionalProperties: false, required, properties };
}

const STRICT_STEP_SCHEMAS = [
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["read-text"] }, path: SAFE_PATH_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["read-json"] }, path: SAFE_PATH_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["json-pointer"] }, source: IDENTIFIER_JSON_SCHEMA, pointer: { type: "string", maxLength: 512, description: "RFC 6901 JSON Pointer. Local validation rejects invalid escaping." } }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["parse-key-value-lines"] }, path: SAFE_PATH_JSON_SCHEMA, keyPattern: REGEX_PATTERN_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["regex-find-files"] }, includePathPattern: REGEX_PATTERN_JSON_SCHEMA, contentPattern: REGEX_PATTERN_JSON_SCHEMA, flags: REGEX_FLAGS_JSON_SCHEMA, captures: { type: "array", minItems: 1, maxItems: 8, items: IDENTIFIER_JSON_SCHEMA } }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["regex-test"] }, source: IDENTIFIER_JSON_SCHEMA, pattern: REGEX_PATTERN_JSON_SCHEMA, flags: REGEX_FLAGS_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["pluck"] }, source: IDENTIFIER_JSON_SCHEMA, field: IDENTIFIER_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["filter-regex"] }, source: IDENTIFIER_JSON_SCHEMA, field: NULLABLE_IDENTIFIER_JSON_SCHEMA, pattern: REGEX_PATTERN_JSON_SCHEMA, flags: REGEX_FLAGS_JSON_SCHEMA, keep: { type: "string", enum: ["matching", "non-matching"] } }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["project-records"] }, source: IDENTIFIER_JSON_SCHEMA, fields: { type: "array", minItems: 1, maxItems: 8, items: IDENTIFIER_JSON_SCHEMA } }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["set-operation"] }, operator: { type: "string", enum: ["intersection", "difference", "union"] }, left: IDENTIFIER_JSON_SCHEMA, right: IDENTIFIER_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["boolean"] }, operator: { type: "string", enum: ["and", "or", "not"] }, inputs: { type: "array", minItems: 1, maxItems: 8, items: IDENTIFIER_JSON_SCHEMA } }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["choose"] }, condition: IDENTIFIER_JSON_SCHEMA, whenTrue: VALUE_EXPRESSION_JSON_SCHEMA, whenFalse: VALUE_EXPRESSION_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["write-json"] }, path: SAFE_PATH_JSON_SCHEMA, fields: { type: "array", minItems: 1, maxItems: 64, items: strictStep({ key: { type: "string", minLength: 1, maxLength: 128 }, value: VALUE_EXPRESSION_JSON_SCHEMA }) }, when: NULLABLE_IDENTIFIER_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["write-text-template"] }, path: SAFE_PATH_JSON_SCHEMA, template: { type: "string", maxLength: 16_384 }, bindings: { type: "array", maxItems: 32, items: strictStep({ token: IDENTIFIER_JSON_SCHEMA, value: VALUE_EXPRESSION_JSON_SCHEMA, encoding: { type: "string", enum: ["text", "json"] } }) }, when: NULLABLE_IDENTIFIER_JSON_SCHEMA }),
  strictStep({ id: IDENTIFIER_JSON_SCHEMA, op: { type: "string", enum: ["copy-text"] }, source: IDENTIFIER_JSON_SCHEMA, path: SAFE_PATH_JSON_SCHEMA, when: NULLABLE_IDENTIFIER_JSON_SCHEMA }),
] as const;

const STRICT_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "planId", "steps", "audit"],
  properties: {
    schemaVersion: { type: "string", enum: ["skill-ir-restricted-domain-plan/v1"] },
    planId: IDENTIFIER_JSON_SCHEMA,
    steps: { type: "array", minItems: 1, maxItems: 64, items: { anyOf: STRICT_STEP_SCHEMAS } },
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

export const RestrictedDomainPlanToolSchemaModeSchema = z.enum([
  "shape-minimal",
  "domain-plan-strict",
]);

export type RestrictedDomainPlanToolSchemaMode = z.infer<typeof RestrictedDomainPlanToolSchemaModeSchema>;

export function buildRestrictedDomainPlanCompletionPayload(options: {
  backendModel: string;
  request: RestrictedDomainPlanRequest;
  toolSchemaMode?: RestrictedDomainPlanToolSchemaMode;
}): any {
  const request = RestrictedDomainPlanRequestSchema.parse(options.request);
  const mode = RestrictedDomainPlanToolSchemaModeSchema.parse(options.toolSchemaMode ?? "shape-minimal");
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
        description: "Submit the complete restricted Domain Plan and no prose.",
        parameters: mode === "domain-plan-strict" ? STRICT_TOOL_SCHEMA : MINIMAL_TOOL_SCHEMA,
        ...(mode === "domain-plan-strict" ? { strict: true as const } : {}),
      },
    }],
    tool_choice: { type: "function", function: { name: "submit_restricted_domain_plan" } },
  };
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const RestrictedDomainPlanSynthesisFailureStageSchema = z.enum([
  "transport",
  "http",
  "response-json",
  "tool-call",
  "arguments-json",
  "plan-schema",
]);

export type RestrictedDomainPlanSynthesisFailureStage = z.infer<
  typeof RestrictedDomainPlanSynthesisFailureStageSchema
>;

export const RestrictedDomainPlanSynthesisFailureClassSchema = z.enum([
  "http-or-network",
  "content-or-missing-tool-call",
  "strict-schema-reject",
  "json-parse-failure",
]);

export type RestrictedDomainPlanSynthesisFailureClass = z.infer<
  typeof RestrictedDomainPlanSynthesisFailureClassSchema
>;

export const SanitizedProviderResponseMetadataSchema = z.object({
  httpStatus: z.number().int().min(100).max(599).nullable(),
  responseBodyTextLength: z.number().int().nonnegative().nullable(),
  responseBodySha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  responseJsonParsed: z.boolean(),
  choiceCount: z.number().int().nonnegative().nullable(),
  finishReason: z.string().max(64).nullable(),
  assistantContentPresent: z.boolean().nullable(),
  assistantContentTextLength: z.number().int().nonnegative().nullable(),
  toolCallCount: z.number().int().nonnegative().nullable(),
  requestedToolCallPresent: z.boolean().nullable(),
  requestedToolCallArgumentsLength: z.number().int().nonnegative().nullable(),
  usagePresent: z.boolean().nullable(),
}).strict();

export type SanitizedProviderResponseMetadata = z.infer<typeof SanitizedProviderResponseMetadataSchema>;

function emptyResponseMetadata(): SanitizedProviderResponseMetadata {
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

function failureClassForStage(
  stage: RestrictedDomainPlanSynthesisFailureStage,
): RestrictedDomainPlanSynthesisFailureClass {
  if (stage === "transport" || stage === "http") return "http-or-network";
  if (stage === "tool-call") return "content-or-missing-tool-call";
  if (stage === "plan-schema") return "strict-schema-reject";
  return "json-parse-failure";
}

export class RestrictedDomainPlanSynthesisError extends Error {
  readonly stage: RestrictedDomainPlanSynthesisFailureStage;
  readonly failureClass: RestrictedDomainPlanSynthesisFailureClass;
  readonly durationMs: number;
  readonly detailDigest: string;
  readonly httpStatus: number | null;
  readonly responseMetadata: SanitizedProviderResponseMetadata;

  constructor(options: {
    stage: RestrictedDomainPlanSynthesisFailureStage;
    durationMs: number;
    detail: string;
    httpStatus?: number;
    responseMetadata?: SanitizedProviderResponseMetadata;
  }) {
    super(`restricted Domain Plan synthesis failed at ${options.stage}`);
    this.name = "RestrictedDomainPlanSynthesisError";
    this.stage = options.stage;
    this.failureClass = failureClassForStage(options.stage);
    this.durationMs = options.durationMs;
    this.detailDigest = sha256Bytes(Buffer.from(options.detail, "utf8"));
    this.httpStatus = options.httpStatus ?? null;
    this.responseMetadata = SanitizedProviderResponseMetadataSchema.parse(
      options.responseMetadata ?? emptyResponseMetadata(),
    );
  }
}

function synthesisFailure(
  stage: RestrictedDomainPlanSynthesisFailureStage,
  started: number,
  detail: unknown,
  httpStatus?: number,
  responseMetadata?: SanitizedProviderResponseMetadata,
): RestrictedDomainPlanSynthesisError {
  return new RestrictedDomainPlanSynthesisError({
    stage,
    durationMs: performance.now() - started,
    detail: detail instanceof Error ? `${detail.name}:${detail.message}` : String(detail),
    httpStatus,
    responseMetadata,
  });
}

function normalizeStrictProviderPlan(rawPlan: unknown): unknown {
  if (typeof rawPlan !== "object" || rawPlan === null || Array.isArray(rawPlan)) return rawPlan;
  const record = structuredClone(rawPlan) as Record<string, unknown>;
  if (!Array.isArray(record.steps)) return record;
  record.steps = record.steps.map((rawStep) => {
    if (typeof rawStep !== "object" || rawStep === null || Array.isArray(rawStep)) return rawStep;
    const step = { ...rawStep } as Record<string, unknown>;
    if (step.when === null) delete step.when;
    if (step.field === null) delete step.field;
    return step;
  });
  return record;
}

export async function completeRestrictedDomainPlanOnce(options: {
  baseUrl: string;
  apiKey: string;
  backendModel: string;
  request: RestrictedDomainPlanRequest;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  toolSchemaMode?: RestrictedDomainPlanToolSchemaMode;
}) {
  const request = RestrictedDomainPlanRequestSchema.parse(options.request);
  const fetchImpl = options.fetchImpl ?? fetch;
  const toolSchemaMode = RestrictedDomainPlanToolSchemaModeSchema.parse(options.toolSchemaMode ?? "shape-minimal");
  const started = performance.now();
  const responseMetadata = emptyResponseMetadata();
  let response: Response;
  try {
    response = await fetchImpl(`${options.baseUrl.replace(/\/+$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(buildRestrictedDomainPlanCompletionPayload({
        backendModel: options.backendModel,
        request,
        toolSchemaMode,
      })),
      signal: AbortSignal.timeout(options.timeoutMs ?? 660_000),
    });
  } catch (error) {
    throw synthesisFailure("transport", started, error, undefined, responseMetadata);
  }
  responseMetadata.httpStatus = response.status;
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    throw synthesisFailure("transport", started, error, response.status, responseMetadata);
  }
  responseMetadata.responseBodyTextLength = bodyText.length;
  responseMetadata.responseBodySha256 = sha256Bytes(Buffer.from(bodyText, "utf8"));
  if (!response.ok) throw synthesisFailure("http", started, bodyText, response.status, responseMetadata);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
    responseMetadata.responseJsonParsed = true;
  } catch (error) {
    throw synthesisFailure("response-json", started, error, response.status, responseMetadata);
  }
  const choices = Array.isArray(body.choices) ? body.choices as Array<Record<string, unknown>> : undefined;
  responseMetadata.choiceCount = choices?.length ?? 0;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const finishReason = choices?.[0]?.finish_reason;
  responseMetadata.finishReason = typeof finishReason === "string" ? finishReason.slice(0, 64) : null;
  const content = message?.content;
  responseMetadata.assistantContentPresent = message ? typeof content === "string" && content.length > 0 : null;
  responseMetadata.assistantContentTextLength = message ? (typeof content === "string" ? content.length : 0) : null;
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls as Array<Record<string, unknown>> : undefined;
  responseMetadata.toolCallCount = toolCalls?.length ?? 0;
  const requestedToolCall = toolCalls?.find((toolCall) => {
    const fn = toolCall.function as Record<string, unknown> | undefined;
    return fn?.name === "submit_restricted_domain_plan";
  });
  responseMetadata.requestedToolCallPresent = requestedToolCall !== undefined;
  const requestedFunction = requestedToolCall?.function as Record<string, unknown> | undefined;
  responseMetadata.requestedToolCallArgumentsLength = typeof requestedFunction?.arguments === "string"
    ? requestedFunction.arguments.length
    : null;
  responseMetadata.usagePresent = typeof body.usage === "object" && body.usage !== null;
  if (!toolCalls || toolCalls.length !== 1) {
    throw synthesisFailure("tool-call", started, "response did not contain exactly one tool call", response.status, responseMetadata);
  }
  const toolCall = toolCalls[0]!;
  const fn = toolCall.function as Record<string, unknown> | undefined;
  if (fn?.name !== "submit_restricted_domain_plan" || typeof fn.arguments !== "string") {
    throw synthesisFailure("tool-call", started, "response contained wrong tool call name or argument type", response.status, responseMetadata);
  }
  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(fn.arguments);
  } catch (error) {
    throw synthesisFailure("arguments-json", started, error, response.status, responseMetadata);
  }
  if (toolSchemaMode === "domain-plan-strict") rawPlan = normalizeStrictProviderPlan(rawPlan);
  let plan: RestrictedDomainPlan;
  try {
    plan = RestrictedDomainPlanSchema.parse(rawPlan);
  } catch (error) {
    throw synthesisFailure("plan-schema", started, error, response.status, responseMetadata);
  }
  const usage = body.usage as {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | undefined;
  const promptTotal = usage?.prompt_tokens ?? 0;
  const cacheRead = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    plan,
    providerAttempts: 1 as const,
    logicalPaidCalls: 1 as const,
    tokens: {
      input: Math.max(0, promptTotal - cacheRead),
      output: usage?.completion_tokens ?? 0,
      cacheRead,
      cacheWrite: 0 as const,
    },
    durationMs: performance.now() - started,
    responseMetadata: SanitizedProviderResponseMetadataSchema.parse(responseMetadata),
  };
}
