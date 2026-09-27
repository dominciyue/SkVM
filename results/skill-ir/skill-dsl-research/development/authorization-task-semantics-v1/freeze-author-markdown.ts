import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const ids = ["fastapi-superuser-supplied-path", "gitea-collaborator-self"]
const configFile = path.join(root, "panel-config.json")
const rawConfig = await readFile(configFile, "utf8")
if (hash(rawConfig) !== "23e4b513e64b76421899bcb40fa37ba2d2e2183ca2cacfc965ccd178bb121bde") throw Error("Expected initial draft panel config before independent author materialization")
const config = JSON.parse(rawConfig)
await writeFile(path.join(root, "panel-config-initial-draft.json"), rawConfig, { flag: "wx" })
await writeFile(path.join(root, "pre-run-check-initial-draft.json"), await readFile(path.join(root, "pre-run-check.json")), { flag: "wx" })
for (const id of ids) {
  const selected = config.cases.find((item: any) => item.id === id)
  if (!selected) throw Error(`No panel case ${id}`)
  const attempt = JSON.parse(await readFile(path.join(root, "author-attempts", `${id}.json`), "utf8"))
  if (attempt.caseId !== id || attempt.model !== config.model || attempt.response.stopReason !== "end_turn" || !attempt.response.text.trim()) throw Error(`Invalid independent author delivery ${id}`)
  const markdownFile = path.join(repo, selected.markdown.path)
  await writeFile(path.join(root, "author-attempts", `${id}.manual-draft.md`), await readFile(markdownFile), { flag: "wx" })
  const markdown = `${attempt.response.text.trim()}\n`
  await writeFile(markdownFile, markdown)
  selected.markdown.sha256 = hash(markdown)
  selected.markdown.origin = "independent model author from frozen neutral public brief; raw prompt and response retained"
  selected.markdown.authorAttempt = path.relative(repo, path.join(root, "author-attempts", `${id}.json`)).replaceAll("\\", "/")
}
config.materialRevision = "independent-author-final"
config.authorProvenance = "Six AH independently authored Markdown prompts are reused verbatim; two new variation prompts use retained independent model-author first deliveries. The common public paragraph is rendered separately in all arms."
const finalConfig = `${JSON.stringify(config, null, 2)}\n`
await writeFile(configFile, finalConfig)
console.log(JSON.stringify({ cases: config.cases.length, units: config.units.length, configSha256: hash(finalConfig) }))
