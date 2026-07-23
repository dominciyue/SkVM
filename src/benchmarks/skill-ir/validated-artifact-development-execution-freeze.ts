import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import {
  readAndValidateValidatedArtifactDevelopmentLock,
  type ValidatedArtifactDevelopmentLock,
} from "./validated-artifact-development";
import { sha256Bytes } from "./source-fixture";
import type { ValidatedArtifactPackage } from "./validated-artifact-catalog";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ValidatedArtifactExecutionFreezeSchema = z.object({
  schemaVersion: z.literal(
    "skill-ir-validated-artifact-development-execution-freeze/v1",
  ),
  status: z.literal("preregistered"),
  experimentId: z.literal("law-to-markdown-validated-artifact-development-v1"),
  parentLock: FrozenFileSchema,
  frozenImplementations: z.object({
    modelRunner: FrozenFileSchema,
    scoring: FrozenFileSchema,
    routeProbe: FrozenFileSchema,
    resourceProbe: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    bareAgentAdapter: FrozenFileSchema,
    adapterRegistry: FrozenFileSchema,
    freezeValidator: FrozenFileSchema,
    orchestrator: FrozenFileSchema,
  }).strict(),
  runtime: z.object({
    phases: z.tuple([z.literal("route-probe"), z.literal("execute")]),
    routeProbeTimeoutMs: z.literal(180000),
    retries: z.literal(0),
    compactRouteEvidence: z.literal(true),
    rerunDirectArm: z.literal(true),
  }).strict(),
  matrix: z.object({
    expectedModelRows: z.literal(12),
    expectedArtifactRows: z.literal(4),
    expectedRows: z.literal(16),
  }).strict(),
  outputPolicy: z.object({
    commitRawTranscripts: z.literal(false),
    commitWorkdirs: z.literal(false),
    commitProviderLogs: z.literal(false),
    commitCompactEvidence: z.literal(true),
  }).strict(),
}).strict();

export type ValidatedArtifactExecutionFreeze = z.infer<
  typeof ValidatedArtifactExecutionFreezeSchema
>;

export type ValidatedArtifactExecutionFreezeRecord = {
  freeze: ValidatedArtifactExecutionFreeze;
  parent: {
    lock: ValidatedArtifactDevelopmentLock;
    package: ValidatedArtifactPackage;
  };
};

async function verifyDigest(
  rootDir: string,
  file: { path: string; sha256: string },
): Promise<void> {
  const actual = sha256Bytes(await readFile(path.resolve(rootDir, file.path)));
  if (actual !== file.sha256) {
    throw new Error(`Validated artifact execution digest mismatch for ${file.path}`);
  }
}

export async function validateValidatedArtifactExecutionFreeze(
  input: unknown,
  rootDir: string,
): Promise<ValidatedArtifactExecutionFreezeRecord> {
  const resolvedRoot = path.resolve(rootDir);
  const freeze = ValidatedArtifactExecutionFreezeSchema.parse(input);
  await Promise.all([
    freeze.parentLock,
    ...Object.values(freeze.frozenImplementations),
  ].map((file) => verifyDigest(resolvedRoot, file)));

  const parent = await readAndValidateValidatedArtifactDevelopmentLock({
    rootDir: resolvedRoot,
    lockPath: path.resolve(resolvedRoot, freeze.parentLock.path),
  });
  if (
    parent.lock.experimentId !== freeze.experimentId
    || parent.lock.matrix.expectedModelRows !== freeze.matrix.expectedModelRows
    || parent.lock.matrix.expectedArtifactRows !== freeze.matrix.expectedArtifactRows
    || parent.lock.matrix.expectedRows !== freeze.matrix.expectedRows
    || parent.lock.runtime.retries !== freeze.runtime.retries
  ) {
    throw new Error("Validated artifact execution freeze disagrees with parent lock");
  }
  return { freeze, parent };
}

export async function readAndValidateValidatedArtifactExecutionFreeze(opts: {
  rootDir: string;
  freezePath: string;
}): Promise<ValidatedArtifactExecutionFreezeRecord> {
  const freezePath = path.isAbsolute(opts.freezePath)
    ? opts.freezePath
    : path.resolve(opts.rootDir, opts.freezePath);
  return validateValidatedArtifactExecutionFreeze(
    JSON.parse(await readFile(freezePath, "utf8")),
    opts.rootDir,
  );
}
