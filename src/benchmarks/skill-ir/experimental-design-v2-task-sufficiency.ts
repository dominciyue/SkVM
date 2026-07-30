import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const SafeIdSchema = z.string().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) {
    return false
  }
  return value.split("/").every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  )
}, "path must be a safe POSIX relative path")

const BoundFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const EvidenceAnchorSchema = z.object({
  kind: z.enum([
    "task-prompt",
    "public-contract",
    "scorer-public-projection",
    "skill-source",
  ]),
  audience: z.enum([
    "no-skill-visible",
    "evaluator-public",
    "original-skill-only",
  ]),
  path: SafeRelativePathSchema,
  quote: z.string().min(1),
}).strict()

export const ExperimentalDesignV2InstructionSchema = z.object({
  id: SafeIdSchema,
  category: z.enum([
    "observable-output-contract",
    "procedural-guidance",
    "skill-incremental-knowledge",
  ]),
  summary: z.string().min(1).max(240),
  scorerRequired: z.boolean(),
  taskCompletionRequired: z.boolean(),
  criterionIds: z.array(z.enum([
    "design-input-integrity",
    "design-artifact-contract",
    "design-semantics",
    "design-allocation-safety",
    "design-report-consistency",
  ])).max(5),
  evidence: z.array(EvidenceAnchorSchema).min(1),
}).strict()

export const ExperimentalDesignV2TaskSufficiencyManifestSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-contract-task-sufficiency-audit/v1"),
  auditId: z.literal("experimental-design-v2-public-contract-task-sufficiency-v1"),
  benchmarkId: z.literal("experimental-design-v2"),
  scope: z.object({
    split: z.literal("development"),
    taskSetIds: z.tuple([
      z.literal("experimental-design-v2-frozen-development-v1"),
      z.literal("experimental-design-v2-harder-development-v1"),
    ]),
  }).strict(),
  inputs: z.object({
    developmentTasks: BoundFileSchema,
    harderDevelopmentTasks: BoundFileSchema,
    publicContract: BoundFileSchema,
    scorer: BoundFileSchema,
    contractImplementation: BoundFileSchema,
    calibrationAnalyses: z.array(BoundFileSchema).length(2),
    sourceClosure: z.array(BoundFileSchema).length(8),
  }).strict(),
  instructions: z.array(ExperimentalDesignV2InstructionSchema).min(1),
  forbiddenEvidenceClasses: z.tuple([
    z.literal("evaluation-split-task"),
    z.literal("evaluator-expected"),
    z.literal("historical-raw-model-text"),
    z.literal("package-generated-answer"),
  ]),
}).strict().superRefine((manifest, context) => {
  const ids = manifest.instructions.map((entry) => entry.id)
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["instructions"], message: "instruction IDs must be unique" })
  }
  const boundPaths = [
    manifest.inputs.developmentTasks.path,
    manifest.inputs.harderDevelopmentTasks.path,
    manifest.inputs.publicContract.path,
    manifest.inputs.scorer.path,
    manifest.inputs.contractImplementation.path,
    ...manifest.inputs.calibrationAnalyses.map((entry) => entry.path),
    ...manifest.inputs.sourceClosure.map((entry) => entry.path),
  ]
  if (new Set(boundPaths).size !== boundPaths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["inputs"], message: "bound input paths must be unique" })
  }
})

export type ExperimentalDesignV2TaskSufficiencyManifest = z.infer<
  typeof ExperimentalDesignV2TaskSufficiencyManifestSchema
>
export type ExperimentalDesignV2Instruction = z.infer<typeof ExperimentalDesignV2InstructionSchema>

const InstructionReportSchema = z.object({
  id: SafeIdSchema,
  category: ExperimentalDesignV2InstructionSchema.shape.category,
  scorerRequired: z.boolean(),
  taskCompletionRequired: z.boolean(),
  disclosedToNoSkill: z.boolean(),
  presentInOriginalSkill: z.boolean(),
  evaluatorConfirmed: z.boolean(),
  publicDuplicatesSkillGuidance: z.boolean(),
  criterionIds: ExperimentalDesignV2InstructionSchema.shape.criterionIds,
}).strict()

const CountsSchema = z.object({
  instructions: z.number().int().positive(),
  scorerRequired: z.number().int().nonnegative(),
  scorerRequiredPubliclyDisclosed: z.number().int().nonnegative(),
  scorerRequiredSkillOnly: z.number().int().nonnegative(),
  publicSkillOverlap: z.number().int().nonnegative(),
  skillIncremental: z.number().int().nonnegative(),
  skillIncrementalMeasured: z.number().int().nonnegative(),
}).strict()

export const ExperimentalDesignV2TaskSufficiencyReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-contract-task-sufficiency-report/v1"),
  auditId: z.literal("experimental-design-v2-public-contract-task-sufficiency-v1"),
  benchmarkId: z.literal("experimental-design-v2"),
  status: z.enum(["passed", "failed"]),
  inputs: z.array(BoundFileSchema).length(15),
  calibrationEvidence: z.object({
    analyses: z.literal(2),
    saturatedAnalyses: z.literal(2),
    totalComparablePairs: z.literal(8),
    totalDifferingPairs: z.literal(0),
  }).strict(),
  counts: CountsSchema,
  ratios: z.object({
    noSkillOperationalCoverage: z.number().min(0).max(1),
    skillIncrementalMeasurementCoverage: z.number().min(0).max(1),
  }).strict(),
  instructions: z.array(InstructionReportSchema),
  conclusion: z.enum([
    "public-contract-operationally-sufficient-current-surface",
    "skill-unique-capability-remains-current-surface",
    "inconclusive",
  ]),
  decision: z.enum([
    "move-to-skill-unique-deterministic-capability",
    "repair-public-disclosure-gap",
    "freeze-no-measurable-strong-model-gain",
  ]),
  experimentBoundary: z.object({
    currentBaselineGatePassed: z.literal(false),
    baseIrAuditAllowed: z.literal(false),
    legacyIrScoresComparableUnderV2: z.literal(false),
    createsTasks: z.literal(false),
    apiRunAllowed: z.literal(false),
    nextWrittenDesignRequired: z.literal(true),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict()

export type ExperimentalDesignV2TaskSufficiencyReport = z.infer<
  typeof ExperimentalDesignV2TaskSufficiencyReportSchema
>

const SaturationAnalysisSchema = z.object({
  methodEvidence: z.literal(false),
  status: z.literal("gate-failed"),
  matrix: z.object({
    comparablePairs: z.literal(4),
    differingPairs: z.literal(0),
    infrastructureFailures: z.literal(0),
  }).passthrough(),
  systems: z.object({
    "no-skill": z.object({ successes: z.literal(4), rows: z.literal(4), meanScore: z.literal(1) }).passthrough(),
    original: z.object({ successes: z.literal(4), rows: z.literal(4), meanScore: z.literal(1) }).passthrough(),
  }).strict(),
}).passthrough()

const FORBIDDEN_SINK = /TEST_ONLY_HELDOUT|expectedAnswer|goldAnswer|raw-runs(?:\.jsonl)?|model-output/iu

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (
    !path.isAbsolute(relative)
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
  )
}

async function readBoundFile(
  rootDir: string,
  bound: { path: string; sha256: string },
): Promise<Buffer> {
  const root = await realpath(rootDir)
  const unresolved = path.resolve(rootDir, ...bound.path.split("/"))
  const stat = await lstat(unresolved)
  const resolved = await realpath(unresolved)
  if (!stat.isFile() || stat.isSymbolicLink() || !isContained(root, resolved)) {
    throw new Error(`unsafe bound file: ${bound.path}`)
  }
  const bytes = await readFile(resolved)
  if (sha256(bytes) !== bound.sha256) throw new Error(`digest mismatch: ${bound.path}`)
  return bytes
}

function allBoundFiles(manifest: ExperimentalDesignV2TaskSufficiencyManifest) {
  return [
    manifest.inputs.developmentTasks,
    manifest.inputs.harderDevelopmentTasks,
    manifest.inputs.publicContract,
    manifest.inputs.scorer,
    manifest.inputs.contractImplementation,
    ...manifest.inputs.calibrationAnalyses,
    ...manifest.inputs.sourceClosure,
  ]
}

function taskPrompts(bytes: Uint8Array): string {
  const parsed = z.object({
    tasks: z.array(z.object({ split: z.literal("development"), prompt: z.string() }).passthrough()).length(2),
  }).passthrough().parse(JSON.parse(Buffer.from(bytes).toString("utf8")))
  return parsed.tasks.map((task) => task.prompt).join("\n")
}

export async function verifyExperimentalDesignV2TaskSufficiencyManifest(
  rootDir: string,
  value: unknown,
): Promise<ExperimentalDesignV2TaskSufficiencyManifest> {
  const manifest = ExperimentalDesignV2TaskSufficiencyManifestSchema.parse(value)
  if (FORBIDDEN_SINK.test(JSON.stringify(manifest))) {
    throw new Error("forbidden evidence sink in task sufficiency manifest")
  }

  const bytesByPath = new Map<string, Buffer>()
  for (const bound of allBoundFiles(manifest)) {
    bytesByPath.set(bound.path, await readBoundFile(rootDir, bound))
  }

  const allowedPromptPaths = new Set([
    manifest.inputs.developmentTasks.path,
    manifest.inputs.harderDevelopmentTasks.path,
  ])
  const allowedScorerPaths = new Set([
    manifest.inputs.scorer.path,
    manifest.inputs.contractImplementation.path,
  ])
  const allowedSourcePaths = new Set(manifest.inputs.sourceClosure.map((entry) => entry.path))

  for (const instruction of manifest.instructions) {
    for (const anchor of instruction.evidence) {
      const bytes = bytesByPath.get(anchor.path)
      if (!bytes) throw new Error(`unbound evidence path: ${anchor.path}`)
      if (anchor.kind === "task-prompt" && !allowedPromptPaths.has(anchor.path)) {
        throw new Error(`task-prompt evidence path is not a development task set: ${anchor.path}`)
      }
      if (anchor.kind === "public-contract" && anchor.path !== manifest.inputs.publicContract.path) {
        throw new Error(`public-contract evidence path mismatch: ${anchor.path}`)
      }
      if (anchor.kind === "scorer-public-projection" && !allowedScorerPaths.has(anchor.path)) {
        throw new Error(`scorer evidence path mismatch: ${anchor.path}`)
      }
      if (anchor.kind === "skill-source" && !allowedSourcePaths.has(anchor.path)) {
        throw new Error(`skill evidence path is outside source closure: ${anchor.path}`)
      }
      const searchable = anchor.kind === "task-prompt" ? taskPrompts(bytes) : bytes.toString("utf8")
      if (!searchable.includes(anchor.quote)) {
        throw new Error(`evidence quote missing: ${instruction.id}`)
      }
    }
  }

  for (const analysis of manifest.inputs.calibrationAnalyses) {
    SaturationAnalysisSchema.parse(JSON.parse(bytesByPath.get(analysis.path)!.toString("utf8")))
  }
  return manifest
}

function round4(value: number): number {
  return Number(value.toFixed(4))
}

export function summarizeExperimentalDesignV2InstructionCoverage(
  instructionsValue: readonly ExperimentalDesignV2Instruction[],
) {
  const instructions = z.array(ExperimentalDesignV2InstructionSchema).min(1).parse(instructionsValue)
    .map((instruction) => {
      const disclosedToNoSkill = instruction.evidence.some(
        (anchor) => anchor.audience === "no-skill-visible",
      )
      const presentInOriginalSkill = instruction.evidence.some(
        (anchor) => anchor.audience === "original-skill-only",
      )
      const evaluatorConfirmed = instruction.evidence.some(
        (anchor) => anchor.audience === "evaluator-public",
      )
      return {
        id: instruction.id,
        category: instruction.category,
        scorerRequired: instruction.scorerRequired,
        taskCompletionRequired: instruction.taskCompletionRequired,
        disclosedToNoSkill,
        presentInOriginalSkill,
        evaluatorConfirmed,
        publicDuplicatesSkillGuidance: disclosedToNoSkill && presentInOriginalSkill,
        criterionIds: instruction.criterionIds,
      }
    })

  const scorerRequired = instructions.filter((entry) => entry.scorerRequired)
  const skillIncremental = instructions.filter(
    (entry) => entry.category === "skill-incremental-knowledge",
  )
  const counts = {
    instructions: instructions.length,
    scorerRequired: scorerRequired.length,
    scorerRequiredPubliclyDisclosed: scorerRequired.filter((entry) => entry.disclosedToNoSkill).length,
    scorerRequiredSkillOnly: scorerRequired.filter(
      (entry) => entry.presentInOriginalSkill && !entry.disclosedToNoSkill,
    ).length,
    publicSkillOverlap: instructions.filter((entry) => entry.publicDuplicatesSkillGuidance).length,
    skillIncremental: skillIncremental.length,
    skillIncrementalMeasured: skillIncremental.filter((entry) => entry.scorerRequired).length,
  }
  return {
    counts,
    ratios: {
      noSkillOperationalCoverage: scorerRequired.length === 0
        ? 0
        : round4(counts.scorerRequiredPubliclyDisclosed / scorerRequired.length),
      skillIncrementalMeasurementCoverage: skillIncremental.length === 0
        ? 0
        : round4(counts.skillIncrementalMeasured / skillIncremental.length),
    },
    instructions,
  }
}

export async function analyzeExperimentalDesignV2TaskSufficiency(input: {
  rootDir: string
  manifest: ExperimentalDesignV2TaskSufficiencyManifest
}): Promise<ExperimentalDesignV2TaskSufficiencyReport> {
  const manifest = await verifyExperimentalDesignV2TaskSufficiencyManifest(
    input.rootDir,
    input.manifest,
  )
  const coverage = summarizeExperimentalDesignV2InstructionCoverage(manifest.instructions)
  const operationallySufficient =
    coverage.counts.scorerRequired > 0
    && coverage.counts.scorerRequiredPubliclyDisclosed === coverage.counts.scorerRequired
    && coverage.instructions.filter((entry) => entry.scorerRequired).every(
      (entry) => entry.evaluatorConfirmed,
    )
  const skillUniqueMeasured = coverage.counts.skillIncrementalMeasured > 0
  const conclusion = operationallySufficient && !skillUniqueMeasured
    ? "public-contract-operationally-sufficient-current-surface"
    : coverage.counts.scorerRequiredSkillOnly > 0
      ? "skill-unique-capability-remains-current-surface"
      : "inconclusive"
  const decision = conclusion === "public-contract-operationally-sufficient-current-surface"
    ? "move-to-skill-unique-deterministic-capability"
    : conclusion === "skill-unique-capability-remains-current-surface"
      ? "repair-public-disclosure-gap"
      : "freeze-no-measurable-strong-model-gain"

  const report = ExperimentalDesignV2TaskSufficiencyReportSchema.parse({
    schemaVersion: "skill-ir-public-contract-task-sufficiency-report/v1",
    auditId: manifest.auditId,
    benchmarkId: manifest.benchmarkId,
    status: operationallySufficient ? "passed" : "failed",
    inputs: allBoundFiles(manifest),
    calibrationEvidence: {
      analyses: 2,
      saturatedAnalyses: 2,
      totalComparablePairs: 8,
      totalDifferingPairs: 0,
    },
    ...coverage,
    conclusion,
    decision,
    experimentBoundary: {
      currentBaselineGatePassed: false,
      baseIrAuditAllowed: false,
      legacyIrScoresComparableUnderV2: false,
      createsTasks: false,
      apiRunAllowed: false,
      nextWrittenDesignRequired: true,
    },
    claimBoundary:
      "The current scorer-required operational surface is fully disclosed to the no-skill arm, while source-only design knowledge is unmeasured. This explains task sufficiency but does not prove model causality, optimization, or evaluation-split performance.",
  })
  if (FORBIDDEN_SINK.test(JSON.stringify(report))) {
    throw new Error("forbidden evidence sink in task sufficiency report")
  }
  return report
}
