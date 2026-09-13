import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const h11Dir = path.resolve(import.meta.dir)
const rootDir = path.resolve(h11Dir, "../../../..")
const outputPath = path.resolve(process.argv[2] ?? path.join(h11Dir, "report.json"))

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

async function bound(relativePath: string) {
  const bytes = new Uint8Array(await readFile(path.join(h11Dir, relativePath)))
  return { path: relativePath.replaceAll("\\", "/"), bytes: bytes.byteLength, sha256: sha256(bytes) }
}

async function json(relativePath: string) {
  return JSON.parse(await readFile(path.join(h11Dir, relativePath), "utf8")) as any
}

const baseline = await json("baseline-analysis.json")
const pair = await json("pair-analysis.json")
const failure = await json("optimizer-run-001-failure.json")
const history = await json("proposal-attempt-001-revision-001/history.json")
const manifest = await json("package-attempt-001-revision-001/optimization-manifest.json")
const optimizerRound = history.rounds.find((item: any) => item.round === 1)

const report = {
  schemaVersion: "skill-optimization-production-closure-h11/v1",
  identity: "skill-optimization-production-closure-20260913-h11-entrypoint-handoff",
  exposure: "development",
  status: "completed",
  stage: "H11",
  result: {
    sharedUsageIssueEnteredProductionStrategy: true,
    matchedBehaviorPassed: pair.status === "passed",
    preregisteredEffect: pair.preregistered.decision,
    qualityRegression: !pair.pairChecks.bothQualityPassed,
    packageDeliveryStatus: manifest.validation.deliveryStatus,
    remainingRoutineDiscovery: "one package enumeration",
  },
  baseline: {
    evidence: await bound("baseline-analysis.json"),
    checks: baseline.checks,
    diagnosis: baseline.diagnosis,
  },
  productionChanges: [
    {
      area: "optimizer handoff prompt",
      files: ["src/jit-optimize/optimizer.ts", "test/jit-optimize/optimizer-prompt.test.ts"],
      change: "Require a copy-ready common-path command, common arguments, concise stdout/path/error/residual handoff, and retain --help/source inspection for uncommon or diagnostic work.",
    },
    {
      area: "general-skill trace ingestion",
      files: ["src/jit-optimize/trace-adapters.ts", "test/jit-optimize/trace-adapters.test.ts"],
      change: "Load skill-ir-general-skill-development/v1 through its gzip Pi-event binding, verify compressed/raw size and SHA-256, preserve usage/quality/workdir facts, and fail closed on mismatch.",
    },
  ],
  infrastructureFailure: {
    evidence: await bound("optimizer-run-001-failure.json"),
    status: failure.status,
    modelCallMade: failure.modelCallMade,
    error: failure.error,
    retained: true,
  },
  optimizer: {
    ordinaryCliModelRuns: 1,
    model: "xty/gpt-5.6-sol",
    proposal: {
      identity: "bare-agent/xty--gpt-5.6-sol/round-1/20260913T152806230Z",
      meta: await bound("proposal-attempt-001-revision-001/meta.json"),
      submission: await bound("proposal-attempt-001-revision-001/round-1-optimizer/submission.json"),
      rawStdoutArchive: await bound("proposal-attempt-001-revision-001/round-1-optimizer/stdout.log.gz"),
    },
    tokens: optimizerRound.optimizer.tokens,
    reportedCostUsd: optimizerRound.optimizer.costUsd,
    actualCostUsd: null,
    actualCostMissingReason: "The provider route reported zero and no invoice or route-specific price binding was supplied.",
    actualDiff: manifest.actualDiff,
    package: {
      path: "package-attempt-001-revision-001",
      manifest: await bound("package-attempt-001-revision-001/optimization-manifest.json"),
      selectedClosureSha256: manifest.snapshots.selectedClosureSha256,
      deliveryStatus: manifest.validation.deliveryStatus,
      closureStatus: manifest.validation.status,
      behaviorStatus: manifest.validation.behaviorStatus,
      boundary: "The exported package is a draft because action-local evidence has no independent case. H11 uses it only as a development behavior candidate, not as a validated recommendation.",
    },
  },
  matchedBehavior: {
    evidence: await bound("pair-analysis.json"),
    task: "Same H9 Law prompt, input bytes, expected paths, residual audit, model and Pi driver.",
    quality: pair.standardEffect.quality,
    preregistered: pair.preregistered,
    metrics: pair.standardEffect.aggregate,
    toolOutputCharacters: pair.additionalObservedMetrics.toolOutputCharacters,
    effect: pair.standardEffect.effect,
    costComparison: pair.standardEffect.costComparison,
    residualIssue: "Package enumeration remained 1 -> 1. The full --help call fell 1 -> 0, and the ad hoc inline preservation checker was not repeated; no claim is made that all discovery was eliminated.",
  },
  verification: [
    {
      command: "bun test ./test/jit-optimize/optimizer-prompt.test.ts --test-name-pattern='copy-ready common path'",
      result: "expected red before implementation, then passed",
    },
    {
      command: "bun test ./test/jit-optimize/trace-adapters.test.ts --test-name-pattern='general-skill development'",
      result: "expected red before implementation, then passed",
    },
    {
      command: "bun test ./test/jit-optimize/effect.test.ts ./test/jit-optimize/consumption.test.ts ./test/jit-optimize/optimizer-prompt.test.ts ./test/jit-optimize/trace-adapters.test.ts",
      result: "45 passed, 168 assertions, 0 failed",
    },
    { command: "bun run typecheck", result: "passed" },
    { command: "bun results/skill-ir/skill-optimization-production-closure-20260913/h11/analyze-pair.ts", result: "passed" },
    { command: "bounded secret-pattern scan over the raw optimizer stdout", result: "0 API-key, Bearer-token or sk-token pattern matches" },
  ],
  accounting: {
    projectRuntime: {
      optimizerModelRuns: 1,
      targetAgentRuns: 1,
      businessApiCalls: 0,
      reportedCostUsd: 0,
      actualCostUsd: null,
    },
    developerAgent: "separate and not measured by project runtime reports",
  },
  interpretation: pair.interpretation,
  claimBoundary: "H11 supports one preregistered development pair and one shared prompt-policy correction. It does not establish stable latency, actual USD, broad token savings, whole-skill quality, human savings, readiness, prospective performance, or repair of the historical Law 0.7 source/evaluator conflict.",
  nextStage: "H12: run the same production entry on a different-structure development member and retain the first-run boundary without name-specific core logic.",
}

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ status: report.status, effect: report.matchedBehavior.effect, deliveryStatus: report.optimizer.package.deliveryStatus }, null, 2))
if (!report.result.matchedBehaviorPassed || report.result.qualityRegression) process.exitCode = 1
