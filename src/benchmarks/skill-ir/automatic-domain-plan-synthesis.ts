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

const TOOL_SCHEMA = {
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

export class RestrictedDomainPlanSynthesisError extends Error {
  readonly stage: RestrictedDomainPlanSynthesisFailureStage;
  readonly durationMs: number;
  readonly detailDigest: string;
  readonly httpStatus: number | null;

  constructor(options: {
    stage: RestrictedDomainPlanSynthesisFailureStage;
    durationMs: number;
    detail: string;
    httpStatus?: number;
  }) {
    super(`restricted Domain Plan synthesis failed at ${options.stage}`);
    this.name = "RestrictedDomainPlanSynthesisError";
    this.stage = options.stage;
    this.durationMs = options.durationMs;
    this.detailDigest = sha256Bytes(Buffer.from(options.detail, "utf8"));
    this.httpStatus = options.httpStatus ?? null;
  }
}

function synthesisFailure(
  stage: RestrictedDomainPlanSynthesisFailureStage,
  started: number,
  detail: unknown,
  httpStatus?: number,
): RestrictedDomainPlanSynthesisError {
  return new RestrictedDomainPlanSynthesisError({
    stage,
    durationMs: performance.now() - started,
    detail: detail instanceof Error ? `${detail.name}:${detail.message}` : String(detail),
    httpStatus,
  });
}

export async function completeRestrictedDomainPlanOnce(options: {
  baseUrl: string;
  apiKey: string;
  backendModel: string;
  request: RestrictedDomainPlanRequest;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}) {
  const request = RestrictedDomainPlanRequestSchema.parse(options.request);
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchImpl(`${options.baseUrl.replace(/\/+$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
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
            parameters: TOOL_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_restricted_domain_plan" } },
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 660_000),
    });
  } catch (error) {
    throw synthesisFailure("transport", started, error);
  }
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    throw synthesisFailure("transport", started, error);
  }
  if (!response.ok) throw synthesisFailure("http", started, bodyText, response.status);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch (error) {
    throw synthesisFailure("response-json", started, error);
  }
  const choices = body.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const toolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
  if (!toolCalls || toolCalls.length !== 1) {
    throw synthesisFailure("tool-call", started, "response did not contain exactly one tool call");
  }
  const toolCall = toolCalls[0]!;
  const fn = toolCall.function as Record<string, unknown> | undefined;
  if (fn?.name !== "submit_restricted_domain_plan" || typeof fn.arguments !== "string") {
    throw synthesisFailure("tool-call", started, "response contained wrong tool call name or argument type");
  }
  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(fn.arguments);
  } catch (error) {
    throw synthesisFailure("arguments-json", started, error);
  }
  let plan: RestrictedDomainPlan;
  try {
    plan = RestrictedDomainPlanSchema.parse(rawPlan);
  } catch (error) {
    throw synthesisFailure("plan-schema", started, error);
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
  };
}
