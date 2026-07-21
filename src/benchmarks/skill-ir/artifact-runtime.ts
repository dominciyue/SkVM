import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SkvmTaskJson } from "./real-agent";
import {
  RuntimeValidationReportSchema,
  type RuntimeValidationReport,
} from "./artifact-package";
import {
  RuntimeSemanticValidationReportSchema,
  type RuntimeSemanticValidationReport,
} from "./semantic-contract";
import {
  RuntimePublicValidationReportSchema,
  type RuntimePublicValidationReport,
} from "./public-contract";
import {
  DeterministicRepairReportSchema,
  type DeterministicRepairReport,
} from "./deterministic-artifact-repairer";
import {
  materializeArtifactTemplates,
  verifyProtectedWorkdir,
  type PreparedArtifactRun,
} from "./artifact-preflight";
import {
  captureArtifactSnapshot,
  type ArtifactSnapshotReference,
} from "./artifact-snapshot";

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

export type AnyRuntimeValidationReport =
  | RuntimeValidationReport
  | RuntimeSemanticValidationReport
  | RuntimePublicValidationReport;

export type ArtifactRuntimeResult = {
  mode: ArtifactRepairMode;
  status: ArtifactRuntimeStatus;
  failureStage?: "generation" | "validation" | "deterministic-repair" | "repair" | "revalidation" | "protected-workdir" | "snapshot";
  generation: ArtifactCommandResult;
  repair?: ArtifactCommandResult;
  initialValidation?: AnyRuntimeValidationReport;
  finalValidation?: AnyRuntimeValidationReport;
  repairAttempted: boolean;
  repairedToPass: boolean;
  deterministicRepairAttempted?: boolean;
  deterministicRepairedToPass?: boolean;
  deterministicRepair?: DeterministicRepairReport;
  deterministicRepairDurationMs?: number;
  generationUsage?: ArtifactUsage;
  repairUsage?: ArtifactUsage;
  aggregateUsage: ArtifactUsage & { modelDurationMs: number };
  validationDurationMs: number;
  generationIdentity?: string;
  preRepairSnapshot?: ArtifactSnapshotReference;
  postRepairSnapshot?: ArtifactSnapshotReference;
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
  runDeterministicRepair?: (prepared: PreparedArtifactRun) => Promise<DeterministicRepairReport>;
  runValidator?: (prepared: PreparedArtifactRun) => Promise<AnyRuntimeValidationReport>;
  snapshot?: {
    snapshotRoot: string;
    generationIdentity: string;
  };
};

async function captureRuntimeSnapshot(
  input: ArtifactStateMachineInput,
  phase: "pre-repair" | "post-repair",
): Promise<ArtifactSnapshotReference | undefined> {
  if (!input.snapshot) return undefined;
  return captureArtifactSnapshot({
    workDir: input.prepared.workDir,
    protectedFiles: input.prepared.protectedFiles,
    snapshotRoot: input.snapshot.snapshotRoot,
    generationIdentity: input.snapshot.generationIdentity,
    phase,
  });
}

function snapshotFields(
  input: ArtifactStateMachineInput,
  preRepairSnapshot?: ArtifactSnapshotReference,
  postRepairSnapshot?: ArtifactSnapshotReference,
): Pick<ArtifactRuntimeResult, "generationIdentity" | "preRepairSnapshot" | "postRepairSnapshot"> {
  return {
    ...(input.snapshot ? { generationIdentity: input.snapshot.generationIdentity } : {}),
    ...(preRepairSnapshot ? { preRepairSnapshot } : {}),
    ...(postRepairSnapshot ? { postRepairSnapshot } : {}),
  };
}

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

function parseRuntimeReport(
  prepared: PreparedArtifactRun | undefined,
  report: unknown,
): AnyRuntimeValidationReport {
  const schemaVersion = typeof report === "object" && report !== null
    ? (report as { schemaVersion?: unknown }).schemaVersion
    : undefined;
  const publicContract = prepared?.catalog === "executable-public-contract-artifact/v3"
    || prepared?.catalog === "executable-contract-repair-artifact/v4"
    || schemaVersion === "runtime-validation-report/v3";
  if (publicContract) return RuntimePublicValidationReportSchema.parse(report);
  const semantic = prepared?.catalog === "executable-semantic-artifact/v2"
    || schemaVersion === "runtime-validation-report/v2";
  return semantic
    ? RuntimeSemanticValidationReportSchema.parse(report)
    : RuntimeValidationReportSchema.parse(report);
}

function protectedFailureReport(
  prepared: PreparedArtifactRun,
  paths: string[],
): AnyRuntimeValidationReport {
  return parseRuntimeReport(prepared, prepared.catalog === "executable-public-contract-artifact/v3"
    || prepared.catalog === "executable-contract-repair-artifact/v4" ? {
    schemaVersion: "runtime-validation-report/v3",
    codeCatalog: "public-contract-error-codes/v2",
    status: "fail",
    repairEligible: false,
    errors: paths.map((relativePath) => ({ code: "PROTECTED_FILE_MUTATED", relativePath })),
  } : prepared.catalog === "executable-semantic-artifact/v2" ? {
    schemaVersion: "runtime-validation-report/v2",
    codeCatalog: "semantic-error-codes/v1",
    status: "fail",
    repairEligible: false,
    errors: paths.map((relativePath) => ({ code: "PROTECTED_FILE_MUTATED", relativePath })),
  } : {
    schemaVersion: "runtime-validation-report/v1",
    status: "fail",
    repairEligible: false,
    errors: paths.map((relativePath) => ({ code: "PROTECTED_FILE_MUTATED", relativePath })),
  });
}

export function buildSanitizedRepairTask(
  report: AnyRuntimeValidationReport,
  prepared?: PreparedArtifactRun,
): SkvmTaskJson {
  const safe = parseRuntimeReport(prepared, report);
  if (safe.status !== "fail" || !safe.repairEligible) {
    throw new Error("A sanitized repair task requires an eligible failed ValidationReport");
  }
  const projection = safe.errors.map((error) => ({
    code: error.code,
    ...(error.relativePath === undefined ? {} : { relativePath: error.relativePath }),
    ...(error.jsonPointer === undefined ? {} : { jsonPointer: error.jsonPointer }),
    ...(error.missingField === undefined ? {} : { missingField: error.missingField }),
    ...(error.expectedType === undefined ? {} : { expectedType: error.expectedType }),
    ...("contractRef" in error && error.contractRef !== undefined
      ? { contractRef: error.contractRef }
      : {}),
    ...("operation" in error && error.operation !== undefined
      ? { operation: error.operation }
      : {}),
  }));
  return {
    id: "artifact-sanitized-repair",
    name: "Artifact Sanitized Repair",
    category: "skill-ir-artifact-repair",
    gradingType: "llm_judge",
    prompt: [
      "Repair only the declared generated artifacts in the current workdir.",
      "Do not modify any pre-existing file. Do not print or copy secret values.",
      ...(prepared?.catalog === "executable-semantic-artifact/v2"
        ? [`Inspect the protected runtime contract at ${prepared.package.manifest.runtimeContract.path}; do not modify it.`]
        : prepared?.catalog === "executable-public-contract-artifact/v3"
          ? [`Inspect the protected runtime contract at ${prepared.package.manifest.runtimeContract.path}; do not modify it.`]
          : prepared?.catalog === "executable-contract-repair-artifact/v4"
            ? [
                `Inspect the protected runtime contract at ${prepared.package.manifest.runtimeContracts.public.path}; do not modify it.`,
                `Inspect the protected repair contract at ${prepared.package.manifest.runtimeContracts.executableRepair.path}; do not modify it.`,
              ]
        : []),
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
  report: AnyRuntimeValidationReport,
): Promise<string> {
  const path = join(dirname(prepared.workDir), "task", "artifact-repair-task.json");
  await writeFile(path, `${JSON.stringify(buildSanitizedRepairTask(report, prepared), null, 2)}\n`, "utf8");
  return path;
}

export async function executeArtifactValidator(
  prepared: PreparedArtifactRun,
): Promise<AnyRuntimeValidationReport> {
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
  return parseRuntimeReport(prepared, parsed);
}

export async function executeArtifactDeterministicRepair(
  prepared: PreparedArtifactRun,
): Promise<DeterministicRepairReport> {
  if (prepared.catalog !== "executable-contract-repair-artifact/v4") {
    throw new Error("Deterministic artifact repair requires a V4 package");
  }
  const repairerPath = join(
    prepared.package.packageDir,
    prepared.package.manifest.deterministicRepairer.path,
  );
  const proc = Bun.spawn(
    [prepared.runtimeExecutable, repairerPath, `--workdir=${prepared.workDir}`],
    { stdout: "pipe", stderr: "pipe" },
  );
  let timedOut = false;
  const timeoutMs = prepared.package.manifest.deterministicRepairer.timeoutMs;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timer));
  if (timedOut) throw new Error(`Artifact deterministic repair timed out after ${timeoutMs}ms`);
  if (exitCode !== 0) {
    throw new Error(`Artifact deterministic repair failed with exit ${exitCode}: ${stderr.trim()}`);
  }
  try {
    return DeterministicRepairReportSchema.parse(JSON.parse(stdout.trim()));
  } catch {
    throw new Error("Artifact deterministic repair returned invalid JSON/report");
  }
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
): Promise<{ report: AnyRuntimeValidationReport; durationMs: number }> {
  const startedAt = Date.now();
  const report = parseRuntimeReport(
    input.prepared,
    await (input.runValidator ?? executeArtifactValidator)(input.prepared),
  );
  return { report, durationMs: Date.now() - startedAt };
}

async function runV4RepairPath(options: {
  input: ArtifactStateMachineInput;
  generation: ArtifactCommandResult;
  preRepairSnapshot?: ArtifactSnapshotReference;
  first: { report: AnyRuntimeValidationReport; durationMs: number };
}): Promise<ArtifactRuntimeResult> {
  const { input, generation, preRepairSnapshot, first } = options;
  const deterministicStartedAt = Date.now();
  let deterministicRepair: DeterministicRepairReport;
  try {
    deterministicRepair = await (input.runDeterministicRepair ?? executeArtifactDeterministicRepair)(
      input.prepared,
    );
  } catch {
    return {
      ...resultBase(input, generation, undefined, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "deterministic-repair",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: false,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: false,
      deterministicRepairDurationMs: Date.now() - deterministicStartedAt,
    };
  }
  const deterministicRepairDurationMs = Date.now() - deterministicStartedAt;
  const protectedAfterDeterministicRepair = await verifyProtectedWorkdir(input.prepared);
  if (!protectedAfterDeterministicRepair.ok) {
    const report = protectedFailureReport(
      input.prepared,
      protectedAfterDeterministicRepair.mutatedPaths,
    );
    return {
      ...resultBase(input, generation, undefined, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "protected-file-failure",
      failureStage: "protected-workdir",
      initialValidation: first.report,
      finalValidation: report,
      repairAttempted: false,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: false,
      deterministicRepair,
      deterministicRepairDurationMs,
    };
  }

  let second: { report: AnyRuntimeValidationReport; durationMs: number };
  try {
    second = await timedValidation(input);
  } catch {
    return {
      ...resultBase(input, generation, undefined, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "revalidation",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: false,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: false,
      deterministicRepair,
      deterministicRepairDurationMs,
    };
  }

  if (second.report.status === "pass" || input.mode === "check-only" || !second.report.repairEligible) {
    let postRepairSnapshot: ArtifactSnapshotReference | undefined;
    try {
      postRepairSnapshot = await captureRuntimeSnapshot(input, "post-repair");
    } catch {
      return {
        ...resultBase(input, generation, undefined, first.durationMs + second.durationMs),
        ...snapshotFields(input, preRepairSnapshot),
        status: "infrastructure-failure",
        failureStage: "snapshot",
        initialValidation: first.report,
        finalValidation: second.report,
        repairAttempted: false,
        repairedToPass: false,
        deterministicRepairAttempted: true,
        deterministicRepairedToPass: second.report.status === "pass",
        deterministicRepair,
        deterministicRepairDurationMs,
      };
    }
    const passed = second.report.status === "pass";
    return {
      ...resultBase(input, generation, undefined, first.durationMs + second.durationMs),
      ...snapshotFields(input, preRepairSnapshot, postRepairSnapshot),
      status: passed ? "complete" : "semantic-failure",
      ...(!passed ? { failureStage: "revalidation" as const } : {}),
      initialValidation: first.report,
      finalValidation: second.report,
      repairAttempted: false,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: passed,
      deterministicRepair,
      deterministicRepairDurationMs,
    };
  }

  const repairTask = buildSanitizedRepairTask(second.report, input.prepared);
  const repair = await input.runRepair(repairTask);
  if (!repair.ok) {
    return {
      ...resultBase(input, generation, repair, first.durationMs + second.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "repair",
      initialValidation: first.report,
      finalValidation: second.report,
      repairAttempted: true,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: false,
      deterministicRepair,
      deterministicRepairDurationMs,
    };
  }
  const protectedAfterModelRepair = await verifyProtectedWorkdir(input.prepared);
  if (!protectedAfterModelRepair.ok) {
    const report = protectedFailureReport(input.prepared, protectedAfterModelRepair.mutatedPaths);
    return {
      ...resultBase(input, generation, repair, first.durationMs + second.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "protected-file-failure",
      failureStage: "protected-workdir",
      initialValidation: first.report,
      finalValidation: report,
      repairAttempted: true,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: false,
      deterministicRepair,
      deterministicRepairDurationMs,
    };
  }

  let third: { report: AnyRuntimeValidationReport; durationMs: number };
  try {
    third = await timedValidation(input);
  } catch {
    return {
      ...resultBase(input, generation, repair, first.durationMs + second.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "revalidation",
      initialValidation: first.report,
      finalValidation: second.report,
      repairAttempted: true,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: false,
      deterministicRepair,
      deterministicRepairDurationMs,
    };
  }
  let postRepairSnapshot: ArtifactSnapshotReference | undefined;
  try {
    postRepairSnapshot = await captureRuntimeSnapshot(input, "post-repair");
  } catch {
    return {
      ...resultBase(input, generation, repair, first.durationMs + second.durationMs + third.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "snapshot",
      initialValidation: first.report,
      finalValidation: third.report,
      repairAttempted: true,
      repairedToPass: false,
      deterministicRepairAttempted: true,
      deterministicRepairedToPass: false,
      deterministicRepair,
      deterministicRepairDurationMs,
    };
  }
  const passed = third.report.status === "pass";
  return {
    ...resultBase(input, generation, repair, first.durationMs + second.durationMs + third.durationMs),
    ...snapshotFields(input, preRepairSnapshot, postRepairSnapshot),
    status: passed ? "complete" : "semantic-failure",
    ...(!passed ? { failureStage: "revalidation" as const } : {}),
    initialValidation: first.report,
    finalValidation: third.report,
    repairAttempted: true,
    repairedToPass: passed,
    deterministicRepairAttempted: true,
    deterministicRepairedToPass: false,
    deterministicRepair,
    deterministicRepairDurationMs,
  };
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
    const report = protectedFailureReport(input.prepared, protectedAfterGeneration.mutatedPaths);
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

  let preRepairSnapshot: ArtifactSnapshotReference | undefined;
  try {
    preRepairSnapshot = await captureRuntimeSnapshot(input, "pre-repair");
  } catch {
    return {
      ...resultBase(input, generation, undefined, 0),
      ...snapshotFields(input),
      status: "infrastructure-failure",
      failureStage: "snapshot",
      repairAttempted: false,
      repairedToPass: false,
    };
  }

  let first: { report: AnyRuntimeValidationReport; durationMs: number };
  try {
    first = await timedValidation(input);
  } catch {
    return {
      ...resultBase(input, generation, undefined, 0),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "validation",
      repairAttempted: false,
      repairedToPass: false,
    };
  }
  if (first.report.status === "pass") {
    let postRepairSnapshot: ArtifactSnapshotReference | undefined;
    try {
      postRepairSnapshot = await captureRuntimeSnapshot(input, "post-repair");
    } catch {
      return {
        ...resultBase(input, generation, undefined, first.durationMs),
        ...snapshotFields(input, preRepairSnapshot),
        status: "infrastructure-failure",
        failureStage: "snapshot",
        initialValidation: first.report,
        finalValidation: first.report,
        repairAttempted: false,
        repairedToPass: false,
      };
    }
    return {
      ...resultBase(input, generation, undefined, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot, postRepairSnapshot),
      status: "complete",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: false,
      repairedToPass: false,
    };
  }
  if (input.prepared.catalog === "executable-contract-repair-artifact/v4"
    && first.report.repairEligible) {
    return runV4RepairPath({ input, generation, preRepairSnapshot, first });
  }
  if (input.mode === "check-only" || !first.report.repairEligible) {
    let postRepairSnapshot: ArtifactSnapshotReference | undefined;
    try {
      postRepairSnapshot = await captureRuntimeSnapshot(input, "post-repair");
    } catch {
      return {
        ...resultBase(input, generation, undefined, first.durationMs),
        ...snapshotFields(input, preRepairSnapshot),
        status: "infrastructure-failure",
        failureStage: "snapshot",
        initialValidation: first.report,
        finalValidation: first.report,
        repairAttempted: false,
        repairedToPass: false,
      };
    }
    return {
      ...resultBase(input, generation, undefined, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot, postRepairSnapshot),
      status: "semantic-failure",
      failureStage: "validation",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: false,
      repairedToPass: false,
    };
  }

  const repairTask = buildSanitizedRepairTask(first.report, input.prepared);
  const repair = await input.runRepair(repairTask);
  if (!repair.ok) {
    return {
      ...resultBase(input, generation, repair, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
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
    const report = protectedFailureReport(input.prepared, protectedAfterRepair.mutatedPaths);
    return {
      ...resultBase(input, generation, repair, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "protected-file-failure",
      failureStage: "protected-workdir",
      initialValidation: first.report,
      finalValidation: report,
      repairAttempted: true,
      repairedToPass: false,
    };
  }

  let second: { report: AnyRuntimeValidationReport; durationMs: number };
  try {
    second = await timedValidation(input);
  } catch {
    return {
      ...resultBase(input, generation, repair, first.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "revalidation",
      initialValidation: first.report,
      finalValidation: first.report,
      repairAttempted: true,
      repairedToPass: false,
    };
  }
  let postRepairSnapshot: ArtifactSnapshotReference | undefined;
  try {
    postRepairSnapshot = await captureRuntimeSnapshot(input, "post-repair");
  } catch {
    return {
      ...resultBase(input, generation, repair, first.durationMs + second.durationMs),
      ...snapshotFields(input, preRepairSnapshot),
      status: "infrastructure-failure",
      failureStage: "snapshot",
      initialValidation: first.report,
      finalValidation: second.report,
      repairAttempted: true,
      repairedToPass: false,
    };
  }
  const passed = second.report.status === "pass";
  return {
    ...resultBase(input, generation, repair, first.durationMs + second.durationMs),
    ...snapshotFields(input, preRepairSnapshot, postRepairSnapshot),
    status: passed ? "complete" : "semantic-failure",
    ...(!passed ? { failureStage: "revalidation" as const } : {}),
    initialValidation: first.report,
    finalValidation: second.report,
    repairAttempted: true,
    repairedToPass: passed,
  };
}
