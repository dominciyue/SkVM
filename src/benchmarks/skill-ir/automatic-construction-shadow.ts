import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { validateSkillIR } from "../../skill-ir/validate";
import {
  AutomaticConstructionInputSchema,
  AutomaticConstructionResultSchema,
  constructSkillCandidates,
  type AutomaticConstructionResult,
} from "./automatic-construction";
import { sha256Bytes } from "./source-fixture";
import { ValidatedArtifactManifestSchema } from "./validated-artifact-catalog";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const SafeOraclePathSchema = z.string().min(1).refine((path) => !isAbsolute(path) && !/(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(path), {
  message: "shadow oracle path must be a contained repository-relative path",
});
const OracleRefSchema = z.object({
  path: SafeOraclePathSchema,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const ShadowOraclesSchema = z.object({
  contractPaths: z.array(OracleRefSchema),
  baseIrPaths: z.array(OracleRefSchema),
  validationPlanPaths: z.array(OracleRefSchema),
  packageManifestPaths: z.array(OracleRefSchema),
}).strict();

export const AutomaticConstructionShadowCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-construction-shadow-catalog/v1"),
  catalogId: IdentifierSchema,
  measurementStartedAt: z.string().datetime(),
  cases: z.array(z.object({
    caseId: IdentifierSchema,
    methodSequence: z.number().int().positive(),
    generationInput: AutomaticConstructionInputSchema,
    shadowOracles: ShadowOraclesSchema,
  }).strict()).min(1),
}).strict().superRefine((catalog, ctx) => {
  const caseIds = new Set<string>();
  const sequences = new Set<number>();
  for (const [index, entry] of catalog.cases.entries()) {
    if (caseIds.has(entry.caseId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cases", index, "caseId"], message: `duplicate case id: ${entry.caseId}` });
    }
    if (sequences.has(entry.methodSequence)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cases", index, "methodSequence"], message: `duplicate method sequence: ${entry.methodSequence}` });
    }
    caseIds.add(entry.caseId);
    sequences.add(entry.methodSequence);
  }
});

const GapSchema = z.object({
  status: z.enum(["structural-valid", "semantic-review-required", "manual-oracle-absent"]),
  reason: z.string().min(1),
}).strict();

const ComponentShadowSchema = z.object({
  status: z.enum(["compared", "manual-oracle-absent"]),
  manualCount: z.number().int().nonnegative(),
  schemaValidCount: z.number().int().nonnegative(),
  paths: z.array(SafeOraclePathSchema),
  sha256: z.array(z.string().regex(/^[0-9a-f]{64}$/)),
  semanticParity: z.enum(["not-established", "not-applicable"]),
}).strict();

const GenerationFlagsSchema = z.object({
  contract: z.literal(true),
  baseIr: z.literal(true),
  validationPlan: z.literal(true),
  packageCandidate: z.literal(true),
}).strict();

const EligibilityFlagsSchema = z.object({
  contract: z.literal(false),
  baseIr: z.literal(false),
  validationPlan: z.literal(false),
  packageCandidate: z.literal(false),
}).strict();

const IrCountsSchema = z.object({
  steps: z.number().int().nonnegative(),
  rules: z.number().int().nonnegative(),
  outputs: z.number().int().nonnegative(),
}).strict();

const CaseReportSchema = z.object({
  caseId: IdentifierSchema,
  methodSequence: z.number().int().positive(),
  candidateDigest: z.string().regex(/^[0-9a-f]{64}$/),
  generationReadPaths: z.array(z.string().min(1)).length(1),
  shadowReadPaths: z.array(SafeOraclePathSchema),
  generated: GenerationFlagsSchema,
  portfolioEligible: EligibilityFlagsSchema,
  automaticStructure: z.object({
    steps: z.number().int().positive(),
    rules: z.number().int().nonnegative(),
    outputs: z.number().int().positive(),
    skillIrSchemaValid: z.literal(true),
    skillIrReferenceErrors: z.literal(0),
  }).strict(),
  baseIrComparison: z.object({
    automatic: IrCountsSchema,
    manual: IrCountsSchema.nullable(),
    exactSourceRuleMatches: z.number().int().nonnegative(),
    semanticParity: z.enum(["not-established", "not-applicable"]),
  }).strict(),
  shadow: z.object({
    contract: ComponentShadowSchema,
    baseIr: ComponentShadowSchema,
    validationPlan: ComponentShadowSchema,
    package: ComponentShadowSchema,
  }).strict(),
  contractGap: GapSchema,
  baseIrGap: GapSchema,
  validationPlanGap: GapSchema,
  packageGap: GapSchema,
  manualWorkRemaining: z.array(z.string().min(1)).min(1),
  adaptation: z.object({
    measurementStatus: z.literal("prospective-measured"),
    measurementStartedAt: z.string().datetime(),
    measurementCompletedAt: z.string().datetime(),
    humanMinutes: z.literal(0),
    humanMinutesBoundary: z.literal("case-specific generation adapter work after the shared core was available"),
    adapterLoc: z.literal(0),
    adapterLocBoundary: z.literal("case-specific executable or declarative transformation logic; shadow oracle registry excluded"),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict();

export const AutomaticConstructionShadowReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-construction-shadow-report/v1"),
  catalogId: IdentifierSchema,
  catalogSha256: z.string().regex(/^[0-9a-f]{64}$/),
  implementation: z.tuple([
    z.object({ path: z.literal("src/benchmarks/skill-ir/automatic-construction.ts"), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
    z.object({ path: z.literal("src/benchmarks/skill-ir/automatic-construction-shadow.ts"), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
    z.object({ path: z.literal("src/benchmarks/skill-ir/automatic-construction-shadow-run.ts"), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
  ]),
  candidateFreezeCompletedBeforeShadowRead: z.literal(true),
  cases: z.array(CaseReportSchema).min(1),
  summary: z.object({
    caseCount: z.number().int().positive(),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    generated: z.object({
      contracts: z.number().int().nonnegative(),
      baseIrs: z.number().int().nonnegative(),
      validationPlans: z.number().int().nonnegative(),
      packageCandidates: z.number().int().nonnegative(),
    }).strict(),
    portfolioEligible: z.object({
      contracts: z.number().int().nonnegative(),
      baseIrs: z.number().int().nonnegative(),
      validationPlans: z.number().int().nonnegative(),
      packageCandidates: z.number().int().nonnegative(),
    }).strict(),
    adaptationMeasurement: z.object({
      sharedCoreHumanMinutes: z.number().int().nonnegative(),
      caseSpecificHumanMinutesTotal: z.literal(0),
      caseSpecificAdapterLocTotal: z.literal(0),
      boundary: z.literal("shared-core elapsed development time is separate from zero per-case adapter activation cost"),
    }).strict(),
    casesRequiringHumanSemantics: z.number().int().nonnegative(),
    casesMissingAtLeastOneManualOracle: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type AutomaticConstructionShadowCatalog = z.infer<typeof AutomaticConstructionShadowCatalogSchema>;
export type AutomaticConstructionShadowReport = z.infer<typeof AutomaticConstructionShadowReportSchema>;

type MeasurementWindow = {
  measurementStartedAt: string;
  measurementCompletedAt: string;
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

async function writeCandidate(outDir: string, caseId: string, candidate: AutomaticConstructionResult): Promise<string> {
  const caseDir = join(outDir, "candidates", caseId);
  await mkdir(caseDir, { recursive: true });
  const resultText = jsonText(candidate);
  await writeFile(join(caseDir, "result.json"), resultText, "utf8");
  for (const artifact of candidate.packageCandidate.artifacts) {
    const target = join(caseDir, "package-candidate", artifact.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, artifact.content, "utf8");
  }
  return sha256Bytes(Buffer.from(resultText, "utf8"));
}

type OracleComponent = z.infer<typeof ComponentShadowSchema>;

async function readOracleComponent(
  rootDir: string,
  refs: Array<z.infer<typeof OracleRefSchema>>,
  kind: "contract" | "baseIr" | "validationPlan" | "package",
): Promise<OracleComponent> {
  if (refs.length === 0) {
    return {
      status: "manual-oracle-absent",
      manualCount: 0,
      schemaValidCount: 0,
      paths: [],
      sha256: [],
      semanticParity: "not-applicable",
    };
  }
  let schemaValidCount = 0;
  const digests: string[] = [];
  for (const ref of refs) {
    const bytes = await readFile(containedPath(rootDir, ref.path));
    const actualSha256 = sha256Bytes(bytes);
    if (actualSha256 !== ref.sha256) {
      throw new Error(`shadow oracle digest mismatch for ${ref.path}: expected ${ref.sha256}, got ${actualSha256}`);
    }
    digests.push(actualSha256);
    try {
      const value = JSON.parse(bytes.toString("utf8"));
      if (kind === "baseIr") {
        const parsed = SkillIRSchema.safeParse(value);
        if (parsed.success && validateSkillIR(parsed.data).errors.length === 0) schemaValidCount += 1;
      } else if (kind === "package") {
        if (ValidatedArtifactManifestSchema.safeParse(value).success) schemaValidCount += 1;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        schemaValidCount += 1;
      }
    } catch {
      // A malformed manual oracle remains visible as schemaValidCount < manualCount.
    }
  }
  return {
    status: "compared",
    manualCount: refs.length,
    schemaValidCount,
    paths: refs.map((ref) => ref.path),
    sha256: digests,
    semanticParity: "not-established",
  };
}

async function compareManualBaseIr(
  rootDir: string,
  refs: Array<z.infer<typeof OracleRefSchema>>,
  automatic: SkillIR,
): Promise<{
  automatic: z.infer<typeof IrCountsSchema>;
  manual: z.infer<typeof IrCountsSchema> | null;
  exactSourceRuleMatches: number;
  semanticParity: "not-established" | "not-applicable";
}> {
  const automaticCounts = {
    steps: automatic.steps.length,
    rules: automatic.rules.length,
    outputs: automatic.outputs.length,
  };
  if (refs.length === 0) {
    return {
      automatic: automaticCounts,
      manual: null,
      exactSourceRuleMatches: 0,
      semanticParity: "not-applicable",
    };
  }
  const manualIrs: SkillIR[] = [];
  for (const ref of refs) {
    const parsed = SkillIRSchema.safeParse(JSON.parse(await readFile(containedPath(rootDir, ref.path), "utf8")));
    if (parsed.success) manualIrs.push(parsed.data);
  }
  const automaticRuleTexts = new Set(automatic.rules.map((rule) => rule.sourceText));
  return {
    automatic: automaticCounts,
    manual: {
      steps: manualIrs.reduce((total, ir) => total + ir.steps.length, 0),
      rules: manualIrs.reduce((total, ir) => total + ir.rules.length, 0),
      outputs: manualIrs.reduce((total, ir) => total + ir.outputs.length, 0),
    },
    exactSourceRuleMatches: manualIrs.flatMap((ir) => ir.rules)
      .filter((rule) => automaticRuleTexts.has(rule.sourceText)).length,
    semanticParity: "not-established",
  };
}

function gapFor(component: "contract" | "baseIr" | "validationPlan" | "package", oracle: OracleComponent): z.infer<typeof GapSchema> {
  if (component === "package") {
    return {
      status: "semantic-review-required",
      reason: "automatic package is deliberately non-executable until a domain compiler and runtime checker are qualified",
    };
  }
  if (oracle.status === "manual-oracle-absent") {
    return {
      status: "manual-oracle-absent",
      reason: `no frozen manual ${component} oracle exists for shadow semantic comparison`,
    };
  }
  const reasons = {
    contract: "source-only contract lacks the benchmark task ABI and domain value semantics present in the frozen manual contract",
    baseIr: "automatic base IR is schema-valid and source-traced but lacks benchmark-specific entities, tool bindings, and runtime invariants",
    validationPlan: "automatic validation covers provenance and IR structure but does not implement the frozen domain scorer or runtime oracle",
    package: "automatic package is deliberately non-executable until a domain compiler and runtime checker are qualified",
  } as const;
  return { status: "semantic-review-required", reason: reasons[component] };
}

function allOraclePaths(entry: AutomaticConstructionShadowCatalog["cases"][number]): string[] {
  return [
    ...entry.shadowOracles.contractPaths,
    ...entry.shadowOracles.baseIrPaths,
    ...entry.shadowOracles.validationPlanPaths,
    ...entry.shadowOracles.packageManifestPaths,
  ].map((ref) => ref.path);
}

export async function runAutomaticConstructionShadow(
  rootDir: string,
  rawCatalog: AutomaticConstructionShadowCatalog,
  outDir: string,
  measurement: MeasurementWindow,
): Promise<AutomaticConstructionShadowReport> {
  const catalog = AutomaticConstructionShadowCatalogSchema.parse(rawCatalog);
  const measurementWindow = z.object({
    measurementStartedAt: z.string().datetime(),
    measurementCompletedAt: z.string().datetime(),
  }).parse(measurement);
  const orderedCases = [...catalog.cases].sort((left, right) => left.methodSequence - right.methodSequence);
  const generated = new Map<string, { candidate: AutomaticConstructionResult; digest: string }>();
  await mkdir(outDir, { recursive: true });

  // Phase 1 is deliberately complete before Phase 2 starts. This is the
  // mechanical boundary preventing manual artifacts from influencing generation.
  for (const entry of orderedCases) {
    const candidate = AutomaticConstructionResultSchema.parse(
      await constructSkillCandidates(rootDir, entry.generationInput),
    );
    const digest = await writeCandidate(outDir, entry.caseId, candidate);
    generated.set(entry.caseId, { candidate, digest });
  }

  const implementationDirectory = dirname(fileURLToPath(import.meta.url));
  const implementationNames = [
    "automatic-construction.ts",
    "automatic-construction-shadow.ts",
    "automatic-construction-shadow-run.ts",
  ] as const;
  const implementationBytes = await Promise.all(
    implementationNames.map((name) => readFile(join(implementationDirectory, name))),
  );
  const coreSource = implementationBytes[0]!.toString("utf8");
  const implementation = implementationNames.map((name, index) => ({
    path: `src/benchmarks/skill-ir/${name}`,
    sha256: sha256Bytes(implementationBytes[index]!),
  }));
  const cases: Array<z.infer<typeof CaseReportSchema>> = [];
  for (const entry of orderedCases) {
    const frozen = generated.get(entry.caseId)!;
    const [contractOracle, baseIrOracle, validationOracle, packageOracle] = await Promise.all([
      readOracleComponent(rootDir, entry.shadowOracles.contractPaths, "contract"),
      readOracleComponent(rootDir, entry.shadowOracles.baseIrPaths, "baseIr"),
      readOracleComponent(rootDir, entry.shadowOracles.validationPlanPaths, "validationPlan"),
      readOracleComponent(rootDir, entry.shadowOracles.packageManifestPaths, "package"),
    ]);
    const baseIrComparison = await compareManualBaseIr(
      rootDir,
      entry.shadowOracles.baseIrPaths,
      frozen.candidate.baseIr,
    );
    const referenceErrors = validateSkillIR(frozen.candidate.baseIr).errors;
    const branchCount = coreSource.split(entry.caseId).length - 1;
    if (branchCount !== 0) throw new Error(`automatic construction core contains case-specific id ${entry.caseId}`);
    cases.push(CaseReportSchema.parse({
      caseId: entry.caseId,
      methodSequence: entry.methodSequence,
      candidateDigest: frozen.digest,
      generationReadPaths: frozen.candidate.audit.readPaths,
      shadowReadPaths: allOraclePaths(entry),
      generated: { contract: true, baseIr: true, validationPlan: true, packageCandidate: true },
      portfolioEligible: { contract: false, baseIr: false, validationPlan: false, packageCandidate: false },
      automaticStructure: {
        steps: frozen.candidate.baseIr.steps.length,
        rules: frozen.candidate.baseIr.rules.length,
        outputs: frozen.candidate.baseIr.outputs.length,
        skillIrSchemaValid: true,
        skillIrReferenceErrors: referenceErrors.length,
      },
      baseIrComparison,
      shadow: {
        contract: contractOracle,
        baseIr: baseIrOracle,
        validationPlan: validationOracle,
        package: packageOracle,
      },
      contractGap: gapFor("contract", contractOracle),
      baseIrGap: gapFor("baseIr", baseIrOracle),
      validationPlanGap: gapFor("validationPlan", validationOracle),
      packageGap: gapFor("package", packageOracle),
      manualWorkRemaining: [
        "qualify the benchmark task input/output ABI against public evidence",
        "encode domain entities, invariants, tool bindings, and recovery semantics in the IR",
        "implement and freeze a domain runtime checker independent of model output",
        "compile an executable validated-artifact package and prove catalog/runtime parity",
      ],
      adaptation: {
        measurementStatus: "prospective-measured",
        ...measurementWindow,
        humanMinutes: 0,
        humanMinutesBoundary: "case-specific generation adapter work after the shared core was available",
        adapterLoc: 0,
        adapterLocBoundary: "case-specific executable or declarative transformation logic; shadow oracle registry excluded",
        coreBranchDelta: 0,
      },
    }));
  }
  const missingOracleCases = cases.filter((entry) => Object.values(entry.shadow).some((component) => component.status === "manual-oracle-absent")).length;
  const sharedCoreHumanMinutes = Math.ceil(Math.max(
    0,
    Date.parse(measurementWindow.measurementCompletedAt) - Date.parse(measurementWindow.measurementStartedAt),
  ) / 60_000);
  const report = AutomaticConstructionShadowReportSchema.parse({
    schemaVersion: "skill-ir-automatic-construction-shadow-report/v1",
    catalogId: catalog.catalogId,
    catalogSha256: sha256Bytes(Buffer.from(jsonText(catalog), "utf8")),
    implementation,
    candidateFreezeCompletedBeforeShadowRead: true,
    cases,
    summary: {
      caseCount: cases.length,
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      generated: {
        contracts: cases.length,
        baseIrs: cases.length,
        validationPlans: cases.length,
        packageCandidates: cases.length,
      },
      portfolioEligible: { contracts: 0, baseIrs: 0, validationPlans: 0, packageCandidates: 0 },
      adaptationMeasurement: {
        sharedCoreHumanMinutes,
        caseSpecificHumanMinutesTotal: 0,
        caseSpecificAdapterLocTotal: 0,
        boundary: "shared-core elapsed development time is separate from zero per-case adapter activation cost",
      },
      casesRequiringHumanSemantics: cases.length,
      casesMissingAtLeastOneManualOracle: missingOracleCases,
    },
  });
  await writeFile(join(outDir, "report.json"), jsonText(report), "utf8");
  return report;
}
