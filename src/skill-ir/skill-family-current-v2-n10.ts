import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseApiTaskContract, type ApiTaskContract } from "./api-task-contract";
import { buildApiTaskPlan } from "./api-task-plan";
import { verifyApiTaskPlan } from "./api-task-plan-checker";
import { buildApiFormRequestSpecimens } from "./api-request-specimens";
import { verifyApiFormRequestSpecimens } from "./api-request-specimens-checker";
import { buildApiRequestBodyNegatives } from "./api-request-body-negatives";
import { verifyApiRequestBodyNegatives } from "./api-request-body-negatives-checker";
import { buildApiPytestSuite } from "./api-pytest-suite";
import { verifyApiPytestSuite } from "./api-pytest-suite-checker";
import { runApiTask } from "./api-task-run";
import { analyzeApiTesterOperation, verifyApiTesterOperationAdmissionConsistency } from "./api-tester-operation-admission";
import { independentlyEnumerateApiTesterOperations } from "./api-tester-operation-coverage";
import { parseApiTesterOperationSource } from "./api-tester-operation-source";

const IDENTITY = "skill-family-current-v2-source-repair-001" as const;
const EXPOSURE_LEDGER = `results/skill-ir/${IDENTITY}/corpus/exposure-ledger.json`;
const DUTY_MATRIX = `results/skill-ir/${IDENTITY}/corpus/duty-matrix.json`;
const SELECTED_INPUTS = [
  "onepassword-connect",
  "onepassword-partnership",
  "visier-authentication",
  "visier-analytics",
  "zapier-actions",
  "zapier-embed",
] as const;

const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

function operationIdentities(rows: Array<{ key: string; locator: string; operationId: string | null; summary: string | null }>) {
  return rows.map(({ key, locator, operationId, summary }) => ({ key, locator, operationId, summary }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

type RequirementDefinition = {
  id: string;
  kind: ApiTaskContract["requirements"][number]["kind"];
  sourceLocator: string;
  dutyObligationId: string;
};

type TaskDefinition = {
  taskId: string;
  inputId: typeof SELECTED_INPUTS[number];
  operationKey: string;
  candidateId: "candidate-060" | "candidate-066" | "candidate-111" | "candidate-217";
  requirements: RequirementDefinition[];
  output: ApiTaskContract["output"];
  unresolvedRequirementIds?: string[];
  expectedTaskComplete: boolean;
  residualOracle: string[];
  expectationBasis: string;
};

const EVENT4U_SKILL = "event4u-app/agent-config:src/skills/api-testing/SKILL.md";
const FISHZJP_SKILL = "fishzjp/qa-skills:skills/api-testing/SKILL.md";
const LAMBDATEST_SKILL = "LambdaTest/agent-skills:api-skill/api-to-testcase-generator/SKILL.md";
const PACTFLOW_SKILL = "pactflow/pactflow-agent-skills:plugins/swagger-contract-testing/skills/openapi-parser/SKILL.md";

const event4uMinimal = (): RequirementDefinition => ({
  id: "valid-minimal",
  kind: "valid-minimal",
  sourceLocator: "src/skills/api-testing/SKILL.md:59",
  dutyObligationId: `${EVENT4U_SKILL}:duty-010-valid-request`,
});
const event4uConstraint = (): RequirementDefinition => ({
  id: "wrong-type",
  kind: "constraint-negative",
  sourceLocator: "src/skills/api-testing/SKILL.md:192",
  dutyObligationId: `${EVENT4U_SKILL}:duty-017-wrong-type`,
});
const lambdaRich = (): RequirementDefinition[] => [
  {
    id: "valid-full",
    kind: "valid-full",
    sourceLocator: "api-skill/api-to-testcase-generator/SKILL.md:28",
    dutyObligationId: `${LAMBDATEST_SKILL}:duty-010-valid-request`,
  },
  {
    id: "missing-required",
    kind: "required-omission",
    sourceLocator: "api-skill/api-to-testcase-generator/SKILL.md:84",
    dutyObligationId: `${LAMBDATEST_SKILL}:duty-018-missing-required`,
  },
  {
    id: "out-of-range",
    kind: "constraint-negative",
    sourceLocator: "api-skill/api-to-testcase-generator/SKILL.md:86",
    dutyObligationId: `${LAMBDATEST_SKILL}:duty-019-out-of-range`,
  },
];
const pactflowMinimal = (): RequirementDefinition => ({
  id: "valid-request",
  kind: "valid-minimal",
  sourceLocator: "plugins/swagger-contract-testing/skills/openapi-parser/SKILL.md:77",
  dutyObligationId: `${PACTFLOW_SKILL}:duty-012-valid-request`,
});

const TASKS: TaskDefinition[] = [
  {
    taskId: "n10-connect-event4u-minimal",
    inputId: "onepassword-connect",
    operationKey: "GET /health",
    candidateId: "candidate-060",
    requirements: [event4uMinimal()],
    output: "request-json",
    expectedTaskComplete: true,
    residualOracle: [],
    expectationBasis: "anonymous operation with no request dependencies; valid-minimal is mapped by the reviewed duty",
  },
  {
    taskId: "n10-partnership-lambda-rich",
    inputId: "onepassword-partnership",
    operationKey: "POST /api/v1/partners/accounts",
    candidateId: "candidate-111",
    requirements: lambdaRich(),
    output: "request-json",
    expectedTaskComplete: false,
    residualOracle: ["credentials-and-live-auth-not-supplied"],
    expectationBasis: "source requires bearerAuth and the locked task supplies no credential material",
  },
  {
    taskId: "n10-visier-auth-event4u",
    inputId: "visier-authentication",
    operationKey: "POST /v1/admin/visierSecureTicket",
    candidateId: "candidate-060",
    requirements: [event4uMinimal(), event4uConstraint()],
    output: "request-json",
    expectedTaskComplete: true,
    residualOracle: [],
    expectationBasis: "anonymous required form body exercises the mapped happy-path and wrong-type duties",
  },
  {
    taskId: "n10-visier-auth-lambda-rich",
    inputId: "visier-authentication",
    operationKey: "POST /v1/admin/visierSecureTicket",
    candidateId: "candidate-111",
    requirements: lambdaRich(),
    output: "request-json",
    expectedTaskComplete: true,
    residualOracle: [],
    expectationBasis: "anonymous required form body provides full, omission, and schema-negative targets",
  },
  {
    taskId: "n10-visier-analytics-pactflow",
    inputId: "visier-analytics",
    operationKey: "POST /v1alpha/admin/consolidated-analytics/tenants",
    candidateId: "candidate-217",
    requirements: [pactflowMinimal()],
    output: "request-json",
    expectedTaskComplete: true,
    residualOracle: [],
    expectationBasis: "anonymous JSON request with locally closed references exercises the reviewed valid-request duty",
  },
  {
    taskId: "n10-zapier-actions-event4u",
    inputId: "zapier-actions",
    operationKey: "POST /api/v1/exposed/{exposed_app_action_id}/execute",
    candidateId: "candidate-060",
    requirements: [event4uMinimal(), event4uConstraint()],
    output: "request-json",
    expectedTaskComplete: false,
    residualOracle: ["credentials-and-live-auth-not-supplied"],
    expectationBasis: "source requires one of four authentication schemes and the locked task supplies no credential material",
  },
  {
    taskId: "n10-zapier-embed-pactflow",
    inputId: "zapier-embed",
    operationKey: "POST /authentications",
    candidateId: "candidate-217",
    requirements: [pactflowMinimal()],
    output: "request-json",
    expectedTaskComplete: true,
    residualOracle: [],
    expectationBasis: "anonymous required JSON-compatible body exercises the reviewed valid-request duty",
  },
  {
    taskId: "n10-zapier-embed-lambda-rich",
    inputId: "zapier-embed",
    operationKey: "POST /authentications",
    candidateId: "candidate-111",
    requirements: lambdaRich(),
    output: "request-json",
    expectedTaskComplete: true,
    residualOracle: [],
    expectationBasis: "anonymous required JSON-compatible body provides full, omission, and schema-negative targets",
  },
  {
    taskId: "n10-zapier-embed-fishzjp-pytest",
    inputId: "zapier-embed",
    operationKey: "POST /authentications",
    candidateId: "candidate-066",
    requirements: [{
      id: "negative-fuzzing",
      kind: "constraint-negative",
      sourceLocator: "skills/api-testing/SKILL.md:142",
      dutyObligationId: `${FISHZJP_SKILL}:duty-027-negative-fuzzing`,
    }],
    output: "pytest",
    unresolvedRequirementIds: ["negative-fuzzing"],
    expectedTaskComplete: false,
    residualOracle: ["reviewed-duty-is-broader-than-constraint-negative", "constraint-negative-not-in-pytest-runtime"],
    expectationBasis: "the source duty requests structural fuzzing and pytest output; the narrower mapping remains explicitly unresolved",
  },
];

const CANDIDATE_SKILLS: Record<TaskDefinition["candidateId"], { skillId: string; repository: string }> = {
  "candidate-060": { skillId: EVENT4U_SKILL, repository: "event4u-app/agent-config" },
  "candidate-066": { skillId: FISHZJP_SKILL, repository: "fishzjp/qa-skills" },
  "candidate-111": { skillId: LAMBDATEST_SKILL, repository: "LambdaTest/agent-skills" },
  "candidate-217": { skillId: PACTFLOW_SKILL, repository: "pactflow/pactflow-agent-skills" },
};

function taskContract(definition: TaskDefinition, sourceFile: string): ApiTaskContract {
  const mapping = CANDIDATE_SKILLS[definition.candidateId];
  return parseApiTaskContract({
    schemaVersion: "skvm-api-task/v1",
    taskId: definition.taskId,
    profile: "oas30-offline-test/v1",
    input: { path: sourceFile, format: "yaml", dialect: "oas3.0" },
    dependencyManifest: null,
    operationKeys: [definition.operationKey],
    requirements: definition.requirements.map((row) => ({
      id: row.id,
      kind: row.kind,
      required: true,
      scope: "each-selected-operation" as const,
      sourceLocator: row.sourceLocator,
    })),
    output: definition.output,
    observations: null,
    execution: { mode: "offline-validation" },
    mapping: {
      origin: "agent-reviewed",
      sourceSkill: mapping.skillId,
      unresolvedRequirementIds: definition.unresolvedRequirementIds ?? [],
    },
  });
}

type ExposureLedger = {
  apiInputs: { rows: Array<Record<string, any>> };
};
type DutyMatrix = {
  mappingCandidates: Array<Record<string, any>>;
  members: Array<Record<string, any>>;
};

export type N10DevelopmentLock = {
  schemaVersion: "skill-family-current-v2-n10-input-lock/v1";
  identity: typeof IDENTITY;
  exposure: "development";
  lockedAt: string;
  supportProfile: "development-rich-task/v1";
  authority: {
    exposureLedger: { path: string; sha256: string };
    dutyMatrix: { path: string; sha256: string };
    selectionPolicy: string;
    outputsObservedBeforeLock: false;
  };
  summary: {
    uniqueInputs: number;
    providers: number;
    operationDenominator: number;
    taskContracts: number;
    mappingRepositories: number;
    expectedCompleteTasks: number;
    expectedCompleteProviders: number;
  };
  sources: Array<Record<string, any>>;
  tasks: Array<Record<string, any>>;
  comparisons: Array<Record<string, any>>;
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0 };
  claimLimits: string[];
};

function taskFileName(taskId: string): string {
  return `${taskId}.json`;
}

export async function materializeN10DevelopmentPanel(options: {
  repositoryRoot: string;
  developmentDirectory: string;
  lockedAt: string;
}): Promise<{ lock: N10DevelopmentLock; path: string; sha256: string }> {
  const exposureBytes = await readFile(join(options.repositoryRoot, EXPOSURE_LEDGER));
  const dutyBytes = await readFile(join(options.repositoryRoot, DUTY_MATRIX));
  const exposure = JSON.parse(exposureBytes.toString("utf8")) as ExposureLedger;
  const duties = JSON.parse(dutyBytes.toString("utf8")) as DutyMatrix;
  const taskDirectory = join(options.developmentDirectory, "task-contracts");
  await mkdir(taskDirectory, { recursive: true });

  const sources: N10DevelopmentLock["sources"] = [];
  for (const inputId of SELECTED_INPUTS) {
    const authority = exposure.apiInputs.rows.find((row) => row.inputId === inputId);
    if (!authority) throw new Error(`N10 source is absent from exposure ledger: ${inputId}`);
    const sourceBytes = await readFile(join(options.repositoryRoot, authority.path));
    if (sha(sourceBytes) !== authority.sha256 || sourceBytes.byteLength !== authority.bytes) {
      throw new Error(`N10 source authority mismatch: ${inputId}`);
    }
    const sourceText = sourceBytes.toString("utf8");
    const parsed = parseApiTesterOperationSource(sourceText, authority.format);
    const independent = independentlyEnumerateApiTesterOperations(sourceText, authority.format);
    if (!parsed.document || !parsed.enumeration.complete || !independent.complete) {
      throw new Error(`N10 source operation enumeration is incomplete: ${inputId}`);
    }
    if (stable(operationIdentities(parsed.enumeration.operations))
      !== stable(operationIdentities(independent.operations))) {
      throw new Error(`N10 independent operation enumeration mismatch: ${inputId}`);
    }
    const copyFile = `source-${inputId}.${authority.format === "yaml" ? "yaml" : "json"}`;
    await writeFile(join(taskDirectory, copyFile), sourceBytes, { flag: "wx" });
    sources.push({
      inputId,
      provider: authority.provider,
      openapiVersion: authority.openapiVersion,
      apiVersion: authority.apiVersion,
      provenance: {
        sourceRepository: authority.sourceRepository,
        sourceCommit: authority.sourceCommit,
        sourcePath: authority.sourcePath,
        mirrorUrl: authority.mirrorUrl,
        originalUpstreamUrl: authority.originalUpstreamUrl,
        upstreamIdentityStatus: authority.upstreamIdentityStatus,
        isAggregatorMirror: authority.isAggregatorMirror,
      },
      original: { path: authority.path, sha256: authority.sha256, bytes: authority.bytes, format: authority.format },
      lockedCopy: { path: `task-contracts/${copyFile}`, sha256: sha(sourceBytes), bytes: sourceBytes.byteLength },
      enumeration: {
        complete: true,
        operationCount: parsed.enumeration.operations.length,
        unresolved: parsed.enumeration.unresolved,
        operations: parsed.enumeration.operations.map((operation) => ({
          key: operation.key,
          locator: operation.locator,
          operationId: operation.operationId,
          summary: operation.summary,
          parameters: operation.parameters,
          request: operation.request,
          responses: operation.responses,
          security: operation.security,
          references: operation.references,
        })),
      },
    });
  }

  const tasks: N10DevelopmentLock["tasks"] = [];
  for (const definition of TASKS) {
    const mapping = CANDIDATE_SKILLS[definition.candidateId];
    const source = sources.find((row) => row.inputId === definition.inputId)!;
    const mappingCandidate = duties.mappingCandidates.find((row) => row.candidateId === definition.candidateId);
    const member = duties.members.find((row) => row.candidateId === definition.candidateId);
    if (!mappingCandidate || !member || member.skillId !== mapping.skillId || member.repository !== mapping.repository) {
      throw new Error(`N10 reviewed mapping authority mismatch: ${definition.candidateId}`);
    }
    for (const requirement of definition.requirements) {
      const duty = member.duties.find((row: any) => row.obligationId === requirement.dutyObligationId);
      if (!duty || duty.sourceLocator !== requirement.sourceLocator) {
        throw new Error(`N10 duty locator mismatch: ${requirement.dutyObligationId}`);
      }
    }
    const contract = taskContract(definition, source.lockedCopy.path.slice("task-contracts/".length));
    const text = `${JSON.stringify(contract, null, 2)}\n`;
    const fileName = taskFileName(definition.taskId);
    await writeFile(join(taskDirectory, fileName), text, { flag: "wx" });
    tasks.push({
      taskId: definition.taskId,
      taskPath: `task-contracts/${fileName}`,
      taskSha256: sha(text),
      sourceInputId: definition.inputId,
      mapping: {
        candidateId: definition.candidateId,
        repository: mapping.repository,
        skillId: mapping.skillId,
        origin: "agent-reviewed-existing-ledger",
        mappedDutyObligationIds: definition.requirements.map((row) => row.dutyObligationId),
        residualDutyScopePreserved: mappingCandidate.residualScopePreserved === true,
      },
      denominator: {
        operationKeys: [definition.operationKey],
        requirements: contract.requirements,
        requiredObligationsKnownBeforePlanning: false,
      },
      expected: {
        taskComplete: definition.expectedTaskComplete,
        residualOracle: definition.residualOracle,
        basis: definition.expectationBasis,
      },
    });
  }

  const expectedComplete = tasks.filter((row) => row.expected.taskComplete === true);
  const expectedProviders = new Set(expectedComplete.map((task) =>
    sources.find((source) => source.inputId === task.sourceInputId)!.provider));
  const lock: N10DevelopmentLock = {
    schemaVersion: "skill-family-current-v2-n10-input-lock/v1",
    identity: IDENTITY,
    exposure: "development",
    lockedAt: options.lockedAt,
    supportProfile: "development-rich-task/v1",
    authority: {
      exposureLedger: { path: EXPOSURE_LEDGER, sha256: sha(exposureBytes) },
      dutyMatrix: { path: DUTY_MATRIX, sha256: sha(dutyBytes) },
      selectionPolicy: "Before construction, select the two already-exposed contracts for each of 1Password, Visier, and Zapier. This statically supplies three providers, preserves credential-blocked controls, and supplies at least one anonymous operation per provider without inspecting constructor output.",
      outputsObservedBeforeLock: false,
    },
    summary: {
      uniqueInputs: sources.length,
      providers: new Set(sources.map((row) => row.provider)).size,
      operationDenominator: sources.reduce((total, row) => total + row.enumeration.operationCount, 0),
      taskContracts: tasks.length,
      mappingRepositories: new Set(tasks.map((row) => row.mapping.repository)).size,
      expectedCompleteTasks: expectedComplete.length,
      expectedCompleteProviders: expectedProviders.size,
    },
    sources,
    tasks,
    comparisons: [
      {
        id: "visier-auth-requirement-change",
        leftTaskId: "n10-visier-auth-event4u",
        rightTaskId: "n10-visier-auth-lambda-rich",
        sameInputAndOperation: true,
        changedFields: ["requirements"],
        expectedRelation: "different-plan-and-artifact",
      },
      {
        id: "zapier-embed-requirement-change",
        leftTaskId: "n10-zapier-embed-pactflow",
        rightTaskId: "n10-zapier-embed-lambda-rich",
        sameInputAndOperation: true,
        changedFields: ["requirements"],
        expectedRelation: "different-plan-and-artifact",
      },
    ],
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0 },
    claimLimits: [
      "the panel is development-exposed and is not prospective evidence",
      "task-selected completion is not whole-document or live API completion",
      "credential-blocked and unresolved mappings remain in the fixed denominator",
      "the historical document-level 0/6 result and readiness are unchanged",
    ],
  };
  const lockText = `${JSON.stringify(lock, null, 2)}\n`;
  const lockPath = join(options.developmentDirectory, "input-lock.json");
  await writeFile(lockPath, lockText, { flag: "wx" });
  return { lock, path: lockPath, sha256: sha(lockText) };
}

export async function verifyN10DevelopmentPanel(options: {
  repositoryRoot: string;
  developmentDirectory: string;
}): Promise<{ status: "pass" | "fail"; errors: string[] }> {
  const errors = new Set<string>();
  let lock: N10DevelopmentLock;
  try {
    lock = JSON.parse(await readFile(join(options.developmentDirectory, "input-lock.json"), "utf8"));
  } catch {
    return { status: "fail", errors: ["INPUT_LOCK_UNREADABLE"] };
  }
  if (lock.schemaVersion !== "skill-family-current-v2-n10-input-lock/v1" || lock.identity !== IDENTITY
    || lock.exposure !== "development" || lock.authority.outputsObservedBeforeLock !== false) {
    errors.add("INPUT_LOCK_HEADER_INVALID");
  }
  for (const authority of [lock.authority.exposureLedger, lock.authority.dutyMatrix]) {
    try {
      if (sha(await readFile(join(options.repositoryRoot, authority.path))) !== authority.sha256) {
        errors.add(`AUTHORITY_SHA256_MISMATCH:${authority.path}`);
      }
    } catch {
      errors.add(`AUTHORITY_UNREADABLE:${authority.path}`);
    }
  }
  const sourceById = new Map(lock.sources.map((row) => [row.inputId, row]));
  if (sourceById.size !== lock.sources.length) errors.add("DUPLICATE_SOURCE_INPUT_ID");
  for (const source of lock.sources) {
    try {
      const bytes = await readFile(join(options.developmentDirectory, source.lockedCopy.path));
      if (sha(bytes) !== source.lockedCopy.sha256 || bytes.byteLength !== source.lockedCopy.bytes) {
        errors.add(`SOURCE_SHA256_MISMATCH:${source.inputId}`);
        continue;
      }
      const universe = independentlyEnumerateApiTesterOperations(bytes.toString("utf8"), source.original.format);
      const actual = operationIdentities(universe.operations);
      const locked = operationIdentities(source.enumeration.operations);
      if (!universe.complete || stable(actual) !== stable(locked)) errors.add(`SOURCE_OPERATION_DENOMINATOR_MISMATCH:${source.inputId}`);
    } catch {
      errors.add(`SOURCE_UNREADABLE:${source.inputId}`);
    }
  }
  const taskValues = new Map<string, ApiTaskContract>();
  for (const row of lock.tasks) {
    try {
      const bytes = await readFile(join(options.developmentDirectory, row.taskPath));
      if (sha(bytes) !== row.taskSha256) errors.add(`TASK_SHA256_MISMATCH:${row.taskId}`);
      const task = parseApiTaskContract(JSON.parse(bytes.toString("utf8")));
      taskValues.set(row.taskId, task);
      if (task.taskId !== row.taskId || stable(task.operationKeys) !== stable(row.denominator.operationKeys)
        || stable(task.requirements) !== stable(row.denominator.requirements)) {
        errors.add(`TASK_DENOMINATOR_MISMATCH:${row.taskId}`);
      }
      const source = sourceById.get(row.sourceInputId);
      const known = new Set(source?.enumeration.operations.map((operation: any) => operation.key) ?? []);
      if (!Array.isArray(task.operationKeys) || task.operationKeys.some((key) => !known.has(key))) {
        errors.add(`TASK_OPERATION_OUTSIDE_SOURCE:${row.taskId}`);
      }
      if (task.mapping.sourceSkill !== row.mapping.skillId) errors.add(`TASK_MAPPING_MISMATCH:${row.taskId}`);
      if (row.expected.taskComplete === true) {
        const selected = source?.enumeration.operations.filter((operation: any) =>
          (task.operationKeys as string[]).includes(operation.key)) ?? [];
        if (selected.some((operation: any) => operation.security.schemeNames.length > 0
          || operation.references.some((reference: any) => reference.constructionObligation && reference.resolution !== "resolved"))) {
          errors.add(`EXPECTED_COMPLETE_STATIC_CONTRADICTION:${row.taskId}`);
        }
      }
    } catch {
      errors.add(`TASK_UNREADABLE:${row.taskId}`);
    }
  }
  for (const relation of lock.comparisons) {
    const left = taskValues.get(relation.leftTaskId), right = taskValues.get(relation.rightTaskId);
    if (!left || !right) errors.add(`COMPARISON_TASK_MISSING:${relation.id}`);
    else if (stable(left.requirements) === stable(right.requirements)) errors.add(`COMPARISON_REQUIREMENTS_UNCHANGED:${relation.id}`);
  }
  const operationDenominator = lock.sources.reduce((total, row) => total + row.enumeration.operations.length, 0);
  const expectedTasks = lock.tasks.filter((row) => row.expected.taskComplete === true);
  const expectedProviders = new Set(expectedTasks.map((task) => sourceById.get(task.sourceInputId)?.provider));
  const recalculated = {
    uniqueInputs: lock.sources.length,
    providers: new Set(lock.sources.map((row) => row.provider)).size,
    operationDenominator,
    taskContracts: lock.tasks.length,
    mappingRepositories: new Set(lock.tasks.map((row) => row.mapping.repository)).size,
    expectedCompleteTasks: expectedTasks.length,
    expectedCompleteProviders: expectedProviders.size,
  };
  if (stable(recalculated) !== stable(lock.summary)) errors.add("LOCK_SUMMARY_MISMATCH");
  if (recalculated.uniqueInputs !== 6 || recalculated.providers !== 3 || recalculated.mappingRepositories < 3) {
    errors.add("LOCK_MINIMUM_PANEL_NOT_MET");
  }
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort() };
}

type BaselineComponents = {
  specimens: ReturnType<typeof buildApiFormRequestSpecimens>;
  negatives: ReturnType<typeof buildApiRequestBodyNegatives>;
  pytest: Awaited<ReturnType<typeof buildApiPytestSuite>> | null;
  checks: {
    specimens: ReturnType<typeof verifyApiFormRequestSpecimens>;
    negatives: ReturnType<typeof verifyApiRequestBodyNegatives>;
    pytest: Awaited<ReturnType<typeof verifyApiPytestSuite>> | null;
  };
};

async function baselineComponents(sourceText: string, format: "json" | "yaml", includePytest: boolean): Promise<BaselineComponents> {
  const specimens = buildApiFormRequestSpecimens(sourceText, format);
  const negatives = buildApiRequestBodyNegatives(sourceText, format);
  const pytest = includePytest ? await buildApiPytestSuite(sourceText, format) : null;
  return {
    specimens,
    negatives,
    pytest,
    checks: {
      specimens: verifyApiFormRequestSpecimens(sourceText, format, specimens),
      negatives: verifyApiRequestBodyNegatives(sourceText, format, negatives),
      pytest: pytest ? await verifyApiPytestSuite(sourceText, format, pytest) : null,
    },
  };
}

function sourceRequiresCredentials(security: unknown): boolean {
  if (!Array.isArray(security)) return true;
  return security.length > 0 && !security.some((entry) => entry && typeof entry === "object"
    && !Array.isArray(entry) && Object.keys(entry).length === 0);
}

function baselinePotential(obligation: any, components: BaselineComponents) {
  if (obligation.applicability === "unresolved-mapping") {
    return { obligationId: obligation.obligationId, status: "unresolved-mapping", evidenceIds: [] as string[] };
  }
  if (obligation.applicability !== "applicable") {
    return { obligationId: obligation.obligationId, status: obligation.applicability, evidenceIds: [] as string[] };
  }
  const operation = components.specimens.operations.find((row) => row.key === obligation.operationKey);
  const credentials = sourceRequiresCredentials(operation?.security);
  if (["valid-minimal", "valid-full", "required-omission"].includes(obligation.requirementKind)) {
    const mode = obligation.requirementKind === "valid-full" ? "full" : "minimal";
    const omit = obligation.requirementKind === "required-omission" ? obligation.target.id : null;
    const candidate = operation?.cases.find((row) => row.mode === mode && row.omit === omit);
    if (!candidate || candidate.status !== "constructed") {
      return { obligationId: obligation.obligationId, status: "source-specimen-unavailable", evidenceIds: candidate ? [candidate.id] : [] };
    }
    return {
      obligationId: obligation.obligationId,
      status: credentials ? "constructed-but-credential-unbound" : "constructed-but-task-unbound",
      evidenceIds: [candidate.id],
    };
  }
  if (obligation.requirementKind === "constraint-negative") {
    const cases = components.negatives.operations.find((row) => row.key === obligation.operationKey)?.cases
      .filter((row) => row.fieldId === obligation.target.id) ?? [];
    if (!cases.length || cases.some((row) => row.status !== "constructed")) {
      return { obligationId: obligation.obligationId, status: "source-negative-unavailable", evidenceIds: cases.map((row) => row.id) };
    }
    return {
      obligationId: obligation.obligationId,
      status: credentials ? "constructed-but-credential-unbound" : "constructed-but-task-unbound",
      evidenceIds: cases.map((row) => row.id),
    };
  }
  return { obligationId: obligation.obligationId, status: "source-observation-unavailable", evidenceIds: [] as string[] };
}

export type N10BaselineReport = {
  schemaVersion: "skill-family-current-v2-n10-baseline/v1";
  identity: typeof IDENTITY;
  exposure: "development";
  executedAt: string;
  lock: { path: "input-lock.json"; sha256: string; commit: string };
  definition: Record<string, unknown>;
  summary: Record<string, number>;
  sources: Array<Record<string, any>>;
  tasks: Array<Record<string, any>>;
  accounting: { sourceApiCalls: 0; businessApiCalls: 0; modelCalls: 0; paidCalls: 0; nativeLoopbackHttpCalls: 0 };
  claimLimits: string[];
};

export async function writeN10BaselineFromDevelopmentPanel(options: {
  repositoryRoot: string;
  developmentDirectory: string;
  lockCommit: string;
  executedAt: string;
}): Promise<{ report: N10BaselineReport; file: { path: string; sha256: string; bytes: number } }> {
  const panelCheck = await verifyN10DevelopmentPanel(options);
  if (panelCheck.status !== "pass") throw new Error(`N10 panel is not verified: ${panelCheck.errors.join("; ")}`);
  const lockBytes = await readFile(join(options.developmentDirectory, "input-lock.json"));
  const lock = JSON.parse(lockBytes.toString("utf8")) as N10DevelopmentLock;
  if (!/^[0-9a-f]{40}$/u.test(options.lockCommit)) throw new Error("N10 baseline lock commit must be a full Git SHA");

  const sourceRuntime = new Map<string, BaselineComponents>();
  const sources: N10BaselineReport["sources"] = [];
  for (const source of lock.sources) {
    const sourceText = await readFile(join(options.developmentDirectory, source.lockedCopy.path), "utf8");
    const includePytest = lock.tasks.some((task) => task.sourceInputId === source.inputId
      && JSON.parse(readFileSync(join(options.developmentDirectory, task.taskPath), "utf8")).output === "pytest");
    const firstStarted = performance.now();
    const first = await baselineComponents(sourceText, source.original.format, includePytest);
    const firstDurationMs = Number((performance.now() - firstStarted).toFixed(3));
    const repeatStarted = performance.now();
    const repeat = await baselineComponents(sourceText, source.original.format, includePytest);
    const repeatDurationMs = Number((performance.now() - repeatStarted).toFixed(3));
    const firstDigest = sha(stable({ specimens: first.specimens, negatives: first.negatives, pytest: first.pytest }));
    const repeatDigest = sha(stable({ specimens: repeat.specimens, negatives: repeat.negatives, pytest: repeat.pytest }));
    const checks = [first.checks.specimens.status, first.checks.negatives.status,
      ...(first.checks.pytest ? [first.checks.pytest.status] : [])];
    sourceRuntime.set(source.inputId, first);
    sources.push({
      inputId: source.inputId,
      provider: source.provider,
      inputSha256: source.lockedCopy.sha256,
      operationDenominator: source.enumeration.operationCount,
      operations: first.specimens.operations.map((operation) => ({
        operationKey: operation.key,
        caseInventoryComplete: operation.caseInventoryComplete,
        cases: operation.cases.length,
        constructedCases: operation.cases.filter((row) => row.status === "constructed").length,
        unresolvedCases: operation.cases.filter((row) => row.status === "unresolved").length,
        credentialsRequired: sourceRequiresCredentials(operation.security),
        issues: operation.issues,
      })),
      bodyNegativeCases: first.negatives.operations.reduce((total, operation) => total + operation.cases.length, 0),
      pytestCompiled: first.pytest !== null,
      componentChecks: checks.every((status) => status === "pass") ? "pass" : "fail",
      checkDetails: first.checks,
      firstBuild: { durationMs: firstDurationMs, semanticDigest: firstDigest },
      repeat: {
        durationMs: repeatDurationMs,
        cacheDeclared: false,
        cacheHit: false,
        semanticDigest: repeatDigest,
        semanticDigestMatches: repeatDigest === firstDigest,
      },
      modificationCount: 0,
    });
  }

  const tasks: N10BaselineReport["tasks"] = [];
  for (const row of lock.tasks) {
    const task = parseApiTaskContract(JSON.parse(await readFile(join(options.developmentDirectory, row.taskPath), "utf8")));
    const source = lock.sources.find((entry) => entry.inputId === row.sourceInputId)!;
    const sourceText = await readFile(join(options.developmentDirectory, source.lockedCopy.path), "utf8");
    const plan = buildApiTaskPlan(task, sourceText, { supportedOutputs: ["pytest", "request-json"], sourceRepository: source.provenance.sourceRepository });
    const planCheck = verifyApiTaskPlan(task, sourceText, plan, { supportedOutputs: ["pytest", "request-json"] });
    if (planCheck.status !== "pass") throw new Error(`N10 baseline denominator plan failed: ${row.taskId}: ${planCheck.errors.join("; ")}`);
    const potential = plan.obligations.map((obligation) => baselinePotential(obligation, sourceRuntime.get(row.sourceInputId)!));
    const requiredIds = new Set(plan.obligations.filter((obligation) => obligation.required).map((obligation) => obligation.obligationId));
    const potentiallyConstructed = potential.filter((item) => requiredIds.has(item.obligationId)
      && item.status.startsWith("constructed-but-")).length;
    tasks.push({
      taskId: row.taskId,
      sourceInputId: row.sourceInputId,
      provider: source.provider,
      mappingRepository: row.mapping.repository,
      outputRequested: task.output,
      operationKeys: plan.operationKeys,
      requiredObligationDenominator: requiredIds.size,
      potentiallyConstructedRequiredObligations: potentiallyConstructed,
      checkedBoundRequiredObligations: 0,
      potential,
      planUsedForEvaluationOnly: { status: planCheck.status, semanticPlanSha256: plan.semanticPlanSha256 },
      packageCheck: "not-available",
      nativeConsumption: { status: "not-executed", executed: 0 },
      taskComplete: false,
      modificationCount: 0,
    });
  }
  const report: N10BaselineReport = {
    schemaVersion: "skill-family-current-v2-n10-baseline/v1",
    identity: IDENTITY,
    exposure: "development",
    executedAt: options.executedAt,
    lock: { path: "input-lock.json", sha256: sha(lockBytes), commit: options.lockCommit },
    definition: {
      name: "source-only-shared-components",
      constructionInputs: ["OpenAPI source bytes"],
      components: ["api-request-form-specimens", "api-request-body-negatives", "api-pytest-suite"],
      evaluationOnly: "the locked TaskContract planner derives denominators but does not influence baseline construction",
      absentCapabilities: ["TaskContract dispatch", "requirement-to-artifact binding", "task package checker", "task-selected native consumption"],
    },
    summary: {
      uniqueInputs: sources.length,
      operationDenominator: sources.reduce((total, source) => total + source.operationDenominator, 0),
      taskContracts: tasks.length,
      requiredObligationDenominator: tasks.reduce((total, task) => total + task.requiredObligationDenominator, 0),
      sourceConstructiblePotential: tasks.reduce((total, task) => total + task.potentiallyConstructedRequiredObligations, 0),
      checkedBoundRequiredObligations: 0,
      taskComplete: 0,
      taskPackageChecks: 0,
      nativeExecuted: 0,
      modifications: 0,
    },
    sources,
    tasks,
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 },
    claimLimits: [
      "source construction potential is not checked TaskContract obligation coverage",
      "the source-only baseline cannot report a completed task or native consumption",
      "timings are one-machine observations and no cache exists in this baseline",
      "this development-exposed panel is not prospective or live API evidence",
    ],
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const relativePath = "baseline.json";
  await writeFile(join(options.developmentDirectory, relativePath), text, { flag: "wx" });
  return { report, file: { path: relativePath, sha256: sha(text), bytes: Buffer.byteLength(text) } };
}

export async function verifyN10Baseline(options: {
  repositoryRoot: string;
  developmentDirectory: string;
}): Promise<{ status: "pass" | "fail"; errors: string[] }> {
  const errors = new Set<string>();
  const panel = await verifyN10DevelopmentPanel(options);
  for (const error of panel.errors) errors.add(`PANEL:${error}`);
  let lock: N10DevelopmentLock, report: N10BaselineReport;
  try {
    lock = JSON.parse(await readFile(join(options.developmentDirectory, "input-lock.json"), "utf8"));
    report = JSON.parse(await readFile(join(options.developmentDirectory, "baseline.json"), "utf8"));
  } catch {
    return { status: "fail", errors: ["BASELINE_OR_LOCK_UNREADABLE"] };
  }
  const lockBytes = await readFile(join(options.developmentDirectory, "input-lock.json"));
  if (report.schemaVersion !== "skill-family-current-v2-n10-baseline/v1" || report.identity !== IDENTITY
    || report.exposure !== "development") errors.add("BASELINE_HEADER_INVALID");
  if (report.lock.sha256 !== sha(lockBytes) || !/^[0-9a-f]{40}$/u.test(report.lock.commit)) errors.add("BASELINE_LOCK_BINDING_INVALID");
  if (stable(report.sources.map((row) => row.inputId).sort()) !== stable(lock.sources.map((row) => row.inputId).sort())) {
    errors.add("BASELINE_SOURCE_SET_MISMATCH");
  }
  if (stable(report.tasks.map((row) => row.taskId).sort()) !== stable(lock.tasks.map((row) => row.taskId).sort())) {
    errors.add("BASELINE_TASK_SET_MISMATCH");
  }
  for (const source of report.sources) {
    if (source.componentChecks !== "pass") errors.add(`BASELINE_COMPONENT_CHECK_FAILED:${source.inputId}`);
    if (source.repeat.cacheDeclared !== false || source.repeat.cacheHit !== false
      || source.repeat.semanticDigestMatches !== true) errors.add(`BASELINE_REPEAT_INVALID:${source.inputId}`);
    if (source.operations.length !== source.operationDenominator) errors.add(`BASELINE_OPERATION_DENOMINATOR_MISMATCH:${source.inputId}`);
  }
  for (const task of report.tasks) {
    if (task.taskComplete !== false || task.checkedBoundRequiredObligations !== 0
      || task.packageCheck !== "not-available" || task.nativeConsumption.executed !== 0) {
      errors.add(`BASELINE_FALSE_COMPLETION:${task.taskId}`);
    }
  }
  const summary = {
    uniqueInputs: report.sources.length,
    operationDenominator: report.sources.reduce((total, source) => total + source.operationDenominator, 0),
    taskContracts: report.tasks.length,
    requiredObligationDenominator: report.tasks.reduce((total, task) => total + task.requiredObligationDenominator, 0),
    sourceConstructiblePotential: report.tasks.reduce((total, task) => total + task.potentiallyConstructedRequiredObligations, 0),
    checkedBoundRequiredObligations: report.tasks.reduce((total, task) => total + task.checkedBoundRequiredObligations, 0),
    taskComplete: report.tasks.filter((task) => task.taskComplete === true).length,
    taskPackageChecks: report.tasks.filter((task) => task.packageCheck === "pass").length,
    nativeExecuted: report.tasks.reduce((total, task) => total + task.nativeConsumption.executed, 0),
    modifications: report.tasks.reduce((total, task) => total + task.modificationCount, 0),
  };
  if (stable(summary) !== stable(report.summary)) errors.add("BASELINE_SUMMARY_MISMATCH");
  if (Object.values(report.accounting).some((value) => value !== 0)) errors.add("BASELINE_ACCOUNTING_NONZERO");
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort() };
}

export type N10FirstRunSummaryRow = {
  taskId: string;
  provider: string;
  taskComplete: boolean;
  expectedTaskComplete: boolean;
  packageCheck: "pass" | "fail" | "not-produced";
  required: {
    total: number;
    checkedExported: number;
    failed: number;
    unresolved: number;
    insufficientInput: number;
    missing: number;
  };
  nativeExecuted: number;
  modificationCount: number;
};

export function summarizeN10FirstRunRows(input: {
  uniqueInputs: number;
  providers: number;
  operationDenominator: number;
  comparisonTotal: number;
  comparisonPassed: number;
  rows: N10FirstRunSummaryRow[];
}) {
  const sum = (key: keyof N10FirstRunSummaryRow["required"]) =>
    input.rows.reduce((total, row) => total + row.required[key], 0);
  return {
    uniqueInputs: input.uniqueInputs,
    providers: input.providers,
    operationDenominator: input.operationDenominator,
    taskContracts: input.rows.length,
    taskComplete: input.rows.filter((row) => row.taskComplete).length,
    completeProviders: new Set(input.rows.filter((row) => row.taskComplete).map((row) => row.provider)).size,
    expectedOutcomeMatches: input.rows.filter((row) => row.taskComplete === row.expectedTaskComplete).length,
    expectedOutcomeMismatches: input.rows.filter((row) => row.taskComplete !== row.expectedTaskComplete).length,
    packageChecksPassed: input.rows.filter((row) => row.packageCheck === "pass").length,
    packageChecksFailedOrMissing: input.rows.filter((row) => row.packageCheck !== "pass").length,
    requiredObligationDenominator: sum("total"),
    checkedExportedRequiredObligations: sum("checkedExported"),
    failedRequiredObligations: sum("failed"),
    unresolvedRequiredObligations: sum("unresolved"),
    insufficientInputRequiredObligations: sum("insufficientInput"),
    missingRequiredObligations: sum("missing"),
    nativeExecuted: input.rows.reduce((total, row) => total + row.nativeExecuted, 0),
    modifications: input.rows.reduce((total, row) => total + row.modificationCount, 0),
    comparisons: input.comparisonTotal,
    comparisonsPassed: input.comparisonPassed,
  };
}

function portable(value: string): string {
  return value.replaceAll("\\", "/");
}

function emptyRequiredCounts() {
  return { total: 0, checkedExported: 0, failed: 0, unresolved: 0, insufficientInput: 0, missing: 0 };
}

export function readN10RequiredCompletionCounts(artifact: unknown): N10FirstRunSummaryRow["required"] {
  const required = (artifact as any)?.completion?.required;
  const keys = Object.keys(emptyRequiredCounts());
  if (!required || keys.some((key) => !Number.isInteger(required[key]) || required[key] < 0)) {
    throw new Error("task package lacks completion.required counts");
  }
  return Object.fromEntries(keys.map((key) => [key, required[key]])) as N10FirstRunSummaryRow["required"];
}

async function hashBundleFiles(outputDirectory: string): Promise<{ status: "pass" | "fail"; errors: string[]; manifestSha256: string | null }> {
  const errors: string[] = [];
  try {
    const manifestBytes = await readFile(join(outputDirectory, "bundle-manifest.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (manifest.schemaVersion !== "skvm-api-task-bundle-manifest/v1" || !Array.isArray(manifest.files)) {
      return { status: "fail", errors: ["BUNDLE_MANIFEST_INVALID"], manifestSha256: sha(manifestBytes) };
    }
    for (const file of manifest.files) {
      try {
        const bytes = await readFile(join(outputDirectory, file.path));
        if (sha(bytes) !== file.sha256 || bytes.byteLength !== file.bytes) errors.push(`BUNDLE_FILE_MISMATCH:${file.path}`);
      } catch {
        errors.push(`BUNDLE_FILE_MISSING:${file.path}`);
      }
    }
    return { status: errors.length ? "fail" : "pass", errors, manifestSha256: sha(manifestBytes) };
  } catch {
    return { status: "fail", errors: ["BUNDLE_MANIFEST_UNREADABLE"], manifestSha256: null };
  }
}

async function executeN10TaskFirstRun(input: {
  developmentDirectory: string;
  lockTask: Record<string, any>;
  lockSource: Record<string, any>;
  engineCodeCommit: string;
}) {
  const taskPath = join(input.developmentDirectory, input.lockTask.taskPath);
  const outputRelative = `first-run-artifacts/${input.lockTask.taskId}`;
  const outputDirectory = join(input.developmentDirectory, outputRelative);
  const taskBytes = await readFile(taskPath);
  const rowBase = {
    schemaVersion: "skill-family-current-v2-n10-task-first-run/v1" as const,
    identity: IDENTITY,
    exposure: "development" as const,
    taskId: input.lockTask.taskId,
    sourceInputId: input.lockTask.sourceInputId,
    provider: input.lockSource.provider,
    mappingRepository: input.lockTask.mapping.repository,
    taskSha256: sha(taskBytes),
    sourceSha256: input.lockSource.lockedCopy.sha256,
    engineCodeCommit: input.engineCodeCommit,
    expectedTaskComplete: input.lockTask.expected.taskComplete,
    expectedResidualOracle: input.lockTask.expected.residualOracle,
    modificationCount: 0,
  };
  const firstStarted = performance.now();
  try {
    const run = await runApiTask({ taskPath, outputDirectory });
    const firstDurationMs = Number((performance.now() - firstStarted).toFixed(3));
    const packageBytes = await readFile(join(outputDirectory, "task-package.json"));
    const artifact = JSON.parse(packageBytes.toString("utf8"));
    const bundleCheck = await hashBundleFiles(outputDirectory);
    const repeatRoot = await mkdtemp(join(tmpdir(), `skvm-n10-repeat-${input.lockTask.taskId}-`));
    let repeat: Record<string, any>;
    try {
      const repeatStarted = performance.now();
      const repeatRun = await runApiTask({ taskPath, outputDirectory: join(repeatRoot, "out") });
      const repeatDurationMs = Number((performance.now() - repeatStarted).toFixed(3));
      const repeatPackage = await readFile(join(repeatRoot, "out", "task-package.json"));
      repeat = {
        status: repeatRun.status,
        durationMs: repeatDurationMs,
        cacheDeclared: false,
        cacheHit: false,
        taskPackageSha256: sha(repeatPackage),
        semanticPackageMatches: sha(repeatPackage) === sha(packageBytes),
      };
    } catch (error) {
      repeat = {
        status: "failed",
        durationMs: null,
        cacheDeclared: false,
        cacheHit: false,
        taskPackageSha256: null,
        semanticPackageMatches: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await rm(repeatRoot, { recursive: true, force: true });
    }
    const nativeExecuted = Number((run.consumer as any)?.junit?.executed ?? 0);
    return {
      ...rowBase,
      runStatus: run.status,
      taskComplete: run.taskComplete,
      expectationMatches: run.taskComplete === input.lockTask.expected.taskComplete,
      packageCheck: run.packageCheck.status as "pass" | "fail",
      bundleCheck,
      backend: run.backend,
      consumer: run.consumer,
      firstBuild: { durationMs: firstDurationMs, outputPath: outputRelative, taskPackageSha256: sha(packageBytes) },
      repeat,
      semanticPlanSha256: artifact.plan.semanticPlanSha256,
      backendSha256: artifact.bindings.backendSha256,
      required: readN10RequiredCompletionCounts(artifact),
      obligationResults: artifact.obligationResults,
      sourceClosureSummary: artifact.sourceClosure.summary,
      nativeExecuted,
      accounting: run.accounting,
      error: null,
    };
  } catch (error) {
    return {
      ...rowBase,
      runStatus: "engine-error",
      taskComplete: false,
      expectationMatches: false === input.lockTask.expected.taskComplete,
      packageCheck: "not-produced" as const,
      bundleCheck: { status: "fail", errors: ["BUNDLE_NOT_PRODUCED"], manifestSha256: null },
      backend: null,
      consumer: { status: "not-executed", reason: "engine error before a verified package was emitted" },
      firstBuild: { durationMs: Number((performance.now() - firstStarted).toFixed(3)), outputPath: null, taskPackageSha256: null },
      repeat: { status: "not-run-after-first-error", durationMs: null, cacheDeclared: false, cacheHit: false,
        taskPackageSha256: null, semanticPackageMatches: null },
      semanticPlanSha256: null,
      backendSha256: null,
      required: emptyRequiredCounts(),
      obligationResults: [],
      sourceClosureSummary: null,
      nativeExecuted: 0,
      accounting: { loopbackHttpCalls: 0, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function normalizePersistedFirstRunRow(row: Record<string, any>, developmentDirectory: string) {
  if (row.required !== undefined) return row;
  if (row.runStatus !== "completed" || typeof row.firstBuild?.outputPath !== "string") {
    return { ...row, required: emptyRequiredCounts(), aggregationRecovery: "missing counts defaulted only for a non-completed row" };
  }
  const packageBytes = await readFile(join(developmentDirectory, row.firstBuild.outputPath, "task-package.json"));
  if (sha(packageBytes) !== row.firstBuild.taskPackageSha256) {
    throw new Error(`N10 persisted package changed during aggregation recovery: ${row.taskId}`);
  }
  const artifact = JSON.parse(packageBytes.toString("utf8"));
  let required: N10FirstRunSummaryRow["required"];
  try {
    required = readN10RequiredCompletionCounts(artifact);
  } catch {
    throw new Error(`N10 persisted package lacks required completion counts: ${row.taskId}`);
  }
  return {
    ...row,
    required,
    aggregationRecovery: "derived completion.required from the digest-bound original task package; task was not rerun",
  };
}

function firstRunComparison(lockRelation: Record<string, any>, rows: Array<Record<string, any>>) {
  const left = rows.find((row) => row.taskId === lockRelation.leftTaskId);
  const right = rows.find((row) => row.taskId === lockRelation.rightTaskId);
  const planDifferent = !!left?.semanticPlanSha256 && !!right?.semanticPlanSha256
    && left.semanticPlanSha256 !== right.semanticPlanSha256;
  const artifactDifferent = !!left?.firstBuild.taskPackageSha256 && !!right?.firstBuild.taskPackageSha256
    && left.firstBuild.taskPackageSha256 !== right.firstBuild.taskPackageSha256;
  const bothTaskComplete = left?.taskComplete === true && right?.taskComplete === true;
  return {
    ...lockRelation,
    actual: { planDifferent, artifactDifferent, bothTaskComplete },
    passed: planDifferent && artifactDifferent && bothTaskComplete,
  };
}

export type N10FirstRunReport = {
  schemaVersion: "skill-family-current-v2-n10-first-run/v1";
  identity: typeof IDENTITY;
  exposure: "development";
  executedAt: string;
  bindings: Record<string, any>;
  summary: ReturnType<typeof summarizeN10FirstRunRows>;
  tasks: Array<Record<string, any>>;
  comparisons: Array<Record<string, any>>;
  sourceCoverage: Array<Record<string, any>>;
  legacyV2AdmissionSummary: Record<string, number>;
  reusedN5Evidence: Record<string, any>;
  methodGate: { conditions: Record<string, boolean>; decision: "passed" | "method-not-ready" };
  accounting: { sourceApiCalls: number; businessApiCalls: number; modelCalls: number; paidCalls: number; nativeLoopbackHttpCalls: number };
  claimLimits: string[];
};

export async function writeN10FirstRunFromDevelopmentPanel(options: {
  repositoryRoot: string;
  developmentDirectory: string;
  lockCommit: string;
  baselineCommit: string;
  engineCodeCommit: string;
  executedAt: string;
}): Promise<{ report: N10FirstRunReport; file: { path: string; sha256: string; bytes: number } }> {
  const [panelCheck, baselineCheck] = await Promise.all([
    verifyN10DevelopmentPanel(options),
    verifyN10Baseline(options),
  ]);
  if (panelCheck.status !== "pass" || baselineCheck.status !== "pass") {
    throw new Error(`N10 first run prerequisites failed: ${[...panelCheck.errors, ...baselineCheck.errors].join("; ")}`);
  }
  for (const commit of [options.lockCommit, options.baselineCommit, options.engineCodeCommit]) {
    if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error("N10 first-run commit binding must be a full Git SHA");
  }
  const lockBytes = await readFile(join(options.developmentDirectory, "input-lock.json"));
  const baselineBytes = await readFile(join(options.developmentDirectory, "baseline.json"));
  const lock = JSON.parse(lockBytes.toString("utf8")) as N10DevelopmentLock;
  const rowsDirectory = join(options.developmentDirectory, "first-run-rows");
  await mkdir(rowsDirectory, { recursive: true });
  const taskRows: Array<Record<string, any>> = [];
  for (const lockTask of lock.tasks) {
    const rowPath = join(rowsDirectory, `${lockTask.taskId}.json`);
    let row: Record<string, any>;
    try {
      row = JSON.parse(await readFile(rowPath, "utf8"));
      if (row.taskSha256 !== lockTask.taskSha256 || row.engineCodeCommit !== options.engineCodeCommit) {
        throw new Error(`N10 persisted first-run row binding mismatch: ${lockTask.taskId}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("N10 persisted")) throw error;
      const lockSource = lock.sources.find((source) => source.inputId === lockTask.sourceInputId)!;
      row = await executeN10TaskFirstRun({ developmentDirectory: options.developmentDirectory, lockTask, lockSource, engineCodeCommit: options.engineCodeCommit });
      await writeFile(rowPath, `${JSON.stringify(row, null, 2)}\n`, { flag: "wx" });
    }
    const rowBytes = await readFile(rowPath);
    const normalized = await normalizePersistedFirstRunRow(row, options.developmentDirectory);
    taskRows.push({ rowFile: `first-run-rows/${lockTask.taskId}.json`, rowSha256: sha(rowBytes), ...normalized });
  }

  const sourceCoverage: N10FirstRunReport["sourceCoverage"] = [];
  const legacyCounts = { accepted: 0, rejected: 0, unresolved: 0 };
  for (const source of lock.sources) {
    const sourceText = await readFile(join(options.developmentDirectory, source.lockedCopy.path), "utf8");
    const parsed = parseApiTesterOperationSource(sourceText, source.original.format);
    if (!parsed.document || !parsed.enumeration.complete) throw new Error(`N10 first-run source enumeration failed: ${source.inputId}`);
    const admissions = parsed.enumeration.operations.map((operation) => analyzeApiTesterOperation({ document: parsed.document!, operation }));
    const consistency = verifyApiTesterOperationAdmissionConsistency(admissions);
    if (consistency.status !== "pass") throw new Error(`N10 legacy admission consistency failed: ${source.inputId}: ${consistency.errors.join("; ")}`);
    for (const admission of admissions) legacyCounts[admission.status] += 1;
    const taskSelection = lock.tasks.filter((task) => task.sourceInputId === source.inputId);
    sourceCoverage.push({
      inputId: source.inputId,
      provider: source.provider,
      operationDenominator: source.enumeration.operationCount,
      enumerationComplete: true,
      legacyV2AdmissionCheck: consistency,
      operations: source.enumeration.operations.map((operation: any) => {
        const selectedTasks = taskSelection.filter((task) => task.denominator.operationKeys.includes(operation.key));
        return {
          operationKey: operation.key,
          locator: operation.locator,
          selectedTaskIds: selectedTasks.map((task) => task.taskId),
          richTaskStatus: selectedTasks.length ? selectedTasks.map((task) => {
            const result = taskRows.find((row) => row.taskId === task.taskId)!;
            return { taskId: task.taskId, taskComplete: result.taskComplete, runStatus: result.runStatus };
          }) : [{ status: "not-assessed-by-locked-task" }],
          legacyV2Admission: (() => {
            const result = admissions.find((admission) => admission.operationKey === operation.key)!;
            return { status: result.status, findings: result.findings, firstObservedRejection: result.firstObservedRejection };
          })(),
        };
      }),
    });
  }

  const comparisons = lock.comparisons.map((relation) => firstRunComparison(relation, taskRows));
  const summaryRows: N10FirstRunSummaryRow[] = taskRows.map((row) => ({
    taskId: row.taskId,
    provider: row.provider,
    taskComplete: row.taskComplete,
    expectedTaskComplete: row.expectedTaskComplete,
    packageCheck: row.packageCheck,
    required: row.required,
    nativeExecuted: row.nativeExecuted,
    modificationCount: row.modificationCount,
  }));
  const summary = summarizeN10FirstRunRows({
    uniqueInputs: lock.summary.uniqueInputs,
    providers: lock.summary.providers,
    operationDenominator: lock.summary.operationDenominator,
    comparisonTotal: comparisons.length,
    comparisonPassed: comparisons.filter((relation) => relation.passed).length,
    rows: summaryRows,
  });
  const n5Relative = `results/skill-ir/${IDENTITY}/integration/consumer-report.json`;
  const n5Bytes = await readFile(join(options.repositoryRoot, n5Relative));
  const n5 = JSON.parse(n5Bytes.toString("utf8"));
  const reusedN5Evidence = {
    path: n5Relative,
    sha256: sha(n5Bytes),
    decision: n5.decision,
    nativeLoopbackHttpCalls: n5.accounting.loopbackHttpCalls,
    nativeExecuted: n5.fixtures.reduce((total: number, fixture: any) => total + fixture.junit.executed, 0),
    nativePassed: n5.fixtures.reduce((total: number, fixture: any) => total + fixture.junit.passed, 0),
    faults: n5.faultInjection.summary,
    reusedWithoutRerun: true,
  };
  const accounting = taskRows.reduce<N10FirstRunReport["accounting"]>((total, row) => ({
    sourceApiCalls: total.sourceApiCalls,
    businessApiCalls: total.businessApiCalls + Number(row.accounting.remoteHttpCalls ?? 0),
    modelCalls: total.modelCalls + Number(row.accounting.projectModelCalls ?? 0),
    paidCalls: total.paidCalls + Number(row.accounting.paidCalls ?? 0),
    nativeLoopbackHttpCalls: total.nativeLoopbackHttpCalls + Number(row.accounting.loopbackHttpCalls ?? 0),
  }), { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 });
  const conditions = {
    fixedPanelIntegrity: panelCheck.status === "pass" && baselineCheck.status === "pass",
    everyTaskRowRetained: taskRows.length === lock.tasks.length,
    everyPackageChecked: summary.packageChecksPassed === lock.tasks.length,
    expectedOutcomesMatch: summary.expectedOutcomeMismatches === 0,
    twoRealDemandChangesPass: summary.comparisonsPassed >= 2,
    threeProvidersHaveCompleteTasks: summary.completeProviders >= 3,
    repeatedBuildsSemanticallyMatch: taskRows.every((row) => row.repeat.semanticPackageMatches === true),
    nativeFixtureEvidencePasses: reusedN5Evidence.decision === "passed" && reusedN5Evidence.nativeExecuted >= 4,
    eightAssignedFaultsDetected: reusedN5Evidence.faults.injected === 8
      && reusedN5Evidence.faults.correctlyDetected === 8 && reusedN5Evidence.faults.missed === 0,
    noProjectModelCalls: accounting.modelCalls === 0,
  };
  const methodGate = {
    conditions,
    decision: Object.values(conditions).every(Boolean) ? "passed" as const : "method-not-ready" as const,
  };
  const report: N10FirstRunReport = {
    schemaVersion: "skill-family-current-v2-n10-first-run/v1",
    identity: IDENTITY,
    exposure: "development",
    executedAt: options.executedAt,
    bindings: {
      inputLock: { path: "input-lock.json", sha256: sha(lockBytes), commit: options.lockCommit },
      baseline: { path: "baseline.json", sha256: sha(baselineBytes), commit: options.baselineCommit },
      engineCodeCommit: options.engineCodeCommit,
      supportProfile: "development-rich-task/v1",
    },
    summary,
    tasks: taskRows,
    comparisons,
    sourceCoverage,
    legacyV2AdmissionSummary: legacyCounts,
    reusedN5Evidence,
    methodGate,
    accounting,
    claimLimits: [
      "real-input tasks are development-exposed and are not prospective evidence",
      "task-selected completion is not whole-document or live API behavior completion",
      "legacy production-v2 admission is a separate full-operation comparison and does not define rich-task success",
      "N5 native fixtures and fault detections are reused evidence and are not real API calls",
      "one-machine first/repeat timings do not establish a general performance claim",
      "historical document-level 0/6 and readiness remain unchanged",
    ],
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const relativePath = "first-run.json";
  await writeFile(join(options.developmentDirectory, relativePath), text, { flag: "wx" });
  return { report, file: { path: relativePath, sha256: sha(text), bytes: Buffer.byteLength(text) } };
}

export async function verifyN10FirstRun(options: {
  repositoryRoot: string;
  developmentDirectory: string;
}): Promise<{ status: "pass" | "fail"; errors: string[] }> {
  const errors = new Set<string>();
  const [panel, baseline] = await Promise.all([verifyN10DevelopmentPanel(options), verifyN10Baseline(options)]);
  for (const error of panel.errors) errors.add(`PANEL:${error}`);
  for (const error of baseline.errors) errors.add(`BASELINE:${error}`);
  let lock: N10DevelopmentLock, report: N10FirstRunReport;
  try {
    lock = JSON.parse(await readFile(join(options.developmentDirectory, "input-lock.json"), "utf8"));
    report = JSON.parse(await readFile(join(options.developmentDirectory, "first-run.json"), "utf8"));
  } catch {
    return { status: "fail", errors: ["FIRST_RUN_OR_LOCK_UNREADABLE"] };
  }
  const lockBytes = await readFile(join(options.developmentDirectory, "input-lock.json"));
  const baselineBytes = await readFile(join(options.developmentDirectory, "baseline.json"));
  if (report.schemaVersion !== "skill-family-current-v2-n10-first-run/v1" || report.identity !== IDENTITY
    || report.exposure !== "development") errors.add("FIRST_RUN_HEADER_INVALID");
  if (report.bindings.inputLock.sha256 !== sha(lockBytes) || report.bindings.baseline.sha256 !== sha(baselineBytes)) {
    errors.add("FIRST_RUN_INPUT_BINDING_MISMATCH");
  }
  if (stable(report.tasks.map((row) => row.taskId).sort()) !== stable(lock.tasks.map((row) => row.taskId).sort())) {
    errors.add("FIRST_RUN_TASK_SET_MISMATCH");
  }
  for (const row of report.tasks) {
    try {
      const bytes = await readFile(join(options.developmentDirectory, row.rowFile));
      const standalone = await normalizePersistedFirstRunRow(JSON.parse(bytes.toString("utf8")), options.developmentDirectory);
      const embedded = structuredClone(row);
      delete embedded.rowFile;
      delete embedded.rowSha256;
      if (sha(bytes) !== row.rowSha256 || stable(standalone) !== stable(embedded)) errors.add(`FIRST_RUN_ROW_MISMATCH:${row.taskId}`);
      if (row.runStatus === "completed") {
        const bundle = await hashBundleFiles(join(options.developmentDirectory, row.firstBuild.outputPath));
        if (bundle.status !== "pass" || bundle.manifestSha256 !== row.bundleCheck.manifestSha256) {
          errors.add(`FIRST_RUN_BUNDLE_MISMATCH:${row.taskId}`);
        }
      }
    } catch {
      errors.add(`FIRST_RUN_ROW_UNREADABLE:${row.taskId}`);
    }
  }
  const operationCount = report.sourceCoverage.reduce((total, source) => total + source.operations.length, 0);
  if (operationCount !== lock.summary.operationDenominator
    || report.sourceCoverage.some((source) => source.operations.length !== source.operationDenominator)) {
    errors.add("FIRST_RUN_OPERATION_COVERAGE_MISMATCH");
  }
  const comparisons = lock.comparisons.map((relation) => firstRunComparison(relation, report.tasks));
  if (stable(comparisons) !== stable(report.comparisons)) errors.add("FIRST_RUN_COMPARISON_MISMATCH");
  const summaryRows: N10FirstRunSummaryRow[] = report.tasks.map((row) => ({
    taskId: row.taskId, provider: row.provider, taskComplete: row.taskComplete,
    expectedTaskComplete: row.expectedTaskComplete, packageCheck: row.packageCheck,
    required: row.required, nativeExecuted: row.nativeExecuted, modificationCount: row.modificationCount,
  }));
  const summary = summarizeN10FirstRunRows({
    uniqueInputs: lock.summary.uniqueInputs,
    providers: lock.summary.providers,
    operationDenominator: lock.summary.operationDenominator,
    comparisonTotal: comparisons.length,
    comparisonPassed: comparisons.filter((relation) => relation.passed).length,
    rows: summaryRows,
  });
  if (stable(summary) !== stable(report.summary)) errors.add("FIRST_RUN_SUMMARY_MISMATCH");
  const conditions = report.methodGate.conditions;
  const expectedDecision = Object.values(conditions).every(Boolean) ? "passed" : "method-not-ready";
  if (report.methodGate.decision !== expectedDecision) errors.add("FIRST_RUN_METHOD_GATE_MISMATCH");
  if (Object.values(report.accounting).some((value) => value !== 0)) errors.add("FIRST_RUN_ACCOUNTING_NONZERO");
  return { status: errors.size === 0 ? "pass" : "fail", errors: [...errors].sort() };
}
