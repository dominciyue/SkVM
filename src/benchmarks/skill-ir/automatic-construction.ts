import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { validateSkillIR } from "../../skill-ir/validate";
import { sha256Bytes } from "./source-fixture";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);

export const AutomaticConstructionInputSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-construction-input/v1"),
  source: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    repository: z.string().url(),
    commit: CommitSchema,
    upstreamPath: z.string().min(1),
  }).strict(),
}).strict();

const SourceContractOutputSchema = z.object({
  id: IdentifierSchema,
  sourceText: z.string().min(1),
  required: z.boolean(),
}).strict();

export const SourceContractCandidateSchema = z.object({
  schemaVersion: z.literal("skill-ir-source-contract-candidate/v1"),
  skillId: IdentifierSchema,
  name: z.string().min(1),
  intent: z.string().min(1),
  source: z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict(),
  activationConditions: z.array(z.string().min(1)),
  inputs: z.array(z.object({
    id: IdentifierSchema,
    description: z.string().min(1),
    required: z.boolean(),
  }).strict()).min(1),
  outputs: z.array(SourceContractOutputSchema).min(1),
  constraints: z.array(z.string().min(1)),
  unresolvedSemantics: z.array(z.string().min(1)).min(1),
}).strict();

const ConstructionCheckSchema = z.object({
  id: IdentifierSchema,
  status: z.enum(["passed", "failed", "requires-human"]),
  evidence: z.string().min(1),
}).strict();

export const ConstructionValidationPlanSchema = z.object({
  schemaVersion: z.literal("skill-ir-construction-validation-plan/v1"),
  skillId: IdentifierSchema,
  checks: z.array(ConstructionCheckSchema).length(7),
  promotionEligible: z.literal(false),
  prohibitedEvidenceClasses: z.tuple([
    z.literal("model-output"),
    z.literal("evaluator-payload"),
    z.literal("held-out"),
    z.literal("scorer-gold"),
    z.literal("secret-value"),
  ]),
}).strict();

const PackageCandidateArtifactSchema = z.object({
  path: z.enum(["skill.md", "skill-ir.json", "source-contract.json", "validation-plan.json"]),
  kind: z.enum(["skill-view", "skill-ir", "source-contract", "validation-plan"]),
  sha256: Sha256Schema,
  content: z.string(),
}).strict();

export const ConstructionPackageCandidateSchema = z.object({
  schemaVersion: z.literal("skill-ir-package-candidate/v1"),
  skillId: IdentifierSchema,
  status: z.literal("non-executable"),
  protectedInputs: z.array(z.string().min(1)).min(1),
  generatedOutputs: z.array(z.string().min(1)),
  executionPlan: z.null(),
  artifacts: z.array(PackageCandidateArtifactSchema).length(4),
  blockers: z.tuple([
    z.literal("domain-compiler-not-generated"),
    z.literal("runtime-checker-not-generated"),
    z.literal("task-output-contract-not-qualified"),
  ]),
}).strict();

export const AutomaticConstructionResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-automatic-construction-result/v1"),
  sourceSnapshot: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    text: z.string().min(1),
  }).strict(),
  contract: SourceContractCandidateSchema,
  baseIr: SkillIRSchema,
  validationPlan: ConstructionValidationPlanSchema,
  packageCandidate: ConstructionPackageCandidateSchema,
  audit: z.object({
    readPaths: z.array(z.string().min(1)).length(1),
    paidCalls: z.literal(0),
    heldOutAccesses: z.literal(0),
    evaluatorPayloadAccesses: z.literal(0),
  }).strict(),
}).strict();

export type AutomaticConstructionInput = z.input<typeof AutomaticConstructionInputSchema>;
export type AutomaticConstructionResult = z.infer<typeof AutomaticConstructionResultSchema>;

type MarkdownItem = {
  text: string;
  headings: string[];
  ordered: boolean;
};

type ParsedSkillSource = {
  name: string;
  description: string;
  title: string;
  headings: string[];
  headingRecords: Array<{ text: string; level: number; ancestors: string[] }>;
  items: MarkdownItem[];
};

const WORKFLOW_HEADING = /(?:workflow|工作流程|处理规则|process|procedure)/iu;
const OUTPUT_HEADING = /(?:output|输出|交付|deliverable|result)/iu;
const ACTIVATION_HEADING = /(?:trigger|when to use|触发|适用)/iu;
const RULE_HEADING = /(?:rule|原则|规则|注意|边界|checklist|清单|mistake|陷阱|self-check|自检)/iu;

function safeRepositoryPath(rootDir: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`automatic construction source must be repository-relative: ${path}`);
  const root = resolve(rootDir);
  const candidate = resolve(root, path);
  const fromRoot = relative(root, candidate);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    throw new Error(`automatic construction source escapes repository root: ${path}`);
  }
  return candidate;
}

function parseSkillSource(text: string): ParsedSkillSource {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
  if (!frontmatter) throw new Error("public skill source requires YAML frontmatter");
  const metadata = z.object({
    name: IdentifierSchema,
    description: z.string().min(1),
  }).passthrough().parse(parseYaml(frontmatter[1]!));
  const body = text.slice(frontmatter[0].length);
  const headingsByLevel: string[] = [];
  const headings: string[] = [];
  const headingRecords: ParsedSkillSource["headingRecords"] = [];
  const items: MarkdownItem[] = [];
  let title = metadata.name;
  let inFence = false;
  for (const rawLine of body.split(/\r?\n/u)) {
    if (/^\s*```/u.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(rawLine);
    if (heading) {
      const level = heading[1]!.length;
      const value = heading[2]!.trim();
      if (level === 1) title = value;
      headingRecords.push({
        text: value,
        level,
        ancestors: headingsByLevel.slice(0, level - 1).filter((entry): entry is string => entry !== undefined),
      });
      headingsByLevel.length = level - 1;
      headingsByLevel[level - 1] = value;
      headings.push(value);
      continue;
    }
    const item = /^\s*(?:(\d+)[.)]|[-*+])\s+(.+?)\s*$/u.exec(rawLine);
    if (!item) continue;
    items.push({
      text: item[2]!.trim(),
      headings: headingsByLevel.filter((value): value is string => value !== undefined),
      ordered: item[1] !== undefined,
    });
  }
  return { name: metadata.name, description: metadata.description, title, headings, headingRecords, items };
}

function inSection(item: MarkdownItem, matcher: RegExp): boolean {
  return item.headings.some((heading) => matcher.test(heading));
}

function unique(items: string[], limit = 32): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function candidateOutputs(parsed: ParsedSkillSource): Array<z.infer<typeof SourceContractOutputSchema>> {
  const outputLines = unique(parsed.items.filter((item) => inSection(item, OUTPUT_HEADING)).map((item) => item.text), 16);
  const lines = outputLines.length > 0 ? outputLines : ["Result described by the public skill source."];
  return lines.map((sourceText, index) => ({
    id: `output-${String(index + 1).padStart(2, "0")}`,
    sourceText,
    required: !/(?:optional|可选|仅当|when|if )/iu.test(sourceText),
  }));
}

function candidateWorkflow(parsed: ParsedSkillSource): string[] {
  const numberedSubheadings = parsed.headingRecords.filter((heading) =>
    heading.level >= 3
    && heading.ancestors.some((ancestor) => WORKFLOW_HEADING.test(ancestor))
    && /^(?:\d+[.)：:]?\s*|第\s*[一二三四五六七八九十0-9]+\s*步|(?:step|phase)\s*\d+)/iu.test(heading.text));
  if (numberedSubheadings.length > 0) {
    return unique(numberedSubheadings.map((heading) => heading.text), 24);
  }
  const explicit = parsed.items.filter((item) => inSection(item, WORKFLOW_HEADING));
  const ordered = explicit.filter((item) => item.ordered);
  const selected = ordered.length > 0 ? ordered : explicit;
  if (selected.length > 0) return unique(selected.map((item) => item.text), 24);
  const fallback = parsed.items.filter((item) => item.ordered);
  return unique(fallback.map((item) => item.text), 24);
}

function candidateRules(parsed: ParsedSkillSource): string[] {
  return unique(parsed.items.filter((item) => inSection(item, RULE_HEADING)).map((item) => item.text), 32);
}

function inferStepKind(text: string): SkillIR["steps"][number]["kind"] {
  if (/(?:read|inspect|scan|discover|读取|检查|扫描|发现)/iu.test(text)) return "read";
  if (/(?:analy|classif|identify|compare|分析|识别|判定|对比)/iu.test(text)) return "analyze";
  if (/(?:plan|select|decide|choose|规划|选择|决定)/iu.test(text)) return "plan";
  if (/(?:verify|validate|check|复核|验证|校验)/iu.test(text)) return "verify";
  if (/(?:report|summary|报告|总结)/iu.test(text)) return "report";
  if (/(?:write|generate|create|edit|replace|生成|写入|修改|替换)/iu.test(text)) return "edit";
  return "execute";
}

function inferCategories(text: string, ruleCount: number): SkillIR["category"] {
  const categories = new Set<SkillIR["category"][number]>(["workflow"]);
  if (/(?:generate|create|write|生成|创建|写)/iu.test(text)) categories.add("generative");
  if (/(?:inspect|scan|analy|review|audit|检查|扫描|分析|审查|校验)/iu.test(text)) categories.add("diagnostic");
  if (ruleCount > 0) categories.add("constraint-heavy");
  if (/(?:environment|runtime|platform|install|dependency|环境|运行时|平台|安装|依赖)/iu.test(text)) {
    categories.add("environment-sensitive");
  }
  return [...categories];
}

function inferRule(sourceText: string, index: number): SkillIR["rules"][number] {
  const never = /(?:never|do not|don't|不要|不得|禁止|不可)/iu.test(sourceText);
  const must = /(?:must|required|always|必须|应当|需要|确保)/iu.test(sourceText);
  const scope: SkillIR["rules"][number]["scope"] =
    /(?:secret|sensitive|安全|密钥|密码)/iu.test(sourceText) ? "safety"
      : /(?:file|write|edit|delete|文件|写|删除|修改)/iu.test(sourceText) ? "file-edit"
        : /(?:output|report|format|输出|报告|格式)/iu.test(sourceText) ? "output"
          : "planning";
  return {
    id: `rule-${String(index + 1).padStart(2, "0")}`,
    sourceText,
    level: never ? "never" : must ? "must" : "should",
    scope,
    checkability: "human",
    severity: never || must ? "high" : "medium",
    normalizedForm: sourceText,
  };
}

function buildBaseIr(
  parsed: ParsedSkillSource,
  source: z.infer<typeof AutomaticConstructionInputSchema>["source"],
  outputs: Array<z.infer<typeof SourceContractOutputSchema>>,
  ruleTexts: string[],
): SkillIR {
  const workflow = candidateWorkflow(parsed);
  const stepTexts = workflow.length > 0 ? workflow : ["Perform the workflow described by the public skill source."];
  const rules = ruleTexts.map(inferRule);
  const categories = inferCategories(`${parsed.description}\n${parsed.items.map((item) => item.text).join("\n")}`, rules.length);
  const outputSpecs = outputs.map((output) => ({
    id: output.id,
    description: output.sourceText,
    required: output.required,
  }));
  const environmentSensitive = categories.includes("environment-sensitive");
  return SkillIRSchema.parse({
    schemaVersion: "skill-ir/v1",
    id: parsed.name,
    name: parsed.title,
    category: categories,
    intent: parsed.description,
    source: { kind: "file", path: source.path, sha256: source.sha256 },
    inputs: [{
      id: "task-context",
      description: "User-provided task context and workspace referenced by the public skill source.",
      required: true,
    }],
    outputs: outputSpecs,
    preconditions: [{
      id: "public-source-readable",
      description: "The digest-pinned public skill source is readable before execution.",
      checkability: "static",
    }],
    steps: stepTexts.map((description, index) => ({
      id: `step-${String(index + 1).padStart(2, "0")}`,
      title: description,
      description,
      kind: inferStepKind(description),
      required: true,
      dependsOn: index === 0 ? [] : [`step-${String(index).padStart(2, "0")}`],
      toolRefs: [],
      produces: [outputSpecs[0]!.id],
      successCheckRefs: [],
      failureModes: ["source-semantics-insufficient"],
    })),
    rules,
    tools: [],
    environment: environmentSensitive ? [{
      id: "environment-from-source",
      description: "The public source mentions runtime, dependency, platform, installation, or environment constraints that require task-time confirmation.",
      platforms: ["linux", "macos", "windows", "wsl", "container"],
      checkability: "human",
    }] : [],
    checks: [],
    recovery: [],
    profile: [],
  });
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function artifact(path: z.infer<typeof PackageCandidateArtifactSchema>["path"], kind: z.infer<typeof PackageCandidateArtifactSchema>["kind"], content: string) {
  return { path, kind, content, sha256: sha256Bytes(Buffer.from(content, "utf8")) };
}

export async function constructSkillCandidates(
  rootDir: string,
  rawInput: AutomaticConstructionInput,
): Promise<AutomaticConstructionResult> {
  const input = AutomaticConstructionInputSchema.parse(rawInput);
  const absoluteSourcePath = safeRepositoryPath(rootDir, input.source.path);
  const sourceBytes = await readFile(absoluteSourcePath);
  const actualSha256 = sha256Bytes(sourceBytes);
  if (actualSha256 !== input.source.sha256) {
    throw new Error(`automatic construction source digest mismatch for ${input.source.path}: expected ${input.source.sha256}, got ${actualSha256}`);
  }
  const sourceText = sourceBytes.toString("utf8");
  const parsed = parseSkillSource(sourceText);
  const outputs = candidateOutputs(parsed);
  const ruleTexts = candidateRules(parsed);
  const activationConditions = unique(
    parsed.items.filter((item) => inSection(item, ACTIVATION_HEADING)).map((item) => item.text),
    16,
  );
  const contract = SourceContractCandidateSchema.parse({
    schemaVersion: "skill-ir-source-contract-candidate/v1",
    skillId: parsed.name,
    name: parsed.title,
    intent: parsed.description,
    source: { path: input.source.path, sha256: input.source.sha256 },
    activationConditions,
    inputs: [{
      id: "task-context",
      description: "User-provided task context and workspace referenced by the public skill source.",
      required: true,
    }],
    outputs,
    constraints: ruleTexts,
    unresolvedSemantics: [
      "Benchmark task input and output ABI are not derivable from the public skill source alone.",
      "Domain checker and runtime compiler behavior require independent qualification.",
    ],
  });
  const baseIr = buildBaseIr(parsed, input.source, outputs, ruleTexts);
  const irValidation = validateSkillIR(baseIr);
  if (irValidation.errors.length > 0) {
    throw new Error(`automatic base IR reference validation failed: ${irValidation.errors.join("; ")}`);
  }
  const sourceTracePassed = [
    ...baseIr.steps.map((step) => step.description),
    ...baseIr.rules.map((rule) => rule.sourceText),
  ].every((trace) => sourceText.includes(trace));
  const validationPlan = ConstructionValidationPlanSchema.parse({
    schemaVersion: "skill-ir-construction-validation-plan/v1",
    skillId: parsed.name,
    checks: [
      { id: "source-digest", status: "passed", evidence: `sha256:${actualSha256}` },
      { id: "contract-structure", status: "passed", evidence: SourceContractCandidateSchema.description ?? "source contract candidate schema" },
      { id: "skill-ir-schema", status: "passed", evidence: "SkillIRSchema.parse" },
      { id: "skill-ir-references", status: "passed", evidence: "validateSkillIR:0 errors" },
      { id: "source-trace", status: sourceTracePassed ? "passed" : "failed", evidence: "every extracted step and rule is traced to public SKILL.md" },
      { id: "domain-semantics", status: "requires-human", evidence: "task ABI and domain invariants are absent from source-only generation inputs" },
      { id: "package-runtime", status: "requires-human", evidence: "no domain compiler, checker, or executable plan was generated" },
    ],
    promotionEligible: false,
    prohibitedEvidenceClasses: ["model-output", "evaluator-payload", "held-out", "scorer-gold", "secret-value"],
  });
  const artifacts = [
    artifact("skill.md", "skill-view", sourceText),
    artifact("skill-ir.json", "skill-ir", jsonText(baseIr)),
    artifact("source-contract.json", "source-contract", jsonText(contract)),
    artifact("validation-plan.json", "validation-plan", jsonText(validationPlan)),
  ];
  const packageCandidate = ConstructionPackageCandidateSchema.parse({
    schemaVersion: "skill-ir-package-candidate/v1",
    skillId: parsed.name,
    status: "non-executable",
    protectedInputs: [input.source.path],
    generatedOutputs: [],
    executionPlan: null,
    artifacts,
    blockers: [
      "domain-compiler-not-generated",
      "runtime-checker-not-generated",
      "task-output-contract-not-qualified",
    ],
  });
  return AutomaticConstructionResultSchema.parse({
    schemaVersion: "skill-ir-automatic-construction-result/v1",
    sourceSnapshot: { path: input.source.path, sha256: actualSha256, text: sourceText },
    contract,
    baseIr,
    validationPlan,
    packageCandidate,
    audit: {
      readPaths: [input.source.path],
      paidCalls: 0,
      heldOutAccesses: 0,
      evaluatorPayloadAccesses: 0,
    },
  });
}
