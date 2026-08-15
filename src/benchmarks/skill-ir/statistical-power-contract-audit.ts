import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import type { RunResult } from "../../core/types.ts"
import {
  writeInitialWorkdirManifest,
  type InitialWorkdirManifestReference,
} from "../../core/workdir-manifest.ts"
import {
  StatisticalPowerGradePayloadSchema,
  statisticalPowerGrade,
} from "../../bench/evaluators/statistical-power-grade.ts"
import {
  StatisticalPowerReportSchema,
  StatisticalPowerStudySchema,
  buildStatisticalPowerDevelopmentTaskSet,
  buildStatisticalPowerPublicInterface,
  deriveStatisticalPowerOracle,
  type StatisticalPowerStudy,
  type StatisticalPowerTaskSet,
} from "./statistical-power-contract.ts"

const CaseSchema = z.object({
  id: z.string().min(1),
  role: z.enum([
    "canonical-valid",
    "alternative-valid",
    "prompt-only-omission",
    "reverse-evidence",
    "forbidden-sink",
  ]),
  matched: z.literal(true),
}).strict()

export const StatisticalPowerContractAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-statistical-power-contract-audit-report/v1"),
  auditId: z.literal("statistical-power-development-contract-v1"),
  taskIds: z.tuple([
    z.literal("statistical-power-unequal-means-dev-001"),
    z.literal("statistical-power-two-proportions-dev-002"),
  ]),
  counts: z.object({ cases: z.literal(5), matched: z.literal(5) }).strict(),
  roles: z.object({
    canonicalValid: z.literal(true),
    alternativeValid: z.literal(true),
    promptOnlyOmission: z.literal(true),
    reverseEvidence: z.literal(true),
    forbiddenSink: z.literal(true),
  }).strict(),
  gates: z.object({
    twoClosedFormTasks: z.literal(true),
    publicAbiClosed: z.literal(true),
    oracleDerivedFromPublicStudy: z.literal(true),
    productionMaterialization: z.literal(true),
    noAnswerBearingSink: z.literal(true),
  }).strict(),
  cases: z.tuple([CaseSchema, CaseSchema, CaseSchema, CaseSchema, CaseSchema]),
  status: z.literal("passed"),
  claimBoundary: z.literal("This local audit validates the development measurement contract. It is not model-performance, Skill IR, or optimization evidence."),
}).strict()

export type StatisticalPowerContractAuditReport = z.infer<
  typeof StatisticalPowerContractAuditReportSchema
>

type Task = StatisticalPowerTaskSet["tasks"][number]

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function runResult(workDir: string, initialWorkdirManifest: InitialWorkdirManifestReference): RunResult {
  return {
    text: "contract-audit",
    steps: [],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: 0,
    durationMs: 0,
    llmDurationMs: 0,
    workDir,
    initialWorkdirManifest,
    runStatus: "ok",
  }
}

async function buildReport(study: StatisticalPowerStudy, alternativeText = false) {
  const oracle = await deriveStatisticalPowerOracle(study)
  return StatisticalPowerReportSchema.parse({
    schemaVersion: "skill-ir-statistical-power-report/v1",
    studyId: study.studyId,
    analysis: {
      test: study.design.test,
      alternative: study.alternative,
      effectBasis: study.effectBasis.kind,
      effectMetric: study.design.test === "t_ind" ? "cohens-d" : "cohens-h",
      familyAlpha: study.errorControl.familyAlpha,
      adjustedAlpha: oracle.adjustedAlpha,
      targetPower: study.targetPower,
      allocationRatio: study.allocationRatio,
      confirmatoryComparisons: study.errorControl.confirmatoryComparisons,
    },
    sampleSize: oracle.planning.sampleSize,
    sensitivity: oracle.sensitivity,
    assumptions: alternativeText
      ? ["SESOI 来自决策阈值。", "闭式正态近似适用于此规划场景。"]
      : ["SESOI is decision-relevant.", "The declared closed-form approximation is appropriate."],
    reproducibility: alternativeText
      ? { engine: "statsmodels", procedure: "公开输入可重算" }
      : { engine: "statsmodels", procedure: "closed-form solve_power" },
  })
}

async function materialize(input: {
  task: Task
  study?: StatisticalPowerStudy
  report: z.infer<typeof StatisticalPowerReportSchema>
  alternativeText?: boolean
}) {
  const workDir = await mkdtemp(path.join(tmpdir(), "skvm-statistical-power-audit-"))
  const studyText = input.study
    ? `${JSON.stringify(input.study, null, 2)}\n`
    : input.task.fixtures["study.json"]
  await writeFile(path.join(workDir, "study.json"), studyText, "utf8")
  await writeFile(path.join(workDir, "power-interface.json"), input.task.fixtures["power-interface.json"], "utf8")
  const initialWorkdirManifest = await writeInitialWorkdirManifest({
    workDir,
    manifestPath: `${workDir}-initial-workdir-manifest.json`,
  })
  await writeFile(path.join(workDir, "power-analysis.json"), `${JSON.stringify(input.report, null, 2)}\n`, "utf8")
  await writeFile(
    path.join(workDir, "power-analysis.md"),
    `# ${input.report.studyId}\n\nSESOI; analyzed total ${input.report.sampleSize.analyzed.total}; enrolled total ${input.report.sampleSize.enrolled.total}.\n`,
    "utf8",
  )
  return { workDir, initialWorkdirManifest, studyText }
}

async function grade(
  task: Task,
  check: ReturnType<typeof StatisticalPowerGradePayloadSchema.parse>["check"],
  fixture: Awaited<ReturnType<typeof materialize>>,
  payloadOverride?: unknown,
) {
  const payload = payloadOverride ?? task.eval.find((criterion) => criterion.payload.check === check)!.payload
  return statisticalPowerGrade.run({
    criterion: { method: "custom", evaluatorId: "skill-ir-statistical-power", payload },
    runResult: runResult(fixture.workDir, fixture.initialWorkdirManifest),
  })
}

async function allChecksPass(task: Task, fixture: Awaited<ReturnType<typeof materialize>>): Promise<boolean> {
  for (const criterion of task.eval) {
    const result = await grade(task, criterion.payload.check, fixture)
    if (!result.pass || result.infraError) return false
  }
  return true
}

export async function runStatisticalPowerContractAudit(): Promise<StatisticalPowerContractAuditReport> {
  const taskSet = buildStatisticalPowerDevelopmentTaskSet(buildStatisticalPowerPublicInterface())
  const directories: string[] = []
  try {
    const meansStudy = StatisticalPowerStudySchema.parse(JSON.parse(taskSet.tasks[0]!.fixtures["study.json"]))
    const proportionsStudy = StatisticalPowerStudySchema.parse(JSON.parse(taskSet.tasks[1]!.fixtures["study.json"]))

    const canonicalFixture = await materialize({
      task: taskSet.tasks[0]!,
      report: await buildReport(meansStudy),
    })
    directories.push(canonicalFixture.workDir)
    const canonicalValid = await allChecksPass(taskSet.tasks[0]!, canonicalFixture)

    const alternativeFixture = await materialize({
      task: taskSet.tasks[1]!,
      report: await buildReport(proportionsStudy, true),
      alternativeText: true,
    })
    directories.push(alternativeFixture.workDir)
    const alternativeValid = await allChecksPass(taskSet.tasks[1]!, alternativeFixture)

    const omissionReport = await buildReport(meansStudy)
    omissionReport.analysis.adjustedAlpha = omissionReport.analysis.familyAlpha
    omissionReport.sampleSize.enrolled = structuredClone(omissionReport.sampleSize.analyzed)
    const omissionFixture = await materialize({ task: taskSet.tasks[0]!, report: omissionReport })
    directories.push(omissionFixture.workDir)
    const [omissionMultiplicity, omissionAttrition] = await Promise.all([
      grade(taskSet.tasks[0]!, "multiplicity", omissionFixture),
      grade(taskSet.tasks[0]!, "allocation-attrition", omissionFixture),
    ])
    const promptOnlyOmission = !omissionMultiplicity.pass && !omissionAttrition.pass

    const reverseStudy = StatisticalPowerStudySchema.parse({
      ...meansStudy,
      errorControl: { ...meansStudy.errorControl, confirmatoryComparisons: 4 },
    })
    const reverseFixture = await materialize({
      task: taskSet.tasks[0]!,
      study: reverseStudy,
      report: await buildReport(meansStudy),
    })
    directories.push(reverseFixture.workDir)
    const reversePayload = structuredClone(
      taskSet.tasks[0]!.eval.find((criterion) => criterion.payload.check === "multiplicity")!.payload,
    )
    reversePayload.protectedSha256.study = sha256(reverseFixture.studyText)
    const reverseEvidence = !(await grade(
      taskSet.tasks[0]!,
      "multiplicity",
      reverseFixture,
      reversePayload,
    )).pass

    const basePayload = taskSet.tasks[0]!.eval[0]!.payload
    const forbiddenSink = !StatisticalPowerGradePayloadSchema.safeParse({
      ...basePayload,
      expectedAnswer: 93,
    }).success && !/TEST_ONLY_HELDOUT|goldAnswer|sourceQuote/u.test(JSON.stringify(taskSet))

    const roles = { canonicalValid, alternativeValid, promptOnlyOmission, reverseEvidence, forbiddenSink }
    if (Object.values(roles).some((value) => !value)) {
      throw new Error(`statistical-power contract audit failed: ${JSON.stringify(roles)}`)
    }
    return StatisticalPowerContractAuditReportSchema.parse({
      schemaVersion: "skill-ir-statistical-power-contract-audit-report/v1",
      auditId: "statistical-power-development-contract-v1",
      taskIds: taskSet.tasks.map((task) => task.id),
      counts: { cases: 5, matched: 5 },
      roles,
      gates: {
        twoClosedFormTasks: true,
        publicAbiClosed: true,
        oracleDerivedFromPublicStudy: reverseEvidence,
        productionMaterialization: canonicalValid && alternativeValid,
        noAnswerBearingSink: forbiddenSink,
      },
      cases: [
        { id: "canonical-means", role: "canonical-valid", matched: true },
        { id: "alternative-proportions", role: "alternative-valid", matched: true },
        { id: "omission-adjustments", role: "prompt-only-omission", matched: true },
        { id: "reverse-public-multiplicity", role: "reverse-evidence", matched: true },
        { id: "forbidden-evaluator-sink", role: "forbidden-sink", matched: true },
      ],
      status: "passed",
      claimBoundary: "This local audit validates the development measurement contract. It is not model-performance, Skill IR, or optimization evidence.",
    })
  } finally {
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })))
  }
}
