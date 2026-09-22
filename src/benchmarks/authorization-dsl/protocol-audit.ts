import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { extractStructured } from "../../providers/structured.ts"
import { AuthorizationWireResultV3Schema } from "../../task-dsl/authorization/transport.ts"
import type { AuthorizationTaskRun } from "./host.ts"

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
const yRoot = "results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1"
export async function auditAuthorizationProtocol() {
  const files = [...new Bun.Glob(`${yRoot}/migration/runs/y11-initial-v1/units/*-C/sessions/*/run.json`).scanSync({ cwd: repositoryRoot })].sort()
  const units = []
  let modelVisibleToolSchema: Record<string, unknown> = {}
  let fallbackPrompt = ""
  for (const relativePath of files) {
    const bytes = await readFile(path.join(repositoryRoot, relativePath), "utf8")
    const run = JSON.parse(bytes) as AuthorizationTaskRun
    const first = run.attempts[0]!
    const fallback = run.attempts[1]!
    const firstValue = first.response?.toolCalls[0]?.arguments
    const parsed = AuthorizationWireResultV3Schema.safeParse(firstValue)
    const fallbackValue = JSON.parse(fallback.response!.text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""))
    const fallbackParsed = AuthorizationWireResultV3Schema.safeParse(fallbackValue)
    if (!Object.keys(modelVisibleToolSchema).length) {
      await extractStructured({
        provider: {
          name: "offline-schema-capture",
          async complete(params) {
            if (params.tools) modelVisibleToolSchema = params.tools[0]!.inputSchema
            else fallbackPrompt = String(params.messages[0]!.content)
            return { text: params.tools ? "" : JSON.stringify(fallbackValue), toolCalls: [], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" }
          },
          async completeWithToolResults() { throw new Error("No executor") },
        }, schema: AuthorizationWireResultV3Schema, schemaName: "submit_authorization_result",
        schemaDescription: "Offline schema capture", prompt: run.renderedPrompt, maxRetries: 1,
      })
    }
    const total = (usage: typeof first.usage) => usage ? Object.values(usage).reduce((sum, n) => sum + n, 0) : 0
    units.push({
      path: relativePath.replaceAll("\\", "/"), sha256: createHash("sha256").update(bytes).digest("hex"),
      firstSchemaValid: parsed.success,
      diagnostics: parsed.success ? [] : parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message, code: issue.code })),
      firstRequest: first.request, fallbackRequest: fallback.request,
      firstKnownTokens: total(first.usage), fallbackKnownTokens: total(fallback.usage),
      fallbackSchemaValid: fallbackParsed.success,
    })
  }
  const syntheticBase = {
    schemaVersion: "source-authorization-assessment-wire/v3", results: [{ obligationId: "o::e", conclusion: "source_refuted", explanation: "Control denies.", facts: { entry: [], binding: [], control: [], effect: [], condition: [] }, decisiveMissingFacts: [], suggestedObservations: [] }],
    scopeClaim: { kind: "declared-obligations-only", statement: "Declared scope." }, coverage: [],
    conditionAnalysis: { schemaVersion: "authorization-condition-analysis-result/v1", analyses: [{ obligationId: "o::e", branches: [{ id: "b", obligationId: "o::e", assumptions: [{ conditionId: "c", value: "true" }], effect: "unknown", explanation: "Unknown external state.", factPointers: [], missingFacts: ["External state"] }], unexaminedConditionIds: [], completeness: "bounded", limitations: [] }] },
  }
  return {
    schemaVersion: "authorization-protocol-audit/v1", units, modelVisibleToolSchema, fallbackPrompt, syntheticBase,
    schemaProvenance: "Reconstructed through unchanged extractStructured converter; historic telemetry retained request summary, not raw HTTP body.",
    finding: "Required facts.condition, nested object shape and version constants are present in the visible schema. Converter omits strict additionalProperties and scalar/array bounds, but those omissions do not explain the retained missing-required/wrong-shape/wrong-constant failures. OpenAI-compatible route forwards parameters without strict:true; remote enforcement is unverified. No provider change justified for this experiment.",
    totals: { failedKnownTokens: units.reduce((s, u) => s + u.firstKnownTokens, 0), fallbackKnownTokens: units.reduce((s, u) => s + u.fallbackKnownTokens, 0) },
    remoteCalls: 0,
  }
}
if (import.meta.main) {
  const output = process.argv[2]
  if (!output) throw new Error("Provide audit output JSON path")
  await writeFile(output, `${JSON.stringify(await auditAuthorizationProtocol(), null, 2)}\n`, "utf8")
}
