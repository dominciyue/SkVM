import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { hashAuthorizationRawOutput } from "../../../../../../src/benchmarks/authorization-dsl/evaluate.ts"

const root = path.resolve(import.meta.dir, "..")
const config = JSON.parse(await readFile(path.join(root, "panel-config.json"), "utf8"))
const cases = new Map(config.cases.map((item: any) => [item.id, item]))
const packet: any[] = []
for (const unit of config.units) {
  const stored = JSON.parse(await readFile(path.join(root, "runs", unit.id, "unit.json"), "utf8"))
  const session = path.join(root, "runs", unit.id, "sessions", stored.report.sessionId)
  const run = JSON.parse(await readFile(path.join(session, "run.json"), "utf8"))
  const artifact = run.finalKind ? run[run.finalKind] : null
  const result = artifact?.result?.results?.[0]
  const facts = result?.facts ?? {}
  packet.push({
    id: unit.id,
    caseId: unit.caseId,
    taskId: (cases.get(unit.caseId) as any).taskId,
    arm: unit.arm,
    wire: unit.wire,
    status: run.status,
    finalKind: run.finalKind,
    rawOutputSha256: artifact ? hashAuthorizationRawOutput(artifact.rawResponse) : null,
    canonicalConclusion: result?.conclusion ?? null,
    modelPolicyStatus: artifact?.wireResult?.results?.[0]?.policyStatus ?? null,
    explanation: result?.explanation ?? null,
    facts: Object.fromEntries(Object.entries(facts).map(([key, values]) => [key, Array.isArray(values) ? values.map((v: any) => v.statement) : values])),
    decisiveMissingFacts: result?.decisiveMissingFacts ?? null,
    suggestedObservations: result?.suggestedObservations ?? null,
    validation: artifact ? { structure: artifact.validation.structure.status, completeness: artifact.validation.completeness.status, diagnostics: artifact.validation.diagnostics.map((item: any) => item.code) } : null,
  })
}
const configSha256 = createHash("sha256").update(await readFile(path.join(root, "panel-config.json"))).digest("hex")
const output = { schemaVersion: "authorization-ae-review-packet/v1", configSha256, generationClosed: true, units: packet }
await writeFile(path.join(root, "evaluator", "answer-packet.json"), JSON.stringify(output, null, 2) + "\n")
console.log(JSON.stringify({ units: packet.length, completed: packet.filter(u => u.status === "completed").length, configSha256 }))
