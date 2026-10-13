import { readFile, mkdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { createProgramDelivery, programDeliveryBasis, decideFinalProgramDelivery } from "../../../../../src/task-dsl/authorization/program-delivery.ts"
const base = import.meta.dir
const prior = path.resolve(base, "../authorization-recoverable-authoring-v1/runs/A1-first/sessions/2026-10-13T131135056Z-a9f9c20b")
const sha = (value: string) => createHash("sha256").update(value).digest("hex")
export async function replayHistoricalDelivery() {
  const bytes = await readFile(path.join(prior, "run.json"), "utf8"), run = JSON.parse(bytes), input = JSON.parse(await readFile(path.join(prior, "input.json"), "utf8"))
  const delivery = createProgramDelivery(), rows = []; let program: unknown
  let current = programDeliveryBasis({ task: input.inquiry, sources: run.sourceFiles, inputs: input.resourceInputs, program, sourceCurrent: true })
  for (const [index, turn] of run.telemetry.account.turns.entries()) {
    const calls = new Set(turn.tools.map((call: any) => call.id))
    for (const event of run.native.history) if (calls.has(event.call.id) && event.output?.executableContract) program = { draft: event.output.executableContract.currentDraft?.revision, active: event.output.executableContract.revision }
    current = programDeliveryBasis({ task: input.inquiry, sources: run.sourceFiles, inputs: { resourceInputs: input.resourceInputs, externalAssumptions: input.externalAssumptions, contractInputs: input.contractInputs }, program, sourceCurrent: run.sourceVerification.valid })
    delivery.record({ sequence: index + 1, phase: index === 0 ? "task-answer" : "author-edit", answer: turn.text, basis: current, delivered: turn.answerDelivery === "delivered" })
    rows.push({ turn: index + 1, program, textSha256: sha(turn.text), basis: current })
  }
  const result = delivery.snapshot(current), decision = decideFinalProgramDelivery({ delivery: result, terminal: "completed", remainingMs: 1000, budget: run.native.toolBudget, finalPhaseUsed: false })
  if (result.status !== "stale" || result.answer !== run.telemetry.account.turns[0].text || decision.runFinal) throw new Error("Historical changed-basis/finalOnly delivery regression")
  const observation = { origin: "BK A1 immutable snapshots, phases reconstructed from known author continuations", providerCalls: 0, originalRunSha256: sha(bytes), originalModified: false, historicalSuccessReclassified: false, rows, retainedAnswerTurn: result.selected?.sequence, currentDelivery: result.status, finalDelivered: result.finalDelivered, decision, finalOnly: run.native.toolBudget.finalOnly, note: "Actual second turn changed the program. The first answer is retained STALE, never promoted as a current improved answer; third editing text cannot replace it. No new answer was generated." }
  await mkdir(path.join(base, "verification"), { recursive: true })
  await writeFile(path.join(base, "verification/bk-a1-delivery-replay.json"), JSON.stringify(observation, null, 2) + "\n", "utf8")
  return observation
}
if (import.meta.main) console.log(JSON.stringify(await replayHistoricalDelivery()))
