import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { parseApiTesterOperationSource } from "./api-tester-operation-source";
import { createResponseSchemaChecker, type SchemaValueCheck } from "./api-schema-checker";

type Raw = Record<string, any>;
const object = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export type ApiResponseObservation = { operationKey: string; statusCode: number; mediaType: string; bodyText: string };

/** Checks supplied, already-decoded JSON observations. Performs no request or status prediction. */
export function checkApiResponseObservation(source: string, format: "json" | "yaml", observation: unknown) {
  const result = { sourceSha256: sha(source), sourceFormat: format, observationSha256: null as string | null,
    status: "unresolved" as "checked" | "unresolved" | "invalid-observation", valid: null as boolean | null,
    responseKey: null as string | null, mediaKey: null as string | null, sourceEnumerationComplete: false,
    schemaCheck: null as SchemaValueCheck | null, errors: [] as string[], statusTriggerVerified: false,
    wholeSkillCompleted: false, remainingObligations: ["response-headers", "content-encoding", "bodyless-responses",
      "business-state-and-status-trigger", "live-observation-provenance", "credentials-and-auth", "native-output-format"] };
  if (!object(observation) || typeof observation.operationKey !== "string" || !Number.isInteger(observation.statusCode)
    || observation.statusCode < 100 || observation.statusCode > 599 || typeof observation.mediaType !== "string"
    || typeof observation.bodyText !== "string" || Buffer.byteLength(observation.bodyText) > 1048576) {
    result.status = "invalid-observation"; result.errors.push("INVALID_OBSERVATION_ENVELOPE"); return result;
  }
  result.observationSha256 = sha(JSON.stringify([observation.operationKey, observation.statusCode, observation.mediaType, observation.bodyText]));
  let value: unknown;
  try {
    value = JSON.parse(observation.bodyText);
    if (parseDocument(observation.bodyText, { uniqueKeys: true }).errors.length) throw new Error("duplicate names");
    const stack: Array<[unknown, number]> = [[value, 0]];
    let nodes = 0;
    while (stack.length) {
      const [item, depth] = stack.pop()!;
      if (++nodes > 10000 || depth > 64) throw new Error("observation structure budget");
      if (typeof item === "number" && (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))) throw new Error("unsafe numeric observation");
      if (item && typeof item === "object") for (const child of Object.values(item)) stack.push([child, depth + 1]);
    }
  } catch { result.status = "invalid-observation"; result.errors.push("INVALID_JSON_OBSERVATION"); return result; }
  try {
    const parsed = parseApiTesterOperationSource(source, format), document = parsed.document;
    result.sourceEnumerationComplete = parsed.enumeration.complete;
    if (!document || !/^3\.0\./u.test(String(document.openapi))) throw new Error("OpenAPI3.0 source required");
    const operation = parsed.enumeration.operations.find((o) => o.key === observation.operationKey);
    if (!operation) throw new Error("source operation unavailable");
    const declaration = (document.paths as Raw)[operation.path][operation.method.toLowerCase()], responses = declaration.responses;
    if (!object(responses) || Object.keys(responses).some((k) => !/^(?:[1-5][0-9]{2}|[1-5]XX|default|x-.+)$/u.test(k))) throw new Error("response map unsupported");
    const exact = String(observation.statusCode), range = `${Math.floor(observation.statusCode / 100)}XX`;
    const key = Object.hasOwn(responses, exact) ? exact : Object.hasOwn(responses, range) ? range : Object.hasOwn(responses, "default") ? "default" : null;
    if (key === null) { result.status = "checked"; result.valid = false; result.errors.push("RESPONSE_STATUS_UNDECLARED"); return result; }
    result.responseKey = key;
    if (operation.method.toUpperCase() === "HEAD" || observation.statusCode < 200 || [204, 205, 304].includes(observation.statusCode)) throw new Error("bodyless response semantics outside JSON observation contract");
    let response: unknown = responses[key];
    const seen = new Set<string>();
    while (object(response) && Object.hasOwn(response, "$ref")) {
      const ref = response.$ref;
      if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref) || seen.size >= 32
        || Object.keys(response).some((k) => !["$ref", "summary", "description"].includes(k))) throw new Error("response reference unsupported");
      seen.add(ref); response = document;
      for (const part of ref.slice(2).split("/")) {
        if (/~(?:[^01]|$)/u.test(part)) throw new Error("invalid response reference pointer");
        const token = part.replaceAll("~1", "/").replaceAll("~0", "~");
        if (!object(response) || !Object.hasOwn(response, token)) throw new Error("missing response reference");
        response = response[token];
      }
    }
    if (!object(response) || typeof response.description !== "string" || !object(response.content)) throw new Error("response body declaration unavailable");
    const media = observation.mediaType.toLowerCase();
    if (!/^application\/(?:json|[a-z0-9._-]+\+json)$/u.test(media)) throw new Error("observed media outside exact JSON contract");
    const matches = Object.keys(response.content).filter((k) => k.toLowerCase() === media);
    if (matches.length > 1) throw new Error("ambiguous case-normalized response media");
    if (!matches.length) {
      if (Object.keys(response.content).some((k) => k.includes("*"))) throw new Error("response media ranges unsupported");
      result.status = "checked"; result.valid = false; result.errors.push("RESPONSE_MEDIA_UNDECLARED"); return result;
    }
    result.mediaKey = matches[0]!;
    const content = response.content[result.mediaKey];
    if (!object(content) || content.schema === undefined || content.encoding !== undefined) throw new Error("response schema/encoding unavailable");
    result.schemaCheck = createResponseSchemaChecker(document, content.schema)(value);
    if (result.schemaCheck.status !== "checked") { result.errors.push("RESPONSE_SCHEMA_UNRESOLVED"); return result; }
    result.status = "checked"; result.valid = result.schemaCheck.valid;
    if (!result.valid) result.errors.push("RESPONSE_SCHEMA_MISMATCH");
  } catch (error) { result.errors.push(`RESPONSE_SOURCE_UNRESOLVED: ${String(error)}`); }
  return result;
}
