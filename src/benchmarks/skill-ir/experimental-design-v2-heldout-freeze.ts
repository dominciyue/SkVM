import { execFileSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  customEvaluatorSourceDigests,
  customEvaluatorSourcePaths,
} from "../../bench/evaluators/index.ts";
import { parseSafeRelativePath } from "./artifact-package.ts";
import { BenchmarkContractAuditManifestSchema } from "./benchmark-contract-audit.ts";
import {
  ExperimentalDesignV2FrozenFileSchema,
  ExperimentalDesignV2TaskSplitFreezeSchema,
  verifyExperimentalDesignV2TaskSplitFreeze,
  type ExperimentalDesignV2TaskSplitFreeze,
} from "./experimental-design-v2-task-freeze.ts";
import { sha256Bytes } from "./source-fixture.ts";

const V2_ROOT = "benchmarks/skill-ir/pilots/experimental-design/v2";
const TASK_SPLIT_FREEZE_PATH = `${V2_ROOT}/task-split-freeze.json`;
const SCORER_PATH = "src/bench/evaluators/experimental-design-grade-v2.ts";
const REGISTRY_PATH = "src/bench/evaluators/index.ts";
const AUDIT_MANIFEST_PATH = `${V2_ROOT}/benchmark-contract-audit.json`;
const AUDIT_REPORT_PATH =
  "results/skill-ir/benchmark-contract-audit/experimental-design-v2.json";
const EVALUATOR_ID = "skill-ir-experimental-design-v2";
const DEVELOPMENT_TASK_IDS = [
  "experimental-design-v2-stratified-dev-001",
  "experimental-design-v2-cluster-sequential-dev-002",
] as const;
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "../../..");

const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/);

const FrozenScorerSchema = ExperimentalDesignV2FrozenFileSchema.extend({
  evaluatorId: z.literal(EVALUATOR_ID),
}).strict();

export const ExperimentalDesignV2HeldoutFreezeSchema = z
  .object({
    schemaVersion: z.literal(
      "skill-ir-experimental-design-v2-heldout-freeze/v1",
    ),
    benchmarkId: z.literal("experimental-design-v2"),
    inputsCommit: CommitSchema,
    taskSplitFreeze: ExperimentalDesignV2FrozenFileSchema,
    heldoutTasks: ExperimentalDesignV2FrozenFileSchema,
    scorer: FrozenScorerSchema,
    auditManifest: ExperimentalDesignV2FrozenFileSchema,
    auditReport: ExperimentalDesignV2FrozenFileSchema,
    heldoutSentinel: z
      .string()
      .regex(/^TEST_ONLY_HELDOUT_V2_[A-Z0-9_]+$/),
  })
  .strict()
  .superRefine((freeze, context) => {
    for (const [key, expected] of [
      ["taskSplitFreeze", TASK_SPLIT_FREEZE_PATH],
      ["scorer", SCORER_PATH],
      ["auditManifest", AUDIT_MANIFEST_PATH],
      ["auditReport", AUDIT_REPORT_PATH],
    ] as const) {
      if (freeze[key].path !== expected) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key, "path"],
          message: `${key} path does not match the frozen v2 identity`,
        });
      }
    }
  });

export type ExperimentalDesignV2HeldoutFreeze = z.infer<
  typeof ExperimentalDesignV2HeldoutFreezeSchema
>;

type ConstructionSink = "development-lock" | "compiler" | "package" | "feedback";

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

function readGitBlob(rootDir: string, commit: string, relativePath: string): Buffer {
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
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    throw new Error(`Inputs commit does not contain git blob ${relativePath}`, {
      cause: error,
    });
  }
}

async function frozenFileFromCommit(
  rootDir: string,
  inputsCommit: string,
  relativePath: string,
): Promise<{ path: string; sha256: string }> {
  const committed = readGitBlob(rootDir, inputsCommit, relativePath);
  const disk = await readBoundFile(rootDir, relativePath);
  if (!matchesRepositoryBlob(disk, committed)) {
    throw new Error(`Inputs commit bytes differ from working bytes: ${relativePath}`);
  }
  return { path: relativePath, sha256: sha256Bytes(committed) };
}

async function verifyFileAgainstCommit(
  rootDir: string,
  inputsCommit: string,
  file: { path: string; sha256: string },
): Promise<Buffer> {
  const committed = readGitBlob(rootDir, inputsCommit, file.path);
  if (sha256Bytes(committed) !== file.sha256) {
    throw new Error(`Frozen digest mismatch for committed bytes: ${file.path}`);
  }
  const disk = await readBoundFile(rootDir, file.path);
  if (!matchesRepositoryBlob(disk, committed)) {
    throw new Error(`Frozen digest mismatch for working bytes: ${file.path}`);
  }
  return committed;
}

function heldoutEvidenceTokens(
  taskSplit: ExperimentalDesignV2TaskSplitFreeze,
): string[] {
  return [
    ...taskSplit.heldoutTasks.taskIds,
    taskSplit.heldoutTasks.path,
    taskSplit.heldoutTasks.sha256,
    taskSplit.fixtureProjectionSha256,
    taskSplit.heldoutSentinel,
  ];
}

function findToken(value: unknown, tokens: readonly string[]): string | undefined {
  const serialized =
    typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return tokens.find((token) => serialized.includes(token));
}

export function validateExperimentalDesignV2HeldoutAuditBoundary(
  taskSplitValue: unknown,
  manifestValue: unknown,
  reportValue: unknown,
): void {
  const taskSplit = ExperimentalDesignV2TaskSplitFreezeSchema.parse(taskSplitValue);
  const manifest = BenchmarkContractAuditManifestSchema.parse(manifestValue);
  if (
    manifest.skillId !== "experimental-design-v2" ||
    manifest.scope.split !== "development" ||
    JSON.stringify(manifest.scope.taskIds) !== JSON.stringify(DEVELOPMENT_TASK_IDS)
  ) {
    throw new Error("Experimental-design v2 audit is not development-only");
  }
  const tokens = heldoutEvidenceTokens(taskSplit);
  if (findToken(manifest, tokens) || findToken(reportValue, tokens)) {
    throw new Error("Experimental-design v2 audit contains held-out evidence");
  }
  if (!reportValue || typeof reportValue !== "object") {
    throw new Error("Experimental-design v2 audit report is invalid");
  }
  const report = reportValue as Record<string, any>;
  if (report.status !== "passed" || report.staticStatus !== "passed") {
    throw new Error("Experimental-design v2 audit report must be passed");
  }
  if (
    report.auditId !== manifest.auditId ||
    report.skillId !== manifest.skillId ||
    !Array.isArray(report.issues) ||
    report.issues.length !== 0 ||
    !Array.isArray(report.canaries) ||
    report.canaries.length !== manifest.canaries.length ||
    !report.canaries.every((canary: any) => canary?.status === "matched")
  ) {
    throw new Error("Experimental-design v2 audit report does not match the manifest");
  }
  const expectedManifestSha256 = sha256Bytes(
    Buffer.from(JSON.stringify(manifest), "utf8"),
  );
  if (report.provenance?.manifestSha256 !== expectedManifestSha256) {
    throw new Error("Experimental-design v2 audit report manifest digest mismatch");
  }
}

function verifyScorerRegistryIdentity(
  scorer: { path: string; sha256: string; evaluatorId: string },
  registryBytes: Uint8Array,
): void {
  if (
    customEvaluatorSourcePaths.get(scorer.evaluatorId) !== scorer.path ||
    customEvaluatorSourceDigests.get(scorer.evaluatorId) !== scorer.sha256
  ) {
    throw new Error("Experimental-design v2 scorer evaluator registry identity drift");
  }
  const registrySource = Buffer.from(registryBytes).toString("utf8");
  for (const token of [scorer.evaluatorId, scorer.path, scorer.sha256]) {
    if (!registrySource.includes(token)) {
      throw new Error("Inputs commit scorer registry identity drift");
    }
  }
}

export function assertNoExperimentalDesignV2HeldoutEvidence(
  sinkName: ConstructionSink,
  value: unknown,
  freezeValue: ExperimentalDesignV2HeldoutFreeze,
): void {
  const freeze = ExperimentalDesignV2HeldoutFreezeSchema.parse(freezeValue);
  const taskSplit = ExperimentalDesignV2TaskSplitFreezeSchema.parse(
    JSON.parse(
      readGitBlob(REPOSITORY_ROOT, freeze.inputsCommit, freeze.taskSplitFreeze.path)
        .toString("utf8"),
    ),
  );
  const token = findToken(value, heldoutEvidenceTokens(taskSplit));
  if (token) {
    throw new Error(`${sinkName} contains held-out evidence`);
  }
}

export async function createExperimentalDesignV2HeldoutFreeze(
  rootDir: string,
  inputsCommit: string,
): Promise<ExperimentalDesignV2HeldoutFreeze> {
  CommitSchema.parse(inputsCommit);
  const [taskSplitFreeze, scorer, auditManifest, auditReport, registryBytes] =
    await Promise.all([
      frozenFileFromCommit(rootDir, inputsCommit, TASK_SPLIT_FREEZE_PATH),
      frozenFileFromCommit(rootDir, inputsCommit, SCORER_PATH),
      frozenFileFromCommit(rootDir, inputsCommit, AUDIT_MANIFEST_PATH),
      frozenFileFromCommit(rootDir, inputsCommit, AUDIT_REPORT_PATH),
      readGitBlob(rootDir, inputsCommit, REGISTRY_PATH),
    ]);
  const taskSplitValue = parseJsonBytes(
    readGitBlob(rootDir, inputsCommit, TASK_SPLIT_FREEZE_PATH),
    "task-split freeze",
  );
  const taskSplit = ExperimentalDesignV2TaskSplitFreezeSchema.parse(taskSplitValue);
  await verifyExperimentalDesignV2TaskSplitFreeze(rootDir, taskSplit);
  const manifestValue = parseJsonBytes(
    readGitBlob(rootDir, inputsCommit, AUDIT_MANIFEST_PATH),
    "audit manifest",
  );
  const reportValue = parseJsonBytes(
    readGitBlob(rootDir, inputsCommit, AUDIT_REPORT_PATH),
    "audit report",
  );
  validateExperimentalDesignV2HeldoutAuditBoundary(
    taskSplit,
    manifestValue,
    reportValue,
  );
  const scorerWithIdentity = { ...scorer, evaluatorId: EVALUATOR_ID } as const;
  verifyScorerRegistryIdentity(scorerWithIdentity, registryBytes);

  const freeze = ExperimentalDesignV2HeldoutFreezeSchema.parse({
    schemaVersion: "skill-ir-experimental-design-v2-heldout-freeze/v1",
    benchmarkId: "experimental-design-v2",
    inputsCommit,
    taskSplitFreeze,
    heldoutTasks: {
      path: taskSplit.heldoutTasks.path,
      sha256: taskSplit.heldoutTasks.sha256,
    },
    scorer: scorerWithIdentity,
    auditManifest,
    auditReport,
    heldoutSentinel: taskSplit.heldoutSentinel,
  });
  return freeze;
}

export async function verifyExperimentalDesignV2HeldoutFreeze(
  rootDir: string,
  value: unknown,
): Promise<ExperimentalDesignV2HeldoutFreeze> {
  const freeze = ExperimentalDesignV2HeldoutFreezeSchema.parse(value);
  const [taskSplitBytes, heldoutBytes, scorerBytes, manifestBytes, reportBytes, registryBytes] =
    await Promise.all([
      verifyFileAgainstCommit(rootDir, freeze.inputsCommit, freeze.taskSplitFreeze),
      verifyFileAgainstCommit(rootDir, freeze.inputsCommit, freeze.heldoutTasks),
      verifyFileAgainstCommit(rootDir, freeze.inputsCommit, freeze.scorer),
      verifyFileAgainstCommit(rootDir, freeze.inputsCommit, freeze.auditManifest),
      verifyFileAgainstCommit(rootDir, freeze.inputsCommit, freeze.auditReport),
      readGitBlob(rootDir, freeze.inputsCommit, REGISTRY_PATH),
    ]);
  const taskSplit = ExperimentalDesignV2TaskSplitFreezeSchema.parse(
    parseJsonBytes(taskSplitBytes, "task-split freeze"),
  );
  await verifyExperimentalDesignV2TaskSplitFreeze(rootDir, taskSplit);
  if (
    freeze.heldoutTasks.path !== taskSplit.heldoutTasks.path ||
    freeze.heldoutTasks.sha256 !== taskSplit.heldoutTasks.sha256 ||
    freeze.heldoutSentinel !== taskSplit.heldoutSentinel
  ) {
    throw new Error("Experimental-design v2 held-out identity mismatch");
  }
  if (sha256Bytes(heldoutBytes) !== taskSplit.heldoutTasks.sha256) {
    throw new Error("Experimental-design v2 held-out task digest mismatch");
  }
  verifyScorerRegistryIdentity(freeze.scorer, registryBytes);
  validateExperimentalDesignV2HeldoutAuditBoundary(
    taskSplit,
    parseJsonBytes(manifestBytes, "audit manifest"),
    parseJsonBytes(reportBytes, "audit report"),
  );

  const developmentTasks = readGitBlob(
    rootDir,
    freeze.inputsCommit,
    taskSplit.developmentTasks.path,
  );
  const tokens = heldoutEvidenceTokens(taskSplit);
  for (const [label, content] of [
    ["development tasks", developmentTasks.toString("utf8")],
    ["scorer source", scorerBytes.toString("utf8")],
    [
      "registry serialization",
      JSON.stringify({
        evaluatorId: freeze.scorer.evaluatorId,
        path: customEvaluatorSourcePaths.get(freeze.scorer.evaluatorId),
        sha256: customEvaluatorSourceDigests.get(freeze.scorer.evaluatorId),
      }),
    ],
  ] as const) {
    if (findToken(content, tokens)) {
      throw new Error(`Held-out evidence leaked into ${label}`);
    }
  }
  return freeze;
}
