import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"

const root = import.meta.dir
const id = process.argv[2]
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const plan = JSON.parse(await readFile(path.join(root, "author-plan.json"), "utf8")) as {
  publicBriefsSha256: string; model: string; temperature: number; maxTokens: number; caseOrder: string[]
}
if (!id || !plan.caseOrder.includes(id)) throw new Error("Usage: bun author-markdown.ts <registered-case-id>")
const rawBriefs = await readFile(path.join(root, "public-briefs.json"), "utf8")
if (hash(rawBriefs) !== plan.publicBriefsSha256) throw new Error("Frozen public briefs changed")
const briefs = JSON.parse(rawBriefs) as { commonInstruction: string; cases: Array<{
  id: string; repository: string; sourceRef: string; entry: string; acceptedPolicy: string; currentQuestion: string;
  boundary: string; premises: string[]; requiredResponseDetails: string[]
}> }
const brief = briefs.cases.find(item => item.id === id)
if (!brief) throw new Error(`No neutral brief for ${id}`)
const prompt = [
  "You are an independent author of a Markdown instruction for a fixed-source authorization assessment. Write what another model should receive, not the answer. Return only the Markdown instruction, without a code fence or commentary.",
  "Use only this neutral public brief. You have no DSL draft, answer key, or evaluator. Preserve the question, accepted policy, source entry, boundary, premises and response details. Do not invent source facts or decide the outcome. A common public requirements paragraph is separately supplied to all methods; do not quote it verbatim.",
  `Repository: ${brief.repository}`,
  `Fixed source ref: ${brief.sourceRef}`,
  `Entry: ${brief.entry}`,
  `Accepted policy: ${brief.acceptedPolicy}`,
  `Current question: ${brief.currentQuestion}`,
  `Boundary: ${brief.boundary}`,
  `Premises: ${brief.premises.join(" | ") || "none beyond the stated question"}`,
  `Required response details: ${brief.requiredResponseDetails.join(" | ")}`,
].join("\n")
const attemptRoot = path.join(root, "author-attempts")
await mkdir(attemptRoot, { recursive: true })
const claimPath = path.join(attemptRoot, `${id}.claim.json`)
await writeFile(claimPath, `${JSON.stringify({ schemaVersion: "authorization-aj-author-claim/v1", caseId: id,
  model: plan.model, promptSha256: hash(prompt), createdAt: new Date().toISOString(), noAutomaticResend: true }, null, 2)}\n`, { flag: "wx" })
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.resolve(root, "../../../../../.skvm")
try {
  const provider = createProviderForModel(plan.model)
  const response = await provider.complete({ messages: [{ role: "user", content: prompt }], temperature: plan.temperature, maxTokens: plan.maxTokens })
  const attempt = { schemaVersion: "authorization-aj-author-attempt/v1", caseId: id, model: plan.model, prompt, response,
    promptSha256: hash(prompt), actualCostUsd: response.costUsd ?? null, createdAt: new Date().toISOString() }
  await writeFile(path.join(attemptRoot, `${id}.json`), `${JSON.stringify(attempt, null, 2)}\n`, { flag: "wx" })
  if (response.stopReason === "end_turn" && response.text.trim()) {
    await writeFile(path.join(root, "inputs", id, "independent.md"), `${response.text.trim()}\n`, { flag: "wx" })
  }
  process.stdout.write(`${JSON.stringify({ caseId: id, stopReason: response.stopReason, characters: response.text.length,
    tokens: response.tokens, actualCostUsd: response.costUsd ?? null })}\n`)
} catch (error) {
  await writeFile(path.join(attemptRoot, `${id}.error.json`), `${JSON.stringify({ caseId: id, message: error instanceof Error ? error.message : String(error), completion: "unknown" }, null, 2)}\n`, { flag: "wx" })
  throw error
}
