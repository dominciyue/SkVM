import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY = "skill-ir-public-structure-offline-family-contract-development-001" as const;

export const FAMILY_NECESSARY_CRITERION_IDS = [
  "public-input-structure",
  "explicit-output-responsibility",
  "offline-deterministic-transformation",
  "public-verification-contract",
  "declared-dependency-closure",
  "bounded-side-effects",
  "no-unbound-semantic-decision",
] as const;

export const FamilyNecessaryCriterionIdSchema = z.enum(FAMILY_NECESSARY_CRITERION_IDS);

const EvidenceIdSchema = z.string().min(1).regex(/^[a-z0-9][a-z0-9._/-]*$/u);
const MissingEvidenceSchema = z.string().min(1);

function evidenceFactSchema<T extends readonly [string, ...string[]]>(statuses: T) {
  return z.object({
    status: z.enum(statuses),
    evidenceIds: z.array(EvidenceIdSchema),
    missingEvidence: z.array(MissingEvidenceSchema),
  }).strict().superRefine((value, context) => {
    if (value.status === "unknown") {
      if (value.missingEvidence.length === 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "unknown fact must name missing evidence", path: ["missingEvidence"] });
      }
      return;
    }
    if (value.evidenceIds.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "determinate fact must cite evidence", path: ["evidenceIds"] });
    }
  });
}

export const CriterionAssessmentSchema = z.object({
  criterionId: FamilyNecessaryCriterionIdSchema,
  status: z.enum(["satisfied", "unsatisfied", "unknown"]),
  evidenceIds: z.array(EvidenceIdSchema),
  missingEvidence: z.array(MissingEvidenceSchema),
}).strict().superRefine((value, context) => {
  if (value.status === "unknown" && value.missingEvidence.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unknown criterion must name missing evidence", path: ["missingEvidence"] });
  } else if (value.status !== "unknown" && value.evidenceIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "determinate criterion must cite evidence", path: ["evidenceIds"] });
  }
});

export const EvidenceBasisSchema = evidenceFactSchema(["sufficient", "insufficient", "unknown"] as const);
export const DependencyClosureStatusSchema = z.enum(["closed", "open", "unknown"]);
export const SourceValidityStatusSchema = z.enum(["valid", "advisory", "blocked", "unknown"]);
export const DependencyClosureInputSchema = evidenceFactSchema(DependencyClosureStatusSchema.options);
export const SourceValidityInputSchema = evidenceFactSchema(SourceValidityStatusSchema.options);
export const SemanticChoiceInputSchema = evidenceFactSchema(["none", "explicit-parameters", "unbound", "unknown"] as const);
export const ExecutionLimitInputSchema = evidenceFactSchema(["none", "environment-limited", "implementation-failed", "unknown"] as const);

export const RequiredCapabilitySchema = z.object({
  capabilityId: z.string().min(1),
  implementation: z.enum(["implemented", "missing", "unknown"]),
  validation: z.enum(["current-tested", "historical-only", "untested", "unknown"]),
  supportsNewInputs: z.boolean().nullable(),
  evidenceIds: z.array(EvidenceIdSchema).min(1),
}).strict();

export const FamilyResponsibilityInputSchema = z.object({
  responsibilityId: z.string().min(1),
  skillId: z.string().min(1),
  description: z.string().min(1),
  completeScope: z.literal(true),
  dependsOnResponsibilityIds: z.array(z.string().min(1)),
  criterionAssessments: z.array(CriterionAssessmentSchema),
  verificationBasis: EvidenceBasisSchema,
  constructionBasis: EvidenceBasisSchema,
  dependencyClosure: DependencyClosureInputSchema,
  sourceValidity: SourceValidityInputSchema,
  remainingSemanticChoices: SemanticChoiceInputSchema,
  executionLimit: ExecutionLimitInputSchema,
  requiredCapabilities: z.array(RequiredCapabilitySchema),
}).strict().superRefine((value, context) => {
  const actual = value.criterionAssessments.map((entry) => entry.criterionId);
  const duplicate = actual.find((criterionId, index) => actual.indexOf(criterionId) !== index);
  if (duplicate) context.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate family criterion: ${duplicate}`, path: ["criterionAssessments"] });
  const missing = FAMILY_NECESSARY_CRITERION_IDS.filter((criterionId) => !actual.includes(criterionId));
  const extra = actual.filter((criterionId) => !FAMILY_NECESSARY_CRITERION_IDS.includes(criterionId));
  if (missing.length > 0 || extra.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `family criterion coverage mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`, path: ["criterionAssessments"] });
  }
  if (new Set(value.dependsOnResponsibilityIds).size !== value.dependsOnResponsibilityIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate responsibility dependency", path: ["dependsOnResponsibilityIds"] });
  }
  const capabilityIds = value.requiredCapabilities.map((entry) => entry.capabilityId);
  if (new Set(capabilityIds).size !== capabilityIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate required capability", path: ["requiredCapabilities"] });
  }
});

export const FamilyMembershipSchema = z.enum(["in-family", "out-of-family", "family-membership-unknown"]);
export const VerifiabilitySchema = z.enum(["verifiable", "not-verifiable", "unknown"]);
export const ConstructibilitySchema = z.enum(["constructible", "not-constructible", "unknown"]);
export const CurrentSupportSchema = z.enum(["supported", "missing", "not-assessable", "not-applicable"]);
export const FailureAttributionSchema = z.enum([
  "rule-insufficient",
  "verification-evidence-missing",
  "construction-evidence-missing",
  "capability-missing",
  "source-defect",
  "dependency-open",
  "external-semantic-decision",
  "environment-limit",
  "implementation-failure",
]);

const FAILURE_ORDER = FailureAttributionSchema.options;

export const FamilyResponsibilityAssessmentSchema = z.object({
  responsibilityId: z.string().min(1),
  skillId: z.string().min(1),
  familyMembership: FamilyMembershipSchema,
  verifiability: VerifiabilitySchema,
  constructibility: ConstructibilitySchema,
  sourceValidity: SourceValidityStatusSchema,
  dependencyClosure: DependencyClosureStatusSchema,
  currentSupport: CurrentSupportSchema,
  failureAttributions: z.array(FailureAttributionSchema),
}).strict();

export type FamilyResponsibilityInput = z.infer<typeof FamilyResponsibilityInputSchema>;
export type FamilyResponsibilityAssessment = z.infer<typeof FamilyResponsibilityAssessmentSchema>;

function capabilityIsCurrentNewInputReady(capability: z.infer<typeof RequiredCapabilitySchema>): boolean {
  return capability.implementation === "implemented"
    && capability.validation === "current-tested"
    && capability.supportsNewInputs === true;
}

function orderedFailures(values: Iterable<z.infer<typeof FailureAttributionSchema>>): z.infer<typeof FailureAttributionSchema>[] {
  const present = new Set(values);
  return FAILURE_ORDER.filter((entry) => present.has(entry));
}

export function deriveFamilyResponsibilityAssessment(input: FamilyResponsibilityInput | unknown): FamilyResponsibilityAssessment {
  const parsed = FamilyResponsibilityInputSchema.parse(input);
  const criterionStatuses = parsed.criterionAssessments.map((entry) => entry.status);
  const familyMembership = criterionStatuses.includes("unknown")
    ? "family-membership-unknown" as const
    : criterionStatuses.includes("unsatisfied")
      ? "out-of-family" as const
      : "in-family" as const;
  const verifiability = parsed.verificationBasis.status === "sufficient"
    ? "verifiable" as const
    : parsed.verificationBasis.status === "insufficient"
      ? "not-verifiable" as const
      : "unknown" as const;
  const constructionUnknown = parsed.constructionBasis.status === "unknown"
    || parsed.dependencyClosure.status === "unknown"
    || parsed.remainingSemanticChoices.status === "unknown";
  const constructionBlocked = parsed.constructionBasis.status === "insufficient"
    || parsed.dependencyClosure.status === "open"
    || parsed.remainingSemanticChoices.status === "unbound";
  const constructibility = constructionUnknown
    ? "unknown" as const
    : constructionBlocked
      ? "not-constructible" as const
      : "constructible" as const;
  const capabilitiesReady = parsed.requiredCapabilities.every(capabilityIsCurrentNewInputReady);
  const cannotAssessSupport = familyMembership !== "in-family"
    || constructibility !== "constructible"
    || parsed.sourceValidity.status === "blocked"
    || parsed.sourceValidity.status === "unknown"
    || parsed.executionLimit.status === "unknown";
  const currentSupport = familyMembership === "out-of-family"
    ? "not-applicable" as const
    : cannotAssessSupport
      ? "not-assessable" as const
      : capabilitiesReady && parsed.executionLimit.status === "none"
        ? "supported" as const
        : "missing" as const;

  const failures: z.infer<typeof FailureAttributionSchema>[] = [];
  if (criterionStatuses.some((status) => status !== "satisfied")) failures.push("rule-insufficient");
  if (parsed.verificationBasis.status !== "sufficient") failures.push("verification-evidence-missing");
  if (parsed.constructionBasis.status !== "sufficient") failures.push("construction-evidence-missing");
  if (!capabilitiesReady) failures.push("capability-missing");
  if (parsed.sourceValidity.status === "blocked") failures.push("source-defect");
  if (parsed.dependencyClosure.status === "open") failures.push("dependency-open");
  if (parsed.remainingSemanticChoices.status === "unbound") failures.push("external-semantic-decision");
  if (parsed.executionLimit.status === "environment-limited") failures.push("environment-limit");
  if (parsed.executionLimit.status === "implementation-failed") failures.push("implementation-failure");

  return FamilyResponsibilityAssessmentSchema.parse({
    responsibilityId: parsed.responsibilityId,
    skillId: parsed.skillId,
    familyMembership,
    verifiability,
    constructibility,
    sourceValidity: parsed.sourceValidity.status,
    dependencyClosure: parsed.dependencyClosure.status,
    currentSupport,
    failureAttributions: orderedFailures(failures),
  });
}

export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_DATASET_SCHEMA_VERSION = "skill-ir-public-structure-offline-family-dataset/v1" as const;

export const FamilySkillScopeSchema = z.object({
  skillId: z.string().min(1),
  responsibilityIds: z.array(z.string().min(1)).min(1),
}).strict();

export const FamilyDatasetInputSchema = z.object({
  schemaVersion: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_DATASET_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY),
  skillScopes: z.array(FamilySkillScopeSchema).min(1),
  responsibilities: z.array(FamilyResponsibilityInputSchema).min(1),
}).strict();

export const FamilySkillAggregateSchema = z.object({
  skillId: z.string().min(1),
  disposition: z.enum(["all", "mixed", "none", "incomplete"]),
  responsibilityIds: z.array(z.string().min(1)).min(1),
  totals: z.object({
    responsibilities: z.number().int().positive(),
    inFamily: z.number().int().nonnegative(),
    outOfFamily: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    verifiable: z.number().int().nonnegative(),
    constructible: z.number().int().nonnegative(),
    currentSupported: z.number().int().nonnegative(),
  }).strict(),
  failureAttributionCounts: z.record(FailureAttributionSchema, z.number().int().nonnegative()),
}).strict();

export const FamilyDatasetReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-structure-offline-family-dataset-report/v1"),
  identity: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY),
  assessments: z.array(FamilyResponsibilityAssessmentSchema).min(1),
  skills: z.array(FamilySkillAggregateSchema).min(1),
}).strict();

export type FamilySkillScope = z.infer<typeof FamilySkillScopeSchema>;
export type FamilySkillAggregate = z.infer<typeof FamilySkillAggregateSchema>;
export type FamilyDatasetReport = z.infer<typeof FamilyDatasetReportSchema>;

export function aggregateFamilySkill(
  scope: FamilySkillScope,
  assessments: ReadonlyMap<string, FamilyResponsibilityAssessment>,
): FamilySkillAggregate {
  const parsedScope = FamilySkillScopeSchema.parse(scope);
  const selected = parsedScope.responsibilityIds.map((responsibilityId) => {
    const assessment = assessments.get(responsibilityId);
    if (!assessment) throw new Error(`skill scope denominator is missing responsibility: ${responsibilityId}`);
    if (assessment.skillId !== parsedScope.skillId) throw new Error(`skill scope contains cross-skill responsibility: ${responsibilityId}`);
    return assessment;
  });
  const inFamily = selected.filter((entry) => entry.familyMembership === "in-family").length;
  const outOfFamily = selected.filter((entry) => entry.familyMembership === "out-of-family").length;
  const unknown = selected.filter((entry) => entry.familyMembership === "family-membership-unknown").length;
  const disposition = unknown > 0
    ? "incomplete" as const
    : inFamily === selected.length
      ? "all" as const
      : inFamily === 0
        ? "none" as const
        : "mixed" as const;
  const failureAttributionCounts = Object.fromEntries(FAILURE_ORDER.map((attribution) => [
    attribution,
    selected.filter((entry) => entry.failureAttributions.includes(attribution)).length,
  ]));
  return FamilySkillAggregateSchema.parse({
    skillId: parsedScope.skillId,
    disposition,
    responsibilityIds: parsedScope.responsibilityIds,
    totals: {
      responsibilities: selected.length,
      inFamily,
      outOfFamily,
      unknown,
      verifiable: selected.filter((entry) => entry.verifiability === "verifiable").length,
      constructible: selected.filter((entry) => entry.constructibility === "constructible").length,
      currentSupported: selected.filter((entry) => entry.currentSupport === "supported").length,
    },
    failureAttributionCounts,
  });
}

export function deriveFamilyDataset(input: unknown): FamilyDatasetReport {
  const parsed = FamilyDatasetInputSchema.parse(input);
  const responsibilityById = new Map<string, FamilyResponsibilityInput>();
  for (const responsibility of parsed.responsibilities) {
    if (responsibilityById.has(responsibility.responsibilityId)) throw new Error(`duplicate responsibility id: ${responsibility.responsibilityId}`);
    responsibilityById.set(responsibility.responsibilityId, responsibility);
  }
  const scopeBySkill = new Map<string, FamilySkillScope>();
  const scopedResponsibilityIds: string[] = [];
  for (const scope of parsed.skillScopes) {
    if (scopeBySkill.has(scope.skillId)) throw new Error(`duplicate skill scope: ${scope.skillId}`);
    if (new Set(scope.responsibilityIds).size !== scope.responsibilityIds.length) throw new Error(`duplicate responsibility in skill scope: ${scope.skillId}`);
    scopeBySkill.set(scope.skillId, scope);
    scopedResponsibilityIds.push(...scope.responsibilityIds);
  }
  if (new Set(scopedResponsibilityIds).size !== scopedResponsibilityIds.length) throw new Error("responsibility appears in more than one skill scope");
  const declaredIds = [...responsibilityById.keys()].sort();
  const scopedIds = [...scopedResponsibilityIds].sort();
  if (JSON.stringify(declaredIds) !== JSON.stringify(scopedIds)) {
    throw new Error("skill scope denominator does not exactly cover declared responsibilities");
  }
  for (const responsibility of parsed.responsibilities) {
    const scope = scopeBySkill.get(responsibility.skillId);
    if (!scope?.responsibilityIds.includes(responsibility.responsibilityId)) {
      throw new Error(`responsibility is absent from its skill scope: ${responsibility.responsibilityId}`);
    }
    for (const dependencyId of responsibility.dependsOnResponsibilityIds) {
      const dependency = responsibilityById.get(dependencyId);
      if (!dependency) throw new Error(`unknown responsibility dependency: ${dependencyId}`);
      if (dependency.skillId !== responsibility.skillId) throw new Error(`cross-skill responsibility dependency: ${responsibility.responsibilityId} -> ${dependencyId}`);
    }
  }

  const derived = new Map<string, FamilyResponsibilityAssessment>();
  const visiting = new Set<string>();
  const visit = (responsibilityId: string): FamilyResponsibilityAssessment => {
    const existing = derived.get(responsibilityId);
    if (existing) return existing;
    if (visiting.has(responsibilityId)) throw new Error(`responsibility dependency cycle at ${responsibilityId}`);
    const responsibility = responsibilityById.get(responsibilityId)!;
    visiting.add(responsibilityId);
    const dependencies = responsibility.dependsOnResponsibilityIds.map(visit);
    visiting.delete(responsibilityId);
    const base = deriveFamilyResponsibilityAssessment(responsibility);
    const dependencyUnknown = dependencies.some((entry) => entry.familyMembership === "family-membership-unknown");
    const dependencyOut = dependencies.some((entry) => entry.familyMembership === "out-of-family");
    const familyMembership = base.familyMembership === "family-membership-unknown" || dependencyUnknown
      ? "family-membership-unknown" as const
      : base.familyMembership === "out-of-family" || dependencyOut
        ? "out-of-family" as const
        : "in-family" as const;
    const propagated = FamilyResponsibilityAssessmentSchema.parse({
      ...base,
      familyMembership,
      currentSupport: familyMembership === "out-of-family"
        ? "not-applicable"
        : familyMembership === "family-membership-unknown"
          ? "not-assessable"
          : base.currentSupport,
      failureAttributions: familyMembership !== base.familyMembership
        ? orderedFailures([...base.failureAttributions, "rule-insufficient"])
        : base.failureAttributions,
    });
    derived.set(responsibilityId, propagated);
    return propagated;
  };
  for (const responsibilityId of responsibilityById.keys()) visit(responsibilityId);
  const assessments = parsed.responsibilities.map((entry) => derived.get(entry.responsibilityId)!);
  const skills = parsed.skillScopes.map((scope) => aggregateFamilySkill(scope, derived));
  return FamilyDatasetReportSchema.parse({
    schemaVersion: "skill-ir-public-structure-offline-family-dataset-report/v1",
    identity: PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY,
    assessments,
    skills,
  });
}

export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_CONTRACT_SCHEMA_VERSION = "skill-ir-public-structure-offline-family-contract/v1" as const;
export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_COUNTEREXAMPLES_SCHEMA_VERSION = "skill-ir-public-structure-offline-family-counterexamples/v1" as const;
export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_ID = "public-structure-driven-offline-conversion-reporting" as const;
export const FAMILY_CRITERION_IDS = [
  ...FAMILY_NECESSARY_CRITERION_IDS,
  "current-capability-readiness",
  "cross-repository-generalization",
] as const;

export const FamilyCriterionIdSchema = z.enum(FAMILY_CRITERION_IDS);
export const FamilyCriterionRoleSchema = z.enum([
  "necessary-family-condition",
  "current-engineering-limit",
  "unverified-hypothesis",
]);
export const FamilyEvidenceKindSchema = z.enum([
  "public-contract",
  "source-contract",
  "implementation",
  "validation-report",
  "capability-profile",
  "counterexample",
]);

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const RelativeFilePathSchema = z.string().min(1).superRefine((value, context) => {
  const portable = value.replaceAll("\\", "/");
  if (isAbsolute(value) || portable.startsWith("/") || portable.split("/").includes("..")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "path must be repository-relative and contained" });
  }
});

export const FamilyCriterionDefinitionSchema = z.object({
  criterionId: FamilyCriterionIdSchema,
  role: FamilyCriterionRoleSchema,
  question: z.string().min(1),
  evidenceIds: z.array(EvidenceIdSchema).min(1),
  counterexampleIds: z.array(z.string().min(1)).min(1),
}).strict();

export const FamilyEvidenceFileSchema = z.object({
  evidenceId: EvidenceIdSchema,
  path: RelativeFilePathSchema,
  sha256: Sha256Schema,
  kind: FamilyEvidenceKindSchema,
  markers: z.array(z.string().min(1)).min(1),
}).strict();

export const PublicStructureOfflineFamilyContractFileSchema = z.object({
  schemaVersion: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_CONTRACT_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY),
  familyId: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_ID),
  status: z.literal("development-retrospective"),
  criteria: z.array(FamilyCriterionDefinitionSchema).min(1),
  evidenceFiles: z.array(FamilyEvidenceFileSchema).min(1),
  prospectiveEvidence: z.literal("pending-not-observed"),
  accounting: z.object({
    prospectiveResultsUsed: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
  }).strict(),
  claimBoundary: z.string().min(1),
}).strict();

export const FamilyCounterexampleSchema = z.object({
  exampleId: z.string().min(1),
  kind: z.enum(["positive", "near-boundary", "unverified"]),
  explanation: z.string().min(1),
  evidenceIds: z.array(EvidenceIdSchema).min(1),
  responsibility: FamilyResponsibilityInputSchema,
  expectedAssessment: FamilyResponsibilityAssessmentSchema,
}).strict();

export const PublicStructureOfflineFamilyCounterexamplesFileSchema = z.object({
  schemaVersion: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_COUNTEREXAMPLES_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY),
  familyId: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_ID),
  contract: z.object({ path: RelativeFilePathSchema, sha256: Sha256Schema }).strict(),
  prospectiveEvidence: z.literal("pending-not-observed"),
  skillScopes: z.array(FamilySkillScopeSchema).min(1),
  examples: z.array(FamilyCounterexampleSchema).length(7),
  claimBoundary: z.string().min(1),
}).strict();

export type PublicStructureOfflineFamilyContractFile = z.infer<typeof PublicStructureOfflineFamilyContractFileSchema>;
export type PublicStructureOfflineFamilyCounterexamplesFile = z.infer<typeof PublicStructureOfflineFamilyCounterexamplesFileSchema>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contained(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const target = resolve(root, path);
  const back = relative(root, target);
  if (back === "" || back.startsWith("..") || isAbsolute(back)) throw new Error(`evidence path escapes repository root: ${path}`);
  return target;
}

function responsibilityEvidenceIds(responsibility: FamilyResponsibilityInput): string[] {
  return [
    ...responsibility.criterionAssessments.flatMap((entry) => entry.evidenceIds),
    ...responsibility.verificationBasis.evidenceIds,
    ...responsibility.constructionBasis.evidenceIds,
    ...responsibility.dependencyClosure.evidenceIds,
    ...responsibility.sourceValidity.evidenceIds,
    ...responsibility.remainingSemanticChoices.evidenceIds,
    ...responsibility.executionLimit.evidenceIds,
    ...responsibility.requiredCapabilities.flatMap((entry) => entry.evidenceIds),
  ];
}

const EXPECTED_CRITERION_ROLES = new Map<string, z.infer<typeof FamilyCriterionRoleSchema>>([
  ...FAMILY_NECESSARY_CRITERION_IDS.map((criterionId) => [criterionId, "necessary-family-condition" as const] as const),
  ["current-capability-readiness", "current-engineering-limit"],
  ["cross-repository-generalization", "unverified-hypothesis"],
]);
const NECESSARY_FAMILY_EVIDENCE_KINDS = new Set<z.infer<typeof FamilyEvidenceKindSchema>>([
  "public-contract",
  "source-contract",
  "validation-report",
]);

export async function verifyPublicStructureOfflineFamilyArtifacts(options: {
  rootDir: string;
  contract: PublicStructureOfflineFamilyContractFile | unknown;
  counterexamples: PublicStructureOfflineFamilyCounterexamplesFile | unknown;
}): Promise<{
  status: "verified";
  criteria: 9;
  familyNecessaryCriteria: 7;
  counterexamples: 7;
  evidenceFiles: number;
  skills: number;
  prospectiveResultsUsed: 0;
}> {
  const contract = PublicStructureOfflineFamilyContractFileSchema.parse(options.contract);
  const counterexamples = PublicStructureOfflineFamilyCounterexamplesFileSchema.parse(options.counterexamples);
  const actualCriterionIds = contract.criteria.map((entry) => entry.criterionId);
  if (new Set(actualCriterionIds).size !== actualCriterionIds.length
    || canonical([...actualCriterionIds].sort()) !== canonical([...FAMILY_CRITERION_IDS].sort())) {
    throw new Error("family criterion coverage mismatch");
  }
  for (const criterion of contract.criteria) {
    const expectedRole = EXPECTED_CRITERION_ROLES.get(criterion.criterionId);
    if (criterion.role !== expectedRole) throw new Error(`family criterion role drift: ${criterion.criterionId}; expected ${expectedRole}`);
  }
  const evidenceById = new Map<string, z.infer<typeof FamilyEvidenceFileSchema>>();
  for (const evidence of contract.evidenceFiles) {
    if (evidenceById.has(evidence.evidenceId)) throw new Error(`duplicate evidence id: ${evidence.evidenceId}`);
    evidenceById.set(evidence.evidenceId, evidence);
    const bytes = await readFile(contained(options.rootDir, evidence.path));
    if (sha256(bytes) !== evidence.sha256) throw new Error(`evidence digest mismatch: ${evidence.evidenceId}`);
    const text = bytes.toString("utf8");
    for (const marker of evidence.markers) {
      if (!text.includes(marker)) throw new Error(`evidence marker or locator missing: ${evidence.evidenceId}`);
    }
  }
  const exampleIds = new Set(counterexamples.examples.map((entry) => entry.exampleId));
  for (const criterion of contract.criteria) {
    for (const evidenceId of criterion.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) throw new Error(`criterion references unknown evidence: ${criterion.criterionId} -> ${evidenceId}`);
      if (criterion.role === "necessary-family-condition" && !NECESSARY_FAMILY_EVIDENCE_KINDS.has(evidence.kind)) {
        throw new Error(`necessary family criterion uses disallowed evidence kind: ${criterion.criterionId} -> ${evidence.kind}`);
      }
    }
    for (const exampleId of criterion.counterexampleIds) {
      if (!exampleIds.has(exampleId)) throw new Error(`criterion references unknown counterexample: ${criterion.criterionId} -> ${exampleId}`);
    }
  }
  for (const example of counterexamples.examples) {
    const evidenceIds = [...example.evidenceIds, ...responsibilityEvidenceIds(example.responsibility)];
    for (const evidenceId of evidenceIds) {
      if (!evidenceById.has(evidenceId)) throw new Error(`counterexample references unknown evidence: ${example.exampleId} -> ${evidenceId}`);
    }
  }
  const dataset = deriveFamilyDataset({
    schemaVersion: PUBLIC_STRUCTURE_OFFLINE_FAMILY_DATASET_SCHEMA_VERSION,
    identity: PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY,
    skillScopes: counterexamples.skillScopes,
    responsibilities: counterexamples.examples.map((entry) => entry.responsibility),
  });
  const assessmentByResponsibilityId = new Map(dataset.assessments.map((entry) => [entry.responsibilityId, entry]));
  for (const example of counterexamples.examples) {
    const derived = assessmentByResponsibilityId.get(example.responsibility.responsibilityId);
    if (canonical(derived) !== canonical(example.expectedAssessment)) {
      throw new Error(`counterexample dependency-propagated derived assessment drift: ${example.exampleId}`);
    }
  }
  return {
    status: "verified",
    criteria: 9,
    familyNecessaryCriteria: 7,
    counterexamples: 7,
    evidenceFiles: evidenceById.size,
    skills: dataset.skills.length,
    prospectiveResultsUsed: 0,
  };
}

export async function verifyPublicStructureOfflineFamilyFiles(options: {
  rootDir: string;
  contractPath: string;
  counterexamplesPath: string;
}): Promise<Awaited<ReturnType<typeof verifyPublicStructureOfflineFamilyArtifacts>>> {
  const contractBytes = await readFile(contained(options.rootDir, options.contractPath));
  const counterexampleBytes = await readFile(contained(options.rootDir, options.counterexamplesPath));
  const contract = PublicStructureOfflineFamilyContractFileSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  const counterexamples = PublicStructureOfflineFamilyCounterexamplesFileSchema.parse(JSON.parse(counterexampleBytes.toString("utf8")));
  if (counterexamples.contract.path !== options.contractPath || counterexamples.contract.sha256 !== sha256(contractBytes)) {
    throw new Error("counterexample contract binding digest or path drift");
  }
  return verifyPublicStructureOfflineFamilyArtifacts({ rootDir: options.rootDir, contract, counterexamples });
}

export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_CONTRACT_PATH = "benchmarks/skill-ir/classification/public-structure-offline-family-contract-v1.json" as const;
export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_COUNTEREXAMPLES_PATH = "benchmarks/skill-ir/classification/public-structure-offline-family-counterexamples-v1.json" as const;
export const PUBLIC_STRUCTURE_OFFLINE_FAMILY_REPORT_SCHEMA_VERSION = "skill-ir-public-structure-offline-family-report/v1" as const;

export const PublicStructureOfflineFamilyReportSchema = z.object({
  schemaVersion: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_REPORT_SCHEMA_VERSION),
  identity: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY),
  familyId: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_ID),
  status: z.literal("verified-development-contract"),
  completedAt: z.string().datetime(),
  inputs: z.object({
    contract: z.object({ path: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_CONTRACT_PATH), sha256: Sha256Schema }).strict(),
    counterexamples: z.object({ path: z.literal(PUBLIC_STRUCTURE_OFFLINE_FAMILY_COUNTEREXAMPLES_PATH), sha256: Sha256Schema }).strict(),
  }).strict(),
  verification: z.object({
    status: z.literal("verified"),
    criteria: z.literal(9),
    familyNecessaryCriteria: z.literal(7),
    counterexamples: z.literal(7),
    evidenceFiles: z.number().int().positive(),
    skills: z.number().int().positive(),
  }).strict(),
  criteria: z.array(FamilyCriterionDefinitionSchema).length(9),
  assessments: z.array(FamilyResponsibilityAssessmentSchema).length(7),
  skills: z.array(FamilySkillAggregateSchema).min(1),
  prospectiveEvidence: z.literal("pending-not-observed"),
  accounting: z.object({
    prospectiveResultsUsed: z.literal(0),
    modelCalls: z.literal(0),
    businessApiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    q1ReservedAccesses: z.literal(0),
    developmentAgentUsage: z.literal("host-external-not-measured-by-runner"),
  }).strict(),
  claimBoundary: z.string().min(1),
  portableSemanticSha256: Sha256Schema,
}).strict();

export type PublicStructureOfflineFamilyReport = z.infer<typeof PublicStructureOfflineFamilyReportSchema>;

export async function buildPublicStructureOfflineFamilyReport(options: {
  rootDir: string;
  completedAt: string;
}): Promise<PublicStructureOfflineFamilyReport> {
  const completedAt = z.string().datetime().parse(options.completedAt);
  const contractBytes = await readFile(contained(options.rootDir, PUBLIC_STRUCTURE_OFFLINE_FAMILY_CONTRACT_PATH));
  const counterexampleBytes = await readFile(contained(options.rootDir, PUBLIC_STRUCTURE_OFFLINE_FAMILY_COUNTEREXAMPLES_PATH));
  const contract = PublicStructureOfflineFamilyContractFileSchema.parse(JSON.parse(contractBytes.toString("utf8")));
  const counterexamples = PublicStructureOfflineFamilyCounterexamplesFileSchema.parse(JSON.parse(counterexampleBytes.toString("utf8")));
  const verification = await verifyPublicStructureOfflineFamilyFiles({
    rootDir: options.rootDir,
    contractPath: PUBLIC_STRUCTURE_OFFLINE_FAMILY_CONTRACT_PATH,
    counterexamplesPath: PUBLIC_STRUCTURE_OFFLINE_FAMILY_COUNTEREXAMPLES_PATH,
  });
  const dataset = deriveFamilyDataset({
    schemaVersion: PUBLIC_STRUCTURE_OFFLINE_FAMILY_DATASET_SCHEMA_VERSION,
    identity: PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY,
    skillScopes: counterexamples.skillScopes,
    responsibilities: counterexamples.examples.map((entry) => entry.responsibility),
  });
  const semantic = {
    schemaVersion: PUBLIC_STRUCTURE_OFFLINE_FAMILY_REPORT_SCHEMA_VERSION,
    identity: PUBLIC_STRUCTURE_OFFLINE_FAMILY_IDENTITY,
    familyId: PUBLIC_STRUCTURE_OFFLINE_FAMILY_ID,
    status: "verified-development-contract" as const,
    inputs: {
      contract: { path: PUBLIC_STRUCTURE_OFFLINE_FAMILY_CONTRACT_PATH, sha256: sha256(contractBytes) },
      counterexamples: { path: PUBLIC_STRUCTURE_OFFLINE_FAMILY_COUNTEREXAMPLES_PATH, sha256: sha256(counterexampleBytes) },
    },
    verification: {
      status: verification.status,
      criteria: verification.criteria,
      familyNecessaryCriteria: verification.familyNecessaryCriteria,
      counterexamples: verification.counterexamples,
      evidenceFiles: verification.evidenceFiles,
      skills: verification.skills,
    },
    criteria: contract.criteria,
    assessments: dataset.assessments,
    skills: dataset.skills,
    prospectiveEvidence: contract.prospectiveEvidence,
    accounting: {
      prospectiveResultsUsed: 0 as const,
      modelCalls: 0 as const,
      businessApiCalls: 0 as const,
      paidCalls: 0 as const,
      heldOutAccesses: 0 as const,
      q1ReservedAccesses: 0 as const,
      developmentAgentUsage: "host-external-not-measured-by-runner" as const,
    },
    claimBoundary: contract.claimBoundary,
  };
  return PublicStructureOfflineFamilyReportSchema.parse({
    ...semantic,
    completedAt,
    portableSemanticSha256: sha256(Buffer.from(canonical(semantic), "utf8")),
  });
}
