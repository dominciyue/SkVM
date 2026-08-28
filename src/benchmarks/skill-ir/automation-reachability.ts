import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { AutomaticConstructionShadowReportSchema } from "./automatic-construction-shadow.ts"
import { DomainAutomaticConstructionShadowReportSchema } from "./automatic-domain-construction-shadow.ts"
import { CrossSkillDomainPlanParityReportSchema } from "./automatic-domain-plan-cross-skill-parity.ts"
import { GenericDomainPlanRepairReportSchema } from "./automatic-domain-plan-generic-repair.ts"
import { AutomaticJsonPointerConstructionShadowReportSchema } from "./automatic-json-pointer-construction-shadow.ts"
import { AutomaticOutputConstructionShadowReportSchema } from "./automatic-output-construction-shadow.ts"
import { StructuralExecutionShadowReportSchema } from "./automatic-structural-execution-shadow.ts"
import {
  AuthoritativeMethodPortfolioReadinessReportV6Schema,
  MethodPortfolioAuthorityRegistryV5Schema,
  readAndEvaluateAuthoritativeMethodPortfolio,
} from "./method-portfolio-evidence-authority.ts"
import { MethodPortfolioSchema, evaluateMethodPortfolioReadiness } from "./method-portfolio.ts"
import { ReviewRequiredReportSchema } from "./review-required.ts"
import { sha256Bytes } from "./source-fixture.ts"

const IdentifierSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u)
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  const normalized = value.replaceAll("\\", "/")
  return !path.posix.isAbsolute(normalized)
    && !normalized.split("/").some((part) => part === "" || part === "." || part === "..")
}, "path must be repository-relative and traversal-free")
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const DigestRefSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()

export const AutomationReachabilityCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-automation-reachability-catalog/v1"),
  catalogId: IdentifierSchema,
  implementation: DigestRefSchema,
  portfolioAuthority: DigestRefSchema,
  evidence: z.object({
    sourceOnlyConstruction: DigestRefSchema,
    thinDeclarationConstruction: DigestRefSchema,
    structuralExecution: DigestRefSchema,
    outputConstruction: DigestRefSchema,
    jsonPointerConstruction: DigestRefSchema,
    crossSkillDomainPlan: DigestRefSchema,
    genericDomainRepair: DigestRefSchema,
    reviewRequiredClosure: DigestRefSchema,
  }).strict(),
}).strict()

const AutomationFlagsSchema = z.object({
  generatesIr: z.boolean(),
  generatesContract: z.boolean(),
  generatesValidationPlan: z.boolean(),
  generatesPackageCandidate: z.boolean(),
}).strict()

const CaseReachabilitySchema = z.object({
  skillId: IdentifierSchema,
  methodSequence: z.number().int().positive(),
  phenotype: IdentifierSchema,
  authoritativeClassification: z.enum([
    "not-established",
    "quality-positive",
    "efficiency-positive",
    "fidelity-preserving",
  ]),
  optimizedDevelopmentStatus: z.enum(["passed", "failed", "blocked", "invalidated", "not-run"]),
  automation: AutomationFlagsSchema,
  missingAutomationOutputs: z.array(z.enum([
    "ir",
    "contract",
    "validation-plan",
    "package-candidate",
  ])),
  adaptation: z.object({
    measurementStatus: z.enum(["historical-unavailable", "prospective-in-progress", "prospective-measured"]),
    humanMinutes: z.number().nonnegative().nullable(),
    adapterLoc: z.number().int().nonnegative().nullable(),
    coreBranchDelta: z.number().int().nonnegative().nullable(),
  }).strict(),
}).strict()

const FlagQualificationSchema = z.object({
  currentTrueCases: z.number().int().min(0).max(7),
  generatedCandidateCases: z.literal(7),
  semanticParityEstablishedCases: z.literal(0).optional(),
  authorityQualifiedCases: z.literal(0),
  honestPromotionNow: z.literal(false),
}).strict()

const TrendComparisonSchema = z.object({
  firstThreeMean: z.number().nonnegative(),
  lastThreeMean: z.number().nonnegative(),
  passes: z.boolean(),
}).strict()

export const AutomationReachabilityReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-automation-reachability-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: Sha256Schema,
  evidenceAuthority: z.object({
    implementation: DigestRefSchema,
    portfolioAuthority: DigestRefSchema,
    evidence: z.record(z.string(), DigestRefSchema),
  }).strict(),
  authority: z.object({
    readinessSchemaVersion: z.literal("skill-ir-method-portfolio-readiness/v6"),
    readinessPassed: z.literal(false),
    twoEvidenceQualifiedPhenotypes: z.literal(true),
    automationAndAdaptationConverging: z.literal(false),
  }).strict(),
  cases: z.array(CaseReachabilitySchema).length(7),
  currentGate: z.object({
    contractQualifiedCases: z.literal(7),
    minimumQualifiedCasesForMetrics: z.literal(6),
    requiresAllFourAutomationOutputsAndCompleteCost: z.literal(true),
    trendRule: z.literal("last-three-means-must-not-exceed-first-three-means"),
    automationIncompleteSkills: z.array(IdentifierSchema).length(7),
    missingAutomationOutputs: z.object({
      generatesIr: z.number().int().nonnegative(),
      generatesContract: z.number().int().nonnegative(),
      generatesValidationPlan: z.number().int().nonnegative(),
      generatesPackageCandidate: z.number().int().nonnegative(),
    }).strict(),
    adaptationEvidence: z.object({
      prospectiveMeasuredCases: z.number().int().nonnegative(),
      historicalUnavailableCases: z.number().int().nonnegative(),
      humanMinutesKnownCases: z.number().int().nonnegative(),
      adapterLocKnownCases: z.number().int().nonnegative(),
      firstThreeHumanMinutesMean: z.number().nonnegative().nullable(),
      firstThreeAdapterLocMean: z.number().nonnegative().nullable(),
      lastThreeHumanMinutesMean: z.number().nonnegative().nullable(),
      lastThreeAdapterLocMean: z.number().nonnegative().nullable(),
      trendComputable: z.boolean(),
    }).strict(),
  }).strict(),
  gateInterpretation: z.object({
    domainRuntimeIsDirectGateInput: z.literal(false),
    directInputs: z.tuple([
      z.literal("four-automation-booleans-per-qualified-case"),
      z.literal("non-null-human-minutes-and-adapter-loc"),
      z.literal("last-three-cost-means-not-above-first-three"),
    ]),
    currentPolicyRequiresDomainSemanticSufficiencyForFlagPromotion: z.literal(true),
    implication: z.literal("domain-parity-is-not-in-the-expression-but-current-policy-makes-it-indirect-qualification-evidence"),
  }).strict(),
  flagQualificationAuthority: z.object({
    currentPortfolioAuthority: z.object({
      automationFields: z.literal("self-declared-booleans"),
      adaptationFields: z.literal("self-declared-cost-values"),
      evidenceReferencesRequired: z.literal(false),
      canary: z.object({
        gateBefore: z.literal(false),
        gateAfterUnreferencedFieldEdits: z.literal(true),
        evidenceReferencesAdded: z.literal(0),
      }).strict(),
    }).strict(),
    sharedPolicy: z.object({
      status: z.literal("prose-only-not-component-separable"),
      requirements: z.tuple([
        z.literal("source-isolation"),
        z.literal("skill-ir-reference-validation"),
        z.literal("domain-semantic-sufficiency"),
        z.literal("catalog-runtime-package-parity-when-applicable"),
      ]),
    }).strict(),
    flags: z.object({
      generatesIr: FlagQualificationSchema.extend({
        manualOracleCases: z.number().int().min(0).max(7),
        exactSourceRuleMatches: z.number().int().nonnegative(),
      }).strict(),
      generatesContract: FlagQualificationSchema.extend({
        thinDeclarationCases: z.literal(7),
      }).strict(),
      generatesValidationPlan: FlagQualificationSchema.extend({
        realWorkdirCases: z.literal(7),
        exactManualComparisons: z.number().int().nonnegative(),
      }).strict(),
      generatesPackageCandidate: FlagQualificationSchema.omit({ semanticParityEstablishedCases: true }).extend({
        sourceOnlyNonExecutableCases: z.literal(7),
        completeConstructionCases: z.literal(0),
      }).strict(),
    }).strict(),
  }).strict(),
  costReachability: z.object({
    thinDeclarations: z.object({
      totalHumanMinutes: z.literal(15),
      totalDeclarationLoc: z.literal(159),
      cases: z.array(z.object({
        skillId: IdentifierSchema,
        humanMinutes: z.number().int().nonnegative(),
        declarationLoc: z.number().int().positive(),
        adapterLoc: z.number().int().nonnegative(),
      }).strict()).length(7),
    }).strict(),
    otherMeasuredWork: z.object({
      sourceOnlySharedCoreHumanMinutes: z.literal(28),
      structuralParityHumanMinutes: z.literal(3),
      structuralParityCatalogLoc: z.literal(297),
      partialOutputHumanMinutes: z.literal(8),
      partialOutputPreMeasurementCoreWork: z.literal("not-measured"),
      jsonPointerHumanMinutes: z.literal(20),
      jsonPointerPreMeasurementCoreWork: z.literal("not-measured"),
      envReviewHumanMinutes: z.literal(8),
      envReviewPatchLoc: z.literal(125),
    }).strict(),
    closure: z.object({
      historicalNullsMayBeBackfilled: z.literal(false),
      thinDeclarationSegmentReusable: z.literal(true),
      fullQualifiedAdaptationCostCompleteCases: z.literal(0),
      casesRequiringProspectiveQualificationMeasurement: z.literal(7),
      measuredScopesMayBeSummed: z.literal(false),
    }).strict(),
    trend: z.object({
      currentPortfolio: z.literal("not-computable"),
      thinDeclarationHumanMinutes: TrendComparisonSchema,
      declaredAdapterLocOnly: TrendComparisonSchema,
      declarationLocAsUserEffort: TrendComparisonSchema,
      fullQualificationTrend: z.literal("not-established"),
      verdict: z.literal("metric-boundary-dependent-and-not-yet-claimable"),
    }).strict(),
  }).strict(),
  guardrailContext: z.object({
    domainRuntimeRequiredPredicates: z.literal(21),
    projectionQueryUnresolvedFloor: z.literal(10),
    crossSkillAutomaticFullPassingCases: z.literal(0),
    envAutomaticPassedCriteria: z.literal(3),
    envReviewedPassedCriteria: z.literal(6),
    reviewChangedAutomationEligibility: z.literal(false),
    role: z.literal("product-boundary-context-not-direct-gate-input"),
  }).strict(),
  decisions: z.object({
    promoteCurrentAutomationFlags: z.literal("no-go"),
    attackCurrentGateAsWritten: z.literal("no-go"),
    phase3AReadinessAttack: z.literal("conditional-go"),
    phase3BCloseout: z.literal("go"),
    attackConditions: z.tuple([
      z.literal("freeze-evidence-bound-component-flag-authority"),
      z.literal("decide-structure-existence-versus-semantic-eligibility"),
      z.literal("freeze-adaptation-cost-boundary-including-declaration-effort"),
      z.literal("prospectively-measure-seven-qualified-case-adaptations"),
      z.literal("recompute-convergence-with-zero-core-branch-delta"),
    ]),
    unresolvedProposition: z.literal("attack-readiness-or-close-out"),
    stopBoundary: z.literal("user-decision-required-before-phase-3"),
  }).strict(),
  phase2Accounting: z.object({
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    priorEvidencePaidCallsDisclosed: z.number().int().nonnegative(),
  }).strict(),
}).strict().superRefine((report, context) => {
  if (Object.values(report.flagQualificationAuthority.flags).some((entry) => entry.authorityQualifiedCases !== 0)) {
    context.addIssue({ code: "custom", message: "current evidence cannot qualify an automation flag" })
  }
  if (report.costReachability.trend.fullQualificationTrend !== "not-established"
    || report.costReachability.closure.fullQualifiedAdaptationCostCompleteCases !== 0) {
    context.addIssue({ code: "custom", message: "full qualification cost trend is not established" })
  }
})

export type AutomationReachabilityReport = z.infer<typeof AutomationReachabilityReportSchema>

function containedPath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir)
  const candidate = path.resolve(root, ...SafeRelativePathSchema.parse(relativePath).split("/"))
  const fromRoot = path.relative(root, candidate)
  if (fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error(`path escapes repository root: ${relativePath}`)
  }
  return candidate
}

async function readRegularFile(absolutePath: string, label: string): Promise<Buffer> {
  const stat = await lstat(absolutePath)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`)
  return readFile(absolutePath)
}

async function readPinned(rootDir: string, reference: z.infer<typeof DigestRefSchema>, label: string): Promise<Buffer> {
  const bytes = await readRegularFile(containedPath(rootDir, reference.path), label)
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

function meanOrNull(values: Array<number | null>): number | null {
  const complete = values.filter((value): value is number => value !== null)
  if (complete.length === 0 || complete.length !== values.length) return null
  return complete.reduce((sum, value) => sum + value, 0) / complete.length
}

export async function readAndEvaluateAutomationReachability(input: {
  rootDir: string
  catalogPath: string
}): Promise<AutomationReachabilityReport> {
  const rootDir = path.resolve(input.rootDir)
  const catalogBytes = await readRegularFile(path.resolve(input.catalogPath), "automation reachability catalog")
  const catalog = AutomationReachabilityCatalogSchema.parse(parseJson(catalogBytes, "automation reachability catalog"))

  await readPinned(rootDir, catalog.implementation, "automation reachability implementation")
  const registryBytes = await readPinned(rootDir, catalog.portfolioAuthority, "portfolio authority")
  const registry = MethodPortfolioAuthorityRegistryV5Schema.parse(parseJson(registryBytes, "portfolio authority"))
  const portfolioBytes = await readPinned(rootDir, registry.basePortfolio, "base method portfolio")
  const portfolio = MethodPortfolioSchema.parse(parseJson(portfolioBytes, "base method portfolio"))
  const readiness = AuthoritativeMethodPortfolioReadinessReportV6Schema.parse(
    await readAndEvaluateAuthoritativeMethodPortfolio({
      rootDir,
      portfolioPath: containedPath(rootDir, catalog.portfolioAuthority.path),
    }),
  )

  const evidenceBytes = Object.fromEntries(await Promise.all(
    Object.entries(catalog.evidence).map(async ([key, reference]) => [
      key,
      await readPinned(rootDir, reference, key),
    ]),
  )) as Record<keyof typeof catalog.evidence, Buffer>
  const sourceOnly = AutomaticConstructionShadowReportSchema.parse(parseJson(
    evidenceBytes.sourceOnlyConstruction,
    "source-only construction report",
  ))
  const thinDeclaration = DomainAutomaticConstructionShadowReportSchema.parse(parseJson(
    evidenceBytes.thinDeclarationConstruction,
    "thin declaration construction report",
  ))
  const structural = StructuralExecutionShadowReportSchema.parse(parseJson(
    evidenceBytes.structuralExecution,
    "structural execution report",
  ))
  const output = AutomaticOutputConstructionShadowReportSchema.parse(parseJson(
    evidenceBytes.outputConstruction,
    "output construction report",
  ))
  const pointer = AutomaticJsonPointerConstructionShadowReportSchema.parse(parseJson(
    evidenceBytes.jsonPointerConstruction,
    "JSON pointer construction report",
  ))
  const crossSkill = CrossSkillDomainPlanParityReportSchema.parse(parseJson(
    evidenceBytes.crossSkillDomainPlan,
    "cross-skill domain plan report",
  ))
  const repair = GenericDomainPlanRepairReportSchema.parse(parseJson(
    evidenceBytes.genericDomainRepair,
    "generic domain repair report",
  ))
  const reviewed = ReviewRequiredReportSchema.parse(parseJson(
    evidenceBytes.reviewRequiredClosure,
    "review-required closure report",
  ))

  if (readiness.passed
    || !readiness.gates.twoEvidenceQualifiedPhenotypes
    || readiness.gates.automationAndAdaptationConverging
    || readiness.gaps.automationIncompleteSkills.length !== 7) {
    throw new Error("current readiness no longer matches the Phase 2 reachability boundary")
  }

  const classificationBySkill = new Map(readiness.evidenceAuthority.cases.map((entry) => [
    entry.skillId,
    entry.classification,
  ]))
  const qualified = portfolio.cases
    .filter((entry) => entry.role === "method-development" && entry.contractQualified)
    .sort((left, right) => left.methodSequence! - right.methodSequence!)
  if (qualified.length !== 7) throw new Error(`expected seven qualified method cases, got ${qualified.length}`)

  const cases = qualified.map((entry) => {
    const missingAutomationOutputs = [
      ...(!entry.automation.generatesIr ? ["ir" as const] : []),
      ...(!entry.automation.generatesContract ? ["contract" as const] : []),
      ...(!entry.automation.generatesValidationPlan ? ["validation-plan" as const] : []),
      ...(!entry.automation.generatesPackageCandidate ? ["package-candidate" as const] : []),
    ]
    const authoritativeClassification = classificationBySkill.get(entry.skillId) ?? "not-established"
    return {
      skillId: entry.skillId,
      methodSequence: entry.methodSequence!,
      phenotype: entry.phenotypes[0]!,
      authoritativeClassification,
      optimizedDevelopmentStatus: entry.lifecycle.optimizedDevelopment.status,
      automation: entry.automation,
      missingAutomationOutputs,
      adaptation: {
        measurementStatus: entry.adaptation.measurementStatus,
        humanMinutes: entry.adaptation.humanMinutes,
        adapterLoc: entry.adaptation.adapterLoc,
        coreBranchDelta: entry.adaptation.coreBranchDelta,
      },
    }
  })
  const firstThree = qualified.slice(0, 3)
  const lastThree = qualified.slice(-3)
  const firstHuman = meanOrNull(firstThree.map((entry) => entry.adaptation.humanMinutes))
  const firstLoc = meanOrNull(firstThree.map((entry) => entry.adaptation.adapterLoc))
  const lastHuman = meanOrNull(lastThree.map((entry) => entry.adaptation.humanMinutes))
  const lastLoc = meanOrNull(lastThree.map((entry) => entry.adaptation.adapterLoc))

  const unreferencedPromotionDraft = structuredClone(portfolio)
  for (const entry of unreferencedPromotionDraft.cases.filter((candidate) =>
    candidate.role === "method-development" && candidate.contractQualified)) {
    entry.automation = {
      generatesIr: true,
      generatesContract: true,
      generatesValidationPlan: true,
      generatesPackageCandidate: true,
    }
    const sequence = entry.methodSequence!
    entry.adaptation.humanMinutes = 300 - sequence * 20
    entry.adaptation.adapterLoc = 100 - sequence * 5
  }
  const unreferencedPromotionCanary = MethodPortfolioSchema.parse(unreferencedPromotionDraft)
  const gateBefore = evaluateMethodPortfolioReadiness(portfolio).gates.automationAndAdaptationConverging
  const gateAfter = evaluateMethodPortfolioReadiness(unreferencedPromotionCanary)
    .gates.automationAndAdaptationConverging

  const thinCases = [...thinDeclaration.cases]
    .sort((left, right) => left.methodSequence - right.methodSequence)
  const thinFirstThree = thinCases.slice(0, 3)
  const thinLastThree = thinCases.slice(-3)
  const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length
  const thinHumanFirst = average(thinFirstThree.map((entry) => entry.adaptation.declarationHumanMinutes))
  const thinHumanLast = average(thinLastThree.map((entry) => entry.adaptation.declarationHumanMinutes))
  const thinAdapterFirst = average(thinFirstThree.map((entry) => entry.adaptation.adapterLoc))
  const thinAdapterLast = average(thinLastThree.map((entry) => entry.adaptation.adapterLoc))
  const declarationLocFirst = average(thinFirstThree.map((entry) => entry.adaptation.declarationLoc))
  const declarationLocLast = average(thinLastThree.map((entry) => entry.adaptation.declarationLoc))

  const eligibilityCount = (selector: (entry: typeof thinCases[number]) => boolean): number =>
    thinCases.filter(selector).length
  const manualBaseIrCases = thinCases.filter((entry) => entry.manualComparison.baseIr.status === "compared").length
  const exactSourceRuleMatches = thinCases.reduce(
    (sum, entry) => sum + entry.manualComparison.baseIr.exactSourceRuleMatches,
    0,
  )

  return AutomationReachabilityReportSchema.parse({
    schemaVersion: "skill-ir-automation-reachability-report/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(catalogBytes),
    evidenceAuthority: {
      implementation: catalog.implementation,
      portfolioAuthority: catalog.portfolioAuthority,
      evidence: catalog.evidence,
    },
    authority: {
      readinessSchemaVersion: readiness.schemaVersion,
      readinessPassed: readiness.passed,
      twoEvidenceQualifiedPhenotypes: readiness.gates.twoEvidenceQualifiedPhenotypes,
      automationAndAdaptationConverging: readiness.gates.automationAndAdaptationConverging,
    },
    cases,
    currentGate: {
      contractQualifiedCases: qualified.length,
      minimumQualifiedCasesForMetrics: 6,
      requiresAllFourAutomationOutputsAndCompleteCost: true,
      trendRule: "last-three-means-must-not-exceed-first-three-means",
      automationIncompleteSkills: readiness.gaps.automationIncompleteSkills,
      missingAutomationOutputs: {
        generatesIr: qualified.filter((entry) => !entry.automation.generatesIr).length,
        generatesContract: qualified.filter((entry) => !entry.automation.generatesContract).length,
        generatesValidationPlan: qualified.filter((entry) => !entry.automation.generatesValidationPlan).length,
        generatesPackageCandidate: qualified.filter((entry) => !entry.automation.generatesPackageCandidate).length,
      },
      adaptationEvidence: {
        prospectiveMeasuredCases: qualified.filter((entry) => entry.adaptation.measurementStatus === "prospective-measured").length,
        historicalUnavailableCases: qualified.filter((entry) => entry.adaptation.measurementStatus === "historical-unavailable").length,
        humanMinutesKnownCases: qualified.filter((entry) => entry.adaptation.humanMinutes !== null).length,
        adapterLocKnownCases: qualified.filter((entry) => entry.adaptation.adapterLoc !== null).length,
        firstThreeHumanMinutesMean: firstHuman,
        firstThreeAdapterLocMean: firstLoc,
        lastThreeHumanMinutesMean: lastHuman,
        lastThreeAdapterLocMean: lastLoc,
        trendComputable: [firstHuman, firstLoc, lastHuman, lastLoc].every((value) => value !== null),
      },
    },
    gateInterpretation: {
      domainRuntimeIsDirectGateInput: false,
      directInputs: [
        "four-automation-booleans-per-qualified-case",
        "non-null-human-minutes-and-adapter-loc",
        "last-three-cost-means-not-above-first-three",
      ],
      currentPolicyRequiresDomainSemanticSufficiencyForFlagPromotion: true,
      implication: "domain-parity-is-not-in-the-expression-but-current-policy-makes-it-indirect-qualification-evidence",
    },
    flagQualificationAuthority: {
      currentPortfolioAuthority: {
        automationFields: "self-declared-booleans",
        adaptationFields: "self-declared-cost-values",
        evidenceReferencesRequired: false,
        canary: {
          gateBefore,
          gateAfterUnreferencedFieldEdits: gateAfter,
          evidenceReferencesAdded: 0,
        },
      },
      sharedPolicy: {
        status: "prose-only-not-component-separable",
        requirements: [
          "source-isolation",
          "skill-ir-reference-validation",
          "domain-semantic-sufficiency",
          "catalog-runtime-package-parity-when-applicable",
        ],
      },
      flags: {
        generatesIr: {
          currentTrueCases: qualified.filter((entry) => entry.automation.generatesIr).length,
          generatedCandidateCases: sourceOnly.summary.generated.baseIrs,
          manualOracleCases: manualBaseIrCases,
          exactSourceRuleMatches,
          semanticParityEstablishedCases: thinCases.filter((entry) => entry.semanticParity !== "not-established").length,
          authorityQualifiedCases: eligibilityCount((entry) => entry.eligibility.baseIr),
          honestPromotionNow: false,
        },
        generatesContract: {
          currentTrueCases: qualified.filter((entry) => entry.automation.generatesContract).length,
          generatedCandidateCases: sourceOnly.summary.generated.contracts,
          thinDeclarationCases: thinDeclaration.summary.declarations.withinLimit,
          semanticParityEstablishedCases: thinCases.filter((entry) => entry.semanticParity !== "not-established").length,
          authorityQualifiedCases: eligibilityCount((entry) => entry.eligibility.contract),
          honestPromotionNow: false,
        },
        generatesValidationPlan: {
          currentTrueCases: qualified.filter((entry) => entry.automation.generatesValidationPlan).length,
          generatedCandidateCases: sourceOnly.summary.generated.validationPlans,
          realWorkdirCases: structural.summary.casesWithPassingStructuralBaseline,
          exactManualComparisons: structural.summary.exactManualComparisonsEstablished,
          semanticParityEstablishedCases: thinCases.filter((entry) => entry.semanticParity !== "not-established").length,
          authorityQualifiedCases: eligibilityCount((entry) => entry.eligibility.validationPlan),
          honestPromotionNow: false,
        },
        generatesPackageCandidate: {
          currentTrueCases: qualified.filter((entry) => entry.automation.generatesPackageCandidate).length,
          generatedCandidateCases: sourceOnly.summary.generated.packageCandidates,
          sourceOnlyNonExecutableCases: sourceOnly.summary.generated.packageCandidates
            - sourceOnly.summary.portfolioEligible.packageCandidates,
          completeConstructionCases: pointer.summary.completeConstructionCases,
          authorityQualifiedCases: eligibilityCount((entry) => entry.eligibility.packageCandidate),
          honestPromotionNow: false,
        },
      },
    },
    costReachability: {
      thinDeclarations: {
        totalHumanMinutes: thinDeclaration.summary.declarations.humanMinutesTotal,
        totalDeclarationLoc: thinDeclaration.summary.declarations.locTotal,
        cases: thinCases.map((entry) => ({
          skillId: entry.caseId,
          humanMinutes: entry.adaptation.declarationHumanMinutes,
          declarationLoc: entry.adaptation.declarationLoc,
          adapterLoc: entry.adaptation.adapterLoc,
        })),
      },
      otherMeasuredWork: {
        sourceOnlySharedCoreHumanMinutes: sourceOnly.summary.adaptationMeasurement.sharedCoreHumanMinutes,
        structuralParityHumanMinutes: structural.adapterAccounting.humanMinutes,
        structuralParityCatalogLoc: structural.adapterAccounting.parityCatalogLoc,
        partialOutputHumanMinutes: output.costAccounting.meteredHumanMinutes,
        partialOutputPreMeasurementCoreWork: output.costAccounting.preMeasurementCoreWork,
        jsonPointerHumanMinutes: pointer.declarationAccounting.meteredHumanMinutes,
        jsonPointerPreMeasurementCoreWork: pointer.declarationAccounting.preMeasurementCoreWork,
        envReviewHumanMinutes: reviewed.patch.humanMinutes,
        envReviewPatchLoc: reviewed.patch.physicalLoc,
      },
      closure: {
        historicalNullsMayBeBackfilled: false,
        thinDeclarationSegmentReusable: true,
        fullQualifiedAdaptationCostCompleteCases: thinCases.filter((entry) =>
          Object.values(entry.eligibility).every(Boolean)).length,
        casesRequiringProspectiveQualificationMeasurement: thinCases.filter((entry) =>
          !Object.values(entry.eligibility).every(Boolean)).length,
        measuredScopesMayBeSummed: false,
      },
      trend: {
        currentPortfolio: "not-computable",
        thinDeclarationHumanMinutes: {
          firstThreeMean: thinHumanFirst,
          lastThreeMean: thinHumanLast,
          passes: thinHumanLast <= thinHumanFirst,
        },
        declaredAdapterLocOnly: {
          firstThreeMean: thinAdapterFirst,
          lastThreeMean: thinAdapterLast,
          passes: thinAdapterLast <= thinAdapterFirst,
        },
        declarationLocAsUserEffort: {
          firstThreeMean: declarationLocFirst,
          lastThreeMean: declarationLocLast,
          passes: declarationLocLast <= declarationLocFirst,
        },
        fullQualificationTrend: "not-established",
        verdict: "metric-boundary-dependent-and-not-yet-claimable",
      },
    },
    guardrailContext: {
      domainRuntimeRequiredPredicates: thinDeclaration.summary.semanticAccounting.domainRuntimeRequiredPredicates,
      projectionQueryUnresolvedFloor: pointer.ceiling.theoreticalProjectionQueryUnresolvedFloor,
      crossSkillAutomaticFullPassingCases: crossSkill.semanticParity.fullyPassingSkillCount,
      envAutomaticPassedCriteria: repair.parity?.summary.postPlanPassedCriteria ?? 0,
      envReviewedPassedCriteria: reviewed.reviewed.summary.passedCriteria,
      reviewChangedAutomationEligibility: reviewed.automationEligibilityChanged,
      role: "product-boundary-context-not-direct-gate-input",
    },
    decisions: {
      promoteCurrentAutomationFlags: "no-go",
      attackCurrentGateAsWritten: "no-go",
      phase3AReadinessAttack: "conditional-go",
      phase3BCloseout: "go",
      attackConditions: [
        "freeze-evidence-bound-component-flag-authority",
        "decide-structure-existence-versus-semantic-eligibility",
        "freeze-adaptation-cost-boundary-including-declaration-effort",
        "prospectively-measure-seven-qualified-case-adaptations",
        "recompute-convergence-with-zero-core-branch-delta",
      ],
      unresolvedProposition: "attack-readiness-or-close-out",
      stopBoundary: "user-decision-required-before-phase-3",
    },
    phase2Accounting: {
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      priorEvidencePaidCallsDisclosed: crossSkill.summary.paidCalls + repair.summary.paidCalls,
    },
  })
}

export async function writeAutomationReachabilityReport(input: {
  rootDir: string
  catalogPath: string
  outputPath: string
}): Promise<AutomationReachabilityReport> {
  const report = await readAndEvaluateAutomationReachability(input)
  const outputPath = path.resolve(input.outputPath)
  await mkdir(path.dirname(outputPath), { recursive: true })
  const temporary = `${outputPath}.tmp`
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  await rename(temporary, outputPath)
  return report
}
