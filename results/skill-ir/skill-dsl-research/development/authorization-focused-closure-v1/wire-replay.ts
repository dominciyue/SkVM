import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { root, sha } from "./prepare.ts"
import { InquiryAuthorTransportSchema, inquiryStepSchemas, normalizeFocusedControlEnvelope } from "../../../../../src/benchmarks/authorization-dsl/inquiry-wire.ts"
import { FocusedUpdateSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-focus.ts"
const sources = [
  { file: "runs/debug-paperless-share-create-D-F/attempt-4/report.json", sha256: "764b076f4ab143cae7accbe10988a7dba811411491cdbfa531eacff8ae5b6c30", author: true },
  { file: "runs/debug-gitea-create-issue-D-F/attempt-1/report.json", sha256: "5300077535ac2f82d85e4e1d3048ae6dd09b2f2bdc1f18d0fc6885748ad488ab", author: false },
]
export async function replayWire() {
  const records = []
  for (const source of sources) {
    const bytes = await readFile(path.join(root, source.file)), retained = JSON.parse(bytes.toString("utf8"))
    if (sha(bytes) !== source.sha256 || retained.report.telemetry.providerCalls !== retained.report.telemetry.respondedCalls) throw new Error("Original raw identity or known completion changed")
    for (const attempt of retained.report.attempts) {
      const raw = attempt.response?.toolCalls?.[0]?.arguments ?? (attempt.response?.text ? JSON.parse(attempt.response.text) : undefined)
      if (!raw) throw new Error("Expected an actual retained response")
      const declaration = source.author || attempt.request.toolNames.includes("submit_inquiry_declaration")
      if (declaration) {
        const parsed = InquiryAuthorTransportSchema.safeParse(raw)
        if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues))
        records.push({ original: source.file, originalSha256: source.sha256, attempt: attempt.id, rawSha256: sha(JSON.stringify(raw)), parsedSha256: sha(JSON.stringify(parsed.data)), result: "declaration-transport-valid", missingPremisesBecomeEmptyOnly: true })
      } else {
        const value = raw.value ?? raw, delta = value.controlDelta, stage = delta?.kind === "select" ? "locate" : "interpret"
        const parsed = inquiryStepSchemas("focused-closure-v1", false, "conformance", stage).schema.safeParse(value)
        if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues))
        const local = "controlDelta" in parsed.data ? FocusedUpdateSchema.safeParse(parsed.data.controlDelta) : undefined
        records.push({ original: source.file, originalSha256: source.sha256, attempt: attempt.id, rawSha256: sha(JSON.stringify(raw)), parsedSha256: sha(JSON.stringify(parsed.data)), result: "step-transport-valid", normalization: normalizeFocusedControlEnvelope(value).normalization ?? null, localBodyValid: local?.success, localDiagnostics: local && !local.success ? local.error.issues : [] })
      }
    }
  }
  if (!records.some(r => r.result === "step-transport-valid" && r.localBodyValid === false)) throw new Error("Malformed source content must remain rejected by the focus")
  return { schemaVersion: "authorization-at-wire-replay/v1", providerCalls: 0, targetExecutions: 0, originalBytesChanged: false, qualityClaim: "none; transport only; local invalid content remains a repairable failure", records }
}
if (import.meta.main) {
  const result = await replayWire()
  await writeFile(path.join(root, "repair-events/at8-focused-envelope-raw-replay.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ providerCalls: 0, responses: result.records.length, invalidLocalBodiesPreserved: result.records.filter(r => r.localBodyValid === false).length }))
}
