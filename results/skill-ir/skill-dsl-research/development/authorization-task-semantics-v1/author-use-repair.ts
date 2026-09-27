import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const id = process.argv[2]
if (id !== "gitea-relation-change-dsl-changed") throw Error("Only the diagnosed Gitea changed structured delivery is eligible for this one repair")
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")
const attemptsDir = path.join(root, "author-attempts", "use")
await mkdir(attemptsDir, { recursive: true })
const original = JSON.parse(await readFile(path.join(attemptsDir, `${id}.json`), "utf8"))
const check = JSON.parse(await readFile(path.join(root, "author-packages", "gitea-relation-change", "dsl", "changed-check-attempt1.json"), "utf8"))
if (check.status !== "invalid" || !check.diagnostics.some((item: { code: string }) => item.code === "json-parse")) throw Error("No exact JSON diagnostic to repair")
const prompt = [
  "You are the same independent structured author. This is your one diagnostic repair of your own changed delivery; do not consult another author's draft or answer key.",
  "The current ordinary validator reports: " + JSON.stringify(check.diagnostics),
  "Return one complete strict JSON object only, no fence or commentary. Repair JSON syntax and any directly necessary structural issue while preserving your policy, the self-query relation in nonadmin-other, the unchanged repo-admin-other scenario, and the supplied source identity. Do not infer the accepted policy from the code.",
  "Your previous changed delivery follows exactly:\n" + original.response.text,
].join("\n\n")
const file = path.join(attemptsDir, `${id}-attempt2.json`)
const startedAt = new Date().toISOString()
try {
  const response = await createProviderForModel("xty/gpt-5.6-sol").complete({ messages: [{ role: "user", content: prompt }], temperature: 0, maxTokens: 3000 })
  await writeFile(file, `${JSON.stringify({ id, attemptNumber: 2, repairOf: id, diagnostic: check.diagnostics, model: "xty/gpt-5.6-sol", maxTokens: 3000, prompt, response, startedAt, endedAt: new Date().toISOString(), status: "completed" }, null, 2)}\n`, { flag: "wx" })
  console.log(JSON.stringify({ id, attemptNumber: 2, status: "completed", characters: response.text.length, tokens: response.tokens, costUsd: response.costUsd ?? null }))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  await writeFile(file, `${JSON.stringify({ id, attemptNumber: 2, repairOf: id, diagnostic: check.diagnostics, model: "xty/gpt-5.6-sol", maxTokens: 3000, prompt, startedAt, endedAt: new Date().toISOString(), status: "transport-failed", message, usage: "unknown" }, null, 2)}\n`, { flag: "wx" })
  console.error(JSON.stringify({ id, attemptNumber: 2, status: "transport-failed", message }))
}
