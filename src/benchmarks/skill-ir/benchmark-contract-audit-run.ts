import {
  customEvaluatorImplementations,
  customEvaluatorSourceDigests,
  customEvaluatorSourcePaths,
} from "../../bench/evaluators/index.ts";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { EvalCriterion, RunResult } from "../../core/types";
import { customEvaluators } from "../../framework/types";
import type { CustomEvaluator } from "../../framework/types";
import {
  BenchmarkContractAuditManifestSchema,
  auditBenchmarkContract,
  hashAuditFixtureDirectory,
  type BenchmarkContractAuditIssue,
  type BenchmarkContractAuditManifest,
} from "./benchmark-contract-audit";
import { sha256Bytes } from "./source-fixture";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";

type Args = {
  manifest: string;
  out: string;
};

type RunBenchmarkContractAuditOptions = {
  evaluatorSourcePaths?: ReadonlyMap<string, string>;
  evaluatorSourceDigests?: ReadonlyMap<string, string>;
  evaluatorImplementations?: ReadonlyMap<string, CustomEvaluator>;
};

export type BenchmarkContractCanaryResult = {
  id: string;
  role:
    | "canonical-valid"
    | "alternative-valid"
    | "invalid-control"
    | "partial-control";
  expectedPass: boolean;
  expectedScore?: number;
  actualPass?: boolean;
  actualScore?: number;
  status: "matched" | "mismatched" | "infrastructure";
};

export type BenchmarkContractAuditRunReport = {
  schemaVersion: "skill-ir-benchmark-contract-audit-run-report/v1";
  auditId: string;
  skillId: string;
  staticStatus: "passed" | "failed";
  status: "passed" | "failed";
  counts: {
    tasks: number;
    criteria: number;
    requirements: number;
    canaries: number;
  };
  provenance: {
    manifestSha256: string;
  };
  canaries: BenchmarkContractCanaryResult[];
  issues: Array<BenchmarkContractAuditIssue | {
    code: "CANARY_OUTCOME_MISMATCH" | "CANARY_INFRASTRUCTURE";
    subjectId: string;
  }>;
  claimBoundary: string;
};

type AuditTask = {
  id: string;
  eval?: EvalCriterion[];
};

type TaskSet = {
  tasks?: AuditTask[];
};

export function parseBenchmarkContractAuditArgs(argv: string[]): Args {
  const args: Args = {
    manifest: "",
    out: "",
  };
  for (const arg of argv) {
    if (arg.startsWith("--manifest=")) {
      args.manifest = arg.slice("--manifest=".length);
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.manifest) throw new Error("--manifest is required");
  if (!args.out) throw new Error("--out is required");
  return args;
}

function emptyRunResult(
  workDir: string,
  initialWorkdirManifest?: RunResult["initialWorkdirManifest"],
): RunResult {
  return {
    text: "",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    runStatus: "ok",
    usageAvailable: true,
    ...(initialWorkdirManifest ? { initialWorkdirManifest } : {}),
  };
}

export async function runBenchmarkContractAudit(
  input: BenchmarkContractAuditManifest,
  rootDir = process.cwd(),
  options: RunBenchmarkContractAuditOptions = {},
): Promise<BenchmarkContractAuditRunReport> {
  const manifest = BenchmarkContractAuditManifestSchema.parse(input);
  const sourcePaths = options.evaluatorSourcePaths ?? customEvaluatorSourcePaths;
  const sourceDigests = options.evaluatorSourceDigests ?? customEvaluatorSourceDigests;
  const implementations =
    options.evaluatorImplementations ?? customEvaluatorImplementations;
  const staticReport = await auditBenchmarkContract(manifest, rootDir);
  let taskSet: TaskSet = { tasks: [] };
  try {
    const taskBytes = await readFile(resolve(rootDir, manifest.tasks.path));
    if (sha256Bytes(taskBytes) === manifest.tasks.sha256) {
      taskSet = JSON.parse(taskBytes.toString("utf8")) as TaskSet;
    }
  } catch {
    taskSet = { tasks: [] };
  }
  const tasksById = new Map((taskSet.tasks ?? []).map((task) => [task.id, task]));
  const canaryResults: BenchmarkContractCanaryResult[] = [];
  const runtimeIssues: BenchmarkContractAuditRunReport["issues"] = [];

  for (const canary of manifest.canaries) {
    const evaluator = customEvaluators.get(manifest.scorer.evaluatorId);
    const sourceIdentityMatches =
      sourcePaths.get(manifest.scorer.evaluatorId) === manifest.scorer.path &&
      sourceDigests.get(manifest.scorer.evaluatorId) === manifest.scorer.sha256;
    const implementationIdentityMatches =
      evaluator !== undefined &&
      implementations.get(manifest.scorer.evaluatorId) === evaluator;
    const criterion = tasksById.get(canary.taskId)?.eval?.find((entry) =>
      entry.method === "custom" &&
      entry.id === canary.criterionId &&
      entry.evaluatorId === manifest.scorer.evaluatorId
    );
    let sourceFixtureDigestMatches = false;
    let initialFixtureDigestMatches = canary.initialFixturePath === undefined;
    try {
      sourceFixtureDigestMatches =
        await hashAuditFixtureDirectory(
          resolve(rootDir, canary.fixturePath),
          rootDir,
        ) ===
        canary.fixtureSha256;
    } catch {
      sourceFixtureDigestMatches = false;
    }
    if (canary.initialFixturePath !== undefined && canary.initialFixtureSha256 !== undefined) {
      try {
        initialFixtureDigestMatches =
          await hashAuditFixtureDirectory(
            resolve(rootDir, canary.initialFixturePath),
            rootDir,
          ) === canary.initialFixtureSha256;
      } catch {
        initialFixtureDigestMatches = false;
      }
    }
    if (
      !evaluator ||
      !sourceIdentityMatches ||
      !implementationIdentityMatches ||
      !criterion ||
      criterion.method !== "custom" ||
      !sourceFixtureDigestMatches ||
      !initialFixtureDigestMatches
    ) {
      canaryResults.push({
        id: canary.id,
        role: canary.role,
        expectedPass: canary.expectedPass,
        ...(canary.expectedScore === undefined
          ? {}
          : { expectedScore: canary.expectedScore }),
        status: "infrastructure",
      });
      runtimeIssues.push({ code: "CANARY_INFRASTRUCTURE", subjectId: canary.id });
      continue;
    }

    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-contract-canary-"));
    const workDir = join(temporaryRoot, "workdir");
    try {
      await cp(resolve(rootDir, canary.fixturePath), workDir, {
        recursive: true,
        force: true,
      });
      if (await hashAuditFixtureDirectory(workDir) !== canary.fixtureSha256) {
        throw new Error("canary fixture changed while creating its execution snapshot");
      }
      let initialWorkdirManifest: RunResult["initialWorkdirManifest"];
      if (canary.initialFixturePath !== undefined && canary.initialFixtureSha256 !== undefined) {
        const initialWorkDir = join(temporaryRoot, "initial-workdir");
        await cp(resolve(rootDir, canary.initialFixturePath), initialWorkDir, {
          recursive: true,
          force: true,
        });
        if (await hashAuditFixtureDirectory(initialWorkDir) !== canary.initialFixtureSha256) {
          throw new Error("initial canary fixture changed while creating its execution snapshot");
        }
        initialWorkdirManifest = await writeInitialWorkdirManifest({
          workDir: initialWorkDir,
          manifestPath: join(temporaryRoot, "initial-workdir-manifest.json"),
        });
      }
      const result = await evaluator.run({
        criterion,
        runResult: emptyRunResult(workDir, initialWorkdirManifest),
      });
      if (result.infraError) {
        canaryResults.push({
          id: canary.id,
          role: canary.role,
          expectedPass: canary.expectedPass,
          ...(canary.expectedScore === undefined
            ? {}
            : { expectedScore: canary.expectedScore }),
          status: "infrastructure",
        });
        runtimeIssues.push({ code: "CANARY_INFRASTRUCTURE", subjectId: canary.id });
      } else {
        const actualPass = result.pass;
        const actualScore = result.score;
        const status =
          actualPass === canary.expectedPass &&
          (canary.expectedScore === undefined || actualScore === canary.expectedScore)
            ? "matched"
            : "mismatched";
        canaryResults.push({
          id: canary.id,
          role: canary.role,
          expectedPass: canary.expectedPass,
          ...(canary.expectedScore === undefined
            ? {}
            : { expectedScore: canary.expectedScore }),
          actualPass,
          ...(canary.expectedScore === undefined ? {} : { actualScore }),
          status,
        });
        if (status === "mismatched") {
          runtimeIssues.push({ code: "CANARY_OUTCOME_MISMATCH", subjectId: canary.id });
        }
      }
    } catch {
      canaryResults.push({
        id: canary.id,
        role: canary.role,
        expectedPass: canary.expectedPass,
        ...(canary.expectedScore === undefined
          ? {}
          : { expectedScore: canary.expectedScore }),
        status: "infrastructure",
      });
      runtimeIssues.push({ code: "CANARY_INFRASTRUCTURE", subjectId: canary.id });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  const issues = [...staticReport.issues, ...runtimeIssues].sort((left, right) =>
    left.code.localeCompare(right.code) || left.subjectId.localeCompare(right.subjectId)
  );
  return {
    schemaVersion: "skill-ir-benchmark-contract-audit-run-report/v1",
    auditId: manifest.auditId,
    skillId: manifest.skillId,
    staticStatus: staticReport.status,
    status: issues.length === 0 ? "passed" : "failed",
    counts: staticReport.counts,
    provenance: {
      manifestSha256: sha256Bytes(Buffer.from(JSON.stringify(manifest), "utf8")),
    },
    canaries: canaryResults,
    issues,
    claimBoundary:
      "This report audits declared public-contract traceability and local canaries; it is not task-success evidence.",
  };
}

async function main(): Promise<void> {
  const args = parseBenchmarkContractAuditArgs(process.argv.slice(2));
  const manifestBytes = await readFile(args.manifest);
  const manifest = BenchmarkContractAuditManifestSchema.parse(
    JSON.parse(manifestBytes.toString("utf8")),
  );
  const report = await runBenchmarkContractAudit(
    manifest,
    process.cwd(),
  );
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    auditId: report.auditId,
    status: report.status,
    canaries: report.canaries.length,
    out: args.out,
  }, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
