import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillIR } from "../../skill-ir/schema";
import { insertEnvironmentGuards } from "../../skill-ir/passes/environment-guards";
import { applyProfileGuidedRepair } from "../../skill-ir/passes/profile-guided-repair";
import { normalizeRules } from "../../skill-ir/passes/rule-normalization";
import type { ExperimentSystem } from "./matrix";

export type SkillIRBenchmarkTask = {
  id: string;
  split: string;
  prompt: string;
  successCriteria: string[];
};

export type SkvmTaskJson = {
  id: string;
  name: string;
  category: string;
  gradingType: "llm_judge";
  prompt: string;
  eval: {
    method: "llm-judge";
    id: string;
    name: string;
    rubric: string;
    maxScore: number;
  }[];
  timeoutMs: number;
  maxSteps: number;
};

export type MaterializedCase = {
  caseId: string;
  system: ExperimentSystem;
  taskPath: string;
  skillPath?: string;
};

export type MaterializeCaseOptions = {
  outDir: string;
  ir: SkillIR;
  task: SkillIRBenchmarkTask;
  context: string;
  system: ExperimentSystem;
  caseId: string;
};

export type BuildRunCommandOptions = {
  taskPath: string;
  skillPath?: string;
  model: string;
  adapter: string;
  skillMode?: "inject" | "discover";
  workdir?: string;
  timeoutMs?: number;
  maxSteps?: number;
};

export type RealAgentRunPlanEntry = MaterializedCase & {
  command: string[];
};

function systemIr(ir: SkillIR, system: ExperimentSystem): SkillIR {
  if (system === "ir-static" || system === "skvm-aot") {
    return insertEnvironmentGuards(normalizeRules(ir));
  }

  if (system === "ir-profile") {
    return applyProfileGuidedRepair(insertEnvironmentGuards(normalizeRules(ir)));
  }

  return ir;
}

function sourceText(ir: SkillIR): string {
  return ir.source.kind === "inline" ? ir.source.text : `Source file: ${ir.source.path}`;
}

function renderSteps(ir: SkillIR): string {
  if (ir.steps.length === 0) {
    return "- No explicit steps.";
  }

  return ir.steps
    .map((step, index) => {
      const dependsOn = step.dependsOn.length > 0 ? step.dependsOn.join(", ") : "none";
      const checks = step.successCheckRefs.length > 0 ? step.successCheckRefs.join(", ") : "none";
      return `${index + 1}. ${step.title} (${step.id})\n   - Kind: ${step.kind}\n   - Required: ${step.required}\n   - Depends on: ${dependsOn}\n   - Success checks: ${checks}\n   - Description: ${step.description}`;
    })
    .join("\n");
}

function renderRules(ir: SkillIR): string {
  if (ir.rules.length === 0) {
    return "- No explicit rules.";
  }

  return ir.rules
    .map(
      (rule) =>
        `- ${rule.id}: [${rule.level}/${rule.severity}/${rule.checkability}] ${rule.normalizedForm}`,
    )
    .join("\n");
}

function renderChecks(ir: SkillIR): string {
  if (ir.checks.length === 0) {
    return "- No runtime checks.";
  }

  return ir.checks
    .map(
      (check) =>
        `- ${check.id}: ${check.kind} on ${check.targetRef}. Assertion: ${check.assertion}. On failure: ${check.onFailure}.`,
    )
    .join("\n");
}

function renderRecovery(ir: SkillIR): string {
  if (ir.recovery.length === 0) {
    return "- No recovery policies.";
  }

  return ir.recovery
    .map(
      (policy) =>
        `- ${policy.id}: when ${policy.trigger}, ${policy.action} up to ${policy.maxAttempts} time(s). ${policy.explanation}`,
    )
    .join("\n");
}

export function renderSkillMarkdown(ir: SkillIR, system: ExperimentSystem): string | null {
  if (system === "no-skill") {
    return null;
  }

  if (system === "original") {
    return [`# ${ir.name}`, "", "## Original Skill", "", sourceText(ir)].join("\n");
  }

  const optimized = systemIr(ir, system);
  const systemNote =
    system === "skvm-aot"
      ? "This materialized skill stands in for the SkVM AOT baseline in the Skill IR dry-run harness. Replace it with a real skvm aot-compile proposal path when available."
      : `Materialized system: ${system}.`;

  return [
    `# ${optimized.name}`,
    "",
    systemNote,
    "",
    "## Intent",
    "",
    optimized.intent,
    "",
    "## Execution Steps",
    "",
    renderSteps(optimized),
    "",
    "## Rules",
    "",
    renderRules(optimized),
    "",
    "## Runtime Checks",
    "",
    renderChecks(optimized),
    "",
    "## Recovery Policies",
    "",
    renderRecovery(optimized),
  ].join("\n");
}

export function buildSkvmTaskJson(
  task: SkillIRBenchmarkTask,
  opts: { context: string; skillId: string; timeoutMs?: number; maxSteps?: number },
): SkvmTaskJson {
  const criteria = task.successCriteria.map((criterion) => `- ${criterion}`).join("\n");

  return {
    id: `${task.id}-${opts.context}`,
    name: `${task.id} (${opts.context})`,
    category: "skill-ir",
    gradingType: "llm_judge",
    prompt: [
      `Context condition: ${opts.context}`,
      "",
      task.prompt,
      "",
      "Success criteria:",
      criteria,
    ].join("\n"),
    eval: [
      {
        method: "llm-judge",
        id: "success-criteria",
        name: "Success Criteria",
        rubric: `Score whether the final answer satisfies all success criteria for ${opts.skillId} / ${task.id}.`,
        maxScore: 1,
      },
    ],
    timeoutMs: opts.timeoutMs ?? 300_000,
    maxSteps: opts.maxSteps ?? 30,
  };
}

export async function materializeCaseArtifacts(opts: MaterializeCaseOptions): Promise<MaterializedCase> {
  const safeCaseId = opts.caseId.replace(/[^a-zA-Z0-9._-]+/g, "__");
  const caseDir = join(opts.outDir, safeCaseId, opts.system);
  const taskDir = join(caseDir, "task");
  const skillDir = join(caseDir, "skill");
  await mkdir(taskDir, { recursive: true });

  const taskJson = buildSkvmTaskJson(opts.task, {
    context: opts.context,
    skillId: opts.ir.id,
  });
  const taskPath = join(taskDir, "task.json");
  await writeFile(taskPath, `${JSON.stringify(taskJson, null, 2)}\n`, "utf8");

  const renderedSkill = renderSkillMarkdown(opts.ir, opts.system);
  if (renderedSkill === null) {
    return { caseId: opts.caseId, system: opts.system, taskPath };
  }

  await mkdir(skillDir, { recursive: true });
  const skillPath = join(skillDir, "SKILL.md");
  await writeFile(skillPath, `${renderedSkill}\n`, "utf8");

  return {
    caseId: opts.caseId,
    system: opts.system,
    taskPath,
    skillPath,
  };
}

export function buildSkvmRunCommand(opts: BuildRunCommandOptions): string[] {
  const command = [
    "bun",
    "run",
    "skvm",
    "run",
    `--task=${opts.taskPath}`,
    `--model=${opts.model}`,
    `--adapter=${opts.adapter}`,
  ];

  if (opts.skillPath) {
    command.push(`--skill=${opts.skillPath}`);
    command.push(`--skill-mode=${opts.skillMode ?? "inject"}`);
  }

  if (opts.workdir) {
    command.push(`--workdir=${opts.workdir}`);
  }

  if (opts.timeoutMs) {
    command.push(`--timeout-ms=${opts.timeoutMs}`);
  }

  if (opts.maxSteps) {
    command.push(`--max-steps=${opts.maxSteps}`);
  }

  return command;
}

export function buildRunPlanEntry(
  materialized: MaterializedCase,
  opts: Omit<BuildRunCommandOptions, "taskPath" | "skillPath">,
): RealAgentRunPlanEntry {
  return {
    ...materialized,
    command: buildSkvmRunCommand({
      ...opts,
      taskPath: materialized.taskPath,
      skillPath: materialized.skillPath,
    }),
  };
}
