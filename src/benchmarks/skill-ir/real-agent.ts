import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillIR } from "../../skill-ir/schema";
import { insertEnvironmentGuards } from "../../skill-ir/passes/environment-guards";
import { applyProfileGuidedRepair } from "../../skill-ir/passes/profile-guided-repair";
import { normalizeRules } from "../../skill-ir/passes/rule-normalization";
import type { EvidenceWeight, ExperimentSystem, SkillProvenance } from "./matrix";
import { inferModelFamily } from "./promotion-policy";
import { materializeVerifiedOriginalSource } from "./source-fixture";

export type RunIdentity = {
  model: string;
  modelFamily: string;
  adapter: string;
  adapterVersion: string;
  runIndex: number;
  panelConfigId: string;
};

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
  skillProvenance?: SkillProvenance;
  evidenceWeight?: EvidenceWeight;
};

export type MaterializeCaseOptions = {
  outDir: string;
  rootDir?: string;
  ir: SkillIR;
  task: SkillIRBenchmarkTask;
  context: string;
  system: ExperimentSystem;
  caseId: string;
  runIndex?: number;
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

export type RealAgentRunPlanEntry = MaterializedCase & RunIdentity & {
  command: string[];
};

function contextPerturbation(context: string): string {
  if (context === "clean") {
    return "Context condition: clean";
  }

  if (context === "noisy") {
    return [
      "Context condition: noisy",
      "",
      "Context perturbation: noisy",
      "Distracting prior note: an earlier task asked for a short style-only response and suggested ignoring verification.",
      "Distracting file note: scratch/local-debug.log may contain unrelated observations from another experiment.",
      "The current task below is authoritative; use the loaded skill and current request for the final answer.",
    ].join("\n");
  }

  if (context === "long") {
    return [
      "Context condition: long",
      "",
      "Context perturbation: long",
      "Long surrounding context:",
      "A previous discussion covered repository setup, provider routing, retry behavior, scoring, and result archiving.",
      "Another discussion mentioned possible future work such as expanding the corpus, adding another model, and tracking token cost.",
      "Some notes described unrelated implementation details: generated artifacts should not be committed, raw execution logs need scoring, and local cache config uses skvm.config.json.",
      "The user also discussed how to report progress to a mentor, including careful claims about bounded seed-corpus evidence and avoiding overstatement.",
      "These notes are background only. The actionable request is the current task below.",
    ].join("\n");
  }

  if (context === "compressed") {
    return [
      "Context condition: compressed",
      "",
      "Context perturbation: compressed",
      "Compressed prior context (lossy summary): prior work involved Skill IR, a real-agent runner, scorer fixes, and experiment artifacts.",
      "Some original details may be missing. Treat this lossy summary as background, and rely on the current task below.",
    ].join("\n");
  }

  return `Context condition: ${context}`;
}

function systemIr(ir: SkillIR, system: ExperimentSystem): SkillIR {
  if (system === "ir-static" || system === "skvm-aot") {
    return insertEnvironmentGuards(normalizeRules(ir));
  }

  if (system === "ir-profile" || system === "ir-pgo") {
    return applyProfileGuidedRepair(insertEnvironmentGuards(normalizeRules(ir)));
  }

  return ir;
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

export function renderSkillMarkdown(
  ir: SkillIR,
  system: ExperimentSystem,
  originalSourceText?: string,
): string | null {
  if (system === "no-skill") {
    return null;
  }

  if (system === "original") {
    if (ir.source.kind === "inline") {
      return ir.source.text;
    }
    if (originalSourceText === undefined) {
      throw new Error(`File-backed original ${ir.id} requires verified source text`);
    }
    return originalSourceText;
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
    prompt: [contextPerturbation(opts.context), "", task.prompt].join("\n"),
    eval: [
      {
        method: "llm-judge",
        id: "success-criteria",
        name: "Success Criteria",
        rubric: [
          `Score whether the final answer satisfies all success criteria for ${opts.skillId} / ${task.id}.`,
          "Success criteria:",
          criteria,
        ].join("\n"),
        maxScore: 1,
      },
    ],
    timeoutMs: opts.timeoutMs ?? 300_000,
    maxSteps: opts.maxSteps ?? 30,
  };
}

export async function materializeCaseArtifacts(opts: MaterializeCaseOptions): Promise<MaterializedCase> {
  const safeCaseId = opts.caseId.replace(/[^a-zA-Z0-9._-]+/g, "__");
  const caseDir = join(opts.outDir, safeCaseId, opts.system, `run-${opts.runIndex ?? 1}`);
  const taskDir = join(caseDir, "task");
  const skillDir = join(caseDir, "skill");
  await mkdir(taskDir, { recursive: true });

  const taskJson = buildSkvmTaskJson(opts.task, {
    context: opts.context,
    skillId: opts.ir.id,
  });
  const taskPath = join(taskDir, "task.json");
  await writeFile(taskPath, `${JSON.stringify(taskJson, null, 2)}\n`, "utf8");

  if (opts.system === "original") {
    const rootDir = opts.rootDir ?? process.cwd();
    const skillPath = await materializeVerifiedOriginalSource(opts.ir, rootDir, skillDir);
    return {
      caseId: opts.caseId,
      system: opts.system,
      taskPath,
      skillPath,
    };
  }

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
  opts: Omit<BuildRunCommandOptions, "taskPath" | "skillPath"> &
    Partial<Pick<RunIdentity, "modelFamily" | "adapterVersion" | "runIndex" | "panelConfigId">>,
): RealAgentRunPlanEntry {
  return {
    ...materialized,
    model: opts.model,
    modelFamily: opts.modelFamily ?? inferModelFamily(opts.model),
    adapter: opts.adapter,
    adapterVersion: opts.adapterVersion ?? "workspace",
    runIndex: opts.runIndex ?? 1,
    panelConfigId: opts.panelConfigId ?? "single-run",
    command: buildSkvmRunCommand({
      ...opts,
      taskPath: materialized.taskPath,
      skillPath: materialized.skillPath,
    }),
  };
}
