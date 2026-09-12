import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ApiTaskContract, ApiTaskObligationKind, ApiTaskOutput } from "./api-task-contract";
import { buildApiTaskPlan } from "./api-task-plan";
import { verifyApiTaskPlan } from "./api-task-plan-checker";
import { parseApiTesterOperationSource } from "./api-tester-operation-source";

const IDENTITY = "skill-family-current-v2-source-repair-001";
const RESULT_ROOT = `results/skill-ir/${IDENTITY}`;
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

const MODULE_GAPS = [
  { component: "api-task-contract", category: "new-capability", status: "implemented-and-connected-in-n2", files: ["src/skill-ir/api-task-contract.ts"] },
  { component: "api-task-plan", category: "new-capability", status: "implemented-and-connected-in-n2", files: ["src/skill-ir/api-task-plan.ts", "src/skill-ir/api-task-plan-checker.ts"] },
  { component: "schema-witness-and-checker", category: "implemented-not-connected", status: "available-for-n5-adapter", files: ["src/skill-ir/api-schema-witness.ts", "src/skill-ir/api-schema-checker.ts"] },
  { component: "request-specimens-and-checker", category: "implemented-not-connected", status: "available-for-n5-adapter", files: ["src/skill-ir/api-request-specimens.ts", "src/skill-ir/api-request-specimens-checker.ts"] },
  { component: "request-body-negatives", category: "implemented-not-connected", status: "available-but-case-selection-not-yet-task-driven", files: ["src/skill-ir/api-request-body-negatives.ts", "src/skill-ir/api-request-body-negatives-checker.ts"] },
  { component: "form-wire", category: "implemented-not-connected", status: "available-for-n5-adapter", files: ["src/skill-ir/api-form-wire.ts", "src/skill-ir/api-form-wire-checker.ts"] },
  { component: "pytest-package", category: "implemented-not-connected", status: "emitter-checker-runtime-exist-native-consumption-is-n5", files: ["src/skill-ir/api-pytest-suite.ts", "src/skill-ir/api-pytest-suite-checker.ts", "src/skill-ir/api-pytest-runtime.py", "src/skill-ir/api-pytest-oracle.ts"] },
  { component: "response-observation", category: "implemented-not-connected", status: "conditional-checker-exists-task-observation-binding-is-n5", files: ["src/skill-ir/api-response-observation.ts", "src/skill-ir/api-response-headers.ts"] },
  { component: "task-relevant-source-closure", category: "new-capability", status: "planned-for-n3", files: [] },
  { component: "origin-server-and-credentials", category: "external-oracle-missing", status: "requires-explicit-runtime-configuration", files: [] },
  { component: "live-status-and-business-behavior", category: "external-oracle-missing", status: "requires-observation-or-independent-loopback-oracle", files: [] },
  { component: "oas31-or-other-contract-dialects", category: "new-capability", status: "outside-current-oas30-profile", files: [] },
] as const;

const DEMONSTRATION_POLICIES = [
  {
    candidateId: "candidate-060",
    taskId: "source-minimal-negative",
    output: "request-json" as const,
    requirements: [
      { id: "minimal", kind: "valid-minimal" as const, obligationIndex: 0 },
      { id: "wrong-type", kind: "constraint-negative" as const, obligationIndex: 1 },
    ],
    unresolvedRequirementIds: [],
  },
  {
    candidateId: "candidate-111",
    taskId: "source-full-omission-boundary",
    output: "request-json" as const,
    requirements: [
      { id: "full", kind: "valid-full" as const, obligationIndex: 0 },
      { id: "required-omission", kind: "required-omission" as const, obligationIndex: 1 },
      { id: "out-of-range", kind: "constraint-negative" as const, obligationIndex: 2 },
    ],
    unresolvedRequirementIds: [],
  },
  {
    candidateId: "candidate-066",
    taskId: "source-pytest-fuzzing",
    output: "pytest" as const,
    requirements: [{ id: "structural-fuzzing", kind: "constraint-negative" as const, obligationIndex: 1 }],
    unresolvedRequirementIds: ["structural-fuzzing"],
  },
] as const;

function fail(message: string): never {
  throw new Error(`invalid N2 evidence: ${message}`);
}

async function boundJson(root: string, relativePath: string) {
  const bytes = await readFile(join(root, relativePath));
  return { value: JSON.parse(bytes.toString("utf8")), binding: { path: relativePath, sha256: digest(bytes), bytes: bytes.byteLength } };
}

async function fileBinding(root: string, relativePath: string) {
  const bytes = await readFile(join(root, relativePath));
  return { path: relativePath, sha256: digest(bytes), bytes: bytes.byteLength };
}

function requirement(duty: any, input: { id: string; kind: ApiTaskObligationKind }) {
  if (!duty || typeof duty.sourceLocator !== "string" || !duty.sourceLocator) fail(`missing source duty for requirement ${input.id}`);
  return {
    id: input.id,
    kind: input.kind,
    required: true,
    scope: "each-selected-operation" as const,
    sourceLocator: duty.sourceLocator,
  };
}

function task(input: {
  taskId: string;
  sourcePath: string;
  format: "json" | "yaml";
  operationKey: string;
  output: ApiTaskOutput;
  skillId: string;
  requirements: ApiTaskContract["requirements"];
  unresolvedRequirementIds: string[];
}): ApiTaskContract {
  return {
    schemaVersion: "skvm-api-task/v1",
    taskId: input.taskId,
    profile: "oas30-offline-test/v1",
    input: { path: input.sourcePath, format: input.format, dialect: "oas3.0" },
    dependencyManifest: null,
    operationKeys: [input.operationKey],
    requirements: input.requirements,
    output: input.output,
    observations: null,
    execution: { mode: "offline-validation" },
    mapping: { origin: "agent-reviewed", sourceSkill: input.skillId, unresolvedRequirementIds: input.unresolvedRequirementIds },
  };
}

export async function buildN2GapMatrixFromRepository(root: string) {
  const sourceLedger = await boundJson(root, `${RESULT_ROOT}/corpus/source-ledger.json`);
  const dutyMatrix = await boundJson(root, `${RESULT_ROOT}/corpus/duty-matrix.json`);
  const exposureLedger = await boundJson(root, `${RESULT_ROOT}/corpus/exposure-ledger.json`);
  const apiRows = exposureLedger.value.apiInputs.rows as any[];
  let selected: { row: any; text: string; operation: any } | null = null;
  for (const row of apiRows) {
    const bytes = await readFile(join(root, row.path));
    if (bytes.byteLength !== row.bytes || digest(bytes) !== row.sha256) fail(`API input digest mismatch ${row.inputId}`);
    const text = bytes.toString("utf8");
    const parsed = parseApiTesterOperationSource(text, row.format);
    const operation = parsed.enumeration.complete ? parsed.enumeration.operations.find((candidate) =>
      candidate.parameters.some((parameter) => parameter.required === true)
      && candidate.parameters.filter((parameter) => parameter.name !== null && parameter.location !== null).length >= 2) : null;
    if (operation) { selected = { row, text, operation }; break; }
  }
  if (!selected) fail("no exposed API operation has the required N2 planning witnesses");

  const memberById = new Map((dutyMatrix.value.members as any[]).map((row) => [row.candidateId, row]));
  const candidateById = new Map((dutyMatrix.value.mappingCandidates as any[]).map((row) => [row.candidateId, row]));
  const mappingRows = (dutyMatrix.value.mappingCandidates as any[]).map((candidate) => {
    const member: any = memberById.get(candidate.candidateId);
    if (!member) fail(`missing duty member ${candidate.candidateId}`);
    const duties = candidate.obligationIds.map((id: string) => member.duties.find((duty: any) => duty.obligationId === id));
    if (duties.some((duty: any) => !duty)) fail(`mapping duty disappeared ${candidate.candidateId}`);
    return {
      candidateId: candidate.candidateId,
      skillId: candidate.skillId,
      repository: candidate.repository,
      parentScope: "complete archived member duty inventory",
      selectedDutyCount: duties.length,
      selectedDuties: duties.map((duty: any) => ({
        obligationId: duty.obligationId,
        key: duty.key,
        text: duty.text,
        sourceLocator: duty.sourceLocator,
        priorRole: duty.role,
      })),
      residualDutyCount: member.duties.length - duties.length,
      residualDutiesPreserved: true,
      mappingOrigin: candidate.mappingOrigin,
      reviewStatus: candidate.reviewStatus,
      wholeSkillComplete: false,
    };
  });

  const supportedOutputs: ApiTaskOutput[] = ["request-json", "pytest"];
  const demonstrations = DEMONSTRATION_POLICIES.map((policy) => {
    const candidate: any = candidateById.get(policy.candidateId);
    const member: any = memberById.get(policy.candidateId);
    if (!candidate || !member) fail(`missing demonstration mapping ${policy.candidateId}`);
    const duties = policy.requirements.map(({ obligationIndex }) => {
      const obligationId = candidate.obligationIds[obligationIndex];
      return member.duties.find((duty: any) => duty.obligationId === obligationId);
    });
    const contract = task({
      taskId: policy.taskId,
      sourcePath: selected!.row.path,
      format: selected!.row.format,
      operationKey: selected!.operation.key,
      output: policy.output,
      skillId: candidate.skillId,
      requirements: policy.requirements.map((row, index) => requirement(duties[index], { id: row.id, kind: row.kind })),
      unresolvedRequirementIds: [...policy.unresolvedRequirementIds],
    });
    const plan = buildApiTaskPlan(contract, selected!.text, { sourceRepository: candidate.repository, supportedOutputs });
    const verification = verifyApiTaskPlan(contract, selected!.text, plan, { supportedOutputs });
    if (verification.status !== "pass") fail(`plan verification failed ${policy.taskId}: ${verification.errors.join(", ")}`);
    return { task: contract, plan, verification };
  });

  const first = demonstrations[0]!;
  const outputVariantTask: ApiTaskContract = { ...first.task, taskId: "output-variant", output: "pytest" };
  const outputVariant = buildApiTaskPlan(outputVariantTask, selected.text, {
    sourceRepository: first.plan.provenance.sourceRepository,
    supportedOutputs,
  });
  const renamedTask: ApiTaskContract = {
    ...first.task,
    taskId: "renamed-provenance",
    mapping: { ...first.task.mapping, sourceSkill: "renamed/member:SKILL.md" },
  };
  const renamed = buildApiTaskPlan(renamedTask, selected.text, { sourceRepository: "renamed/repository", supportedOutputs });

  const gapRows = [];
  for (const row of MODULE_GAPS) {
    gapRows.push({
      component: row.component,
      category: row.category,
      status: row.status,
      files: await Promise.all(row.files.map((path) => fileBinding(root, path))),
    });
  }
  const summary: Record<string, number> = {
    "implemented-not-connected": 0,
    "correctness-bug": 0,
    "new-capability": 0,
    "external-oracle-missing": 0,
  };
  for (const row of gapRows) summary[row.category] = (summary[row.category] ?? 0) + 1;

  return {
    schemaVersion: "skill-family-current-v2-gap-matrix/v1",
    identity: IDENTITY,
    phase: "development",
    inputs: {
      sourceLedger: sourceLedger.binding,
      dutyMatrix: dutyMatrix.binding,
      exposureLedger: exposureLedger.binding,
      selectedApiInput: { inputId: selected.row.inputId, provider: selected.row.provider, path: selected.row.path, sha256: selected.row.sha256 },
      selectedOperation: selected.operation.key,
    },
    inputSnapshot: {
      skillBodies: sourceLedger.value.summary.bodies,
      repositoryOrigins: sourceLedger.value.summary.repositoryOrigins,
      apiDocuments: exposureLedger.value.apiInputs.summary.documents,
      apiProviders: exposureLedger.value.apiInputs.summary.providers,
    },
    mappingReview: { sourceSkills: new Set(mappingRows.map(({ skillId }) => skillId)).size, rows: mappingRows },
    demonstrations,
    relations: {
      requirementChangeChangesPlan: demonstrations[0]!.plan.semanticPlanSha256 !== demonstrations[1]!.plan.semanticPlanSha256,
      outputChangeChangesPlan: first.plan.semanticPlanSha256 !== outputVariant.semanticPlanSha256,
      memberAndRepositoryRenamePreservesSemantics: first.plan.semanticPlanSha256 === renamed.semanticPlanSha256,
      outputVariant: { task: outputVariantTask, semanticPlanSha256: outputVariant.semanticPlanSha256 },
      renamedVariant: { task: renamedTask, sourceRepository: "renamed/repository", semanticPlanSha256: renamed.semanticPlanSha256 },
    },
    gaps: { summary, rows: gapRows },
    boundaries: {
      mappingAuthority: "agent-reviewed-existing-ledger; natural-language correctness is not independently human-validated",
      sourceValidity: "aggregator bytes and declared OpenAPI constraints only; live API behavior is not verified",
      output: "N2 plans output obligations; package construction and native consumption remain N5/N8",
      wholeSkillComplete: false,
    },
    protectedReads: { heldOut: 0, q1Reserved: 0, prospective: 0 },
    accounting: { sourceApiCalls: 0, businessApiCalls: 0, modelCalls: 0, paidCalls: 0, nativeLoopbackHttpCalls: 0 },
  };
}

async function writeOnceOrVerify(path: string, value: unknown): Promise<"written" | "reused"> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(path, text, { flag: "wx" });
    return "written";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== text) fail(`existing evidence differs at ${path}`);
    return "reused";
  }
}

export async function writeN2GapMatrixFromRepository(root: string) {
  const report = await buildN2GapMatrixFromRepository(root);
  const directory = join(root, RESULT_ROOT, "baseline");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "gap-matrix.json");
  const state = await writeOnceOrVerify(path, report);
  const bytes = await readFile(path);
  return { report, file: { path: `${RESULT_ROOT}/baseline/gap-matrix.json`, sha256: digest(bytes), bytes: bytes.byteLength, state } };
}
