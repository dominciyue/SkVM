import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeApiTaskSourceClosure } from "./api-tester-source-closure";

const IDENTITY = "skill-family-current-v2-source-repair-001";
const RESULT_ROOT = `results/skill-ir/${IDENTITY}`;
const ROOT_URI = "https://api.example.test/contracts/openapi.yaml";
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

function fixtureTask(options: { response?: boolean; operationKeys?: string[] } = {}) {
  const requirements: any[] = [{ id: "request", kind: "valid-minimal", required: true,
    scope: "each-selected-operation", sourceLocator: "synthetic-fixture:request" }];
  if (options.response) requirements.push({ id: "response", kind: "response-conformance", required: true,
    scope: "each-selected-operation", sourceLocator: "synthetic-fixture:response" });
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

function fixtureSource(requestRef: string, responseRef = "#/components/schemas/Result") {
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

function fixtureDependencies(rows: Array<{ uri: string; path: string; text: string }>) {
  return {
    manifest: {
      schemaVersion: "skvm-api-dependency-manifest/v1",
      rootUri: ROOT_URI,
      resources: rows.map((row) => ({ uri: row.uri, path: row.path, format: "yaml", sha256: sha256(row.text) })),
    },
    payloads: Object.fromEntries(rows.map((row) => [row.path, row.text])),
  };
}

type Check = { id: string; passed: boolean; expected: unknown; actual: unknown };
const check = (id: string, actual: unknown, expected: unknown, passed: boolean): Check => ({ id, passed, expected, actual });

function syntheticCases() {
  const cases: Array<{ caseId: string; inputBindings: unknown; reports: unknown; checks: Check[]; passed: boolean }> = [];
  const add = (caseId: string, inputBindings: unknown, reports: unknown, checks: Check[]) => {
    cases.push({ caseId, inputBindings, reports, checks, passed: checks.every((row) => row.passed) });
  };

  const mixed = `openapi: 3.0.3
info: { title: mixed, version: 1 }
paths:
  /broken:
    post:
      requestBody: { $ref: '#/components/requestBodies/Missing' }
      responses: { '200': { description: ok } }
  /healthy:
    post:
      requestBody: { required: true, content: { application/json: { schema: { type: object } } } }
      responses: { '200': { description: ok } }
`;
  const empty = fixtureDependencies([]);
  const mixedReport = analyzeApiTaskSourceClosure({ task: fixtureTask({ operationKeys: ["POST /broken", "POST /healthy"] }),
    sourceText: mixed, rootUri: ROOT_URI, dependencyManifest: empty.manifest, dependencyPayloads: empty.payloads });
  const broken = mixedReport.operationRequirements.find((row) => row.operationKey === "POST /broken" && row.requirementId === "request")?.status;
  const healthy = mixedReport.operationRequirements.find((row) => row.operationKey === "POST /healthy" && row.requirementId === "request")?.status;
  add("missing-local-keeps-unaffected-operation", { sourceSha256: sha256(mixed), dependencyResources: 0 }, mixedReport, [
    check("broken-operation-is-blocked", broken, "blocked-source", broken === "blocked-source"),
    check("healthy-operation-remains-ready", healthy, "source-ready", healthy === "source-ready"),
  ]);

  const external = fixtureDependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml",
    text: "Input: { type: object }\nResult: { type: object }\n" }]);
  const externalSource = fixtureSource("./common.yaml#/Input", "./common.yaml#/Result");
  const externalReport = analyzeApiTaskSourceClosure({ task: fixtureTask({ response: true }), sourceText: externalSource,
    rootUri: ROOT_URI, dependencyManifest: external.manifest, dependencyPayloads: external.payloads });
  add("external-request-response-role-binding", { sourceSha256: sha256(externalSource), manifest: external.manifest }, externalReport, [
    check("closure-passes", externalReport.status, "passed", externalReport.status === "passed"),
    check("roles-bind-to-separate-requirements", externalReport.references.map((row) => [row.role, row.dependentRequirementIds]),
      [["request", ["request"]], ["response", ["response"]]],
      externalReport.references.some((row) => row.role === "request" && row.dependentRequirementIds.join() === "request")
      && externalReport.references.some((row) => row.role === "response" && row.dependentRequirementIds.join() === "response")),
  ]);

  const relative = fixtureDependencies([
    { uri: "https://api.example.test/contracts/models/request.yaml", path: "deps/request.yaml", text: "Request:\n  $ref: '../shared.yaml#/Input'\n" },
    { uri: "https://api.example.test/contracts/shared.yaml", path: "deps/shared.yaml", text: "Input: { type: string }\n" },
  ]);
  const relativeSource = fixtureSource("./models/request.yaml#/Request");
  const relativeReport = analyzeApiTaskSourceClosure({ task: fixtureTask(), sourceText: relativeSource, rootUri: ROOT_URI,
    dependencyManifest: relative.manifest, dependencyPayloads: relative.payloads });
  const nested = relativeReport.references.find((row) => row.reference === "../shared.yaml#/Input");
  add("relative-uri-uses-containing-document-base", { sourceSha256: sha256(relativeSource), manifest: relative.manifest }, relativeReport, [
    check("nested-target", nested && [nested.originUri, nested.targetUri, nested.targetPointer],
      ["https://api.example.test/contracts/models/request.yaml", "https://api.example.test/contracts/shared.yaml", "#/Input"],
      nested?.originUri === "https://api.example.test/contracts/models/request.yaml"
      && nested.targetUri === "https://api.example.test/contracts/shared.yaml" && nested.targetPointer === "#/Input"),
  ]);

  const sharedSource = `openapi: 3.0.3
info: { title: shared, version: 1 }
paths:
  /a: { post: { requestBody: { $ref: './common.yaml#/Body' }, responses: { '200': { description: ok } } } }
  /b: { post: { requestBody: { $ref: './common.yaml#/Body' }, responses: { '200': { description: ok } } } }
`;
  const shared = fixtureDependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml",
    text: "Body: { required: true, content: { application/json: { schema: { type: object } } } }\n" }]);
  const sharedReport = analyzeApiTaskSourceClosure({ task: fixtureTask({ operationKeys: ["POST /a", "POST /b"] }),
    sourceText: sharedSource, rootUri: ROOT_URI, dependencyManifest: shared.manifest, dependencyPayloads: shared.payloads });
  add("shared-dependency-deduplication", { sourceSha256: sha256(sharedSource), manifest: shared.manifest }, sharedReport, [
    check("one-load-two-occurrences", sharedReport.summary,
      { externalResourcesLoaded: 1, referenceOccurrences: 2, uniqueReferenceTargets: 1 },
      sharedReport.summary.externalResourcesLoaded === 1 && sharedReport.summary.referenceOccurrences === 2 && sharedReport.summary.uniqueReferenceTargets === 1),
  ]);

  const recursive = fixtureDependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml",
    text: "Node:\n  type: object\n  properties:\n    child:\n      $ref: '#/Node'\n" }]);
  const recursiveSource = fixtureSource("./common.yaml#/Node");
  const recursiveReport = analyzeApiTaskSourceClosure({ task: fixtureTask(), sourceText: recursiveSource, rootUri: ROOT_URI,
    dependencyManifest: recursive.manifest, dependencyPayloads: recursive.payloads });
  const recursion = recursiveReport.references.find((row) => row.resolution === "recursive-resolved");
  add("structural-recursion-separates-source-and-witness", { sourceSha256: sha256(recursiveSource), manifest: recursive.manifest }, recursiveReport, [
    check("source-closure-is-partial-not-invalid", recursiveReport.status, "partial", recursiveReport.status === "partial"),
    check("finite-witness-is-unresolved", recursion && [recursion.sourceStatus, recursion.witnessStatus],
      ["resolved", "unresolved-recursion-budget"], recursion?.sourceStatus === "resolved" && recursion.witnessStatus === "unresolved-recursion-budget"),
  ]);

  const cycle = fixtureDependencies([
    { uri: "https://api.example.test/contracts/a.yaml", path: "deps/a.yaml", text: "A: { $ref: './b.yaml#/B' }\n" },
    { uri: "https://api.example.test/contracts/b.yaml", path: "deps/b.yaml", text: "B: { $ref: './a.yaml#/A' }\n" },
  ]);
  const cycleSource = fixtureSource("./a.yaml#/A");
  const cycleReport = analyzeApiTaskSourceClosure({ task: fixtureTask(), sourceText: cycleSource, rootUri: ROOT_URI,
    dependencyManifest: cycle.manifest, dependencyPayloads: cycle.payloads });
  add("pure-reference-cycle-is-invalid", { sourceSha256: sha256(cycleSource), manifest: cycle.manifest }, cycleReport, [
    check("cycle-blocked-at-source", cycleReport.status, "blocked/reference-cycle",
      cycleReport.status === "blocked" && cycleReport.references.some((row) => row.resolution === "reference-cycle" && row.sourceStatus === "unresolved")),
  ]);

  const missingResponseSource = fixtureSource("#/components/schemas/Result", "https://missing.example.test/response.yaml#/Result");
  const requestOnly = analyzeApiTaskSourceClosure({ task: fixtureTask(), sourceText: missingResponseSource, rootUri: ROOT_URI,
    dependencyManifest: empty.manifest, dependencyPayloads: empty.payloads });
  const responseRequired = analyzeApiTaskSourceClosure({ task: fixtureTask({ response: true }), sourceText: missingResponseSource,
    rootUri: ROOT_URI, dependencyManifest: empty.manifest, dependencyPayloads: empty.payloads });
  add("response-reference-severity-is-task-dependent", { sourceSha256: sha256(missingResponseSource), dependencyResources: 0 },
    { requestOnly, responseRequired }, [
      check("request-only-advisory", requestOnly.status, "passed-with-advisory", requestOnly.status === "passed-with-advisory"
        && requestOnly.references.some((row) => row.role === "response" && row.severity === "advisory")),
      check("response-task-blocked", responseRequired.status, "blocked", responseRequired.status === "blocked"
        && responseRequired.references.some((row) => row.role === "response" && row.severity === "blocking")),
    ]);

  const common = fixtureDependencies([{ uri: "https://api.example.test/contracts/common.yaml", path: "deps/common.yaml", text: "Input: { type: object }\n" }]);
  const pointerSource = fixtureSource("./common.yaml#/Absent");
  const pointer = analyzeApiTaskSourceClosure({ task: fixtureTask(), sourceText: pointerSource, rootUri: ROOT_URI,
    dependencyManifest: common.manifest, dependencyPayloads: common.payloads });
  const siblingSource = fixtureSource("./common.yaml#/Input").replace("$ref: './common.yaml#/Input'", "$ref: './common.yaml#/Input'\n              description: sibling");
  const sibling = analyzeApiTaskSourceClosure({ task: fixtureTask(), sourceText: siblingSource, rootUri: ROOT_URI,
    dependencyManifest: common.manifest, dependencyPayloads: common.payloads });
  const dialectSource = fixtureSource("#/components/schemas/Result").replace("3.0.3", "3.1.0");
  const dialect = analyzeApiTaskSourceClosure({ task: fixtureTask(), sourceText: dialectSource, rootUri: ROOT_URI,
    dependencyManifest: empty.manifest, dependencyPayloads: empty.payloads });
  add("pointer-sibling-and-dialect-fail-distinctly", {
    pointerSourceSha256: sha256(pointerSource), siblingSourceSha256: sha256(siblingSource), dialectSourceSha256: sha256(dialectSource), manifest: common.manifest,
  }, { pointer, sibling, dialect }, [
    check("pointer-and-sibling-distinct", [pointer.references[0]?.resolution, sibling.references[0]?.resolution],
      ["pointer-missing", "sibling-semantics-unsupported"], pointer.references.some((row) => row.resolution === "pointer-missing")
      && sibling.references.some((row) => row.resolution === "sibling-semantics-unsupported")),
    check("dialect-rejected-by-profile", [dialect.profileStatus, dialect.status], ["unsupported-dialect", "blocked"],
      dialect.profileStatus === "unsupported-dialect" && dialect.status === "blocked"),
  ]);

  return cases;
}

export async function buildN3SourceClosureReportFromRepository(root: string) {
  const gapPath = `${RESULT_ROOT}/baseline/gap-matrix.json`;
  const gapBytes = await readFile(join(root, gapPath));
  const gap = JSON.parse(gapBytes.toString("utf8"));
  const realTasks = [];
  for (const demonstration of gap.demonstrations) {
    const sourceBytes = await readFile(join(root, demonstration.task.input.path));
    if (sha256(sourceBytes) !== gap.inputs.selectedApiInput.sha256) throw new Error("N3 real source digest drift");
    const closure = analyzeApiTaskSourceClosure({
      task: demonstration.task,
      sourceText: sourceBytes.toString("utf8"),
      rootUri: `https://development.skvm.local/${gap.inputs.selectedApiInput.inputId}/openapi.yaml`,
    });
    realTasks.push({
      taskId: demonstration.task.taskId,
      semanticPlanSha256: demonstration.plan.semanticPlanSha256,
      sourceSkill: demonstration.task.mapping.sourceSkill,
      provider: gap.inputs.selectedApiInput.provider,
      inputId: gap.inputs.selectedApiInput.inputId,
      closure,
    });
  }
  const cases = syntheticCases();
  const checkRows = cases.flatMap((row) => row.checks);
  const realSummary = {
    tasks: realTasks.length,
    passed: realTasks.filter((row) => row.closure.status === "passed" || row.closure.status === "passed-with-advisory").length,
    partial: realTasks.filter((row) => row.closure.status === "partial").length,
    blocked: realTasks.filter((row) => row.closure.status === "blocked").length,
    referenceOccurrences: realTasks.reduce((sum, row) => sum + row.closure.summary.referenceOccurrences, 0),
  };
  const syntheticSummary = {
    cases: cases.length,
    passed: cases.filter(({ passed }) => passed).length,
    failed: cases.filter(({ passed }) => !passed).length,
    checks: checkRows.length,
    checksPassed: checkRows.filter(({ passed }) => passed).length,
  };
  return {
    schemaVersion: "skill-family-current-v2-source-closure-report/v1",
    identity: IDENTITY,
    phase: "development",
    inputs: { gapMatrix: { path: gapPath, sha256: sha256(gapBytes), bytes: gapBytes.byteLength } },
    realTasks,
    realSummary,
    syntheticCases: cases,
    syntheticSummary,
    decision: realSummary.blocked === 0 && syntheticSummary.failed === 0 ? "passed" as const : "failed" as const,
    limits: realTasks[0]?.closure.limits ?? null,
    boundaries: {
      sourceValidity: "reference resolution is not live-service correctness",
      witnessConstructibility: "reported independently; recursion may resolve while finite construction remains unresolved",
      externalAcquisition: "only digest-bound in-memory synthetic resources; no network retrieval",
      wholeSkillComplete: false,
    },
    protectedReads: { heldOut: 0, q1Reserved: 0, prospective: 0 },
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 },
  };
}

async function writeOnceOrVerify(path: string, value: unknown): Promise<"written" | "reused"> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try { await writeFile(path, text, { flag: "wx" }); return "written"; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== text) throw new Error(`existing N3 evidence differs at ${path}`);
    return "reused";
  }
}

export async function writeN3SourceClosureReportFromRepository(root: string) {
  const report = await buildN3SourceClosureReportFromRepository(root);
  const directory = join(root, RESULT_ROOT, "source-closure");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "report.json");
  const state = await writeOnceOrVerify(path, report);
  const bytes = await readFile(path);
  return { report, file: { path: `${RESULT_ROOT}/source-closure/report.json`, sha256: sha256(bytes), bytes: bytes.byteLength, state } };
}
