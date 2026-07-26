import { execFileSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  SafeRelativePathSchema,
  Sha256Schema,
  parseSafeRelativePath,
} from "./artifact-package.ts";
import {
  ExperimentalDesignV2PublicContractSourceAuditSchema,
} from "./experimental-design-v2-contract.ts";
import { sha256Bytes } from "./source-fixture.ts";

const V2_ROOT = "benchmarks/skill-ir/pilots/experimental-design/v2";
const PUBLIC_CONTRACT_PATH = `${V2_ROOT}/public-contract.json`;
const PUBLIC_CONTRACT_SOURCE_AUDIT_PATH =
  `${V2_ROOT}/public-contract-source-audit.json`;
const DEVELOPMENT_TASKS_PATH = `${V2_ROOT}/development/tasks.json`;
const HELDOUT_TASKS_PATH = `${V2_ROOT}/heldout/tasks.json`;

const DEVELOPMENT_TASK_IDS = [
  "experimental-design-v2-stratified-dev-001",
  "experimental-design-v2-cluster-sequential-dev-002",
] as const;
const HELDOUT_TASK_IDS = [
  "experimental-design-v2-stratified-sequential-heldout-001",
  "experimental-design-v2-cluster-stratified-heldout-002",
] as const;

const SOURCE_CLOSURE_PATHS = [
  "benchmarks/skill-ir/pilots/experimental-design/source/LICENSE.upstream.md",
  "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md",
  "benchmarks/skill-ir/pilots/experimental-design/source/references/design_types.md",
  "benchmarks/skill-ir/pilots/experimental-design/source/references/randomization_and_blocking.md",
] as const;

const FROZEN_V1_PATHS = [
  "benchmarks/skill-ir/pilots/experimental-design/tasks.json",
  "src/bench/evaluators/experimental-design-grade.ts",
  "benchmarks/skill-ir/pilots/experimental-design/benchmark-contract-audit.json",
  "benchmarks/skill-ir/pilots/experimental-design/experimental-design-baseline-calibration-lock.json",
  "benchmarks/skill-ir/pilots/experimental-design/packages/validated-skill-artifact-v1/package-manifest.json",
  "results/skill-ir/benchmark-contract-audit/experimental-design.json",
] as const;

const HELDOUT_SENTINEL =
  "TEST_ONLY_HELDOUT_V2_EXPERIMENTAL_DESIGN_TASK_SPLIT_V1";

const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/);

export const ExperimentalDesignV2FrozenFileSchema = z
  .object({
    path: SafeRelativePathSchema,
    sha256: Sha256Schema,
  })
  .strict();

export const ExperimentalDesignV2FrozenTaskSetSchema =
  ExperimentalDesignV2FrozenFileSchema.extend({
    split: z.enum(["development", "heldout"]),
    taskIds: z.array(z.string().min(1)).length(2),
  }).strict();

function sameOrderedValues(actual: readonly string[], expected: readonly string[]) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sameValueSet(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    [...actual].sort().join("\n") === [...expected].sort().join("\n")
  );
}

export const ExperimentalDesignV2TaskSplitFreezeSchema = z
  .object({
    schemaVersion: z.literal(
      "skill-ir-experimental-design-v2-task-split-freeze/v1",
    ),
    benchmarkId: z.literal("experimental-design-v2"),
    taskCommit: CommitSchema,
    publicContract: ExperimentalDesignV2FrozenFileSchema,
    publicContractSourceAudit: ExperimentalDesignV2FrozenFileSchema,
    developmentTasks: ExperimentalDesignV2FrozenTaskSetSchema,
    heldoutTasks: ExperimentalDesignV2FrozenTaskSetSchema,
    fixtureProjectionSha256: Sha256Schema,
    sourceClosure: z.array(ExperimentalDesignV2FrozenFileSchema).min(1),
    frozenV1: z.array(ExperimentalDesignV2FrozenFileSchema).length(6),
    heldoutSentinel: z
      .string()
      .regex(/^TEST_ONLY_HELDOUT_V2_[A-Z0-9_]+$/),
  })
  .strict()
  .superRefine((freeze, context) => {
    if (freeze.publicContract.path !== PUBLIC_CONTRACT_PATH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicContract", "path"],
        message: "public contract path is not the frozen v2 path",
      });
    }
    if (
      freeze.publicContractSourceAudit.path !==
      PUBLIC_CONTRACT_SOURCE_AUDIT_PATH
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicContractSourceAudit", "path"],
        message: "public contract source audit path is not the frozen v2 path",
      });
    }
    if (
      freeze.developmentTasks.path !== DEVELOPMENT_TASKS_PATH ||
      freeze.developmentTasks.split !== "development" ||
      !sameOrderedValues(freeze.developmentTasks.taskIds, DEVELOPMENT_TASK_IDS)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["developmentTasks"],
        message: "development task IDs or split do not match the frozen 2+2 design",
      });
    }
    if (
      freeze.heldoutTasks.path !== HELDOUT_TASKS_PATH ||
      freeze.heldoutTasks.split !== "heldout" ||
      !sameOrderedValues(freeze.heldoutTasks.taskIds, HELDOUT_TASK_IDS)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["heldoutTasks"],
        message: "held-out task IDs or split do not match the frozen 2+2 design",
      });
    }
    const overlap = freeze.developmentTasks.taskIds.filter((taskId) =>
      freeze.heldoutTasks.taskIds.includes(taskId),
    );
    if (overlap.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["heldoutTasks", "taskIds"],
        message: "development and held-out task IDs overlap",
      });
    }
    if (
      !sameValueSet(
        freeze.sourceClosure.map((file) => file.path),
        SOURCE_CLOSURE_PATHS,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceClosure"],
        message: "source closure does not match the frozen public-contract inputs",
      });
    }
    if (
      !sameValueSet(
        freeze.frozenV1.map((file) => file.path),
        FROZEN_V1_PATHS,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frozenV1"],
        message: "frozen v1 references do not match the immutable set",
      });
    }
  });

export type ExperimentalDesignV2TaskSplitFreeze = z.infer<
  typeof ExperimentalDesignV2TaskSplitFreezeSchema
>;

const TaskPayloadSchema = z
  .object({
    schemaVersion: z.literal("skill-ir-experimental-design-eval/v2"),
    check: z.enum([
      "input-integrity",
      "artifact-contract",
      "design-semantics",
      "allocation-safety",
      "report-consistency",
    ]),
    paths: z
      .object({
        study: SafeRelativePathSchema,
        contract: SafeRelativePathSchema,
        plan: SafeRelativePathSchema,
        allocation: SafeRelativePathSchema,
        report: SafeRelativePathSchema,
      })
      .strict(),
    protectedSha256: z
      .object({
        study: Sha256Schema,
        contract: Sha256Schema,
      })
      .strict(),
  })
  .strict();

const TaskSchema = z
  .object({
    id: z.string().min(1),
    split: z.enum(["development", "held-out"]),
    prompt: z.string().min(1),
    fixtures: z.record(z.string(), z.string()),
    successCriteria: z.array(z.string()),
    eval: z.array(
      z
        .object({
          method: z.literal("custom"),
          id: z.string().min(1),
          name: z.string().min(1),
          weight: z.number().positive(),
          evaluatorId: z.literal("skill-ir-experimental-design-v2"),
          payload: TaskPayloadSchema,
        })
        .strict(),
    ),
    hardGateIds: z.array(z.string().min(1)),
    passThreshold: z.literal(0.95),
  })
  .strict();

const TaskSetSchema = z
  .object({
    schemaVersion: z.literal("skill-ir-tasks/v1"),
    skillId: z.literal("experimental-design-v2"),
    tasks: z.array(TaskSchema).length(2),
  })
  .strict();

type TaskSet = z.infer<typeof TaskSetSchema>;

function findForbiddenEvidence(value: unknown, pathParts: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenEvidence(value[index], [...pathParts, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (
        /^(?:expected|gold|heldoutFeedback|heldOutFeedback|modelOutput|historicalResult|packageAnswer)$/iu.test(
          key,
        )
      ) {
        return [...pathParts, key].join(".");
      }
      const found = findForbiddenEvidence(nested, [...pathParts, key]);
      if (found) return found;
    }
    return null;
  }
  if (
    typeof value === "string" &&
    /(?:evaluator\s+expected|expected\s+answer|gold\s+answer|held[- ]out\s+feedback|historical\s+model\s+output|package\s+answer)/iu.test(
      value,
    )
  ) {
    return pathParts.join(".");
  }
  return null;
}

export function validateExperimentalDesignV2TaskSets(
  developmentValue: unknown,
  heldoutValue: unknown,
): { development: TaskSet; heldout: TaskSet } {
  const leakedPath =
    findForbiddenEvidence(developmentValue) ?? findForbiddenEvidence(heldoutValue);
  if (leakedPath) {
    throw new Error(
      `Experimental-design v2 task contains forbidden evaluator evidence at ${leakedPath}`,
    );
  }
  const development = TaskSetSchema.parse(developmentValue);
  const heldout = TaskSetSchema.parse(heldoutValue);
  const developmentIds = development.tasks.map((task) => task.id);
  const heldoutIds = heldout.tasks.map((task) => task.id);
  if (
    !sameOrderedValues(developmentIds, DEVELOPMENT_TASK_IDS) ||
    !development.tasks.every((task) => task.split === "development")
  ) {
    throw new Error("Experimental-design v2 development task split mismatch");
  }
  if (
    !sameOrderedValues(heldoutIds, HELDOUT_TASK_IDS) ||
    !heldout.tasks.every((task) => task.split === "held-out")
  ) {
    throw new Error("Experimental-design v2 held-out task split mismatch");
  }
  if (developmentIds.some((taskId) => heldoutIds.includes(taskId))) {
    throw new Error("Experimental-design v2 development/held-out task overlap");
  }
  return { development, heldout };
}

async function readBoundFile(rootDir: string, relativePath: string): Promise<Buffer> {
  const safePath = parseSafeRelativePath(relativePath);
  const resolvedRoot = await realpath(path.resolve(rootDir));
  const candidate = path.resolve(resolvedRoot, ...safePath.split("/"));
  const stat = await lstat(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Frozen path must be a regular file: ${relativePath}`);
  }
  const resolvedCandidate = await realpath(candidate);
  const relativeToRoot = path.relative(resolvedRoot, resolvedCandidate);
  if (
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new Error(`Frozen path escapes repository root: ${relativePath}`);
  }
  return readFile(resolvedCandidate);
}

function readGitBlob(
  rootDir: string,
  commit: string,
  relativePath: string,
): Buffer {
  CommitSchema.parse(commit);
  const safePath = parseSafeRelativePath(relativePath);
  try {
    return execFileSync(
      "git",
      [
        "-c",
        `safe.directory=${path.resolve(rootDir).replaceAll("\\", "/")}`,
        "show",
        `${commit}:${safePath}`,
      ],
      {
        cwd: rootDir,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      },
    );
  } catch (error) {
    throw new Error(
      `Task commit does not contain git blob ${relativePath}`,
      { cause: error },
    );
  }
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`Frozen ${label} is not valid UTF-8 JSON`, { cause: error });
  }
}

function repositoryTextBytes(bytes: Uint8Array): Buffer {
  return Buffer.from(
    Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n"),
    "utf8",
  );
}

function matchesRepositoryBlob(disk: Uint8Array, committed: Uint8Array): boolean {
  return (
    Buffer.from(disk).equals(Buffer.from(committed)) ||
    repositoryTextBytes(disk).equals(repositoryTextBytes(committed))
  );
}

async function verifyFileAgainstCommit(
  rootDir: string,
  taskCommit: string,
  file: { path: string; sha256: string },
): Promise<Buffer> {
  const committed = readGitBlob(rootDir, taskCommit, file.path);
  const committedSha256 = sha256Bytes(committed);
  if (committedSha256 !== file.sha256) {
    throw new Error(`Frozen digest mismatch for committed bytes: ${file.path}`);
  }
  const disk = await readBoundFile(rootDir, file.path);
  if (!matchesRepositoryBlob(disk, committed)) {
    throw new Error(`Frozen digest mismatch for working bytes: ${file.path}`);
  }
  return committed;
}

type PublicContractClaims = {
  contractId: string;
  sourceClaimIds: string[];
};

const PublicContractClaimsSchema = z
  .object({
    contractId: z.literal("experimental-design-public-contract-v2"),
    sourceClaimIds: z.array(z.string().min(1)).min(1),
  })
  .passthrough();

async function verifySourceAuditWithReader(
  contractValue: unknown,
  auditValue: unknown,
  readSource: (relativePath: string) => Promise<Buffer>,
): Promise<void> {
  const contract: PublicContractClaims =
    PublicContractClaimsSchema.parse(contractValue);
  const audit =
    ExperimentalDesignV2PublicContractSourceAuditSchema.parse(auditValue);
  const claimIds = audit.entries.map((entry) => entry.claimId);
  if (!sameValueSet(claimIds, contract.sourceClaimIds)) {
    throw new Error("Public contract source audit claim coverage mismatch");
  }
  const allowedSources = new Set(SOURCE_CLOSURE_PATHS);
  for (const entry of audit.entries) {
    if (!allowedSources.has(entry.source.path as (typeof SOURCE_CLOSURE_PATHS)[number])) {
      throw new Error(`Public contract source is outside the frozen closure: ${entry.source.path}`);
    }
    const bytes = await readSource(entry.source.path);
    const repositoryBytes = repositoryTextBytes(bytes);
    if (sha256Bytes(repositoryBytes) !== entry.source.sha256) {
      throw new Error(`Public contract source digest mismatch: ${entry.source.path}`);
    }
    if (!bytes.toString("utf8").includes(entry.quote)) {
      throw new Error(`Public contract source quote mismatch: ${entry.claimId}`);
    }
  }
}

export async function verifyExperimentalDesignV2PublicContractSourceAudit(
  rootDir: string,
  contractValue: unknown,
  auditValue: unknown,
): Promise<void> {
  await verifySourceAuditWithReader(
    contractValue,
    auditValue,
    (relativePath) => readBoundFile(rootDir, relativePath),
  );
}

function lengthPrefixed(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

function fixtureProjectionSha256(
  development: TaskSet,
  heldout: TaskSet,
): string {
  const records = [...development.tasks, ...heldout.tasks]
    .flatMap((task) =>
      Object.entries(task.fixtures).map(([fixturePath, contents]) => ({
        taskId: task.id,
        fixturePath,
        contents,
      })),
    )
    .sort((left, right) =>
      left.taskId.localeCompare(right.taskId) ||
      left.fixturePath.localeCompare(right.fixturePath),
    );
  const projection = [
    "experimental-design-v2-fixture-projection/v1",
    ...records.map((record) =>
      [record.taskId, record.fixturePath, record.contents]
        .map(lengthPrefixed)
        .join(""),
    ),
  ].join("\n");
  return sha256Bytes(Buffer.from(projection, "utf8"));
}

async function frozenFileFromCommit(
  rootDir: string,
  taskCommit: string,
  relativePath: string,
): Promise<{ path: string; sha256: string }> {
  const committed = readGitBlob(rootDir, taskCommit, relativePath);
  const disk = await readBoundFile(rootDir, relativePath);
  const sha256 = sha256Bytes(committed);
  if (!matchesRepositoryBlob(disk, committed)) {
    throw new Error(`Task commit bytes differ from working bytes: ${relativePath}`);
  }
  return { path: relativePath, sha256 };
}

async function validateCommittedInputs(
  rootDir: string,
  taskCommit: string,
): Promise<{ development: TaskSet; heldout: TaskSet }> {
  const contractBytes = readGitBlob(rootDir, taskCommit, PUBLIC_CONTRACT_PATH);
  const auditBytes = readGitBlob(
    rootDir,
    taskCommit,
    PUBLIC_CONTRACT_SOURCE_AUDIT_PATH,
  );
  const developmentBytes = readGitBlob(
    rootDir,
    taskCommit,
    DEVELOPMENT_TASKS_PATH,
  );
  const heldoutBytes = readGitBlob(rootDir, taskCommit, HELDOUT_TASKS_PATH);
  const taskSets = validateExperimentalDesignV2TaskSets(
    parseJsonBytes(developmentBytes, "development tasks"),
    parseJsonBytes(heldoutBytes, "held-out tasks"),
  );
  await verifySourceAuditWithReader(
    parseJsonBytes(contractBytes, "public contract"),
    parseJsonBytes(auditBytes, "public contract source audit"),
    async (relativePath) => readGitBlob(rootDir, taskCommit, relativePath),
  );
  return taskSets;
}

export async function createExperimentalDesignV2TaskSplitFreeze(
  rootDir: string,
  taskCommit: string,
): Promise<ExperimentalDesignV2TaskSplitFreeze> {
  CommitSchema.parse(taskCommit);
  const taskSets = await validateCommittedInputs(rootDir, taskCommit);
  const [
    publicContract,
    publicContractSourceAudit,
    developmentTasks,
    heldoutTasks,
    sourceClosure,
    frozenV1,
  ] = await Promise.all([
    frozenFileFromCommit(rootDir, taskCommit, PUBLIC_CONTRACT_PATH),
    frozenFileFromCommit(
      rootDir,
      taskCommit,
      PUBLIC_CONTRACT_SOURCE_AUDIT_PATH,
    ),
    frozenFileFromCommit(rootDir, taskCommit, DEVELOPMENT_TASKS_PATH),
    frozenFileFromCommit(rootDir, taskCommit, HELDOUT_TASKS_PATH),
    Promise.all(
      SOURCE_CLOSURE_PATHS.map((relativePath) =>
        frozenFileFromCommit(rootDir, taskCommit, relativePath),
      ),
    ),
    Promise.all(
      FROZEN_V1_PATHS.map((relativePath) =>
        frozenFileFromCommit(rootDir, taskCommit, relativePath),
      ),
    ),
  ]);
  const freeze = ExperimentalDesignV2TaskSplitFreezeSchema.parse({
    schemaVersion: "skill-ir-experimental-design-v2-task-split-freeze/v1",
    benchmarkId: "experimental-design-v2",
    taskCommit,
    publicContract,
    publicContractSourceAudit,
    developmentTasks: {
      ...developmentTasks,
      split: "development",
      taskIds: DEVELOPMENT_TASK_IDS,
    },
    heldoutTasks: {
      ...heldoutTasks,
      split: "heldout",
      taskIds: HELDOUT_TASK_IDS,
    },
    fixtureProjectionSha256: fixtureProjectionSha256(
      taskSets.development,
      taskSets.heldout,
    ),
    sourceClosure,
    frozenV1,
    heldoutSentinel: HELDOUT_SENTINEL,
  });
  return freeze;
}

export async function verifyExperimentalDesignV2TaskSplitFreeze(
  rootDir: string,
  value: unknown,
): Promise<ExperimentalDesignV2TaskSplitFreeze> {
  const freeze = ExperimentalDesignV2TaskSplitFreezeSchema.parse(value);
  const allFrozenFiles = [
    freeze.publicContract,
    freeze.publicContractSourceAudit,
    freeze.developmentTasks,
    freeze.heldoutTasks,
    ...freeze.sourceClosure,
    ...freeze.frozenV1,
  ];
  const committedBytes = await Promise.all(
    allFrozenFiles.map((file) =>
      verifyFileAgainstCommit(rootDir, freeze.taskCommit, file),
    ),
  );
  const committedByPath = new Map(
    allFrozenFiles.map((file, index) => [file.path, committedBytes[index]!] as const),
  );
  const taskSets = validateExperimentalDesignV2TaskSets(
    parseJsonBytes(
      committedByPath.get(DEVELOPMENT_TASKS_PATH)!,
      "development tasks",
    ),
    parseJsonBytes(
      committedByPath.get(HELDOUT_TASKS_PATH)!,
      "held-out tasks",
    ),
  );
  const actualFixtureProjection = fixtureProjectionSha256(
    taskSets.development,
    taskSets.heldout,
  );
  if (actualFixtureProjection !== freeze.fixtureProjectionSha256) {
    throw new Error("Experimental-design v2 fixture projection digest mismatch");
  }
  await verifySourceAuditWithReader(
    parseJsonBytes(
      committedByPath.get(PUBLIC_CONTRACT_PATH)!,
      "public contract",
    ),
    parseJsonBytes(
      committedByPath.get(PUBLIC_CONTRACT_SOURCE_AUDIT_PATH)!,
      "public contract source audit",
    ),
    async (relativePath) => {
      const bytes = committedByPath.get(relativePath);
      if (!bytes) {
        throw new Error(`Public contract source is not frozen: ${relativePath}`);
      }
      return bytes;
    },
  );
  for (const [label, bytes] of [
    ["public contract", committedByPath.get(PUBLIC_CONTRACT_PATH)!],
    ["public source audit", committedByPath.get(PUBLIC_CONTRACT_SOURCE_AUDIT_PATH)!],
    ["development tasks", committedByPath.get(DEVELOPMENT_TASKS_PATH)!],
    ["held-out tasks", committedByPath.get(HELDOUT_TASKS_PATH)!],
  ] as const) {
    if (bytes.toString("utf8").includes(freeze.heldoutSentinel)) {
      throw new Error(`Held-out sentinel leaked into ${label}`);
    }
  }
  return freeze;
}
