import type { AgentStep } from "../core/types.ts"

export interface SkillConsumptionAnalysis {
  skillRead: boolean
  helperInvoked: boolean
  helperSucceeded: boolean
  skillReadToolCallIds: string[]
  helperToolCallIds: string[]
  helperSuccessfulToolCallIds: string[]
  helperHelpToolCallIds: string[]
  helperFailedToolCallIds: string[]
  helperNotApplicableToolCallIds: string[]
  fallbackUsed: boolean
  declaredEntrypoints: string[]
  documentationOnly: boolean
  residualWorkRequired: boolean
  residualWorkCompleted: boolean
  taskOutcome: "passed" | "failed" | "not-checked"
  consumptionComplete: boolean
}

export interface AnalyzeSkillConsumptionOptions {
  skillPaths?: string[]
  executableEntries?: string[]
  documentationOnly?: boolean
  residualWorkRequired?: boolean
  /** Supplied only from an independent output/task check, never inferred from final prose. */
  residualWorkCompleted?: boolean
  /** Supplied by the task checker; helper success alone is not task success. */
  taskOutcome?: "passed" | "failed" | "not-checked"
}

function normalized(value: unknown): string {
  const text = typeof value === "string" ? value : String(JSON.stringify(value) ?? value ?? "")
  return text.replaceAll("\\", "/").toLowerCase()
}

function shellLike(name: string): boolean {
  return name.includes("bash") || name.includes("shell") || name.includes("exec") || name.includes("command")
}

function helpInvocation(input: string): boolean {
  return /(?:^|[\s"'])--help(?:[\s"']|$)|(?:^|[\s"'])-h(?:[\s"']|$)/u.test(input)
}

function outputProvesSuccess(output: string): boolean {
  return /"status"\s*:\s*"(?:passed|pass|success|approved)"/iu.test(output)
    || /"ok"\s*:\s*true/iu.test(output)
    || /(?:^|\n)result:\s*approved(?:\r?\n|$)/iu.test(output)
}

function outputProvesNotApplicable(output: string): boolean {
  return /"status"\s*:\s*"(?:unsupported|not-applicable)"/iu.test(output)
}

export function analyzeSkillConsumption(
  steps: AgentStep[],
  options: AnalyzeSkillConsumptionOptions = {},
): SkillConsumptionAnalysis {
  const skillPaths = (options.skillPaths ?? ["skill/SKILL.md"]).map(normalized)
  const declaredEntrypoints = options.executableEntries ?? ["api-task-solidify.js"]
  const normalizedEntrypoints = declaredEntrypoints.map(normalized)
  const skillReadToolCallIds: string[] = []
  const helperToolCallIds: string[] = []
  const helperSuccessfulToolCallIds: string[] = []
  const helperHelpToolCallIds: string[] = []
  const helperFailedToolCallIds: string[] = []
  const helperNotApplicableToolCallIds: string[] = []
  for (const step of steps) {
    for (const call of step.toolCalls) {
      const name = call.name.toLowerCase()
      const input = normalized(call.input)
      const readsByTool = name.includes("read")
      const readsByCommand = shellLike(name) && /(?:get-content|\bcat\b|\bsed\b|\bhead\b|\btype\b)/u.test(input)
      if ((readsByTool || readsByCommand) && skillPaths.some((skillPath) => input.includes(skillPath)) && call.exitCode !== 1) {
        skillReadToolCallIds.push(call.id)
      }
      if (shellLike(name) && normalizedEntrypoints.some((entry) => input.includes(entry))) {
        helperToolCallIds.push(call.id)
        if (helpInvocation(input)) {
          helperHelpToolCallIds.push(call.id)
        } else if (outputProvesNotApplicable(call.output ?? "")) {
          helperNotApplicableToolCallIds.push(call.id)
        } else if (call.exitCode === 0 && outputProvesSuccess(call.output ?? "")) {
          helperSuccessfulToolCallIds.push(call.id)
        } else {
          helperFailedToolCallIds.push(call.id)
        }
      }
    }
  }
  const helperSucceeded = helperSuccessfulToolCallIds.length > 0
  const documentationOnly = options.documentationOnly ?? false
  const residualWorkRequired = options.residualWorkRequired ?? false
  const residualWorkCompleted = options.residualWorkCompleted ?? false
  const taskOutcome = options.taskOutcome ?? "not-checked"
  const fallbackUsed = helperNotApplicableToolCallIds.length > 0 && taskOutcome === "passed"
  const helperRequirementMet = documentationOnly || declaredEntrypoints.length === 0 || helperSucceeded || fallbackUsed
  const consumptionComplete = skillReadToolCallIds.length > 0
    && helperRequirementMet
    && (!residualWorkRequired || residualWorkCompleted)
    && taskOutcome === "passed"
  return {
    skillRead: skillReadToolCallIds.length > 0,
    helperInvoked: helperToolCallIds.length > 0,
    helperSucceeded,
    skillReadToolCallIds,
    helperToolCallIds,
    helperSuccessfulToolCallIds,
    helperHelpToolCallIds,
    helperFailedToolCallIds,
    helperNotApplicableToolCallIds,
    fallbackUsed,
    declaredEntrypoints,
    documentationOnly,
    residualWorkRequired,
    residualWorkCompleted,
    taskOutcome,
    consumptionComplete,
  }
}
