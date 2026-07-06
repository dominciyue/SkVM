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
