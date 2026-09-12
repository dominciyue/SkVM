import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { analyzeApiTaskSourceClosure } from "./api-tester-source-closure";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const ROOT_URI = "https://api.example.test/contracts/openapi.yaml";

function task(options: { response?: boolean; operationKeys?: string[] } = {}) {
  const requirements: any[] = [{
    id: "request",
    kind: "valid-minimal",
    required: true,
    scope: "each-selected-operation",
    sourceLocator: "fixture:request",
  }];
  if (options.response) requirements.push({
    id: "response",
    kind: "response-conformance",
    required: true,
    scope: "each-selected-operation",
    sourceLocator: "fixture:response",
  });
  return {
    schemaVersion: "skvm-api-task/v1",
    taskId: "closure-fixture",
    profile: "oas30-offline-test/v1",
    input: { path: "openapi.yaml", format: "yaml", dialect: "oas3.0" },
    dependencyManifest: "dependencies.json",
    operationKeys: options.operationKeys ?? ["POST /items"],
    requirements,
    output: "request-json",
    observations: options.response ? { path: "observations.json", provenance: "fixture" } : null,
    execution: { mode: "offline-validation" },
    mapping: { origin: "user-declared", sourceSkill: null, unresolvedRequirementIds: [] },
  };
}

function source(requestRef: string, responseRef = "#/components/schemas/Result") {
  return `openapi: 3.0.3
info: { title: closure, version: 1 }
paths:
  /items:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '${requestRef}'
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                $ref: '${responseRef}'
components:
  schemas:
    Result: { type: object }
`;
}

function dependencies(rows: Array<{ uri: string; path: string; text: string; format?: "json" | "yaml" }>) {
  return {
    manifest: {
      schemaVersion: "skvm-api-dependency-manifest/v1",
      rootUri: ROOT_URI,
      resources: rows.map((row) => ({ uri: row.uri, path: row.path, format: row.format ?? "yaml", sha256: sha(row.text) })),
    },
    payloads: Object.fromEntries(rows.map((row) => [row.path, row.text])),
  };
}

describe("task-relevant API source closure", () => {
  test("missing local request reference blocks only its dependent operation requirements", () => {
    const report = analyzeApiTaskSourceClosure({
      task: task(), sourceText: source("#/components/schemas/Missing"), rootUri: ROOT_URI,
      dependencyManifest: dependencies([]).manifest, dependencyPayloads: {},
    });
    expect(report.status).toBe("blocked");
    expect(report.references).toContainEqual(expect.objectContaining({
      reference: "#/components/schemas/Missing",
      resolution: "pointer-missing",
      severity: "blocking",
      dependentRequirementIds: ["request"],
      affectedOperations: ["POST /items"],
    }));
    expect(report.requirements).toContainEqual(expect.objectContaining({ requirementId: "request", status: "blocked-source" }));
  });

  test("keeps an unaffected operation source-ready when another operation loses a dependency", () => {
    const mixed = `openapi: 3.0.3
info: { title: mixed, version: 1 }
paths:
  /broken:
    post:
      requestBody: { $ref: '#/components/requestBodies/Missing' }
      responses: { '200': { description: ok } }
  /healthy:
    post:
      requestBody:
        required: true
        content: { application/json: { schema: { type: object } } }
      responses: { '200': { description: ok } }
`;
    const report = analyzeApiTaskSourceClosure({
      task: task({ operationKeys: ["POST /broken", "POST /healthy"] }), sourceText: mixed, rootUri: ROOT_URI,
      dependencyManifest: dependencies([]).manifest, dependencyPayloads: {},
    });
    expect(report.operationRequirements).toContainEqual(expect.objectContaining({ operationKey: "POST /broken", requirementId: "request", status: "blocked-source" }));
    expect(report.operationRequirements).toContainEqual(expect.objectContaining({ operationKey: "POST /healthy", requirementId: "request", status: "source-ready" }));
  });

  test("resolves pinned external request and response references while keeping their roles distinct", () => {
    const dep = dependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml", text: "Input: { type: object }\nResult: { type: object }\n" }]);
    const report = analyzeApiTaskSourceClosure({
      task: task({ response: true }), sourceText: source("./common.yaml#/Input", "./common.yaml#/Result"), rootUri: ROOT_URI,
      dependencyManifest: dep.manifest, dependencyPayloads: dep.payloads,
    });
    expect(report.status).toBe("passed");
    expect(report.references.filter((row) => row.acquisitionStatus === "pinned-local")).toHaveLength(2);
    expect(report.references.find((row) => row.role === "request")?.dependentRequirementIds).toEqual(["request"]);
    expect(report.references.find((row) => row.role === "response")?.dependentRequirementIds).toEqual(["response"]);
  });

  test("resolves relative URIs against the document that contains the reference", () => {
    const dep = dependencies([
      { uri: "https://api.example.test/contracts/models/request.yaml", path: "deps/request.yaml", text: "Request:\n  $ref: '../shared.yaml#/Input'\n" },
      { uri: "https://api.example.test/contracts/shared.yaml", path: "deps/shared.yaml", text: "Input: { type: string }\n" },
    ]);
    const report = analyzeApiTaskSourceClosure({
      task: task(), sourceText: source("./models/request.yaml#/Request"), rootUri: ROOT_URI,
      dependencyManifest: dep.manifest, dependencyPayloads: dep.payloads,
    });
    expect(report.status).toBe("passed");
    expect(report.references).toContainEqual(expect.objectContaining({
      originUri: "https://api.example.test/contracts/models/request.yaml",
      reference: "../shared.yaml#/Input",
      targetUri: "https://api.example.test/contracts/shared.yaml",
      targetPointer: "#/Input",
      resolution: "resolved",
    }));
  });

  test("deduplicates a shared dependency without deleting reference occurrences", () => {
    const twoOperations = `openapi: 3.0.3
info: { title: shared, version: 1 }
paths:
  /a:
    post:
      requestBody: { $ref: './common.yaml#/Body' }
      responses: { '200': { description: ok } }
  /b:
    post:
      requestBody: { $ref: './common.yaml#/Body' }
      responses: { '200': { description: ok } }
`;
    const dep = dependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml", text: "Body: { required: true, content: { application/json: { schema: { type: object } } } }\n" }]);
    const report = analyzeApiTaskSourceClosure({
      task: task({ operationKeys: ["POST /a", "POST /b"] }), sourceText: twoOperations, rootUri: ROOT_URI,
      dependencyManifest: dep.manifest, dependencyPayloads: dep.payloads,
    });
    expect(report.summary.externalResourcesLoaded).toBe(1);
    expect(report.summary.referenceOccurrences).toBe(2);
    expect(report.summary.uniqueReferenceTargets).toBe(1);
  });

  test("reports structural recursion as resolved source but unresolved finite witness", () => {
    const dep = dependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml", text: `Node:
  type: object
  properties:
    child:
      $ref: '#/Node'
` }]);
    const report = analyzeApiTaskSourceClosure({
      task: task(), sourceText: source("./common.yaml#/Node"), rootUri: ROOT_URI,
      dependencyManifest: dep.manifest, dependencyPayloads: dep.payloads,
    });
    expect(report.status).toBe("partial");
    expect(report.references).toContainEqual(expect.objectContaining({ resolution: "recursive-resolved", sourceStatus: "resolved", witnessStatus: "unresolved-recursion-budget" }));
    expect(report.requirements).toContainEqual(expect.objectContaining({ requirementId: "request", status: "unresolved-witness" }));
  });

  test("rejects a pure reference cycle that has no structural base", () => {
    const dep = dependencies([
      { uri: "https://api.example.test/contracts/a.yaml", path: "deps/a.yaml", text: "A: { $ref: './b.yaml#/B' }\n" },
      { uri: "https://api.example.test/contracts/b.yaml", path: "deps/b.yaml", text: "B: { $ref: './a.yaml#/A' }\n" },
    ]);
    const report = analyzeApiTaskSourceClosure({
      task: task(), sourceText: source("./a.yaml#/A"), rootUri: ROOT_URI,
      dependencyManifest: dep.manifest, dependencyPayloads: dep.payloads,
    });
    expect(report.status).toBe("blocked");
    expect(report.references).toContainEqual(expect.objectContaining({ resolution: "reference-cycle", sourceStatus: "unresolved", severity: "blocking" }));
  });

  test("keeps unresolved response references advisory until response conformance is required", () => {
    const requestOnly = analyzeApiTaskSourceClosure({
      task: task(), sourceText: source("#/components/schemas/Result", "https://missing.example.test/response.yaml#/Result"), rootUri: ROOT_URI,
      dependencyManifest: dependencies([]).manifest, dependencyPayloads: {},
    });
    const responseRequired = analyzeApiTaskSourceClosure({
      task: task({ response: true }), sourceText: source("#/components/schemas/Result", "https://missing.example.test/response.yaml#/Result"), rootUri: ROOT_URI,
      dependencyManifest: dependencies([]).manifest, dependencyPayloads: {},
    });
    expect(requestOnly.references.find((row) => row.role === "response")).toMatchObject({ resolution: "resource-missing", severity: "advisory", dependentRequirementIds: [] });
    expect(requestOnly.status).toBe("passed-with-advisory");
    expect(responseRequired.references.find((row) => row.role === "response")).toMatchObject({ severity: "blocking", dependentRequirementIds: ["response"] });
    expect(responseRequired.status).toBe("blocked");
  });

  test("separates pointer failure, OAS 3.0 reference siblings, and unsupported dialect", () => {
    const dep = dependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml", text: "Input: { type: object }\n" }]);
    const pointer = analyzeApiTaskSourceClosure({ task: task(), sourceText: source("./common.yaml#/Absent"), rootUri: ROOT_URI, dependencyManifest: dep.manifest, dependencyPayloads: dep.payloads });
    expect(pointer.references).toContainEqual(expect.objectContaining({ resolution: "pointer-missing", acquisitionStatus: "pinned-local" }));

    const siblingSource = source("./common.yaml#/Input").replace("$ref: './common.yaml#/Input'", "$ref: './common.yaml#/Input'\n              description: sibling");
    const sibling = analyzeApiTaskSourceClosure({ task: task(), sourceText: siblingSource, rootUri: ROOT_URI, dependencyManifest: dep.manifest, dependencyPayloads: dep.payloads });
    expect(sibling.references).toContainEqual(expect.objectContaining({ resolution: "sibling-semantics-unsupported", severity: "blocking" }));

    const dialect = analyzeApiTaskSourceClosure({ task: task(), sourceText: source("#/components/schemas/Result").replace("3.0.3", "3.1.0"), rootUri: ROOT_URI, dependencyManifest: dependencies([]).manifest, dependencyPayloads: {} });
    expect(dialect).toMatchObject({ status: "blocked", profileStatus: "unsupported-dialect" });
  });
});
