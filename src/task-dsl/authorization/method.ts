import type { AuthorizationRenderArm } from "./render.ts"
import type { AnalysisDiagnostic } from "./relations.ts"

export type AuthorizationMethod = "plain" | "ledger" | "conditions"
export type AuthorizationStudyArm = "P" | "L" | "C"
export interface AuthorizationMethodSelection {
  requested?: AuthorizationMethod
  effective: AuthorizationMethod
  selectionOrigin: "input-request" | "default" | "explicit" | "study"
  conditionRequestIgnored: boolean
}
export const methodStudyArm: Record<AuthorizationMethod, AuthorizationStudyArm> = {
  plain: "P", ledger: "L", conditions: "C",
}
export function resolveAuthorizationMethod(input: {
  method?: AuthorizationMethod
  studyArm?: AuthorizationStudyArm
  arm: AuthorizationRenderArm
  hasConditionRequest: boolean
}): { selection: AuthorizationMethodSelection; studyArm: AuthorizationStudyArm; diagnostics: AnalysisDiagnostic[] } {
  const effective = input.method ?? (input.studyArm
    ? ({ P: "plain", L: "ledger", C: "conditions" } as const)[input.studyArm]
    : input.hasConditionRequest ? "conditions" : "ledger")
  const diagnostics: AnalysisDiagnostic[] = []
  if (input.method && !(input.method in methodStudyArm)) {
    diagnostics.push({ code: "method-invalid", path: "method", message: "method must be plain, ledger, or conditions." })
  }
  if (input.method && input.arm !== "B") {
    diagnostics.push({ code: "method-arm-conflict", path: "arm", message: "Explicit method uses arm B; remove --arm=N|D or omit --method for the legacy renderer." })
  }
  if (input.method && input.studyArm && methodStudyArm[input.method] !== input.studyArm) {
    diagnostics.push({ code: "method-study-conflict", path: "method", message: "Public method and study arm must select the same method." })
  }
  if (effective === "conditions" && !input.hasConditionRequest) {
    diagnostics.push({ code: "method-needs-input", path: "conditionAnalysisRequest", message: "conditions needs a valid conditionAnalysisRequest with explicit conditionBindings; supply it before running." })
  }
  return {
    selection: {
      ...(input.method ? { requested: input.method } : {}), effective,
      selectionOrigin: input.method ? "explicit" : input.studyArm ? "study" : input.hasConditionRequest ? "input-request" : "default",
      conditionRequestIgnored: input.hasConditionRequest && effective !== "conditions",
    },
    studyArm: methodStudyArm[effective], diagnostics,
  }
}
