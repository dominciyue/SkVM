import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, writeFile, constants } from "node:fs/promises"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"

const root = import.meta.dir
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const manifest = JSON.parse(await readFile(path.join(root, "author-original-selection.json"), "utf8")) as { items: Array<{ id: string; selected: boolean; attempt: number; semanticReview: string }> }
if (manifest.items.length !== 4 || manifest.items.some(item => !item.selected || item.attempt !== 1)) throw new Error("Unexpected original selection")
const rows = []
for (const item of manifest.items) {
  const attempt = JSON.parse(await readFile(path.join(root, "author-attempts", "use", `${item.id}.json`), "utf8"))
  const check = JSON.parse(await readFile(path.join(root, "author-candidates", `${item.id}-check.json`), "utf8"))
  const [, , representation] = item.id.match(/^(memos-space-policy|paperless-note-relation)-(markdown|dsl)-original$/) ?? []
  if (!representation || attempt.status !== "completed" || attempt.response.stopReason !== "end_turn") throw new Error(`Incomplete selected attempt ${item.id}`)
  if (check.status !== "valid" && item.id !== "paperless-note-relation-markdown-original") throw new Error(`Unexpected failed check ${item.id}`)
  if (item.id === "paperless-note-relation-markdown-original" && JSON.stringify(check.diagnostics) !== JSON.stringify(["Accepted policy text is not preserved exactly"])) throw new Error("Unexpected Markdown diagnostic")
  const packageId = item.id.slice(0, -`-${representation}-original`.length)
  const extension = representation === "dsl" ? "json" : "md"
  const candidate = path.join(root, "author-candidates", `${item.id}.${extension}`)
  const destinationDir = path.join(root, "author-packages", packageId, representation)
  await mkdir(destinationDir, { recursive: true })
  const output = path.join(destinationDir, `original.${extension}`)
  await copyFile(candidate, output, constants.COPYFILE_EXCL)
  if (representation === "dsl") {
    const loaded = await loadLocalAuthorizationInput(output)
    if (loaded.status !== "valid") throw new Error(`Selected input invalid ${item.id}: ${JSON.stringify(loaded.diagnostics)}`)
  }
  rows.push({ id: item.id, selectedAttempt: item.attempt, semanticReview: item.semanticReview,
    outputPath: path.relative(root, output).replaceAll("\\", "/"), sha256: hash(await readFile(output)) })
}
await writeFile(path.join(root, "author-original-selected.json"), `${JSON.stringify({ schemaVersion: "authorization-aj-author-original-selected/v1", rows }, null, 2)}\n`, { flag: "wx" })
process.stdout.write(`${JSON.stringify({ selected: rows.length, rows: rows.map(row => ({ id: row.id, sha256: row.sha256 })) })}\n`)
