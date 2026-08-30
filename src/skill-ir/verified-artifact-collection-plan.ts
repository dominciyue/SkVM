import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
  RestrictedDomainPlanSchema,
  executeRestrictedDomainPlan,
} from "../benchmarks/skill-ir/automatic-restricted-domain-plan";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const SafeRelativePathSchema = z.string().min(1).max(160).refine(
  (path) => !isAbsolute(path)
    && !path.includes("\\")
    && !path.split("/").some((part) => !part || part === "." || part === ".."),
  { message: "path must be a safe POSIX-style relative path" },
);
const JsonPointerSchema = z.string().max(512).refine(
  (pointer) => pointer === "" || (pointer.startsWith("/") && !/(?:~(?![01]))/u.test(pointer)),
  { message: "invalid JSON Pointer" },
);
const TargetPointerSchema = JsonPointerSchema.refine((pointer) => pointer.startsWith("/"), {
  message: "collection targets must select a field rather than replace the document root",
});
const SourceEndpointSchema = z.object({
  path: SafeRelativePathSchema,
  pointer: JsonPointerSchema,
}).strict();
const TargetEndpointSchema = z.object({
  path: SafeRelativePathSchema,
  pointer: TargetPointerSchema,
}).strict();

const EnumerateObjectKeysStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("enumerate-json-object-keys"),
  source: SourceEndpointSchema,
  target: TargetEndpointSchema,
}).strict();

const SortDeduplicateStringsStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("sort-and-deduplicate-strings"),
  sources: z.array(SourceEndpointSchema).min(1).max(16),
  target: TargetEndpointSchema,
}).strict();

const CollectionStepSchema = z.discriminatedUnion("op", [
  EnumerateObjectKeysStepSchema,
  SortDeduplicateStringsStepSchema,
]);

export const VerifiedArtifactCollectionPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-verified-artifact-collection-plan/v1"),
  planId: IdentifierSchema,
  basePlan: RestrictedDomainPlanSchema,
  steps: z.array(CollectionStepSchema).min(1).max(32),
  audit: z.object({
    paidCalls: z.literal(0),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    skillSpecificBranches: z.literal(0),
  }).strict(),
}).strict().superRefine((plan, context) => {
  const ids = plan.steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["steps"], message: "collection step ids must be unique" });
  }
});

export type VerifiedArtifactCollectionPlan = z.infer<typeof VerifiedArtifactCollectionPlanSchema>;

type TaskPathBindings = {
  inputs: Array<{ path: string; access?: string }>;
  outputs: Array<{ path: string }>;
};

function contained(rootDir: string, relativePath: string): string {
  const safe = SafeRelativePathSchema.parse(relativePath);
  const root = resolve(rootDir);
  const target = resolve(root, ...safe.split("/"));
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(fromRoot)) throw new Error(`path escapes workdir: ${relativePath}`);
  return target;
}

function pointerSegments(pointer: string): string[] {
  JsonPointerSchema.parse(pointer);
  if (pointer === "") return [];
  return pointer.slice(1).split("/").map((segment) => segment.replace(/~1/gu, "/").replace(/~0/gu, "~"));
}

const ForbiddenPropertyNames = new Set(["__proto__", "prototype", "constructor"]);

function readPointer(document: unknown, pointer: string): unknown {
  let current = document;
  for (const segment of pointerSegments(pointer)) {
    if (ForbiddenPropertyNames.has(segment)) throw new Error(`forbidden JSON Pointer segment: ${segment}`);
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(segment)) throw new Error(`invalid array index in JSON Pointer: ${segment}`);
      const index = Number(segment);
      if (index >= current.length) throw new Error(`JSON Pointer does not exist: ${pointer}`);
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) throw new Error(`JSON Pointer does not exist: ${pointer}`);
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new Error(`JSON Pointer does not exist: ${pointer}`);
    }
  }
  return current;
}

function writePointer(document: unknown, pointer: string, value: unknown): void {
  const segments = pointerSegments(TargetPointerSchema.parse(pointer));
  const leaf = segments.pop()!;
  if (ForbiddenPropertyNames.has(leaf)) throw new Error(`forbidden JSON Pointer segment: ${leaf}`);
  let parent = document;
  for (const segment of segments) {
    if (ForbiddenPropertyNames.has(segment)) throw new Error(`forbidden JSON Pointer segment: ${segment}`);
    if (!parent || typeof parent !== "object" || Array.isArray(parent)
      || !Object.prototype.hasOwnProperty.call(parent, segment)) {
      throw new Error(`collection target parent does not exist: ${pointer}`);
    }
    parent = (parent as Record<string, unknown>)[segment];
  }
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
    throw new Error(`collection target parent must be a JSON object: ${pointer}`);
  }
  (parent as Record<string, unknown>)[leaf] = value;
}

async function readJson(workDir: string, path: string): Promise<unknown> {
  const bytes = await readFile(contained(workDir, path));
  if (bytes.byteLength > 262_144) throw new Error(`collection plan input exceeds 262144 bytes: ${path}`);
  return JSON.parse(bytes.toString("utf8"));
}

async function writeJsonAtomic(workDir: string, path: string, document: unknown): Promise<void> {
  const target = contained(workDir, path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.collection-plan.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function canonicalStrings(values: unknown[], stepId: string): string[] {
  const flattened: string[] = [];
  for (const value of values) {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error(`${stepId} sources must be arrays of strings`);
    }
    flattened.push(...value as string[]);
  }
  return [...new Set(flattened)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function validateBindings(plan: VerifiedArtifactCollectionPlan, taskDescription: TaskPathBindings): void {
  const readable = new Set(taskDescription.inputs.map((entry) => SafeRelativePathSchema.parse(entry.path)));
  const writable = new Set(taskDescription.outputs.map((entry) => SafeRelativePathSchema.parse(entry.path)));
  for (const step of plan.steps) {
    const sources = step.op === "enumerate-json-object-keys" ? [step.source] : step.sources;
    for (const source of sources) {
      if (!readable.has(source.path) && !writable.has(source.path)) {
        throw new Error(`undeclared collection source path: ${source.path}`);
      }
    }
    if (!writable.has(step.target.path)) {
      throw new Error(`undeclared collection target path: ${step.target.path}`);
    }
  }
}

export async function executeVerifiedArtifactCollectionPlan(options: {
  plan: VerifiedArtifactCollectionPlan | unknown;
  workDir: string;
  taskDescription: TaskPathBindings;
}): Promise<{ executedSteps: number; writtenPaths: string[] }> {
  const plan = VerifiedArtifactCollectionPlanSchema.parse(options.plan);
  validateBindings(plan, options.taskDescription);
  const readablePaths = options.taskDescription.inputs.map((entry) => entry.path);
  const writablePaths = options.taskDescription.outputs.map((entry) => entry.path);
  await executeRestrictedDomainPlan({ workDir: options.workDir, plan: plan.basePlan, readablePaths, writablePaths });

  const written = new Set<string>();
  for (const step of plan.steps) {
    const targetDocument = await readJson(options.workDir, step.target.path);
    let value: unknown;
    if (step.op === "enumerate-json-object-keys") {
      const sourceDocument = step.source.path === step.target.path
        ? targetDocument
        : await readJson(options.workDir, step.source.path);
      const sourceValue = readPointer(sourceDocument, step.source.pointer);
      if (!sourceValue || typeof sourceValue !== "object" || Array.isArray(sourceValue)) {
        throw new Error(`${step.id} source must be a JSON object`);
      }
      value = Object.keys(sourceValue as Record<string, unknown>);
    } else {
      const values = [];
      for (const source of step.sources) {
        const sourceDocument = source.path === step.target.path
          ? targetDocument
          : await readJson(options.workDir, source.path);
        values.push(readPointer(sourceDocument, source.pointer));
      }
      value = canonicalStrings(values, step.id);
    }
    writePointer(targetDocument, step.target.pointer, value);
    await writeJsonAtomic(options.workDir, step.target.path, targetDocument);
    written.add(step.target.path);
  }
  return { executedSteps: plan.steps.length, writtenPaths: [...written].sort() };
}
