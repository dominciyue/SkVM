import type { AnyRuntimeValidationReport, ArtifactRuntimeMetadata } from "./artifact-runtime";
import type { ScoredAgentRunRow } from "./scoring";

export type FailureAuditClassification =
  | "success"
  | "infrastructure"
  | "scorer-failure-no-runtime"
  | "runtime-scorer-aligned-failure"
  | "runtime-false-pass"
  | "runtime-false-negative"
  | "repair-revalidation-failure"
  | "protected-workdir-failure";

export type AuditValidationError = {
  code: string;
  relativePath?: string;
  jsonPointer?: string;
  missingField?: string;
  expectedType?: string;
};

export type FailureAuditRecord = {
  schemaVersion: "skill-ir-failure-audit/v1";
  model?: string;
  systemLabel: string;
  task: string;
  runIndex?: number;
  panelConfigId?: string;
  success: boolean;
  evaluatorScore?: number;
  classification: FailureAuditClassification;
  failedCriteria: string[];
  criteria: Array<{ id: string; pass: boolean }>;
  runtime?: {
    mode: string;
    status: string;
    failureStage?: string;
    repairAttempted: boolean;
    repairedToPass: boolean;
    initial?: {
      status: string;
      errors: AuditValidationError[];
    };
    final?: {
      status: string;
      errors: AuditValidationError[];
    };
  };
};

function projectError(error: unknown): AuditValidationError {
  const value = error as Record<string, unknown>;
  return Object.fromEntries(
    ["code", "relativePath", "jsonPointer", "missingField", "expectedType"]
      .filter((field) => typeof value[field] === "string")
      .map((field) => [field, value[field]]),
  ) as AuditValidationError;
}

function projectValidation(
  report: AnyRuntimeValidationReport | undefined,
): { status: string; errors: AuditValidationError[] } | undefined {
  if (!report) return undefined;
  const value = report as unknown as { status: string; errors?: unknown[] };
  return {
    status: value.status,
    errors: (value.errors ?? []).map(projectError),
  };
}

function finalRuntimePass(runtime: ArtifactRuntimeMetadata): boolean {
  const report = runtime.finalValidation ?? runtime.initialValidation;
  return report?.status === "pass";
}

function classify(row: ScoredAgentRunRow): FailureAuditClassification {
  if (row.failureType === "infrastructure" || (row.runStatus && row.runStatus !== "ok")) {
    return "infrastructure";
  }
  const runtime = row.artifactRuntime;
  if (!runtime) return row.success ? "success" : "scorer-failure-no-runtime";
  if (runtime.status === "infrastructure-failure") return "infrastructure";
  if (runtime.status === "protected-file-failure") return "protected-workdir-failure";
  if (runtime.repairAttempted && !runtime.repairedToPass) return "repair-revalidation-failure";
  const runtimePass = finalRuntimePass(runtime);
  if (runtimePass && !row.success) return "runtime-false-pass";
  if (!runtimePass && row.success) return "runtime-false-negative";
  if (!runtimePass && !row.success) return "runtime-scorer-aligned-failure";
  return "success";
}

function systemLabel(row: ScoredAgentRunRow): string {
  return row.artifactRuntime?.mode ?? row.system;
}

export function auditScoredRows(rows: ScoredAgentRunRow[]): FailureAuditRecord[] {
  return rows.map((row) => ({
    schemaVersion: "skill-ir-failure-audit/v1",
    ...(row.model ? { model: row.model } : {}),
    systemLabel: systemLabel(row),
    task: row.task,
    ...(row.runIndex !== undefined ? { runIndex: row.runIndex } : {}),
    ...(row.panelConfigId ? { panelConfigId: row.panelConfigId } : {}),
    success: row.success,
    ...(row.evaluatorScore !== undefined ? { evaluatorScore: row.evaluatorScore } : {}),
    classification: classify(row),
    failedCriteria: [...row.failedCriteria],
    criteria: (row.evaluationSummary ?? [])
      .filter((criterion): criterion is typeof criterion & { id: string } => Boolean(criterion.id))
      .map((criterion) => ({ id: criterion.id, pass: criterion.pass })),
    ...(row.artifactRuntime
      ? {
          runtime: {
            mode: row.artifactRuntime.mode,
            status: row.artifactRuntime.status,
            ...(row.artifactRuntime.failureStage
              ? { failureStage: row.artifactRuntime.failureStage }
              : {}),
            repairAttempted: row.artifactRuntime.repairAttempted,
            repairedToPass: row.artifactRuntime.repairedToPass,
            ...(projectValidation(row.artifactRuntime.initialValidation)
              ? { initial: projectValidation(row.artifactRuntime.initialValidation) }
              : {}),
            ...(projectValidation(row.artifactRuntime.finalValidation)
              ? { final: projectValidation(row.artifactRuntime.finalValidation) }
              : {}),
          },
        }
      : {}),
  }));
}

export type CriterionTransition = {
  key: string;
  criterionId: string;
  miniPass: boolean;
  strongPass: boolean;
  transition:
    | "mini-fail-strong-pass"
    | "mini-pass-strong-fail"
    | "both-pass"
    | "both-fail";
};

function auditKey(row: FailureAuditRecord): string {
  return `${row.systemLabel}|${row.task}|${row.runIndex ?? 0}`;
}

export function compareCapabilityAudits(
  mini: FailureAuditRecord[],
  strong: FailureAuditRecord[],
): {
  schemaVersion: "skill-ir-capability-audit-comparison/v1";
  transitions: CriterionTransition[];
  capabilitySignalCandidates: number;
  causalClaimAvailable: false;
  unmatchedMiniRows: string[];
  unmatchedStrongRows: string[];
} {
  const miniByKey = new Map(mini.map((row) => [auditKey(row), row]));
  const strongByKey = new Map(strong.map((row) => [auditKey(row), row]));
  const transitions: CriterionTransition[] = [];
  for (const [key, miniRow] of miniByKey) {
    const strongRow = strongByKey.get(key);
    if (!strongRow) continue;
    const miniCriteria = new Map(miniRow.criteria.map((criterion) => [criterion.id, criterion.pass]));
    const strongCriteria = new Map(strongRow.criteria.map((criterion) => [criterion.id, criterion.pass]));
    for (const criterionId of [...miniCriteria.keys()].sort()) {
      const miniPass = miniCriteria.get(criterionId);
      const strongPass = strongCriteria.get(criterionId);
      if (miniPass === undefined || strongPass === undefined) continue;
      const transition = !miniPass && strongPass
        ? "mini-fail-strong-pass"
        : miniPass && !strongPass
          ? "mini-pass-strong-fail"
          : miniPass
            ? "both-pass"
            : "both-fail";
      transitions.push({ key, criterionId, miniPass, strongPass, transition });
    }
  }
  const unmatchedMiniRows = [...miniByKey.keys()].filter((key) => !strongByKey.has(key)).sort();
  const unmatchedStrongRows = [...strongByKey.keys()].filter((key) => !miniByKey.has(key)).sort();
  return {
    schemaVersion: "skill-ir-capability-audit-comparison/v1",
    transitions,
    capabilitySignalCandidates: transitions.filter(
      (transition) => transition.transition === "mini-fail-strong-pass",
    ).length,
    causalClaimAvailable: false,
    unmatchedMiniRows,
    unmatchedStrongRows,
  };
}
