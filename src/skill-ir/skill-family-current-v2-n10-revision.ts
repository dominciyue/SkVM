import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildApiRequestBodyNegatives } from "./api-request-body-negatives";
import { buildApiRequestCases } from "./api-request-cases";
import { buildApiFormRequestSpecimens } from "./api-request-specimens";
import { parseApiTaskContract } from "./api-task-contract";
import {
  verifyN10Baseline,
  verifyN10DevelopmentPanel,
  verifyN10FirstRun,
  type N10DevelopmentLock,
  type N10FirstRunReport,
} from "./skill-family-current-v2-n10";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const FORM_MEDIA = "application/x-www-form-urlencoded";
const COMPONENT_FILES = [
  "docs/skill-ir/api-request-form-specimens-development.md",
  "src/skill-ir/api-form-wire.ts",
  "src/skill-ir/api-form-wire-checker.ts",
  "src/skill-ir/api-request-specimens.ts",
  "docs/skill-ir/api-request-body-negatives-development.md",
  "src/skill-ir/api-request-body-negatives.ts",
  "src/skill-ir/api-request-body-negatives-checker.ts",
  "src/skill-ir/api-request-cases.ts",
] as const;

type FileBinding = { path: string; sha256: string; bytes: number };
type RootCauseClassification = "declared-support-contract-boundary" | "unclassified";

export type N10RevisionRootCause = {
  taskId: string;
  operationKey: string;
  obligationId: string;
  requirementId: string;
  requirementKind: string;
  mediaType: string | null;
  observedStatus: string;
  observedReason: string | null;
  minimalWitness: unknown | null;
  formSpecimenCaseStatus: string | null;
  sourceNegativeCount: number;
  encodedSourceNegativeCount: number;
  bodyNegativeConstructedCount: number;
  bodyNegativeReasons: string[];
  classification: RootCauseClassification;
  boundaryIds: string[];
  semanticRisk: string;
};

export type N10RevisionReport = {
  schemaVersion: "skill-family-current-v2-n10-revision/v1";
  identity: typeof IDENTITY;
  exposure: "development";
  evaluatedAt: string;
  revisionCodeCommit: string;
  bindings: {
    inputLock: FileBinding;
    baseline: FileBinding;
    firstRun: FileBinding;
    componentContracts: FileBinding[];
  };
  denominator: N10FirstRunReport["summary"];
  mismatchTasks: Array<{
    taskId: string;
    sourceInputId: string;
    expectedTaskComplete: boolean;
    actualTaskComplete: boolean;
    expectationBasis: string | null;
    unresolvedRequiredObligationIds: string[];
  }>;
  rootCauses: N10RevisionRootCause[];
  implementationChanges: [];
  rejectedOptions: Array<{ option: string; reason: string }>;
  decision: "no-safe-shared-revision" | "shared-revision-required" | "no-revision-needed";
  firstRunMethodGate: N10FirstRunReport["methodGate"];
  downstream: {
    engineeringCalibrationStatus: "completed-with-limitation" | "completed" | "blocked";
    researchCandidateEligible: boolean;
    nextAction: string;
  };
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0; nativeLoopbackHttpCalls: 0 };
  claimLimits: string[];
};

const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const portable = (value: string) => value.replaceAll("\\", "/");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const stable = (value: unknown) => JSON.stringify(canonical(value));

async function fileBinding(repositoryRoot: string, path: string): Promise<FileBinding> {
  const bytes = await readFile(join(repositoryRoot, path));
  return { path: portable(path), sha256: sha(bytes), bytes: bytes.byteLength };
}

async function developmentBinding(
  repositoryRoot: string,
  developmentDirectory: string,
  name: string,
): Promise<FileBinding> {
  const absolute = join(developmentDirectory, name);
  const bytes = await readFile(absolute);
  return { path: portable(relative(repositoryRoot, absolute)), sha256: sha(bytes), bytes: bytes.byteLength };
}

function mediaTypeFromTarget(targetId: unknown, operation: Record<string, any>): string | null {
  if (typeof targetId === "string" && targetId.startsWith("body:")) return targetId.slice("body:".length);
  const mediaTypes = operation.request?.mediaTypes;
  return Array.isArray(mediaTypes) && mediaTypes.length === 1 && typeof mediaTypes[0] === "string" ? mediaTypes[0] : null;
}

function findMinimalWitness(cases: ReturnType<typeof buildApiRequestCases>, operationKey: string, mediaType: string | null): unknown | null {
  if (!mediaType) return null;
  const field = cases.operations.find((row) => row.key === operationKey)?.schemas
    .find((row) => row.location === "body" && row.name === mediaType);
  return field?.cases.cases.find((row) => row.id.endsWith(":valid-minimal"))?.value ?? null;
}

function analyzeRootCause(input: {
  taskId: string;
  operationKey: string;
  obligation: Record<string, any>;
  sourceOperation: Record<string, any>;
  cases: ReturnType<typeof buildApiRequestCases>;
  specimens: ReturnType<typeof buildApiFormRequestSpecimens>;
  negatives: ReturnType<typeof buildApiRequestBodyNegatives>;
}): N10RevisionRootCause {
  const mediaType = mediaTypeFromTarget(input.obligation.targetId, input.sourceOperation);
  const field = input.cases.operations.find((row) => row.key === input.operationKey)?.schemas
    .find((row) => row.location === "body" && row.name === mediaType);
  const negativeIds = new Set(field?.cases.cases.filter((row) => !row.id.includes(":valid-")).map((row) => row.id) ?? []);
  const sourceNegativeCount = negativeIds.size;
  const encodedSourceNegativeCount = field?.wireCases.filter((row) => negativeIds.has(row.caseId) && row.status === "encoded").length ?? 0;
  const negativeRows = input.negatives.operations.find((row) => row.key === input.operationKey)?.cases ?? [];
  const bodyNegativeConstructedCount = negativeRows.filter((row) => row.status === "constructed").length;
  const bodyNegativeReasons = [...new Set(negativeRows.flatMap((row) => row.reasons))].sort();
  const specimenCase = input.specimens.operations.find((row) => row.key === input.operationKey)?.cases.find((row) =>
    row.mode === "minimal" && row.mediaType === mediaType && row.omit === null);
  const minimalWitness = findMinimalWitness(input.cases, input.operationKey, mediaType);

  const emptyFormBoundary = input.obligation.requirementKind === "valid-minimal"
    && mediaType === FORM_MEDIA
    && object(minimalWitness)
    && Object.keys(minimalWitness).length === 0
    && specimenCase?.status === "unresolved"
    && specimenCase.reasons.includes("Error: form field count unsupported");
  const jsonOnlyNegativeBoundary = input.obligation.requirementKind === "constraint-negative"
    && mediaType === FORM_MEDIA
    && sourceNegativeCount > 0
    && encodedSourceNegativeCount === 0
    && bodyNegativeConstructedCount === 0
    && bodyNegativeReasons.includes("full body request baseline unavailable");
  const classification: RootCauseClassification = emptyFormBoundary || jsonOnlyNegativeBoundary
    ? "declared-support-contract-boundary"
    : "unclassified";
  const boundaryIds = [
    ...(emptyFormBoundary ? ["api-request-form-specimens/v1:nonempty-flat-string-object"] : []),
    ...(jsonOnlyNegativeBoundary ? ["api-request-body-negatives/v1:json-body-only"] : []),
  ];
  const semanticRisk = emptyFormBoundary
    ? "Accepting an empty form would change the deliberately nonempty v1 form profile."
    : jsonOnlyNegativeBoundary
      ? "Coercing non-string schema-negative values into form text would not prove that the decoded request still violates the source schema."
      : "The unresolved result is not explained by a bound current support contract and requires implementation investigation.";

  return {
    taskId: input.taskId,
    operationKey: input.operationKey,
    obligationId: String(input.obligation.obligationId),
    requirementId: String(input.obligation.requirementId),
    requirementKind: String(input.obligation.requirementKind),
    mediaType,
    observedStatus: String(input.obligation.status),
    observedReason: input.obligation.reason === null || typeof input.obligation.reason === "string" ? input.obligation.reason : String(input.obligation.reason),
    minimalWitness,
    formSpecimenCaseStatus: specimenCase?.status ?? null,
    sourceNegativeCount,
    encodedSourceNegativeCount,
    bodyNegativeConstructedCount,
    bodyNegativeReasons,
    classification,
    boundaryIds,
    semanticRisk,
  };
}

export async function buildN10RevisionDecision(options: {
  repositoryRoot: string;
  developmentDirectory: string;
  revisionCodeCommit: string;
  evaluatedAt: string;
}): Promise<N10RevisionReport> {
  const prerequisiteChecks = await Promise.all([
    verifyN10DevelopmentPanel(options),
    verifyN10Baseline(options),
    verifyN10FirstRun(options),
  ]);
  const prerequisiteErrors = prerequisiteChecks.flatMap((row) => row.errors);
  if (prerequisiteErrors.length) throw new Error(`N10 revision prerequisites failed: ${prerequisiteErrors.join("; ")}`);
  if (!/^[0-9a-f]{40}$/u.test(options.revisionCodeCommit)) throw new Error("N10 revision code commit is invalid");

  const [lock, firstRun] = await Promise.all([
    readFile(join(options.developmentDirectory, "input-lock.json"), "utf8").then((text) => JSON.parse(text) as N10DevelopmentLock),
    readFile(join(options.developmentDirectory, "first-run.json"), "utf8").then((text) => JSON.parse(text) as N10FirstRunReport),
  ]);
  const mismatchedRows = firstRun.tasks.filter((row) => row.taskComplete !== row.expectedTaskComplete);
  const mismatchTasks: N10RevisionReport["mismatchTasks"] = [];
  const rootCauses: N10RevisionRootCause[] = [];
  for (const row of mismatchedRows) {
    const lockedTask = lock.tasks.find((candidate) => candidate.taskId === row.taskId);
    if (!lockedTask) throw new Error(`N10 revision task is absent from lock: ${row.taskId}`);
    const lockedSource = lock.sources.find((candidate) => candidate.inputId === lockedTask.sourceInputId);
    if (!lockedSource) throw new Error(`N10 revision source is absent from lock: ${lockedTask.sourceInputId}`);
    const [taskBytes, sourceText] = await Promise.all([
      readFile(join(options.developmentDirectory, lockedTask.taskPath)),
      readFile(join(options.developmentDirectory, lockedSource.lockedCopy.path), "utf8"),
    ]);
    if (sha(taskBytes) !== lockedTask.taskSha256) throw new Error(`N10 revision task digest mismatch: ${row.taskId}`);
    const task = parseApiTaskContract(JSON.parse(taskBytes.toString("utf8")));
    const cases = buildApiRequestCases(sourceText, task.input.format);
    const specimens = buildApiFormRequestSpecimens(sourceText, task.input.format);
    const negatives = buildApiRequestBodyNegatives(sourceText, task.input.format);
    const unresolved = row.obligationResults.filter((obligation: Record<string, any>) => obligation.status === "unresolved");
    mismatchTasks.push({
      taskId: row.taskId,
      sourceInputId: lockedTask.sourceInputId,
      expectedTaskComplete: row.expectedTaskComplete,
      actualTaskComplete: row.taskComplete,
      expectationBasis: typeof lockedTask.expected?.basis === "string" ? lockedTask.expected.basis : null,
      unresolvedRequiredObligationIds: unresolved.map((obligation: Record<string, any>) => String(obligation.obligationId)),
    });
    for (const obligation of unresolved) {
      const sourceOperation = lockedSource.enumeration.operations.find((operation: Record<string, any>) => operation.key === obligation.operationKey);
      if (!sourceOperation) throw new Error(`N10 revision operation is absent from source lock: ${obligation.operationKey}`);
      rootCauses.push(analyzeRootCause({
        taskId: row.taskId,
        operationKey: String(obligation.operationKey),
        obligation,
        sourceOperation,
        cases,
        specimens,
        negatives,
      }));
    }
  }

  const allMismatchesAreExpectedPositiveFailures = mismatchTasks.length > 0
    && mismatchTasks.every((row) => row.expectedTaskComplete && !row.actualTaskComplete);
  const everyUnresolvedIsBoundary = rootCauses.length === mismatchTasks.reduce((total, row) => total + row.unresolvedRequiredObligationIds.length, 0)
    && rootCauses.every((row) => row.classification === "declared-support-contract-boundary");
  const decision: N10RevisionReport["decision"] = firstRun.methodGate.decision === "passed"
    ? "no-revision-needed"
    : allMismatchesAreExpectedPositiveFailures && everyUnresolvedIsBoundary
      ? "no-safe-shared-revision"
      : "shared-revision-required";
  const componentContracts = await Promise.all(COMPONENT_FILES.map((path) => fileBinding(options.repositoryRoot, path)));

  return {
    schemaVersion: "skill-family-current-v2-n10-revision/v1",
    identity: IDENTITY,
    exposure: "development",
    evaluatedAt: options.evaluatedAt,
    revisionCodeCommit: options.revisionCodeCommit,
    bindings: {
      inputLock: await developmentBinding(options.repositoryRoot, options.developmentDirectory, "input-lock.json"),
      baseline: await developmentBinding(options.repositoryRoot, options.developmentDirectory, "baseline.json"),
      firstRun: await developmentBinding(options.repositoryRoot, options.developmentDirectory, "first-run.json"),
      componentContracts,
    },
    denominator: structuredClone(firstRun.summary),
    mismatchTasks,
    rootCauses,
    implementationChanges: [],
    rejectedOptions: [
      {
        option: "accept-empty-form-in-api-request-form-specimens-v1",
        reason: "The versioned profile explicitly rejects empty objects; changing it would expand the preserved support contract.",
      },
      {
        option: "coerce-form-schema-negative-values-to-strings",
        reason: "String coercion discards the source type violation and cannot be accepted as a checked source constraint.",
      },
    ],
    decision,
    firstRunMethodGate: structuredClone(firstRun.methodGate),
    downstream: {
      engineeringCalibrationStatus: decision === "no-revision-needed" ? "completed"
        : decision === "no-safe-shared-revision" ? "completed-with-limitation" : "blocked",
      researchCandidateEligible: decision === "no-revision-needed" && firstRun.methodGate.decision === "passed",
      nextAction: decision === "no-safe-shared-revision"
        ? "Complete N10 with limitation, continue independent engineering work, and record N9/N11/N12 as not executed."
        : decision === "no-revision-needed"
          ? "Complete N10 and continue to readiness and candidate freeze."
          : "Repair the unclassified shared implementation defect before completing N10.",
    },
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 },
    claimLimits: [
      "The decision applies only to the fixed development panel and the bound support contracts.",
      "A contract boundary is not proof that broader form construction is impossible.",
      "No unresolved obligation is converted to success and the immutable first-run score is unchanged.",
      "Local specimens do not validate live Visier API behavior.",
      "Historical document-level 0/6, readiness, held-out, Q1 and prospective facts remain unchanged.",
    ],
  };
}

export async function verifyN10RevisionDecision(options: {
  repositoryRoot: string;
  developmentDirectory: string;
  report?: N10RevisionReport;
}): Promise<{ status: "pass" | "fail"; errors: string[] }> {
  const errors = new Set<string>();
  let report = options.report;
  try {
    report ??= JSON.parse(await readFile(join(options.developmentDirectory, "revision-001.json"), "utf8")) as N10RevisionReport;
  } catch {
    return { status: "fail", errors: ["REVISION_REPORT_UNREADABLE"] };
  }
  if (report.schemaVersion !== "skill-family-current-v2-n10-revision/v1" || report.identity !== IDENTITY
    || report.exposure !== "development" || !/^[0-9a-f]{40}$/u.test(report.revisionCodeCommit)) {
    errors.add("REVISION_HEADER_INVALID");
  }
  let expected: N10RevisionReport | null = null;
  try {
    expected = await buildN10RevisionDecision({
      repositoryRoot: options.repositoryRoot,
      developmentDirectory: options.developmentDirectory,
      revisionCodeCommit: report.revisionCodeCommit,
      evaluatedAt: report.evaluatedAt,
    });
  } catch {
    errors.add("REVISION_RECOMPUTATION_FAILED");
  }
  if (expected) {
    if (stable(report.denominator) !== stable(expected.denominator)) errors.add("REVISION_DENOMINATOR_MISMATCH");
    if (stable(report.rootCauses) !== stable(expected.rootCauses)) errors.add("REVISION_ROOT_CAUSE_MISMATCH");
    if (stable(report.mismatchTasks) !== stable(expected.mismatchTasks)) errors.add("REVISION_TASK_MISMATCH");
    if (stable(report.bindings) !== stable(expected.bindings)) errors.add("REVISION_BINDING_MISMATCH");
    if (report.decision !== expected.decision || stable(report.downstream) !== stable(expected.downstream)) {
      errors.add("REVISION_DECISION_MISMATCH");
    }
    if (stable(report) !== stable(expected)) errors.add("REVISION_REPORT_MISMATCH");
  }
  if (report.implementationChanges.length !== 0) errors.add("REVISION_IMPLEMENTATION_CHANGE_INVENTED");
  if (Object.values(report.accounting).some((value) => value !== 0)) errors.add("REVISION_ACCOUNTING_NONZERO");
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort() };
}

export async function writeN10RevisionDecision(options: {
  repositoryRoot: string;
  developmentDirectory: string;
  revisionCodeCommit: string;
  evaluatedAt: string;
}): Promise<{ report: N10RevisionReport; file: FileBinding }> {
  const report = await buildN10RevisionDecision(options);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const path = join(options.developmentDirectory, "revision-001.json");
  await writeFile(path, text, { flag: "wx" });
  return {
    report,
    file: { path: "revision-001.json", sha256: sha(text), bytes: Buffer.byteLength(text) },
  };
}
