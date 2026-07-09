import type { RuntimeCheck, SkillIR } from "../schema";

type RecoveryPolicy = SkillIR["recovery"][number];

function profileCheck(targetRef: string): RuntimeCheck {
  return {
    id: `check-${targetRef}-profile`,
    name: `Profile check for ${targetRef}`,
    kind: "step-success",
    targetRef,
    assertion: "Execution trace contains evidence that this required step completed.",
    onFailure: "retry",
  };
}

function profiledRuleCheck(rule: SkillIR["rules"][number]): RuntimeCheck {
  return {
    id: `check-${rule.id}-profile`,
    name: `Profile check for ${rule.id}`,
    kind: rule.scope === "output" ? "output" : "rule-violation",
    targetRef: rule.id,
    assertion: `Profile feedback observed repeated failures. Verify: ${rule.normalizedForm}`,
    onFailure: "retry",
  };
}

function retryRecovery(targetRef: string, evidenceCount: number): RecoveryPolicy {
  return {
    id: `recover-${targetRef}`,
    trigger: targetRef,
    action: "retry",
    maxAttempts: 1,
    explanation: `Profile-guided repair from ${evidenceCount} trace observations.`,
  };
}

export function applyProfileGuidedRepair(ir: SkillIR): SkillIR {
  const existingCheckIds = new Set(ir.checks.map((check) => check.id));
  const existingRecoveryIds = new Set(ir.recovery.map((policy) => policy.id));
  const rulesById = new Map(ir.rules.map((rule) => [rule.id, rule]));
  const generatedChecks: RuntimeCheck[] = [];
  const generatedRecovery: RecoveryPolicy[] = [];

  for (const annotation of ir.profile) {
    if (annotation.observation === "frequent-skip" && annotation.targetRef.startsWith("step-")) {
      const check = profileCheck(annotation.targetRef);
      if (!existingCheckIds.has(check.id)) {
        generatedChecks.push(check);
        existingCheckIds.add(check.id);
      }
    }

    if (annotation.observation === "frequent-failure" && annotation.targetRef.startsWith("rule-")) {
      const rule = rulesById.get(annotation.targetRef);
      if (rule) {
        const check = profiledRuleCheck(rule);
        if (!existingCheckIds.has(check.id)) {
          generatedChecks.push(check);
          existingCheckIds.add(check.id);
        }
      }
    }

    if (annotation.observation === "frequent-failure") {
      const recovery = retryRecovery(annotation.targetRef, annotation.evidenceCount);
      if (!existingRecoveryIds.has(recovery.id)) {
        generatedRecovery.push(recovery);
        existingRecoveryIds.add(recovery.id);
      }
    }
  }

  return {
    ...ir,
    checks: [...ir.checks, ...generatedChecks],
    recovery: [...ir.recovery, ...generatedRecovery],
  };
}
