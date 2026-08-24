import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { validateSkillIR } from "../../skill-ir/validate";
import {
  DomainAutomaticConstructionInputSchema,
  DomainAutomaticConstructionResultSchema,
  constructDomainSkillCandidates,
  type DomainAutomaticConstructionResult,
} from "./automatic-domain-construction";
import { sha256Bytes } from "./source-fixture";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const SafePathSchema = z.string().min(1).refine(
  (path) => !isAbsolute(path) && !/(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(path),
  { message: "path must remain relative and contained" },
);
const OracleRefSchema = z.object({
  path: SafePathSchema,
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict();
const ShadowOraclesSchema = z.object({
  contractPaths: z.array(OracleRefSchema),
  baseIrPaths: z.array(OracleRefSchema),
  validationPlanPaths: z.array(OracleRefSchema),
  packageManifestPaths: z.array(OracleRefSchema),
}).strict();

export const DomainAutomaticConstructionShadowCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-automatic-construction-shadow-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  cases: z.array(z.object({
    caseId: IdentifierSchema,
    methodSequence: z.number().int().positive(),
    generationInput: DomainAutomaticConstructionInputSchema,
    shadowOracles: ShadowOraclesSchema,
  }).strict()).min(1),
}).strict().superRefine((catalog, context) => {
  const caseIds = catalog.cases.map((entry) => entry.caseId);
  const sequences = catalog.cases.map((entry) => entry.methodSequence);
  if (new Set(caseIds).size !== caseIds.length) context.addIssue({ code: "custom", message: "case ids must be unique" });
  if (new Set(sequences).size !== sequences.length) context.addIssue({ code: "custom", message: "method sequences must be unique" });
});

const HumanGapSchema = DomainAutomaticConstructionResultSchema.shape.semanticAccounting.shape.stillRequiresHuman.element;
const SemanticAccountingSchema = DomainAutomaticConstructionResultSchema.shape.semanticAccounting;
const ComponentStatusSchema = z.object({
  status: z.enum(["compared", "manual-oracle-absent"]),
  manualCount: z.number().int().nonnegative(),
  schemaValidCount: z.number().int().nonnegative(),
  paths: z.array(SafePathSchema),
  sha256: z.array(z.string().regex(/^[0-9a-f]{64}$/u)),
}).strict();
const ManualComparisonSchema = z.object({
  contract: ComponentStatusSchema.extend({ declaredPathMatches: z.number().int().nonnegative() }).strict(),
  baseIr: ComponentStatusSchema.extend({
    inputIdMatches: z.number().int().nonnegative(),
    outputIdMatches: z.number().int().nonnegative(),
    checkIdMatches: z.number().int().nonnegative(),
    exactSourceRuleMatches: z.number().int().nonnegative(),
  }).strict(),
  validationPlan: ComponentStatusSchema,
  package: ComponentStatusSchema,
  semanticParity: z.literal("not-established"),
}).strict();
const EligibilitySchema = z.object({
  contract: z.literal(false),
  baseIr: z.literal(false),
  validationPlan: z.literal(false),
  packageCandidate: z.literal(false),
}).strict();
const CaseReportSchema = z.object({
  caseId: IdentifierSchema,
  methodSequence: z.number().int().positive(),
  candidateDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  generationReadPaths: z.tuple([SafePathSchema, SafePathSchema]),
  shadowReadPaths: z.array(SafePathSchema),
  adaptation: z.object({
    declarationStatus: z.enum(["within-limit", "declaration-heavy"]),
    declarationLoc: z.number().int().nonnegative(),
    declarationSemanticEntries: z.number().int().nonnegative(),
    declarationHumanMinutes: z.number().int().nonnegative(),
    declarationMeasurementStartedAt: z.string().datetime(),
    declarationMeasurementCompletedAt: z.string().datetime(),
    adapterLoc: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
  semanticAccounting: SemanticAccountingSchema,
  semanticGap: z.array(HumanGapSchema),
  manualComparison: ManualComparisonSchema,
  semanticParity: z.literal("not-established"),
  eligibility: EligibilitySchema,
}).strict();

export const DomainAutomaticConstructionShadowReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-automatic-construction-shadow-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  implementation: z.array(z.object({ path: SafePathSchema, sha256: z.string().regex(/^[0-9a-f]{64}$/u) }).strict()),
  candidateFreezeCompletedBeforeShadowRead: z.literal(true),
  generationFreeze: z.array(z.object({ caseId: IdentifierSchema, candidateDigest: z.string().regex(/^[0-9a-f]{64}$/u) }).strict()),
  cases: z.array(CaseReportSchema),
  summary: z.object({
    caseCount: z.number().int().positive(),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    declarations: z.object({
      withinLimit: z.number().int().nonnegative(),
      heavy: z.number().int().nonnegative(),
      locTotal: z.number().int().nonnegative(),
      semanticEntriesTotal: z.number().int().nonnegative(),
      humanMinutesTotal: z.number().int().nonnegative(),
    }).strict(),
    generated: z.object({
      contracts: z.number().int().nonnegative(),
      baseIrs: z.number().int().nonnegative(),
      validationPlans: z.number().int().nonnegative(),
      packageCandidates: z.number().int().nonnegative(),
    }).strict(),
    semanticAccounting: z.object({
      fromSkillSourceUnits: z.number().int().nonnegative(),
      fromTaskDeclarationUnits: z.number().int().nonnegative(),
      automationProducedBindings: z.number().int().nonnegative(),
      genericDeterministicPredicates: z.number().int().nonnegative(),
      domainRuntimeRequiredPredicates: z.number().int().nonnegative(),
      casesStillRequiringHuman: z.number().int().nonnegative(),
    }).strict(),
    portfolioEligible: z.object({
      contracts: z.literal(0),
      baseIrs: z.literal(0),
      validationPlans: z.literal(0),
      packageCandidates: z.literal(0),
    }).strict(),
  }).strict(),
}).strict();

export type DomainAutomaticConstructionShadowCatalog = z.input<typeof DomainAutomaticConstructionShadowCatalogSchema>;
export type DomainAutomaticConstructionShadowReport = z.infer<typeof DomainAutomaticConstructionShadowReportSchema>;

type LoadedComponent = {
  status: z.infer<typeof ComponentStatusSchema>;
  values: unknown[];
};

function containedPath(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, path);
  const fromRoot = relative(root, candidate);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    throw new Error(`shadow path escapes repository root: ${path}`);
  }
  return candidate;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeCandidate(outDir: string, caseId: string, candidate: DomainAutomaticConstructionResult): Promise<string> {
  const caseDir = join(outDir, "candidates", caseId);
  await mkdir(caseDir, { recursive: true });
  const resultText = jsonText(candidate);
  await Promise.all([
    writeFile(join(caseDir, "result.json"), resultText, "utf8"),
    writeFile(join(caseDir, "domain-contract.json"), jsonText(candidate.contract), "utf8"),
    writeFile(join(caseDir, "skill-ir.json"), jsonText(candidate.baseIr), "utf8"),
    writeFile(join(caseDir, "validation-plan.json"), jsonText(candidate.validationPlan), "utf8"),
    writeFile(join(caseDir, "package-candidate.json"), jsonText(candidate.packageCandidate), "utf8"),
  ]);
  return sha256Bytes(Buffer.from(resultText));
}

async function loadComponent(
  rootDir: string,
  refs: Array<z.infer<typeof OracleRefSchema>>,
  kind: "contract" | "baseIr" | "validationPlan" | "package",
): Promise<LoadedComponent> {
  if (refs.length === 0) {
    return {
      status: { status: "manual-oracle-absent", manualCount: 0, schemaValidCount: 0, paths: [], sha256: [] },
      values: [],
    };
  }
  const values: unknown[] = [];
  const digests: string[] = [];
  let schemaValidCount = 0;
  for (const ref of refs) {
    const bytes = await readFile(containedPath(rootDir, ref.path));
    const actualSha256 = sha256Bytes(bytes);
    if (actualSha256 !== ref.sha256) {
      throw new Error(`shadow oracle digest mismatch for ${ref.path}: expected ${ref.sha256}, got ${actualSha256}`);
    }
    digests.push(actualSha256);
    try {
      const value = JSON.parse(bytes.toString("utf8"));
      values.push(value);
      if (kind === "baseIr") {
        const parsed = SkillIRSchema.safeParse(value);
        if (parsed.success && validateSkillIR(parsed.data).errors.length === 0) schemaValidCount += 1;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        schemaValidCount += 1;
      }
    } catch {
      values.push(null);
    }
  }
  return {
    status: {
      status: "compared",
      manualCount: refs.length,
      schemaValidCount,
      paths: refs.map((ref) => ref.path),
      sha256: digests,
    },
    values,
  };
}

function collectStrings(value: unknown, strings: Set<string>): void {
  if (typeof value === "string") {
    strings.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, strings);
  } else if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) collectStrings(entry, strings);
  }
}

function matches(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
}

function manualComparison(
  candidate: DomainAutomaticConstructionResult,
  contract: LoadedComponent,
  baseIr: LoadedComponent,
  validationPlan: LoadedComponent,
  packageComponent: LoadedComponent,
): z.infer<typeof ManualComparisonSchema> {
  const contractStrings = new Set<string>();
  for (const value of contract.values) collectStrings(value, contractStrings);
  const manualIrs = baseIr.values.flatMap((value) => {
    const parsed = SkillIRSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const manualInputs = manualIrs.flatMap((ir) => ir.inputs.map((entry) => entry.id));
  const manualOutputs = manualIrs.flatMap((ir) => ir.outputs.map((entry) => entry.id));
  const manualChecks = manualIrs.flatMap((ir) => ir.checks.map((entry) => entry.id));
  const manualRuleTexts = new Set(manualIrs.flatMap((ir) => ir.rules.map((rule) => rule.sourceText)));
  const declaredPaths = [
    ...candidate.contract.inputs.map((entry) => entry.path),
    ...candidate.contract.outputs.map((entry) => entry.path),
  ];
  return ManualComparisonSchema.parse({
    contract: {
      ...contract.status,
      declaredPathMatches: declaredPaths.filter((path) => contractStrings.has(path)).length,
    },
    baseIr: {
      ...baseIr.status,
      inputIdMatches: matches(candidate.baseIr.inputs.map((entry) => entry.id), manualInputs),
      outputIdMatches: matches(candidate.baseIr.outputs.map((entry) => entry.id), manualOutputs),
      checkIdMatches: matches(candidate.baseIr.checks.map((entry) => entry.id), manualChecks),
      exactSourceRuleMatches: candidate.baseIr.rules.filter((rule) => manualRuleTexts.has(rule.sourceText)).length,
    },
    validationPlan: validationPlan.status,
    package: packageComponent.status,
    semanticParity: "not-established",
  });
}

function allOraclePaths(entry: z.infer<typeof DomainAutomaticConstructionShadowCatalogSchema>["cases"][number]): string[] {
  return [
    ...entry.shadowOracles.contractPaths,
    ...entry.shadowOracles.baseIrPaths,
    ...entry.shadowOracles.validationPlanPaths,
    ...entry.shadowOracles.packageManifestPaths,
  ].map((ref) => ref.path);
}

export async function runDomainAutomaticConstructionShadow(
  rootDir: string,
  rawCatalog: DomainAutomaticConstructionShadowCatalog,
  outDir: string,
  measurement: { measurementCompletedAt: string },
): Promise<DomainAutomaticConstructionShadowReport> {
  const catalog = DomainAutomaticConstructionShadowCatalogSchema.parse(rawCatalog);
  const completedAt = z.string().datetime().parse(measurement.measurementCompletedAt);
  if (Date.parse(completedAt) < Date.parse(catalog.measurementStartedAt)) {
    throw new Error("shadow measurement completion precedes start");
  }
  const orderedCases = [...catalog.cases].sort((left, right) => left.methodSequence - right.methodSequence);
  const generated = new Map<string, { candidate: DomainAutomaticConstructionResult; digest: string }>();
  await mkdir(outDir, { recursive: true });

  // Phase 1 completes for the full denominator before any manual oracle path is read.
  for (const entry of orderedCases) {
    const candidate = DomainAutomaticConstructionResultSchema.parse(
      await constructDomainSkillCandidates(rootDir, entry.generationInput),
    );
    const digest = await writeCandidate(outDir, entry.caseId, candidate);
    generated.set(entry.caseId, { candidate, digest });
  }

  const implementationDirectory = dirname(fileURLToPath(import.meta.url));
  const implementationNames = [
    "automatic-construction.ts",
    "automatic-domain-construction.ts",
    "automatic-domain-construction-shadow.ts",
    "automatic-domain-construction-shadow-run.ts",
  ] as const;
  const implementationBytes = await Promise.all(implementationNames.map((name) => readFile(join(implementationDirectory, name))));
  const coreSources = implementationBytes.slice(0, 2).map((bytes) => bytes.toString("utf8"));
  const implementation = implementationNames.map((name, index) => ({
    path: `src/benchmarks/skill-ir/${name}`,
    sha256: sha256Bytes(implementationBytes[index]!),
  }));
  const cases: Array<z.infer<typeof CaseReportSchema>> = [];

  // Phase 2 may now read the digest-pinned manual artifacts for comparison only.
  for (const entry of orderedCases) {
    for (const coreSource of coreSources) {
      if (coreSource.includes(entry.caseId)) {
        throw new Error(`automatic construction core contains case-specific id ${entry.caseId}`);
      }
    }
    const frozen = generated.get(entry.caseId)!;
    const [contract, baseIr, validationPlan, packageComponent] = await Promise.all([
      loadComponent(rootDir, entry.shadowOracles.contractPaths, "contract"),
      loadComponent(rootDir, entry.shadowOracles.baseIrPaths, "baseIr"),
      loadComponent(rootDir, entry.shadowOracles.validationPlanPaths, "validationPlan"),
      loadComponent(rootDir, entry.shadowOracles.packageManifestPaths, "package"),
    ]);
    const authoring = entry.generationInput.taskDescription.authoring;
    cases.push(CaseReportSchema.parse({
      caseId: entry.caseId,
      methodSequence: entry.methodSequence,
      candidateDigest: frozen.digest,
      generationReadPaths: frozen.candidate.audit.readPaths,
      shadowReadPaths: allOraclePaths(entry),
      adaptation: {
        declarationStatus: frozen.candidate.thinness.status,
        declarationLoc: frozen.candidate.thinness.loc,
        declarationSemanticEntries: frozen.candidate.thinness.semanticEntries,
        declarationHumanMinutes: authoring.humanMinutes,
        declarationMeasurementStartedAt: authoring.measurementStartedAt,
        declarationMeasurementCompletedAt: authoring.measurementCompletedAt,
        adapterLoc: 0,
        coreBranchDelta: 0,
      },
      semanticAccounting: frozen.candidate.semanticAccounting,
      semanticGap: frozen.candidate.semanticAccounting.stillRequiresHuman,
      manualComparison: manualComparison(frozen.candidate, contract, baseIr, validationPlan, packageComponent),
      semanticParity: "not-established",
      eligibility: { contract: false, baseIr: false, validationPlan: false, packageCandidate: false },
    }));
  }

  const sum = (selector: (entry: z.infer<typeof CaseReportSchema>) => number) => cases.reduce((total, entry) => total + selector(entry), 0);
  const report = DomainAutomaticConstructionShadowReportSchema.parse({
    schemaVersion: "skill-ir-domain-automatic-construction-shadow-report/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog))),
    measurementStartedAt: catalog.measurementStartedAt,
    measurementCompletedAt: completedAt,
    implementation,
    candidateFreezeCompletedBeforeShadowRead: true,
    generationFreeze: orderedCases.map((entry) => ({
      caseId: entry.caseId,
      candidateDigest: generated.get(entry.caseId)!.digest,
    })),
    cases,
    summary: {
      caseCount: cases.length,
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      declarations: {
        withinLimit: cases.filter((entry) => entry.adaptation.declarationStatus === "within-limit").length,
        heavy: cases.filter((entry) => entry.adaptation.declarationStatus === "declaration-heavy").length,
        locTotal: sum((entry) => entry.adaptation.declarationLoc),
        semanticEntriesTotal: sum((entry) => entry.adaptation.declarationSemanticEntries),
        humanMinutesTotal: sum((entry) => entry.adaptation.declarationHumanMinutes),
      },
      generated: { contracts: cases.length, baseIrs: cases.length, validationPlans: cases.length, packageCandidates: cases.length },
      semanticAccounting: {
        fromSkillSourceUnits: sum((entry) => entry.semanticAccounting.fromSkillSource.units.length),
        fromTaskDeclarationUnits: sum((entry) => entry.semanticAccounting.fromTaskDeclaration.units.length),
        automationProducedBindings: sum((entry) => entry.semanticAccounting.automationProduced.contractBindings
          + entry.semanticAccounting.automationProduced.irTaskAbiBindings
          + entry.semanticAccounting.automationProduced.validationPredicates),
        genericDeterministicPredicates: sum((entry) => entry.semanticAccounting.automationProduced.genericDeterministicPredicates),
        domainRuntimeRequiredPredicates: sum((entry) => entry.semanticAccounting.automationProduced.validationPredicates
          - entry.semanticAccounting.automationProduced.genericDeterministicPredicates),
        casesStillRequiringHuman: cases.filter((entry) => entry.semanticGap.length > 0).length,
      },
      portfolioEligible: { contracts: 0, baseIrs: 0, validationPlans: 0, packageCandidates: 0 },
    },
  });
  await writeFile(join(outDir, "report.json"), jsonText(report), "utf8");
  return report;
}
