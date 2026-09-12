import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { buildApiTaskArtifact, type ApiTaskArtifactObservation, type ApiTaskArtifactPackage } from "./api-task-artifact";
import { verifyApiTaskArtifact } from "./api-task-artifact-checker";
import { verifyApiPytestOracle } from "./api-pytest-oracle";
import { checkApiResponseObservation } from "./api-response-observation";
import { checkApiResponseHeaders } from "./api-response-headers";

const execute = promisify(execFile);
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

export type CurrentV2FixtureRequestObservation = {
  method: string;
  target: string;
  headers: Record<string, string>;
  body: string;
  valid: boolean;
  statusCode: number;
};

export type CurrentV2LoopbackFixture = {
  id: "json-reference" | "form-wire";
  source: string;
  task: Record<string, any>;
  observations: ApiTaskArtifactObservation[];
  expectedCases: Record<string, { statusCode: number; mediaType: string; bodyText: string }>;
  respond(request: Request): Promise<{ observation: CurrentV2FixtureRequestObservation; response: Response }>;
};

function responseSchema(property: string, value: string) {
  return {
    type: "object",
    required: [property],
    additionalProperties: false,
    properties: { [property]: { type: "string", enum: [value] } },
  };
}

function task(input: {
  id: string;
  requirements: Array<{ id: string; kind: string; sourceLocator: string }>;
  observations: boolean;
}) {
  return {
    schemaVersion: "skvm-api-task/v1",
    taskId: input.id,
    profile: "oas30-offline-test/v1",
    input: { path: "openapi.json", format: "json", dialect: "oas3.0" },
    dependencyManifest: null,
    operationKeys: "all",
    requirements: input.requirements.map((row) => ({ ...row, required: true, scope: "each-selected-operation" })),
    output: "pytest",
    observations: input.observations ? { path: "observation.json", provenance: "fixture" } : null,
    execution: { mode: "loopback", oraclePath: "oracle.json" },
    mapping: { origin: "user-declared", sourceSkill: null, unresolvedRequirementIds: [] },
  };
}

export function currentV2LoopbackFixtures(): CurrentV2LoopbackFixture[] {
  const jsonSource = JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Independent JSON reference fixture", version: "1" },
    components: {
      schemas: {
        ItemInput: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name: { type: "string", minLength: 2, enum: ["ok"] } },
        },
      },
    },
    paths: {
      "/items/{id}": {
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "string", enum: ["item-1"] } },
          { in: "query", name: "view", required: true, schema: { type: "string", enum: ["full"] } },
        ],
        post: {
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ItemInput" } } } },
          responses: {
            "200": {
              description: "hand-written success rule",
              headers: { "X-Count": { required: true, schema: { type: "integer", minimum: 1 } } },
              content: { "application/json": { schema: responseSchema("status", "ok") } },
            },
          },
        },
      },
    },
  });
  const jsonBody = JSON.stringify({ status: "ok" });
  const jsonFixture: CurrentV2LoopbackFixture = {
    id: "json-reference",
    source: jsonSource,
    task: task({
      id: "n5-json-reference",
      observations: true,
      requirements: [
        { id: "minimal", kind: "valid-minimal", sourceLocator: "fixture:json/minimal" },
        { id: "full", kind: "valid-full", sourceLocator: "fixture:json/full" },
        { id: "response", kind: "response-conformance", sourceLocator: "fixture:json/response" },
      ],
    }),
    observations: [{
      operationKey: "POST /items/{id}", statusCode: 200, mediaType: "application/json", bodyText: jsonBody,
      headers: [{ name: "X-Count", value: "1" }],
    }],
    expectedCases: {
      '["minimal","application/json",null]': { statusCode: 200, mediaType: "application/json", bodyText: jsonBody },
      '["full","application/json",null]': { statusCode: 200, mediaType: "application/json", bodyText: jsonBody },
    },
    async respond(request) {
      const url = new URL(request.url);
      const body = await request.text();
      const target = `${url.pathname}${url.search}`;
      const valid = request.method === "POST" && target === "/items/item-1?view=full"
        && request.headers.get("content-type") === "application/json" && body === JSON.stringify({ name: "ok" });
      const statusCode = valid ? 200 : 409;
      return {
        observation: {
          method: request.method,
          target,
          headers: { "content-type": request.headers.get("content-type") ?? "" },
          body,
          valid,
          statusCode,
        },
        response: new Response(valid ? jsonBody : JSON.stringify({ status: "invalid" }), {
          status: statusCode,
          headers: { "content-type": "application/json", "x-count": "1" },
        }),
      };
    },
  };

  const formSource = JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Independent form wire fixture", version: "1" },
    paths: {
      "/forms/{id}": {
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "string", enum: ["a/b"] } },
          { in: "query", name: "q", required: true, style: "form", explode: true, schema: { type: "string", enum: ["a&b"] } },
          { in: "header", name: "X-Trace", required: true, schema: { type: "string", enum: ["trace-1"] } },
        ],
        post: {
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  required: ["label"],
                  properties: { label: { type: "string", enum: ["a&中文 +"] } },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "hand-written form acceptance rule",
              content: { "application/json": { schema: responseSchema("kind", "accepted") } },
            },
          },
        },
      },
    },
  });
  const formBody = JSON.stringify({ kind: "accepted" });
  const formFixture: CurrentV2LoopbackFixture = {
    id: "form-wire",
    source: formSource,
    task: task({
      id: "n5-form-wire",
      observations: false,
      requirements: [
        { id: "minimal", kind: "valid-minimal", sourceLocator: "fixture:form/minimal" },
        { id: "full", kind: "valid-full", sourceLocator: "fixture:form/full" },
      ],
    }),
    observations: [],
    expectedCases: {
      '["minimal","application/x-www-form-urlencoded",null]': { statusCode: 200, mediaType: "application/json", bodyText: formBody },
      '["full","application/x-www-form-urlencoded",null]': { statusCode: 200, mediaType: "application/json", bodyText: formBody },
    },
    async respond(request) {
      const url = new URL(request.url);
      const target = `${url.pathname}${url.search}`;
      const body = await request.text();
      const valid = request.method === "POST" && target === "/forms/a%2Fb?q=a%26b"
        && request.headers.get("x-trace") === "trace-1"
        && request.headers.get("content-type") === "application/x-www-form-urlencoded"
        && body === "label=a%26%E4%B8%AD%E6%96%87+%2B";
      const statusCode = valid ? 200 : 409;
      return {
        observation: {
          method: request.method,
          target,
          headers: {
            "content-type": request.headers.get("content-type") ?? "",
            "x-trace": request.headers.get("x-trace") ?? "",
          },
          body,
          valid,
          statusCode,
        },
        response: new Response(valid ? formBody : JSON.stringify({ kind: "invalid" }), {
          status: statusCode,
          headers: { "content-type": "application/json" },
        }),
      };
    },
  };
  return [jsonFixture, formFixture];
}

function parseJUnit(xml: string) {
  const tag = /<testsuite\b[^>]*>/u.exec(xml)?.[0];
  if (!tag) throw new Error("pytest JUnit testsuite element missing");
  const number = (name: string) => Number(new RegExp(`\\b${name}="([0-9]+)"`, "u").exec(tag)?.[1] ?? "0");
  const tests = number("tests"), failures = number("failures"), errors = number("errors"), skipped = number("skipped");
  return { tests, executed: tests - skipped, passed: tests - skipped - failures - errors, failed: failures, errors, skipped };
}

async function runPytest(options: { pythonExecutable: string; directory: string; oraclePath: string }) {
  const junitPath = join(options.directory, "pytest.junit.xml");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    HTTP_PROXY: "http://127.0.0.1:1",
    HTTPS_PROXY: "http://127.0.0.1:1",
    ALL_PROXY: "http://127.0.0.1:1",
    NO_PROXY: "",
    SKVM_PYTEST_ORACLE: options.oraclePath,
  };
  try {
    const output = await execute(options.pythonExecutable, [
      "-X", "utf8", "-I", "-B", "-m", "pytest", "-q", "-p", "no:cacheprovider",
      `--confcutdir=${options.directory}`, `--junitxml=${junitPath}`, "test_api_requests.py",
    ], { cwd: options.directory, env: environment, windowsHide: true, encoding: "utf8", timeout: 30_000, maxBuffer: 16_777_216 });
    return { exitCode: 0, stdout: output.stdout, stderr: output.stderr, junit: parseJUnit(await readFile(junitPath, "utf8")) };
  } catch (error) {
    const failure = error as any;
    const xml = await readFile(junitPath, "utf8").catch(() => "");
    return {
      exitCode: failure.code ?? null,
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? failure.message),
      junit: xml ? parseJUnit(xml) : { tests: 0, executed: 0, passed: 0, failed: 0, errors: 1, skipped: 0 },
    };
  }
}

async function runFixture(definition: CurrentV2LoopbackFixture, options: { outputDirectory: string; pythonExecutable: string }) {
  const directory = join(options.outputDirectory, definition.id);
  await mkdir(directory, { recursive: true });
  const rootUri = `https://fixtures.invalid/${definition.id}/openapi.json`;
  const artifact = await buildApiTaskArtifact({
    task: definition.task,
    sourceText: definition.source,
    rootUri,
    observations: definition.observations,
    sourceRepository: "synthetic/n5-fixtures",
  });
  const packageCheck = await verifyApiTaskArtifact({
    task: definition.task,
    sourceText: definition.source,
    rootUri,
    observations: definition.observations,
    sourceRepository: "synthetic/n5-fixtures",
    artifact,
  });
  if (artifact.backend.kind !== "pytest") throw new Error(`${definition.id}: pytest package was not emitted`);
  const suite = JSON.parse(artifact.backend.artifact.suiteJson);
  const selectedRows = artifact.backend.selectedRowIds.map((id) => suite.rows.find((row: any) => row.id === id));
  if (selectedRows.some((row) => !row || row.status !== "constructed")) throw new Error(`${definition.id}: selected pytest row unavailable`);
  const requestObservations: CurrentV2FixtureRequestObservation[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const result = await definition.respond(request);
      requestObservations.push(result.observation);
      return result.response;
    },
  });
  const fixtureSha256 = sha(stable({
    fixtureId: definition.id,
    sourceSha256: sha(definition.source),
    expectedCases: definition.expectedCases,
    predicateContract: "hand-written-v1",
  }));
  const oracle = {
    schemaVersion: "api-pytest-loopback-oracle/v1",
    suiteSha256: sha(artifact.backend.artifact.suiteJson),
    fixtureSha256,
    origin: `http://127.0.0.1:${server.port}`,
    cases: selectedRows.map((row: any) => {
      const expected = definition.expectedCases[row.caseId];
      if (!expected) throw new Error(`${definition.id}: no hand-written expectation for ${row.caseId}`);
      return { id: row.id, requestSha256: sha(row.requestJson), response: expected };
    }),
  };
  let oracleCheck: Awaited<ReturnType<typeof verifyApiPytestOracle>>;
  let run: Awaited<ReturnType<typeof runPytest>>;
  try {
    oracleCheck = await verifyApiPytestOracle(definition.source, "json", artifact.backend.artifact, oracle);
    await Promise.all([
      writeFile(join(directory, "source.json"), `${definition.source}\n`),
      writeFile(join(directory, "task.json"), `${JSON.stringify(definition.task, null, 2)}\n`),
      writeFile(join(directory, "task-package.json"), `${JSON.stringify(artifact, null, 2)}\n`),
      writeFile(join(directory, "suite.json"), artifact.backend.artifact.suiteJson),
      writeFile(join(directory, "test_api_requests.py"), artifact.backend.artifact.testPython),
      writeFile(join(directory, "oracle.json"), `${JSON.stringify(oracle, null, 2)}\n`),
      writeFile(join(directory, "package-check.json"), `${JSON.stringify(packageCheck, null, 2)}\n`),
    ]);
    run = await runPytest({ pythonExecutable: options.pythonExecutable, directory, oraclePath: resolve(directory, "oracle.json") });
  } finally {
    await server.stop(true);
  }
  const status = packageCheck.status === "pass" && artifact.completion.taskComplete && oracleCheck.status === "pass"
    && run.exitCode === 0 && run.junit.passed === selectedRows.length && run.junit.failed === 0 && run.junit.errors === 0
    && requestObservations.length === selectedRows.length && requestObservations.every(({ valid }) => valid)
    ? "pass" as const : "fail" as const;
  const report = {
    fixtureId: definition.id,
    exposure: "synthetic-loopback-development" as const,
    sourceSha256: sha(definition.source),
    taskSha256: sha(stable(definition.task)),
    packageSha256: sha(stable(artifact)),
    fixtureSha256,
    suiteSha256: sha(artifact.backend.artifact.suiteJson),
    packageCheck,
    taskComplete: artifact.completion.taskComplete,
    selectedRowIds: artifact.backend.selectedRowIds,
    oracleCheck,
    junit: run.junit,
    process: { exitCode: run.exitCode, stdout: run.stdout, stderr: run.stderr },
    requestObservations,
    status,
    claimLimit: "The fixture predicates are synthetic and do not establish live API behavior",
  };
  await writeFile(join(directory, "consumer.json"), `${JSON.stringify(report, null, 2)}\n`);
  return { report, artifact };
}

const FAULT_DESIGN = [
  { id: "omit-required-case", expectedLayer: "source-coverage-verifier", expectedMarker: "ARTIFACT_OBLIGATION_COVERAGE_MISMATCH" },
  { id: "wrong-operation", expectedLayer: "task-plan-checker", expectedMarker: "PLAN:OBLIGATION_BINDING_MISMATCH" },
  { id: "wrong-reference-target", expectedLayer: "source-closure-verifier", expectedMarker: "SOURCE_CLOSURE_BINDING_MISMATCH" },
  { id: "query-form-wire-break", expectedLayer: "request-specimen-checker", expectedMarker: "SPECIMENS:SPECIMEN_REQUEST_MISMATCH" },
  { id: "request-constraint-break", expectedLayer: "constraint-negative-checker", expectedMarker: "BODY_NEGATIVES:NEGATIVE_REQUEST_MISMATCH" },
  { id: "response-body-break", expectedLayer: "response-observation-checker", expectedMarker: "RESPONSE_SCHEMA_MISMATCH" },
  { id: "response-header-break", expectedLayer: "response-header-checker", expectedMarker: "HEADER_SCHEMA_MISMATCH" },
  { id: "fabricated-status-assertion", expectedLayer: "status-authority-boundary", expectedMarker: "RESPONSE_STATUS_UNDECLARED" },
] as const;

function requestJsonTask(value: Record<string, any>, id: string) {
  const task = structuredClone(value);
  task.taskId = id;
  task.output = "request-json";
  task.execution = { mode: "offline-validation" };
  return task;
}

async function verifyFaults(definitions: CurrentV2LoopbackFixture[]) {
  const jsonDefinition = definitions[0]!;
  const formDefinition = definitions[1]!;
  const jsonTask = requestJsonTask(jsonDefinition.task, "n5-json-faults");
  jsonTask.requirements.push(
    { id: "omission", kind: "required-omission", required: true, scope: "each-selected-operation", sourceLocator: "fault:omission" },
    { id: "negative", kind: "constraint-negative", required: true, scope: "each-selected-operation", sourceLocator: "fault:negative" },
  );
  const formTask = requestJsonTask(formDefinition.task, "n5-form-faults");
  const jsonInput = { task: jsonTask, sourceText: jsonDefinition.source, rootUri: "https://fixtures.invalid/json-faults/openapi.json",
    observations: jsonDefinition.observations, sourceRepository: "synthetic/n5-fixtures" };
  const formInput = { task: formTask, sourceText: formDefinition.source, rootUri: "https://fixtures.invalid/form-faults/openapi.json",
    observations: formDefinition.observations, sourceRepository: "synthetic/n5-fixtures" };
  const jsonPackage = await buildApiTaskArtifact(jsonInput);
  const formPackage = await buildApiTaskArtifact(formInput);
  const cases: Array<{ id: string; expectedLayer: string; expectedMarker: string; detectedAtExpectedLayer: boolean; evidence: unknown }> = [];
  const add = (design: typeof FAULT_DESIGN[number], detected: boolean, evidence: unknown) => cases.push({ ...design, detectedAtExpectedLayer: detected, evidence });

  const omitted = structuredClone(jsonPackage);
  omitted.obligationResults.splice(0, 1);
  const omittedCheck = await verifyApiTaskArtifact({ ...jsonInput, artifact: omitted });
  add(FAULT_DESIGN[0], omittedCheck.errors.includes(FAULT_DESIGN[0].expectedMarker), omittedCheck);

  const wrongOperation = structuredClone(jsonPackage);
  wrongOperation.plan.obligations[0]!.operationKey = "POST /wrong";
  const wrongOperationCheck = await verifyApiTaskArtifact({ ...jsonInput, artifact: wrongOperation });
  add(FAULT_DESIGN[1], wrongOperationCheck.errors.some((error) => error.startsWith(FAULT_DESIGN[1].expectedMarker)), wrongOperationCheck);

  const wrongReference = structuredClone(jsonPackage);
  const reference = wrongReference.sourceClosure.references[0];
  if (reference) reference.targetPointer = "#/components/schemas/Wrong";
  const wrongReferenceCheck = await verifyApiTaskArtifact({ ...jsonInput, artifact: wrongReference });
  add(FAULT_DESIGN[2], wrongReferenceCheck.errors.includes(FAULT_DESIGN[2].expectedMarker), wrongReferenceCheck);

  const wrongWire = structuredClone(formPackage);
  const formCase = wrongWire.evidence.specimens.operations.flatMap((operation) => operation.cases)
    .find((row) => row.status === "constructed" && row.request?.body?.mediaType === "application/x-www-form-urlencoded");
  if (formCase?.request?.body) formCase.request.body.text += "&tampered=1";
  const wrongWireCheck = await verifyApiTaskArtifact({ ...formInput, artifact: wrongWire });
  add(FAULT_DESIGN[3], wrongWireCheck.errors.some((error) => error.startsWith(FAULT_DESIGN[3].expectedMarker)), wrongWireCheck);

  const wrongConstraint = structuredClone(jsonPackage);
  const negative = wrongConstraint.evidence.bodyNegatives.operations.flatMap((operation) => operation.cases)
    .find((row) => row.status === "constructed" && row.request?.body);
  if (negative?.request?.body) negative.request.body.text = JSON.stringify({ name: "ok" });
  const wrongConstraintCheck = await verifyApiTaskArtifact({ ...jsonInput, artifact: wrongConstraint });
  add(FAULT_DESIGN[4], wrongConstraintCheck.errors.includes(FAULT_DESIGN[4].expectedMarker), wrongConstraintCheck);

  const wrongBody = checkApiResponseObservation(jsonDefinition.source, "json", {
    operationKey: "POST /items/{id}", statusCode: 200, mediaType: "application/json", bodyText: JSON.stringify({ status: "wrong" }),
  });
  add(FAULT_DESIGN[5], wrongBody.status === "checked" && wrongBody.valid === false && wrongBody.errors.includes(FAULT_DESIGN[5].expectedMarker), wrongBody);

  const wrongHeader = checkApiResponseHeaders(jsonDefinition.source, "json", {
    operationKey: "POST /items/{id}", statusCode: 200, headers: [{ name: "X-Count", value: "0" }],
  });
  add(FAULT_DESIGN[6], wrongHeader.status === "checked" && wrongHeader.valid === false
    && wrongHeader.headers.some((row) => row.errors.includes(FAULT_DESIGN[6].expectedMarker)), wrongHeader);

  const fabricatedStatus = checkApiResponseObservation(jsonDefinition.source, "json", {
    operationKey: "POST /items/{id}", statusCode: 201, mediaType: "application/json", bodyText: JSON.stringify({ status: "ok" }),
  });
  add(FAULT_DESIGN[7], fabricatedStatus.status === "checked" && fabricatedStatus.valid === false
    && fabricatedStatus.errors.includes(FAULT_DESIGN[7].expectedMarker), fabricatedStatus);

  const correctlyDetected = cases.filter(({ detectedAtExpectedLayer }) => detectedAtExpectedLayer).length;
  return {
    preregisteredDesign: FAULT_DESIGN,
    cases,
    summary: { injected: cases.length, correctlyDetected, missed: cases.length - correctlyDetected, notApplicable: 0 },
    claimLimit: "Detection rate applies only to these eight preregistered synthetic faults",
  };
}

export async function runN5ConsumerEvidence(options: { outputDirectory: string; pythonExecutable: string }) {
  await mkdir(options.outputDirectory, { recursive: true });
  const runtimeOutput = await execute(options.pythonExecutable, ["-X", "utf8", "-I", "-B", "-c",
    'import sys,json,importlib.metadata as m; print(json.dumps({"python":sys.version,"pytest":m.version("pytest"),"httpx":m.version("httpx")}))'],
  { windowsHide: true, encoding: "utf8", timeout: 10_000 });
  const definitions = currentV2LoopbackFixtures();
  const fixtureRuns = [];
  for (const definition of definitions) fixtureRuns.push(await runFixture(definition, options));
  const faultInjection = await verifyFaults(definitions);
  const reports = fixtureRuns.map(({ report }) => report);
  const decision = reports.every(({ status }) => status === "pass") && faultInjection.summary.correctlyDetected === 8
    ? "passed" as const : "failed" as const;
  const report = {
    schemaVersion: "skill-family-current-v2-n5-consumer/v1" as const,
    identity: "skill-family-current-v2-source-repair-001" as const,
    exposure: "development" as const,
    design: {
      consumer: "TaskContract -> plan -> source closure -> existing request/pytest backends -> independent package checker -> native pytest",
      fixtureAuthority: "hand-written predicates and explicit status/body rules; no generator witness is used as an expected answer",
      businessOraclePolicy: "ordinary API tasks remain conditional or unresolved without supplied observation/oracle evidence",
    },
    runtime: { ...JSON.parse(runtimeOutput.stdout), bun: Bun.version, pythonExecutable: options.pythonExecutable },
    fixtures: reports,
    faultInjection,
    accounting: {
      loopbackHttpCalls: reports.reduce((sum, row) => sum + row.requestObservations.length, 0),
      remoteHttpCalls: 0,
      projectModelCalls: 0,
      paidCalls: 0,
    },
    decision,
    claimLimits: [
      "Synthetic derived fixtures are not independent real API samples",
      "A local artifact pass does not establish complete-document or live API behavior",
      "The finite injected fault set is not a general reliability estimate",
      "Historical 0/6 and readiness evidence are unchanged",
    ],
  };
  await writeFile(join(options.outputDirectory, "consumer-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function writeN5ConsumerReportFromRepository(root: string, pythonExecutable = "python") {
  const relativeDirectory = "results/skill-ir/skill-family-current-v2-source-repair-001/integration";
  const outputDirectory = join(root, relativeDirectory);
  const report = await runN5ConsumerEvidence({ outputDirectory, pythonExecutable });
  const path = `${relativeDirectory}/consumer-report.json`;
  const bytes = await readFile(join(root, path));
  return { report, file: { path, sha256: sha(bytes), bytes: bytes.byteLength } };
}
