import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  AutomaticOutputConstructionPlanSchema,
  AutomaticOutputUnresolvedSchema,
  executeAutomaticOutputConstructionPlan,
  type AutomaticOutputConstructionPlan,
} from "./automatic-output-construction";
import {
  StructuralExecutionPlanSchema,
  type StructuralExecutionPlan,
} from "./automatic-structural-execution";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (isAbsolute(value) || value.includes("\\")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}, "path must be a safe POSIX relative path");
const JsonPointerSchema = z.string().regex(/^(?:\/(?:[^~]|~[01])*)*$/u);

const JsonPointerEndpointSchema = z.object({
  targetRef: IdentifierSchema,
  path: SafeRelativePathSchema,
  jsonPointer: JsonPointerSchema,
}).strict();

const JsonPointerCopyOperationSchema = z.object({
  operation: z.literal("copy-json-value"),
  source: JsonPointerEndpointSchema,
  target: JsonPointerEndpointSchema,
}).strict();

export const JsonPointerCopyDeclarationSchema = z.object({
  schemaVersion: z.literal("skill-ir-json-pointer-copy-declaration/v1"),
  operations: z.array(JsonPointerCopyOperationSchema).min(1).max(8),
}).strict().superRefine((declaration, context) => {
  const targets = declaration.operations.map((entry) =>
    `${entry.target.targetRef}:${entry.target.path}:${entry.target.jsonPointer}`);
  if (new Set(targets).size !== targets.length) {
    context.addIssue({ code: "custom", message: "JSON Pointer copy targets must be unique" });
  }
});

export type JsonPointerCopyDeclaration = z.infer<typeof JsonPointerCopyDeclarationSchema>;

export const AutomaticJsonPointerConstructionPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-json-pointer-construction-plan/v1"),
  skillId: IdentifierSchema,
  primitive: z.literal("copy-json-value"),
  status: z.enum(["complete", "partial"]),
  operations: z.array(JsonPointerCopyOperationSchema).min(1),
  resolvedUnresolved: z.array(AutomaticOutputUnresolvedSchema),
  remainingUnresolved: z.array(AutomaticOutputUnresolvedSchema),
  audit: z.object({
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    serializedRuntimeValues: z.literal(0),
    skillSpecificBranches: z.literal(0),
  }).strict(),
}).strict().superRefine((plan, context) => {
  if (plan.operations.length !== plan.resolvedUnresolved.length) {
    context.addIssue({ code: "custom", message: "every JSON Pointer copy must resolve exactly one unresolved field" });
  }
  if (plan.status === "complete" && plan.remainingUnresolved.length > 0) {
    context.addIssue({ code: "custom", message: "complete JSON Pointer construction cannot retain unresolved work" });
  }
  if (plan.status === "partial" && plan.remainingUnresolved.length === 0) {
    context.addIssue({ code: "custom", message: "partial JSON Pointer construction requires unresolved work" });
  }
});

export type AutomaticJsonPointerConstructionPlan = z.infer<typeof AutomaticJsonPointerConstructionPlanSchema>;

export const AutomaticJsonPointerConstructionExecutionSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-json-pointer-construction-execution/v1"),
  status: z.enum(["complete", "partial"]),
  generatedFiles: z.array(SafeRelativePathSchema),
  baseProjectedFieldCount: z.number().int().nonnegative(),
  pointerCopiedFieldCount: z.number().int().positive(),
  remainingUnresolvedCount: z.number().int().nonnegative(),
  paidCalls: z.literal(0),
  heldOutAccesses: z.literal(0),
  serializedRuntimeValues: z.literal(0),
  skillSpecificBranches: z.literal(0),
}).strict();

export type AutomaticJsonPointerConstructionExecution = z.infer<typeof AutomaticJsonPointerConstructionExecutionSchema>;

const AutomaticJsonPointerRelationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-json-pointer-relation-report/v1"),
  status: z.enum(["pass", "fail"]),
  primitive: z.literal("copy-json-value"),
  relationCount: z.number().int().positive(),
  errors: z.array(z.object({
    code: z.literal("JSON_POINTER_COPY_MISMATCH"),
    relationIndex: z.number().int().nonnegative(),
  }).strict()),
  skillSpecificBranches: z.literal(0),
}).strict().superRefine((report, context) => {
  if (report.status === "pass" && report.errors.length > 0) {
    context.addIssue({ code: "custom", message: "passing JSON Pointer relation report cannot contain errors" });
  }
  if (report.status === "fail" && report.errors.length === 0) {
    context.addIssue({ code: "custom", message: "failing JSON Pointer relation report requires errors" });
  }
});

function resolveContained(rootDir: string, relativePath: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafeRelativePathSchema.parse(relativePath));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes workdir: ${relativePath}`);
  return candidate;
}

function decodePointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function pointerGet(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  return pointer.slice(1).split("/").reduce<unknown>((current, raw) => {
    const key = decodePointerSegment(raw);
    if (Array.isArray(current) && /^(?:0|[1-9][0-9]*)$/u.test(key)) return current[Number.parseInt(key, 10)];
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function pointerSet(root: Record<string, unknown>, pointer: string, value: unknown): void {
  if (pointer === "") throw new Error("JSON Pointer copy cannot replace the output document root");
  const segments = pointer.slice(1).split("/").map(decodePointerSegment);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) current[segment] = value;
    else {
      const next = current[segment];
      current = typeof next === "object" && next !== null && !Array.isArray(next)
        ? next as Record<string, unknown>
        : current[segment] = {};
    }
  }
}

async function readJson(workDir: string, path: string): Promise<unknown> {
  const candidate = resolveContained(workDir, path);
  const root = await realpath(resolve(workDir));
  const resolved = await realpath(candidate);
  const fromRoot = relative(root, resolved);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot) || !(await lstat(resolved)).isFile()) {
    throw new Error(`JSON Pointer endpoint is not a contained file: ${path}`);
  }
  return JSON.parse(await readFile(resolved, "utf8")) as unknown;
}

function topLevelTargetField(pointer: string): string | undefined {
  const segments = pointer.startsWith("/") ? pointer.slice(1).split("/") : [];
  return segments.length === 1 ? decodePointerSegment(segments[0]!) : undefined;
}

function unresolvedKey(entry: z.infer<typeof AutomaticOutputUnresolvedSchema>): string {
  return `${entry.targetRef}:${entry.path ?? ""}:${entry.field ?? ""}:${entry.reason}`;
}

export async function compileAutomaticJsonPointerConstructionPlan(options: {
  workDir: string;
  structuralPlan: StructuralExecutionPlan;
  basePlan: AutomaticOutputConstructionPlan;
  declaration: JsonPointerCopyDeclaration;
}): Promise<AutomaticJsonPointerConstructionPlan> {
  const structuralPlan = StructuralExecutionPlanSchema.parse(options.structuralPlan);
  const basePlan = AutomaticOutputConstructionPlanSchema.parse(options.basePlan);
  const declaration = JsonPointerCopyDeclarationSchema.parse(options.declaration);
  if (structuralPlan.skillId !== basePlan.skillId) throw new Error("JSON Pointer construction identity mismatch");

  const structuralTargets = new Map(structuralPlan.targets.map((entry) => [entry.id, entry]));
  const baseOutputs = new Set(basePlan.outputs.map((entry) => `${entry.targetRef}:${entry.path}`));
  const unresolved = new Map(basePlan.unresolved.map((entry) => [unresolvedKey(entry), entry]));
  const resolvedKeys = new Set<string>();
  const resolvedUnresolved: AutomaticJsonPointerConstructionPlan["resolvedUnresolved"] = [];

  for (const entry of declaration.operations) {
    const sourceTarget = structuralTargets.get(entry.source.targetRef);
    if (!sourceTarget || sourceTarget.role !== "input" || sourceTarget.access !== "read-only"
      || sourceTarget.format !== "json" || !sourceTarget.paths.includes(entry.source.path)) {
      throw new Error(`JSON Pointer source must be a declared read-only JSON input: ${entry.source.targetRef}`);
    }
    const target = structuralTargets.get(entry.target.targetRef);
    const field = topLevelTargetField(entry.target.jsonPointer);
    if (!target || target.role !== "output" || target.format !== "json"
      || target.structure?.kind !== "json-object" || !target.paths.includes(entry.target.path)
      || !field || !target.structure.requiredFields.includes(field)
      || !baseOutputs.has(`${entry.target.targetRef}:${entry.target.path}`)) {
      throw new Error(`JSON Pointer target must be a declared base-plan JSON-object field: ${entry.target.targetRef}`);
    }
    const matchingKey = unresolvedKey({
      targetRef: entry.target.targetRef,
      path: entry.target.path,
      field,
      reason: "source-field-missing",
    });
    const matching = unresolved.get(matchingKey);
    if (!matching) {
      throw new Error(`JSON Pointer target must match an existing source-field-missing unresolved: ${matchingKey}`);
    }
    const sourceValue = pointerGet(await readJson(options.workDir, entry.source.path), entry.source.jsonPointer);
    if (sourceValue === undefined) {
      throw new Error(`JSON Pointer source is unavailable: ${entry.source.path}${entry.source.jsonPointer}`);
    }
    resolvedKeys.add(matchingKey);
    resolvedUnresolved.push(matching);
  }

  const remainingUnresolved = basePlan.unresolved.filter((entry) => !resolvedKeys.has(unresolvedKey(entry)));
  return AutomaticJsonPointerConstructionPlanSchema.parse({
    schemaVersion: "skill-ir-automatic-json-pointer-construction-plan/v1",
    skillId: structuralPlan.skillId,
    primitive: "copy-json-value",
    status: remainingUnresolved.length === 0 ? "complete" : "partial",
    operations: declaration.operations,
    resolvedUnresolved,
    remainingUnresolved,
    audit: {
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
      serializedRuntimeValues: 0,
      skillSpecificBranches: 0,
    },
  });
}

export async function executeAutomaticJsonPointerConstructionPlan(
  workDir: string,
  rawBasePlan: AutomaticOutputConstructionPlan,
  rawPlan: AutomaticJsonPointerConstructionPlan,
): Promise<AutomaticJsonPointerConstructionExecution> {
  const basePlan = AutomaticOutputConstructionPlanSchema.parse(rawBasePlan);
  const plan = AutomaticJsonPointerConstructionPlanSchema.parse(rawPlan);
  if (basePlan.skillId !== plan.skillId) throw new Error("JSON Pointer execution identity mismatch");
  const baseExecution = await executeAutomaticOutputConstructionPlan(workDir, basePlan);
  const outputDocuments = new Map<string, Record<string, unknown>>();
  for (const operation of plan.operations) {
    const sourceValue = pointerGet(await readJson(workDir, operation.source.path), operation.source.jsonPointer);
    if (sourceValue === undefined) {
      throw new Error(`JSON Pointer source is unavailable: ${operation.source.path}${operation.source.jsonPointer}`);
    }
    let output = outputDocuments.get(operation.target.path);
    if (!output) {
      const parsed = await readJson(workDir, operation.target.path);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`JSON Pointer target is not an object: ${operation.target.path}`);
      }
      output = parsed as Record<string, unknown>;
      outputDocuments.set(operation.target.path, output);
    }
    pointerSet(output, operation.target.jsonPointer, sourceValue);
  }
  for (const [path, value] of outputDocuments) {
    const destination = resolveContained(workDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  return AutomaticJsonPointerConstructionExecutionSchema.parse({
    schemaVersion: "skill-ir-automatic-json-pointer-construction-execution/v1",
    status: plan.status,
    generatedFiles: baseExecution.generatedFiles,
    baseProjectedFieldCount: baseExecution.generatedFieldCount,
    pointerCopiedFieldCount: plan.operations.length,
    remainingUnresolvedCount: plan.remainingUnresolved.length,
    paidCalls: 0,
    heldOutAccesses: 0,
    serializedRuntimeValues: 0,
    skillSpecificBranches: 0,
  });
}

export async function evaluateAutomaticJsonPointerRelations(
  workDir: string,
  rawPlan: AutomaticJsonPointerConstructionPlan,
) {
  const plan = AutomaticJsonPointerConstructionPlanSchema.parse(rawPlan);
  const errors: Array<{ code: "JSON_POINTER_COPY_MISMATCH"; relationIndex: number }> = [];
  for (const [index, operation] of plan.operations.entries()) {
    const [source, output] = await Promise.all([
      readJson(workDir, operation.source.path),
      readJson(workDir, operation.target.path),
    ]);
    const sourceValue = pointerGet(source, operation.source.jsonPointer);
    const outputValue = pointerGet(output, operation.target.jsonPointer);
    if (sourceValue === undefined || outputValue === undefined || !isDeepStrictEqual(sourceValue, outputValue)) {
      errors.push({ code: "JSON_POINTER_COPY_MISMATCH", relationIndex: index });
    }
  }
  return AutomaticJsonPointerRelationReportSchema.parse({
    schemaVersion: "skill-ir-automatic-json-pointer-relation-report/v1",
    status: errors.length === 0 ? "pass" : "fail",
    primitive: "copy-json-value",
    relationCount: plan.operations.length,
    errors,
    skillSpecificBranches: 0,
  });
}

const ReuseObservationSchema = z.object({
  caseId: IdentifierSchema,
  primitive: z.literal("copy-json-value"),
  status: z.enum(["pass", "fail"]),
  skillSpecificBranches: z.number().int().nonnegative(),
}).strict();

export function evaluateAutomaticJsonPointerReuseGate(
  rawObservations: Array<z.input<typeof ReuseObservationSchema>>,
) {
  const observations = rawObservations.map((entry) => ReuseObservationSchema.parse(entry));
  if (observations.some((entry) => entry.skillSpecificBranches > 0)) {
    throw new Error("JSON Pointer reuse cannot include a skill-specific branch");
  }
  const distinctPassingCases = new Set(observations
    .filter((entry) => entry.status === "pass")
    .map((entry) => entry.caseId)).size;
  return {
    status: distinctPassingCases >= 2 ? "passed" as const : "blocked-single-case" as const,
    primitive: "copy-json-value" as const,
    distinctPassingCases,
    requiredDistinctCases: 2 as const,
    coreBranchDelta: 0 as const,
  };
}
