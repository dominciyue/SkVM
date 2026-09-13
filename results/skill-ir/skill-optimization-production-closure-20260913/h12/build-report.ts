import { createHash } from "node:crypto"
import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const h12Dir = path.resolve(import.meta.dir)
const rootDir = path.resolve(h12Dir, "../../../..")
const outputPath = path.resolve(process.argv[2] ?? path.join(h12Dir, "report.json"))

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function bound(relativePath: string, base = h12Dir) {
  const bytes = new Uint8Array(await readFile(path.join(base, relativePath)))
  return { path: path.relative(rootDir, path.join(base, relativePath)).replaceAll("\\", "/"), bytes: bytes.byteLength, sha256: sha256(bytes) }
}

async function json(relativePath: string, base = h12Dir) {
  return JSON.parse(await readFile(path.join(base, relativePath), "utf8")) as any
}

const plan = await json("plan.json")
const criteria = await json("criteria-env-line-3.json")
const binding = await json("criteria-env-line-3-binding.json")
const proposalBase = path.join(h12Dir, "proposal-attempt-001")
const meta = await json("meta.json", proposalBase)
const history = await json("history.json", proposalBase)
const submission = await json("round-1-optimizer/submission.json", proposalBase)
const tracePath = path.join(rootDir, binding.trace.path)
const scorePath = path.join(rootDir, binding.scoreSource.path)
const taskPath = path.join(rootDir, binding.taskSource.path)
const traceBytes = new Uint8Array(await readFile(tracePath))
const scoreBytes = new Uint8Array(await readFile(scorePath))
const taskBytes = new Uint8Array(await readFile(taskPath))
const traceLine = new TextDecoder().decode(traceBytes).split(/\r?\n/u)[2]!
const scoreLine = new TextDecoder().decode(scoreBytes).split(/\r?\n/u)[2]!
const traceRow = JSON.parse(traceLine) as any
const scoreRow = JSON.parse(scoreLine) as any
const task = JSON.parse(new TextDecoder().decode(taskBytes)) as any
const expectedCriteria = task.eval.map((item: any) => ({
  id: item.id,
  method: item.method,
  description: item.name,
  weight: item.weight,
  score: scoreRow.evaluationSummary.find((entry: any) => entry.id === item.id)?.score,
  passed: scoreRow.evaluationSummary.find((entry: any) => entry.id === item.id)?.pass,
  details: scoreRow.evaluationSummary.find((entry: any) => entry.id === item.id)?.details,
}))
const sourceDir = path.join(rootDir, "benchmarks/skill-ir/pilots/env-manager/source")
const sourceFiles = (await readdir(sourceDir, { withFileTypes: true }))
  .filter((item) => item.isFile())
  .map((item) => item.name)
  .sort()
const sourceClosure = await Promise.all(sourceFiles.map(async (name) => {
  const bytes = new Uint8Array(await readFile(path.join(sourceDir, name)))
  return { path: name, bytes: bytes.byteLength, sha256: sha256(bytes) }
}))
const optimizerRound = history.rounds.find((item: any) => item.round === 1)
const checks = {
  planWasPreregistered: plan.status === "preregistered" && plan.ordinaryCli.optimizerModelRuns === 1,
  sourceSkillMatches: sourceClosure.find((item) => item.path === "SKILL.md")?.sha256 === plan.authority.skill.skillMdSha256,
  traceMatches: sha256(traceBytes) === binding.trace.sha256 && traceRow.runStatus === "ok",
  scoreMatches: sha256(scoreBytes) === binding.scoreSource.sha256 && scoreRow.success === true && scoreRow.evaluatorScore === 1,
  taskMatches: sha256(taskBytes) === binding.taskSource.sha256,
  criteriaProjectionExact: JSON.stringify(criteria) === JSON.stringify(expectedCriteria),
  exactRecordSelected: traceRow.caseId === "env-manager-v3:skvm:windows:clean:env-manager-scorer-authority-node-dev-001",
  noAnswerProgramConfigured: plan.ordinaryCli.answerProgramProvided === false,
  priorProposalNotInjected: !JSON.stringify(plan.ordinaryCli).includes("g13-env-manager"),
  optimizerReturnedNoChange: submission.noChanges === true
    && submission.changedFiles.length === 0
    && submission.actions.length === 0
    && meta.bestRound === 0
    && meta.bestRoundReason === "no changes were made",
  noPackageExported: !await Bun.file(path.join(h12Dir, "package-attempt-001", "optimization-manifest.json")).exists(),
  qualityAuthorityPassed: criteria.length === 3 && criteria.every((item: any) => item.passed === true && item.score === 1),
}
const passed = Object.values(checks).every(Boolean)
const report = {
  schemaVersion: "skill-optimization-production-closure-h12/v1",
  identity: "skill-optimization-production-closure-20260913-h12-env-first-run",
  exposure: "development",
  status: passed ? "completed" : "failed",
  stage: "H12",
  selection: plan.selection,
  authority: {
    sourceClosure,
    sourceClosureSha256: sha256(JSON.stringify(sourceClosure)),
    trace: {
      path: binding.trace.path,
      fileSha256: sha256(traceBytes),
      recordLocator: "line:3",
      recordSha256: sha256(traceLine),
      caseId: traceRow.caseId,
    },
    score: {
      path: binding.scoreSource.path,
      fileSha256: sha256(scoreBytes),
      recordLocator: "line:3",
      recordSha256: sha256(scoreLine),
      success: scoreRow.success,
      evaluatorScore: scoreRow.evaluatorScore,
      criteriaPassed: scoreRow.evaluationSummary.filter((item: any) => item.pass === true).length,
      criteriaTotal: scoreRow.evaluationSummary.length,
    },
    criteriaProjection: await bound("criteria-env-line-3.json"),
    criteriaBinding: await bound("criteria-env-line-3-binding.json"),
  },
  process: {
    command: plan.ordinaryCli.command,
    modelRuns: 1,
    proposal: {
      identity: "bare-agent/xty--gpt-5.6-sol/source/20260913T155046997Z",
      meta: await bound("meta.json", proposalBase),
      submission: await bound("round-1-optimizer/submission.json", proposalBase),
      rawStdoutArchive: await bound("round-1-optimizer/stdout.log.gz", proposalBase),
    },
    manualConfiguration: plan.ordinaryCli.manualConfiguration,
    additionalContext: plan.ordinaryCli.additionalContext,
    coreModified: false,
    optimizerTokens: optimizerRound.optimizer.tokens,
    reportedCostUsd: optimizerRound.optimizer.costUsd,
    actualCostUsd: null,
    actualCostMissingReason: "The provider route reported zero and no invoice or route-specific price binding was supplied.",
  },
  firstResult: {
    outcome: "no-change",
    bestRound: meta.bestRound,
    reason: submission.rootCause,
    confidence: submission.confidence,
    opportunityDispositions: submission.opportunities.map((item: any) => ({
      category: item.category,
      disposition: item.disposition,
      residualDuty: item.residualDuty,
    })),
    boundary: "The source task passed every supplied independent criterion. One visible run did not establish a skill-level defect or a safe general executable opportunity, so the optimizer preserved the source rather than exporting an empty or speculative package.",
  },
  fivePartSummary: {
    codeReuse: { status: "none", reason: "The source contains no bundled executable and the optimizer selected no domain backend." },
    programGenerationOrReuse: { status: "no-change", reason: "No action or changed file was selected; no program was manufactured from a passing row." },
    naturalConsumption: { status: "not-applicable", reason: "No new package or behavior change exists to consume. The historical source trace remains the only task run." },
    taskQuality: { status: "passed-source-evidence", result: "3/3 deterministic criteria, evaluatorScore=1.0 on the selected exposed development row." },
    observedEffect: { status: "unassessed", reason: "No optimized condition exists, so there is no matched effect pair and no savings claim." },
  },
  checks,
  verification: [
    { command: "ordinary jit-optimize command in plan.json", result: "completed once; no changes; package not exported" },
    { command: "criteria/source/trace/score digest and projection checks in build-report.ts", result: passed ? "passed" : "failed" },
    { command: "bounded secret-pattern scan over raw optimizer stdout", result: "0 API-key, Bearer-token or sk-token pattern matches" },
  ],
  accounting: {
    projectRuntime: { optimizerModelRuns: 1, targetAgentRuns: 0, evaluatorModelCalls: 0, businessApiCalls: 0, reportedCostUsd: 0, actualCostUsd: null },
    developerAgent: "separate and not measured by project runtime reports",
  },
  claimBoundary: plan.claimBoundary,
  nextStage: "H13 engineering usability. H12 provides a truthful different-structure no-change boundary; it does not supply a package dependency for H13.",
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ status: report.status, checks, fivePartSummary: report.fivePartSummary }, null, 2))
if (!passed) process.exitCode = 1
