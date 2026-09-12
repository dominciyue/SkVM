import { describe, expect, test } from "bun:test";
import { buildApiTaskArtifact } from "./api-task-artifact";
import { verifyApiTaskArtifact } from "./api-task-artifact-checker";

const SOURCE = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Task artifact fixture", version: "1" },
  paths: {
    "/items/{id}": {
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string", enum: ["item-1"] } },
        { in: "query", name: "view", required: true, schema: { type: "string", enum: ["full"] } },
      ],
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                additionalProperties: false,
                properties: { name: { type: "string", minLength: 2, enum: ["ok"] } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "fixture response",
            headers: { "X-Count": { required: true, schema: { type: "integer", minimum: 1 } } },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  additionalProperties: false,
                  properties: { status: { type: "string", enum: ["ok"] } },
                },
              },
            },
          },
        },
      },
    },
  },
});

const ROOT_URI = "https://fixture.invalid/openapi.json";

function contract(output: "request-json" | "pytest" = "request-json") {
  return {
    schemaVersion: "skvm-api-task/v1",
    taskId: `artifact-${output}`,
    profile: "oas30-offline-test/v1",
    input: { path: "openapi.json", format: "json", dialect: "oas3.0" },
    dependencyManifest: null,
    operationKeys: ["POST /items/{id}"],
    requirements: [
      { id: "minimal", kind: "valid-minimal", required: true, scope: "each-selected-operation", sourceLocator: "fixture:1" },
      { id: "full", kind: "valid-full", required: true, scope: "each-selected-operation", sourceLocator: "fixture:2" },
      { id: "omission", kind: "required-omission", required: true, scope: "each-selected-operation", sourceLocator: "fixture:3" },
      { id: "negative", kind: "constraint-negative", required: true, scope: "each-selected-operation", sourceLocator: "fixture:4" },
      { id: "response", kind: "response-conformance", required: true, scope: "each-selected-operation", sourceLocator: "fixture:5" },
    ],
    output,
    observations: { path: "observation.json", provenance: "fixture" },
    execution: output === "pytest" ? { mode: "loopback", oraclePath: "oracle.json" } : { mode: "offline-validation" },
    mapping: { origin: "user-declared", sourceSkill: null, unresolvedRequirementIds: [] },
  };
}

const OBSERVATIONS = [{
  operationKey: "POST /items/{id}",
  statusCode: 200,
  mediaType: "application/json",
  bodyText: JSON.stringify({ status: "ok" }),
  headers: [{ name: "X-Count", value: "1" }],
}];

const options = (task: ReturnType<typeof contract>) => ({
  task,
  sourceText: SOURCE,
  rootUri: ROOT_URI,
  observations: OBSERVATIONS,
  sourceRepository: "fixture/repository",
});

describe("API TaskContract artifact package", () => {
  test("connects a checked plan to source-bound request JSON without hiding unsupported targets", async () => {
    const input = options(contract("request-json"));
    const artifact = await buildApiTaskArtifact(input);
    const checked = await verifyApiTaskArtifact({ ...input, artifact });
    expect(checked.status).toBe("pass");
    expect(artifact.backend.kind).toBe("request-json");
    expect(artifact.obligationResults.some((row) => row.status === "checked-exported")).toBe(true);
    expect(artifact.obligationResults.find((row) => row.targetId === "path:id")?.status).toBe("unresolved");
    expect(artifact.completion.taskComplete).toBe(false);
    expect(artifact.accounting).toEqual({ loopbackHttpCalls: 0, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 });
  });

  test("emits the fixed pytest runtime with complete source suite data and task selection", async () => {
    const input = options(contract("pytest"));
    const artifact = await buildApiTaskArtifact(input);
    const checked = await verifyApiTaskArtifact({ ...input, artifact });
    expect(checked.status).toBe("pass");
    expect(artifact.backend.kind).toBe("pytest");
    if (artifact.backend.kind !== "pytest") throw new Error("expected pytest backend");
    expect(artifact.backend.artifact.testPython).toContain("SUITE_SHA256");
    expect(JSON.parse(artifact.backend.artifact.suiteJson).rows.length).toBeGreaterThan(0);
    expect(artifact.runtimeDependencies).toContain("python>=3.11");
    expect(artifact.obligationResults.find((row) => row.requirementKind === "constraint-negative")?.status).toBe("unresolved");
  });

  test("independent checker detects omitted outcomes, wrong operations, closure changes, and request wire tampering", async () => {
    const input = options(contract("request-json"));
    const original = await buildApiTaskArtifact(input);

    const omitted = structuredClone(original);
    omitted.obligationResults.splice(0, 1);
    expect((await verifyApiTaskArtifact({ ...input, artifact: omitted })).errors).toContain("ARTIFACT_OBLIGATION_COVERAGE_MISMATCH");

    const wrongOperation = structuredClone(original);
    wrongOperation.plan.obligations[0]!.operationKey = "POST /wrong";
    expect((await verifyApiTaskArtifact({ ...input, artifact: wrongOperation })).errors.some((error) => error.startsWith("PLAN:"))).toBe(true);

    const wrongRef = structuredClone(original);
    const reference = wrongRef.sourceClosure.references[0];
    if (reference) reference.targetPointer = "#/wrong";
    else wrongRef.sourceClosure.source.sha256 = "0".repeat(64);
    expect((await verifyApiTaskArtifact({ ...input, artifact: wrongRef })).errors).toContain("SOURCE_CLOSURE_BINDING_MISMATCH");

    const wrongWire = structuredClone(original);
    if (wrongWire.backend.kind !== "request-json") throw new Error("expected request-json backend");
    const row = wrongWire.backend.requests.find((candidate) => candidate.requestJson !== null)!;
    const request = JSON.parse(row.requestJson!);
    request.target = "/tampered";
    row.requestJson = JSON.stringify(request);
    expect((await verifyApiTaskArtifact({ ...input, artifact: wrongWire })).errors).toContain("REQUEST_ARTIFACT_BINDING_MISMATCH");
  });

  test("does not accept a tampered negative witness or an unbound pytest suite", async () => {
    const requestInput = options(contract("request-json"));
    const wrongNegative = await buildApiTaskArtifact(requestInput);
    const negativeCase = wrongNegative.evidence.bodyNegatives.operations.flatMap((operation) => operation.cases)
      .find((row) => row.status === "constructed")!;
    negativeCase.request!.body!.text = JSON.stringify({ name: "ok" });
    expect((await verifyApiTaskArtifact({ ...requestInput, artifact: wrongNegative })).errors)
      .toContain("BODY_NEGATIVES:NEGATIVE_REQUEST_MISMATCH");

    const pytestInput = options(contract("pytest"));
    const wrongSuite = await buildApiTaskArtifact(pytestInput);
    if (wrongSuite.backend.kind !== "pytest") throw new Error("expected pytest backend");
    wrongSuite.backend.artifact.suiteJson = wrongSuite.backend.artifact.suiteJson.replace("item-1", "item-2");
    expect((await verifyApiTaskArtifact({ ...pytestInput, artifact: wrongSuite })).errors.some((error) => error.startsWith("PYTEST:"))).toBe(true);
  });
});
