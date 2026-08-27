import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  RESILIENT_EFFICIENCY_FREEZE_PATH,
  RESILIENT_EFFICIENCY_POLICY_PATH,
  ResilientEfficiencyFreezeSchema,
  ResilientEfficiencyPolicySchema,
  validateResilientEfficiencyFreeze,
  validateResilientEfficiencyPolicy,
} from "./reviewed-aot-efficiency-resilient-policy";
import {
  READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID,
  READONLY_SERIAL_EFFICIENCY_FREEZE_PATH,
  READONLY_SERIAL_EFFICIENCY_POLICY_PATH,
  READONLY_SERIAL_IMPLEMENTATION_PATHS,
  READONLY_SERIAL_QUALIFICATION_PATH,
  RESILIENT_OBSERVATION_FAILURE_PATH,
  ReadonlySerialEfficiencyFreezeSchema,
  ReadonlySerialEfficiencyPolicySchema,
  ReadonlySerialFrozenFileSchema,
  ReadonlySerialPredecessorSchema,
  ReadonlySerialQualificationReportSchema,
  type ReadonlySerialEfficiencyFreeze,
  type ReadonlySerialEfficiencyPolicy,
} from "./reviewed-aot-efficiency-readonly-contract";
export {
  READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID,
  READONLY_SERIAL_EFFICIENCY_FREEZE_PATH,
  READONLY_SERIAL_EFFICIENCY_POLICY_PATH,
  READONLY_SERIAL_IMPLEMENTATION_PATHS,
  READONLY_SERIAL_QUALIFICATION_PATH,
  RESILIENT_OBSERVATION_FAILURE_PATH,
  ReadonlySerialEfficiencyFreezeSchema,
  ReadonlySerialEfficiencyPolicySchema,
  ReadonlySerialQualificationReportSchema,
} from "./reviewed-aot-efficiency-readonly-contract";
import { sha256Bytes } from "./source-fixture";

const SafePathSchema = z.string().min(1).max(500).refine((value) =>
  !isAbsolute(value) && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));

function contained(rootDirInput: string, path: string): string {
  const rootDir = resolve(rootDirInput);
  const candidate = resolve(rootDir, SafePathSchema.parse(path));
  const fromRoot = relative(rootDir, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`read-only serial path escapes root: ${path}`);
  return candidate;
}

async function frozen(rootDir: string, path: string) {
  const absolute = contained(rootDir, path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`read-only serial authority must be a regular file: ${path}`);
  return ReadonlySerialFrozenFileSchema.parse({ path, sha256: sha256Bytes(await readFile(absolute)) });
}

async function verify(rootDir: string, reference: z.infer<typeof ReadonlySerialFrozenFileSchema>): Promise<Buffer> {
  const absolute = contained(rootDir, reference.path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`read-only serial authority must be a regular file: ${reference.path}`);
  const bytes = await readFile(absolute);
  if (sha256Bytes(bytes) !== reference.sha256) throw new Error(`read-only serial digest mismatch for ${reference.path}`);
  return bytes;
}

async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.next`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export function assertReadonlyQualificationPrecedesFreeze(completedAt: string, frozenAt: string): void {
  const completed = Date.parse(completedAt);
  const frozen = Date.parse(frozenAt);
  if (!Number.isFinite(completed) || !Number.isFinite(frozen)) {
    throw new Error("read-only serial qualification/freeze timestamp is invalid");
  }
  if (frozen < completed) {
    throw new Error("read-only serial freeze timestamp predates qualification completion");
  }
}

async function validatePredecessor(rootDir: string, predecessor: z.infer<typeof ReadonlySerialPredecessorSchema>) {
  const policyBytes = await verify(rootDir, predecessor.policy);
  const freezeBytes = await verify(rootDir, predecessor.freeze);
  const incidentBytes = await verify(rootDir, predecessor.incident);
  const policy = ResilientEfficiencyPolicySchema.parse(JSON.parse(policyBytes.toString("utf8")));
  const freeze = ResilientEfficiencyFreezeSchema.parse(JSON.parse(freezeBytes.toString("utf8")));
  await validateResilientEfficiencyPolicy(policy, rootDir);
  await validateResilientEfficiencyFreeze(freeze, rootDir, policy);
  const incident = JSON.parse(incidentBytes.toString("utf8")) as {
    status?: string;
    decision?: { resumeThisIdentity?: boolean; additionalPaidCallsAuthorized?: boolean };
  };
  if (incident.status !== "controller-observation-invalid-for-efficiency"
    || incident.decision?.resumeThisIdentity !== false
    || incident.decision?.additionalPaidCallsAuthorized !== false) {
    throw new Error("read-only serial predecessor incident authority drift");
  }
  return policy;
}

export async function buildReadonlySerialEfficiencyPolicy(
  rootDirInput: string,
  frozenAt: string,
): Promise<ReadonlySerialEfficiencyPolicy> {
  const rootDir = resolve(rootDirInput);
  const predecessor = ReadonlySerialPredecessorSchema.parse({
    policy: await frozen(rootDir, RESILIENT_EFFICIENCY_POLICY_PATH),
    freeze: await frozen(rootDir, RESILIENT_EFFICIENCY_FREEZE_PATH),
    incident: await frozen(rootDir, RESILIENT_OBSERVATION_FAILURE_PATH),
    rowReuse: false,
  });
  const predecessorPolicy = await validatePredecessor(rootDir, predecessor);
  const qualification = ReadonlySerialQualificationReportSchema.parse(JSON.parse(await readFile(
    contained(rootDir, READONLY_SERIAL_QUALIFICATION_PATH), "utf8",
  )));
  assertReadonlyQualificationPrecedesFreeze(qualification.completedAt, frozenAt);
  const implementation = await Promise.all(READONLY_SERIAL_IMPLEMENTATION_PATHS.map((path) => frozen(rootDir, path)));
  if (!isDeepStrictEqual(qualification.implementation, implementation)) {
    throw new Error("read-only serial qualification implementation digest drift");
  }
  return ReadonlySerialEfficiencyPolicySchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-policy/v1",
    experimentId: READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID,
    frozenAt,
    predecessor,
    qualification: await frozen(rootDir, READONLY_SERIAL_QUALIFICATION_PATH),
    implementation,
    denominator: predecessorPolicy.denominator,
    productionOneTime: predecessorPolicy.productionOneTime,
    controlPlane: {
      observation: "read-only-frozen-bytes-plan-state-prefix",
      planBuilderReachable: false,
      materializerReachable: false,
      writesAllowed: false,
      concurrentActiveTreeProof: "byte-identical-passed",
    },
    execution: {
      owner: "single-foreground-serial-process",
      prepareBeforeCredentialCheck: true,
      productionObservers: 0,
      rowOrder: "dispatch-execute-prefix-next",
      committedPrefixRecovery: true,
      dispatchedWithoutTerminal: "fail-closed",
      retries: 0,
    },
    stopLoss: { remainingInfrastructureRepairIdentities: 0, onInfrastructureFailure: "stop-efficiency-and-enter-phase-2" },
    authorization: {
      currentStagePaidCalls: 0, futurePaidOriginalCalls: 4, retries: 0,
      heldOut: false, readinessPromotion: false,
    },
    prohibited: [
      "v1-row-reuse", "v2-row-reuse", "retry-or-reserve", "concurrent-production-observer",
      "post-hoc-row-selection", "held-out",
    ],
    claimBoundary: "This successor authorizes prepare plus one fresh foreground serial eight-row denominator. It does not establish quality, break-even, efficiency, portfolio, readiness, or automation before machine-derived results.",
  });
}

export async function validateReadonlySerialEfficiencyPolicy(
  input: unknown,
  rootDirInput: string,
): Promise<ReadonlySerialEfficiencyPolicy> {
  const rootDir = resolve(rootDirInput);
  const policy = ReadonlySerialEfficiencyPolicySchema.parse(input);
  if (policy.predecessor.policy.path !== RESILIENT_EFFICIENCY_POLICY_PATH
    || policy.predecessor.freeze.path !== RESILIENT_EFFICIENCY_FREEZE_PATH
    || policy.predecessor.incident.path !== RESILIENT_OBSERVATION_FAILURE_PATH
    || policy.qualification.path !== READONLY_SERIAL_QUALIFICATION_PATH
    || !isDeepStrictEqual(policy.implementation.map((entry) => entry.path), [...READONLY_SERIAL_IMPLEMENTATION_PATHS])) {
    throw new Error("read-only serial policy authority path drift");
  }
  const predecessorPolicy = await validatePredecessor(rootDir, policy.predecessor);
  const qualification = ReadonlySerialQualificationReportSchema.parse(JSON.parse(
    (await verify(rootDir, policy.qualification)).toString("utf8"),
  ));
  assertReadonlyQualificationPrecedesFreeze(qualification.completedAt, policy.frozenAt);
  for (const reference of policy.implementation) await verify(rootDir, reference);
  if (!isDeepStrictEqual(qualification.implementation, policy.implementation)
    || !isDeepStrictEqual(policy.denominator, predecessorPolicy.denominator)
    || !isDeepStrictEqual(policy.productionOneTime, predecessorPolicy.productionOneTime)) {
    throw new Error("read-only serial policy semantic authority drift");
  }
  return policy;
}

export async function buildReadonlySerialEfficiencyFreeze(
  rootDirInput: string,
  policyInput: unknown,
): Promise<ReadonlySerialEfficiencyFreeze> {
  const rootDir = resolve(rootDirInput);
  const policy = await validateReadonlySerialEfficiencyPolicy(policyInput, rootDir);
  return ReadonlySerialEfficiencyFreezeSchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-serial-freeze/v1",
    freezeId: "env-reviewed-aot-efficiency-readonly-serial-identity-001",
    status: "passed",
    policy: await frozen(rootDir, READONLY_SERIAL_EFFICIENCY_POLICY_PATH),
    predecessor: policy.predecessor,
    qualification: policy.qualification,
    implementation: policy.implementation,
    plan: policy.denominator,
    accounting: { currentStagePaidCalls: 0, matrixExecuted: false, retries: 0 },
    authorizations: { prepare: true, paidMatrix: true, heldOut: false, efficiencyClaim: false },
    stopLoss: policy.stopLoss,
    claimBoundary: "The zero-paid freeze binds the final read-only/serial successor and authorizes prepare plus one foreground execution. It is not a quality, cost, or efficiency result.",
  });
}

export async function validateReadonlySerialEfficiencyFreeze(
  input: unknown,
  rootDirInput: string,
  policyInput: unknown,
): Promise<ReadonlySerialEfficiencyFreeze> {
  const rootDir = resolve(rootDirInput);
  const freeze = ReadonlySerialEfficiencyFreezeSchema.parse(input);
  const policy = await validateReadonlySerialEfficiencyPolicy(policyInput, rootDir);
  await verify(rootDir, freeze.policy);
  for (const reference of [freeze.predecessor.policy, freeze.predecessor.freeze, freeze.predecessor.incident,
    freeze.qualification, ...freeze.implementation]) await verify(rootDir, reference);
  if (freeze.policy.path !== READONLY_SERIAL_EFFICIENCY_POLICY_PATH
    || !isDeepStrictEqual(freeze.predecessor, policy.predecessor)
    || !isDeepStrictEqual(freeze.qualification, policy.qualification)
    || !isDeepStrictEqual(freeze.implementation, policy.implementation)
    || !isDeepStrictEqual(freeze.plan, policy.denominator)
    || !isDeepStrictEqual(freeze.stopLoss, policy.stopLoss)) {
    throw new Error("read-only serial freeze identity drift");
  }
  return freeze;
}

export async function writeReadonlySerialFreezeArtifacts(options: {
  rootDir: string;
  frozenAt: string;
}): Promise<{ policy: ReadonlySerialEfficiencyPolicy; freeze: ReadonlySerialEfficiencyFreeze }> {
  const rootDir = resolve(options.rootDir);
  const policy = await buildReadonlySerialEfficiencyPolicy(rootDir, options.frozenAt);
  await writeAtomicJson(contained(rootDir, READONLY_SERIAL_EFFICIENCY_POLICY_PATH), policy);
  const freeze = await buildReadonlySerialEfficiencyFreeze(rootDir, policy);
  await writeAtomicJson(contained(rootDir, READONLY_SERIAL_EFFICIENCY_FREEZE_PATH), freeze);
  return { policy, freeze };
}
