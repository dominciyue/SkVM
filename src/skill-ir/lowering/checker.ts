import type { RuntimeCheck, SkillIR } from "../schema";

type RecoveryPolicy = SkillIR["recovery"][number];

export type CheckerSpec = {
  skillId: string;
  checks: RuntimeCheck[];
  recovery: RecoveryPolicy[];
};

export function lowerToCheckerSpec(ir: SkillIR): CheckerSpec {
  return {
    skillId: ir.id,
    checks: ir.checks.map((check) => ({ ...check })),
    recovery: ir.recovery.map((policy) => ({ ...policy })),
  };
}
