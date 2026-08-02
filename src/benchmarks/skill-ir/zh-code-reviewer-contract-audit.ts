import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import {
  ZhCodeReviewerGradePayloadSchema,
  zhCodeReviewerGrade,
} from "../../bench/evaluators/zh-code-reviewer-grade.ts"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest.ts"
import {
  ZhCodeReviewerTaskSetSchema,
  type ZhCodeReviewerTaskSet,
} from "./zh-code-reviewer-contract.ts"
import {
  deriveZhCodeReviewOracle,
  type ZhCodeReviewOracleFinding,
} from "./zh-code-reviewer-oracle.ts"
import { sha256Bytes } from "./source-fixture.ts"

const DEVELOPMENT_PATH = "benchmarks/skill-ir/pilots/zh-code-reviewer/development/tasks.json"
const INTERFACE_PATH = "benchmarks/skill-ir/pilots/zh-code-reviewer/review-interface.json"
const SPLIT_FREEZE_PATH = "benchmarks/skill-ir/pilots/zh-code-reviewer/task-split-freeze.json"
const PROVENANCE_PATH = "benchmarks/skill-ir/pilots/zh-code-reviewer/source-oracle-provenance.json"
const CONTRACT_PATH = "src/benchmarks/skill-ir/zh-code-reviewer-contract.ts"
const ORACLE_PATH = "src/benchmarks/skill-ir/zh-code-reviewer-oracle.ts"
const EVALUATOR_PATH = "src/bench/evaluators/zh-code-reviewer-grade.ts"
const AUDIT_PATH = "src/benchmarks/skill-ir/zh-code-reviewer-contract-audit.ts"

const CASE_IDS = [
  "positive-primary",
  "positive-reordered",
  "missing-finding",
  "wrong-anchor",
  "severity-weakened",
  "nonactionable",
  "report-contradiction",
  "source-modified",
  "unexpected-file",
] as const

type Task = ZhCodeReviewerTaskSet["tasks"][number]
type CaseId = (typeof CASE_IDS)[number]

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

const ProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-source-oracle-provenance/v1"),
  skillId: z.literal("zh-code-reviewer"),
  claims: z.array(z.object({
    claimId: z.enum(["review-dimensions", "structured-report", "language-boundary"]),
    path: z.string().min(1),
    sha256: Sha256Schema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    anchorSha256: Sha256Schema,
  }).strict()).length(3),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).strict()

export const ZhCodeReviewerContractAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-contract-audit/v1"),
  auditId: z.literal("zh-code-reviewer-development-v1"),
  status: z.enum(["passed", "failed"]),
  inputs: z.object({
    developmentTasksSha256: Sha256Schema,
    publicInterfaceSha256: Sha256Schema,
    taskSplitFreezeSha256: Sha256Schema,
    sourceProvenanceSha256: Sha256Schema,
    contractImplementationSha256: Sha256Schema,
    oracleImplementationSha256: Sha256Schema,
    evaluatorImplementationSha256: Sha256Schema,
    auditImplementationSha256: Sha256Schema,
  }).strict(),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    cases: z.number().int().nonnegative(),
    matched: z.number().int().nonnegative(),
  }).strict(),
  cases: z.array(z.object({
    taskId: z.string().min(1),
    caseId: z.enum(CASE_IDS),
    expectedPass: z.boolean(),
    observedPass: z.boolean(),
    status: z.enum(["matched", "mismatched"]),
    criteria: z.array(z.object({
      criterionId: z.string().min(1),
      pass: z.boolean(),
      score: z.number().min(0).max(1),
      infrastructure: z.boolean(),
    }).strict()).length(5),
  }).strict()),
  reverseEvidence: z.object({
    removedPatternDisappears: z.boolean(),
    taskLabelDoesNotAffectOracle: z.boolean(),
    unsupportedSourceStaysUnconfirmed: z.boolean(),
  }).strict(),
  leakChecks: z.object({
    taskVisibleHasNoGoldKeys: z.boolean(),
    taskVisibleHasNoSourceQuote: z.boolean(),
    developmentHasNoHeldoutSentinel: z.boolean(),
    payloadCanariesRejected: z.boolean(),
    unsafePayloadPathRejected: z.boolean(),
    provenanceNotRuntimeVisible: z.boolean(),
    reportHasNoRawModelContent: z.boolean(),
  }).strict(),
  issues: z.array(z.object({ taskId: z.string(), caseId: z.enum(CASE_IDS) }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

export type ZhCodeReviewerContractAuditReport = z.infer<typeof ZhCodeReviewerContractAuditReportSchema>

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function sourceEntry(task: Task): [string, string] {
  const entry = Object.entries(task.fixtures).find(([name]) => /\.(?:[cm]?[jt]sx?)$/iu.test(name))
  if (!entry) throw new Error(`task source missing: ${task.id}`)
  return entry
}

function createFindings(oracle: { findings: ZhCodeReviewOracleFinding[] }, reorder: boolean) {
  const source = reorder ? [...oracle.findings].reverse() : oracle.findings
  return source.map((entry) => ({
    category: entry.category,
    severity: entry.severity,
    path: entry.path,
    line: entry.line,
    symbol: entry.symbol,
    impact: `公开源码证据表明该问题会产生可观察影响（${entry.ruleId}）。`,
    recommendation: "请采用边界明确的安全实现，并增加覆盖该路径的回归测试。",
  }))
}

function createMarkdown(findings: ReturnType<typeof createFindings>): string {
  return [
    "# 代码审查报告",
    "",
    ...findings.map((entry) => `- ${entry.severity} [${entry.path}:${entry.line}] ${entry.symbol}：${entry.impact}`),
    "",
    "## 总结",
    "建议按影响顺序处理上述问题。",
  ].join("\n")
}

function runResult(workDir: string, reference: RunResult["initialWorkdirManifest"]): RunResult {
  return {
    text: "audit",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest: reference,
    runStatus: "ok",
  }
}

async function auditCase(task: Task, caseId: CaseId) {
  const [sourcePath, sourceText] = sourceEntry(task)
  const oracle = deriveZhCodeReviewOracle(sourcePath, sourceText)
  if (oracle.status !== "confirmed") throw new Error(`development oracle unconfirmed: ${task.id}`)
  const root = await mkdtemp(path.join(tmpdir(), "skvm-review-contract-"))
  const workDir = path.join(root, "workdir")
  try {
    for (const [relativePath, text] of Object.entries(task.fixtures)) {
      await mkdir(path.dirname(path.join(workDir, ...relativePath.split("/"))), { recursive: true })
      await writeFile(path.join(workDir, ...relativePath.split("/")), text, "utf8")
    }
    const reference = await writeInitialWorkdirManifest({
      workDir,
      manifestPath: path.join(root, "initial-workdir-manifest.json"),
    })
    const findings = createFindings(oracle, caseId === "positive-reordered")
    if (caseId === "missing-finding") findings.pop()
    if (caseId === "wrong-anchor") findings[0]!.line += 20
    if (caseId === "severity-weakened") findings[0]!.severity = "minor"
    if (caseId === "nonactionable") findings[0]!.recommendation = "修复"
    const report = {
      schemaVersion: "code-review/v1",
      reviewedFiles: [sourcePath],
      findings,
      highlights: ["代码结构紧凑"],
      summary: "发现需要优先处理的问题。",
    }
    const markdown = caseId === "report-contradiction"
      ? "# 代码审查报告\n\n没有发现任何问题。"
      : createMarkdown(findings)
    await writeFile(path.join(workDir, "code-review.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    await writeFile(path.join(workDir, "code-review.md"), `${markdown}\n`, "utf8")
    if (caseId === "source-modified") {
      await writeFile(path.join(workDir, ...sourcePath.split("/")), `${sourceText}// modified\n`, "utf8")
    }
    if (caseId === "unexpected-file") await writeFile(path.join(workDir, "debug.log"), "unexpected\n", "utf8")

    const criteria = []
    for (const rawCriterion of task.eval) {
      const criterion = EvalCriterionSchema.parse(rawCriterion)
      if (criterion.method !== "custom") throw new Error("zh-code-reviewer criterion must be custom")
      const result = await zhCodeReviewerGrade.run({ criterion, runResult: runResult(workDir, reference) })
      criteria.push({
        criterionId: rawCriterion.id,
        pass: result.pass,
        score: result.score,
        infrastructure: result.infraError !== undefined,
      })
    }
    const observedPass = criteria.every((entry) => entry.pass && !entry.infrastructure)
    const expectedPass = caseId === "positive-primary" || caseId === "positive-reordered"
    return {
      taskId: task.id,
      caseId,
      expectedPass,
      observedPass,
      status: observedPass === expectedPass ? "matched" as const : "mismatched" as const,
      criteria,
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey)
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) =>
      /^(?:expected|expectedAnswer|gold|goldAnswer|answer|oracle|sourceQuote)$/iu.test(key) || hasForbiddenKey(nested))
  }
  return false
}

async function validateProvenance(rootDir: string, value: unknown): Promise<z.infer<typeof ProvenanceSchema>> {
  const provenance = ProvenanceSchema.parse(value)
  for (const claim of provenance.claims) {
    const bytes = await readFile(path.join(rootDir, ...claim.path.split("/")))
    if (sha256Bytes(bytes) !== claim.sha256) throw new Error(`source digest mismatch: ${claim.claimId}`)
    const lines = bytes.toString("utf8").replace(/\r\n/g, "\n").split("\n")
    const anchor = `${lines.slice(claim.startLine - 1, claim.endLine).join("\n")}\n`
    if (sha256Bytes(Buffer.from(anchor, "utf8")) !== claim.anchorSha256) {
      throw new Error(`source anchor mismatch: ${claim.claimId}`)
    }
  }
  return provenance
}

export async function buildZhCodeReviewerContractAudit(input: {
  rootDir: string
}): Promise<ZhCodeReviewerContractAuditReport> {
  const rootDir = path.resolve(input.rootDir)
  const read = (relativePath: string) => readFile(path.join(rootDir, ...relativePath.split("/")))
  const [developmentBytes, interfaceBytes, splitFreezeBytes, provenanceBytes, contractBytes, oracleBytes, evaluatorBytes, auditBytes] = await Promise.all([
    read(DEVELOPMENT_PATH),
    read(INTERFACE_PATH),
    read(SPLIT_FREEZE_PATH),
    read(PROVENANCE_PATH),
    read(CONTRACT_PATH),
    read(ORACLE_PATH),
    read(EVALUATOR_PATH),
    read(AUDIT_PATH),
  ])
  const taskSet = ZhCodeReviewerTaskSetSchema.parse(JSON.parse(developmentBytes.toString("utf8")))
  const provenance = await validateProvenance(rootDir, JSON.parse(provenanceBytes.toString("utf8")))
  const cases = []
  for (const task of taskSet.tasks) {
    for (const caseId of CASE_IDS) cases.push(await auditCase(task, caseId))
  }

  const [firstSourcePath, firstSource] = sourceEntry(taskSet.tasks[0])
  const before = deriveZhCodeReviewOracle(firstSourcePath, firstSource)
  const after = deriveZhCodeReviewOracle(firstSourcePath, firstSource.replace(/^.*console\.(?:log|info|warn|error).*\n/mu, ""))
  const tagged = deriveZhCodeReviewOracle(firstSourcePath, `// task-label: TEST_ONLY_DIFFERENT_TASK\n${firstSource}`)
  const beforeRules = before.status === "confirmed" ? before.findings.map((entry) => entry.ruleId).sort() : []
  const afterRules = after.status === "confirmed" ? after.findings.map((entry) => entry.ruleId).sort() : []
  const taggedRules = tagged.status === "confirmed" ? tagged.findings.map((entry) => entry.ruleId).sort() : []
  const reverseEvidence = {
    removedPatternDisappears: beforeRules.includes("sensitive-log")
      && !afterRules.includes("sensitive-log")
      && afterRules.length === beforeRules.length - 1,
    taskLabelDoesNotAffectOracle: JSON.stringify(beforeRules) === JSON.stringify(taggedRules),
    unsupportedSourceStaysUnconfirmed: deriveZhCodeReviewOracle("README.md", "plain text\n").status === "unconfirmed",
  }

  const exemplarPayload = taskSet.tasks[0].eval[0]!.payload
  const payloadCanariesRejected = ["gold", "rawModel", "sourceQuote", "heldout"].every((key) =>
    !ZhCodeReviewerGradePayloadSchema.safeParse({ ...exemplarPayload, [key]: "TEST_ONLY_CANARY" }).success)
  const unsafePayload = {
    ...exemplarPayload,
    paths: { ...exemplarPayload.paths, source: "../outside.ts" },
  }
  const leakChecks = {
    taskVisibleHasNoGoldKeys: !hasForbiddenKey(taskSet),
    taskVisibleHasNoSourceQuote: !developmentBytes.toString("utf8").includes("sourceQuote"),
    developmentHasNoHeldoutSentinel: !developmentBytes.toString("utf8").includes("TEST_ONLY_HELDOUT_ZH_CODE_REVIEWER"),
    payloadCanariesRejected,
    unsafePayloadPathRejected: !ZhCodeReviewerGradePayloadSchema.safeParse(unsafePayload).success,
    provenanceNotRuntimeVisible: !provenance.runtimeReadable && !provenance.taskVisible,
    reportHasNoRawModelContent: cases.every((entry) => !JSON.stringify(entry).includes("rawModel")),
  }
  const issues = cases.filter((entry) => entry.status === "mismatched")
    .map((entry) => ({ taskId: entry.taskId, caseId: entry.caseId }))
  const allChecks = [...Object.values(reverseEvidence), ...Object.values(leakChecks)].every(Boolean)
  return ZhCodeReviewerContractAuditReportSchema.parse({
    schemaVersion: "skill-ir-zh-code-reviewer-contract-audit/v1",
    auditId: "zh-code-reviewer-development-v1",
    status: issues.length === 0 && allChecks ? "passed" : "failed",
    inputs: {
      developmentTasksSha256: sha256(developmentBytes),
      publicInterfaceSha256: sha256(interfaceBytes),
      taskSplitFreezeSha256: sha256(splitFreezeBytes),
      sourceProvenanceSha256: sha256(provenanceBytes),
      contractImplementationSha256: sha256(contractBytes),
      oracleImplementationSha256: sha256(oracleBytes),
      evaluatorImplementationSha256: sha256(evaluatorBytes),
      auditImplementationSha256: sha256(auditBytes),
    },
    counts: { tasks: taskSet.tasks.length, cases: cases.length, matched: cases.length - issues.length },
    cases,
    reverseEvidence,
    leakChecks,
    issues,
    claimBoundary: "Development-only deterministic benchmark contract audit; no model, IR, artifact, held-out, or optimization claim.",
  })
}
