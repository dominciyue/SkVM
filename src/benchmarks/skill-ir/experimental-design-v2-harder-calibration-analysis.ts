import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { sha256Bytes } from "./source-fixture.ts"

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const QualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-v2-harder-qualification/v1"),
  calibrationId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  status: z.literal("passed"),
  route: z.object({
    row: z.object({ durationMs: z.number().nonnegative() }).passthrough(),
    outputs: z.object({
      declared: z.literal(3),
      present: z.literal(3),
      missing: z.array(z.string()).length(0),
    }).strict(),
    harnessResidue: z.array(z.string()).length(0),
  }).passthrough(),
}).passthrough()

const GateSchema = z.object({
  schemaVersion: z.literal("skill-ir-pre-ir-calibration-gate-report/v1"),
  calibrationId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  passed: z.literal(false),
  counts: z.object({
    expectedRows: z.literal(8),
    observedRows: z.literal(8),
    expectedPairs: z.literal(4),
    completePairs: z.literal(4),
    infrastructureFailures: z.literal(0),
    comparablePairs: z.literal(4),
    differingPairs: z.literal(0),
  }).passthrough(),
  systems: z.object({
    "no-skill": z.object({
      rows: z.literal(4),
      successes: z.number().int().nonnegative(),
      meanScore: z.number().min(0).max(1),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      aggregateTokens: z.number().int().nonnegative(),
    }).strict(),
    original: z.object({
      rows: z.literal(4),
      successes: z.number().int().nonnegative(),
      meanScore: z.number().min(0).max(1),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      aggregateTokens: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  gates: z.object({
    completeRows: z.literal(true),
    completePairs: z.literal(true),
    zeroInfrastructure: z.literal(true),
    noSkillNonSaturated: z.literal(false),
    distinguishable: z.literal(false),
  }).strict(),
  interpretation: z.object({ baseIrAuditAllowed: z.literal(false) }).passthrough(),
}).passthrough()

const ScoredRowSchema = z.object({
  system: z.enum(["no-skill", "original"]),
  model: z.literal("xty/gpt-5.6-sol"),
  adapter: z.literal("pi"),
  adapterVersion: z.literal("0.67.68"),
  panelConfigId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  runStatus: z.literal("ok"),
  success: z.boolean(),
  latencyMs: z.number().nonnegative(),
  evaluatorScore: z.number().min(0).max(1),
  failedCriteria: z.array(z.string()),
}).passthrough()

const PredecessorAnalysisSchema = z.object({
  schemaVersion: z.literal("skill-ir-stable-harness-calibration-analysis/v1"),
  status: z.literal("gate-failed"),
  matrix: z.object({ differingPairs: z.number().int().nonnegative() }).passthrough(),
  systems: z.object({
    "no-skill": z.object({ meanLatencyMs: z.number().positive(), aggregateTokens: z.number().positive() }).passthrough(),
    original: z.object({ meanLatencyMs: z.number().positive(), aggregateTokens: z.number().positive() }).passthrough(),
  }).strict(),
}).passthrough()

const SystemAnalysisSchema = z.object({
  successes: z.number().int().nonnegative(),
  rows: z.literal(4),
  meanScore: z.number().min(0).max(1),
  meanLatencyMs: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  aggregateTokens: z.number().int().nonnegative(),
}).strict()

export const ExperimentalDesignV2HarderCalibrationAnalysisSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-v2-harder-calibration-analysis/v1"),
  calibrationId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  methodEvidence: z.literal(false),
  status: z.literal("gate-failed"),
  inputs: z.object({
    qualificationSha256: Sha256Schema,
    gateSha256: Sha256Schema,
    scoredSha256: Sha256Schema,
    predecessorAnalysisSha256: Sha256Schema,
  }).strict(),
  qualification: z.object({
    status: z.literal("passed"),
    routeDurationMs: z.number().nonnegative(),
    outputs: z.literal("3/3"),
    harnessResidue: z.array(z.string()).length(0),
  }).strict(),
  matrix: z.object({
    expectedRows: z.literal(8),
    observedRows: z.literal(8),
    completePairs: z.literal(4),
    infrastructureFailures: z.literal(0),
    comparablePairs: z.literal(4),
    differingPairs: z.literal(0),
  }).strict(),
  systems: z.object({
    "no-skill": SystemAnalysisSchema,
    original: SystemAnalysisSchema,
  }).strict(),
  ratios: z.object({
    originalToNoSkillMeanLatency: z.number().nonnegative(),
    originalToNoSkillInputTokens: z.number().nonnegative(),
    originalToNoSkillOutputTokens: z.number().nonnegative(),
    originalToNoSkillAggregateTokens: z.number().nonnegative(),
  }).strict(),
  predecessorComparison: z.object({
    noSkillMeanLatencyMultiplier: z.number().nonnegative(),
    originalMeanLatencyMultiplier: z.number().nonnegative(),
    noSkillAggregateTokenMultiplier: z.number().nonnegative(),
    originalAggregateTokenMultiplier: z.number().nonnegative(),
    semanticDifferentiationChanged: z.boolean(),
  }).strict(),
  failedGates: z.tuple([z.literal("noSkillNonSaturated"), z.literal("distinguishable")]),
  interpretation: z.object({
    stableHarnessQualified: z.literal(true),
    baseIrAuditAllowed: z.literal(false),
    heldOutAllowed: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    nextAudit: z.literal("public-contract-task-sufficiency"),
    finding: z.string().min(1),
  }).strict(),
}).strict()

export type ExperimentalDesignV2HarderCalibrationAnalysis = z.infer<
  typeof ExperimentalDesignV2HarderCalibrationAnalysisSchema
>

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown
}

function parseJsonl(bytes: Uint8Array): unknown[] {
  return Buffer.from(bytes).toString("utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
}

function round4(value: number): number {
  return Number(value.toFixed(4))
}

export function analyzeExperimentalDesignV2HarderCalibration(input: {
  qualificationBytes: Uint8Array
  gateBytes: Uint8Array
  scoredBytes: Uint8Array
  predecessorAnalysisBytes: Uint8Array
}): ExperimentalDesignV2HarderCalibrationAnalysis {
  const qualification = QualificationSchema.parse(parseJson(input.qualificationBytes))
  const gate = GateSchema.parse(parseJson(input.gateBytes))
  const rows = z.array(ScoredRowSchema).length(8).parse(parseJsonl(input.scoredBytes))
  const predecessor = PredecessorAnalysisSchema.parse(parseJson(input.predecessorAnalysisBytes))
  const systems = Object.fromEntries((["no-skill", "original"] as const).map((system) => {
    const selected = rows.filter((row) => row.system === system)
    const summary = gate.systems[system]
    return [system, {
      ...summary,
      meanLatencyMs: selected.reduce((sum, row) => sum + row.latencyMs, 0) / selected.length,
    }]
  })) as Record<"no-skill" | "original", z.infer<typeof SystemAnalysisSchema>>

  const noSkill = systems["no-skill"]
  const original = systems.original
  return ExperimentalDesignV2HarderCalibrationAnalysisSchema.parse({
    schemaVersion: "skill-ir-experimental-design-v2-harder-calibration-analysis/v1",
    calibrationId: gate.calibrationId,
    methodEvidence: false,
    status: "gate-failed",
    inputs: {
      qualificationSha256: sha256Bytes(input.qualificationBytes),
      gateSha256: sha256Bytes(input.gateBytes),
      scoredSha256: sha256Bytes(input.scoredBytes),
      predecessorAnalysisSha256: sha256Bytes(input.predecessorAnalysisBytes),
    },
    qualification: {
      status: qualification.status,
      routeDurationMs: qualification.route.row.durationMs,
      outputs: "3/3",
      harnessResidue: qualification.route.harnessResidue,
    },
    matrix: {
      expectedRows: gate.counts.expectedRows,
      observedRows: gate.counts.observedRows,
      completePairs: gate.counts.completePairs,
      infrastructureFailures: gate.counts.infrastructureFailures,
      comparablePairs: gate.counts.comparablePairs,
      differingPairs: gate.counts.differingPairs,
    },
    systems,
    ratios: {
      originalToNoSkillMeanLatency: round4(original.meanLatencyMs / noSkill.meanLatencyMs),
      originalToNoSkillInputTokens: round4(original.inputTokens / noSkill.inputTokens),
      originalToNoSkillOutputTokens: round4(original.outputTokens / noSkill.outputTokens),
      originalToNoSkillAggregateTokens: round4(original.aggregateTokens / noSkill.aggregateTokens),
    },
    predecessorComparison: {
      noSkillMeanLatencyMultiplier: round4(
        noSkill.meanLatencyMs / predecessor.systems["no-skill"].meanLatencyMs,
      ),
      originalMeanLatencyMultiplier: round4(
        original.meanLatencyMs / predecessor.systems.original.meanLatencyMs,
      ),
      noSkillAggregateTokenMultiplier: round4(
        noSkill.aggregateTokens / predecessor.systems["no-skill"].aggregateTokens,
      ),
      originalAggregateTokenMultiplier: round4(
        original.aggregateTokens / predecessor.systems.original.aggregateTokens,
      ),
      semanticDifferentiationChanged:
        predecessor.matrix.differingPairs !== gate.counts.differingPairs,
    },
    failedGates: ["noSkillNonSaturated", "distinguishable"],
    interpretation: {
      stableHarnessQualified: true,
      baseIrAuditAllowed: false,
      heldOutAllowed: false,
      skillOptimizationEvidence: false,
      nextAudit: "public-contract-task-sufficiency",
      finding:
        "The supplemental tasks increased execution cost but did not change semantic differentiation: the strong model still passed every row without the skill, while the original skill added tokens and latency without a quality gain. Audit whether the public task contract is operationally sufficient before authoring another task set.",
    },
  })
}

if (import.meta.main) {
  const rootDir = process.cwd()
  const currentDir = path.join(
    rootDir,
    "results/skill-ir/experimental-design-v2-harder-pi-calibration-2026-07-31",
  )
  const report = analyzeExperimentalDesignV2HarderCalibration({
    qualificationBytes: await readFile(path.join(currentDir, "qualification.json")),
    gateBytes: await readFile(path.join(currentDir, "gate-report.json")),
    scoredBytes: await readFile(path.join(currentDir, "scored-runs.jsonl")),
    predecessorAnalysisBytes: await readFile(path.join(
      rootDir,
      "results/skill-ir/experimental-design-v2-pi-post-cleanup-2026-07-29/calibration-analysis.json",
    )),
  })
  const outArg = process.argv.slice(2).find((arg) => arg.startsWith("--out="))
  const outPath = outArg
    ? path.resolve(rootDir, outArg.slice("--out=".length))
    : path.join(currentDir, "calibration-analysis.json")
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({ status: report.status, out: path.relative(rootDir, outPath) }, null, 2))
}
