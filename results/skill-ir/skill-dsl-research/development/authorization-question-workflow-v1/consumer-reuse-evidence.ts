import { readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { root, json, write, sha } from "./study.ts"

// Inspect actual client envelopes in addition to the deterministic seed boundary.
// Whole-artifact absence is not a claim that every overlapping source phrase is absent.
const change = process.argv[2]!, baseline = await json(path.join(root, "reuse-baseline.json"))
const oldDir = path.join(root, "attempts", baseline.attemptId)
const oldAnswer = await readFile(path.join(oldDir, "answer-original.md"), "utf8")
const oldReview = await readFile(path.join(oldDir, "source-review.json"), "utf8")
const oldRun = JSON.parse(gunzipSync(await readFile(path.join(oldDir, "inquiry-run.json.gz"))).toString("utf8"))
function consumerStrings(value: any, depth = 0): string[] {
  if (typeof value === "string") {
    if (depth < 3 && /^[\[{]/.test(value.trim())) {
      try { return [value, ...consumerStrings(JSON.parse(value), depth + 1)] } catch { /* Plain model/source text stays a string. */ }
    }
    return [value]
  }
  if (Array.isArray(value)) return value.flatMap(v => consumerStrings(v, depth))
  return value && typeof value === "object" ? [JSON.stringify(value), ...Object.values(value).flatMap(v => consumerStrings(v, depth))] : []
}
const rows = []
for (const arm of ["fresh", "previous"]) {
  const attemptId = `${change}-${arm}/${arm === "previous" ? process.argv[3] ?? "original" : "original"}`, dir = path.join(root, "attempts", attemptId)
  const archive = await readFile(path.join(dir, "inquiry-run.json.gz")), run = JSON.parse(gunzipSync(archive).toString("utf8"))
  const events = run.telemetry.account.events.filter((e: any) => e.direction === "client")
  const envelopes = events.map((e: any) => JSON.stringify(e.params ?? e.result)), methods: Record<string, number> = {}
  for (const event of events) methods[event.method ?? "tool-result"] = (methods[event.method ?? "tool-result"] ?? 0) + 1
  const strings = events.flatMap((e: any) => consumerStrings(e.params ?? e.result))
  const serialized = strings.join("\n")
  const wholeOldAnswerPresent = serialized.includes(oldAnswer) || serialized.includes(JSON.stringify(oldAnswer).slice(1, -1))
  const wholeOldReviewPresent = serialized.includes(oldReview) || serialized.includes(JSON.stringify(JSON.parse(oldReview)))
  const oldProperties = JSON.stringify(oldRun.domain?.propertyAnalysis?.checks ?? null)
  rows.push({ attemptId, originalArchiveSha256: sha(archive), clientEvents: events.length, methods, decodedStringsInspected: strings.length, wholeOldAnswerPresent, wholeOldReviewPresent,
    wholeOldPropertyChecksPresent: oldProperties !== "null" && serialized.includes(oldProperties), oldPropertyCheckBytes: Buffer.byteLength(oldProperties),
    actualReuse: run.reuse, sourceAccounting: run.sourceAccounting, currentMaterialUses: run.domain?.materialUses ?? [], currentMaterials: run.domain?.sourceMaterials?.materials.map((m: any) => ({ id: m.id, current: m.current, interpretationSource: m.interpretationSource, source: m.source, complete: m.unit?.complete, clientEnvelopesMentioningHandle: envelopes.filter((s: string) => s.includes(m.id)).length })) ?? [],
    toolErrors: (run.native?.history ?? []).flatMap((h: any, index: number) => h.exitCode !== 0 || h.output?.status === "error" ? [{ index, name: h.call.name, exitCode: h.exitCode, message: h.output?.message }] : []),
    executionFailures: (run.native?.history ?? []).flatMap((h: any, index: number) => h.exitCode !== 0 ? [{ index, name: h.call.name, exitCode: h.exitCode }] : []) })
}
const result = { schemaVersion: "authorization-be-consumer-reuse-evidence/v1", change, baselineAttemptId: baseline.attemptId, rows,
  deterministicBoundary: ["inquiry-reuse.ts:43-49", "inquiry-reuse.ts:92-107", "inquiry-reuse.ts:110-142", "inquiry-local.ts:92-113"],
  interpretation: "Actual original client envelopes plus seed construction: source materials/evidence only, empty current policy rules, no prior final/validation/property results in the question-workflow seed. Whole-artifact string absence is supporting evidence, not fragment-level semantic certification. Current checks are recomputed; R2 remains separately qualified." }
await write(path.join(root, "verification", `${change}-consumer-evidence.json`), result)
console.log(JSON.stringify({ change, rows: rows.map(r => ({ attemptId: r.attemptId, clientEvents: r.clientEvents, wholeOldAnswerPresent: r.wholeOldAnswerPresent, wholeOldReviewPresent: r.wholeOldReviewPresent, wholeOldPropertyChecksPresent: r.wholeOldPropertyChecksPresent, toolErrors: r.toolErrors, executionFailures: r.executionFailures, actualReuse: r.actualReuse })) }))
