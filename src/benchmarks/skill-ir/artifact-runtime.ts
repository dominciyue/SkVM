import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SkvmTaskJson } from "./real-agent";
import {
  RuntimeValidationReportSchema,
  type RuntimeValidationReport,
} from "./artifact-package";
import {
  materializeArtifactTemplates,
  verifyProtectedWorkdir,
  type PreparedArtifactRun,
} from "./artifact-preflight";

export type ArtifactRepairMode = "check-only" | "one-repair";

export type ArtifactUsage = {
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
};

export type ArtifactCommandResult = {
  ok: boolean;
  failureType?: "infrastructure";
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  usage?: ArtifactUsage;
};

export type ArtifactRuntimeStatus =
  | "complete"
  | "semantic-failure"
  | "protected-file-failure"
  | "infrastructure-failure";

export type ArtifactRuntimeResult = {
  mode: ArtifactRepairMode;
  status: ArtifactRuntimeStatus;
  failureStage?: "generation" | "validation" | "repair" | "revalidation" | "protected-workdir";
  generation: ArtifactCommandResult;
  repair?: ArtifactCommandResult;
  initialValidation?: RuntimeValidationReport;
  finalValidation?: RuntimeValidationReport;
  repairAttempted: boolean;
  repairedToPass: boolean;
  generationUsage?: ArtifactUsage;
  repairUsage?: ArtifactUsage;
  aggregateUsage: ArtifactUsage & { modelDurationMs: number };
  validationDurationMs: number;
  finalStdout: string;
  finalStderr: string;
  finalExitCode: number;
};

export type ArtifactRuntimeMetadata = Omit<
  ArtifactRuntimeResult,
  "generation" | "repair" | "finalStdout" | "finalStderr" | "finalExitCode"
>;

export function artifactRuntimeMetadata(result: ArtifactRuntimeResult): ArtifactRuntimeMetadata {
  const {
    generation: _generation,
    repair: _repair,
    finalStdout: _finalStdout,
    finalStderr: _finalStderr,
    finalExitCode: _finalExitCode,
    ...metadata
  } = result;
  return metadata;
}

export type ArtifactStateMachineInput = {
  mode: ArtifactRepairMode;
  prepared: PreparedArtifactRun;
  runGeneration: () => Promise<ArtifactCommandResult>;
  runRepair: (task: SkvmTaskJson) => Promise<ArtifactCommandResult>;
  runValidator?: (prepared: PreparedArtifactRun) => Promise<RuntimeValidationReport>;
};

function zeroUsage(): ArtifactUsage {
  return { inputTokens: 0, outputTokens: 0, tokenCost: 0 };
}

function addUsage(left: ArtifactUsage | undefined, right: ArtifactUsage | undefined): ArtifactUsage {
  const a = left ?? zeroUsage();
  const b = right ?? zeroUsage();
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    tokenCost: a.tokenCost + b.tokenCost,
  };
}

function protectedFailureReport(paths: string[]): RuntimeValidationReport {
  return RuntimeValidationReportSchema.parse({
    schemaVersion: "runtime-validation-report/v1",
    status: "fail",
    repairEligible: false,
    errors: paths.map((relativePath) => ({
      code: "PROTECTED_FILE_MUTATED",
      relativePath,
    })),
  });
}

export function buildSanitizedRepairTask(report: RuntimeValidationReport): SkvmTaskJson {
  const safe = RuntimeValidationReportSchema.parse(report);
  if (safe.status !== "fail" || !safe.repairEligible) {
    throw new Error("A sanitized repair task requires an eligible failed ValidationReport");
  }
  const projection = safe.errors.map(({ code, relativePath, jsonPointer, missingField, expectedType }) => ({
    code,
    ...(relativePath === undefined ? {} : { relativePath }),
    ...(jsonPointer === undefined ? {} : { jsonPointer }),
    ...(missingField === undefined ? {} : { missingField }),
    ...(expectedType === undefined ? {} : { expectedType }),
  }));
  return {
    id: "artifact-sanitized-repair",
    name: "Artifact Sanitized Repair",
    category: "skill-ir-artifact-repair",
    gradingType: "llm_judge",
    prompt: [
      "Repair only the declared generated artifacts in the current workdir.",
      "Do not modify any pre-existing file. Do not print or copy secret values.",
      "Use only this schema-safe validation error list:",
      JSON.stringify(projection),
      "Stop after repairing the generated artifacts.",
    ].join("\n"),
    eval: [],
    timeoutMs: 300_000,
    maxSteps: 50,
  };
}

export async function writeSanitizedRepairTask(
  prepared: PreparedArtifactRun,
  report: RuntimeValidationReport,
): Promise<string> {
  const path = join(dirname(prepared.workDir), "task", "artifact-repair-task.json");
  await writeFile(path, `${JSON.stringify(buildSanitizedRepairTask(report), null, 2)}\n`, "utf8");
  return path;
}

export async function executeArtifactValidator(
  prepared: PreparedArtifactRun,
): Promise<RuntimeValidationReport> {
  const checkerPath = join(prepared.package.packageDir, prepared.package.manifest.checker.path);
  const proc = Bun.spawn(
    [prepared.runtimeExecutable, checkerPath, `--workdir=${prepared.workDir}`],
    { stdout: "pipe", stderr: "pipe" },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, prepared.package.manifest.checker.timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timer));
  if (timedOut) {
    throw new Error(`Artifact validator timed out after ${prepared.package.manifest.checker.timeoutMs}ms`);
  }
  if (exitCode !== 0) {
    throw new Error(`Artifact validator failed with exit ${exitCode}: ${stderr.trim()}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error("Artifact validator returned invalid JSON");
  }
  return RuntimeValidationReportSchema.parse(parsed);
}

function resultBase(
  input: ArtifactStateMachineInput,
  generation: ArtifactCommandResult,
  repair: ArtifactCommandResult | undefined,
  validationDurationMs: number,
): Pick<ArtifactRuntimeResult,
  "mode" | "generation" | "repair" | "generationUsage" | "repairUsage" |
  "aggregateUsage" | "validationDurationMs" | "finalStdout" | "finalStderr" | "finalExitCode"> {
  const finalCommand = repair ?? generation;
  return {
    mode: input.mode,
    generation,
    ...(repair ? { repair } : {}),
    ...(generation.usage ? { generationUsage: generation.usage } : {}),
    ...(repair?.usage ? { repairUsage: repair.usage } : {}),
    aggregateUsage: {
      ...addUsage(generation.usage, repair?.usage),
      modelDurationMs: generation.durationMs + (repair?.durationMs ?? 0),
    },
    validationDurationMs,
    finalStdout: finalCommand.stdout,
    finalStderr: finalCommand.stderr,
    finalExitCode: finalCommand.exitCode,
  };
}

async function timedValidation(
  input: ArtifactStateMachineInput,
): Promise<{ report: RuntimeValidationReport; durationMs: number }> {
  const startedAt = Date.now();
  const report = RuntimeValidationReportSchema.parse(
    await (input.runValidator ?? executeArtifactValidator)(input.prepared),
  );
  return { report, durationMs: Date.now() - startedAt };
}

export async function runArtifactStateMachine(
  input: ArtifactStateMachineInput,
): Promise<ArtifactRuntimeResult> {
  await materializeArtifactTemplates(input.prepared);
  const generation = await input.runGeneration();
  if (!generation.ok) {
    return {
      ...resultBase(input, generation, undefined, 0),
      status: "infrastructure-failure",
      failureStage: "generation",
      repairAttempted: false,
      repairedToPass: false,
    };
  }

  const protectedAfterGeneration = await verifyProtectedWorkdir(input.prepared);
  if (!protectedAfterGeneration.ok) {
    const report = protectedFailureReport(protectedAfterGeneration.mutatedPaths);
    return {
      ...resultBase(input, generation, undefined, 0),
      status: "protected-file-failure",
      failureStage: "protected-workdir",
      initialValidation: report,
      finalValidation: report,
      repairAttempted: false,
      repairedToPass: false,
    };
  }

  let first: { report: RuntimeValidationReport; durationMs: number };
  try {
    first = await timedValidation(input);
  } catch {
    return {
      ...resultBase(input, generation, undefined, 0),
      status: "infrastructure-failure",
      failureStage: "validation",
      repairAttempted: false,
      repairedToPass: false,
    };
  }
  if (first.report.status === "pass") {
    return {
      ...resultBase(input, generation, undefined, first.durationMs),
      status: "complete",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: false,
      repairedToPass: false,
    };
  }
  if (input.mode === "check-only" || !first.report.repairEligible) {
    return {
      ...resultBase(input, generation, undefined, first.durationMs),
      status: "semantic-failure",
      failureStage: "validation",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: false,
      repairedToPass: false,
    };
  }

  const repairTask = buildSanitizedRepairTask(first.report);
  const repair = await input.runRepair(repairTask);
  if (!repair.ok) {
    return {
      ...resultBase(input, generation, repair, first.durationMs),
      status: "infrastructure-failure",
      failureStage: "repair",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: true,
      repairedToPass: false,
    };
  }
  const protectedAfterRepair = await verifyProtectedWorkdir(input.prepared);
  if (!protectedAfterRepair.ok) {
    const report = protectedFailureReport(protectedAfterRepair.mutatedPaths);
    return {
      ...resultBase(input, generation, repair, first.durationMs),
      status: "protected-file-failure",
      failureStage: "protected-workdir",
      initialValidation: first.report,
      finalValidation: report,
      repairAttempted: true,
      repairedToPass: false,
    };
  }

  let second: { report: RuntimeValidationReport; durationMs: number };
  try {
    second = await timedValidation(input);
  } catch {
    return {
      ...resultBase(input, generation, repair, first.durationMs),
      status: "infrastructure-failure",
      failureStage: "revalidation",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: true,
      repairedToPass: false,
    };
  }
  const passed = second.report.status === "pass";
  return {
    ...resultBase(input, generation, repair, first.durationMs + second.durationMs),
    status: passed ? "complete" : "semantic-failure",
    ...(!passed ? { failureStage: "revalidation" as const } : {}),
    initialValidation: first.report,
    finalValidation: second.report,
    repairAttempted: true,
    repairedToPass: passed,
  };
}
