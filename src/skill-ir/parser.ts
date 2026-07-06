import { SkillIRSchema, type Rule, type SkillIR, type Step } from "./schema";

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug.length > 0 ? slug : "unnamed";
}

function uniqueId(baseId: string, seen: Set<string>): string {
  if (!seen.has(baseId)) {
    seen.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }
  seen.add(candidate);
  return candidate;
}

function normalizeStepIds(steps: Step[]): Step[] {
  const seen = new Set<string>();

  return steps.map((step, index) => {
    const baseId = step.id.trim().length > 0 ? step.id.trim() : `step-${slugify(step.title || `step-${index + 1}`)}`;
    return { ...step, id: uniqueId(baseId, seen) };
  });
}

function normalizeRuleIds(rules: Rule[]): Rule[] {
  const seen = new Set<string>();

  return rules.map((rule, index) => {
    const fallback = rule.normalizedForm || rule.sourceText || `rule-${index + 1}`;
    const baseId = rule.id.trim().length > 0 ? rule.id.trim() : `rule-${slugify(fallback)}`;
    return { ...rule, id: uniqueId(baseId, seen) };
  });
}

export function parseSkillIRFromJsonCandidate(candidate: unknown): SkillIR {
  const draft = structuredClone(candidate) as SkillIR;

  draft.id = draft.id.trim();
  draft.name = draft.name.trim();
  draft.intent = draft.intent.trim();
  draft.steps = normalizeStepIds(draft.steps);
  draft.rules = normalizeRuleIds(draft.rules);

  return SkillIRSchema.parse(draft);
}

export function buildSkillIRExtractionPrompt(skillText: string): string {
  return [
    "Extract Skill IR as strict JSON matching schemaVersion skill-ir/v1.",
    "Represent explicit steps, MUST/NEVER/SHOULD rules, tool requirements, environment assumptions, runtime checks, and recovery policies.",
    "Use empty arrays when information is absent.",
    "Use stable kebab-case ids for steps, rules, tools, checks, recovery policies, and profile annotations.",
    "Do not include markdown fences.",
    "",
    "Skill text:",
    skillText,
  ].join("\n");
}
