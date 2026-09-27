import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const publicRequirements = JSON.parse(await readFile(path.join(root, "public-requirements.json"), "utf8"))
const authorRoot = path.join(root, "author-attempts")
await mkdir(authorRoot, { recursive: true })
process.env.SKVM_AUTO_PROBE = "0"
process.env.SKVM_CACHE = path.join(repo, ".skvm")

const briefs = [
  {
    id: "fastapi-superuser-supplied-path",
    source: "FastAPI full-stack template at cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7; supplied crop is items.py, specifically GET /items/{id} read_item. The crop does not include the CurrentUser dependency implementation.",
    policy: "An authenticated non-superuser may read or modify only items they own. An authenticated active superuser may read or modify an item regardless of owner.",
  },
  {
    id: "gitea-collaborator-self",
    source: "Gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b; supplied crop is collaborators.go and the named GetRepoPermissions handler.",
    policy: "A caller may query a collaborator's repository permission when the caller is a site administrator, is a repository administrator, or is querying their own username. If none holds, the request is rejected with HTTP 403 before the target collaborator is loaded.",
  },
] as const

const provider = createProviderForModel("xty/gpt-5.6-sol")
for (const brief of briefs) {
  const requirement = publicRequirements.cases.find((item: any) => item.id === brief.id)
  if (!requirement) throw Error(`Missing public requirement ${brief.id}`)
  const prompt = [
    "You are an independent author of a Markdown instruction for a fixed-source authorization assessment. Write the instruction that another model will receive, not an answer to the assessment. Return only the Markdown instruction paragraph(s), no code fence or commentary.",
    "Use only this neutral public brief; no DSL draft, answer key, or evaluator exists in your context. Keep the question, accepted policy, source crop, analysis boundary, premises, requested branches, and response details aligned. Do not invent source facts. A common public requirements paragraph will be added separately to every arm, so do not quote it verbatim.",
    `Source: ${brief.source}`,
    `Accepted policy: ${brief.policy}`,
    `Current question: ${requirement.currentQuestion}`,
    `Boundary: ${requirement.boundary}`,
    `Premises: ${requirement.premises.join(" | ")}`,
    `Requested branches: ${JSON.stringify(requirement.requestedBranches)}`,
    `Required response details: ${requirement.requiredResponseDetails.join(" | ")}`,
  ].join("\n")
  const response = await provider.complete({ messages: [{ role: "user", content: prompt }], temperature: 0, maxTokens: 1200 })
  const attempt = { caseId: brief.id, model: "xty/gpt-5.6-sol", prompt, response, date: new Date().toISOString() }
  await writeFile(path.join(authorRoot, `${brief.id}.json`), `${JSON.stringify(attempt, null, 2)}\n`, { flag: "wx" })
  console.log(JSON.stringify({ caseId: brief.id, characters: response.text.length, tokens: response.tokens, costUsd: response.costUsd ?? null, stopReason: response.stopReason }))
}
