import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const attemptDir = path.join(root, "author-attempts", "use")
const files = (await readdir(attemptDir)).filter(file => file.endsWith(".json")).sort()
const rows = []
const knownTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
for (const file of files) {
  const attempt = JSON.parse(await readFile(path.join(attemptDir, file), "utf8"))
  const tokens = attempt.response?.tokens ?? null
  for (const key of Object.keys(knownTokens) as Array<keyof typeof knownTokens>) knownTokens[key] += tokens?.[key] ?? 0
  rows.push({ file, id: attempt.id, attemptNumber: attempt.attemptNumber ?? 1, status: attempt.status ?? (attempt.response ? "completed" : "unknown"),
    responseReceived: Boolean(attempt.response), tokens, actualUsd: attempt.response?.costUsd ?? null, underlyingHttpAttempts: "unknown" })
}
const checks = []
for (const packageId of ["fastapi-policy-change", "gitea-relation-change"]) for (const representation of ["markdown", "dsl"]) for (const phase of ["original", "changed"]) {
  const file = path.join(root, "author-packages", packageId, representation, `${phase}-check.json`)
  const selected = JSON.parse(await readFile(file, "utf8"))
  checks.push({ packageId, representation, phase, status: selected.status, attemptNumber: selected.attemptNumber ?? null })
}
const account = { schemaVersion: "authorization-ai-author-use-account/v1", attempts: rows.length, respondedOuterRequests: rows.filter(row => row.responseReceived).length,
  failedOuterRequestsWithUnknownUsage: rows.filter(row => !row.responseReceived).length, knownTokens,
  actualUsd: null, actualUsdStatus: "unknown", underlyingHttpDispatchCount: "unknown; openai-compatible provider internally retries network failures",
  firstAttemptAuthorValid: checks.filter(check => check.status === "valid" && check.attemptNumber === 1).length,
  finalAuthorValid: checks.filter(check => check.status === "valid").length,
  machineRecoveredForConsumption: checks.filter(check => check.status === "machine-recovered").length,
  humanMinutes: "unknown; model-assisted drafting only", rows, checks }
await writeFile(path.join(root, "author-use-account.json"), `${JSON.stringify(account, null, 2)}\n`, { flag: "wx" })
console.log(JSON.stringify({ attempts: account.attempts, respondedOuterRequests: account.respondedOuterRequests,
  failedOuterRequestsWithUnknownUsage: account.failedOuterRequestsWithUnknownUsage,
  knownTokens: account.knownTokens, firstAttemptAuthorValid: account.firstAttemptAuthorValid,
  finalAuthorValid: account.finalAuthorValid, machineRecoveredForConsumption: account.machineRecoveredForConsumption }))
