import assert from "node:assert/strict"
import path from "node:path"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { localExplanationContext } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local-extraction.ts"
import { createControlSlice } from "../../../../../src/task-dsl/authorization/control-slice.ts"

const root = import.meta.dir, stage = "consume-authorization-cloudflare-download-repair-early-object-feedback-v1"
const sessions = path.join(root, "ordinary", stage, "run-archive", "sessions"), names = await readdir(sessions)
assert.equal(names.length, 1)
const run = JSON.parse(await readFile(path.join(sessions, names[0]!, "run.json"), "utf8"))
const finalItems = new Map<string, any>(run.domain.worklist.items.map((item: any) => [item.id, item]))
const rows = []
for (const [index, request] of run.requests.entries()) {
  const message = request.params.messages.at(-1).content as string
  const original = JSON.parse(message.match(/^Current local explanation context: (.*)$/m)![1]!)
  const state = JSON.parse(message.match(/^Domain execution state: (.*)$/m)![1]!)
  // Replay explanation selection only. Prefix dynamic fields are retained; final immutable duty text supplies projection-omitted fields.
  // Candidate arrays are excluded, so this replay makes no claim about location selection or a complete new prompt.
  const items = state.worklist.map((item: any) => ({ ...finalItems.get(item.id), ...item, candidates: [] }))
  const diagnostics = state.diagnostics.filter((d: any) => d.severity === "error")
  const questions = run.program.questions.filter((q: any) => diagnostics.some((d: any) => d.questionId ? d.questionId === q.id : d.path === q.id || d.path.startsWith(`${q.id}.`) || d.path.includes(`.${q.id}.`))).map((q: any) => q.id)
  const evidence = run.evidence.filter((e: any) => original.evidenceCatalog.some((reference: any) => reference.id === e.id))
  const slice = { ...createControlSlice(), rules: state.rules }
  const rendered = localExplanationContext(run.program, items, evidence, slice, [], original.sourceWindows.map((e: any) => e.id), 0, { offset: index * 2, questionIds: questions })
  assert.ok(rendered.tasks.length <= 2)
  assert.ok(rendered.sourceWindows.every(window => evidence.some((e: any) => e.id === window.id && e.text === window.text)))
  if (questions.length === 1 && questions[0] === "download-original-archive") assert.equal(rendered.tasks[0]?.question.id, "download-original-archive")
  rows.push({ request: index + 1, originalQuestionIds: original.tasks.map((t: any) => t.question.id), focusedQuestionIds: questions, revisedQuestionIds: rendered.tasks.map(t => t.question.id), originalItemIds: original.tasks.map((t: any) => t.itemId), revisedItemIds: rendered.tasks.map(t => t.itemId) })
}
const result = { schemaVersion: "authorization-ar-explanation-focus-replay/v1", stage, session: names[0], providerCalls: 0, targetExecutions: 0, originalValidation: run.validation.valid, promoted: false, scope: "Explanation selection from original projected prefix state plus final immutable duty text; location candidates excluded. All windows are original actual reads. No complete prompt simulation, new answer, source interpretation or original-state mutation.", rows }
await writeFile(path.join(root, "explanation-focus-replay.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ requests: rows.length, focusedRepairRequests: rows.filter(r => r.focusedQuestionIds.includes("download-original-archive")).length, providerCalls: 0, promoted: false }))
