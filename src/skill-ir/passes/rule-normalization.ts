import type { RuntimeCheck, SkillIR } from "../schema";

function checkForRuntimeRule(rule: SkillIR["rules"][number]): RuntimeCheck {
  return {
    id: `check-${rule.id}`,
    name: `Check rule: ${rule.id}`,
    kind: rule.scope === "output" ? "output" : "rule-violation",
    targetRef: rule.id,
    assertion: rule.normalizedForm,
    onFailure: rule.severity === "high" ? "abort" : "report",
  };
}

export function normalizeRules(ir: SkillIR): SkillIR {
  const existingCheckIds = new Set(ir.checks.map((check) => check.id));
  const generatedChecks = ir.rules
    .filter((rule) => rule.checkability === "runtime")
    .map(checkForRuntimeRule)
    .filter((check) => !existingCheckIds.has(check.id));

  if (generatedChecks.length === 0) {
    return { ...ir, checks: [...ir.checks] };
  }

  return {
    ...ir,
    checks: [...ir.checks, ...generatedChecks],
  };
}
