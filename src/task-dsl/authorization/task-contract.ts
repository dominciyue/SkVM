export type AuthorizationTaskContractMode = "compatibility" | "current-v1"
export interface TaskContractMigration { source: string; original: string; effective: string; reason: string }
export interface TaskContractDiagnostic { code: "task-contract-format-conflict"; path: string; message: string; priority: "current-v1" }
const knownLegacyInstructions = new Map([
  ["return source_supported_failure, source_refuted, or unknown with exact supplied-source locations", "Use exact supplied-source locations to support the source-visible behavior and policy comparison."],
  ["return source_supported_failure, source_refuted, or unknown with exact input locations", "Use exact input locations to support the source-visible behavior and policy comparison."],
])
const legacyLabels = /\b(?:source_supported_failure|source_refuted)\b/
const imperative = /^\s*(?:return|output|emit|respond with|use)\b/i

/** Migrate only this product's known historical return instruction at its typed origin. */
export function resolveCurrentTaskContract(requiredAnalysis: readonly string[], markdownInstructions?: string, publicRequirementsText?: string):
  | { status: "ready"; originalRequiredAnalysis: string[]; effectiveRequiredAnalysis: string[]; migrations: TaskContractMigration[]; diagnostics: [] }
  | { status: "needs-input"; originalRequiredAnalysis: string[]; effectiveRequiredAnalysis: string[]; migrations: TaskContractMigration[]; diagnostics: TaskContractDiagnostic[] } {
  const migrations: TaskContractMigration[] = [], diagnostics: TaskContractDiagnostic[] = []
  const effectiveRequiredAnalysis = requiredAnalysis.map((value, index) => {
    const effective = knownLegacyInstructions.get(value.trim())
    if (effective) {
      migrations.push({ source: `task.requiredAnalysis.${index}`, original: value, effective,
        reason: "Known pre-v6 return label instruction; the v6 result contract owns the output shape." })
      return effective
    }
    if (legacyLabels.test(value) && imperative.test(value)) diagnostics.push({ code: "task-contract-format-conflict", path: `task.requiredAnalysis.${index}`,
      message: "Custom legacy label output instruction cannot be safely separated from the domain request. Use the current v6 result contract and restate domain analysis without a return format.", priority: "current-v1" })
    return value
  })
  if (markdownInstructions) for (const [index, line] of markdownInstructions.split(/\r?\n/).entries()) if (legacyLabels.test(line) && imperative.test(line)) diagnostics.push({ code: "task-contract-format-conflict", path: `researchInstructions.instructions.${index}`,
    message: "Independent instructions contain an unrecognized legacy output instruction; current v6 format has priority. Restate the domain request without that return format.", priority: "current-v1" })
  if (publicRequirementsText) for (const [index, line] of publicRequirementsText.split(/\r?\n/).entries()) if (legacyLabels.test(line) && imperative.test(line)) diagnostics.push({ code: "task-contract-format-conflict", path: `publicRequirementsText.${index}`,
    message: "Public requirements contain an unrecognized legacy output instruction; current v6 format has priority. Restate the domain request without that return format.", priority: "current-v1" })
  return { status: diagnostics.length ? "needs-input" : "ready", originalRequiredAnalysis: [...requiredAnalysis], effectiveRequiredAnalysis, migrations, diagnostics } as
    | { status: "ready"; originalRequiredAnalysis: string[]; effectiveRequiredAnalysis: string[]; migrations: TaskContractMigration[]; diagnostics: [] }
    | { status: "needs-input"; originalRequiredAnalysis: string[]; effectiveRequiredAnalysis: string[]; migrations: TaskContractMigration[]; diagnostics: TaskContractDiagnostic[] }
}

export class AuthorizationTaskContractError extends Error {
  constructor(readonly diagnostics: TaskContractDiagnostic[]) {
    super(diagnostics.map(item => `${item.path}: ${item.message}`).join("; "))
    this.name = "AuthorizationTaskContractError"
  }
}
