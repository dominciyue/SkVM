import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ExperimentSystem = "no-skill" | "original" | "skvm-aot" | "ir-only" | "ir-static" | "ir-profile";

export type SkillPackaging = "focused" | "broad" | "unknown";

export type MatrixSkill = {
  id: string;
  packaging: SkillPackaging;
};

export type MatrixInput = {
  skills: (string | MatrixSkill)[];
  agents: string[];
  environments: string[];
  contexts: string[];
  tasks: string[];
  systems: ExperimentSystem[];
  baselineSystem?: ExperimentSystem;
};

export type ExperimentCase = {
  caseId: string;
  skill: string;
  skillPackaging: SkillPackaging;
  agent: string;
  environment: string;
  context: string;
  task: string;
  system: ExperimentSystem;
  baselineSystem: ExperimentSystem;
};

type CorpusManifest = {
  skills: {
    id: string;
    tasksPath?: string;
    notes?: string;
  }[];
};

type ContextSet = {
  contexts: { id: string }[];
};

type TaskSet = {
  tasks: { id: string }[];
};

export const DEFAULT_EXPERIMENT_SYSTEMS: ExperimentSystem[] = [
  "no-skill",
  "original",
  "skvm-aot",
  "ir-only",
  "ir-static",
  "ir-profile",
];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function normalizeSkill(skill: string | MatrixSkill): MatrixSkill {
  if (typeof skill === "string") {
    return { id: skill, packaging: "unknown" };
  }

  return skill;
}

function inferSkillPackaging(skill: CorpusManifest["skills"][number]): SkillPackaging {
  const notes = skill.notes?.toLowerCase() ?? "";
  return notes.includes("broad") ? "broad" : "focused";
}

export function buildExperimentMatrix(input: MatrixInput): ExperimentCase[] {
  const cases: ExperimentCase[] = [];
  const baselineSystem = input.baselineSystem ?? "original";

  for (const rawSkill of input.skills) {
    const skill = normalizeSkill(rawSkill);
    for (const agent of input.agents) {
      for (const environment of input.environments) {
        for (const context of input.contexts) {
          for (const task of input.tasks) {
            const caseId = `${skill.id}:${agent}:${environment}:${context}:${task}`;
            for (const system of input.systems) {
              cases.push({
                caseId,
                skill: skill.id,
                skillPackaging: skill.packaging,
                agent,
                environment,
                context,
                task,
                system,
                baselineSystem,
              });
            }
          }
        }
      }
    }
  }

  return cases;
}

export function buildDefaultMatrixInput(rootDir = process.cwd()): MatrixInput {
  const manifest = readJson<CorpusManifest>(join(rootDir, "benchmarks/skill-ir/corpus/manifest.json"));
  const contextSet = readJson<ContextSet>(join(rootDir, "benchmarks/skill-ir/contexts/standard-contexts.json"));
  const skills = manifest.skills.map((skill) => ({
    id: skill.id,
    packaging: inferSkillPackaging(skill),
  }));
  const tasks = manifest.skills.flatMap((skill) => {
    if (!skill.tasksPath) {
      return [];
    }

    return readJson<TaskSet>(join(rootDir, skill.tasksPath)).tasks.map((task) => task.id);
  });

  return {
    skills,
    agents: ["skvm", "codex"],
    environments: ["linux", "windows"],
    contexts: contextSet.contexts.map((context) => context.id),
    tasks,
    systems: [...DEFAULT_EXPERIMENT_SYSTEMS],
  };
}
