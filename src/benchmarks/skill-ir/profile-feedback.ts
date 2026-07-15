import type { ProfileAnnotation, SkillIR } from "../../skill-ir/schema";
import { buildProfileAnnotations } from "../../profiler/profile-annotation";
import { ExecutionTraceSchema, type ExecutionTrace, type TraceEvent } from "../../profiler/trace-schema";
import { insertEnvironmentGuards } from "../../skill-ir/passes/environment-guards";
import { applyProfileGuidedRepair } from "../../skill-ir/passes/profile-guided-repair";
import { normalizeRules } from "../../skill-ir/passes/rule-normalization";
import {
  applyTypedOutputRepairs,
  type TypedRepairCatalog,
  type TypedRepairDirective,
} from "../../skill-ir/passes/typed-output-repair";
import { validateSkillIR } from "../../skill-ir/validate";
import type { ExperimentSystem } from "./matrix";
import type { RunIdentity } from "./real-agent";
import type { ScoredAgentRunRow } from "./scoring";

export type ProfileFeedbackOptions = {
  sourceSystem?: ExperimentSystem;
  taskSplit?: string;
  minEvidence?: number;
};

export type ProfileOverlay = {
  skillId: string;
  annotations: ProfileAnnotation[];
  repairs?: TypedRepairDirective[];
  repairCatalog?: TypedRepairCatalog;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function runIdentityFromRow(row: ScoredAgentRunRow): RunIdentity | undefined {
  const values = [row.model, row.modelFamily, row.adapter, row.adapterVersion, row.runIndex, row.panelConfigId];
  const presentCount = values.filter((value) => value !== undefined).length;
  if (presentCount === 0) {
    return undefined;
  }
  if (presentCount !== values.length) {
    throw new Error(`Scored row ${row.caseId} must omit run identity or provide the complete run identity`);
  }

  return {
    model: row.model!,
    modelFamily: row.modelFamily!,
    adapter: row.adapter!,
    adapterVersion: row.adapterVersion!,
    runIndex: row.runIndex!,
    panelConfigId: row.panelConfigId!,
  };
}

function safeTraceId(row: ScoredAgentRunRow, identity?: RunIdentity): string {
  const baseId = `score-${row.caseId}-${row.system}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
  if (!identity) {
    return baseId;
  }

  return [
    baseId,
    `model=${encodeURIComponent(identity.model)}`,
    `modelFamily=${encodeURIComponent(identity.modelFamily)}`,
    `adapter=${encodeURIComponent(identity.adapter)}`,
    `adapterVersion=${encodeURIComponent(identity.adapterVersion)}`,
    `panelConfigId=${encodeURIComponent(identity.panelConfigId)}`,
    `runIndex=${identity.runIndex}`,
  ].join("-");
}

function normalizeCriterion(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

const CRITERION_RULE_HINTS: Record<string, string[]> = {
  "findings appear before summary.": ["rule-findings-first"],
  "behavioral bug is mentioned.": ["rule-prioritize-behavior"],
  "style-only issue is lower priority than behavioral bug.": ["rule-prioritize-behavior"],
  "missing or insufficient tests are mentioned.": ["rule-tests-mentioned", "rule-verify"],
  "root cause is mentioned.": ["rule-root-cause"],
  "concrete fix is mentioned.": ["rule-concrete-fix", "rule-fix"],
  "verification step is mentioned.": ["rule-verify", "rule-verify-after"],
  "platform difference is mentioned.": ["rule-name-platform"],
  "portable alternative is provided.": ["rule-portable-alternative"],
  "git status is mentioned.": ["rule-status-first"],
  "unrelated changes are preserved.": ["rule-preserve-user-work"],
  "destructive git commands are avoided.": ["rule-no-destructive-git"],
  "failing test is mentioned before implementation.": ["rule-test-first"],
  "required sections are present.": ["rule-required-sections"],
  "evidence limitation is mentioned.": ["rule-evidence-limits"],
  "actionable next step is mentioned.": ["rule-actionable-next-step"],
  "security or high-severity risk is prioritized.": ["rule-prioritize-security", "rule-prioritize-behavior"],
  "distracting warning is not treated as root cause.": ["rule-root-cause"],
  "node-based portable alternative is provided.": ["rule-portable-alternative"],
  "secret-like files are excluded from commit.": ["rule-preserve-user-work"],
  "edge-case failing test is mentioned.": ["rule-test-first"],
  "overclaiming is avoided.": ["rule-evidence-limits"],
};

function hasRule(ir: SkillIR, ruleId: string): boolean {
  return ir.rules.some((rule) => rule.id === ruleId);
}

function hasCheck(ir: SkillIR, checkId: string): boolean {
  return ir.checks.some((check) => check.id === checkId);
}

export function targetRefForFailedCriterion(criterion: string, ir: SkillIR): string {
  const normalizedCriterion = normalizeCriterion(criterion);

  const directRule = ir.rules.find((rule) => normalizeCriterion(rule.sourceText) === normalizedCriterion);
  if (directRule) {
    return directRule.id;
  }

  for (const ruleId of CRITERION_RULE_HINTS[normalizedCriterion] ?? []) {
    if (hasRule(ir, ruleId)) {
      return ruleId;
    }
  }

  const directCheck = ir.checks.find((check) => normalizeCriterion(check.name) === normalizedCriterion);
  if (directCheck) {
    return directCheck.id;
  }

  const fallbackRuleId = `rule-${slugify(criterion)}`;
  if (hasRule(ir, fallbackRuleId)) {
    return fallbackRuleId;
  }

  const fallbackCheckId = `check-${slugify(criterion)}`;
  if (hasCheck(ir, fallbackCheckId)) {
    return fallbackCheckId;
  }

  return fallbackRuleId;
}

function shouldUseRow(row: ScoredAgentRunRow, opts: ProfileFeedbackOptions): boolean {
  if (row.success) {
    return false;
  }
  if (row.failureType === "infrastructure") {
    return false;
  }
  if (opts.sourceSystem && row.system !== opts.sourceSystem) {
    return false;
  }
  if (opts.taskSplit && row.taskSplit !== opts.taskSplit) {
    return false;
  }
  return true;
}

function matchesRequestedEvidenceScope(row: ScoredAgentRunRow, opts: ProfileFeedbackOptions): boolean {
  if (opts.sourceSystem && row.system !== opts.sourceSystem) {
    return false;
  }
  if (opts.taskSplit && row.taskSplit !== opts.taskSplit) {
    return false;
  }
  return true;
}

function eventsForFailedCriteria(row: ScoredAgentRunRow, ir: SkillIR): TraceEvent[] {
  return row.failedCriteria
    .filter((criterion) => !criterion.toLowerCase().startsWith("process exited with code"))
    .map((criterion) => ({
      kind: "rule-violation" as const,
      targetRef: targetRefForFailedCriterion(criterion, ir),
      message: `Failed criterion: ${criterion}`,
    }));
}

export function scoredRowsToExecutionTraces(
  rows: ScoredAgentRunRow[],
  irBySkill: Map<string, SkillIR>,
  opts: ProfileFeedbackOptions = {},
): ExecutionTrace[] {
  const traces: ExecutionTrace[] = [];
  const identityByRow = new Map<ScoredAgentRunRow, RunIdentity | undefined>();
  const traceIds = new Set<string>();

  for (const row of rows) {
    if (matchesRequestedEvidenceScope(row, opts)) {
      identityByRow.set(row, runIdentityFromRow(row));
    }
  }

  for (const row of rows) {
    if (!shouldUseRow(row, opts)) {
      continue;
    }

    const ir = irBySkill.get(row.skill);
    if (!ir) {
      throw new Error(`Skill IR ${row.skill} was not found while building profile feedback`);
    }

    const events = eventsForFailedCriteria(row, ir);
    if (events.length === 0) {
      continue;
    }

    const identity = identityByRow.get(row);
    const traceId = safeTraceId(row, identity);
    if (traceIds.has(traceId)) {
      throw new Error(`Scored rows contain duplicate trace evidence ${traceId}`);
    }
    traceIds.add(traceId);
    traces.push(ExecutionTraceSchema.parse({
      schemaVersion: "skill-ir-trace/v1",
      traceId,
      skillId: row.skill,
      agent: row.agent,
      environment: row.environment,
      context: row.context,
      taskId: row.task,
      success: false,
      tokenCost: row.tokenCost ?? 0,
      latencyMs: row.latencyMs,
      events,
      ...identity,
    }));
  }

  return traces;
}

export function mergeProfileAnnotationsIntoIR(ir: SkillIR, annotations: ProfileAnnotation[]): SkillIR {
  const profileByKey = new Map<string, ProfileAnnotation>();

  for (const annotation of ir.profile) {
    profileByKey.set(`${annotation.targetRef}:${annotation.observation}`, annotation);
  }

  for (const annotation of annotations) {
    const key = `${annotation.targetRef}:${annotation.observation}`;
    const existing = profileByKey.get(key);
    profileByKey.set(
      key,
      existing
        ? {
            ...existing,
            evidenceCount: existing.evidenceCount + annotation.evidenceCount,
          }
        : annotation,
    );
  }

  return {
    ...ir,
    profile: [...profileByKey.values()],
  };
}

export function buildProfileOverlay(skillId: string, annotations: ProfileAnnotation[]): ProfileOverlay {
  return {
    skillId,
    annotations,
  };
}

export function compileFinalIR(baseIR: SkillIR, overlay: ProfileOverlay): SkillIR {
  if (overlay.skillId !== baseIR.id) {
    throw new Error(`Profile overlay skillId ${overlay.skillId} does not match base IR ${baseIR.id}`);
  }

  const withTypedRepairs = applyTypedOutputRepairs(
    baseIR,
    overlay.repairs ?? [],
    overlay.repairCatalog ?? "typed-output-repair/v1",
  );
  const withProfile = mergeProfileAnnotationsIntoIR(withTypedRepairs, overlay.annotations);
  const finalIR = applyProfileGuidedRepair(insertEnvironmentGuards(normalizeRules(withProfile)));
  const validation = validateSkillIR(finalIR);
  if (validation.errors.length > 0) {
    throw new Error(`Final IR ${baseIR.id} failed validation: ${validation.errors.join("; ")}`);
  }

  return finalIR;
}

export function buildProfiledIRFromScoredRows(
  ir: SkillIR,
  rows: ScoredAgentRunRow[],
  opts: ProfileFeedbackOptions = {},
): SkillIR {
  const traces = scoredRowsToExecutionTraces(rows, new Map([[ir.id, ir]]), opts);
  const annotations = buildProfileAnnotations(traces, { minEvidence: opts.minEvidence });
  return mergeProfileAnnotationsIntoIR(ir, annotations);
}
