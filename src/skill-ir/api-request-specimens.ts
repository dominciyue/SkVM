import { createHash } from "node:crypto";
import { parseApiTesterOperationSource, projectApiTesterOperation } from "./api-tester-operation-source";
import { verifyApiTesterProjectionDependencies } from "./api-tester-operation-coverage";
import { constructSchemaWitness } from "./api-schema-witness";
import { encodeApiParameter } from "./api-parameter-wire";

type Raw = Record<string, any>;
const record = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const ignored = (p: Raw) => p.in === "header" && ["accept", "content-type", "authorization"].includes(p.name.toLowerCase());
const blockedHeaders = ["host", "content-length", "transfer-encoding", "connection", "cookie", "trailer", "upgrade", "te"];
export type RequestSpecimen = {
  method: string; target: string; headers: Array<{ name: string; value: string }>;
  parameters: Array<{ id: string; value: unknown; wire: string }>;
  body: { mediaType: string; value: unknown; text: string } | null;
};
export type SpecimenCase = { id: string; mode: "minimal" | "full"; mediaType: string | null; omit: string | null;
  status: "constructed" | "unresolved"; reasons: string[]; request: RequestSpecimen | null; expectedHttpStatus: null };
export type SpecimenOperation = { key: string; security: unknown; servers: unknown; sourceAdvisories: unknown[];
  issues: string[]; caseInventoryComplete: boolean; cases: SpecimenCase[]; runtimeRequirements: string[] };
export type ApiRequestSpecimens = { schemaVersion: "api-request-specimens/v1"; sourceSha256: string; sourceFormat: "json" | "yaml";
  enumerationComplete: boolean; enumerationIssues: unknown[]; operations: SpecimenOperation[]; wholeSkillCompleted: false };

function dereference(document: Raw, input: unknown): Raw {
  let value = input;
  const seen = new Set<string>();
  while (record(value) && Object.hasOwn(value, "$ref")) {
    const ref = value.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref)) throw new Error("unresolved local reference");
    if (Object.keys(value).some((k) => k !== "$ref" && !["summary", "description"].includes(k))) throw new Error("reference siblings unresolved");
    seen.add(ref); value = document;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
      if (!record(value) || !Object.hasOwn(value, key)) throw new Error("missing local reference");
      value = value[key];
    }
  }
  if (!record(value)) throw new Error("expected source object");
  return value;
}

function plans(parameters: Raw[], body: Raw | null): SpecimenCase[] {
  const media = body ? Object.keys(body.content).sort() : [];
  if (parameters.length > 128 || media.length > 32) throw new Error("parameter/media planning budget");
  if (body && !media.length) throw new Error("request body has no media types");
  const result: SpecimenCase[] = [];
  const add = (mode: "minimal" | "full", mediaType: string | null, omit: string | null = null) => {
    result.push({ id: JSON.stringify([mode, mediaType, omit]), mode, mediaType, omit, status: "unresolved", reasons: [], request: null, expectedHttpStatus: null });
  };
  const minimal = body?.required === true ? media : [null];
  for (const type of minimal) {
    add("minimal", type);
    for (const p of parameters) if (p.required === true && ["query", "header"].includes(p.in) && !ignored(p)) add("minimal", type, `${p.in}:${p.name}`);
    if (body?.required === true) add("minimal", type, "body");
  }
  for (const type of body ? media : [null]) add("full", type);
  if (result.length > 512) throw new Error("case planning budget");
  return result;
}

function assemble(document: Raw, method: string, path: string, parameters: Raw[], body: Raw | null, plan: SpecimenCase): RequestSpecimen {
  if (body && !["POST", "PUT", "PATCH"].includes(method)) throw new Error("request body method semantics unsupported");
  if (!path.startsWith("/") || /[?#\s]/u.test(path)) throw new Error("unsafe source path");
  const result: RequestSpecimen = { method, target: path, headers: [], parameters: [], body: null };
  const query: string[] = [], headerNames = new Set<string>(), boundPathNames = new Set<string>();
  const tokens = [...path.matchAll(/\{([^{}]+)\}/gu)].map((m) => m[1]!);
  if (/[{}]/u.test(path.replace(/\{[^{}]+\}/gu, ""))) throw new Error("malformed source path template");
  if (!/^(?:[A-Za-z0-9._~!$&'()*+,;=:@/\-]|%[0-9A-Fa-f]{2})*$/u.test(path.replace(/\{[^{}]+\}/gu, ""))) throw new Error("source path is not a bounded URI path");
  for (const parameter of parameters) {
    const id = `${parameter.in}:${parameter.name}`;
    if (ignored(parameter)) continue;
    if (parameter.in === "path" && (parameter.required !== true || !tokens.includes(parameter.name))) throw new Error("invalid path parameter requirement/template");
    if (id === plan.omit || (plan.mode === "minimal" && parameter.required !== true)) continue;
    if (parameter.in === "cookie") throw new Error("cookie assembly unsupported");
    if (parameter.in === "header" && blockedHeaders.includes(parameter.name.toLowerCase())) throw new Error("special header assembly unsupported");
    if (parameter.content !== undefined || parameter.schema === undefined) throw new Error("parameter schema/encoding unsupported");
    const witness = constructSchemaWitness(document, parameter.schema, plan.mode);
    if (witness.status !== "constructed") throw new Error(`${id}: ${witness.status}: ${witness.reasons.join("; ")}`);
    const encoded = encodeApiParameter(parameter, witness.value);
    if (encoded.status !== "encoded") throw new Error(`${id}: ${encoded.reason}`);
    result.parameters.push({ id, value: witness.value, wire: encoded.wire });
    if (parameter.in === "path") {
      result.target = result.target.split(`{${parameter.name}}`).join(encoded.wire);
      boundPathNames.add(parameter.name);
    } else if (parameter.in === "query") query.push(encoded.wire);
    else if (parameter.in === "header") {
      const name = parameter.name.toLowerCase();
      if (headerNames.has(name)) throw new Error("case-insensitive header collision");
      headerNames.add(name); result.headers.push({ name, value: encoded.wire });
    } else throw new Error("unknown parameter location");
  }
  if (tokens.some((name) => !boundPathNames.has(name)) || /[{}]/u.test(result.target)) throw new Error("unbound path parameter");
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/iu.test(result.target)) throw new Error("dot-segment path unsupported");
  if (query.length) result.target += `?${query.join("&")}`;
  if (result.target.length > 8192) throw new Error("request target budget");
  if (plan.mediaType !== null && plan.omit !== "body") {
    if (!body || !(plan.mediaType === "application/json" || /^application\/[A-Za-z0-9._-]+\+json$/u.test(plan.mediaType))) throw new Error("body media assembly unsupported");
    const media = body.content[plan.mediaType];
    if (!record(media) || media.encoding !== undefined) throw new Error("body encoding unsupported");
    const witness = constructSchemaWitness(document, media.schema, plan.mode);
    if (witness.status !== "constructed") throw new Error(`body: ${witness.status}: ${witness.reasons.join("; ")}`);
    const text = JSON.stringify(witness.value);
    if (Buffer.byteLength(text) > 262144) throw new Error("request body budget");
    result.body = { mediaType: plan.mediaType, value: witness.value, text };
    result.headers.push({ name: "content-type", value: plan.mediaType });
  }
  result.headers.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

export function buildApiRequestSpecimens(source: string, format: "json" | "yaml"): ApiRequestSpecimens {
  const parsed = parseApiTesterOperationSource(source, format), document = parsed.document;
  if (!document || !/^3\.0\./u.test(String(document.openapi))) throw new Error("specimens require OpenAPI3.0 source");
  const report: ApiRequestSpecimens = { schemaVersion: "api-request-specimens/v1", sourceSha256: createHash("sha256").update(source).digest("hex"),
    sourceFormat: format, enumerationComplete: parsed.enumeration.complete, enumerationIssues: parsed.enumeration.unresolved, operations: [], wholeSkillCompleted: false };
  for (const operation of parsed.enumeration.operations) {
    const pathItem = (document.paths as Raw)[operation.path], original = pathItem[operation.method.toLowerCase()];
    const row: SpecimenOperation = { key: operation.key, security: structuredClone(original.security ?? document.security ?? []),
      servers: structuredClone(original.servers ?? pathItem.servers ?? document.servers ?? [{ url: "/" }]), sourceAdvisories: [],
      issues: [], caseInventoryComplete: false, cases: [], runtimeRequirements: ["origin-and-server-selection", "credentials-and-live-auth", "response-status-and-business-oracle", "schema-negative-case-assembly", "missing-path-parameter-testing", "native-output-format"] };
    report.operations.push(row);
    try {
      const projection = projectApiTesterOperation(document, operation.key);
      const deps = verifyApiTesterProjectionDependencies({ sourceDocument: document, projectedDocument: projection.document, operationKey: operation.key });
      row.sourceAdvisories = deps.sourceIssues;
      if (projection.unresolved.length) throw new Error(`source parameter inventory unresolved: ${projection.unresolved.map((i) => i.code).join(", ")}`);
      const projected = (projection.document.paths as Raw)[operation.path][operation.method.toLowerCase()];
      const parameters = (projected.parameters ?? []).map((p: unknown) => dereference(document, p)) as Raw[];
      if (parameters.some((p) => typeof p.name !== "string" || !p.name || typeof p.in !== "string")) throw new Error("parameter identity unresolved");
      const body = projected.requestBody === undefined ? null : dereference(document, projected.requestBody);
      if (body && !record(body.content)) throw new Error("request body content unresolved");
      row.cases = plans(parameters, body); row.caseInventoryComplete = true;
      for (const p of parameters.filter(ignored)) row.issues.push(`ignored OpenAPI header parameter: ${p.name}`);
      for (const plan of row.cases) {
        try {
          if (projection.unresolved.length || !deps.checks.constructionObligations || !deps.checks.projectionPreservation) throw new Error("source construction dependencies unresolved");
          plan.request = assemble(document, operation.method.toUpperCase(), operation.path, parameters, body, plan);
          plan.status = "constructed";
        } catch (error) { plan.reasons.push(String(error)); }
      }
    } catch (error) { row.issues.push(String(error)); }
  }
  return report;
}
