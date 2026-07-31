import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { BenchTaskFileSchema } from "../../bench/types.ts"
import { experimentalDesignSkillUniqueGrade } from "../../bench/evaluators/experimental-design-skill-unique-grade.ts"
import { EvalCriterionSchema, type RunResult } from "../../core/types.ts"
import {
  assessWorkdirDelta,
  readInitialWorkdirManifest,
  UnsafeWorkdirEntryError,
  writeInitialWorkdirManifest,
} from "../../core/workdir-manifest.ts"
import {
  loadRunSkill,
  prepareRunWorkspace,
  type LoadedRunTask,
} from "../../run/index.ts"
import {
  ExperimentalDesignSkillUniqueTaskSetSchema,
  ExperimentalDesignSkillUniqueTaskSplitFreezeSchema,
  type ExperimentalDesignSkillUniqueTaskSet,
} from "./experimental-design-skill-unique-contract.ts"
import {
  deriveExperimentalDesignSkillUniqueOracle,
} from "./experimental-design-skill-unique-oracle.ts"
import { sha256Bytes } from "./source-fixture.ts"

const CAPABILITY_ROOT = "benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique"
const DEVELOPMENT_PATH = `${CAPABILITY_ROOT}/development/tasks.json`
const INTERFACE_PATH = `${CAPABILITY_ROOT}/public-interface.json`
const FREEZE_PATH = `${CAPABILITY_ROOT}/task-split-freeze.json`
const PROVENANCE_PATH = `${CAPABILITY_ROOT}/source-oracle-provenance.json`
const SKILL_PATH = "benchmarks/skill-ir/pilots/experimental-design/source/SKILL.md"
const CONTRACT_IMPLEMENTATION_PATH =
  "src/benchmarks/skill-ir/experimental-design-skill-unique-contract.ts"
const ORACLE_IMPLEMENTATION_PATH =
  "src/benchmarks/skill-ir/experimental-design-skill-unique-oracle.ts"
const EVALUATOR_IMPLEMENTATION_PATH =
  "src/bench/evaluators/experimental-design-skill-unique-grade.ts"
const AUDIT_IMPLEMENTATION_PATH =
  "src/benchmarks/skill-ir/experimental-design-skill-unique-audit.ts"
const REQUIRED_OUTPUTS = [
  "design/replication-plan.json",
  "design/analysis-plan.json",
] as const
const CASE_IDS = [
  "canonical-aggregate",
  "alternative-hierarchical",
  "measurement-as-replicate",
  "false-pseudoreplication",
  "missing-grouping",
  "invented-grouping",
  "protected-input-mutation",
  "missing-output",
  "extra-output",
] as const
const MATERIALIZATION_CHECK_IDS = [
  "manifest-boundary",
  "protected-inputs",
  "arm-initial-tree",
  "initial-only-missing-outputs",
  "legal-output-delta",
  "extra-output-rejected",
  "initial-mutation-rejected",
  "initial-deletion-rejected",
  "reparse-entry-rejected",
] as const

type Task = ExperimentalDesignSkillUniqueTaskSet["tasks"][number]
type CaseId = (typeof CASE_IDS)[number]
type MaterializationCheckId = (typeof MATERIALIZATION_CHECK_IDS)[number]
type System = "no-skill" | "original"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const SourceProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-source-oracle-provenance/v1"),
  capabilityId: z.literal("experimental-design-v2-skill-unique"),
  claims: z.tuple([
    z.object({
      claimId: z.literal("independent-replication"),
      path: z.string().min(1),
      sha256: Sha256Schema,
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      anchorSha256: Sha256Schema,
    }).strict(),
    z.object({
      claimId: z.literal("pseudoreplication-analysis-alignment"),
      path: z.string().min(1),
      sha256: Sha256Schema,
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      anchorSha256: Sha256Schema,
    }).strict(),
  ]),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).strict()

const CriterionResultSchema = z.object({
  criterionId: z.string().min(1),
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  infrastructure: z.boolean(),
}).strict()

export const ExperimentalDesignSkillUniqueContractAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-contract-audit/v1"),
  auditId: z.literal("experimental-design-skill-unique-development-v1"),
  status: z.enum(["passed", "failed"]),
  inputs: z.object({
    developmentTasksSha256: Sha256Schema,
    publicInterfaceSha256: Sha256Schema,
    splitFreezeSha256: Sha256Schema,
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
    criteria: z.array(CriterionResultSchema).length(5),
  }).strict()),
  reverseEvidence: z.object({
    missingParentIsUnconfirmed: z.boolean(),
    taskIdDoesNotAffectOracle: z.boolean(),
  }).strict(),
  leakChecks: z.object({
    taskVisibleHasNoGoldKeys: z.boolean(),
    payloadHasNoAnswerFields: z.boolean(),
    taskVisibleHasNoSourceQuote: z.boolean(),
    developmentHasNoHeldoutSentinel: z.boolean(),
    reportHasNoRawModelContent: z.boolean(),
  }).strict(),
  issues: z.array(z.object({
    taskId: z.string().min(1),
    caseId: z.enum(CASE_IDS),
  }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

const MaterializationChecksSchema = z.object({
  "manifest-boundary": z.boolean(),
  "protected-inputs": z.boolean(),
  "arm-initial-tree": z.boolean(),
  "initial-only-missing-outputs": z.boolean(),
  "legal-output-delta": z.boolean(),
  "extra-output-rejected": z.boolean(),
  "initial-mutation-rejected": z.boolean(),
  "initial-deletion-rejected": z.boolean(),
  "reparse-entry-rejected": z.boolean(),
}).strict()

export const ExperimentalDesignSkillUniqueMaterializationAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-materialization-audit-report/v1"),
  auditId: z.literal("experimental-design-skill-unique-materialization-v1"),
  status: z.enum(["passed", "failed"]),
  counts: z.object({
    tasks: z.number().int().nonnegative(),
    arms: z.number().int().nonnegative(),
    checks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
  }).strict(),
  arms: z.array(z.object({
    taskId: z.string().min(1),
    system: z.enum(["no-skill", "original"]),
    status: z.enum(["passed", "failed"]),
    initialEntries: z.number().int().nonnegative(),
    sourceResourceFiles: z.number().int().nonnegative(),
    checks: MaterializationChecksSchema,
  }).strict()),
  issues: z.array(z.object({
    taskId: z.string().min(1),
    system: z.enum(["no-skill", "original"]),
    check: z.enum(MATERIALIZATION_CHECK_IDS),
  }).strict()),
  claimBoundary: z.string().min(1),
}).strict()

export type ExperimentalDesignSkillUniqueContractAuditReport = z.infer<
  typeof ExperimentalDesignSkillUniqueContractAuditReportSchema
>
export type ExperimentalDesignSkillUniqueMaterializationAuditReport = z.infer<
  typeof ExperimentalDesignSkillUniqueMaterializationAuditReportSchema
>

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown
}

function runResult(
  workDir: string,
  initialWorkdirManifest: RunResult["initialWorkdirManifest"],
): RunResult {
  return {
    text: "audit",
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

function loadedTask(task: Task): LoadedRunTask {
  const parsed = BenchTaskFileSchema.parse(task)
  return {
    ...parsed,
    eval: parsed.eval.map((criterion) => EvalCriterionSchema.parse(criterion)),
    taskDir: path.dirname(DEVELOPMENT_PATH),
    taskPath: DEVELOPMENT_PATH,
  }
}

function parentDirectories(relativePaths: readonly string[]): string[] {
  const result = new Set<string>()
  for (const relativePath of relativePaths) {
    let parent = path.posix.dirname(relativePath)
    while (parent !== ".") {
      result.add(parent)
      parent = path.posix.dirname(parent)
    }
  }
  return [...result]
}

async function validateSourceProvenance(
  rootDir: string,
  input: unknown,
): Promise<z.infer<typeof SourceProvenanceSchema>> {
  const provenance = SourceProvenanceSchema.parse(input)
  for (const claim of provenance.claims) {
    const bytes = await readFile(path.join(rootDir, ...claim.path.split("/")))
    if (sha256Bytes(bytes) !== claim.sha256) {
      throw new Error(`source file digest mismatch for ${claim.claimId}`)
    }
    const lines = bytes.toString("utf8").replace(/\r\n/g, "\n").split("\n")
    const anchor = `${lines.slice(claim.startLine - 1, claim.endLine).join("\n")}\n`
    if (sha256Bytes(Buffer.from(anchor, "utf8")) !== claim.anchorSha256) {
      throw new Error(`source anchor digest mismatch for ${claim.claimId}`)
    }
  }
  return provenance
}

function correctOutputs(task: Task, alternative: boolean): {
  replication: Record<string, unknown>
  analysis: Record<string, unknown>
  oracle: Extract<ReturnType<typeof deriveExperimentalDesignSkillUniqueOracle>, { status: "confirmed" }>
  graph: Record<string, unknown>
} {
  const graph = JSON.parse(task.fixtures["study-graph.json"]) as Record<string, unknown>
  const oracle = deriveExperimentalDesignSkillUniqueOracle(graph)
  if (oracle.status !== "confirmed") throw new Error(`task ${task.id} has no confirmed oracle`)
  return {
    graph,
    oracle,
    replication: {
      studyId: oracle.studyId,
      independentReplicateUnit: oracle.independentReplicateUnit,
      independentReplicateCount: oracle.independentReplicateCount,
      measurementUnit: oracle.measurementUnit,
      pseudoreplicationRisk: oracle.pseudoreplicationRisk,
      rationale: alternative ? "自由中文解释" : "Public hierarchy audit fixture",
    },
    analysis: alternative
      ? {
          rationale: "保留下层观测并声明完整嵌套。",
          groupingFactors: [...oracle.lineage.slice(0, -1)].reverse(),
          method: "自由命名层次方法",
          analysisUnit: oracle.measurementUnit,
          studyId: oracle.studyId,
        }
      : {
          studyId: oracle.studyId,
          analysisUnit: oracle.independentReplicateUnit,
          groupingFactors: [],
          method: "Aggregate to the independent replicate",
          rationale: "Use one independent value per assigned unit.",
        },
  }
}

async function runDifferentialCase(task: Task, caseId: CaseId) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-skill-unique-diff-"))
  const workDir = path.join(temporaryRoot, "workdir")
  await mkdir(workDir)
  try {
    await Promise.all(Object.entries(task.fixtures).map(([relativePath, content]) =>
      writeFile(path.join(workDir, ...relativePath.split("/")), content, "utf8")
    ))
    const initialWorkdirManifest = await writeInitialWorkdirManifest({
      workDir,
      manifestPath: path.join(temporaryRoot, "initial-workdir-manifest.json"),
    })
    const outputs = correctOutputs(task, caseId === "alternative-hierarchical")
    if (caseId === "measurement-as-replicate") {
      const entities = (outputs.graph.entities as Array<{ type: string; totalCount: number }>)
      outputs.replication.independentReplicateUnit = outputs.oracle.measurementUnit
      outputs.replication.independentReplicateCount = entities.find(
        (entity) => entity.type === outputs.oracle.measurementUnit,
      )!.totalCount
    }
    if (caseId === "false-pseudoreplication") {
      outputs.replication.pseudoreplicationRisk = !outputs.oracle.pseudoreplicationRisk
    }
    if (caseId === "missing-grouping") {
      outputs.analysis = {
        ...outputs.analysis,
        analysisUnit: outputs.oracle.measurementUnit,
        groupingFactors: outputs.oracle.lineage.slice(1, -1),
      }
    }
    if (caseId === "invented-grouping") {
      outputs.analysis = {
        ...outputs.analysis,
        analysisUnit: outputs.oracle.measurementUnit,
        groupingFactors: [...outputs.oracle.lineage.slice(0, -1), "invented-unit"],
      }
    }
    if (caseId === "protected-input-mutation") {
      await writeFile(path.join(workDir, "study-graph.json"), "{}\n", "utf8")
    }

    await mkdir(path.join(workDir, "design"))
    await writeFile(
      path.join(workDir, "design/replication-plan.json"),
      json(outputs.replication),
      "utf8",
    )
    if (caseId !== "missing-output") {
      await writeFile(
        path.join(workDir, "design/analysis-plan.json"),
        json(outputs.analysis),
        "utf8",
      )
    }
    if (caseId === "extra-output") {
      await writeFile(path.join(workDir, "debug.txt"), "unexpected\n", "utf8")
    }

    const criteria = await Promise.all(task.eval.map(async (criterion) => {
      const result = await experimentalDesignSkillUniqueGrade.run({
        criterion: EvalCriterionSchema.parse(criterion) as Extract<
          z.infer<typeof EvalCriterionSchema>,
          { method: "custom" }
        >,
        runResult: runResult(workDir, initialWorkdirManifest),
      })
      return {
        criterionId: criterion.id,
        pass: result.pass,
        score: result.score,
        infrastructure: result.infraError !== undefined,
      }
    }))
    const observedPass = criteria.every((criterion) => criterion.pass && !criterion.infrastructure)
    const expectedPass = caseId === "canonical-aggregate" || caseId === "alternative-hierarchical"
    return {
      taskId: task.id,
      caseId,
      expectedPass,
      observedPass,
      status: observedPass === expectedPass ? "matched" as const : "mismatched" as const,
      criteria,
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function auditMaterializationArm(input: {
  rootDir: string
  task: Task
  system: System
}) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-skill-unique-material-"))
  const workDir = path.join(temporaryRoot, "workdir")
  const manifestPath = path.join(temporaryRoot, "initial-workdir-manifest.json")
  const checks = Object.fromEntries(
    MATERIALIZATION_CHECK_IDS.map((id) => [id, false]),
  ) as Record<MaterializationCheckId, boolean>
  try {
    const skill = input.system === "original"
      ? await loadRunSkill(path.join(input.rootDir, ...SKILL_PATH.split("/")))
      : undefined
    const reference = await prepareRunWorkspace({
      task: loadedTask(input.task),
      ...(skill ? { skill } : {}),
      workDir,
      initialWorkdirManifestPath: manifestPath,
    })
    if (!reference) throw new Error("production preparer did not write initial provenance")
    const initial = await readInitialWorkdirManifest({ workDir, reference })
    const relativeManifest = path.relative(workDir, reference.path)
    checks["manifest-boundary"] = relativeManifest === ".." || relativeManifest.startsWith(`..${path.sep}`)

    const fixtureFiles = (
      Object.keys(input.task.fixtures) as Array<keyof Task["fixtures"]>
    ).sort()
    checks["protected-inputs"] = (await Promise.all(fixtureFiles.map(async (relativePath) =>
      sha256Bytes(await readFile(path.join(workDir, ...relativePath.split("/")))) ===
      sha256Bytes(Buffer.from(input.task.fixtures[relativePath]!, "utf8"))
    ))).every(Boolean)

    const expectedTaskEntries = new Set([
      ...fixtureFiles,
      ...parentDirectories(fixtureFiles),
    ])
    const initialPaths = new Set(initial.entries.map((entry) => entry.path))
    const sourceResourceFiles = initial.entries.filter(
      (entry) => entry.type === "file" && !expectedTaskEntries.has(entry.path),
    ).length
    checks["arm-initial-tree"] = input.system === "no-skill"
      ? initial.entries.every((entry) => expectedTaskEntries.has(entry.path)) &&
        initial.entries.length === expectedTaskEntries.size
      : sourceResourceFiles > 0 && [...expectedTaskEntries].every((entry) => initialPaths.has(entry))

    const initialOnly = await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })
    checks["initial-only-missing-outputs"] =
      initialOnly.violations.length === REQUIRED_OUTPUTS.length &&
      initialOnly.violations.every((entry) => entry.code === "REQUIRED_OUTPUT_MISSING")

    await mkdir(path.join(workDir, "design"))
    await Promise.all(REQUIRED_OUTPUTS.map((relativePath) =>
      writeFile(path.join(workDir, ...relativePath.split("/")), "{}\n", "utf8")
    ))
    checks["legal-output-delta"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).status === "pass"

    const debugPath = path.join(workDir, "debug.txt")
    await writeFile(debugPath, "unexpected\n", "utf8")
    checks["extra-output-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "UNEXPECTED_ENTRY" && entry.path === "debug.txt")
    await rm(debugPath)

    const mutablePath = fixtureFiles[0]!
    const mutableAbsolute = path.join(workDir, mutablePath)
    const mutableBytes = Buffer.from(input.task.fixtures[mutablePath]!, "utf8")
    await writeFile(mutableAbsolute, "changed\n", "utf8")
    checks["initial-mutation-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_FILE_MODIFIED" && entry.path === mutablePath)
    await writeFile(mutableAbsolute, mutableBytes)

    const deletedPath = fixtureFiles[1]!
    const deletedAbsolute = path.join(workDir, deletedPath)
    const deletedBytes = Buffer.from(input.task.fixtures[deletedPath]!, "utf8")
    await rm(deletedAbsolute)
    checks["initial-deletion-rejected"] = (await assessWorkdirDelta({
      workDir,
      initialManifest: initial,
      allowedNewDirectories: ["design"],
      requiredNewFiles: [...REQUIRED_OUTPUTS],
    })).violations.some((entry) => entry.code === "INITIAL_ENTRY_MISSING" && entry.path === deletedPath)
    await writeFile(deletedAbsolute, deletedBytes)

    const outside = path.join(temporaryRoot, "outside.txt")
    const link = path.join(workDir, "design", "unsafe-link")
    await writeFile(outside, "outside\n", "utf8")
    try {
      await symlink(outside, link, "file")
      try {
        await assessWorkdirDelta({
          workDir,
          initialManifest: initial,
          allowedNewDirectories: ["design"],
          requiredNewFiles: [...REQUIRED_OUTPUTS],
        })
      } catch (error) {
        checks["reparse-entry-rejected"] = error instanceof UnsafeWorkdirEntryError
      }
      await rm(link, { force: true })
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        checks["reparse-entry-rejected"] = true
      } else {
        throw error
      }
    }

    return {
      taskId: input.task.id,
      system: input.system,
      status: Object.values(checks).every(Boolean) ? "passed" as const : "failed" as const,
      initialEntries: initial.entries.length,
      sourceResourceFiles,
      checks,
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey)
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) =>
      /^(?:expected|expectedAnswer|gold|goldAnswer|answer|sourceQuote)$/iu.test(key) ||
      hasForbiddenKey(nested)
    )
  }
  return false
}

export async function buildExperimentalDesignSkillUniqueAudits(input: {
  rootDir: string
  splitFreeze?: unknown
  sourceProvenance?: unknown
}): Promise<{
  contract: ExperimentalDesignSkillUniqueContractAuditReport
  materialization: ExperimentalDesignSkillUniqueMaterializationAuditReport
}> {
  const read = (relativePath: string) => readFile(path.join(input.rootDir, ...relativePath.split("/")))
  const [
    developmentBytes,
    interfaceBytes,
    freezeBytes,
    provenanceBytes,
    contractImplementationBytes,
    oracleImplementationBytes,
    evaluatorImplementationBytes,
    auditImplementationBytes,
  ] = await Promise.all([
    read(DEVELOPMENT_PATH),
    read(INTERFACE_PATH),
    read(FREEZE_PATH),
    read(PROVENANCE_PATH),
    read(CONTRACT_IMPLEMENTATION_PATH),
    read(ORACLE_IMPLEMENTATION_PATH),
    read(EVALUATOR_IMPLEMENTATION_PATH),
    read(AUDIT_IMPLEMENTATION_PATH),
  ])
  const tasks = ExperimentalDesignSkillUniqueTaskSetSchema.parse(parseJson(developmentBytes))
  if (tasks.tasks.some((task) => task.split !== "development")) {
    throw new Error("skill-unique audit only accepts development tasks")
  }
  const freeze = ExperimentalDesignSkillUniqueTaskSplitFreezeSchema.parse(
    input.splitFreeze ?? parseJson(freezeBytes),
  )
  if (freeze.development.sha256 !== sha256Bytes(developmentBytes)) {
    throw new Error("development digest mismatch")
  }
  if (freeze.publicInterface.sha256 !== sha256Bytes(interfaceBytes)) {
    throw new Error("public interface digest mismatch")
  }
  const provenance = await validateSourceProvenance(
    input.rootDir,
    input.sourceProvenance ?? parseJson(provenanceBytes),
  )
  for (const claim of provenance.claims) {
    const frozen = freeze.sourceClaims.find((entry) => entry.claimId === claim.claimId)
    if (!frozen || frozen.path !== claim.path || frozen.sha256 !== claim.sha256) {
      throw new Error(`source claim freeze mismatch for ${claim.claimId}`)
    }
  }

  const cases = []
  for (const task of tasks.tasks) {
    for (const caseId of CASE_IDS) cases.push(await runDifferentialCase(task, caseId))
  }
  const issues = cases.filter((entry) => entry.status === "mismatched").map(
    ({ taskId, caseId }) => ({ taskId, caseId }),
  )

  const firstGraph = JSON.parse(tasks.tasks[0]!.fixtures["study-graph.json"]) as {
    studyId: string
    entities: Array<Record<string, unknown>>
  }
  const missingParent = structuredClone(firstGraph)
  delete missingParent.entities[1]!.parentType
  const renamed = structuredClone(firstGraph)
  renamed.studyId = "unrelated-public-id"
  const baseOracle = deriveExperimentalDesignSkillUniqueOracle(firstGraph)
  const renamedOracle = deriveExperimentalDesignSkillUniqueOracle(renamed)
  const visible = JSON.stringify({ tasks, interface: parseJson(interfaceBytes) })
  const payloads = tasks.tasks.flatMap((task) => task.eval.map((criterion) => criterion.payload))
  const leakChecks = {
    taskVisibleHasNoGoldKeys: !hasForbiddenKey({ tasks, interface: parseJson(interfaceBytes) }),
    payloadHasNoAnswerFields: !hasForbiddenKey(payloads),
    taskVisibleHasNoSourceQuote: !visible.includes("the replicate is whatever the treatment"),
    developmentHasNoHeldoutSentinel: !visible.includes("TEST_ONLY_HELDOUT_SKILL_UNIQUE"),
    reportHasNoRawModelContent: true,
  }
  const contract = ExperimentalDesignSkillUniqueContractAuditReportSchema.parse({
    schemaVersion: "skill-ir-experimental-design-skill-unique-contract-audit/v1",
    auditId: "experimental-design-skill-unique-development-v1",
    status: issues.length === 0 && Object.values(leakChecks).every(Boolean) ? "passed" : "failed",
    inputs: {
      developmentTasksSha256: sha256Bytes(developmentBytes),
      publicInterfaceSha256: sha256Bytes(interfaceBytes),
      splitFreezeSha256: sha256Bytes(freezeBytes),
      sourceProvenanceSha256: sha256Bytes(provenanceBytes),
      contractImplementationSha256: sha256Bytes(contractImplementationBytes),
      oracleImplementationSha256: sha256Bytes(oracleImplementationBytes),
      evaluatorImplementationSha256: sha256Bytes(evaluatorImplementationBytes),
      auditImplementationSha256: sha256Bytes(auditImplementationBytes),
    },
    counts: { tasks: tasks.tasks.length, cases: cases.length, matched: cases.length - issues.length },
    cases,
    reverseEvidence: {
      missingParentIsUnconfirmed:
        deriveExperimentalDesignSkillUniqueOracle(missingParent).status === "unconfirmed",
      taskIdDoesNotAffectOracle:
        baseOracle.status === "confirmed" &&
        renamedOracle.status === "confirmed" &&
        baseOracle.independentReplicateUnit === renamedOracle.independentReplicateUnit &&
        baseOracle.lineage.join("/") === renamedOracle.lineage.join("/"),
    },
    leakChecks,
    issues,
    claimBoundary: "Development-only mechanism audit; no model, held-out, IR, artifact, or optimization evidence.",
  })

  const arms = []
  for (const task of tasks.tasks) {
    for (const system of ["no-skill", "original"] as const) {
      arms.push(await auditMaterializationArm({ rootDir: input.rootDir, task, system }))
    }
  }
  const materializationIssues = arms.flatMap((arm) =>
    MATERIALIZATION_CHECK_IDS.filter((check) => !arm.checks[check]).map((check) => ({
      taskId: arm.taskId,
      system: arm.system,
      check,
    }))
  )
  const passedChecks = arms.reduce(
    (total, arm) => total + Object.values(arm.checks).filter(Boolean).length,
    0,
  )
  const materialization = ExperimentalDesignSkillUniqueMaterializationAuditReportSchema.parse({
    schemaVersion: "skill-ir-materialization-audit-report/v1",
    auditId: "experimental-design-skill-unique-materialization-v1",
    status: materializationIssues.length === 0 ? "passed" : "failed",
    counts: {
      tasks: tasks.tasks.length,
      arms: arms.length,
      checks: arms.length * MATERIALIZATION_CHECK_IDS.length,
      passed: passedChecks,
    },
    arms,
    issues: materializationIssues,
    claimBoundary: "Production materialization boundary only; generated audit files are not scorer success evidence.",
  })
  return { contract, materialization }
}
