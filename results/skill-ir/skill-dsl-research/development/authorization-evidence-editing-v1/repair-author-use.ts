import { createHash } from "node:crypto"
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const exists = async (file: string) => { try { await access(file); return true } catch { return false } }
const diagnosticsBytes = await readFile(path.join(root, "author-use-diagnostics.json"))
const diagnostics = JSON.parse(diagnosticsBytes.toString("utf8")) as { oneRevisionPerDelivery: boolean; items: Array<{ id: string; diagnostic: string; firstAttemptStatus: string }> }
const briefs = JSON.parse(await readFile(path.join(root, "author-use-briefs.json"), "utf8")) as { model: string }
if (!diagnostics.oneRevisionPerDelivery || diagnostics.items.length !== 2) throw new Error("Unexpected author diagnostic plan")
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
const provider = createProviderForModel(briefs.model)
for (const item of diagnostics.items) {
  const dir = path.join(root, "author-attempts", "use")
  const file = path.join(dir, `${item.id}-attempt2.json`)
  const claimFile = path.join(dir, `${item.id}-attempt2.claim.json`)
  if (await exists(claimFile)) continue
  const first = JSON.parse(await readFile(path.join(dir, `${item.id}.json`), "utf8"))
  if (first.status !== "completed" || !first.response?.text) throw new Error(`No first delivery ${item.id}`)
  const prompt = ["You are the same independent author revising only your own first delivery after one concrete diagnostic. You see no other author's draft or evaluator answer.",
    `Original task and supplied source:\n${first.prompt}`,
    `Your first delivery:\n${first.response.text}`,
    `Diagnostic to fix:\n${item.diagnostic}`,
    "Return only the corrected artifact in the same format as your first delivery. Do not add a code fence or commentary."].join("\n\n")
  const claim = { id: item.id, attemptNumber: 2, diagnosticSha256: hash(diagnosticsBytes), promptSha256: hash(prompt),
    firstResponseSha256: hash(first.response.text), noAutomaticResend: true, createdAt: new Date().toISOString() }
  await writeFile(claimFile, `${JSON.stringify(claim, null, 2)}\n`, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({ id: item.id, attempt: 2, action: "start" })}\n`)
  const maxTokens = item.id.includes("-dsl-") ? 1600 : 2600
  const startedAt = new Date().toISOString()
  try {
    const response = await provider.complete({ messages: [{ role: "user", content: prompt }], temperature: 0, maxTokens })
    await writeFile(file, `${JSON.stringify({ ...claim, model: briefs.model, maxTokens, prompt, response,
      startedAt, endedAt: new Date().toISOString(), status: "completed" }, null, 2)}\n`, { flag: "wx" })
    process.stdout.write(`${JSON.stringify({ id: item.id, attempt: 2, action: "finished", status: "completed",
      stopReason: response.stopReason, tokens: response.tokens, actualCostUsd: response.costUsd ?? null })}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeFile(file, `${JSON.stringify({ ...claim, model: briefs.model, maxTokens, prompt,
      startedAt, endedAt: new Date().toISOString(), status: "transport-failed", message,
      usage: "unknown" }, null, 2)}\n`, { flag: "wx" })
    process.stderr.write(`${JSON.stringify({ id: item.id, attempt: 2, status: "transport-failed", message })}\n`)
    break
  }
}
