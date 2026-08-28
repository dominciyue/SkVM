import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { AutomaticConstructionShadowReportSchema } from "./automatic-construction-shadow.ts"
import { DomainAutomaticConstructionShadowReportSchema } from "./automatic-domain-construction-shadow.ts"
import { CrossSkillDomainPlanParityReportSchema } from "./automatic-domain-plan-cross-skill-parity.ts"
import { GenericDomainPlanRepairReportSchema } from "./automatic-domain-plan-generic-repair.ts"
import { AutomaticJsonPointerConstructionShadowReportSchema } from "./automatic-json-pointer-construction-shadow.ts"
import { StructuralExecutionShadowReportSchema } from "./automatic-structural-execution-shadow.ts"
import {
  AuthoritativeMethodPortfolioReadinessReportV6Schema,
  MethodPortfolioAuthorityRegistryV5Schema,
  MethodPortfolioEvidenceAuthorityReportV2Schema,
  readAndEvaluateAuthoritativeMethodPortfolio,
} from "./method-portfolio-evidence-authority.ts"
import { MethodPortfolioReadinessReportSchema, MethodPortfolioSchema } from "./method-portfolio.ts"
import { ReviewRequiredReportSchema } from "./review-required.ts"
import { sha256Bytes } from "./source-fixture.ts"

const IdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u)
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll("\\", "/")
  return !path.posix.isAbsolute(normalized)
    && !normalized.split("/").some((part) => part === "" || part === "." || part === "..")
}, "path must be repository-relative and traversal-free")
const DigestRefSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()

const CostBoundarySchema = z.object({
  scope: z.literal("full-qualified-adaptation"),
  declarationEffortIncluded: z.literal(true),
  userInputLocMetric: z.literal("physical-declaration-loc-plus-qualification-adapter-loc"),
  reusableMeasuredSegments: z.tuple([z.literal("thin-task-declaration-authoring")]),
  excludedOverlappingOrDifferentScopeSegments: z.tuple([
    z.literal("shared-core-development"),
    z.literal("structural-parity-catalog"),
    z.literal("partial-output-integration"),
    z.literal("json-pointer-integration"),
    z.literal("review-required-patch"),
  ]),
  fullQualificationRequires: z.tuple([
    z.literal("declaration-human-minutes"),
    z.literal("physical-declaration-loc"),
    z.literal("qualification-human-minutes"),
    z.literal("qualification-adapter-loc"),
    z.literal("core-branch-delta"),
  ]),
  historicalNullsMayBeBackfilled: z.literal(false),
  measuredScopesMayBeSummed: z.literal(false),
}).strict()

export const AutomationComponentAuthorityCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-automation-component-authority-catalog/v1"),
  catalogId: IdentifierSchema,
  implementation: DigestRefSchema,
  portfolioAuthority: DigestRefSchema,
  evidence: z.object({
    sourceOnlyConstruction: DigestRefSchema,
    thinDeclarationConstruction: DigestRefSchema,
    structuralExecution: DigestRefSchema,
    jsonPointerConstruction: DigestRefSchema,
    crossSkillDomainPlan: DigestRefSchema,
    genericDomainRepair: DigestRefSchema,
    reviewRequiredClosure: DigestRefSchema,
  }).strict(),
  costBoundary: CostBoundarySchema,
}).strict()

const EvidenceReferenceWithSchema = DigestRefSchema.extend({
  schemaVersion: z.string().min(1),
}).strict()

const EvidenceKeySchema = z.enum([
  "sourceOnlyConstruction",
  "thinDeclarationConstruction",
  "structuralExecution",
  "jsonPointerConstruction",
  "crossSkillDomainPlan",
  "genericDomainRepair",
  "reviewRequiredClosure",
])

const EvidenceRegistrySchema = z.object({
  sourceOnlyConstruction: EvidenceReferenceWithSchema,
  thinDeclarationConstruction: EvidenceReferenceWithSchema,
  structuralExecution: EvidenceReferenceWithSchema,
  jsonPointerConstruction: EvidenceReferenceWithSchema,
  crossSkillDomainPlan: EvidenceReferenceWithSchema,
  genericDomainRepair: EvidenceReferenceWithSchema,
  reviewRequiredClosure: EvidenceReferenceWithSchema,
}).strict()

const QualificationCriterionSchema = z.object({
  id: IdentifierSchema,
  status: z.enum(["established", "failed", "not-established"]),
  evidence: z.array(EvidenceKeySchema).min(1),
}).strict()

const ComponentAuthoritySchema = z.object({
  candidateGenerated: z.literal(true),
  authorityQualified: z.literal(false),
  criteria: z.array(QualificationCriterionSchema).min(1),
  blockers: z.array(z.enum([
    "exact-source-rule-match-absent",
    "domain-semantic-sufficiency-not-established",
    "full-manual-parity-not-established",
    "complete-executable-package-not-established",
  ])).min(1),
}).strict()

const AutomationAuthorityCaseSchema = z.object({
  skillId: IdentifierSchema,
  methodSequence: z.number().int().positive(),
  components: z.object({
    generatesIr: ComponentAuthoritySchema,
    generatesContract: ComponentAuthoritySchema,
    generatesValidationPlan: ComponentAuthoritySchema,
    generatesPackageCandidate: ComponentAuthoritySchema,
  }).strict(),
  adaptation: z.object({
    declarationSegment: z.object({
      status: z.literal("measured"),
      humanMinutes: z.number().int().nonnegative(),
      physicalDeclarationLoc: z.number().int().positive(),
      adapterLoc: z.literal(0),
      coreBranchDelta: z.literal(0),
      evidence: z.literal("thinDeclarationConstruction"),
    }).strict(),
    qualificationSegment: z.object({
      status: z.literal("not-established"),
      humanMinutes: z.null(),
      adapterLoc: z.null(),
    }).strict(),
    fullQualifiedCost: z.object({
      status: z.literal("not-established"),
      humanMinutes: z.null(),
      userInputLoc: z.null(),
      coreBranchDelta: z.literal(0),
    }).strict(),
  }).strict(),
}).strict()

export const AutomationComponentEvidenceAuthorityReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-automation-component-evidence-authority/v1"),
  catalog: EvidenceReferenceWithSchema,
  implementation: DigestRefSchema,
  portfolioAuthority: DigestRefSchema,
  evidence: EvidenceRegistrySchema,
  derivationBoundary: z.object({
    basePortfolioAutomationFieldsConsumed: z.literal(false),
    basePortfolioAdaptationCostFieldsConsumed: z.literal(false),
    candidatePresenceIsQualification: z.literal(false),
    reviewRequiredClosureIsAutomatic: z.literal(false),
  }).strict(),
  costBoundary: CostBoundarySchema,
  costEvidence: z.object({
    declarationHumanMinutes: z.number().int().nonnegative(),
    physicalDeclarationLoc: z.number().int().nonnegative(),
    qualificationHumanMinutes: z.null(),
    qualificationAdapterLoc: z.null(),
    completeCases: z.literal(0),
    trend: z.literal("not-established"),
  }).strict(),
  cases: z.array(AutomationAuthorityCaseSchema).length(7),
  summary: z.object({
    qualifiedMethodCases: z.literal(7),
    candidateCases: z.object({
      generatesIr: z.literal(7),
      generatesContract: z.literal(7),
      generatesValidationPlan: z.literal(7),
      generatesPackageCandidate: z.literal(7),
    }).strict(),
    authorityQualifiedCases: z.object({
      generatesIr: z.literal(0),
      generatesContract: z.literal(0),
      generatesValidationPlan: z.literal(0),
      generatesPackageCandidate: z.literal(0),
    }).strict(),
    completeFullQualifiedAdaptationCostCases: z.literal(0),
    lastThreeCoreBranchDeltaZero: z.literal(true),
    fullQualificationTrend: z.literal("not-established"),
    automationIncompleteSkills: z.array(IdentifierSchema).length(7),
    automationAndAdaptationConverging: z.literal(false),
  }).strict(),
  accounting: z.object({
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((report, context) => {
  const ids = report.cases.map((entry) => entry.skillId)
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "automation authority case ids must be unique" })
  }
  if (report.costEvidence.declarationHumanMinutes
      !== report.cases.reduce((sum, entry) => sum + entry.adaptation.declarationSegment.humanMinutes, 0)
    || report.costEvidence.physicalDeclarationLoc
      !== report.cases.reduce((sum, entry) => sum + entry.adaptation.declarationSegment.physicalDeclarationLoc, 0)) {
    context.addIssue({ code: "custom", message: "automation authority declaration cost does not conserve case evidence" })
  }
})

export const AuthoritativeAutomationReadinessV7Schema = MethodPortfolioReadinessReportSchema
  .omit({ schemaVersion: true })
  .extend({
    schemaVersion: z.literal("skill-ir-method-portfolio-readiness/v7"),
    evidenceAuthority: MethodPortfolioEvidenceAuthorityReportV2Schema,
    automationEvidenceAuthority: AutomationComponentEvidenceAuthorityReportSchema,
  }).strict()

export type AuthoritativeAutomationReadinessV7 = z.infer<typeof AuthoritativeAutomationReadinessV7Schema>

function containedPath(rootDir: string, relativePath: string, label: string): string {
  const root = path.resolve(rootDir)
  const candidate = path.resolve(root, ...SafeRelativePathSchema.parse(relativePath).split("/"))
  const relative = path.relative(root, candidate)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes repository root: ${relativePath}`)
  }
  return candidate
}

async function readRegularFile(absolutePath: string, label: string): Promise<Buffer> {
  try {
    const stat = await lstat(absolutePath)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`${label} must be a regular non-symlink file`)
    }
    return await readFile(absolutePath)
  } catch (error) {
    if (error instanceof Error && error.message.includes("regular non-symlink")) throw error
    throw new Error(`${label} is unavailable`)
  }
}

async function readPinned(
  rootDir: string,
  reference: z.infer<typeof DigestRefSchema>,
  label: string,
): Promise<Buffer> {
  const bytes = await readRegularFile(containedPath(rootDir, reference.path, label), label)
  const actual = sha256Bytes(bytes)
  if (actual !== reference.sha256) {
    throw new Error(`${label} digest mismatch for ${reference.path}: expected ${reference.sha256}, got ${actual}`)
  }
  return bytes
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error })
  }
}

function evidenceRef(
  reference: z.infer<typeof DigestRefSchema>,
  schemaVersion: string,
): z.infer<typeof EvidenceReferenceWithSchema> {
  return { ...reference, schemaVersion }
}

function component(input: {
  criteria: z.infer<typeof QualificationCriterionSchema>[]
  blockers: z.infer<typeof ComponentAuthoritySchema>["blockers"]
}): z.infer<typeof ComponentAuthoritySchema> {
  return ComponentAuthoritySchema.parse({
    candidateGenerated: true,
    authorityQualified: false,
    criteria: input.criteria,
    blockers: input.blockers,
  })
}

export async function readAndEvaluateAutomationComponentAuthority(input: {
  rootDir: string
  catalogPath: string
}): Promise<AuthoritativeAutomationReadinessV7> {
  const rootDir = path.resolve(input.rootDir)
  const catalogAbsolute = path.resolve(input.catalogPath)
  const catalogRelative = SafeRelativePathSchema.parse(
    path.relative(rootDir, catalogAbsolute).replaceAll("\\", "/"),
  )
  const catalogBytes = await readRegularFile(catalogAbsolute, "automation component authority catalog")
  const catalog = AutomationComponentAuthorityCatalogSchema.parse(parseJson(
    catalogBytes,
    "automation component authority catalog",
  ))

  await readPinned(rootDir, catalog.implementation, "automation component authority implementation")
  const portfolioRegistryBytes = await readPinned(rootDir, catalog.portfolioAuthority, "portfolio authority")
  const portfolioRegistry = MethodPortfolioAuthorityRegistryV5Schema.parse(parseJson(
    portfolioRegistryBytes,
    "portfolio authority",
  ))
  const basePortfolioBytes = await readPinned(rootDir, portfolioRegistry.basePortfolio, "base method portfolio")
  const basePortfolio = MethodPortfolioSchema.parse(parseJson(basePortfolioBytes, "base method portfolio"))
  const optimizationReadiness = AuthoritativeMethodPortfolioReadinessReportV6Schema.parse(
    await readAndEvaluateAuthoritativeMethodPortfolio({
      rootDir,
      portfolioPath: containedPath(rootDir, catalog.portfolioAuthority.path, "portfolio authority"),
    }),
  )

  const evidenceBytes = Object.fromEntries(await Promise.all(Object.entries(catalog.evidence).map(
    async ([key, reference]) => [key, await readPinned(rootDir, reference, `automation evidence ${key}`)],
  ))) as Record<keyof typeof catalog.evidence, Buffer>
  const sourceOnly = AutomaticConstructionShadowReportSchema.parse(parseJson(
    evidenceBytes.sourceOnlyConstruction,
    "source-only construction evidence",
  ))
  const thin = DomainAutomaticConstructionShadowReportSchema.parse(parseJson(
    evidenceBytes.thinDeclarationConstruction,
    "thin declaration construction evidence",
  ))
  const structural = StructuralExecutionShadowReportSchema.parse(parseJson(
    evidenceBytes.structuralExecution,
    "structural execution evidence",
  ))
  const pointer = AutomaticJsonPointerConstructionShadowReportSchema.parse(parseJson(
    evidenceBytes.jsonPointerConstruction,
    "JSON Pointer construction evidence",
  ))
  const crossSkill = CrossSkillDomainPlanParityReportSchema.parse(parseJson(
    evidenceBytes.crossSkillDomainPlan,
    "cross-skill domain plan evidence",
  ))
  const repair = GenericDomainPlanRepairReportSchema.parse(parseJson(
    evidenceBytes.genericDomainRepair,
    "generic domain repair evidence",
  ))
  const reviewed = ReviewRequiredReportSchema.parse(parseJson(
    evidenceBytes.reviewRequiredClosure,
    "review-required closure evidence",
  ))

  if (!optimizationReadiness.gates.twoEvidenceQualifiedPhenotypes
    || !optimizationReadiness.gates.noOpenMeasurementBlockers) {
    throw new Error("optimization readiness does not match the Stage A authority boundary")
  }
  if (basePortfolio.portfolioId !== portfolioRegistry.portfolioId
    || optimizationReadiness.portfolioId !== basePortfolio.portfolioId) {
    throw new Error("portfolio identities disagree")
  }

  const qualified = basePortfolio.cases
    .filter((entry) => entry.role === "method-development" && entry.contractQualified)
    .sort((left, right) => left.methodSequence! - right.methodSequence!)
  const sourceByCase = new Map(sourceOnly.cases.map((entry) => [entry.caseId, entry]))
  const thinByCase = new Map(thin.cases.map((entry) => [entry.caseId, entry]))
  const structuralByCase = new Map(structural.cases.map((entry) => [entry.caseId, entry]))
  if (qualified.length !== 7
    || [sourceByCase, thinByCase, structuralByCase].some((entries) =>
      entries.size !== qualified.length || qualified.some((entry) => !entries.has(entry.skillId)))) {
    throw new Error("automation component evidence does not cover the seven qualified method cases")
  }

  const sourceRef = evidenceRef(catalog.evidence.sourceOnlyConstruction, sourceOnly.schemaVersion)
  const thinRef = evidenceRef(catalog.evidence.thinDeclarationConstruction, thin.schemaVersion)
  const structuralRef = evidenceRef(catalog.evidence.structuralExecution, structural.schemaVersion)
  const pointerRef = evidenceRef(catalog.evidence.jsonPointerConstruction, pointer.schemaVersion)
  const crossSkillRef = evidenceRef(catalog.evidence.crossSkillDomainPlan, crossSkill.schemaVersion)
  const repairRef = evidenceRef(catalog.evidence.genericDomainRepair, repair.schemaVersion)
  const reviewedRef = evidenceRef(catalog.evidence.reviewRequiredClosure, reviewed.schemaVersion)

  if (crossSkill.semanticParity.status !== "failed"
    || crossSkill.semanticParity.fullyPassingSkillCount !== 0
    || repair.caseId !== "env-manager"
    || repair.parity?.summary.fullParityTasks !== 0
    || reviewed.automationEligibilityChanged) {
    throw new Error("domain/review evidence no longer supports the frozen automatic qualification boundary")
  }

  const pointerByCase = new Map(pointer.cases.map((entry) => [entry.caseId, entry]))
  const cases = qualified.map((portfolioCase) => {
    const source = sourceByCase.get(portfolioCase.skillId)!
    const domain = thinByCase.get(portfolioCase.skillId)!
    const structuralCase = structuralByCase.get(portfolioCase.skillId)!
    if (source.methodSequence !== portfolioCase.methodSequence
      || domain.methodSequence !== portfolioCase.methodSequence
      || source.automaticStructure.skillIrReferenceErrors !== 0
      || domain.adaptation.declarationStatus !== "within-limit"
      || domain.semanticParity !== "not-established"
      || structuralCase.semanticParity !== "not-established") {
      throw new Error(`component evidence identity or qualification boundary drift: ${portfolioCase.skillId}`)
    }
    const structuralBaseline = structuralCase.scenarios.find((scenario) => scenario.id === "baseline")
    if (structuralBaseline?.automatic.status !== "pass") {
      throw new Error(`structural baseline is not passing: ${portfolioCase.skillId}`)
    }
    const pointerCase = pointerByCase.get(portfolioCase.skillId)
    if (pointerCase && (pointerCase.automaticEligibility
      || pointerCase.semanticParity !== "not-established"
      || pointerCase.construction.remainingUnresolved.length === 0)) {
      throw new Error(`partial construction evidence no longer supports the package boundary: ${portfolioCase.skillId}`)
    }

    const commonSemanticCriterion: z.infer<typeof QualificationCriterionSchema> = {
      id: "domain-semantic-sufficiency",
      status: "not-established",
      evidence: ["thinDeclarationConstruction", "crossSkillDomainPlan", "genericDomainRepair"],
    }
    return AutomationAuthorityCaseSchema.parse({
      skillId: portfolioCase.skillId,
      methodSequence: portfolioCase.methodSequence,
      components: {
        generatesIr: component({
          criteria: [
            {
              id: "candidate-generated",
              status: "established",
              evidence: ["sourceOnlyConstruction", "thinDeclarationConstruction"],
            },
            {
              id: "source-isolation",
              status: "established",
              evidence: ["sourceOnlyConstruction", "thinDeclarationConstruction"],
            },
            {
              id: "skill-ir-reference-validation",
              status: "established",
              evidence: ["sourceOnlyConstruction"],
            },
            {
              id: "exact-source-rule-match",
              status: source.baseIrComparison.exactSourceRuleMatches > 0 ? "established" : "failed",
              evidence: ["sourceOnlyConstruction", "thinDeclarationConstruction"],
            },
            commonSemanticCriterion,
          ],
          blockers: ["exact-source-rule-match-absent", "domain-semantic-sufficiency-not-established"],
        }),
        generatesContract: component({
          criteria: [
            {
              id: "candidate-generated",
              status: "established",
              evidence: ["sourceOnlyConstruction", "thinDeclarationConstruction"],
            },
            {
              id: "thin-declaration-within-limit",
              status: "established",
              evidence: ["thinDeclarationConstruction"],
            },
            commonSemanticCriterion,
          ],
          blockers: ["domain-semantic-sufficiency-not-established"],
        }),
        generatesValidationPlan: component({
          criteria: [
            {
              id: "candidate-generated",
              status: "established",
              evidence: ["sourceOnlyConstruction", "thinDeclarationConstruction"],
            },
            {
              id: "real-workdir-structural-execution",
              status: "established",
              evidence: ["structuralExecution"],
            },
            {
              id: "full-manual-parity",
              status: "not-established",
              evidence: ["structuralExecution", "crossSkillDomainPlan", "genericDomainRepair"],
            },
            commonSemanticCriterion,
          ],
          blockers: ["full-manual-parity-not-established", "domain-semantic-sufficiency-not-established"],
        }),
        generatesPackageCandidate: component({
          criteria: [
            {
              id: "candidate-generated",
              status: "established",
              evidence: ["sourceOnlyConstruction", "thinDeclarationConstruction"],
            },
            {
              id: "complete-executable-package",
              status: "not-established",
              evidence: pointerCase
                ? ["sourceOnlyConstruction", "thinDeclarationConstruction", "jsonPointerConstruction"]
                : ["sourceOnlyConstruction", "thinDeclarationConstruction"],
            },
            {
              id: "full-manual-parity",
              status: "not-established",
              evidence: ["crossSkillDomainPlan", "genericDomainRepair", "reviewRequiredClosure"],
            },
          ],
          blockers: ["complete-executable-package-not-established", "full-manual-parity-not-established"],
        }),
      },
      adaptation: {
        declarationSegment: {
          status: "measured",
          humanMinutes: domain.adaptation.declarationHumanMinutes,
          physicalDeclarationLoc: domain.adaptation.declarationLoc,
          adapterLoc: domain.adaptation.adapterLoc,
          coreBranchDelta: domain.adaptation.coreBranchDelta,
          evidence: "thinDeclarationConstruction",
        },
        qualificationSegment: { status: "not-established", humanMinutes: null, adapterLoc: null },
        fullQualifiedCost: {
          status: "not-established",
          humanMinutes: null,
          userInputLoc: null,
          coreBranchDelta: domain.adaptation.coreBranchDelta,
        },
      },
    })
  })

  const automationEvidenceAuthority = AutomationComponentEvidenceAuthorityReportSchema.parse({
    schemaVersion: "skill-ir-automation-component-evidence-authority/v1",
    catalog: {
      path: catalogRelative,
      sha256: sha256Bytes(catalogBytes),
      schemaVersion: catalog.schemaVersion,
    },
    implementation: catalog.implementation,
    portfolioAuthority: catalog.portfolioAuthority,
    evidence: {
      sourceOnlyConstruction: sourceRef,
      thinDeclarationConstruction: thinRef,
      structuralExecution: structuralRef,
      jsonPointerConstruction: pointerRef,
      crossSkillDomainPlan: crossSkillRef,
      genericDomainRepair: repairRef,
      reviewRequiredClosure: reviewedRef,
    },
    derivationBoundary: {
      basePortfolioAutomationFieldsConsumed: false,
      basePortfolioAdaptationCostFieldsConsumed: false,
      candidatePresenceIsQualification: false,
      reviewRequiredClosureIsAutomatic: false,
    },
    costBoundary: catalog.costBoundary,
    costEvidence: {
      declarationHumanMinutes: cases.reduce(
        (sum, entry) => sum + entry.adaptation.declarationSegment.humanMinutes,
        0,
      ),
      physicalDeclarationLoc: cases.reduce(
        (sum, entry) => sum + entry.adaptation.declarationSegment.physicalDeclarationLoc,
        0,
      ),
      qualificationHumanMinutes: null,
      qualificationAdapterLoc: null,
      completeCases: 0,
      trend: "not-established",
    },
    cases,
    summary: {
      qualifiedMethodCases: 7,
      candidateCases: {
        generatesIr: 7,
        generatesContract: 7,
        generatesValidationPlan: 7,
        generatesPackageCandidate: 7,
      },
      authorityQualifiedCases: {
        generatesIr: 0,
        generatesContract: 0,
        generatesValidationPlan: 0,
        generatesPackageCandidate: 0,
      },
      completeFullQualifiedAdaptationCostCases: 0,
      lastThreeCoreBranchDeltaZero: cases.slice(-3)
        .every((entry) => entry.adaptation.fullQualifiedCost.coreBranchDelta === 0),
      fullQualificationTrend: "not-established",
      automationIncompleteSkills: cases.map((entry) => entry.skillId),
      automationAndAdaptationConverging: false,
    },
    accounting: { paidCalls: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0 },
  })

  const gates = {
    ...optimizationReadiness.gates,
    lastThreeCoreBranchDeltaZero: automationEvidenceAuthority.summary.lastThreeCoreBranchDeltaZero,
    automationAndAdaptationConverging:
      automationEvidenceAuthority.summary.automationAndAdaptationConverging,
  }
  return AuthoritativeAutomationReadinessV7Schema.parse({
    ...optimizationReadiness,
    schemaVersion: "skill-ir-method-portfolio-readiness/v7",
    passed: Object.values(gates).every(Boolean),
    gates,
    gaps: {
      ...optimizationReadiness.gaps,
      automationIncompleteSkills: automationEvidenceAuthority.summary.automationIncompleteSkills,
    },
    automationEvidenceAuthority,
  })
}

export async function writeAuthoritativeAutomationReadinessReport(input: {
  rootDir: string
  catalogPath: string
  outputPath: string
}): Promise<AuthoritativeAutomationReadinessV7> {
  const report = await readAndEvaluateAutomationComponentAuthority(input)
  const outputPath = path.resolve(input.outputPath)
  await mkdir(path.dirname(outputPath), { recursive: true })
  const temporary = `${outputPath}.tmp`
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  await rename(temporary, outputPath)
  return report
}
