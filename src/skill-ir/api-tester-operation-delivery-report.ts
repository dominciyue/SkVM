import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema, parseSafeRelativePath } from "../benchmarks/skill-ir/artifact-package";
import { ApiTesterOperationDependencyRevisionReportSchema } from "./api-tester-operation-dependency-verification-revision";
import {
  API_TESTER_OPERATION_CANDIDATE_PATH,
  API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT,
  API_TESTER_OPERATION_DELIVERY_MAIN_ROOT,
  API_TESTER_OPERATION_DELIVERY_ROOT,
  ApiTesterOperationCandidateSchema,
  ApiTesterOperationDeliveryValidationReportSchema,
  verifyApiTesterOperationArchive,
  verifyApiTesterOperationArchiveGitClosure,
  verifyApiTesterOperationCandidate,
  verifyApiTesterOperationDeliveryValidation,
} from "./api-tester-operation-delivery-freeze";

export const API_TESTER_OPERATION_DELIVERY_REPORT_PATH =
  `${API_TESTER_OPERATION_DELIVERY_ROOT}/report.json` as const;
export const API_TESTER_OPERATION_DELIVERY_CLEAN_REPRODUCTION_PATH =
  `${API_TESTER_OPERATION_DELIVERY_ROOT}/clean-reproduction.json` as const;
export const API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT =
  "results/skill-ir/api-tester-operation-dependency-verification-revision-clean-003" as const;

const HISTORICAL_REVISION_REPORT_PATH =
  "results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json" as const;
const MISSING_HISTORICAL_CLEAN_PATH =
  "results/skill-ir/api-tester-operation-dependency-verification-revision-clean-002/report.json" as const;
const MISSING_HISTORICAL_CLEAN_SHA256 =
  "c4399a8a1fa5249b9061728105f08c65cad5e97d20dd9f68c9d24631910573d6" as const;

const DigestRefSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();

export const ApiTesterOperationCleanReproductionSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-clean-reproduction/v1"),
  identity: z.literal("skill-ir-api-tester-operation-delivery-freeze-development-001-clean-001"),
  status: z.literal("verified-with-source-blocker"),
  completedAt: z.string().datetime(),
  checkout: z.object({
    commit: z.string().regex(/^[0-9a-f]{40}$/u),
    detached: z.literal(true),
    candidate: DigestRefSchema,
  }).strict(),
  environment: z.object({
    os: z.string().min(1),
    architecture: z.string().min(1),
    bun: z.literal("1.3.14"),
    node: z.literal("v23.8.0"),
    dependencyInstall: z.literal("bun install --frozen-lockfile --offline"),
    lockSha256: Sha256Schema,
  }).strict(),
  inputPackage: z.object({
    kind: z.literal("six-already-exposed-digest-bound-sources-and-licenses"),
    sourceSelectionSha256: Sha256Schema,
    heldOutAccesses: z.literal(0),
    prospectiveInputsSelected: z.literal(0),
  }).strict(),
  deliveryValidation: z.object({
    root: z.literal(API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT),
    reportSha256: Sha256Schema,
    archiveManifestSha256: Sha256Schema,
    portableSemanticSha256: Sha256Schema,
    strictVerification: z.literal("pass"),
    totals: z.object({
      documents: z.literal(6),
      operations: z.number().int().nonnegative(),
      accepted: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
      unresolved: z.number().int().nonnegative(),
      checked: z.number().int().nonnegative(),
      obligations: z.number().int().nonnegative(),
      coveredObligations: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  dependencyRevision: z.object({
    root: z.literal(API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT),
    reportSha256: Sha256Schema,
    archiveManifestSha256: Sha256Schema,
    portableSemanticSha256: Sha256Schema,
    runSemanticSha256: Sha256Schema,
    revisionCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    detached: z.literal(true),
    strictVerification: z.literal("pass"),
    faultsDetected: z.literal(3),
    comparison: z.literal("pass"),
  }).strict(),
  historicalMissingArchive: z.object({
    status: z.literal("missing-unarchived-original"),
    path: z.literal(MISSING_HISTORICAL_CLEAN_PATH),
    expectedSha256: z.literal(MISSING_HISTORICAL_CLEAN_SHA256),
    replacedOrOverwritten: z.literal(false),
  }).strict(),
  accounting: z.object({
    runtime: z.object({ modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    separate: z.literal(true),
  }).strict(),
  protectedBoundary: z.object({
    frozenWholeDocumentRealAccepted: z.literal(0),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
    claimsLiveApiBehavior: z.literal(false),
  }).strict(),
}).strict().superRefine((session, context) => {
  if (session.checkout.commit !== session.dependencyRevision.revisionCommit) {
    context.addIssue({ code: "custom", path: ["checkout", "commit"], message: "clean session commit drifted" });
  }
  const totals = session.deliveryValidation.totals;
  if (totals.operations !== totals.accepted + totals.rejected + totals.unresolved
    || totals.checked !== totals.accepted || totals.obligations !== totals.coveredObligations) {
    context.addIssue({ code: "custom", path: ["deliveryValidation", "totals"], message: "clean session totals drifted" });
  }
});

const ValidationEvidenceSchema = z.object({
  root: SafeRelativePathSchema,
  report: DigestRefSchema,
  archiveManifest: DigestRefSchema,
  portableSemanticSha256: Sha256Schema,
}).strict();

export const ApiTesterOperationDeliveryFreezeReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-operation-delivery-freeze-report/v1"),
  identity: z.literal("skill-ir-api-tester-operation-delivery-freeze-development-001"),
  status: z.literal("frozen-with-source-blocker-and-historical-archive-gap"),
  completedAt: z.string().datetime(),
  candidate: z.object({
    commit: z.string().regex(/^[0-9a-f]{40}$/u),
    snapshot: DigestRefSchema,
    cleanCheckoutDetached: z.literal(true),
  }).strict(),
  cleanSession: DigestRefSchema,
  historicalMissingArchive: z.object({
    status: z.literal("missing-unarchived-original"),
    path: z.literal(MISSING_HISTORICAL_CLEAN_PATH),
    expectedSha256: z.literal(MISSING_HISTORICAL_CLEAN_SHA256),
    originalMainReport: DigestRefSchema,
    replacedOrOverwritten: z.literal(false),
  }).strict(),
  validation: z.object({
    main: ValidationEvidenceSchema,
    clean: ValidationEvidenceSchema,
    semanticReproductionEqual: z.literal(true),
    totals: z.object({
      documents: z.literal(6),
      operations: z.number().int().nonnegative(),
      accepted: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
      unresolved: z.number().int().nonnegative(),
      checked: z.number().int().nonnegative(),
      obligations: z.object({ total: z.number().int().nonnegative(), covered: z.number().int().nonnegative() }).strict(),
    }).strict(),
  }).strict(),
  dependencyRevisionClean: z.object({
    root: z.literal(API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT),
    report: DigestRefSchema,
    archiveManifest: DigestRefSchema,
    portableSemanticSha256: Sha256Schema,
    runSemanticSha256: Sha256Schema,
    revisionCommit: z.string().regex(/^[0-9a-f]{40}$/u),
    detached: z.literal(true),
    faultsDetected: z.literal(3),
    comparison: z.literal("pass"),
  }).strict(),
  retainedIssues: z.object({
    meilisearchMissingTotalReference: z.literal(true),
    bangumiExternalResponseAdvisoryOperations: z.literal(19),
  }).strict(),
  gates: z.object({
    candidateClosure: z.literal("pass"),
    mainArchive: z.literal("pass"),
    cleanArchive: z.literal("pass"),
    cleanCheckout: z.literal("pass"),
    dependencyArchive: z.literal("pass"),
    dependencySemantic: z.literal("pass"),
    implementationCorrectness: z.literal("pass"),
    sourceCorrectness: z.literal("blocked"),
    historicalArchiveCompleteness: z.literal("fail"),
  }).strict(),
  prospective: z.object({
    inputSelection: z.literal("not-started"),
    predictions: z.literal("not-authored"),
    prospectiveRuns: z.literal(0),
    rows: z.tuple([]),
    rowPredictions: z.tuple([]),
  }).strict(),
  accounting: z.object({
    runtime: z.object({ modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0) }).strict(),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
    separate: z.literal(true),
  }).strict(),
  protectedBoundary: z.object({
    frozenWholeDocumentRealAccepted: z.literal(0),
    changesFrozenHistory: z.literal(false),
    prospectiveRuns: z.literal(0),
    heldOutAccesses: z.literal(0),
    readinessChanges: z.literal(0),
    claimsHumanSavings: z.literal(false),
    claimsLiveApiBehavior: z.literal(false),
  }).strict(),
  nextStage: z.object({
    candidateReadyForSeparateProspectivePreregistration: z.literal(true),
    authorizedToSelectInputs: z.literal(false),
    authorizedToWritePredictions: z.literal(false),
    authorizedToRunProspective: z.literal(false),
  }).strict(),
  claimBoundary: z.string().min(1),
  portableSemanticSha256: Sha256Schema,
}).strict().superRefine((report, context) => {
  const totals = report.validation.totals;
  if (totals.operations !== totals.accepted + totals.rejected + totals.unresolved
    || totals.checked !== totals.accepted || totals.obligations.total !== totals.obligations.covered) {
    context.addIssue({ code: "custom", path: ["validation", "totals"], message: "delivery freeze totals drifted" });
  }
  if (report.candidate.commit !== report.dependencyRevisionClean.revisionCommit) {
    context.addIssue({ code: "custom", path: ["candidate", "commit"], message: "candidate/clean commit drifted" });
  }
});

export type ApiTesterOperationDeliveryFreezeReport = z.infer<typeof ApiTesterOperationDeliveryFreezeReportSchema>;

type ReproductionComparable = Pick<
  z.infer<typeof ApiTesterOperationDeliveryValidationReportSchema>,
  "portableSemanticSha256" | "totals" | "retainedIssues" | "gates"
>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function portable(path: string): string {
  return path.replaceAll("\\", "/");
}

function pathWithin(parent: string, candidate: string): boolean {
  const local = relative(resolve(parent), resolve(candidate));
  return local === "" || (local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local));
}

function contained(rootDir: string, path: string): string {
  const safe = parseSafeRelativePath(portable(path));
  const absolute = resolve(rootDir, safe);
  if (!pathWithin(rootDir, absolute) || absolute === resolve(rootDir)) throw new Error(`delivery report path escaped: ${safe}`);
  return absolute;
}

async function readJson<T>(rootDir: string, path: string, schema: z.ZodType<T>): Promise<{ value: T; bytes: Buffer }> {
  const bytes = await readFile(contained(rootDir, path));
  return { value: schema.parse(JSON.parse(bytes.toString("utf8"))), bytes };
}

async function digestRef(rootDir: string, path: string): Promise<{ path: string; sha256: string }> {
  const safe = parseSafeRelativePath(path);
  return { path: safe, sha256: sha256(await readFile(contained(rootDir, safe))) };
}

function gitBlob(rootDir: string, gitExecutable: string, commit: string, path: string): Buffer {
  const safePath = parseSafeRelativePath(path);
  const shown = spawnSync(gitExecutable, [
    "-c", `safe.directory=${portable(resolve(rootDir))}`,
    "cat-file", "--filters", `--path=${safePath}`, `${commit}:${safePath}`,
  ], { cwd: rootDir, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
  if (shown.status !== 0 || !shown.stdout) {
    throw new Error(`candidate Git checkout bytes unavailable: ${path}: ${shown.stderr?.toString("utf8").trim() ?? "unknown"}`);
  }
  return shown.stdout;
}

async function assertMissing(rootDir: string, path: string): Promise<void> {
  try {
    await lstat(contained(rootDir, path));
    throw new Error(`historical missing archive unexpectedly exists: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function validationComparable(report: z.infer<typeof ApiTesterOperationDeliveryValidationReportSchema>): ReproductionComparable {
  return {
    portableSemanticSha256: report.portableSemanticSha256,
    totals: report.totals,
    retainedIssues: report.retainedIssues,
    gates: report.gates,
  };
}

export function compareApiTesterOperationDeliveryReproduction(
  main: ReproductionComparable,
  clean: ReproductionComparable,
): boolean {
  return canonical(main) === canonical(clean);
}

function portableReportDigest(report: Omit<ApiTesterOperationDeliveryFreezeReport, "portableSemanticSha256">): string {
  const { completedAt: _completedAt, ...stable } = report;
  return sha256(canonical(stable));
}

export async function buildApiTesterOperationDeliveryFreezeReport(options: {
  rootDir: string;
  gitExecutable: string;
  nodeExecutable: string;
  bunVersion: string;
  nodeVersion: string;
  completedAt: string;
}): Promise<ApiTesterOperationDeliveryFreezeReport> {
  const rootDir = resolve(options.rootDir);
  const sessionRead = await readJson(rootDir, API_TESTER_OPERATION_DELIVERY_CLEAN_REPRODUCTION_PATH, ApiTesterOperationCleanReproductionSchema);
  const session = sessionRead.value;
  if (session.environment.bun !== options.bunVersion || session.environment.node !== options.nodeVersion) {
    throw new Error("clean session runtime mismatch");
  }
  const candidateRead = await readJson(rootDir, API_TESTER_OPERATION_CANDIDATE_PATH, ApiTesterOperationCandidateSchema);
  const candidate = candidateRead.value;
  if (sha256(candidateRead.bytes) !== session.checkout.candidate.sha256
    || sha256(gitBlob(rootDir, options.gitExecutable, session.checkout.commit, API_TESTER_OPERATION_CANDIDATE_PATH)) !== session.checkout.candidate.sha256) {
    throw new Error("clean session candidate binding mismatch");
  }
  if (candidate.dependencies.lock.sha256 !== session.environment.lockSha256) throw new Error("clean session lock binding mismatch");
  for (const reference of [
    ...candidate.implementation,
    candidate.dependencies.package,
    candidate.dependencies.lock,
    candidate.historicalEvidence.task1,
    candidate.historicalEvidence.task2,
    candidate.historicalEvidence.dependencyRevision,
  ]) {
    if (sha256(gitBlob(rootDir, options.gitExecutable, session.checkout.commit, reference.path)) !== reference.sha256) {
      throw new Error(`candidate commit blob mismatch: ${reference.path}`);
    }
  }
  await verifyApiTesterOperationCandidate({
    rootDir,
    candidatePath: API_TESTER_OPERATION_CANDIDATE_PATH,
    bunVersion: options.bunVersion,
    nodeVersion: options.nodeVersion,
    nodeExecutable: options.nodeExecutable,
    gitExecutable: options.gitExecutable,
  });

  const mainPath = `${API_TESTER_OPERATION_DELIVERY_MAIN_ROOT}/validation-report.json`;
  const cleanPath = `${API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT}/validation-report.json`;
  const mainRead = await readJson(rootDir, mainPath, ApiTesterOperationDeliveryValidationReportSchema);
  const cleanRead = await readJson(rootDir, cleanPath, ApiTesterOperationDeliveryValidationReportSchema);
  await verifyApiTesterOperationDeliveryValidation({ rootDir, archiveRoot: contained(rootDir, API_TESTER_OPERATION_DELIVERY_MAIN_ROOT), nodeExecutable: options.nodeExecutable });
  await verifyApiTesterOperationDeliveryValidation({ rootDir, archiveRoot: contained(rootDir, API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT), nodeExecutable: options.nodeExecutable });
  const semanticReproductionEqual = compareApiTesterOperationDeliveryReproduction(
    validationComparable(mainRead.value),
    validationComparable(cleanRead.value),
  );
  if (!semanticReproductionEqual) throw new Error("main/clean delivery semantic reproduction drift");

  const cleanArchivePath = `${API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT}/archive-manifest.json`;
  const dependencyReportPath = `${API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT}/report.json`;
  const dependencyArchivePath = `${API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT}/archive-manifest.json`;
  await verifyApiTesterOperationArchive({ rootDir: contained(rootDir, API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT) });
  const dependencyRead = await readJson(rootDir, dependencyReportPath, ApiTesterOperationDependencyRevisionReportSchema);
  const historicalRead = await readJson(rootDir, HISTORICAL_REVISION_REPORT_PATH, ApiTesterOperationDependencyRevisionReportSchema);
  const dependency = dependencyRead.value;
  const historical = historicalRead.value;
  if (dependency.revision.commit !== session.checkout.commit || !dependency.revision.detached
    || dependency.cleanReproduction !== null
    || dependency.runSemanticSha256 !== historical.runSemanticSha256
    || canonical(dependency.cases) !== canonical(historical.cases)
    || canonical(dependency.comparison) !== canonical(historical.comparison)
    || canonical(dependency.sourceBlockers) !== canonical(historical.sourceBlockers)
    || dependency.replay.portableSemanticSha256 !== historical.replay.portableSemanticSha256) {
    throw new Error("archived dependency clean semantic drift");
  }
  const cleanArchiveRef = await digestRef(rootDir, cleanArchivePath);
  const dependencyArchiveRef = await digestRef(rootDir, dependencyArchivePath);
  if (sha256(cleanRead.bytes) !== session.deliveryValidation.reportSha256
    || cleanArchiveRef.sha256 !== session.deliveryValidation.archiveManifestSha256
    || cleanRead.value.portableSemanticSha256 !== session.deliveryValidation.portableSemanticSha256
    || cleanRead.value.inputs.sourceSelection.sha256 !== session.inputPackage.sourceSelectionSha256
    || sha256(dependencyRead.bytes) !== session.dependencyRevision.reportSha256
    || dependencyArchiveRef.sha256 !== session.dependencyRevision.archiveManifestSha256
    || dependency.portableSemanticSha256 !== session.dependencyRevision.portableSemanticSha256
    || dependency.runSemanticSha256 !== session.dependencyRevision.runSemanticSha256) {
    throw new Error("clean session evidence digest drift");
  }
  await assertMissing(rootDir, MISSING_HISTORICAL_CLEAN_PATH);
  if (historical.cleanReproduction?.report.path !== MISSING_HISTORICAL_CLEAN_PATH
    || historical.cleanReproduction.report.sha256 !== MISSING_HISTORICAL_CLEAN_SHA256) {
    throw new Error("historical missing clean metadata drift");
  }

  const reportWithoutDigest: Omit<ApiTesterOperationDeliveryFreezeReport, "portableSemanticSha256"> = {
    schemaVersion: "skill-ir-api-tester-operation-delivery-freeze-report/v1",
    identity: "skill-ir-api-tester-operation-delivery-freeze-development-001",
    status: "frozen-with-source-blocker-and-historical-archive-gap",
    completedAt: options.completedAt,
    candidate: {
      commit: session.checkout.commit,
      snapshot: await digestRef(rootDir, API_TESTER_OPERATION_CANDIDATE_PATH),
      cleanCheckoutDetached: true,
    },
    cleanSession: await digestRef(rootDir, API_TESTER_OPERATION_DELIVERY_CLEAN_REPRODUCTION_PATH),
    historicalMissingArchive: {
      status: "missing-unarchived-original",
      path: MISSING_HISTORICAL_CLEAN_PATH,
      expectedSha256: MISSING_HISTORICAL_CLEAN_SHA256,
      originalMainReport: await digestRef(rootDir, HISTORICAL_REVISION_REPORT_PATH),
      replacedOrOverwritten: false,
    },
    validation: {
      main: {
        root: API_TESTER_OPERATION_DELIVERY_MAIN_ROOT,
        report: await digestRef(rootDir, mainPath),
        archiveManifest: await digestRef(rootDir, `${API_TESTER_OPERATION_DELIVERY_MAIN_ROOT}/archive-manifest.json`),
        portableSemanticSha256: mainRead.value.portableSemanticSha256,
      },
      clean: {
        root: API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT,
        report: await digestRef(rootDir, cleanPath),
        archiveManifest: cleanArchiveRef,
        portableSemanticSha256: cleanRead.value.portableSemanticSha256,
      },
      semanticReproductionEqual: true,
      totals: mainRead.value.totals,
    },
    dependencyRevisionClean: {
      root: API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT,
      report: await digestRef(rootDir, dependencyReportPath),
      archiveManifest: dependencyArchiveRef,
      portableSemanticSha256: dependency.portableSemanticSha256,
      runSemanticSha256: dependency.runSemanticSha256,
      revisionCommit: dependency.revision.commit,
      detached: true,
      faultsDetected: 3,
      comparison: "pass",
    },
    retainedIssues: mainRead.value.retainedIssues,
    gates: {
      candidateClosure: "pass",
      mainArchive: "pass",
      cleanArchive: "pass",
      cleanCheckout: "pass",
      dependencyArchive: "pass",
      dependencySemantic: "pass",
      implementationCorrectness: "pass",
      sourceCorrectness: "blocked",
      historicalArchiveCompleteness: "fail",
    },
    prospective: candidate.prospective,
    accounting: {
      runtime: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      developmentAgentUsage: "host-external-not-measured-by-runner",
      separate: true,
    },
    protectedBoundary: {
      frozenWholeDocumentRealAccepted: 0,
      changesFrozenHistory: false,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      readinessChanges: 0,
      claimsHumanSavings: false,
      claimsLiveApiBehavior: false,
    },
    nextStage: {
      candidateReadyForSeparateProspectivePreregistration: true,
      authorizedToSelectInputs: false,
      authorizedToWritePredictions: false,
      authorizedToRunProspective: false,
    },
    claimBoundary: "This development freeze closes the ordinary-input entry and additive clean-evidence delivery gaps under the unchanged v2 support contract. It retains one source blocker, 19 source-validity advisories, the historical missing archive, whole-document 0/6, and zero readiness/human-effect change. It does not establish whole-document or live API correctness and does not authorize unseen selection, prediction, or prospective execution.",
  };
  return ApiTesterOperationDeliveryFreezeReportSchema.parse({
    ...reportWithoutDigest,
    portableSemanticSha256: portableReportDigest(reportWithoutDigest),
  });
}

export async function verifyApiTesterOperationDeliveryFreezeReport(options: {
  rootDir: string;
  gitExecutable: string;
  nodeExecutable: string;
  bunVersion: string;
  nodeVersion: string;
}): Promise<{ status: "verified"; candidateCommit: string; prospectiveRuns: 0; portableSemanticSha256: string }> {
  const rootDir = resolve(options.rootDir);
  const reportRead = await readJson(rootDir, API_TESTER_OPERATION_DELIVERY_REPORT_PATH, ApiTesterOperationDeliveryFreezeReportSchema);
  const expected = await buildApiTesterOperationDeliveryFreezeReport({
    ...options,
    completedAt: reportRead.value.completedAt,
  });
  if (canonical(reportRead.value) !== canonical(expected)) throw new Error("delivery freeze report live derivation drift");
  await Promise.all([
    verifyApiTesterOperationArchiveGitClosure({ rootDir, archiveRoot: contained(rootDir, API_TESTER_OPERATION_DELIVERY_MAIN_ROOT), gitExecutable: options.gitExecutable }),
    verifyApiTesterOperationArchiveGitClosure({ rootDir, archiveRoot: contained(rootDir, API_TESTER_OPERATION_DELIVERY_CLEAN_ROOT), gitExecutable: options.gitExecutable }),
    verifyApiTesterOperationArchiveGitClosure({ rootDir, archiveRoot: contained(rootDir, API_TESTER_OPERATION_DEPENDENCY_CLEAN_ROOT), gitExecutable: options.gitExecutable }),
  ]);
  if (sha256(gitBlob(rootDir, options.gitExecutable, "HEAD", API_TESTER_OPERATION_DELIVERY_REPORT_PATH)) !== sha256(reportRead.bytes)) {
    throw new Error("delivery freeze report is not the Git HEAD blob");
  }
  const { portableSemanticSha256: _digest, ...withoutDigest } = reportRead.value;
  if (portableReportDigest(withoutDigest) !== reportRead.value.portableSemanticSha256) {
    throw new Error("delivery freeze report portable semantic digest drift");
  }
  return {
    status: "verified",
    candidateCommit: reportRead.value.candidate.commit,
    prospectiveRuns: reportRead.value.prospective.prospectiveRuns,
    portableSemanticSha256: reportRead.value.portableSemanticSha256,
  };
}
