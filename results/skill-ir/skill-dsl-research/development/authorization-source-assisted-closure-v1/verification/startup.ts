import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const old = path.resolve(root, "../authorization-operation-evidence-v1")
const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const originals = [
  "verification/post-au-review-20261006.json", "verification/post-au-review-20261006.ts", "summary.json", "status.json",
  ...["quality-paperless-download-N", "quality-paperless-download-D-O", "quality-owui-ingestion-D-O", "native-gitea-create-issue-original", "native-gitea-create-issue-changed", "author-gitea-create-issue-original", "author-gitea-create-issue-changed", "consume-gitea-create-issue-original"].map(id => `runs/${id}/attempt-1/report.json`),
  "runs/author-gitea-create-issue-original/attempt-2/report.json",
  "repair-events/gitea-consumer-unknown-scope.json",
]
await mkdir(path.join(root, "model/inputs"), { recursive: true })
await mkdir(path.join(root, "evaluations"), { recursive: true })
const retained = []
for (const relative of originals) {
  const bytes = await readFile(path.join(old, relative))
  retained.push({ path: path.relative(path.resolve(root, "../../../../.."), path.join(old, relative)).replaceAll("\\", "/"), sha256: sha(bytes), bytes: bytes.length })
}
const inputs = []
for (const task of ["paperless-download", "owui-ingestion", "gitea-create-issue"]) {
  const bytes = await readFile(path.join(old, "model/inputs", `${task}.json`))
  const value = JSON.parse(bytes.toString("utf8"))
  await writeFile(path.join(root, "model/inputs", `${task}.json`), bytes, { flag: "wx" })
  inputs.push({ task, path: `model/inputs/${task}.json`, sha256: sha(bytes), repository: value.repository, sourceRef: value.sourceRef, sourceRoot: value.sourceRoot, allowedPaths: value.allowedPaths, modelContents: "Original natural request, source identity/allowlist and independent policy only" })
}
const record = {
  schemaVersion: "authorization-av-startup/v1", capturedAt: new Date().toISOString(), branch: "skill-ir-aot", startingHead: "531bc80dd1fa2ef432e2526b96806f52946cee9e", startupWorktree: "clean", previousQueue: "AU completed-with-unmet-criteria; no active attempts", providerCalls: 0, targetExecutions: 0,
  retained, inputs,
  audit: { authority: "Two independent read-only AI scouts; main agent spot checks exact anchors", defects: ["Runtime options are hashed as source identity", "Line-qualified pathHint excludes a real Download helper", "Lexical write singleton selected an unrelated OWUI audit logger"], oldGitea: { consumer: "consume-gitea-create-issue-original/attempt-1", missingResponse: 22, dispatches: 22, responses: 21, remoteCompletion: "unknown", oldRepresentationsSealed: 10, avAdmission: "Not yet eligible: requires AV8 lifecycle/whitelist/budget verification" }, oldAnswers: "Evaluation-only source references; never read by prompt construction" },
}
await writeFile(path.join(root, "evaluations/av0-retained-evidence.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(root, "status.json"), JSON.stringify({ schemaVersion: "authorization-av-status/v1", status: "in-progress", phase: "AV1", startedAt: record.capturedAt, finiteQueueComplete: false, researchGoalAchieved: false, engineering: "in-progress", realUse: "not-started", methodEffect: "not-established", owner: "AV development thread; sole shared-doc/Git writer", lastKnownRequest: null, nextUndispatchedAction: "AV1 failing identity tests", recoveryPolicy: "av-read-only-recovery/v1 (pending AV8)", budgets: { providerCalls: 24, sourceActions: 64, displayBytes: 786432, readBytes: 33554432, outputTokens: 6000, requestTimeoutMs: 300000, sessionTimeoutMs: 7500000 }, recoveryCommand: "Read status.json, active AV taskbook and git status; continue nextUndispatchedAction. study.ts run <exact-position-id> after AV9.", completedStages: ["AV0"], unknownHistoricalRequests: ["AU Share request16", "AU Gitea consumer request22"], providerCalls: 0, developerUsage: null, scoutUsage: null, humanMinutes: null, targetExecutions: 0 }, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ retained: retained.length, inputs: inputs.length, providerCalls: 0, phase: "AV1" }))
