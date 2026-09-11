import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_TESTER_OPERATION_TRANSFORM_REGISTRY,
  evaluateApiTesterOperationTransform,
  runApiTesterOperationFaultDetection,
  type ApiTesterOperationTransformType,
} from "./api-tester-operation-validation";
import { analyzeApiTesterOperationDocument } from "./api-tester-operation-development";
import {
  verifyApiTesterOperationAdmissionConsistency,
  type ApiTesterOperationAdmission,
} from "./api-tester-operation-admission";
import { verifyApiTesterProjectionDependencies } from "./api-tester-operation-coverage";
import {
  runApiTesterOperationInput,
  verifyApiTesterOperationInputOutput,
} from "./api-tester-operation-input";

type JsonRecord = Record<string, unknown>;

export const CLASS_PROOF_METAMORPHIC_TRANSFORM_REGISTRY = API_TESTER_OPERATION_TRANSFORM_REGISTRY;

export type ClassProofValidationInput = {
  inputId: string;
  memberId: string;
  sourcePath: string;
  sourceText: string;
  format: "json" | "yaml";
  origin?: "real-development-input" | "synthetic-boundary";
};

export type ClassProofMetamorphicCase = {
  caseId: string;
  inputId: string;
  memberId: string;
  origin: "real-development-input" | "synthetic-boundary";
  parent: { path: string; format: "json" | "yaml"; sha256: string };
  transform: {
    type: ApiTesterOperationTransformType;
    applicability: string;
    expectedRelation: string;
  };
  applicability: "applicable" | "not-applicable";
  status: "pass" | "fail" | "not-applicable";
  reason: string | null;
  comparisonFields: string[];
  derived: { format: "json" | "yaml"; sha256: string } | null;
  parameters: Record<string, string | number | boolean>;
  errors: string[];
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeCasePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "input";
}

/** Evaluate one representation change while retaining the parent byte binding. */
export function evaluateClassProofMetamorphicCase(input: ClassProofValidationInput & {
  type: ApiTesterOperationTransformType;
}): ClassProofMetamorphicCase {
  const origin = input.origin ?? "real-development-input";
  const result = evaluateApiTesterOperationTransform({
    sourceText: input.sourceText,
    format: input.format,
    type: input.type,
  });
  const registration = CLASS_PROOF_METAMORPHIC_TRANSFORM_REGISTRY.find((row) => row.type === input.type)!;
  return {
    caseId: `${safeCasePart(input.inputId)}-${input.type}`,
    inputId: input.inputId,
    memberId: input.memberId,
    origin,
    parent: { path: input.sourcePath, format: input.format, sha256: sha256(input.sourceText) },
    transform: {
      type: registration.type,
      applicability: registration.applicability,
      expectedRelation: registration.expectedRelation,
    },
    applicability: result.applicability,
    status: result.status,
    reason: result.reason,
    comparisonFields: result.comparisonFields,
    derived: result.derivedSha256 && result.derivedFormat
      ? { format: result.derivedFormat, sha256: result.derivedSha256 }
      : null,
    parameters: result.parameters,
    errors: result.errors,
  };
}

export function buildClassProofMetamorphicCases(
  inputs: ClassProofValidationInput[],
): ClassProofMetamorphicCase[] {
  return inputs.flatMap((input) => CLASS_PROOF_METAMORPHIC_TRANSFORM_REGISTRY.map((registration) =>
    evaluateClassProofMetamorphicCase({ ...input, type: registration.type })));
}

/**
 * Build one synthetic boundary matrix. It is deliberately labelled synthetic
 * and is never included in the real-member or real-input denominators.
 */
export function buildClassProofBoundaryCases(
  sourceText: string,
  format: "json" | "yaml",
  sourcePath = "synthetic/class-proof-boundary.yaml",
): ClassProofMetamorphicCase[] {
  return CLASS_PROOF_METAMORPHIC_TRANSFORM_REGISTRY.map((registration) => evaluateClassProofMetamorphicCase({
    inputId: "synthetic-class-proof-boundary",
    memberId: "synthetic-class-proof-boundary",
    sourcePath,
    sourceText,
    format,
    origin: "synthetic-boundary",
    type: registration.type,
  }));
}

export type ClassProofFaultDetectorLayer =
  | "source-coverage"
  | "dependency-verifier"
  | "admission-consistency"
  | "independent-checker"
  | "package-binding";

export type ClassProofFaultKind =
  | "operation-list-omission"
  | "operation-list-duplicate"
  | "artifact-operation-omission"
  | "parameter-inheritance-loss"
  | "reference-definition-loss"
  | "security-requirement-loss"
  | "summary-metadata-drift"
  | "admission-false-acceptance"
  | "artifact-witness-loss"
  | "field-constraint-loss"
  | "array-encoding-loss"
  | "status-evidence-loss"
  | "request-dependency-loss"
  | "input-binding-mismatch"
  | "contract-binding-mismatch"
  | "artifact-binding-mismatch";

export type ClassProofFaultRegistration = {
  fault: ClassProofFaultKind;
  detectorLayer: ClassProofFaultDetectorLayer;
  expectedCode: string;
  applicability: string;
  mutation: string;
};

/** Pre-registered before any injected mutation is executed. */
export const CLASS_PROOF_FAULT_INJECTION_REGISTRY: readonly ClassProofFaultRegistration[] = [
  {
    fault: "operation-list-omission",
    detectorLayer: "source-coverage",
    expectedCode: "ANALYZER_OPERATION_OMITTED",
    applicability: "fixture has at least two independently enumerable operations",
    mutation: "remove one analyzer operation row while retaining the source bytes",
  },
  {
    fault: "operation-list-duplicate",
    detectorLayer: "source-coverage",
    expectedCode: "ANALYZER_OPERATION_DUPLICATE",
    applicability: "fixture has at least one independently enumerable operation",
    mutation: "append a duplicate analyzer operation row",
  },
  {
    fault: "artifact-operation-omission",
    detectorLayer: "independent-checker",
    expectedCode: "OPERATION_COVERAGE_FAILED",
    applicability: "production fixture generates at least two endpoints",
    mutation: "remove one generated endpoint from the plan",
  },
  {
    fault: "parameter-inheritance-loss",
    detectorLayer: "dependency-verifier",
    expectedCode: "PARAMETER_DEPENDENCY_LOST",
    applicability: "accepted operation has an effective parameter",
    mutation: "drop the projected operation/path parameter",
  },
  {
    fault: "reference-definition-loss",
    detectorLayer: "dependency-verifier",
    expectedCode: "REFERENCE_DEPENDENCY_LOST",
    applicability: "accepted projection contains a local reference",
    mutation: "remove the referenced component definition",
  },
  {
    fault: "security-requirement-loss",
    detectorLayer: "dependency-verifier",
    expectedCode: "SECURITY_DEPENDENCY_LOST",
    applicability: "fixture declares an operation or root security requirement",
    mutation: "replace the projected security requirement with an unresolved scheme",
  },
  {
    fault: "summary-metadata-drift",
    detectorLayer: "source-coverage",
    expectedCode: "ANALYZER_SOURCE_METADATA_DRIFT",
    applicability: "fixture has an operation summary or operationId",
    mutation: "change the analyzer summary without changing source bytes",
  },
  {
    fault: "admission-false-acceptance",
    detectorLayer: "admission-consistency",
    expectedCode: "FALSE_ACCEPTANCE",
    applicability: "fixture has an accepted operation",
    mutation: "force an accepted row with an implementation-failure finding",
  },
  {
    fault: "artifact-witness-loss",
    detectorLayer: "independent-checker",
    expectedCode: "SCHEMA_DERIVED_CASES_FAILED",
    applicability: "production fixture contains a boundary witness",
    mutation: "delete a generated boundary witness value",
  },
  {
    fault: "field-constraint-loss",
    detectorLayer: "dependency-verifier",
    expectedCode: "REFERENCE_DEPENDENCY_LOST",
    applicability: "projected schema has a preserved scalar constraint",
    mutation: "change minLength/minItems/minimum in the projected dependency",
  },
  {
    fault: "array-encoding-loss",
    detectorLayer: "dependency-verifier",
    expectedCode: "PARAMETER_DEPENDENCY_LOST",
    applicability: "accepted operation has a query array parameter",
    mutation: "change form/explode wire encoding in the projection",
  },
  {
    fault: "status-evidence-loss",
    detectorLayer: "dependency-verifier",
    expectedCode: "RESPONSE_DEPENDENCY_LOST",
    applicability: "accepted operation has at least two documented responses",
    mutation: "delete one documented response status from the projection",
  },
  {
    fault: "request-dependency-loss",
    detectorLayer: "dependency-verifier",
    expectedCode: "REQUEST_DEPENDENCY_LOST",
    applicability: "accepted operation has a request body",
    mutation: "remove the projected request body",
  },
  {
    fault: "input-binding-mismatch",
    detectorLayer: "package-binding",
    expectedCode: "INPUT_BINDING_MISMATCH",
    applicability: "ordinary-input output has a digest-bound source file",
    mutation: "replace source bytes after the manifest was written",
  },
  {
    fault: "contract-binding-mismatch",
    detectorLayer: "package-binding",
    expectedCode: "CONTRACT_BINDING_MISMATCH",
    applicability: "ordinary-input manifest and output closure exist",
    mutation: "change the manifest binding identity after construction",
  },
  {
    fault: "artifact-binding-mismatch",
    detectorLayer: "package-binding",
    expectedCode: "ARTIFACT_BINDING_MISMATCH",
    applicability: "ordinary-input report is present in the output closure",
    mutation: "change the report binding identity without changing the source",
  },
] as const;

export type ClassProofFaultDetection = {
  fault: ClassProofFaultKind;
  detectorLayer: ClassProofFaultDetectorLayer;
  expectedCode: string;
  detected: boolean;
  applicability: "applicable" | "not-applicable" | "unresolved";
  detail: string;
};

export function summarizeClassProofFaults(rows: Array<Pick<ClassProofFaultDetection, "detected"> &
  Partial<Omit<ClassProofFaultDetection, "detected">>>) {
  const applicability = (row: { applicability?: ClassProofFaultDetection["applicability"] }) =>
    row.applicability ?? "applicable";
  return {
    injected: rows.length,
    detected: rows.filter((row) => applicability(row) === "applicable" && row.detected).length,
    missed: rows.filter((row) => applicability(row) === "applicable" && !row.detected).length,
    notApplicable: rows.filter((row) => applicability(row) === "not-applicable").length,
    unresolved: rows.filter((row) => applicability(row) === "unresolved").length,
  };
}

function record(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function firstAcceptedProjection(sourceText: string, format: "json" | "yaml") {
  const analysis = analyzeApiTesterOperationDocument(sourceText, format);
  const acceptedIndex = analysis.admissions.findIndex((row) => row.status === "accepted" && row.projection?.document);
  if (acceptedIndex < 0 || !analysis.document) return null;
  const admission = analysis.admissions[acceptedIndex]!;
  return {
    document: analysis.document as JsonRecord,
    operationKey: admission.operationKey,
    projection: clone(admission.projection!.document) as JsonRecord,
    admission,
    analysis,
  };
}

function projectionFault(
  registration: ClassProofFaultRegistration,
  sourceText: string,
  format: "json" | "yaml",
  mutate: (projection: JsonRecord, operationKey: string) => void,
  select?: (operationKey: string, admission: ApiTesterOperationAdmission) => boolean,
): ClassProofFaultDetection {
  const analysis = analyzeApiTesterOperationDocument(sourceText, format);
  const selectedIndex = analysis.admissions.findIndex((row) => row.status === "accepted"
    && row.projection?.document && (!select || select(row.operationKey, row)));
  const base = selectedIndex < 0 || !analysis.document ? null : {
    document: analysis.document as JsonRecord,
    operationKey: analysis.admissions[selectedIndex]!.operationKey,
    projection: clone(analysis.admissions[selectedIndex]!.projection!.document) as JsonRecord,
    admission: analysis.admissions[selectedIndex]!,
    analysis,
  };
  if (!base) return {
    fault: registration.fault,
    detectorLayer: registration.detectorLayer,
    expectedCode: registration.expectedCode,
    detected: false,
    applicability: "not-applicable",
    detail: "no accepted projection satisfies the preregistered applicability condition",
  };
  const projection = clone(base.projection);
  try {
    mutate(projection, base.operationKey);
  } catch (error) {
    return {
      fault: registration.fault,
      detectorLayer: registration.detectorLayer,
      expectedCode: registration.expectedCode,
      detected: false,
      applicability: "unresolved",
      detail: `mutation could not be applied: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = verifyApiTesterProjectionDependencies({
    sourceDocument: base.document,
    operationKey: base.operationKey,
    projectedDocument: projection,
  });
  return {
    fault: registration.fault,
    detectorLayer: registration.detectorLayer,
    expectedCode: registration.expectedCode,
    detected: result.errors.includes(registration.expectedCode as never),
    applicability: "applicable",
    detail: result.errors.join(",") || "dependency verifier accepted the mutated projection",
  };
}

function mutateOperation(document: JsonRecord, operationKey: string): JsonRecord {
  const split = operationKey.indexOf(" ");
  const method = operationKey.slice(0, split).toLowerCase();
  const path = operationKey.slice(split + 1);
  const paths = record(document.paths) ? document.paths as JsonRecord : null;
  const pathItem = paths && record(paths[path]) ? paths[path] as JsonRecord : null;
  const operation = pathItem && record(pathItem[method]) ? pathItem[method] as JsonRecord : null;
  if (!pathItem || !operation) throw new Error(`operation not found: ${operationKey}`);
  return operation;
}

function mutateFirstScalarConstraint(document: JsonRecord): void {
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(walk);
    if (!record(value)) return false;
    for (const key of ["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]) {
      if (typeof value[key] === "number") {
        value[key] = (value[key] as number) + 1;
        return true;
      }
    }
    return Object.values(value).some(walk);
  };
  if (!walk(document)) throw new Error("no scalar constraint in projection");
}

function mutateFirstArrayEncoding(document: JsonRecord, operationKey: string): void {
  const operation = mutateOperation(document, operationKey);
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  let parameter = parameters.find((value) => record(value)) as JsonRecord | undefined;
  if (parameter && typeof parameter.$ref === "string") {
    const match = /^#\/components\/parameters\/([^/]+)$/u.exec(parameter.$ref);
    const components = record(document.components) && record((document.components as JsonRecord).parameters)
      ? (document.components as JsonRecord).parameters as JsonRecord : null;
    const target = match && components ? components[match[1]!] : undefined;
    if (record(target)) parameter = target;
  }
  if (!record(parameter)) throw new Error("no query parameter in projection");
  parameter.style = parameter.style === "spaceDelimited" ? "form" : "spaceDelimited";
  parameter.explode = !(parameter.explode === true);
}

function mutateResponse(document: JsonRecord, operationKey: string): void {
  const operation = mutateOperation(document, operationKey);
  if (!record(operation.responses)) throw new Error("no responses in projection");
  const key = Object.keys(operation.responses)[0];
  if (!key) throw new Error("response map is empty");
  delete (operation.responses as JsonRecord)[key];
}

function mutateRequest(document: JsonRecord, operationKey: string): void {
  const operation = mutateOperation(document, operationKey);
  if (!Object.prototype.hasOwnProperty.call(operation, "requestBody")) throw new Error("no request body in projection");
  delete operation.requestBody;
}

function makeFalseAcceptance(sourceText: string, format: "json" | "yaml"): ClassProofFaultDetection {
  const registration = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "admission-false-acceptance")!;
  const base = firstAcceptedProjection(sourceText, format);
  if (!base) return {
    fault: registration.fault,
    detectorLayer: registration.detectorLayer,
    expectedCode: registration.expectedCode,
    detected: false,
    applicability: "not-applicable",
    detail: "no accepted operation in fixture",
  };
  const row: ApiTesterOperationAdmission = {
    operationKey: base.operationKey,
    status: "accepted",
    findings: [{ code: "FORCED", category: "implementation-failure", locator: "#", message: "forced acceptance" }],
    firstObservedRejection: null,
    normalizedOperation: null,
    projection: null,
    projectionSummary: null,
  };
  const result = verifyApiTesterOperationAdmissionConsistency([row]);
  return {
    fault: registration.fault,
    detectorLayer: registration.detectorLayer,
    expectedCode: registration.expectedCode,
    detected: result.errors.includes(registration.expectedCode),
    applicability: "applicable",
    detail: result.errors.join(",") || "admission verifier accepted the forced row",
  };
}

type OrdinaryFaultRoot = { root: string; manifestPath: string };

async function createOrdinaryFaultRoot(fixtureRoot: string, nodeExecutable: string): Promise<OrdinaryFaultRoot> {
  const root = await mkdtemp(join(tmpdir(), "skvm-class-proof-fault-base-"));
  const inputDir = join(root, "input");
  await mkdir(inputDir, { recursive: true });
  const source = await readFile(join(fixtureRoot, "openapi.yaml"));
  await writeFile(join(inputDir, "openapi.yaml"), source);
  const manifest = {
    schemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
    identity: "skill-ir-api-tester-operation-input-development-001",
    bindingId: "class-proof-r7-fault-fixture",
    supportContractId: "api-tester-openapi-subset-v2",
    input: {
      path: "input/openapi.yaml",
      format: "yaml",
      bytes: source.byteLength,
      sha256: sha256(source),
    },
    output: { path: "output", writeMode: "exclusive-create-once" },
  } as const;
  const manifestPath = join(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await runApiTesterOperationInput({ rootDir: root, manifestPath: "manifest.json", nodeExecutable, completedAt: "2026-09-12T00:00:00.000Z" });
  return { root, manifestPath };
}

async function copyFaultRoot(base: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "skvm-class-proof-fault-case-"));
  await rm(target, { recursive: true, force: true });
  await cp(base, target, { recursive: true });
  return target;
}

async function verifyMutatedRoot(root: string, nodeExecutable: string): Promise<{ detected: boolean; detail: string }> {
  try {
    await verifyApiTesterOperationInputOutput({ rootDir: root, manifestPath: "manifest.json", nodeExecutable });
    return { detected: false, detail: "independent input/output verifier accepted the mutation" };
  } catch (error) {
    return { detected: true, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function customBindingFaults(fixtureRoot: string, nodeExecutable: string): Promise<ClassProofFaultDetection[]> {
  const base = await createOrdinaryFaultRoot(fixtureRoot, nodeExecutable);
  const rows: ClassProofFaultDetection[] = [];
  try {
    const inputRoot = await copyFaultRoot(base.root);
    try {
      const inputPath = join(inputRoot, "input/openapi.yaml");
      const original = await readFile(inputPath);
      await writeFile(inputPath, Buffer.concat([original, Buffer.from("\n")]), "utf8");
      const result = await verifyMutatedRoot(inputRoot, nodeExecutable);
      const registration = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "input-binding-mismatch")!;
      rows.push({
        fault: registration.fault,
        detectorLayer: registration.detectorLayer,
        expectedCode: registration.expectedCode,
        detected: result.detected && /input digest mismatch/iu.test(result.detail),
        applicability: "applicable",
        detail: result.detail,
      });
    } finally { await rm(inputRoot, { recursive: true, force: true }); }

    const contractRoot = await copyFaultRoot(base.root);
    try {
      const manifestPath = join(contractRoot, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as JsonRecord;
      manifest.bindingId = "class-proof-r7-other";
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      const result = await verifyMutatedRoot(contractRoot, nodeExecutable);
      const registration = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "contract-binding-mismatch")!;
      rows.push({
        fault: registration.fault,
        detectorLayer: registration.detectorLayer,
        expectedCode: registration.expectedCode,
        detected: result.detected && /binding mismatch/iu.test(result.detail),
        applicability: "applicable",
        detail: result.detail,
      });
    } finally { await rm(contractRoot, { recursive: true, force: true }); }

    const artifactRoot = await copyFaultRoot(base.root);
    try {
      const outputManifestPath = join(artifactRoot, "output/output-manifest.json");
      const outputManifest = JSON.parse(await readFile(outputManifestPath, "utf8")) as JsonRecord;
      outputManifest.bindingId = "class-proof-r7-other";
      await writeFile(outputManifestPath, `${JSON.stringify(outputManifest, null, 2)}\n`, "utf8");
      const result = await verifyMutatedRoot(artifactRoot, nodeExecutable);
      const registration = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "artifact-binding-mismatch")!;
      rows.push({
        fault: registration.fault,
        detectorLayer: registration.detectorLayer,
        expectedCode: registration.expectedCode,
        detected: result.detected && /binding mismatch/iu.test(result.detail),
        applicability: "applicable",
        detail: result.detail,
      });
    } finally { await rm(artifactRoot, { recursive: true, force: true }); }
  } finally {
    await rm(base.root, { recursive: true, force: true });
  }
  return rows;
}

/**
 * Execute the complete pre-registered fault set. The first nine cases reuse
 * the existing production checker harness; the remaining cases exercise the
 * independent dependency and package-binding verifiers on isolated copies.
 */
export async function runClassProofFaultDetection(options: {
  nodeExecutable: string;
  fixtureRoot: string;
}): Promise<ClassProofFaultDetection[]> {
  const sourceText = await readFile(join(options.fixtureRoot, "openapi.yaml"), "utf8");
  const base = await runApiTesterOperationFaultDetection(options);
  const mapped: ClassProofFaultDetection[] = base.map((row) => {
    const mapping: Record<string, ClassProofFaultKind> = {
      "operation-omission": "operation-list-omission",
      "operation-duplicate": "operation-list-duplicate",
      "parameter-dependency-loss": "parameter-inheritance-loss",
      "reference-dependency-loss": "reference-definition-loss",
      "security-dependency-loss": "security-requirement-loss",
      "summary-drift": "summary-metadata-drift",
      "false-acceptance": "admission-false-acceptance",
      "artifact-endpoint-loss": "artifact-operation-omission",
      "artifact-witness-loss": "artifact-witness-loss",
    };
    const fault = mapping[row.fault];
    if (!fault) throw new Error(`unmapped production fault: ${row.fault}`);
    const registration = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((entry) => entry.fault === fault)!;
    return {
      fault,
      detectorLayer: registration.detectorLayer,
      expectedCode: registration.expectedCode,
      detected: row.detected,
      applicability: "applicable",
      detail: `${row.code}:${row.detected ? "detected" : "missed"}`,
    };
  });
  const custom: ClassProofFaultDetection[] = [];
  const field = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "field-constraint-loss")!;
  custom.push(projectionFault(field, sourceText, "yaml", (projection) => mutateFirstScalarConstraint(projection)));
  const array = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "array-encoding-loss")!;
  custom.push(projectionFault(array, sourceText, "yaml", (projection, operationKey) => mutateFirstArrayEncoding(projection, operationKey),
    (operationKey) => operationKey === "GET /items"));
  const status = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "status-evidence-loss")!;
  custom.push(projectionFault(status, sourceText, "yaml", (projection, operationKey) => mutateResponse(projection, operationKey)));
  const request = CLASS_PROOF_FAULT_INJECTION_REGISTRY.find((row) => row.fault === "request-dependency-loss")!;
  custom.push(projectionFault(request, sourceText, "yaml", (projection, operationKey) => mutateRequest(projection, operationKey),
    (operationKey) => operationKey === "POST /items"));
  custom.push(...await customBindingFaults(options.fixtureRoot, options.nodeExecutable));
  const all = [...mapped, ...custom];
  const byFault = new Map(all.map((row) => [row.fault, row]));
  if (byFault.size !== all.length || byFault.size !== CLASS_PROOF_FAULT_INJECTION_REGISTRY.length) {
    throw new Error("class-proof fault registry/result cardinality mismatch");
  }
  return CLASS_PROOF_FAULT_INJECTION_REGISTRY.map((registration) => {
    const row = byFault.get(registration.fault);
    if (!row) throw new Error(`class-proof fault result missing: ${registration.fault}`);
    return row;
  });
}
