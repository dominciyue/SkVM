import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const roots = [
  { repo: "usememos/memos", ref: "cb42e326ba9cc266a6a9570c53e0fe04c62793f4", label: "memos", files: [
    "LICENSE", "README.md", "proto/api/v1/memo_service.proto", "proto/api/v1/space_service.proto",
    "server/api/v1/authz.go", "server/api/v1/memo_access.go", "server/api/v1/memo_service.go",
    "server/api/v1/memo_share_service.go", "server/api/v1/memo_attachment_service.go", "server/api/v1/space_service.go",
    "store/memo.go", "store/memo_share.go", "store/memo_delete_policy.go", "store/space.go",
    "core/access/memo.go", "core/access/memo_resolve.go",
  ] },
  { repo: "paperless-ngx/paperless-ngx", ref: "126ec414a8b65158368653a2604ae58415e43103", label: "paperless", files: [
    "LICENSE", "README.md", "docs/api.md", "docs/usage.md",
    "src/documents/permissions.py", "src/documents/views.py", "src/documents/serialisers.py",
    "src/documents/tests/test_api_permissions.py", "src/documents/tests/test_api_documents.py",
    "src/documents/tests/test_api_profile.py", "src/documents/tests/test_api_tasks.py",
  ] },
  { repo: "open-webui/open-webui", ref: "841c9045d789005145274955e7ef60b1b11a9be9", label: "owui", files: [
    "LICENSE", "backend/open_webui/routers/retrieval.py",
  ] },
  { repo: "fastapi/full-stack-fastapi-template", ref: "cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7", label: "fastapi", files: [
    "LICENSE", "backend/app/api/routes/items.py", "backend/app/api/deps.py",
  ] },
] as const

const base = path.join(import.meta.dir, "public-source")
const manifestPath = path.join(base, "manifest.json")
type ManifestItem = { repo: string; ref: string; path: string; bytes: number; sha256: string; gitBlob: string }
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as { files: ManifestItem[] } : { files: [] }
const selectedLabels = new Set(process.argv.slice(2))
const manifest: ManifestItem[] = [...previous.files.filter(item => !roots.some(root => (selectedLabels.size === 0 || selectedLabels.has(root.label)) && root.repo === item.repo))]
for (const root of roots) {
  if (selectedLabels.size > 0 && !selectedLabels.has(root.label)) continue
  for (const file of root.files) {
    const apiPath = file.split("/").map(encodeURIComponent).join("/")
    const url = `repos/${root.repo}/contents/${apiPath}?ref=${root.ref}`
    const response = JSON.parse(execFileSync("gh", ["api", url], { encoding: "utf8", maxBuffer: 10_000_000 })) as { content: string; sha: string; size: number }
    const bytes = Buffer.from(response.content.replace(/\s/g, ""), "base64")
    const gitBlob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
    if (bytes.length !== response.size || gitBlob !== response.sha) throw new Error(`GitHub content identity mismatch: ${root.repo}@${root.ref}:${file}`)
    const target = path.join(base, root.label, ...file.split("/"))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, bytes)
    manifest.push({ repo: root.repo, ref: root.ref, path: file, bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"), gitBlob })
  }
}
writeFileSync(manifestPath, `${JSON.stringify({ schemaVersion: "authorization-public-source/v1", files: manifest }, null, 2)}\n`, "utf8")
process.stdout.write(`${manifest.length} fixed-ref files acquired with verified Git blob identities.\n`)
