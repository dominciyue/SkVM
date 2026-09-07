import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import {
  AutomationPredictionSchema,
  CapabilityProfileSchema,
  ClassificationRequirementSchema,
  deriveRequirementStates,
} from "./task-automation-classification";

export const AI_ASSISTED_DEVELOPMENT_ROUTING_IDENTITY =
  "skill-ir-ai-assisted-development-routing-001" as const;
export const AI_ASSISTED_DEVELOPMENT_ROUTING_SCHEMA_VERSION =
  "skill-ir-ai-assisted-development-routing/v1" as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafeRelativePathSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."), {
  message: "path must be a contained POSIX relative path",
});

const EvidenceRefSchema = z.object({
  sourcePackageId: z.string().min(1),
  locator: z.string().min(1),
  kind: z.string().min(1),
}).strict();

const SourceRevisionSchema = z.object({
  slot: z.enum(["A", "B"]),
  draftId: z.string().min(1),
  draftPath: SafeRelativePathSchema,
  draftSha256: Sha256Schema,
  changePath: SafeRelativePathSchema,
  changeSha256: Sha256Schema,
  changedFields: z.array(z.string().min(1)),
  rationale: z.object({
    verification: z.string().min(1),
    construction: z.string().min(1),
    execution: z.string().min(1),
    semanticBoundary: z.string().min(1),
  }).strict(),
  predictionChange: z.object({
    from: AutomationPredictionSchema,
    to: AutomationPredictionSchema,
  }).strict().nullable(),
}).strict();

const RoutingRowSchema = z.object({
  unitId: z.string().min(1),
  sourcePackageId: z.string().min(1),
  sliceId: z.string().min(1),
  responsibilityId: z.string().min(1),
  unitKind: z.enum(["hard-requirement", "workflow-step"]),
  description: z.string().min(1),
  sourceLocators: z.array(z.object({
    locator: z.string().min(1),
    purpose: z.string().min(1),
  }).strict()).min(1),
  dependsOnUnitIds: z.array(z.string().min(1)),
  classification: ClassificationRequirementSchema,
  namedUnknowns: z.array(z.string().min(1)),
  sourceRevisions: z.tuple([SourceRevisionSchema, SourceRevisionSchema]),
}).strict().superRefine((row, context) => {
  if (row.classification.requirementId !== row.unitId
    || row.classification.unitKind !== row.unitKind
    || row.classification.description !== row.description) {
    context.addIssue({ code: "custom", message: "row/classification unit metadata mismatch" });
  }
  if (row.sourceRevisions[0].slot !== "A" || row.sourceRevisions[1].slot !== "B") {
    context.addIssue({ code: "custom", message: "source revisions must be ordered A then B" });
  }
});

export const AiAssistedDevelopmentRoutingSchema = z.object({
  schemaVersion: z.literal(AI_ASSISTED_DEVELOPMENT_ROUTING_SCHEMA_VERSION),
  identity: z.literal(AI_ASSISTED_DEVELOPMENT_ROUTING_IDENTITY),
  frozenAt: z.literal("2026-09-07T08:00:00.000Z"),
  sourcePackage: z.object({
    packageId: z.literal("q1-development-annotation-package-002"),
    path: z.literal("benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json"),
    sha256: Sha256Schema,
  }).strict(),
  capabilityProfile: z.object({
    profileId: z.string().min(1),
    path: z.literal("benchmarks/skill-ir/classification/q2-current-capabilities-v1.json"),
    sha256: Sha256Schema,
  }).strict(),
  reviewStatus: z.object({
    path: SafeRelativePathSchema,
    sha256: Sha256Schema,
  }).strict(),
  sourceDrafts: z.tuple([
    z.object({ slot: z.literal("A"), draftId: z.string().min(1), draftPath: SafeRelativePathSchema, draftSha256: Sha256Schema, changePath: SafeRelativePathSchema, changeSha256: Sha256Schema }).strict(),
    z.object({ slot: z.literal("B"), draftId: z.string().min(1), draftPath: SafeRelativePathSchema, draftSha256: Sha256Schema, changePath: SafeRelativePathSchema, changeSha256: Sha256Schema }).strict(),
  ]),
  provenance: z.object({
    commonRepairer: z.literal("ai-main-repair-20260907"),
    repairerSawBothDrafts: z.literal(true),
    repairerSawProjectResultSummaries: z.literal(true),
    rawTaskRunsReadDuringRepair: z.literal(false),
    independentAnnotations: z.literal(false),
    humanAnnotations: z.literal(false),
  }).strict(),
  denominator: z.object({
    sourceDrafts: z.literal(2),
    uniqueUnits: z.literal(24),
    exactRevision2LabelMatches: z.literal(24),
  }).strict(),
  predictionCounts: z.object({
    "rules-sufficient-capability-supported": z.number().int().nonnegative(),
    "rules-sufficient-capability-missing": z.number().int().nonnegative(),
    "partial-semantic-choice-required": z.number().int().nonnegative(),
    "insufficient-information": z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(RoutingRowSchema).length(24),
  evidenceBoundary: z.object({
    developmentRoutingOnly: z.literal(true),
    completesOriginalQ1: z.literal(false),
    provesHumanAgreement: z.literal(false),
    provesClassificationAccuracy: z.literal(false),
    changesReadiness: z.literal(false),
  }).strict(),
  audit: z.object({
    modelCalls: z.literal(0),
    apiCalls: z.literal(0),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
  }).strict(),
}).strict().superRefine((routing, context) => {
  const ids = routing.rows.map((row) => row.unitId);
  if (new Set(ids).size !== 24) {
    context.addIssue({ code: "custom", path: ["rows"], message: "routing table must contain 24 unique units" });
  }
  const predictionTotal = Object.values(routing.predictionCounts).reduce((sum, value) => sum + value, 0);
  if (predictionTotal !== 24) {
    context.addIssue({ code: "custom", path: ["predictionCounts"], message: "prediction counts must sum to 24" });
  }
});
export type AiAssistedDevelopmentRouting = z.infer<typeof AiAssistedDevelopmentRoutingSchema>;

const DraftLabelSchema = z.object({
  sourcePackageId: z.string().min(1),
  unitId: z.string().min(1),
  verificationBasis: z.unknown(),
  constructionBasis: z.unknown(),
  executionConditions: z.unknown(),
  remainingSemanticChoices: z.unknown(),
  prediction: AutomationPredictionSchema,
}).strict();

const DraftSchema = z.object({
  schemaVersion: z.string().min(1),
  draftId: z.string().min(1),
  annotationPackage: z.object({
    packageId: z.literal("q1-development-annotation-package-002"),
    path: z.literal("benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json"),
    sha256: Sha256Schema,
  }).strict(),
  slot: z.enum(["A", "B"]),
  annotatorId: z.literal("ai-main-repair-20260907"),
  humanAnnotationEligible: z.literal(false),
  independenceAttested: z.literal(false),
  sawPeerLabelsBeforeSubmission: z.literal(true),
  resultEvidenceVisibleBeforeSubmission: z.literal(true),
  submittedAt: z.string().datetime({ offset: true }),
  labels: z.array(DraftLabelSchema).length(24),
}).strict();

const ChangeSchema = z.object({
  unitId: z.string().min(1),
  fields: z.array(z.object({
    field: z.string().min(1),
    before: z.unknown(),
    after: z.unknown(),
  }).strict()).min(1),
  rationale: z.object({
    verification: z.string().min(1),
    construction: z.string().min(1),
    execution: z.string().min(1),
    semanticBoundary: z.string().min(1),
  }).strict(),
}).strict();

const ChangesSchema = z.object({
  kind: z.string().min(1),
  changes: z.array(ChangeSchema).length(24),
  propagationChanges: z.array(z.object({
    unitId: z.string().min(1),
    from: AutomationPredictionSchema,
    to: AutomationPredictionSchema,
  }).strict()),
}).strict();

const PackageUnitSchema = z.object({
  unitId: z.string().min(1),
  sourcePackageId: z.string().min(1),
  sliceId: z.string().min(1),
  responsibilityId: z.string().min(1),
  unitKind: z.enum(["hard-requirement", "workflow-step"]),
  description: z.string().min(1),
  sourceLocators: z.array(z.object({ locator: z.string().min(1), purpose: z.string().min(1) }).strict()).min(1),
  dependsOnUnitIds: z.array(z.string().min(1)),
}).strict();

const PackageSchema = z.object({
  schemaVersion: z.literal("skill-ir-task-automation-development-annotation-package/v2"),
  packageId: z.literal("q1-development-annotation-package-002"),
  denominator: z.object({
    unitizationPolicy: z.string().min(1),
    sourceCount: z.number().int().positive(),
    unitCount: z.literal(24),
  }).passthrough(),
  units: z.array(PackageUnitSchema).length(24),
}).passthrough();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function workspacePath(workspaceRoot: string, path: string): string {
  const value = relative(resolve(workspaceRoot), resolve(path)).replaceAll("\\", "/");
  return SafeRelativePathSchema.parse(value);
}

async function readJsonWithDigest(path: string): Promise<{ raw: unknown; sha256: string }> {
  const bytes = await readFile(path);
  return { raw: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
}

function exactJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function namedUnknowns(classification: z.infer<typeof ClassificationRequirementSchema>): string[] {
  return [...new Set([
    ...classification.verificationBasis.gaps,
    ...classification.constructionBasis.gaps,
    ...classification.executionConditions.gaps,
  ])].sort();
}

export async function buildAiAssistedDevelopmentRouting(options: {
  rootDir: string;
  workspaceRoot: string;
  annotationRoot: string;
}): Promise<AiAssistedDevelopmentRouting> {
  const rootDir = resolve(options.rootDir);
  const workspaceRoot = resolve(options.workspaceRoot);
  const annotationRoot = resolve(options.annotationRoot);
  const packagePath = join(rootDir, "benchmarks", "skill-ir", "classification", "q1-development-annotation-package-v2.json");
  const capabilityPath = join(rootDir, "benchmarks", "skill-ir", "classification", "q2-current-capabilities-v1.json");
  const reviewStatusPath = join(annotationRoot, "review-status.md");
  const sourcePaths = (["a", "b"] as const).map((directory) => ({
    draftPath: join(annotationRoot, directory, "revision-2", "draft.json"),
    changePath: join(annotationRoot, directory, "revision-2", "changes.json"),
  }));

  const [packageFile, capabilityFile, reviewStatusBytes, ...sourceFiles] = await Promise.all([
    readJsonWithDigest(packagePath),
    readJsonWithDigest(capabilityPath),
    readFile(reviewStatusPath),
    ...sourcePaths.flatMap(({ draftPath, changePath }) => [readJsonWithDigest(draftPath), readJsonWithDigest(changePath)]),
  ]);
  const sourcePackage = PackageSchema.parse(packageFile.raw);
  if (packageFile.sha256 !== "197fb89fca2567e3367c9443b6a077ed45d826c24aa69b0d0e395515a8469ee1") {
    throw new Error("Q1 annotation package digest drift");
  }
  const capabilityProfile = CapabilityProfileSchema.parse(capabilityFile.raw);
  const drafts = [DraftSchema.parse(sourceFiles[0]!.raw), DraftSchema.parse(sourceFiles[2]!.raw)] as const;
  const changes = [ChangesSchema.parse(sourceFiles[1]!.raw), ChangesSchema.parse(sourceFiles[3]!.raw)] as const;
  if (drafts[0].slot !== "A" || drafts[1].slot !== "B") throw new Error("AI draft slot/order drift");
  if (drafts.some((draft) => draft.annotationPackage.sha256 !== packageFile.sha256)) {
    throw new Error("AI draft package digest binding drift");
  }
  const reviewStatusText = reviewStatusBytes.toString("utf8");
  for (const marker of [
    "同一协调 AI",
    "sawPeerLabelsBeforeSubmission=true",
    "resultEvidenceVisibleBeforeSubmission=true",
    "未读取目标运行原始结果",
  ]) {
    if (!reviewStatusText.includes(marker)) throw new Error(`review-status provenance marker missing: ${marker}`);
  }

  const labelMaps = [
    new Map(drafts[0].labels.map((label) => [label.unitId, label])),
    new Map(drafts[1].labels.map((label) => [label.unitId, label])),
  ] as const;
  const changeMaps = [
    new Map(changes[0].changes.map((change) => [change.unitId, change])),
    new Map(changes[1].changes.map((change) => [change.unitId, change])),
  ] as const;
  if (labelMaps.some((map) => map.size !== 24) || changeMaps.some((map) => map.size !== 24)) {
    throw new Error("AI draft label/change unit IDs must be unique");
  }

  const classifications = sourcePackage.units.map((unit) => {
    const left = labelMaps[0].get(unit.unitId);
    const right = labelMaps[1].get(unit.unitId);
    if (!left || !right) throw new Error(`AI revision-2 label missing: ${unit.unitId}`);
    if (!exactJson(left, right)) throw new Error(`AI revision-2 labels diverge: ${unit.unitId}`);
    if (left.sourcePackageId !== unit.sourcePackageId) throw new Error(`source package mismatch: ${unit.unitId}`);
    return ClassificationRequirementSchema.parse({
      requirementId: unit.unitId,
      unitKind: unit.unitKind,
      description: unit.description,
      dependsOn: unit.dependsOnUnitIds,
      verificationBasis: left.verificationBasis,
      constructionBasis: left.constructionBasis,
      executionConditions: left.executionConditions,
      remainingSemanticChoices: left.remainingSemanticChoices,
      prediction: left.prediction,
    });
  });
  deriveRequirementStates(classifications, capabilityProfile);

  const sourceDrafts = sourcePaths.map((paths, index) => ({
    slot: drafts[index]!.slot,
    draftId: drafts[index]!.draftId,
    draftPath: workspacePath(workspaceRoot, paths.draftPath),
    draftSha256: sourceFiles[index * 2]!.sha256,
    changePath: workspacePath(workspaceRoot, paths.changePath),
    changeSha256: sourceFiles[index * 2 + 1]!.sha256,
  })) as [
    { slot: "A"; draftId: string; draftPath: string; draftSha256: string; changePath: string; changeSha256: string },
    { slot: "B"; draftId: string; draftPath: string; draftSha256: string; changePath: string; changeSha256: string },
  ];

  const rows = sourcePackage.units.map((unit, unitIndex) => {
    const classification = classifications[unitIndex]!;
    const sourceRevisions = ([0, 1] as const).map((sourceIndex) => {
      const change = changeMaps[sourceIndex].get(unit.unitId);
      if (!change) throw new Error(`AI revision change missing: ${unit.unitId}`);
      const predictionChange = changes[sourceIndex].propagationChanges.find((entry) => entry.unitId === unit.unitId);
      return SourceRevisionSchema.parse({
        ...sourceDrafts[sourceIndex],
        changedFields: change.fields.map((field) => field.field),
        rationale: change.rationale,
        predictionChange: predictionChange ? { from: predictionChange.from, to: predictionChange.to } : null,
      });
    }) as [z.infer<typeof SourceRevisionSchema>, z.infer<typeof SourceRevisionSchema>];
    return RoutingRowSchema.parse({
      ...unit,
      classification,
      namedUnknowns: namedUnknowns(classification),
      sourceRevisions,
    });
  });

  const predictionCounts = {
    "rules-sufficient-capability-supported": 0,
    "rules-sufficient-capability-missing": 0,
    "partial-semantic-choice-required": 0,
    "insufficient-information": 0,
  };
  for (const row of rows) predictionCounts[row.classification.prediction] += 1;

  return AiAssistedDevelopmentRoutingSchema.parse({
    schemaVersion: AI_ASSISTED_DEVELOPMENT_ROUTING_SCHEMA_VERSION,
    identity: AI_ASSISTED_DEVELOPMENT_ROUTING_IDENTITY,
    frozenAt: "2026-09-07T08:00:00.000Z",
    sourcePackage: {
      packageId: sourcePackage.packageId,
      path: "benchmarks/skill-ir/classification/q1-development-annotation-package-v2.json",
      sha256: packageFile.sha256,
    },
    capabilityProfile: {
      profileId: capabilityProfile.profileId,
      path: "benchmarks/skill-ir/classification/q2-current-capabilities-v1.json",
      sha256: capabilityFile.sha256,
    },
    reviewStatus: {
      path: workspacePath(workspaceRoot, reviewStatusPath),
      sha256: sha256(reviewStatusBytes),
    },
    sourceDrafts,
    provenance: {
      commonRepairer: "ai-main-repair-20260907",
      repairerSawBothDrafts: true,
      repairerSawProjectResultSummaries: true,
      rawTaskRunsReadDuringRepair: false,
      independentAnnotations: false,
      humanAnnotations: false,
    },
    denominator: { sourceDrafts: 2, uniqueUnits: 24, exactRevision2LabelMatches: 24 },
    predictionCounts,
    rows,
    evidenceBoundary: {
      developmentRoutingOnly: true,
      completesOriginalQ1: false,
      provesHumanAgreement: false,
      provesClassificationAccuracy: false,
      changesReadiness: false,
    },
    audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 },
  });
}
