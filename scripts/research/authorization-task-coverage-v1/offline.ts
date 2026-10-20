// Evaluation-only; not exposed to the account workspace.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { checkAuthorizationInquiry, saveLocalInquiryCheck } from "../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, repo, load, save, hash, relative, checkRegistration } from "./study.ts"

export async function archiveVersions(task: string, attempt = "first") {
  const entry = (await load(path.join(base, "attempts.json"))).find((e: any) => e.position === `A-${task}` && e.attempt === attempt)
  if (!entry?.session || entry.lifecycle?.localExecution !== "closed") throw new Error("author-not-closed")
  const rawDir = path.resolve(repo, entry.session, "raw"), rows: any[] = []
  const names = (await readdir(rawDir)).filter(n => /^program-checkpoint-\d+\.json$/.test(n)).sort((a,b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  for (const name of names) {
    const checkpointFile = path.join(rawDir, name), c = await load(checkpointFile), draft = c.draft?.currentDraft ?? c.active?.currentDraft
    if (!draft?.raw) continue
    const file = path.join(base, `authoring/versions/${task}-${attempt}/${name}`)
    await save(file, draft.raw)
    const candidate = c.draft?.candidate ?? c.active?.candidate, diagnostics = c.draft?.currentDraftDiagnostics ?? candidate?.diagnostics ?? []
    rows.push({ checkpoint: relative(checkpointFile), checkpointSha256: hash(await readFile(checkpointFile)), file: relative(file), sha256: hash(await readFile(file)), revision: draft.revision, activeRevision: c.active?.revision, candidateRevision: candidate?.revision, adopted: candidate?.adopted ?? false, diagnostics, structurallyValid: candidate?.revision === draft.revision && !diagnostics.some((d: any) => d.severity === "error"), toolUnit: c.output?.toolBudget?.totalUsed, tool: c.call?.name, execution: candidate?.resourceExecution })
  }
  const result = { providerCalls: 0, rows, first: rows[0]?.file ?? null, firstValid: rows.find(r => r.structurallyValid)?.file ?? null, last: rows.at(-1)?.file ?? null, selectionRule: "last submitted raw, never best score or active fallback" }
  await save(path.join(base, `authoring/versions-${task}-${attempt}.json`), result)
  const turnFiles = (await readdir(rawDir)).filter(n => /^account-turn-\d+\.json$/.test(n)).sort((a,b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  await mkdir(path.join(base, "evaluation/answers"), { recursive: true })
  for (const file of turnFiles) {
    const turn = await load(path.join(rawDir, file))
    await writeFile(path.join(base, `evaluation/answers/A-${task}-${attempt}-${file.replace(".json", "")}.txt`), turn.text ?? "", "utf8")
  }
  return { task, attempt, versions: rows.length, first: result.first, firstValid: result.firstValid, last: result.last }
}
export async function evaluate(task: string, track = "final", programFile?: string) {
  await checkRegistration()
  if (!["M", "G"].includes(task) || !/^[a-z0-9-]+$/.test(track)) throw new Error("invalid-task-or-track")
  const full = programFile ? path.resolve(repo, programFile) : path.join(base, `authoring/${task}-automatic-program.json`)
  if (!await Bun.file(full).exists()) {
    const result = { providerCalls: 0, targetExecutions: 0, task, track, status: "no-raw-submitted", rows: [] }
    await save(path.join(base, `evaluation/${task}-${track}/matrix.json`), result); return result
  }
  const raw = await load(full), cases = (await load(path.join(base, "evaluation/cases.json"))).filter((c: any) => c.task === task), rows: any[] = []
  const inputFile = path.join(base, `inputs/${task === "M" ? "memos" : "gitea"}-original.json`)
  const checked: any = await checkAuthorizationInquiry(inputFile, "D1", "question-checked-v1", full, { executionPolicy: "progressive", programContext: "directed" })
  let session: string | undefined
  if (checked.status === "valid" && checked.executableContract && "evaluation" in checked.executableContract) {
    const archived = await saveLocalInquiryCheck(inputFile, full, path.join(base, `verification/${task}-${track}-archive`), checked, { executionPolicy: "progressive", programContext: "directed" })
    session = relative(archived.sessionPath)
  }
  for (const c of cases) {
    let actual: any, failure: string | undefined, binding: any, diagnostics: any
    try {
      if (!raw.resourceWorkflow || checked.status !== "valid") throw new Error("raw-has-no-consumable-resource-workflow")
      // Reuse the ordinary compiler, including unused-input warnings and
      // invalid-step handling. A direct evaluator call differs from the
      // progressive public entry when the dataset has undeclared facts.
      const caseFile = path.join(base, `evaluation/case-inputs/${task}-${track}/${c.name}.json`)
      const input = structuredClone(c.input)
      input.sourceRoot = path.relative(path.dirname(caseFile), path.resolve(path.dirname(inputFile), input.sourceRoot)).replaceAll("\\", "/")
      await save(caseFile, input)
      const current: any = await checkAuthorizationInquiry(caseFile, "D1", "question-checked-v1", full, { executionPolicy: "progressive", programContext: "directed" })
      if (current.status !== "valid") throw new Error(JSON.stringify(current.diagnostics))
      actual = current.executableContract?.resourceExecution
      binding = current.executableContract?.inputBinding
      diagnostics = current.executableContract?.diagnostics
    } catch (error) { failure = String(error) }
    rows.push({ name: c.name, expected: c.expected, checks: c.checks, sourceBasis: c.sourceBasis, binding, diagnostics, actual, failure, semanticReview: "pending; scalar values, actual events, source order and full natural answer are separate" })
  }
  await save(path.join(base, `evaluation/${task}-${track}/matrix.json`), { providerCalls: 0, targetExecutions: 0, task, program: relative(full), programSha256: hash(await readFile(full)), track, sourceCheck: checked.status, sourceDiagnostics: checked.executableContract?.diagnostics ?? checked.diagnostics, session, rows })
  const compact = rows.map(r => ({ name: r.name, expected: r.expected, actual: r.actual && { returned: r.actual.returned, termination: r.actual.termination, conditions: r.actual.conditions, gaps: r.actual.gaps, events: r.actual.events.map((e: any) => ({ id: e.id, op: e.op, source: e.source, outcome: e.outcome, value: e.outputs?.value })) }, failure: r.failure }))
  await save(path.join(base, `evaluation/${task}-${track}/review-view.json`), compact)
  return { task, track, cases: rows.length, sourceCheck: checked.status, session, outcomes: rows.map(r => ({ name: r.name, termination: r.actual?.termination, returned: r.actual?.returned, conditions: r.actual?.conditions?.length, failure: r.failure })) }
}
export async function actualUse() {
  const rows: any[] = []
  for (const entry of await load(path.join(base, "attempts.json"))) {
    if (!entry.session || entry.lifecycle?.localExecution !== "closed") continue
    const run = await load(path.resolve(repo, entry.session, "run.json")), history = run.native?.history ?? [], contract = run.domain?.executableContract
    const count = (name: string) => history.filter((h: any) => h.call?.name === name).length
    rows.push({ position: entry.position, attempt: entry.attempt, session: entry.session, programSupport: entry.programSupport, effectiveProgramSupport: entry.effectiveProgramSupport ?? entry.programSupport, fixedRawSha256: entry.programSha256, codeEpoch: entry.codeEpoch,
      actualToolCounts: Object.fromEntries([...new Set<string>(history.map((h: any) => h.call?.name).filter(Boolean))].map(name => [name, count(name)])),
      reads: history.filter((h: any) => h.call?.name === "source_read").map((h: any) => ({ ...h.call.arguments, exitCode: h.exitCode })),
      hostExecution: { events: contract?.resourceExecution?.events?.length ?? 0, activeRevision: contract?.revision, returned: contract?.resourceExecution?.returned, termination: contract?.resourceExecution?.termination, conditions: contract?.resourceExecution?.conditions },
      naturalAdoption: "requires original client packets and natural answer review; host execution and E label alone do not establish adoption",
      rulesExecutionLeak: (entry.effectiveProgramSupport ?? entry.programSupport) === "rules" && !!contract?.resourceExecution,
      account: { answerDelivery: entry.answerDelivery, usage: entry.usage, turns: entry.turns?.length }, targetExecution: false })
  }
  await save(path.join(base, "evaluation/actual-use.json"), { providerCalls: 0, rows })
  return rows.map(r => ({ position: r.position, tools: r.actualToolCounts, events: r.hostExecution.events, rulesExecutionLeak: r.rulesExecutionLeak }))
}
if (import.meta.main) {
  const [command, a, b, c] = process.argv.slice(2)
  console.log(JSON.stringify(command === "archive" ? await archiveVersions(a!, b) : command === "evaluate" ? await evaluate(a!, b, c) : command === "actual-use" ? await actualUse() : (() => { throw new Error("archive M/G ATTEMPT|evaluate M/G TRACK [PROGRAM]|actual-use") })(), null, 2))
}
