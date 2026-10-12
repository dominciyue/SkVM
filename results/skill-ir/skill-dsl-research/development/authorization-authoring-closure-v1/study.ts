import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

const base = import.meta.dir, repo = path.resolve(base, "../../../../.."), example = path.join(repo, "examples/authorization-assessment/download-workflow")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const save = async (p: string, value: unknown) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(value, null, 2) + "\n", "utf8") }
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const relative = (p: string) => path.relative(repo, p).split(path.sep).join("/")
const ledgerFile = path.join(base, "attempts.json")
const positions = ["A1", "A2", "C1", "C2", "P0-full", "P0-compact", "P1-compact", "P1-full"]
const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
async function prepare() {
  for (const variant of ["root-default", "empty-version"]) {
    const origin = path.join(example, `inputs/${variant}.json`), input = await load(origin)
    input.sourceRoot = path.relative(path.join(base, "inputs"), path.resolve(path.dirname(origin), input.sourceRoot)).split(path.sep).join("/")
    await save(path.join(base, `inputs/${variant}.json`), input)
  }
}
async function codeEpoch() {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
  const untracked = git("ls-files", "--others", "--exclude-standard", "--", "src").split(/\r?\n/).filter(Boolean)
  const newFiles = await Promise.all(untracked.map(async p => ({ path: p, sha256: hash(await readFile(path.join(repo, p))) })))
  return { commit: git("rev-parse", "HEAD"), sourceDiffSha256: hash(git("diff", "HEAD", "--", "src") + JSON.stringify(newFiles)) }
}
async function run(position: string, attempt = "first") {
  if (!positions.includes(position)) throw new Error("Unregistered finite position")
  await prepare()
  const ledger: any[] = await load(ledgerFile)
  if (ledger.some(e => ["running", "unknown", "timeout-unknown", "completion-unknown"].includes(e.status))) throw new Error("Inspect the original unresolved lifecycle; never resend")
  if (ledger.some(e => e.position === position && e.attempt === attempt)) throw new Error("Attempt already recorded")
  if (ledger.some(e => e.quotaOrAuth) || ledger.filter(e => e.routingFailure).length >= 3 || ledger.slice(-2).length === 2 && ledger.slice(-2).every(e => e.routingFailure)) throw new Error("Official account channel paused")
  if (attempt !== "first" && !/^(routing-recovery|shared-fix)-[a-z0-9-]+$/.test(attempt)) throw new Error("Recovery needs a named diagnosed cause")
  const author = position.startsWith("A"), variant = position === "C2" || position.startsWith("P1") ? "empty-version" : "root-default"
  const inputFile = path.join(base, `inputs/${variant}.json`), programContext = position.endsWith("compact") ? "compact" : "full"
  const domainProgramFile = author ? undefined : position.startsWith("C") ? path.join(base, "authoring/automatic-program.json") : path.join(example, "program.json")
  const a1 = [...ledger].reverse().find(e => e.position === "A1" && e.session && !e.routingFailure), c1 = [...ledger].reverse().find(e => e.position === "C1" && e.status === "completed")
  if (position === "A2") {
    const assessment = await load(path.join(base, "authoring/a1-assessment.json"))
    if (!a1 || assessment.complete !== false) { ledger.push({ position, attempt, status: "not-run-a1-complete-or-unavailable", providerCalls: 0 }); await save(ledgerFile, ledger); return }
  }
  const programBytes = domainProgramFile ? await readFile(domainProgramFile).catch(() => undefined) : undefined
  if (position.startsWith("C") && !programBytes) { ledger.push({ position, attempt, status: "not-run-missing-executable-automatic-program", providerCalls: 0 }); await save(ledgerFile, ledger); return }
  if (!author && !programBytes) throw new Error("Fixed program missing")
  const entry: any = { position, attempt, status: "running", startedAt: new Date().toISOString(), model: "gpt-5.6-sol", effort: "high", programMode: author ? "edit" : "consume", programContext, variant, input: relative(inputFile), inputSha256: hash(await readFile(inputFile)), program: domainProgramFile && relative(domainProgramFile), programSha256: programBytes && hash(programBytes), codeEpoch: await codeEpoch(), originalQuestions: 4, limits, command: `bun run ./${relative(path.join(base, "study.ts"))} run ${position} ${attempt}` }
  ledger.push(entry); await save(ledgerFile, ledger)
  try {
    const report: any = await executeLocalInquiryRun({ inputFile, domainProgramFile, outDir: path.join(base, "runs", `${position}-${attempt}`), model: entry.model, method: "D1", strategy: "question-checked-v1", harness: "codex-account", programMode: entry.programMode, executionPolicy: "progressive", programContext, ...(position === "A2" ? { previous: path.join(repo, a1.session) } : position === "C2" && c1 ? { previous: path.join(repo, c1.session) } : {}), accountBoundaryFile: path.resolve(base, "../authorization-executable-contract-v1/account-boundary.json"), skillFile: path.resolve(base, "../authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md"), execution: limits })
    const account = report.telemetry?.account
    Object.assign(entry, { status: report.status, endedAt: new Date().toISOString(), session: report.sessionPath && relative(report.sessionPath), terminalStatus: report.terminalStatus, answerDelivery: report.answerDelivery, inferenceDispatched: account?.inferenceDispatched ?? false, reason: account?.reason ?? report.error ?? report.recovery, quotaOrAuth: report.quotaRefused || /quota|authentication|unauthorized/i.test(account?.reason ?? ""), routingFailure: /routing/i.test(account?.reason ?? ""), usage: account?.usage ?? null, durationMs: report.durationMs, returned: report.domain?.executableContract?.resourceExecution?.returned, resourceSteps: report.domain?.executableContract?.program?.resourceWorkflow?.steps?.length ?? 0, sourceIdentity: report.sourceFiles, actualUsd: null })
    if (["timeout-unknown", "completion-unknown"].includes(report.status)) entry.status = "unknown"
    if (author && report.domain) {
      await save(path.join(base, `authoring/${position}-process.json`), { session: entry.session, active: report.domain.executableContract, draft: report.domain.programDraft, proposals: report.domain.proposals })
      const adopted = report.domain.executableContract?.adoptedDraft
      if (adopted?.raw?.resourceWorkflow?.steps?.length) await save(path.join(base, `authoring/automatic-program-${position}.json`), adopted.raw)
      if (report.domain.programDraft?.currentDraft) await save(path.join(base, `authoring/current-draft-${position}.json`), report.domain.programDraft.currentDraft)
    }
    await save(ledgerFile, ledger); console.log(JSON.stringify(entry))
  } catch (error) {
    Object.assign(entry, { status: "unknown", error: String(error), endedAt: new Date().toISOString(), recovery: "Inspect this exact output directory and lifecycle before any dispatch" }); await save(ledgerFile, ledger); throw error
  }
}
async function freeze(position: string) {
  if (!["A1", "A2"].includes(position)) throw new Error("Freeze an actual author position")
  const ledger: any[] = await load(ledgerFile)
  if (ledger.some(e => e.position.startsWith("C") && e.inferenceDispatched)) throw new Error("Automatic selection is frozen before consumers")
  const source = path.join(base, `authoring/automatic-program-${position}.json`), bytes = await readFile(source), chosen = [...ledger].reverse().find(e => e.position === position && e.session)
  const inspected = await inspectLocalInquiry(path.join(repo, chosen.session)), adopted = inspected.domain.executableContract.adoptedDraft
  if (JSON.stringify(JSON.parse(bytes.toString("utf8"))) !== JSON.stringify(adopted.raw)) throw new Error("Automatic export differs from adopted raw proposal")
  await copyFile(source, path.join(base, "authoring/automatic-program.json"))
  await save(path.join(base, "authoring/frozen-selection.json"), { position, session: chosen.session, selectedBeforeConsumers: true, programSha256: hash(bytes), rawRevision: adopted.revision, normalizedRevision: inspected.domain.executableContract.revision, origin: "model-authored raw proposal serialized as UTF-8 JSON; no developer semantic edits", semanticSupport: "unreviewed" })
}
const [command, position, attempt] = process.argv.slice(2)
if (command === "prepare") await prepare()
else if (command === "run") await run(position!, attempt)
else if (command === "freeze") await freeze(position!)
else if (command === "status") console.log(JSON.stringify(await load(ledgerFile), null, 2))
else throw new Error("Use prepare | run <finite position> [named-attempt] | freeze A1/A2 | status")
