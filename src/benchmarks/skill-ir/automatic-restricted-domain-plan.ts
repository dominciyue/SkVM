import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const SafePathSchema = z.string().min(1).max(240).refine((value) =>
  !isAbsolute(value)
  && !value.includes("\\")
  && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."), {
  message: "path must be a contained POSIX-style relative path",
});
const RegexFlagsSchema = z.string().max(6).regex(/^(?!.*(.).*\1)[gimsu]*$/u);
const RegexPatternSchema = z.string().min(1).max(512);
const RegisterSchema = IdentifierSchema;

const ScalarLiteralSchema = z.union([z.string().max(4096), z.number().finite(), z.boolean(), z.null()]);
const ValueExpressionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ref"), ref: RegisterSchema }).strict(),
  z.object({ kind: z.literal("literal"), value: ScalarLiteralSchema }).strict(),
]);

const ConditionalSchema = z.object({ when: RegisterSchema.optional() });

const ReadTextStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("read-text"),
  path: SafePathSchema,
}).strict();
const ReadJsonStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("read-json"),
  path: SafePathSchema,
}).strict();
const JsonPointerStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("json-pointer"),
  source: RegisterSchema,
  pointer: z.string().max(512).regex(/^(?:|\/(?:[^~\/]|~[01])*)$/u),
}).strict();
const ParseKeyValueStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("parse-key-value-lines"),
  path: SafePathSchema,
  keyPattern: RegexPatternSchema,
}).strict();
const RegexFindFilesStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("regex-find-files"),
  includePathPattern: RegexPatternSchema,
  contentPattern: RegexPatternSchema,
  flags: RegexFlagsSchema,
  captures: z.array(IdentifierSchema).min(1).max(8),
}).strict();
const RegexTestStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("regex-test"),
  source: RegisterSchema,
  pattern: RegexPatternSchema,
  flags: RegexFlagsSchema,
}).strict();
const PluckStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("pluck"),
  source: RegisterSchema,
  field: IdentifierSchema,
}).strict();
const FilterRegexStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("filter-regex"),
  source: RegisterSchema,
  field: IdentifierSchema.optional(),
  pattern: RegexPatternSchema,
  flags: RegexFlagsSchema,
  keep: z.enum(["matching", "non-matching"]),
}).strict();
const ProjectRecordsStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("project-records"),
  source: RegisterSchema,
  fields: z.array(IdentifierSchema).min(1).max(8),
}).strict();
const SetOperationStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("set-operation"),
  operator: z.enum(["intersection", "difference", "union"]),
  left: RegisterSchema,
  right: RegisterSchema,
}).strict();
const BooleanStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("boolean"),
  operator: z.enum(["and", "or", "not"]),
  inputs: z.array(RegisterSchema).min(1).max(8),
}).strict().superRefine((step, context) => {
  if (step.operator === "not" && step.inputs.length !== 1) {
    context.addIssue({ code: "custom", message: "boolean not requires exactly one input" });
  }
});
const ChooseStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("choose"),
  condition: RegisterSchema,
  whenTrue: ValueExpressionSchema,
  whenFalse: ValueExpressionSchema,
}).strict();
const WriteJsonStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("write-json"),
  path: SafePathSchema,
  fields: z.array(z.object({
    key: z.string().min(1).max(128),
    value: ValueExpressionSchema,
  }).strict()).min(1).max(64),
}).merge(ConditionalSchema).strict().superRefine((step, context) => {
  const keys = step.fields.map((entry) => entry.key);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "write-json field keys must be unique" });
});
const WriteTextTemplateStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("write-text-template"),
  path: SafePathSchema,
  template: z.string().max(16_384),
  bindings: z.array(z.object({
    token: IdentifierSchema,
    value: ValueExpressionSchema,
    encoding: z.enum(["text", "json"]),
  }).strict()).max(32),
}).merge(ConditionalSchema).strict().superRefine((step, context) => {
  const tokens = step.bindings.map((entry) => entry.token);
  if (new Set(tokens).size !== tokens.length) context.addIssue({ code: "custom", message: "template binding tokens must be unique" });
  for (const token of tokens) {
    if (!step.template.includes(`{{${token}}}`)) {
      context.addIssue({ code: "custom", message: `template does not contain binding token ${token}` });
    }
  }
});
const CopyTextStepSchema = z.object({
  id: IdentifierSchema,
  op: z.literal("copy-text"),
  source: RegisterSchema,
  path: SafePathSchema,
}).merge(ConditionalSchema).strict();

export const RestrictedDomainPlanStepSchema = z.union([
  ReadTextStepSchema,
  ReadJsonStepSchema,
  JsonPointerStepSchema,
  ParseKeyValueStepSchema,
  RegexFindFilesStepSchema,
  RegexTestStepSchema,
  PluckStepSchema,
  FilterRegexStepSchema,
  ProjectRecordsStepSchema,
  SetOperationStepSchema,
  BooleanStepSchema,
  ChooseStepSchema,
  WriteJsonStepSchema,
  WriteTextTemplateStepSchema,
  CopyTextStepSchema,
]);

function expressionRefs(value: z.infer<typeof ValueExpressionSchema>): string[] {
  return value.kind === "ref" ? [value.ref] : [];
}

function stepRefs(step: z.infer<typeof RestrictedDomainPlanStepSchema>): string[] {
  const conditional = "when" in step && step.when ? [step.when] : [];
  switch (step.op) {
    case "read-text":
    case "read-json":
    case "parse-key-value-lines":
    case "regex-find-files":
      return conditional;
    case "json-pointer":
    case "regex-test":
    case "pluck":
    case "filter-regex":
    case "project-records":
    case "copy-text":
      return [step.source, ...conditional];
    case "set-operation":
      return [step.left, step.right, ...conditional];
    case "boolean":
      return [...step.inputs, ...conditional];
    case "choose":
      return [step.condition, ...expressionRefs(step.whenTrue), ...expressionRefs(step.whenFalse), ...conditional];
    case "write-json":
      return [...step.fields.flatMap((entry) => expressionRefs(entry.value)), ...conditional];
    case "write-text-template":
      return [...step.bindings.flatMap((entry) => expressionRefs(entry.value)), ...conditional];
  }
}

export const RestrictedDomainPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-restricted-domain-plan/v1"),
  planId: IdentifierSchema,
  steps: z.array(RestrictedDomainPlanStepSchema).min(1).max(64),
  audit: z.object({
    paidCalls: z.literal(1),
    retries: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
    skillSpecificBranches: z.literal(0),
  }).strict(),
}).strict().superRefine((plan, context) => {
  const seen = new Set<string>();
  const writePaths = new Set<string>();
  for (const [index, step] of plan.steps.entries()) {
    if (seen.has(step.id)) {
      context.addIssue({ code: "custom", path: ["steps", index, "id"], message: `duplicate step id ${step.id}` });
    }
    for (const ref of stepRefs(step)) {
      if (!seen.has(ref)) {
        context.addIssue({ code: "custom", path: ["steps", index], message: `unknown or forward register ${ref}` });
      }
    }
    if ("path" in step && ["write-json", "write-text-template", "copy-text"].includes(step.op)) {
      if (writePaths.has(step.path)) {
        context.addIssue({ code: "custom", path: ["steps", index, "path"], message: `duplicate output path ${step.path}` });
      }
      writePaths.add(step.path);
    }
    seen.add(step.id);
  }
});

export type RestrictedDomainPlan = z.infer<typeof RestrictedDomainPlanSchema>;
export type RestrictedDomainPlanStep = z.infer<typeof RestrictedDomainPlanStepSchema>;

export type RestrictedDomainPlanBindings = {
  readablePaths: string[];
  writablePaths: string[];
};

function normalizedPaths(paths: string[]): Set<string> {
  return new Set(paths.map((path) => SafePathSchema.parse(path)));
}

export function validateRestrictedDomainPlanBindings(
  rawPlan: RestrictedDomainPlan,
  bindings: RestrictedDomainPlanBindings,
): void {
  const plan = RestrictedDomainPlanSchema.parse(rawPlan);
  const readable = normalizedPaths(bindings.readablePaths);
  const writable = normalizedPaths(bindings.writablePaths);
  for (const path of readable) {
    if (writable.has(path)) throw new Error(`path cannot be both readable and writable: ${path}`);
  }
  for (const step of plan.steps) {
    if (["read-text", "read-json", "parse-key-value-lines"].includes(step.op)) {
      const path = (step as { path: string }).path;
      if (!readable.has(path)) throw new Error(`undeclared input path: ${path}`);
    }
    if (["write-json", "write-text-template", "copy-text"].includes(step.op)) {
      const path = (step as { path: string }).path;
      if (!writable.has(path)) throw new Error(`undeclared output path: ${path}`);
    }
  }
}

function contained(rootDir: string, path: string): string {
  const root = resolve(rootDir);
  const candidate = resolve(root, SafePathSchema.parse(path));
  const fromRoot = relative(root, candidate);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`path escapes workdir: ${path}`);
  return candidate;
}

async function boundedRead(rootDir: string, path: string): Promise<string> {
  const bytes = await readFile(contained(rootDir, path));
  if (bytes.byteLength > 262_144) throw new Error(`domain plan input exceeds 262144 bytes: ${path}`);
  return bytes.toString("utf8");
}

function compileRegex(pattern: string, flags: string, forceGlobal = false): RegExp {
  RegexPatternSchema.parse(pattern);
  RegexFlagsSchema.parse(flags);
  const normalized = forceGlobal && !flags.includes("g") ? `${flags}g` : flags;
  return new RegExp(pattern, normalized);
}

function requireRegister(registers: Map<string, unknown>, id: string): unknown {
  if (!registers.has(id)) throw new Error(`missing domain plan register: ${id}`);
  return registers.get(id);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function resolveExpression(expression: z.infer<typeof ValueExpressionSchema>, registers: Map<string, unknown>): unknown {
  return expression.kind === "literal" ? expression.value : requireRegister(registers, expression.ref);
}

function jsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  return pointer.slice(1).split("/").reduce<unknown>((current, raw) => {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current) && /^\d+$/u.test(key)) return current[Number.parseInt(key, 10)];
    return typeof current === "object" && current !== null ? (current as Record<string, unknown>)[key] : undefined;
  }, value);
}

function recordValue(entry: unknown, field: string | undefined): unknown {
  if (!field) return entry;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  return (entry as Record<string, unknown>)[field];
}

async function executeStep(options: {
  workDir: string;
  step: RestrictedDomainPlanStep;
  registers: Map<string, unknown>;
  readablePaths: string[];
  writtenPaths: string[];
}): Promise<unknown> {
  const { workDir, step, registers } = options;
  if ("when" in step && step.when && requireRegister(registers, step.when) !== true) return null;
  switch (step.op) {
    case "read-text":
      return boundedRead(workDir, step.path);
    case "read-json":
      return JSON.parse(await boundedRead(workDir, step.path)) as unknown;
    case "json-pointer": {
      const result = jsonPointer(requireRegister(registers, step.source), step.pointer);
      if (result === undefined) throw new Error(`json pointer does not resolve: ${step.pointer}`);
      return result;
    }
    case "parse-key-value-lines": {
      const keyPattern = compileRegex(step.keyPattern, "");
      const text = await boundedRead(workDir, step.path);
      return stableUnique(text.split(/\r?\n/u).flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return [];
        const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
        return keyPattern.test(key) ? [key] : [];
      }));
    }
    case "regex-find-files": {
      const pathPattern = compileRegex(step.includePathPattern, "");
      const records: Array<Record<string, string>> = [];
      for (const path of options.readablePaths.filter((entry) => pathPattern.test(entry))) {
        const text = await boundedRead(workDir, path);
        const pattern = compileRegex(step.contentPattern, step.flags, true);
        for (const match of text.matchAll(pattern)) {
          if (records.length >= 1000) throw new Error("regex-find-files exceeded 1000 matches");
          const record: Record<string, string> = { path };
          for (const capture of step.captures) {
            const value = match.groups?.[capture];
            if (value !== undefined) record[capture] = value;
          }
          if (step.captures.some((capture) => record[capture] === undefined)) {
            throw new Error(`regex match did not populate every declared capture in ${step.id}`);
          }
          records.push(record);
        }
      }
      return records;
    }
    case "regex-test":
      return compileRegex(step.pattern, step.flags).test(requireString(requireRegister(registers, step.source), step.source));
    case "pluck": {
      const source = requireRegister(registers, step.source);
      if (!Array.isArray(source)) throw new Error(`${step.source} must be an array`);
      return stableUnique(source.map((entry) => requireString(recordValue(entry, step.field), `${step.source}.${step.field}`)));
    }
    case "filter-regex": {
      const source = requireRegister(registers, step.source);
      if (!Array.isArray(source)) throw new Error(`${step.source} must be an array`);
      const pattern = compileRegex(step.pattern, step.flags.replace("g", ""));
      return source.filter((entry) => {
        pattern.lastIndex = 0;
        const matches = pattern.test(requireString(recordValue(entry, step.field), step.source));
        return step.keep === "matching" ? matches : !matches;
      });
    }
    case "project-records": {
      const source = requireRegister(registers, step.source);
      if (!Array.isArray(source)) throw new Error(`${step.source} must be an array`);
      return source.map((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          throw new Error(`${step.source} must contain records`);
        }
        return Object.fromEntries(step.fields.map((field) => [
          field,
          requireString((entry as Record<string, unknown>)[field], `${step.source}.${field}`),
        ]));
      });
    }
    case "set-operation": {
      const left = new Set(requireStringArray(requireRegister(registers, step.left), step.left));
      const right = new Set(requireStringArray(requireRegister(registers, step.right), step.right));
      if (step.operator === "intersection") return stableUnique([...left].filter((entry) => right.has(entry)));
      if (step.operator === "difference") return stableUnique([...left].filter((entry) => !right.has(entry)));
      return stableUnique([...left, ...right]);
    }
    case "boolean": {
      const values = step.inputs.map((input) => requireRegister(registers, input));
      if (values.some((value) => typeof value !== "boolean")) throw new Error(`${step.id} inputs must be booleans`);
      const booleans = values as boolean[];
      if (step.operator === "not") return !booleans[0];
      return step.operator === "and" ? booleans.every(Boolean) : booleans.some(Boolean);
    }
    case "choose":
      return resolveExpression(
        requireRegister(registers, step.condition) === true ? step.whenTrue : step.whenFalse,
        registers,
      );
    case "write-json": {
      const document = Object.fromEntries(step.fields.map((entry) => [entry.key, resolveExpression(entry.value, registers)]));
      const destination = contained(workDir, step.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      options.writtenPaths.push(step.path);
      return document;
    }
    case "write-text-template": {
      let text = step.template;
      for (const binding of step.bindings) {
        const value = resolveExpression(binding.value, registers);
        const rendered = binding.encoding === "json"
          ? JSON.stringify(value)
          : requireString(value, binding.token);
        text = text.replaceAll(`{{${binding.token}}}`, rendered);
      }
      const destination = contained(workDir, step.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, text, "utf8");
      options.writtenPaths.push(step.path);
      return text;
    }
    case "copy-text": {
      const text = requireString(requireRegister(registers, step.source), step.source);
      const destination = contained(workDir, step.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, text, "utf8");
      options.writtenPaths.push(step.path);
      return text;
    }
  }
}

export async function executeRestrictedDomainPlan(options: {
  workDir: string;
  plan: RestrictedDomainPlan;
  readablePaths: string[];
  writablePaths: string[];
}) {
  const plan = RestrictedDomainPlanSchema.parse(options.plan);
  if (options.readablePaths.length > 128) throw new Error("restricted Domain Plan supports at most 128 readable paths");
  validateRestrictedDomainPlanBindings(plan, options);
  const registers = new Map<string, unknown>();
  const writtenPaths: string[] = [];
  for (const step of plan.steps) {
    registers.set(step.id, await executeStep({
      workDir: options.workDir,
      step,
      registers,
      readablePaths: [...normalizedPaths(options.readablePaths)],
      writtenPaths,
    }));
  }
  return {
    schemaVersion: "skill-ir-restricted-domain-plan-execution/v1" as const,
    status: "complete" as const,
    executedSteps: plan.steps.length,
    writtenPaths,
    paidCalls: 0 as const,
    heldOutAccesses: 0 as const,
    skillSpecificBranches: 0 as const,
  };
}
