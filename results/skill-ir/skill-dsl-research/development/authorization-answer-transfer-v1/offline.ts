// Evaluation-only extraction and finite execution. Never supplied to tested models.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { executeResourceWorkflow } from "../../../../../src/task-dsl/authorization/resource-relations.ts"
import { resolveProgramInputBinding } from "../../../../../src/task-dsl/authorization/program-input-binding.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { checkAuthorizationInquiry, saveLocalInquiryCheck } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { base, repo, load, save, hash, relative } from "./study.ts"

export async function archiveVersions(attempt = "first") {
  const entry = (await load(path.join(base, "attempts.json"))).find((e: any) => e.position === "A-M" && e.attempt === attempt)
  if (!entry?.session || entry.lifecycle?.localExecution !== "closed") throw new Error("author-not-closed")
  const rawDir = path.resolve(repo, entry.session, "raw"), rows: any[] = []
  const names = (await readdir(rawDir)).filter(n => /^program-checkpoint-\d+\.json$/.test(n)).sort((a,b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  for (const name of names) {
    const checkpointFile = path.join(rawDir, name), c = await load(checkpointFile), draft = c.draft?.currentDraft ?? c.active?.currentDraft
    if (!draft?.raw) continue
    const file = path.join(base, `authoring/versions/${attempt}/${name}`)
    await save(file, draft.raw)
    const candidate = c.draft?.candidate ?? c.active?.candidate, diagnostics = c.draft?.currentDraftDiagnostics ?? candidate?.diagnostics ?? []
    rows.push({ checkpoint: relative(checkpointFile), checkpointSha256: hash(await readFile(checkpointFile)), file: relative(file), sha256: hash(await readFile(file)), revision: draft.revision, activeRevision: c.active?.revision, candidateRevision: candidate?.revision, adopted: candidate?.adopted ?? false, diagnostics, structurallyValid: candidate?.revision === draft.revision && !diagnostics.some((d: any) => d.severity === "error"), toolUnit: c.output?.toolBudget?.totalUsed, tool: c.call?.name, execution: candidate?.resourceExecution })
  }
  const result = { providerCalls: 0, rows, first: rows[0]?.file ?? null, firstValid: rows.find(r => r.structurallyValid)?.file ?? null, last: rows.at(-1)?.file ?? null, selectionRule: "last submitted raw, never best score or active fallback" }
  await save(path.join(base, `authoring/versions-${attempt}.json`), result)
  const turnFiles = (await readdir(rawDir)).filter(n => /^account-turn-\d+\.json$/.test(n)).sort((a,b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  await mkdir(path.join(base, "evaluation/answers"), { recursive: true })
  for (const f of turnFiles) {
    const turn = await load(path.join(rawDir, f))
    await writeFile(path.join(base, `evaluation/answers/A-M-${attempt}-${f.replace(".json", "")}.txt`), turn.text ?? "", "utf8")
  }
  await save(path.join(base, `evaluation/author-checkpoint-timeline-${attempt}.json`), { providerCalls: 0, firstProposalToolUnit: rows[0]?.toolUnit ?? null, firstValidToolUnit: rows.find(r => r.structurallyValid)?.toolUnit ?? null, firstExecutionToolUnit: rows.find(r => r.execution?.events?.length)?.toolUnit ?? null, patches: rows.filter(r => r.tool === "authorization_program_patch").length, rows, note: "Full retained checkpoint, not compact tool-output projections, is authoritative for draft/candidate validity. Historical measurement helper can omit these fields in directed mode." })
  return { attempt, versions: rows.length, first: result.first, firstValid: result.firstValid, last: result.last }
}

export async function evaluateRaw(file: string, track: string) {
  if (!/^[a-z0-9-]+$/.test(track)) throw new Error("invalid-track")
  const full = path.resolve(repo, file), raw = await load(full), cases = await load(path.join(base, "evaluation/cases.json")), rows: any[] = []
  const checked: any = await checkAuthorizationInquiry(path.join(base, "inputs/memos-original.json"), "D1", "question-checked-v1", full, { executionPolicy: "progressive", programContext: "directed" })
  let session: string | undefined
  if (checked.status === "valid" && checked.executableContract && "evaluation" in checked.executableContract) {
    const archived = await saveLocalInquiryCheck(path.join(base, "inputs/memos-original.json"), full, path.join(base, `verification/${track}-archive`), checked, { executionPolicy: "progressive", programContext: "directed" })
    session = relative(archived.sessionPath)
  }
  for (const c of cases) {
    const binding = resolveProgramInputBinding(raw, compileAuthorizationInquiry(c.input.inquiry, { allowMissingPolicy: true }), c.input)
    let actual: any, failure: string | undefined
    try {
      if (!raw.resourceWorkflow || checked.status !== "valid") throw new Error("raw-has-no-consumable-resource-workflow")
      actual = executeResourceWorkflow(raw.resourceWorkflow, binding.resourceInputs, { progressive: true, externalAssumptions: binding.externalAssumptions })
    } catch (e) { failure = String(e) }
    rows.push({ name: c.name, group: c.group, expected: c.expected, sourceBasis: c.sourceBasis, binding, actual, failure, semanticReview: "pending; values and actual events do not certify source meaning" })
  }
  const result = { providerCalls: 0, targetExecutions: 0, program: relative(full), programSha256: hash(await readFile(full)), track, sourceCheck: checked.status, sourceDiagnostics: checked.executableContract?.diagnostics ?? checked.diagnostics, session, rows }
  await save(path.join(base, `evaluation/${track}/matrix.json`), result)
  return { track, cases: rows.length, sourceCheck: checked.status, session }
}
if (import.meta.main) {
  const [command, file, track] = process.argv.slice(2)
  console.log(JSON.stringify(command === "archive" ? await archiveVersions(file) : command === "evaluate" ? await evaluateRaw(file!, track!) : (() => { throw new Error("archive [ATTEMPT]|evaluate FILE TRACK") })(), null, 2))
}
