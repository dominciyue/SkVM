import type { RuntimeCheck, Rule, SkillIR } from "../schema";

export type TypedRepairKind =
  | "json-schema-contract"
  | "source-qualified-finding"
  | "source-audited-rule-enforcement";
export type TypedRepairCatalog =
  | "typed-output-repair/v1"
  | "typed-output-repair/v2"
  | "typed-output-repair/v3";

export type TypedRepairDirective = {
  id: string;
  kind: TypedRepairKind;
  targetRef: string;
  observationCount: number;
  distinctTaskCount: number;
  evidenceIds: string[];
};

type RepairTemplate = {
  targetRef: string;
  rule: Omit<Rule, "id">;
  check: Omit<RuntimeCheck, "id" | "targetRef">;
};

type TemplatedRepairKind = Exclude<TypedRepairKind, "source-audited-rule-enforcement">;

const REPAIR_TEMPLATES: Record<TemplatedRepairKind, RepairTemplate> = {
  "json-schema-contract": {
    targetRef: "rule-json-schema-contract",
    rule: {
      sourceText: "Typed development residual: generated schemas require canonical, evidence-grounded constraints.",
      level: "must",
      scope: "output",
      checkability: "runtime",
      severity: "high",
      normalizedForm: "Generated schemas use canonical JSON Schema vocabulary and infer types, formats, requiredness, ranges, lengths, and sensitivity only from current workspace evidence.",
    },
    check: {
      name: "Generated schema follows the evidence-grounded contract",
      kind: "output",
      assertion: "The generated schema uses canonical JSON Schema terms and every constraint is supported by current workspace evidence.",
      onFailure: "retry",
    },
  },
  "source-qualified-finding": {
    targetRef: "rule-source-qualified-findings",
    rule: {
      sourceText: "Typed development residual: code-derived findings require source-qualified locations.",
      level: "must",
      scope: "output",
      checkability: "runtime",
      severity: "high",
      normalizedForm: "Every code-derived hardcoded-secret or exposure-risk finding includes a repository-relative source path plus a symbol or location derived from the current workspace.",
    },
    check: {
      name: "Code-derived findings are source-qualified",
      kind: "output",
      assertion: "Each code-derived security or exposure finding includes a repository-relative source path and symbol or location found in the current workspace.",
      onFailure: "retry",
    },
  },
};

const REPAIR_TEMPLATES_V2: Record<TemplatedRepairKind, RepairTemplate> = {
  "json-schema-contract": {
    targetRef: "rule-json-schema-contract",
    rule: {
      sourceText: "Typed development residual: generated structured output must preserve the runtime contract.",
      level: "must",
      scope: "output",
      checkability: "runtime",
      severity: "high",
      normalizedForm: "The current request's explicit runtime output contract takes precedence over generic format conventions: preserve its exact top-level shape and allowed field names, then infer only evidence-grounded constraints within that shape.",
    },
    check: {
      name: "Generated structured output follows the explicit runtime contract",
      kind: "output",
      assertion: "The generated structured artifact preserves the exact top-level shape and allowed fields requested at runtime, with every inferred constraint supported by current workspace evidence.",
      onFailure: "retry",
    },
  },
  "source-qualified-finding": {
    targetRef: "rule-source-qualified-findings",
    rule: {
      sourceText: "Typed development residual: code-derived findings require stable source-qualified serialization.",
      level: "must",
      scope: "output",
      checkability: "runtime",
      severity: "high",
      normalizedForm: "Every code-derived hardcoded-secret or exposure-risk finding includes a repository-relative source path and symbol or location from the current workspace; when the runtime contract requires an array but does not define an object item schema, serialize each finding deterministically as path:symbol.",
    },
    check: {
      name: "Code-derived findings use stable source-qualified serialization",
      kind: "output",
      assertion: "Each code-derived finding follows the runtime item schema, or uses path:symbol when an array contract does not define an object item schema.",
      onFailure: "retry",
    },
  },
};

function templateFor(directive: TypedRepairDirective, catalog: TypedRepairCatalog): RepairTemplate {
  if (directive.kind === "source-audited-rule-enforcement") {
    throw new Error("source-audited-rule-enforcement does not materialize a repair template");
  }
  const templates = catalog === "typed-output-repair/v1" ? REPAIR_TEMPLATES : REPAIR_TEMPLATES_V2;
  const template = templates[directive.kind as TemplatedRepairKind];
  if (!template) {
    throw new Error(`Unsupported typed repair kind: ${String(directive.kind)}`);
  }
  if (directive.targetRef !== template.targetRef) {
    throw new Error(`Typed repair ${directive.id} targetRef must be ${template.targetRef}`);
  }
  return template;
}

export function applyTypedOutputRepairs(
  ir: SkillIR,
  directives: TypedRepairDirective[],
  catalog: TypedRepairCatalog = "typed-output-repair/v1",
): SkillIR {
  const rules = [...ir.rules];
  const checks = [...ir.checks];
  const baseRuleIds = new Set(ir.rules.map((rule) => rule.id));
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const checkIds = new Set(checks.map((check) => check.id));

  for (const directive of directives) {
    if (directive.kind === "source-audited-rule-enforcement") {
      if (catalog !== "typed-output-repair/v3") {
        throw new Error(`${directive.kind} requires typed-output-repair/v3`);
      }
      if (!directive.targetRef.startsWith("rule-") || !baseRuleIds.has(directive.targetRef)) {
        throw new Error(`Typed repair ${directive.id} must target an existing base IR rule`);
      }
      continue;
    }
    const template = templateFor(directive, catalog);
    if (!ruleIds.has(template.targetRef)) {
      rules.push({ id: template.targetRef, ...template.rule });
      ruleIds.add(template.targetRef);
    }

    const checkId = `check-${directive.kind === "source-qualified-finding" ? "source-qualified-findings" : directive.kind}`;
    if (!checkIds.has(checkId)) {
      checks.push({ id: checkId, targetRef: template.targetRef, ...template.check });
      checkIds.add(checkId);
    }
  }

  return { ...ir, rules, checks };
}
