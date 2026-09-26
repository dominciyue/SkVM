import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const raw = await readFile(path.join(import.meta.dir, "markdown-author-original.md"), "utf8")
const output = path.join(import.meta.dir, "markdown")
await mkdir(output, { recursive: true })
const parts = [...raw.matchAll(/^## ([a-z-]+)\r?\n\r?\n([^]*?)(?=^## |$(?![^]))/gm)]
if (parts.length !== 8) throw new Error(`Expected eight independent drafts, found ${parts.length}.`)
const corrections: Record<string, Array<[string, string]>> = {
  "fastapi-foreign-update": [["Use only `task.json` and `items.py`", "Use only this task instruction and the supplied `items.py`"]],
  "gitea-collaborator": [["`routers/api/v1/repo/collaborators.go#L247-L301`", "the supplied `collaborators.go` crop"]],
  "gitea-assignee": [["`routers/api/v1/repo/issue_assignee.go#L20-L65,L189-L238`", "the supplied `issue_assignee.go` crop"]],
  "gitea-lock": [["`routers/api/v1/api.go#L451-L459,L1741-L1745` and `routers/api/v1/repo/issue_lock.go#L15-L81`", "the supplied `route_guard.go` and `issue_lock.go` crops"]],
  "fastapi-superuser-read": [["Use only `task.json` and `items.py`", "Use only this task instruction and the supplied `items.py`"]],
}
for (const [, id, draft] of parts) {
  if (!id || !draft) throw new Error("Missing draft heading or body.")
  let body = draft.trim()
  for (const [before, after] of corrections[id] ?? []) {
    if (!body.includes(before)) throw new Error(`Missing alignment target for ${id}: ${before}`)
    body = body.replace(before, after)
  }
  await writeFile(path.join(output, `${id}.md`), `${body}\n`, { encoding: "utf8", flag: "wx" })
}
