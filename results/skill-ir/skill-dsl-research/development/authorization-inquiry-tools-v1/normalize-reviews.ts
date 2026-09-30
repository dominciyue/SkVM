import path from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { bindReview, packetDigest } from "./evaluate.ts"
import { authorDigest } from "./author-review.ts"

const root = import.meta.dir
const json = async (file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"))
const hash = (text: string) => createHash("sha256").update(text).digest("hex")
const command = process.argv[2]
if (!["write", "replay"].includes(command!)) throw new Error("Use write|replay; never invokes a provider")
const receipt = await json("review/receipt.json"), amendments = await json("review/adjudications.json"), index = await json("review/index.json")
const changes: unknown[] = [], seen = new Set<string>()
const save = async (file: string, value: unknown) => {
  const text = JSON.stringify(value, null, 2) + "\n", target = path.join(root, file)
  if (command === "replay") { if (await readFile(target, "utf8") !== text) throw new Error(`Review normalization changed: ${file}`) }
  else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, text, { encoding: "utf8", flag: "wx" }) }
}
for (const entry of receipt.receipt) {
  const original = await readFile(path.join(root, entry.file), "utf8")
  if (hash(original) !== entry.sha256) throw new Error("Raw reviewer message changed")
  if (entry.agent.endsWith("ao_final_independent_audit")) continue
  const raw = JSON.parse(original.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))
  if (JSON.stringify(raw) !== JSON.stringify(await json(entry.file.replace(/\.txt$/, ".json")))) throw new Error("Raw review serialization changed")
  for (const provided of raw) {
    if (seen.has(provided.sampleId)) throw new Error("Duplicate independent review")
    seen.add(provided.sampleId)
    const sample = index.samples.find((s: any) => s.sampleId === provided.sampleId)
    if (!sample?.reviewRequired) throw new Error("Unregistered review")
    const packetText = await readFile(path.join(root, sample.file), "utf8"), packet = JSON.parse(packetText), review = structuredClone(provided), normalization: string[] = []
    if (review.packetSha256 !== packetDigest(packet)) {
      if (review.packetSha256 !== hash(packetText)) throw new Error("Reviewer digest matches neither canonical packet nor original file bytes")
      review.packetSha256 = packetDigest(packet); normalization.push("Raw pretty-file SHA verified, then normalized to registered canonical packet SHA; no packet bytes changed")
    }
    if (packet.kind === "author" && review.artifactSha256 !== authorDigest(packet.candidate)) {
      if (provided.sampleId !== "sample-5ea509a3" || review.artifactSha256 !== "9f462b459e648b641f81e75c34b97b50e0cef6eb931faf3291e0ccfb861559") throw new Error("Unadjudicated author digest mismatch")
      review.artifactSha256 = authorDigest(packet.candidate)
      normalization.push("Main checked current MD candidate and the four reviewer excerpts: provided artifact SHA omitted the characters 2f, while packet SHA was exact. Corrected identity only; semantic judgment retained")
    }
    if (packet.kind !== "author") review.issues = review.issues.map((issue: any) => typeof issue === "string" ? { kind: "other", detail: issue } : issue)
    const amendment = amendments.samples[provided.sampleId]
    if (amendment) {
      if (amendment.dropIssueIndices) review.issues = review.issues.filter((_: unknown, i: number) => !amendment.dropIssueIndices.includes(i))
      if (amendment.criteria) review.criteria = { ...review.criteria, ...amendment.criteria }
      if (amendment.issues) review.issues = amendment.issues
      if (amendment.sourceSupport) review.sourceSupport = amendment.sourceSupport
      review.rationale += ` Main-agent adjudication: ${amendment.reason}`
    }
    bindReview(packet, review)
    await save(`review/decisions/${provided.sampleId}.json`, review)
    changes.push({ sampleId: provided.sampleId, rawAgent: entry.agent, rawMessageSha256: entry.sha256, normalization, ...(amendment ? { amendment, originalCriteria: provided.criteria ?? null, originalIssues: provided.issues ?? null } : {}) })
  }
}
if (seen.size !== index.samples.filter((s: any) => s.reviewRequired).length) throw new Error("Missing semantic reviews")
await save("review/normalization.json", { schemaVersion: "authorization-ao-review-normalization/v1", development: true, reviewer: "development-agent", originalMessagesRetained: true, providerCalls: 0, changes })
console.log(`${command === "replay" ? "Replayed" : "Archived"} ${seen.size} semantic decisions; original reviewer messages retained; zero provider calls`)
