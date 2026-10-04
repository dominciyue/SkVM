import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { inquiryStepSchemas } from "../../../../../src/benchmarks/authorization-dsl/inquiry-wire.ts"
import { checkControlConclusions } from "../../../../../src/task-dsl/authorization/control-conclusion.ts"

const root = import.meta.dir
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const neutral = await json(path.join(root, "ordinary/natural-session-init-v1/process-result.json"))
const cases = { neutral: neutral.sessionPath, owui: path.join(root, "runs/quality-owui-ingestion-D1/attempt-2/sessions/2026-10-04T051403494Z-03df6c3d") }
const records = []
for (const [name, session] of Object.entries(cases)) {
  const bytes = await readFile(path.join(session, "run.json"), "utf8"), run = JSON.parse(bytes)
  const requests = run.requests.slice(-3).map((request: any, index: number) => {
    const content = request.params.messages.map((message: any) => message.content).join("\n")
    return { dispatch: run.requests.length - 2 + index, phase: request.phase, activeBranchDiagnosticOccurrences: content.split("active-branch-missing").length - 1, reservedFinal: content.includes("Reserved delivery opportunity:") }
  })
  const last = run.attempts.at(-1).response.toolCalls[0].arguments
  const parsed = inquiryStepSchemas("guided-evidence-v2", true, "behavior").schema.safeParse(last)
  const record: Record<string, unknown> = { name, session, runSha256: createHash("sha256").update(bytes).digest("hex"), providerCalls: run.telemetry.providerCalls, respondedCalls: run.telemetry.respondedCalls, requests, lastResponseRetainedAt: "/attempts/11/response/toolCalls/0/arguments", lastResponseEnvelopeValid: parsed.success, lastResponseEnvelopeIssues: parsed.success ? [] : parsed.error.issues, reportedWireFailureCount: run.wireFailures.length, targetExecutions: 0 }
  if (name === "neutral") {
    // Offline counterfactual only: expose the next mechanical error without
    // modifying any original answer or teaching a tested model these aliases.
    const candidate = structuredClone(run.final)
    const aliases: Record<string, string> = { "disabled-input": "inspect.disabled", "enabled-input": "inspect.enabled" }
    for (const branch of candidate.questions[0].branches) branch.id = aliases[branch.id] ?? branch.id
    record.identifierOnlyCounterfactual = { kind: "manual-deterministic-diagnostic-only", modelVisible: false, originalAnswerChanged: false, diagnostics: checkControlConclusions(run.program, run.domain.slice, candidate, run.domain.dependencies).diagnostics }
  }
  records.push(record)
}
const output = { schemaVersion: "authorization-ar-final-reservation-pointcheck/v1", records, providerCallsDuringPointcheck: 0, targetExecutions: 0, semanticPromotion: false }
await writeFile(path.join(root, "final-reservation-pointcheck.json"), JSON.stringify(output, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
console.log(JSON.stringify({ cases: records.length, providerCalls: 0, lastRawResponsesRetained: true, semanticPromotion: false }))
