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
}).strict().superRefine((choice, context) => {
  if (new Set(choice.affectsRequirementIds).size !== choice.affectsRequirementIds.length) {
    context.addIssue({ code: "custom", path: ["affectsRequirementIds"], message: "semantic impact targets must be unique" });
  }
});

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

  const dependsTransitivelyOn = (targetId: string, upstreamId: string, seen = new Set<string>()): boolean => {
    if (targetId === upstreamId) return true;
    if (seen.has(targetId)) return false;
    seen.add(targetId);
    const target = byId.get(targetId);
    if (!target) throw new Error(`unknown semantic impact target: ${targetId}`);
    return target.dependsOn.some((dependencyId) => {
      if (!byId.has(dependencyId)) throw new Error(`unknown requirement dependency: ${dependencyId}`);
      return dependsTransitivelyOn(dependencyId, upstreamId, seen);
    });
  };

  for (const requirement of requirements) {
    for (const choice of requirement.remainingSemanticChoices) {
      for (const targetId of choice.affectsRequirementIds) {
        if (!byId.has(targetId)) throw new Error(`unknown semantic impact target: ${targetId}`);
        if (!dependsTransitivelyOn(targetId, requirement.requirementId)) {
          throw new Error(`semantic impact target ${targetId} has no dependency path from ${requirement.requirementId}`);
        }
      }
    }
  }

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

const FrozenDocumentBindingSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const AnnotationPackageRefSchema = z.object({
  packageId: SlugSchema,
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const WorkspaceSourceViewSchema = z.object({
  kind: z.literal("workspace-bound-files"),
  files: z.array(z.object({
    sourcePath: SafeRelativePathSchema,
    workspacePath: SafeRelativePathSchema,
    sha256: Sha256Schema,
    bytes: z.number().int().positive(),
  }).strict()).min(1),
}).strict().superRefine((view, context) => {
  for (const key of ["sourcePath", "workspacePath"] as const) {
    const values = view.files.map((entry) => entry[key]);
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", path: ["files"], message: `${key} values must be unique` });
    }
  }
});

const RemoteSourceViewSchema = z.object({
  kind: z.literal("commit-pinned-readonly"),
  repository: GithubRepositorySchema,
  commit: GitObjectSchema,
  packageRoot: SafeRelativePathSchema,
  files: z.array(z.object({
    sourcePath: SafeRelativePathSchema,
    gitBlob: GitObjectSchema,
    bytes: z.number().int().positive(),
    browseUrl: z.string().url(),
  }).strict()).min(1),
  license: z.object({
    authorityPath: SafeRelativePathSchema,
    sha256: Sha256Schema,
    browseUrl: z.string().url(),
  }).strict(),
  verifiedAt: IsoDateSchema,
  verificationMethod: z.literal("git-object-id-and-size"),
}).strict().superRefine((view, context) => {
  const paths = view.files.map((entry) => entry.sourcePath);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", path: ["files"], message: "remote source paths must be unique" });
  }
  const expectedPrefix = `${view.repository}/blob/${view.commit}/${view.packageRoot}/`;
  for (const [index, file] of view.files.entries()) {
    if (file.browseUrl !== `${expectedPrefix}${file.sourcePath}`) {
      context.addIssue({ code: "custom", path: ["files", index, "browseUrl"], message: "remote source URL must bind the exact repository commit and package root" });
    }
  }
  if (view.license.browseUrl !== `${view.repository}/blob/${view.commit}/${view.license.authorityPath}`) {
    context.addIssue({ code: "custom", path: ["license", "browseUrl"], message: "remote license URL must bind the exact repository commit" });
  }
});

const AnnotationSourceViewSchema = z.object({
  slotId: z.string().regex(/^d(?:0[1-9]|1[0-2])$/u),
  sourcePackageId: SlugSchema,
  sliceId: SlugSchema,
  includedResponsibilityIds: z.array(SlugSchema).min(1),
  excludedResponsibilityIds: z.array(SlugSchema),
  access: z.union([WorkspaceSourceViewSchema, RemoteSourceViewSchema]),
}).strict().superRefine((view, context) => {
  const included = new Set(view.includedResponsibilityIds);
  if (included.size !== view.includedResponsibilityIds.length) {
    context.addIssue({ code: "custom", path: ["includedResponsibilityIds"], message: "included responsibilities must be unique" });
  }
  if (new Set(view.excludedResponsibilityIds).size !== view.excludedResponsibilityIds.length) {
    context.addIssue({ code: "custom", path: ["excludedResponsibilityIds"], message: "excluded responsibilities must be unique" });
  }
  if (view.excludedResponsibilityIds.some((id) => included.has(id))) {
    context.addIssue({ code: "custom", message: "included and excluded responsibilities must be disjoint" });
  }
});

const AnnotationUnitSchema = z.object({
  unitId: SlugSchema,
  sourcePackageId: SlugSchema,
  sliceId: SlugSchema,
  responsibilityId: SlugSchema,
  unitKind: z.enum(["hard-requirement", "workflow-step"]),
  description: z.string().min(1).max(1000),
  sourceLocators: z.array(z.object({
    locator: z.string().min(1).max(500),
    purpose: z.string().min(1).max(500),
  }).strict()).min(1),
  dependsOnUnitIds: z.array(SlugSchema),
}).strict().superRefine((unit, context) => {
  if (new Set(unit.dependsOnUnitIds).size !== unit.dependsOnUnitIds.length || unit.dependsOnUnitIds.includes(unit.unitId)) {
    context.addIssue({ code: "custom", path: ["dependsOnUnitIds"], message: "unit dependencies must be unique and cannot reference self" });
  }
  const locators = unit.sourceLocators.map((entry) => entry.locator);
  if (new Set(locators).size !== locators.length) {
    context.addIssue({ code: "custom", path: ["sourceLocators"], message: "source locators must be unique" });
  }
});

const RemoteVerificationBindingSchema = z.object({
  reportId: SlugSchema,
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const DevelopmentAnnotationPackageV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-development-annotation-package/v2"),
  packageId: SlugSchema,
  frozenAt: IsoDateSchema,
  family: z.literal("public-structure-offline-transformation"),
  bindings: z.object({
    handbook: FrozenDocumentBindingSchema.extend({
      methodId: z.literal("skill-ir-task-automation-classification/v2"),
    }).strict(),
    sourceList: FrozenDocumentBindingSchema.extend({
      listId: SlugSchema,
    }).strict(),
    capabilityProfile: FrozenDocumentBindingSchema.extend({
      profileId: SlugSchema,
    }).strict(),
    remoteVerification: z.union([RemoteVerificationBindingSchema, z.null()]),
  }).strict(),
  denominator: z.object({
    unitizationPolicy: z.literal("one-unit-per-selected-responsibility"),
    sourceCount: z.number().int().positive(),
    unitCount: z.number().int().positive(),
  }).strict(),
  sourceViews: z.array(AnnotationSourceViewSchema).min(1),
  units: z.array(AnnotationUnitSchema).min(1),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    resultEvidenceAccesses: z.literal(0),
    prospectiveSourcesSelected: z.literal(0),
  }).strict(),
}).strict().superRefine((pkg, context) => {
  const sourceIds = pkg.sourceViews.map((entry) => entry.sourcePackageId);
  const slotIds = pkg.sourceViews.map((entry) => entry.slotId);
  const unitIds = pkg.units.map((entry) => entry.unitId);
  if (new Set(sourceIds).size !== sourceIds.length || new Set(slotIds).size !== slotIds.length) {
    context.addIssue({ code: "custom", path: ["sourceViews"], message: "source and slot ids must be unique" });
  }
  if (new Set(unitIds).size !== unitIds.length) {
    context.addIssue({ code: "custom", path: ["units"], message: "annotation unit ids must be unique" });
  }
  if (pkg.denominator.sourceCount !== pkg.sourceViews.length || pkg.denominator.unitCount !== pkg.units.length) {
    context.addIssue({ code: "custom", path: ["denominator"], message: "declared denominator counts must equal the frozen source and unit lists" });
  }
  const viewBySource = new Map(pkg.sourceViews.map((entry) => [entry.sourcePackageId, entry]));
  const unitById = new Map(pkg.units.map((entry) => [entry.unitId, entry]));
  for (const [index, unit] of pkg.units.entries()) {
    const view = viewBySource.get(unit.sourcePackageId);
    if (!view || view.sliceId !== unit.sliceId) {
      context.addIssue({ code: "custom", path: ["units", index], message: "annotation unit must reference a frozen source view and slice" });
      continue;
    }
    if (!view.includedResponsibilityIds.includes(unit.responsibilityId)) {
      context.addIssue({ code: "custom", path: ["units", index, "responsibilityId"], message: "annotation unit responsibility is outside the selected slice" });
    }
    const availablePaths = new Set(view.access.files.map((entry) => entry.sourcePath));
    for (const locator of unit.sourceLocators) {
      const sourcePath = locator.locator.split("#", 1)[0]!;
      if (!availablePaths.has(sourcePath)) {
        context.addIssue({ code: "custom", path: ["units", index, "sourceLocators"], message: `source locator is outside the frozen view: ${locator.locator}` });
      }
    }
    for (const dependencyId of unit.dependsOnUnitIds) {
      const dependency = unitById.get(dependencyId);
      if (!dependency || dependency.sourcePackageId !== unit.sourcePackageId) {
        context.addIssue({ code: "custom", path: ["units", index, "dependsOnUnitIds"], message: `unit dependency must exist in the same source: ${dependencyId}` });
      }
    }
  }
  for (const [index, view] of pkg.sourceViews.entries()) {
    const covered = pkg.units
      .filter((unit) => unit.sourcePackageId === view.sourcePackageId)
      .map((unit) => unit.responsibilityId)
      .sort();
    const expected = [...view.includedResponsibilityIds].sort();
    if (JSON.stringify(covered) !== JSON.stringify(expected)) {
      context.addIssue({ code: "custom", path: ["sourceViews", index], message: "units must cover every selected responsibility exactly once" });
    }
  }
  const remoteViews = pkg.sourceViews.filter((entry) => entry.access.kind === "commit-pinned-readonly");
  if ((remoteViews.length > 0) !== (pkg.bindings.remoteVerification !== null)) {
    context.addIssue({ code: "custom", path: ["bindings", "remoteVerification"], message: "remote verification binding is required exactly when remote views exist" });
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      context.addIssue({ code: "custom", path: ["units"], message: `annotation unit dependency cycle at ${id}` });
      return;
    }
    visiting.add(id);
    for (const dependencyId of unitById.get(id)?.dependsOnUnitIds ?? []) visit(dependencyId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of unitIds) visit(id);
});
export type DevelopmentAnnotationPackageV2 = z.infer<typeof DevelopmentAnnotationPackageV2Schema>;

const BlankAnnotationLabelV2Schema = z.object({
  sourcePackageId: SlugSchema,
  unitId: SlugSchema,
  verificationBasis: z.null(),
  constructionBasis: z.null(),
  executionConditions: z.null(),
  remainingSemanticChoices: z.null(),
  prediction: z.null(),
}).strict();

export const BlankAnnotationFormV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-annotation-form/v2"),
  formId: SlugSchema,
  annotationPackage: AnnotationPackageRefSchema,
  slot: z.enum(["A", "B"]),
  annotatorId: z.null(),
  independenceAttested: z.null(),
  sawPeerLabelsBeforeSubmission: z.null(),
  resultEvidenceVisibleBeforeSubmission: z.null(),
  submittedAt: z.null(),
  labels: z.array(BlankAnnotationLabelV2Schema).min(1),
}).strict();
export type BlankAnnotationFormV2 = z.infer<typeof BlankAnnotationFormV2Schema>;

const AnnotationLabelV2Schema = z.object({
  sourcePackageId: SlugSchema,
  unitId: SlugSchema,
  verificationBasis: VerificationBasisSchema,
  constructionBasis: ConstructionBasisSchema,
  executionConditions: ExecutionConditionsSchema,
  remainingSemanticChoices: z.array(SemanticChoiceSchema),
  prediction: AutomationPredictionSchema,
}).strict();

export const AnnotationSubmissionV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-annotation-submission/v2"),
  submissionId: SlugSchema,
  annotationPackage: AnnotationPackageRefSchema,
  slot: z.enum(["A", "B"]),
  annotatorId: SlugSchema,
  independenceAttested: z.literal(true),
  sawPeerLabelsBeforeSubmission: z.literal(false),
  resultEvidenceVisibleBeforeSubmission: z.literal(false),
  submittedAt: IsoDateSchema,
  labels: z.array(AnnotationLabelV2Schema).min(1),
}).strict().superRefine((submission, context) => {
  const keys = submission.labels.map((entry) => `${entry.sourcePackageId}:${entry.unitId}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["labels"], message: "annotation submission unit keys must be unique" });
  }
});
export type AnnotationSubmissionV2 = z.infer<typeof AnnotationSubmissionV2Schema>;

const AdjudicationV2Schema = z.object({
  sourcePackageId: SlugSchema,
  unitId: SlugSchema,
  finalPrediction: AutomationPredictionSchema,
  rationale: z.string().min(1).max(1200),
  adjudicatorId: SlugSchema,
  adjudicatedAt: IsoDateSchema,
}).strict();

export const AnnotationBatchV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-annotation-batch/v2"),
  batchId: SlugSchema,
  annotationPackage: AnnotationPackageRefSchema,
  status: z.enum(["independent-complete", "adjudicated"]),
  submissions: z.tuple([AnnotationSubmissionV2Schema, AnnotationSubmissionV2Schema]),
  adjudications: z.array(AdjudicationV2Schema),
  audit: z.object({
    postResultRelabelingAllowed: z.literal(false),
  }).strict(),
}).strict().superRefine((batch, context) => {
  const [left, right] = batch.submissions;
  if (left.slot === right.slot || new Set([left.slot, right.slot]).size !== 2) {
    context.addIssue({ code: "custom", path: ["submissions"], message: "independent submissions must contain slots A and B" });
  }
  if (left.annotatorId === right.annotatorId) {
    context.addIssue({ code: "custom", path: ["submissions"], message: "independent annotators must have distinct identities" });
  }
  for (const [index, submission] of batch.submissions.entries()) {
    if (JSON.stringify(submission.annotationPackage) !== JSON.stringify(batch.annotationPackage)) {
      context.addIssue({ code: "custom", path: ["submissions", index, "annotationPackage"], message: "submission package binding must equal the batch binding" });
    }
  }
  const adjudicationKeys = batch.adjudications.map((entry) => `${entry.sourcePackageId}:${entry.unitId}`);
  if (new Set(adjudicationKeys).size !== adjudicationKeys.length) {
    context.addIssue({ code: "custom", path: ["adjudications"], message: "adjudication keys must be unique" });
  }
  if (batch.status === "independent-complete" && batch.adjudications.length > 0) {
    context.addIssue({ code: "custom", path: ["adjudications"], message: "adjudication cannot precede the independent-complete freeze" });
  }
});
export type AnnotationBatchV2 = z.infer<typeof AnnotationBatchV2Schema>;

export const RemoteSourceVerificationReportV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-remote-source-verification/v2"),
  reportId: SlugSchema,
  verifiedAt: IsoDateSchema,
  sources: z.array(z.object({
    sourcePackageId: SlugSchema,
    repository: GithubRepositorySchema,
    commit: GitObjectSchema,
    packageRoot: SafeRelativePathSchema,
    commitResolved: z.literal(true),
    files: z.array(z.object({
      sourcePath: SafeRelativePathSchema,
      expectedGitBlob: GitObjectSchema,
      observedGitBlob: GitObjectSchema,
      expectedBytes: z.number().int().positive(),
      observedBytes: z.number().int().positive(),
      matched: z.literal(true),
    }).strict()).min(1),
    license: z.object({
      authorityPath: SafeRelativePathSchema,
      expectedSha256: Sha256Schema,
      observedSha256: Sha256Schema,
      matched: z.literal(true),
    }).strict(),
    status: z.literal("passed"),
  }).strict().superRefine((source, context) => {
    for (const [index, file] of source.files.entries()) {
      if (file.expectedGitBlob !== file.observedGitBlob || file.expectedBytes !== file.observedBytes) {
        context.addIssue({ code: "custom", path: ["files", index], message: "remote file observation must equal the frozen expectation" });
      }
    }
    if (source.license.expectedSha256 !== source.license.observedSha256) {
      context.addIssue({ code: "custom", path: ["license"], message: "remote license observation must equal the frozen expectation" });
    }
  })).min(1),
  overallStatus: z.literal("passed"),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    prospectiveSourcesSelected: z.literal(0),
    networkRepositoryFetches: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type RemoteSourceVerificationReportV2 = z.infer<typeof RemoteSourceVerificationReportV2Schema>;

function annotationUnitKey(sourcePackageId: string, unitId: string): string {
  return `${sourcePackageId}:${unitId}`;
}

function sortedPackageUnitKeys(pkg: DevelopmentAnnotationPackageV2): string[] {
  return pkg.units.map((entry) => annotationUnitKey(entry.sourcePackageId, entry.unitId)).sort();
}

function assertPackageRef(
  ref: z.infer<typeof AnnotationPackageRefSchema>,
  pkg: DevelopmentAnnotationPackageV2,
  packageSha256: string,
): void {
  if (ref.packageId !== pkg.packageId) throw new Error(`annotation package id mismatch: ${ref.packageId}`);
  if (ref.sha256 !== packageSha256) throw new Error(`annotation package digest mismatch: ${ref.sha256}`);
}

function assertCompleteFrozenDenominator(
  labels: Array<{ sourcePackageId: string; unitId: string }>,
  pkg: DevelopmentAnnotationPackageV2,
): void {
  const actual = labels.map((entry) => annotationUnitKey(entry.sourcePackageId, entry.unitId)).sort();
  const expected = sortedPackageUnitKeys(pkg);
  if (new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actual);
    const missing = expected.filter((key) => !actualSet.has(key));
    const unknown = actual.filter((key) => !expectedSet.has(key));
    throw new Error(`annotation labels must cover the complete frozen denominator; missing=${missing.join(",")}; unknown annotation units=${unknown.join(",")}`);
  }
}

export function validateBlankAnnotationFormV2(
  rawForm: BlankAnnotationFormV2 | unknown,
  rawPackage: DevelopmentAnnotationPackageV2 | unknown,
  packageSha256: string,
): { sourceCount: number; unitCount: number } {
  const form = BlankAnnotationFormV2Schema.parse(rawForm);
  const pkg = DevelopmentAnnotationPackageV2Schema.parse(rawPackage);
  assertPackageRef(form.annotationPackage, pkg, packageSha256);
  assertCompleteFrozenDenominator(form.labels, pkg);
  return { sourceCount: pkg.sourceViews.length, unitCount: pkg.units.length };
}

function validateAnnotationEvidenceLocators(
  label: z.infer<typeof AnnotationLabelV2Schema>,
  unit: z.infer<typeof AnnotationUnitSchema>,
): void {
  const allowed = new Set(unit.sourceLocators.map((entry) => entry.locator));
  const dimensions = [label.verificationBasis, label.constructionBasis];
  for (const dimension of dimensions) {
    for (const ref of dimension.evidenceRefs) {
      if (ref.sourcePackageId !== label.sourcePackageId) {
        throw new Error(`evidence source mismatch for ${label.unitId}: ${ref.sourcePackageId}`);
      }
      if (!allowed.has(ref.locator)) {
        throw new Error(`evidence locator is outside the frozen unit view for ${label.unitId}: ${ref.locator}`);
      }
    }
  }
}

export function validateAnnotationSubmissionV2(
  rawSubmission: AnnotationSubmissionV2 | unknown,
  rawPackage: DevelopmentAnnotationPackageV2 | unknown,
  rawProfile: CapabilityProfile | unknown,
  packageSha256: string,
): { sourceCount: number; unitCount: number; predictionsValidated: number } {
  const submission = AnnotationSubmissionV2Schema.parse(rawSubmission);
  const pkg = DevelopmentAnnotationPackageV2Schema.parse(rawPackage);
  const profile = CapabilityProfileSchema.parse(rawProfile);
  assertPackageRef(submission.annotationPackage, pkg, packageSha256);
  if (pkg.bindings.capabilityProfile.profileId !== profile.profileId) {
    throw new Error(`capability profile id mismatch: ${profile.profileId}`);
  }
  assertCompleteFrozenDenominator(submission.labels, pkg);
  const unitByKey = new Map(pkg.units.map((entry) => [annotationUnitKey(entry.sourcePackageId, entry.unitId), entry]));
  const requirements = submission.labels.map((label) => {
    const key = annotationUnitKey(label.sourcePackageId, label.unitId);
    const unit = unitByKey.get(key);
    if (!unit) throw new Error(`unknown annotation unit: ${key}`);
    validateAnnotationEvidenceLocators(label, unit);
    return ClassificationRequirementSchema.parse({
      requirementId: unit.unitId,
      unitKind: unit.unitKind,
      description: unit.description,
      dependsOn: unit.dependsOnUnitIds,
      verificationBasis: label.verificationBasis,
      constructionBasis: label.constructionBasis,
      executionConditions: label.executionConditions,
      remainingSemanticChoices: label.remainingSemanticChoices,
      prediction: label.prediction,
    });
  });
  deriveRequirementStates(requirements, profile);
  return {
    sourceCount: new Set(submission.labels.map((entry) => entry.sourcePackageId)).size,
    unitCount: submission.labels.length,
    predictionsValidated: requirements.length,
  };
}

export function validateAnnotationBatchV2(
  rawBatch: AnnotationBatchV2 | unknown,
  rawPackage: DevelopmentAnnotationPackageV2 | unknown,
  rawProfile: CapabilityProfile | unknown,
  packageSha256: string,
): { sourceCount: number; unitCount: number; submissionsValidated: number } {
  const batch = AnnotationBatchV2Schema.parse(rawBatch);
  const pkg = DevelopmentAnnotationPackageV2Schema.parse(rawPackage);
  assertPackageRef(batch.annotationPackage, pkg, packageSha256);
  for (const submission of batch.submissions) {
    validateAnnotationSubmissionV2(submission, pkg, rawProfile, packageSha256);
  }
  const [left, right] = batch.submissions;
  const rightByKey = new Map(right.labels.map((entry) => [annotationUnitKey(entry.sourcePackageId, entry.unitId), entry.prediction]));
  const disagreementKeys = left.labels
    .filter((entry) => rightByKey.get(annotationUnitKey(entry.sourcePackageId, entry.unitId)) !== entry.prediction)
    .map((entry) => annotationUnitKey(entry.sourcePackageId, entry.unitId))
    .sort();
  const adjudicationKeys = batch.adjudications
    .map((entry) => annotationUnitKey(entry.sourcePackageId, entry.unitId))
    .sort();
  if (batch.status === "adjudicated" && JSON.stringify(adjudicationKeys) !== JSON.stringify(disagreementKeys)) {
    throw new Error("adjudications must cover every disagreement and only disagreement units");
  }
  return { sourceCount: pkg.sourceViews.length, unitCount: pkg.units.length, submissionsValidated: 2 };
}

const PredictionValues: AutomationPrediction[] = [
  "rules-sufficient-capability-supported",
  "rules-sufficient-capability-missing",
  "partial-semantic-choice-required",
  "insufficient-information",
];

export function summarizePreAdjudicationAgreementV2(
  rawBatch: AnnotationBatchV2 | unknown,
  rawPackage: DevelopmentAnnotationPackageV2 | unknown,
  rawProfile: CapabilityProfile | unknown,
  packageSha256: string,
): {
  overall: { compared: number; agreed: number; rate: number };
  bySource: Array<{ sourcePackageId: string; compared: number; agreed: number; rate: number }>;
  confusionMatrix: Record<AutomationPrediction, Record<AutomationPrediction, number>>;
  evidenceDimensionDisagreements: {
    verificationBasis: number;
    constructionBasis: number;
    executionConditions: number;
    remainingSemanticChoices: number;
  };
} {
  const batch = AnnotationBatchV2Schema.parse(rawBatch);
  const pkg = DevelopmentAnnotationPackageV2Schema.parse(rawPackage);
  validateAnnotationBatchV2(batch, pkg, rawProfile, packageSha256);
  const [left, right] = batch.submissions;
  const rightByKey = new Map(right.labels.map((entry) => [annotationUnitKey(entry.sourcePackageId, entry.unitId), entry]));
  const confusionMatrix = Object.fromEntries(PredictionValues.map((leftPrediction) => [
    leftPrediction,
    Object.fromEntries(PredictionValues.map((rightPrediction) => [rightPrediction, 0])),
  ])) as Record<AutomationPrediction, Record<AutomationPrediction, number>>;
  const dimensions = {
    verificationBasis: 0,
    constructionBasis: 0,
    executionConditions: 0,
    remainingSemanticChoices: 0,
  };
  let agreed = 0;
  for (const leftLabel of left.labels) {
    const rightLabel = rightByKey.get(annotationUnitKey(leftLabel.sourcePackageId, leftLabel.unitId))!;
    if (leftLabel.prediction === rightLabel.prediction) agreed += 1;
    confusionMatrix[leftLabel.prediction][rightLabel.prediction] += 1;
    for (const dimension of Object.keys(dimensions) as Array<keyof typeof dimensions>) {
      if (JSON.stringify(leftLabel[dimension]) !== JSON.stringify(rightLabel[dimension])) dimensions[dimension] += 1;
    }
  }
  const bySource = pkg.sourceViews.map((view) => {
    const sourceLabels = left.labels.filter((entry) => entry.sourcePackageId === view.sourcePackageId);
    const sourceAgreed = sourceLabels.filter((entry) =>
      rightByKey.get(annotationUnitKey(entry.sourcePackageId, entry.unitId))!.prediction === entry.prediction).length;
    return {
      sourcePackageId: view.sourcePackageId,
      compared: sourceLabels.length,
      agreed: sourceAgreed,
      rate: sourceAgreed / sourceLabels.length,
    };
  });
  return {
    overall: { compared: left.labels.length, agreed, rate: agreed / left.labels.length },
    bySource,
    confusionMatrix,
    evidenceDimensionDisagreements: dimensions,
  };
}

function sameSortedStrings(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export function validateDevelopmentAnnotationPackageV2(
  rawPackage: DevelopmentAnnotationPackageV2 | unknown,
  rawSourceList: Q1SourceList | unknown,
  rawProfile: CapabilityProfile | unknown,
): { sourceCount: number; unitCount: number; localSourceViews: number; remoteSourceViews: number } {
  const pkg = DevelopmentAnnotationPackageV2Schema.parse(rawPackage);
  const sourceList = Q1SourceListSchema.parse(rawSourceList);
  const profile = CapabilityProfileSchema.parse(rawProfile);
  if (pkg.bindings.sourceList.listId !== sourceList.listId) throw new Error(`source list id mismatch: ${sourceList.listId}`);
  if (pkg.bindings.capabilityProfile.profileId !== profile.profileId) throw new Error(`capability profile id mismatch: ${profile.profileId}`);
  if (pkg.family !== profile.family) throw new Error(`annotation package family mismatch: ${profile.family}`);
  const viewBySource = new Map(pkg.sourceViews.map((entry) => [entry.sourcePackageId, entry]));
  if (pkg.sourceViews.length !== sourceList.developmentSources.length) {
    throw new Error("annotation package must cover every development source");
  }
  for (const source of sourceList.developmentSources) {
    const view = viewBySource.get(source.sourcePackageId);
    if (!view) throw new Error(`missing development source view: ${source.sourcePackageId}`);
    if (view.slotId !== source.slotId) throw new Error(`development source slot mismatch: ${source.sourcePackageId}`);
    const slice = source.selectedSlices.find((entry) => entry.id === view.sliceId);
    if (!slice) throw new Error(`unknown selected slice for ${source.sourcePackageId}: ${view.sliceId}`);
    if (!sameSortedStrings(view.includedResponsibilityIds, slice.responsibilityIds)
      || !sameSortedStrings(view.excludedResponsibilityIds, slice.excludedResponsibilityIds)) {
      throw new Error(`slice responsibility boundary mismatch: ${source.sourcePackageId}`);
    }
    if (source.authority.kind === "remote-git-tree-manifest") {
      if (view.access.kind !== "commit-pinned-readonly") throw new Error(`remote source view kind mismatch: ${source.sourcePackageId}`);
      if (view.access.repository !== source.identity.repository
        || view.access.commit !== source.identity.commit
        || view.access.packageRoot !== source.identity.packageRoot) {
        throw new Error(`remote source identity mismatch: ${source.sourcePackageId}`);
      }
      const expectedFiles = source.authority.files.map((entry) => `${entry.path}:${entry.gitBlob}:${entry.bytes}`).sort();
      const actualFiles = view.access.files.map((entry) => `${entry.sourcePath}:${entry.gitBlob}:${entry.bytes}`).sort();
      if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
        throw new Error(`remote source manifest mismatch: ${source.sourcePackageId}`);
      }
      if (view.access.license.authorityPath !== source.license.authorityPath
        || view.access.license.sha256 !== source.license.sha256) {
        throw new Error(`remote source license mismatch: ${source.sourcePackageId}`);
      }
    } else if (view.access.kind !== "workspace-bound-files") {
      throw new Error(`local source view kind mismatch: ${source.sourcePackageId}`);
    }
  }
  return {
    sourceCount: pkg.sourceViews.length,
    unitCount: pkg.units.length,
    localSourceViews: pkg.sourceViews.filter((entry) => entry.access.kind === "workspace-bound-files").length,
    remoteSourceViews: pkg.sourceViews.filter((entry) => entry.access.kind === "commit-pinned-readonly").length,
  };
}

export async function verifyDevelopmentAnnotationPackageV2(
  rootDir: string,
  rawPackage: DevelopmentAnnotationPackageV2 | unknown,
): Promise<{
  sourceCount: number;
  unitCount: number;
  localFilesVerified: number;
  remoteFilesVerifiedAtFreeze: number;
  frozenDocumentDigestsVerified: number;
}> {
  const pkg = DevelopmentAnnotationPackageV2Schema.parse(rawPackage);
  const readBoundFile = async (binding: { path: string; sha256: string }) => {
    const bytes = await readFile(join(rootDir, binding.path));
    if (sha256(bytes) !== binding.sha256) throw new Error(`frozen document digest mismatch: ${binding.path}`);
    return bytes;
  };
  const [handbookBytes, sourceListBytes, profileBytes] = await Promise.all([
    readBoundFile(pkg.bindings.handbook),
    readBoundFile(pkg.bindings.sourceList),
    readBoundFile(pkg.bindings.capabilityProfile),
  ]);
  if (!handbookBytes.toString("utf8").includes(pkg.bindings.handbook.methodId)) {
    throw new Error(`handbook method id missing: ${pkg.bindings.handbook.methodId}`);
  }
  const sourceList = Q1SourceListSchema.parse(JSON.parse(sourceListBytes.toString("utf8")));
  const profile = CapabilityProfileSchema.parse(JSON.parse(profileBytes.toString("utf8")));
  validateDevelopmentAnnotationPackageV2(pkg, sourceList, profile);
  await verifyQ1SourceAuthorities(rootDir, sourceList);

  const viewBySource = new Map(pkg.sourceViews.map((entry) => [entry.sourcePackageId, entry]));
  const registryCache = new Map<string, { skills?: unknown }>();
  for (const source of sourceList.developmentSources) {
    if (source.authority.kind !== "local-sha256-registry-ref") continue;
    const authority = source.authority;
    let registry = registryCache.get(authority.registryPath);
    if (!registry) {
      registry = JSON.parse(await readFile(join(rootDir, authority.registryPath), "utf8")) as { skills?: unknown };
      registryCache.set(authority.registryPath, registry);
    }
    if (!Array.isArray(registry.skills)) throw new Error(`source registry has no skills array: ${authority.registryPath}`);
    const record = registry.skills.find((entry) =>
      entry && typeof entry === "object" && (entry as { id?: unknown }).id === authority.registryRecordId) as { sourceFiles?: unknown } | undefined;
    if (!record || !Array.isArray(record.sourceFiles)) throw new Error(`source registry record mismatch for ${source.sourcePackageId}`);
    const expectedFiles = record.sourceFiles.map((entry) => z.object({
      path: SafeRelativePathSchema,
      sha256: Sha256Schema,
    }).strict().parse(entry));
    const view = viewBySource.get(source.sourcePackageId);
    if (!view || view.access.kind !== "workspace-bound-files") throw new Error(`local source view missing: ${source.sourcePackageId}`);
    const actualFiles = view.access.files.map((entry) => `${entry.workspacePath}:${entry.sha256}`).sort();
    const expectedBindings = expectedFiles.map((entry) => `${entry.path}:${entry.sha256}`).sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedBindings)) {
      throw new Error(`local annotation source view must bind the complete registry manifest: ${source.sourcePackageId}`);
    }
    for (const file of view.access.files) {
      const marker = "/source/";
      const markerIndex = file.workspacePath.indexOf(marker);
      if (markerIndex < 0 || file.sourcePath !== file.workspacePath.slice(markerIndex + marker.length)) {
        throw new Error(`local annotation source path mismatch: ${source.sourcePackageId}:${file.sourcePath}`);
      }
    }
  }

  let localFilesVerified = 0;
  for (const view of pkg.sourceViews) {
    if (view.access.kind !== "workspace-bound-files") continue;
    for (const file of view.access.files) {
      const bytes = await readFile(join(rootDir, file.workspacePath));
      if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) {
        throw new Error(`annotation source view drift: ${file.workspacePath}`);
      }
      localFilesVerified += 1;
    }
  }

  let remoteFilesVerifiedAtFreeze = 0;
  if (pkg.bindings.remoteVerification) {
    const reportBytes = await readBoundFile(pkg.bindings.remoteVerification);
    const report = RemoteSourceVerificationReportV2Schema.parse(JSON.parse(reportBytes.toString("utf8")));
    if (report.reportId !== pkg.bindings.remoteVerification.reportId) {
      throw new Error(`remote verification report id mismatch: ${report.reportId}`);
    }
    const reportBySource = new Map(report.sources.map((entry) => [entry.sourcePackageId, entry]));
    const remoteViews = pkg.sourceViews.filter((entry): entry is typeof entry & { access: z.infer<typeof RemoteSourceViewSchema> } =>
      entry.access.kind === "commit-pinned-readonly");
    if (report.sources.length !== remoteViews.length) throw new Error("remote verification report source denominator mismatch");
    for (const view of remoteViews) {
      const observed = reportBySource.get(view.sourcePackageId);
      if (!observed || observed.repository !== view.access.repository
        || observed.commit !== view.access.commit || observed.packageRoot !== view.access.packageRoot) {
        throw new Error(`remote verification source mismatch: ${view.sourcePackageId}`);
      }
      const expectedFiles = view.access.files.map((entry) => `${entry.sourcePath}:${entry.gitBlob}:${entry.bytes}`).sort();
      const observedFiles = observed.files.map((entry) =>
        `${entry.sourcePath}:${entry.observedGitBlob}:${entry.observedBytes}`).sort();
      if (JSON.stringify(expectedFiles) !== JSON.stringify(observedFiles)) {
        throw new Error(`remote verification file mismatch: ${view.sourcePackageId}`);
      }
      if (observed.license.authorityPath !== view.access.license.authorityPath
        || observed.license.observedSha256 !== view.access.license.sha256) {
        throw new Error(`remote verification license mismatch: ${view.sourcePackageId}`);
      }
      remoteFilesVerifiedAtFreeze += observed.files.length;
    }
  }
  return {
    sourceCount: pkg.sourceViews.length,
    unitCount: pkg.units.length,
    localFilesVerified,
    remoteFilesVerifiedAtFreeze,
    frozenDocumentDigestsVerified: pkg.bindings.remoteVerification ? 4 : 3,
  };
}

async function readVerifiedAnnotationPackageRef(
  rootDir: string,
  ref: z.infer<typeof AnnotationPackageRefSchema>,
): Promise<{ pkg: DevelopmentAnnotationPackageV2; packageSha256: string }> {
  const packageBytes = await readFile(join(rootDir, ref.path));
  const packageSha256 = sha256(packageBytes);
  if (packageSha256 !== ref.sha256) throw new Error(`annotation package digest mismatch: ${ref.sha256}`);
  const pkg = DevelopmentAnnotationPackageV2Schema.parse(JSON.parse(packageBytes.toString("utf8")));
  if (pkg.packageId !== ref.packageId) throw new Error(`annotation package id mismatch: ${ref.packageId}`);
  await verifyDevelopmentAnnotationPackageV2(rootDir, pkg);
  return { pkg, packageSha256 };
}

export async function verifyBlankAnnotationFormV2(
  rootDir: string,
  rawForm: BlankAnnotationFormV2 | unknown,
): Promise<{ sourceCount: number; unitCount: number }> {
  const form = BlankAnnotationFormV2Schema.parse(rawForm);
  const { pkg, packageSha256 } = await readVerifiedAnnotationPackageRef(rootDir, form.annotationPackage);
  return validateBlankAnnotationFormV2(form, pkg, packageSha256);
}

export async function verifyAnnotationSubmissionV2(
  rootDir: string,
  rawSubmission: AnnotationSubmissionV2 | unknown,
): Promise<{ sourceCount: number; unitCount: number; predictionsValidated: number }> {
  const submission = AnnotationSubmissionV2Schema.parse(rawSubmission);
  const { pkg, packageSha256 } = await readVerifiedAnnotationPackageRef(rootDir, submission.annotationPackage);
  const profileBytes = await readFile(join(rootDir, pkg.bindings.capabilityProfile.path));
  const profile = CapabilityProfileSchema.parse(JSON.parse(profileBytes.toString("utf8")));
  return validateAnnotationSubmissionV2(submission, pkg, profile, packageSha256);
}

export async function verifyAnnotationBatchV2(
  rootDir: string,
  rawBatch: AnnotationBatchV2 | unknown,
): Promise<ReturnType<typeof summarizePreAdjudicationAgreementV2>> {
  const batch = AnnotationBatchV2Schema.parse(rawBatch);
  const { pkg, packageSha256 } = await readVerifiedAnnotationPackageRef(rootDir, batch.annotationPackage);
  const profileBytes = await readFile(join(rootDir, pkg.bindings.capabilityProfile.path));
  const profile = CapabilityProfileSchema.parse(JSON.parse(profileBytes.toString("utf8")));
  return summarizePreAdjudicationAgreementV2(batch, pkg, profile, packageSha256);
}
