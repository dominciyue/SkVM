import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { root, repo, json, save, cli } from "./common.ts"

const scope = [root, path.join(repo, "examples", "authorization-assessment", "evidence-editing")]
const patterns = [
  ["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
] as const
let jsonFiles = 0, jsonlFiles = 0, jsonlRecords = 0, scannedFiles = 0, scannedBytes = 0
const matches: Array<{ file: string; rule: string }> = []
async function visit(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) { await visit(file); continue }
    if (!entry.isFile()) continue
    const bytes = await readFile(file), text = bytes.toString("utf8")
    scannedFiles++; scannedBytes += bytes.length
    if (file.endsWith(".json")) { JSON.parse(text); jsonFiles++ }
    if (file.endsWith(".jsonl")) {
      jsonlFiles++
      for (const line of text.split(/\r?\n/).filter(line => line.trim())) { JSON.parse(line); jsonlRecords++ }
    }
    // Report identities only; never print candidate secret bytes.
    if (file !== import.meta.path) for (const [rule, pattern] of patterns) if (pattern.test(text)) matches.push({ file: path.relative(repo, file).replaceAll("\\", "/"), rule })
  }
}
for (const dir of scope) await visit(dir)
const audit = { schemaVersion: "authorization-ak-artifact-audit/v1", scopes: scope.map(dir => path.relative(repo, dir).replaceAll("\\", "/")), jsonFiles, jsonlFiles, jsonlRecords, scannedFiles, scannedBytes, credentialMatches: matches, providerCalls: 0, targetExecutions: 0, limitation: "Targeted high-confidence credential patterns, not an exhaustive secret inventory" }
await save(path.join(root, "artifact-audit.json"), audit, true)
if (matches.length) throw new Error(`Credential scan found ${matches.length} candidate paths; contents withheld`)
const replay = await json(path.join(root, "author-use-replay.json")), rows = []
if (replay.terminal !== 8) throw new Error("Author sessions not closed")
for (const row of replay.rows) {
  const session = path.join(root, "author-runs", row.id, "sessions", row.sessionId)
  const inspected = await cli(["inspect", `--out=${session}`])
  if (inspected.code || inspected.report.status !== row.status) throw new Error(`Ordinary inspect differs: ${row.id}`)
  rows.push({ id: row.id, sessionId: row.sessionId, status: inspected.report.status, providerCalls: 0 })
}
await save(path.join(root, "ordinary-session-inspection.json"), { schemaVersion: "authorization-ak-ordinary-session-inspection/v1", rows, providerCalls: 0, targetExecutions: 0 }, true)
process.stdout.write(`${JSON.stringify({ ...audit, ordinaryInspections: rows.length })}\n`)
