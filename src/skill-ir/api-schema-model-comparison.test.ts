import { test, expect } from "bun:test";
import { selectRequestSchemaTask, gradeSchemaPair } from "./api-schema-model-comparison";

test("model task selection is deterministic and binds the actual JSON body", () => {
  const source = { openapi: "3.0.3", paths: { "/z": { post: { requestBody: { content: { "application/json": { schema: { type: "string" } } } } } },
    "/a": { post: { requestBody: { content: { "application/json": { schema: { type: "object", required: ["id"], properties: { id: { type: "integer" }, name: { type: "string" } } } } } } } } } };
  const task = selectRequestSchemaTask(source);
  expect(task.operationKey).toBe("POST /a");
  expect(gradeSchemaPair(task.document, task.schema, { minimal: { id: 1 }, full: { id: 1, name: "x" } }).passed).toBe(2);
  expect(gradeSchemaPair(task.document, task.schema, { minimal: { id: "wrong" }, full: { id: 1 } }).passed).toBe(0);
  expect(gradeSchemaPair(task.document, task.schema, null).passed).toBe(0);
});
