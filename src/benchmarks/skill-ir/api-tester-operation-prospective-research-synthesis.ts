#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { ApiTesterOperationDevelopmentReportSchema } from "../../skill-ir/api-tester-operation-development";
import { ApiTesterOperationCandidateBindingSchema } from "./api-tester-operation-candidate-binding";
import {
  ApiTesterOperationProspectivePreSourceFreezeSchema,
  ApiTesterOperationSyntheticValidationReportSchema,
} from "./api-tester-operation-prospective";
import { ApiTesterOperationSourceFailureAuditSchema } from "./api-tester-operation-prospective-source-failure-audit";
import { PublicStructureOfflineFamilyReportSchema } from "./public-structure-offline-family-contract";
import { PublicSkillMetadataFailureAuditSchema } from "./public-skill-responsibility-corpus-failure-audit";
import { ApiTesterOperationMechanismAblationReportSchema } from "./api-tester-operation-mechanism-ablation";
import { AuthoritativeAutomationReadinessV7Schema } from "./method-portfolio-automation-authority";
import {
  normalizeRepositoryRelativePath,
  resolveContainedExistingFile,
  resolveContainedNewFile,
} from "./public-skill-responsibility-corpus-paths";

export const API_TESTER_OPERATION_RESEARCH_SYNTHESIS_IDENTITY =
  "skill-ir-api-tester-operation-prospective-research-synthesis-development-001" as const;
export const API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH =
  "results/skill-ir/api-tester-operation-prospective-research-synthesis-development-001/report.json" as const;
export const API_TESTER_OPERATION_RESEARCH_SYNTHESIS_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-operation-prospective-research-synthesis-report/v1" as const;

const Sha1Schema = z.string().regex(/^[0-9a-f]{40}$/u);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const SYNTHESIS_IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.ts",
  "src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.test.ts",
] as const;

export const API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE = [
  { id: "candidate-binding", path: "benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json", sha256: "9fc91113f90e811d419e689d03e32c1178a6e0c29fcdc636c6cb5a13fe25c211", commit: "13c5d792b6d1289b2418c3c5a051c047df6a5344" },
  { id: "operation-development", path: "results/skill-ir/api-tester-operation-admission-development-001/report.json", sha256: "d2fbe27a27b5d7d94f8ab2aeb45c0fb23c610f0bd47d82cdd04ee4bd4c37b2c6", commit: "f92e8a1f95a061af921fe476aa90016b2b627153" },
  { id: "prospective-synthetic-validation", path: "results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation/report.json", sha256: "8fd612c8ff9c5fcd149f31b89ba35686e0c2a74dd99f3a59d146106d5009b8df", commit: "591765a01005acf94106c02030deedd454b9adb1" },
  { id: "prospective-pre-source-freeze", path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze-revision-001.json", sha256: "4f48859aac73f1d9ec6ea896ed4e1f3a0a06b33aaf1fb3bb517e476334cc07c2", commit: "e4c006fe32a6321ce5e4696758d53024c160f6db" },
  { id: "prospective-source-failure", path: "results/skill-ir/api-tester-operation-prospective-001/source-selection/failure-audit.json", sha256: "1c4152950e0609a9b38e0448cd00778b58972efd95c841b0b620ed0ec4ef7b69", commit: "6a37f540740c8cc858ae91ddb8b0e8b1cb499c9f" },
  { id: "family-report", path: "results/skill-ir/public-structure-offline-family-contract-revision-development-002/report.json", sha256: "d2860261a1bbe0dae45c531d8c1b733ba177dbf23a97e5684473cda0562cc8ee", commit: "4b7b7abf47417eef356c5d11c3fef96c1db5fc29" },
  { id: "public-skill-metadata-failure", path: "results/skill-ir/public-skill-responsibility-corpus-selection-development-001/failure-audit.json", sha256: "62f32d12e93b95aabd6b18423aefbb05713b7f2b93406876426fdb04006ec3fc", commit: "4b64f379c7766537365dceca705b500d1b0a1e46" },
  { id: "mechanism-ablation", path: "results/skill-ir/api-tester-operation-mechanism-ablation-development-001/report.json", sha256: "6cd63f4e265f66b7272ace596f8f680e6852d29593721b324a305c49ed4489fb", commit: "a1727b92928e1a32ce21b4bf21dc61bd80e3415e" },
  { id: "readiness", path: "results/skill-ir/method-portfolio-authoritative-automation-readiness.json", sha256: "0e1a0bdc41f49d306c966d5fd64e9e192f3dd945ee10ebde8309c927e014d2ae", commit: "9d3840b4104254340d95fce57676bfaf6806beed" },
] as const;

const EvidenceIdSchema = z.enum(API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE.map((entry) => entry.id) as [
  typeof API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[number]["id"],
  ...typeof API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[number]["id"][],
]);
const EvidenceBindingSchema = z.object({ id: EvidenceIdSchema, path: z.string().min(1), sha256: Sha256Schema, commit: Sha1Schema }).strict();
const TaskStatusSchema = z.enum(["completed", "closed-terminal-failure", "not-run-blocked"]);
const TaskIdSchema = z.enum(["task-1", "task-2", "task-3", "task-4", "task-5", "task-7", "task-8", "task-9", "task-10", "task-6"]);
const TaskSchema = z.object({
  taskId: TaskIdSchema,
  status: TaskStatusSchema,
  commit: Sha1Schema.nullable(),
  evidenceIds: z.array(EvidenceIdSchema),
  result: z.string().min(1),
  remainingIssue: z.string().min(1).nullable(),
  nextAction: z.string().min(1).nullable(),
}).strict();
const ClaimSchema = z.object({
  claimId: z.string().min(1),
  status: z.enum(["supported-bounded", "not-established"]),
  statement: z.string().min(1),
  evidenceIds: z.array(EvidenceIdSchema),
  limitations: z.array(z.string().min(1)).min(1),
}).strict();

export const ApiTesterOperationResearchSynthesisReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_OPERATION_RESEARCH_SYNTHESIS_REPORT_SCHEMA_VERSION),
  identity: z.literal(API_TESTER_OPERATION_RESEARCH_SYNTHESIS_IDENTITY),
  status: z.literal("verified-incomplete-development-synthesis"),
  completedAt: z.string().datetime(),
  branch: z.literal("api-tester-operation-unseen-prospective-001"),
  baselineCommit: z.literal("47efb148fb98288c173493c95582ed47d4fbdd3d"),
  implementationCommit: Sha1Schema,
  implementationFiles: z.array(z.object({ path: z.enum(SYNTHESIS_IMPLEMENTATION_PATHS), sha256: Sha256Schema }).strict()).length(SYNTHESIS_IMPLEMENTATION_PATHS.length),
  evidence: z.array(EvidenceBindingSchema).length(API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE.length),
  tasks: z.array(TaskSchema).length(10),
  taskTotals: z.object({ total: z.literal(10), completed: z.number().int().nonnegative(), closedTerminalFailure: z.number().int().nonnegative(), notRunBlocked: z.number().int().nonnegative(), allCompletionGatesClosed: z.literal(false) }).strict(),
  observedResults: z.object({
    candidateClosure: z.object({ runtimeModules: z.number().int().positive(), addedRuntimeDependencies: z.number().int().nonnegative(), unresolvedImports: z.number().int().nonnegative(), supportContractChanged: z.literal(false), candidate001Changed: z.literal(false) }).strict(),
    operationDevelopment: z.object({ documents: z.literal(6), operations: z.number().int().nonnegative(), accepted: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), unresolved: z.number().int().nonnegative(), checkerPassed: z.number().int().nonnegative(), wholeDocumentsPassed: z.literal(0) }).strict(),
    prospective: z.object({ syntheticDocumentsVerified: z.literal(6), sourceRequests: z.number().int().nonnegative(), archivedResponses: z.number().int().nonnegative(), partialInputBundles: z.number().int().nonnegative(), authoritativeSelections: z.literal(0), rowsExecuted: z.literal(0), terminalStatusCode: z.literal(403) }).strict(),
    family: z.object({ responsibilities: z.number().int().nonnegative(), skills: z.number().int().nonnegative(), inFamily: z.number().int().nonnegative(), constructible: z.number().int().nonnegative(), currentSupported: z.number().int().nonnegative() }).strict(),
    publicSkillCorpus: z.object({ metadataRequests: z.number().int().nonnegative(), archivedResponses: z.number().int().nonnegative(), bodyRequests: z.literal(0), selectedSkills: z.literal(0) }).strict(),
    mechanismAblation: z.object({ operationDelta: z.number().int(), fullDetected: z.number().int().nonnegative(), noDependencyDetected: z.number().int().nonnegative(), hiddenOperations: z.number().int().nonnegative(), hiddenFamilyResponsibilities: z.number().int().nonnegative() }).strict(),
    readiness: z.object({ before: z.literal(false), after: z.literal(false), blockingGate: z.literal("automationAndAdaptationConverging") }).strict(),
  }).strict(),
  claims: z.array(ClaimSchema).min(1),
  reproduction: z.object({
    committedEvidenceOnly: z.literal(true),
    prospectiveFirstRun: z.literal("not-reproducible-because-no-first-run-exists"),
    historicalCleanEvidence: z.literal("preserved-additive-evidence-does-not-recover-missing-clean-002-original"),
    verifierCommands: z.array(z.string().min(1)).min(1),
  }).strict(),
  accounting: z.object({
    publicProspectiveSourceRequests: z.number().int().nonnegative(),
    publicSkillMetadataRequests: z.number().int().nonnegative(),
    publicSkillBodyRequests: z.literal(0),
    authoritativeProspectiveSelections: z.literal(0),
    prospectiveRows: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-project-runner"),
    humanEffortMeasured: z.literal(false),
  }).strict(),
  nextDecision: z.object({
    eligibleToPrepareNewProspectiveProtocol: z.literal(true),
    eligibleToExecuteNewProspective: z.literal(false),
    missingConditions: z.array(z.string().min(1)).min(1),
    recommendation: z.string().min(1),
    automaticNextRun: z.literal(false),
  }).strict(),
  claimBoundaries: z.array(z.string().min(1)).min(1),
  portableSemanticSha256: Sha256Schema,
}).strict().superRefine((report, context) => {
  if (JSON.stringify(report.evidence) !== JSON.stringify(API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE)) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "synthesis evidence binding drift" });
  }
  if (report.taskTotals.completed + report.taskTotals.closedTerminalFailure + report.taskTotals.notRunBlocked !== report.taskTotals.total) {
    context.addIssue({ code: "custom", path: ["taskTotals"], message: "synthesis task status conservation drift" });
  }
});
export type ApiTesterOperationResearchSynthesisReport = z.infer<typeof ApiTesterOperationResearchSynthesisReportSchema>;

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

export type ApiTesterOperationResearchSynthesisCommittedBlobReader = (commit: string, path: string) => Promise<Uint8Array>;

function gitBlobReader(rootDir: string, gitExecutable: string): ApiTesterOperationResearchSynthesisCommittedBlobReader {
  return async (commit, path) => {
    const child = Bun.spawn([
      gitExecutable,
      "-c",
      `safe.directory=${rootDir.replaceAll("\\", "/")}`,
      "show",
      `${commit}:${path}`,
    ], { cwd: rootDir, stdout: "pipe", stderr: "pipe" });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).arrayBuffer(),
      new Response(child.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(`committed evidence unavailable: ${commit}:${path}: ${stderr.trim()}`);
    return new Uint8Array(stdout);
  };
}

export function apiTesterOperationResearchSynthesisPortableSha256(report: Record<string, unknown>): string {
  const { completedAt: _completedAt, portableSemanticSha256: _portable, ...semantic } = report;
  return sha256(JSON.stringify(canonical(semantic)));
}

async function readEvidence<T>(rootDir: string, id: typeof API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[number]["id"], schema: z.ZodType<T>, readCommittedBlob: ApiTesterOperationResearchSynthesisCommittedBlobReader): Promise<T> {
  const binding = API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE.find((entry) => entry.id === id)!;
  const bytes = await readFile(await resolveContainedExistingFile(rootDir, binding.path, `synthesis evidence ${id}`));
  if (sha256(bytes) !== binding.sha256) throw new Error(`synthesis evidence digest drift: ${id}`);
  const committedBytes = await readCommittedBlob(binding.commit, binding.path);
  if (sha256(committedBytes) !== binding.sha256) throw new Error(`synthesis committed evidence provenance drift: ${id}`);
  return schema.parse(JSON.parse(bytes.toString("utf8")));
}

async function deriveReport(options: { rootDir: string; completedAt: string; implementationCommit: string; readCommittedBlob: ApiTesterOperationResearchSynthesisCommittedBlobReader }): Promise<ApiTesterOperationResearchSynthesisReport> {
  const rootDir = resolve(options.rootDir);
  const implementationCommit = Sha1Schema.parse(options.implementationCommit);
  const baselineAnchor = await options.readCommittedBlob("47efb148fb98288c173493c95582ed47d4fbdd3d", "package.json");
  if (baselineAnchor.byteLength === 0) throw new Error("synthesis baseline commit provenance drift");
  const implementationFiles = await Promise.all(SYNTHESIS_IMPLEMENTATION_PATHS.map(async (path) => ({ path, sha256: sha256(await options.readCommittedBlob(implementationCommit, path)) })));
  const candidate = await readEvidence(rootDir, "candidate-binding", ApiTesterOperationCandidateBindingSchema, options.readCommittedBlob);
  const operation = await readEvidence(rootDir, "operation-development", ApiTesterOperationDevelopmentReportSchema, options.readCommittedBlob);
  const synthetic = await readEvidence(rootDir, "prospective-synthetic-validation", ApiTesterOperationSyntheticValidationReportSchema, options.readCommittedBlob);
  const freeze = await readEvidence(rootDir, "prospective-pre-source-freeze", ApiTesterOperationProspectivePreSourceFreezeSchema, options.readCommittedBlob);
  const sourceFailure = await readEvidence(rootDir, "prospective-source-failure", ApiTesterOperationSourceFailureAuditSchema, options.readCommittedBlob);
  const family = await readEvidence(rootDir, "family-report", PublicStructureOfflineFamilyReportSchema, options.readCommittedBlob);
  const corpusFailure = await readEvidence(rootDir, "public-skill-metadata-failure", PublicSkillMetadataFailureAuditSchema, options.readCommittedBlob);
  const mechanism = await readEvidence(rootDir, "mechanism-ablation", ApiTesterOperationMechanismAblationReportSchema, options.readCommittedBlob);
  const readiness = await readEvidence(rootDir, "readiness", AuthoritativeAutomationReadinessV7Schema, options.readCommittedBlob);

  if (candidate.productionDependencies.localRuntimeModules.length !== 11 || candidate.productionDependencies.unresolvedImports.length !== 0
    || candidate.addedRuntimeDependencies.length !== 2 || candidate.prospective.prospectiveRuns !== 0) throw new Error("candidate closure summary drift");
  if (synthetic.status !== "completed" || synthetic.totals.verified !== 6 || freeze.syntheticValidation.sha256 !== API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[2].sha256) throw new Error("prospective synthetic freeze drift");
  if (sourceFailure.totals.authoritativeSelections !== 0 || sourceFailure.terminal.statusCode !== 403 || sourceFailure.accounting.candidateTrialsBeforeSelection !== 0) throw new Error("prospective terminal result drift");
  if (readiness.passed !== false || readiness.gates.automationAndAdaptationConverging !== false) throw new Error("readiness boundary drift");

  const currentSupported = family.assessments.filter((entry) => entry.currentSupport === "supported").length;
  const inFamily = family.assessments.filter((entry) => entry.familyMembership === "in-family").length;
  const constructible = family.assessments.filter((entry) => entry.constructibility === "constructible").length;
  const tasks: z.infer<typeof TaskSchema>[] = [
    { taskId: "task-1", status: "completed", commit: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[0].commit, evidenceIds: ["candidate-binding", "operation-development"], result: "Ordinary-input runtime closure binds 11 local modules, including two previously omitted production dependencies; the frozen v2 contract and candidate 001 are unchanged.", remainingIssue: null, nextAction: null },
    { taskId: "task-2", status: "closed-terminal-failure", commit: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[4].commit, evidenceIds: ["prospective-synthetic-validation", "prospective-pre-source-freeze", "prospective-source-failure"], result: "Synthetic validation passed 6/6 and the remote freeze gate closed, but the sole fixed source acquisition terminated at request 150 with HTTP 403 before authoritative selection.", remainingIssue: "No authoritative 12-document selection, prediction file, or experiment lock exists.", nextAction: "A different acquisition strategy requires a new preregistered identity; do not retry this identity." },
    { taskId: "task-3", status: "not-run-blocked", commit: null, evidenceIds: ["prospective-source-failure"], result: "No immutable prospective row was dispatched.", remainingIssue: "Task 2 produced no authoritative selection or lock.", nextAction: "Run only under a future identity after selection, predictions, and lock are frozen." },
    { taskId: "task-4", status: "not-run-blocked", commit: null, evidenceIds: ["prospective-source-failure"], result: "No prospective outcome analysis was produced.", remainingIssue: "There is no Task 3 machine report to analyze.", nextAction: "Derive analysis only from an actual future first-run report." },
    { taskId: "task-5", status: "not-run-blocked", commit: null, evidenceIds: ["prospective-source-failure"], result: "No prospective clean reproduction was run because no first run exists.", remainingIssue: "There is no execution commit, lock, or first-run report for reproduction.", nextAction: "Create a detached offline reproduction only after a future immutable first run." },
    { taskId: "task-7", status: "completed", commit: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[5].commit, evidenceIds: ["family-report"], result: "The retrospective responsibility family report covers 7 responsibilities across 6 skills and keeps family, verifiability, constructibility, source validity, dependency closure, and current support orthogonal.", remainingIssue: "The seven examples are not an ecosystem sample.", nextAction: null },
    { taskId: "task-8", status: "closed-terminal-failure", commit: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[6].commit, evidenceIds: ["public-skill-metadata-failure"], result: "The sole fixed metadata sequence terminated after seven archived GitHub search responses when the search rate limit reached zero; no skill body or selection was produced.", remainingIssue: "The preregistered 40-skill corpus does not exist.", nextAction: "Use a new preregistered identity for any authenticated or otherwise changed metadata strategy." },
    { taskId: "task-9", status: "not-run-blocked", commit: null, evidenceIds: ["public-skill-metadata-failure"], result: "No three-API-skill mapping or development run was performed.", remainingIssue: "Task 8 produced no frozen selection from which to choose three repositories.", nextAction: "Run only after a future Task 8 selection is committed." },
    { taskId: "task-10", status: "completed", commit: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE[7].commit, evidenceIds: ["operation-development", "family-report", "mechanism-ablation"], result: "Three preregistered development controls quantify operation segmentation, dependency verification, and complete responsibility denominators without imputing missing prospective or corpus evidence.", remainingIssue: "The controls are deterministic and retrospective, not randomized or ecosystem estimates.", nextAction: null },
    { taskId: "task-6", status: "completed", commit: implementationCommit, evidenceIds: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE.map((entry) => entry.id), result: "The synthesis binds all available evidence, reports failed and unrun branches explicitly, and provides an offline verification route and bounded next-decision recommendation.", remainingIssue: "The overall multi-task goal remains incomplete because six task branches failed terminally or were not run.", nextAction: "Preserve this branch and review before preregistering any successor." },
  ];
  const completed = tasks.filter((task) => task.status === "completed").length;
  const closedTerminalFailure = tasks.filter((task) => task.status === "closed-terminal-failure").length;
  const notRunBlocked = tasks.filter((task) => task.status === "not-run-blocked").length;

  const semantic = {
    schemaVersion: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_REPORT_SCHEMA_VERSION,
    identity: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_IDENTITY,
    status: "verified-incomplete-development-synthesis" as const,
    completedAt: z.string().datetime().parse(options.completedAt),
    branch: "api-tester-operation-unseen-prospective-001" as const,
    baselineCommit: "47efb148fb98288c173493c95582ed47d4fbdd3d" as const,
    implementationCommit,
    implementationFiles,
    evidence: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_EVIDENCE,
    tasks,
    taskTotals: { total: 10 as const, completed, closedTerminalFailure, notRunBlocked, allCompletionGatesClosed: false as const },
    observedResults: {
      candidateClosure: { runtimeModules: candidate.productionDependencies.localRuntimeModules.length, addedRuntimeDependencies: candidate.addedRuntimeDependencies.length, unresolvedImports: candidate.productionDependencies.unresolvedImports.length, supportContractChanged: candidate.changes.supportContract, candidate001Changed: candidate.changes.candidate001 },
      operationDevelopment: { documents: operation.totals.documents, operations: operation.totals.operations, accepted: operation.totals.accepted, rejected: operation.totals.rejected, unresolved: operation.totals.unresolved, checkerPassed: operation.totals.artifactCheckedPassedOperations, wholeDocumentsPassed: 0 as const },
      prospective: { syntheticDocumentsVerified: synthetic.totals.verified as 6, sourceRequests: sourceFailure.totals.requestsAttempted, archivedResponses: sourceFailure.totals.archivedResponses, partialInputBundles: sourceFailure.totals.partialInputBundles, authoritativeSelections: 0 as const, rowsExecuted: 0 as const, terminalStatusCode: 403 as const },
      family: { responsibilities: family.assessments.length, skills: family.skills.length, inFamily, constructible, currentSupported },
      publicSkillCorpus: { metadataRequests: corpusFailure.accounting.metadataRequestsAttempted, archivedResponses: corpusFailure.accounting.archivedSuccessfulResponses, bodyRequests: 0 as const, selectedSkills: 0 as const },
      mechanismAblation: { operationDelta: mechanism.panels.operationSegmentation.delta.additionalCheckerPassedOperations, fullDetected: mechanism.panels.independentDependencyVerification.fullVerifier.correctLayerDetected, noDependencyDetected: mechanism.panels.independentDependencyVerification.noDependencyVerifier.correctLayerDetected, hiddenOperations: mechanism.panels.completeResponsibilityDenominator.operations.hidden, hiddenFamilyResponsibilities: mechanism.panels.completeResponsibilityDenominator.family.hidden },
      readiness: { before: false as const, after: false as const, blockingGate: "automationAndAdaptationConverging" as const },
    },
    claims: [
      { claimId: "candidate-runtime-closure", status: "supported-bounded" as const, statement: "The ordinary API Tester operation input entry has a digest-bound local runtime dependency closure with zero unresolved imports.", evidenceIds: ["candidate-binding" as const], limitations: ["This is dependency-closure evidence, not unseen-input behavior."] },
      { claimId: "operation-local-artifacts", status: "supported-bounded" as const, statement: "Within six exposed documents, 112 of 562 operations were admitted and checker-passed while every rejected or unresolved operation remained in the denominator.", evidenceIds: ["operation-development" as const, "mechanism-ablation" as const], limitations: ["The six documents are exposed development inputs and whole-document success remains 0/6."] },
      { claimId: "unseen-prospective-performance", status: "not-established" as const, statement: "Performance on the preregistered unseen public OpenAPI panel is not established.", evidenceIds: ["prospective-source-failure" as const], limitations: ["No authoritative selection, prediction, lock, or prospective row exists."] },
      { claimId: "responsibility-family", status: "supported-bounded" as const, statement: "The public-structure-driven offline responsibility family is defined and evaluated on seven retrospective responsibilities with orthogonal classifications.", evidenceIds: ["family-report" as const], limitations: ["The examples do not estimate ecosystem prevalence or coverage."] },
      { claimId: "forty-skill-distribution", status: "not-established" as const, statement: "The preregistered 40-skill responsibility distribution is not established.", evidenceIds: ["public-skill-metadata-failure" as const], limitations: ["No skill body or authoritative selection was produced."] },
      { claimId: "three-api-skill-reuse", status: "not-established" as const, statement: "Cross-repository reuse on three selected API skills is not established.", evidenceIds: ["public-skill-metadata-failure" as const], limitations: ["Task 9 could not select from a missing Task 8 corpus."] },
      { claimId: "mechanism-controls", status: "supported-bounded" as const, statement: "On fixed exposed and synthetic evidence, operation segmentation preserves 112 local verified operations, and removing the dependency verifier misses three designated dependency-loss faults.", evidenceIds: ["mechanism-ablation" as const], limitations: ["The controls are deterministic, non-randomized, and limited to the designed fault set."] },
      { claimId: "readiness", status: "supported-bounded" as const, statement: "Portfolio readiness remains false and was not changed by this stage.", evidenceIds: ["readiness" as const], limitations: ["This stage did not rerun or promote the broader portfolio."] },
    ],
    reproduction: {
      committedEvidenceOnly: true as const,
      prospectiveFirstRun: "not-reproducible-because-no-first-run-exists" as const,
      historicalCleanEvidence: "preserved-additive-evidence-does-not-recover-missing-clean-002-original" as const,
      verifierCommands: [
        "bun ./src/benchmarks/skill-ir/api-tester-operation-candidate-binding-run.ts --mode=verify --root=. --node=<node> --git=git --binding=benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json",
        "bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts --mode=verify-synthetic --root=. --out=results/skill-ir/api-tester-operation-prospective-001/pre-source-synthetic-validation --node=<node>",
        "bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-source-failure-audit.ts --mode=verify --root=. --out=results/skill-ir/api-tester-operation-prospective-001/source-selection",
        "bun ./src/benchmarks/skill-ir/public-skill-responsibility-corpus-failure-audit-run.ts --mode=verify --root=. --audit=results/skill-ir/public-skill-responsibility-corpus-selection-development-001/failure-audit.json",
        "bun ./src/benchmarks/skill-ir/api-tester-operation-mechanism-ablation.ts --mode=verify --root=. --protocol=benchmarks/skill-ir/pilots/api-tester/operation-mechanism-ablation-development-001/protocol.json --out=results/skill-ir/api-tester-operation-mechanism-ablation-development-001/report.json",
        `bun ./src/benchmarks/skill-ir/api-tester-operation-prospective-research-synthesis.ts --mode=verify --root=. --out=${API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH} --git=git`,
      ],
    },
    accounting: {
      publicProspectiveSourceRequests: sourceFailure.totals.requestsAttempted,
      publicSkillMetadataRequests: corpusFailure.accounting.metadataRequestsAttempted,
      publicSkillBodyRequests: 0 as const,
      authoritativeProspectiveSelections: 0 as const,
      prospectiveRows: 0 as const,
      modelCalls: 0 as const,
      businessApiCalls: 0 as const,
      paidCalls: 0 as const,
      heldOutAccesses: 0 as const,
      q1ReservedAccesses: 0 as const,
      developmentAgentUsage: "host-external-not-measured-by-project-runner" as const,
      humanEffortMeasured: false as const,
    },
    nextDecision: {
      eligibleToPrepareNewProspectiveProtocol: true as const,
      eligibleToExecuteNewProspective: false as const,
      missingConditions: [
        "A new identity must preregister any authenticated or changed source-acquisition strategy, request budget, and no-retry rule.",
        "An authoritative real-document selection, prediction report, and experiment lock must be committed before execution.",
        "The future immutable first run must finish before outcome analysis or clean reproduction.",
        "If the 40-skill and three-API-skill questions remain in scope, their selection chains must be rerun under a new preregistered identity.",
      ],
      recommendation: "Prepare, but do not execute, a successor protocol that preserves the frozen v2 candidate and explicitly budgets authenticated public-source acquisition; do not expand support merely to manufacture positive rows.",
      automaticNextRun: false as const,
    },
    claimBoundaries: [
      "Local operation success does not imply whole-document or real API behavior success.",
      "No human agreement, human savings, ecosystem admission, or causal improvement is measured.",
      "Meilisearch missing local references remain blocking and Bangumi external responses remain source-validity advisories.",
      "The historical clean-002 original remains missing; later additive clean evidence does not restore it.",
      "Expanded remote and paid authorization does not retroactively change frozen identities, failures, retries, denominators, or observed zero paid use.",
    ],
  };
  const report = { ...semantic, portableSemanticSha256: apiTesterOperationResearchSynthesisPortableSha256(semantic) };
  return ApiTesterOperationResearchSynthesisReportSchema.parse(report);
}

export async function buildApiTesterOperationResearchSynthesis(options: { rootDir: string; outputPath: string; completedAt: string; implementationCommit: string; gitExecutable?: string; readCommittedBlob?: ApiTesterOperationResearchSynthesisCommittedBlobReader }): Promise<ApiTesterOperationResearchSynthesisReport> {
  const rootDir = resolve(options.rootDir);
  const outputPath = normalizeRepositoryRelativePath(options.outputPath, "research synthesis output");
  if (outputPath !== API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH) throw new Error("research synthesis output identity drift");
  const report = await deriveReport({ ...options, rootDir, readCommittedBlob: options.readCommittedBlob ?? gitBlobReader(rootDir, options.gitExecutable ?? "git") });
  const target = join(rootDir, ...outputPath.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(await resolveContainedNewFile(rootDir, outputPath, "research synthesis output"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return report;
}

export async function verifyApiTesterOperationResearchSynthesis(options: { rootDir: string; reportPath: string; gitExecutable?: string; readCommittedBlob?: ApiTesterOperationResearchSynthesisCommittedBlobReader }) {
  const rootDir = resolve(options.rootDir);
  const reportPath = normalizeRepositoryRelativePath(options.reportPath, "research synthesis report");
  if (reportPath !== API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH) throw new Error("research synthesis report identity drift");
  const report = ApiTesterOperationResearchSynthesisReportSchema.parse(JSON.parse(await readFile(await resolveContainedExistingFile(rootDir, reportPath, "research synthesis report"), "utf8")));
  if (apiTesterOperationResearchSynthesisPortableSha256(report) !== report.portableSemanticSha256) throw new Error("research synthesis portable semantic digest drift");
  const derived = await deriveReport({ rootDir, completedAt: report.completedAt, implementationCommit: report.implementationCommit, readCommittedBlob: options.readCommittedBlob ?? gitBlobReader(rootDir, options.gitExecutable ?? "git") });
  if (JSON.stringify(derived) !== JSON.stringify(report)) throw new Error("research synthesis independently derived report drift");
  return { status: report.status, completed: report.taskTotals.completed, blockedOrFailed: report.taskTotals.closedTerminalFailure + report.taskTotals.notRunBlocked, eligibleToPrepare: report.nextDecision.eligibleToPrepareNewProspectiveProtocol, eligibleToExecute: report.nextDecision.eligibleToExecuteNewProspective };
}

export type ApiTesterOperationResearchSynthesisCommand = { mode: "create" | "verify"; rootDir: string; outputPath: typeof API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH; gitExecutable: string; completedAt?: string; implementationCommit?: string };

export function parseApiTesterOperationResearchSynthesisCommand(argv: string[]): ApiTesterOperationResearchSynthesisCommand {
  const values = new Map<string, string>();
  for (const raw of argv) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/u.exec(raw);
    if (!match) throw new Error(`invalid argument: ${raw}`);
    if (values.has(match[1]!)) throw new Error(`duplicate argument: --${match[1]}`);
    values.set(match[1]!, match[2]!);
  }
  const take = (key: string, required = true) => { const value = values.get(key); values.delete(key); if (required && !value) throw new Error(`--${key} is required`); return value; };
  const mode = z.enum(["create", "verify"]).parse(take("mode"));
  const rootDir = take("root")!;
  const outputPath = take("out")!;
  if (outputPath !== API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH) throw new Error(`--out must be ${API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH}`);
  const completedAtValue = take("completed-at", mode === "create");
  const implementationCommitValue = take("implementation-commit", mode === "create");
  const gitExecutable = take("git")!;
  if (mode === "verify" && (completedAtValue !== undefined || implementationCommitValue !== undefined)) throw new Error("create-only synthesis argument supplied in verify mode");
  const completedAt = completedAtValue === undefined ? undefined : z.string().datetime().parse(completedAtValue);
  const implementationCommit = implementationCommitValue === undefined ? undefined : Sha1Schema.parse(implementationCommitValue);
  if (values.size > 0) throw new Error(`unknown argument: --${values.keys().next().value}`);
  return { mode, rootDir, outputPath: API_TESTER_OPERATION_RESEARCH_SYNTHESIS_OUTPUT_PATH, gitExecutable, completedAt, implementationCommit };
}

if (import.meta.main) {
  const command = parseApiTesterOperationResearchSynthesisCommand(Bun.argv.slice(2));
  const result = command.mode === "create"
    ? await buildApiTesterOperationResearchSynthesis({ rootDir: command.rootDir, outputPath: command.outputPath, completedAt: command.completedAt!, implementationCommit: command.implementationCommit!, gitExecutable: command.gitExecutable })
    : await verifyApiTesterOperationResearchSynthesis({ rootDir: command.rootDir, reportPath: command.outputPath, gitExecutable: command.gitExecutable });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
