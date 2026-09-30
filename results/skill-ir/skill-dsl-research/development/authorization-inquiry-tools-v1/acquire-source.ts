import { execFileSync } from "node:child_process"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
export const sources = [
  { id: "memos", repository: "usememos/memos", sourceRef: "cb42e326ba9cc266a6a9570c53e0fe04c62793f4", paths: ["server/api/v1", "core/access", "store", "proto/api/v1", "internal/ratelimit"] },
  { id: "paperless", repository: "paperless-ngx/paperless-ngx", sourceRef: "126ec414a8b65158368653a2604ae58415e43103", paths: ["src/documents", "src/paperless/urls.py"] },
  { id: "owui", repository: "open-webui/open-webui", sourceRef: "841c9045d789005145274955e7ef60b1b11a9be9", paths: ["backend/open_webui"] },
  { id: "gitea", repository: "go-gitea/gitea", sourceRef: "fc28937a8d772fe9e4025c9b5f24d5db4d86610b", paths: ["routers/api/v1/repo", "routers/api/v1/api.go", "routers/api/v1/utils", "modules/structs", "modules/setting", "modules/web", "models/unit", "models/perm", "models/auth", "models/user", "models/repo", "models/issues", "models/organization", "services/convert", "services/issue", "services/context"] },
]
async function acquire() {
  for (const source of sources) {
    const root = path.join(import.meta.dir, "public-source", source.id)
    if (process.argv[2] !== `--refresh=${source.id}` && await readFile(path.join(root, "source.json")).then(() => true, () => false)) { console.log(`${source.id}: fixed source already saved`); continue }
    const tree = JSON.parse(execFileSync("gh", ["api", `repos/${source.repository}/git/trees/${source.sourceRef}?recursive=1`], { encoding: "utf8", maxBuffer: 16000000 }))
    if (tree.truncated) throw new Error("Truncated fixed source tree")
    const selected: Array<{ path: string; sha: string }> = tree.tree.filter((f: any) => f.type === "blob" && (source.paths.some(p => f.path === p || f.path.startsWith(p + "/")) || /^LICENSE(?:\.[^/]*)?$/.test(f.path)) && !/(?:^|\/)(?:tests?|__tests__|migrations)(?:\/|$)|_test\.go$|(?:^|\/)test[^/]*\.py$/.test(f.path) && (/\.(?:py|go|proto)$/.test(f.path) || /^LICENSE/.test(f.path)))
    const files: unknown[] = []; let cursor = 0
    await Promise.all(Array.from({ length: 12 }, async () => { while (cursor < selected.length) {
      const item = selected[cursor++]!; if (item.path.split("/").some(p => p === ".." || p === ".") || item.path.includes("\\")) throw new Error("Unsafe upstream source path")
      const target = path.join(root, item.path), existing = await readFile(target).catch(() => undefined)
      let bytes = existing
      if (!bytes) { const response = await fetch(`https://raw.githubusercontent.com/${source.repository}/${source.sourceRef}/${item.path}`); if (!response.ok) throw new Error(`Fixed source fetch failed ${source.id}/${item.path}: ${response.status}`); bytes = Buffer.from(await response.arrayBuffer()) }
      const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
      if (blob !== item.sha) throw new Error(`Fixed git blob digest mismatch: ${item.path}`)
      if (!existing) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: "wx" }) }
      files.push({ path: item.path, gitBlob: blob, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length })
    } }))
    await mkdir(root, { recursive: true }); await writeFile(path.join(root, "source.json"), JSON.stringify({ schemaVersion: "authorization-ao-raw-source/v1", ...source, files, targetExecutions: 0 }, null, 2) + "\n")
    console.log(`${source.id}: ${files.length} original fixed-ref files verified`)
  }
}
if (import.meta.main) await acquire()
