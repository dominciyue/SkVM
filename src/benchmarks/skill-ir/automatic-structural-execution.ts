import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  InitialWorkdirManifestSchema,
  snapshotWorkdir,
  type InitialWorkdirManifest,
  type WorkdirManifestEntry,
} from "../../core/workdir-manifest";
import type { DomainAutomaticConstructionResult } from "./automatic-domain-construction";
import { SkillArtifactValidationReportSchema } from "./validated-artifact-runtime";

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (isAbsolute(value) || value.includes("\\")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "path must be a safe POSIX relative path");
const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const GenericStructuralPredicateSchema = z.enum([
  "input-integrity",
  "output-presence",
  "exact-output-set",
  "json-shape",
]);

export const StructuralTargetBindingSchema = z.object({
  targetRef: IdentifierSchema,
  paths: z.array(SafeRelativePathSchema).min(1),
}).strict();

const JsonObjectStructureSchema = z.object({
  kind: z.literal("json-object"),
  requiredFields: z.array(z.string()),
  allowAdditionalFields: z.boolean(),
}).strict();

const StructuralOutputStructureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("opaque") }).strict(),
  JsonObjectStructureSchema,
  z.object({ kind: z.literal("markdown"), requiredSemanticRoles: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal("source-file"), language: z.string() }).strict(),
]);

const StructuralTargetSchema = z.object({
  id: IdentifierSchema,
  role: z.enum(["input", "output"]),
  access: z.enum(["read-only", "read-write"]).optional(),
  required: z.boolean(),
  format: z.enum(["json", "yaml", "markdown", "text", "source-file", "directory"]),
  paths: z.array(SafeRelativePathSchema),
  prefixes: z.array(SafeRelativePathSchema),
  structure: StructuralOutputStructureSchema.optional(),
}).strict();

const StructuralPredicatePlanSchema = z.object({
  criterionId: IdentifierSchema,
  predicate: GenericStructuralPredicateSchema,
  targetRefs: z.array(IdentifierSchema).min(1),
  assertion: z.string().min(1),
}).strict();

export const StructuralExecutionPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-structural-execution-plan/v1"),
  skillId: IdentifierSchema,
  targets: z.array(StructuralTargetSchema),
  predicates: z.array(StructuralPredicatePlanSchema),
  audit: z.object({
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    skillSpecificBranches: z.literal(0),
  }).strict(),
}).strict();

export type StructuralExecutionPlan = z.infer<typeof StructuralExecutionPlanSchema>;
export type StructuralTargetBinding = z.infer<typeof StructuralTargetBindingSchema>;

function isSymbolicPath(value: string): boolean {
  return /^<[^<>]+>$/u.test(value);
}

function normalizePrefix(value: string): string {
  return value.replace(/\/+$/u, "");
}

export function compileStructuralExecutionPlan(
  candidate: DomainAutomaticConstructionResult,
  rawBindings: StructuralTargetBinding[],
): StructuralExecutionPlan {
  const bindings = rawBindings.map((entry) => StructuralTargetBindingSchema.parse(entry));
  const bindingByTarget = new Map(bindings.map((entry) => [entry.targetRef, entry.paths]));
  if (bindingByTarget.size !== bindings.length) throw new Error("structural target bindings must be unique");

  const inputTargets = candidate.contract.inputs.map((input) => {
    const bound = bindingByTarget.get(input.id);
    if (isSymbolicPath(input.path) && !bound) throw new Error(`symbolic input ${input.id} requires a concrete binding`);
    return {
      id: input.id,
      role: "input" as const,
      access: input.access,
      required: input.required,
      format: input.format,
      paths: bound ?? (input.format === "directory" ? [] : [input.path]),
      prefixes: bound || input.format !== "directory" ? [] : [normalizePrefix(input.path)],
    };
  });
  const outputTargets = candidate.contract.outputs.map((output) => {
    const bound = bindingByTarget.get(output.id);
    if (isSymbolicPath(output.path) && !bound) throw new Error(`symbolic output ${output.id} requires a concrete binding`);
    return {
      id: output.id,
      role: "output" as const,
      required: output.required,
      format: output.format,
      paths: bound ?? (output.format === "directory" ? [] : [output.path]),
      prefixes: bound || output.format !== "directory" ? [] : [normalizePrefix(output.path)],
      structure: output.structure,
    };
  });
  const knownTargets = new Set([...inputTargets, ...outputTargets].map((entry) => entry.id));
  for (const binding of bindings) {
    if (!knownTargets.has(binding.targetRef)) throw new Error(`binding references unknown target ${binding.targetRef}`);
  }

  const predicates = candidate.validationPlan.predicates
    .filter((entry) => entry.loweringStatus === "generic-deterministic")
    .map((entry) => ({
      criterionId: entry.criterionId,
      predicate: GenericStructuralPredicateSchema.parse(entry.predicate),
      targetRefs: entry.targetRefs,
      assertion: entry.assertion,
    }));
  return StructuralExecutionPlanSchema.parse({
    schemaVersion: "skill-ir-structural-execution-plan/v1",
    skillId: candidate.contract.skillId,
    targets: [...inputTargets, ...outputTargets],
    predicates,
    audit: { paidCalls: 0, heldOutAccesses: 0, skillSpecificBranches: 0 },
  });
}

type ValidationError = z.infer<typeof SkillArtifactValidationReportSchema>["errors"][number];

function byPath(entries: readonly WorkdirManifestEntry[]): Map<string, WorkdirManifestEntry> {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

function targetFiles(
  target: StructuralExecutionPlan["targets"][number],
  entries: readonly WorkdirManifestEntry[],
): string[] {
  const files = entries.filter((entry) => entry.type === "file").map((entry) => entry.path);
  return [...new Set([
    ...target.paths,
    ...target.prefixes.flatMap((prefix) => files.filter((entry) => entry.startsWith(`${prefix}/`))),
  ])].sort((left, right) => left.localeCompare(right, "en"));
}

function targetEntries(
  target: StructuralExecutionPlan["targets"][number],
  entries: readonly WorkdirManifestEntry[],
): WorkdirManifestEntry[] {
  const exact = new Set(target.paths);
  return entries.filter((entry) => exact.has(entry.path)
    || target.prefixes.some((prefix) => entry.path === prefix || entry.path.startsWith(`${prefix}/`)));
}

function error(code: string, contractRef: string, relativePath?: string): ValidationError {
  return { code, contractRef, ...(relativePath ? { relativePath } : {}) };
}

function evaluateInputIntegrity(options: {
  criterionId: string;
  targets: StructuralExecutionPlan["targets"];
  initial: readonly WorkdirManifestEntry[];
  current: readonly WorkdirManifestEntry[];
}): ValidationError[] {
  const currentByPath = byPath(options.current);
  const initialPaths = new Set(options.initial.map((entry) => entry.path));
  const errors: ValidationError[] = [];
  for (const target of options.targets) {
    const selected = targetEntries(target, options.initial);
    if (selected.length === 0 && target.required) {
      errors.push(error("INPUT_TARGET_MISSING", options.criterionId, target.paths[0] ?? target.prefixes[0]));
      continue;
    }
    for (const initialEntry of selected) {
      const currentEntry = currentByPath.get(initialEntry.path);
      if (!currentEntry || currentEntry.type !== initialEntry.type) {
        errors.push(error("INPUT_MISSING", options.criterionId, initialEntry.path));
      } else if (initialEntry.type === "file" && currentEntry.type === "file"
        && initialEntry.sha256 !== currentEntry.sha256) {
        errors.push(error("INPUT_MODIFIED", options.criterionId, initialEntry.path));
      }
    }
    for (const currentEntry of targetEntries(target, options.current)) {
      if (!initialPaths.has(currentEntry.path)) {
        errors.push(error("INPUT_ADDED", options.criterionId, currentEntry.path));
      }
    }
  }
  return errors;
}

function evaluateOutputPresence(options: {
  criterionId: string;
  targets: StructuralExecutionPlan["targets"];
  current: readonly WorkdirManifestEntry[];
  explicit: boolean;
}): ValidationError[] {
  const currentByPath = byPath(options.current);
  const errors: ValidationError[] = [];
  for (const target of options.targets) {
    if (!options.explicit && !target.required) continue;
    for (const outputPath of target.paths) {
      if (currentByPath.get(outputPath)?.type !== "file") {
        errors.push(error("OUTPUT_MISSING", options.criterionId, outputPath));
      }
    }
    for (const prefix of target.prefixes) {
      const present = options.current.some((entry) => entry.type === "file" && entry.path.startsWith(`${prefix}/`));
      if (!present) errors.push(error("OUTPUT_MISSING", options.criterionId, prefix));
    }
  }
  return errors;
}

function allowedDirectory(path: string, outputPaths: ReadonlySet<string>, outputPrefixes: readonly string[]): boolean {
  return outputPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    || [...outputPaths].some((outputPath) => outputPath.startsWith(`${path}/`));
}

function evaluateExactOutputSet(options: {
  criterionId: string;
  targets: StructuralExecutionPlan["targets"];
  initial: readonly WorkdirManifestEntry[];
  current: readonly WorkdirManifestEntry[];
}): ValidationError[] {
  const initialByPath = byPath(options.initial);
  const currentByPath = byPath(options.current);
  const outputPaths = new Set(options.targets.flatMap((target) => target.paths));
  const outputPrefixes = options.targets.flatMap((target) => target.prefixes);
  const errors: ValidationError[] = [];

  for (const initialEntry of options.initial) {
    const currentEntry = currentByPath.get(initialEntry.path);
    if (!currentEntry || currentEntry.type !== initialEntry.type) {
      errors.push(error("INITIAL_ENTRY_CHANGED", options.criterionId, initialEntry.path));
    } else if (initialEntry.type === "file" && currentEntry.type === "file"
      && initialEntry.sha256 !== currentEntry.sha256
      && !outputPaths.has(initialEntry.path)
      && !outputPrefixes.some((prefix) => initialEntry.path.startsWith(`${prefix}/`))) {
      errors.push(error("UNDECLARED_INPUT_MODIFIED", options.criterionId, initialEntry.path));
    }
  }
  for (const currentEntry of options.current) {
    if (initialByPath.has(currentEntry.path)) continue;
    const allowed = currentEntry.type === "file"
      ? outputPaths.has(currentEntry.path) || outputPrefixes.some((prefix) => currentEntry.path.startsWith(`${prefix}/`))
      : allowedDirectory(currentEntry.path, outputPaths, outputPrefixes);
    if (!allowed) errors.push(error("UNEXPECTED_ENTRY", options.criterionId, currentEntry.path));
  }
  errors.push(...evaluateOutputPresence({
    criterionId: options.criterionId,
    targets: options.targets,
    current: options.current,
    explicit: false,
  }));
  return errors;
}

async function parseJsonFile(workDir: string, relativePath: string): Promise<unknown | undefined> {
  const root = await realpath(resolve(workDir));
  const candidate = resolve(root, relativePath);
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path escapes workdir: ${relativePath}`);
  try {
    const resolved = await realpath(candidate);
    const resolvedRel = relative(root, resolved);
    if (resolvedRel.startsWith("..") || isAbsolute(resolvedRel) || !(await lstat(resolved)).isFile()) return undefined;
    return JSON.parse(await readFile(resolved, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function evaluateJsonShape(options: {
  workDir: string;
  criterionId: string;
  targets: StructuralExecutionPlan["targets"];
  current: readonly WorkdirManifestEntry[];
}): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  for (const target of options.targets) {
    const structure = target.structure;
    if (structure?.kind !== "json-object") continue;
    const paths = targetFiles(target, options.current);
    for (const outputPath of paths) {
      const value = await parseJsonFile(options.workDir, outputPath);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(error("JSON_OBJECT_INVALID", options.criterionId, outputPath));
        continue;
      }
      const fields = Object.keys(value);
      for (const requiredField of structure.requiredFields) {
        if (!Object.hasOwn(value, requiredField)) {
          errors.push(error("JSON_REQUIRED_FIELD_MISSING", options.criterionId, outputPath));
        }
      }
      if (!structure.allowAdditionalFields
        && fields.some((field) => !structure.requiredFields.includes(field))) {
        errors.push(error("JSON_ADDITIONAL_FIELD", options.criterionId, outputPath));
      }
    }
  }
  return errors;
}

export async function evaluateStructuralExecutionPlan(options: {
  workDir: string;
  initialManifest: InitialWorkdirManifest;
  plan: StructuralExecutionPlan;
}): Promise<z.infer<typeof SkillArtifactValidationReportSchema>> {
  const plan = StructuralExecutionPlanSchema.parse(options.plan);
  const initial = InitialWorkdirManifestSchema.parse(options.initialManifest).entries;
  const current = await snapshotWorkdir(options.workDir);
  const targetById = new Map(plan.targets.map((target) => [target.id, target]));
  const errors: ValidationError[] = [];
  for (const predicate of plan.predicates) {
    const targets = predicate.targetRefs.map((targetRef) => {
      const target = targetById.get(targetRef);
      if (!target) throw new Error(`predicate ${predicate.criterionId} references missing target ${targetRef}`);
      return target;
    });
    if (predicate.predicate === "input-integrity") {
      errors.push(...evaluateInputIntegrity({ criterionId: predicate.criterionId, targets, initial, current }));
    } else if (predicate.predicate === "output-presence") {
      errors.push(...evaluateOutputPresence({ criterionId: predicate.criterionId, targets, current, explicit: true }));
    } else if (predicate.predicate === "exact-output-set") {
      errors.push(...evaluateExactOutputSet({ criterionId: predicate.criterionId, targets, initial, current }));
    } else {
      errors.push(...await evaluateJsonShape({ workDir: options.workDir, criterionId: predicate.criterionId, targets, current }));
    }
  }
  const uniqueErrors = [...new Map(errors.map((entry) => [JSON.stringify(entry), entry])).values()]
    .sort((left, right) => (left.contractRef ?? "").localeCompare(right.contractRef ?? "", "en")
      || (left.relativePath ?? "").localeCompare(right.relativePath ?? "", "en")
      || left.code.localeCompare(right.code, "en"));
  return SkillArtifactValidationReportSchema.parse({
    schemaVersion: "skill-artifact-validation-report/v1",
    status: uniqueErrors.length === 0 ? "pass" : "fail",
    errors: uniqueErrors,
  });
}

const JsonPointerEndpointSchema = z.object({
  path: SafeRelativePathSchema,
  jsonPointer: z.string().regex(/^(?:\/(?:[^~]|~[01])*)*$/u),
}).strict();

export const CrossArtifactConsistencyParametersSchema = z.object({
  schemaVersion: z.literal("skill-ir-cross-artifact-consistency-parameters/v1"),
  comparisons: z.array(z.object({
    left: JsonPointerEndpointSchema,
    right: JsonPointerEndpointSchema,
    relation: z.enum(["deep-equal", "set-equal"]),
  }).strict()).min(1),
}).strict();

function jsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  return pointer.slice(1).split("/").reduce<unknown>((current, segment) => {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function setEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const normalize = (values: unknown[]) => values.map((entry) => JSON.stringify(entry)).sort();
  return isDeepStrictEqual(normalize(left), normalize(right));
}

export async function evaluateCrossArtifactConsistencyPrimitive(
  workDir: string,
  rawParameters: z.input<typeof CrossArtifactConsistencyParametersSchema>,
): Promise<{
  status: "pass" | "fail";
  errors: Array<{ code: "CROSS_ARTIFACT_MISMATCH"; comparisonIndex: number }>;
  skillSpecificBranches: 0;
}> {
  const parameters = CrossArtifactConsistencyParametersSchema.parse(rawParameters);
  const errors: Array<{ code: "CROSS_ARTIFACT_MISMATCH"; comparisonIndex: number }> = [];
  for (const [index, comparison] of parameters.comparisons.entries()) {
    const [leftDocument, rightDocument] = await Promise.all([
      parseJsonFile(workDir, comparison.left.path),
      parseJsonFile(workDir, comparison.right.path),
    ]);
    const left = jsonPointer(leftDocument, comparison.left.jsonPointer);
    const right = jsonPointer(rightDocument, comparison.right.jsonPointer);
    const matches = comparison.relation === "deep-equal" ? isDeepStrictEqual(left, right) : setEqual(left, right);
    if (!matches || left === undefined || right === undefined) {
      errors.push({ code: "CROSS_ARTIFACT_MISMATCH", comparisonIndex: index });
    }
  }
  return { status: errors.length === 0 ? "pass" : "fail", errors, skillSpecificBranches: 0 };
}
