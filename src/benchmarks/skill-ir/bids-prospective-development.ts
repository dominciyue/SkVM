import { isDeepStrictEqual } from "node:util"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  customEvaluatorSourceDigests,
  customEvaluatorSourcePaths,
} from "../../bench/evaluators/index"
import { SkillIRSchema } from "../../skill-ir/schema"
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit"
import { buildBidsContractAudit } from "./bids-contract-audit"
import { BidsTaskSetSchema, buildBidsPublicInterface } from "./bids-contract"
import { buildBidsContributionEvidence } from "./bids-contribution"
import { BidsProspectiveConstructionReportSchema } from "./bids-prospective-construction"
import {
  ProspectiveDevelopmentLockSchema,
  validateProspectiveDevelopmentLock,
  type ProspectiveDevelopmentLock,
} from "./prospective-development"
import {
  evaluateProspectiveQualityCandidate,
  ProspectiveQualityCandidatePolicySchema,
  ProspectiveQualityCandidateReportSchema,
} from "./prospective-quality-candidate"
import { sha256Bytes } from "./source-fixture"

const LOCK_PATH = "benchmarks/skill-ir/pilots/bids/prospective-development-lock.json"
const PATHS = {
  corpusManifest: "benchmarks/skill-ir/corpus/corpora/pilot.json",
  intake: "benchmarks/skill-ir/corpus/real-skill-intake.json",
  policy: "benchmarks/skill-ir/corpus/prospective-quality-candidate.json",
  candidateReport: "results/skill-ir/prospective-quality-candidate.json",
  tasks: "benchmarks/skill-ir/pilots/bids/development/tasks.json",
  publicContract: "benchmarks/skill-ir/pilots/bids/public-interface.json",
  resourceContract: "benchmarks/skill-ir/pilots/bids/resource-contract.json",
  scorer: "src/bench/evaluators/bids-grade.ts",
  scorerRegistry: "src/bench/evaluators/index.ts",
  baseIr: "benchmarks/skill-ir/pilots/bids/base-ir.json",
  sourceAudit: "benchmarks/skill-ir/pilots/bids/base-ir-source-audit.json",
  artifactAdapter: "benchmarks/skill-ir/pilots/bids/artifact-adapter.json",
  contractAudit: "results/skill-ir/bids-contract-audit-v1/report.json",
  contributionManifest: "benchmarks/skill-ir/pilots/bids/contribution-identifiability.json",
  contributionReport: "results/skill-ir/bids-contribution-identifiability-v1/report.json",
  constructionReport: "results/skill-ir/bids-prospective-construction-v1/report.json",
} as const

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/prospective-development.ts",
  "src/benchmarks/skill-ir/prospective-development-qualification.ts",
  "src/benchmarks/skill-ir/prospective-development-run.ts",
  "src/benchmarks/skill-ir/bids-prospective-development.ts",
  "src/benchmarks/skill-ir/bids-prospective-development-run.ts",
  "src/benchmarks/skill-ir/real-agent-run.ts",
  "src/benchmarks/skill-ir/static-development-v2-run.ts",
  "src/benchmarks/skill-ir/execution-resilience.ts",
  "src/benchmarks/skill-ir/resource-contract-run.ts",
  "src/benchmarks/skill-ir/route-probe.ts",
  "src/benchmarks/skill-ir/score-real-agent-runs.ts",
  "src/benchmarks/skill-ir/scoring.ts",
  "src/benchmarks/skill-ir/bids-contract.ts",
  "src/core/workdir-manifest.ts",
  "src/framework/types.ts",
  "package.json",
  "bun.lock",
] as const

async function readJson(rootDir: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(rootDir, ...relativePath.split("/")), "utf8"))
}

async function frozen(rootDir: string, relativePath: string) {
  return {
    path: relativePath,
    sha256: sha256Bytes(await readFile(path.resolve(rootDir, ...relativePath.split("/")))),
  }
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`BIDS prospective ${label} evidence drift`)
}

async function sourceClosure(rootDir: string) {
  const policy = ProspectiveQualityCandidatePolicySchema.parse(await readJson(rootDir, PATHS.policy))
  if (policy.selectedSkillId !== "bids") throw new Error("BIDS prospective candidate identity drift")
  return Promise.all(policy.source.closure.map((entry) => frozen(rootDir, entry.path)))
}

export async function buildBidsProspectiveDevelopmentLock(
  rawRootDir: string,
): Promise<ProspectiveDevelopmentLock> {
  const rootDir = path.resolve(rawRootDir)
  const frozenInputs = {
    corpusManifest: await frozen(rootDir, PATHS.corpusManifest),
    candidateIntake: await frozen(rootDir, PATHS.intake),
    candidatePolicy: await frozen(rootDir, PATHS.policy),
    candidateReport: await frozen(rootDir, PATHS.candidateReport),
    sourceClosure: await sourceClosure(rootDir),
    tasks: await frozen(rootDir, PATHS.tasks),
    publicContract: await frozen(rootDir, PATHS.publicContract),
    resourceContract: await frozen(rootDir, PATHS.resourceContract),
    scorer: await frozen(rootDir, PATHS.scorer),
    scorerRegistry: await frozen(rootDir, PATHS.scorerRegistry),
    baseIr: await frozen(rootDir, PATHS.baseIr),
    sourceAudit: await frozen(rootDir, PATHS.sourceAudit),
    artifactAdapter: await frozen(rootDir, PATHS.artifactAdapter),
    contractAudit: await frozen(rootDir, PATHS.contractAudit),
    contributionManifest: await frozen(rootDir, PATHS.contributionManifest),
    contributionReport: await frozen(rootDir, PATHS.contributionReport),
    constructionReport: await frozen(rootDir, PATHS.constructionReport),
  }
  const publicContract = buildBidsPublicInterface()
  return ProspectiveDevelopmentLockSchema.parse({
    schemaVersion: "skill-ir-prospective-development-lock/v1",
    status: "preregistered",
    experimentId: "bids-prospective-development-2026-08-23",
    corpus: "pilot",
    skillId: "bids",
    prePaidGates: [
      { id: "public-json-contract-audit", status: "passed", evidence: [frozenInputs.contractAudit] },
      { id: "evaluator-pointer-closure", status: "passed", evidence: [
        frozenInputs.tasks, frozenInputs.scorer, frozenInputs.scorerRegistry,
      ] },
      { id: "contribution-identifiability-audit", status: "passed", evidence: [
        frozenInputs.contributionManifest, frozenInputs.contributionReport,
      ] },
      { id: "deterministic-scorer-canary", status: "passed", evidence: [
        frozenInputs.contractAudit, frozenInputs.scorer,
      ] },
      { id: "prospective-construction-cost-identity", status: "passed", evidence: [
        frozenInputs.constructionReport,
      ] },
    ],
    frozenInputs,
    implementation: await Promise.all(IMPLEMENTATION_PATHS.map((item) => frozen(rootDir, item))),
    publicContract: {
      protectedInputs: publicContract.protectedInputs,
      exactOutputs: publicContract.outputs,
      exactOutputSet: publicContract.outputPolicy.exactOutputSet,
    },
    model: { route: "xty/gpt-5.6-sol", family: "gpt" },
    adapter: { id: "pi", version: "0.67.68" },
    matrix: {
      systems: ["no-skill", "original", "ir-static"],
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      taskSplit: "development",
      taskIds: ["bids-entity-order-dev-001", "bids-metadata-inheritance-dev-002"],
      targetBlocksPerTask: 2,
      reserveBlocksPerTask: 0,
      expectedSelectedRows: 12,
      expectedSelectedTriplets: 4,
      maximumAttemptRows: 12,
      maximumCandidateTriplets: 4,
      rowReuse: "same-lock-forward-only",
    },
    qualification: {
      system: "original",
      taskId: "bids-entity-order-dev-001",
      candidateBlock: 1,
      requiredChecks: ["resource", "route", "observability", "scorer"],
      semanticTaskSuccessRequired: false,
    },
    accounting: { qualificationPaidCalls: 1, matrixPaidCalls: 12, totalPaidCallCeiling: 13 },
    runtime: {
      apiKeyEnv: "SKVM_XTY_API_KEY",
      pythonEnv: "SKVM_PYTHON",
      retries: 0,
      routeProbeTimeoutMs: 180000,
      resourceProbeRequired: true,
      routeProbeRequired: true,
      absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000,
      maxSteps: 30,
      outerWatchdogMs: 660000,
      adapterConfig: "managed",
      maximumWorkDirLength: 220,
      outputRoot: "results/skill-ir/bids-prospective-development-v1",
    },
    authorizations: { paidMatrix: false, heldOut: false, readinessPromotion: false },
    prohibited: [
      "paid-matrix-before-qualification",
      "held-out",
      "post-hoc-contract-repair",
      "retry-selection",
      "readiness-promotion",
    ],
    claimBoundary:
      "Development-only infrastructure qualification and one forward-only 12-call model denominator. No held-out, readiness, automatic-construction, or main-claim authorization.",
  })
}

export async function validateBidsProspectiveDevelopmentLock(
  input: unknown,
  rawRootDir: string,
): Promise<ProspectiveDevelopmentLock> {
  const rootDir = path.resolve(rawRootDir)
  const lock = await validateProspectiveDevelopmentLock(input, rootDir)
  if (lock.skillId !== "bids") throw new Error("BIDS prospective lock skill identity drift")

  const [intake, policy, candidateReport, contractAudit, contributionManifest,
    contributionReport, constructionReport, tasks, publicContract, pilot] = await Promise.all([
    readJson(rootDir, PATHS.intake),
    readJson(rootDir, PATHS.policy),
    readJson(rootDir, PATHS.candidateReport),
    readJson(rootDir, PATHS.contractAudit),
    readJson(rootDir, PATHS.contributionManifest),
    readJson(rootDir, PATHS.contributionReport),
    readJson(rootDir, PATHS.constructionReport),
    readJson(rootDir, PATHS.tasks),
    readJson(rootDir, PATHS.publicContract),
    readJson(rootDir, PATHS.corpusManifest),
  ])

  const rebuiltCandidate = await evaluateProspectiveQualityCandidate({ rootDir, intake, policy })
  requireEqual(ProspectiveQualityCandidateReportSchema.parse(candidateReport), rebuiltCandidate, "candidate")
  const rebuiltContract = await buildBidsContractAudit({ rootDir })
  requireEqual(contractAudit, rebuiltContract, "contract audit")
  if (rebuiltContract.status !== "passed") throw new Error("BIDS prospective contract audit failed")
  const rebuiltContribution = await buildBidsContributionEvidence(rootDir)
  requireEqual(contributionManifest, rebuiltContribution.manifest, "contribution manifest")
  requireEqual(contributionReport, rebuiltContribution.report, "contribution report")
  if (rebuiltContribution.report.status !== "eligible-for-baseline") {
    throw new Error("BIDS prospective contribution audit failed")
  }
  const construction = BidsProspectiveConstructionReportSchema.parse(constructionReport)
  if (construction.prePaidGate.status !== "passed" || !construction.prePaidGate.permitsQualificationLock) {
    throw new Error("BIDS prospective construction gate failed")
  }

  const parsedTasks = BidsTaskSetSchema.parse(tasks)
  if (parsedTasks.skillId !== lock.skillId
    || parsedTasks.tasks.map((task) => task.id).join("\n") !== lock.matrix.taskIds.join("\n")) {
    throw new Error("BIDS prospective task identity drift")
  }
  requireEqual(publicContract, buildBidsPublicInterface(), "public contract")
  const registryPath = customEvaluatorSourcePaths.get("skill-ir-bids")
  const registryDigest = customEvaluatorSourceDigests.get("skill-ir-bids")
  if (registryPath !== lock.frozenInputs.scorer.path || registryDigest !== lock.frozenInputs.scorer.sha256
    || parsedTasks.tasks.some((task) => task.eval.some((criterion) => criterion.evaluatorId !== "skill-ir-bids"))) {
    throw new Error("BIDS prospective evaluator pointer closure drift")
  }

  const ir = SkillIRSchema.parse(await readJson(rootDir, PATHS.baseIr))
  const audit = SkillIRSourceAuditSchema.parse(await readJson(rootDir, PATHS.sourceAudit))
  const auditReport = await verifySkillIRSourceAudit(ir, audit, rootDir)
  if (auditReport.errors.length > 0) throw new Error(`BIDS prospective source audit failed: ${auditReport.errors.join("; ")}`)

  const skill = (pilot as { skills?: Array<Record<string, unknown>> }).skills?.find((entry) => entry.id === "bids")
  if (!skill || skill.status !== "runnable" || skill.sourcePath !== lock.frozenInputs.sourceClosure[0]?.path
    || skill.tasksPath !== PATHS.tasks || skill.irPath !== PATHS.baseIr
    || skill.sourceAuditPath !== PATHS.sourceAudit || skill.resourceContractPath !== PATHS.resourceContract) {
    throw new Error("BIDS prospective corpus identity drift")
  }
  return lock
}

export async function writeBidsProspectiveDevelopmentLock(rootDir: string): Promise<ProspectiveDevelopmentLock> {
  const lock = await buildBidsProspectiveDevelopmentLock(rootDir)
  const outputPath = path.resolve(rootDir, ...LOCK_PATH.split("/"))
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8")
  return lock
}

if (import.meta.main) {
  const rootDir = path.resolve(process.cwd())
  const lock = await writeBidsProspectiveDevelopmentLock(rootDir)
  console.log(JSON.stringify({ experimentId: lock.experimentId, rows: lock.matrix.expectedSelectedRows }, null, 2))
}
