import type { RuntimeCheck, SkillIR } from "../schema";

function availabilityAssertion(tool: SkillIR["tools"][number]): string {
  const alternatives = tool.alternatives.length > 0 ? tool.alternatives.join(", ") : "none";
  return `${tool.name} is available or an alternative exists: ${alternatives}`;
}

function guardForTool(tool: SkillIR["tools"][number]): RuntimeCheck {
  return {
    id: `preflight-${tool.id}`,
    name: `Check ${tool.name} availability`,
    kind: "preflight",
    targetRef: tool.id,
    command: tool.availabilityCheck,
    assertion: availabilityAssertion(tool),
    onFailure: tool.alternatives.length > 0 ? "fallback" : "abort",
  };
}

export function insertEnvironmentGuards(ir: SkillIR): SkillIR {
  const existingCheckIds = new Set(ir.checks.map((check) => check.id));
  const generatedGuards = ir.tools
    .filter((tool) => tool.required)
    .map(guardForTool)
    .filter((check) => !existingCheckIds.has(check.id));

  if (generatedGuards.length === 0) {
    return { ...ir, checks: [...ir.checks] };
  }

  return {
    ...ir,
    checks: [...generatedGuards, ...ir.checks],
  };
}
