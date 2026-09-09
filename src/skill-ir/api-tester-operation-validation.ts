import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { ApiTesterOperationDevelopmentReport } from "./api-tester-operation-development";
import {
  analyzeApiTesterOperationDocument,
} from "./api-tester-operation-development";
import { verifyApiTesterOperationAdmissionConsistency } from "./api-tester-operation-admission";
import {
  verifyApiTesterOperationCoverage,
  verifyApiTesterProjectionDependencies,
} from "./api-tester-operation-coverage";
import {
  buildApiTesterProductionContractV2,
  parseApiTesterProductionBindingV2,
  parseApiTesterProductionDocumentV2,
} from "./api-tester-production-contract-v2";
import {
  ApiTesterProductionValidationReportSchemaV2,
  buildApiTesterProductionCheckerSourceV2,
  buildApiTesterProductionGeneratorSourceV2,
} from "./api-tester-production-programs-v2";

type JsonRecord = Record<string, unknown>;

export type ApiTesterOperationValidationBranch =
  | "real-positive"
  | "all-negative"
  | "correctness-blocked";

export type ApiTesterOperationTransformType =
  | "object-order"
  | "formatting"
  | "json-yaml"
  | "irrelevant-description"
  | "add-unsupported-operation"
  | "local-ref-inline";

export type ApiTesterOperationTransformRegistration = {
  type: ApiTesterOperationTransformType;
  applicability: string;
  expectedRelation: string;
  comparisonFields: string[];
};

const EQUIVALENT_FIELDS = [
  "operationUniverse",
  "admission",
  "normalizedSemantics",
  "coverage",
];

export const API_TESTER_OPERATION_TRANSFORM_REGISTRY: ApiTesterOperationTransformRegistration[] = [
  {
    type: "object-order",
    applicability: "Parsed OpenAPI data model has at least one object key; arrays retain their order.",
    expectedRelation: "Object, path, and operation insertion order may change while the operation universe and normalized semantics remain equal.",
    comparisonFields: [...EQUIVALENT_FIELDS],
  },
  {
    type: "formatting",
    applicability: "Source parses as JSON or YAML without duplicate-key or syntax failure.",
    expectedRelation: "Indentation, line endings, and insignificant whitespace change bytes but not operation semantics.",
    comparisonFields: [...EQUIVALENT_FIELDS],
  },
  {
    type: "json-yaml",
    applicability: "The parsed source data model can be serialized losslessly as JSON and YAML without aliases or non-JSON scalar values.",
    expectedRelation: "JSON/YAML representation may change while the data model, admission, and normalized operation semantics remain equal.",
    comparisonFields: [...EQUIVALENT_FIELDS],
  },
  {
    type: "irrelevant-description",
    applicability: "The OpenAPI root has an info object or one can be added without changing operation inputs.",
    expectedRelation: "Changing only info.description does not change the operation universe, admission, normalized semantics, or coverage.",
    comparisonFields: [...EQUIVALENT_FIELDS],
  },
  {
    type: "add-unsupported-operation",
    applicability: "The paths object can accept one collision-free validation path.",
    expectedRelation: "Existing operations remain unchanged and a newly added unsupported operation is retained as an explicit rejection.",
    comparisonFields: [
      "existingOperationUniverse",
      "existingAdmission",
      "existingNormalizedSemantics",
      "coverage",
      "addedRejection",
    ],
  },
  {
    type: "local-ref-inline",
    applicability: "At least one accepted operation has a pure, resolved, local construction reference.",
    expectedRelation: "Inlining the resolved value preserves that operation's admission and normalized public-contract semantics.",
    comparisonFields: ["operationKeys", "admission", "normalizedSemantics", "coverage"],
  },
];

export type ApiTesterOperationTransformEvaluation = {
  type: ApiTesterOperationTransformType;
  applicability: "applicable" | "not-applicable";
  status: "pass" | "fail" | "not-applicable";
  reason: string | null;
  comparisonFields: string[];
  parentSha256: string;
  derivedSha256: string | null;
  parentFormat: "json" | "yaml";
  derivedFormat: "json" | "yaml" | null;
  parameters: Record<string, string | number | boolean>;
  errors: string[];
};

export type ApiTesterOperationFault =
  | "operation-omission"
  | "operation-duplicate"
  | "parameter-dependency-loss"
  | "reference-dependency-loss"
  | "security-dependency-loss"
  | "summary-drift"
  | "false-acceptance"
  | "artifact-endpoint-loss"
  | "artifact-witness-loss";

export type ApiTesterOperationFaultDetection = {
  fault: ApiTesterOperationFault;
  detectorLayer: "source-coverage" | "dependency-verifier" | "admission-consistency" | "independent-checker";
  code: string;
  detected: boolean;
};

export const API_TESTER_OPERATION_FAULT_EXPECTATIONS = [
  { fault: "operation-omission", detectorLayer: "source-coverage", code: "ANALYZER_OPERATION_OMITTED" },
  { fault: "operation-duplicate", detectorLayer: "source-coverage", code: "ANALYZER_OPERATION_DUPLICATE" },
  { fault: "parameter-dependency-loss", detectorLayer: "dependency-verifier", code: "PARAMETER_DEPENDENCY_LOST" },
  { fault: "reference-dependency-loss", detectorLayer: "dependency-verifier", code: "REFERENCE_DEPENDENCY_LOST" },
  { fault: "security-dependency-loss", detectorLayer: "dependency-verifier", code: "SECURITY_DEPENDENCY_LOST" },
  { fault: "summary-drift", detectorLayer: "source-coverage", code: "ANALYZER_SOURCE_METADATA_DRIFT" },
  { fault: "false-acceptance", detectorLayer: "admission-consistency", code: "FALSE_ACCEPTANCE" },
  { fault: "artifact-endpoint-loss", detectorLayer: "independent-checker", code: "OPERATION_COVERAGE_FAILED" },
  { fault: "artifact-witness-loss", detectorLayer: "independent-checker", code: "SCHEMA_DERIVED_CASES_FAILED" },
] as const satisfies ReadonlyArray<Omit<ApiTesterOperationFaultDetection, "detected">>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort(compareText).map((key) => [key, canonicalValue(value[key])]));
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reverseObjectKeys(value[key])]));
}

function serialize(document: JsonRecord, format: "json" | "yaml", indent = 2): string {
  return format === "json"
    ? `${JSON.stringify(document, null, indent)}\n`
    : stringifyYaml(document, { indent, lineWidth: 0 });
}

function decodePointerToken(value: string): string | null {
  if (/~(?:[^01]|$)/u.test(value)) return null;
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function pointerTokens(pointer: string): string[] | null {
  if (!pointer.startsWith("#/")) return null;
  const values = pointer.slice(2).split("/").map(decodePointerToken);
  return values.some((value) => value === null) ? null : values as string[];
}

function valueAtPointer(document: JsonRecord, pointer: string): unknown {
  const tokens = pointerTokens(pointer);
  if (!tokens) return undefined;
  let value: unknown = document;
  for (const token of tokens) {
    if (Array.isArray(value) && /^\d+$/u.test(token)) value = value[Number(token)];
    else if (isRecord(value)) value = value[token];
    else return undefined;
  }
  return value;
}

function replaceAtPointer(document: JsonRecord, pointer: string, replacement: unknown): boolean {
  const tokens = pointerTokens(pointer);
  if (!tokens || tokens.length === 0) return false;
  const last = tokens.pop()!;
  let parent: unknown = document;
  for (const token of tokens) {
    if (Array.isArray(parent) && /^\d+$/u.test(token)) parent = parent[Number(token)];
    else if (isRecord(parent)) parent = parent[token];
    else return false;
  }
  if (Array.isArray(parent) && /^\d+$/u.test(last)) {
    parent[Number(last)] = replacement;
    return true;
  }
  if (isRecord(parent) && Object.prototype.hasOwnProperty.call(parent, last)) {
    parent[last] = replacement;
    return true;
  }
  return false;
}

function analysisSnapshot(sourceText: string, format: "json" | "yaml") {
  const analysis = analyzeApiTesterOperationDocument(sourceText, format);
  const rows = analysis.enumeration.operations.map((operation, index) => ({
    key: operation.key,
    locator: operation.locator,
    operationId: operation.operationId,
    summary: operation.summary,
    parameters: operation.parameters,
    request: operation.request,
    responses: operation.responses,
    security: operation.security,
    references: operation.references,
    status: analysis.admissions[index]?.status ?? "unresolved" as const,
  }));
  const admission = analysis.admissions.map((row) => ({
    operationKey: row.operationKey,
    status: row.status,
    findings: row.findings,
    firstObservedRejection: row.firstObservedRejection ? {
      code: row.firstObservedRejection.code,
      completeGapSet: row.firstObservedRejection.completeGapSet,
    } : null,
  }));
  const normalized = analysis.admissions.map((row) => ({
    operationKey: row.operationKey,
    normalizedOperation: row.normalizedOperation,
  }));
  const acceptedKeys = analysis.admissions
    .filter((row) => row.status === "accepted")
    .map((row) => row.operationKey);
  const projectedKeys = analysis.admissions.flatMap((row) => row.projection?.operationKeys ?? []);
  const contractKeys = analysis.admissions.flatMap((row) => row.normalizedOperation
    ? [`${row.normalizedOperation.method} ${row.normalizedOperation.path}`] : []);
  const coverage = verifyApiTesterOperationCoverage({
    sourceText,
    format,
    analyzedOperations: rows.map((row) => ({
      key: row.key,
      locator: row.locator,
      operationId: row.operationId,
      summary: row.summary,
      status: row.status,
    })),
    projectedOperationKeys: projectedKeys,
    contractOperationKeys: contractKeys,
    artifactOperationKeys: contractKeys,
  });
  return {
    analysis,
    universe: rows.map(({ status: _status, ...row }) => row),
    admission,
    normalized,
    acceptedKeys,
    coverage,
  };
}

function collisionFreeUnsupportedPath(document: JsonRecord): string | null {
  if (!isRecord(document.paths)) return null;
  const base = "/__skvm_validation_unsupported__";
  for (let index = 0; index < 10_000; index += 1) {
    const path = index === 0 ? base : `${base}_${index}`;
    if (!Object.prototype.hasOwnProperty.call(document.paths, path)) return path;
  }
  return null;
}

function deriveTransform(input: {
  sourceText: string;
  format: "json" | "yaml";
  type: ApiTesterOperationTransformType;
}): {
  text: string;
  format: "json" | "yaml";
  parameters: Record<string, string | number | boolean>;
  addedOperationKey?: string;
} | { reason: string } {
  const parent = analysisSnapshot(input.sourceText, input.format);
  if (!parent.analysis.document) return { reason: "source did not parse into an OpenAPI object" };
  const document = structuredClone(parent.analysis.document);
  if (input.type === "object-order") {
    return {
      text: serialize(reverseObjectKeys(document) as JsonRecord, input.format),
      format: input.format,
      parameters: { ordering: "reverse-recursive-object-keys", arraysReordered: false },
    };
  }
  if (input.type === "formatting") {
    let text = input.format === "json"
      ? `${JSON.stringify(document, null, 4).replaceAll("\n", "\r\n")}\r\n`
      : `${stringifyYaml(document, { indent: 4, lineWidth: 0 })}\n`;
    if (sha256(text) === sha256(input.sourceText)) text = `\n${text}`;
    return { text, format: input.format, parameters: { indent: 4, lineEnding: input.format === "json" ? "crlf" : "lf" } };
  }
  if (input.type === "json-yaml") {
    const format = input.format === "json" ? "yaml" : "json";
    return { text: serialize(document, format), format, parameters: { from: input.format, to: format } };
  }
  if (input.type === "irrelevant-description") {
    const info = isRecord(document.info) ? document.info : {};
    info.description = `${typeof info.description === "string" ? info.description : ""}[operation-validation-irrelevant]`;
    document.info = info;
    return { text: serialize(document, input.format), format: input.format, parameters: { field: "#/info/description" } };
  }
  if (input.type === "add-unsupported-operation") {
    const path = collisionFreeUnsupportedPath(document);
    if (!path || !isRecord(document.paths)) return { reason: "source has no extensible paths object" };
    document.paths[path] = {
      post: {
        summary: "Validation-only unsupported operation",
        parameters: [{ name: "session", in: "cookie", schema: { type: "string" } }],
        responses: { default: { description: "unspecified" } },
      },
    };
    return {
      text: serialize(document, input.format),
      format: input.format,
      parameters: { addedPath: path, method: "POST" },
      addedOperationKey: `POST ${path}`,
    };
  }
  const accepted = parent.analysis.admissions
    .map((admission, index) => ({ admission, source: parent.analysis.enumeration.operations[index] }))
    .find((row) => row.admission.status === "accepted" && row.source?.references.some((reference) =>
      reference.constructionObligation && reference.resolution === "resolved" && reference.targetLocator));
  const reference = accepted?.source?.references.find((entry) =>
    entry.constructionObligation && entry.resolution === "resolved" && entry.targetLocator);
  if (!accepted || !reference?.targetLocator) {
    return { reason: "no accepted operation has a pure resolved local reference eligible for expansion" };
  }
  const referenceObjectPointer = reference.locator.endsWith("/$ref")
    ? reference.locator.slice(0, -"/$ref".length) : "";
  const referenceObject = valueAtPointer(document, referenceObjectPointer);
  const target = valueAtPointer(document, reference.targetLocator);
  if (!referenceObjectPointer || !isRecord(referenceObject) || Object.keys(referenceObject).length !== 1
    || typeof referenceObject.$ref !== "string" || target === undefined
    || !replaceAtPointer(document, referenceObjectPointer, structuredClone(target))) {
    return { reason: "resolved local reference is not a pure replaceable reference object" };
  }
  return {
    text: serialize(document, input.format),
    format: input.format,
    parameters: {
      operationKey: accepted.admission.operationKey,
      referenceLocator: reference.locator,
      targetLocator: reference.targetLocator,
    },
  };
}

export function selectApiTesterOperationValidationBranch(
  report: ApiTesterOperationDevelopmentReport,
): ApiTesterOperationValidationBranch {
  if (report.gates.sourceCoverage !== "pass"
    || report.gates.admissionConsistency !== "pass"
    || report.gates.artifactCorrectness !== "pass"
    || report.totals.accepted !== report.totals.artifactCheckedPassedOperations) {
    return "correctness-blocked";
  }
  return report.totals.artifactCheckedPassedOperations > 0 ? "real-positive" : "all-negative";
}

export function evaluateApiTesterOperationTransform(input: {
  sourceText: string;
  format: "json" | "yaml";
  type: ApiTesterOperationTransformType;
}): ApiTesterOperationTransformEvaluation {
  const registration = API_TESTER_OPERATION_TRANSFORM_REGISTRY.find((entry) => entry.type === input.type)!;
  const parentSha256 = sha256(input.sourceText);
  let parent: ReturnType<typeof analysisSnapshot>;
  try {
    parent = analysisSnapshot(input.sourceText, input.format);
  } catch (error) {
    return {
      type: input.type,
      applicability: "not-applicable",
      status: "not-applicable",
      reason: `parent analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      comparisonFields: [...registration.comparisonFields],
      parentSha256,
      derivedSha256: null,
      parentFormat: input.format,
      derivedFormat: null,
      parameters: {},
      errors: [],
    };
  }
  const derived = deriveTransform(input);
  if ("reason" in derived) {
    return {
      type: input.type,
      applicability: "not-applicable",
      status: "not-applicable",
      reason: derived.reason,
      comparisonFields: [...registration.comparisonFields],
      parentSha256,
      derivedSha256: null,
      parentFormat: input.format,
      derivedFormat: null,
      parameters: {},
      errors: [],
    };
  }
  const errors: string[] = [];
  const derivedSha256 = sha256(derived.text);
  if (derivedSha256 === parentSha256) errors.push("DERIVED_BYTES_UNCHANGED");
  let changed: ReturnType<typeof analysisSnapshot>;
  try {
    changed = analysisSnapshot(derived.text, derived.format);
  } catch (error) {
    errors.push(`DERIVED_ANALYSIS_FAILED:${error instanceof Error ? error.message : String(error)}`);
    return {
      type: input.type,
      applicability: "applicable",
      status: "fail",
      reason: null,
      comparisonFields: [...registration.comparisonFields],
      parentSha256,
      derivedSha256,
      parentFormat: input.format,
      derivedFormat: derived.format,
      parameters: derived.parameters,
      errors,
    };
  }
  if (input.type === "add-unsupported-operation") {
    const addedKey = derived.addedOperationKey!;
    const existingUniverse = changed.universe.filter((row) => row.key !== addedKey);
    const existingAdmission = changed.admission.filter((row) => row.operationKey !== addedKey);
    const existingNormalized = changed.normalized.filter((row) => row.operationKey !== addedKey);
    const added = changed.analysis.admissions.find((row) => row.operationKey === addedKey);
    if (canonical(parent.universe) !== canonical(existingUniverse)) errors.push("EXISTING_OPERATION_UNIVERSE_DRIFT");
    if (canonical(parent.admission) !== canonical(existingAdmission)) errors.push("EXISTING_ADMISSION_DRIFT");
    if (canonical(parent.normalized) !== canonical(existingNormalized)) errors.push("EXISTING_NORMALIZED_SEMANTICS_DRIFT");
    if (parent.coverage.status !== "pass" || changed.coverage.status !== "pass") errors.push("COVERAGE_FAILED");
    if (!added || added.status !== "rejected" || added.findings.length === 0) errors.push("ADDED_OPERATION_NOT_EXPLICITLY_REJECTED");
  } else if (input.type === "local-ref-inline") {
    if (canonical(parent.analysis.admissions.map((row) => [row.operationKey, row.status]))
      !== canonical(changed.analysis.admissions.map((row) => [row.operationKey, row.status]))) errors.push("ADMISSION_DRIFT");
    if (canonical(parent.normalized) !== canonical(changed.normalized)) errors.push("NORMALIZED_SEMANTICS_DRIFT");
    if (canonical(parent.universe.map((row) => row.key)) !== canonical(changed.universe.map((row) => row.key))) errors.push("OPERATION_KEYS_DRIFT");
    if (parent.coverage.status !== "pass" || changed.coverage.status !== "pass") errors.push("COVERAGE_FAILED");
  } else {
    if (canonical(parent.universe) !== canonical(changed.universe)) errors.push("OPERATION_UNIVERSE_DRIFT");
    if (canonical(parent.admission) !== canonical(changed.admission)) errors.push("ADMISSION_DRIFT");
    if (canonical(parent.normalized) !== canonical(changed.normalized)) errors.push("NORMALIZED_SEMANTICS_DRIFT");
    if (canonical(parent.coverage) !== canonical(changed.coverage)) errors.push("COVERAGE_DRIFT");
  }
  return {
    type: input.type,
    applicability: "applicable",
    status: errors.length === 0 ? "pass" : "fail",
    reason: null,
    comparisonFields: [...registration.comparisonFields],
    parentSha256,
    derivedSha256,
    parentFormat: input.format,
    derivedFormat: derived.format,
    parameters: derived.parameters,
    errors,
  };
}

const FAULT_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "fault fixture", version: "1" },
  security: [{ ApiKey: [] }],
  components: {
    parameters: {
      ItemId: { name: "id", in: "path", required: true, schema: { type: "string", minLength: 1 } },
    },
    securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
  },
  paths: {
    "/items/{id}": {
      parameters: [{ $ref: "#/components/parameters/ItemId" }],
      get: {
        operationId: "getItem",
        summary: "Get one item",
        responses: {
          "200": { description: "ok" },
          "401": { description: "unauthorized" },
          "404": { description: "missing" },
        },
      },
    },
  },
};

function coverageInput(snapshot: ReturnType<typeof analysisSnapshot>) {
  const analyzedOperations = snapshot.analysis.enumeration.operations.map((operation, index) => ({
    key: operation.key,
    locator: operation.locator,
    operationId: operation.operationId,
    summary: operation.summary,
    status: snapshot.analysis.admissions[index]?.status ?? "unresolved" as const,
  }));
  const accepted = snapshot.analysis.admissions.filter((row) => row.status === "accepted").map((row) => row.operationKey);
  return { analyzedOperations, accepted };
}

async function executeNode(nodeExecutable: string, program: string, args: string[]) {
  const child = Bun.spawn([nodeExecutable, program, ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function detectArtifactFault(input: {
  nodeExecutable: string;
  fixtureRoot: string;
  fault: "artifact-endpoint-loss" | "artifact-witness-loss";
}): Promise<ApiTesterOperationFaultDetection> {
  const root = await mkdtemp(join(tmpdir(), "skvm-operation-validation-fault-"));
  try {
    const workdir = join(root, "workdir");
    const packageDir = join(root, "package");
    await Promise.all([cp(input.fixtureRoot, workdir, { recursive: true }), mkdir(packageDir, { recursive: true })]);
    const binding = parseApiTesterProductionBindingV2(JSON.parse(await readFile(join(input.fixtureRoot, "binding.json"), "utf8")));
    const inputBytes = await readFile(join(workdir, binding.input.path));
    const contract = buildApiTesterProductionContractV2(parseApiTesterProductionDocumentV2(
      inputBytes.toString("utf8"),
      binding.input.format,
    ));
    const paths = {
      binding: join(packageDir, "binding.json"),
      contract: join(packageDir, "public-contract.json"),
      generator: join(packageDir, "api-test-generate.mjs"),
      checker: join(packageDir, "api-test-check.mjs"),
    };
    await Promise.all([
      writeFile(paths.binding, `${JSON.stringify(binding, null, 2)}\n`, "utf8"),
      writeFile(paths.contract, `${JSON.stringify(contract, null, 2)}\n`, "utf8"),
      writeFile(paths.generator, buildApiTesterProductionGeneratorSourceV2(), "utf8"),
      writeFile(paths.checker, buildApiTesterProductionCheckerSourceV2(), "utf8"),
    ]);
    const args = [
      "--binding", paths.binding,
      "--contract", paths.contract,
      "--workdir", workdir,
      "--input-sha256", sha256(inputBytes),
    ];
    const generated = await executeNode(input.nodeExecutable, paths.generator, args);
    if (generated.exitCode !== 0 || generated.stdout.trim() || generated.stderr.trim()) {
      throw new Error(`artifact fault fixture generator failed: ${generated.stderr || generated.stdout}`);
    }
    const planPath = join(workdir, binding.outputs.plan);
    const plan = JSON.parse(await readFile(planPath, "utf8")) as {
      endpoints: Array<{ cases: Array<{ category: string; request: JsonRecord }> }>;
    };
    if (input.fault === "artifact-endpoint-loss") {
      plan.endpoints.pop();
    } else {
      for (const endpoint of plan.endpoints) {
        for (const testCase of endpoint.cases) {
          if (testCase.category !== "boundary") continue;
          for (const location of ["query", "body"]) {
            const section = isRecord(testCase.request[location]) ? testCase.request[location] as JsonRecord : null;
            if (section && Array.isArray(section.tags) && section.tags.length === 1) section.tags = [];
          }
        }
      }
    }
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const checked = await executeNode(input.nodeExecutable, paths.checker, args);
    const validation = ApiTesterProductionValidationReportSchemaV2.parse(JSON.parse(checked.stdout));
    const expectation = input.fault === "artifact-endpoint-loss"
      ? API_TESTER_OPERATION_FAULT_EXPECTATIONS[7]
      : API_TESTER_OPERATION_FAULT_EXPECTATIONS[8];
    return {
      ...expectation,
      detected: checked.exitCode !== 0 && validation.status === "fail" && validation.errors.includes(expectation.code),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function runApiTesterOperationFaultDetection(options: {
  nodeExecutable: string;
  fixtureRoot: string;
}): Promise<ApiTesterOperationFaultDetection[]> {
  const sourceText = `${JSON.stringify(FAULT_DOCUMENT, null, 2)}\n`;
  const snapshot = analysisSnapshot(sourceText, "json");
  const base = coverageInput(snapshot);
  const coverageWith = (analyzedOperations: typeof base.analyzedOperations) => verifyApiTesterOperationCoverage({
    sourceText,
    format: "json",
    analyzedOperations,
    projectedOperationKeys: base.accepted,
    contractOperationKeys: base.accepted,
    artifactOperationKeys: base.accepted,
  });
  const omission = coverageWith(base.analyzedOperations.slice(1));
  const duplicate = coverageWith([...base.analyzedOperations, base.analyzedOperations[0]!]);
  const summaryRows = structuredClone(base.analyzedOperations);
  summaryRows[0]!.summary = "drifted summary";
  const summary = coverageWith(summaryRows);
  const accepted = snapshot.analysis.admissions.find((row) => row.status === "accepted");
  if (!accepted?.projection || !snapshot.analysis.document) throw new Error("fault fixture must produce one accepted operation projection");
  const parameterProjection = structuredClone(accepted.projection.document);
  const parameterOperation = ((parameterProjection.paths as JsonRecord)["/items/{id}"] as JsonRecord).get as JsonRecord;
  parameterOperation.parameters = [];
  const parameter = verifyApiTesterProjectionDependencies({
    sourceDocument: snapshot.analysis.document,
    operationKey: accepted.operationKey,
    projectedDocument: parameterProjection,
  });
  const referenceProjection = structuredClone(accepted.projection.document);
  delete (((referenceProjection.components as JsonRecord).parameters as JsonRecord).ItemId);
  const reference = verifyApiTesterProjectionDependencies({
    sourceDocument: snapshot.analysis.document,
    operationKey: accepted.operationKey,
    projectedDocument: referenceProjection,
  });
  const securityProjection = structuredClone(accepted.projection.document);
  const securityOperation = ((securityProjection.paths as JsonRecord)["/items/{id}"] as JsonRecord).get as JsonRecord;
  securityOperation.security = [];
  const security = verifyApiTesterProjectionDependencies({
    sourceDocument: snapshot.analysis.document,
    operationKey: accepted.operationKey,
    projectedDocument: securityProjection,
  });
  const falseAcceptance = verifyApiTesterOperationAdmissionConsistency([{
    operationKey: accepted.operationKey,
    status: "accepted",
    findings: [{ code: "FORCED", category: "implementation-failure", locator: "#", message: "forced" }],
    firstObservedRejection: null,
    normalizedOperation: null,
  }]);
  const [endpoint, witness] = await Promise.all([
    detectArtifactFault({ ...options, fault: "artifact-endpoint-loss" }),
    detectArtifactFault({ ...options, fault: "artifact-witness-loss" }),
  ]);
  return [
    { ...API_TESTER_OPERATION_FAULT_EXPECTATIONS[0], detected: omission.errors.includes(API_TESTER_OPERATION_FAULT_EXPECTATIONS[0].code) },
    { ...API_TESTER_OPERATION_FAULT_EXPECTATIONS[1], detected: duplicate.errors.includes(API_TESTER_OPERATION_FAULT_EXPECTATIONS[1].code) },
    { ...API_TESTER_OPERATION_FAULT_EXPECTATIONS[2], detected: parameter.errors.includes(API_TESTER_OPERATION_FAULT_EXPECTATIONS[2].code) },
    { ...API_TESTER_OPERATION_FAULT_EXPECTATIONS[3], detected: reference.errors.includes(API_TESTER_OPERATION_FAULT_EXPECTATIONS[3].code) },
    { ...API_TESTER_OPERATION_FAULT_EXPECTATIONS[4], detected: security.errors.includes(API_TESTER_OPERATION_FAULT_EXPECTATIONS[4].code) },
    { ...API_TESTER_OPERATION_FAULT_EXPECTATIONS[5], detected: summary.errors.includes(API_TESTER_OPERATION_FAULT_EXPECTATIONS[5].code) },
    { ...API_TESTER_OPERATION_FAULT_EXPECTATIONS[6], detected: falseAcceptance.errors.includes(API_TESTER_OPERATION_FAULT_EXPECTATIONS[6].code) },
    endpoint,
    witness,
  ];
}
