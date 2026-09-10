import { test, expect } from "bun:test";
import { checkApiResponseObservation } from "./api-response-observation";

const response = (value: string) => ({ description: "Synthetic", content: { "application/json": { schema: {
  type: "object", required: ["id", "secret"], additionalProperties: false, properties: {
    id: { type: "string", enum: [value], readOnly: true }, secret: { type: "string", writeOnly: true },
  },
} } } });
const doc = { openapi: "3.0.3", info: { title: "Synthetic observed response", version: "1" },
  paths: { "/items": { get: { responses: { "200": response("exact"), "2XX": response("range"), default: response("default") } } } } };
const source = JSON.stringify(doc);
const observation = (statusCode: number, value: string) => ({ operationKey: "GET /items", statusCode, mediaType: "application/json", bodyText: JSON.stringify({ id: value }) });

test("observed response selects exact before range before default without guessing a status trigger", () => {
  for (const [status, value, key] of [[200, "exact", "200"], [201, "range", "2XX"], [418, "default", "default"]] as const) {
    const result = checkApiResponseObservation(source, "json", observation(status, value));
    expect(result.status).toBe("checked"); expect(result.valid).toBe(true);
    expect(result.responseKey).toBe(key); expect(result.statusTriggerVerified).toBe(false);
  }
  expect(checkApiResponseObservation(source, "json", observation(200, "range")).valid).toBe(false);
  expect(checkApiResponseObservation(source, "json", { ...observation(200, "exact"), bodyText: '{"id":"exact","secret":"leak"}' }).valid).toBe(false);
});

test("response observations separate source blockers, mismatches and malformed JSON", () => {
  const missing = structuredClone(doc) as any; delete missing.paths["/items"].get.responses.default;
  expect(checkApiResponseObservation(JSON.stringify(missing), "json", observation(418, "default")).errors).toContain("RESPONSE_STATUS_UNDECLARED");
  expect(checkApiResponseObservation(source, "json", { ...observation(200, "exact"), mediaType: "application/unknown+json" }).errors).toContain("RESPONSE_MEDIA_UNDECLARED");
  const ref = structuredClone(doc) as any; ref.paths["/items"].get.responses["200"] = { $ref: "#/components/responses/Missing" };
  expect(checkApiResponseObservation(JSON.stringify(ref), "json", observation(200, "exact")).status).toBe("unresolved");
  expect(checkApiResponseObservation(source, "json", { ...observation(200, "exact"), bodyText: '{"id":"wrong","id":"exact"}' }).errors).toContain("INVALID_JSON_OBSERVATION");
  expect(checkApiResponseObservation(source, "json", { ...observation(200, "exact"), bodyText: '{"id":9007199254740993}' }).status).toBe("invalid-observation");
  const a = checkApiResponseObservation(source, "json", observation(200, "exact"));
  const b = checkApiResponseObservation(source, "json", observation(201, "range"));
  expect(a.observationSha256).not.toBe(b.observationSha256);
});
