import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { validateSkillIR } from "../../skill-ir/validate";
import {
  AutomaticConstructionInputSchema,
  constructSkillCandidates,
} from "./automatic-construction";
import { sha256Bytes } from "./source-fixture";

export const THIN_TASK_DESCRIPTION_LIMITS = Object.freeze({
  maxLoc: 80,
  maxSemanticEntries: 40,
});

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const FieldNameSchema = z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$.-]{0,63}$/u);
const ForbiddenEvidencePattern = /(?:\bscorer\b|\bevaluator\b|held[-_ ]?out|\bgold\b|answer[-_ ]?key|model output)/iu;
const PublicTextSchema = z.string().min(1).max(300).refine((value) => !ForbiddenEvidencePattern.test(value), {
  message: "task descriptions cannot contain evaluation, answer, model-output, or held-out evidence",
});
const SafeRelativePathSchema = z.string().min(1).max(160).refine(
  (path) => !isAbsolute(path) && !/(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(path),
  { message: "path must remain relative and contained" },
);
const ArtifactFormatSchema = z.enum(["json", "yaml", "markdown", "text", "source-file", "directory"]);
const TaskKindSchema = z.enum(["workspace-transformation", "analysis-report", "artifact-generation"]);

const TaskInputSchema = z.object({
  id: IdentifierSchema,
  path: SafeRelativePathSchema,
  format: ArtifactFormatSchema,
  access: z.enum(["read-only", "read-write"]),
  required: z.boolean(),
}).strict();

const OutputStructureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("opaque") }).strict(),
  z.object({
    kind: z.literal("json-object"),
    requiredFields: z.array(FieldNameSchema).max(16),
    allowAdditionalFields: z.boolean(),
  }).strict(),
  z.object({
    kind: z.literal("markdown"),
    requiredSemanticRoles: z.array(PublicTextSchema).max(12),
  }).strict(),
  z.object({
    kind: z.literal("source-file"),
    language: PublicTextSchema,
  }).strict(),
]);

const TaskOutputSchema = z.object({
  id: IdentifierSchema,
  path: SafeRelativePathSchema,
  format: ArtifactFormatSchema,
  required: z.boolean(),
  structure: OutputStructureSchema,
}).strict();

export const DeclarativePredicateSchema = z.enum([
  "input-integrity",
  "output-presence",
  "exact-output-set",
  "json-shape",
  "source-grounding",
  "cross-artifact-consistency",
  "runtime-behavior",
  "content-fidelity",
]);

const PassCriterionSchema = z.object({
  id: IdentifierSchema,
  predicate: DeclarativePredicateSchema,
  targetRefs: z.array(IdentifierSchema).min(1).max(8),
  statement: PublicTextSchema,
}).strict();

export const ThinTaskDescriptionSchema = z.object({
  schemaVersion: z.literal("skill-ir-task-description/v1"),
  descriptionId: IdentifierSchema,
  taskKind: TaskKindSchema,
  inputs: z.array(TaskInputSchema).min(1).max(8),
  outputs: z.array(TaskOutputSchema).min(1).max(8),
  passCriteria: z.array(PassCriterionSchema).min(1).max(12),
}).strict().superRefine((description, context) => {
  const refs = new Set([...description.inputs, ...description.outputs].map((entry) => entry.id));
  const ids = [...description.inputs, ...description.outputs, ...description.passCriteria].map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "input, output, and criterion ids must be globally unique" });
  }
  for (const criterion of description.passCriteria) {
    for (const targetRef of criterion.targetRefs) {
      if (!refs.has(targetRef)) {
        context.addIssue({
          code: "custom",
          message: `criterion ${criterion.id} references missing task ABI target ${targetRef}`,
        });
      }
    }
  }
});

const AuthoringMeasurementSchema = z.object({
  measurementStartedAt: z.string().datetime(),
  measurementCompletedAt: z.string().datetime(),
  humanMinutes: z.number().int().min(0).max(240),
}).strict().superRefine((measurement, context) => {
  if (Date.parse(measurement.measurementCompletedAt) < Date.parse(measurement.measurementStartedAt)) {
    context.addIssue({ code: "custom", message: "authoring completion precedes its prospective start" });
  }
});

const TaskDescriptionRefSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  authoring: AuthoringMeasurementSchema,
}).strict();

export const DomainAutomaticConstructionInputSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-automatic-construction-input/v1"),
  source: AutomaticConstructionInputSchema.shape.source,
  taskDescription: TaskDescriptionRefSchema,
}).strict();

const ThinnessSchema = z.object({
  status: z.enum(["within-limit", "declaration-heavy"]),
  loc: z.number().int().nonnegative(),
  maxLoc: z.literal(THIN_TASK_DESCRIPTION_LIMITS.maxLoc),
  semanticEntries: z.number().int().nonnegative(),
  maxSemanticEntries: z.literal(THIN_TASK_DESCRIPTION_LIMITS.maxSemanticEntries),
  reasons: z.array(z.string()),
}).strict();

const DomainContractCandidateSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-contract-candidate/v1"),
  skillId: IdentifierSchema,
  taskDescriptionId: IdentifierSchema,
  taskKind: TaskKindSchema,
  intent: z.string().min(1),
  inputs: z.array(TaskInputSchema),
  outputs: z.array(TaskOutputSchema),
  passCriteria: z.array(PassCriterionSchema),
  sourceRules: z.array(z.object({ id: z.string(), sourceText: z.string() }).strict()),
}).strict();

const PredicatePlanSchema = z.object({
  criterionId: IdentifierSchema,
  predicate: DeclarativePredicateSchema,
  targetRefs: z.array(IdentifierSchema),
  assertion: z.string().min(1),
  loweringStatus: z.enum(["generic-deterministic", "domain-runtime-required"]),
}).strict();

const SemanticParitySchema = z.object({
  status: z.literal("not-established"),
  reason: z.literal("shadow comparison does not execute task outputs or a qualified domain runtime"),
}).strict();

const DomainValidationPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-construction-validation-plan/v1"),
  predicates: z.array(PredicatePlanSchema),
  deterministicGate: z.object({
    status: z.enum(["passed", "failed"]),
    checks: z.array(z.object({ id: IdentifierSchema, status: z.enum(["passed", "failed"]), detail: z.string() }).strict()),
  }).strict(),
  semanticParity: SemanticParitySchema,
}).strict();

const HumanGapSchema = z.object({
  id: IdentifierSchema,
  kind: z.enum(["domain-runtime", "artifact-compiler"]),
  targetRefs: z.array(IdentifierSchema),
  reason: z.string().min(1),
}).strict();

const SemanticUnitSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["workflow-step", "rule", "output-description", "input", "output", "pass-criterion"]),
  value: z.string().min(1),
}).strict();

const SemanticAccountingSchema = z.object({
  fromSkillSource: z.object({ units: z.array(SemanticUnitSchema) }).strict(),
  fromTaskDeclaration: z.object({ units: z.array(SemanticUnitSchema) }).strict(),
  automationProduced: z.object({
    contractBindings: z.number().int().nonnegative(),
    irTaskAbiBindings: z.number().int().nonnegative(),
    validationPredicates: z.number().int().nonnegative(),
    genericDeterministicPredicates: z.number().int().nonnegative(),
  }).strict(),
  stillRequiresHuman: z.array(HumanGapSchema),
}).strict();

const DomainPackageCandidateSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-package-candidate/v1"),
  status: z.literal("non-executable"),
  executionPlan: z.null(),
  artifacts: z.array(z.object({ id: IdentifierSchema, path: SafeRelativePathSchema }).strict()),
  blockers: z.array(HumanGapSchema),
}).strict();

export const DomainAutomaticConstructionResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-domain-automatic-construction-result/v1"),
  contract: DomainContractCandidateSchema,
  baseIr: SkillIRSchema,
  validationPlan: DomainValidationPlanSchema,
  packageCandidate: DomainPackageCandidateSchema,
  thinness: ThinnessSchema,
  semanticAccounting: SemanticAccountingSchema,
  semanticParity: SemanticParitySchema,
  audit: z.object({
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    readPaths: z.tuple([SafeRelativePathSchema, SafeRelativePathSchema]),
  }).strict(),
}).strict();

export type ThinTaskDescription = z.infer<typeof ThinTaskDescriptionSchema>;
export type DomainAutomaticConstructionInput = z.input<typeof DomainAutomaticConstructionInputSchema>;
export type DomainAutomaticConstructionResult = z.infer<typeof DomainAutomaticConstructionResultSchema>;

const GenericDeterministicPredicates = new Set<z.infer<typeof DeclarativePredicateSchema>>([
  "input-integrity",
  "output-presence",
  "exact-output-set",
  "json-shape",
]);

function containedPath(rootDir: string, path: string): string {
  const absoluteRoot = resolve(rootDir);
  const absolutePath = resolve(absoluteRoot, path);
  const relativePath = relative(absoluteRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`path escapes root: ${path}`);
  }
  return absolutePath;
}

function measureThinness(sourceText: string, description: ThinTaskDescription): z.infer<typeof ThinnessSchema> {
  const loc = sourceText.split(/\r?\n/u).length;
  const structuralEntries = description.outputs.reduce((count, output) => {
    if (output.structure.kind === "json-object") return count + output.structure.requiredFields.length;
    if (output.structure.kind === "markdown") return count + output.structure.requiredSemanticRoles.length;
    return count;
  }, 0);
  const semanticEntries = description.inputs.length + description.outputs.length
    + description.passCriteria.length + structuralEntries;
  const reasons: string[] = [];
  if (loc > THIN_TASK_DESCRIPTION_LIMITS.maxLoc) {
    reasons.push(`loc ${loc} exceeds ${THIN_TASK_DESCRIPTION_LIMITS.maxLoc}`);
  }
  if (semanticEntries > THIN_TASK_DESCRIPTION_LIMITS.maxSemanticEntries) {
    reasons.push(`semantic entries ${semanticEntries} exceeds ${THIN_TASK_DESCRIPTION_LIMITS.maxSemanticEntries}`);
  }
  return ThinnessSchema.parse({
    status: reasons.length === 0 ? "within-limit" : "declaration-heavy",
    loc,
    maxLoc: THIN_TASK_DESCRIPTION_LIMITS.maxLoc,
    semanticEntries,
    maxSemanticEntries: THIN_TASK_DESCRIPTION_LIMITS.maxSemanticEntries,
    reasons,
  });
}

function buildDomainIr(sourceIr: SkillIR, description: ThinTaskDescription): SkillIR {
  const checkIds = description.passCriteria.map((criterion) => `check-${criterion.id}`);
  const outputIds = description.outputs.map((output) => output.id);
  const lastStepIndex = sourceIr.steps.length - 1;
  return SkillIRSchema.parse({
    ...sourceIr,
    inputs: description.inputs.map((input) => ({
      id: input.id,
      description: `${input.path} (${input.format}, ${input.access})`,
      required: input.required,
    })),
    outputs: description.outputs.map((output) => ({
      id: output.id,
      description: `${output.path} (${output.format}, ${output.structure.kind})`,
      required: output.required,
    })),
    steps: sourceIr.steps.map((step, index) => index === lastStepIndex ? {
      ...step,
      produces: [...new Set([...step.produces, ...outputIds])],
      successCheckRefs: [...new Set([...step.successCheckRefs, ...checkIds])],
    } : step),
    checks: description.passCriteria.map((criterion) => ({
      id: `check-${criterion.id}`,
      name: criterion.id,
      kind: criterion.predicate === "input-integrity" ? "rule-violation" : "output",
      targetRef: criterion.targetRefs[0]!,
      assertion: `${criterion.predicate}: ${criterion.statement}`,
      onFailure: "report",
    })),
  });
}

function sourceUnits(ir: SkillIR) {
  return [
    ...ir.steps.map((step) => ({ id: step.id, kind: "workflow-step" as const, value: step.description })),
    ...ir.rules.map((rule) => ({ id: rule.id, kind: "rule" as const, value: rule.sourceText })),
    ...ir.outputs.map((output) => ({ id: output.id, kind: "output-description" as const, value: output.description })),
  ];
}

function declarationUnits(description: ThinTaskDescription) {
  return [
    ...description.inputs.map((input) => ({ id: input.id, kind: "input" as const, value: input.path })),
    ...description.outputs.map((output) => ({ id: output.id, kind: "output" as const, value: output.path })),
    ...description.passCriteria.map((criterion) => ({
      id: criterion.id,
      kind: "pass-criterion" as const,
      value: criterion.statement,
    })),
  ];
}

function buildHumanGaps(description: ThinTaskDescription): z.infer<typeof HumanGapSchema>[] {
  const runtimeGaps = description.passCriteria
    .filter((criterion) => !GenericDeterministicPredicates.has(criterion.predicate))
    .map((criterion) => ({
      id: `runtime-${criterion.id}`,
      kind: "domain-runtime" as const,
      targetRefs: criterion.targetRefs,
      reason: `${criterion.id} requires a domain runtime implementation: ${criterion.statement}`,
    }));
  const outputIds = description.outputs.map((output) => output.id);
  const outputPaths = description.outputs.map((output) => output.path).join(", ");
  return [
    ...runtimeGaps,
    {
      id: `package-${description.outputs[0]!.id}`,
      kind: "artifact-compiler" as const,
      targetRefs: outputIds,
      reason: `no qualified compiler emits ${outputPaths} and binds its domain-runtime validation`,
    },
  ];
}

const DomainBindingCandidateSchema = z.object({
  contract: DomainContractCandidateSchema,
  baseIr: SkillIRSchema,
  validationPlan: z.object({ predicates: z.array(PredicatePlanSchema) }).passthrough(),
}).passthrough();

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function verifyDomainConstructionBindings(
  rawCandidate: unknown,
  rawDescription: unknown,
): { errors: string[] } {
  const candidate = DomainBindingCandidateSchema.parse(rawCandidate);
  const description = ThinTaskDescriptionSchema.parse(rawDescription);
  const errors: string[] = [];
  if (!sameJson(candidate.contract.inputs, description.inputs)) {
    errors.push("domain contract input bindings differ from the task declaration");
  }
  if (!sameJson(candidate.contract.outputs, description.outputs)) {
    errors.push("domain contract output bindings differ from the task declaration");
  }
  if (!sameJson(candidate.contract.passCriteria, description.passCriteria)) {
    errors.push("domain contract pass criteria differ from the task declaration");
  }
  if (!sameJson(candidate.baseIr.inputs.map((entry) => entry.id), description.inputs.map((entry) => entry.id))) {
    errors.push("Skill IR input ABI differs from the task declaration");
  }
  if (!sameJson(candidate.baseIr.outputs.map((entry) => entry.id), description.outputs.map((entry) => entry.id))) {
    errors.push("Skill IR output ABI differs from the task declaration");
  }
  const expectedChecks = description.passCriteria.map((criterion) => ({
    id: `check-${criterion.id}`,
    targetRef: criterion.targetRefs[0]!,
    assertion: `${criterion.predicate}: ${criterion.statement}`,
  }));
  const actualChecks = candidate.baseIr.checks.map((check) => ({
    id: check.id,
    targetRef: check.targetRef,
    assertion: check.assertion,
  }));
  if (!sameJson(actualChecks, expectedChecks)) {
    errors.push("Skill IR check bindings differ from the task declaration");
  }
  const expectedPredicates = description.passCriteria.map((criterion) => ({
    criterionId: criterion.id,
    predicate: criterion.predicate,
    targetRefs: criterion.targetRefs,
    assertion: criterion.statement,
    loweringStatus: GenericDeterministicPredicates.has(criterion.predicate)
      ? "generic-deterministic"
      : "domain-runtime-required",
  }));
  if (!sameJson(candidate.validationPlan.predicates, expectedPredicates)) {
    errors.push("validation-plan predicate bindings differ from the task declaration");
  }
  errors.push(...validateSkillIR(candidate.baseIr).errors);
  return { errors };
}

export async function constructDomainSkillCandidates(
  rootDir: string,
  rawInput: DomainAutomaticConstructionInput,
): Promise<DomainAutomaticConstructionResult> {
  const input = DomainAutomaticConstructionInputSchema.parse(rawInput);
  const sourceOnly = await constructSkillCandidates(rootDir, {
    schemaVersion: "skill-ir-automatic-construction-input/v1",
    source: input.source,
  });
  const descriptionBytes = await readFile(containedPath(rootDir, input.taskDescription.path));
  const actualDescriptionSha256 = sha256Bytes(descriptionBytes);
  if (actualDescriptionSha256 !== input.taskDescription.sha256) {
    throw new Error(`task description digest mismatch: expected ${input.taskDescription.sha256}, received ${actualDescriptionSha256}`);
  }
  const descriptionText = descriptionBytes.toString("utf8");
  const description = ThinTaskDescriptionSchema.parse(JSON.parse(descriptionText));
  const thinness = measureThinness(descriptionText, description);
  const baseIr = buildDomainIr(sourceOnly.baseIr, description);
  const predicates = description.passCriteria.map((criterion) => ({
    criterionId: criterion.id,
    predicate: criterion.predicate,
    targetRefs: criterion.targetRefs,
    assertion: criterion.statement,
    loweringStatus: GenericDeterministicPredicates.has(criterion.predicate)
      ? "generic-deterministic" as const
      : "domain-runtime-required" as const,
  }));
  const humanGaps = buildHumanGaps(description);
  const semanticParity = SemanticParitySchema.parse({
    status: "not-established",
    reason: "shadow comparison does not execute task outputs or a qualified domain runtime",
  });
  const contract = {
    schemaVersion: "skill-ir-domain-contract-candidate/v1" as const,
    skillId: sourceOnly.contract.skillId,
    taskDescriptionId: description.descriptionId,
    taskKind: description.taskKind,
    intent: sourceOnly.contract.intent,
    inputs: description.inputs,
    outputs: description.outputs,
    passCriteria: description.passCriteria,
    sourceRules: sourceOnly.baseIr.rules.map((rule) => ({ id: rule.id, sourceText: rule.sourceText })),
  };
  const bindingVerification = verifyDomainConstructionBindings({
    contract,
    baseIr,
    validationPlan: { predicates },
  }, description);
  const deterministicChecks = [
    { id: "source-digest", status: "passed" as const, detail: input.source.sha256 },
    { id: "declaration-digest", status: "passed" as const, detail: input.taskDescription.sha256 },
    {
      id: "declaration-thinness",
      status: thinness.status === "within-limit" ? "passed" as const : "failed" as const,
      detail: thinness.status,
    },
    {
      id: "domain-bindings",
      status: bindingVerification.errors.length === 0 ? "passed" as const : "failed" as const,
      detail: bindingVerification.errors.length === 0 ? "contract, IR, and plan bindings agree" : bindingVerification.errors.join("; "),
    },
  ];
  const result = {
    schemaVersion: "skill-ir-domain-automatic-construction-result/v1" as const,
    contract,
    baseIr,
    validationPlan: {
      schemaVersion: "skill-ir-domain-construction-validation-plan/v1" as const,
      predicates,
      deterministicGate: {
        status: deterministicChecks.every((check) => check.status === "passed") ? "passed" as const : "failed" as const,
        checks: deterministicChecks,
      },
      semanticParity,
    },
    packageCandidate: {
      schemaVersion: "skill-ir-domain-package-candidate/v1" as const,
      status: "non-executable" as const,
      executionPlan: null,
      artifacts: [
        { id: "skill-markdown", path: "skill.md" },
        { id: "skill-ir", path: "skill-ir.json" },
        { id: "domain-contract", path: "domain-contract.json" },
        { id: "validation-plan", path: "validation-plan.json" },
      ],
      blockers: humanGaps,
    },
    thinness,
    semanticAccounting: {
      fromSkillSource: { units: sourceUnits(sourceOnly.baseIr) },
      fromTaskDeclaration: { units: declarationUnits(description) },
      automationProduced: {
        contractBindings: description.inputs.length + description.outputs.length + description.passCriteria.length,
        irTaskAbiBindings: description.inputs.length + description.outputs.length,
        validationPredicates: description.passCriteria.length,
        genericDeterministicPredicates: predicates.filter((predicate) => predicate.loweringStatus === "generic-deterministic").length,
      },
      stillRequiresHuman: humanGaps,
    },
    semanticParity,
    audit: {
      paidCalls: 0 as const,
      heldOutAccesses: 0 as const,
      evaluatorPayloadAccesses: 0 as const,
      readPaths: [input.source.path, input.taskDescription.path] as const,
    },
  };
  return DomainAutomaticConstructionResultSchema.parse(result);
}
