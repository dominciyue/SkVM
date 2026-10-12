import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createInquiryTransmissionMeter } from "../../../../../src/benchmarks/authorization-dsl/inquiry-context.ts"
import { loadRunSkill, buildRunSkillBundle } from "../../../../../src/run/index.ts"

const base = import.meta.dir, repo = path.resolve(base, "../../../../..")
const load = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
const ledger: any[] = await load(path.join(base, "attempts.json")), observations = []
for (const entry of ledger.filter(e => e.session && e.status === "completed")) {
  const session = path.join(repo, entry.session), run = await load(path.join(session, "run.json"))
  const lifecycle = (await readFile(path.join(session, "raw/lifecycle.jsonl"), "utf8")).trim().split(/\r?\n/).map(s => JSON.parse(s))
  const start = lifecycle.find(e => e.direction === "client" && e.method === "thread/start")
  const turn = lifecycle.find(e => e.direction === "client" && e.method === "turn/start")
  const replies = lifecycle.filter(e => e.direction === "client" && e.result?.contentItems).flatMap(e => e.result.contentItems.filter((c: any) => c.type === "inputText").map((c: any) => c.text))
  assert.ok(start && turn, "Archived client startup payloads must exist")
  const texts = [JSON.stringify(start.params.dynamicTools), start.params.baseInstructions, turn.params.input[0].text, ...replies]
  const receipt = run.native.transmissionAccounting
  assert.equal(texts.length, receipt.samples.length)
  const mismatches = texts.flatMap((text, i) => Buffer.byteLength(text) === receipt.samples[i].bytes && hash(text) === receipt.samples[i].sha256 ? [] : [{ sequence: i + 1, rawBytes: Buffer.byteLength(text), receiptBytes: receipt.samples[i].bytes, rawSha256: hash(text), receiptSha256: receipt.samples[i].sha256 }])
  const skill = await loadRunSkill(run.skill.path), skillContent = buildRunSkillBundle(skill, "inject")!.content
  assert.ok(texts[1].startsWith(skillContent + "\n"), "Original full skill bundle matches archived system payload")
  const meter = createInquiryTransmissionMeter()
  meter.record("static-tools", start.params.dynamicTools, texts[0], "schemaProtocol")
  meter.recordSystem(texts[1], skillContent)
  const prefix = "Current original task and full skill are declared in the system.\nCurrent local explanation context: "
  assert.ok(texts[2].startsWith(prefix))
  meter.record("initial-context", JSON.parse(texts[2].slice(prefix.length)), texts[2])
  for (const text of replies) meter.record("tool-reply", JSON.parse(text), text)
  const derived = meter.report()
  const classificationMatches = JSON.stringify(derived) === JSON.stringify(receipt)
  observations.push({ position: entry.position, rawClientSamples: texts.length, rawUtf8Bytes: texts.reduce((n, s) => n + Buffer.byteLength(s), 0), allSampleBytesAndSha256Match: mismatches.length === 0, mismatches, classificationMatches, basis: "Actual archived client thread/start, turn/start and tool-reply text; independent of receipt byte/hash values. Classifications rerun with the existing field classifier, not an independent semantic classifier." })
  assert.equal(mismatches.length, 0)
  assert.equal(classificationMatches, true)
}
await writeFile(path.join(base, "verification/transmission-reconciliation.json"), JSON.stringify({ providerCalls: 0, observations, limits: "Serialized protocol text, not provider-internal tokenization or hidden requests. Necessary source checks and repeated state are not automatically waste. Scout receipt-only audit could not reconstruct boundaries; this raw-client derivation supersedes that limitation." }, null, 2) + "\n", "utf8")
console.log(JSON.stringify(observations.map(({ position, rawClientSamples, rawUtf8Bytes, allSampleBytesAndSha256Match, classificationMatches }) => ({ position, rawClientSamples, rawUtf8Bytes, allSampleBytesAndSha256Match, classificationMatches }))))
