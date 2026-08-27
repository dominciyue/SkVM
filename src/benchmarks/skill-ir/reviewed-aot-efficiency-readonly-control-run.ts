import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  READONLY_SERIAL_EFFICIENCY_FREEZE_PATH,
  READONLY_SERIAL_EFFICIENCY_POLICY_PATH,
  READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID,
  ReadonlySerialEfficiencyFreezeSchema,
  ReadonlySerialEfficiencyPolicySchema,
  type ReadonlySerialEfficiencyFreeze,
  type ReadonlySerialEfficiencyPolicy,
} from "./reviewed-aot-efficiency-readonly-contract";
import {
  ReadonlySerialAuthoritySchema,
  ReadonlySerialPlanSchema,
  collectReadonlySerialSnapshot,
  readReadonlySerialStatus,
} from "./reviewed-aot-efficiency-readonly-control";

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function contained(rootDirInput: string, path: string): string {
  if (!path || isAbsolute(path) || path.includes("\\")
    || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`read-only control path is unsafe: ${path}`);
  }
  const rootDir = resolve(rootDirInput);
  const candidate = resolve(rootDir, path);
  const fromRoot = relative(rootDir, candidate);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`read-only control path escapes root: ${path}`);
  }
  return candidate;
}

async function readRegularFile(rootDir: string, path: string): Promise<Buffer> {
  const absolute = contained(rootDir, path);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`read-only control requires a regular file: ${path}`);
  return readFile(absolute);
}

async function verifyReference(rootDir: string, reference: { path: string; sha256: string }): Promise<void> {
  if (sha256Bytes(await readRegularFile(rootDir, reference.path)) !== reference.sha256) {
    throw new Error(`read-only control frozen digest mismatch for ${reference.path}`);
  }
}

function collectEmbeddedReferences(value: unknown, output: Array<{ path: string; sha256: string }>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectEmbeddedReferences(entry, output);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.path === "string" && typeof record.sha256 === "string"
    && /^[a-f0-9]{64}$/u.test(record.sha256)) {
    output.push({ path: record.path, sha256: record.sha256 });
  }
  for (const child of Object.values(record)) collectEmbeddedReferences(child, output);
}

function requiredEmbeddedReference(value: unknown, label: string): { path: string; sha256: string } {
  if (!value || typeof value !== "object") throw new Error(`read-only control missing ${label}`);
  const record = value as Record<string, unknown>;
  if (typeof record.path !== "string" || typeof record.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(record.sha256)) {
    throw new Error(`read-only control malformed ${label}`);
  }
  return { path: record.path, sha256: record.sha256 };
}

function uniqueReferences(references: Array<{ path: string; sha256: string }>) {
  const byPath = new Map<string, { path: string; sha256: string }>();
  for (const reference of references) {
    const prior = byPath.get(reference.path);
    if (prior && prior.sha256 !== reference.sha256) {
      throw new Error(`read-only control conflicting frozen digests for ${reference.path}`);
    }
    byPath.set(reference.path, reference);
  }
  return [...byPath.values()];
}

function assertPolicyFreezeAgreement(
  policy: ReadonlySerialEfficiencyPolicy,
  freeze: ReadonlySerialEfficiencyFreeze,
): void {
  if (!isDeepStrictEqual(freeze.predecessor, policy.predecessor)
    || !isDeepStrictEqual(freeze.qualification, policy.qualification)
    || !isDeepStrictEqual(freeze.implementation, policy.implementation)
    || !isDeepStrictEqual(freeze.plan, policy.denominator)
    || !isDeepStrictEqual(freeze.stopLoss, policy.stopLoss)) {
    throw new Error("read-only control policy/freeze semantic drift");
  }
}

export async function loadReadonlySerialProductionAuthority(options: {
  rootDir: string;
  activeDir: string;
}) {
  const rootDir = resolve(options.rootDir);
  const activeDir = resolve(options.activeDir);
  const policyBytes = await readRegularFile(rootDir, READONLY_SERIAL_EFFICIENCY_POLICY_PATH);
  const freezeBytes = await readRegularFile(rootDir, READONLY_SERIAL_EFFICIENCY_FREEZE_PATH);
  const policy = ReadonlySerialEfficiencyPolicySchema.parse(JSON.parse(policyBytes.toString("utf8")));
  const freeze = ReadonlySerialEfficiencyFreezeSchema.parse(JSON.parse(freezeBytes.toString("utf8")));
  if (freeze.policy.path !== READONLY_SERIAL_EFFICIENCY_POLICY_PATH
    || sha256Bytes(policyBytes) !== freeze.policy.sha256) {
    throw new Error("read-only control policy digest drift");
  }
  assertPolicyFreezeAgreement(policy, freeze);
  const successorReferences = [
    freeze.policy,
    freeze.predecessor.policy,
    freeze.predecessor.freeze,
    freeze.predecessor.incident,
    freeze.qualification,
    ...freeze.implementation,
  ];
  const v2PolicyBytes = await readRegularFile(rootDir, freeze.predecessor.policy.path);
  const v2FreezeBytes = await readRegularFile(rootDir, freeze.predecessor.freeze.path);
  const v2PolicyRaw = JSON.parse(v2PolicyBytes.toString("utf8")) as Record<string, unknown>;
  const v2FreezeRaw = JSON.parse(v2FreezeBytes.toString("utf8")) as Record<string, unknown>;
  const v2References: Array<{ path: string; sha256: string }> = [];
  collectEmbeddedReferences(v2PolicyRaw, v2References);
  collectEmbeddedReferences(v2FreezeRaw, v2References);
  const v2Predecessor = v2PolicyRaw.predecessor as Record<string, unknown> | undefined;
  const v1PolicyReference = requiredEmbeddedReference(v2Predecessor?.policy, "v1 policy reference");
  const v1FreezeReference = requiredEmbeddedReference(v2Predecessor?.freeze, "v1 freeze reference");
  const v1PolicyRaw = JSON.parse((await readRegularFile(rootDir, v1PolicyReference.path)).toString("utf8")) as unknown;
  const v1FreezeRaw = JSON.parse((await readRegularFile(rootDir, v1FreezeReference.path)).toString("utf8")) as unknown;
  const v1References: Array<{ path: string; sha256: string }> = [];
  collectEmbeddedReferences(v1PolicyRaw, v1References);
  collectEmbeddedReferences(v1FreezeRaw, v1References);
  const referenced = uniqueReferences([...successorReferences, ...v2References, ...v1References]);
  await Promise.all(referenced.map((reference) => verifyReference(rootDir, reference)));
  const identityDigest = sha256Bytes(freezeBytes);
  const planBytes = await readFile(resolve(activeDir, "plan.json"));
  const plan = ReadonlySerialPlanSchema.parse(JSON.parse(planBytes.toString("utf8")));
  if (plan.experimentId !== READONLY_SERIAL_EFFICIENCY_EXPERIMENT_ID
    || plan.identityDigest !== identityDigest
    || !isDeepStrictEqual(plan.rows, freeze.plan.orderedRows)) {
    throw new Error("read-only control prepared plan identity drift");
  }
  const frozenFiles = uniqueReferences([
    { path: READONLY_SERIAL_EFFICIENCY_FREEZE_PATH, sha256: identityDigest },
    ...referenced,
  ]);
  const authority = ReadonlySerialAuthoritySchema.parse({
    schemaVersion: "skill-ir-reviewed-aot-efficiency-readonly-authority/v1",
    experimentId: policy.experimentId,
    identityDigest,
    planSha256: sha256Bytes(planBytes),
    rows: policy.denominator.orderedRows,
    frozenFiles,
  });
  return { rootDir, activeDir, policy, freeze, plan, authority };
}

export async function readReadonlySerialProductionStatus(options: {
  rootDir: string;
  activeDir: string;
}) {
  const loaded = await loadReadonlySerialProductionAuthority(options);
  return readReadonlySerialStatus({
    rootDir: loaded.rootDir,
    activeDir: loaded.activeDir,
    authority: loaded.authority,
  });
}

export async function collectReadonlySerialProductionSnapshot(options: {
  rootDir: string;
  activeDir: string;
}) {
  const loaded = await loadReadonlySerialProductionAuthority(options);
  return collectReadonlySerialSnapshot({
    rootDir: loaded.rootDir,
    activeDir: loaded.activeDir,
    authority: loaded.authority,
  });
}

async function main(): Promise<void> {
  const phase = argument("phase");
  if (phase !== "status" && phase !== "collect") throw new Error("--phase=status|collect is required");
  const rootDir = resolve(argument("root") ?? process.cwd());
  const activeDir = resolve(argument("out-dir")
    ?? join(rootDir, "results/skill-ir/env-manager-reviewed-aot-efficiency-readonly-serial-001/run"));
  const result = phase === "status"
    ? await readReadonlySerialProductionStatus({ rootDir, activeDir })
    : await collectReadonlySerialProductionSnapshot({ rootDir, activeDir });
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
