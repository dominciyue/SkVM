import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCorpusManifestPath, type CorpusId } from "./corpus-registry";

export type ExperimentSystem =
  | "no-skill"
  | "original"
  | "skvm-aot"
  | "ir-only"
  | "ir-static"
  | "ir-profile"
  | "ir-pgo"
  | "ir-pgo-dev"
  | "ir-artifact-dev"
  | "ir-public-artifact-dev"
  | "ir-contract-artifact-dev"
  | "validated-artifact";

export type SkillPackaging = "focused" | "broad" | "unknown";

export type SkillProvenance =
  | "synthetic-seed"
  | "adapted-public"
  | "real-public"
  | "upstream-skvm"
  | "user-provided"
  | "unknown";

export type EvidenceWeight = "calibration-low" | "support-real" | "main-real" | "unknown";

export type MatrixSkill = {
  id: string;
  packaging: SkillPackaging;
  provenance?: SkillProvenance;
  evidenceWeight?: EvidenceWeight;
};

export type MatrixInput = {
  skills: (string | MatrixSkill)[];
  agents: string[];
  environments: string[];
  contexts: string[];
  tasks: string[];
  tasksBySkill?: Record<string, string[]>;
  systems: ExperimentSystem[];
  baselineSystem?: ExperimentSystem;
};

export type ExperimentCase = {
  caseId: string;
  skill: string;
  skillPackaging: SkillPackaging;
  skillProvenance: SkillProvenance;
  evidenceWeight: EvidenceWeight;
  agent: string;
  environment: string;
  context: string;
  task: string;
  system: ExperimentSystem;
  baselineSystem: ExperimentSystem;
};

type CorpusManifest = {
  corpusId?: string;
  skills: {
    id: string;
    tasksPath?: string;
    notes?: string;
    provenance?: SkillProvenance;
    evidenceWeight?: EvidenceWeight;
    status?: string;
  }[];
};

type ContextSet = {
  contexts: { id: string }[];
};

type TaskSet = {
  tasks: { id: string; split?: string }[];
};

export type CorpusMatrixMode = "runnable" | "tasks-authored-calibration";

export type BuildCorpusMatrixOptions = {
  mode?: CorpusMatrixMode;
  skillIds?: string[];
};

export const COLD_START_EXPERIMENT_SYSTEMS: ExperimentSystem[] = [
  "no-skill",
  "original",
  "ir-static",
];

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function normalizeSkill(skill: string | MatrixSkill): MatrixSkill {
  if (typeof skill === "string") {
    return { id: skill, packaging: "unknown", provenance: "unknown", evidenceWeight: "unknown" };
  }

  return {
    ...skill,
    provenance: skill.provenance ?? "unknown",
    evidenceWeight: skill.evidenceWeight ?? "unknown",
  };
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
    const skillTasks = input.tasksBySkill ? (input.tasksBySkill[skill.id] ?? []) : input.tasks;
    for (const agent of input.agents) {
      for (const environment of input.environments) {
        for (const context of input.contexts) {
          for (const task of skillTasks) {
            const caseId = `${skill.id}:${agent}:${environment}:${context}:${task}`;
            for (const system of input.systems) {
              cases.push({
                caseId,
                skill: skill.id,
                skillPackaging: skill.packaging,
                skillProvenance: skill.provenance ?? "unknown",
                evidenceWeight: skill.evidenceWeight ?? "unknown",
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

export function buildCorpusMatrixInput(
  corpus: CorpusId,
  rootDir = process.cwd(),
  options: BuildCorpusMatrixOptions = {},
): MatrixInput {
  const manifest = readJson<CorpusManifest>(resolveCorpusManifestPath(corpus, rootDir));
  const contextSet = readJson<ContextSet>(join(rootDir, "benchmarks/skill-ir/contexts/standard-contexts.json"));
  const mode = options.mode ?? "runnable";
  if (mode === "tasks-authored-calibration" && options.skillIds?.length !== 1) {
    throw new Error("tasks-authored-calibration requires exactly one explicit skillId");
  }
  const eligibleStatus = mode === "tasks-authored-calibration" ? "tasks-authored" : "runnable";
  const requestedSkillIds = options.skillIds ? new Set(options.skillIds) : null;
  const eligibleSkills = manifest.skills.filter((skill) =>
    skill.status === eligibleStatus && (!requestedSkillIds || requestedSkillIds.has(skill.id))
  );
  if (eligibleSkills.length === 0) {
    throw new Error(
      `Corpus ${corpus} has 0 ${eligibleStatus} skills out of ${manifest.skills.length} registered skills`,
    );
  }

  const skills = eligibleSkills.map((skill) => ({
    id: skill.id,
    packaging: inferSkillPackaging(skill),
    provenance: skill.provenance ?? "unknown",
    evidenceWeight: skill.evidenceWeight ?? "unknown",
  }));
  const tasksBySkill = Object.fromEntries(
    eligibleSkills.map((skill) => {
      if (!skill.tasksPath) {
        return [skill.id, []];
      }

      const taskSet = readJson<TaskSet>(join(rootDir, skill.tasksPath));
      const tasks = mode === "tasks-authored-calibration"
        ? taskSet.tasks.filter((task) => task.split === "development")
        : taskSet.tasks;
      return [skill.id, tasks.map((task) => task.id)];
    }),
  );
  const tasks = Object.values(tasksBySkill).flatMap((skillTasks) => skillTasks);

  return {
    skills,
    agents: ["skvm", "codex"],
    environments: ["linux", "windows"],
    contexts: contextSet.contexts.map((context) => context.id),
    tasks,
    tasksBySkill,
    systems: mode === "tasks-authored-calibration"
      ? ["no-skill", "original"]
      : [...COLD_START_EXPERIMENT_SYSTEMS],
  };
}
