import { readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { root, json, write, sha, qualityIds } from "./study.ts"

/** Compact, reproducible projection of actual originals; this adds no source meaning. */
export async function projectAttemptEvidence(attemptId: string) {
  const directory = path.join(root, "attempts", attemptId), report = await json(path.join(directory, "report.json"))
  const bytes = await readFile(path.join(directory, "inquiry-run.json.gz")), run = JSON.parse(gunzipSync(bytes).toString("utf8"))
  const history = run.native?.history ?? [], samples = run.native?.transmissionAccounting?.samples ?? []
  const distribution: Record<string, number> = {}, components: Record<string, number> = {}
  for (const h of history) distribution[h.call.name] = (distribution[h.call.name] ?? 0) + 1
  for (const sample of samples) for (const [key, value] of Object.entries(sample.components ?? {})) components[key] = (components[key] ?? 0) + (value as number)
  const properties = (report.propertyAnalysis?.checks?.questions ?? []).flatMap((q: any) => q.properties.map((p: any) => ({ questionId: q.questionId, propertyId: p.propertyId, status: p.status, value: p.value, gaps: p.gaps, trace: p.trace, traceDetails: p.traceDetails, semanticReview: p.semanticReview })))
  const result = { attemptId, originalArchive: "inquiry-run.json.gz", originalArchiveSha256: sha(bytes), runtimeTree: report.runtimeTree, actualModelInput: report.actualModelInput, sourceVerification: report.sourceVerification,
    toolDistribution: distribution, sourceWorkMetrics: report.sourceWorkMetrics, propertyMetrics: report.propertyAnalysis?.metrics, properties,
    nonemptyCrossSourceChecks: properties.filter((p: any) => ["checked", "violated"].includes(p.status) && p.trace?.length && new Set((p.traceDetails ?? []).map((v: any) => v.source?.id).filter(Boolean)).size > 1).length,
    domainActions: history.flatMap((h: any, historyIndex: number) => h.call.name.startsWith("authorization_") ? [{ historyIndex, name: h.call.name, arguments: h.call.arguments, outputStatus: h.output?.status, error: h.output?.status === "error" ? h.output.message : undefined, diagnostics: h.output?.controlDiagnostics ?? h.output?.diagnostics ?? [], executed: h.executed, exitCode: h.exitCode }] : []),
    transmission: { boundary: run.native?.transmissionAccounting?.boundary, exactUtf8Bytes: run.native?.transmissionAccounting?.exactUtf8Bytes, samples: samples.length, bytes: samples.reduce((n: number, s: any) => n + s.bytes, 0), components, repeatedBytes: samples.reduce((n: number, s: any) => n + s.repeatedBytes, 0), repeatedParts: samples.reduce((n: number, s: any) => n + s.repeatedParts, 0), exactComponentTokens: false },
    sourceAccounting: report.sourceAccounting, toolBudget: report.toolBudget, reuse: report.reuse, account: { usage: report.accountUsage, durationMs: report.durationMs, hostToolCalls: report.hostToolCalls }, interpretation: "Original native tool history and sent-envelope UTF-8 measurements. No new source meaning, cost duplication, or independent semantic certification." }
  await write(path.join(directory, "mechanism-evidence.json"), result)
  return result
}
if (import.meta.main) for (const id of process.argv[2] === "all-quality" ? qualityIds.map(id => `${id}/original`) : [process.argv[2]!]) { const result = await projectAttemptEvidence(id); console.log(JSON.stringify({ attemptId: result.attemptId, acceptedSourceUnits: result.sourceWorkMetrics?.acceptedSourceUnits ?? 0, nonemptyCrossSourceChecks: result.nonemptyCrossSourceChecks, tools: result.toolDistribution, declarations: result.domainActions.filter((a: any) => a.name === "authorization_declare").map((a: any) => ({ index: a.historyIndex, outputStatus: a.outputStatus, error: a.error, exitCode: a.exitCode, diagnostics: a.diagnostics.map((d: any) => d.code) })), transmission: result.transmission, toolBudget: result.toolBudget, account: result.account })) }
