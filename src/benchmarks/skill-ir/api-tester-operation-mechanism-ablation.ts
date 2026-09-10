#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { ApiTesterOperationDevelopmentReportSchema } from "../../skill-ir/api-tester-operation-development";
import { ApiTesterOperationValidationDevelopmentReportSchema } from "../../skill-ir/api-tester-operation-validation-development";
import { PublicStructureOfflineFamilyReportSchema } from "./public-structure-offline-family-contract";
import { ApiTesterOperationSourceFailureAuditSchema } from "./api-tester-operation-prospective-source-failure-audit";
import {
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
  resolveContainedNewFile,
} from "./public-skill-responsibility-corpus-paths";

export const API_TESTER_OPERATION_MECHANISM_ABLATION_IDENTITY =
  "skill-ir-api-tester-operation-mechanism-ablation-development-001" as const;
export const API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH =
  "benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json" as const;
export const API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH =
  "results/skill-ir/api-tester-operation-mechanism-ablation-development-001/report.json" as const;
export const API_TESTER_OPERATION_MECHANISM_ABLATION_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-mechanism-ablation-report/v1" as const;
const PROTOCOL_SCHEMA_VERSION = "skill-ir-api-tester-operation-mechanism-ablation-protocol/v1" as const;
const Sha1Schema = z.string().regex(/^[0-9a-f]{40}$/u);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const BoundFileSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();

const ProtocolInputSchema = BoundFileSchema;
const PanelProtocolSchema = z.object({
  id: z.enum(["operation-segmentation", "independent-dependency-verification", "complete-responsibility-denominator"]),
  control: z.string().min(1),
  treatment: z.string().min(1),
  universe: z.string().min(1).optional(),
  universes: z.array(z.string().min(1)).optional(),
  comparisonFields: z.array(z.string().min(1)).min(1),
  expectedRelation: z.string().min(1),
}).strict();

export const ApiTesterOperationMechanismAblationProtocolSchema = z.object({
  schemaVersion: z.literal(PROTOCOL_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_MECHANISM_ABLATION_IDENTITY),
  status: z.literal("preregistered-development-control"),
  preregisteredAt: z.string().datetime(),
  parentCommit: Sha1Schema,
  supportContractId: z.literal("api-tester-openapi-subset-v2"),
  inputs: z.object({
    task1: ProtocolInputSchema,
    task2Validation: ProtocolInputSchema,
    task7Family: ProtocolInputSchema,
    prospectiveFailureGate: ProtocolInputSchema.extend({ role: z.literal("availability-gate-only-not-an-effect-denominator") }).strict(),
  }).strict(),
  panels: z.array(PanelProtocolSchema).length(3),
  realBoundaryContext: z.tuple([
    z.literal("meilisearch-missing-local-parameter-reference-remains-source-blocking"),
    z.literal("bangumi-external-response-reference-remains-source-validity-advisory"),
  ]),
  unavailableEvidence: z.tuple([
    z.literal("task3-prospective-first-run"),
    z.literal("task8-forty-skill-corpus"),
    z.literal("task9-three-api-skill-reuse"),
  ]),
  accounting: z.object({
    prospectiveRuns: z.literal(0),
    newPublicSourceRequests: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-project-runner"),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict().superRefine((value, context) => {
  const expectedIds = ["operation-segmentation", "independent-dependency-verification", "complete-responsibility-denominator"];
  if (JSON.stringify(value.panels.map((panel) => panel.id)) !== JSON.stringify(expectedIds)) {
    context.addIssue({ code: "custom", path: ["panels"], message: "mechanism panel order drift" });
  }
});

const OperationDocumentRowSchema = z.object({
  rowId: z.string().min(1),
  operations: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  checkerPassed: z.number().int().nonnegative(),
  wholeDocumentAdmitted: z.boolean(),
}).strict();
const DistributionSchema = z.record(z.string(), z.number().int().nonnegative());

export const ApiTesterOperationMechanismAblationReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_MECHANISM_ABLATION_REPORT_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_MECHANISM_ABLATION_IDENTITY),
  status: z.literal("verified-development-mechanism-ablation"),
  completedAt: z.string().datetime(),
  protocol: z.object({ path: z.literal(API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH), sha256: Sha256Schema, parentCommit: Sha1Schema }).strict(),
  inputs: z.object({
    task1: BoundFileSchema,
    task2Validation: BoundFileSchema,
    task7Family: BoundFileSchema,
    prospectiveFailureGate: BoundFileSchema,
  }).strict(),
  evidenceAvailability: z.object({
    task3ProspectiveFirstRun: z.literal("unavailable-source-acquisition-terminal-http-403"),
    task8FortySkillCorpus: z.literal("unavailable-preregistered-search-rate-limit-terminal"),
    task9ThreeApiSkillReuse: z.literal("unavailable-task8-selection-missing"),
    unavailableEvidenceIncludedInEffectDenominator: z.literal(false),
  }).strict(),
  panels: z.object({
    operationSegmentation: z.object({
      universe: z.object({ documents: z.literal(6), operations: z.number().int().nonnegative() }).strict(),
      wholeDocument: z.object({ admittedDocuments: z.number().int().nonnegative(), operationsCovered: z.number().int().nonnegative(), admissionRule: z.literal("all-operations-accepted-and-enumeration-complete") }).strict(),
      operationLevel: z.object({ documentsWithAnyAccepted: z.number().int().nonnegative(), fullyAcceptedDocuments: z.number().int().nonnegative(), acceptedOperations: z.number().int().nonnegative(), checkerPassedOperations: z.number().int().nonnegative(), rejectedOperations: z.number().int().nonnegative(), unresolvedOperations: z.number().int().nonnegative() }).strict(),
      delta: z.object({ additionalCheckerPassedOperations: z.number().int(), fullyAcceptedDocumentDelta: z.number().int() }).strict(),
      relation: z.literal("pass"),
      documents: z.array(OperationDocumentRowSchema).length(6),
      interpretation: z.string().min(1),
    }).strict(),
    independentDependencyVerification: z.object({
      universe: z.object({ injectedFaults: z.literal(9), dependencyTargetedFaults: z.number().int().nonnegative() }).strict(),
      fullVerifier: z.object({ correctLayerDetected: z.number().int().nonnegative(), missed: z.number().int().nonnegative() }).strict(),
      noDependencyVerifier: z.object({ correctLayerDetected: z.number().int().nonnegative(), missed: z.number().int().nonnegative() }).strict(),
      dependencyTargeted: z.object({ injected: z.number().int().nonnegative(), fullDetected: z.number().int().nonnegative(), controlDetected: z.number().int().nonnegative(), controlMissed: z.number().int().nonnegative() }).strict(),
      cases: z.array(z.object({ fault: z.string().min(1), detectorLayer: z.string().min(1), code: z.string().min(1), fullDetected: z.boolean(), noDependencyVerifierDetected: z.boolean() }).strict()).length(9),
      realBoundaryContext: z.array(z.object({ responsibilityId: z.string().min(1), sourceValidity: z.string().min(1), dependencyClosure: z.string().min(1), currentSupport: z.string().min(1), effectRateRole: z.literal("context-only-not-scored") }).strict()).length(2),
      relation: z.literal("pass"),
      interpretation: z.string().min(1),
    }).strict(),
    completeResponsibilityDenominator: z.object({
      operations: z.object({ complete: z.number().int().nonnegative(), visibleInAcceptedOnly: z.number().int().nonnegative(), hidden: z.number().int().nonnegative(), hiddenRejected: z.number().int().nonnegative(), hiddenUnresolved: z.number().int().nonnegative(), documentsWithHidden: z.number().int().nonnegative(), relation: z.literal("pass") }).strict(),
      family: z.object({ complete: z.number().int().nonnegative(), visibleInCurrentSupportedOnly: z.number().int().nonnegative(), hidden: z.number().int().nonnegative(), skills: z.number().int().nonnegative(), skillsWithHidden: z.number().int().nonnegative(), familyMembershipDistribution: DistributionSchema, verifiabilityDistribution: DistributionSchema, constructibilityDistribution: DistributionSchema, currentSupportDistribution: DistributionSchema, relation: z.literal("pass") }).strict(),
      interpretation: z.string().min(1),
    }).strict(),
  }).strict(),
  accounting: z.object({
    prospectiveRuns: z.literal(0),
    newPublicSourceRequests: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-project-runner"),
  }).strict(),
  limitations: z.tuple([
    z.literal("deterministic-development-controls-not-randomized-causal-estimates"),
    z.literal("operation-statuses-within-documents-are-not-independent-samples"),
    z.literal("fault-detection-rate-applies-only-to-nine-designed-synthetic-faults"),
    z.literal("task3-task8-task9-evidence-unavailable-and-not-imputed"),
    z.literal("no-ecosystem-real-api-human-effort-or-readiness-claim"),
  ]),
  portableSemanticSha256: Sha256Schema,
}).strict();
export type ApiTesterOperationMechanismAblationReport = z.infer<typeof ApiTesterOperationMechanismAblationReportSchema>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function apiTesterOperationMechanismAblationPortableSha256(report: Record<string, unknown>): string {
  const { completedAt: _completedAt, portableSemanticSha256: _portable, ...semantic } = report;
  return sha256(JSON.stringify(canonical(semantic)));
}

function distribution(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

async function readBoundJson<T>(rootDir: string, binding: { path: string; sha256: string }, schema: z.ZodType<T>): Promise<T> {
  const path = normalizeRepositoryRelativePath(binding.path, "mechanism ablation input path");
  const bytes = await readFile(await resolveContainedExistingFile(rootDir, path, "mechanism ablation input"));
  if (sha256(bytes) !== binding.sha256) throw new Error(`mechanism ablation input digest drift: ${path}`);
  return schema.parse(JSON.parse(bytes.toString("utf8")));
}

async function deriveReport(options: {
  rootDir: string;
  protocolPath: string;
  completedAt: string;
}): Promise<ApiTesterOperationMechanismAblationReport> {
  const rootDir = resolve(options.rootDir);
  const protocolPath = normalizeRepositoryRelativePath(options.protocolPath, "mechanism ablation protocol path");
  if (protocolPath !== API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH) throw new Error("mechanism ablation protocol identity drift");
  const protocolBytes = await readFile(await resolveContainedExistingFile(rootDir, protocolPath, "mechanism ablation protocol"));
  const protocol = ApiTesterOperationMechanismAblationProtocolSchema.parse(JSON.parse(protocolBytes.toString("utf8")));
  const task1 = await readBoundJson(rootDir, protocol.inputs.task1, ApiTesterOperationDevelopmentReportSchema);
  const task2 = await readBoundJson(rootDir, protocol.inputs.task2Validation, ApiTesterOperationValidationDevelopmentReportSchema);
  const task7 = await readBoundJson(rootDir, protocol.inputs.task7Family, PublicStructureOfflineFamilyReportSchema);
  const prospectiveFailure = await readBoundJson(rootDir, protocol.inputs.prospectiveFailureGate, ApiTesterOperationSourceFailureAuditSchema);
  if (prospectiveFailure.status !== "verified-source-acquisition-failure"
    || prospectiveFailure.totals.authoritativeSelections !== 0
    || prospectiveFailure.terminal.statusCode !== 403) {
    throw new Error("prospective failure availability gate drift");
  }

  const documents = task1.documents.map((document) => {
    const checkerPassed = document.artifact.status === "passed" ? document.artifact.checkedOperationCount : 0;
    const wholeDocumentAdmitted = document.enumeration.complete
      && document.admission.accepted === document.enumeration.operationCount
      && document.admission.rejected === 0
      && document.admission.unresolved === 0;
    if (document.admission.accepted + document.admission.rejected + document.admission.unresolved !== document.enumeration.operationCount
      || document.artifact.acceptedOperationCount !== document.admission.accepted) {
      throw new Error(`Task 1 operation conservation drift: ${document.rowId}`);
    }
    return {
      rowId: document.rowId,
      operations: document.enumeration.operationCount,
      accepted: document.admission.accepted,
      rejected: document.admission.rejected,
      unresolved: document.admission.unresolved,
      checkerPassed,
      wholeDocumentAdmitted,
    };
  });
  const operations = documents.reduce((sum, row) => sum + row.operations, 0);
  const accepted = documents.reduce((sum, row) => sum + row.accepted, 0);
  const rejected = documents.reduce((sum, row) => sum + row.rejected, 0);
  const unresolved = documents.reduce((sum, row) => sum + row.unresolved, 0);
  const checkerPassed = documents.reduce((sum, row) => sum + row.checkerPassed, 0);
  if (operations !== task1.totals.operations || accepted !== task1.totals.accepted
    || rejected !== task1.totals.rejected || unresolved !== task1.totals.unresolved
    || checkerPassed !== task1.totals.artifactCheckedPassedOperations) {
    throw new Error("Task 1 derived operation totals drift");
  }
  const wholeAdmitted = documents.filter((row) => row.wholeDocumentAdmitted);
  const wholeOperations = wholeAdmitted.reduce((sum, row) => sum + row.operations, 0);
  const fullyAcceptedDocuments = documents.filter((row) => row.accepted === row.operations && row.rejected === 0 && row.unresolved === 0).length;

  const faultCases = task2.faultDetection.cases.map((entry) => ({
    fault: entry.fault,
    detectorLayer: entry.detectorLayer,
    code: entry.code,
    fullDetected: entry.detected,
    noDependencyVerifierDetected: entry.detectorLayer === "dependency-verifier" ? false : entry.detected,
  }));
  const dependencyCases = faultCases.filter((entry) => entry.detectorLayer === "dependency-verifier");
  const fullDetected = faultCases.filter((entry) => entry.fullDetected).length;
  const controlDetected = faultCases.filter((entry) => entry.noDependencyVerifierDetected).length;
  if (faultCases.length !== task2.faultDetection.totals.injected || fullDetected !== task2.faultDetection.totals.detected) {
    throw new Error("Task 2 derived fault totals drift");
  }

  const assessments = task7.assessments;
  const familyVisible = assessments.filter((entry) => entry.currentSupport === "supported");
  const hiddenResponsibilityIds = new Set(assessments.filter((entry) => entry.currentSupport !== "supported").map((entry) => entry.responsibilityId));
  const skillsWithHidden = task7.skills.filter((skill) => skill.responsibilityIds.some((id) => hiddenResponsibilityIds.has(id))).length;
  const boundaryIds = [
    "api-tester-source-boundaries/meilisearch-missing-parameter-target",
    "api-tester-source-boundaries/bangumi-external-response-targets",
  ];
  const realBoundaryContext = boundaryIds.map((responsibilityId) => {
    const assessment = assessments.find((entry) => entry.responsibilityId === responsibilityId);
    if (!assessment) throw new Error(`Task 7 real boundary responsibility missing: ${responsibilityId}`);
    return { responsibilityId, sourceValidity: assessment.sourceValidity, dependencyClosure: assessment.dependencyClosure, currentSupport: assessment.currentSupport, effectRateRole: "context-only-not-scored" as const };
  });

  const semantic = {
    schemaVersion: API_TESTER_OPERATION_MECHANISM_ABLATION_REPORT_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_MECHANISM_ABLATION_IDENTITY,
    status: "verified-development-mechanism-ablation" as const,
    completedAt: z.string().datetime().parse(options.completedAt),
    protocol: { path: API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH, sha256: sha256(protocolBytes), parentCommit: protocol.parentCommit },
    inputs: {
      task1: { path: protocol.inputs.task1.path, sha256: protocol.inputs.task1.sha256 },
      task2Validation: { path: protocol.inputs.task2Validation.path, sha256: protocol.inputs.task2Validation.sha256 },
      task7Family: { path: protocol.inputs.task7Family.path, sha256: protocol.inputs.task7Family.sha256 },
      prospectiveFailureGate: { path: protocol.inputs.prospectiveFailureGate.path, sha256: protocol.inputs.prospectiveFailureGate.sha256 },
    },
    evidenceAvailability: {
      task3ProspectiveFirstRun: "unavailable-source-acquisition-terminal-http-403" as const,
      task8FortySkillCorpus: "unavailable-preregistered-search-rate-limit-terminal" as const,
      task9ThreeApiSkillReuse: "unavailable-task8-selection-missing" as const,
      unavailableEvidenceIncludedInEffectDenominator: false as const,
    },
    panels: {
      operationSegmentation: {
        universe: { documents: 6 as const, operations },
        wholeDocument: { admittedDocuments: wholeAdmitted.length, operationsCovered: wholeOperations, admissionRule: "all-operations-accepted-and-enumeration-complete" as const },
        operationLevel: { documentsWithAnyAccepted: documents.filter((row) => row.accepted > 0).length, fullyAcceptedDocuments, acceptedOperations: accepted, checkerPassedOperations: checkerPassed, rejectedOperations: rejected, unresolvedOperations: unresolved },
        delta: { additionalCheckerPassedOperations: checkerPassed - wholeOperations, fullyAcceptedDocumentDelta: fullyAcceptedDocuments - wholeAdmitted.length },
        relation: "pass" as const,
        documents,
        interpretation: "Operation splitting exposes checker-verified local work inside documents that fail an all-operations admission gate; the fixed-document observation is not an ecosystem or randomized causal estimate.",
      },
      independentDependencyVerification: {
        universe: { injectedFaults: 9 as const, dependencyTargetedFaults: dependencyCases.length },
        fullVerifier: { correctLayerDetected: fullDetected, missed: faultCases.length - fullDetected },
        noDependencyVerifier: { correctLayerDetected: controlDetected, missed: faultCases.length - controlDetected },
        dependencyTargeted: { injected: dependencyCases.length, fullDetected: dependencyCases.filter((entry) => entry.fullDetected).length, controlDetected: dependencyCases.filter((entry) => entry.noDependencyVerifierDetected).length, controlMissed: dependencyCases.filter((entry) => !entry.noDependencyVerifierDetected).length },
        cases: faultCases,
        realBoundaryContext,
        relation: "pass" as const,
        interpretation: "Under the preregistered no-layer-substitution control, removing dependency verification hides exactly the parameter, reference, and security dependency-loss fixtures; the rate is limited to this designed fault set.",
      },
      completeResponsibilityDenominator: {
        operations: { complete: operations, visibleInAcceptedOnly: accepted, hidden: rejected + unresolved, hiddenRejected: rejected, hiddenUnresolved: unresolved, documentsWithHidden: documents.filter((row) => row.rejected + row.unresolved > 0).length, relation: "pass" as const },
        family: { complete: assessments.length, visibleInCurrentSupportedOnly: familyVisible.length, hidden: assessments.length - familyVisible.length, skills: task7.skills.length, skillsWithHidden, familyMembershipDistribution: distribution(assessments.map((entry) => entry.familyMembership)), verifiabilityDistribution: distribution(assessments.map((entry) => entry.verifiability)), constructibilityDistribution: distribution(assessments.map((entry) => entry.constructibility)), currentSupportDistribution: distribution(assessments.map((entry) => entry.currentSupport)), relation: "pass" as const },
        interpretation: "Accepted/current-supported-only views remove known rejected, unresolved, missing, not-applicable, and not-assessable responsibilities; the hidden count is a denominator effect, not measured human work.",
      },
    },
    accounting: protocol.accounting,
    limitations: [
      "deterministic-development-controls-not-randomized-causal-estimates",
      "operation-statuses-within-documents-are-not-independent-samples",
      "fault-detection-rate-applies-only-to-nine-designed-synthetic-faults",
      "task3-task8-task9-evidence-unavailable-and-not-imputed",
      "no-ecosystem-real-api-human-effort-or-readiness-claim",
    ] as const,
  };
  const report = { ...semantic, portableSemanticSha256: apiTesterOperationMechanismAblationPortableSha256(semantic) };
  return ApiTesterOperationMechanismAblationReportSchema.parse(report);
}

export async function buildApiTesterOperationMechanismAblationReport(options: {
  rootDir: string;
  protocolPath: string;
  outputPath: string;
  completedAt: string;
}): Promise<ApiTesterOperationMechanismAblationReport> {
  const rootDir = resolve(options.rootDir);
  const outputPath = normalizeRepositoryRelativePath(options.outputPath, "mechanism ablation output path");
  if (outputPath !== API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH) throw new Error("mechanism ablation output identity drift");
  const report = await deriveReport(options);
  const target = join(rootDir, ...outputPath.split("/"));
  await mkdir(dirname(target), { recursive: true });
  const output = await resolveContainedNewFile(rootDir, outputPath, "mechanism ablation report");
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return report;
}

export async function verifyApiTesterOperationMechanismAblationReport(options: {
  rootDir: string;
  protocolPath: string;
  reportPath: string;
}) {
  const rootDir = resolve(options.rootDir);
  const reportPath = normalizeRepositoryRelativePath(options.reportPath, "mechanism ablation report path");
  if (reportPath !== API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH) throw new Error("mechanism ablation report identity drift");
  const report = ApiTesterOperationMechanismAblationReportSchema.parse(JSON.parse(await readFile(
    await resolveContainedExistingFile(rootDir, reportPath, "mechanism ablation report"),
    "utf8",
  )));
  if (apiTesterOperationMechanismAblationPortableSha256(report) !== report.portableSemanticSha256) {
    throw new Error("mechanism ablation portable semantic digest drift");
  }
  const derived = await deriveReport({ rootDir, protocolPath: options.protocolPath, completedAt: report.completedAt });
  if (JSON.stringify(derived) !== JSON.stringify(report)) throw new Error("mechanism ablation independently derived report drift");
  return {
    status: report.status,
    operations: report.panels.operationSegmentation.universe.operations,
    faults: report.panels.independentDependencyVerification.universe.injectedFaults,
    responsibilities: report.panels.completeResponsibilityDenominator.family.complete,
  };
}

export type ApiTesterOperationMechanismAblationCommand = {
  mode: "create" | "verify";
  rootDir: string;
  protocolPath: typeof API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH;
  outputPath: typeof API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH;
  completedAt?: string;
};

export function parseApiTesterOperationMechanismAblationCommand(argv: string[]): ApiTesterOperationMechanismAblationCommand {
  const values = new Map<string, string>();
  for (const raw of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/u.exec(raw);
    if (!match) throw new Error(`invalid argument: ${raw}`);
    if (values.has(match[1]!)) throw new Error(`duplicate argument: --${match[1]}`);
    values.set(match[1]!, match[2]!);
  }
  const take = (key: string, required = true) => {
    const value = values.get(key);
    values.delete(key);
    if (required && !value) throw new Error(`--${key} is required`);
    return value;
  };
  const mode = z.enum(["create", "verify"]).parse(take("mode"));
  const rootDir = take("root")!;
  const protocolPath = take("protocol")!;
  if (protocolPath !== API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH) throw new Error(`--protocol must be ${API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH}`);
  const outputPath = take("out")!;
  if (outputPath !== API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH) throw new Error(`--out must be ${API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH}`);
  const completedAtValue = take("completed-at", mode === "create");
  if (mode === "verify" && completedAtValue !== undefined) throw new Error("--completed-at is only valid in create mode");
  const completedAt = completedAtValue === undefined ? undefined : z.string().datetime().parse(completedAtValue);
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return { mode, rootDir, protocolPath: API_TESTER_OPERATION_MECHANISM_ABLATION_PROTOCOL_PATH, outputPath: API_TESTER_OPERATION_MECHANISM_ABLATION_OUTPUT_PATH, completedAt };
}

if (import.meta.main) {
  const command = parseApiTesterOperationMechanismAblationCommand(Bun.argv.slice(2));
  const result = command.mode === "create"
    ? await buildApiTesterOperationMechanismAblationReport({ rootDir: command.rootDir, protocolPath: command.protocolPath, outputPath: command.outputPath, completedAt: command.completedAt! })
    : await verifyApiTesterOperationMechanismAblationReport({ rootDir: command.rootDir, protocolPath: command.protocolPath, reportPath: command.outputPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
