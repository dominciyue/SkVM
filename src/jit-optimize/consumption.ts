import type { AgentStep } from "../core/types.ts"

export interface SkillConsumptionAnalysis {
  skillRead: boolean
  helperInvoked: boolean
  helperSucceeded: boolean
  skillReadToolCallIds: string[]
  helperToolCallIds: string[]
}

function normalized(value: unknown): string {
  return JSON.stringify(value).replaceAll("\\", "/").toLowerCase()
}

export function analyzeSkillConsumption(steps: AgentStep[]): SkillConsumptionAnalysis {
  const skillReadToolCallIds: string[] = []
  const helperToolCallIds: string[] = []
  let helperSucceeded = false
  for (const step of steps) {
    for (const call of step.toolCalls) {
      const name = call.name.toLowerCase()
      const input = normalized(call.input)
      if (name.includes("read") && input.includes("skill/skill.md") && call.exitCode !== 1) {
        skillReadToolCallIds.push(call.id)
      }
      if ((name.includes("bash") || name.includes("shell") || name.includes("exec"))
        && input.includes("api-task-solidify.js")) {
        helperToolCallIds.push(call.id)
        if (call.exitCode === 0 && /"status"\s*:\s*"passed"/u.test(call.output ?? "")) {
          helperSucceeded = true
        }
      }
    }
  }
  return {
    skillRead: skillReadToolCallIds.length > 0,
    helperInvoked: helperToolCallIds.length > 0,
    helperSucceeded,
    skillReadToolCallIds,
    helperToolCallIds,
  }
}
