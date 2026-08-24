import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { invalidateConfigCache } from "../../core/config";
import { resolveBackendModel, resolveRoute, resolveRouteApiKey } from "../../providers/registry";
import {
  completeRestrictedDomainPlanOnce,
  RestrictedDomainPlanRequestSchema,
  RestrictedDomainPlanSynthesisError,
  RestrictedDomainPlanSynthesisFailureStageSchema,
  type RestrictedDomainPlanRequest,
} from "./automatic-domain-plan-synthesis";
import { RestrictedDomainPlanSchema, type RestrictedDomainPlan } from "./automatic-restricted-domain-plan";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const DigestRefSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

export const RestrictedDomainPlanTransportCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-transport-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  model: z.object({
    modelId: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9._-]+$/u),
    cacheRoot: SafePathSchema,
    timeoutMs: z.number().int().min(60_000).max(900_000),
    calls: z.literal(1),
    retries: z.literal(0),
  }).strict(),
}).strict();

export type RestrictedDomainPlanTransportCatalog = z.infer<typeof RestrictedDomainPlanTransportCatalogSchema>;

export const RestrictedDomainPlanTransportFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-transport-freeze/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  implementation: z.array(DigestRefSchema).min(1),
  modelRoute: z.object({
    modelId: z.string(),
    backendModel: z.string(),
    routeKind: z.literal("openai-compatible"),
    baseUrlSha256: Sha256Schema,
  }).strict(),
  requestSha256: Sha256Schema,
  expectedPlanSha256: Sha256Schema,
  authorization: z.object({
    executeAllowed: z.literal(true),
    maximumPaidCalls: z.literal(1),
    retries: z.literal(0),
  }).strict(),
  summary: z.object({
    paidCalls: z.literal(0),
    authorizedPaidCalls: z.literal(1),
    retries: z.literal(0),
    taskPayloadAccesses: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
  }).strict(),
}).strict();

export type RestrictedDomainPlanTransportFreeze = z.infer<typeof RestrictedDomainPlanTransportFreezeSchema>;

const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.literal(0),
}).strict();

const FailureSchema = z.object({
  stage: RestrictedDomainPlanSynthesisFailureStageSchema,
  durationMs: z.number().nonnegative(),
  detailDigest: Sha256Schema,
  httpStatus: z.number().int().min(100).max(599).nullable(),
}).strict();

export const RestrictedDomainPlanTransportReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan-transport-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  preModelFreezeSha256: Sha256Schema,
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  status: z.enum(["passed", "failed"]),
  paidCalls: z.literal(1),
  providerAttempts: z.literal(1),
  retries: z.literal(0),
  usageStatus: z.enum(["reported", "unavailable"]),
  tokens: TokenUsageSchema.nullable(),
  durationMs: z.number().nonnegative(),
  returnedPlanSha256: Sha256Schema.nullable(),
  canonicalPlanMatched: z.boolean().nullable(),
  failure: FailureSchema.nullable(),
  historicalTaskFailuresReclassified: z.literal(false),
  conclusion: z.enum([
    "persistent-forced-tool-contract-compatible",
    "forced-tool-qualification-failed",
  ]),
  summary: z.object({
    paidCalls: z.literal(1),
    retries: z.literal(0),
    taskPayloadAccesses: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (report.status === "passed") {
    if (report.usageStatus !== "reported" || !report.tokens || !report.returnedPlanSha256
      || report.canonicalPlanMatched === null || report.failure !== null
      || report.conclusion !== "persistent-forced-tool-contract-compatible") {
      context.addIssue({ code: "custom", message: "passed transport report lacks success evidence" });
    }
  } else if (report.usageStatus !== "unavailable" || report.tokens !== null
    || report.returnedPlanSha256 !== null || report.canonicalPlanMatched !== null
    || !report.failure || report.conclusion !== "forced-tool-qualification-failed") {
    context.addIssue({ code: "custom", message: "failed transport report lacks typed failure evidence" });
  }
});

export type RestrictedDomainPlanTransportReport = z.infer<typeof RestrictedDomainPlanTransportReportSchema>;

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-synthesis.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification.ts",
  "src/benchmarks/skill-ir/automatic-domain-plan-transport-qualification-run.ts",
] as const;

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function containedPath(rootDir: string, path: string): string {
  const candidate = resolve(rootDir, path);
  const fromRoot = relative(resolve(rootDir), candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes repository root: ${path}`);
  return candidate;
}

function assertMeasurementStartNotFuture(measurementStartedAt: string): void {
  if (Date.parse(measurementStartedAt) > Date.now()) {
    throw new Error("restricted Domain Plan transport measurement start is in the future");
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

function resolveCatalogRoute(rootDir: string, catalog: RestrictedDomainPlanTransportCatalog) {
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

function resolveProvider(rootDir: string, catalog: RestrictedDomainPlanTransportCatalog) {
  const route = resolveCatalogRoute(rootDir, catalog);
  if (route.kind !== "openai-compatible" || !route.baseUrl) {
    throw new Error("restricted Domain Plan transport requires openai-compatible route with baseUrl");
  }
  const apiKey = resolveRouteApiKey(route);
  if (!apiKey) throw new Error("restricted Domain Plan transport route has no API key");
  return { baseUrl: route.baseUrl, apiKey, backendModel: resolveBackendModel(catalog.model.modelId) };
}

function routeIdentity(rootDir: string, catalog: RestrictedDomainPlanTransportCatalog) {
  const route = resolveCatalogRoute(rootDir, catalog);
  if (route.kind !== "openai-compatible" || !route.baseUrl) {
    throw new Error("restricted Domain Plan transport requires openai-compatible route with baseUrl");
  }
  return {
    modelId: catalog.model.modelId,
    backendModel: resolveBackendModel(catalog.model.modelId),
    routeKind: "openai-compatible" as const,
    baseUrlSha256: sha256Bytes(Buffer.from(route.baseUrl, "utf8")),
  };
}

export function buildRestrictedDomainPlanTransportRequest(): {
  request: RestrictedDomainPlanRequest;
  expectedPlan: RestrictedDomainPlan;
} {
  const expectedPlan = RestrictedDomainPlanSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan/v1",
    planId: "transport-qualification",
    steps: [
      { id: "read-input", op: "read-text", path: "input.txt" },
      { id: "write-output", op: "copy-text", source: "read-input", path: "output.txt" },
    ],
    audit: {
      paidCalls: 1,
      retries: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      skillSpecificBranches: 0,
    },
  });
  const request = RestrictedDomainPlanRequestSchema.parse({
    system: "This is a transport qualification, not a domain task. Submit one forced tool call and no prose.",
    prompt: `Submit this exact canonical plan as the function arguments:\n${JSON.stringify(expectedPlan, null, 2)}`,
    audit: {
      evaluatorPayloadAccesses: 0,
      heldOutAccesses: 0,
      retries: 0,
      requestedCalls: 1,
      toolAccess: false,
    },
  });
  return { request, expectedPlan };
}

export async function buildRestrictedDomainPlanTransportFreeze(
  rootDir: string,
  rawCatalog: RestrictedDomainPlanTransportCatalog,
  outDir: string,
): Promise<RestrictedDomainPlanTransportFreeze> {
  const catalog = RestrictedDomainPlanTransportCatalogSchema.parse(rawCatalog);
  assertMeasurementStartNotFuture(catalog.measurementStartedAt);
  const canonical = buildRestrictedDomainPlanTransportRequest();
  const implementation = await Promise.all(IMPLEMENTATION_PATHS.map(async (path) => ({
    path,
    sha256: sha256Bytes(await readFile(containedPath(rootDir, path))),
  })));
  const freeze = RestrictedDomainPlanTransportFreezeSchema.parse({
    schemaVersion: "skill-ir-restricted-domain-plan-transport-freeze/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog), "utf8")),
    measurementStartedAt: catalog.measurementStartedAt,
    implementation,
    modelRoute: routeIdentity(rootDir, catalog),
    requestSha256: sha256Bytes(Buffer.from(jsonText(canonical.request), "utf8")),
    expectedPlanSha256: sha256Bytes(Buffer.from(jsonText(canonical.expectedPlan), "utf8")),
    authorization: { executeAllowed: true, maximumPaidCalls: 1, retries: 0 },
    summary: {
      paidCalls: 0,
      authorizedPaidCalls: 1,
      retries: 0,
      taskPayloadAccesses: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
    },
  });
  await atomicWrite(resolve(outDir, "pre-model-freeze.json"), jsonText(freeze));
  return freeze;
}

export async function runRestrictedDomainPlanTransportQualification(options: {
  rootDir: string;
  catalog: RestrictedDomainPlanTransportCatalog;
  freeze: RestrictedDomainPlanTransportFreeze;
  freezePath: string;
  reportPath: string;
  measurementCompletedAt: string;
  complete?: (input: { request: RestrictedDomainPlanRequest }) => Promise<Awaited<ReturnType<typeof completeRestrictedDomainPlanOnce>>>;
}): Promise<RestrictedDomainPlanTransportReport> {
  const catalog = RestrictedDomainPlanTransportCatalogSchema.parse(options.catalog);
  const freeze = RestrictedDomainPlanTransportFreezeSchema.parse(options.freeze);
  assertMeasurementStartNotFuture(catalog.measurementStartedAt);
  const completedAt = z.string().datetime().parse(options.measurementCompletedAt);
  if (freeze.measurementStartedAt !== catalog.measurementStartedAt) throw new Error("transport measurement identity drift");
  if (Date.parse(completedAt) < Date.parse(catalog.measurementStartedAt)) throw new Error("transport completion precedes start");
  const freezeBytes = await readFile(options.freezePath);
  if (sha256Bytes(freezeBytes) !== sha256Bytes(Buffer.from(jsonText(freeze), "utf8"))) {
    throw new Error("transport freeze file identity drift");
  }
  if (freeze.catalogSha256 !== sha256Bytes(Buffer.from(jsonText(catalog), "utf8"))) {
    throw new Error("transport catalog identity drift");
  }
  await Promise.all(freeze.implementation.map(async (ref) => {
    const bytes = await readFile(containedPath(options.rootDir, ref.path));
    if (sha256Bytes(bytes) !== ref.sha256) throw new Error(`transport implementation digest mismatch for ${ref.path}`);
  }));
  const canonical = buildRestrictedDomainPlanTransportRequest();
  if (sha256Bytes(Buffer.from(jsonText(canonical.request), "utf8")) !== freeze.requestSha256
    || sha256Bytes(Buffer.from(jsonText(canonical.expectedPlan), "utf8")) !== freeze.expectedPlanSha256) {
    throw new Error("transport canonical request identity drift");
  }
  const currentRoute = routeIdentity(options.rootDir, catalog);
  if (jsonText(currentRoute) !== jsonText(freeze.modelRoute)) throw new Error("transport provider identity drift");

  const provider = options.complete ? null : resolveProvider(options.rootDir, catalog);
  const summary = {
    paidCalls: 1 as const,
    retries: 0 as const,
    taskPayloadAccesses: 0 as const,
    heldOutAccesses: 0 as const,
    evaluatorPayloadAccesses: 0 as const,
  };
  let report: RestrictedDomainPlanTransportReport;
  try {
    const completion = options.complete
      ? await options.complete({ request: canonical.request })
      : await completeRestrictedDomainPlanOnce({
          ...provider!,
          request: canonical.request,
          timeoutMs: catalog.model.timeoutMs,
        });
    const returnedPlanSha256 = sha256Bytes(Buffer.from(jsonText(completion.plan), "utf8"));
    report = RestrictedDomainPlanTransportReportSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan-transport-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: freeze.catalogSha256,
      preModelFreezeSha256: sha256Bytes(freezeBytes),
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      status: "passed",
      paidCalls: 1,
      providerAttempts: 1,
      retries: 0,
      usageStatus: "reported",
      tokens: completion.tokens,
      durationMs: completion.durationMs,
      returnedPlanSha256,
      canonicalPlanMatched: returnedPlanSha256 === freeze.expectedPlanSha256,
      failure: null,
      historicalTaskFailuresReclassified: false,
      conclusion: "persistent-forced-tool-contract-compatible",
      summary,
    });
  } catch (error) {
    const failure = error instanceof RestrictedDomainPlanSynthesisError
      ? error
      : new RestrictedDomainPlanSynthesisError({
          stage: "transport",
          durationMs: 0,
          detail: error instanceof Error ? `${error.name}:${error.message}` : String(error),
        });
    report = RestrictedDomainPlanTransportReportSchema.parse({
      schemaVersion: "skill-ir-restricted-domain-plan-transport-report/v1",
      catalogId: catalog.catalogId,
      catalogSha256: freeze.catalogSha256,
      preModelFreezeSha256: sha256Bytes(freezeBytes),
      measurementStartedAt: catalog.measurementStartedAt,
      measurementCompletedAt: completedAt,
      status: "failed",
      paidCalls: 1,
      providerAttempts: 1,
      retries: 0,
      usageStatus: "unavailable",
      tokens: null,
      durationMs: failure.durationMs,
      returnedPlanSha256: null,
      canonicalPlanMatched: null,
      failure: {
        stage: failure.stage,
        durationMs: failure.durationMs,
        detailDigest: failure.detailDigest,
        httpStatus: failure.httpStatus,
      },
      historicalTaskFailuresReclassified: false,
      conclusion: "forced-tool-qualification-failed",
      summary,
    });
  }
  await atomicWrite(options.reportPath, jsonText(report));
  return report;
}
