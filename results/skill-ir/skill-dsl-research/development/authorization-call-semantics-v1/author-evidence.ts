import { readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import { projectProgramCallRelations } from "../../../../../src/task-dsl/authorization/program-obligations.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const rows = []
for (const a of await load(path.join(base, "attempts.json"))) {
  if (!a.session || a.status === "running" || !["A0", "A1", "S0"].includes(a.position)) continue
  const session = path.resolve(repo, a.session), run = await load(path.join(session, "run.json")), native = run.native, report = native.domain?.executableContract
  const history = native.history ?? [], reads = history.filter((h: any) => h.call.name === "source_read").map((h: any) => h.call.arguments)
  const edits = history.flatMap((h: any, i: number) => ["authorization_program", "authorization_program_patch"].includes(h.call.name) ? [{ ordinal: i + 1, tool: h.call.name, revision: h.output.currentDraft?.revision ?? h.output.executableContract?.currentDraft?.revision, adopted: h.output.candidate?.adopted ?? h.output.executableContract?.candidate?.adopted, editedSteps: (h.call.arguments.upsertSteps ?? h.call.arguments.resourceWorkflow?.steps ?? []).map((s: any) => ({ id: s.id, op: s.op, when: s.when, test: s.op === "guard" ? s.test : undefined })), diagnostics: h.output.diagnostics }] : [])
  const advertisements = []
  for (const file of (await readdir(path.join(session, "raw"))).filter(n => /^account-turn-\d+\.json$/.test(n))) {
    const turn = await load(path.join(session, "raw", file))
    for (const event of turn.events) if (event.direction === "client" && event.method === "thread/start") advertisements.push({ file, tools: event.params.dynamicTools?.filter((t: any) => ["authorization_program", "authorization_program_patch"].includes(t.name)).map((t: any) => ({ name: t.name, advertisesWhen: t.description.includes("when:finitePredicate"), advertisesCompletion: t.description.includes("False and None") })) })
  }
  rows.push({ purpose: a.position, attempt: a.attempt, session: a.session, terminal: a.terminalStatus, answerDelivery: a.answerDelivery, codeEpoch: a.codeEpoch, advertisements, reads, edits, finalRevision: report?.adoptedDraft?.revision, callRelations: projectProgramCallRelations(report?.adoptedDraft?.raw ?? report?.program, report?.resourceExecution), trials: native.domain?.programDraft?.trials?.map((t: any) => ({ revision: t.revision, cases: t.cases.map((c: any) => ({ id: c.id, termination: c.execution?.termination, conditions: c.execution?.conditions, calls: c.execution?.events?.filter((e: any) => e.op === "external").map((e: any) => ({ id: e.id, outcome: e.outcome, arguments: e.inputs?.arguments })) })) })) })
}
await writeFile(path.join(base, "evaluation/author-evidence.json"), JSON.stringify({ providerCalls: 0, semantics: "Author declarations and actual host events; source review remains independent.", rows }, null, 2) + "\n")
console.log(JSON.stringify(rows.map(r => ({ purpose: r.purpose, attempt: r.attempt, reads: r.reads.length, edits: r.edits.length, advertisements: r.advertisements }))))
