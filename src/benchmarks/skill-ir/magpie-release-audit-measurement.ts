import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { MagpieReleaseAuditQualificationSchema } from "./magpie-release-audit-qualification";
import {
  MAGPIE_RELEASE_AUDIT_CASE_IDS,
  buildMagpieReleaseAuditPrompt,
  loadAndValidateMagpieReleaseAuditSlice,
} from "./magpie-release-audit-step2";
import { RuntimeExecutableIdentitySchema } from "./runtime-executable-identity";
import { sha256Bytes } from "./source-fixture";

export const MAGPIE_MEASUREMENT_EXPERIMENT_ID = "magpie-release-audit-public-efficiency-executable-bound-003";
export const MAGPIE_MEASUREMENT_TASKS_PATH = "benchmarks/skill-ir/pilots/magpie-release-audit/measurement-tasks-executable-bound.json";
export const MAGPIE_MEASUREMENT_POLICY_PATH = "benchmarks/skill-ir/pilots/magpie-release-audit/measurement-policy-executable-bound.json";
export const MAGPIE_QUALIFICATION_PATH = "results/skill-ir/magpie-release-audit-public-step2-v1/qualification.json";
export const MAGPIE_EXECUTABLE_QUALIFICATION_PATH = "results/skill-ir/magpie-release-audit-executable-governance-qualification.json";
export const MAGPIE_PREDECESSOR_FAILURE_PATHS = [
  "results/skill-ir/magpie-release-audit-public-efficiency-001/infrastructure-failure.json",
  "results/skill-ir/magpie-release-audit-public-efficiency-002/infrastructure-failure.json",
] as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const FileRefSchema = z.object({
  path: z.string().min(1),
  sha256: DigestSchema,
  bytes: z.number().int().positive(),
  digestMode: z.literal("fatal-utf8-crlf-to-lf"),
}).strict();
const PromptInputSchema = z.object({ path: z.string().min(1), sha256: DigestSchema }).strict();
const RawEvidenceRefSchema = z.object({ path: z.string().min(1), sha256: DigestSchema, bytes: z.number().int().positive() }).strict();

export const MagpiePredispatchFailureSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-predispatch-failure/v1"),
  experimentId: z.literal("magpie-release-audit-public-efficiency-2026-08-31"),
  status: z.literal("failed-before-model-dispatch"),
  frozenCommit: z.literal("bc9c853"),
  policy: z.object({
    path: z.literal("benchmarks/skill-ir/pilots/magpie-release-audit/measurement-policy.json"),
    sha256: z.literal("5e3d62dfd5d6414135301dc1ce31761b8ffd761d18620e7fa62ec75c5fb3d960"),
  }).strict(),
  execution: z.object({
    phase: z.literal("failed"), completedRows: z.literal(0), dispatchCount: z.literal(1), prefixRows: z.literal(0),
    inFlightRowIndex: z.literal(0), modelProcessSpawnReached: z.literal(false), failure: z.string().min(1),
  }).strict(),
  evidence: z.object({
    plan: RawEvidenceRefSchema, state: RawEvidenceRefSchema, prefix: RawEvidenceRefSchema, row1Task: RawEvidenceRefSchema,
    observationFilePresent: z.literal(false), terminalPrefixPresent: z.literal(false),
  }).strict(),
  diagnosis: z.object({
    classification: z.literal("control-plane-path-abi-mismatch"),
    preparedPathShape: z.literal("<active-dir>/rows/row-01/workdir"),
    requiredPathShape: z.literal("<materialized-root>/run-N/workdir"),
    controlFlow: z.string().min(1), modelOrArtifactQualityEvidence: z.literal(false),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0), artifactExecutions: z.literal(0),
    retries: z.literal(0), heldOutAccesses: z.literal(0),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

export const MagpieExecutableResolutionFailureSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-predispatch-failure/v1"),
  experimentId: z.literal("magpie-release-audit-public-efficiency-2026-08-31-r2"),
  status: z.literal("failed-before-model-dispatch"),
  frozenCommit: z.literal("8beb8bc"),
  policy: z.object({
    path: z.literal("benchmarks/skill-ir/pilots/magpie-release-audit/measurement-policy-r2.json"),
    sha256: z.literal("7940683319ad49e0c01752b210d73051ffe63091eb9d373c93e7bca3bbc9f359"),
  }).strict(),
  execution: z.object({
    phase: z.literal("failed"), completedRows: z.literal(0), dispatchCount: z.literal(1), prefixRows: z.literal(0),
    inFlightRowIndex: z.literal(0), modelProcessSpawnReached: z.literal(false), failure: z.string().min(1),
  }).strict(),
  evidence: z.object({
    plan: RawEvidenceRefSchema, state: RawEvidenceRefSchema, prefix: RawEvidenceRefSchema, row1Task: RawEvidenceRefSchema,
    observationFilePresent: z.literal(false), terminalPrefixPresent: z.literal(false),
  }).strict(),
  diagnosis: z.object({
    classification: z.literal("control-plane-executable-resolution-failure"),
    commandExecutable: z.literal("bun"),
    shellResolution: z.string().min(1),
    bunWhich: z.string().min(1),
    processExecPath: z.string().min(1),
    controlFlow: z.string().min(1),
    modelOrArtifactQualityEvidence: z.literal(false),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0), artifactExecutions: z.literal(0),
    retries: z.literal(0), heldOutAccesses: z.literal(0),
  }).strict(),
  stopDecision: z.string().min(1),
  claimBoundary: z.string().min(1),
}).strict();

const ActiveTreeSummarySchema = z.object({
  fileCount: z.number().int().positive(),
  treeSha256: DigestSchema,
}).strict();

export const MagpieReleaseAuditExecutableQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-executable-qualification/v1"),
  qualifiedAt: z.string().datetime(),
  status: z.literal("passed"),
  runtime: RuntimeExecutableIdentitySchema,
  predecessors: z.object({
    failures: z.tuple([FileRefSchema, FileRefSchema]),
    reusedRows: z.literal(0),
  }).strict(),
  controlPlane: z.object({
    materializedRows: z.literal(36),
    concurrentStatusReads: z.literal(12),
    before: ActiveTreeSummarySchema,
    after: ActiveTreeSummarySchema,
    byteIdentical: z.literal(true),
  }).strict(),
  commandBinding: z.object({
    resolution: z.literal("process.execPath"),
    productionExecutableAbsolute: z.literal(true),
    literalBunInProductionCommand: z.literal(false),
  }).strict(),
  accounting: z.object({
    modelCalls: z.literal(0), apiCalls: z.literal(0), paidCalls: z.literal(0), retries: z.literal(0), heldOutAccesses: z.literal(0),
  }).strict(),
  humanMinutes: z.null(),
  claimBoundary: z.string().min(1),
}).strict();

export type MagpieReleaseAuditExecutableQualification = z.infer<typeof MagpieReleaseAuditExecutableQualificationSchema>;

export const MagpieReleaseAuditMeasurementTasksSchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-measurement-tasks/v1"),
  experimentId: z.literal(MAGPIE_MEASUREMENT_EXPERIMENT_ID),
  upstreamCommit: z.literal("453dd9f20bdebe9d4458d84682bd707be1414f80"),
  tasks: z.array(z.object({
    caseId: z.enum(MAGPIE_RELEASE_AUDIT_CASE_IDS),
    taskId: z.string().regex(/^magpie-release-audit-step-[0-2]-[a-z0-9-]+$/u),
    split: z.literal("public-development"),
    prompt: z.string().min(1),
    promptSha256: DigestSchema,
    promptInputPaths: z.array(z.string().min(1)).length(4),
    promptInputs: z.array(PromptInputSchema).length(4),
    publicReport: PromptInputSchema,
    timeoutMs: z.literal(600000),
    maxSteps: z.literal(30),
  }).strict()).length(9),
  prohibitions: z.tuple([
    z.literal("checker-oracle-in-model-prompt"),
    z.literal("expected-or-assertions-in-artifact-compiler"),
    z.literal("held-out-or-private-source-access"),
  ]),
}).strict();

export type MagpieReleaseAuditMeasurementTasks = z.infer<typeof MagpieReleaseAuditMeasurementTasksSchema>;

export const MagpieMeasurementRowSchema = z.object({
  caseId: z.enum(MAGPIE_RELEASE_AUDIT_CASE_IDS),
  repetition: z.union([z.literal(1), z.literal(2)]),
  system: z.enum(["original", "reviewed-artifact"]),
  paid: z.boolean(),
}).strict().superRefine((row, context) => {
  if (row.paid !== (row.system === "original")) context.addIssue({ code: "custom", message: "only original rows are paid" });
});

export type MagpieMeasurementRow = z.infer<typeof MagpieMeasurementRowSchema>;

export const MagpieReleaseAuditMeasurementPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-magpie-release-audit-measurement-policy/v1"),
  experimentId: z.literal(MAGPIE_MEASUREMENT_EXPERIMENT_ID),
  frozenAt: z.string().datetime(),
  timing: z.literal("after-zero-paid-nine-case-qualification-before-any-original-model-row"),
  predecessor: z.object({
    failures: z.tuple([FileRefSchema, FileRefSchema]),
    reusedRows: z.literal(0),
    successorReason: z.literal("shared-digest-bound-runtime-executable-governance"),
  }).strict(),
  digestAuthority: z.object({
    mode: z.literal("fatal-utf8-crlf-to-lf"),
    scope: z.literal("measurement-policy-file-references-only"),
    upstreamRawBlobAuthority: z.literal("unchanged-exact-bytes-in-qualification"),
  }).strict(),
  qualification: FileRefSchema,
  executableQualification: FileRefSchema,
  tasks: FileRefSchema,
  implementation: z.array(FileRefSchema).min(10),
  harness: z.object({
    adapter: z.literal("pi"), adapterVersion: z.literal("0.67.68"), adapterConfig: z.literal("managed"),
    bunVersion: z.literal("1.3.14"), executable: RuntimeExecutableIdentitySchema,
    packageJson: FileRefSchema, bunLock: FileRefSchema, piCli: FileRefSchema,
  }).strict(),
  model: z.object({
    route: z.literal("xty/gpt-5.6-sol"), family: z.literal("gpt"), providerProtocol: z.literal("openai-compatible"),
    backendModel: z.literal("gpt-5.6-sol"), temperaturePolicy: z.literal("provider-default-no-override"),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"), retries: z.literal(0), absoluteTimeoutMs: z.literal(600000),
    idleTimeoutMs: z.literal(120000), outerWatchdogMs: z.literal(660000), maxSteps: z.literal(30),
    execution: z.literal("single-foreground-serial-no-observer"), recovery: z.literal("committed-prefix-only-dispatched-without-terminal-fails-closed"),
  }).strict(),
  denominator: z.object({
    rows: z.literal(36), pairs: z.literal(18), paidOriginalRows: z.literal(18), deterministicArtifactRows: z.literal(18),
    cases: z.literal(9), repetitions: z.literal(2), systems: z.tuple([z.literal("original"), z.literal("reviewed-artifact")]),
    order: z.literal("case-then-repetition-then-system"), orderedRows: z.array(MagpieMeasurementRowSchema).length(36),
    forwardOnly: z.literal(true), rowReuse: z.literal("none-new-project-identity-from-zero"),
  }).strict(),
  costBoundary: z.object({
    productionCompileApiModelTokens: z.literal(0), productionProfileApiModelTokens: z.literal(0), productionPackageApiModelTokens: z.literal(0),
    humanReview: z.literal("not-measured-no-human-review"), humanMinutes: z.null(),
    developmentAgentTokens: z.literal("not-observable-in-project-runtime"),
    researchAllAttemptCostComplete: z.literal(false), allowedClaim: z.literal("runtime token savings and conditional explicit-API token break-even only"),
  }).strict(),
  decisionRules: z.object({
    qualityEquivalent: z.literal("all-artifact-rows-pass-and-no-pairwise-regression"),
    runtimeTokenSavings: z.literal("mean-original-input-plus-output-minus-zero-artifact-model-tokens"),
    researchEfficiencyPositive: z.literal("prohibited-because-construction-development-token-cost-is-unobservable"),
  }).strict(),
  authorization: z.object({
    currentPaidRows: z.literal(0), paidDenominatorAuthorized: z.literal(true), heldOut: z.literal(false),
    portfolioPromotion: z.literal(false), readinessPromotion: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("historical-row-reuse"), z.literal("retry-or-reserve-selection"), z.literal("post-hoc-task-or-checker-change"),
    z.literal("checker-oracle-in-prompt-or-compiler"), z.literal("held-out"), z.literal("research-efficiency-positive-claim"),
  ]),
  claimBoundary: z.string().min(1),
}).strict();

export type MagpieReleaseAuditMeasurementPolicy = z.infer<typeof MagpieReleaseAuditMeasurementPolicySchema>;

function taskId(caseId: string): string {
  return `magpie-release-audit-${caseId.replace("/case-", "-")}`;
}

export async function buildMagpieReleaseAuditMeasurementTasks(rootDir: string): Promise<MagpieReleaseAuditMeasurementTasks> {
  const slice = await loadAndValidateMagpieReleaseAuditSlice(rootDir);
  const tasks = await Promise.all(MAGPIE_RELEASE_AUDIT_CASE_IDS.map(async (caseId) => {
    const built = await buildMagpieReleaseAuditPrompt(slice, caseId);
    const report = built.inputFiles.find((file) => file.localPath.endsWith("/report.md"));
    if (!report) throw new Error(`Magpie prompt has no public report input: ${caseId}`);
    return {
      caseId,
      taskId: taskId(caseId),
      split: "public-development" as const,
      prompt: built.prompt,
      promptSha256: built.sha256,
      promptInputPaths: built.inputFiles.map((file) => file.localPath),
      promptInputs: built.inputFiles.map((file) => ({ path: file.localPath, sha256: file.sha256 })),
      publicReport: { path: report.localPath, sha256: report.sha256 },
      timeoutMs: 600000 as const,
      maxSteps: 30 as const,
    };
  }));
  return MagpieReleaseAuditMeasurementTasksSchema.parse({
    schemaVersion: "skill-ir-magpie-release-audit-measurement-tasks/v1",
    experimentId: MAGPIE_MEASUREMENT_EXPERIMENT_ID,
    upstreamCommit: "453dd9f20bdebe9d4458d84682bd707be1414f80",
    tasks,
    prohibitions: ["checker-oracle-in-model-prompt", "expected-or-assertions-in-artifact-compiler", "held-out-or-private-source-access"],
  });
}

export function buildMagpieReleaseAuditOrderedRows(): MagpieMeasurementRow[] {
  return MAGPIE_RELEASE_AUDIT_CASE_IDS.flatMap((caseId) => [1, 2].flatMap((repetition) => [
    MagpieMeasurementRowSchema.parse({ caseId, repetition, system: "original", paid: true }),
    MagpieMeasurementRowSchema.parse({ caseId, repetition, system: "reviewed-artifact", paid: false }),
  ]));
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export function canonicalizeMagpieMeasurementFreezeText(bytes: Uint8Array): Buffer {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return Buffer.from(text.replaceAll("\r\n", "\n"), "utf8");
}

export async function magpieMeasurementFrozenRef(rootDir: string, path: string) {
  const absolute = resolve(rootDir, ...path.split("/"));
  const fromRoot = relative(resolve(rootDir), absolute);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`Magpie freeze path escapes repository: ${path}`);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Magpie freeze path is not a regular file: ${path}`);
  const bytes = canonicalizeMagpieMeasurementFreezeText(await readFile(absolute));
  return { path, sha256: sha256Bytes(bytes), bytes: bytes.byteLength, digestMode: "fatal-utf8-crlf-to-lf" as const };
}

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/magpie-release-audit-step2.ts",
  "src/benchmarks/skill-ir/magpie-release-audit-checker.ts",
  "src/benchmarks/skill-ir/magpie-release-audit-artifact.ts",
  "src/benchmarks/skill-ir/magpie-release-audit-artifact-patch.ts",
  "src/benchmarks/skill-ir/magpie-release-audit-qualification.ts",
  "src/benchmarks/skill-ir/magpie-release-audit-measurement.ts",
  "src/benchmarks/skill-ir/magpie-release-audit-measurement-run.ts",
  "src/benchmarks/skill-ir/runtime-executable-identity.ts",
  "src/benchmarks/skill-ir/automatic-restricted-domain-plan.ts",
  "src/benchmarks/skill-ir/real-agent.ts",
  "src/benchmarks/skill-ir/real-agent-run.ts",
  "src/benchmarks/skill-ir/scoring.ts",
  "src/adapters/pi.ts",
  "src/core/pi-runtime.ts",
  "src/index.ts",
] as const;

export async function writeMagpieReleaseAuditMeasurementFreeze(options: { rootDir: string; frozenAt: string }) {
  const rootDir = resolve(options.rootDir);
  const qualificationPath = resolve(rootDir, MAGPIE_QUALIFICATION_PATH);
  MagpieReleaseAuditQualificationSchema.parse(JSON.parse(await readFile(qualificationPath, "utf8")));
  MagpiePredispatchFailureSchema.parse(JSON.parse(await readFile(resolve(rootDir, MAGPIE_PREDECESSOR_FAILURE_PATHS[0]), "utf8")));
  MagpieExecutableResolutionFailureSchema.parse(JSON.parse(await readFile(resolve(rootDir, MAGPIE_PREDECESSOR_FAILURE_PATHS[1]), "utf8")));
  const executableQualification = MagpieReleaseAuditExecutableQualificationSchema.parse(
    JSON.parse(await readFile(resolve(rootDir, MAGPIE_EXECUTABLE_QUALIFICATION_PATH), "utf8")),
  );
  const tasks = await buildMagpieReleaseAuditMeasurementTasks(rootDir);
  const tasksPath = resolve(rootDir, MAGPIE_MEASUREMENT_TASKS_PATH);
  await atomicJson(tasksPath, tasks);
  const policy = MagpieReleaseAuditMeasurementPolicySchema.parse({
    schemaVersion: "skill-ir-magpie-release-audit-measurement-policy/v1",
    experimentId: MAGPIE_MEASUREMENT_EXPERIMENT_ID,
    frozenAt: options.frozenAt,
    timing: "after-zero-paid-nine-case-qualification-before-any-original-model-row",
    predecessor: {
      failures: await Promise.all(MAGPIE_PREDECESSOR_FAILURE_PATHS.map((path) => magpieMeasurementFrozenRef(rootDir, path))),
      reusedRows: 0,
      successorReason: "shared-digest-bound-runtime-executable-governance",
    },
    digestAuthority: {
      mode: "fatal-utf8-crlf-to-lf",
      scope: "measurement-policy-file-references-only",
      upstreamRawBlobAuthority: "unchanged-exact-bytes-in-qualification",
    },
    qualification: await magpieMeasurementFrozenRef(rootDir, MAGPIE_QUALIFICATION_PATH),
    executableQualification: await magpieMeasurementFrozenRef(rootDir, MAGPIE_EXECUTABLE_QUALIFICATION_PATH),
    tasks: await magpieMeasurementFrozenRef(rootDir, MAGPIE_MEASUREMENT_TASKS_PATH),
    implementation: await Promise.all(IMPLEMENTATION_PATHS.map((path) => magpieMeasurementFrozenRef(rootDir, path))),
    harness: {
      adapter: "pi", adapterVersion: "0.67.68", adapterConfig: "managed", bunVersion: Bun.version,
      executable: executableQualification.runtime,
      packageJson: await magpieMeasurementFrozenRef(rootDir, "package.json"), bunLock: await magpieMeasurementFrozenRef(rootDir, "bun.lock"),
      piCli: await magpieMeasurementFrozenRef(rootDir, "node_modules/@mariozechner/pi-coding-agent/dist/cli.js"),
    },
    model: { route: "xty/gpt-5.6-sol", family: "gpt", providerProtocol: "openai-compatible", backendModel: "gpt-5.6-sol", temperaturePolicy: "provider-default-no-override" },
    runtime: {
      apiKeyEnv: "SKVM_XTY_API_KEY", retries: 0, absoluteTimeoutMs: 600000, idleTimeoutMs: 120000,
      outerWatchdogMs: 660000, maxSteps: 30, execution: "single-foreground-serial-no-observer",
      recovery: "committed-prefix-only-dispatched-without-terminal-fails-closed",
    },
    denominator: {
      rows: 36, pairs: 18, paidOriginalRows: 18, deterministicArtifactRows: 18, cases: 9, repetitions: 2,
      systems: ["original", "reviewed-artifact"], order: "case-then-repetition-then-system",
      orderedRows: buildMagpieReleaseAuditOrderedRows(), forwardOnly: true, rowReuse: "none-new-project-identity-from-zero",
    },
    costBoundary: {
      productionCompileApiModelTokens: 0, productionProfileApiModelTokens: 0, productionPackageApiModelTokens: 0,
      humanReview: "not-measured-no-human-review", humanMinutes: null, developmentAgentTokens: "not-observable-in-project-runtime",
      researchAllAttemptCostComplete: false, allowedClaim: "runtime token savings and conditional explicit-API token break-even only",
    },
    decisionRules: {
      qualityEquivalent: "all-artifact-rows-pass-and-no-pairwise-regression",
      runtimeTokenSavings: "mean-original-input-plus-output-minus-zero-artifact-model-tokens",
      researchEfficiencyPositive: "prohibited-because-construction-development-token-cost-is-unobservable",
    },
    authorization: { currentPaidRows: 0, paidDenominatorAuthorized: true, heldOut: false, portfolioPromotion: false, readinessPromotion: false },
    prohibited: ["historical-row-reuse", "retry-or-reserve-selection", "post-hoc-task-or-checker-change", "checker-oracle-in-prompt-or-compiler", "held-out", "research-efficiency-positive-claim"],
    claimBoundary: "This zero-row successor binds both pre-dispatch failures and reuses no rows. Its shared runtime executable identity is an absolute process.execPath regular-file digest with a real version smoke, and its active-tree status qualification is byte-identical. It may measure machine-checked quality and recurring model-token savings on exactly nine fixed public Step 0-2 cases with two repetitions. Development-agent tokens and human review are unmeasured, so research all-attempt cost and research efficiency-positive eligibility remain false; no live-source, portfolio, readiness, or held-out claim is authorized.",
  });
  const policyPath = resolve(rootDir, MAGPIE_MEASUREMENT_POLICY_PATH);
  await atomicJson(policyPath, policy);
  return { tasks, policy };
}

async function assertRef(rootDir: string, reference: z.infer<typeof FileRefSchema>): Promise<void> {
  const actual = await magpieMeasurementFrozenRef(rootDir, reference.path);
  if (!isDeepStrictEqual(actual, reference)) throw new Error(`Magpie frozen reference drift: ${reference.path}`);
}

export async function loadAndValidateMagpieReleaseAuditMeasurement(rootDirInput: string) {
  const rootDir = resolve(rootDirInput);
  const tasks = MagpieReleaseAuditMeasurementTasksSchema.parse(JSON.parse(await readFile(resolve(rootDir, MAGPIE_MEASUREMENT_TASKS_PATH), "utf8")));
  const policy = MagpieReleaseAuditMeasurementPolicySchema.parse(JSON.parse(await readFile(resolve(rootDir, MAGPIE_MEASUREMENT_POLICY_PATH), "utf8")));
  await Promise.all([assertRef(rootDir, policy.qualification), assertRef(rootDir, policy.executableQualification), assertRef(rootDir, policy.tasks),
    ...policy.predecessor.failures.map((reference) => assertRef(rootDir, reference)),
    ...policy.implementation.map((reference) => assertRef(rootDir, reference)),
    assertRef(rootDir, policy.harness.packageJson), assertRef(rootDir, policy.harness.bunLock), assertRef(rootDir, policy.harness.piCli)]);
  const rebuiltTasks = await buildMagpieReleaseAuditMeasurementTasks(rootDir);
  if (!isDeepStrictEqual(tasks, rebuiltTasks)) throw new Error("Magpie frozen prompt tasks drifted from public source bytes");
  if (!isDeepStrictEqual(policy.denominator.orderedRows, buildMagpieReleaseAuditOrderedRows())) throw new Error("Magpie frozen denominator row drift");
  const executableQualification = MagpieReleaseAuditExecutableQualificationSchema.parse(
    JSON.parse(await readFile(resolve(rootDir, policy.executableQualification.path), "utf8")),
  );
  if (!isDeepStrictEqual(executableQualification.runtime, policy.harness.executable)) {
    throw new Error("Magpie runtime executable qualification drift");
  }
  return { rootDir, tasks, policy };
}
