import { isDeepStrictEqual } from "node:util";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
  REVIEWED_AOT_EFFICIENCY_FREEZE_PATH,
  REVIEWED_AOT_EFFICIENCY_POLICY_PATH,
  ReviewedAotEfficiencyPolicySchema,
  ReviewedAotEfficiencyRowSchema,
  validateReviewedAotEfficiencyFreeze,
  validateReviewedAotEfficiencyPolicy,
} from "./reviewed-aot-efficiency-matrix";
import { ResilientQualificationReportSchema } from "./reviewed-aot-efficiency-resilient";
import { sha256Bytes } from "./source-fixture";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafePathSchema = z.string().min(1).max(300).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
const FrozenFileSchema = z.object({ path: SafePathSchema, sha256: Sha256Schema }).strict();

export const RESILIENT_EFFICIENCY_QUALIFICATION_PATH =
  "results/skill-ir/reviewed-aot-efficiency-resilience-qualification-v1.json";
export const RESILIENT_EFFICIENCY_POLICY_PATH =
  "benchmarks/skill-ir/pilots/env-manager/reviewed-aot-efficiency-matrix-resilient-v1.json";
export const RESILIENT_EFFICIENCY_FREEZE_PATH =
  "results/skill-ir/reviewed-aot-efficiency-matrix-resilient-freeze-v1.json";
export const RESILIENT_EFFICIENCY_INTERRUPTION_PATH =
  "results/skill-ir/reviewed-aot-efficiency-interruption-v1.json";

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient-run.ts",
  "src/benchmarks/skill-ir/reviewed-aot-efficiency-resilient-policy.ts",
] as const;

const PredecessorSchema = z.object({
  policy: FrozenFileSchema,
  freeze: FrozenFileSchema,
  interruption: FrozenFileSchema,
  rowReuse: z.literal(false),
}).strict();

const DenominatorSchema = z.object({
  rows: z.literal(8),
  pairs: z.literal(4),
  paidOriginalRows: z.literal(4),
  deterministicReviewedAotRows: z.literal(4),
  taskIds: z.tuple([
    z.literal("env-manager-scorer-authority-node-dev-001"),
    z.literal("env-manager-scorer-authority-vite-dev-002"),
  ]),
  repetitions: z.literal(2),
  systems: z.tuple([z.literal("original"), z.literal("reviewed-aot")]),
  order: z.literal("task-then-repetition-then-system"),
  retries: z.literal(0),
  forwardOnly: z.literal(true),
  orderedRows: z.array(ReviewedAotEfficiencyRowSchema).length(8),
  startingPrefixRows: z.literal(0),
}).strict().superRefine((denominator, context) => {
  const expected = denominator.taskIds.flatMap((taskId) => [1, 2].flatMap((repetition) => [
    { taskId, repetition, system: "original", paid: true },
    { taskId, repetition, system: "reviewed-aot", paid: false },
  ]));
  if (!isDeepStrictEqual(denominator.orderedRows, expected)) {
    context.addIssue({ code: "custom", message: "resilient denominator row order drift" });
  }
});

export const ResilientEfficiencyPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-resilient-policy/v1"),
  experimentId: z.literal("env-manager-reviewed-aot-efficiency-v2"),
  frozenAt: z.string().datetime({ offset: true }),
  predecessor: PredecessorSchema,
  resilienceQualification: FrozenFileSchema,
  implementation: z.array(FrozenFileSchema).length(IMPLEMENTATION_PATHS.length),
  denominator: DenominatorSchema,
  productionOneTime: z.object({
    compileModelTokens: z.literal(9358),
    profileModelTokens: z.literal(0),
    packageModelTokens: z.literal(0),
    missing: z.tuple([]),
  }).strict(),
  recovery: z.object({
    executionOwner: z.literal("single-detached-worker"),
    controllerRole: z.literal("validate-start-observe-collect"),
    journalOrder: z.tuple([
      z.literal("prepared"), z.literal("dispatched"),
      z.literal("terminal-record"), z.literal("prefix-committed"),
    ]),
    redispatchAfterDispatched: z.literal(false),
    recoverableInterruption: z.literal("foreground-controller-or-desktop-parent-only"),
    missingTerminalAfterDispatch: z.literal("fail-closed"),
  }).strict(),
  authorization: z.object({
    currentStagePaidCalls: z.literal(0),
    futurePaidOriginalCalls: z.literal(4),
    retries: z.literal(0),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("v1-row-reuse"),
    z.literal("v1-orphan-backfill"),
    z.literal("retry-or-reserve"),
    z.literal("post-hoc-row-selection"),
    z.literal("held-out"),
  ]),
  claimBoundary: z.literal("This successor authorizes one fresh eight-row reviewed-AOT efficiency denominator. It does not recover or reuse v1 rows and does not establish quality, break-even, readiness, or automation before machine-derived results."),
}).strict();
export type ResilientEfficiencyPolicy = z.infer<typeof ResilientEfficiencyPolicySchema>;

export const ResilientEfficiencyFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-reviewed-aot-efficiency-resilient-freeze/v1"),
  freezeId: z.literal("env-reviewed-aot-efficiency-resilient-identity-v1"),
  status: z.literal("passed"),
  policy: FrozenFileSchema,
  predecessor: PredecessorSchema,
  resilienceQualification: FrozenFileSchema,
  implementation: z.array(FrozenFileSchema).length(IMPLEMENTATION_PATHS.length),
  plan: DenominatorSchema,
  accounting: z.object({
    currentStagePaidCalls: z.literal(0),
    matrixExecuted: z.literal(false),
    retries: z.literal(0),
  }).strict(),
  authorizations: z.object({
    paidMatrix: z.literal(true),
    heldOut: z.literal(false),
    efficiencyClaim: z.literal(false),
  }).strict(),
  claimBoundary: z.literal("The zero-paid freeze binds the fresh resilient eight-row identity and authorizes one detached execution. It is not a quality, cost, or efficiency result."),
}).strict();
export type ResilientEfficiencyFreeze = z.infer<typeof ResilientEfficiencyFreezeSchema>;

function contained(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`resilient authority path escapes root: ${path}`);
  return candidate;
}

async function frozen(rootDir: string, path: string) {
  const absolute = contained(rootDir, path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`resilient authority must be a regular file: ${path}`);
  return FrozenFileSchema.parse({ path, sha256: sha256Bytes(await readFile(absolute)) });
}

async function verify(rootDir: string, reference: z.infer<typeof FrozenFileSchema>): Promise<Buffer> {
  const absolute = contained(rootDir, reference.path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`resilient authority must be a regular file: ${reference.path}`);
  const bytes = await readFile(absolute);
  if (sha256Bytes(bytes) !== reference.sha256) throw new Error(`resilient authority digest mismatch for ${reference.path}`);
  return bytes;
}

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function buildResilientEfficiencyPolicy(
  rootDirInput: string,
  frozenAt: string,
): Promise<ResilientEfficiencyPolicy> {
  const rootDir = resolve(rootDirInput);
  const predecessorPolicy = ReviewedAotEfficiencyPolicySchema.parse(JSON.parse(
    await readFile(contained(rootDir, REVIEWED_AOT_EFFICIENCY_POLICY_PATH), "utf8"),
  ));
  const validated = await validateReviewedAotEfficiencyPolicy(predecessorPolicy, rootDir);
  const predecessorFreeze = JSON.parse(await readFile(contained(rootDir, REVIEWED_AOT_EFFICIENCY_FREEZE_PATH), "utf8"));
  await validateReviewedAotEfficiencyFreeze(predecessorFreeze, rootDir, predecessorPolicy);
  const qualification = ResilientQualificationReportSchema.parse(JSON.parse(
    await readFile(contained(rootDir, RESILIENT_EFFICIENCY_QUALIFICATION_PATH), "utf8"),
  ));
  const interruption = JSON.parse(await readFile(contained(rootDir, RESILIENT_EFFICIENCY_INTERRUPTION_PATH), "utf8")) as {
    status?: string; decision?: { resumeThisIdentity?: boolean; row7MayBeBackfilled?: boolean };
  };
  if (interruption.status !== "interrupted-invalid-for-efficiency"
    || interruption.decision?.resumeThisIdentity !== false
    || interruption.decision?.row7MayBeBackfilled !== false) {
    throw new Error("resilient predecessor interruption authority drift");
  }
  const implementation = await Promise.all(IMPLEMENTATION_PATHS.map((path) => frozen(rootDir, path)));
  if (!isDeepStrictEqual(qualification.implementation, implementation.slice(0, 2))) {
    throw new Error("resilient qualification implementation digest drift");
  }
  return ResilientEfficiencyPolicySchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-resilient-policy/v1",
    experimentId: "env-manager-reviewed-aot-efficiency-v2",
    frozenAt,
    predecessor: {
      policy: await frozen(rootDir, REVIEWED_AOT_EFFICIENCY_POLICY_PATH),
      freeze: await frozen(rootDir, REVIEWED_AOT_EFFICIENCY_FREEZE_PATH),
      interruption: await frozen(rootDir, RESILIENT_EFFICIENCY_INTERRUPTION_PATH),
      rowReuse: false,
    },
    resilienceQualification: await frozen(rootDir, RESILIENT_EFFICIENCY_QUALIFICATION_PATH),
    implementation,
    denominator: {
      ...validated.policy.denominator,
      orderedRows: validated.rows,
      startingPrefixRows: 0,
    },
    productionOneTime: validated.policy.productionOneTime,
    recovery: {
      executionOwner: "single-detached-worker",
      controllerRole: "validate-start-observe-collect",
      journalOrder: ["prepared", "dispatched", "terminal-record", "prefix-committed"],
      redispatchAfterDispatched: false,
      recoverableInterruption: "foreground-controller-or-desktop-parent-only",
      missingTerminalAfterDispatch: "fail-closed",
    },
    authorization: {
      currentStagePaidCalls: 0, futurePaidOriginalCalls: 4, retries: 0,
      heldOut: false, readinessPromotion: false,
    },
    prohibited: [
      "v1-row-reuse", "v1-orphan-backfill", "retry-or-reserve", "post-hoc-row-selection", "held-out",
    ],
    claimBoundary: "This successor authorizes one fresh eight-row reviewed-AOT efficiency denominator. It does not recover or reuse v1 rows and does not establish quality, break-even, readiness, or automation before machine-derived results.",
  });
}

export async function validateResilientEfficiencyPolicy(
  input: unknown,
  rootDirInput: string,
): Promise<ResilientEfficiencyPolicy> {
  const rootDir = resolve(rootDirInput);
  const policy = ResilientEfficiencyPolicySchema.parse(input);
  if (policy.predecessor.policy.path !== REVIEWED_AOT_EFFICIENCY_POLICY_PATH
    || policy.predecessor.freeze.path !== REVIEWED_AOT_EFFICIENCY_FREEZE_PATH
    || policy.predecessor.interruption.path !== RESILIENT_EFFICIENCY_INTERRUPTION_PATH
    || policy.resilienceQualification.path !== RESILIENT_EFFICIENCY_QUALIFICATION_PATH
    || !isDeepStrictEqual(policy.implementation.map((entry) => entry.path), [...IMPLEMENTATION_PATHS])) {
    throw new Error("resilient policy authority path drift");
  }
  const bytes = new Map<string, Buffer>();
  for (const reference of [
    policy.predecessor.policy, policy.predecessor.freeze, policy.predecessor.interruption,
    policy.resilienceQualification, ...policy.implementation,
  ]) bytes.set(reference.path, await verify(rootDir, reference));
  const predecessorPolicy = ReviewedAotEfficiencyPolicySchema.parse(JSON.parse(
    bytes.get(policy.predecessor.policy.path)!.toString("utf8"),
  ));
  const validated = await validateReviewedAotEfficiencyPolicy(predecessorPolicy, rootDir);
  await validateReviewedAotEfficiencyFreeze(
    JSON.parse(bytes.get(policy.predecessor.freeze.path)!.toString("utf8")), rootDir, predecessorPolicy,
  );
  const qualification = ResilientQualificationReportSchema.parse(JSON.parse(
    bytes.get(policy.resilienceQualification.path)!.toString("utf8"),
  ));
  const interruption = JSON.parse(bytes.get(policy.predecessor.interruption.path)!.toString("utf8")) as {
    status?: string; decision?: { resumeThisIdentity?: boolean; row7MayBeBackfilled?: boolean };
  };
  if (interruption.status !== "interrupted-invalid-for-efficiency"
    || interruption.decision?.resumeThisIdentity !== false
    || interruption.decision?.row7MayBeBackfilled !== false
    || !isDeepStrictEqual(qualification.implementation, policy.implementation.slice(0, 2))
    || !isDeepStrictEqual(policy.denominator, {
      ...validated.policy.denominator, orderedRows: validated.rows, startingPrefixRows: 0,
    })
    || !isDeepStrictEqual(policy.productionOneTime, validated.policy.productionOneTime)) {
    throw new Error("resilient policy semantic authority drift");
  }
  return policy;
}

export async function buildResilientEfficiencyFreeze(
  rootDirInput: string,
  policyInput: unknown,
): Promise<ResilientEfficiencyFreeze> {
  const rootDir = resolve(rootDirInput);
  const policy = await validateResilientEfficiencyPolicy(policyInput, rootDir);
  return ResilientEfficiencyFreezeSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-resilient-freeze/v1",
    freezeId: "env-reviewed-aot-efficiency-resilient-identity-v1",
    status: "passed",
    policy: await frozen(rootDir, RESILIENT_EFFICIENCY_POLICY_PATH),
    predecessor: policy.predecessor,
    resilienceQualification: policy.resilienceQualification,
    implementation: policy.implementation,
    plan: policy.denominator,
    accounting: { currentStagePaidCalls: 0, matrixExecuted: false, retries: 0 },
    authorizations: { paidMatrix: true, heldOut: false, efficiencyClaim: false },
    claimBoundary: "The zero-paid freeze binds the fresh resilient eight-row identity and authorizes one detached execution. It is not a quality, cost, or efficiency result.",
  });
}

export async function validateResilientEfficiencyFreeze(
  input: unknown,
  rootDirInput: string,
  policyInput: unknown,
): Promise<ResilientEfficiencyFreeze> {
  const rootDir = resolve(rootDirInput);
  const freeze = ResilientEfficiencyFreezeSchema.parse(input);
  const policy = await validateResilientEfficiencyPolicy(policyInput, rootDir);
  for (const reference of [freeze.policy, ...Object.values(freeze.predecessor),
    freeze.resilienceQualification, ...freeze.implementation].filter((entry): entry is z.infer<typeof FrozenFileSchema> =>
    typeof entry === "object" && entry !== null && "path" in entry)) {
    await verify(rootDir, reference);
  }
  if (freeze.policy.path !== RESILIENT_EFFICIENCY_POLICY_PATH
    || !isDeepStrictEqual(freeze.predecessor, policy.predecessor)
    || !isDeepStrictEqual(freeze.resilienceQualification, policy.resilienceQualification)
    || !isDeepStrictEqual(freeze.implementation, policy.implementation)
    || !isDeepStrictEqual(freeze.plan, policy.denominator)) {
    throw new Error("resilient freeze identity drift");
  }
  return freeze;
}

export async function writeResilientEfficiencyFreezeArtifacts(options: {
  rootDir: string;
  frozenAt: string;
}): Promise<{ policy: ResilientEfficiencyPolicy; freeze: ResilientEfficiencyFreeze }> {
  const rootDir = resolve(options.rootDir);
  const policy = await buildResilientEfficiencyPolicy(rootDir, options.frozenAt);
  await writeAtomicJson(contained(rootDir, RESILIENT_EFFICIENCY_POLICY_PATH), policy);
  const freeze = await buildResilientEfficiencyFreeze(rootDir, policy);
  await writeAtomicJson(contained(rootDir, RESILIENT_EFFICIENCY_FREEZE_PATH), freeze);
  return { policy, freeze };
}
