import type { RestrictedDomainPlan, RestrictedDomainPlanStep } from "./automatic-restricted-domain-plan";

export type RestrictedDomainPlanStaticType =
  | "string"
  | "string-array"
  | "record-array"
  | "boolean"
  | "json"
  | "unknown";

export type RestrictedDomainPlanStaticTypeIssue = {
  code: "text-binding-not-string";
  stepId: string;
  registerId: string;
  actualType: RestrictedDomainPlanStaticType;
};

function expressionType(
  expression: { kind: "ref"; ref: string } | { kind: "literal"; value: unknown },
  registers: Map<string, RestrictedDomainPlanStaticType>,
): RestrictedDomainPlanStaticType {
  if (expression.kind === "ref") return registers.get(expression.ref) ?? "unknown";
  return typeof expression.value === "string"
    ? "string"
    : typeof expression.value === "boolean"
      ? "boolean"
      : "json";
}

function stepOutputType(
  step: RestrictedDomainPlanStep,
  registers: Map<string, RestrictedDomainPlanStaticType>,
): RestrictedDomainPlanStaticType {
  switch (step.op) {
    case "read-text":
    case "write-text-template":
    case "copy-text":
      return "string";
    case "parse-key-value-lines":
    case "pluck":
    case "set-operation":
      return "string-array";
    case "regex-find-files":
    case "project-records":
      return "record-array";
    case "regex-test":
    case "boolean":
      return "boolean";
    case "read-json":
    case "json-pointer":
    case "write-json":
      return "json";
    case "filter-regex":
      return registers.get(step.source) ?? "unknown";
    case "choose": {
      const whenTrue = expressionType(step.whenTrue, registers);
      const whenFalse = expressionType(step.whenFalse, registers);
      return whenTrue === whenFalse ? whenTrue : "unknown";
    }
  }
}

export function auditRestrictedDomainPlanStaticTypes(
  plan: RestrictedDomainPlan,
): RestrictedDomainPlanStaticTypeIssue[] {
  const registers = new Map<string, RestrictedDomainPlanStaticType>();
  const issues: RestrictedDomainPlanStaticTypeIssue[] = [];
  for (const step of plan.steps) {
    if (step.op === "write-text-template") {
      for (const binding of step.bindings) {
        if (binding.encoding !== "text" || binding.value.kind !== "ref") continue;
        const actualType = registers.get(binding.value.ref) ?? "unknown";
        if (actualType !== "string" && actualType !== "unknown") {
          issues.push({
            code: "text-binding-not-string",
            stepId: step.id,
            registerId: binding.value.ref,
            actualType,
          });
        }
      }
    }
    registers.set(step.id, stepOutputType(step, registers));
  }
  return issues;
}

export function assertRestrictedDomainPlanStaticTypes(plan: RestrictedDomainPlan): void {
  const issues = auditRestrictedDomainPlanStaticTypes(plan);
  if (issues.length > 0) {
    throw new Error(`restricted Domain Plan static type check failed: ${JSON.stringify(issues)}`);
  }
}
