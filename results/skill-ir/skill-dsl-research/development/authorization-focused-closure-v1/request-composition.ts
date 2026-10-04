import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { root, sha } from "./prepare.ts"
export function measureRequest(record: any) {
  const params = record.params ?? record, messages = params.messages ?? []
  const measure = (value: any) => { const text = typeof value === "string" ? value : JSON.stringify(value ?? null); return { utf16CodeUnits: text.length, utf8Bytes: Buffer.byteLength(text) } }
  const contextText = messages.find((m: any) => m.content.startsWith("Current local explanation context: "))?.content
  let local: any
  if (contextText) try { local = JSON.parse(contextText.slice("Current local explanation context: ".length)) } catch {}
  return { serializedRecord: measure(record), serializedParams: measure(params), serializedMessages: measure(messages), messageContents: measure(messages.map((m: any) => m.content).join("\n")), system: measure(params.system ?? ""), toolSchema: measure(params.tools ?? []), toolResults: measure(record.toolResults), previousResponse: measure(record.previousResponse), currentLocalContext: measure(contextText ?? ""), localSections: local ? Object.fromEntries(Object.entries(local).map(([key, value]) => [key, measure(value)])) : null, interpretation: "UTF-16 string length and serialized UTF-8 bytes of retained records, not wire payload bytes or tokens; sections overlap and must not be summed as independent costs." }
}
export async function inspectInheritedRequests() {
  const base = path.resolve(root, "../authorization-semantic-lowering-v1/runs/native-github-security-review-gitea-create-issue-original/attempt-2"), trace = JSON.parse(await readFile(path.join(base, "native-trace.json"), "utf8")), rows = []
  for (const sequence of [5, 11]) {
    const file = path.join(base, `native-trace.json.events/request-${sequence}.json`), bytes = await readFile(file)
    rows.push({ sequence, artifact: path.relative(root, file).split(path.sep).join("/"), artifactSha256: sha(bytes), ...measureRequest(JSON.parse(bytes.toString("utf8"))), actualUsage: trace.attempts[sequence - 1]?.response?.tokens ?? null })
  }
  const result = { schemaVersion: "authorization-at-inherited-request-composition/v1", providerCallsDuringInspection: 0, rows, decision: "Remove repeated full queue/graph/rejected payloads from current focused context; advertise only current phase. Retain original skill, actual source windows and archives. No token-saving or quality claim from reserialization." }
  await writeFile(path.join(root, "evaluator/inherited-request-composition.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
  return rows.map(r => ({ sequence: r.sequence, messageContents: r.messageContents, local: r.currentLocalContext, actualUsage: r.actualUsage }))
}
if (import.meta.main) console.log(JSON.stringify(await inspectInheritedRequests()))
