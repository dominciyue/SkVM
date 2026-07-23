import { cp, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import {
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactPackage,
} from "./validated-artifact-catalog";
import { parseSafeRelativePath } from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

const ValidationErrorSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
  relativePath: z.string().transform((value, ctx) => {
    try {
      return parseSafeRelativePath(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : String(error),
      });
      return z.NEVER;
    }
  }).optional(),
  contractRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/).optional(),
}).strict();

export const SkillArtifactValidationReportSchema = z.object({
  schemaVersion: z.literal("skill-artifact-validation-report/v1"),
  status: z.enum(["pass", "fail"]),
  errors: z.array(ValidationErrorSchema),
}).strict().superRefine((report, ctx) => {
  if (report.status === "pass" && report.errors.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Passing validation cannot contain errors" });
  }
  if (report.status === "fail" && report.errors.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Failing validation requires an error" });
  }
});

export type SkillArtifactValidationReport = z.infer<typeof SkillArtifactValidationReportSchema>;

export type SkillArtifactExecutionNodeResult = {
  id: string;
  kind: "process" | "validate";
  status: "complete" | "failed";
  durationMs: number;
  exitCode: number | null;
  failureClass?:
    | "spawn-failed"
    | "timeout"
    | "nonzero-exit"
    | "invalid-validation-report"
    | "protected-input-mutated";
};

export type SkillArtifactExecutionResult = {
  schemaVersion: "skill-artifact-execution-result/v1";
  catalog: "validated-skill-artifact/v1";
  skillId: string;
  status:
    | "complete"
    | "process-failure"
    | "validation-failure"
    | "infrastructure-failure"
    | "protected-input-failure";
  nodes: SkillArtifactExecutionNodeResult[];
  validation?: SkillArtifactValidationReport;
  modelGenerationTokens: 0;
  modelRepairTokens: 0;
  deterministicProcessDurationMs: number;
  validationDurationMs: number;
  packageBytes: number;
};

export type ValidatedArtifactRuntimeInput = {
  package: ValidatedArtifactPackage;
  workDir: string;
  env?: Record<string, string | undefined>;
};

type ProtectedSnapshot = Map<string, string>;

function resolveContained(root: string, relativePath: string): string {
  const normalized = parseSafeRelativePath(relativePath);
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, normalized);
  const rel = relative(rootPath, candidate);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
    throw new Error(`Runtime path escapes workdir: ${relativePath}`);
  }
  return candidate;
}

async function snapshotProtectedInputs(
  workDir: string,
  protectedInputs: string[],
): Promise<ProtectedSnapshot> {
  const snapshot = new Map<string, string>();
  for (const relativePath of protectedInputs) {
    const path = resolveContained(workDir, relativePath);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Protected input must be a regular file: ${relativePath}`);
    }
    snapshot.set(relativePath, sha256Bytes(await readFile(path)));
  }
  return snapshot;
}

async function protectedInputsMatch(
  workDir: string,
  expected: ProtectedSnapshot,
): Promise<boolean> {
  try {
    const current = await snapshotProtectedInputs(workDir, [...expected.keys()]);
    return [...expected].every(([path, digest]) => current.get(path) === digest);
  } catch {
    return false;
  }
}

function planOrder(plan: ValidatedArtifactExecutionPlan): ValidatedArtifactExecutionPlan["nodes"] {
  const byId = new Map(plan.nodes.map((node) => [node.id, node]));
  const ordered: ValidatedArtifactExecutionPlan["nodes"] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    const node = byId.get(id);
    if (!node) throw new Error(`Unknown execution node: ${id}`);
    for (const dependency of node.dependsOn) visit(dependency);
    seen.add(id);
    ordered.push(node);
  };
  visit(plan.entrypoint);
  return ordered;
}

function childEnvironment(
  allowlist: string[],
  input: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const platformBase = process.platform === "win32"
    ? ["PATH", "Path", "PATHEXT", "SystemRoot", "TEMP", "TMP"]
    : ["PATH", "HOME", "TMPDIR", "LANG"];
  for (const name of [...new Set([...platformBase, ...allowlist])]) {
    const value = input[name] ?? process.env[name];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function expandArgument(
  value: string,
  input: ValidatedArtifactRuntimeInput,
  allowlist: string[],
): string {
  if (value === "{workdir}") return resolve(input.workDir);
  const artifactMatch = /^\{artifact:([a-z][a-z0-9-]{0,63})\}$/u.exec(value);
  if (artifactMatch) {
    const artifact = input.package.manifest.artifacts.find(
      (candidate) => candidate.id === artifactMatch[1],
    );
    if (!artifact) throw new Error(`Missing argument artifact: ${artifactMatch[1]}`);
    return join(input.package.packageDir, artifact.path);
  }
  const environmentMatch = /^\{env:([A-Z_][A-Z0-9_]*)\}$/u.exec(value);
  if (environmentMatch) {
    const name = environmentMatch[1]!;
    if (!allowlist.includes(name)) throw new Error(`Environment argument is not allowlisted: ${name}`);
    const resolved = input.env?.[name] ?? process.env[name];
    if (resolved === undefined) throw new Error(`Missing environment argument: ${name}`);
    return resolved;
  }
  return value;
}

async function executeNode(options: {
  input: ValidatedArtifactRuntimeInput;
  node: ValidatedArtifactExecutionPlan["nodes"][number];
}): Promise<{
  result: SkillArtifactExecutionNodeResult;
  stdout?: string;
}> {
  const { input, node } = options;
  const artifact = input.package.manifest.artifacts.find(
    (candidate) => candidate.id === node.command.artifactId,
  );
  if (!artifact) throw new Error(`Missing executable artifact: ${node.command.artifactId}`);
  const suppliedEnv = input.env ?? {};
  const executable = suppliedEnv[node.command.interpreter.env]?.trim()
    || process.env[node.command.interpreter.env]?.trim()
    || node.command.interpreter.fallback;
  const startedAt = performance.now();
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    const args = [
      executable,
      join(input.package.packageDir, artifact.path),
      ...node.command.args.map((argument) => expandArgument(
        argument,
        input,
        node.command.envAllowlist,
      )),
    ];
    proc = Bun.spawn(args, {
      cwd: input.workDir,
      env: childEnvironment(node.command.envAllowlist, suppliedEnv),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    return {
      result: {
        id: node.id,
        kind: node.kind,
        status: "failed",
        durationMs: Math.round(performance.now() - startedAt),
        exitCode: null,
        failureClass: "spawn-failed",
      },
    };
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, node.timeoutMs);
  const [exitCode, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
    new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
  ]).finally(() => clearTimeout(timer));
  const durationMs = Math.round(performance.now() - startedAt);
  if (timedOut) {
    return {
      result: {
        id: node.id,
        kind: node.kind,
        status: "failed",
        durationMs,
        exitCode,
        failureClass: "timeout",
      },
    };
  }
  if (exitCode !== 0) {
    return {
      result: {
        id: node.id,
        kind: node.kind,
        status: "failed",
        durationMs,
        exitCode,
        failureClass: "nonzero-exit",
      },
    };
  }
  return {
    result: {
      id: node.id,
      kind: node.kind,
      status: "complete",
      durationMs,
      exitCode,
    },
    stdout,
  };
}

function totalDuration(
  nodes: SkillArtifactExecutionNodeResult[],
  kind: "process" | "validate",
): number {
  return nodes.filter((node) => node.kind === kind).reduce((sum, node) => sum + node.durationMs, 0);
}

function buildResult(options: {
  input: ValidatedArtifactRuntimeInput;
  status: SkillArtifactExecutionResult["status"];
  nodes: SkillArtifactExecutionNodeResult[];
  validation?: SkillArtifactValidationReport;
}): SkillArtifactExecutionResult {
  return {
    schemaVersion: "skill-artifact-execution-result/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: options.input.package.manifest.skillId,
    status: options.status,
    nodes: options.nodes,
    ...(options.validation ? { validation: options.validation } : {}),
    modelGenerationTokens: 0,
    modelRepairTokens: 0,
    deterministicProcessDurationMs: totalDuration(options.nodes, "process"),
    validationDurationMs: totalDuration(options.nodes, "validate"),
    packageBytes: options.input.package.packageBytes,
  };
}

async function runValidatedArtifactPlanFromSnapshot(
  input: ValidatedArtifactRuntimeInput,
): Promise<SkillArtifactExecutionResult> {
  const protectedSnapshot = await snapshotProtectedInputs(
    input.workDir,
    input.package.manifest.protectedInputs,
  );
  const nodes: SkillArtifactExecutionNodeResult[] = [];
  let validation: SkillArtifactValidationReport | undefined;

  for (const node of planOrder(input.package.executionPlan)) {
    const executed = await executeNode({ input, node });
    nodes.push(executed.result);
    if (executed.result.status === "failed") {
      return buildResult({
        input,
        status: node.kind === "process" ? "process-failure" : "infrastructure-failure",
        nodes,
      });
    }
    if (!await protectedInputsMatch(input.workDir, protectedSnapshot)) {
      nodes[nodes.length - 1] = {
        ...executed.result,
        status: "failed",
        failureClass: "protected-input-mutated",
      };
      return buildResult({ input, status: "protected-input-failure", nodes });
    }
    if (node.kind === "validate") {
      try {
        validation = SkillArtifactValidationReportSchema.parse(JSON.parse(executed.stdout?.trim() ?? ""));
      } catch {
        nodes[nodes.length - 1] = {
          ...executed.result,
          status: "failed",
          failureClass: "invalid-validation-report",
        };
        return buildResult({ input, status: "infrastructure-failure", nodes });
      }
      if (validation.status === "fail") {
        return buildResult({ input, status: "validation-failure", nodes, validation });
      }
    }
  }

  return buildResult({ input, status: "complete", nodes, validation });
}

export async function runValidatedArtifactPlan(
  input: ValidatedArtifactRuntimeInput,
): Promise<SkillArtifactExecutionResult> {
  const executionRoot = await mkdtemp(join(tmpdir(), "skvm-validated-artifact-runtime-"));
  const executionPackageDir = join(executionRoot, "package");
  try {
    await cp(input.package.packageDir, executionPackageDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    return await runValidatedArtifactPlanFromSnapshot({
      ...input,
      package: {
        ...input.package,
        packageDir: executionPackageDir,
      },
    });
  } finally {
    await rm(executionRoot, { recursive: true, force: true });
  }
}
