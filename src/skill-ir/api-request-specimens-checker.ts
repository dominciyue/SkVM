import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { independentlyEnumerateApiTesterOperations, verifyApiTesterProjectionDependencies } from "./api-tester-operation-coverage";
import { checkSchemaValue, checkSchemaWitnessShape } from "./api-schema-checker";
import { verifyApiParameterWire } from "./api-parameter-wire-checker";

type Raw = Record<string, any>;
const object = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const stable = (v: any): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : object(v)
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v) ?? "undefined";

/** Original source is the inventory/oracle. No assembler, projection or plan helper import. */
export function verifyApiRequestSpecimens(source: string, format: "json" | "yaml", report: unknown) {
  const errors = new Set<string>(), universe = independentlyEnumerateApiTesterOperations(source, format);
  let plannedCases = 0, constructedCases = 0, unresolvedCases = 0, presenceNegativeCases = 0;
  const finish = () => ({ status: errors.size ? "fail" as const : "pass" as const, errors: [...errors].sort(),
    sourceOperations: universe.operations.length, plannedCases, constructedCases, unresolvedCases, presenceNegativeCases });
  if (!object(report) || report.schemaVersion !== "api-request-specimens/v1" || report.wholeSkillCompleted !== false
    || !Array.isArray(report.operations) || !Array.isArray(report.enumerationIssues)
    || report.operations.some((r: any) => !object(r) || typeof r.key !== "string" || !Array.isArray(r.cases)
      || !Array.isArray(r.issues) || !Array.isArray(r.runtimeRequirements) || !Array.isArray(r.sourceAdvisories))) {
    errors.add("INVALID_SPECIMEN_REPORT"); return finish();
  }
  if (report.sourceSha256 !== createHash("sha256").update(source).digest("hex") || report.sourceFormat !== format) errors.add("SOURCE_BINDING_MISMATCH");
  if (!universe.complete || report.enumerationComplete !== universe.complete) errors.add("SOURCE_ENUMERATION_INCOMPLETE");
  const actualKeys = report.operations.map((o: Raw) => o.key);
  if (new Set(actualKeys).size !== actualKeys.length || stable([...actualKeys].sort()) !== stable(universe.operations.map((o) => o.key).sort())) errors.add("SOURCE_COVERAGE_MISMATCH");
  let document: Raw;
  try {
    const yaml = parseDocument(source, { uniqueKeys: true });
    if (yaml.errors.length) throw new Error("source syntax");
    document = format === "json" ? JSON.parse(source) : yaml.toJS({ maxAliasCount: 100 });
    if (!object(document) || !/^3\.0\./u.test(String(document.openapi))) throw new Error("source dialect");
  } catch { errors.add("SOURCE_PARSE_FAILED"); return finish(); }
  const resolve = (raw: any): Raw => {
    const seen = new Set<string>();
    while (object(raw) && Object.hasOwn(raw, "$ref")) {
      if (typeof raw.$ref !== "string" || !raw.$ref.startsWith("#/") || seen.has(raw.$ref)) throw new Error("reference unresolved");
      if (Object.keys(raw).some((k) => !["$ref", "summary", "description"].includes(k))) throw new Error("reference siblings");
      seen.add(raw.$ref);
      let next: any = document;
      for (const token of raw.$ref.slice(2).split("/")) {
        const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!object(next) || !Object.hasOwn(next, key)) throw new Error("reference missing");
        next = next[key];
      }
      raw = next;
    }
    if (!object(raw)) throw new Error("source object required");
    return raw;
  };
  for (const expected of universe.operations) {
    const row = report.operations.find((o: Raw) => o.key === expected.key);
    if (!row) continue;
    const split = expected.key.indexOf(" "), method = expected.key.slice(0, split), path = expected.key.slice(split + 1);
    const item = document.paths[path], operation = item[method.toLowerCase()];
    if (stable(row.security) !== stable(operation.security ?? document.security ?? [])
      || stable(row.servers) !== stable(operation.servers ?? item.servers ?? document.servers ?? [{ url: "/" }] )) errors.add("RUNTIME_SOURCE_REQUIREMENTS_LOST");
    for (const obligation of ["origin-and-server-selection", "credentials-and-live-auth", "response-status-and-business-oracle",
      "schema-negative-case-assembly", "missing-path-parameter-testing", "native-output-format"])
      if (!row.runtimeRequirements.includes(obligation)) errors.add("RESIDUAL_OBLIGATION_LOST");
    const dependency = verifyApiTesterProjectionDependencies({ sourceDocument: document, projectedDocument: document, operationKey: expected.key });
    if (stable(row.sourceAdvisories) !== stable(dependency.sourceIssues)) errors.add("SOURCE_ADVISORY_MISMATCH");
    let fields: Raw[], body: Raw | null, requirements: Array<{ mode: string; media: string | null; omit: string | null }>;
    try {
      const merged = new Map<string, Raw>();
      for (const declarations of [item.parameters ?? [], operation.parameters ?? []]) {
        if (!Array.isArray(declarations)) throw new Error("parameter declarations");
        const unique = new Set<string>();
        for (const raw of declarations) {
          const p = resolve(raw);
          if (typeof p.name !== "string" || !p.name || typeof p.in !== "string") throw new Error("parameter identity");
          const id = `${p.in}:${p.name}`;
          if (unique.has(id)) throw new Error("duplicate parameter declaration");
          unique.add(id); merged.set(id, p);
        }
      }
      fields = [...merged.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, p]) => p);
      body = operation.requestBody === undefined ? null : resolve(operation.requestBody);
      if (body && !object(body.content)) throw new Error("body content");
      const media = body ? Object.keys(body.content).sort() : [];
      if (fields.length > 128 || media.length > 32 || (body && media.length === 0)) throw new Error("planning bounds");
      requirements = [];
      for (const type of body?.required === true ? media : [null]) {
        requirements.push({ mode: "minimal", media: type, omit: null });
        for (const field of fields) if (field.required === true && ["query", "header"].includes(field.in)
          && !(field.in === "header" && ["accept", "content-type", "authorization"].includes(field.name.toLowerCase())))
          requirements.push({ mode: "minimal", media: type, omit: `${field.in}:${field.name}` });
        if (body?.required === true) requirements.push({ mode: "minimal", media: type, omit: "body" });
      }
      for (const type of body ? media : [null]) requirements.push({ mode: "full", media: type, omit: null });
      if (requirements.length > 512) throw new Error("planning bounds");
    } catch {
      if (row.caseInventoryComplete !== false || !row.issues.length || row.cases.length) errors.add("INVALID_UNRESOLVED_CASE_INVENTORY");
      continue;
    }
    plannedCases += requirements.length;
    if (row.caseInventoryComplete !== true) errors.add("CASE_INVENTORY_INCOMPLETE");
    if (row.cases.some((c: unknown) => !object(c) || typeof c.id !== "string" || !Array.isArray(c.reasons))) {
      errors.add("INVALID_SPECIMEN_CASE"); continue;
    }
    const ids = row.cases.map((c: Raw) => c.id);
    if (new Set(ids).size !== ids.length || stable([...ids].sort()) !== stable(requirements.map((p) => JSON.stringify([p.mode, p.media, p.omit])).sort())) errors.add("CASE_COVERAGE_MISMATCH");
    for (const plan of requirements) {
      const c = row.cases.find((v: Raw) => v.id === JSON.stringify([plan.mode, plan.media, plan.omit]));
      if (!c) continue;
      if (c.mode !== plan.mode || c.mediaType !== plan.media || c.omit !== plan.omit || c.expectedHttpStatus !== null) errors.add("CASE_CONTRACT_MISMATCH");
      if (c.status === "unresolved") {
        unresolvedCases++;
        if (!c.reasons.length || c.reasons.some((r: unknown) => typeof r !== "string" || !r) || c.request !== null) errors.add("UNEXPLAINED_SPECIMEN_FAILURE");
        continue;
      }
      if (c.status !== "constructed" || c.reasons.length || !object(c.request)) { errors.add("INVALID_SPECIMEN_CASE"); continue; }
      const request = c.request;
      try {
        if (body && !["POST", "PUT", "PATCH"].includes(method)) throw new Error("unsupported method/body semantics");
        if (!dependency.checks.constructionObligations || request.method !== method || typeof request.target !== "string"
          || request.target.length > 8192 || !Array.isArray(request.parameters) || !Array.isArray(request.headers)) throw new Error("request envelope/dependencies");
        const included = fields.filter((p) => !(p.in === "header" && ["accept", "content-type", "authorization"].includes(p.name.toLowerCase()))
          && `${p.in}:${p.name}` !== plan.omit && (plan.mode === "full" || p.required === true));
        const expectedIds = included.map((p) => `${p.in}:${p.name}`).sort();
        if (request.parameters.some((p: any) => !object(p) || typeof p.id !== "string" || typeof p.wire !== "string")
          || stable(request.parameters.map((p: Raw) => p.id).sort()) !== stable(expectedIds)) throw new Error("parameter presence");
        const substitutions = new Map<string, string>(), queries: string[] = [], headers: Array<{ name: string; value: string }> = [];
        for (const p of fields) if (p.in === "path" && (p.required !== true || !path.includes(`{${p.name}}`))) throw new Error("path declaration");
        for (const p of included) {
          if (p.in === "cookie" || p.content !== undefined || p.schema === undefined) throw new Error("unsupported parameter");
          if (p.in === "header" && ["host", "content-length", "transfer-encoding", "connection", "cookie", "trailer", "upgrade", "te"].includes(p.name.toLowerCase())) throw new Error("special header");
          const actual = request.parameters.find((v: Raw) => v.id === `${p.in}:${p.name}`);
          if (!checkSchemaValue(document, p.schema, actual.value).valid
            || !checkSchemaWitnessShape(document, p.schema, actual.value, plan.mode as "minimal" | "full")
            || verifyApiParameterWire(p, actual.value, actual.wire).status !== "pass") throw new Error("parameter value/wire");
          if (p.in === "path") substitutions.set(p.name, actual.wire);
          else if (p.in === "query") queries.push(actual.wire);
          else if (p.in === "header") headers.push({ name: p.name.toLowerCase(), value: actual.wire });
          else throw new Error("parameter location");
        }
        if (!path.startsWith("/") || /[?#\s]/u.test(path)) throw new Error("source path syntax");
        if (!/^(?:[A-Za-z0-9._~!$&'()*+,;=:@/\-]|%[0-9A-Fa-f]{2})*$/u.test(path.replace(/\{[^{}]+\}/gu, ""))) throw new Error("source URI path syntax");
        let target = path.replace(/\{([^{}]+)\}/gu, (_, name: string) => {
          const value = substitutions.get(name);
          if (value === undefined) throw new Error("path parameter absent");
          return value;
        });
        if (/[{}]/u.test(target) || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/iu.test(target)) throw new Error("ambiguous path");
        if (queries.length) target += `?${queries.join("&")}`;
        if (request.target !== target) throw new Error("request target differs");
        const bodyPresent = plan.media !== null && plan.omit !== "body";
        if (!bodyPresent) { if (request.body !== null) throw new Error("unexpected request body"); }
        else {
          const media = body!.content[plan.media!], actual = request.body;
          if (!object(actual) || actual.mediaType !== plan.media || typeof actual.text !== "string" || Buffer.byteLength(actual.text) > 262144
            || !(plan.media === "application/json" || /^application\/[A-Za-z0-9._-]+\+json$/u.test(plan.media!))
            || !object(media) || media.encoding !== undefined) throw new Error("body media");
          if (stable(JSON.parse(actual.text)) !== stable(actual.value)
            || parseDocument(actual.text, { uniqueKeys: true }).errors.length !== 0 || !checkSchemaValue(document, media.schema, actual.value).valid
            || !checkSchemaWitnessShape(document, media.schema, actual.value, plan.mode as "minimal" | "full")) throw new Error("body value/wire");
          headers.push({ name: "content-type", value: plan.media! });
        }
        if (new Set(headers.map((h) => h.name)).size !== headers.length || stable(request.headers) !== stable(headers.sort((a, b) => a.name.localeCompare(b.name)))) throw new Error("header layout");
        constructedCases++; if (plan.omit !== null) presenceNegativeCases++;
      } catch { errors.add(`SPECIMEN_REQUEST_MISMATCH: ${expected.key}: ${c.id}`); }
    }
  }
  return finish();
}
