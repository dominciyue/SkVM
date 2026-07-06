import type { SkillIR } from "../schema";

type ToolRequirement = SkillIR["tools"][number];
type EnvironmentAssumption = SkillIR["environment"][number];

export type AdapterSpec = {
  skillId: string;
  tools: ToolRequirement[];
  environment: EnvironmentAssumption[];
};

export function lowerToAdapterSpec(ir: SkillIR): AdapterSpec {
  return {
    skillId: ir.id,
    tools: ir.tools.map((tool) => ({
      ...tool,
      alternatives: [...tool.alternatives],
      platformNotes: { ...tool.platformNotes },
    })),
    environment: ir.environment.map((assumption) => ({
      ...assumption,
      platforms: [...assumption.platforms],
    })),
  };
}
