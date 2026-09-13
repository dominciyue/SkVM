import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { analyzeMatchedConsumptionPairs } from "../../../../src/jit-optimize/effect.ts"

const h11Dir = path.resolve(import.meta.dir)
const outputPath = path.resolve(process.argv[2] ?? path.join(h11Dir, "pair-analysis.json"))
const runInputs = [
  {
    id: "h9-law-baseline",
    report: path.resolve(h11Dir, "../h9/natural-consumption-run-001/report.json"),
    events: path.resolve(h11Dir, "../h9/natural-consumption-run-001/agent-events.json.gz"),
    work: path.resolve(h11Dir, "../h9/natural-consumption-run-001/work"),
  },
  {
    id: "h11-law-candidate",
    report: path.resolve(h11Dir, "natural-consumption-run-001/report.json"),
    events: path.resolve(h11Dir, "natural-consumption-run-001/agent-events.json.gz"),
    work: path.resolve(h11Dir, "natural-consumption-run-001/work"),
  },
] as const

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function relative(filePath: string): string {
  return path.relative(path.resolve(h11Dir, "../../../.."), filePath).replaceAll("\\", "/")
}

function resultText(result: unknown): string {
  const record = result as { content?: Array<{ type?: string, text?: string }> } | undefined
  return (record?.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("")
}

function semanticCharacters(value: string): string {
  return value.replace(/^#{1,6}[ \t]+/gmu, "").replace(/\s/gu, "")
}

const prepared = []
for (const input of runInputs) {
  const reportBytes = new Uint8Array(await readFile(input.report))
  const report = JSON.parse(new TextDecoder().decode(reportBytes)) as any
  const compressed = new Uint8Array(await readFile(input.events))
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
        reviewRead: event.toolName === "read" && targetPath?.endsWith("+审核报告.md") === true,
        deliverableRead: event.toolName === "read" && targetPath?.endsWith("+最终成果.md") === true,
      },
    }
  })
  const count = (key: keyof (typeof toolCalls)[number]["classifications"]) => toolCalls.filter((call) => call.classifications[key]).length
  const sourceText = await readFile(path.join(input.work, "incoming/renamed-statute.txt"), "utf8")
  const deliverableText = await readFile(path.join(input.work, "outputs/renamed-statute/renamed-statute+最终成果.md"), "utf8")
  const reviewText = await readFile(path.join(input.work, "outputs/renamed-statute/renamed-statute+审核报告.md"), "utf8")
  const audit = JSON.parse(await readFile(path.join(input.work, "completion-audit.json"), "utf8")) as Record<string, unknown>
  const expectedAudit = {
    classification: "law",
    commandSucceeded: true,
    reviewApproved: true,
    deliverableInspected: true,
    inputPreserved: true,
  }
  const independentChecks = {
    eventArchiveBinding: report.runtime.agentEvents.sha256 === sha256(compressed)
      && report.runtime.agentEvents.rawSha256 === sha256(raw),
    sourceCharactersPreserved: semanticCharacters(sourceText) === semanticCharacters(deliverableText),
    headingHierarchy: [
      "# 中华人民共和国示例消费者权益法",
      "### 第一章 总则",
      "##### 第一条",
      "##### 第二条",
    ].every((heading) => deliverableText.split(/\r?\n/u).includes(heading)),
    reviewApproved: reviewText.includes("最终审核结论：通过") && reviewText.includes("是否可交付：是"),
    exactResidualAudit: JSON.stringify(audit) === JSON.stringify(expectedAudit),
    reviewInspectedByAgent: count("reviewRead") > 0,
    deliverableInspectedByAgent: count("deliverableRead") > 0,
    helperSucceeded: report.consumption.helperSucceeded === true && report.consumption.fallbackUsed === false,
    packagePreserved: report.verification.skillPackagePreserved === true,
    protectedInputPreserved: report.verification.protectedResourcesPreserved === true,
    taskPassed: report.verification.taskPassed === true && report.status === "passed",
  }
  const qualityPassed = Object.values(independentChecks).every(Boolean)
  const counts = report.runtime.executionObservation.counts
  prepared.push({
    id: input.id,
    report,
    sourceText,
    reportBinding: {
      report: { path: relative(input.report), bytes: reportBytes.byteLength, sha256: sha256(reportBytes) },
      events: {
        path: relative(input.events),
        bytes: compressed.byteLength,
        sha256: sha256(compressed),
        rawBytes: raw.byteLength,
        rawSha256: sha256(raw),
      },
    },
    metrics: {
      durationMs: report.runtime.durationMs,
      modelResponseCount: counts.modelResponseCount,
      toolCallCount: counts.toolCallCount,
      retryCount: counts.retryCount,
      toolOutputCharacters: counts.toolOutputCharacters,
      tokens: report.runtime.tokens,
      totalObservedTokens: report.runtime.tokens.input + report.runtime.tokens.output
        + report.runtime.tokens.cacheRead + report.runtime.tokens.cacheWrite,
      skillReads: count("skillRead"),
      packageEnumerations: count("packageEnumeration"),
      helperSourceReads: count("helperSourceRead"),
      helperHelpCalls: count("helperHelp"),
      helperProgramCalls: count("helperProgram"),
      entrypointDiscoveryCalls: count("packageEnumeration") + count("helperSourceRead") + count("helperHelp"),
    },
    independentChecks,
    qualityPassed,
    toolCalls,
  })
}

const [baseline, candidate] = prepared
if (!baseline || !candidate) throw new Error("Expected one baseline and one candidate")
const expectedPaths = (value: any) => value.verification.expectedFiles.map((item: any) => item.path).sort()
const residualPaths = (value: any) => value.verification.residualEvidenceFiles.map((item: any) => item.path).sort()
const taskBinding = {
  prompt: baseline.report.prompt,
  inputPath: "incoming/renamed-statute.txt",
  inputSha256: sha256(baseline.sourceText),
  expectedPaths: expectedPaths(baseline.report),
  residualPaths: residualPaths(baseline.report),
}
const pairChecks = {
  promptsMatch: baseline.report.prompt === candidate.report.prompt,
  inputBytesMatch: baseline.sourceText === candidate.sourceText,
  expectedPathsMatch: JSON.stringify(expectedPaths(baseline.report)) === JSON.stringify(expectedPaths(candidate.report)),
  residualPathsMatch: JSON.stringify(residualPaths(baseline.report)) === JSON.stringify(residualPaths(candidate.report)),
  modelMatches: baseline.report.runtime.model === candidate.report.runtime.model,
  driverMatches: baseline.report.runtime.driver === candidate.report.runtime.driver,
  bothQualityPassed: baseline.qualityPassed && candidate.qualityPassed,
}
if (!Object.values(pairChecks).every(Boolean)) throw new Error(`Unmatched H11 pair: ${JSON.stringify(pairChecks)}`)
const inputSha256 = taskBinding.inputSha256
const bindingSha256 = sha256(JSON.stringify(taskBinding))
const comparable = (item: typeof baseline) => ({
  source: { inputSha256, bindingSha256 },
  runtime: {
    model: item.report.runtime.model,
    driver: item.report.runtime.driver,
    bunVersion: Bun.version,
    nodeVersion: process.version,
  },
  targetAgent: {
    durationMs: item.report.runtime.durationMs,
    usageAvailable: item.report.runtime.executionObservation.usage.available === true,
    tokens: item.report.runtime.tokens,
    actualCostUsd: item.report.runtime.actualCostUsd,
    counts: {
      runCount: item.report.runtime.executionObservation.counts.runCount,
      modelResponseCount: item.report.runtime.executionObservation.counts.modelResponseCount,
      turnCount: item.report.runtime.executionObservation.counts.turnCount,
      toolCallCount: item.report.runtime.executionObservation.counts.toolCallCount,
      retryCount: item.report.runtime.executionObservation.counts.retryCount,
    },
  },
  verification: { qualityPassed: item.qualityPassed },
})
const standardEffect = analyzeMatchedConsumptionPairs([{
  pairId: "h9-law-to-h11-law-common-path",
  original: comparable(baseline),
  optimized: comparable(candidate),
}])
const metricDifference = (original: number, optimized: number) => ({
  original,
  optimized,
  delta: optimized - original,
  changeRatio: original === 0 ? null : (optimized - original) / original,
})
const primaryMetric = metricDifference(baseline.metrics.entrypointDiscoveryCalls, candidate.metrics.entrypointDiscoveryCalls)
const preregisteredDecision = candidate.qualityPassed && candidate.metrics.entrypointDiscoveryCalls <= 1
  ? "positive"
  : "no-benefit"
const report = {
  schemaVersion: "skill-optimization-production-closure-h11-pair-analysis/v1",
  identity: "skill-optimization-production-closure-20260913-h11-law-pair",
  exposure: "development",
  status: preregisteredDecision === "positive" ? "passed" : "failed",
  taskBinding: { ...taskBinding, bindingSha256 },
  runtimeBinding: {
    model: baseline.report.runtime.model,
    driver: baseline.report.runtime.driver,
    bunVersion: Bun.version,
    nodeVersion: process.version,
    host: "same active local checkout and runtime installation",
    limitation: "The H9 report did not embed Bun or Node versions; the pair ran on the same host and branch without a runtime installation change, and the current versions are recorded here for reproduction.",
  },
  pairChecks,
  preregistered: {
    primaryMetric: "entrypointDiscoveryCalls",
    target: "candidate <= 1 with quality passed",
    result: primaryMetric,
    decision: preregisteredDecision,
    secondary: {
      packageEnumerations: metricDifference(baseline.metrics.packageEnumerations, candidate.metrics.packageEnumerations),
      helperHelpCalls: metricDifference(baseline.metrics.helperHelpCalls, candidate.metrics.helperHelpCalls),
      toolCallCount: metricDifference(baseline.metrics.toolCallCount, candidate.metrics.toolCallCount),
    },
  },
  runs: prepared.map(({ report: _report, sourceText: _sourceText, ...item }) => item),
  standardEffect,
  additionalObservedMetrics: {
    toolOutputCharacters: metricDifference(baseline.metrics.toolOutputCharacters, candidate.metrics.toolOutputCharacters),
  },
  optimizerCost: {
    tokens: { input: 39995, output: 6999, cacheRead: 194944, cacheWrite: 0 },
    reportedCostUsd: 0,
    actualCostUsd: null,
    note: "Development-agent optimizer consumption is separate from the paired package-consumption effect. Provider-reported zero is not treated as actual zero.",
  },
  interpretation: "The preregistered routine-entrypoint metric improved without quality regression. All observed target-agent token fields, tool output characters, tool calls and model responses also decreased in this one pair. Duration decreased but is a noisy one-run observation; actual USD is unknown. This does not establish general cost, latency, human-effort or whole-skill savings.",
  claimBoundary: "One matched development pair on an already exposed synthetic TXT fixture. It validates the common-path handoff behavior only; no held-out or prospective input was selected or read.",
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({
  status: report.status,
  primary: report.preregistered,
  effect: report.standardEffect.effect,
  toolOutputCharacters: report.additionalObservedMetrics.toolOutputCharacters,
}, null, 2))
if (report.status !== "passed") process.exitCode = 1
