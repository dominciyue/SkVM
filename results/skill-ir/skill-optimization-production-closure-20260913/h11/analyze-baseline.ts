import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"

const h11Dir = path.resolve(import.meta.dir)
const rootDir = path.resolve(h11Dir, "../../../..")
const outputPath = path.resolve(process.argv[2] ?? path.join(h11Dir, "baseline-analysis.json"))
const inputs = [
  {
    id: "h8-i18n",
    report: "results/skill-ir/skill-optimization-production-closure-20260913/h8/natural-consumption-run-001/report-revision-001.json",
    events: "results/skill-ir/skill-optimization-production-closure-20260913/h8/natural-consumption-run-001/agent-events.json.gz",
  },
  {
    id: "h9-law",
    report: "results/skill-ir/skill-optimization-production-closure-20260913/h9/natural-consumption-run-001/report.json",
    events: "results/skill-ir/skill-optimization-production-closure-20260913/h9/natural-consumption-run-001/agent-events.json.gz",
  },
]

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function resultText(result: unknown): string {
  const record = result as { content?: Array<{ type?: string, text?: string }> } | undefined
  return (record?.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("")
}

const runs = []
for (const input of inputs) {
  const reportBytes = await Bun.file(path.join(rootDir, input.report)).bytes()
  const report = JSON.parse(new TextDecoder().decode(reportBytes)) as any
  const compressed = await Bun.file(path.join(rootDir, input.events)).bytes()
  const raw = new Uint8Array(gunzipSync(compressed))
  const events = JSON.parse(new TextDecoder().decode(raw)) as any[]
  const ends = new Map(events.filter((event) => event.type === "tool_execution_end").map((event) => [event.toolCallId, event]))
  const declaredEntrypoints = report.package.selectedEntrypoints as string[]
  const toolCalls = events.filter((event) => event.type === "tool_execution_start").map((event) => {
    const end = ends.get(event.toolCallId)
    const command = typeof event.args?.command === "string" ? event.args.command : null
    const targetPath = typeof event.args?.path === "string" ? event.args.path.replaceAll("\\", "/") : null
    const entrypoint = declaredEntrypoints.find((entry) => command?.includes(entry)) ?? null
    return {
      id: event.toolCallId,
      tool: event.toolName,
      args: event.args,
      resultCharacters: resultText(end?.result).length,
      isError: end?.result?.isError ?? null,
      classifications: {
        skillRead: event.toolName === "read" && targetPath === "skill/SKILL.md",
        packageEnumeration: (event.toolName === "find" || event.toolName === "ls") && targetPath === "skill",
        helperSourceRead: event.toolName === "read" && targetPath !== null && targetPath.startsWith("skill/scripts/"),
        helperHelp: entrypoint !== null && /(?:^|\s)--help(?:\s|$)/u.test(command ?? ""),
        helperProgram: entrypoint !== null && !/(?:^|\s)--help(?:\s|$)/u.test(command ?? ""),
      },
    }
  })
  const readPaths = toolCalls.filter((call) => call.tool === "read" && typeof call.args?.path === "string")
    .map((call) => call.args.path.replaceAll("\\", "/"))
  const duplicates = [...new Set(readPaths.filter((item, index) => readPaths.indexOf(item) !== index))].sort()
  const count = (key: keyof (typeof toolCalls)[number]["classifications"]) => toolCalls.filter((call) => call.classifications[key]).length
  runs.push({
    id: input.id,
    source: {
      report: { path: input.report, bytes: reportBytes.byteLength, sha256: sha256(reportBytes) },
      events: { path: input.events, bytes: compressed.byteLength, sha256: sha256(compressed), rawBytes: raw.byteLength, rawSha256: sha256(raw) },
    },
    evidenceBindingsMatch: report.runtime.agentEvents.sha256 === sha256(compressed)
      && report.runtime.agentEvents.rawSha256 === sha256(raw),
    taskPassed: report.verification.taskPassed === true && report.consumption.taskOutcome === "passed",
    metrics: {
      durationMs: report.runtime.durationMs,
      modelResponseCount: report.runtime.executionObservation.counts.modelResponseCount,
      toolCallCount: report.runtime.executionObservation.counts.toolCallCount,
      toolOutputCharacters: report.runtime.executionObservation.counts.toolOutputCharacters,
      tokens: report.runtime.tokens,
      totalObservedTokens: report.runtime.tokens.input + report.runtime.tokens.output + report.runtime.tokens.cacheRead + report.runtime.tokens.cacheWrite,
      skillReads: count("skillRead"),
      packageEnumerations: count("packageEnumeration"),
      helperSourceReads: count("helperSourceRead"),
      helperHelpCalls: count("helperHelp"),
      helperProgramCalls: count("helperProgram"),
      repeatedReadPaths: duplicates,
      entrypointDiscoveryCalls: count("packageEnumeration") + count("helperSourceRead") + count("helperHelp"),
    },
    toolCalls,
  })
}

const checks = {
  allBindingsMatch: runs.every((run) => run.evidenceBindingsMatch),
  bothTasksPassed: runs.every((run) => run.taskPassed),
  bothEnumeratedPackage: runs.every((run) => run.metrics.packageEnumerations === 1),
  noHelperSourceRead: runs.every((run) => run.metrics.helperSourceReads === 0),
  noRepeatedReadPath: runs.every((run) => run.metrics.repeatedReadPaths.length === 0),
  h9AddedHelpDiscovery: runs.find((run) => run.id === "h9-law")?.metrics.helperHelpCalls === 1,
}
const passed = Object.values(checks).every(Boolean)
const report = {
  schemaVersion: "skill-optimization-production-closure-h11-baseline/v1",
  identity: "skill-optimization-production-closure-20260913-h11-baseline-analysis",
  exposure: "development",
  status: passed ? "passed" : "failed",
  runs,
  checks,
  diagnosis: "Both natural consumers read SKILL.md and then enumerated the package even though SKILL.md named the executable. The Law consumer also emitted a full --help call before executing a command already documented by the package. Neither consumer reread the same file or inspected helper source, so the bounded shared target is routine entrypoint discovery, not source-read suppression.",
  claimBoundary: "Read-only analysis of two preserved development traces. Tool-call counts and provider tokens are exact report fields; duration is noisy, actual USD remains unknown, and the two different tasks are not an effect pair.",
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify(report, null, 2))
if (!passed) process.exitCode = 1
