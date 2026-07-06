import type { SkillIR, Step } from "../schema";

export type ControllerStep = {
  id: string;
  title: string;
  kind: Step["kind"];
  required: boolean;
  dependsOn: string[];
  toolRefs: string[];
  checks: string[];
  produces: string[];
};

export type ControllerPlan = {
  skillId: string;
  skillName: string;
  intent: string;
  steps: ControllerStep[];
};

export function lowerToControllerPlan(ir: SkillIR): ControllerPlan {
  return {
    skillId: ir.id,
    skillName: ir.name,
    intent: ir.intent,
    steps: ir.steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      required: step.required,
      dependsOn: [...step.dependsOn],
      toolRefs: [...step.toolRefs],
      checks: [...step.successCheckRefs],
      produces: [...step.produces],
    })),
  };
}
