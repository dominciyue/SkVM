import { mkdir, readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { checkAuthorizationInquiry, saveLocalInquiryCheck, inspectLocalInquiry, executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { projectProgramConsumption } from "../../../../../src/task-dsl/authorization/program-consumption-context.ts"

const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), example = path.join(repo, "examples/authorization-assessment/download-workflow"), bg = path.resolve(base, "../authorization-practical-execution-v1")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const save = async (p: string, value: unknown) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(value, null, 2) + "\n") }
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex")
const relative = (p: string) => path.relative(repo, p).split(path.sep).join("/")
async function prepareInputs() {
  for (const variant of ["root-default", "empty-version"]) {
    const origin = path.join(example, `inputs/${variant}.json`), input = await load(origin)
    input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(origin), input.sourceRoot)).split(path.sep).join("/")
    await save(path.join(base, `inputs/${variant}.json`), input)
  }
}
async function offline() {
  await prepareInputs()
  const original = await load(path.join(example, "program.json")), invalid = structuredClone(original)
  invalid.resourceWorkflow.steps.push({ id: "unrelated_missing_explanation", op: "value", value: { literal: 7 }, source: original.resourceWorkflow.steps[0].source })
  await save(path.join(base, "authoring/invalid-sibling.json"), invalid)
  const input = path.join(base, "inputs/root-default.json"), program = path.join(base, "authoring/invalid-sibling.json")
  const check = await checkAuthorizationInquiry(input, "D1", "question-checked-v1", program, { executionPolicy: "progressive" })
  const archived = await saveLocalInquiryCheck(input, program, path.join(base, "zero-model/invalid-sibling"), check, { executionPolicy: "progressive" })
  const inspected = await inspectLocalInquiry(archived.sessionPath)
  await save(path.join(base, "verification/invalid-sibling.json"), { providerCalls: 0, session: relative(archived.sessionPath), originalSteps: original.resourceWorkflow.steps.length, draftSteps: invalid.resourceWorkflow.steps.length, execution: inspected.execution.resourceExecution, passed: inspected.execution.resourceExecution.returned.file_document_id === 11 })
  const rawFile = path.join(bg, "runs/auto-author-cli-recovery/sessions/2026-10-12T082856436Z-9de5f95e/raw/tools.jsonl")
  const records = (await readFile(rawFile, "utf8")).trim().split(/\r?\n/).map(s => JSON.parse(s))
  const runtime = await createNativeInquiryRuntime({ inputFile: input, workDir: base, domainTools: true, strategy: "question-checked-v1", programMode: "edit", executionPolicy: "progressive", maxToolCalls: 256, maxReadBytes: 33554432, maxDisplayBytes: 786432 })
  const replay = []
  try {
    for (const [index, record] of records.entries()) if (["authorization_prepare_properties", "source_read", "authorization_program"].includes(record.call.name)) {
      const result = await runtime.execute(record.call)
      if (record.call.name === "authorization_program") replay.push({ originalLine: index + 1, original: record.call.arguments, originalRejection: record.exitCode, replay: JSON.parse(result.output), current: runtime.report().domain?.programDraft })
    }
  } finally { await runtime.close() }
  await save(path.join(base, "authoring/bg-three-proposals-replay.json"), { providerCalls: 0, original: relative(rawFile), note: "Historical proposals replayed without new model meanings; not automatic improvement evidence.", replay })
  const historical = await load(path.join(bg, "runs/authored-scenario/sessions/2026-10-12T083748641Z-043a6399/report.json"))
  const report = historical.domain.executableContract, compact = projectProgramConsumption(report, historical.program?.questions ?? historical.inquiry.questions, "compact")
  const toolFile = path.join(bg, "runs/authored-scenario/sessions/2026-10-12T083748641Z-043a6399/raw/tools.jsonl"), tools = (await readFile(toolFile, "utf8")).trim().split(/\r?\n/).map(s => JSON.parse(s))
  const counts: Record<string, number> = {}, readRanges: Record<string, number> = {}
  for (const { call } of tools) { counts[call.name] = (counts[call.name] ?? 0) + 1; if (call.name === "source_read") { const key = JSON.stringify(call.arguments); readRanges[key] = (readRanges[key] ?? 0) + 1 } }
  await save(path.join(base, "verification/bg-consumption-observation.json"), { providerCalls: 0, historicalToolCounts: counts, repeatedExactReadRanges: Object.entries(readRanges).filter(([, n]) => n > 1), originalContractBytes: Buffer.byteLength(JSON.stringify(report)), projectedCompactBytes: Buffer.byteLength(JSON.stringify(compact)), projectionOnly: true, actualHistoricalTransmission: historical.transmissionAccounting ?? historical.telemetry?.account?.transmissionAccounting ?? null, warning: "Projection bytes are not measured token savings. Exact repeated reads are separate from independent review and uncovered routing/filename duties; full actual provider payload is retained in BG raw." })
  console.log(JSON.stringify({ offline: "completed", retainedStepCounts: replay.map(r => r.current?.currentDraft?.raw?.resourceWorkflow?.steps?.length), returned: inspected.execution.resourceExecution.returned }))
}

async function run(position: string, attempt = "first") {
  if (!["A1", "C1", "C2", "P-full", "P-compact"].includes(position)) throw new Error("Unregistered position")
  await prepareInputs()
  const ledgerFile = path.join(base, "attempts.json"), ledger: any[] = await load(ledgerFile).catch(() => [])
  if (ledger.some(r => ["running", "unknown"].includes(r.status))) throw new Error("Inspect the original active/unknown lifecycle; no resend")
  if (ledger.some(r => r.position === position && r.attempt === attempt)) throw new Error("Attempt already recorded")
  if (ledger.some(r => r.quotaOrAuth) || ledger.slice(-2).length === 2 && ledger.slice(-2).every(r => r.routingFailure)) throw new Error("Account channel paused")
  if (attempt !== "first" && !/^(routing-recovery|shared-fix)-[a-z0-9-]+$/.test(attempt)) throw new Error("Use a named justified recovery")
  let domainProgramFile: string | undefined = position.startsWith("P-") ? path.join(example, "program.json") : position.startsWith("C") ? path.join(base, "authoring/automatic-program.json") : undefined
  if (position.startsWith("C")) {
    const automatic = await load(domainProgramFile!).catch(() => undefined)
    if (!automatic?.resourceWorkflow?.steps?.length) { ledger.push({ position, attempt, status: "not-run-missing-resource-program", providerCalls: 0 }); await save(ledgerFile, ledger); console.log("No automatic resource program; consumer not dispatched"); return }
  }
  const inputFile = path.join(base, `inputs/${position === "C2" ? "empty-version" : "root-default"}.json`), outDir = path.join(base, "runs", `${position}-${attempt}`)
  const c1 = [...ledger].reverse().find(r => r.position === "C1" && r.status === "completed")
  const entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), model: "gpt-5.6-sol", effort: "high", programContext: position === "P-full" ? "full" : "compact", inputHash: hash(await load(inputFile)), programHash: domainProgramFile ? hash(await load(domainProgramFile)) : null, input: relative(inputFile), source: "original allowed snapshot", originalQuestions: 4, limits: { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 } }
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ inputFile, domainProgramFile, outDir, model: "gpt-5.6-sol", method: "D1", strategy: "question-checked-v1", harness: "codex-account", programMode: position === "A1" ? "edit" : "consume", executionPolicy: "progressive", programContext: entry.programContext, ...(position === "C2" && c1 ? { previous: path.join(repo, c1.session) } : {}), accountBoundaryFile: path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json"), skillFile: path.resolve(base, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md"), execution: entry.limits })
    const account = report.telemetry.account
    Object.assign(entry, { status: report.status, endedAt: new Date().toISOString(), session: relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, inferenceDispatched: account.inferenceDispatched, reason: account.reason, quotaOrAuth: report.quotaRefused || /quota|authentication|unauthorized/i.test(account.reason ?? ""), routingFailure: /routing/i.test(account.reason ?? ""), usage: account.usage ?? null, durationMs: report.durationMs, returned: report.domain?.executableContract?.resourceExecution?.returned, resourceSteps: report.domain?.executableContract?.program?.resourceWorkflow?.steps?.length ?? 0, adoptedMaterials: report.domain?.materialUses?.length ?? 0 })
    if (report.status === "timeout-unknown") entry.status = "unknown"
    if (position === "A1") {
      const active = report.domain?.executableContract
      await save(path.join(base, "authoring/automatic-process.json"), { active, currentDraft: report.domain?.programDraft, proposals: report.domain?.proposals, history: (await load(path.join(report.sessionPath, "run.json"))).native?.history?.filter((h: any) => h.call.name.startsWith("authorization_program")), originalProgramBytesSource: "currentDraft raw; model-authored with mechanical source normalization kept separate" })
      if (active?.program?.resourceWorkflow?.steps?.length) await save(path.join(base, "authoring/automatic-program.json"), active.candidate?.adopted ? active.currentDraft.raw : active.program)
    }
    await save(ledgerFile, ledger); console.log(JSON.stringify(entry))
  } catch (error) { Object.assign(entry, { status: "unknown", error: String(error), endedAt: new Date().toISOString() }); await save(ledgerFile, ledger); throw error }
}
const [command, position, attempt] = process.argv.slice(2)
if (command === "offline") await offline()
else if (command === "run") await run(position!, attempt)
else if (command === "status") console.log(JSON.stringify(await load(path.join(base, "attempts.json")).catch(() => []), null, 2))
else throw new Error("Use offline | run A1/C1/C2/P-full/P-compact [named-attempt] | status")
