import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitObjectSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const IsoDateSchema = z.string().datetime({ offset: true });
const SafeRelativePathSchema = z.string().min(1).max(320).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."), {
  message: "path must be a contained POSIX-style relative path",
});
const GithubRepositorySchema = z.string().url().regex(/^https:\/\/github\.com\/[^/]+\/[^/]+$/u);

export const AutomationPredictionSchema = z.enum([
  "rules-sufficient-capability-supported",
  "rules-sufficient-capability-missing",
  "partial-semantic-choice-required",
  "insufficient-information",
]);
export type AutomationPrediction = z.infer<typeof AutomationPredictionSchema>;

const SourceCodeRefSchema = z.object({
  path: SafeRelativePathSchema,
  symbol: z.string().min(1).max(160),
}).strict();

const CapabilitySchema = z.object({
  id: SlugSchema,
  kind: z.enum(["operation", "backend", "composition", "checker", "binding", "runtime"]),
  implementation: z.enum(["implemented", "missing", "design-only"]),
  validation: z.enum(["current-tested", "component-tested", "historical-tested", "partial", "none"]),
  supportsNewInputs: z.boolean(),
  sourceRefs: z.array(SourceCodeRefSchema).min(1),
  boundary: z.string().min(1).max(800),
}).strict();

const ConstructionPathStepSchema = z.object({
  order: z.number().int().positive(),
  capabilityId: SlugSchema.optional(),
  action: z.string().min(1).max(500),
}).strict();

const CapabilityFamilyProfileSchema = z.object({
  id: SlugSchema,
  status: z.enum(["existing-slice-only", "construction-development", "new-input-ready", "unsupported"]),
  supportedSlice: z.string().min(1).max(1200),
  excluded: z.array(z.string().min(1).max(500)).min(1),
  requiredCapabilityIds: z.array(SlugSchema).min(1),
  minimalConstructionPath: z.array(ConstructionPathStepSchema).min(1),
  blockers: z.array(z.string().min(1).max(500)),
}).strict().superRefine((profile, context) => {
  if (new Set(profile.requiredCapabilityIds).size !== profile.requiredCapabilityIds.length) {
    context.addIssue({ code: "custom", path: ["requiredCapabilityIds"], message: "capability ids must be unique" });
  }
  const orders = profile.minimalConstructionPath.map((step) => step.order);
  if (orders.some((order, index) => order !== index + 1)) {
    context.addIssue({ code: "custom", path: ["minimalConstructionPath"], message: "construction path orders must be contiguous from 1" });
  }
});

export const CapabilityProfileSchema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-capability-profile/v1"),
  profileId: SlugSchema,
  frozenAt: IsoDateSchema,
  family: z.literal("public-structure-offline-transformation"),
  capabilities: z.array(CapabilitySchema).min(1),
  profiles: z.array(CapabilityFamilyProfileSchema).min(1),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    coreBranchDelta: z.literal(0),
  }).strict(),
}).strict().superRefine((profile, context) => {
  const capabilityIds = profile.capabilities.map((entry) => entry.id);
  if (new Set(capabilityIds).size !== capabilityIds.length) {
    context.addIssue({ code: "custom", path: ["capabilities"], message: "capability ids must be unique" });
  }
  const profileIds = profile.profiles.map((entry) => entry.id);
  if (new Set(profileIds).size !== profileIds.length) {
    context.addIssue({ code: "custom", path: ["profiles"], message: "profile ids must be unique" });
  }
});
export type CapabilityProfile = z.infer<typeof CapabilityProfileSchema>;

function capabilitySupportsNewInputs(capability: z.infer<typeof CapabilitySchema>): boolean {
  return capability.implementation === "implemented"
    && capability.validation === "current-tested"
    && capability.supportsNewInputs;
}

export function validateCapabilityProfile(rawProfile: CapabilityProfile | unknown): {
  capabilities: number;
  profiles: number;
  newInputReadyProfiles: number;
  invalidCapabilityReferences: number;
} {
  const profile = CapabilityProfileSchema.parse(rawProfile);
  const capabilities = new Map(profile.capabilities.map((entry) => [entry.id, entry]));
  const invalidReferences: string[] = [];
  for (const familyProfile of profile.profiles) {
    const pathCapabilityIds = familyProfile.minimalConstructionPath.flatMap((step) => step.capabilityId ? [step.capabilityId] : []);
    for (const id of [...familyProfile.requiredCapabilityIds, ...pathCapabilityIds]) {
      if (!capabilities.has(id)) invalidReferences.push(`${familyProfile.id}:${id}`);
    }
    if (familyProfile.status === "new-input-ready") {
      const blockers = familyProfile.requiredCapabilityIds.filter((id) => {
        const capability = capabilities.get(id);
        return !capability || !capabilitySupportsNewInputs(capability);
      });
      if (blockers.length > 0 || familyProfile.blockers.length > 0) {
        throw new Error(`new-input-ready profile ${familyProfile.id} has unsupported capabilities or blockers: ${blockers.join(",")}`);
      }
    }
  }
  if (invalidReferences.length > 0) {
    throw new Error(`invalid capability references: ${invalidReferences.join(",")}`);
  }
  return {
    capabilities: profile.capabilities.length,
    profiles: profile.profiles.length,
    newInputReadyProfiles: profile.profiles.filter((entry) => entry.status === "new-input-ready").length,
    invalidCapabilityReferences: 0,
  };
}

export async function verifyCapabilitySourceRefs(
  rootDir: string,
  rawProfile: CapabilityProfile | unknown,
): Promise<{
  sourceFiles: number;
  sourceRefs: number;
  missingSymbols: number;
}> {
  const profile = CapabilityProfileSchema.parse(rawProfile);
  validateCapabilityProfile(profile);
  const sourceByPath = new Map<string, string>();
  const missing: string[] = [];

  for (const capability of profile.capabilities) {
    for (const ref of capability.sourceRefs) {
      let source = sourceByPath.get(ref.path);
      if (source === undefined) {
        source = await readFile(join(rootDir, ref.path), "utf8");
        sourceByPath.set(ref.path, source);
      }
      if (!source.includes(ref.symbol)) missing.push(`${capability.id}:${ref.path}#${ref.symbol}`);
    }
  }
  if (missing.length > 0) throw new Error(`missing capability source symbols: ${missing.join(",")}`);
  return {
    sourceFiles: sourceByPath.size,
    sourceRefs: profile.capabilities.reduce((count, capability) => count + capability.sourceRefs.length, 0),
    missingSymbols: 0,
  };
}

const ClassificationEvidenceRefSchema = z.object({
  sourcePackageId: SlugSchema,
  locator: z.string().min(1).max(500),
  kind: z.enum([
    "specification-clause",
    "public-input-field",
    "transformation-rule",
    "script-contract",
    "tool-contract",
    "checker-contract",
    "user-parameter",
    "environment-contract",
  ]),
}).strict();

function evidenceBasisSchema<T extends readonly [string, ...string[]]>(statuses: T) {
  return z.object({
    status: z.enum(statuses),
    evidenceRefs: z.array(ClassificationEvidenceRefSchema),
    gaps: z.array(z.string().min(1).max(500)),
  }).strict();
}

const VerificationBasisSchema = evidenceBasisSchema(["sufficient", "insufficient"] as const)
  .superRefine((basis, context) => {
    if (basis.status === "sufficient" && (basis.evidenceRefs.length === 0 || basis.gaps.length > 0)) {
      context.addIssue({ code: "custom", message: "sufficient verification requires evidence and no gaps" });
    }
    if (basis.status === "insufficient" && basis.gaps.length === 0) {
      context.addIssue({ code: "custom", message: "insufficient verification requires a named gap" });
    }
  });

const ConstructionBasisSchema = z.object({
  status: z.enum(["rules-sufficient", "semantic-choice-required", "insufficient"]),
  evidenceRefs: z.array(ClassificationEvidenceRefSchema),
  requiredCapabilityIds: z.array(SlugSchema),
  gaps: z.array(z.string().min(1).max(500)),
}).strict().superRefine((basis, context) => {
  if (basis.status !== "insufficient" && basis.evidenceRefs.length === 0) {
    context.addIssue({ code: "custom", message: "known construction basis requires public evidence" });
  }
  if (basis.status === "insufficient" && basis.gaps.length === 0) {
    context.addIssue({ code: "custom", message: "insufficient construction requires a named gap" });
  }
  if (basis.status !== "insufficient" && basis.gaps.length > 0) {
    context.addIssue({ code: "custom", message: "known construction basis cannot carry missing-information gaps" });
  }
  if (new Set(basis.requiredCapabilityIds).size !== basis.requiredCapabilityIds.length) {
    context.addIssue({ code: "custom", message: "required capability ids must be unique" });
  }
});

const ExecutionConditionsSchema = z.object({
  status: z.enum(["satisfied", "capability-missing", "insufficient"]),
  conditions: z.array(z.string().min(1).max(500)),
  requiredCapabilityIds: z.array(SlugSchema),
  gaps: z.array(z.string().min(1).max(500)),
}).strict().superRefine((conditions, context) => {
  if (conditions.status !== "insufficient" && conditions.conditions.length === 0) {
    context.addIssue({ code: "custom", message: "known execution conditions require at least one condition" });
  }
  if (conditions.status === "insufficient" && conditions.gaps.length === 0) {
    context.addIssue({ code: "custom", message: "insufficient execution conditions require a named gap" });
  }
  if (conditions.status !== "insufficient" && conditions.gaps.length > 0) {
    context.addIssue({ code: "custom", message: "known execution conditions cannot carry missing-information gaps" });
  }
  if (new Set(conditions.requiredCapabilityIds).size !== conditions.requiredCapabilityIds.length) {
    context.addIssue({ code: "custom", message: "execution capability ids must be unique" });
  }
});

const SemanticChoiceSchema = z.object({
  choiceId: SlugSchema,
  provider: z.enum(["user", "reviewer", "domain-expert", "external-oracle"]),
  timing: z.enum(["before-construction", "during-review", "runtime"]),
  affectsRequirementIds: z.array(SlugSchema).min(1),
  description: z.string().min(1).max(500),
}).strict();

export const ClassificationRequirementSchema = z.object({
  requirementId: SlugSchema,
  unitKind: z.enum(["hard-requirement", "workflow-step"]),
  description: z.string().min(1).max(1000),
  dependsOn: z.array(SlugSchema),
  verificationBasis: VerificationBasisSchema,
  constructionBasis: ConstructionBasisSchema,
  executionConditions: ExecutionConditionsSchema,
  remainingSemanticChoices: z.array(SemanticChoiceSchema),
  prediction: AutomationPredictionSchema,
}).strict().superRefine((requirement, context) => {
  if (new Set(requirement.dependsOn).size !== requirement.dependsOn.length || requirement.dependsOn.includes(requirement.requirementId)) {
    context.addIssue({ code: "custom", path: ["dependsOn"], message: "dependencies must be unique and cannot reference self" });
  }
  const choiceIds = requirement.remainingSemanticChoices.map((choice) => choice.choiceId);
  if (new Set(choiceIds).size !== choiceIds.length) {
    context.addIssue({ code: "custom", path: ["remainingSemanticChoices"], message: "semantic choice ids must be unique" });
  }
  if (requirement.constructionBasis.status === "semantic-choice-required" && requirement.remainingSemanticChoices.length === 0) {
    context.addIssue({ code: "custom", message: "semantic-choice-required construction must name at least one remaining choice" });
  }
  if (requirement.constructionBasis.status === "rules-sufficient" && requirement.remainingSemanticChoices.length > 0) {
    context.addIssue({ code: "custom", message: "rules-sufficient construction cannot retain semantic choices" });
  }
});
export type ClassificationRequirement = z.infer<typeof ClassificationRequirementSchema>;

function intrinsicPrediction(
  requirement: ClassificationRequirement,
  capabilities: Map<string, z.infer<typeof CapabilitySchema>>,
): AutomationPrediction {
  if (requirement.verificationBasis.status === "insufficient"
    || requirement.constructionBasis.status === "insufficient"
    || requirement.executionConditions.status === "insufficient") return "insufficient-information";
  if (requirement.constructionBasis.status === "semantic-choice-required"
    || requirement.remainingSemanticChoices.length > 0) return "partial-semantic-choice-required";
  const required = [
    ...requirement.constructionBasis.requiredCapabilityIds,
    ...requirement.executionConditions.requiredCapabilityIds,
  ];
  if (requirement.executionConditions.status === "capability-missing"
    || required.some((id) => !capabilities.has(id) || !capabilitySupportsNewInputs(capabilities.get(id)!))) {
    return "rules-sufficient-capability-missing";
  }
  return "rules-sufficient-capability-supported";
}

const PredictionRank: Record<AutomationPrediction, number> = {
  "rules-sufficient-capability-supported": 0,
  "rules-sufficient-capability-missing": 1,
  "partial-semantic-choice-required": 2,
  "insufficient-information": 3,
};

export function deriveRequirementStates(
  rawRequirements: Array<ClassificationRequirement | unknown>,
  rawProfile: CapabilityProfile | unknown,
): Record<string, AutomationPrediction> {
  const profile = CapabilityProfileSchema.parse(rawProfile);
  validateCapabilityProfile(profile);
  const requirements = rawRequirements.map((entry) => ClassificationRequirementSchema.parse(entry));
  const byId = new Map(requirements.map((entry) => [entry.requirementId, entry]));
  if (byId.size !== requirements.length) throw new Error("requirement ids must be unique");
  const capabilities = new Map(profile.capabilities.map((entry) => [entry.id, entry]));
  const visiting = new Set<string>();
  const derived = new Map<string, AutomationPrediction>();

  const visit = (id: string): AutomationPrediction => {
    const existing = derived.get(id);
    if (existing) return existing;
    const requirement = byId.get(id);
    if (!requirement) throw new Error(`unknown requirement dependency: ${id}`);
    if (visiting.has(id)) throw new Error(`requirement dependency cycle at ${id}`);
    visiting.add(id);
    let prediction = intrinsicPrediction(requirement, capabilities);
    for (const dependencyId of requirement.dependsOn) {
      const dependencyPrediction = visit(dependencyId);
      if (PredictionRank[dependencyPrediction] > PredictionRank[prediction]) prediction = dependencyPrediction;
    }
    visiting.delete(id);
    if (prediction !== requirement.prediction) {
      throw new Error(`prediction mismatch for ${id}: declared ${requirement.prediction}, derived ${prediction}`);
    }
    derived.set(id, prediction);
    return prediction;
  };
  for (const requirement of requirements) visit(requirement.requirementId);
  return Object.fromEntries(requirements.map((entry) => [entry.requirementId, derived.get(entry.requirementId)!]));
}

const AnnotationLabelSchema = z.object({
  sourcePackageId: SlugSchema,
  requirementId: SlugSchema,
  prediction: AutomationPredictionSchema,
}).strict();

const AnnotatorRecordSchema = z.object({
  slot: z.enum(["A", "B"]),
  annotatorId: SlugSchema,
  independenceAttested: z.literal(true),
  sawPeerLabelsBeforeSubmission: z.literal(false),
  submittedAt: IsoDateSchema,
  labels: z.array(AnnotationLabelSchema).min(1),
}).strict().superRefine((record, context) => {
  const keys = record.labels.map((label) => `${label.sourcePackageId}:${label.requirementId}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["labels"], message: "annotation label keys must be unique" });
  }
});

const AdjudicationSchema = z.object({
  sourcePackageId: SlugSchema,
  requirementId: SlugSchema,
  finalPrediction: AutomationPredictionSchema,
  rationale: z.string().min(1).max(1200),
  adjudicatorId: SlugSchema,
  adjudicatedAt: IsoDateSchema,
}).strict();

export const AnnotationBatchSchema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-annotation-batch/v1"),
  batchId: SlugSchema,
  handbookVersion: z.literal("skill-ir-task-automation-classification/v1"),
  sourceListId: SlugSchema,
  status: z.enum(["independent-complete", "adjudicated"]),
  annotators: z.tuple([AnnotatorRecordSchema, AnnotatorRecordSchema]),
  adjudications: z.array(AdjudicationSchema),
  audit: z.object({
    resultEvidenceVisibleToAnnotators: z.literal(false),
    postResultRelabelingAllowed: z.literal(false),
  }).strict(),
}).strict().superRefine((batch, context) => {
  const [left, right] = batch.annotators;
  if (left.slot === right.slot || new Set([left.slot, right.slot]).size !== 2) {
    context.addIssue({ code: "custom", path: ["annotators"], message: "annotation slots A and B are both required" });
  }
  if (left.annotatorId === right.annotatorId) {
    context.addIssue({ code: "custom", path: ["annotators"], message: "independent annotators must have distinct identities" });
  }
  const labelKeys = (record: z.infer<typeof AnnotatorRecordSchema>) =>
    record.labels.map((label) => `${label.sourcePackageId}:${label.requirementId}`).sort();
  if (JSON.stringify(labelKeys(left)) !== JSON.stringify(labelKeys(right))) {
    context.addIssue({ code: "custom", path: ["annotators"], message: "independent annotators must label the same denominator" });
  }
  const rightPredictions = new Map(right.labels.map((label) => [
    `${label.sourcePackageId}:${label.requirementId}`,
    label.prediction,
  ]));
  const disagreementKeys = left.labels
    .filter((label) => rightPredictions.get(`${label.sourcePackageId}:${label.requirementId}`) !== label.prediction)
    .map((label) => `${label.sourcePackageId}:${label.requirementId}`)
    .sort();
  const adjudicationKeys = batch.adjudications
    .map((entry) => `${entry.sourcePackageId}:${entry.requirementId}`)
    .sort();
  if (new Set(adjudicationKeys).size !== adjudicationKeys.length) {
    context.addIssue({ code: "custom", path: ["adjudications"], message: "adjudication keys must be unique" });
  }
  if (batch.status === "independent-complete" && batch.adjudications.length > 0) {
    context.addIssue({ code: "custom", path: ["adjudications"], message: "adjudication cannot precede the independent-complete freeze" });
  }
  if (batch.status === "adjudicated" && JSON.stringify(adjudicationKeys) !== JSON.stringify(disagreementKeys)) {
    context.addIssue({
      code: "custom",
      path: ["adjudications"],
      message: "adjudications must cover every disagreement and only disagreement items",
    });
  }
});
export type AnnotationBatch = z.infer<typeof AnnotationBatchSchema>;

export function summarizePreAdjudicationAgreement(rawBatch: AnnotationBatch | unknown): {
  compared: number;
  agreed: number;
  rate: number;
} {
  const batch = AnnotationBatchSchema.parse(rawBatch);
  const [left, right] = batch.annotators;
  const rightByKey = new Map(right.labels.map((label) => [`${label.sourcePackageId}:${label.requirementId}`, label.prediction]));
  const agreed = left.labels.filter((label) =>
    rightByKey.get(`${label.sourcePackageId}:${label.requirementId}`) === label.prediction).length;
  return { compared: left.labels.length, agreed, rate: agreed / left.labels.length };
}

const LicenseAuthoritySchema = z.object({
  id: z.string().min(1).max(100),
  authorityPath: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const LocalSourceAuthoritySchema = z.object({
  kind: z.literal("local-sha256-registry-ref"),
  registryPath: SafeRelativePathSchema,
  registryRecordId: SlugSchema,
  fileCount: z.number().int().positive(),
  sourceManifestSha256: Sha256Schema,
}).strict();

const RemoteSourceAuthoritySchema = z.object({
  kind: z.literal("remote-git-tree-manifest"),
  treeManifestSha256: Sha256Schema,
  files: z.array(z.object({
    path: SafeRelativePathSchema,
    gitBlob: GitObjectSchema,
    bytes: z.number().int().positive(),
  }).strict()).min(1),
}).strict().superRefine((authority, context) => {
  const paths = authority.files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", path: ["files"], message: "remote tree paths must be unique" });
  }
  if (!paths.includes("SKILL.md")) {
    context.addIssue({ code: "custom", path: ["files"], message: "source package must contain SKILL.md" });
  }
});

const DevelopmentSourceSchema = z.object({
  slotId: z.string().regex(/^d(?:0[1-9]|1[0-2])$/u),
  sourcePackageId: SlugSchema,
  lineageId: SlugSchema,
  visibility: z.literal("development-read-before-freeze"),
  identity: z.object({
    repository: GithubRepositorySchema,
    commit: GitObjectSchema,
    packageRoot: SafeRelativePathSchema,
  }).strict(),
  license: LicenseAuthoritySchema,
  authority: z.union([LocalSourceAuthoritySchema, RemoteSourceAuthoritySchema]),
  structure: z.object({
    executableResources: z.boolean(),
    explicitSpecification: z.enum(["explicit", "partial", "absent"]),
    stateDependency: z.enum(["local-only", "external-state", "mixed"]),
  }).strict(),
  responsibilities: z.array(z.object({
    id: SlugSchema,
    summary: z.string().min(1).max(500),
  }).strict()).min(1),
  selectedSlices: z.array(z.object({
    id: SlugSchema,
    summary: z.string().min(1).max(800),
    responsibilityIds: z.array(SlugSchema).min(1),
    excludedResponsibilityIds: z.array(SlugSchema),
  }).strict()).min(1),
  q2Role: z.enum(["core-profile", "development-case", "boundary"]),
}).strict().superRefine((source, context) => {
  const responsibilityIds = source.responsibilities.map((entry) => entry.id);
  if (new Set(responsibilityIds).size !== responsibilityIds.length) {
    context.addIssue({ code: "custom", path: ["responsibilities"], message: "responsibility ids must be unique" });
  }
  const expected = [...responsibilityIds].sort();
  for (const [index, slice] of source.selectedSlices.entries()) {
    const selected = new Set(slice.responsibilityIds);
    const excluded = new Set(slice.excludedResponsibilityIds);
    if ([...selected].some((id) => excluded.has(id))) {
      context.addIssue({ code: "custom", path: ["selectedSlices", index], message: "selected and excluded responsibilities must be disjoint" });
    }
    const union = [...new Set([...selected, ...excluded])].sort();
    if (JSON.stringify(union) !== JSON.stringify(expected)) {
      context.addIssue({ code: "custom", path: ["selectedSlices", index], message: "each slice must account for every full-skill responsibility" });
    }
  }
});

export const Q1SourceListSchema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-source-list/v1"),
  listId: SlugSchema,
  handbookVersion: z.literal("skill-ir-task-automation-classification/v1"),
  sampling: z.object({
    totalTarget: z.literal(24),
    developmentTarget: z.literal(12),
    prospectiveTarget: z.literal(12),
    minimumIndependentRepositories: z.number().int().min(4),
    developmentVisibility: z.literal("read-before-freeze"),
    prospectiveVisibility: z.literal("unselected-unseen"),
    stratificationAxes: z.tuple([
      z.literal("executable-resources"),
      z.literal("explicit-specification"),
      z.literal("state-dependency"),
    ]),
    lineageDeduplication: z.literal("forks, translations, and copies share one lineage and cannot count independently"),
  }).strict(),
  developmentSources: z.array(DevelopmentSourceSchema).length(12),
  prospective: z.object({
    status: z.literal("reserved-unselected"),
    selectedCount: z.literal(0),
    entries: z.tuple([]),
  }).strict(),
  excludedCandidates: z.array(z.object({
    sourceIdentity: z.string().min(1).max(500),
    reason: z.enum(["fork", "translation", "copy", "duplicate-lineage", "license-unresolved", "provenance-unresolved"]),
  }).strict()),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    resultEvidenceAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((list, context) => {
  const unique = (values: string[], path: string, label: string) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: [path], message: `${label} must be unique` });
    }
  };
  unique(list.developmentSources.map((entry) => entry.slotId), "developmentSources", "development slot ids");
  unique(list.developmentSources.map((entry) => entry.sourcePackageId), "developmentSources", "source package ids");
  unique(list.developmentSources.map((entry) => entry.lineageId), "developmentSources", "source lineages");
  unique(list.developmentSources.map((entry) =>
    `${entry.identity.repository}@${entry.identity.commit}:${entry.identity.packageRoot}`), "developmentSources", "package identities");
  const repositories = new Set(list.developmentSources.map((entry) => entry.identity.repository));
  if (repositories.size < list.sampling.minimumIndependentRepositories) {
    context.addIssue({ code: "custom", path: ["developmentSources"], message: "development sample has too few independent repositories" });
  }
});
export type Q1SourceList = z.infer<typeof Q1SourceListSchema>;

export function validateQ1SourceList(rawList: Q1SourceList | unknown): {
  developmentSources: number;
  prospectiveSelectedSources: number;
  reservedProspectiveSources: number;
  independentRepositories: number;
  duplicatePackageIdentities: number;
  duplicateLineages: number;
} {
  const list = Q1SourceListSchema.parse(rawList);
  const packageIdentities = list.developmentSources.map((entry) =>
    `${entry.identity.repository}@${entry.identity.commit}:${entry.identity.packageRoot}`);
  const lineages = list.developmentSources.map((entry) => entry.lineageId);
  return {
    developmentSources: list.developmentSources.length,
    prospectiveSelectedSources: list.prospective.selectedCount,
    reservedProspectiveSources: list.sampling.prospectiveTarget,
    independentRepositories: new Set(list.developmentSources.map((entry) => entry.identity.repository)).size,
    duplicatePackageIdentities: packageIdentities.length - new Set(packageIdentities).size,
    duplicateLineages: lineages.length - new Set(lineages).size,
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function verifyQ1SourceAuthorities(
  rootDir: string,
  rawList: Q1SourceList | unknown,
): Promise<{
  localRegistrySources: number;
  remoteTreeSources: number;
  localFilesVerified: number;
  remoteManifestFilesBound: number;
  remoteLicenseDigestsRecorded: number;
}> {
  const list = Q1SourceListSchema.parse(rawList);
  validateQ1SourceList(list);
  const registryCache = new Map<string, { skills?: unknown }>();
  let localRegistrySources = 0;
  let remoteTreeSources = 0;
  let localFilesVerified = 0;
  let remoteManifestFilesBound = 0;
  let remoteLicenseDigestsRecorded = 0;

  for (const source of list.developmentSources) {
    if (source.authority.kind === "remote-git-tree-manifest") {
      const actualManifest = sha256(JSON.stringify(source.authority.files));
      if (actualManifest !== source.authority.treeManifestSha256) {
        throw new Error(`remote tree manifest digest mismatch for ${source.sourcePackageId}`);
      }
      remoteTreeSources += 1;
      remoteManifestFilesBound += source.authority.files.length;
      remoteLicenseDigestsRecorded += 1;
      continue;
    }

    const localAuthority = source.authority;
    let registry = registryCache.get(localAuthority.registryPath);
    if (!registry) {
      registry = JSON.parse(await readFile(join(rootDir, localAuthority.registryPath), "utf8")) as { skills?: unknown };
      registryCache.set(localAuthority.registryPath, registry);
    }
    if (!Array.isArray(registry.skills)) throw new Error(`source registry has no skills array: ${localAuthority.registryPath}`);
    const matches = registry.skills.filter((entry) =>
      entry && typeof entry === "object" && (entry as { id?: unknown }).id === localAuthority.registryRecordId);
    if (matches.length !== 1) throw new Error(`source registry record mismatch for ${source.sourcePackageId}`);
    const record = matches[0] as {
      sourceRepository?: unknown;
      sourceCommit?: unknown;
      upstreamPath?: unknown;
      sourceFiles?: unknown;
    };
    const upstreamRoot = typeof record.upstreamPath === "string"
      ? record.upstreamPath.slice(0, record.upstreamPath.lastIndexOf("/"))
      : undefined;
    if (record.sourceRepository !== source.identity.repository
      || record.sourceCommit !== source.identity.commit
      || upstreamRoot !== source.identity.packageRoot) {
      throw new Error(`source identity drift for ${source.sourcePackageId}`);
    }
    if (!Array.isArray(record.sourceFiles) || record.sourceFiles.length !== localAuthority.fileCount) {
      throw new Error(`source file count mismatch for ${source.sourcePackageId}`);
    }
    const files = record.sourceFiles.map((entry) => z.object({
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
    }).strict().parse(entry));
    if (sha256(JSON.stringify(files)) !== localAuthority.sourceManifestSha256) {
      throw new Error(`source manifest digest mismatch for ${source.sourcePackageId}`);
    }
    for (const file of files) {
      const bytes = await readFile(join(rootDir, file.path));
      if (sha256(bytes) !== file.sha256) throw new Error(`source file digest mismatch: ${file.path}`);
      localFilesVerified += 1;
    }
    const licenseBytes = await readFile(join(rootDir, source.license.authorityPath));
    if (sha256(licenseBytes) !== source.license.sha256) {
      throw new Error(`license digest mismatch for ${source.sourcePackageId}`);
    }
    localRegistrySources += 1;
  }

  return {
    localRegistrySources,
    remoteTreeSources,
    localFilesVerified,
    remoteManifestFilesBound,
    remoteLicenseDigestsRecorded,
  };
}
