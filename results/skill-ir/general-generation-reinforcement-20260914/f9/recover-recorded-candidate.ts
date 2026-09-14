import path from "node:path"
import { cp, mkdir, readFile, writeFile } from "node:fs/promises"

const [proposalArg, outputArg] = process.argv.slice(2)
if (!proposalArg || !outputArg) throw new Error("Expected proposal and new recovery directory")
const proposal = path.resolve(proposalArg)
const output = path.resolve(outputArg)
const repair = process.argv[4] === "--repair"
const step = path.join(proposal, repair ? "round-1-repair-1-optimizer" : "round-1-optimizer")
const initialEvents = await Bun.file(path.join(proposal, "round-1-optimizer/stdout.log")).json()
const events = repair ? [...initialEvents, ...await Bun.file(path.join(step, "stdout.log")).json()] : initialEvents
const submission = await Bun.file(path.join(step, "submission.json")).json()
const validation = await Bun.file(path.join(proposal, `round-1-validation/${repair ? "repair-report" : "initial-report"}.json`)).json()
const allowed = new Set<string>(submission.changedFiles)
const results = new Map(events.filter((event: any) => event.type === "tool_execution_end")
  .map((event: any) => [event.toolCallId, event]))
const contents = new Map<string, string>()
const eventIds: string[] = []
for (const event of events) {
  if (event.type !== "tool_execution_start" || !["write", "edit"].includes(event.toolName)) continue
  const file = event.args?.path
  if (!allowed.has(file)) continue
  if ((results.get(event.toolCallId) as any)?.isError !== false) throw new Error(`Unconfirmed write: ${event.toolCallId}`)
  if (event.toolName === "write") contents.set(file, event.args.content)
  else {
    let text = contents.get(file) ?? await readFile(path.join(proposal, "original", file), "utf8")
    for (const edit of event.args.edits ?? [event.args]) {
      if (!edit.oldText || text.split(edit.oldText).length !== 2) throw new Error(`Non-exact edit: ${event.toolCallId}`)
      text = text.replace(edit.oldText, edit.newText)
    }
    contents.set(file, text)
  }
  eventIds.push(event.toolCallId)
}
const bindings = new Map<string, string>(validation.actions.flatMap((action: any) => (
  (action.validationBinding?.candidateFiles ?? []).map((file: any) => [file.path, file.sha256])
)))
for (const file of allowed) {
  const text = contents.get(file)
  if (text === undefined) throw new Error(`Missing recorded candidate: ${file}`)
  const actual = new Bun.CryptoHasher("sha256").update(text).digest("hex")
  if (!bindings.has(file) || bindings.get(file) !== actual) throw new Error(`Candidate digest mismatch: ${file}`)
}
await mkdir(output, { recursive: false })
await cp(path.join(proposal, "original"), path.join(output, "original"), { recursive: true })
await cp(path.join(proposal, "original"), path.join(output, "round-1"), { recursive: true })
for (const [file, text] of contents) {
  const target = path.resolve(output, "round-1", file)
  const relative = path.relative(path.join(output, "round-1"), target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Candidate path escapes recovery")
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, text)
}
await mkdir(path.join(output, "round-1-optimizer"))
await cp(path.join(step, "submission.json"), path.join(output, "round-1-optimizer/submission.json"))
await writeFile(path.join(output, "recovery.json"), JSON.stringify({
  sourceProposal: proposal, recoveredAt: new Date().toISOString(), eventIds,
  files: [...contents.keys()], validationDigestsMatched: true,
  candidateManuallyEdited: false, sourceReplayed: false, paidCalls: 0,
}, null, 2) + "\n")
console.log(JSON.stringify({ output, recovered: [...contents.keys()], validationDigestsMatched: true }))
