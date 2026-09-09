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
