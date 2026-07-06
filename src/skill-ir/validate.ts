import type { SkillIR } from "./schema";

export type ValidationReport = {
  errors: string[];
  warnings: string[];
};

export function validateSkillIR(ir: SkillIR): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stepIds = new Set(ir.steps.map((step) => step.id));
  const toolIds = new Set(ir.tools.map((tool) => tool.id));
  const checkIds = new Set(ir.checks.map((check) => check.id));

  for (const step of ir.steps) {
    for (const dependency of step.dependsOn) {
      if (!stepIds.has(dependency)) {
        errors.push(`step ${step.id} depends on missing step ${dependency}`);
      }
    }

    for (const toolRef of step.toolRefs) {
      if (!toolIds.has(toolRef)) {
        errors.push(`step ${step.id} references missing tool ${toolRef}`);
      }
    }

    for (const checkRef of step.successCheckRefs) {
      if (!checkIds.has(checkRef)) {
        errors.push(`step ${step.id} references missing check ${checkRef}`);
      }
    }

    if (step.required && step.successCheckRefs.length === 0 && step.produces.length === 0) {
      errors.push(`required step ${step.id} must define a success check or produced artifact`);
    }
  }

  for (const rule of ir.rules) {
    if (rule.severity === "high" && rule.level !== "should" && rule.checkability === "human") {
      warnings.push(`high severity rule ${rule.id} is only human-checkable`);
    }
  }

  if (ir.category.includes("environment-sensitive") && ir.environment.length === 0) {
    errors.push(`environment-sensitive skill ${ir.id} must define at least one environment assumption`);
  }

  return { errors, warnings };
}
