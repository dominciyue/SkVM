import { readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { projectProgramToolOutput, resolveProgramToolOutput } from "../../../../../src/task-dsl/authorization/program-consumption-context.ts"
const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
export async function replayTransmission(session: string) {
  const raw = path.join(session, "raw"), files = (await readdir(raw)).filter(f => /^account-turn-\d+\.json$/.test(f)).sort(), rows = []
  for (const file of files) {
    const bytes = await readFile(path.join(raw, file)), turn = JSON.parse(bytes.toString("utf8")); let beforeBytes = 0, afterBytes = 0, replies = 0, changedReplies = 0
    for (const event of turn.events) for (const block of event.result?.contentItems ?? []) {
      let envelope: any; try { envelope = JSON.parse(block.text) } catch { continue }
      if (!envelope?.toolResult) continue
      const projected = projectProgramToolOutput(envelope.toolResult, [], "full")
      if (!isDeepStrictEqual(resolveProgramToolOutput(projected), envelope.toolResult)) throw new Error("Actual response failed lossless reconstruction")
      const before = Buffer.byteLength(JSON.stringify(envelope)), after = Buffer.byteLength(JSON.stringify({ ...envelope, toolResult: projected }))
      beforeBytes += before; afterBytes += after; replies++; if (after !== before) changedReplies++
    }
    rows.push({ file, sha256: createHash("sha256").update(bytes).digest("hex"), status: turn.status, replies, changedReplies, beforeBytes, afterBytes, savedBytes: beforeBytes - afterBytes, reconstructedExactly: true })
  }
  const result = { scope: "Counterfactual zero-call replay of actual A0 sent envelopes; no measured token/time effect claimed", session: path.relative(repo, session).split(path.sep).join("/"), providerCalls: 0, defaultContext: "full", rawArchivesModified: false, rows }
  await writeFile(path.join(base, "verification/transmission-replay.json"), JSON.stringify(result, null, 2) + "\n", "utf8")
  return result
}
if (import.meta.main) console.log(JSON.stringify(await replayTransmission(path.resolve(process.argv[2]!))))
