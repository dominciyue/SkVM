import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { renderSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"

const root = import.meta.dir
const ids = ["owui-file", "fastapi-superuser-read", "memos-create-share", "memos-get-shared", "memos-member-leave", "paperless-download", "paperless-note-post", "paperless-share-create"]
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const binding = (file: string) => ({ path: path.relative(root, file).replaceAll("\\", "/"), sha256: hash(readFileSync(file)) })
const normalizedTask = (task: unknown) => {
  const clone = structuredClone(task) as { entries: Array<{ locations: unknown[] }> }
  for (const entry of clone.entries) entry.locations = []
  return JSON.stringify(clone)
}
const rows = []
for (const id of ids) {
  const caseRoot = path.join(root, "inputs", id)
  const baselineFile = path.join(caseRoot, "baseline", "authoring.json")
  const fullFile = path.join(caseRoot, "full", "authoring.json")
  const preparedFile = path.join(caseRoot, "prepared-final", "assessment.json")
  const loaded = await Promise.all([baselineFile, fullFile, preparedFile].map(loadLocalAuthorizationInput))
  if (loaded.some(item => item.status !== "valid")) throw new Error(`Invalid material for ${id}`)
  const [baseline, full, prepared] = loaded.map(item => {
    if (item.status !== "valid") throw new Error("unreachable")
    return item
  })
  if (normalizedTask(baseline.task) !== normalizedTask(full.task) || normalizedTask(full.task) !== normalizedTask(prepared.task)) throw new Error(`${id}: task semantics drift beyond entry source coordinates`)
  if (JSON.stringify(baseline.analysisContract) !== JSON.stringify(prepared.analysisContract)) throw new Error(`${id}: public analysis contract drift`)
  if (baseline.task.repository !== prepared.task.repository || baseline.task.sourceRef !== prepared.task.sourceRef) throw new Error(`${id}: source identity drift`)
  const baseFiles = baseline.sourceBundle.files.map(file => ({ path: file.relativePath, bytes: Buffer.byteLength(file.content, "utf8"), sha256: hash(file.content) }))
  const preparedFiles = prepared.sourceBundle.files.map(file => ({ path: file.relativePath, bytes: Buffer.byteLength(file.content, "utf8"), sha256: hash(file.content), originalRange: file.cropRange }))
  const origin = JSON.parse(readFileSync(path.join(caseRoot, "baseline-origin.json"), "utf8")) as { originalPath: string; startLine: number; endLine: number }
  if (id !== "fastapi-superuser-read") {
    const original = readFileSync(path.join(root, "public-source", id === "owui-file" ? "owui" : id.startsWith("memos") ? "memos" : "paperless", ...origin.originalPath.split("/")), "utf8")
    const lines = original.match(/[^\n]*\n|[^\n]+$/g) ?? []
    if (baseline.sourceBundle.files[0]!.content !== lines.slice(origin.startLine - 1, origin.endLine).join("")) throw new Error(`${id}: baseline is not an exact original entry crop`)
  }
  rows.push({ id, taskId: baseline.task.taskId, repository: baseline.task.repository, sourceRef: baseline.task.sourceRef,
    baseline: { input: binding(baselineFile), sources: baseFiles, renderedSourceCharacters: renderSourceBundle(baseline.sourceBundle).length },
    full: { input: binding(fullFile) },
    prepared: { input: binding(preparedFile), report: binding(path.join(caseRoot, "prepared-final", "report.json")),
      status: prepared.sourceBundle.evidencePreparation?.status, gaps: prepared.sourceBundle.evidencePreparation?.gaps ?? [],
      sources: preparedFiles, renderedSourceCharacters: renderSourceBundle(prepared.sourceBundle).length },
  })
}
const audit = { schemaVersion: "authorization-aj-material-audit/v1", cases: rows,
  modelVisibleBriefs: binding(path.join(root, "public-briefs.json")), providerCalls: 0, targetExecutions: 0 }
writeFileSync(path.join(root, "material-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8")
process.stdout.write(`${rows.length} semantically matched baseline/prepared pairs; statuses ${rows.map(row => `${row.id}:${row.prepared.status}`).join(", ")}.\n`)
