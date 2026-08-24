import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
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

const SourceFieldEndpointSchema = z.object({
  targetRef: IdentifierSchema,
  path: SafeRelativePathSchema,
  jsonPointer: JsonPointerSchema,
}).strict();

const OutputAssignmentSchema = z.object({
  targetJsonPointer: JsonPointerSchema,
  source: SourceFieldEndpointSchema,
  discovery: z.literal("unique-top-level-field-name"),
}).strict();

const OutputConstructionSchema = z.object({
  targetRef: IdentifierSchema,
  path: SafeRelativePathSchema,
  assignments: z.array(OutputAssignmentSchema).min(1),
}).strict();

export const AutomaticOutputUnresolvedSchema = z.object({
  targetRef: IdentifierSchema,
  path: SafeRelativePathSchema.optional(),
  field: z.string().min(1).optional(),
  reason: z.enum([
    "unsupported-output-format",
    "unsupported-output-structure",
    "non-concrete-output",
    "source-field-missing",
    "ambiguous-source-field",
  ]),
}).strict();

export const AutomaticOutputConstructionPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-output-construction-plan/v1"),
  skillId: IdentifierSchema,
  primitive: z.literal("source-field-projection"),
  status: z.enum(["complete", "partial"]),
  outputs: z.array(OutputConstructionSchema),
  unresolved: z.array(AutomaticOutputUnresolvedSchema),
  audit: z.object({
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    skillSpecificBranches: z.literal(0),
  }).strict(),
}).strict().superRefine((plan, context) => {
  const outputKeys = plan.outputs.map((entry) => `${entry.targetRef}:${entry.path}`);
  if (new Set(outputKeys).size !== outputKeys.length) {
    context.addIssue({ code: "custom", message: "constructed outputs must be unique" });
  }
  if (plan.status === "complete" && plan.unresolved.length > 0) {
    context.addIssue({ code: "custom", message: "complete construction cannot contain unresolved work" });
  }
  if (plan.status === "partial" && plan.unresolved.length === 0) {
    context.addIssue({ code: "custom", message: "partial construction requires unresolved work" });
  }
});

export type AutomaticOutputConstructionPlan = z.infer<typeof AutomaticOutputConstructionPlanSchema>;

export const AutomaticOutputConstructionExecutionSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-output-construction-execution/v1"),
  status: z.enum(["complete", "partial"]),
  generatedFiles: z.array(SafeRelativePathSchema),
  generatedFieldCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  paidCalls: z.literal(0),
  heldOutAccesses: z.literal(0),
  skillSpecificBranches: z.literal(0),
}).strict();

export type AutomaticOutputConstructionExecution = z.infer<typeof AutomaticOutputConstructionExecutionSchema>;

const AutomaticOutputRelationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-output-relation-report/v1"),
  status: z.enum(["pass", "fail"]),
  primitive: z.literal("source-field-projection"),
  relationCount: z.number().int().nonnegative(),
  errors: z.array(z.object({
    code: z.literal("SOURCE_FIELD_PROJECTION_MISMATCH"),
    relationIndex: z.number().int().nonnegative(),
  }).strict()),
  skillSpecificBranches: z.literal(0),
}).strict().superRefine((report, context) => {
  if (report.status === "pass" && report.errors.length > 0) {
    context.addIssue({ code: "custom", message: "passing relation report cannot contain errors" });
  }
  if (report.status === "fail" && report.errors.length === 0) {
    context.addIssue({ code: "custom", message: "failing relation report requires errors" });
  }
});

type SourceDocument = {
  targetRef: string;
  path: string;
  value: Record<string, unknown>;
};

function resolveContained(rootDir: string, relativePath: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafeRelativePathSchema.parse(relativePath));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes workdir: ${relativePath}`);
  return candidate;
}

function escapePointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function pointerGet(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  return pointer.slice(1).split("/").reduce<unknown>((current, raw) => {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function pointerSet(root: Record<string, unknown>, pointer: string, value: unknown): void {
  if (pointer === "") throw new Error("output projection cannot replace the document root");
  const segments = pointer.slice(1).split("/").map((raw) => raw.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current = root;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      current[segment] = value;
    } else {
      const next = current[segment];
      if (typeof next === "object" && next !== null && !Array.isArray(next)) current = next as Record<string, unknown>;
      else current = current[segment] = {};
    }
  }
}

async function readJsonObject(workDir: string, path: string): Promise<Record<string, unknown> | undefined> {
  const candidate = resolveContained(workDir, path);
  try {
    const root = await realpath(resolve(workDir));
    const resolved = await realpath(candidate);
    const fromRoot = relative(root, resolved);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot) || !(await lstat(resolved)).isFile()) return undefined;
    const value = JSON.parse(await readFile(resolved, "utf8")) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

async function sourceDocuments(
  workDir: string,
  structuralPlan: StructuralExecutionPlan,
): Promise<SourceDocument[]> {
  const documents: SourceDocument[] = [];
  for (const target of structuralPlan.targets.filter((entry) =>
    entry.role === "input" && entry.access === "read-only" && entry.format === "json")) {
    for (const path of target.paths) {
      const value = await readJsonObject(workDir, path);
      if (value) documents.push({ targetRef: target.id, path, value });
    }
  }
  return documents;
}

export async function compileAutomaticOutputConstructionPlan(options: {
  workDir: string;
  structuralPlan: StructuralExecutionPlan;
}): Promise<AutomaticOutputConstructionPlan> {
  const structuralPlan = StructuralExecutionPlanSchema.parse(options.structuralPlan);
  const sources = await sourceDocuments(options.workDir, structuralPlan);
  const outputs: AutomaticOutputConstructionPlan["outputs"] = [];
  const unresolved: AutomaticOutputConstructionPlan["unresolved"] = [];

  for (const target of structuralPlan.targets.filter((entry) => entry.role === "output")) {
    const path = target.paths.length === 1 && target.prefixes.length === 0 ? target.paths[0] : undefined;
    if (!path) {
      unresolved.push({ targetRef: target.id, reason: "non-concrete-output" });
      continue;
    }
    if (target.format !== "json") {
      unresolved.push({ targetRef: target.id, path, reason: "unsupported-output-format" });
      continue;
    }
    if (target.structure?.kind !== "json-object") {
      unresolved.push({ targetRef: target.id, path, reason: "unsupported-output-structure" });
      continue;
    }

    const assignments: AutomaticOutputConstructionPlan["outputs"][number]["assignments"] = [];
    for (const field of target.structure.requiredFields) {
      const matches = sources.filter((source) => Object.hasOwn(source.value, field));
      if (matches.length === 0) {
        unresolved.push({ targetRef: target.id, path, field, reason: "source-field-missing" });
      } else if (matches.length > 1) {
        unresolved.push({ targetRef: target.id, path, field, reason: "ambiguous-source-field" });
      } else {
        const source = matches[0]!;
        assignments.push({
          targetJsonPointer: `/${escapePointerSegment(field)}`,
          source: {
            targetRef: source.targetRef,
            path: source.path,
            jsonPointer: `/${escapePointerSegment(field)}`,
          },
          discovery: "unique-top-level-field-name",
        });
      }
    }
    if (assignments.length > 0) outputs.push({ targetRef: target.id, path, assignments });
  }

  return AutomaticOutputConstructionPlanSchema.parse({
    schemaVersion: "skill-ir-automatic-output-construction-plan/v1",
    skillId: structuralPlan.skillId,
    primitive: "source-field-projection",
    status: unresolved.length === 0 ? "complete" : "partial",
    outputs,
    unresolved,
    audit: { paidCalls: 0, heldOutAccesses: 0, evaluatorPayloadAccesses: 0, skillSpecificBranches: 0 },
  });
}

export async function executeAutomaticOutputConstructionPlan(
  workDir: string,
  rawPlan: AutomaticOutputConstructionPlan,
): Promise<AutomaticOutputConstructionExecution> {
  const plan = AutomaticOutputConstructionPlanSchema.parse(rawPlan);
  const generatedFiles: string[] = [];
  let generatedFieldCount = 0;
  for (const output of plan.outputs) {
    const value: Record<string, unknown> = {};
    for (const assignment of output.assignments) {
      const source = await readJsonObject(workDir, assignment.source.path);
      const projected = pointerGet(source, assignment.source.jsonPointer);
      if (projected === undefined) throw new Error(`source projection is unavailable: ${assignment.source.path}${assignment.source.jsonPointer}`);
      pointerSet(value, assignment.targetJsonPointer, projected);
      generatedFieldCount += 1;
    }
    const destination = resolveContained(workDir, output.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    generatedFiles.push(output.path);
  }
  return AutomaticOutputConstructionExecutionSchema.parse({
    schemaVersion: "skill-ir-automatic-output-construction-execution/v1",
    status: plan.status,
    generatedFiles,
    generatedFieldCount,
    unresolvedCount: plan.unresolved.length,
    paidCalls: 0,
    heldOutAccesses: 0,
    skillSpecificBranches: 0,
  });
}

export async function evaluateAutomaticOutputRelations(
  workDir: string,
  rawPlan: AutomaticOutputConstructionPlan,
) {
  const plan = AutomaticOutputConstructionPlanSchema.parse(rawPlan);
  const relations = plan.outputs.flatMap((output) => output.assignments.map((assignment) => ({ output, assignment })));
  const errors: Array<{ code: "SOURCE_FIELD_PROJECTION_MISMATCH"; relationIndex: number }> = [];
  for (const [index, relation] of relations.entries()) {
    const [source, output] = await Promise.all([
      readJsonObject(workDir, relation.assignment.source.path),
      readJsonObject(workDir, relation.output.path),
    ]);
    const sourceValue = pointerGet(source, relation.assignment.source.jsonPointer);
    const outputValue = pointerGet(output, relation.assignment.targetJsonPointer);
    if (sourceValue === undefined || outputValue === undefined || !isDeepStrictEqual(sourceValue, outputValue)) {
      errors.push({ code: "SOURCE_FIELD_PROJECTION_MISMATCH", relationIndex: index });
    }
  }
  return AutomaticOutputRelationReportSchema.parse({
    schemaVersion: "skill-ir-automatic-output-relation-report/v1",
    status: errors.length === 0 ? "pass" : "fail",
    primitive: "source-field-projection",
    relationCount: relations.length,
    errors,
    skillSpecificBranches: 0,
  });
}

const ReuseObservationSchema = z.object({
  caseId: IdentifierSchema,
  primitive: z.literal("source-field-projection"),
  status: z.enum(["pass", "fail"]),
  skillSpecificBranches: z.number().int().nonnegative(),
}).strict();

export function evaluateAutomaticOutputReuseGate(rawObservations: Array<z.input<typeof ReuseObservationSchema>>) {
  const observations = rawObservations.map((entry) => ReuseObservationSchema.parse(entry));
  if (observations.some((entry) => entry.skillSpecificBranches > 0)) {
    throw new Error("domain reuse cannot include a skill-specific branch");
  }
  const distinctPassingCases = new Set(observations
    .filter((entry) => entry.status === "pass")
    .map((entry) => entry.caseId)).size;
  return {
    status: distinctPassingCases >= 2 ? "passed" as const : "blocked-single-case" as const,
    primitive: "source-field-projection" as const,
    distinctPassingCases,
    requiredDistinctCases: 2 as const,
    coreBranchDelta: 0 as const,
  };
}
