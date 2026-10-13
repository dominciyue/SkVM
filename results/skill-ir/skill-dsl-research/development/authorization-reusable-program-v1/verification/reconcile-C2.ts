import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { readCodexAccountThread } from "../../../../../../src/adapters/codex-account-session.ts"
const base = path.resolve(import.meta.dir, "..")
const ledger = JSON.parse(await readFile(path.join(base, "attempts.json"), "utf8"))
const attempt = ledger.find((a: any) => a.position === "C2")
if (!attempt || attempt.lifecycle?.localExecution !== "closed") throw new Error("Local closure required")
const observation = await readCodexAccountThread({ threadId: attempt.lifecycle.threadId, turnId: attempt.lifecycle.turnId, timeoutMs: 15000 })
await writeFile(path.join(base, "runs/C2-first/readonly-reconciliation.json"), JSON.stringify(observation, null, 2) + "\n")
const { events, ...summary } = observation
const record = { ...summary, checkedAt: new Date().toISOString(), originalStatus: attempt.status, originalUsageUnchanged: true, finalUsageUnknown: true, providerInferenceCalls: 0, resent: false, localExecution: "closed", action: "isolate-original-attempt; independent-authorized-maintenance-may-proceed" }
await writeFile(path.join(import.meta.dir, "C2-reconciliation.json"), JSON.stringify(record, null, 2) + "\n")
attempt.reconciliation = record
await writeFile(path.join(base, "attempts.json"), JSON.stringify(ledger, null, 2) + "\n")
console.log(JSON.stringify(record))
