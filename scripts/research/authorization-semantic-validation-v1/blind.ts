import path from "node:path"
import { base, root, repo, load, save, hash } from "./evidence.ts"
import { positions } from "./study.ts"

// Same text is reviewed once; arm/phase mapping stays outside reviewer packets.
export async function prepareBlind(taskOnly?: string) {
  if (taskOnly && !["M", "G"].includes(taskOnly)) throw new Error("unknown-task")
  const tasks = taskOnly ? [taskOnly] : ["M", "G"]
  const ledger = await load(path.join(base, "attempts.json"))
  const selected = ledger.filter((e: any) => tasks.some(task => e.position.endsWith(`-${task}`)))
  if (positions.filter(position => tasks.some(task => position.endsWith(`-${task}`))).some(position => !selected.some((e: any) => e.position === position))
    || selected.some((e: any) => ["running", "unknown"].includes(e.status) || e.lifecycle?.localExecution !== "closed"))
    throw new Error("close-selected-task-queue-before-blind-review")
  const rubric = await load(path.join(base, "evaluation/rubric.json")), mapping: any[] = []
  for (const task of tasks) {
    const texts = new Map<string, { id: string; answer: string }>()
    for (const entry of ledger.filter((e: any) => e.position.endsWith(`-${task}`))) {
      if (!entry.session) { mapping.push({ position: entry.position, attempt: entry.attempt, status: entry.status, first: null, final: null }); continue }
      const run = await load(path.resolve(repo, entry.session, "run.json")), account = run.telemetry?.account
      const row: any = { position: entry.position, attempt: entry.attempt, status: entry.status, delivery: account?.answerDelivery,
        firstDelivery: account?.firstAnswer ? (account.firstAnswer.delivered ? "delivered" : "not-delivered") : "not-delivered",
        firstBasis: account?.firstAnswer?.basis, firstPhase: account?.firstAnswer?.phase }
      for (const [phase, answer] of [["first", account?.firstAnswer?.answer], ["final", account?.text]]) {
        if (typeof answer !== "string" || !answer.trim()) { row[phase!] = null; continue }
        const id = `${task}-${hash(answer).slice(0, 12)}`
        texts.set(id, { id, answer }); row[phase!] = id
      }
      mapping.push(row)
    }
    await save(path.join(base, `evaluation/blind-${task}.json`), { task, questions: rubric[task], coreRelations: rubric.coreRelations[task], severeUnsupportedClaims: rubric.severeUnsupportedClaims, scoring: rubric.scoring,
      sourceRoot: path.join(root, `authorization-domain-execution-v1/model/public-source/${task === "M" ? "memos" : "gitea"}`),
      instructions: "Read only this packet and its source anchors. Do not inspect attempts, runs, arm mappings or other result files. Evaluate every answer against the complete original question. Cite exact answer quotes and source file:line for incorrect/partial judgments; keep unverifiable deployment/commit facts unknown. Full/partial/incorrect/not-covered per domain, correct/incorrect/not-covered per core relation, severe unsupported claims and whole-task verdict. Also record whether the answer uses finite computation, but do not infer which experimental arm it belongs to.",
      answers: [...texts.values()].sort((a, b) => a.id.localeCompare(b.id)) })
  }
  await save(path.join(base, taskOnly ? `evaluation/blind-${taskOnly}-mapping.json` : "evaluation/blind-mapping.json"), { mapping })
  return { tasks, rows: mapping.length }
}
if (import.meta.main) console.log(JSON.stringify(await prepareBlind(process.argv[2]), null, 2))
