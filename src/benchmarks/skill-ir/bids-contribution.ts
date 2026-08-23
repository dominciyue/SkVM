import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  SkillContributionIdentifiabilityManifestSchema,
  analyzeSkillContribution,
  verifyContributionManifest,
  type SkillContributionIdentifiabilityManifest,
  type SkillContributionReport,
} from "./skill-contribution-identifiability.ts"
import { BidsTaskSetSchema } from "./bids-contract.ts"

export const BIDS_CONTRIBUTION_MANIFEST_PATH =
  "benchmarks/skill-ir/pilots/bids/contribution-identifiability.json"
export const BIDS_CONTRIBUTION_REPORT_PATH =
  "results/skill-ir/bids-contribution-identifiability-v1/report.json"

const TASK_SET_PATH = "benchmarks/skill-ir/pilots/bids/development/tasks.json"
const SKILL_SOURCE_PATH = "benchmarks/skill-ir/pilots/bids/source/SKILL.md"
const SCORER_PATH = "src/bench/evaluators/bids-grade.ts"
const CANARY_REPORT_PATH = "results/skill-ir/bids-contract-audit-v1/report.json"
const TASK_ONE = "bids-entity-order-dev-001"
const TASK_TWO = "bids-metadata-inheritance-dev-002"

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function bind(rootDir: string, relativePath: string) {
  const bytes = await readFile(path.join(rootDir, ...relativePath.split("/")))
  return { path: relativePath, sha256: sha256(bytes), text: bytes.toString("utf8") }
}

function requireQuote(text: string, quote: string, label: string): string {
  if (!text.includes(quote)) throw new Error(`missing ${label} evidence quote`)
  return quote
}

export async function buildBidsContributionManifest(
  rootDir: string,
): Promise<SkillContributionIdentifiabilityManifest> {
  const [taskSet, skillSource, scorer, canaryReport] = await Promise.all([
    bind(rootDir, TASK_SET_PATH),
    bind(rootDir, SKILL_SOURCE_PATH),
    bind(rootDir, SCORER_PATH),
    bind(rootDir, CANARY_REPORT_PATH),
  ])
  const tasks = BidsTaskSetSchema.parse(JSON.parse(taskSet.text))
  const criterionIds = new Set(tasks.tasks.flatMap((task) => task.eval.map((criterion) => criterion.id)))
  const expectedCriterionIds = [
    `${TASK_ONE}-input-integrity`,
    `${TASK_ONE}-artifact-contract`,
    `${TASK_ONE}-semantic-audit`,
    `${TASK_TWO}-input-integrity`,
    `${TASK_TWO}-artifact-contract`,
    `${TASK_TWO}-semantic-audit`,
  ]
  if (
    tasks.tasks.map((task) => task.id).join("\n") !== `${TASK_ONE}\n${TASK_TWO}`
    || expectedCriterionIds.some((id) => !criterionIds.has(id))
  ) {
    throw new Error("BIDS contribution manifest no longer matches the development task set")
  }

  const taskAnchor = (quote: string) => ({
    source: "fixture-derived" as const,
    kind: "task-set" as const,
    path: taskSet.path,
    sha256: taskSet.sha256,
    quote: requireQuote(taskSet.text, quote, "task-set"),
  })
  const skillAnchor = (quote: string) => ({
    source: "skill-derived" as const,
    kind: "skill-source" as const,
    path: skillSource.path,
    sha256: skillSource.sha256,
    quote: requireQuote(skillSource.text, quote, "skill-source"),
  })
  const scorerAnchor = (quote: string) => ({
    source: "fixture-derived" as const,
    kind: "scorer" as const,
    path: scorer.path,
    sha256: scorer.sha256,
    quote: requireQuote(scorer.text, quote, "scorer"),
  })
  const publicContractAnchor = {
    source: "task-outcome" as const,
    kind: "task-set" as const,
    path: taskSet.path,
    sha256: taskSet.sha256,
    quote: requireQuote(taskSet.text, "Produce exactly bids-audit.json under the complete public contract", "public contract"),
  }

  const skillClaimIds = [
    "bids-entity-ordering",
    "bids-metadata-inheritance",
    "bids-required-bold-metadata",
  ]
  const manifest = {
    schemaVersion: "skill-contribution-identifiability/v1",
    auditId: "bids-contribution-identifiability-v1",
    skillId: "bids",
    taskSetId: "bids-development-v1",
    scope: {
      split: "development",
      taskIds: [TASK_ONE, TASK_TWO],
    },
    criteria: [
      {
        id: `${TASK_ONE}-input-integrity`, taskId: TASK_ONE, weight: 0.1, hardGate: true,
        claimIds: ["bids-public-report-contract"], provenance: ["task-outcome"],
      },
      {
        id: `${TASK_ONE}-artifact-contract`, taskId: TASK_ONE, weight: 0.1, hardGate: true,
        claimIds: ["bids-public-report-contract"], provenance: ["task-outcome"],
      },
      {
        id: `${TASK_ONE}-semantic-audit`, taskId: TASK_ONE, weight: 0.8, hardGate: true,
        claimIds: [skillClaimIds[0]], provenance: ["skill-derived", "fixture-derived"],
      },
      {
        id: `${TASK_TWO}-input-integrity`, taskId: TASK_TWO, weight: 0.1, hardGate: true,
        claimIds: ["bids-public-report-contract"], provenance: ["task-outcome"],
      },
      {
        id: `${TASK_TWO}-artifact-contract`, taskId: TASK_TWO, weight: 0.1, hardGate: true,
        claimIds: ["bids-public-report-contract"], provenance: ["task-outcome"],
      },
      {
        id: `${TASK_TWO}-semantic-audit`, taskId: TASK_TWO, weight: 0.8, hardGate: true,
        claimIds: [skillClaimIds[1], skillClaimIds[2]], provenance: ["skill-derived", "fixture-derived"],
      },
    ],
    claims: [
      {
        id: "bids-public-report-contract",
        summary: "The task requires one exact public audit artifact while preserving protected inputs.",
        taskIds: [TASK_ONE, TASK_TWO],
        failureMode: "public-artifact-contract",
        answerBearingDuplication: false,
        evidence: [publicContractAnchor],
      },
      {
        id: skillClaimIds[0],
        summary: "BIDS filename entities must follow the source-defined order.",
        taskIds: [TASK_ONE],
        failureMode: "entity-ordering",
        answerBearingDuplication: false,
        evidence: [
          skillAnchor("Entity ordering in filenames** is fixed by the spec"),
          taskAnchor(TASK_ONE),
          scorerAnchor("deriveBidsAuditOracle"),
        ],
      },
      {
        id: skillClaimIds[1],
        summary: "Matching higher-level JSON sidecars contribute inherited metadata unless overridden.",
        taskIds: [TASK_TWO],
        failureMode: "metadata-inheritance",
        answerBearingDuplication: false,
        evidence: [
          skillAnchor("Metadata fields follow the inheritance principle"),
          taskAnchor(TASK_TWO),
          scorerAnchor("deriveBidsAuditOracle"),
        ],
      },
      {
        id: skillClaimIds[2],
        summary: "BOLD data requires RepetitionTime and TaskName after applying inheritance.",
        taskIds: [TASK_TWO],
        failureMode: "required-bold-metadata",
        answerBearingDuplication: false,
        evidence: [
          skillAnchor("`RepetitionTime` and `TaskName` are required for BOLD"),
          taskAnchor(TASK_TWO),
          scorerAnchor("deriveBidsAuditOracle"),
        ],
      },
    ],
    canaries: [
      ["bids-canonical-valid", "canonical-valid", "/roles/canonicalValid"],
      ["bids-alternative-valid", "alternative-valid", "/roles/alternativeValid"],
      ["bids-prompt-only-omission", "prompt-only-omission", "/roles/promptOnlyOmission"],
      ["bids-reverse-evidence", "reverse-evidence", "/roles/reverseEvidence"],
      ["bids-forbidden-sink", "forbidden-sink", "/roles/forbiddenSink"],
    ].map(([id, role, jsonPointer]) => ({
      id,
      role,
      taskIds: [TASK_ONE, TASK_TWO],
      claimIds: skillClaimIds,
      observation: {
        path: canaryReport.path,
        sha256: canaryReport.sha256,
        jsonPointer,
        expected: true,
      },
    })),
    forbiddenEvidenceClasses: [
      "evaluation-split-task",
      "evaluator-expected",
      "historical-raw-model-text",
      "package-generated-answer",
      "secret",
      "absolute-path",
    ],
  }
  return SkillContributionIdentifiabilityManifestSchema.parse(manifest)
}

export async function buildBidsContributionEvidence(rootDir: string): Promise<{
  manifest: SkillContributionIdentifiabilityManifest
  report: SkillContributionReport
}> {
  const manifest = await buildBidsContributionManifest(rootDir)
  const report = analyzeSkillContribution(await verifyContributionManifest(manifest, rootDir))
  return { manifest, report }
}

export async function writeBidsContributionEvidence(input: {
  rootDir: string
  outputRoot?: string
}): Promise<{
  manifest: SkillContributionIdentifiabilityManifest
  report: SkillContributionReport
}> {
  const evidence = await buildBidsContributionEvidence(input.rootDir)
  const outputRoot = input.outputRoot ?? input.rootDir
  for (const [relativePath, value] of [
    [BIDS_CONTRIBUTION_MANIFEST_PATH, evidence.manifest],
    [BIDS_CONTRIBUTION_REPORT_PATH, evidence.report],
  ] as const) {
    const outputPath = path.join(outputRoot, ...relativePath.split("/"))
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  }
  return evidence
}
