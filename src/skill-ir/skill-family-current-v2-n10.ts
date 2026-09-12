import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseApiTaskContract, type ApiTaskContract } from "./api-task-contract";
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
